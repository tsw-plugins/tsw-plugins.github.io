---
name: sdk-guide-events-and-state
description: >-
  Planned guide to tsw-sdk's event bus, state store and services. Not written yet; links to the design sections that define it.
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# Events, state and services

> [!NOTE]
> **Planned.** tsw-sdk is a proposal; this guide is written once the SDK exists. Until then see
> the [design](../../design/tsw-sdk.md).

Will cover, as the design defines it:

- the plugin registry ([5.1](../../design/tsw-sdk.md#51-registry))
- events, state and services, the namespace rule and shared types crates
  ([5.2](../../design/tsw-sdk.md#52-event-bus-state-store-services))
- versioned names such as `tsw-jump.jumped/1` ([3.4](../../design/tsw-sdk.md#34-versioning-and-compatibility))
- how tsw-coop consumes tsw-jump's event ([7.3](../../design/tsw-sdk.md#73-how-tsw-coop-consumes-it))
