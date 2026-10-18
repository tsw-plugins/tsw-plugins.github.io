---
name: sdk-index
description: >-
  Index of the tsw-sdk guides and reference for plugin authors. All pages are planned; the SDK is a proposal and its design is the source until it is built.
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# Writing plugins for tsw-sdk

> [!NOTE]
> **Planned.** tsw-sdk is a [proposal](../design/tsw-sdk.md) and nothing here is built yet. Each
> page below says what it will cover and links to the part of the design that defines it. Until
> the SDK exists, the design is the only source; these pages add nothing to it.

## Guides

| Page | Will cover |
| --- | --- |
| [guide/rust.md](guide/rust.md) | A Rust plugin: the `tsw-sdk` crate, the `Plugin` trait, `export_plugin!` |
| [guide/lua.md](guide/lua.md) | A Lua plugin: `main.lua`, the `tsw` module, editor support |
| [guide/manifest.md](guide/manifest.md) | `plugin.toml`: identity, versions, dependencies, conflicts, multiplayer |
| [guide/events-and-state.md](guide/events-and-state.md) | Events, the state store and services between plugins |
| [guide/ui-and-menus.md](guide/ui-and-menus.md) | Toasts, settings, menus, the Plugins screen |
| [guide/multiplayer.md](guide/multiplayer.md) | How tsw-coop and tsw-mp treat a plugin in a session |
| [guide/testing.md](guide/testing.md) | Mock host, Wine tests, the dev API |

## Reference

| Page | Will cover |
| --- | --- |
| [reference/events.md](reference/events.md) | The built-in events |
| [reference/functions.md](reference/functions.md) | The v1 functions |
| [reference/abi.md](reference/abi.md) | The C ABI, for plugins in other languages |
| [reference/lua.md](reference/lua.md) | The Lua API and the `tsw.d.lua` stub |
| [changelog.md](changelog.md) | Released SDK versions |

The rustdoc of `tsw-sdk` and `tsw-sdk-abi` will be published under `api/rust/` once there is a
release.
