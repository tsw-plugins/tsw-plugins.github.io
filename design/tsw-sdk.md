---
name: tsw-sdk concept
description: A shared Rust mod for Train Sim World 7 that loads, hosts and connects other mods (Rust and Lua), carved out of tsw-coop's native DLL.
game_build: 886 (TSW 7, Steam build 25890949)
status: proposal
created: 2026-10-18
last_edited: 2026-10-18
---

# tsw-sdk: concept (proposal, 2026-10-18)

> **Superseded in part (2026-10-18, same day).** The loader this proposal describes was built as
> [uniloader](https://uniloaders.github.io/), which loads plugins for any game: plugin loading,
> the C ABI, services, events, settings, the console, fault isolation and Lua live there. tsw-sdk
> became the Train Sim World adapter plugin (`tsw.dll`) plus the crates plugins build on; see
> [plugins/tsw-sdk](../plugins/tsw-sdk.md). The game-specific parts below (engine access, menus,
> the indicator, game state) still describe what the adapter does or will do.

`tsw-sdk` is the one game-side DLL that every mod of the `tsw-plugins` org builds on. It replaces
UE4SS as the loader, owns everything the game exposes (the engine, input, HUD, menus and game state),
and hosts **plugins**: Rust `cdylib`s and Lua scripts. Today all of this lives inside tsw-coop's
`dwmapi.dll` (`mod/native`, about 11 800 lines). This document says what moves out, how plugins are
loaded and talk to the SDK and to each other, and how to get there without breaking tsw-coop.

It follows the owner's goals: **no C/C++ of our own** (Rust for shipped code), **Lua for development
and light mods**, and **UE4SS only as a development tool**. Where this proposal conflicts with
`docs/08-concept.md` (row "Mod language", `08-concept.md:25`, which still describes a C++ shim), the
owner's decision decides and 08 gets updated.

Prior art we copy from is the owner's DayZ loader, `dayz-plugins/dayz-plugin-loader`, a Rust
`dxgi.dll` proxy. Its plugin API is at version 9, and its patterns are cited below as `dayz:` paths.

---

## 0. Summary of the recommendation

| Question | Answer |
| --- | --- |
| Who is `dwmapi.dll`? | **tsw-sdk** (the host). It scans the engine once, hooks the tick, loads the plugins, and in dev mode chain-loads UE4SS. |
| Plugin kinds | Rust `cdylib` (`kind = "rust"`) and Lua (`kind = "lua"`). Both are described by a `plugin.toml` in `Win64/tsw/plugins/<id>/`. |
| Rust ABI | A **C ABI**: `#[repr(C)]` function tables prefixed with `struct_size`, append-only within a major version. A safe wrapper crate `tsw-sdk` hides the ABI, and plugins only ever see the wrapper. |
| Lua | **Embedded in the SDK** (`mlua`, Lua 5.4), one state per plugin, on the game thread. UE4SS is not needed in production. |
| Talking between plugins | Plugin registry with versions, a **typed event bus** (JSON payloads with versioned names), a shared **state store**, **services** (request/reply), and optional dependencies and conflicts declared in the manifest. |
| Failure isolation | Every call across the boundary runs under `catch_unwind` plus an SEH guard. A plugin that faults is disabled for the session and shown as failed. A crash is attributed to its plugin, and the next start offers safe mode. |
| Hot reload | Lua: yes. Rust: dev-only and opt-in (`hot_reload = true`), with a shadow copy and full unregistration. In production, enabling or disabling a Rust plugin takes effect at the next start; a "soft disable" stops its callbacks immediately. |
| Docs | Everything on `tsw-plugins.github.io`: guides, the event catalogue, rustdoc built locally and committed, the Lua reference plus a `tsw.d.lua` stub, research. Code repos keep only `README.md` and `AGENTS.md`. |

---

## 1. What moves from tsw-coop into tsw-sdk

Line counts are from `mod/native/src` as of today. "SDK API" is what plugins get.

### 1.1 Engine access (`sys/`)

| Today | Becomes | SDK API (plugins) |
| --- | --- | --- |
| `sys/proxy.rs` (169): dwmapi forwarding and `DllMain` with the init thread (`proxy.rs:151-169`) | **host only**. The SDK is the only proxy. | none |
| `sys/engine.rs` (416): patternsleuth scan of `GUObjectArray`, `FName` ctor/`ToString`, `GMalloc`, `GEngine`, `UGameEngine::Tick` (`engine.rs:16-26, 100-116`); `Object` (`engine.rs:213-288`); `Held` (`engine.rs:326-349`); `for_each_object` (`engine.rs:352`); vtable tick hook with `catch_unwind` (`engine.rs:373-416`) | host: `tsw-sdk-host::engine` | `Obj` handles (always `Held` semantics, see 3.4), `name()`, `find_name()`, `object_count()`, budgeted iteration |
| `sys/reflect.rs` (552): `find_paths` (`reflect.rs:124`), `find_property` (`:161`), `class_default_object` (`:208`), `NativeFn` over `ProcessEvent` (`:426-552`), `Arg`, `Pod` value types, `GameString`/`ObjectArray::take` returning memory to `GMalloc` (`:276-347`), `object_path` (`:352`) | host: `engine::reflect`, plus **dynamic marshalling** (new: reads the `FFieldClass` name for Lua and generic calls) | `Func` (resolved once, called many times), `Prop`, `find`, `find_many`, `cdo`, value types `Vector`/`Rotator`/`FarVector`/`Guid`/`Text`/`GameStr` |
| `sys/input.rs` (81): focus-gated `key_down`, `inject_key`, `set_typing` (`input.rs:23-81`) | host: `input` | key registry (3.6), `key_down`, `focused`, `capture_text(bool)`, dev injection |
| `sys/steam.rs` (293): the game's flat Steamworks API, rich presence, join-request callback | host: `platform::steam` | `steam().set_rich_presence`, `owns_dlc`, `launch_command_line`, `on_steam_join` event |
| `sys/pipe.rs` (75), `discord/ipc.rs` | host: `platform::discord` (single IPC owner, one presence per app id) | `discord(app_id).set_activity`, `on_discord_join` |
| `sys/http.rs` (60), `sys/winhttp.rs` (331): urlmon/WinHTTP loaded at run time, never imported (`http.rs:1-6`: a static import stopped the game under Proton) | host: `platform::http` (the rule "no new static imports" becomes an SDK build check) | `http::download`, `http::post` (blocking, off the game thread only) |
| `sys/shell.rs` (205): registry strings, `open_url`, named mutex, `this_dll`, message box, `rundll32` entry | host: `platform::shell`; the `rundll32 dwmapi.dll,…` entry points become SDK exports that dispatch by URL scheme | `open_url`, `register_scheme("tswcoop", …)` → `on_link(url)` event |
| `sys/ugc.rs` (111): user liveries in `UGCSaves` | **stays in tsw-coop** (game data only coop uses); it moves to the SDK if a second plugin needs it | none |

### 1.2 Tick and scheduling

| Today | Becomes |
| --- | --- |
| `lib.rs:91-147`: init thread, scan, wait for `GEngine`, hook the tick | Host bootstrap. Plugins are loaded on the init thread after the scan (`on_load`) and started on the first game-thread tick (`on_start`). |
| `lib.rs:317-385` `on_tick`, `lib.rs:261-314` `every_frame`: one hand-written dispatcher, static `Mutex<Option<…>>` per feature (`lib.rs:225-233`) | The SDK dispatcher calls plugins in load order. It holds no lock across a plugin call (DayZ lesson, `dayz-plugin-loader/AGENTS.md:47-94`). |
| `lib.rs:247-257` `note_stall` | SDK journal → `on_stall` event |
| Capture cadence (`Session::begin_tick`, 10 Hz) | SDK `every(Duration, cb)` timers and `post(closure)` to run on the game thread from any thread. The 10 Hz telemetry cadence stays in coop. |

### 1.3 Input

`sys/input.rs` moves as is. On top of it comes a **key registry**: plugins bind *actions* (`"tsw-jump.jump"`) to default keys. The SDK detects conflicts, shows them in the Plugins screen, stores rebinds in `tsw/config/keys.toml` and only delivers a key while the game is focused and no text box captures input. Today every feature edge-detects its own keys (`jump.rs:184-189`, `menu.rs:193-195`); this becomes one place. Jump's photo-mode remap (`jump.rs:152-181`, `RemoveActionMapping`/`AddActionMapping` on the `InputSettings` CDO) becomes a generic `input().remap_action(action, from, to)` that the SDK undoes when the plugin stops.

### 1.4 HUD and UI

| Today | Becomes |
| --- | --- |
| `toast.rs` (148): `CreateAndPostNotificationTimedTyped` with header `tsw-coop` (`toast.rs:17`) | `ui().toast(text, kind)`. The header defaults to the calling plugin's name. |
| `umg.rs` (413): `Ui` with 43 resolved paths (`umg.rs:29-73`), `canvas`, `place`, `border/vbox/hbox/sized/text/image`, `top_widgets`, `root_canvas` | `ui::Builder`, exposed nearly 1:1. Widgets are `Obj` handles owned by the plugin and removed by the SDK when the plugin stops. |
| `menu.rs` (394): F9 text menu with hard-wired rows (`menu.rs:39-53`) | **Menu API** (5.3): plugins declare pages and rows; the SDK renders them. The F9 overlay is renderer #1. |
| `menu_logo.rs` (149): badge on the main menu's root canvas, preferred widget classes (`menu_logo.rs:20`) | Becomes the **plugin indicator** (puzzle piece) on every menu screen (5.4). The tsw-coop badge goes away or becomes coop's optional `indicator_icon`. |
| `chat_box.rs` (252): runtime `UEditableTextBox`, `SetInputMode_UIOnlyEx` | The text-input widget and input-mode switch move into `ui::Builder::text_input` plus `input().capture_text`. Chat itself stays in coop. |
| `scoreboard/` | stays in coop, built with `ui::Builder` |
| research option D (`debug-ui.md:136-160`, `ShowCustomDialog`) | `ui().dialog(title, text, a, b) -> Pending<Choice>`, once verified |
| `docs/research/native-menus.md` (in progress, not written yet) | Renderer #2 of the menu API. Plugins do not change when it lands. |

### 1.5 Offsets, addresses and per-build data

Addresses are already found at run time by patternsleuth (`engine.rs:16-26`). What is compiled in today are **layout constants**:

- `UObject`/`FUObjectArray` layout: `engine.rs:28-47`
- `FField`/`FProperty` layout, `ClassDefaultObject` offset `0x118`, `ProcessEvent` vtable slot 67: `reflect.rs:10-33`
- struct sizes: `FSlateFontInfo` (`umg.rs:23-25`), `FInputActionKeyMapping` (`jump.rs:31-34`)

Proposal:

- `tsw-sdk/data/layouts/ue-4.26.toml` holds the engine layouts. The SDK ships them, and they are selected by engine version.
- `data/builds/<game build>.toml` holds per-build overrides and the patternsleuth revision that was verified against that build (today pinned in `mod/native/Cargo.toml`).
- **Self-test at start.** For example: the class of `*GEngine` is named `GameEngine` or `TS2GameEngine`; `UObject`'s CDO's class is `UObject`; the `ProcessEvent` slot points into `.text`. If the test fails, the SDK loads no engine-using plugin, logs why, and the indicator shows "incompatible game build".
- **Reflection over constants.** Struct sizes come from `UScriptStruct::PropertiesSize` and field offsets from reflection, never from hand-written numbers.
- The DayZ rule "never compile an address into code" (`dayz-plugin-loader/AGENTS.md`) applies. A separate data repo (like `dayz-data`) is not needed while patternsleuth plus reflection cover everything; `data/` lives in the SDK repo.

### 1.6 Game info and state

| Today | SDK API |
| --- | --- |
| `game_info.rs` (114): `GetBuildNumber`, `GetTimetable` → route and timetable (`game_info.rs:38-110`) | `game().build()`, `game().route()`, `game().timetable()` |
| `capture.rs:342-383`: player controller found by the object sweep (sliced, `SWEEP_SLICES`) | `game().controller()`, `game().pawn()`, `game().drivable()`, `game().world()`. Resolved **once per frame by the SDK**, so plugins never walk the object array for them (the performance rule in `AGENTS.md`, `docs/research/performance.md`). |
| `journal.rs` (266) + `journal/watch.rs`: world, controller, pawn, drivable, seated, paused, world origin, clock jumps, derailment, top-level widgets, stalls (`journal.rs:69-81`) | The SDK journal stays a log of state changes, and **each change becomes an event** (6.1). The coop-specific parts (train motion) stay in coop. |
| `profile.rs` (88): driver level | `game().profile()` (`driver_level`), since it is generic |
| `crashes.rs` (164): crash folders reported once (`crashes.rs:61`) | SDK built-in, plus **plugin attribution** (2.6) |
| `skip_intro.rs` (250): `AdvanceToNextScreen` | SDK built-in with a setting in the SDK's own settings page, replacing the flag file `tswcoop-no-skip-intro` (`skip_intro.rs:27`) |
| `dev.rs` (128): console command, quit, held keys | SDK built-in (`game().console(cmd)`, `game().quit()`) |
| screenshots: `devapi.sh shot` runs `shot showui` and watches the screenshot folder (`mod/native/devapi.sh:36-59`) | `game().screenshot(show_ui) -> Pending<PathBuf>` and `POST /dev/shot` |

### 1.7 Logging, config, web

| Today | Becomes |
| --- | --- |
| `log.rs` (62): `tswcoop-native.log`, `[t utc]` lines | `tsw/logs/tsw-sdk.log`. Each line is tagged `[plugin-id]`, and one file per plugin is optional. API: `log::info!` (Rust), `tsw.log.info` (Lua). |
| Flag files next to the exe (`tswcoop-no-jump` `jump.rs:25`, `tswcoop-no-skip-intro`, `tswcoop-native-no-ue4ss` `lib.rs:73`) | The **settings API** (5.2), stored in `tsw/config/<id>.toml`. Old flags are migrated once, at the first start. |
| `tswcoop.cfg` (format in `server/crates/tsw-coop-client/src/settings.rs:1-40`) | Stays coop's own file, moved to `tsw/config/tsw-coop.cfg`. Settings that need a UI are mirrored through the settings API. |
| `web/` (tiny_http, one thread; `web/mod.rs:1-20` route table): coop state, map, SSE, admin, and the `/dev/*` endpoints | **The server and `/dev/*` move to the SDK.** Plugins mount routes under `/p/<id>/…`. The built-ins are `GET /api/plugins`, `GET /api/events` (bus SSE, dev), `POST /dev/{key,console,quit,shot,lua}`. Coop keeps `/api/state`, `/api/invite`, admin and the map page, mounted as `/p/tsw-coop/…`, with redirects from the old paths for the existing tests and `devapi.sh`. |
| `install.rs` (179): copies the mod and keeps a foreign `dwmapi.dll` as `.ue4ss` | Becomes the SDK installer. Plugins install by unzipping into `Win64/`. |

### 1.8 What stays in tsw-coop

Networking and replication:
`capture.rs` (the coop telemetry; it uses `game().controller()`), `net.rs`, `net/`, `online.rs`, `hosting.rs`, `relay_log.rs`, `geoip.rs`, `clock_sync.rs`, `weather.rs`, `world.rs`, `world/outbox.rs`, `quiet.rs`.

Game-world features:
`ghost.rs`, `ghost/`, `avatar.rs`, `avatar/`, `avatar_msg.rs`, `nametag.rs`, `scoreboard/`, `drive.rs`, `drive/`, `cab.rs`, `livery.rs`, `sys/ugc.rs`.

Session-specific logic:
`steam.rs` (the `connect` string), `discord.rs` (presence content), `join_link.rs` (invite handling), and coop's web routes and `map.html`.

Elsewhere:
- All `server/crates/*` stay.
- `mod/core` (`tswcoop_core`) loses its C ABI (`src/ffi.rs`, `include/tswcoop_core.h`, used only by the C++ shim) and becomes a plain rlib of coop.
- **Deleted** with the move to Rust only: `mod/shim/` (C++), the C++ UE4SS toolchain in `toolchain/`, and the C++-only parts of `external/` (imgui, fmt, zydis, IconFontCppHeaders, ImGuiColorTextEdit). RE-UE4SS stays only if the dev build of UE4SS is still built from source.

`mod-lua/TswCoopDebug`:
- The generic helpers (`cached.lua`, `sched.lua`, `toast.lua`, `menu.lua`, `jump.lua`) become SDK Lua examples or are dropped. The SDK gives the same services natively.
- The driving and spawning tools (`drive*.lua`, `spawn.lua`, `play.lua`) become a Lua plugin `tsw-devtools`, which no longer needs UE4SS (section 4).

`ghost.rs` and `avatar.rs` are what **tsw-mp** needs as well. They should become a shared Rust crate (`tsw-world-kit`, see question 10) that both plugins link **statically**. Sharing code needs no ABI, only the engine calls go through the SDK.

---

## 2. Loading model

### 2.1 The single loader

`Win64/dwmapi.dll` is tsw-sdk. Its bootstrap is today's `lib.rs:91-147` generalised:

1. `DllMain` forwards the dwmapi exports and starts the init thread (`proxy.rs:151-169`). The loader lock is never used for anything else.
2. The init thread opens the log, reports crash folders, reads `tsw/sdk.toml`, discovers manifests, resolves dependencies and **loads** the plugin DLLs (`LoadLibraryW`). It calls `on_load` for early, engine-free work: Steam launch line, URL scheme registration, threads.
3. If `[dev] ue4ss = "auto"` and `ue4ss/UE4SS.dll` exists, UE4SS is chain-loaded (`lib.rs:149-160`). The production default is `off`.
4. Scan, then wait for `GEngine`, then the layout self-test, then hook the tick.
5. On the first tick (game thread): the SDK resolves its own built-ins and reads the game build. It checks each plugin's `game` range, then calls `on_start` in load order. From then on, `on_tick` and events are delivered.

### 2.2 Folder layout (`…/Binaries/Win64/`)

```
dwmapi.dll                      tsw-sdk (host)
tsw/
  sdk.toml                      loader config: disabled plugins, log level, [dev] ue4ss, safe mode
  logs/tsw-sdk.log              one log, lines tagged [plugin-id]
  config/<plugin-id>.toml       per-plugin settings (settings API); keys.toml (rebinds)
  data/                         layouts, per-build data (shipped with the SDK)
  assets/                       SDK images (puzzle piece, icons)
  lua/tsw.d.lua                 LuaLS type stub for editors
  plugins/
    tsw-coop/  plugin.toml  tsw_coop.dll  assets/…
    tsw-jump/  plugin.toml  tsw_jump.dll
    my-mod/    plugin.toml  main.lua  lib/….lua
ue4ss/                          dev only, chain-loaded when [dev] ue4ss = auto
```

`tsw/` is used instead of `ue4ss/Mods`, so the two never mix, and uninstalling means deleting
`dwmapi.dll` and `tsw/`.

### 2.3 Manifest (`plugin.toml`)

DayZ has no manifest file; a plugin describes itself through an exported function
(`dayz-plugin-api/src/types.rs:161-176`). TSW needs a file anyway, for three reasons:

- Lua plugins have no exports.
- The Plugins screen must list disabled plugins without loading them.
- Incompatible plugins must be refused before any of their code runs.

Rust plugins *also* embed the manifest (the wrapper macro uses `include_str!`), and the loader
refuses a DLL whose embedded `id`/`version` differs from the file next to it (a stale DLL).

```toml
id = "tsw-jump"                    # [a-z0-9-]+, unique; config file name, event/state namespace
name = "TSW Jump"
version = "1.0.0"                  # semver
authors = ["Bluscream"]
description = "Jump on Space while on foot (photo mode moves to O)."
license = "MIT"
homepage = "https://tsw-plugins.github.io/plugins/tsw-jump/"
kind = "rust"                      # rust | lua
entry = "tsw_jump.dll"             # or "main.lua"
sdk = "^1.0"                       # SDK API semver requirement (checked before loading)
game = ">=886"                     # game build range (GetBuildNumber); omitted = any, warned
load = "normal"                    # early | normal | late (tie-breaker after dependencies)
hot_reload = false                 # rust: dev-only opt-in, see 2.5

[dependencies]                     # must be present, enabled and started first
# "tsw-world-kit" = "^0.3"

[optional-dependencies]            # started first when present; absence is fine
# none

[conflicts]                        # refuse to start alongside these
"other-jump-mod" = "*"

[multiplayer]                      # read by tsw-coop / tsw-mp (section 5.5)
sync = "announce"                  # local | announce | must-match

[provides]                         # documentation and discovery; checked against what start() registers
events = ["tsw-jump.jumped/1"]
state = ["tsw-jump.enabled/1"]
services = ["tsw-jump.control/1"]
```

Versions use semver requirements (the `semver` crate). Requirements have the form `^1.2`,
`>=1, <3` or `*`. DayZ's own comparator syntax (`dayz-plugin-loader/README.md:146-151`) is a
subset of this.

### 2.4 Load order, enable and disable

- **Order:** a topological sort over `dependencies` + `optional-dependencies`, then `load`, then `id`.
  - A cycle, or a missing or disabled required dependency, means the plugin is **not started**. The Plugins screen shows the reason.
  - DayZ starts a waiting plugin automatically once its dependency starts (`dayz-plugin-loader/README.md:146-168`). We do the same for dependencies that are enabled at run time.
- **Conflicts:** both directions are checked. The one loaded later is refused with "conflicts with X".
- **Disable:** `tsw/sdk.toml` `disabled = ["tsw-jump"]`, written by the Plugins screen. Two kinds:
  - **Soft disable** (immediate): the SDK stops delivering callbacks. It calls `on_disable` so the plugin removes its widgets and bindings, and it removes the plugin's key bindings, menus, routes, subscriptions and services itself. Plugins that depend on it receive `on_plugin_state`.
  - **Hard disable** (the DLL is not loaded): takes effect at the next start.
  - Enabling a never-loaded Rust plugin at run time is allowed *only* if it declares `hot_reload = true`. Otherwise it waits for the next start.
- **Safe mode:** if the previous session crashed before the first tick, or a crash was attributed to a plugin (2.6), the next start loads only the SDK. The indicator shows "Safe mode: TSW Jump crashed the game last time. Enable it again?". Command-line overrides: `-tsw-noplugins` and `-tsw-only=a,b`.

### 2.5 Hot reload

| Kind | Feasible? | How |
| --- | --- | --- |
| Lua | **yes, always** | Drop the plugin's Lua state (its registrations are owned by the SDK and removed), create a new one, run `main.lua`. File watcher in dev; "Reload" button in the Plugins screen. |
| Rust, dev | **yes, opt-in** (`hot_reload = true`) | Load from a **shadow copy** (`plugins/<id>/.shadow/<id>-<n>.dll`; Windows locks a loaded DLL file). `on_stop(Reload)`, SDK-side unregistration, then `FreeLibrary` and a new load. The plugin must have **joined all its threads** and keep no TLS-bearing threads alive (a Rust std thread with TLS destructors inside an unloaded DLL crashes). The wrapper offers a `ThreadSet` that is joined in `on_stop`. |
| Rust, production | **no** | Too many ways to crash, for example tokio/iroh runtimes in coop (`mod/native/Cargo.toml` deps). DayZ made the same call: never `FreeLibrary` (`dayz-plugin-loader/README.md:170-173`). |

### 2.6 Failure isolation

- **Panics:** every exported plugin function generated by the wrapper macro, and every callback the SDK invokes, runs under `catch_unwind`.
  - Since Rust 1.81, a panic unwinding out of an `extern "C"` function **aborts the process**, so this is mandatory on both sides.
  - Both sides build with `panic = "unwind"`, as today (`mod/native/Cargo.toml`, `[profile.release]`).
- **Hardware faults:** access violations in a plugin's game-thread code are caught by an SEH guard around each plugin call. DayZ uses `catch_unwind` plus `microseh::try_seh` (`dayz-plugin-loader/crates/dayz-plugin-loader/src/win/guard.rs:40-70`). This needs the MSVC target, which we already build (`x86_64-pc-windows-msvc` via xwin).
  - A faulted plugin is disabled for the session. Its registrations are dropped, a toast says "TSW Jump stopped after an error (see log)", and the Plugins screen shows the fault.
  - Game state may be inconsistent after a fault, so the toast recommends a restart.
- **Repeated errors:** `Err` returns from callbacks are logged with rate limits. Three panics within 60 s soft-disable the plugin.
- **Crash attribution:** a vectored exception handler that only *observes* (it returns `EXCEPTION_CONTINUE_SEARCH`) records the faulting address. The SDK maps that address to a loaded module (`GetModuleHandleExW(FROM_ADDRESS)`) and writes `tsw/logs/last-crash.toml` before the game's crash reporter runs. The next start reads it, together with `crashes.rs`'s folders, for safe mode.
- **Threads:** plugin threads are outside the guard. The wrapper's `spawn` wraps them in `catch_unwind` and reports a panic as a plugin fault.
- **Never hold a lock across a plugin call.** The SDK collects events during a callback and delivers them after it returns, the same rule as `dayz-plugin-loader/AGENTS.md:47-94`. This also makes re-entrancy (a plugin calling the SDK from inside a callback) safe.

---

## 3. ABI between the SDK and Rust plugins

### 3.1 Options compared

| Option | For | Against | Verdict |
| --- | --- | --- | --- |
| **C ABI**: `extern "C"` function tables, `#[repr(C)]` structs with `struct_size`, append-only | Stable across compiler versions; language-neutral (a future C#/Zig plugin, or a test harness); simple to debug; proven in the DayZ loader (API 9, `dayz-plugin-api/src/lib.rs:55-72`) | Hand-written `unsafe` glue | **Chosen.** All the glue lives in two crates (`tsw-sdk-abi`, `tsw-sdk`), and plugin authors never write `unsafe`. |
| `abi_stable` | Rust types across the boundary (`RString`, `RVec`, trait objects) with load-time layout checks | Heavy proc macros, slow builds, a Rust-only ABI, slow upstream; the C ABI is still needed for other languages; failure messages are hard to read | Rejected |
| Rust `dylib` crate type | Native Rust API | Needs the exact same `rustc` and dependency versions for SDK and every plugin: unusable for separate repos and releases | Rejected |
| One statically linked binary (plugins as cargo features) | No ABI at all, fastest | No third-party plugins, every combination is its own build, contradicts one repo and release per mod | Rejected (shared *code* is still linked statically, e.g. `tsw-world-kit`) |
| WASM plugins (wasmtime) | Sandboxed, stable ABI | ~10 MB runtime, a host call per engine access, no threads/sockets without WASI work, so coop cannot be one | Not for v1; maybe later for untrusted plugins |

### 3.2 Crates

- **`tsw-sdk-abi`**: `#![no_std]` and dependency-free; only the `#[repr(C)]` types and function-pointer tables, plus `ABI_MAJOR`/`ABI_MINOR`. This is the contract.
- **`tsw-sdk`**: the safe wrapper every plugin depends on. It provides:
  - the `Plugin` trait and the `export_plugin!` macro (which embeds `plugin.toml`)
  - typed `Obj`, `Func`, `Prop`, `Setting<T>`, `Event<T>` and `Service`
  - `serde` events and Lua-compatible value conversion
  - a mock host for unit tests without the game (Lua tests already have a fake UE4SS today, `scripts/lint-lua`)
- **`tsw-sdk-host`**: the `cdylib` named `dwmapi`. It holds the whole of today's `sys/` and is never a dependency of plugins.

### 3.3 Exports and tables (sketch)

```rust
// tsw-sdk-abi
pub const ABI_MAJOR: u16 = 1;
pub const ABI_MINOR: u16 = 0;

#[repr(C)] #[derive(Clone, Copy)] pub struct Str { pub ptr: *const u8, pub len: usize } // borrowed UTF-8, valid for the call
#[repr(transparent)] #[derive(Clone, Copy)] pub struct Status(pub i32);                 // 0 ok, <0 error; text via core.last_error
#[repr(transparent)] #[derive(Clone, Copy)] pub struct PluginId(pub u32);
/// An object handle with `Held` semantics (engine.rs:326-349): the SDK checks the slot on every use.
#[repr(C)] #[derive(Clone, Copy)] pub struct ObjRef { pub addr: usize, pub slot: u32, pub _pad: u32 }

#[repr(C)]
pub struct Host {
    pub struct_size: usize,
    pub abi_major: u16, pub abi_minor: u16,
    pub core: *const CoreApi,       // log, last_error, plugin dirs, post(), timers, has_feature()
    pub engine: *const EngineApi,   // find, func/prop resolve, call, field get/set, names, iteration
    pub game: *const GameApi,       // build, world, controller, pawn, drivable, route, console, screenshot
    pub input: *const InputApi,     // bind, key_down, focus, capture_text, remap_action
    pub ui: *const UiApi,           // toast, dialog, umg builder, menus, settings pages
    pub bus: *const BusApi,         // events, state, services, plugin registry
    pub web: *const WebApi,         // routes
    pub platform: *const PlatformApi, // steam, discord, http, open_url, schemes
}

#[repr(C)]
pub struct CoreApi {
    pub struct_size: usize,
    pub log: unsafe extern "C" fn(PluginId, Level, Str),
    pub last_error: unsafe extern "C" fn(PluginId, *mut Str) -> Status,
    pub has_feature: unsafe extern "C" fn(Str) -> bool,         // "ui.dialog", "ui.native_menus", …
    pub post: unsafe extern "C" fn(PluginId, extern "C" fn(*mut c_void), *mut c_void) -> Status, // to game thread
    // … appended only
}

/// Filled by the plugin in tsw_plugin_start; every entry optional.
#[repr(C)]
pub struct Callbacks {
    pub struct_size: usize,
    pub ctx: *mut c_void,
    pub on_start: Option<unsafe extern "C" fn(*mut c_void) -> Status>,
    pub on_tick: Option<unsafe extern "C" fn(*mut c_void, f32)>,
    pub on_event: Option<unsafe extern "C" fn(*mut c_void, Str /*name*/, Str /*json*/)>,
    pub on_disable: Option<unsafe extern "C" fn(*mut c_void)>,
    // … built-in events (world, pawn, screen, key, setting) as typed entries
}

// Exports of every Rust plugin (generated by tsw_sdk::export_plugin!):
//   tsw_plugin_describe() -> *const Describe   // abi_major, abi_minor, embedded manifest text
//   tsw_plugin_load(host: *const Host, me: PluginId, cb: *mut Callbacks) -> Status   // init thread
//   tsw_plugin_stop(ctx: *mut c_void, reason: StopReason)
```

Rules:

- **Memory:** never free across the boundary. Inputs are borrowed `Str`/slices; outputs go into a caller-provided buffer or are handed to a caller callback.
- **Enums that cross the ABI:** transparent integers, never Rust `enum`s. An unknown value from a newer side must not be undefined behaviour (`dayz-plugin-loader/README.md:366-371`).
- **Threads:** the engine, UI and game APIs work **on the game thread only**. Elsewhere they return `Status::WRONG_THREAD`; the wrapper's types are `!Send` where that matters, and `post` is the bridge.
- **Objects:** plugins never get raw `UObject*` in the safe API. `ObjRef` is validated by slot on every SDK call. This is exactly the GC lesson of `docs/research/hosted-session-test.md:50` (a cached raw pointer freed by GC crashed `PlayAnimation`). `unsafe fn ObjRef::as_ptr()` exists for experts.

### 3.4 Versioning and compatibility

- **ABI major** (`u16`): an exact match is required.
  - DayZ requires an exact match on a single number (`dayz-plugin-loader/crates/dayz-plugin-loader/src/win/plugins.rs:297-299`), so every one of its eight API bumps forced a rebuild of every plugin. We avoid that by splitting major and minor.
  - A plugin with a different major is listed as "built for SDK 2.x, this is SDK 1.4" and not loaded.
- **ABI minor:** append-only. Tables and structs only grow, and each starts with `struct_size`.
  - A plugin built against minor M runs on any SDK with minor ≥ M.
  - On an older SDK the wrapper sees the smaller `struct_size` and returns `Error::Unsupported` for the newer functions. Plugins can ask first with `sdk.has("ui.dialog")`.
- **Wrapper crate semver = ABI:** `tsw-sdk 1.4.x` speaks ABI 1.4. The manifest's `sdk = "^1.4"` is checked before `LoadLibrary`.
- **Events, state and services** carry their own major: `tsw-jump.jumped/1`.
  - Adding fields is compatible (JSON, unknown fields ignored, missing ones defaulted).
  - A breaking change becomes `/2`. The publisher can emit both versions for a while.

---

## 4. Lua plugins

### 4.1 Options

| | A: UE4SS Lua plus a registered native module | **B: the SDK embeds Lua (`mlua`, Lua 5.4)** |
| --- | --- | --- |
| UE4SS in production | required (C++, against the goal) | not needed |
| Threading | UE4SS's async/timer pitfalls crash the game (`docs/research/ue4ss-lua-pitfalls.md` §1-3) | Lua runs only inside the SDK's game-thread dispatch; no async Lua thread exists |
| Getting our API in | UE4SS links Lua statically and does not export `lua_*` (to verify), so a `require`d native module cannot share its state; a UE4SS C++ mod would be needed as glue | the same Rust wrapper functions as Rust plugins; identical semantics |
| Isolation | one shared UE4SS state per mod, UE4SS-specific error handling | one `Lua` state per plugin; `pcall` at every entry; memory limit per state |
| Hot reload | UE4SS "restart all mods" | per plugin (2.5) |
| Cost | none for us, but UE4SS's weight (ImGui, console) | the Lua 5.4 C sources are vendored and built by cargo (`mlua` feature `vendored`), about 300-500 KB. We write no C, but C is compiled. |

**Recommendation: B.** Lua is part of the SDK, so Lua mods run on the same API, events and
isolation as Rust mods, and UE4SS becomes a pure dev tool. That covers the Live View and dumpers,
and the old `TswCoopDebug` bridge until it is replaced by `POST /dev/lua`, which runs a snippet in
a plugin's state or a scratch state, as `tswlua` does today.

- **Pure-Rust Lua VMs** (`piccolo` and others) are not production-ready; we can revisit them later to drop the vendored C.
- **Risk:** `mlua`'s vendored build when cross-compiling with clang-cl/xwin. DayZ dropped `retour` because its C did not cross-compile under clang-cl (`dayz-plugin-loader/AGENTS.md`). Migration step 0 is a spike to check this.

### 4.2 Lua API shape

The module is `tsw`, preloaded in every plugin state. Each plugin's `main.lua` runs once at
`on_start` and registers callbacks. Objects are userdata wrapping `ObjRef`:

- `obj:valid()`, `obj:class()`, `obj:path()`
- `obj:get("Prop")` / `obj:set("Prop", v)` through dynamic marshalling (1.1)
- `obj:call("Fn", …)`, a cached `Func` under the hood

v1 marshals `bool`, the integer types, `float`, `double`, `FName`, `FString`, `FText`, objects,
enums as integers, and `FVector`/`FRotator`/`FFarVector` as tables. Anything else is an error
naming the property type.

A full sample is in 7.2. Editor support: `tsw/lua/tsw.d.lua` (LuaLS `---@meta` stub), generated
from the same registration table the host uses. A test in tsw-sdk fails when a registered
function has no stub entry.

---

## 5. Inter-plugin compatibility and shared services

### 5.1 Registry

```rust
sdk.plugins().get("tsw-jump")   // -> Option<PluginInfo { id, name, version: semver::Version, authors, state }>
sdk.plugins().all()
// state: Loaded | Started | Disabled | Failed(reason) | Incompatible(reason) | Waiting(dep)
// on_plugin_state(id, state) fires on every change, e.g. tsw-jump soft-disabled from the Plugins screen
```

### 5.2 Event bus, state store, services

| Mechanism | For | Semantics |
| --- | --- | --- |
| **Events** `bus.emit("tsw-jump.jumped/1", payload)` | Things that happened | Fire-and-forget. Delivered on the game thread after the emitting callback returns, in subscriber load order. JSON payload, typed in Rust through `#[derive(tsw_sdk::Event)]`. Not for per-frame data (use state or a service). |
| **State** `state.publish("tsw-jump.enabled/1", true)` | Current values other plugins may read at any time | Last value is kept; `state.get(key)`; `state.watch(key, cb)` fires on change and once on subscribe. Only the owning plugin (the key's namespace) may write. Cleared when the owner stops. |
| **Services** `bus.provide("tsw-jump.control/1", handler)` / `bus.call("tsw-jump.control/1", "set_enabled", json)` | Requests and queries | Synchronous on the game thread with a guard; `Err(NotAvailable)` when the provider is absent or disabled. |

- **Namespace rule:** events, state keys, services, settings, menus, routes and key actions are all prefixed `<plugin-id>.`, so the SDK can attribute and clean them up.
- **Shared types:** a plugin that offers an API may publish a types-only crate (`tsw-jump-api`: event structs and constant names) and a Lua doc page. Consumers can also declare the same struct themselves; the versioned name plus JSON is the contract, not the Rust type.
- **Built-in events** (6.1) come from the SDK under the namespace `tsw.` and use typed callbacks, not JSON, because `on_tick` and friends are hot.
- **Dev visibility:** `GET /api/events` (dev, loopback) streams every bus event and state change as SSE, which is invaluable for tests.

### 5.3 Settings and menus (owned by the SDK, rendered by the SDK)

- **Settings API:** `settings().toggle/int/float/choice/text/key(id, label, default)` returns a `Setting<T>`, stored in `tsw/config/<id>.toml`. A change fires `on_setting_changed`. Every plugin automatically gets a settings page in the Plugins screen.
- **Menu API** (declarative, so renderers can change): `ui().menu("tsw-coop.main", "TSW Coop")` with rows:
  - `action(label, cb)`
  - `toggle(setting)`
  - `choice(setting)`
  - `slider(setting)`
  - `info(text_fn)`
  - `submenu(id)`

  Menus are reachable from the Plugins screen, and a plugin may also bind a key to open one (coop's F9).
- **Renderers:**
  1. The runtime UMG overlay of `menu.rs` (keyboard, works today).
  2. Native TSW menu injection, per `docs/research/native-menus.md` once the parallel research lands. Plugin code does not change; `has_feature("ui.native_menus")` tells whether it is active.

### 5.4 The plugin indicator and the Plugins screen

- **Where:** a puzzle-piece icon (`tsw/assets/plugins.png`) on **every menu screen**: the main menu, the pause menu and the in-game menus.
  - It is placed with the `menu_logo.rs` technique: top-level user widgets with a canvas root (`menu_logo.rs:88-128`), `Held` for widget and host, rechecked once a second.
  - It is generalised from "prefer `MainMenu_C`" to "every on-screen menu widget with a canvas root", and suppressed in the HUD (`ui.canvas(controller)` is `Some`, `menu_logo.rs:68-72`).
- **Hover** shows a tooltip panel:
  ```
  UE4SS v3.0.1 (2026-09-30)          ← only when chain-loaded (else "TSW SDK v1.0.0 (2026-10-18)")
  - TSW SDK v1.0.0 by Bluscream
  - TSW Coop v0.9.0 by Bluscream
  - TSW Jump v1.0.0 by Bluscream
  - Broken Mod v0.1.0 by someone (failed: panicked in on_tick)    ← red
  ```
  The UE4SS version and build date come from `UE4SS.dll`'s `VERSIONINFO`, read with `version.dll` loaded at run time (no static import, `http.rs:1-6`), with the first line of `ue4ss/UE4SS.log` as fallback.
- **Click** opens the **Plugins screen**, a full-screen runtime UMG panel:
  - one row per plugin: name, version, authors, state and reason
  - an enable/disable toggle (soft now, hard at the next start, as 2.4 says)
  - Settings, Keys, Menu, Homepage, Open log
  - Reload, for Lua and hot-reloadable plugins
  - Safe-mode banner
- **Mouse:** today only the keyboard works (`GetAsyncKeyState`, `input.rs:73-81`). Hover and click on the icon need verification:
  - **(a)** poll `UWidget::IsHovered` and `UButton::IsPressed` each frame on an SDK-owned `UButton` (both reflected BlueprintCallable functions in UE 4.26; check them in an engine object dump, since the committed `dumps/tsw7-886` UHT dump only covers `TS2Prototype`);
  - **(b)** fall back to the cursor position (`GetMousePosition`) plus the widget's cached geometry plus `VK_LBUTTON`.

  Keyboard fallback: a configurable key (default F10) opens the Plugins screen from anywhere.

### 5.5 Multiplayer relevance (tsw-coop, tsw-mp)

`[multiplayer] sync` in a manifest:

- `local`: irrelevant to others (skip-intro-like mods).
- `announce`: coop includes `id@version` in its `hello`. Peers know who has it and enable the matching sync (the jump example below).
- `must-match`: the session refuses players without the same `id` and major version, extending coop's "one protocol, mod version and game build per session" rule (`08-concept.md:44-46`) with the same refusal message style (`features.md:94`).

---

## 6. v1 event and function catalogue

The Rust signatures are methods of the `Plugin` trait (all have default no-op implementations) or
calls on `sdk: &Sdk`. Lua uses `tsw.on("<event>", fn)` and the same functions under `tsw.*`. All
callbacks run on the game thread.

### 6.1 Events

| Event | Rust | Lua | Fires |
| --- | --- | --- | --- |
| load | `fn load(sdk: &Loader) -> Result<Self>` | (n/a, `main.lua` runs at start) | init thread, before the engine exists; engine-free APIs only |
| start | `fn on_start(&mut self, sdk: &Sdk) -> Result<()>` | `main.lua` body | first game tick, engine ready, all dependencies started |
| stop | `fn on_stop(&mut self, sdk: &Sdk, why: StopReason)` | `tsw.on("stop", fn(why))` | disable, reload, game exit (`DLL_PROCESS_DETACH` or a hook on `UGameEngine::PreExit`; to verify) |
| tick | `fn on_tick(&mut self, sdk: &Sdk, dt: f32)` | `tsw.on("tick", fn(dt))` | every frame after `UGameEngine::Tick` (`engine.rs:373-383`) |
| world_loaded | `fn on_world_loaded(&mut self, sdk, w: &WorldInfo)` | `tsw.on("world_loaded", fn(w))` | a new world object with a player controller; `WorldInfo { world, route, timetable, freeroam }` |
| world_unloaded | `fn on_world_unloaded(&mut self, sdk)` | `"world_unloaded"` | the world object went away (load screen); cached `Obj`s from it are dead |
| pawn_changed | `fn on_pawn_changed(&mut self, sdk, pawn: Option<Obj>)` | `"pawn_changed"` | controller or pawn changed (respawn, seat), from the journal (`journal.rs:111-116`) |
| vehicle_changed | `fn on_vehicle_changed(&mut self, sdk, v: Option<Obj>, seated: bool)` | `"vehicle_changed"` | drivable actor or seated state changed |
| screen_changed | `fn on_screen(&mut self, sdk, s: &Screen)` | `"screen"` | the top-level menu widget set changed: `Screen { kind: Splash/MainMenu/Pause/Loading/Hud/Dialog/Other, class: String }`, checked at 4 Hz (today 1 Hz in `journal.rs`) |
| paused | `fn on_paused(&mut self, sdk, paused: bool)` | `"paused"` | `IsGamePaused` changed |
| stall | `fn on_stall(&mut self, sdk, d: Duration)` | `"stall"` | the gap between ticks is ≥ 1 s (`journal.rs:32`) |
| key | `fn on_key(&mut self, sdk, action: &str, edge: Edge)` | `tsw.input.bind(…, fn(edge))` | a bound action was pressed or released (focus-gated, not while text is captured) |
| setting_changed | `fn on_setting(&mut self, sdk, key: &str)` | `setting:on_change(fn(v))` | the Plugins screen or the config file changed a setting |
| plugin_state | `fn on_plugin_state(&mut self, sdk, id: &str, s: PluginState)` | `"plugin_state"` | another plugin started, stopped, failed or was disabled |
| bus event | `sdk.bus().subscribe::<T>(cb)` / `subscribe_raw(name, cb)` | `tsw.bus.on(name, fn(tbl))` | after the emitter's callback returned |
| link | `fn on_link(&mut self, sdk, url: &str)` | `"link"` | a registered URL scheme was opened (`tswcoop://…`) |
| steam_join / discord_join | `fn on_join_request(&mut self, sdk, src: JoinSource, secret: &str)` | `"join_request"` | Steam `GameRichPresenceJoinRequested_t`, Discord `ACTIVITY_JOIN` |

### 6.2 Functions (v1)

| Area | Rust (`sdk.…`) | Lua (`tsw.…`) |
| --- | --- | --- |
| log | `log::info!/warn!/error!` (macro takes `sdk`) | `log.info(s)` … |
| info | `sdk.version()`, `sdk.plugin_dir()`, `sdk.config_dir()`, `sdk.has(feature)` | `version()`, `has(f)` |
| engine | `engine().find(path) -> Option<Obj>`, `find_many(&[path])` (one walk, `reflect.rs:124`), `func(path, &[params]) -> Result<Func>`, `prop(class, name)`, `cdo(class)`, `name(text)`, `Obj::{valid, class, is_a, name, path, outer, get::<T>(prop), set}`, `Func::{call::<R>(obj, args), call_void}`, `instances_of(class) -> Vec<Obj>` (SDK-cached per world, never a per-frame walk), `for_each_object_budgeted(budget, cb)` | `engine.find`, `engine.func(path)(obj, …)`, `obj:get/set/call` |
| game | `game().build()`, `world()`, `controller()`, `pawn()`, `drivable()`, `route()`, `timetable()`, `clock() -> DateTime`, `paused()`, `world_origin()`, `profile().driver_level()`, `console(cmd)`, `quit()`, `screenshot(show_ui) -> Pending<PathBuf>` | same names |
| input | `input().bind(action, default_key, label) -> Binding`, `key_down(Key)`, `focused()`, `capture_text(bool)`, `remap_action(action, from, to)` | `input.bind(action, key, label, fn)` … |
| ui | `ui().toast(text, Kind)`, `ui().dialog(title, text, a, b) -> Pending<Choice>` (feature `ui.dialog`), `ui().builder()` (`umg.rs` 1:1: `canvas, place, border, vbox, hbox, sized, text, image, text_input, remove`), `ui().menu(id, title) -> MenuBuilder`, `ui().open_menu(id)` | `ui.toast(text, "info"\|"warn")`, `ui.menu{…}` |
| settings | `settings().toggle/int/float/choice/text/key(id, label, default) -> Setting<T>` | `settings.bool(id, label, default)` … |
| bus | `bus().emit(&T)`, `subscribe::<T>(cb)`, `provide(name, handler)`, `call(name, method, &Req) -> Result<Resp>`, `state().publish(key, &v)`, `get`, `watch` | `bus.emit(name, tbl)`, `bus.on`, `bus.provide`, `bus.call`, `state.publish/get/watch` |
| plugins | `plugins().get(id)`, `all()` | `plugins.get(id)` |
| web | `web().route(Method, "/path", handler)` mounted at `/p/<id>/path`; `web().sse(path) -> Publisher` | `web.route("GET", "/x", fn(req) return {status=200, json=…} end)` |
| platform | `steam().set_rich_presence(k, v)`, `owns_dlc(app)`, `launch_command_line()`; `discord(app_id).set_activity(..)`; `http::download(url, file)`, `http::post(url, body)` (worker threads only); `open_url(url)`; `register_scheme("tswcoop")` (in `load`) | `platform.open_url`, `platform.http_get` (async callback) |
| time | `sdk.every(Duration, cb) -> TimerId`, `sdk.after(d, cb)`, `sdk.post(closure)` (from any thread) | `every(sec, fn)`, `after(sec, fn)` |

Built-in SDK settings are on the SDK's own page: skip intro, UE4SS chain-load (dev), log level,
indicator on/off, Plugins key, dev API (`off` / `local` / `any`, as coop's `web_dev` today).

---

## 7. Example: tsw-jump as a standalone plugin

`jump.rs` (231 lines) is almost self-contained: it resolves 6 paths (`jump.rs:36-43`), remaps
photo mode (`jump.rs:152-181`) and calls `CanJump`/`Jump` on Space (`jump.rs:126-150`). Its
on/off flag and its F9 row (`menu.rs:83-87`) become a setting.

### 7.1 Rust

```
tsw-jump/
  Cargo.toml        crate-type = ["cdylib"], tsw-sdk = { git = "https://github.com/tsw-plugins/tsw-sdk", tag = "v1.0.0" }
  plugin.toml       (manifest of 2.3)
  src/lib.rs
```

```rust
use tsw_sdk::prelude::*;

/// Published on every jump. Consumers: tsw-coop (sync), anyone (stats, sounds).
#[derive(Serialize, Deserialize, tsw_sdk::Event)]
#[event(name = "tsw-jump.jumped", version = 1)]
pub struct Jumped { pub far: [f64; 3] }

pub struct Jump {
    enabled: Setting<bool>,
    key: Binding,
    can_jump: Func,  // ACharacter::CanJump -> bool
    jump: Func,      // ACharacter::Jump
}

impl Plugin for Jump {
    fn on_start(sdk: &Sdk) -> Result<Self> {
        let enabled = sdk.settings().toggle("enabled", "Jump on Space (photo mode moves to O)", true)?;
        let me = Self {
            key: sdk.input().bind("jump", Key::SpaceBar, "Jump")?,
            can_jump: sdk.engine().func("/Script/Engine.Character:CanJump", &[])?,
            jump: sdk.engine().func("/Script/Engine.Character:Jump", &[])?,
            enabled,
        };
        me.apply(sdk);
        Ok(me)
    }

    fn on_setting(&mut self, sdk: &Sdk, _key: &str) { self.apply(sdk); }

    fn on_key(&mut self, sdk: &Sdk, action: &str, edge: Edge) {
        if action != "jump" || edge != Edge::Pressed || !self.enabled.get() { return; }
        let Some(pawn) = sdk.game().pawn() else { return };
        if self.can_jump.call::<bool>(pawn, ()).unwrap_or(false) && self.jump.call_void(pawn, ()) {
            let far = sdk.game().far_location(pawn).unwrap_or_default();
            sdk.bus().emit(&Jumped { far });
        }
    }
}

impl Jump {
    /// Photo mode off Space while jumping is on; the SDK undoes the remap when we stop.
    fn apply(&self, sdk: &Sdk) {
        let on = self.enabled.get();
        self.key.set_active(on);
        sdk.input().remap_action("PhotoMode", if on { (Key::SpaceBar, Key::O) } else { (Key::O, Key::SpaceBar) });
        sdk.state().publish("tsw-jump.enabled/1", &on);
    }
}

tsw_sdk::export_plugin!(Jump, manifest = "plugin.toml");
```

### 7.2 Lua (same behaviour; `plugin.toml` with `kind = "lua"`, `entry = "main.lua"`)

```lua
local tsw = require("tsw")

local enabled  = tsw.settings.bool("enabled", "Jump on Space (photo mode moves to O)", true)
local can_jump = tsw.engine.func("/Script/Engine.Character:CanJump")
local jump     = tsw.engine.func("/Script/Engine.Character:Jump")

local function apply()
  local on = enabled:get()
  tsw.input.remap_action("PhotoMode", on and "SpaceBar" or "O", on and "O" or "SpaceBar")
  tsw.state.publish("tsw-jump.enabled/1", on)
end

tsw.input.bind("jump", "SpaceBar", "Jump", function(edge)
  if edge ~= "pressed" or not enabled:get() then return end
  local pawn = tsw.game.pawn()
  if pawn and can_jump(pawn) then
    jump(pawn)
    tsw.bus.emit("tsw-jump.jumped/1", { far = tsw.game.far_location(pawn) })
  end
end)

enabled:on_change(apply)
apply()
```

### 7.3 How tsw-coop consumes it

Today coop infers a jump from vertical speed ≥ 250 cm/s (`avatar_msg.rs:12-21`), which also fires
when a player falls off a platform. With tsw-jump:

```rust
// tsw-coop, on_start
if sdk.plugins().get("tsw-jump").is_some_and(|p| p.started() && p.version.major == 1) {
    // Exact jump moments instead of the vertical-speed guess; sent at once, not with the next 10 Hz capture.
    sdk.bus().subscribe::<tsw_jump_api::Jumped>(|coop: &mut Coop, _sdk, ev| coop.net.send_event("jump", json!({ "far": ev.far })))?;
    sdk.state().watch::<bool>("tsw-jump.enabled/1", |coop: &mut Coop, _sdk, on| coop.announce_jump(on))?;
}
// on_plugin_state("tsw-jump", Disabled | Failed) → drop the subscription, fall back to vertical speed.
```

- **Without tsw-jump:** coop behaves as today. Nobody jumps locally, and the vertical-speed pose still covers falls.
- **Remote side:** with tsw-jump's `[multiplayer] sync = "announce"`, peers learn from the `hello` who has it. A receiving coop plays the jump pose on the `jump` event, whether or not tsw-jump is installed there; only *doing* a jump needs the plugin.
- **Session rule:** if a host wants "no jumping in my session", that is a coop session setting. It calls `bus.call("tsw-jump.control/1", "set_enabled", false)` on guests that have it.

---

## 8. Repositories, releases, CI, docs

### 8.1 Repositories (`github.com/tsw-plugins`)

The DayZ ecosystem is one repo per plugin, with the SDK as a sibling path dependency, no tags and
no CI files. We keep the repo split and add tags and releases.

| Repo | Contents |
| --- | --- |
| `tsw-sdk` | Workspace `crates/{tsw-sdk-abi, tsw-sdk, tsw-sdk-macros, tsw-sdk-host}`; `data/`, `assets/`, `lua/tsw.d.lua`; `examples/{hello-rust, hello-lua}`; `tools/tswsdk` (CLI that replaces `devapi.sh`, `install-tswcoop` and `tswwait`: install, list, pack a plugin zip, validate a manifest, dev API calls); `scripts/build.sh` (the gate: fmt, clippy pedantic, tests, Wine tests, doc, release). README.md + AGENTS.md only. |
| `tsw-coop` | `server/` (unchanged), `plugin/` (today's `mod/native` minus the SDK), `core/` (`tswcoop_core` without FFI), `site/` until the browser moves to the docs site |
| `tsw-jump` | The plugin (Rust), `lua/` variant as a sample, `tsw-jump-api` types crate |
| `tsw-mp` | future; links the shared `tsw-world-kit` crate (ghosts, avatars) |
| `tsw-plugins.github.io` | all docs and research (8.3) |
| maybe `tsw-devtools` | Lua plugin from `TswCoopDebug` (drive, spawn, play), dev only |

Plugins depend on the SDK by git tag (`tag = "v1.2.0"`). For local work, a `[patch]` in an
uncommitted `.cargo/config.toml` points at the sibling checkout. crates.io comes later, once the
ABI is 1.0 (question 5).

### 8.2 Releases and CI

Builds run locally in the `build-box` container, the same as today's `mod/native/build.sh`.

| Artifact | Contents |
| --- | --- |
| `tsw-sdk-<ver>-win64.zip` | `dwmapi.dll`, `tsw/{assets,data,lua}`, `tsw/sdk.toml.example`, `install.bat` (`rundll32 dwmapi.dll,Install`), `install-tsw.sh` (Proton: `WINEDLLOVERRIDES="dwmapi=n,b"`) |
| `<plugin>-<ver>.zip` | `tsw/plugins/<id>/…`; unzip into `Win64/` |
| `tsw-coop-<ver>-bundle.zip` | SDK and coop, for one-step installs |

Published with `gh release create` from the local machine.

Workflows exist for forks and for manual runs. Only `workflow_dispatch` is live (the
CLAUDE.md rule; tsw-coop's `.github/workflows/lua.yml:3-12` is the template):

```yaml
name: Release build
on:
  # The only live trigger: run by hand from the Actions tab.
  workflow_dispatch:
    inputs:
      version: { description: "Version to build (tag)", required: true }
  # Disabled: workflows do not run under this account (jobs queue and are never picked up).
  # Uncomment if you fork this repository under an account where Actions run.
  # push:
  #   tags: ["v*"]
  # pull_request:
permissions:
  contents: write
```

No branch protection or required checks depend on a workflow. GitHub Pages for the docs site
uses "deploy from branch", which works under the account.

### 8.3 Docs site (`tsw-plugins.github.io`)

This follows `dayz-plugins.github.io`:

- plain Markdown with YAML front matter (`name`, `description`, `game_build`, `created`, `last_edited`, plus `status` on design docs)
- rendered by Pages' built-in Jekyll, with no generator workflow
- research pages state the game build they were verified on

```
index.md                      what this is, install, plugin list
install.md                    SDK + plugins, Windows and Linux/Proton, uninstall, safe mode
plugins/
  tsw-sdk.md  tsw-jump.md  tsw-mp.md
  tsw-coop/   index.md  features.md (docs/features.md)  protocol.md (07, 09)  architecture.md (03)  roadmap.md (04)
sdk/
  guide/rust.md  guide/lua.md  guide/manifest.md  guide/events-and-state.md  guide/ui-and-menus.md
  guide/multiplayer.md  guide/testing.md (mock host, Wine tests, dev API)
  reference/events.md  reference/functions.md  reference/abi.md (C ABI for other languages)  reference/lua.md
  changelog.md
api/rust/latest/ …            rustdoc of tsw-sdk + tsw-sdk-abi, built locally (cargo doc --no-deps) and committed
api/rust/<ver>/ …             one folder per released ABI minor
api/lua/tsw.d.lua             the LuaLS stub, downloadable
design/                       status: proposal | accepted | implemented | superseded
  README.md  tsw-sdk.md (this file)  tsw-coop-concept.md (08)  native-menus.md
research/                     README.md index + every docs/research/*.md + 05-tsw-internals, 01, 02, 06; img/
```

**Moving the docs.** Docs move once the SDK repo exists (step 8 of 9):

- `docs/` of tsw-coop is copied into the site repo, with the history kept by `git filter-repo --path docs/` into a branch that is merged there.
- Relative links are rewritten to the tree above.
- tsw-coop's `docs/` is deleted, and its `AGENTS.md` and `README.md` link to the site.
- New research goes straight into a local checkout of the site repo (`/run/media/system/Data/Projects/tsw-plugins/tsw-plugins.github.io`), as the DayZ agents do.
- Until then, `docs/research/` in tsw-coop stays authoritative.

---

## 9. Migration plan

**Progress (2026-10-18).** The owner asked for the repo split right away, so step 8's layout came
first and step 1 happened across repos instead of inside tsw-coop. Local checkouts sit side by side
in `Projects/tsw-plugins/` (`tsw-sdk`, `tsw-coop`, `tsw-jump`, `tsw-mp`, `tsw-plugins.github.io`),
with each repo's `origin` set to the org but nothing pushed.

| Step | Status |
| --- | --- |
| 1 | Done, with the modules in the `tsw-sdk` repo (`crates/tsw-sdk-host`, an rlib) rather than a `sdk/` workspace inside tsw-coop. tsw-coop links it by relative path. `sys/proxy.rs` and `sys/shell.rs` (DLL entry and link handler) stay in tsw-coop. Gates pass: tsw-coop 68 Wine tests, SDK 14, jump 2. The in-game log matches: scan, tick, menu badge. |
| 4 (part) | `jump.rs` is the `tsw-jump` crate on the SDK's API, still linked into tsw-coop. There is no plugin loader yet. |
| 6 | Done: the C++ shim, probe, C ABI and header were removed (tsw-coop `4081acf`). |
| 8 | Repos split without `filter-repo`: the moved files carry a pointer to their source commit. The docs moved with history (`git filter-branch`). Coop still uses path dependencies, not tags. |
| 3 (part) | The plugin indicator and the Plugins screen exist (native-menus "Seen in game"). Plugin management is not built yet. |

Each step ends in a state that ships and is tested. "In game" means the existing checks: `tswup`,
`devapi.sh` (key, console, shot), crowd bots, the hosted-session test (`docs/research/hosted-session-test.md`).

| # | Step | Done when |
| --- | --- | --- |
| 0 | **Spikes** (throwaway branches):<br>a) `mlua` vendored for `x86_64-pc-windows-msvc` with xwin/clang-cl, loaded in the Wine test harness;<br>b) a second Rust `cdylib` loaded by the dwmapi.dll, calling back through a function table, with a panic and an access violation in a callback both contained;<br>c) `IsHovered`/`IsPressed` polling on a UMG button on the main menu;<br>d) `FreeLibrary` of a thread-free Rust `cdylib` under Proton. | Each answers yes or no and is written to `docs/research/`. A "no" on (a) means Lua waits or uses another embedding; a "no" on (b) means using `catch_unwind` only on the GNU target, as DayZ notes. |
| 1 | **Split inside tsw-coop, no ABI yet:** new workspace `sdk/` with `tsw-sdk-host` as an **rlib**. Move `sys/`, `log.rs`, `umg.rs`, `toast.rs`, `skip_intro.rs`, `crashes.rs`, `dev.rs`, `game_info.rs`, `profile.rs`, and the controller lookup from `capture.rs`. `mod/native` depends on it statically. | All unit, Wine and `mod_assets` tests pass; the in-game log matches (scan, tick hook, toasts, F9 menu, scoreboard, menu badge). |
| 2 | **ABI and loader:** add `tsw-sdk-abi` and `tsw-sdk`. The host becomes the `dwmapi` cdylib with discovery, manifest, order, guards and the `tsw/` layout. Coop becomes `tsw/plugins/tsw-coop/tsw_coop.dll`, using the wrapper for everything engine-related (engine, game, input, ui, web, platform, all needed for coop's ~45 modules). | Hosted session with 7 bots behaves exactly as before; a deliberately panicking test plugin is disabled and the game keeps running. |
| 3 | **SDK services:** settings API with migration of the flag files and `tswcoop.cfg` location; key registry; journal events; menu API (port `menu.rs` rows: coop rows → coop menu, skip-intro and FPS → SDK page); indicator and Plugins screen (keyboard first, mouse after spike 0c); dev API and web route mounting with redirects for old paths. | Toggling coop off in the Plugins screen removes its HUD, menus, keys and routes live; the next start does not load it. |
| 4 | **tsw-jump out:** `jump.rs` becomes the plugin (7.1). Coop subscribes to it (7.3); the coop menu loses the jump row. | Test matrix: coop+jump, coop alone, jump alone, jump disabled at run time; with bots and in game. |
| 5 | **Lua host:** the `tsw` module, `tsw.d.lua`, `POST /dev/lua`; the Lua jump sample (7.2); `tsw-devtools` from `TswCoopDebug`. | The Lua jump plugin behaves identically to the Rust one; reload of a Lua plugin from the Plugins screen. |
| 6 | **Remove C++:** delete `mod/shim/`, `mod/core/src/ffi.rs` and `include/`, the C++ toolchain scripts and unused `external/` submodules; update `08-concept.md` row "Mod language". | `git grep -l '\.cpp\|\.hpp'` finds nothing of ours; the build gate passes. |
| 7 | **Installer:** `rundll32 dwmapi.dll,Install` installs the SDK and migrates an old tsw-coop install (old `dwmapi.dll`, flag files, `tswcoop/` assets → `tsw/plugins/tsw-coop/assets`); `install-tsw.sh` for Proton; the `tswcoop://` scheme is re-registered through the SDK. | A clean Windows install (open since `features.md:103`) and an upgrade over today's install both work. |
| 8 | **Repo split:** `git filter-repo` `sdk/` → `tsw-plugins/tsw-sdk`; jump → `tsw-jump`; docs → site (8.3); coop depends on the SDK by tag. | Each repo builds alone from a clean clone; the site renders. |
| 9 | **SDK 1.0:** freeze ABI 1.0 after coop, jump (Rust and Lua) and devtools run on it. | Release zips published; rustdoc on the site. |

### Risks

| Risk | Mitigation |
| --- | --- |
| A panic or fault crossing the C ABI aborts the game | Guard macro on every export and callback (2.6), a test plugin that panics and faults in every callback, part of the Wine test suite |
| `ObjRef` misuse after a world change (GC) | `Held` semantics enforced by the SDK on every call; `world_unloaded` event; the SDK's own `instances_of` cache is cleared per world |
| Performance: N plugins each walking `GUObjectArray` (~20 ms per walk, `docs/research/performance.md`) | The SDK owns walks: per-frame controller/pawn, per-world instance caches, batched `find_many`, budgeted iteration; the dev API reports each plugin's tick time |
| Proton refuses static imports of extra system DLLs (`http.rs:1-6`) | SDK build check on the import table of `dwmapi.dll`; plugins are loaded later by `LoadLibrary`, verify in spike 0b that their imports are fine |
| Vendored C (Lua, `microseh`'s stub) in the cross build | Spike 0a; pin versions; fall back to `catch_unwind` only if SEH cannot be built |
| Coop is large and touches everything: step 2 is big | Step 1 first (no ABI) so step 2 is mostly mechanical: the wrapper mirrors today's `sys` exports (`sys/mod.rs:17-38`) one to one |
| Two copies of std/allocator per DLL (size, globals) | Expected and fine; never free across the boundary; no Rust types in the ABI |
| Hotkey clashes between plugins | Key registry with conflict detection and rebinding UI |
| Hot reload of Rust plugins crashes on threads/TLS | Opt-in, dev only, `ThreadSet` joined in `on_stop`; production uses next-start semantics |
| Native menu injection breaks with game updates | The menu API is declarative; the overlay renderer stays as fallback; `has_feature` reports which one is active |
| ABI churn early on | Stay at 0.x (exact-match minor) until step 9, then 1.0 with append-only minors |

---

## 10. Open questions for the owner

1. **Folder name:** `Win64/tsw/` (proposed) or something else, for example `tsw-plugins/`?
2. **Indicator header:** in production UE4SS is absent. Show "TSW SDK v{ver} ({build_date})" as the first line then, as proposed?
3. **Lua in production:** the brief says Lua is for development and debugging only, but also that other mods may be Lua. Proposal: Lua plugins are allowed in production because the SDK embeds Lua. Is that the intent?
4. **Vendored C:** is vendored third-party C compiled by cargo acceptable under "no C/C++"? That means Lua 5.4 through `mlua`, and `microseh`'s SEH stub. Without them, Lua needs a pure-Rust VM (not ready) and faults can't be caught.
5. **SDK crate distribution:** git tags only, or publish `tsw-sdk`/`tsw-sdk-abi` on crates.io after 1.0?
6. **Licence of the SDK:** MIT like tsw-coop?
7. **Rust plugin toggling:** is "takes effect at the next start" (plus an immediate soft disable) acceptable for Rust plugins?
8. **Session compatibility:** should coop require matching versions of `must-match` plugins, or only announce plugins and adapt?
9. **Trust:** plugins are native code with full rights. Is any signing or allow-list wanted for third-party plugins, or is a warning on first load enough?
10. **Code shared by coop and mp:** ghost trains and avatars. Proposal: a `tsw-world-kit` crate (static Rust dependency). It could live in tsw-coop, in its own repo, or as SDK services instead.
11. **Org state:** `gh repo list tsw-plugins` currently shows only `tsw-plugins.github.io` (public). Are `tsw-sdk`, `tsw-coop`, `tsw-mp` and `tsw-jump` private or not created yet? And does tsw-coop's release home move from `github.com/Bluscream/tsw-coop` (`08-concept.md:35`) to the org?
