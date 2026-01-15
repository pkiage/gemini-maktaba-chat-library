# ADR-01: Normalized Local-First Data Strategy and Quota Management

Status Accepted

## Summary

In the context of syncing chat metadata across devices facing strict 100KB storage limits and privacy constraints, we decided for a normalized, local-first data strategy with proactive quota gating to achieve a zero-cost, high-signal library, accepting a finite cap on the total number of storable chats.

## Context

The Maktaba for Gemini extension requires a mechanism to persist folder structures, chat metadata, and user preferences across multiple devices without incurring server-side infrastructure costs or compromising user privacy. The extension is bound by the following constraints:

External Constraint: chrome.storage.sync provides free, Google-encrypted cross-device synchronization but imposes a strict 100KB (102,400 bytes) total quota for all data.

Privacy Requirement: The architecture must remain "local-first," ensuring no chat content is sent to third-party servers.

Scalability: Users may have hundreds of chats across numerous folders, making a flat data structure inefficient as it would quickly exceed the byte limit.

Observability: Debugging data and logs are needed for maintenance, but they compete for the same limited 100KB storage space.

## Decision

We will implement a normalized, local-first data strategy using a "Flyweight" pattern to optimize the chrome.storage.sync quota. This involves:

- **Normalization**: Splitting data into three primary structures within the global folderData object:
- **folders**: Stores hierarchical pointers/IDs and minimal metadata (e.g., sortOrder).
- **allChats**: A flat dictionary storing unique chat metadata (titles, tags, annotations, timestamps).
- **pinnedSearches**: A lightweight array storing user-saved search queries.
- **Quota Gatekeeper**: Implementing a proactive pre-save check that monitors bytesInUse. If usage exceeds the quota limit minus a 2KB safety buffer (approx 98KB), the system will abort the save operation and alert the user to prevent silent data truncation.
- **Manual Garbage Collection**: Providing explicit "Prune" and "Archive" utilities to allow users to scan for and manage orphaned metadata (chats not referenced in any folder) to free up space.
- **Ephemeral Diagnostics**: Restricting logs and session statistics (e.g., window.maktabaStats) to volatile memory. Instead of persisting logs, the system provides a "Download Diagnostic Log" feature that generates a JSON snapshot on demand.

## Alternatives Considered

- **chrome.storage.local**: This would provide significantly more space (5MB+) but would break the core requirement for cross-device synchronization, as local data does not sync across Google accounts.
- **Backend Database (Firebase/Supabase)**: While this would remove storage limits, it would introduce operational costs, require user authentication, and violate the "Privacy-First/Local-First" promise by moving user data to an external server.
- **Flat JSON Tree**: Storing full chat details inside each folder entry. This was rejected because duplicating metadata for a single chat linked to multiple folders would cause the system to hit the 100KB limit prematurely.

## Consequences

### Positive

- **Zero Cost**: Built-in sync requires no server maintenance or hosting fees.
- **High Privacy**: Data remains within the user's Google infrastructure.
- **Referential Integrity**: Updates to a chat's title or tags automatically reflect across all linked folders and search results.
- **Data Portability**: Implementation of robust export options (JSON, CSV, Markdown) ensures users are not locked in and can migrate their organized library elsewhere if the storage ceiling is reached.

### Negative

- **Storage Ceiling**: Users are limited to approximately 1,000–2,000 chats before hitting the 100KB limit.
- **Architectural Complexity**: Requires manual management of "orphaned" data that is no longer referenced by any folder.
- **Limited History**: Lack of persistent error logs makes asynchronous debugging more difficult.
