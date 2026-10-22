---
name: uniloader-plugin-metadata
description: >-
  What a uniloader plugin declares about itself (authors, links, update source, target game), the game properties target filters can test with sources per property, how values match, the opt-in update check and the "Don't show again" dialogs. What is implemented and what is left.
status: implemented (ABI 2); some property kinds open (see the last section)
created: 2026-10-22T10:30+0200
last_edited: 2026-10-22T13:00+0200
---

# uniloader: plugin metadata, target filters, update check (2026-10-22)

Owner requests of 2026-10-22: richer plugin metadata, an opt-in update check, target scoping
by every known file property, and modals with "Don't show again". The standing no-legacy rule
applies: one descriptor shape, the old single author string is gone, and the plugin ABI is 2.

Implemented in uniloader commits `8a046b2` (ABI 2 descriptor), `796c5a7` (game properties,
target filters, `facts`), `135fa9d` (update check) and `d1c3c9c` (overlay service 3:
"Don't show again", plugin metadata in the settings editor). The tsw and DayZ plugins declare
their metadata in the same landing; loader and every plugin must be deployed together.

## 1. What a plugin declares

`PluginInfo` (ABI 2), and the SDK's `Plugin` constants:

| SDK constant | Meaning |
| --- | --- |
| `AUTHORS: &[Author]` | Each a name and an optional link: `Author::new("Ann").url("https://…")`. |
| `HOMEPAGE`, `ISSUES`, `DOWNLOAD` | Links, each optional. |
| `UPDATE_GITHUB` | `owner/name`: the latest GitHub release is the latest version. |
| `UPDATE_URL` | A URL answering with the version: plain text, or JSON with `version`/`tag_name` and optionally `url`/`download`/`html_url`. |
| `TARGETS: &[Target]` | Filters: `Target::new("exe.name", &["TrainSimWorld.exe"])`. |
| `REFUSE_ON_MISMATCH` | Do not start when the targets do not match (default: warn and start). |

`plugin info NAME` prints all of it plus what the loader found; `PluginEntry` (enumeration)
carries it to UIs with `latest`, `update_available` and `mismatch`.

## 2. Target filters

Each filter is a property name and a **list** of accepted values; any value of a filter may
match, and **every** declared filter must match. A property the loader could not read fails
its filter. A mismatch never stops the loader: the plugin starts with a warning, the event
`loader.plugin_mismatch` and an overlay dialog, unless it set `REFUSE_ON_MISMATCH` (then it is
listed as not running with the reason). Property names match ignoring case.

Value syntax by kind:

- **text**: case-insensitive glob (`*`, `?`). A value starting with a comparator (`>=2021.3`)
  compares the version the text starts with instead.
- **version**: bare = prefix by part (`4.26` accepts `4.26.1.0`, not `4.2`); comparators
  `>= <= > < = ==`, several separated by spaces or commas all must hold (`>=4.26 <5`).
  Missing parts count as 0.
- **number**: decimal or `0x` hex, exact or with comparators; `&0x20` accepts when all those
  bits are set.

`facts [filter]` in the console lists every property of the running game with its value.

## 3. Properties (implemented)

Read once at startup from the game executable (own PE parser over the file, reading only
headers and the resource section; no `GetFileVersionInfoW`, since the loader may stand in for
`version.dll`). SHA-256 only when a loaded plugin filters on it.

| Property | Kind | Source |
| --- | --- | --- |
| `exe.name`, `exe.folder`, `exe.path` (with `/`) | text | the executable's path |
| `game.folder` | text | folder under `steamapps/common`, else `exe.folder` |
| `file.size` | number | file size |
| `file.sha256` | text | whole file, lower-case hex, on request |
| `steam.app_id`, `steam.build_id` | number | `steamapps/appmanifest_*.acf` whose `installdir` is `game.folder`; `steam_appid.txt` |
| `pe.machine` | number | COFF `Machine` (0x8664 x64, 0x14C x86, 0xAA64 ARM64) |
| `pe.bitness` | number | optional header magic: 32 or 64 |
| `pe.timestamp` | number | COFF `TimeDateStamp` (a hash for `/Brepro` builds) |
| `pe.characteristics`, `pe.is_dll` | number, text | COFF `Characteristics`, bit 0x2000 |
| `pe.linker_version`, `pe.os_version`, `pe.image_version`, `pe.subsystem_version` | version | optional header |
| `pe.subsystem`, `pe.dll_characteristics`, `pe.checksum`, `pe.size_of_image`, `pe.entry_point` | number | optional header |
| `pe.signed` | text | security directory present (Authenticode, not verified) |
| `pe.debug.pdb_guid`, `pe.debug.pdb_age`, `pe.debug.pdb_path`, `pe.debug.build_id` | text, number | debug directory, CodeView `RSDS`; `build_id` = GUID hex + age, the symbol server key: exactly one build |
| `pe.version.<Key>` | text | every string of the table a reader picks (translations in order, then `040904b0`, `040904e4`, `04090000`, then the first); custom keys included |
| `pe.version.<langcp>.<Key>` | text | every string of every table, e.g. `pe.version.040904b0.ProductName` |
| `pe.version.translations`, `pe.version.language` | text, number | `VarFileInfo\Translation`; the resource's language ID |
| `pe.fixed.file_version`, `pe.fixed.product_version` | version | `VS_FIXEDFILEINFO` |
| `pe.fixed.flags`, `pe.fixed.os`, `pe.fixed.type`, `pe.fixed.subtype` | number | `VS_FIXEDFILEINFO` (flags masked) |
| `dotnet.is_managed`, `dotnet.runtime_version`, `dotnet.flags` | text, number | CLI header and metadata root (`v4.0.30319`) |
| `unreal.engine_major`, `unreal.branch`, `unreal.changelist` | number, text | `++UE4+Release-4.26-CL-0` in `ProductVersion` |
| `unreal.version` | version | fixed file version, three parts |
| `unreal.project` | text | `<Project>/Binaries/Win64` with `Engine/` beside, else `InternalName` |
| `unity.version` | text | `UnityPlayer.dll` `ProductVersion` (`2021.3.16f1`) |
| `unity.backend` | text | `il2cpp` (`GameAssembly.dll`) or `mono` (`<Game>_Data/Managed`) |

