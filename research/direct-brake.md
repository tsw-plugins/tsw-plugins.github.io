---
name: direct-brake
description: >-
  The locomotive's own brake (direct, independent or straight-air brake, "Zusatzbremse") in TSW 7: how the FSN BR 143's DirectBrake works (decompiled: positions, outputs, the straight-air reservoir per cab, the double check valve), why the train brake does not release it, which trains have one under which name, the lever kinds (staying vs sprung release), and how tsw-sdk's ready planner releases it.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-22T10:50+0200
last_edited: 2026-10-22T10:50+0200
---

# The direct brake (Zusatzbremse) (2026-10-22)

Question from tsw-autopilot (run 26, FSN scenario RegionalbahnBreakdown, BR 143 + Dosto cab car
766pbzfa): on its first leg the BR 143 dragged with the brake pipe at a full 5.0 bar and the brake
cylinder still at 0.9 bar, full power, stuck at 15 km/h. On the cab-car leg the cab car's cylinder
read 0 bar while the BR 143 at the far end still held 0.35–0.5 bar at the same pipe pressure.
The loco has `DirectBrake_F`/`_B`, and tsw-sdk's control families knew no direct brake, so readying
never touched it.

Sources: the TSW 7 pak dumps on the NAS (`/var/mnt/nas/gamedumps/tsw7/paks/`, kdecomp output, see
[native-code.md](native-code.md)), display names from each plugin's `.locres` (de and en), the
controls survey of [ready-any-train.md](ready-any-train.md) (`survey-tsw7.jsonl`, 19 formations).
Main file: `TS2Prototype-WindowsNoEditor-FrankfurtSBahn/kdecomp/TS2Prototype/Plugins/DLC/FSN_DB_BR143/Content/Simulation/RVM_FSN_DB_BR143.txt`
and its simulation graph `Simugraph/SA_FSN_DB_BR143.txt`. Markers: **[decomp]** read in decompiled
code or data, **[raw]** from a raw asset, **[inferred]**, **[game]** seen in game.

## Summary

1. The BR 143's `DirectBrake_F`/`_B` ("Direkte Bremse", input identifier `IndependentBrake`) is a
   non-self-lapping straight-air valve: "Lösen" releases at a rate, "Halten" keeps whatever
   pressure is in it, "Anlegen" applies at a rate. Left in "Halten" after an application, it holds
   the loco's cylinders on for good. [decomp]
2. Each cab has its own valve and its own straight-air reservoir; both reach the cylinders through
   a double check valve (the higher wins). A rear-cab handle in "Halten" with pressure in it keeps
   the loco braked whatever the front one does. The train brake (`DriversBrake_F`) does not
   release it. [decomp]
3. The lever spawns at −1 ("Lösen", full rate). Nothing in the blueprint's preset handling or in
   the scenario's objectives (scenario B, `FSN_ScB_*`) sets it. Which state produced the 0.9 bar
   in run 26 is therefore not proven; a direct brake left in "Halten" (either cab) is the one path
   in the graph that holds the cylinders with the pipe at 5 bar besides an overcharged
   distributor. [decomp + inferred]
4. `Handbrake_F/_B` is a separate mechanical brake (simulation nodes `HandBrake_1/2`,
   `ApplicationValue` = lever value, 0 released "Gelöst", 1 "Vollständig angelegt"); it is not in
   the cylinder pressure. `BrakeRelease_F/_B` ("Bremse lösen", a push button) opens
   `BrakeCylinder_ReleaseValve` only while pressed, venting the distributor side
   (`BrakeCylinder_Auto`), not the direct brake. [decomp]
5. tsw-sdk now has a direct brake family and readies every cab's direct brake to its full
   release; the autopilot never sets it while driving and releases the loco's at a change of ends.

## 1. The BR 143's direct brake [decomp]

Both levers (`IrregularLeverComponent`, `DefaultInputValue = -1`):

| Input | Output | Notch | Named position (de / en) |
| :--- | :--- | :--- | :--- |
| −1 … −0.15 | −1 … 0 (linear) | blocker −1..−0.15 | "Lösen {Release}" / "Release {Release}" (output −1.5..−0.005) |
| −0.15 … 0.15 | 0 | blocker | "Halten" / "Hold" (−0.005..0.005) |
| 0.15 … 1 | 0 … 1 (linear) | blocker | "{Apply} anlegen" / "Apply {Apply}" (0.005..1.5) |

