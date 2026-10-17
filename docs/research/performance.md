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
