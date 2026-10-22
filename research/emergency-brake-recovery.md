---
name: emergency-brake-recovery
description: >-
  How TSW 7 latches and resets an emergency brake: Sifa penalty, PZB Zwangsbremsung (500/1000/2000 Hz, overspeed), the driver's brake handle and the emergency valves and buttons, and what clears the `TractionFromEmergency` lock condition, for the FSN BR 143, the DLG BR 442 and the Dosto cab car; the driver's reset sequence and how tsw-sdk readying does it. Decompiled; not yet confirmed in game.
game_build: 886 (TSW 7)
created: 2026-10-22T23:30+0200
last_edited: 2026-10-22T23:30+0200
---

# Emergency brake recovery (2026-10-22)

Question from tsw-autopilot: after an emergency brake, readying ended "traction stays locked
(TractionFromEmergency)" and the autopilot gave up.

- **Run 40** (FSN BR 143 + Dostos, RegionalbahnBreakdown): the autopilot was switched off at
  15-20 km/h; with nobody at the controls an emergency brake vented the pipe (0 bar on every
  vehicle, BC 3.8 bar loco, 4.4 bar coaches). Readying blocked twice. A fill stroke held at the
  driver's brake valve for 15 s during that emergency did nothing.
- **Run 38** (DLG BR 442 Talent 2): an unacknowledged PZB 1000 Hz magnet braked the train to a
  stand; readying blocked the same way while the PZB showed "Wachsamtaster!".

Sources (kdecomp mirror, `tswdump`): `Core/RailVehicles/RVM/Traction/LocomotiveConditionManager`,
`Core/RailVehicles/SafetyDevices/WarningDevices/BP_WarningDeviceBaseService` and `BP_Sifa_Service`,
`Core/RailVehicles/SafetyDevices/PZB/PZB_Service_V3`, `FSN_DB_BR143/.../RVM_FSN_DB_BR143`,
`DLG_DB_BR442/.../Base/RVM_DLG_DB_BR442_T_Base`, `FSN_DB_Doppelstock/.../RVM_FSN_DB_766pbzfa`.
`@N` are bytecode offsets in those files.

## Summary

- **Nothing clears by waiting.** Each safety device latches its own emergency; the traction lock
  only mirrors it. The device must be reset through its cab control, at a stand for PZB.
- **`TractionFromEmergency` is set while the lock manager's emergency set is not empty**
  (`LocomotiveConditionManager.UpdateEmergency` @281: `SetCondition(TractionFromEmergency, Traction,
  IsEmergency)`, `IsEmergency = EmergencyConditions.Length > 0`). The members name the cause: BR 143
  `SifaEmergency`, `PZBEmergency`; BR 442 `SifaPenalty`, `PZBEmergency`, `LZBEmergency`,
  `PowerHandleEmergency`, `EmergencyButton`; Dosto cab car `PZB_Emergency`, `FullEmergency`,
  `Emergency`. The same holds for penalties (`PenaltyConditions` behind `TractionFromPenalty`; the
  Dosto cab car's Sifa is a penalty, `SIFA`).
- **tsw-sdk did not read those sets.** It listed the lock's `TractionConditions` only, so the log
  said `TractionFromEmergency` and nothing about why. It now lists both sets as causes
  (`LocomotiveConditionManager: SifaEmergency`).
- **On the BR 143 the emergency also overrides the driver's brake valve:** `UpdateDriversBrake`
  (@821-968) feeds the simulation's `AutoAirBrakeValve.HandlePosition` with 2 (emergency) while
  `IsEmergency`, 1 (full service) while `IsPenalty`, whatever the handle says. That is why the
  run 40 fill stroke did nothing: the handle was not connected. Once the set is empty, the handle
  counts again and "Fahrstellung" recharges the pipe.
- **Run 40 was most likely the Sifa** (autopilot off at 15-20 km/h: above the Sifa's 4.8 km/h,
  warning after 30 s or 900 m, alarm 2.5 s later, brake 5 s after that). The lock manager's set
  will name it from now on.

## Per system

### Sifa (`BP_Sifa_Service`, parent `BP_WarningDeviceBaseService`)

- **Latch:** `HandleTimerReached` → `SetPenaltyBrakeState(true)` when every warning stage ran out
  (defaults: warning 30 s, alarm +2.5 s, brake +5 s; or by distance, 900 m and 75 m steps, by
  `SifaType`). The flag `inPenaltyBrakeApplication` is broadcast as `OnPenaltyBrakeStateChanged`,
  which the trains turn into their emergency (BR 143 `ELM_Sifa` = `SifaEmergency` @61181, BR 442
  `EC_SifaPenalty` @21605) or penalty condition (Dosto `TLCondition_SIFA` @13000).
- **Reset:** `AcknowledgeEnforcement` → `SetPenaltyBrakeState(false)`, **at any speed**. It is
  reached two ways:
  - `WarningDevices_Acknowledge`, which the BR 143 calls on **any value change** of the active
    cab's `SifaReset_F/FL/FR` (or `_B/BL/BR`) (@26194-27983, picked by the master jumper cable);
  - a pedal press: `HandlePedalStateChanged` with `bPedalIsPressed` and `DoesPedalClearPenaltyBrake`
    (default True) acknowledges and starts the 8 s pedal timer (held 8 s, it brakes again).
    `IgnoreDeadmansBrakeEnforcment` is True on the Sifa, so letting go of the pedal never brakes.
    A seated driver's pedal input is reversed (`SifaPedal_F.Set_IsInputReversed(seat occupied)`
    @61338), so a press and release passes through "pressed" one way or the other.
