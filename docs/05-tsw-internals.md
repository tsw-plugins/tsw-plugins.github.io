# 05 — TSW internals (from the TSW 7 build 886 dump)

Everything here was read from `dumps/tsw7-886/` (UHT headers of the
`TS2Prototype` module plus the in-route object dump taken on the Training
Centre map). Names are exact and verified on TSW 7 build 886. Behaviour
described as "presumably" has not been exercised yet.

## Summary of answers to the open questions in 04-roadmap

| Question | Answer |
| --- | --- |
| Track-relative position accessor? | Yes. The track network is a graph of `UNetworkRibbon` objects addressed by `FGuid`; positions are `FNetworkRibbonLocation { FGuid RibbonReference; float RibbonLocation; }`. The game's own spawner takes exactly this. The vehicle's live ribbon position is not exposed as a reflected getter, but `URailVehicleComponent::GetPosition()` returns a double-precision `FFarVector` that is independent of the UE world origin. |
| World origin / tile scheme? | Both. TSW keeps a double-precision "far" coordinate system (`FFarVector`, `FFarMatrix`) on top of UE's origin rebasing (`UWorld::SetWorldOriginLocation`). `URailVehicleComponent` exposes a `WorldOriginChangedDelegate(FVector WorldOffset)`. `CurrentTile` in the HTTP API is `FIntPoint` from `FTS2PlayerInfo`. Send far coordinates or ribbon locations, never raw `AActor` transforms. |
| Spawning `RVM_*` outside the game's spawner? | Not needed. `UTimetableRuntimeExtensionLibrary::SpawnFormation(World, UTrainEntryDefinition*, FNetworkRibbonLocation, EDirectionOfTravel)` is a static, Blueprint-callable spawner that builds a full consist at a ribbon location. `ATrainSpawner` is a placeable actor that does the same. Simulation can then be switched off per vehicle (`ESimPhysicsMode::Kinematic`/`Disabled`). |
| Dispatcher track occupancy? | `ATrackNetworkManager::TrackSectionsMap : TMap<FGuid, FTrackNetworkSection>`, each section carrying `OccupationRailVehicleIds : TArray<FGuid>` (the `URailVehicleComponent::RailVehicleID`). `ADispatcher` consumes sections via `AcquiredSectionsMap` and `TrackCircuitTimers`. Occupancy is a plain array of GUIDs; a ghost can be made "real" to the signalling by appending its vehicle IDs to the right sections. |
| Asset availability / DLC detection? | `UDLCManagementFunctionLibrary::IsAssetPathLoadable(World, Path)`, `CachedContentContainsDLC`, `IsDLCOwned(ID)`, and `UTrainEntryDefinition::RequiredDLCPlugins : TArray<FName>`. |

## 1. Actor model: model actor + view actor

TSW separates simulation from rendering per vehicle:

- `ARailVehicle : AModelActor` — the simulated vehicle. Holds
  `URailVehicleComponent* RailVehiclePhysicsComponent`, the
  `URailVehicleDefinition` it was created from (`CreatedFromPtr`,
  `ReskinID`, `UDTGReskin* Reskin`), cab layouts, and
  `FindVirtualHIDComponent(FName)`.
- `ARailVehicleView : AViewActor` — the visual twin. `AViewActor` keeps a
  weak `ModelActor` pointer; `AModelActor::GetViewActor()` /
  `GetModelActor()` link the two. `URailVehicleDefinition` names both
  classes: `ModelActorAsset : TSoftClassPtr<ARailVehicle>` and
  `ViewActorAsset : TSoftClassPtr<ARailVehicleView>`, plus
  `AdditionalViewActorAssets` and the end-of-train device pair.
- `AModelActor::GetFarMatrix()` / `GetFarLocation()` give the far-space
  transform (`FFarMatrix { FVector XAxis, YAxis, ZAxis; FFarVector Origin; }`,
  `FFarVector { double X, Y; float Z; }`).

