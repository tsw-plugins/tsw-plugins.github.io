---
name: plugin-tsw-mp
description: >-
  tsw-mp: a future multiplayer plugin that shares ghost trains and avatars with tsw-coop through a common crate.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# tsw-mp

**State: future.** Nothing is designed beyond what the [tsw-sdk design](../design/tsw-sdk.md)
says about it:

- It needs the same ghost trains and avatars as [tsw-coop](tsw-coop/) (`ghost.rs`, `avatar.rs`
  today). The proposal is a shared Rust crate, `tsw-world-kit`, that both plugins link
  statically (open question 10 of the design).
- It reads the `[multiplayer]` section of other plugins' manifests (`local`, `announce`,
  `must-match`) the same way tsw-coop does.

| | |
| --- | --- |
| Repository | `tsw-plugins/tsw-mp` (not created yet) |
