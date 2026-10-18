---
name: plugin-tsw-jump
description: >-
  tsw-jump: jump on Space while on foot, with photo mode moved to O. A standalone uniloader plugin on the TSW adapter.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# tsw-jump

**State: a standalone plugin (2026-10-18)**: `plugins/jump.dll`, a
[uniloader](https://uniloaders.github.io/) plugin on the [TSW adapter](tsw-sdk.md).

- Space makes the player character jump while on foot (`CanJump`, then `Jump`).
- Photo mode moves from Space to O for the session; the game's `Input.ini` is not touched.
- The setting `jump.enabled` turns it off and on at once (`set jump.enabled false` in uniloader's
  console); tsw-coop's F9 menu has a row that switches the same setting.

Still planned: publishing a `jumped` event so tsw-coop can send exact jump moments to the other
players (today remote players see the jump through the avatar's position and pose).

| | |
| --- | --- |
| Repository | [tsw-plugins/tsw-jump](https://github.com/tsw-plugins/tsw-jump) |
