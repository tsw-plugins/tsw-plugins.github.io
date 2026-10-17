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
| `controls` | driver → host | `{"Throttle_F": 0.3, ...}` | lever values that changed, at most every 150 ms |

The host's `snapshot.controls` carries the current values of the remotely
drivable controls, so a driver starts from the real lever positions and
re-syncs to them one second after its last key press.

Host rules: a free seat goes to the first asker, only while the host itself
drives a train; F8 on the host takes it back; a driver who leaves (or times
out) loses it; `controls` from anyone but the driver are ignored. Only the
names in `KEYS` are accepted (`Throttle_F`, `TrainBrake_F`, `Reverser_F`),
each clamped to the control's own input range.

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

## Open

- The guest's view: it should look out of the ghost cab while driving
  (camera on the ghost view actor). Today the guest drives from wherever it
  stands and sees the ghost train move.
- Horn, doors, lights, emergency brake: the horn is a centre-return lever per
  cab side (`Horn_FL`/`Horn_FR`, rest 0.5), not a button; each needs its own
  mapping.
- Other trains: control names differ per class (combined power/brake
  handles); `KEYS` is the BR 146 set and a per-class table is the next step.
- Emergency brake when the host leaves the cab while a guest drives (docs/08)
  is not implemented; today the seat is simply released.
- A real second game as the guest is still untested (only the emulator).
