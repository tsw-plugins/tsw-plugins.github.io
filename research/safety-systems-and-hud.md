---
name: tsw-safety-systems-and-hud
description: >-
  How TSW 7 implements PZB 90 and Sifa (from the decompiled blueprints), what a train's HUD interface
  tells a mod (tractive force, traction lock, brake gauges), and where the timetable keeps departure
  times and stop positions. For tsw-autopilot.
game_build: 886 (TSW 7)
created: 2026-10-21T08:45+0200
last_edited: 2026-10-21T20:15+0200
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

### The braking curves, measured (BR 146 + Dosto, RB51-15500, 2026-10-21)

The component's `ActiveInfluence` (`PZB_InfluenceProgram`, a Blueprint struct whose members
carry their GUIDs in their names) holds what a driver needs to stay under the curves:

| Member | Type | Meaning |
| :--- | :--- | :--- |
| `1000Hz_Active_93_…` | bool | a 1000 Hz influence is in force |
| `1000Hz_Time_64_…` | int | whole seconds since its magnet (0 to 24) |
| `500Hz_Active_87_…` | bool | a 500 Hz influence is in force |
| `500Hz_Distance_67_…` | int | metres since its magnet, counted in 17 m steps up to 153 |
| `SpeedLimit_70_…` | int | the curve's end speed, km/h (85 in programme O, 45 after 500 Hz, 25 restricted) |
| `isRestricted_43_…` | bool | restrictive mode |
| `isEmergency_52_…` | bool | a forced brake is on |

- **The 1000 Hz curve is parabolic in time.** In programme O it falls from 165 to 85 km/h in
  23 s: slowly at first, then about 0.3 km/h per second faster each second (164.9 after 1 s,
  139.7 after 13 s, 91.9 after 22 s). A train that follows the curve is caught at its end. A
  straight fall from the magnet to just under the end speed always lies under it.
- **The 500 Hz curve is a constant deceleration over distance.** Restricted, it falls from 45 to
  25 km/h over 153 m (v² linear in distance: 37.8 km/h at 68 m).
- Each emergency we saw came from crossing a curve's end by a few tenths of a km/h: 85.1 under
  85, 25.4 under 25. The forced brake then put PZB into restrictive mode and needed "Frei" at a
  stand.

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

## Reference: PZB and Sifa in the decompiled blueprints

