# ADR-03: Cross-Tab State Consistency and Reactivity

Status: Accepted

## Summary

In the context of multi-tab state management facing race conditions and stale data risks, we decided for an Event-Driven Reactive model with Deep Equality Checks to achieve instant cross-tab consistency, accepting the downside of CPU overhead during JSON serialization.

## Context

The Maktaba for Gemini extension is designed to run simultaneously across multiple open Gemini browser tabs. This creates a state synchronization challenge: if a user creates a folder or saves a chat in one tab, all other tabs must reflect these changes immediately to prevent data fragmentation or "stale" UI states.

The technical environment presents specific constraints:

- **Decentralized State**: There is no central background script managing the active state; each content script instance maintains its own local copy of folderData.
- **Performance Overhead**: Frequent DOM re-renders are expensive and can lag the Gemini interface if the folder tree is large.
- **Background Suspension**: Browser extensions can sometimes miss storage events if the tab is discarded or suspended by the browser's memory management.

## Decision

We will implement an Observer-based Reactive Pattern combined with Serialization Checks to ensure cross-tab consistency. This strategy consists of:

- **Storage Change Listener**: Every tab implements chrome.storage.onChanged to monitor the sync namespace. When a change is detected, the tab receives the newValue immediately.
- **Serialization-Based Equality Check**: To prevent redundant rendering, the system performs a JSON.stringify comparison between the current local folderData and the incoming newData. The UI refreshes only if the data strings differ.
Focus-Triggered Re-Sync: A window.focus listener is utilized to re-load data from storage whenever the user returns to a tab, serving as a fail-safe for missed background events.
- **In-Memory Session Metrics**: A global window.maktabaStats object will track "renders" and "skips" to allow developers to monitor the efficiency of the equality-check logic via the diagnostic log.

## Alternatives Considered

- **Message Passing (chrome.runtime.sendMessage)**: Tabs could broadcast changes to one another via a background script. This was rejected because chrome.storage.onChanged provides the same functionality natively with less code and without requiring a persistent background service worker.
- **Polling Strategy**: Periodically checking storage for updates via setInterval. This was rejected as inefficient, as it would cause unnecessary CPU usage and storage read-operations even when no changes occur.
- **Full UI Re-render on Every Click**: Updating the UI every time the user interacts with the extension. This was rejected because it does not solve the problem of changes originating from other tabs.

## Consequences

### Positive

- **Native-Feel Updates**: Users experience seamless synchronization where actions in one tab are immediately visible in others.
- **Performance Optimization**: The serialization check ensures that the DOM is only manipulated when the underlying data structure actually changes.
- **Resilience**: The focus-based sync ensures the UI remains accurate even after long periods of tab inactivity.

### Negative

- **Memory Usage**: Keeping a stringified version of the state in memory for comparison adds a small overhead (proportional to the 100KB limit).
- **Serialization Cost**: Frequently stringifying folderData during rapid changes can momentarily increase CPU usage, though strictly bounded by the 100KB data cap.
