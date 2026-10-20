---
name: tsw-research-index
description: >-
  Index of the Train Sim World 7 research notes: the game's internals, interfaces into the running game, driving trains from code, UE4SS pitfalls, sessions, avatars, ghosts, performance, plus the early studies (loader comparison, prior art, community findings).
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-17T11:59+0200
last_edited: 2026-10-20T23:10+0200
---

# Research notes ("Erkenntnisse")

Findings about the game, UE4SS and our tooling, written down as they are made. One topic per file;
each finding says how it was verified and when. Older, chronological notes live in
[`../05-tsw-internals.md`](05-tsw-internals.md); new findings go here.

| File | Topic |
| :--- | :--- |
| [driving-trains.md](driving-trains.md) | Getting a train from any state to moving in code: what blocks it, the `drive` toolkit, per-class recipes |
| [debug-ui.md](debug-ui.md) | Options for an in-game debug UI: game notifications, a runtime UMG menu from Lua, the UE4SS ImGui window, cooked widget paks (research only, not yet tried) |
| [performance.md](performance.md) | Slow motion with 662 vehicles: `TswCoop` telemetry and the UE4SS GUI console, measured; capture cut from ~95 ms to ~5.5 ms and re-enabled, GUI console stays off |
| [interfaces.md](interfaces.md) | Every interface into the running game (Lua, hooks, DTG HTTP API, VirtualRailDriver, virtual pad), tested side by side; recommendations for tests and co-op |
| [ue4ss-lua-pitfalls.md](ue4ss-lua-pitfalls.md) | UE4SS Lua rules that crash the game when broken: threads, NULL object wrappers, timers |
| [hosted-session-test.md](hosted-session-test.md) | First in-game hosted session with 7 bots: what works (GeoIP flags, name tags, TAB scoreboard, menu badge, server log), four bugs found and fixed, the GC rule for cached objects |
| [developer-functions.md](developer-functions.md) | Is there a built-in "make train ready"? Presets, AI service setup, cheats, simple controls |
| [session-discovery.md](session-discovery.md) | Hosted sessions: invite and short codes, public listing and master, querying hosts, the session browser, port mapping |
| [remote-driving.md](remote-driving.md) | A guest drives the host's train: seat and lever messages, applying values on the host, verified in game |
| [ghosts-native.md](ghosts-native.md) | Ghost trains from the Rust DLL: what the host sends, spawning options, the view-actor ghosts that were built |
| [train-copies.md](train-copies.md) | Real copies of the host's trains on a guest (G3): spawning at a track position, kinematic trains steered by the mod, what boarding does |
| [avatars.md](avatars.md) | Bodies for other players: a plain Character dressed from the modular character meshes, animation assets |
| [other-editions.md](other-editions.md) | Train Sim World 5: everything loads and works; what differed (menu look, Steamworks 1.47, hard-coded "7"s) and the fixes |
| [game-state-journal.md](game-state-journal.md) | The game state journal and crash reports, and the start-up skip |
| [timetable-and-map.md](timetable-and-map.md) | The player's service (stops, times, platforms, positions), the signal and speed limit ahead, the route's stations for a map: what is reachable, tsw-sdk's `timetable` reader |
| [progression.md](progression.md) | Where tutorial, task, mission and completion progress lives; tsw-unlock's buttons |
| [mod-sync.md](mod-sync.md) | Bringing guests the host's mod version, config and data-only content (liveries) |
| [ue4ss-cpp-toolchain.md](ue4ss-cpp-toolchain.md) | Historical: building a UE4SS C++ mod on Linux without MSVC |
| [05-tsw-internals.md](05-tsw-internals.md) | Chronological answers from the build 886 dump and the early Lua experiments |
| [01-source-comparison.md](01-source-comparison.md) | UE4SS vs UEVR's framework as the base for the loader |
| [02-prior-art.md](02-prior-art.md) | Existing TSW mods, the TSW-specific UE4SS fork, DTG's official HTTP API, ThirdRails |
| [06-discord-flat2vr-tsw7-thread.md](06-discord-flat2vr-tsw7-thread.md) | Community findings from the Flat2VR "train sim world 7" thread |

The native menu research became a design document: [design/native-menus.md](../design/native-menus.md).

Tooling referenced throughout:

| Command | What it does |
| :--- | :--- |
| `tswup [A\|B\|C\|path]` | One step towards "game running, scenario loaded" per call (launch, wait, load); exit 0 when there |
| `tswcmd drive diag [json]` | Everything that matters for driving the current train, with a verdict |
| `tswcmd drive ready [filter]` | Any state to drivable (boards a train matching `filter` first) |
| `tswcmd drive go [filter] [power]` | `ready`, then power |
| `tswcmd drive stop` | Cancel all running drive sequences, release held controls |
| `tswlua '<lua>'` | Run Lua on the game thread through the bridge |
| `scripts/lint-lua` | Lua gate: `luac5.4 -p`, `luacheck`, offline tests (fake UE4SS, virtual clock) |
