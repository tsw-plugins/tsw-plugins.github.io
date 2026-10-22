---
name: brake-fill-positions
description: >-
  Which TSW 7 trains have a fill (release, Füllstoß) position below their train brake's running position, which do not, and how a driver releases standing brake drag on each kind. Survey of every RVM's automatic-brake lever (decompiled).
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-22T08:15+0200
last_edited: 2026-10-22T08:15+0200
---

# Brake fill positions and releasing brake drag (2026-10-22)

Question from tsw-autopilot (todo 1.14): on long trains the brakes do not release fully after a
stop until the driver's brake valve is held in its fill position for a moment (found on the FSN
push-pull, [fsn-push-pull-traction.md](fsn-push-pull-traction.md)). The autopilot's departure
fill stroke assumes such a position. Which classes lack it, and what does a driver do there?

Method: every `RVM_*.txt` of the TSW 7 kdecomp dump (`/var/mnt/nas/gamedumps/tsw7/paks/`), every
lever with `InputIdentifier` `AutomaticBrake`, read from its `ValueMap`: the German/European valves
map their running position to output 0 and a fill position below it to output −1 [decomp]. The
`DefaultInputValue` is only where the lever spawns (often a braking position), not running. Plus
the classes whose train brake is part of a combined handle. Not tried in game.

## Classes with a fill position below running

| Class (RVM) | Lever | Fill (output −1) | Running (output 0) |
| :--- | :--- | :--- | :--- |
| BR 143 (FSN, DLG), BR 114 (FTF) | `DriversBrake_F/_B` | 0.0 | 0.1 |
| BR 146.2 (DLG, FTF), BR 185 (DLG), BR 146 (TTC) | `TrainBrake_F/_B` | 0.0 | 0.1 |
| Vectron (FTF) | `TrainBrake_F/_B` | 0.0 | 0.1 |
| BR 103, BR 110 (LFR), Bnrdzf cab car (LFR) | `TrainBrake_F/_B` | 0.0 | 0.1 |
| Dosto 766 cab car (FSN, DLG, FTF, EU, TTC) | `TrainBrake` | 0.0 | 0.1 |
| BR 442 (DLG) | `TrainBrake` | 0.0 | 0.35–0.4 |
| BR 411 ICE-T (DLG, FTF) | `TrainBrake` | −0.083 | 0.0 |

Class 66 (`F_AutoBrake`) has a release position at −1 that springs back to running (0), per the
ready-any-train survey; it acts like a fill position held by hand. The BR 363 shunter's
`DriversBrakeValve_L/_R` maps 0 → 0, 0.25 → 1, 0.41 → 2 (no −1 output): its lowest position is
probably the D2 valve's fill position, but that is not certain from the map alone.

## Classes without one

| Kind | Classes | How the brakes release | What a driver does about drag |
| :--- | :--- | :--- | :--- |
| EMUs with a combined master controller and EP brake | BR 423/433 (FSN, FTF, CTP), BR 430 (FSN), Class 323 (TTC) | The controller commands the brake directly (electro-pneumatic, per car); there is no separate brake valve to fill | Nothing to fill. Controller to neutral/drive releases at once; drag at a start is the holding brake, which releases with power. |
| US-style 26L automatic brake | SD40-2 (TTC), NJT bi-level and Rotem cab cars (TTC, MPB) | Input 0 (output −1) is **Release**, which is also the running position; the next notch (output 0) is minimum reduction. Nothing lies below release and there is no overcharge | Keep the automatic brake in Release and wait for the brake pipe to recharge (90/110 psi); bail off the loco's own brake with the independent brake. |
| Vacuum brake | 8F (TTC) | `VacuumBrake` 0 = released (output 0) | Use the large ejector to restore vacuum faster; there is no position below release. |

So the fill stroke is only meaningful for the German/European valves in the first table. On a
26L valve the "fill" the autopilot holds is just Release, which is right anyway (the 3 s hold costs
time but does no harm); on the EMUs there is no brake lever to hold.

## Separate release and charge controls [decomp]

`BrakeRelease` (Lösetaste, loco-only brake release) exists on BR 143 (FSN, DLG), BR 185, BR 114 and
BR 363; `BrakeCharge` (Angleicher/overcharge) on six classes, and the Dosto cab car has
`BrakeOvercharge`. The release button empties the loco's own brake cylinders without touching
the train; it is the fix when only the loco drags (and the loco's residual pressure is what trips
the FSN BR 143's brake traction lock at 70 km/h, see
[fsn-push-pull-traction.md](fsn-push-pull-traction.md)).

## For the autopilot

- Decide "has a fill position" per brake lever: its lowest input lies below the named running
  position (the rule `tsw-sdk` `cab::ready` already applies for the readying fill). A 26L valve
  whose running position is Release at the bottom then needs no stroke.
- Without one: no fill stroke; for drag rely on release + waiting for brake pipe pressure, and for
  a dragging loco press `BrakeRelease` where present.
- Untested in game: classes in the second table with a long consist (US freight) and whether the
  drag exists there at all.
