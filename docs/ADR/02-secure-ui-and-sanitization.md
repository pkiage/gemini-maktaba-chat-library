# ADR-02:  Hybrid DOM Hydration Strategy for Secure UI Rendering

Status: Accepted

## Summary

In the context of rendering user-generated content in a Chrome Extension facing strict CSP and XSS risks, we decided for a Hybrid DOM Hydration strategy to achieve secure, zero-dependency rendering, accepting the downside of tighter coupling between HTML string templates and JavaScript selectors.

## Context

The Maktaba for Gemini extension operates by injecting a custom UI (sidebar and settings overlay) directly into the active Gemini chat DOM. This environment poses several security and performance challenges:

- **Security**: The extension handles user-generated content, such as chat titles, tags, and personal notes. Using standard innerHTML to render this content creates a vulnerability to Cross-Site Scripting (XSS).
- **Performance & Bundle Size**: Including a full sanitization library (e.g., DOMPurify) to secure innerHTML calls would increase the extension's memory footprint and load time.
- **Platform Policy**: Chrome Extension Manifest V3 and Content Security Policies (CSP) discourage or block the use of inline scripts and unsafe-eval, making programmatic event handling and safe DOM manipulation the preferred standard.

## Decision

We will adopt a Hybrid DOM Hydration Strategy that combines the developer ergonomics of HTML strings with the security of DOM properties. This involves:

- **Two-Phase Rendering**:
  - **Structural Templating**: Using innerHTML to define the static skeleton of components (buttons, wrappers, icons) to maintain code readability.
  - **Safe Data Hydration**: Immediately querying the created elements and injecting user-provided strings (chat titles, annotations) using textContent to ensure the browser treats them as plain text.
- **Programmatic Event Binding**: Listeners must be attached via element.onclick or addEventListener to specific DOM nodes after the template is rendered, rather than using inline onclick="..." attributes strings.
- **No-Library Dependency**: We will intentionally exclude third-party sanitization or UI frameworks to maintain a minimal bundle size and reduce the attack surface.

## Alternatives Considered

- **DOMPurify Integration**: This would allow the continued use of innerHTML for dynamic content by sanitizing it first. It was rejected because it adds 10-20KB to the bundle size—a significant cost for a "minimalist" extension where innerText provides the same security for free.
- **Pure document.createElement**: Creating the entire DOM tree strictly via JavaScript API (e.g., div = document.createElement('div'); div.appendChild(...)). This was rejected as being excessively verbose and difficult to maintain for complex nesting like the sidebar layout.
- **Component Frameworks (React/Vue)**: These frameworks handle sanitization automatically. They were rejected as being "over-engineered" for a single-file content script, introducing unnecessary complexity and performance overhead in the Gemini tab.

## Consequences

### Positive

- **Zero-Cost Security**: Achieves high XSS protection for user content without external dependencies.
- **Developer Ergonomics**: Maintains the readability of HTML templates for layout while isolating unsafe data.
- **Compliance**: Naturally aligns with Chrome's Content Security Policy (CSP) requirements by avoiding inline script execution.

### Negative

- **Two-Step Overhead**: Requires a slight runtime penalty to query elements (wrapper.querySelector(...)) immediately after creating them in order to inject text or attach events.
- **Fragility**: Changing class names in the HTML template string requires updating the corresponding JavaScript selectors used for hydration, creating a tight coupling between string literals and logic.
