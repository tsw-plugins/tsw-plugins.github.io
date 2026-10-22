---
name: br143-drag-and-battery
description: >-
  The FSN BR 143's residual 0.8 bar brake cylinder pressure with the brake pipe at 5 bar (an overcharged distributor control reservoir stored in the loco's simulation preset, read from the node data and the native distributor code), what clears it, and the BR 143 battery switch's real logic (five positions, on at 0.25/0.75, off at 0/1). Decompiled.
game_build: 886 (TSW 7)
created: 2026-10-22T19:30+0200
last_edited: 2026-10-22T19:30+0200
---

# FSN BR 143: residual brake drag and the battery switch (2026-10-22)

Two questions from tsw-autopilot, scenario `RegionalbahnBreakdown` (FSN BR 143 + Dosto cab car
766pbzfa):

1. With the train brake in running (`DriversBrake_F` 0.10), both direct brakes at full release
   and the brake pipe at 5.0 bar g, the BR 143's own brake cylinder reads 0.8 bar g (HUD 1.77–1.80
   abs) from the scenario start. Holding `BrakeRelease_F` brings it to about 0.5 bar while held,
   back to 0.8 within ~2 s of letting go. On the cab-car leg the cab car's cylinders read 0 while the
   BR 143 held 0.35–0.5 bar.
2. On a cold BR 143, readying held `BatteryControl` up from 0.5 for 1.5 s, twice, and the battery
   stayed off (`BatteryOff` in the lock manager).

Sources: `FSN_DB_BR143/Content/Simulation/RVM_FSN_DB_BR143` (blueprint) and
`Simugraph/SA_FSN_DB_BR143` (simulation graph) in `TS2Prototype-WindowsNoEditor-FrankfurtSBahn`,
plus the same assets of the DLG BR 143, FTF BR 114, BR 146.2 (DLG, FTF, TTC) and the Dosto cars.
Native code: `TrainSimWorld.exe` (build 886) through the headless Ghidra scripts. Markers:
**[decomp]** read in decompiled data or code, **[native]** in the decompiled exe, **[inferred]**.

## Summary

- **The drag is the loco's air distributor, held on by an overcharged control reservoir that
  the loco's simulation preset stores.** The BR 143's `SA_FSN_DB_BR143` preset for the running
  states (`RunningStopped`, `RunningActive`, configuration `Default`) holds the distributor's
  `ControlReservoir` at **5.43 bar g** (captured with the brake pipe empty and the brakes fully
  applied). When the train's pipe charges to 5.0 bar, the distributor's charging valve stays shut
  (it opens only while the control reservoir is less than 0.069 bar above the pipe), so the control
  reservoir is never pulled back to 5.0, and the distributor holds
  `(CR − BP) / 0.42` ≈ 0.8–1.0 bar in the cylinders [decomp + native].
- Only the FSN BR 143 has it. The DLG BR 143 stores 5.02 bar, the BR 146.2 (DLG, FTF, TTC) 4.99,
  the FTF BR 114 has no preset (initial 4.9 bar), and the Dosto cars store an empty control
  reservoir that charges from the pipe [decomp].
- Nothing the driver has resets the control reservoir: the blueprint never touches
  `DistributorReleaseValve` (the valve that would empty it), `BrakeRelease` empties only the
  distributor's cylinder output (`BrakeCylinder_ReleaseValve`), and `BrakeCharge_F/_B` are not
  bound to anything [decomp]. What does bring it down:
  - the distributor's own slow leak (`DistributorLeak`, the "Angleicher"): roughly 0.3 bar per hour
    [inferred], which matches 0.8 bar at the start and 0.35–0.5 bar later in the run;
  - a brake pipe raised to within 0.069 bar of the control reservoir (≥ ~5.36 bar g), which opens the
    charging valve, followed by a return to 5.0 bar **slow enough for the control reservoir to follow
    through its 2.54 mm choke** (well under ~0.1 bar/s near the end) [native + inferred].
    A short fill stroke with a quick return does the opposite: the control reservoir follows the pipe
    up and is stranded higher on the way down. That is why the fill strokes of runs 19–23 made the
    drag worse (0.8–1.0 bar), as the autopilot found before it dropped them.
