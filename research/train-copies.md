---
name: train-copies
description: >-
  Real copies of the host's trains on a guest (concept stage G3): spawning at a track position, what moves a spawned train, and what boarding does to it. Experiments 1-4 of 2026-10-20.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-20T19:55+0200
last_edited: 2026-10-20T21:35+0200
---

# Real train copies on a guest (G3, 2026-10-20)

The concept (design/tsw-coop-concept, "guests live in the host's world") needs the host's trains
as **real** trains on a guest, because the game routes player input, hardware controllers
included, only into a train the pawn controls, and only a real train can be walked in or sat
in. This page collects what the game offers for that, and what was tried.

Experiments: tsw-coop `dumps/tsw7-886/experiments/g3-follow/` (Lua through the debug bridge,
`scripts/tswlua -f <file>`), Training Centre timetable, a single BR 146 (`TTC_146_Light`).

## What the game offers (header dump)

- **Spawn at a track position:**
  - `UTimetableRuntimeExtensionLibrary::SpawnFormation(World, UTrainEntryDefinition*,
    FNetworkRibbonLocation, EDirectionOfTravel)`.
  - A world point becomes a track position with `FindTrainSpawnLocationNearLocation(FVector,
    out FNetworkRibbonLocation)`. `AdvanceTrackLocation(..., DistanceCM, Dir, out Loc)`
    moves it along the track, and `GetTransformAtTrackLocation` turns it back into a
    transform. `IsRibbonLocationValidForSpawn` checks the result.
- **A track position is** `FNetworkRibbonLocation { FGuid RibbonReference; float
  RibbonLocation }`.
- **A spawn definition for any consist:** the formation designer's UGC formations
  (`CreateUGCFormation`, `AddSubFormationInstance`, `FindUGCFormationByName` →
  `UTrainEntryDefinition*`). Untried; this is the candidate for building the host's consist
  on a guest.
- **Physics state per vehicle** (`URailVehicleComponent`):
  - `SimPhysicsEnabledState`: Disabled / Kinematic / DynamicDirect / DynamicIndirect.
  - `CurrentPhysicsMode`: Dynamic / Static / Kinematic / Disabled.
  - `SimplePhysics` (`FRailVehicleSimplePhysics`): role Master/Slave,
    `TargetEffortOrBrakeFraction`, `CurrentEffortOrBrakeFraction`, `bStop`. It is set by
    `SetSimpleEffortOrBrakeCoefficient(float, bool bStop)`.
  - The full physics position lives in `FSimulationNode_RailVehicle::PivotNodePhysicsState`
    (`FSimPhysicsSerializableWrapper_PivotNodePhysicsState`, 0x158 bytes at node +0x3C0,
    node at component +0x158). It is not reflected; `tsw.peek` / `tsw.poke` (tsw-sdk
    2d1adce) are there to study it.

## Experiments

| # | What | Result |
| --- | --- | --- |
| 1 | Spawn a BR 146 on clear track (`spawn.lua`, 1.2 km point) | 1 vehicle; **kinematic** (state 1, mode 2), simple-physics **Master**, `bStop` |
| 2 | Not boarded: `SetSimpleEffortOrBrakeCoefficient(0.5)` for 8 s, then −1 | **Moves under the mod's control**: ~11 m/s after 8 s, slows on −1. The kinematic train follows the track by itself |
| 3 | Board it (`SetControlledDrivable`) | Works, and the game switches it to **full physics** (state 2 DynamicDirect, mode 0 Dynamic). Simple-physics effort no longer acts. ⚠️ It kept its speed with every brake released and ran away down the Training Centre gradient (101 km/h backwards); setting the brake controls by name stopped it |
| 4 | Boarded: write state Kinematic / mode Kinematic, then effort 0.3 | The write takes, and **the game restores full physics within 1 s**; no movement from the effort |

## What follows

