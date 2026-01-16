# ADR-04: Minimum Viable Permission Policy

Status Accepted

## Summary

In the context of maximizing user trust and chrome store compliance, we decided for a Strictly Scoped Permission Policy (Storage + Specific Host) to achieve a secure and focused product, accepting the downside of being unable to interact with non-Gemini web pages.

## Context

In browser extension development, permissions are an architectural decision because they directly impact user trust, security surface area, and Chrome Web Store approval.

- **Security Risk**: Chrome extensions often over-request permissions (e.g., <all_urls> or broad tabs access), which leads to security warnings and high friction during installation.
- **Operational Scope**: The content.js script logic is strictly scoped to interactions within the Gemini DOM and data synchronization. It does not require access to browser navigation history or unrelated open tabs.

## Decision

We will adopt a "Least Privilege" Permission Strategy, strictly limiting manifest requests to the absolute minimum required for the code to function. This involves:

- **Exclusive storage Permission**: We request storage solely to persist the user's library via chrome.storage.sync.
- **Targeted Host Permissions**: We reject the <all_urls> permission. The extension functions strictly as a Content Script injected only into <https://gemini.google.com/>*.
- **Rejection of tabs API**: The code utilizes standard DOM APIs (e.g., window.location.href) to read the current URL. We explicitly decline the high-privilege tabs permission, as the content script runs inside the page context and does not need to manipulate browser tabs externally.

## Alternatives Considered

- **<all_urls> Permission**: This would allow the extension to inject "Save to Maktaba" buttons on any website. This was rejected to maintain product focus and avoid the privacy implications of "reading" every page the user visits.
- **activeTab Permission**: This would allow injection only when the user clicks the extension icon. This was rejected because the sidebar UI needs to be persistent and render automatically when the user navigates Gemini, not just on click.

## Consequences

### Positive

- **Enhanced Trust**: Users see a minimal permission request prompt during installation.
- **Store Compliance**: Significantly reduces the likelihood of rejection during Chrome Web Store review.
- **Privacy Assurance**: The extension technically cannot access data outside the Gemini domain.

### Negative

- **Functional Silo**: The extension cannot "auto-scrape" or save links from other sites (e.g., referencing a StackOverflow article in a chat folder) without the user manually copying the URL.
