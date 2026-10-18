---
name: plugin-tsw-jump
description: >-
  tsw-jump: jump on Space while on foot, with photo mode moved to O. Part of tsw-coop today, planned as the first standalone tsw-sdk plugin.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# tsw-jump

**State: part of tsw-coop today** (`mod/native/src/jump.rs`); planned as a standalone plugin once
[tsw-sdk](tsw-sdk.md) exists (migration step 4 of the [design](../design/tsw-sdk.md#9-migration-plan)).

- Space makes the player character jump while on foot (`CanJump`, then `Jump`).
- Photo mode moves from Space to O for the session; the game's `Input.ini` is not touched.
- In tsw-coop today a file `tswcoop-no-jump` next to the game exe turns it off, and the F9 menu
  has a row for it. As a plugin this becomes a setting on its page in the Plugins screen.

As a plugin it publishes the event `tsw-jump.jumped/1` and the state `tsw-jump.enabled/1`, and
tsw-coop uses them to send exact jump moments to the other players. A Rust and a Lua version of
the plugin are sketched in the [design](../design/tsw-sdk.md#7-example-tsw-jump-as-a-standalone-plugin).

| | |
| --- | --- |
| Repository | `tsw-plugins/tsw-jump` (not created yet) |