Consequence for ghosts: strategy A in 03-architecture ("mesh ghost") maps
directly onto spawning only the **view actor class** from the remote
vehicle's definition and driving its transform. Strategy B ("real vehicle,
simulation disabled") maps onto spawning the model actor via
`SpawnFormation` and setting its physics mode to kinematic.

In the Training Centre dump there was 1 live `RailVehicle`, 121
`RailVehicleComponent` and 116 `SimulationComponent` instances (the
`RVM_*` blueprints are subclasses, so the class-name count undercounts).

## 2. Simulation (SimuGraph)

- `USimulationComponent : UActorComponent` owns the graph:
  `USimulationAsset* SimulationGraph` (the asset) and
  `USimulationRuntime* SimulationGraphInstance` (the running instance),
  `ESimPhysicsIntegationMethod IntegratorMethod`, `bEnableParallelism`,
  `ResetSimulation(ESimulationPreset, FName ConfigName)`.
- `URailVehicleComponent` is the vehicle-level physics owner:
  `FSimulationNode_RailVehicle Node` (dimensions, mass, buffers, couplers,
  `bDerailed`, pivot tree), `FRailVehicleSimplePhysics SimplePhysics`,
  `ERailVehicleSimPhysicsEnabledState SimPhysicsEnabledState
  { Disabled, Kinematic, DynamicDirect, DynamicIndirect }` and
  `ESimPhysicsMode CurrentPhysicsMode { Dynamic, Static, Kinematic, Disabled }`
  (both private, but reachable through UE4SS property access).
- `ESimulationPreset { ParkedPreset, RunningStoppedPreset, RunningActivePreset }`
  with `ApplySimulationPreset(Preset, ConfigName)` and
  `ResetPhysics(Preset, ConfigName)`.
- Useful reflected getters on `URailVehicleComponent`: `GetPosition()`
  (`FFarVector`), `GetWorldTransform()` (`FFarMatrix`), `GetVelocity()`,
  `GetForwardsVelocity()`, `GetForwardVector()`, `GetAngularVelocity()`,
  `GetLength()`, `GetFormationLength()`,
  `GetFormation(EActorConnectionIterationMode) : TArray<AActor*>`,
  `GetNextRailVehicle(ESide, ESide& ConnectedSide)`, `GetBogieRotation(int)`,
  `GetAxleCount()`, `IsDerailed()`, `DistanceTravelled`.
- Direct overrides that exist for the game's own tooling and look tailor
  made for ghost placement: `SetOverrideLocation(const FVector&)`,
  `SetOverrideSpeed(float)` on the component, and
  `ARailVehicle::SetOverrideLocation(const FVector&)`. Whether they work
  while the vehicle is kinematic is the first thing to test in M5.
- Bogies are `FSimulationNode_Bogie` nodes inside the graph; there is no
  separate bogie actor.

## 3. Track network and positions

- `ATrackNetworkActor` (8 instances on the Training Centre map, one per
  streamed tile presumably) holds `Ribbons : TArray<UNetworkRibbon*>`,
  `Nodes`, `Junctions`, a `FIntVector WorldLocation`, and lookups
  `FindRibbon(FGuid)`, `FindNode(FGuid)`, `FindJunction(FGuid)`.
- `UNetworkRibbon` (485 instances): `RibbonGuid`, `StartNodeGuid`,
  `EndNodeGuid`, `Curve`, `VerticalCurve`, `FIntVector WorldLocation`,
  `FRibbonTrackSections TrackSections` (which signalling sections the
  ribbon crosses), `TrackRule`, gauge, super-elevation, `bIsDynamic`.
- Position types, all GUID-based and therefore stable across tile
  streaming and origin rebasing:
  - `FNetworkRibbonLocation { FGuid RibbonReference; float RibbonLocation; }`
  - `FNetworkRibbonRange { FGuid RibbonReference; float RibbonStart, RibbonEnd; }`
  - `FTrackNetworkFollower { UNetworkRibbon* Ribbon; float RibbonLocation; EDirectionOfTravel Direction; }`
  - `FNetworkPathServiceFollower { ESide FormationSide; double DistanceOnPath; … }` for timetable services.
