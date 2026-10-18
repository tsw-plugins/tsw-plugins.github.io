---
name: sdk-guide-testing
description: >-
  Planned guide to testing tsw-sdk plugins: the mock host, Wine tests and the dev API. Not written yet; links to the design sections that define it.
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# Testing plugins

> [!NOTE]
> **Planned.** tsw-sdk is a proposal; this guide is written once the SDK exists. Until then see
> the [design](../../design/tsw-sdk.md).

Will cover, as the design defines it:

- the mock host in the `tsw-sdk` crate, for unit tests without the game
  ([3.2](../../design/tsw-sdk.md#32-crates))
- Wine tests of the DLL, as tsw-coop's `mod/native/build.sh` runs them today
  ([8.2](../../design/tsw-sdk.md#82-releases-and-ci))
- the dev API: `GET /api/events` (every bus event and state change as SSE) and `POST /dev/lua`
  ([5.2](../../design/tsw-sdk.md#52-event-bus-state-store-services),
  [4.1](../../design/tsw-sdk.md#41-options))