- While in penalty the Sifa ignores falling below its minimum speed (`HandleSpeedChanged` @529),
  so the penalty survives the stand; the acknowledge clears it there.

### PZB (`PZB_Service_V3`)

- **Latch:** `EMERGENCY(true, type)` sets `ActiveInfluence.isEmergency` and broadcasts
  `OnEmergencyChanged`, which the trains turn into an emergency condition (BR 143 `ELM_PZB` =
  `PZBEmergency` @61081). Types (`PZB2_EmergencyState`): 0 overspeed (curve or time, @1921),
  1 a 2000 Hz magnet without a valid "Befehl" (@1865), 2 a 1000 Hz magnet not acknowledged in time
  (@10815, which also marks it acknowledged and restricted), 3 a 500 Hz magnet case (@10122).
- **Reset:** `Release(false)` (the "Frei" button **let go**) with `isEmergency` and the speed within
  0.1 m/s of zero (`NearlyEqual(speed, 0, 0.1)` @514-609) → `EMERGENCY(false, 0)`. Pressing alone
  only notifies the clients. That let-go does nothing else: releasing the 1000 Hz monitoring
  (@720-975, refused under a 500 or 2000 Hz influence) takes another press.
- **Exception:** an overspeed emergency against the programme's top speed clears by itself once
  the speed falls back (`isOverspeed && isEmergency` → `EMERGENCY(false)` @11488-11589);
  `PZB_GetEmergency` excludes it for that reason.
- After a 1000 Hz forced brake the PZB stays restricted (45 km/h) until released again under way
  ("Befreiung möglich!"), which the autopilot already does while driving.

### The driver's brake handle and emergency controls

- **BR 143 `DriversBrake_F`:** output 2 is emergency. It sets no lock condition; it vents the pipe
  through the simulation while there. Readying's brake check puts it back in "Fahrstellung".
- **BR 143 `EmergencyBrakeValve_F/_B`** (IrregularLever, one per cab): `UdpateEmergencyValveState`
  (sic) opens the simulation's emergency plunger while either output is 0.5 or more (or a shunting
  emergency is active). No lock condition either: the pipe stays vented until it is closed.
