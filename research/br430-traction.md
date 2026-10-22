---
name: br430-traction
description: >-
  Why the FSN BR 430 S-Bahn EMU made no force: its MasterController is a combined brake/power handle with neutral at 0.5, standstill primes a 2.1 bar holding brake, and its traction lock is a LockManager_C (ActiveLockConditions, not LockConditions) that latches until the handle is back at neutral. Every lock condition, the "Traktion gesperrt" label, and the same code in the FSN and FTF BR 423/433. Decompiled.
game_build: 886 (TSW 7)
created: 2026-10-22T09:56+0200
last_edited: 2026-10-22T09:56+0200
---

# BR 430: traction, lock and holding brake (2026-10-22)

Question from tsw-autopilot: the FSN BR 430 (`RVM_FSN_DB_BR430_ETW4_C`, Frankfurt S-Bahn, service S1
35137) did not move. Readying set Battery, MainCircuitBreaker, Reverser forward, PZB_Release,
ReleaseParkingBrake and MasterController 0.5. Result: 0 kN, brake cylinder about 2.2 bar, the cab's
left display read "Traktion gesperrt", and the sdk lock reader (`TRACTION_LOCKS` in
`tsw-sdk/crates/tsw-sdk-host/src/cab/power.rs`) found no condition.

Sources: the full TSW 7 dump on the NAS (`/var/mnt/nas/gamedumps/tsw7/paks/`, kdecomp output of every
asset, made with the same kdecomp and float fix as [fsn-push-pull-traction.md](fsn-push-pull-traction.md);
see `/run/media/system/Data/tsw-decomp/NOTES.md`, "Full dumps on the NAS"). Nothing new had to be
unpacked. Files, under
`TS2Prototype-WindowsNoEditor-FrankfurtSBahn/kdecomp/TS2Prototype/Plugins/DLC/`:

- `FSN_DB_BR430/Content/Simulation/Bases/RVM_FSN_DB_BR430_ETW_Base.txt` (cab car; `ETW4` only
  forwards messages to it), parent `RVM_FSN_DB_BR430_Series_Base.txt`
- `FSN_DB_BR430/Content/Simulation/RVM_FSN_DB_BR431_MTW2.txt` (the pantograph car)
- `FSN_DB_BR430/Content/DigitalDisplay/Pages/BR430/WBP_FSN_DB_BR430_DD_TDD_Page.txt` and
  `.../Components/WBP_FSN_DB_BR430_DD_TractionGauge.txt` (cab displays)
- `FSN_DB_BR430/Content/Simulation/Simugraph/SA_FSN_DB_BR430_ETW` (simulation graph)
- `TS2Prototype-WindowsNoEditor/kdecomp/TS2Prototype/Content/Core/RailVehicles/RVM/Traction/LockManager.txt`

`@N` is a Kismet bytecode offset (ubergraph unless a function is named). Markers: **[decomp]** read
in decompiled code, **[raw]** read from the raw `.uexp`, **[inferred]**, **[game]** seen in game.

## Summary

1. **0.5 is neutral.** The `MasterController` (identifier `Throttle`) is a combined handle: 0.0
   emergency, 0.1–0.401 brake, 0.5 neutral, 0.59–1.0 power. Power is `(input − 0.55) / 0.45`. At 0.5
   the unit sends 0 demand, so 0 kN is expected with or without a lock.
2. **The 2.2 bar is the holding brake.** At a stand with the power demand below 0.1 the unit primes
   the simulation's brake hold, which holds the EP brake cylinders at 2.1 bar g. It goes when the
   demand reaches 0.1 (input ≥ 0.595) or the train moves.
3. **The lock is a `LockManager_C`**, component `TractionLockManager`, fields `bIsLocked`,
   `ActiveLockConditions`, `TemporaryLockConditions`, `bCanRelease`, `ActiveReleaseConditions`. It
   has no `LockConditions` field: that name belongs to the Class 323's `TractionLockManager_C`. The
   sdk reader matched the component name and then found no such set, so it could never list a 430
   condition.
