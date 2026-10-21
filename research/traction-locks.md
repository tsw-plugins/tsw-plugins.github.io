---
name: traction-locks
description: >-
  Why a TSW 7 loco can show full power and make no force: the latched traction locks of the BR 110 (simulation graph), the BR 143 (AFB speed selector and condition manager) and the Class 323, the native traction-converter gates beneath them, the BR 110 brake valve's lever table, and start sequences an autopilot can follow. Decompiled, partly confirmed in game.
game_build: 886 (TSW 7)
created: 2026-10-21T20:15+0200
last_edited: 2026-10-21T20:15+0200
---

# Traction locks: BR 110, BR 143, Class 323 (2026-10-21)

Question from tsw-autopilot: the autopilot readied a train, set power, and it did not move.
On the BR 110 the throttle was at 1.0 with the brake in "Fahrend" and the brake pipe at 4.1–4.6 bar;
on the BR 143 the power control was set and the loco made 0 kN. What exactly blocks traction?

Sources: blueprints and simulation assets unpacked from the paks and decompiled (2026-10-21; tools
in [native-code.md](native-code.md)), and the native code read with headless Ghidra. Paths below
are under `/run/media/system/Data/tsw-decomp/out/` and offsets are Kismet bytecode offsets in those
files (`@N`). Markers: **[decomp]** read in decompiled code, **[raw]** decoded from the raw
`.uexp` because the decompiler showed 0 (see "Decompiler caveat"), **[game]** seen in game,
**[inferred]**.

Summary for the autopilot (what it does now is in
[safety-systems-and-hud.md](safety-systems-and-hud.md)): all three classes **latch** their lock,
and each clears it only when the power control is back at zero. Setting power while any interlock
holds, even for a fraction of a second, locks traction until power is taken off again.

## BR 110 (`RVM_LFR_DB_BR110_399`, simulation `SA_LFR_DB_BR110_W29t`)

The throttle, brake handle, main breaker and reverser all feed the vehicle's simulation graph.
The decompiler does not print graph expressions, so they were decoded from the raw node properties
(`SA_LFR_DB_BR110_W29t.uexp`, around offsets 239013–242760) [raw]. The opcode reading is the
agent's own decode, consistent across all 32 expression nodes (e.g. `HLL<2.5` decodes to
`HLLPressure < 2.5 ? 1 : 0`) [inferred].

### The lock

| Node | Expression | Inputs |
| :--- | :--- | :--- |
| `ForceRunDown_1` (feeds `W29t Antrieb.ForceRunDown`) | `MCB<1 \|\| DynBrake>0 \|\| TrainBrake>0 \|\| Reverser==0 \|\| FastOff==1 \|\| Emg>0` | `MCB` = `CurrentCollector.HasSupplyVoltage`; `DynBrake` = `DynamicBrakeInput.Result`; `TrainBrake` = `TapMode==1 ? 0 : AutoAirBrakeValve.HandlePosition`; `Reverser` = `ReverserState.Result`; `FastOff` = the emergency-off button; `Emg` = brake pipe below 2.5 bar |
| `ShouldLockTraction` | `(TRLockActive && !Nullstellung) \|\| RunDown` | `TRLockActive` = `TractionLock.OutValue0` |
| `TractionLock` | a value-transition node, target `ShouldLockTraction`, 20/s; output 1 from position 0.5 | |
| `Nullstellung` | `Wheel==0 && Impulse==1 && Tap==0` | throttle at 0 and the tap changer at tap 0 |
| `MTS_CUT` | `TractionLock ? 1 : FahrBremsWender.OutValue0` | the lock also switches the motor circuit away from power |

Nothing else sets or clears `TRLockActive`; it is the lock's own output fed back. So the lock sets
while any run-down condition holds and **clears only at Nullstellung** [raw].

### The throttle and tap changer

