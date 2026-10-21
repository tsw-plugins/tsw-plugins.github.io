---
name: tsw-autopilot
description: >-
  tsw-autopilot: a uniloader plugin that drives the player's train by itself (timetable, signals, speed limits, stops, doors) through the game's own controls, and hands back on any manual input. Design, controller, what it reads from the game, tests, and what is still to verify in game.
game_build: 886 (TSW 7, Steam build 25890949)
status: implemented
created: 2026-10-20T23:40+0200
last_edited: 2026-10-20T23:40+0200
---

# tsw-autopilot (2026-10-20)

> **Implemented, not yet run in game.** Code: `tsw-plugins/tsw-autopilot` (local repository,
> not published yet), the shared driving code in tsw-sdk `crates/tsw-sdk-host/src/cab/`. The
> controller is unit-tested, including whole runs against a simulated train; every game read
> it relies on resolves by name from reflection, but the values marked *unverified* below have
> not been looked at on a running route. [In-game status](#in-game-status) lists what to test.

## Goal

While the player switches it on, the autopilot drives the player's train over the whole route:

- departs when the timetable allows: the scheduled departure has come and the doors are locked;
- drives to the next stop and stops at its platform;
- obeys the signal ahead (aspect and distance) and the speed limits, the one in force and those
  ahead, braking in time for each;
- works the reverser, power and train brake through the game's own controls
  (`VirtualHIDComponent` input, like the player's keys), and the doors at stops;
- hands back to the player on any manual input on those levers, or when switched off;
- **readies the train first** (setting "Autopilot readies the train", on by default): keys
  in, battery, pantograph up and breaker closed or the diesel started, reverser forward, train
  and dynamic brake released to their running positions, parking brake released, a combined
  handle out of emergency. Class-independent: controls are found by name family and by their
  input identifier, positions by the names the cab gives them
  ([research/ready-any-train](../research/ready-any-train.md)).

Owner's purposes: a **test driver for tsw-coop** (long, reproducible runs without a human at
the controls) and a **feature**. In tsw-coop it drives the **host's** train in singleplayer
and multiplayer alike; a guest who drives the host's seat must not fight it (see
[tsw-coop](#tsw-coop)).

Not goals (yet): safety systems
(Sifa, PZB, AWS/TPWS acknowledgement), coupling and uncoupling instructions, reversing at a
terminus, driving in Free Roam to a destination.

## Shape

```
tsw adapter tick (game thread)
  └─ pilot.rs  every 100 ms: read train, levers, driver aid, track ahead, timetable
       └─ control::Autopilot::step(Observation) -> Output   (no game calls)
            ├─ plan    target speed: limit in force, braking curves to limits/signals/stop
            ├─ servo   power and brake shares that hold it
            ├─ stops   arrival, doors, departure
       └─ levers.rs, cab::Vhid::set_input   shares -> lever values -> the game's input
       └─ watch       a lever not where the autopilot left it -> hand back
```

| Part | Where | Game calls |
| --- | --- | --- |
| Controller | `tsw-autopilot/src/control/` (`plan`, `servo`, `stops`, `watch`, `sim`) | none: unit-tested |
| Reads to controller terms | `src/route.rs` (timetable, driver aid, track items → stops, limits, signals, stop point), `src/levers.rs` (shares ↔ lever values) | none: unit-tested |
| Game side | `src/pilot.rs` (rates, engage, hand back, doors, status), `src/lib.rs` (settings, hotkey, console command) | yes |
| Shared driving code | tsw-sdk `cab`: `roles` (power/brake/reverser per class, lever profiles), `Vhid`/`Controls` (controls by name, `set_input`), `CabSide`, `Train` (speed, length, comfortable deceleration, doors, platform side) | yes (`roles` none) |
| Timetable and track | tsw-sdk `timetable::Reader` (`timetable`, `driver_aid`, new `track_ahead`; the driver aid now carries the lists `limits` and `signals`) | yes |

`cab` is tsw-coop's remote driving code (`drive/levers.rs`, the VHID part of `drive.rs`,
`drive/cab_side.rs`, `drive/cab_controls.rs`) moved into the SDK; tsw-coop now uses it from
there.

## What it reads

| Value | Source | Rate | Units / status |
| --- | --- | --- | --- |
| The player's train | `Controller.Pawn` → `DriverPawn::GetDrivableActor` | every step | |
| Speed | `RailVehicle.RailVehiclePhysicsComponent` → `URailVehicleComponent::GetForwardsVelocity` | every step | m/s, signed along the vehicle: **verified** (probe 03, 0.0014 at a stand) |
| Train length | `GetFormationLength` | 3 s | m: **verified** (18.3 for a lone BR 146) |
| Planning deceleration | `GetTargetMaxComfortableDeceleration(true)` | 3 s | m/s², negative: **verified** (−0.447, 1 mph/s). Clamped to 0.3..0.8. |
| Levers | the class's power, brake, reverser controls (`cab::roles::choose`), `GetCurrentInputValue`, `GetMinimum/MaximumInputValue` | every step | BR 146 ranges 0..1, notches 4/11/4 **verified** (probe 02) |
| Limit in force, next limit, next signal | `GetDriverAidData` (`SpeedLimit`, `NextSpeedLimit`, `DistanceToNextSpeedLimit`, `SignalAspectClass`, `DistanceToSignal`) | 200 ms | m/s and cm assumed (research/timetable-and-map): *unverified* |
| All limits and signals ahead | `FTS2DriverAidData::NextSpeedLimits` (`FSpeedLimit`), `NextSignals` (`FFoundSignalAspect`) | 200 ms | same units assumed: *unverified*. Needed: a lower limit beyond the next one may need braking before the next one is passed. |
| Stations ahead | `GetTrackData` (`Stations`, `Markers`: name, distance, `PlatformLength`) | 500 ms | distance cm → m; `PlatformLength` taken as cm: *unverified*; whether the distance is to the platform's near end: *unverified* |
| The service | `Reader::timetable` (stops, status, scheduled departure, current instruction's arrival time, service state, world clock) | 3 s | the clock is carried forward between reads |
| Doors | `GetDoorSidesForDoorLockState(Unlocked, true)` | every step | `None` on a loco without passenger doors (probe 03) |
| At a platform | `ATS2PrototypePlayerController::IsOnPlatformMarker(OutDoorSide)` | standing only | `false` off a marker (probe 03); the side on a marker *unverified* |

Between reads the controller carries the track forward by the distance run (speed × time):
limits, signals and the stop point move closer, a limit the front reaches becomes the one in
force.

## The controller

### Target speed (`plan`)

The target is the lowest of:

- the limit in force minus a margin (0.6 m/s), or a lower limit the train's **rear** is still
  inside (`LimitHold`: a rise is applied only after one train length);
- for every constraint ahead, the braking curve `sqrt(v_c² + 2·a·(d − v·t_lag))`:

| Constraint | `v_c` at distance `d` |
| --- | --- |
| Lower limit ahead | the limit minus the margin |
| Signal at caution (`Approach`, and any unknown aspect) | 40 km/h at the signal |
| Signal at danger (`Stop`) | 0 at 15 m before the signal |
| Stop point | 0 |

`a` is the planning deceleration (the game's comfortable figure), `t_lag` 2.5 s of travel for
the brake to bite. Near a stand point the train creeps (1.5 m/s) until it is within 1.5 m, then
the target is 0. With nothing known (no driver aid) the cap is 40 km/h.

### Power and brake (`servo`)

Desired acceleration `0.35/s × (target − speed)`, limited to +0.5 / −1.2 m/s², and never gentler
than the binding curve's own deceleration once the train is on it. Modes with hysteresis:
traction, coast, brake, hold (at a stand with target 0: 0.7 of full service). Traction is a PI
loop on the measured acceleration (filtered speed derivative); the brake is feed-forward through
an estimate of the train's full service deceleration (starts at 0.7 m/s², learned while
braking) plus a PI correction. Levers slew (power +0.5/s, −1.5/s; brake +1.5/s, −0.8/s), and
power and brake are never on together: each waits for the other to reach zero.

### Stops, doors, departure (`stops`)

- **Arrived** when the train stands and the game gives the current instruction an arrival time,
  or it stands within the stop window (6 m short to 40 m past the stop point) at a platform
  marker.
- At the stop: release the doors on the platform side; after at least 20 s and not before the
  stop's scheduled departure, lock them. The game completes the stop (its current instruction
  moves on); the train waits for that. A stop that has not completed 90 s after locking is
  reported once (toast), and the train keeps waiting.
- **Leaving** waits for the scheduled departure of the stop served last and for all doors
  locked (closing them, retried every 10 s, when `autopilot.doors` is on). With doors open
  the train never moves, doors setting or not.
- Times of day wrap at midnight; a departure up to six hours ahead counts as still to come.
- The service complete and the train standing: the autopilot hands back.

Stop point: the timetable's next stopping instruction, found by display name among the
stations ahead (platform first); the front goes 10 m short of the platform's far end, or to the
far end on a platform shorter than train + 10 m, or to the marker itself without a length.

### Handing back (`watch`)

Every lever the autopilot drives is expected where it left it (the value the game reported
after the set). A lever found more than 0.03 away on two reads in a row was moved by someone
else: the player's keys, mouse or controller, or a tsw-coop guest driving the host's seat. Then
the autopilot lets go at once and says which lever. It also hands back when switched off
(cutting power, leaving the brake as it is), when the player leaves the train, on a derailment,
when the service is complete, and when the train **stalls**: power at 0.3 or more for 25 s and
the train below 0.3 m/s (a brake that does not release, a penalty brake, a cold train). A
stall cuts power too, so a brake that lets go later does not start the train with nobody at
the controls.

## Levers per class (`cab::roles`)

| Class | power | brake | reverser forward | brake released / full service |
| --- | --- | --- | --- | --- |
| BR 146 (`RVM_TTC_BR146_C`) | `Throttle_F` | `TrainBrake_F` | 1.0 | 0.1 / 0.8 (research/driving-trains) |
| Class 323 (`RVM_TTC_Class323_DMS_A_C`, `_B_C`) | `PowerBrakeHandle` (combined) | the handle's negative side | 0.667 | 0 / −0.6 |
| Any other | first match of the role tables | first match | left as the player set it | range minimum / 80 % of the range |

The rear cab's own levers (`_B`) are used when the player sits there (`CabSide`). New classes
go into `roles::profile` in tsw-sdk (tsw-coop's stop values use the same tables).

## tsw-coop

The autopilot runs on whichever game the player switches it on. On the **host** it drives the
host's train; guests see it move as they see the host drive. When a guest holds the host's
seat and moves a lever, the host's coop sets that lever on the host's train; the autopilot
finds it moved and hands back, so the two never fight. A guest that switches it on in its own
copy of the host's train is handed back the same way as soon as the host's values are
mirrored onto it. No coop protocol change was needed; a coop menu row for `autopilot.enabled`
(as for `jump.enabled`) is a possible addition.

## Settings

| Setting / key | Default | |
| --- | --- | --- |
| `autopilot.enabled` | off, **not saved** (transient) | on: drive. Turned off by the plugin when it hands back on its own. |
| `autopilot.doors` | on | work the doors at stops |
| Hotkey `toggle` | Ctrl+F10 | switches `enabled` |
| Console `autopilot.status` | | the status line: speed, target and what binds it, hold, power, brake, limit, stop distance, next stop |

The plugin log gets the status line every 5 s and whenever what binds the target changes, plus
arrivals, door requests and the reason for every hand-back.

## Tests

`../tsw-sdk/scripts/gate.sh .`: 50 unit tests (under Wine) plus a file size test.

| Area | What is tested |
| --- | --- |
| `plan` | limit margin, cap without limits, lower limit binding only inside its curve, higher limits ignored, stop before a signal at danger (creep, zero inside the tolerance, never on past the point), caution speed, clear ignored, stop point vs farther signal, brake lag moves the curve earlier, held limit, `LimitHold` over a train length |
| `servo` | gentle start, hold at a stand, brake (never power) far above target, curve wins, no flapping on small errors, full service estimate learned, slew |
| `stops` | midnight wrap, a full stop (open, dwell, wait for departure, close, leave), minimum dwell, early trains wait, open doors hold and are closed when due, off-marker notice, not-completing notice once, moving trains never hold |
| `watch` | own lever, a hand twice in a row, settling blips forgiven, re-set resets, unknown levers learned |
| `Autopilot` | track carried forward between reads, a complete service finishes, open doors never let it move, a stall after 25 s under power (and no stall in any simulated run) |
| whole runs (`sim`) | regional train: every limit kept over the whole train length, up to line speed, no crawling through a restriction, never power and brake together; stop before a signal at danger and go on when it clears; caution signal passed at 30–41 km/h; station stop within ±2 m, dwell ≥ 20 s, doors closed not before departure, leaves on time; stop right after a restriction. Freight (0.5 m/s² full service, 4 s brake lag): stops before a signal at danger, keeps a restriction. |
| `route`, `levers` | next stop and departure from a timetable, arrival flag, complete service, stop point on long, short and unknown platforms, driver aid lists vs single values, unlimited values dropped, unknown aspects as caution; lever shares both ways, two-sided throttles, BR 146 brake profile, combined handle |
| tsw-sdk | `cab::roles` (role choice per class, rear cab, profiles), door sides, driver aid JSON without lists from an older adapter |

## In-game status

Read-only probes on the running TSW 7 (Training Centre, BR 146 in the cab), files in
`tsw-coop/dumps/tsw7-886/experiments/autopilot/`:

| Probe | Result |
| --- | --- |
| `01-simple-controls.lua` | no `USimpleControlsComponent` exists (it would have given class-independent `SetThrottleValue`/`SetBrakeValue`/`SetReverserValue`; it is the simplified-controls mode's), so the VHID levers are the way |
| `02-train-state.lua` | BR 146 levers: `Throttle_F` 0..1 (4 notches), `TrainBrake_F` 0..1 (11), `Reverser_F` 0..1 (4), `ReverserHandle_F` push button; the driver aid's struct out-param stays empty from Lua (as known) |
| `03-rail-vehicle.lua` | speed m/s, comfortable deceleration −0.447 m/s², formation length 18.3 m, mass 85 t, no unlocked doors, not on a platform marker |

To run in game (by the coordinator; nothing was deployed):

1. **Free Roam signals and limits** (Training Centre or any route, BR 146 ready to drive):
   build, deploy `autopilot.dll` with the current `tsw.dll` (it needs the driver aid lists,
   tsw-sdk `d3c6c90`), sit in the cab, Ctrl+F10. Expect "Autopilot on", the train accelerates
   to just under the limit and holds it. Log: `autopilot: … target … (Limit)` lines; compare
   the logged limit and signal distances with the HUD (units). Move the throttle: expect
   "Autopilot off: you moved the power."
2. **Signal at danger**: on a route with a red signal ahead (or a scenario): the train stops
   about 15 m before it and goes on when it clears. Log `(Signal)` then `(Limit)`.
3. **Timetable run** (Fulda or Dresden, a passenger service via `tsw.freeroam … t1` /
   `JumpToService`): engage at the origin. Expect: waits for the departure time, departs,
   stops at the next platform (`arrived at …` in the log, doors released on the platform side),
   dwells, locks the doors at departure time, the stop completes, it departs. Check where the
   front stands relative to the platform end and whether the game counts the stop (HUD), and
   `autopilot.status` while approaching (the stop distance vs the HUD's).
4. **tsw-coop**: host engages; a guest takes the seat (F8) and moves a lever: the host's
   autopilot hands back with "you moved the …".
5. **Run length**: leave a timetable run going for an hour; watch for Sifa/PZB interventions
   (see open questions) and the log for repeated hand-backs.

## Open questions

- **Units and reference points** of the driver aid and track data (cm, m/s; the platform
  distance to its near end; `PlatformLength` in cm). The stop point depends on all of them.
- **What completes a stop**: whether locking the doors at the scheduled departure is what the
  game wants (`bLockDoorsToComplete` on the instruction suggests so), and how the origin's first
  instruction completes.
- **Safety systems**: whether setting levers by `SetCurrentInputValue` resets the vigilance
  device (Sifa), and how PZB/AWS restrictive magnets are acknowledged. Without that a long run
  ends in an emergency brake; the autopilot then hands back as stalled (25 s later), but it
  does not recognise or reset a penalty brake.
- **Classes**: BR 146 and Class 323 have known lever positions; for the others readying
  hands over the brake's named running and the reverser's named forward position where the
  cab names them, else the ranges are used (brake from the range minimum to 80 %).
  Self-lapping and graduated brakes, and steam regulators, are untested.
- The train's direction relative to the cab is not checked: a train standing with the reverser
  backwards on an unknown class would drive backwards with the driver aid of the wrong end.
