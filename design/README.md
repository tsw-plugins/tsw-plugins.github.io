---
name: design-index
description: >-
  Index of the design documents and proposals for tsw-sdk and its plugins, with the status of each.
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# Design documents

Proposals and decisions for the [tsw-plugins](https://github.com/tsw-plugins) SDK and its
plugins. Every document carries a `status` in its front matter, so a proposal is never mistaken
for something that shipped:

| Status | Meaning |
| --- | --- |
| `proposal` | Written to be argued with. Nothing is built, and the open questions at the end are genuinely open. |
| `accepted` | Agreed; parts may be built, and the document says which. |
| `implemented` | Built; a note at the top says where the code lives and where reality differs from the document. |
| `superseded` | Kept for the reasoning, replaced by a named document. |

| Document | Status | What it decides |
| --- | --- | --- |
| [tsw-sdk.md](tsw-sdk.md) | `proposal` | A shared Rust loader that hosts Rust and Lua plugins, carved out of tsw-coop's DLL: loading model, C ABI, Lua, inter-plugin services, the v1 event and function catalogue, repositories and the migration plan |
| [tsw-coop-concept.md](tsw-coop-concept.md) | `accepted` | tsw-coop's scope: a host-owned world, walking guests, driver handover, relay transport, sessions, entitlements, anticheat |
| [native-menus.md](native-menus.md) | `proposal` | Real, mouse-driven entries in the game's own menus and a plugin indicator, without cooked assets |