Value converters `Release` (output −1..−0.005 → 100 %..0 %) and `Apply` (0.005..1 → 0..100 %)
fill the `{Release}`/`{Apply}` numbers. `UpdateDirectBrake` (on either lever's change event) writes
both levers' outputs to the simulation nodes `DirectBrake_F` and `DirectBrake_B`, value converters
on the curve `CV_DirectBrakeHandlePositionToValvePosition`: the release flow is −output (1 at −1,
0 at 0), the apply flow rises with a positive output.

Simulation graph (node names): `LimitingValve_F → Direct_Apply_F → StraightAirRes_F`,
`StraightAirRes_F → Direct_Release_F → BrakeValveExhaust`, the same for `_B`;
`StraightAirRes_F` and `StraightAirRes_B` → `DoubleCheckValve_DirectBrake` →
`DoubleCheck_Direct/WSP` (with the anti-slip brake's 0.8 bar) → `Direct/Indirect Double Check`
(with the distributor's `IndirectBrakePressure`) → `BrakeIntensifierControlReservoir` →
`BrakeIntensifier` (relay) → the two bogies' cylinders through `G1/1`/`G1/2` hold and release
valves. At "Halten" neither flow is open, so the straight-air reservoir keeps its pressure.

`HUD_GetLocomotiveBrakeHandle` returns the higher of the two levers' outputs.

## 2. Which trains have one

From the controls survey (19 formations) and the decompiled levers:

| Class | Control(s) | Range | Rests at | Release position | Lever kind |
| :--- | :--- | :--- | :--- | :--- | :--- |
| FSN/DLG BR 143, FTF BR 114 | `DirectBrake_F`, `_B` | −1..1 | −1 | "Lösen {Release}" −1..−0.15 (blocker) | stays |
| TTC/FTF BR 146.2, FTF Vectron | `DirectBrake_F`, `_B` | 0..1 | 0.5 "Halten" | "Vollständig lösen" 0, "Lösen" 0.25 (no notch) | **sprung**: notches only at 0.5 and 1 ("Vollständig anwenden") |
| DLG BR 185 | `DirectBrake_F`, `_B` | 0..1 | 0 | "Lösen" 0 (notch) | stays |
| TTC Dosto cab car 766pbzfa | `DirectBrake` | 0..1 | 0 | "Lösen" 0 (notch) | stays |
| TTC Class 66 | `F_DirectBrake (Irregular Lever)`, `B_…` | −1..1 | −1 | "Lösen" −1 (notch) | stays |
| LFR BR 103, BR 110 | `LocoBrake_F`, `_B` | −1..1 | −1 / 0 | "Lösen {Release}" −1..−0.2 (notch range) | stays |
| DLG BR 363 | `IndependentBrakeValve_L`, `_R` | −1..1 | 0 | "Lösen {Release}" −1..−0.2 | stays |
| TTC SD40-2 | `IndependentBrake` | 0..1 | 0.25 | "Lösen" 0.1..0.25 (notch 0.25); 0 "Entlüften" (bail off) | stays |
| FTF Vectron | `SS_DirectBrake_FL/FR/BL/BR` (shunting stations) | 0..1 | 0.5 | as the cab's, every position notched | not readied (see below) |

Every one has the input identifier `IndependentBrake`. No train in the survey uses
"EngineBrake", "Zusatzbremse" or "StraightAirBrake" as a control name. Class 323, BR 411, BR 442,
BR 430 and BR 423 have none (EP brakes through the train brake or the combined handle).

## 3. What tsw-sdk does with it

- `cab::family::Family::DirectBrake`, base names `directbrake`, `independentbrake`,
  `independentbrakevalve`, `locobrake`; identifier `IndependentBrake`. The Vectron's shunting
  station levers (`ss_directbrake`) are left out: they rest at "Halten", every position is
  notched, and how they combine with the cab's valve was not read.
- `family::every` lists every cab's control of a family (own cab first); readying reads all
  direct brakes, not one per family, since each cab's valve holds the cylinders on its own.
- The ready planner (`cab::ready`) checks each one after the train brake. The release position is
  found by name (`lös…`, `vollständig lös…`, `gelöst`, `release…`, `full release`) in input or
  output values, the inputs of an output range from the lever's own map. A lever that stays there
  is set to the end of the range at the travel's end (`direct_release`: −1 on the BR 143, the full
  release rate, not the middle) and checked like the train brake. A lever whose release springs
  back (`Seen::stays` false: no notch inside the release range, BR 146 and Vectron) is held towards
  it for 4 s once, and lets go to "Halten".
- tsw-autopilot never moves a direct brake while driving (it drives power, train brake and
  reverser only). At a change of ends it releases every direct brake of the train it leaves (the
  loco behind its cab car), since readying from the cab car sees only the cab car's controls;
  a thorough re-ready runs the same direct brake checks again.

## Open

- What applied the BR 143's direct brake in run 26 (the readying log of the next run prints the
  levers' values: `readying: DirectBrake_F (DirectBrake) target …` and the set).
- A cab car that spawns first, with the loco at the far end already braked by its direct brake, is
  not covered: readying does not reach another vehicle's controls.
- The `BrakeHold`/anti-slip parts of the BR 143's cylinder pressure (0.8 bar limiter) were not
  traced further.