- **BR 442:** `ThrottleAndBrake` and `TrainBrake` each have a converter `IsEmergency`; at 0.5 or more
  they set `PowerHandleEmergency` (both the same name, @97 and @17578). `EmergencyBrake (Push
  Button)` sets `EmergencyButton` while above 0.5 (@20172). The release condition
  `RC_MastercontrollerIdle` is set while the master controller is above 0.05, so after any lock the
  traction stays latched until it returns to idle (readying's existing unlatch does that).
- **Dosto cab car:** `EmergencyButton` sets `FullEmergency`, `EmergencyBrake` sets `Emergency`, both
  while at 0.5 or more.

### What else holds traction after the emergency clears

- **BR 143 `ELM_Release_Stopped`:** a release condition set when the emergency is set
  (`OnEmergencySet(true)` @63665-63675) and cleared only when the train comes to rest
  (`RailVehicleSpeedChanged` with `!bIsMoving` @7573). After an emergency at speed it is already
  clear by the time the train stands. After one set at a stand it would latch the lock until the
  train has moved and stopped again [inferred; not seen].
- The pipe must recharge and the cylinders release before the BR 143's
  `TLConditionBrakingConverter` (brake set point above 1.25) lets go: research/traction-locks.

## A driver's reset sequence

1. Let the train stop (the emergency brake does that).
2. Find the cause: the display (PZB lamps, "Wachsamtaster!", the Sifa lamp) or, for the code, the
   lock manager's emergency set.
3. Put back what applies the brake by hand: close an emergency valve, pull out an emergency
   button, take a handle out of its emergency position.
4. Acknowledge the Sifa (pedal or reset button).
5. Press and let go of PZB "Frei" (at a stand).
6. Driver's brake to "Fahrstellung", wait for 5 bar in the pipe and the cylinders to release;
   power controller to zero if the lock latched (BR 442, BR 143 speed selector).

The game does not require the driver's brake to go to emergency or full service and back first
(no blueprint above checks it); a real driver keeps the train braked while resetting, and the
pipe is vented anyway until step 6.

## In tsw-sdk readying

`cab::ready` (tsw-sdk `d51c01a`, tsw-autopilot `47383a9`):

- `Power::lock` lists the `LocomotiveConditionManager`'s own `EmergencyConditions` and
  `PenaltyConditions` as causes, beside the separate safety managers it already listed.
- A new family `EmergencyBrake` (`EmergencyBrakeValve`, `EmergencyBrake`, `EmergencyButton`,
  `EmergencyValve`; not `EmergencyBrakeOverride`). Readying reads every one of them, and the
  vigilance device and the PZB acknowledge.
- `State` carries the speed and PZB's own `isEmergency` flag.
- A check `Emergency` after the power-up checks (keys, battery, pantograph, breaker, engine) and
  before the brakes. It fails when the traction is locked with a safety cause or by
  `TractionFromEmergency`, when PZB's flag is set, or when an emergency control is applied. Then:
  - it waits for a stand (below 0.05 m/s; up to 120 s, then "the train does not come to a stand in
    its emergency brake");
  - try 1 does what the cause asks: applied controls to their low end, a handle off emergency
    (train brake to running, a combined master controller to neutral), the Sifa pressed for a
    vigilance cause, "Frei" pressed for a protection cause or flag; everything when the cause is
    not known;
  - tries 2 and 3 do everything, the PZB acknowledge too;
  - then it blocks with "the emergency brake does not reset (<causes>)".
- The autopilot logs `readying: the train stands in an emergency brake held by <causes>` and
  `readying: the emergency brake is reset`.

## To check in game

1. **BR 143, Sifa** (run 40 again): drive off with the autopilot, switch it off at 15-20 km/h and
   leave the controls alone; after about 40 s the Sifa brakes. Re-engage once standing (and once
   while still rolling: it should wait). Expected: `held by the vigilance device
   (LocomotiveConditionManager: SifaEmergency)`, `readying: SifaPedal_F pressed`, `the emergency
   brake is reset`, `DriversBrake_F` set to running, the pipe back to 5 bar, ready. If the pedal
   does not acknowledge, try 2 presses everything; if it still blocks, the reset button
   (`SifaReset_F`) is the sure one (any value change acknowledges) and readying should prefer it.
2. **PZB 1000 Hz** (BR 143 or BR 442): autopilot off before a distant signal at caution, do not
   acknowledge. Expected: `held by the train protection (LocomotiveConditionManager:
   PZBEmergency)`, `PZB_Release_F pressed` (BR 442 `PZBRelease`), reset.
3. **Emergency valve** (BR 143, standing): open `EmergencyBrakeValve_F` by hand, engage.
   Expected: `EmergencyBrakeValve_F applied`, set back to 0, the pipe recharges.
4. Afterwards redo the run 40 fill test at a normal stand: inside an emergency the handle is not
   connected.