- **The battery switch** is a five-position rotary switch, not a spring switch: input 0..1 is output
  −2..2; on each change the blueprint takes `round(|output|)`: 1 (inputs **0.25 and 0.75**) switches
  the battery **on**, 0 and 2 (inputs **0, 0.5 and 1**) switch it **off**.
  Holding it up from 0.5 ends at 1.0, which is off. Set it to 0.25 (the game's own running preset
  does that) [decomp]. Readying in tsw-sdk now does this (see "Changes").

## 1. What holds the cylinders [decomp]

The loco's brake cylinders (`BrakeCylinder`, `BrakeCylinder_1`, which the HUD shows) are filled by
the relay valve `BrakeIntensifier` (coefficient from `R Mode Memory`: 1.0 at a stand, 1.447 in R
above 70 km/h). Its control chamber is the higher of three pressures, through double check valves:

| Input | Path | At a stand, released |
| :--- | :--- | :--- |
| Direct brake | `StraightAirRes_F/_B` (one per cab) → `DoubleCheckValve_DirectBrake` | 0 (handles at full release) |
| Anti-slip / hill start | `0.8BarRes` (fed by `0.8 Bar Limiter`, 0.8 bar g) through `AntiSlipBrakeValve`, opened by the expression `WSP / Hill Start` | closed: needs `TractionBrakeTransition` > 0.4 (in traction) **and** wheel slip or `BrakeAssist` at 0 (output −1, "Anfahrhilfe") |
| Indirect (train) brake | `AirDistributor` → `BrakeCylinder_Auto` → `BrakeShutoffValve` → `IndirectBrakePressure(Distributor)`; or the EP blending `IndirectBrakePressure(ElectricControl)` | **the 0.8 bar** |

So the 0.8 bar limiter is not it (it needs traction or slip), the direct brakes are released, and
the blending path is empty without electric braking. What is left is the distributor.

Expressions, decoded from their byte code (opcodes: `01 n` push input n, `02 n` push constant n,
`03 1 n`/`03 2 n` the same inside a branch, `0c` <, `0e` >, `1e`/`1f` and/or short-cut jumps,
`1d` jump, `04 1`/`04 2` min/max, `08` ×, `09` ÷, `12` return):

