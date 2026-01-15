# ADR-05 Internationalization (i18n) Strategy

Status: Accepted

LLM translation to be tested

## Summary

In the context of expanding Maktaba for Gemini to a global audience facing storage, security, and translation cost constraints, we decided for the native Chrome i18n framework with AI-assisted static localization to achieve scalable, quota-free internationalization accepting increased maintenance overhead when adding new strings.

## Context

Maktaba for Gemini currently uses hardcoded English strings within its UI rendering logic. To expand the user base and provide a native experience for non-English speakers, the extension must be adapted for global use.

- **Technical Constraints**: The solution must not increase the chrome.storage.sync data quota and must comply with Manifest V3 security policies.
- **Resource Constraints**: As a solo/small-team project, there is no budget for professional translation services, yet the translations must be accurate and context-aware.

## Decision

We will implement the Native Chrome i18n Framework coupled with an AI-Assisted Localization Workflow. This includes:

1. **Architecture**: Utilizing the standard /_locales/ directory structure with messages.json files for each supported language.
2. **Implementation**: Refactoring content.js to replace hardcoded strings with chrome.i18n.getMessage() calls.
3. **Translation** Generation: Using LLMs (e.g., Gemini) to generate the initial localized JSON files from a master English template to save time and cost.
4. **Static Storage**: Localization files will be bundled within the extension package, ensuring they do not consume any of the 100KB user sync quota.

## Alternatives Considered

- **Dynamic Translation Libraries (e.g., i18next)**: These offer powerful features like pluralization but add significant bundle size and complexity. The native chrome.i18n API is preferred for its zero-dependency footprint.
- **On-the-fly Translation APIs**: Using Google Translate to translate the sidebar in real-time. This was rejected due to latency, security risks, and the potential to leak user metadata to external services.

## Consequences

### Positive

- **Zero Quota Impact**: i18n data is stored on-disk, leaving the 100KB sync limit entirely for user content.
- **Professionalism**: The extension becomes accessible to a global audience, increasing potential adoption.

### Negative

- **Maintenance**: Adding new features now requires updating multiple messages.json files instead of a single string in the code.
