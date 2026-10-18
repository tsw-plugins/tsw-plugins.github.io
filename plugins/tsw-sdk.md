---
name: plugin-tsw-sdk
description: >-
  tsw-sdk, the one game-side DLL every tsw-plugins mod builds on: what it does, its state, and where the design and the guides are.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# tsw-sdk

**State: proposal.** The design is [design/tsw-sdk.md](../design/tsw-sdk.md); nothing is built
yet. Today the same code lives inside tsw-coop's `dwmapi.dll` (`mod/native`).

tsw-sdk is the `dwmapi.dll` in the game's `Win64` folder. It replaces UE4SS as the loader, owns
everything the game exposes (the engine, input, HUD, menus and game state) and hosts plugins:

- **Rust plugins** (`cdylib`) over a C ABI, through the safe `tsw-sdk` wrapper crate
- **Lua plugins**, with Lua 5.4 embedded in the SDK (UE4SS is a development tool only)
- an **event bus**, a shared **state store** and **services** for plugins to talk to each other
- **settings and menus** rendered by the SDK, a plugin indicator on every menu screen and a
  Plugins screen to enable, disable and configure plugins
- **failure isolation**: a plugin that panics or faults is disabled for the session; a crash
  attributed to a plugin starts the next session in safe mode

| | |
| --- | --- |
| Repository | `tsw-plugins/tsw-sdk` (not created yet) |
| Install | [install.md](../install.md#planned-tsw-sdk-and-plugins) |
| Writing plugins | [sdk/](../sdk/) |