4. **The lock latches** while the handle is out of neutral (release condition `RC_ThrottleIdle`).
   Any lock condition seen while powering or braking keeps traction locked until the handle is
   back at neutral (input about 0.45–0.545) with a change event.
5. **"Traktion gesperrt"** on the left (TDD) display is shown while `TractionLockManager` has an
   active lock condition other than `LC_ReverserOut`, `LC_ReverserNeutral`, `LC_Braking` and
   `LC_Doors`: so one of `LC_ParkingBrake`, `LC_CurrentCollector`, `LC_Penalty` (Sifa) or
   `LC_Emergency` (PZB forced brake, emergency plunger, handle at 0.0).
6. The FTF BR 423/433 uses the same code and the same handle table. The FSN BR 423/433 uses the same
   code with a different handle table. The Köln–Aachen (CTP) BR 423 has no lock manager.

## 1. The traction lock

### The manager (`Core/.../Traction/LockManager`) [decomp]

The cab car has three `LockManager_C` components: `TractionLockManager`, `EmergencyManager` and
`PenaltyManager`. All three use the same rules:

- `SetActiveLockCondition(Name, bSet)` adds the name to or removes it from `ActiveLockConditions`.
- `SetReleaseCondition(Name, bSetRelease)`: note the inverted sense. `bSetRelease = true` means
  "released": the name is **removed** from `ActiveReleaseConditions`. `false` adds it and so blocks
  the release. `bCanRelease = (ActiveReleaseConditions is empty)` (`UpdateCanRelease`).
- `UpdateIsLocked`:
  `bIsLocked = (bIsLocked && !bCanRelease) || (!bCanRelease && TemporaryLockConditions > 0) || ActiveLockConditions > 0`.
  It runs on every condition change and when `bCanRelease` turns true. On unlocking it clears the
  temporary and triggered sets.
- `TemporaryLockConditions` is filled only by `SetTemporaryLockCondition`, which the 430 does not
  call. In a latched lock, `ActiveLockConditions` can therefore be **empty while `bIsLocked` is
  true**.
- Condition names are not validated (`bValidateLockConditions` is false in the template).
- Getters: `GetIsLocked`, `GetCanRelease`, `GetAllActiveLockConditions`,
  `GetAllTemporaryLockConditions`, `GetAllReleaseConditions`. `IS_GetTractionLock`,
  `HUD_GetIsTractionLocked` and `IsTractionLocked` on the cab car all return
  `TractionLockManager.bIsLocked`.

### What sets each condition (`RVM_FSN_DB_BR430_ETW_Base`) [decomp]

The names are member variables of type `Name` whose class defaults equal the variable name (for
example `LC_Doors = LC_Doors`). The one exception is `PL_Sifa`, whose value is `TL_SifaPenalty`.

