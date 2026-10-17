# Game slowdown from our mods and the UE4SS console (2026-10-17)

## Symptom

On the Frankfurt S-Bahn DLC with the reduced timetable loaded (`S-bahnTimetable_Reduced`, 662
rail vehicles) the game ran in slow motion. Lowering the graphics settings did not help.

## Measurements

The game time against real time comes from `GetTimeSeconds` and `GetRealTimeSeconds`, each read
twice about 10 s apart. Frame time comes from `GetWorldDeltaSeconds`, which the engine clamps to
50 ms. Thread load comes from `top -H`.

| Setup | Game speed | Threads |
| --- | --- | --- |
| `TswCoop` telemetry on, UE4SS GUI console visible, timetable | **34 %** (real frames ~150 ms) | game thread 100 %, a second thread 100 % since launch, GPU 6 % |
| both off, Free Roam (0 vehicles) | 100 % | — |
| both off, same timetable | **96 %** (16–50 ms frames) | game thread ~95 %, second hot thread gone, GPU 23 % |

The GPU sat nearly idle the whole time, so the game is limited by its game thread. Graphics
settings cannot fix that.

Two suspects were switched off together, so their shares are not separated:

- **`TswCoop` C++ telemetry.** `mod/shim/capture.hpp` runs on the game thread through the
  engine-tick hook, up to 10 times a second. Each capture does three things:
  - `FindAllOf("RailVehicle")`, which walks the whole UObject array.
  - Per vehicle: two property lookups by name, four UFunction calls and a class-name string.
  - JSON for every vehicle. Lines grew from 465 B to about 136 KB once the timetable loaded.

  Under load it managed only 3.3 lines a second. The same work timed from Lua took 48 ms for
  `FindAllOf` and 15 ms for the per-vehicle reads; the C++ version is faster, but it is still a
  large share of each frame.
- **UE4SS GUI console** (`GuiConsoleEnabled`/`GuiConsoleVisible`, dx11 ImGui, `RenderMode =
  ExternalThread`). Its thread ran at 100 % from launch, even in the menus, and it disappeared when
  the console was disabled. It draws the whole log, which our probes had made very large.

## Fix: a cheaper capture (re-enabled 14:20)

The slow parts moved off the game thread or were turned into one-time work
(`mod/shim/capture.hpp`, `mod/core/src/writer.rs`):

- **Vehicle list.** The list is kept between captures, with each vehicle held as an
  `FWeakObjectPtr`. Dead vehicles drop out on the next capture. New ones come from a sweep of
  one tenth of the UObject array per capture, so the whole array is covered every second. A full
  sweep runs only when the player controller changes, which means a new world. `FindAllOf` is
  gone.
- **Property offsets.** `RailVehiclePhysicsComponent` and `RailVehicleID` offsets are resolved
  once through `FindProperty`, then read directly. Each vehicle's class name is stored when the
  vehicle is found.
- **Fewer calls per vehicle.** Three UFunction calls per vehicle instead of four. Forward speed is
  `dot(velocity, forward)`, which matched `GetForwardsVelocity` exactly on 188 moving vehicles.
- **Writer thread.** JSON and file I/O run on a writer thread behind an 8-frame queue. A full
  queue drops the frame instead of blocking the game.
- **Cost log.** The Rust core logs the game-thread cost every 100 captures:
  `[TswCoop] capture cost over 100 captures: avg X ms, max Y ms (N vehicles)`.

Measured with the same timetable (Frankfurt S-Bahn reduced, 662 vehicles), the UE4SS GUI console
still off:

| Build | Cost per capture | Game speed |
| --- | --- | --- |
| old, main menu (0 vehicles) | ~10 ms | — |
| new, main menu (0 vehicles) | 0.55 ms avg, 1.2 ms max | — |
| old, timetable | 91–101 ms | 34 % (GUI console also on) |
| new, timetable | **5.0–6.0 ms avg**, 9–12 ms max | **86–89 %** (96 % with telemetry off) |

The ~5 ms left is about 2000 UFunction calls (`GetPosition`, `GetForwardVector`, `GetVelocity`
for each vehicle). If the remaining 7–10 % matters, the next steps are:

- Read those values from the components' fields instead of calling the functions.
- Capture distant vehicles less often.

## Current state

- `Mods/mods.txt`: `TswCoop : 1`, with the build described above.
- `UE4SS-settings.ini`: `GuiConsoleEnabled = 0`, `GuiConsoleVisible = 0`. Leave the console off:
  it costs a full core even in the menus. Read `UE4SS.log` instead.

## Vanilla against modded, same start (14:38–14:45)

Frankfurt–Fulda full timetable, Fahrplan, on foot at Frankfurt Hbf, 10:00, 64/64 layers. The
session runs about 1600 rail vehicles. Game speed is measured without UE4SS through the DTG
HTTP API: the `TimeOfDay.Data` `LocalTime` advance divided by wall-clock time over 20 s
(`gamespeed.sh` in the session scratchpad; it agrees with the Lua `GetTimeSeconds` measure to
1 %).

