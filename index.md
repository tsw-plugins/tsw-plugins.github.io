---
name: home
description: >-
  Home of the tsw-plugins documentation: what the mods are, how to install them, and where the plugins, the SDK, the design documents and the research notes are.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# tsw-plugins

Unofficial mods for **Train Sim World 7** (PC, Steam; Windows and Linux/Proton), not affiliated
with Dovetail Games. The code lives in the [tsw-plugins](https://github.com/tsw-plugins)
organisation; its repositories carry only a `README.md` and an `AGENTS.md`, and everything else
is documented here.

- **Install:** [install.md](install.md)
- **Session browser:** [live tsw-coop sessions](plugins/tsw-coop/sessions/)

## Plugins

| Plugin | What it is | State |
| --- | --- | --- |
| [tsw-sdk](plugins/tsw-sdk.md) | The loader (`dwmapi.dll`) every other mod builds on: engine access, input, HUD and menus, game state, Rust and Lua plugins | proposal |
| [tsw-coop](plugins/tsw-coop/) | Co-op multiplayer: a host runs a normal scenario, friends join that world as walking passengers and can drive the host's train | in development, runs today as its own `dwmapi.dll` |
| [tsw-jump](plugins/tsw-jump.md) | Jump on Space while on foot (photo mode moves to O) | part of tsw-coop today; becomes a standalone plugin |
| [tsw-mp](plugins/tsw-mp.md) | A future multiplayer plugin sharing ghost trains and avatars with tsw-coop | future |

## Documentation

| Folder | What is in it |
| --- | --- |
| [`sdk/`](sdk/) | Guides and reference for writing plugins against tsw-sdk (planned; the design is in [design/tsw-sdk.md](design/tsw-sdk.md)) |
| [`design/`](design/) | Design documents and proposals, each with a `status` |
| [`research/`](research/) | Findings about the game, UE4SS and our tooling, each stating the game build it was verified on |
