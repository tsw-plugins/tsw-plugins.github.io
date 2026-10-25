---
name: install
description: >-
  Installing, checking and removing the mods on Windows and Linux/Proton: uniloader as dwmapi.dll, the TSW adapter and the plugins in plugins/, tsw-coop's installers.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T15:30+0200
---

# Install

The mods are plugins of [uniloader](https://uniloaders.github.io/), a game-agnostic Rust plugin
loader. There are no published releases yet; build from source (below).

The game directory below is `…/Train Sim World 7/WindowsNoEditor/TS2Prototype/Binaries/Win64/`.

## Layout

```text
Win64/
  dwmapi.dll                 uniloader (the game loads it as dwmapi.dll)
  plugins/
    tsw.dll                  the TSW adapter (tsw-sdk): engine scan, game tick, skip-intro, indicator
    tsw/puzzle.png           the plugin indicator's icon
    jump.dll                 tsw-jump
    coop.dll                 tsw-coop
  uniloader/
    config/loader.toml       load = ["ue4ss/UE4SS.dll"] when UE4SS should run too
    config/<plugin>.toml     each plugin's settings, written by the loader
    logs/loader.log          the loader's and the plugins' log
    reports/                 crash and freeze reports (the newest 10)
  tswcoop/                   tsw-coop's images
  tswcoop.cfg                tsw-coop's advanced network settings (optional)
  tswcoop-native.log         tsw-coop's own log
```

Every plugin needs `tsw.dll`; each feature plugin is optional. Proton loads `dwmapi.dll` only
with the launch option `WINEDLLOVERRIDES="dwmapi=n,b" %command%` (the same one UE4SS needs).

## tsw-coop (with everything it needs)

`mod/native/build.sh` in [tsw-coop](https://github.com/tsw-plugins/tsw-coop) builds a folder laid
out like `Win64/` (`mod/out/native/`) holding uniloader, the adapter, tsw-jump and tsw-coop.

### Windows

Run `install.bat` from that folder. It calls the installer built into the mod
(`rundll32 plugins\coop.dll,Install`), which:

- finds the game through Steam's libraries
- keeps an existing `dwmapi.dll` (UE4SS's loader) as `dwmapi.dll.ue4ss` instead of overwriting
  it, and replaces the old standalone tsw-coop `dwmapi.dll`
- tells uniloader to load UE4SS when it is installed in `ue4ss/`
- writes a commented `tswcoop.cfg` (advanced network settings, all optional: hosting and
  joining are done from the coop menu in the game)
- registers `tswcoop://` links

### Linux (Steam, Proton)

Run [`scripts/install-tswcoop`](https://github.com/tsw-plugins/tsw-coop/blob/main/scripts/install-tswcoop):

| Command | What it does |
| --- | --- |
| `install-tswcoop [--from DIR] [--no-link]` | Install or update: as on Windows, then checks the launch options and registers the `tswcoop://` handler |
| `install-tswcoop --check` | Say what is installed |
| `install-tswcoop --uninstall` | Put the original `dwmapi.dll` back |

## The adapter and tsw-jump alone

`scripts/deploy.sh` in [tsw-sdk](https://github.com/tsw-plugins/tsw-sdk) installs uniloader, the
adapter and whichever plugins are built in the sibling checkouts.

## Settings and switches

Plugin settings are changed in uniloader's console (`set <plugin>.<key> <value>`), in tsw-coop's
F9 menu, or in `uniloader/config/<plugin>.toml` while the game is closed.

| Setting | Default | Effect |
| --- | --- | --- |
| `tsw.skip_intro` | `true` | Skip the logo videos, safety notice and title screen (next start) |
| `tsw.indicator` | `true` | The puzzle piece on the main menu and its Plugins screen (next start) |
| `jump.enabled` | `true` | Space jumps on foot; photo mode moves to O (at once) |

The adapter's console commands: `tsw.status`, `tsw.console <command>` (the engine's console),
`tsw.quit`, `tsw.mainmenu` (leave the world for the main menu), `tsw.plugins`.

The flag files of the standalone mod (`tswcoop-native-no-ue4ss`, `tswcoop-no-skip-intro`,
`tswcoop-no-jump`) are no longer read: use `loader.toml`'s `load` list and the settings above.

## Crash reports

When the game crashes, freezes (no answer for 20 s) or ends without closing normally, uniloader
makes a report at the next start: a zip with the crash dumps, the game's own crash report and
the loader's log, with IP addresses, `tswcoop://` invites, Steam ids, passwords and keys removed.
A window then asks what to do with it:

- **Send report** uploads it to the tsw-plugins master server, which answers with a report id:
  tell the mod's author that id with what you were doing. Nothing is sent unless you choose this.
- **Save to Desktop** copies it to your Desktop (`TrainSimWorld7-crash-report-<date>.zip`) to
  send yourself. It is also where a report goes when sending fails, and where a report goes
  that was never answered: a game that crashes at every start never shows the question, so
  the next start saves the earlier reports to the Desktop by itself.

| Setting / command | Effect |
| --- | --- |
| `uniloader.crash_reports` | `ask` (default), `desktop` (always save, never ask) or `off` |
| `tsw.report_url` | Where **Send report** uploads to; empty: Desktop only |
| `uniloader.report list` | The reports and what became of each |
| `uniloader.report now` | Make a report of the running game (a freeze you can still type in) |
| `uniloader.report send <zip>` / `desktop <zip>` | What the two buttons do |

The reports stay in `uniloader/reports/` either way; the ten newest are kept.

## Removing

Delete `dwmapi.dll` (or put `dwmapi.dll.ue4ss` back as `dwmapi.dll`), `plugins/` and
`uniloader/`. To switch a single plugin off, add it to `disabled_plugins` in
`uniloader/config/loader.toml` (see [uniloader's configuration](https://uniloaders.github.io/docs/configuration.html)).
`--noplugins` on the game's command line starts it with no plugins at all.
