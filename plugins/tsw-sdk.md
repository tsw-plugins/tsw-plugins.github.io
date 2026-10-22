---
name: plugin-tsw-sdk
description: >-
  tsw-sdk, the Train Sim World adapter for uniloader that every tsw-plugins mod builds on: what it does, its state, and where the design and the guides are.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T11:57+0200
last_edited: 2026-10-19T19:35+0200
---

# tsw-sdk

**State: working (2026-10-18).** The loader half of the [design](../design/tsw-sdk.md) became
[uniloader](https://uniloaders.github.io/), a loader for any game: plugin loading, the C ABI,
services and events between plugins, settings, the console, fault isolation and Lua. tsw-sdk is
the Train Sim World half:

- **`tsw.dll`, the TSW adapter plugin.** Scans the running exe for the engine once
  (patternsleuth), hooks the game tick through `GEngine`'s vtable, skips the start-up screens,
  and reports the game's crash reports. It logs where the game is when that changes
  (`[tsw] place: main menu`, `place: world <map>`, `place: elsewhere`), which
  `scripts/tswwait menu|world|exit` waits on. Console: `tsw.status`, `tsw.console`,
  `tsw.quit`, `tsw.mainmenu` (leave the world for the main menu through the game's
  `GotoMainMenu(.., MainMenu)`, as its pause menu does), `tsw.dump <class path>` (a class's reflected properties, into the log),
  `tsw.find <class path>` (the live instances of a class with their paths, into the log),
  `tsw.scenario <name>` (start an installed scenario or tutorial by its name, from the menu or
  a route), `tsw.livery list|mine|new <definition> [name]|export <id>|forget <id>|restore|reload|mods`
  (user liveries for development: the definitions, your own, make one by code, write one's
  saved form for tsw-coop's headless host, delete and import one again).
  Plugins that do not start (a missing dependency, another version) are named with the
  reason in a warning notice: the loader's `loader.plugin_not_running`, shown by the egui
  overlay or, without it, by `tsw_ui`.
- **`tsw_ui.dll`, the game's own menus for plugins.** The Plugins screens in TSW's own menu
  elements. When uniloader's egui overlay runs too (it draws on TSW 7's Direct3D 12 through
  11 on 12), the overlay provides the `overlay` service: plugins' panels and the console are
  its windows, which open everywhere, and `tsw_ui` keeps the game-styled screens:
  - a **PLUGINS** tab in the main menu's and the pause menu's top bar (with the game's
    active-tab look while ours are up), the puzzle piece at the bottom left of the main menu,
    `ctrl+shift+p` or `tsw_ui.plugins`; optionally a **Plugins** button in the game's Settings
    screen (`tsw_ui.settings_entry`);
  - the **Plugins** hub: **Manage plugins** (every plugin, its settings and panels, Pause /
    Resume, and Stop, which lasts until the game restarts: a plugin starts once per launch),
    **Plugin settings** (every plugin's settings on one page), **Console**, **About**;
  - a settings screen per plugin with every setting kind (paths with a file browser, colours,
    dates and times, flags, key bindings) and Reset per setting or all (two presses);
  - the plugins' **showcase card** at the bottom centre of the main menu (from the overlay's
    `overlay.card` messages);
  - without the egui overlay: panels as game screens, a console screen, toasts, notices and
    the game's `DialogWidget_C` dialogs.

  Try them with `tsw_ui.toast`, `tsw_ui.notice`, `tsw_ui.dialog message|confirm|input`,
  `tsw_ui.settings <plugin>`, `tsw_ui.panel <plugin>.<name>`. For testing by code,
  `tsw_ui.press <button text>` presses a row or dialog button on our page on top (the
  console's `Send` too), `tsw_ui.scroll <px>` scrolls it and `tsw_ui.type <text>` fills the
  console's line. The egui overlay takes `overlay.input type <text>|key <name>|click <x> <y>`.
- **`tsw-game`**, the `tsw` service client: a feature plugin adopts the adapter's scan and gets
  a game-thread tick with the player controller every frame.
- **`tsw-sdk-host`**, the engine access every plugin links: objects, names, reflection, native
  calls, UMG widgets, the game's toasts, input, Steam, HTTP.

Verified in game on build 886: scan in ~0.1 s, tick hooked, intro skipped in 1 s, indicator and
Plugins screen up, tsw-jump and tsw-coop running on the adapter's tick, clean shutdown. tsw_ui:
uniloader's kitchen-sink example passes its 68 checks against it; settings screen, toasts,
notices and the game's dialog seen on the main menu; a real mouse click on a dialog's OK
answered it. 2026-10-19: every Plugins page walked by code (`tsw_ui.press`), the PLUGINS
tab in both menus, the showcase card on the main menu, the egui overlay's console in a route
and through a resize; the game quits in 2 s with the overlay drawing.

| | |
| --- | --- |
| Repository | [tsw-plugins/tsw-sdk](https://github.com/tsw-plugins/tsw-sdk) |
| Install | [install.md](../install.md) |
| Writing plugins | [sdk/](../sdk/), [uniloader's plugin guide](https://uniloaders.github.io/docs/plugins.html) |
