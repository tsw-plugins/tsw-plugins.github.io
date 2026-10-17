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
  livery. `flipped` is not read yet (always false). Sent again after every
  welcome, because the relay forgets it with the connection.

The returned `TArray`'s buffer is freed through `GMalloc` (`ObjectArray::take`).

## Spawning options on the guest

| Option | State | Notes |
| --- | --- | --- |
| `TimetableRuntimeExtensionLibrary::SpawnFormation(World, UTrainEntryDefinition*, FNetworkRibbonLocation, EDirectionOfTravel)` | proven from Lua (05 §10f) | needs a `UTrainEntryDefinition` (an existing formation asset, not one built from a consist); registers track occupancy; `K2_DestroyActor` leaves a stale occupancy GUID |
| `ATrainSpawner` actor: `TrainDefinition`, `SpawnConsist()`, `DespawnConsist()` (`TrainSpawner.h`) | untested | spawn the actor with `UGameplayStatics::BeginDeferredActorSpawnFromClass` + `FinishSpawningActor` (both UFunctions, so callable through `ProcessEvent`). `DespawnConsist` may be the clean despawn path 05 §10f is missing. Still needs a `UTrainEntryDefinition`. |
| Per-car actors without the railway simulation | not tried | no occupancy at all, but needs the view actors' meshes without their rail vehicle |

Moving: per car, `ARailVehicle::GetViewActor()` and `K2_SetActorLocation` on
the view actor at `far - GetWorldOriginLocation` (X, Y; Z unchanged), with
the cars kinematic (`SimPhysicsEnabledState`, `CurrentPhysicsMode`), proven in
05 §10f. Rotation from `fwd` is untested.

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
