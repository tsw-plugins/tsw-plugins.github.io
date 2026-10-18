---
name: remote-driving
description: >-
  A guest drives the host's train: the seat and lever messages over the relay, applying values on the host, and what was verified in game on both sides.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-17T21:40+0200
last_edited: 2026-10-18T08:14+0200
---

# Remote driving: a guest drives the host's train (2026-10-17)

Code: `mod/native/src/drive.rs` (host and guest side), events through the
relay's existing `event` message (no relay change). Concept: docs/08
"Simulation" and "Driver handover": the host simulates, a guest only sends
lever values.

## Messages (`event`, `name` + `args`)

| name | from → to | args | meaning |
| --- | --- | --- | --- |
| `seat` | guest → host | `{"take": true\|false}` | ask for / give up the host's seat (F8 on the guest) |
| `driver` | host → room | `{"id": "<player>"\|null}` | who drives; on every change and every 5 s for late joiners |
| `controls` | driver → host | `{"power": 0.3, ...}` | lever values that changed, at most every 150 ms |

The host's `snapshot.controls` carries the current value of each role and
its lever's range (`power`, `power_range: [min, max]`, ...), so a driver
starts from the real lever positions, stays within the lever, and re-syncs
to them one second after its last key press.

Host rules: a free seat goes to the first asker, only while the host itself
drives a train; F8 on the host takes it back; a driver who leaves (or times
out) loses it; `controls` from anyone but the driver are ignored. Only the
roles in `KEYS` are accepted (`power`, `brake`, `reverser`), each set on
the lever `drive/levers.rs` picks for the train and clamped to its range.

Per class (from the object dump of the Training Centre's trains, until
2026-10-18 only the BR 146 names were used and tested):

| Class | power | brake | reverser |
| --- | --- | --- | --- |
| BR 146 | `Throttle_F` | `TrainBrake_F` | `Reverser_F` |
| Class 66 | `Throttle_F` | `F_AutoBrake` | `Reverser_F` |
| Doppelstock cab car | `Throttle` | `TrainBrake` | `Reverser` |
| 8F (steam) | `Regulator` | `VacuumBrake` | `Reverser_RailDriver` |
| Class 323 | `PowerBrakeHandle` (combined) | — | `Reverser` |

Stopping a train (lost driver, host left it) sets power 0 and brake 1;
with a combined handle the handle goes to its low end, which brakes
(`docs/research/interfaces.md`: 0.5 neutral, below it brakes). Untested in
game beyond the BR 146: whether 1 is full application on the Class 66
automatic brake and the 8F vacuum brake.

Guest keys while driving (only with the game window focused; the guest's
own pawn ignores movement input meanwhile): A/D throttle, Q/E train brake,
W/S reverser, F8 to leave the seat.

## Applying a value on the host

`VirtualHIDComponent::SetCurrentInputValue` fires the vehicle blueprint's
`VirtualHIDChanged` handler like player input
(`docs/research/driving-trains.md`, "Held input, not values"). Two traps on
the BR 146:

- **Notch edges:** one set stops at the next notch edge. Throttle at 0, set
  0.3: it reads 0.1; a second set of 0.3 reaches 0.3. Down from 0.3, a set
  of 0 stops at 0.1. `apply` sets again (at most 4 times) while the lever
  moved but has not arrived, and logs when it stays short.
- `UnlockLeverRange` (on `ULeverBaseComponent`) is called first, as the Lua
  tooling does; it was not what held the throttle (no lock was set, and
  `LeverConstraints` was empty).

## Verified in game (Training Centre, BR 146, emulated guest)