| Manager | Condition | Set while | Updated by | Clears when |
| :--- | :--- | :--- | :--- | :--- |
| Traction | `LC_ReverserOut` | `Reverser` at Out (round(output) = −1, input 0.33) | `UpdateReverserTractionLock` (Reverser and ReverserKey events @16612, @20454, @22923) | reverser in neutral, forward or reverse |
| Traction | `LC_ReverserNeutral` | `Reverser` at neutral (round(output) = 0, input 0.66) | same | reverser forward (1.0) or reverse (0.0) |
| Traction | `LC_Braking` | `MasterController` round(output) < 0 (input below about 0.45) | `UpdateMasterControllerLocal` (MasterController change event @18572) | handle at neutral or power |
| Traction | `LC_ParkingBrake` | the parking brake valve is in the apply position (`ParkingBrakeApplication.ValvePosition` = 1) | the parking-brake pressure/transition flow @15765 | parking brake released (`ReleaseParkingBrake` → message id 2 to every car → `SetParkingBrakeLocal(false)`); updated when the cylinder pressure changes |
| Traction | `LC_CurrentCollector` | `CurrentCollector.bHasRemoteSupply` false (no line supply from a pantograph in the unit) | `CurrentCollector.HasRemoteSupplyChanged` @19127 | pantograph up and breaker closed on the MTW2 |
| Traction | `LC_Doors` | not `AreConsistDoorsInterlocked(Both)` (native) | `HandleIncomingParameterChanged`, cable parameters 6/7 (every car sends "all left/right doors locked") | all doors closed **and locked** |
| Traction | `LC_Penalty` | `PenaltyManager.bIsLocked` | `PenaltyManager.OnIsLockedChanged` @22582 | the penalty clears |
| Traction | `LC_Emergency` | `EmergencyManager.bIsLocked` | `EmergencyManager.OnIsLockedChanged` @22674 | the emergency clears at a stand |
| Traction | `LC_ReverserKeyOut` | declared, never set | | |
| Traction (release) | `RC_ThrottleIdle` | blocks the release while the handle is **not** at neutral (round(output) ≠ 0) | `UpdateMasterControllerLocal` | handle at neutral: input about 0.4505–0.545 |
| Penalty | `PL_Sifa` (`TL_SifaPenalty`) | Sifa penalty brake (`Sifa.OnPenaltyBrakeStateChanged`) @22766 | | Sifa acknowledged. No release condition, so it is not latched |
| Emergency | `EC_EmergencyPlunger` | `EmergencyBrake` button pressed (> 0.5); stays set after the button is released unless the handle is in a brake position (output < 0) @18620–18850 | | button out **and** handle moved into the brake range |
| Emergency | `EC_PZB_Emergency` | PZB forced brake (`PZB.OnEmergencyChanged`) @22859 | | PZB released (`PZB_Release` lever > 0.5 → `PZB.PZB_Release`) |
| Emergency | `EC_MasterControllerEmergency` | handle at emergency (round(output) = −11, input 0.0) | `UpdateMasterControllerLocal` | handle out of 0.0 |
| Emergency (release) | `ECR_Stopped` | blocks the release while moving (speed above 0.278 m/s) | `RailVehicleSpeedChanged` @20750 | at a stand |

Not lock conditions in the 430 [decomp]: PZB/Sifa cut-out switches (`Isolate_PZB`, `Isolate_Sifa`
only enable or disable the systems), driver's brake test, train-wide coupling, a door-release
("Türfreigabe") button. Doors count only as **locked** doors (`LockState == 1`), through the native
consist check.

### The latch in practice [decomp + inferred]

- The handle's change event first updates `LC_Braking`, then `RC_ThrottleIdle`. Going straight from
  a brake position to a power position in one write therefore locks: `LC_Braking` was set and
  `bCanRelease` was false, so the lock stays latched while the handle is in power, and
  `ActiveLockConditions` is empty. The handle has to be written to 0.5 (a change event at neutral),
  then to power.
- The same holds for any other condition that comes and goes while the handle is out of neutral:
  a Sifa penalty, the parking brake, the line supply dropping.
- At neutral (`bCanRelease` true) the lock simply follows the conditions.

### Effect on the demand (`UpdateTractionAndBrakingMU`) [decomp]

It runs only while this cab is active (`JumperCable_F.bIsMaster`), from the handle's change event,
the speed-change event and the lock managers' events. The value it computes is the train-wide
demand, cable parameter 0 (float):

```
p = PowerPercent (input remap, 0..1)
v = (p ≈ 0) ? −BrakePercent : p          // brake as a negative demand
if PenaltyManager locked:  v = −0.9
if EmergencyManager locked or parking brake applied: v = −1
if TractionLockManager locked: v = min(v, 0)   // a lock removes power, keeps braking
```

Every car hands `GetIncomingParameterMaxFloat(0)` to `TractionComponent.SetPowerOrBrake`
(`HandleIncomingParameterChanged`), the `ACElectricTractionComponentV2` whose
`PowerInputSignalParameter` is `TractionBrakingControl.InputValue`. A cab whose reverser goes to Out
resets its parameters 0, 1, 2 and 4 (`UpdateReveserMU`).

## 2. The MasterController

`MasterController` (`IrregularLeverComponent`, identifier `Throttle`, default 0.5) [decomp]:

| Input | Output | Notch | Meaning |
| :--- | :--- | :--- | :--- |
| 0.0 | −11 | notch | Emergency: `EC_MasterControllerEmergency` |
| 0.099–0.1 | −10 | blocker | full service brake |
| 0.101–0.4 | −10 … −1 (linear) | range | service brake |
| 0.401–0.41 | −1 | blocker | first brake step (0 % brake) |
| 0.41–0.5 | −1 … 0 | (no notch) | |
| 0.5 | 0 | blocker | **neutral** (`RC_ThrottleIdle` satisfied) |
| 0.59–0.599 | +1 | blocker | first power step |
| 0.6–1.0 | +1 … +10 (linear) | range | power |

Converters [decomp]:

- `PowerPercent` from the **input**: 0.55..1 → 0..1. Input 0.59 → 0.089, 0.6 → 0.111, 1.0 → 1.
- `BrakePercent` from the **output**: −1..−10 → 0..1. Input 0.401 → 0, 0.1 → 1. Clamped [inferred;
  unclamped, neutral would give +0.11 demand, but the game showed 0 kN at 0.5].
- `PowerHUD`/`BrakeHUD` drive the HUD only.

So, for the autopilot: neutral = 0.5; power fraction `f` → input `0.55 + 0.45 × f` (use at least 0.6
from a stand); brake fraction `b` → input `0.401 − 0.301 × b`; 0.0 is emergency.
`HUD_GetPowerHandle` maps the PowerHUD value, so do not use it for the input.

## 3. The holding brake (the 2.2 bar)

Cable parameter 4 (bool) is computed in `UpdateTractionAndBrakingMU` @853–1394 [decomp]:

```
hold = !moving && ( reverser at neutral
                    || (hold already set in the train && v < 0.1)
                    || (hold not set && v < 0.01) )
```

`moving` = speed above `DoorInterlockSpeedThreshold` (0.278 m/s = 1 km/h). Every car passes
`GetIncomingParameterAnySet(4)` to `TractionComponent.SetAutoBrakeHoldPrimed`
(`UpdateHoldingBrakeState`, on a parameter 4 change). That is the simulation's
`BrakeHold.BrakeHoldPrimed`; the `BrakeHold` expression feeds
`DirectBrakeControlPowered.BrakeHoldActive` [decomp, graph wiring].

Node values from `SA_FSN_DB_BR430_ETW.uexp` [raw]: `DirectBrakeHoldPressure` = 311 325 Pa absolute
(**2.1 bar g**), `DirectBrakeMaxPressure` = 331 325 Pa (2.3 bar g, full EP service brake),
`MaximumBrakeCylinderPressure` = 473 642 Pa (3.7 bar g, emergency). So 2.2 bar at a stand with the
handle at neutral is the holding brake (or a full service brake; the two differ by only 0.2 bar).

Release: a demand of at least 0.1 (input ≥ 0.595) clears parameter 4 and the hold. Input 0.59 (the
first power notch, 0.089) does **not** release a hold that is already set. The `BrakeHold`
expression's byte code was not decoded, so whether it also waits for tractive effort is open
[inferred: it releases as soon as it is no longer primed].

## 4. Readying controls