- **Unboarded copies are solved in principle:** spawn at the host's track position, then
  steer each formation with simple-physics effort (a position/speed controller on the
  host's snapshots). This covers the host's AI traffic, passengers and probably standing in
  a cab (to be tried: a pawn inside a moving kinematic train).
- **The guest in the driver's seat is the hard case.** Boarding is what routes input and
  controllers into the train, and boarding forces full physics, which the mod cannot steer
  the way it steers a kinematic train. Options, to be tried in this order:
  1. **Write the track position** of the boarded copy in `PivotNodePhysicsState` (find its
     layout with `tsw.peek` while the train moves): small corrections every frame, the
     controls driving the simulation in between.
  2. **Mirror all controls** onto the boarded copy (both games simulate the same inputs) and
     correct the drift with option 1 only rarely.
  3. **Input without boarding:** capture the guest's controller input at the player
     controller (`Begin*/EndUsingVHIDComponent`) while the pawn stands in a kinematic copy.
- **Safety:** a copy that becomes dynamic must get the host's brake states at once, or it
  runs away.

## Found in the headers afterwards (2026-10-20 evening)

- **Any single vehicle spawns:** `URailVehicleDefinition` derives from
  `UTrainEntryDefinition`, so `SpawnFormation` takes a vehicle's own definition, the path a
  host's consist already carries (`ConsistVehicle::definition`). A whole consist would need a
  `UTrainFormation` (`TArray<FTrainFormationEntry> Formation`): `UGameplayStatics::SpawnObject`
  exists in this build, but the array has to be written natively.
- **No reflected teleport** for a rail vehicle. The simple physics keep their 1D state in
  `FRailVehicleSimplePhysics::PhysicsState` (`FSimPhysicsSerializableWrapper_Mechanical1DData`,
  0x80 bytes at component +0x9D0): the next candidate for holding a copy exactly, with
  `tsw.peek`.
- **Free Roam is the sandbox:** its `ASandboxManager` spawns trains, removes them
  (`StartRemovingTrain(URailVehicleComponent*)`) and sets them paths
  (`SetDestinationForRV`). tsw-coop removes a guest's own AI with it (G2).
- **AI vehicles often have no definition** (`CreatedFromPtr` null; proto
  `ConsistVehicle`), only a view class: copying the host's AI (G6) needs a view class →
  definition map, from the loaded definitions' `ViewActorAsset`.

## The implementation (tsw-coop 57ff6a9, setting `train_copies`, off by default)

The guest spawns the host's lead vehicle from its definition at
`FindTrainSpawnLocationNearLocation(host car)`, finds the new `ARailVehicle` by comparing
the live ones before and after, and every capture sets
`SetSimpleEffortOrBrakeCoefficient` from the gap along the copy's forward axis
(`copy/follow.rs`: the host's speed plus half the gap per second, full effort at 2 m/s
error). More than 50 m off or 4 m to the side: placed again. Facing against the host's
motion: placed again the other way round. Boarded: left to its controls (G4). Its ghost is
not drawn meanwhile.

### Tried in game (2026-10-20 evening, tsw-coop ef21d1c)

Game as guest, the headless host (`HEADLESS_PATH` from `g3-follow/track-path.lua`) running a
BR 146 back and forth on 270 m of Training Centre track at 5 m/s.

- `FindTrainSpawnLocationNearLocation` returns false for every point (UE-local, far, the
  pawn's own spot). The spawn position is found instead by walking the track from
  `FindTrainSpawnLocationNearDriverPawn` (3 km each way, 10 m then 1 m steps): 0.0–0.5 m
  off, in about 1 ms.
- The copy's own coordinates, sampled every second by `g3-follow/sample-copy.lua` and
  projected on the host's track: **0.00 m off the track**, **4.9–5.1 m/s along it** (the
  host: 5.0). The mod's gap log at the same time: −22 to +1 cm.
- After a respawn it overshoots to 10.6 m/s and settles within about 8 s.
- A host reversing gets a respawn (simple physics drive forwards only): a visible jump.
- `K2_DestroyActor` on a copy hides it at once; its model actor lingers about 8 s, reporting
  one shared location, then goes.