Detail behind the summaries above, from the 2026-10-21 analysis. Paths are under
`tsw-decomp/out/TS2Prototype/Content/Core/RailVehicles/SafetyDevices/`; "UG" is the ubergraph and
the numbers are bytecode offsets. Timings and speeds come from the class defaults, decoded from the
raw `.uexp` because the decompiler printed floats as 0 (see
[traction-locks.md](traction-locks.md#decompiler-caveat)).

### PZB mode values (`PZB_ModeBase`, `_M`, `_U`; `_O` overrides nothing)

| Limit | O | M | U |
| :--- | :--- | :--- | :--- |
| 1000 Hz vmax | 160 km/h | 120 | 100 |
| 1000 Hz curve end (reduced) | 85 | 70 | 55 |
| 500 Hz limit | 65 | 55 | 40 |
| 500 Hz reduced | 45 | 35 | 25 |
| 1000 Hz reduction time | 23 s | 29 s | 38 s |

The same for all modes: 2000 Hz limit 40 km/h; Befehl (override) valid below 45; restricted
1000 Hz 45 and restricted 500 Hz 25; restriction activation below 10 km/h; startup activation
5 km/h, startup limit 45. Times: acknowledge 4 s, restriction 15 s, overspeed 7 s. Distances:
1000 Hz release 700 m, 1000 Hz end 1250 m, 500 Hz 250 m (reduced 153 m), startup 550 m. V3 class
defaults: overspeed allowance 5 km/h, activation speed 5 km/h. `ModeList` keys 3 = O, 2 = M, 1 = U;
mode 0 means off. The enforced limit comes from the curve assets `PZB_Curve_O/M/U` (R: the 1000 Hz
limit over seconds, G: the 500 Hz limit over distance, B: restrictive, A: restriction activation).

### What brakes, in `PZB_Service_V3` (`EMERGENCY(true, type)`)

| Type | Trigger | Where |
| :--- | :--- | :--- |
| 3 | a 500 Hz magnet outside a 1000 Hz influence | UG 9828 → 10122 |
| 2 | 1000 Hz not acknowledged within 4 s; also sets restrictive mode | timer UG 6849–6974, fires 10851 → 10815 |
| 1 | a 2000 Hz magnet unless Befehl is held and speed ≤ 40 km/h | `RecieveFrequency` 1663–1865 |
| (current) | over the active influence's curve, at once, no grace | `UPDATE_INFLUENCE` 1471–1696 → 2839 |
| 0 | more than 7 s above vmax + allowance ("forced brake", clears itself below vmax) | UG 7756–7881, `Overspeed_Time` 100 |

- `Get_Influence_MaxSpeed` (1703) picks reverse → restricted → 2000 Hz → 500 Hz → 1000 Hz.
- Restrictive mode only lowers the limit (curve B). It starts after 15 s below curve A, or
  **at once when the train stops (< 0.1 m/s) inside an influence** (`CheckRestriction_Speed`
  122–170), and ends at the terminate distance.
- The startup programme is armed by `Update_ReverserState` (451–470) when the reverser goes to
  forward and enforced through the curve.
- `EMERGENCY` (1452) acts only on a change, calls `SetEmergency` / `ClearEmergency` of
  `SafetyDeviceBase` and broadcasts `OnEmergencyChanged`.
- Release (`Release()` 514–705): with an emergency, only a stand within ±0.1 m/s is required.
  Without one it clears a 1000 Hz influence after 700 m. Type 0 clears itself below vmax (UG
  11468–11589). Turning PZB off also clears it.
- **`Acknowledge()` and `Release()` act on the falling edge** (button let go); on the rising edge
  they only notify clients. `Override()` acts on both edges and makes Befehl valid while held below
  45 km/h.
- V3 never reads its `_Acknowledge` / `_Release` / `_Override` / `_Reverser` VirtualHID fields: the
  loco pushes events in (`PZB_Acknowledge`, `PZB_Release`, `PZB_Override`, `PZB_SetDirection`,
  `PZB_SendFrequency`, `PZB_SetActiveState`, `Set_IsLZBActive`). `PZB_SetPowerState` and
  `PZB_GNTEntry` are empty. Magnets are ignored unless enabled, mode ≠ 0, active and not
  suppressed.
- Neither PZB nor Sifa ever calls `SetPowerInfluence`: they brake, they do not cut traction.
- **V2** has the same emergency paths, values and edge rules (offsets shifted). It lacks GNT
  suppression, debug mode and mode changes at runtime; its `bIsPZB_Active` is `bIsReady &&
  !bIsLZB_Active`, and LZB activation does not clear an emergency.

### Sifa as the BR 110 uses it (`WarningDevices/BP_Sifa_Service`)

Class defaults (the BR 110's instance overrides none): split visual and audible warning,
`DurationBeforeWarning` 30 s, `DurationBetweenVisualAndAuditory` 2.5 s, `DurationBeforeEmergency`
5 s (so the penalty comes 35 s after the last reset), distance variants 900 m and 75 m,
`MinimumSpeedThreshold` 1.34112 m/s, `IgnoreDeadmansBrakeEnforcment` true,
`DoesPedalClearPenaltyBrake` true, `PedalEmergencyDelay` 8 s. Sifa types: 0 time-based (default),
1 time then 75 m steps, 2 900 m then 75 m steps, 3 random 30–50 s. Active only when cut in, enabled
and above the speed threshold; going inactive clears warning and penalty, except that speed is
ignored while a penalty is on. A pedal press or `WarningDevices_Acknowledge` clears warning and
penalty and restarts the timer; releasing or holding the pedal does nothing. The older `Sifa_C`
(pedal hold/release timers) is a different device, not used by the BR 110. The native
`USifaBaseComponent` is a third one; see [native-code.md](native-code.md).

### How the BR 110 wires them (`LFR_DB_BR110/…/RVM_LFR_DB_BR110_399`)

- Components `PZB_Service : PZB_Service_V3_C` and `Sifa_Service : BP_Sifa_Service_C`.
- `PZB_Acknowledge_F/B`, `PZB_Release_F/B`, `PZB_Override_F/B` (identifiers `PZB_Acknowledge`,
  `PZB_Release`, `PZB_Override`) pass `NewValue > 0.5` (UG 34954–35789). The B-cab acknowledge
  handler passes the **old** value (UG 35114), so from cab B an acknowledge would land one change
  late (a possible game bug, by reading only).
- The mode lever `PZB_Mode_B` positions 0/1/2 set U/M/O (UG 35835–35959), but nothing calls
  `SET()`, so a change probably applies only at the next PZB enable [inferred].
- Enable: PZB = fuse `SignallingSystems` > 0.4 and battery; Sifa = fuse `WarningDevices` > 0.4,
  battery and a single active cab.
- Sifa reset buttons `SifaReset_L/R_F/B`, `SifaResetDesk_F/B` (identifier `Alerter`): any value
  change acknowledges, if that cab's jumper cable is master (UG 10614–11144). The pedals
  `SifaResetPedal_F/B` follow seat occupancy.
- On a PZB emergency, Sifa penalty, LZB emergency or the emergency handle, `UpdateLocalEmergencyState`
  opens `Simulation.EmergencyValve` (vents the pipe). A type-0 forced brake raises the train-brake
  valve to at least 0.4 instead (`UpdateTrainBrakeLocal`), which also latches the traction lock
  ([traction-locks.md](traction-locks.md)).
- `ResetSafetySystems` (UG 13448–15784) pushes `SifaResetDesk` while Sifa is active and moves
  `PZB_Acknowledge` while an unacknowledged influence is active: the game's own model of an
  automatic acknowledge.

## Web sources (2026-10-21)

Community statements on PZB, Sifa and the BR 110 that the decompiled code above confirmed or
corrected; two Dovetail support pages (the Linke Rheinstrecke gameplay guide and "Settings
Explained") returned 403/404 and were read only as search summaries.

- BR 110 route and roadmap: https://profile.dovetailgames.com/live/train-sim-world/articles/article/tsw-roadmap-march-2023
  (the BR 110.3 comes with Linke Rheinstrecke: Mainz–Koblenz; "LFR" matched only a community
  timetable mod's name, so it is probably the community's abbreviation, unverified)
- Gameplay guide: https://support.dovetailgames.com/hc/en-us/articles/28572762053010-Linke-Rheinstrecke-Mainz-Koblenz-Gameplay-Guide
- Breaker trips under too much power: https://forums.dovetailgames.com/posts/691148/
- Settings and presets: https://support.dovetailgames.com/hc/en-us/articles/28572764655122-Train-Sim-World-Settings-Explained,
  https://support.dovetailgames.com/hc/en-us/articles/35574942592658-How-to-set-up-Train-Sim-World
- Expert locos: https://live.dovetailgames.com/live/train-sim-world/articles/article/db-br-145-expert-out-now,
  https://live.dovetailgames.com/live/train-sim-world/articles/article/db-br-101-expert-out-now
- PZB as players describe it: https://flyawaysimulation.com/ask/answers/use-pzb-train-sim-world/,
  https://forums.dovetailgames.com/posts/471856/ (hold Befehl past a 2000 Hz magnet),
  https://forums.dovetailgames.com/posts/576255/, https://forums.dovetailgames.com/threads/what-is-wrong-with-the-db-401.68503/
- Sifa cycles on the Vectron (user reports): https://forums.dovetailgames.com/posts/953530
