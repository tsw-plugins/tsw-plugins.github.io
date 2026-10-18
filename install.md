---
name: install
description: >-
  Installing, checking and removing the mods on Windows and Linux/Proton: tsw-coop's installer today, and the planned tsw-sdk layout with plugins, uninstall and safe mode.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# Install

There are no published releases yet. Today the only mod is **tsw-coop**, a single `dwmapi.dll`
built from [tsw-coop](https://github.com/tsw-plugins/tsw-coop) (`mod/native/build.sh`, output
`mod/out/native/dwmapi.dll`). Once [tsw-sdk](plugins/tsw-sdk.md) exists, the SDK is installed
once and plugins are unzipped next to it (see [Planned](#planned-tsw-sdk-and-plugins)).

The game directory below is `…/Train Sim World 7/WindowsNoEditor/TS2Prototype/Binaries/Win64/`.

## tsw-coop today

### Windows

Run `install.bat` from the folder that holds `dwmapi.dll`. It calls the installer built into the
DLL (`rundll32 dwmapi.dll,Install`), which:

- finds the game through Steam's libraries
- keeps an existing `dwmapi.dll` (UE4SS's loader) instead of overwriting it
- writes a starter `tswcoop.cfg`
- registers `tswcoop://` links

### Linux (Steam, Proton)

Run [`scripts/install-tswcoop`](https://github.com/tsw-plugins/tsw-coop/blob/main/scripts/install-tswcoop):

| Command | What it does |
| --- | --- |
| `install-tswcoop [--from DIR] [--no-link]` | Install or update: copies `dwmapi.dll` and `tswcoop/`, keeps a foreign `dwmapi.dll` as `dwmapi.dll.ue4ss`, writes a commented `tswcoop.cfg`, checks the launch options, registers the `tswcoop://` handler |
| `install-tswcoop --check` | Say what is installed |
| `install-tswcoop --uninstall` | Put the original `dwmapi.dll` back |

Proton loads the DLL only with the launch option `WINEDLLOVERRIDES="dwmapi=n,b" %command%`; the
script checks for it.

### Settings and switches

- `Win64/tswcoop.cfg`: the relay, hosting and joining settings (all keys:
  [`settings.rs`](https://github.com/tsw-plugins/tsw-coop/blob/main/server/crates/tsw-coop-client/src/settings.rs)).
- Files next to the game exe turn single features off: `tswcoop-native-no-ue4ss` (no UE4SS
  chain-load), `tswcoop-no-skip-intro`, `tswcoop-no-jump`.
- Log: `Win64/tswcoop-native.log`.

## Planned: tsw-sdk and plugins

From the [tsw-sdk design](design/tsw-sdk.md) (sections 2 and 8.2); nothing of this exists yet.

| Release zip | Contents |
| --- | --- |
| `tsw-sdk-<ver>-win64.zip` | `dwmapi.dll`, `tsw/{assets,data,lua}`, `tsw/sdk.toml.example`, `install.bat` (`rundll32 dwmapi.dll,Install`), `install-tsw.sh` (Proton) |
| `<plugin>-<ver>.zip` | `tsw/plugins/<id>/…`; unzip into `Win64/` |
| `tsw-coop-<ver>-bundle.zip` | SDK and coop, for one-step installs |

- **Uninstall:** delete `dwmapi.dll` and `tsw/`.
- **Disable a plugin:** the Plugins screen (puzzle-piece icon on every menu screen), or
  `disabled = ["<id>"]` in `tsw/sdk.toml`.
- **Safe mode:** after a crash before the first tick, or one attributed to a plugin, the next start
  loads only the SDK and asks whether to enable the plugin again. Command-line overrides:
  `-tsw-noplugins` and `-tsw-only=a,b`.
