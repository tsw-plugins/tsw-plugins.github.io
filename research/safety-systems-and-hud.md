---
name: tsw-safety-systems-and-hud
description: >-
  How TSW 7 implements PZB 90 and Sifa (from the decompiled blueprints), what a train's HUD interface
  tells a mod (tractive force, traction lock, brake gauges), and where the timetable keeps departure
  times and stop positions. For tsw-autopilot.
game_build: 886 (TSW 7)
created: 2026-10-21T08:45+0200
last_edited: 2026-10-21T08:45+0200
---

# Safety systems, the HUD interface and timetable internals

Sources: the cooked blueprints, unpacked from the (unencrypted) paks and decompiled from their Kismet
bytecode (2026-10-21, notes and commands in `/run/media/system/Data/tsw-decomp/NOTES.md`), the
UE4SS header dumps, Lua probes on the running game (`tsw-coop/dumps/tsw7-886/experiments/ready/`
`pzb.lua`, `hud.lua`), and Dovetail's forums and guides.

## The HUD interface: what every drivable tells about itself

Every drivable implements the blueprint interface `I_TSW2_HUD`. Its getters return out-parameters
and work on every class tried. Verified on the BR 442 and BR 110 (2026-10-21):

| Function | Out-parameters | Use |
| :--- | :--- | :--- |
| `HUD_GetTractiveEffort` | `TractiveEffort (N)`, `BrakeEffort (N)` | No force under power means the traction is cut (a tripped breaker) |
| `HUD_GetIsTractionLocked` | `IsTractionLocked` | Doors or interlocks |
| `HUD_GetAmmeter` | `Amps` | |
| `HUD_GetBrakeGauge_1` / `_2` | `WhiteNeedle (Pa)`, `RedNeedle (Pa)` | Main reservoir / brake pipe, or cylinder, per class |
| `HUD_GetAlerter` | `AleterState` (sic), `IsEnabled` | The vigilance warning |
| `HUD_GetPowerHandle`, `HUD_GetTrainBrakeHandle` | Handle position, active | |
| `HUD_GetAcceleration`, `HUD_GetSpeed`, `HUD_GetMaxPermittedSpeed` | m/s², m/s | |

tsw-sdk reads these as `cab::Hud`. Blueprint functions have no fixed path; `sys::find_function` walks
the class chain by name.

**BR 110 finding.** With power 1.0 the HUD showed 0 kN; after the breaker had been closed with the
throttle at 0, it showed force and the train moved. Dovetail's forum explains the cause: too much
power at once trips the BR 110's main breaker. To recover, set the tap changer to 0, close the
breaker, and notch up again slowly (around 40 kN). tsw-autopilot now notices "power, no force" after
3 s, re-readies the train and caps its power at 3/4 of where it was cut.

## BR 110: its traction lock, decoded and measured

Decoded from the simulation graph (`SA_LFR_DB_BR110_W29t`), then sampled at 1 Hz with
`lockwatch110.lua` while the autopilot drove (2026-10-21):

- **Run-down:** `ForceRunDown` = breaker without supply, dynamic brake > 0, train-brake handle > 0,
  reverser at 0, emergency-off pressed, or brake pipe < 2.5 bar. While it holds, the tap changer
  runs down.
- **The latch:** `TractionLock` = `(lock && !Nullstellung) || ForceRunDown`. Once set, it clears
  only at Nullstellung: throttle at 0 **and** tap 0. A driver who keeps power up never gets it back.
- **The throttle** is a target tap (0–28, 0.4 s per tap). Above 3395 A the breaker trips.
- **The brake handle as the graph sees it** (`AutoAirBrakeValve.HandlePosition`) is updated only
  by the levers' change events. Released straight to "Fahrend", it kept the last notch passed
  ("Abschluss", 0.2), which is a handle > 0, so the lock held. Released through "Lösen" (fill), it
  keeps −1, which is harmless.
- **The dynamic brake lever is coupled** to the train brake. Leaving "Lösen" for "Fahrend" moves it
  to about 0.05 for a moment, which runs down and latches the lock if power is up.

**What tsw-autopilot does:**
- It reads the lock through `HUD_GetIsTractionLocked` and keeps power at idle while it is locked.
- It releases the brake through its fill position every time.
- It gives no power while the brake fills.
- If a lock outlasts 3 s at idle, it releases the brake once more.