| Control (identifier) | Values | Role |
| :--- | :--- | :--- |
| `Battery` (`AuxBatteryPower`) | 0.0 → −1 off, 0.5 rest, 1.0 → +1 on | `bBatteryOn` is needed for an active cab |
| `ReverserKey` (`MasterSwitch`, toggle button) | set / not set | Enables `Reverser` input (`UpdaterMasterKeyInterlocks`); only usable when no other cab in the train has its key in (cable parameter 3) |
| `Reverser` (`Reverser`) | 0.0 → −2 reverse, 0.33 → −1 Out (default), 0.66 → 0 neutral, 1.0 → +1 forward | Cab active = battery on **and** not Out (`UpdateMasterCableState` → `JumperCable_F.SetIsMaster`) |
| `Pantograph` (`Pantograph`) | 0.0 → −2, 0.33 → −1, 0.66 → 0 rest (default), 1.0 → +1 | Only with an active cab and \|output\| > 0.5: message id 0 to the MTW2: > 0.5 `DeployCollector(true)`, else breaker open and pantograph down |
| `MainCircuitBreaker` (`CircuitBreaker`) | 0.0 → −1 open, 0.5 rest, 1.0 → +1 close | Only with an active cab: message id 1 to the MTW2: close if value > 0.5 **and** the collector is deployed, else open. **Input 0.0 opens the breaker.** |
| `ReleaseParkingBrake` (`Handbrake`, push button) / `ApplyParkingBrake` | > 0.5 | Message id 2 to every car (`SetParkingBrakeLocal`) |
| `PZB_Release` / `PZB_Acknowledge` / `PZB_Override` | 0.5 rest, 0/1 → ∓1 | \|output\| > 0.5 calls the PZB function |
| `EmergencyBrake` (toggle button) | 0/1 | `EC_EmergencyPlunger` (see above) |
| `MasterController` (`Throttle`) | section 2 | demand, `LC_Braking`, `RC_ThrottleIdle`, hold |

A service-mode spawn (simulation preset other than 0) starts with the MTW2 pantograph up and the
breaker closed (`PresetConfigurationInitialization` in `RVM_FSN_DB_BR431_MTW2`) [decomp].

## 5. "Traktion gesperrt"

Two displays read the lock [decomp]:

- **TDD page** (`WBP_FSN_DB_BR430_DD_TDD_Page.UpdateTractionLock`, the left display): takes
  `GetAllActiveLockConditions` of the display's own ETW, removes `LC_ReverserOut`,
  `LC_ReverserNeutral`, `LC_Braking` and `LC_Doors`, and switches `NetForceLabelSwitcher` to index 1
  when anything is left. Index 0 is `Gesamtkraft_Label`, index 1 `Schnellbremskraft_Label_1`, whose
  culture-invariant text is "Traktion" / "gesperrt" (the strings stand in that order in the
  `.uexp`) [raw]. It updates on `OnLockConditionChanged` and when the page is built.
- **Traction gauge icons** (`WBP_FSN_DB_BR430_DD_TractionGauge.SetUnitIcon`, per unit): pantograph
  down → icon 1, breaker open → 3, parking brake → 4, otherwise the same filtered active set → 5.
- The **HUD** (`WBP_FSN_DB_BR430_HUD.UpdateTractionLock`) shows `HUD_GetIsTractionLocked`, i.e.
  `bIsLocked`, on the speedometer interlock.

So the label reacts to active conditions, not to `bIsLocked`. A latched lock with no active
condition shows on the HUD but not on the TDD label. The label in this run means one of
`LC_ParkingBrake`, `LC_CurrentCollector`, `LC_Penalty` or `LC_Emergency` was active. Since an
active condition always makes `bIsLocked` true, the run's "traction lock false" means either the
label was stale or the reader looked at the wrong object; the reader could not have listed the
condition in any case (section 1).

## 6. BR 423/433

| Variant | File | Lock | Handle |
| :--- | :--- | :--- | :--- |
| FSN BR 423/433 | `FSN_DB_BR423/.../Bases/RVM_FSN_DB_BR423_Cab_Base` | the same three `LockManager_C` and the same names, plus `LC_EmergencyPlunger` on the traction manager, `EC_ReverserMoving` (reverser moved while moving) on the emergency manager and `PL_Overspeed` on the penalty manager | 0.0 → −11, 0.1 → −10, 0.36 → −1, **0.5 → 0**, 0.65 → +1, 1.0 → +10; `PowerPercent` 0.655..1 → 0..1. Power `f` → `0.655 + 0.345 × f`; brake `b` → `0.36 − 0.26 × b` |
| FTF BR 423/433 | `FrankfurtFulda/.../FTF_DB_BR423/.../Bases/RVM_FTF_DB_BR423_Cab_Base` | `LockManager_C` (same design) | same table as the 430 (0.401 / 0.5 / 0.59, `PowerPercent` 0.55..1) |
| CTP (Köln–Aachen) BR 423/433 | `NewJourneysBR423/.../RVM_CTP_DB_BR423_Cab_Base` | no lock manager | same table as the 430 |

