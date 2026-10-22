---
name: tsw-research-index
description: >-
  Index of the Train Sim World 7 research notes: the game's internals, interfaces into the running game, driving trains from code, UE4SS pitfalls, sessions, avatars, ghosts, performance, plus the early studies (loader comparison, prior art, community findings).
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-17T11:59+0200
last_edited: 2026-10-22T10:50+0200
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
| [safety-systems-and-hud.md](safety-systems-and-hud.md) | PZB 90 and Sifa as the game implements them (decompiled), the HUD interface every train has (tractive force, traction lock, gauges), timetable departure times and stop positions, the game's AI driver |
| [timetable-and-map.md](timetable-and-map.md) | The player's service (stops, times, platforms, positions), the signal and speed limit ahead, the route's stations for a map: what is reachable, tsw-sdk's `timetable` reader |
| [ebula.md](ebula.md) | EBuLa, the German cab timetable display: the real system and Ril 408, other simulators and fan tools, how TSW 7 implements its EbuLa screens (decompiled) |
| [ebula-real-screens.md](ebula-real-screens.md) | What real EBuLa screens look like (two in-cab photos on Wikimedia Commons, the 1982 printout): header, columns, how signals, stations and times are written, what is never shown; the reference for tsw-ebula's default look |
| [ebula-signal-kinds.md](ebula-signal-kinds.md) | Telling Esig, Asig, Zsig, Bksig and Sbk apart for the EBuLa: the driver aid's found signals, `UNetworkSignalProperty` ids, plates and types, how Frankfurt S-Bahn names its signals, the classification rules and their confidence |
| [ready-any-train.md](ready-any-train.md) | Readying any train from code: a survey of every TSW 7 train's controls, control families and named positions, the class-independent ready loop, results per class |
| [traction-locks.md](traction-locks.md) | Why power gives no force: the latched traction locks of the BR 110 (simulation graph), BR 143 (AFB speed selector) and Class 323, the native converter gates, start sequences (decompiled) |
| [br430-traction.md](br430-traction.md) | The FSN BR 430 (and BR 423/433): combined brake/power MasterController with neutral at 0.5, the 2.1 bar holding brake at a stand, the `LockManager_C` traction lock that latches until neutral, what "Traktion gesperrt" shows (decompiled) |
| [fsn-push-pull-traction.md](fsn-push-pull-traction.md) | The FSN BR 143 + Dosto cab car push-pull: the cab car's own traction lock (latches with the Throttle at 0.0), its Throttle as a force demand, what the loco checks, the sequence after a change of ends (decompiled) |
| [train-max-speed.md](train-max-speed.md) | A train's own maximum speed: `RailVehicleDefinition.MaximumSpeed` through `CreatedFromPtr`, why the game's formation/service limits are not it, the tsw-sdk reader (decompiled) |
| [br143-drag-and-battery.md](br143-drag-and-battery.md) | The FSN BR 143's 0.8 bar residual brake (an overcharged distributor control reservoir in its simulation preset, the native charging-valve rule) and its five-position battery switch (on at 0.25/0.75) (decompiled) |
| [direct-brake.md](direct-brake.md) | The loco's own brake (direct/independent, "Zusatzbremse"): the BR 143's non-self-lapping valve per cab and its double check valve, which trains have one under which name, staying vs sprung release levers, how readying releases it (decompiled survey) |
| [brake-fill-positions.md](brake-fill-positions.md) | Which trains have a fill position below running (German/European valves) and which do not (EP EMUs, US 26L, vacuum), and how each releases standing brake drag (decompiled survey) |
| [timetable-mode-start.md](timetable-mode-start.md) | Starting timetable mode with a chosen service from code: the drive-mode settings the menu writes, the native conditions at world start, the start card that pauses the game |
| [native-code.md](native-code.md) | Reading the game's code: blueprint decompiling (repak, kdecomp) and headless Ghidra; the simulation graph API, lever ticks, brake valves, traction gates, native Sifa, the AI driver's target speed; rea ruled out |
| [dtg-http-api.md](dtg-http-api.md) | Dovetail's HTTP API reference: routes, nodes, writes, function calls, VirtualRailDriver, subscriptions, measured latency, the RailDriver path behind it |
| [community-tools.md](community-tools.md) | Community tools that read or drive TSW from outside (maps, controller bridges, Arduino cabs, RailDriver DLL replacements, UE4SS mods) and what they learned |
| [input-injection.md](input-injection.md) | How player input reaches cab controls, injecting input in the process, letting the game do the work (AI takeover, presets), OS-level input under Proton/Wayland |
| [connectivity.md](connectivity.md) | Background for hosted sessions: NAT traversal and success rates, iroh in detail, server query and listing protocols, browser limits, OpenOMSI's implementation |
| [pure-rust-game-dll.md](pure-rust-game-dll.md) | Can a UE4SS mod be Rust only? Options, existing projects, effort; the study behind the pure-Rust game DLL |
| [scenarios.md](scenarios.md) | How scenarios are built (objective actions, composer, failures), the scripted events of the 29 installed scenarios, the random fault system, and what tsw-autopilot needs to complete them |
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