The Class 323 (`TR_ThrottleIdle`) and the BR 143 (AFB reset) latch their locks the same way.

## PZB 90 (`PZB_Service_V3`, V2 is the same in what matters)

- **Forced brakes:**
  - a 500 Hz magnet passed outside a 1000 Hz influence;
  - a 1000 Hz magnet not acknowledged within 4 s;
  - a 2000 Hz magnet passed without "Befehl" held below 40 km/h;
  - speed above the influence's braking curve (immediately, no grace time);
  - more than 7 s above vmax (a service brake, which clears itself below vmax).
- **The restrictive mode** only lowers the curve: 45 km/h, or 25 km/h after 500 Hz. Coming to a
  stand inside an influence makes it restrictive at once. It also starts after 15 s below 10 km/h.
- **Acknowledge ("Wachsam") and "Frei" act when the button is let go,** not when it is pressed.
  A press must also be released.
- **"Frei" clears a forced brake only at a stand** (±0.1 m/s), with no other condition. Without a
  forced brake, it ends a 1000 Hz influence only after 700 m.
- **PZB never cuts traction;** it vents the brake pipe through the emergency valve.
- **It is off** unless its fuse is in (`SignallingSystems`), the battery is on and the reverser
  engaged. On the BR 110 in our test it was off (`bIsReady` false).
- **State a mod can read:**
  - `PZB_GetEmergency` (excludes the overspeed brake) and `PZB_GetOverspeed`;
  - `PZB_GetRestrictionMaxSpeed` (m/s);
  - `PZB_GetDataStruct` (the active influence, its speed limit in km/h).

## Sifa (`BP_Sifa_Service` on the BR 110)

- **The cycle:** a visual warning 30 s after the last reset, the alarm 2.5 s later, and the penalty
  brake at 35 s.
- **It is active** only above 1.34 m/s (4.8 km/h), with its fuse (`WarningDevices`) in and the
  battery on.
- **A reset is any value change** of a reset button (identifier `Alerter`: `SifaReset_*`,
  `SifaResetDesk_*`). A reset also clears a penalty at any speed.
- **The pedal counts as held while the driver sits,** so the reset buttons are what keeps the Sifa
  quiet.
- **No traction cut:** the penalty vents the brake pipe.

## Timetable: departure times and stop positions

The timetable and the AI are native (`ARouteTimetable`, `ATS2AIController`); the blueprints only call
into them.

- **Times:**
  - `ARouteTimetable::GetServiceExpectedTimes(service, -1, true, false)` gives each destination
    with its arrival and completion (departure) time. This is what the PIS manager shows.
  - `GetInstructionDueArrivalTime` gives one instruction's due arrival.
  - `URouteTimetableDefinition::GetInstructionScheduledTimes` gives the scheduled ones.
- **Instruction fields** (`FRouteTimetableServiceInstruction`):
  - `ArrivalTime` and `CompletionTime` (the departure, a time of day);
  - `bIsStopping`;
  - `bUseStopMarkerPosition`.
- **Positions:**
  - `URouteTimetableDefinition::GetInstructionLocation` / `GetInstructionRibbonLocation`;
  - the active objective's `UObjectiveActionMoveToComponent::GetStopAtPlacementCetrePosition()`
    (sic) and `GetStopAtPlacementAccuracy()`;
  - `ATS2PrototypePlayerController::GetTrackData` lists the stations and markers ahead with their
    distances (cm).
- **The service:**
  - the player's service comes from `ATS2PrototypePlayerController::GetDrivenServiceName`;
  - its state from `ARouteTimetable` `Services[ServiceIndexMap[name]]`: current instruction, its
    state (Arrived, Succeeded, ...), and lateness.

**The game's AI driver** (`BT_TS2AIController`) drives by a target velocity
(`BTTask_AimForTargetVelocity`), and only on simple physics. It does not move cab levers. Handing a
fully simulated player train to it is no way to an autopilot; tsw-autopilot drives the levers itself.

## Realism settings

- Settings, Player Assist: Automatic Coupling, Automatic Set Manual Junctions, Notifications, Expert
  Mode (supported locos only), AI Conductor Mode.
- The Experienced/Expert preset turns every assist off and uses the minimal HUD.
- No global "safety systems on" switch was found: PZB and Sifa are per loco and per service.