- `Throttle_F` is a `SimpleLeverComponent` with 29 notches and `MaximumOutputValue` 28 [raw]. Its
  output is a **target tap index** (0–28), not a force demand: input 1.0 asks for tap 28. It goes to
  `WheelOperator.WheelState` in `UpdateThrottleAndBrakeMU` @365–547 [decomp].
- `TapChangeOperator`: wheel equal to tap → hold, above → increase, below → decrease. The tap changer
  moves 0.4 s per tap [raw].
- The throttle drives the tap changer only when **exactly one** cab is master (`TapChangerMode` set
  in `UpdateActiveCab` @1006–1053); otherwise multiple-unit impulses apply [decomp].
- `HandleMotorCurrentOverload` opens the main breaker above 3395 A total motor current [decomp]. A
  jump straight to tap 28 from standstill can trip it. Dovetail's forum advice is to notch up
  slowly and stay around 40 kN [web]; in game the HUD showed 0 kN at power 1.0 until the breaker
  was closed again with the throttle at 0 [game].

### Other gates in the blueprint

- Cab active: `UpdateActiveCab` @25–222, master = reverser output not 0 and battery on. The
  reverser input is enabled only with `ReverserKey_F` (identifier `MasterSwitch`) in
  (`HandleReverserInterlock` @311–394) [decomp].
- Reverser lever: input 0 → −1, 0.33 → 0, 0.66 → +1, 1.0 → +2; forward ("V") is input 1.0 [raw].
- Main breaker `MainCircuitBreaker_F` is spring-return (0 open, 1 close, rests at 0.5); it closes
  only with a single active cab and line voltage (`UpdateMCB` @276–523) [decomp].
- Pantograph rises only with a single active cab and the main reservoir at 4.5 bar or more
  (`UpdatePantograph` @362–500) [decomp].
- A PZB forced brake raises the brake handle position to at least 0.4
  (`UpdateTrainBrakeLocal`, `FMax(handle, IsForcedBrake ? 0.4 : −1)`), which runs the tap changer
  down [decomp].
- Not gates: the traction-motor fans (they auto-start at tap 8 or more), handbrake, compressor,
  Sifa pedals [decomp].

### The brake valve as the graph sees it

`TrainBrake_F` (identifier `AutomaticBrake`) [raw]:

| Input | Output | Position |
| :--- | :--- | :--- |
| 0.0 | −1.0 | Füllstoß (fill and release, not a notch) |
| 0.1 | 0.0 | Fahrend (running) |
| 0.2 | 0.2 | Mittelstellung / Abschluss (default; brake key notch) |
| 0.3 | 0.3 | service braking starts (blocker) |
| 0.4–0.7 | 0.4–0.7 | service braking |
| 0.8 | 0.8 | full service (blocker) |
| 1.0 | 1.0 | Schnellbremse (emergency) |

- Handle-to-pressure curve: 0 → 0.95, 0.2 → 0.95, 0.3 → 0.768, 0.4 → 0.650, 0.8 → 0. Valve springs
  3.4 to 5.0 bar gauge. So the target is about 3.4 + f × 1.6 bar: 4.92 at Fahrend, 4.63 at 0.3,
  4.44 at 0.4, 4.18 at 0.5 [raw, inferred]. A pipe at 4.1–4.6 bar therefore means the graph sees
  the handle at roughly 0.3–0.5.
- At exactly 0.2 (`HandlePosition` = `Input==0.2`) `IsolateEPV` closes and the valve is cut off
  from the pipe [raw].
- `BrakeKey_F` (2 notches): the brake handle's input is enabled only with the key in, and the key
  turns only with the handle at 0.2 (`HandleBrakeKey` @10–205) [decomp].
- **`AutoAirBrakeValve.HandlePosition` updates only on the levers' change events.** It is written
  only by `UpdateTrainBrakeLocal`, which runs from `Initialize`, the `TrainBrake_F/B` change events
  (@34135, @34154) and the PZB overspeed handler (@34725) [decomp]. A value set without a change
  event leaves it stale [game: it stayed at 0.2 after the lever reached 0.1 through 0.2, and at −1
  after leaving Füllstoß].

