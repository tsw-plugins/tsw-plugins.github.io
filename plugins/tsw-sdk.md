---
name: plugin-tsw-sdk
description: >-
  tsw-sdk, the Train Sim World adapter for uniloader that every tsw-plugins mod builds on: what it does, its state, and where the design and the guides are.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T21:55+0200
---

# tsw-sdk

**State: working (2026-10-18).** The loader half of the [design](../design/tsw-sdk.md) became
[uniloader](https://uniloaders.github.io/), a loader for any game: plugin loading, the C ABI,
services and events between plugins, settings, the console, fault isolation and Lua. tsw-sdk is
the Train Sim World half:

- **`tsw.dll`, the TSW adapter plugin.** Scans the running exe for the engine once
  (patternsleuth), hooks the game tick through `GEngine`'s vtable, skips the start-up screens,
  and reports the game's crash reports. Console: `tsw.status`, `tsw.console`, `tsw.quit`,
  `tsw.dump <class path>` (a class's reflected properties, into the log).
- **`tsw_ui.dll`, the game's own menus for plugins.** uniloader's `overlay` service drawn with
  TSW's menu elements instead of an overlay (the egui overlay draws Direct3D 11 only; TSW 7 is
  Direct3D 12). Plugins that use the overlay service work unchanged:
  - a panel is a screen on the game's menu stack, built from the game's buttons, checkboxes
    and sliders, driven by mouse, keyboard or gamepad; Esc/Back closes it;
  - the **Plugins** screen (every plugin, its settings and panels) and a settings screen per
    plugin, reached from a **Plugins** button in the game's Settings screen, the puzzle piece
    at the bottom left of the main menu, `ctrl+shift+p`, or `tsw_ui.plugins`;
  - a **console** screen (`ctrl+shift+c`, `tsw_ui.console`) with history;
  - **toasts**: the game's own HUD notifications in a route, cards of ours in the menus;
    **notices** (large text in the middle); **dialogs**: the game's `DialogWidget_C`, with an
    input line when asked for.

  Try them with `tsw_ui.toast`, `tsw_ui.notice`, `tsw_ui.dialog message|confirm|input`,
  `tsw_ui.settings <plugin>`, `tsw_ui.panel <plugin>.<name>`.
- **`tsw-game`**, the `tsw` service client: a feature plugin adopts the adapter's scan and gets
  a game-thread tick with the player controller every frame.
- **`tsw-sdk-host`**, the engine access every plugin links: objects, names, reflection, native
  calls, UMG widgets, the game's toasts, input, Steam, HTTP.

Verified in game on build 886: scan in ~0.1 s, tick hooked, intro skipped in 1 s, indicator and
Plugins screen up, tsw-jump and tsw-coop running on the adapter's tick, clean shutdown. tsw_ui:
uniloader's kitchen-sink example passes its 68 checks against it; settings screen, toasts,
notices and the game's dialog seen on the main menu; a real mouse click on a dialog's OK
answered it.

| | |
| --- | --- |
| Repository | [tsw-plugins/tsw-sdk](https://github.com/tsw-plugins/tsw-sdk) |
| Install | [install.md](../install.md) |
| Writing plugins | [sdk/](../sdk/), [uniloader's plugin guide](https://uniloaders.github.io/docs/plugins.html) |
