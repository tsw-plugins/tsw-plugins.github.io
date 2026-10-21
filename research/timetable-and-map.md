---
name: timetable-and-map
description: >-
  Reading the player's service (stops, scheduled/expected/actual times, platforms, positions, distance to the next stop), the signal and speed limit ahead, and the route's stations for a map view: the classes, fields and functions, what is reachable from reflection, and what tsw-sdk implements.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-20T23:10+0200
last_edited: 2026-10-21T20:15+0200
---

# Timetable and map reading (2026-10-20)

Goal: give a mod (tsw-coop's web map first) the player's service the way the HUD's
timetable screen shows it, the signal and speed limit ahead, and enough route data to draw
stations on a map. Sources: the UHT header dump and `CXXHeaderDump/TS2Prototype.hpp` of build
886 (`tsw-coop/dumps/tsw7-886`), plus read-only probes on the running game
(`tsw-coop/dumps/tsw7-886/experiments/timetable/01..05`).

Implemented in tsw-sdk as `tsw_sdk_host::timetable` (the `Reader`), served by the adapter
as `TswApi::timetable` / `TswApi::route_map` (JSON) and logged by `tsw.timetable` / `tsw.map`.

## In-game status

The probes ran against Training Centre in timetable mode (`TC_Timetable`), where the
player was on foot with no service: **the timetable has 0 services** (runtime `Services`
and the definition's `Services` both empty), **no station manager and no station directory**
(`GameState.StationManager` null, `TrainingCentreRouteDefinition.StationDirectory` null).
So the *values* below are verified only from the headers. Verified in game:

| What | Result |
| :--- | :--- |
| Every class, struct and function the `Reader` resolves (36 owners, ~110 property and parameter names, probe `05-layout.lua`) | all present, names as in the dump (checked with a bogus name as control) |
| `UTS2GameplayFunctionLibrary::GetTimetable(pc)` | the `ARouteTimetable` actor; its `Definition` is the copy the game makes inside the actor |
| `GetDrivenServiceName` / `GetOwnedServiceName` (on foot) | `false`, `None`: the "no service" case answers as expected |
| `GetTS2GameState(pc)`, `GetCurrentRoute(pc)` | the game state and the route definition |
| UE4SS Lua and struct out-params (`GetDriverAidData`, `GetTrackData`) | the out table stays empty from Lua; the Rust `NativeFn::call_outs` path does not have that limit (untested here) |

To verify next, on a route with a timetable (Fulda or Dresden via `tsw.freeroam … t1` and
`ts2.dbg.JumpToService`): run `tsw.timetable` and `tsw.map` and compare with the in-game
timetable screen. Open points are marked *unverified* below.

## The player's service

| Need | Where | Notes |
| :--- | :--- | :--- |
| Which service | `ATS2PrototypePlayerController::GetDrivenServiceName(FName& ServiceName) -> bool`, else `GetOwnedServiceName` | also `FTS2PlayerInfo::CurrentServiceName` |
| The timetable actor | `UTS2GameplayFunctionLibrary::GetTimetable(WorldContext)` (also `ATS2PrototypeGameState::RouteTimetable`) | |
| Runtime state | `ARouteTimetable::Services : TArray<FRouteTimetableService>` (0x48 bytes up to `CompletedInstructions`) | `Name`, `FriendlyName`, `CurrentInstructionIndex`, `CurrentInstructionState`, `CompletedInstructions`, `CurrentState` (`NotStarted, Running, Complete, Cancelled`), `EstimatedLateness` (`FTimespan`). `ServiceIndexMap` (TMap) is not read; a linear scan by `Name` is cheap. |
| The stop list | `ARouteTimetable::Definition` → `URouteTimetableDefinition::Services : TArray<FRouteTimetableServiceDefinition>` → `Instructions : TArray<FRouteTimetableServiceInstruction>`; sandbox services in `ARouteTimetable::RuntimeSpawnedServices` | per instruction: `InstructionType` (`GoTo, LoadUnload, Couple, Uncouple`), `DestinationDisplayName` (FText), `Destination : FRouteLocation { FName Name; FNetworkRibbonLocation Location; }`, `ArrivalTime` / `CompletionTime` (`FTimespan`, time of day) with `bHasScheduledArrivalTime` / `bHasScheduledCompletionTime`, `bIsStopping`, plus `Simulated*` times, `GoVias`, `VirtualDestinations` |
| Service number | `FRouteTimetableServiceDefinition::ServiceNumber` (FString); also `ARouteTimetable::GetServiceNumber` | |
| Platforms, expected times | `ARouteTimetable::GetServiceExpectedTimes(Service, FirstInstruction, bRouteDestinations, bVirtualDestinations) -> TArray<FRouteTimetableDestinationWithTime>` (0x78 each: destination `Identifier, FullDisplayName, ShortDisplayName, MarkerName, PlatformDisplayNumber` + `InstructionReference { ServiceName, InstructionIndex }, ArrivalTime, CompletionTime`) | the stops' platform numbers in one call. *Unverified* whether the times are the live ETA or the schedule. Alternatives: `GetServiceDestinations`, `GetMarkerDestinationInfo(Marker)`, `GetInstructionExpectedArrivalTime` / `GetInstructionDueArrivalTime(Service, Index, FDateTime&)` |
| Actual times | `CompletedInstructions[i].ArrivalTime / CompletionTime` (`FDateTime`), `CurrentInstructionState.ArrivalTime` for the current stop | *unverified* that `CompletedInstructions` is indexed like `Instructions` |
| Current stop | `ARouteTimetable::GetServiceCurrentInstruction(FName)` = `CurrentInstructionIndex` | instructions before it are done |
| Stop positions | `URouteTimetableDefinition::GetInstructionLocation(WorldContext, Service, Index, FVector& Out, bUseCompiledData) -> bool` | local engine space; far = local + `GetWorldOriginLocation`. Also `GetInstructionRibbonLocation`, then `UNetworkBlueprintFunctionLibrary::GetTransformAtTrackLocation` |
| World clock | `UTS2GameplayFunctionLibrary::GetWorldDateTime(WorldContext) -> FDateTime` | ticks of 100 ns; time of day = ticks mod one day |
| Target speed per stop | `ARouteTimetable::GetInstructionTargetSpeed(Service, Index)` | not read yet |

## Ahead of the train

| Need | Where | Notes |
| :--- | :--- | :--- |
| Distance to the next stop | `ATS2PrototypePlayerController::GetTrackData(FTS2TrackData&)`: `Stations` and `Markers : TArray<FStationDetail { FText StationName; FVector2D DistanceToStation; float DistanceToStationCM; float PlatformLength; ETrackMarkerType MarkerType; FText MarkerName; }>`, plus `TrackHeights` | the HUD's track profile. The SDK matches the next stopping instruction's display name against `StationName`. *Unverified*: whether the list covers stations the service passes, and `PlatformLength`'s unit (taken as cm). |
| Next signal, speed limits | `ATS2PrototypePlayerController::GetDriverAidData(FTS2DriverAidData&)` (0x118): `SignalSeen`, `DistanceToSignal`, `SignalAspectClass` (`Clear, Approach, Stop`), `bSignalIsPermissive`, `NextSignalPosition` (FVector), `SpeedLimit`, `NextSpeedLimit`, `DistanceToNextSpeedLimit`, `NextSpeedLimitPosition`, `CurrentSpeedLimitSource` (`Track, Formation, Service`), `TrackMaxSpeed`, `ServiceMaxSpeed`, `FormationMaxSpeed`, `Gradient`, arrays `NextSpeedLimits`, `NextSignals` and a `FTrackRestrictionQuery` | works without a service too (Free Roam). `FSpeedQuantity` is one float, taken as m/s; distances taken as cm (siblings are named `DistanceCM`, `SpeedLimitMS`). *Unverified.* Also on `UTS2GameHUDWidget` and `UTS2DriverAidWidget`. |

## Route and map data

| Need | Where | Reachable? |
| :--- | :--- | :--- |
| Station names, platforms | `URouteDefinition::StationDirectory` (`GetCurrentRoute`) → `UStationDirectory::Stations : TArray<FStationInfo { StationName, FullDisplayName, ShortDisplayName, StationFlags, ServiceTypes, Platforms, PlatformsNew : TArray<FStationPlatformInfo { Marker.ReferenceName, DisplayNumber }> }>` | yes |
| Station positions | `ATS2PrototypeGameState::StationManager` → `AStationManagerActor::RegisteredStations : TArray<UStationComponent*>` (`StationName`, a scene component: `K2_GetComponentLocation`) | yes, for the stations of the loaded world. `NearestStationToPlayer` (FNearestStation) is there too. |
| Stop / marker positions of the player's service | `GetInstructionLocation` per instruction | yes |
| All track markers (`FNetworkTrackMarker { DisplayName, Name, Type, Range : FNetworkMultiRibbonRange }`) | no reflected container holds them; the track network is native | **no** (only by marker name through the timetable, or the HUD's `Markers` ahead) |
| Track geometry (ribbons) for drawing lines | native track network; the game's own map draws it in `URouteMapWidget` (`GetPixelLocationForWorldPos`, `GetWorldPosForPixelLocation`, `URouteMapAsset` sprites and line styles only) | **no** reflected polyline. A map can draw the trains' own recorded positions, stops and stations instead. |
| Signals on the map | `URouteMapWidget` draws them natively; per signal only through `UNetworkBlueprintFunctionLibrary::GetPropertyLocation(FNetworkPropertyReference)` | only the next one (`GetDriverAidData`) |
| Departures at a station | `ARouteTimetable::GetMarkerNextInstructions`, `GetScheduledInstructionsForDestination`, `UTS2GameplayFunctionLibrary::GetAllScheduledInstructions`; `APassengerInfoSystemBoard` | yes, not implemented |

The scenario objective (tutorials, scenarios) is a different system
(`AObjectiveComposerActor`, `TS2HUDObjectiveWidget`); `drive_diag.lua` reads the HUD objective
widget's name and description (05 §driving).

## Implementation (tsw-sdk, 2026-10-20)

- `crates/tsw-sdk-host/src/timetable/`: `Reader::new()` resolves 39 paths in one walk of the
  object array (~20 ms), every offset by name from reflection (nothing hard-coded from the
  dump). Parts fail independently (`Reader::problems`). `Reader::timetable(pc)` →
  `Option<Timetable>` (`None` without a service), `Reader::driver_aid(pc)`,
  `Reader::route_map(pc)` → `RouteMap`. Positions are far space (cm). Types derive serde.
- Costs: one `GetInstructionLocation` call per instruction and one text conversion per name;
  call it on demand or every few seconds, not every frame. Struct out-params are read with
  `call_outs`; the `TArray` buffers they and `GetServiceExpectedTimes` return go back to
  `GMalloc` (`take_array`, `free_array`), the `FText`s inside them leak a reference each.
- `tsw` service (`crates/tsw-game`): `TswApi` grew at the end, `timetable` and `route_map`
  (JSON into a caller buffer, `BUFFER_TOO_SMALL` with the needed length, `NOT_FOUND` without a
  service, `WRONG_PHASE` off the game thread). `Tsw::timetable()` / `Tsw::route_map()` parse
  it back into the SDK types; an older adapter's shorter table connects and answers
  `Unsupported` (`TABLE_V1_SIZE`).
- Adapter commands: `tsw.timetable` (service, stops, ahead, driver aid; driver aid only in Free
  Roam) and `tsw.map` log into the uniloader log.
- 2026-10-20, for [tsw-autopilot](../design/tsw-autopilot.md): `DriverAid` also carries the
  lists `limits` (`NextSpeedLimits`, `FSpeedLimit { Value, DistanceToNextSpeedLimit,
  NextSpeedLimitPosition }`) and `signals` (`NextSignals`, `FFoundSignalAspect { Value,
  DistanceToNextSignal, NextSignalPosition }`), same units assumed, *unverified*; empty when the
  element structs are missing or the JSON comes from an older adapter. `Reader::track_ahead(pc)`
  reads the stations and markers ahead alone (one `GetTrackData` call).

## Station stops, measured (RB51-15500, TSW 7, 2026-10-21)

Driving the Fulda timetable's RB51-15500 (Frankfurt Hbf to Wächtersbach) with tsw-autopilot:

- **A stop is two instructions.** A nameless `GoTo` to the platform marker (`Frankfurt (Main)
  Sued Pl 6`), then a `LoadUnload` named after the station (`Frankfurt(Main)Süd`, platform 6,
  arrival and departure times). The service's first instruction is the origin's boarding:
  nameless, `Upcoming` before the service's start time, then `Current`.
- **The game's stop test.** Each `GoTo` has an `ObjectiveActionMoveToComponent` (owned by the
  scenario manager), with `DestinationTrackMarker.ReferenceName` set to the GoTo's marker. Its
  settings are `ConditionTest = Within`, `ConditionTolerance = 1000` (cm),
  `bFailOnDestinationPassedThrough`, `bUseStopMarkerPosition` and `bCheckForStoppingOnTrackMarker`.
  `CachedStopAtPlacement` holds `FormationLength` and one `VehiclePlacement` per vehicle.
- **A stop the train runs through** is marked `Done` with the actual arrival equal to the actual
  departure (Hanau Hbf: 04:54:54/04:54:54 for 04:59/05:00). The service then simply goes on.
- **Track items (`GetTrackData`).** A station-wide item (`Hanau Hbf []`, no marker name) gives
  the distance to the platform's near end. Once the front is inside the platform, it gives the
  far end instead. A platform marker (`Hanau 7 [Hanau Hbf Bstg 7]`) gives the distance to the
  marker range's *start*, which depends on the direction of travel:
  - When the platform runs against the train, that start is the far end. At Hanau the marker
    read 932 m and the station item 624 m, with the platform 308 m long.
  - When the platform runs with the train, both items read the same, the near end (Rodenbach:
    7195 m and 7195 m).

  A marker one platform length beyond a station-wide item of the same length is therefore
  reversed. Inside the platform both items read the far end, so the two cases can't be told
  apart there.
- **Where to stop.** The HUD's distance, `UTS2HUDObjectiveWidget::GetDistanceToObjective(float&)`
  in cm, is the straight-line distance from the camera to the objective's
  `GetStopAtPlacementCetrePosition()`. It points to where the front should halt, a few metres
  short of the platform's far end: 804 m at Hanau Wolfgang, with the platform 599–811 m ahead.
  Only the HUD's own widget instances answer; the class templates return `false`.
  - The distance has no sign and is measured from the cab, metres above the rail. Near the
    marker it stops shrinking, and once the marker is passed it grows again.
  - tsw-autopilot reads it while it is more than 50 m away and runs the rest down by the distance
    travelled.
- **Actor locations** (`K2_GetActorLocation` of the drivable or its root component) read 0,0,0.
  The camera (`PlayerCameraManager:GetCameraLocation()`) and the placement positions are in
  the same world frame.

## Appendix: field offsets (build 886, 2026-10-21)

From `CXXHeaderDump/TS2Prototype.hpp` (`ARouteTimetable` at line 10134, `ATS2AIController` at
10625), collected for tsw-autopilot. The reader above looks fields up by name; these are for
native code and for checking a dump of a new build.

| Struct / class | Field | Offset |
| :--- | :--- | :--- |
| `ATS2PrototypeGameState` | `RouteTimetable` | 0x298 |
| `ARouteTimetable` | `OnServiceInstructionArrived`, `…Completed`, `OnServiceStarted`, `OnServiceStopped` (delegates) | 0x228, 0x238, 0x248, 0x258 |
| | `Definition`, `Services`, `ServiceIndexMap`, `ActiveServices` | 0x290, 0x298, 0x318, 0x558 |
| `FRouteTimetableService` (0x150) | `Name`, `CurrentInstructionIndex`, `CurrentInstructionState` | 0x00, 0x24, 0x28 |
| | `CompletedInstructions`, `CurrentPath`, `PathFollower` (its `DistanceOnPath` at +0x8) | 0x48, 0x58, 0x88 |
| | `DriverPermissions`, `CurrentState`, `StartTime`, `EndTime` | 0xA4, 0xA5, 0xA8, 0xB0 |
| | `AIDriver` (lazy pointer), `EstimatedLateness` | 0xC4, 0xE8 |
| `FRouteTimetableInstructionState` (0x20) | `ArrivalTime`, `CompletionTime`, `AccumulatedTime`, `LateState`, `CompletionState`, `bForceEarlyCompletion` | 0x00, 0x08, 0x10, 0x18, 0x19, 0x1A |
| `URouteTimetableDefinition` | `Services` | 0xF0 |
| `FRouteTimetableServiceDefinition` (0x198) | `ServiceNumber`, `bIsPlayerDrivable`, `Instructions`, `ExpectedAIPerformance` | 0x30, 0x40, 0xA0, 0xB8 |
| | `StartTime`, `MinDwellTime`, `ScheduledDwellTime` | 0xC0, 0xC8, 0xD0 |
| | `MaxAcceleration`, `MaxComfortableDeceleration`, `TimetableDataTrack`, `ServicePath` | 0xF0, 0xF4, 0x120, 0x148 |
| `FRouteTimetableServiceInstruction` (0x110) | `InstructionType` (GoTo 0, LoadUnload 1, Couple 2, Uncouple 3), `DestinationDisplayName`, `Destination` | 0x00, 0x08, 0x20 |
| | `GoVias`, `GoToTolerance`, `ArrivalTime`, `CompletionTime`, `WaitingTime` | 0x48, 0x6C, 0x78, 0x88, 0x98 |
| | `EarlyTolerance`, `LateTolerance`; bit bytes (`bIsStopping` …; `bUseStopMarkerPosition`) | 0xA0, 0xA8; 0xB0, 0xB1 |
| `FStationDetail` | `DistanceToStationCM`, `PlatformLength`, `MarkerType`, `MarkerName` | 0x20, 0x24, 0x28, 0x30 |
| `FTS2TrackData` | `Stations`, `Markers` | 0x20, 0x30 |
| `FTS2DriverAidData` (0x118) | `DistanceToSignal`, `DistanceToNextSpeedLimit`, `Gradient`, `SignalAspectClass` | 0x04, 0x08, 0x0C, 0x10 |
| | `SpeedLimit`, `NextSpeedLimit`, Track/Service/Formation max speed | 0x28, 0x2C, 0x34/0x38/0x3C |
| | `NextSpeedLimits`, `NextSignals`, `NextSignalProperty`, `TrackRestrictionQuery` | 0x58, 0x68, 0x78, 0xA8 |
| `UObjectiveActionMoveToComponent` | `bUseStopMarkerPosition`, `DestinationRibbonLocation`, `CachedStopAtPlacement` | 0x5F0, 0x654, 0x718 |
| `UTS2GameHUDWidget` | `CurrentObjectiveAction` | 0x2D8 |
| `ATS2AIController` | `ServiceName`, `bHasYardManagerPermission`, `MaxAccelerationMSS`, `PassAtDangerSignal`, `DrivingActor`, `TargetVelocity` | 0x350, 0x358, 0x35C, 0x36C, 0x3B4, 0x3D4 |

`CompletionState`: Error 0, PendingOnDependency 1, InProgress 2, Arrived 3, Failed 4, Succeeded 5,
ServiceCompleted 6. A stop's departure readiness is probably the move from Arrived to Succeeded
together with `OnServiceInstructionCompleted` (no single "ready to depart" flag was found). The AI
driver's behaviour tree (`Core/AI/BT_TS2AIController`) is a selector over ServiceShutdown,
ServiceSetup, CouplerSetup, Couple, Uncouple, LockUnlockDoors, PropulsionChangeover and the driving
sequence (`Task_RequestYardManagerPermissions`, `BTTask_AimForTargetVelocity`, gated by "using
simple physics"); how it computes its target speed is in [native-code.md](native-code.md).