- `Brake Bypass` = `(BrakeBypassMemory || BCC < 1.2 || BP < 3.0) ? 0 : BCC`, where `BCC` is
  `BrakeCylinder_Auto` (the distributor's output, **before** the intensifier) in bar g. It is the
  electric brake's demand (`ElectricBrakeActuator` = min(140 000 × it / 3.8, 140 000) N) and the
  loco's `TractionBrakingConverter.ExternalBrakeSetPoint`, whose value above 1.25 sets the
  traction lock `TLConditionBrakingConverter` ([fsn-push-pull-traction.md](fsn-push-pull-traction.md)).
- `BlendedBrakingFunctioning` = `(ElectricBrakeActuator > 0 && TractionBrakeTransition < 0.1) ? 2 : 1`
  → `BrakeShutoffValve`: while the electric brake works, the distributor's air is cut off from the
  cylinders.
- `WSP / Hill Start` = `TractionBrakeTransition > 0.4 && (HUD_Slipping || BrakeBypassSwitch.OutValue1)`;
  `BrakeBypassSwitch.OutValue1` is 1 with `BrakeAssist` at input 0 (output −1).
- `R Mode BrakeBoost` = `IsRMode && (Speed > 19.44 m/s || (Speed > 13.89 m/s && IsFastR))`.

Correction to the 71 km/h theory in [fsn-push-pull-traction.md](fsn-push-pull-traction.md): the
intensifier sits after `Brake Bypass`, so it cannot raise `ExternalBrakeSetPoint`. The traction
lock follows the distributor output directly: it trips once `BrakeCylinder_Auto` passes 1.25 bar,
i.e. once the control reservoir is about **0.5 bar above the pipe**. With the preset's 5.43 bar that
needs the pipe only ~0.1 bar under 5.0 (or a fill stroke that raised the control reservoir).

## 2. The distributor [native]

`FSimulationNode_AirDistributor` (vtable `TSW+0x3e7f108`; step `0x1206300` caches the pin
pressures: pin 1 BP at +0xb8, pin 3 BC at +0xd0, pin 4 CR at +0xe8, pin 0 MR, pin 2 aux).

- Main control valve (slot 41, `0x11fb470`):
  `f = (CR − BP) − MainControlValveBrakeCylinderRatio × BC_gauge`, ratio **0.42**. Aux → BC opens
  while `f` is above 68.9 Pa, BC → exhaust while it is below −68.9 Pa (`MainControlValve`
  min differentials), so BC settles at `(CR − BP) / 0.42`. No insensitivity band beyond 69 Pa.
- Charging valve (slot 4, `0x11e98a0`, ports 1↔4): BP and CR are connected, both ways, **only
  while `CR − BP` < `ChargingValveOperatingPressureDifferential` = 6894.76 Pa (0.069 bar)**
  (`FUN_1411f78c0` = CR − BP, compared with +0x80). Through `ControlPipeToControlResDiameter`
  2.54 mm.
- So the control reservoir follows the pipe up freely, follows it down only while it stays within
  0.069 bar, and is isolated once it is more than that above it.

Node values (from the `.uexp`, see "Reading node data"): `AirDistributor`
`ChargingValveOperatingPressureDifferential` 6894.76 Pa, `MainControlValveBrakeCylinderRatio` 0.42,
`MaximumBrakeCylinderPressure` 4.81 bar abs; `ControlReservoir` 14.7 l, `InitialPressure` 5.91 bar
abs; `DistributorLeak` (AirValveVariableFlow, CR → exhaust) 0.254 mm, `CutoffFactor` 0.02, open;
`DistributorReleaseValve` 12.7 mm, closed, never driven; `BrakeCylinder_ReleaseValve` 5 mm,
closed, driven by `BrakeRelease` (≥ 0.5 → open, `UpdateBrakeRelease`).

## 3. The preset [decomp]

Every node with state carries `PresetConfigurations` (`Default`, `DeadInTrain`) with `Parked`,
`RunningStopped` and `RunningActive` data; an air volume's state is its air mass (kg). Pressure =
m·R·T/V with R = 287.05, T = 288.15 K (checked against `0.8BarRes` 0.80, `5 Bar Aux Reservoir`
5.02 and `Aux Res` 10.0 bar g). FSN BR 143, `Default`, running states:

| Node | bar g |
| :--- | :--- |
| `ControlReservoir` (distributor) | **5.43** |
| `BrakeCylinder_Auto`, `BrakeCylinder` | 3.80 (the distributor's limit: brakes fully applied) |
| `AirPipe (BP)` | 0.0 |
| `FV4_ControlReservoir` (the brake valve's) | 3.40 |
| `ServiceReservoir` | 8.61 |

The same survey on the other classes (`ControlReservoir`, running states): DLG BR 143 5.02, BR 146.2
(DLG, FTF, TTC) 4.99, FTF BR 114 no preset (`ControlRes`, 4.9 initial), Dosto 766pbzfa / 780pza
(FSN, DLG) empty (charges from the pipe, so no residual: the cab car's 0 bar).

The blueprint's `PresetConfigurationInitialization` handler only sets controls (battery, handbrakes,
pantographs, breaker, lights); it does not touch the brakes [decomp].

## 4. What a driver does, and the autopilot

- **Nothing quick and certain exists on this loco.** The drag is 0.8–1.0 bar on the loco only; it
  costs some braking force and power, and it trips the brake traction lock only if the control
  reservoir gets ~0.5 bar above the pipe.
- **Do not give fill strokes** on the FSN BR 143 (each one can raise the control reservoir further).
  The autopilot already dropped them (`b14d4ae`).
- Do not use `BrakeRelease` against it: it lowers the cylinders only while held.
- It fades by itself through the leak: from ~1.0 bar at the start to ~0.4 bar after the first leg,
  gone when the control reservoir is back within 0.069 bar of the pipe (about an hour) [inferred].
- A possible fast fix, **not tried**: raise the pipe just above the control reservoir (≥ 5.4 bar g)
  and bring it back to 5.0 slowly, e.g. fill in short pulses on a falling pipe-pressure ramp of
  ~0.01 bar/s, watching the loco's cylinder. Whether the FV4 valve's own return from a fill is slow
  enough is not known from the code read so far. An autopilot fix waits for the in-game check below.

### In-game check (for the main session)

On the FSN BR 143 at a stand, released, read `GetNodePinFloatParameter` on the loco's
`Simulation` runtime: `ControlReservoir.Pressure_BAR_G`, `AirPipe (BP).Pressure_BAR_G`,
`BrakeCylinder_Auto.Pressure_BAR_G`, every 0.25 s.

1. Expect CR ≈ 5.3–5.4, BP 5.0, BC_Auto ≈ (CR − BP)/0.42.
2. Hold `DriversBrake_F` at 0.0 until BP ≥ CR + 0.05, then back to 0.1. Log until steady. If CR
   ends within 0.07 bar of BP and BC_Auto at 0, a fill held to that point and released is the fix.
   If CR is stranded higher, the return is too fast: try the pulsed ramp.

## 5. The battery switch [decomp]

`BatteryControl` (`IrregularLeverComponent`, identifier `AuxBatteryPower`, rotary):
`ValueMap` 0 → −2, 1 → +2 (linear), notches 0, 0.25, 0.5, 0.75, 1 (no blockers),
`DefaultInputValue` 0.25. Named positions (output): "Ein/On" −1.5..−0.5 and 0.5..1.5, then
"Aus/Off" −2.5..2.5.

`BndEvt__BatteryControl_…` → ubergraph @55965: `switch (round(abs(NewValue)))`: 1 →
`Set_BatteryState(true)` (@56184), 0 and 2 → `Set_BatteryState(false)` (@56200).
`Set_BatteryState` stores `bBatteryState` and calls `HandleBatteryStateChanged` (PIS, displays,
the `BatteryOff` traction-lock condition, `OnBatteryStateChange`). No timing, no edge detection
beyond "a change event with this new value".

| Input | Output | Effect when moved there |
| :--- | :--- | :--- |
| 0 | −2 | off |
| 0.25 | −1 | **on** |
| 0.5 | 0 | off |
| 0.75 | +1 | **on** |
| 1 | +2 | off |

Presets: `Parked` sets input 0 and the battery off; the running presets set 0.25 and on. The DLG
BR 143 has the same switch. In the failed readying, holding up from 0.5 passed 0.75 (on) and ended
at 1.0 (off). Every move ends in what its last change event says, so only a set that ends at 0.25
or 0.75 leaves it on; the manual sequence and the later hold left it on only through where their
last event landed (not reconstructed). The cab shows "Aus" at 0.5 too, which agrees.

## Changes (2026-10-22)

- tsw-sdk `8c169a7` and `9cccf02` (`cab::ready`): a battery switch that names "Ein"/"On" and stays there is
  **set** to that position; the traction lock's battery condition (`BatteryOff`) counts as proof it
  is off, whatever the switch reads, and the battery is tried up to three times (already at "Ein"
  but off: set to a position outside "on" first, then back; the battery is off, so nothing is
  cycled). A battery that reads on is never
  cycled. A spring switch without a named position is held up as before. `output_target` ignores
  the same name again and a later range that takes in the whole wanted one (the cab shows the
  first matching name). Tests in `cab/ready/tests/battery.rs`.
- tsw-autopilot `1b3eb0c` (`readying`): the battery switch's "Ein" inputs come from its map and
  notches (0.25 on the BR 143), never from a sweep (which would switch it on and off).

## Reading node data

`/run/media/system/Data/tsw-decomp/tools/simnodes/`: `simgraph.py` (pin graph from the kdecomp
text), `tagstream.py` (every tagged property in a `.uexp`, linear), `nodedata.py` (each node's
struct in node order, presets decoded; start offset = the first property after the node list),
`prespress.py` (reservoir presets in bar g), `crpreset.sh` (all of it for one simulation asset).
The native distributor code is in `tsw-decomp/ghidra/out/distributor/`.