The game hosted the room and drove a spawned BR 146 (`tswcmd drive spawn`).
A guest from `tsw-coop-emu serve` (live control API, patrol client `rd` so it
keeps sending avatars and does not hit the relay's 30 s idle timeout):

1. `seat take` → host log "rd drives our train", HUD "rd is driving your
   train", room receives `driver {"id":"rd"}`.
2. `controls {"Throttle_F":0.3}` → 64.6 kN tractive effort, 3.4 m/s after 8 s.
3. `controls {"Throttle_F":0,"TrainBrake_F":0.8}` → tractive 0, brake
   cylinder 4.45 bar, standstill.
4. `seat leave`, then `controls {"Throttle_F":0.5}` → ignored (levers stay).
5. `seat take` again, F8 on the host → "You took back control of your
   train", `driver null` (`dumps/tsw7-886/experiments/remote-drive-1/host-reclaimed.png`).
6. An emulated guest that only listens was dropped by the relay after 30 s
   ("driver left (Timeout)"); the host released the seat at once.

## Guest side, verified in game (Training Centre, emulated host)

Setup: the game's own BR 146 host stream was recorded at the Training
Centre (`tsw-coop-emu repl --log`, a listening guest kept alive with chat
lines) and replayed by an emulator host `th` (`tsw-coop-emu serve`, `POST
/clients` with a replay source:
`dumps/tsw7-886/experiments/remote-drive-1/ttc-br146-host.jsonl`). The game
then joined as guest and drew the ghost BR 146. Everything below ran without
touching the game window (`boot-code.sh`, `guest-drive.sh` in the same
folder; keys through the test command file, see below):

1. F8 → guest log "asking for the host's seat", `th` receives `seat
   {"take": true}`.
2. `th` sends `driver {"id": <game>}` → "we drive the host's train", the
   HUD toast with the keys, the view switches to the ghost cab
   (`guest-cab-view.png`), measured 0 cm from the cab camera.
3. D held 1 s → `controls` with `Throttle_F` rising by 0.5 in steps every
   150 ms; Q held 0.6 s → `TrainBrake_F` falling from the host's value.
4. F8, then `th` sends `driver null` → "You no longer drive the host's
   train", view back on the pawn where it stood (`guest-left-cab.png`).

### The view from the ghost cab (`mod/native/src/cab.rs`)

Each cab view actor has `UInteractionEnvironmentCameraComponent`s per
position (`Driver_F`, `Driver_B`, `Shunting_*`, ...). While driving, the
ghost car is the player's view target with only `Driver_F` active, and
every frame that camera is turned to the controller's rotation, so mouse
look works. The pawn stays where it was, frozen.

Tried first and dropped: attaching the pawn to the cab camera (movement off,
collision off, its eye shifted onto the camera). The pawn camera then sat
exactly on the cab camera, yet the player's view was 15 m back along the
train at the rear cab's desk (`pawn-attached-rear-desk.png`), and stayed
there after the pawn was detached and put beside the train. The driver
pawn's own camera rig (modifiers, interaction environments) takes over
inside a cab; the view target route avoids it.

Consequence: other players see the driving guest's avatar where it stood,
not in the cab. The pawn is also where world streaming and origin rebasing
are anchored; a long drive away from it is untested.

## Test command file (`mod/native/src/cmd.rs`)

`tswcoop-cmd.txt` next to the exe, read and removed once a second: `key
<name> [seconds]` (the mod's hotkeys see the key held, no focus needed),
`quit`, `console <command>`. With `console ts2.dbg.LoadTimetable
/TrainingCentre_Route_Gameplay/Timetable/TC_Timetable.TC_Timetable` the
game goes from start to the Training Centre in 14 s with no input at all.
To be replaced by dev endpoints on the host's planned HTTP server.

## Open

- Which cab: always `Driver_F`; the host's actual driving end (and a
  flipped lead car) is not sent yet.
- The ghost cab's levers do not move with the host's values.
- Horn, doors, lights, emergency brake, PZB/SIFA: the horn is a
  centre-return lever per cab side (`Horn_FL`/`Horn_FR`, rest 0.5), safety
  systems need acknowledge buttons; each needs its own mapping. The BR 146's
  power handle drives the automatic speed control (AFB): with the target at
  0 it brakes (−100 % on the HUD) whatever the throttle; that is the
  train's own simulation, the same for a local driver.
- Other trains: the per-class table above is built (2026-10-18) but only
  the BR 146 was driven in game. The rear cab is told by the driver pawn's
  `GetInteractionEnvironment()` name, matched to the train's
  `UInteractionEnvironmentComponent` of that name and its `VehicleSide`
  (`ESide::Back` = 1); then the `_B`/`B_` levers come first
  (`drive/cab_side.rs`), untested in game.
- The host leaving its train (2 s out of the cab, or into another train)
  now stops it (`drive/leave.rs`), untested in game.
- A real second game as host is still untested (only the emulator).
