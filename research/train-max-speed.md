---
name: train-max-speed
description: >-
  Where Train Sim World 7 keeps a train's own maximum speed (Vmax): the rail vehicle definition's MaximumSpeed, reached from each vehicle through CreatedFromPtr; why GetFormationMaxSpeed, the driver aid's formation limit and SimplePhysics.MaxSpeed are not it. Decompiled; tsw-sdk reader.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-22T08:15+0200
last_edited: 2026-10-22T08:15+0200
---

# A train's own maximum speed (2026-10-22)

Question from tsw-autopilot: a BR 143 (Vmax 120 km/h) ran 156 km/h under the autopilot, which
targets the line speed. Where does the game store the player train's own maximum, so the target can
be capped?

Sources: the UHT/CXX header dumps (`tsw-coop/dumps/tsw7-886/`), the Ghidra export of
`TrainSimWorld.exe` (`/var/mnt/nas/gamedumps/tsw7/binary/export/`) and the kdecomp output of every
pak (`/var/mnt/nas/gamedumps/tsw7/paks/`). Markers: **[decomp]**, **[inferred]**, **[game]**.

## Answer

**`URailVehicleDefinition::MaximumSpeed`** (`FSpeedQuantity`, m/s, offset 0x288), one per vehicle
type, reached from the spawned vehicle through **`ARailVehicle::CreatedFromPtr`**
(`URailVehicleDefinition*`, offset 0x2F0). The train's Vmax is the lowest value over its vehicles
[decomp]:

| Definition (`RVD_…`) | MaximumSpeed |
| :--- | :--- |
| `FSN_DB_BR143`, `DLG_DB_BR143` | 33.33 m/s = 120 km/h |
| `FSN/DLG/FTF/EU/TTC_…_766pbzfa` (Dosto cab car) | 44.44 m/s = 160 km/h |
| `LFR_DB_BR103`, LFR IC coaches | 55.56 m/s = 200 km/h |
| `…_BR411_…` (ICE-T cars) | 91.67 m/s = 330 km/h (placeholder-like; real 230 km/h) |
| `EU_Kijls_450`, `FTF_DB_Kijls` | 111.76 m/s (placeholder; real 100–120 km/h) |
| UK/US freight wagons, TTC 8F | 26.82 m/s = 60 mph |

110 of the 161 TSW 7 definitions set it; the rest are mostly `…_Base` assets (their children set
it) and a few TTC wagons (MK1, 16T mineral, 20T brake van) that leave it 0. Skip zeros. TSW 5's
definitions have the same field (10 set in its smaller install). Outliers like the Kijls above are
higher than any loco, so the minimum still comes from the loco.

So the FSN push-pull train is 120 km/h (loco 120, Dosto 160).

## What it is not [decomp]

- **`URailVehicleComponent::GetFormationMaxSpeed`** (`FUN_1412d5c00`): the lowest **non-zero**
  `URailVehicleComponent::MaxFormationSpeed` (offset 0xC5C) over the formation, cached per
  formation change; `FLT_MAX` when none is set. Only the BR 423/433 family sets it (38.9 m/s = 140
  km/h); the BR 143 and the Dosto do not. The driver aid's `FormationMaxSpeed` and the 160 km/h
  "formation limit" seen earlier are not the loco's Vmax.
- **`UPhysicsFunctionLibrary::GetServiceMaxSpeed`** (`FUN_14105a920`): the minimum of the
  service's timetable speed limit (when the timetable is loaded far enough) and
  `GetFormationMaxSpeed`. Same gap.
- **`RailVehicleSimplePhysics::MaxSpeed`** (in the RVM's `SimplePhysics`): the AI's simple
  physics (BR 143: 33.33 m/s with `TEvsSpeed_AI_FSN_DB_BR143_`). It happens to match here but is
  the AI model, not read for the player.
- **`SimulationNode_TractionBrakingControl::MaxSpeed`** in a loco's simulation asset (BR 143:
  33.33 m/s): the normalisation of its traction actuator curve; not every class has the node.

## tsw-sdk

`tsw_sdk_host::cab::Train::max_speed(vehicle)` (sdk 10d3d5d): walks
`URailVehicleComponent::GetFormation(whole formation)`, keeps the `ARailVehicle`s, reads
`CreatedFromPtr` then `MaximumSpeed`, returns the lowest positive value in m/s, or `None` when no
vehicle has one or the edition lacks the fields. It walks the formation, so call it once per train
(at engage or after a coupling), not per poll.

## Open

- Not read in game yet: check that `CreatedFromPtr` is set on every spawned vehicle (it is a hard
  pointer next to the soft `CreatedFrom`), on the BR 143 + Dosto (expect 33.33) and a lone BR 146.
