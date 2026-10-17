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

## Current state

- `Mods/mods.txt`: `TswCoop : 0`.
- `UE4SS-settings.ini`: `GuiConsoleEnabled = 0`, `GuiConsoleVisible = 0`.
- Logs still go to `UE4SS.log`, and `tswcmd`/`tswlua` are unaffected.

## Before re-enabling telemetry

The capture must cost far less with hundreds of vehicles:

- Cache the `RailVehicle` list instead of calling `FindAllOf` on every capture.
- Resolve the property offsets once, not by name per vehicle.
- Cache the class names.
- Consider capturing only vehicles near the player, or the player's consist plus a slower sweep.

Measure with the timetable above: game speed should stay near 100 %.