### What latched the lock in the test [inferred]

Live samples at 1 Hz showed the lock going to 1 with run-down and Nullstellung both 0, right when
the brake handle moved from input 0.0 (Füllstoß) to 0.1 (Fahrend) with power demanded. The likely
cause is the coupling of the train brake to the dynamic brake (`UpdateBrakeLeverCouplingF`
@357–452): at input 0.1 `DynamicBrake_F` is set to about 0.054, its change event writes
`DynamicBrakeInput`, `DynBrake > 0` makes run-down true for less than a second, and the lock
latches. To confirm, log `DynamicBrake_F` and `DynamicBrakeInput.Result` faster than 1 Hz.

### Diagnostics

Read `TractionLock.OutValue0` (or `HUD_GetIsTractionLocked`), `W29t Antrieb.CurrentTapIndex`,
the brake pipe's `Pressure_BAR_G` and `CurrentCollector.HasSupplyVoltage`.
`IS_GetCurrentTapIndex` is a stub that always returns 0 [decomp].

## BR 143 (`DLG_DB_BR143`, `RVM_DLG_DB_BR143`)

The BR 143 has no throttle. It drives through the AFB (automatic driving and braking): the driver
sets a target speed and a force limit.

### Controls [raw]

- **`SpeedSelector_F`** (identifier `Throttle`): input 0–0.025 → output −1 = **Off**; 0.05–0.1 →
  0 km/h; from 0.125 to 1 linear to 120 km/h in 10 km/h steps, `kmh = 120 × (in − 0.075) / 0.925`
  (0.3 → 30 km/h). `SetAFBActive` writes it as `AFBController_SetPoint` in m/s (@6297–6301). Output
  ≥ −0.5 means "on" (cable parameter 3, required by `IsPowerHandleOn` @5796–5806).
- **`ForceSelector_F`**: input 0..1 → 0..1.2, default input 0.8333 (= 1.0). Traction is
  `MapRangeClamped(Force × ActuatorOutput, 0, 1.2, 0, MaximumTractiveEffort)` in `TickAFB`
  (@5627–5630), with `MaximumTractiveEffort` 288 000 N. **A force selector at 0 means no traction.**
  Electric braking maps to up to 150 kN (@5642).
- **`DrivingProgram_F` / `Program_F`**: spring-centred, input 0 → −1, **0.5 neutral**, 1 → +1.
  `DrivingProgram_F` −1 is "brake only" (traction off), +1 turns automatic braking off; `Program_F`
  +1 drives to the setpoint and then switches both off (`Set_RunningProgram` @6573–6600). Writing
  input 0 to `DrivingProgram_F` kills traction. Any speed-selector move resets to program 0
  (`OnMovedAFB` @5710).
- `AuxiliaryControl_F` steps the tap changer by hand, only with the selector at exactly 0 km/h; an
  autopilot does not need it.
- Reverser: traction needs exactly one of the forward/reverse signals (cable parameters 5/4) and a
  braking demand below 1 (`GetTargetTractiveEffort` @6012–6040).

### The lock (`Core/RailVehicles/RVM/Traction/LocomotiveConditionManager`) [decomp]

- `UpdateIsLocked` (@238): `IsLocked = (IsLocked && !CanRelease) || TractionConditions > 0`.
  `CanRelease` holds only when no release condition is set. The release conditions are
  `SpeedSet_F/B` (set whenever the selector is not Off, @2441, @7873) and `ELM_Release_Stopped`
  (set by an emergency, cleared only at a stand, @7560–7572).
- So once locked, traction stays locked until every lock condition is clear **and the selector has
  been at Off**.
- Lock conditions: `BatteryOff`; `PantoRaisedCBOpen` (no supply); `TLM_ReverserNeutral`;
  `DoorInterlock` (OK on a single loco); **`TLConditionBrakingConverter`: `ExternalBrakeSetPoint` >
  1.25** (@7577–7582; most likely brake cylinder pressure, formula not decoded); `TLM_AFB_Reset`;
  AFB active without supply; Sifa penalty and PZB emergency (`TractionFromPenalty`,
  `TractionFromEmergency`).
