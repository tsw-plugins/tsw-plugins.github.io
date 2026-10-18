---
name: plugin-tsw-sdk
description: >-
  tsw-sdk, the Train Sim World adapter for uniloader that every tsw-plugins mod builds on: what it does, its state, and where the design and the guides are.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# tsw-sdk

**State: working (2026-10-18).** The loader half of the [design](../design/tsw-sdk.md) became
[uniloader](https://uniloaders.github.io/), a loader for any game: plugin loading, the C ABI,
services and events between plugins, settings, the console, fault isolation and Lua. tsw-sdk is
the Train Sim World half:

- **`tsw.dll`, the TSW adapter plugin.** Scans the running exe for the engine once
  (patternsleuth), hooks the game tick through `GEngine`'s vtable, skips the start-up screens,
  puts the plugin indicator (a puzzle piece listing uniloader, its plugins and UE4SS) on the main
  menu, and reports the game's crash reports. Console: `tsw.status`, `tsw.console`, `tsw.quit`,
  `tsw.plugins`.
- **`tsw-game`**, the `tsw` service client: a feature plugin adopts the adapter's scan and gets
  a game-thread tick with the player controller every frame.
- **`tsw-sdk-host`**, the engine access every plugin links: objects, names, reflection, native
  calls, UMG widgets, the game's toasts, input, Steam, HTTP.

Verified in game on build 886: scan in ~0.1 s, tick hooked, intro skipped in 1 s, indicator and
Plugins screen up, tsw-jump and tsw-coop running on the adapter's tick, clean shutdown.

| | |
| --- | --- |
| Repository | [tsw-plugins/tsw-sdk](https://github.com/tsw-plugins/tsw-sdk) |
| Install | [install.md](../install.md) |
| Writing plugins | [sdk/](../sdk/), [uniloader's plugin guide](https://uniloaders.github.io/docs/plugins.html) |
