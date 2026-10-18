# Ghost trains from the Rust DLL (M4 groundwork, 2026-10-17)

What the guest side of `mod/native` needs to show the host's trains, and what
the game offers for it. Builds on the Lua experiments in `docs/05` §10f
(`SpawnFormation`, kinematic cars, moving the view actor), which were done
through UE4SS.

## What the host sends now

- `snapshot` at 10 Hz: the player's vehicle and the 63 nearest others
  (`Frame::relay_snapshot`), far-space position, forward vector, velocity.
- `consist` when the player's train changes (read at most once a second):
  `URailVehicleComponent::GetFormation(FrontToBack)` on the driven vehicle's
  physics component returns the cars as `TArray<AActor*>`; per car the
  `RailVehicleID`, the class name, `ARailVehicle::CreatedFromPtr` (the
  `URailVehicleDefinition`) as a full object path, and `ReskinID` as the
  livery; since the ghost build also `view` and a measured `flipped` (see
  below). Sent again after every
  welcome, because the relay forgets it with the connection.

The returned `TArray`'s buffer is freed through `GMalloc` (`ObjectArray::take`).

## Spawning options on the guest

| Option | State | Notes |
| --- | --- | --- |
| `TimetableRuntimeExtensionLibrary::SpawnFormation(World, UTrainEntryDefinition*, FNetworkRibbonLocation, EDirectionOfTravel)` | proven from Lua (05 §10f) | needs a `UTrainEntryDefinition` (an existing formation asset, not one built from a consist); registers track occupancy; `K2_DestroyActor` leaves a stale occupancy GUID |
| `ATrainSpawner` actor: `TrainDefinition`, `SpawnConsist()`, `DespawnConsist()` (`TrainSpawner.h`) | untested | spawn the actor with `UGameplayStatics::BeginDeferredActorSpawnFromClass` + `FinishSpawningActor` (both UFunctions, so callable through `ProcessEvent`). `DespawnConsist` may be the clean despawn path 05 §10f is missing. Still needs a `UTrainEntryDefinition`. |
| Per-car view actors without the railway simulation | **chosen, built, verified 2026-10-17** | `RVV_*` (`ARailVehicleView`) alone renders complete, moves and turns with `K2_SetActorLocationAndRotation`, goes away cleanly with `K2_DestroyActor`; no model, so no occupancy, no physics, nothing a real train can hit |

Moving: per car, `ARailVehicle::GetViewActor()` and `K2_SetActorLocation` on
the view actor at `far - GetWorldOriginLocation` (X, Y; Z unchanged), with
the cars kinematic (`SimPhysicsEnabledState`, `CurrentPhysicsMode`), proven in
05 §10f. Rotation from `fwd` (yaw = atan2, pitch = asin z) is used by the
built ghosts below.

## Open

- Which `UTrainEntryDefinition` to spawn for a host consist: look for a
  reference from the spawned train to the entry it came from
  (`CachedTrainEntry.h`, timetable services), or build one at runtime from
  the consist's `URailVehicleDefinition`s.
- Content: a host train from a DLC the guest owns but has not loaded needs
  `RequestContentLoadSynchronous` first (05 §8).
- Testing alone: `tsw-coop-emu` can replay a recorded telemetry file as the
  host (scenario with `source = { kind = "replay", max_vehicles = 64 }`); its
  consist has no definition paths, so a live host is needed for spawning by
  definition.

## Built: view-actor ghosts in `mod/native/src/ghost.rs` (2026-10-17)

Spike first (Lua, Frankfurt Hbf): a `RVV_FTF_DB_BR423_Cab_Base_C` spawned with
`BeginDeferredActorSpawnFromClass` + `FinishSpawningActor` and **no model
actor** rendered as a complete car (bogies included), moved and turned 90
degrees with `K2_SetActorLocationAndRotation`, and disappeared with
`K2_DestroyActor`. That removes the three open problems of the
`SpawnFormation` route at once: stale occupancy, collisions/derailments with
real trains, and the missing despawn.

Protocol: `ConsistVehicle` gained `view`, the class path of the car's view
actor (`/Pkg/RVV_X.RVV_X_C`). The host reads it with
`AModelActor::GetViewActor()`; `definition` (`CreatedFromPtr`) is null for AI
and timetable cars, the view never is. `flipped` is now measured on the host:
the view actor's yaw against the physics forward vector (more than 90 degrees
apart). Snapshots carry the physics heading, so a guest turns a flipped car
by 180 degrees.

Guest: `Net` remembers the host from the welcome and hands the host's
consists and snapshots (and "host gone" on leave, disconnect or room change)
to `Ghosts`. Per consist car: the view class is looked up by path, or loaded
with `LoadClassAsset_Blocking(Conv_SoftClassPathToSoftClassRef(MakeSoftClassPath(path)))`
and accepted only if it derives from `ARailVehicleView` (a host cannot make
a guest spawn arbitrary actors). Every frame each car is drawn at the
snapshot's far position plus velocity × age (at most 0.5 s), eased with a
0.15 s time constant, snapped beyond 50 m; far → local is `far - origin`
with the origin read every frame.

Verified in game (experiment `dumps/tsw7-886/experiments/ghost-native-8/`):
the game joined Frankfurt-Fulda free roam as **guest** of a replayed host
(`tsw-coop-emu`, recorded AI train, consist rewritten to a Training Centre
BR 146 + 7 mineral wagons, lifted 3 m to tell it from real trains). The log
shows the consist, both classes loaded by path (137 ms and 35 ms, content of
another route), and 8 cars spawned in 50 ms; positions followed the recording
along the track, 15 m apart; a screenshot from beside the track shows the
wagons passing. When the replay host's run ended, the relay reported "host
left (Closed)", the guest logged "ghost: host gone, removing 8 cars" in the
same millisecond, and a probe a minute later (after garbage collection)
found no ghost view actor left. Not yet seen: a flipped car with a real `flipped` flag (the
replayed consist had none, so two reversed cars of the recorded train were
drawn backwards), liveries (`ReskinID` is not applied), lights, doors and
pantographs (the view actor's animations are driven by its model, which a
ghost lacks), and AI traffic (guests ghost only the host's own train).