| Setup | Game speed (3 × 20 s) |
| --- | --- |
| no UE4SS (`dwmapi.dll` renamed) | 90 %, 100 %, 100 % |
| UE4SS with every mod we had enabled | 51 %, 52 %, 52 % |

The telemetry capture costs 7.5–8 ms at 10 Hz here (it stops at 1024 vehicles), which is about
8 % of the game thread. The other ~40 % is UE4SS or another mod (bisect below).

## Bisect: the cost is TswCoopDebug's polling (15:00–15:40)

Same start as above, measured from 180 s after Play, 30 s samples:

| Setup | Game speed |
| --- | --- |
| no UE4SS | 100, 100, 100, 100, 100 |
| UE4SS, no mods, `HookAActorTick`/`HookProcessInternal`/`HookProcessLocalScriptFunction` = 0 (two sessions) | 100, 100, 100 / 100, 100, 100, 100, 100 |
| UE4SS + TswCoopDebug only, same hooks off | 61, 62, 59, 63, 64 |
| the same with the fix below (`102afe6`) | 100, 100, 100, 100, 100 |
| UE4SS + every mod | 51, 52, 52 |

UE4SS itself costs nothing measurable. TswCoopDebug alone costs ~40 %.

**Cause.** `pc()` in `main.lua` was `FindFirstOf("PlayerController")`. `FindFirstOf` walks the
whole `GUObjectArray`, and with ~1600 rail vehicles plus their components that is hundreds of
thousands of objects. Two 30 ms polls (`Menu.poll` for the menu keys and `Jump.poll`) called it
every time: about 66 full object-array walks a second on the game thread.

**Fix.** `cached.lua` keeps the found object while `IsValid()` holds and, while there is none,
searches at most once a second (`mod-lua/tests/test_cached.lua`). Rule for every future poll:
never call `FindFirstOf`/`FindAllOf` per frame or per poll; cache, and re-find only when the
cached object goes invalid.

## Rust DLL without UE4SS's mod API (15:38–15:47)

`mod/native` (pure-Rust `dwmapi.dll`, UE4SS chain-loaded, TswCoopDebug only), same start:

- Game speed 100, 100, 100, 100, 100 %; 61 fps game time.
- Its census counts **1607** `RailVehicle`s, the same number the Lua `status` reports, among
  ~425 000 live objects. One full walk with an `is_a` per object takes **18–21 ms** (2 ms in the
  menu, 50 000 objects).

So a single object-array walk is a whole frame's budget in a heavy session: this is the scale of
what `FindFirstOf` cost per poll. The Rust capture must find vehicles once and keep them, never
walk per capture.

## Community reports on TSW performance under Linux (researched 2026-10-17)

No report anywhere describes a Proton, DXVK/VKD3D or Engine.ini tweak that fixes a slowdown
from heavy AI load. Sources: ProtonDB (TSW7 Gold, 9 reports; snippets only), Steam
discussions, Dovetail forums and support pages, Reddit, and GitHub issues for Proton, DXVK and
VKD3D.

What has evidence behind it, all of it about AI load on the CPU:

- **Fewer timetable layers, and no AI substitutions.** Dovetail's optimisation article and its
  settings guide name the LAYERS button and the three substitution toggles under Advanced
  Settings. "Enable All Timetable Layers" adds AI.
  - https://support.dovetailgames.com/hc/en-us/articles/28572832051218
  - https://support.dovetailgames.com/hc/en-us/articles/28572764655122-Train-Sim-World-Settings-Explained
- **Reduced timetables.** Dovetail added them in 2026 for CPU-bound players: the TSW6 May patch
  and WCML Crewe–Preston. An optimisation-focused TSW7 update is announced for October 2026.
  - https://live.trainsimworld.com/news/train-sim-world-6-update-notes-may-28th-2026
  - https://live.dovetailgames.com/news/train-sim-world-7-roadmap-october-2026

Weak or anecdotal:

- **`-dx12`.** DX12 is already the default since TSW4, and one Linux user saw no benefit.
- **`game-performance`/gamemode.** This is a CachyOS helper, mentioned on ProtonDB for TSW6.
- **Proton version.** Stock, Experimental and GE all work, and none is reported to be faster.
- **Graphics-only Engine.ini presets.** Some of them cause bugs.
- **`ts2.passenger.DensityScale`.** It scales station passengers; one report says the effect
  is very small.
- **Not mentioned at all for TSW:** DXVK_ASYNC, ntsync/fsync, CPU affinity.

Conclusion: our mods cost far more than any Proton-side tweak could recover. The in-game levers
are layers, substitutions and the reduced timetables.