The FSN 423 also uses `SetAutoBrakeHoldPrimed` (the same holding brake) [decomp]. The 423 tables
were compared, not traced line by line.

## Proposal for tsw-sdk and tsw-autopilot

**sdk lock reader** (`TRACTION_LOCKS`):

- Key the table by the manager's **class**, not the component name: `TractionLockManager_C`
  (Class 323: set `LockConditions`, flag `bIsLocked`), `LocomotiveConditionManager_C` (set
  `TractionConditions`, flag `IsLocked`) and **`LockManager_C`** (sets `ActiveLockConditions` and
  `TemporaryLockConditions`, flag `bIsLocked`). For `LockManager_C` take the component named
  `TractionLockManager` (the 430/423 also carry `EmergencyManager` and `PenaltyManager` of the
  same class).
- Also report `bCanRelease` and `ActiveReleaseConditions`. With `bIsLocked` true and no lock
  condition, `RC_ThrottleIdle` in the release set means "latched; return the handle to neutral".
- Optionally list `EmergencyManager.ActiveLockConditions` and `PenaltyManager.ActiveLockConditions`
  when `LC_Emergency`/`LC_Penalty` are set, to name the cause (`EC_PZB_Emergency`,
  `EC_EmergencyPlunger`, `EC_MasterControllerEmergency`, `TL_SifaPenalty`).

**Autopilot readying for the 430 / FTF 423** (FSN 423: other handle numbers, section 6):

1. `Battery` 1.0 (then 0.5), `ReverserKey` set, `Reverser` 1.0. Check `JumperCable_F.bIsMaster`.
2. If the TDD/gauge or `LC_CurrentCollector` says so: `Pantograph` 1.0 (then back to 0.66), wait
   for the collector, `MainCircuitBreaker` **1.0** (then 0.5). Never write 0.0 to the breaker; it
   opens it.
3. `ReleaseParkingBrake` once; wait until `LC_ParkingBrake` is gone.
4. `PZB_Release` 1.0 then 0.5 if `EC_PZB_Emergency` is set; `EmergencyBrake` out; acknowledge Sifa.
5. Doors closed and locked (`LC_Doors`).
6. `MasterController` 0.5 **as a write with a change event** (if it already reads 0.5, write 0.45
   then 0.5), so `RC_ThrottleIdle` releases. Check `TractionLockManager.bIsLocked` = false and
   `ActiveLockConditions` empty except `LC_ReverserNeutral`/`LC_ReverserOut` when not in gear.
7. Power: `0.55 + 0.45 × f`, at least 0.6 from a stand (releases the 2.1 bar hold).
8. Brake: `0.401 − 0.301 × b`; emergency 0.0.
9. From brake back to power: write 0.5 first, then the power value, in separate ticks.
   If `bIsLocked` is true with no active condition, go back to 0.5.

## In-game check (for the main session)

On the drivable ETW, read `TractionLockManager.bIsLocked`, `.ActiveLockConditions`,
`.ActiveReleaseConditions`, `.bCanRelease`, `EmergencyManager.ActiveLockConditions`,
`PenaltyManager.ActiveLockConditions`, `MasterController` input/output, `JumperCable_F.bIsMaster`,
and on the MTW2 `CurrentCollector.bCircuitBreakerOpen` / `IsCollectorDeployed()`. Then set the
handle to 0.5 → 0.7 and watch the cylinder pressure drop from 2.1 bar and the force rise.

## Open

- The `BrakeHold` expression's formula (whether the hold also waits for tractive effort).
- Whether `GetCurrentValueByConverterID` clamps (assumed from the 0 kN at neutral).
- Which condition was active in the S1 35137 run.
- Whether a message from `BroadcastNewMessage` reaches the sending car itself (the parking brake
  release of the cab car).