Sources: Microsoft's "PE Format", VERSIONINFO, VS_FIXEDFILEINFO, StringFileInfo and
VarFileInfo pages; ECMA-335 II.24 for the metadata root.

### Real values (read-only, 2026-10-22)

| | TSW 7 | TSW 5 |
| --- | --- | --- |
| shipping exe | `WindowsNoEditor/TS2Prototype/Binaries/Win64/TrainSimWorld.exe` | same |
| `pe.version.CompanyName` | `Dovetail Games` | same |
| `pe.version.ProductName` / `FileDescription` | `TrainSimWorld7` | `TrainSimWorld5` |
| `pe.version.InternalName` | `TS2Prototype` | same |
| `pe.version.ProductVersion` | `++UE4+Release-4.26-CL-0` | same |
| `FileVersion` string | absent | absent |
| `pe.fixed.file_version`, `.type` | 4.26.1.0, 2 (DLL, as Unreal writes it) | same |
| `pe.timestamp` | 0x6ACD35D0 | 0x69315AEB |
| `pe.debug.build_id` | `5096FE56872F403BB29F77D16A0DCB631` | `6FEF0229649D4DF3B7EFA2B2BA94FBEF1` |
| `steam.app_id`, `steam.build_id` | 4678800, 25890949 | 2967990, 21051341 |

The root `WindowsNoEditor/TrainSimWorld.exe` is Unreal's bootstrap launcher with Epic's
template strings (`BootstrapPackagedGame`); plugins never run in it. Version properties do not
tell editions apart; `ProductName`, the build ID and the Steam build do. `tsw_game::TARGETS`
uses `exe.name` (`TrainSimWorld.exe`, older `TS2Prototype-Win64-Shipping.exe`), `CompanyName`
`Dovetail Games*` and `unreal.project` `TS2Prototype`.

DayZ's `DayZ_x64.exe` and `DayZDiag_x64.exe` carry no version strings; `dayz_game::TARGETS`
filters on `exe.name` (client, diagnostic and server executables).

## 4. Update check

`uniloader.update_check` (off by default) and `uniloader.update_interval` (hours, default 24,
1-720). Runs on its own thread after startup and when turned on; never blocks. Each source is
asked at most once per interval, with `If-None-Match` on the cached ETag; answers are cached in
`uniloader/cache/updates.toml`. GitHub: `GET /repos/{o}/{r}/releases/latest` (newest
non-draft, non-prerelease; 404 when there are only prereleases), `User-Agent` and
`X-GitHub-Api-Version` sent; 60 unauthenticated requests per hour per address, which a day's
interval stays far from. Versions compare semver-style: numbers part by part, a prerelease
older than the release, build metadata ignored. A newer version is logged, published as
`loader.update_available`, shown by `plugin info` and the overlay. WinHTTP is loaded from the
system directory only when a check runs (never imported). The loader checks itself
(`uniloaders/uniloader`).

## 5. "Don't show again"

Overlay service version 3: `DialogDesc::remember` is a key; the dialog gets a "Don't show
again" checkbox, and once ticked the key is stored as `<plugin>/<key>` in
`uniloader/config/dont-show-again.txt` (shared by every overlay provider through
`uniloader_overlay::remember`). Later dialogs with the key answer `UiAnswer::SUPPRESSED`
without showing. Keys carry what makes the message new: the overlay's own mismatch and update
dialogs use `mismatch/<plugin>/<version>` and `outdated/<plugin>/<latest>`. `tsw_ui` (the
game's own dialog widget has no checkbox) gives a remembered message dialog a second button
"Don't show again"; confirm and input dialogs cannot be dismissed for good there.

## 6. Not implemented yet (in `tasks/todo.md`)

- **.NET assembly identity** (`dotnet.assembly.name`, `.version`, `.culture`,
  `.public_key_token`, `.file_version`, `.informational_version`, `dotnet.target_framework`):
  needs the `#~` tables (Assembly 0x20, CustomAttribute 0x0C) and blob parsing, about 300 lines
  or the `dotscope` crate.
- **Authenticode signer** (`pe.signature.subject_cn`, `.issuer_cn`, `.serial`,
  `.thumbprint_sha1`): PKCS#7 SignedData in the security directory (a file offset), via `cms` +
  `x509-cert` + `sha1`; unverified, so only "probably this vendor".
- **ELF and Mach-O** (`elf.machine`, `elf.build_id`, `elf.soname`, `macho.uuid`,
  `macho.platform`, bundle `Info.plist` keys): the loader is Windows-only today.
- **Godot** (`godot.version` from the `GDPC` pack header), **Source** (`steam.inf`
  `PatchVersion`), Unity's SerializedFile header for games without `UnityPlayer.dll`, and an
  Unreal string scan for executables without the version resource.
- `unreal.build_config` from an unrenamed `-Win64-Shipping` name.