- Geo helpers (static, on `UTS2DebugFunctionLibrary`, not the gameplay
  library as 02-prior-art assumed): `GetActorLatLong(Actor, Lat, Long, ok)`,
  `GetActorLatLongString`, `LatLongToFarVector(Lat, Lon, Alt, WorldActor, OutPos)`.
  `UTS2GameplayFunctionLibrary` has `GetWorldLocation(World, Lat, Long)` /
  `SetWorldLocation` (route anchor) and `GetDistanceFromGeoLocation`.

**Recommended snapshot position encoding** (replaces the open choice in
03-architecture): per vehicle send the far-space transform from
`GetWorldTransform()` (double X/Y, float Z, three axes) plus the
`FNetworkRibbonLocation` once a reflected way to read the live ribbon
follower is found (the follower lives inside the simulation runtime; the
HTTP API's `DriverAid.Data` proves the game computes it). Far space is
already origin-independent, so tile and origin rebasing are a non-issue
for transport; they only matter when converting to a local `FVector` on
the receiving side (`LatLongToFarVector` shows the conversion exists).

## 4. Spawning consists

- `UTimetableRuntimeExtensionLibrary` (Blueprint function library):
  - `static void SpawnFormation(UObject* World, UTrainEntryDefinition* TrainEntry, const FNetworkRibbonLocation& RibbonLoc, EDirectionOfTravel LocalSpawnDir)`
  - `static TArray<UTrainEntryDefinition*> FindSpawnableFormations(const TArray<FString>& Search)`
  - `static bool FindTrainSpawnLocationNearDriverPawn(ADriverPawn*, float DistanceCM, FNetworkRibbonLocation& Out, EDirectionOfTravel& OutDir)`
  - `bool FindTrainSpawnLocationNearLocation(FVector, FNetworkRibbonLocation& Out)`
  This is the sandbox/free-roam spawner and is callable from Lua via
  `StaticFindObject` on the default object.
- `ATrainSpawner : AActor` (placeable): `TrainDefinition`,
  `bAutoPossess`, `bSpawnOnBeginPlay`, `bApplyPreset`, `PresetConfig`,
  coupling spring parameters, `SpawnConsist()`, `DespawnConsist()`.
- Definitions: `UTrainEntryDefinition : UDataAsset` (abstract;
  `RequiredDLCPlugins`, `bIsDrivable`, `GetRailVehicleBP(int)`,
  `GetApproximateLength()`), `URailVehicleDefinition` (single vehicle:
  model/view classes, `RailVehicleClass`, `LiveryID`, `MaximumSpeed`,
  `VehicleCategory`, electrification, `ApproximateLength`),
  `UTrainFormation` (`Formation : TArray<FTrainFormationEntry>`, each entry
  a `TrainEntry` plus `bFlipped`, substitution rules, cargo preload) and
  `UUGCFormation` for user formations.
- Spawn lifecycle hooks on `URailVehicleComponent`:
  `PostTimetableFormationSpawned`, `ApplyPresetConfiguration`,
  `OnFormationChanged`, `PerformServiceSetupTask`, `OnCouple/OnUncouple`.
  `ARailVehicle::OnSpawn()` is the per-actor entry.

So the ghost pipeline for strategy B is: look up the remote vehicle's
`URailVehicleDefinition` by class path, check `IsAssetPathLoadable`, build
or find a `UTrainFormation`, call `SpawnFormation` at the remote ribbon
location, then set `SimPhysicsEnabledState = Kinematic` and keep the
vehicle out of any timetable service.

## 5. Timetable, services and AI driving (for strategy C and L4)

- `ARouteTimetable` (2 instances) owns services as `FRouteTimetableService`
  structs: `Name`, `ServiceClass`, `CurrentPath : FNetworkPath`,
  `PathFollower`, `DriverPermissions : EServiceDriverPermission { Player, AI, Both }`,
  `CurrentState : ERouteTimetableServiceState { NotStarted, Running, Complete, Cancelled }`,
  `AIDriver : TLazyObjectPtr<ATS2AIController>`, `bSpawnWithEngineer`,
  `bSandboxCreatedService`, section acquisition counters.
- Lookups: `FindServiceNameForRailVehicleActor(AActor*)`,
  `FindServiceNameForRailVehicleID(FGuid)`, `IsRailVehicleActorInService`,
  `GetServiceRunningState`, `SetServiceDriverPermission(FName, EServiceDriverPermission)`.
- `ATS2AIController` is the AI driver. Reflected controls are coarse:
  `SetMovementLocked(bool)`, `SetBlockDoorLock/Unlock`, `OnInstructionArrived`.
  There is no reflected "set target speed"; the AI follows the service path
  and signalling. Strategy C (drive a native AI consist to a remote
  position) would have to fight this through `SetOverrideSpeed` or by
  hooking the AI tick, which confirms the roadmap's "research only" rating.
- Shared-AI option 2 from 03-architecture (host streams its AI as ghosts)
  needs only `FindServiceNameForRailVehicleActor` to tag each host consist
  with its service name, so clients can suppress their local copy of the
  same service via `SetServiceDriverPermission` or by not spawning it.

## 6. Signalling and track occupancy (for L4)

- `ATrackNetworkManager : AInfo` (2 instances): `TrackSections : TMap<int32, FTrackNetworkSection>`
  and `TrackSectionsMap : TMap<FGuid, FTrackNetworkSection>`.
- `FTrackNetworkSection { FGuid TrackSectionID; TArray<FTrackNetworkSectionElement> SectionElements; TArray<FSignalPropertyReference> ReferencingSignals; TArray<FGuid> OccupationRailVehicleIds; bool bWithinYard; }`.
  Each element has `PrevTrackSectionID`, `NextTrackSectionID`, start/end
  signal references and a `FNetworkMultiRibbonRange` (list of
  `FNetworkRibbonRange`) describing which ribbon spans it covers.
- `ADispatcher : AInfo` (1 instance) holds `AcquiredRoutes`,
  `AcquiredOverlaps`, `AcquiredSectionsMap : TMap<FGuid, FDispatcherAcquiredSection>`,
  `EntryRequests`, `TrackCircuitTimers`, `ApproachReleaseTimers`, level
  crossings, and exposes `RequestEnterDispatchedNetwork(FName Service)`,
  `RequestPassSignalAtDanger`, `TrainTriggerLevelCrossing`,
  `BlockLevelCrossing`.
- `ESignalRouteOccupancy { Clear, ClearCallOn, Occupied }` is what signals
  derive from section occupancy. Save games persist
  `FSaveGameOccupiedTrackSection { TrackSectionID, OccupiedByRVs }`, which
  confirms the occupancy model is "set of vehicle GUIDs per section" and
  nothing more.

**Feasibility verdict for M7:** a dispatcher hook looks feasible without
strategy C. A ghost needs a `RailVehicleID` GUID, and the mod must add that
GUID to `OccupationRailVehicleIds` of every section whose ribbon ranges the
ghost's vehicles overlap, and remove it when it leaves. Two things are
unknown and need a live test: whether the game recomputes occupancy from
physics every tick (overwriting the array) and whether signals read the
array directly or through a non-reflected cache. Mapping a ribbon
location to sections is pure data: `UNetworkRibbon::TrackSections`
(`InitialTrackSectionID` plus `Splits`) gives the sections along a ribbon.

## 7. Player, driver pawn, HTTP API

- `ADriverPawn::GetDrivableActor()`, `GetAttachedSeatComponent()`,
  `SetControlledDrivable(AActor*, FName Interior, int CameraIndex, …)`,
  `SetControlledDrivableFromSeat`. The player never possesses the
  `ARailVehicle`; the pawn is attached to a seat. Ghost rule "never let a
  ghost become the drivable actor" is enforced by never calling
  `SetControlledDrivable` with a ghost and by excluding ghosts from
  `GetSortedRelevantVehicleCameras`.
- `FTS2PlayerInfo { FGeoCoordinates GeoLocation (double); FIntPoint CurrentTile; FString PlayerProfileName; FString CameraMode; FName CurrentServiceName; }`
  is exactly the HTTP API `DriverAid.PlayerInfo` payload.
- The HTTP API is implemented through `ICommNodeSpecialization`, an empty
  interface that `ARailVehicle`, `URailVehicleComponent` and
  `USimulationComponent` implement; node registration is native and not
  reflected. Nothing to hook there.
- Geo coordinates are doubles internally (`FGeoCoordinates`), while the
  debug-library accessors truncate to float. Prefer far vectors over
  lat/lon for anything positional.

## 8. DLC and content loading

`UDLCManagementFunctionLibrary` (all static):
`IsAssetPathLoadable(World, Path)`, `CachedContentContainsDLC(World, Name)`,
`GetCachedContentForDLC`, `GetStorePackageIndex`, `HasPendingDLC`,
`RequestContentLoadSynchronous(World, SoftObject, Category, State, ReleaseRule)`,
`RequestContentFromPackageList(World, TSet<FString> Packages, …)`,
`RequestContentLoadForUGCFormationSynchronous`, and `UDLCManagementSystem`
with `IsDLCOwned(FString ID)`, `IsEntitled`. TSW streams content per route
and releases it (`RequestContentRelease`), so a ghost of a loco from
another DLC needs `RequestContentLoadSynchronous` on its definition before
`SpawnFormation`, and `RequiredDLCPlugins` on the definition tells which
plugin must be installed.

## 9. Corrections to earlier docs

- `GetActorLatLong` lives on `UTS2DebugFunctionLibrary`, not
  `UTS2GameplayFunctionLibrary` (02-prior-art, 03-architecture).
- The engine is confirmed `++UE4+Release-4.26` on TSW 7; the module name
  `TS2Prototype` and the `RVM_*_C` naming hold.
- The HTTP API's `GameBuildNumber` is 886 for Steam buildid 25890949.

## 10. Spawn experiment results (2026-10-17, Training Centre)

Mod: `dumps/tsw7-886/experiments/spawn-success-2/main.lua` (Lua, UE4SS zDEV).

- **Attempt 1 crashed the game**: `SpawnFormation` was called from the
  `LoopAsync` thread and the engine asserted in the async package loader
  (`Package_LoadSummary has zero prerequisites, but has not been queued` for
  the wagon's end-of-train-device model). Rule confirmed: every UObject call
  goes through `ExecuteInGameThread`. Crash context in
  `experiments/spawn-crash-1/`.
- **Attempt 2 worked, no crash.** `FindTrainSpawnLocationNearDriverPawn(pawn, 5000)`
  returned a ribbon location; `SpawnFormation(pawn, FRM_TTC_16TMineral_Loaded,
  loc, Forwards)` produced one new `RVM_TTC_16TMineral_C` actor ~2 s later,
  which rendered as a loaded mineral wagon on the platform track next to the
  player's Class 323 (`experiments/spawn-success-2/screenshot.png`).
- `FindSpawnableFormations({...})` returned nothing for every search term
  tried; picking an already loaded `UTrainFormation` via `FindAllOf` works.
  Only formations whose content is loaded on the current map are safe to
  spawn without a prior `RequestContentLoadSynchronous`.
- Freshly spawned, the vehicle reported `SimPhysicsEnabledState = 1`
  (Kinematic) and `CurrentPhysicsMode = 2` (Kinematic) before we touched
  them, so the spawner leaves a consist kinematic until a preset is applied.
  Writing the two properties from Lua succeeded.
- `K2_GetActorLocation()` on the model actor returns (0, 0, 0): model actors
  live in far space, so position must be read via
  `RailVehiclePhysicsComponent:GetPosition()` / `GetWorldTransform()` or
  from `GetViewActor()`. Because of that, the `SetOverrideLocation` test is
  inconclusive (delta measured on the wrong actor); redo it reading the far
  position and the view actor.

**Decision: strategy B is viable.** Real `RVM_*` actors spawn through the
game's own path, start kinematic, and render through their view actor. No
mesh-cloning fallback is needed for v1.

## 10b. Movement experiment results (2026-10-17, same wagon)

Mod: `dumps/tsw7-886/experiments/move-3/main.lua`; log excerpt and a
screenshot alongside. Target: the kinematic wagon from the spawn run
(`SimPhysicsEnabledState = Kinematic`, `CurrentPhysicsMode = Kinematic`).

| Step | Call | Effect after 1.5 s |
| --- | --- | --- |
| t0 | readouts | `GetPosition()` = far (-2387.7, 46013.6, 8696.6); `GetWorldTransform().Origin` identical; model actor `K2_GetActorLocation` = (0, 0, 0); view actor `RVV_TTC_16TMineral_Wagon_C` at UE-local (408.3, -196.4, 8700.6); forward (-0.9, -0.5, 0) |
| 1 | `URailVehicleComponent::SetOverrideLocation(far + 20 m)` | **none** (far position, view actor unchanged) |
| 2 | `ARailVehicle::SetOverrideLocation(far + 40 m)` | **none** |
| 3 | `view:K2_SetActorLocation(view + 20 m)` | **moved and stayed moved** for the remaining 7 s of the run; wagon visibly left its spot on the platform |
| 4 | `SetOverrideSpeed(5.0)` for 3 s | **none** (velocity stays 0, position unchanged) |

Conclusions:

- The view actor (`RVV_*_C`, class `ARailVehicleView`) is an ordinary UE
  actor in **UE-local world space** and can be driven with
  `K2_SetActorLocation` / `SetActorTransform`. While the model is
  kinematic nothing writes the view actor back, so a ghost can be moved
  purely on the view side. This is strategy B's model actor with strategy
  A's movement, and it is what M4/M5 should build on.
- The far position of a kinematic vehicle is frozen; the override setters
  are no-ops in this state (they presumably only act while physics runs or
  during the game's own vault/teleport paths). Do not rely on them.
- Far space and UE-local space differ by a large offset on this map
  ((-2387, 46013) vs (408, -196)); the conversion lives in the model actor
  (`GetFarMatrix`) and `UTS2DebugFunctionLibrary::LatLongToFarVector`. A
  ghost's incoming far position must be converted to local with the local
  world's current far origin before being applied to the view actor. How
  to read that origin is the next thing to find (candidate: the
  `WorldLocation : FIntVector` on `ATrackNetworkActor` / `UNetworkRibbon`
  plus `UWorld::OriginLocation`).
- Open: whether animations (bogies, doors, lights) on a view actor still
  run when the model is kinematic and the view is moved externally. The
  wagon has no such parts; test on a loco.

## 10c. Far-space experiment results (2026-10-17)

Mod and log: `dumps/tsw7-886/experiments/far-4/`.

- `UGameplayStatics::GetWorldOriginLocation` returned (-2796, 46210, 0) on
  the Training Centre. The wagon's far position (-2387.7, 46013.6, 8696.6)
  minus that origin is (408.3, -196.4), exactly the view actor's UE-local
  location measured before any move. **`local = far - WorldOriginLocation`
  (Z unchanged).** No TSW-specific offset is involved; the "far" system is
  UE origin rebasing with double-precision bookkeeping on top.
- `AModelActor::GetFarLocation()` and `UModelChildActorComponent::FarLocation`
  (private, on `ARailVehicle::ModelSceneComponent`) hold the same far value
  as `URailVehicleComponent::GetPosition()` (Z differs by 4 cm). Writing
  `FarLocation` from Lua changes the stored value but does **not** move the
  view actor while the vehicle is kinematic; the child view actor is only
  re-placed by the game's own streaming/tick path.
- `ATrackNetworkActor::WorldLocation` is (0, 0, 0) on this map, so it is
  not the tile offset; ignore it for positioning.
- `ATS2PrototypePlayerController` has `JumpToFarLocation(FFarVector, bool
  bTriggerLoadingScreens, bool bDoSweepTest)`, `JumpToRailVehicle(FGuid)`
  and `JumpToService(FName)`: the teleport API for a future "jump to
  player" feature.

**Ghost placement recipe (verified pieces):** spawn via `SpawnFormation`
(kinematic), then each tick set the view actor transform to
`remote_far - local_origin` with `K2_SetActorLocation` / `SetActorRotation`.
Re-read the origin when `WorldOriginChangedDelegate` fires or on every
`GetWorldOriginLocation` poll (cheap).

## 10d. Multi-car loco ghost (2026-10-17)

Mod, log and screenshot: `dumps/tsw7-886/experiments/loco-5/`.

- `SpawnFormation` with `FRM_TTC_Class323` 120 m from the pawn produced the
  three cars `RVM_TTC_Class323_DMS_A_C`, `_PTS_C`, `_DMS_B_C`, each with its
  `RVV_*` view actor, spaced ~23 m apart along the track direction.
- Physics state differed per car: the two driving cars came up
  `Kinematic/Kinematic`, the trailer `Disabled/Disabled` (state 0, mode 3).
  A ghost implementation must not assume one state; set all cars explicitly.
- Sliding all three view actors by 30 cm every 100 ms for 12 s (3 m/s)
  worked, the set moved as a unit past the platform next to the player's
  real 323, no crash, no snap-back. The game thread tolerated a 100 ms Lua
  loop with three `K2_SetActorLocation` calls without visible hitching.
- Wheel animation is **unconfirmed**: the only components matching
  wheel/bogie/axle by name on the DMS_A view actor were `ISM_WheelBlur` and
  `LC_WheelSlipFault` (233 components in total), and their rotation did not
  change. Real wheel rotation is presumably driven from the model's
  simulation speed, which is 0 while kinematic, so expect static wheels
  until the ghost layer rotates them itself (or until `SetOverrideSpeed`
  is found to work in a non-kinematic state).

## 10e. Debug bridge, console commands, scenario loading (2026-10-17)

`mod-lua/TswCoopDebug` plus `scripts/tswcmd` give a UI-free control
channel. Verified on the Training Centre:

- The exe contains 489 `ts2.*` console variables/commands
  (`dumps/tsw7-886/ts2-console-variables.txt`). Executed through
  `UKismetSystemLibrary::ExecuteConsoleCommand` from Lua they work without
  the in-game console: `ts2.dbg.JumpToLatLong 51.1190 6.2260` moved the
  pawn (HTTP API confirmed the new lat/lon); `ts2.dbg.SetLocalDateTime
  2026 10 17 21 30 0` set the clock (space-separated numbers only; ISO
  strings are silently ignored); `ts2.dbg.SetPrecipitation 1`,
  `SetCloudiness 1`, `SetFogDensity 0.3` changed the weather immediately
  (screenshot in `experiments/debug-bridge-6/`).
- `UTS2GameplayFunctionLibrary::LoadScenario(World, UScenarioDefinition*)`
  loads a scenario from inside a map with no menu interaction (`scenario
  TC_ScA_Def`): loading screen, new pawn, scenario objectives active.
  Loaded `UScenarioDefinition` assets are enumerable with `FindAllOf`;
  the Training Centre had 20 (3 scenarios + 17 tutorials).
- `GetWorldOriginLocation` differs per spawn point ((-2796, 46210) in the
  tutorial, (102581, -17427) in free roam, (100106, -15240) in scenario A),
  confirming the origin must be read live, never cached across loads.
- Not yet solved: starting a scenario **from the main menu** without UI
  (the definitions are not loaded there; needs `LoadAsset` on the path or
  `ts2.dbg.LoadTimetable`), and Lua float out-params (`GetActorLatLong`
  returns zeros through the table convention; use the HTTP API or
  `GetPosition` instead).
- Interesting for strategy C / L4: `ts2.dbg.AIOverrideTargetVelocity`,
  `ts2.dbg.AITargetVelocity`, `ts2.dbg.AISetDrivable`,
  `ts2.dbg.SetTrainSpeed`, `ts2.dbg.RemoveTrainFromTrack`,
  `ts2.dispatcher.RequestEnterDispatchedNetwork`.

## 10f. Occupancy, despawn and physics position (2026-10-17, scenario A loaded from the main menu)

- **Scenario from the main menu works without UI**: `LoadAsset("/TrainingCentre_Route_Gameplay/Scenarios/ScA/TC_ScA_Def.TC_ScA_Def")`
  followed by `LoadScenario(PlayerController, def)` goes from the main menu
  straight into the scenario (`tswcmd "scenario /…/TC_ScA_Def.TC_ScA_Def"`).
  The same `LoadAsset` fallback makes `spawn /…/TTC_146_Light.TTC_146_Light`
  work in maps where no `TrainFormation` is loaded yet. Known Training
  Centre asset paths: `dumps/tsw7-886/training-centre-{scenarios,formations}.txt`.
- **Occupancy is readable**: `ATrackNetworkManager.TrackSectionsMap`
  (`TMap<FGuid, FTrackNetworkSection>`, iterated with `TMap:ForEach`)
  listed 189 sections, 19 occupied, and every `OccupationRailVehicleIds`
  GUID resolved to a `RailVehiclePhysicsComponent.RailVehicleID` of a live
  vehicle (104/104).
- **A SpawnFormation ghost is registered with the dispatcher**: right after
  spawning, its GUID appeared in the section it was placed on (shared with
  the Class 66 standing there). So strategy B ghosts are *not* invisible
  to signalling on the machine that spawns them.
- **The physics position cannot be driven while kinematic**:
  `URailVehicleComponent::SetOverrideLocation` returns without effect
  (`GetPosition()` unchanged, view actor unchanged), like the other
  override setters in §10b. Moving the view actor (§10b) does not move the
  occupancy either. Consequence for the design in 08: guests render the
  host's trains by moving view actors, and **signal aspects are replicated
  from the host**, not derived from ghost occupancy.
- **`K2_DestroyActor` is not a despawn**: the model actor goes away after
  the next GC (`obj gc`), but its GUID stays in
  `OccupationRailVehicleIds` forever (stale entry observed after GC). The
  game's own despawn path has to be used (candidates:
  `ASandboxManager::StartRemovingTrain(URailVehicleComponent*)`,
  `ATrainSpawner::DespawnConsist`, console `ts2.dbg.RemoveTrainFromTrack`,
  which did nothing when given an actor name). Still open.

## 11. Next verification steps (need the game)

1. Find the far-to-local conversion (world far origin) so remote far
   positions can be applied to local view actors; verify with the player's
   own vehicle (`GetPosition()` vs its view actor location).
1b. Identify the wheel components on a `RVV_*` view actor (dump its
   component list) and find what rotates them; try the `RunningActivePreset`
   with `SetOverrideSpeed` on a non-kinematic ghost.
2. Read `URailVehicleComponent::GetWorldTransform()` for the player's
   vehicle at 10 Hz and compare with `DriverAid.PlayerInfo.geoLocation`.
3. Dump a real route (not the Training Centre) to see how many
   `ATrackNetworkActor` tiles exist and whether `TrackSectionsMap` is
   populated outside yards.
4. Poke `OccupationRailVehicleIds` for one section from Lua and watch the
   protecting signal.
5. Despawn: find the counterpart of `SpawnFormation` (`ATrainSpawner::DespawnConsist`
   or destroying the actors) and confirm no dangling dispatcher entries.