- AFB reset ("Nullstellungszwang"): every change of active cab sets `bAFB_ResetRequired` (@5900);
  it clears only with the selector Off **and** the tap changer at tap 0 (`TryReset_AFB`
  @6802–6806).
- AFB on: `OnMovedAFB` (@5701–5709) runs `SetAFBActive(selector on && breaker closed && !lock &&
  doors OK)`, and only when the selector or the lock changes. `TickAFB` outputs nothing without a
  closed breaker and an active AFB (@5548–5552).
- The brake cylinder at 0.8 bar does not block by itself (threshold 1.25); it is probably the
  "0.8 Bar Limiter" holding brake, released under power [inferred].
- `TLM_BrakeKey` is declared but never set; the brake keys only enable inputs.

### Start sequence [inferred from the code]

1. Keep `SpeedSelector_F` at input 0.0 (Off) while readying; `ForceSelector_F` at 0.8333 (or 1.0).
2. Battery, reverser key, pantograph, main breaker; wait for supply voltage.
3. Reverser forward (input 1.0); train brake to "Fahrstellung", direct brake to −1 (release);
   wait for brake cylinder below 1.25 bar; acknowledge Sifa and PZB.
4. Leave `DrivingProgram_F` and `Program_F` at 0.5.
5. Write `SpeedSelector_F` = 0.0 again so a change event fires, then check
   `LocomotiveConditionManager.IsLocked` and `bAFB_ResetRequired` are false (if not,
   `GetAllTractionConditions` names the blocker).
6. Set the speed: `0.075 + 0.925 × kmh / 120`.
7. If the lock returns (brake application, Sifa, PZB, breaker trip): back to step 5.

In the earlier test, the one run that drove at input 0.3 was a moment with nothing locked
[game].

## Class 323 (`TTC_Class323`, `RVM_TTC_Class323_CabBase`) [decomp]

- `TractionLockManager` conditions: `TL_NoRemoteSupply`, `TL_EmergencyState`, `TL_LowMainRes`,
  `TL_DRA_Switch` (the UK driver's reminder appliance).
- Release condition `TR_ThrottleIdle`: the power handle has to return to idle.
- `EmergencyConditionManager`: door interlock, reverser moved while moving, low brake reservoir,
  plunger, deadman and AWS penalties, the throttle's emergency position, reverser off.
- In game: cold, the lock holds `LowMainResPressure` until the compressor has the main reservoir
  above 6.7 bar (sets below 6.2); see [ready-any-train.md](ready-any-train.md) [game].

## The native gate underneath

From Ghidra ([native-code.md](native-code.md)): `FSimulationNode_ACTractionConverterV2::Step`
(`TSW+0x126d550`) zeroes the power demand when the brake pipe is below
`BrakePipeMinimumPressureForPower` with `bTractionLockOnLowBPPressure` set, when the converter is
manually isolated, or when its demand input is bound to something else. The motors also get no
voltage unless the collector is fully raised, the breaker closed and no `LocalPowerCut` fault is
active. *When* a safety system isolates traction is decided in blueprints, as above.

## Decompiler caveat

`kdecomp` printed every plain float in component templates and class defaults as 0 (lever value
tables, notches, `MaximumOutputValue`, `MaximumTractiveEffort`). The fault is in the default case
of `Value()` in `tsw-decomp/tools/kdecomp/Program.cs`. Values marked [raw] were read from the
`.uexp` files with throwaway parsers. As of 2026-10-21 afternoon this was not fixed; check before
trusting floats in other decompiled files.

## Open

- The formula of the BR 143's "Brake Bypass" node behind `ExternalBrakeSetPoint`.
- Whether the BR 110's lock latch in the test really came from the dynamic-brake coupling (needs
  faster sampling).
- Whether `SetCurrentInputValue` ignores `bInputEnabled` (the BR 110 brake key case).
