---
name: timetable-on-foot
description: >-
  Why a TSW 7 timetable service can start with the player on foot at a platform (Left Rhine RE-3409 07:44): the world start's rule, the AI service that brings the train, the objectives the composer lays out anyway, why no service card shows, how the game puts a player into a service's train (world start, in-game takeover card, the controller's jump and drivable calls), what decides when the train arrives, and how tsw-sdk and tsw-autopilot now board it. Decompiled; not yet confirmed in game.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-23T02:30+0200
last_edited: 2026-10-23T02:30+0200
---

# A timetable service that starts on foot (2026-10-23)

Question from the autopilot runs: `tsw.service Rhine 1 RE-3409` (Linke Rheinstrecke, timetable 1,
the service starting 07:44) put the player **on foot on a platform** with the objective "Fahrgäste
einsteigen lassen" (due 07:46:00). No service card came (tsw-sdk: "takeover: no service card within
300 s"), the timetable reader said "the player drives no service (Free Roam or on foot)", and no
train had come 17 game minutes later (run 37, 2026-10-22; screenshot only, the log is gone). How
does the game hand such a service to the player, and what should the mods do?

Sources: the full Ghidra decompile of build 886 (`tsw-decomp/fullghidra/tsw7/export/TrainSimWorld.c`,
function names are Ghidra's `FUN_14…`, given here as RVAs), the earlier targeted output
(`tsw-decomp/ghidra/out/takeover3/TSW+0xEDB870.c`), the UE4SS header dump
(`tsw-coop/dumps/tsw7-886/CXXHeaderDump`), and the kdecomp text of the Left Rhine timetable
(`LeftRhine_Route_Gameplay/Content/Timetable/LeftRhine_Timetable`) and the HUD menus, found with
`tswdump`. Nothing here was run in game. See also [timetable-mode-start.md](timetable-mode-start.md)
(the drive-mode settings and the start card) and [scenarios.md](scenarios.md) (the objective
composer in scenarios).

## Why RE-3409 starts on foot

The world start (native `0xEDB870`, quoted in [timetable-mode-start.md](timetable-mode-start.md))
seats the player only if the service **is active or its formation is ready** at that moment
(`ARouteTimetable::IsServiceActive` `0x1130480`, `IsServiceFormationReady` `0x1130710`) and
`GetPlayerDrivableRailVehicleInService` (`0x112C550`) finds a drivable vehicle. Otherwise it calls
`0xEE2930`, which only spawns the walker at a player start; nothing binds the player to the
service.

RE-3409 has no train of its own at 07:44. In the timetable:

| Service | Shown | Formation it starts with | Ends as | Start | Instructions |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `RE-3446` | player-drivable | `AI_RE-3446_End` | `RE-3446_End` | 07:04:00.05 | stops from Mainz to Gau-Algesheim platform 2 |
| `AI2_RE-3446` | hidden, AI | `RE-3446_End` | `AI2_RE-3446_End` | 07:24:38.65 | GoTo `Gau-Algesheim Platform 2`, GoTo `PortalKreuznach` (off the map) |
| `AI_RE-3409` | hidden, AI | `AI2_RE-3446_End` | `AI_RE-3409_End` | 07:38:00.05 | GoTo `PortalKreuznachGG` (back onto the map), GoTo `Ingelheim Platform 1` |
| **`RE-3409`** | player-drivable | **`AI_RE-3409_End`** | `RE-3409_End` | **07:44:00** | LoadUnload at Ingelheim (arrival simulated 07:44:00.05, departure 07:46:00), GoTo `Mainz Hbf Platform 4`, LoadUnload (07:57:30 / 07:58:00) |
| `AI2_RE-3409` | hidden, AI | `RE-3409_End` | `AI2_RE-3409_End` | 07:59:07 | (takes the unit on, `bCreateAtEarliestOpportunity`) |

`MapPointA` of RE-3409 is Ingelheim. The train (a class 628, layer `628`) is brought in from the
Bad Kreuznach portal by the hidden AI service `AI_RE-3409`, and only when that one has completed at
Ingelheim platform 1 does its end formation `AI_RE-3409_End` become RE-3409's ready formation
(`ARouteTimetable::FormationsReadyForServiceWithTime`). The timetable's own simulation has it
arrive at **07:44:00.05**, 0.05 s after RE-3409's start time. `tsw.service` starts the world at the
start time exactly, as the game's timetable menu does (`MainMenuTimetable_C::StartService`), so at
the world start the formation is not ready and the player spawns on foot. The menu would do the
same for this service (inferred from the same rule, not tried).

The link between the services is only the formation name: a service's `FormationName` is another
service's `EndOfServiceFormationName` (`FRouteTimetableServiceDefinition`). The unit drives
RE-3446, leaves the map at the Bad Kreuznach portal as `AI2_RE-3446`, comes back from it as
`AI_RE-3409` and becomes RE-3409 at Ingelheim.

## The objectives come anyway

The objectives are not tied to the player sitting in the train. At the world start the game mode
(`0xEC9FB0`) spawns the objective composer (`ObjectiveComposerBP_C`, native
`AObjectiveComposerActor`) and has it compose the settings' `InitialTimetableService`
(`0x102DA10` → `0x102CFF0`) whether or not the player was seated:

- one objective per instruction: the first is RE-3409's LoadUnload at Ingelheim, "Fahrgäste
  einsteigen lassen" with its departure 07:46:00, the HUD in run 37;
- a "wait for the service" objective (`WaitServiceKey`, until the service's start time) when
  `bCanCreateWaitForServiceObjective` (the constructor sets it) and the service is not
  `bCreateAtEarliestOpportunity`; at the start time it is already met;
- a "sit in the driver's seat" objective only with `bCanCreateSitForServiceObjective`, which the
  campaign path sets, not timetable mode.

`AObjectiveComposerActor::CachedServiceName` (+0x2A4) holds the service the objectives are for.

The reader's "drives no service" is right: `GetDrivenServiceName` and `GetOwnedServiceName`
(`0x11B3210`, `0x11B4310`) look up the service of the controlled drivable (controller +0x644) and of
the reserved drivable (+0xA18) in the timetable's vehicle map. On foot there is neither.

## Why no card shows

The "take over the service" card appears in two places only:

1. The world start, right after seating the player (`ShowNewServiceDialog`, `0xF6F010`). Not
   reached when the player spawns on foot.
2. The in-game takeover: when a walking player interacts with a cab of a train that belongs to a
   different service (`0x11A5FB0`, the controller's interaction with what it looks at, calls
   `0x11ACEE0`), the HUD shows `UpdateDialog(new service, old service, train)` with a confirm
   delegate (`0x11C2E00`) that releases the old service (`0x11BFF50`) and has the composer lay out
   the new one.

So "no service card within 300 s" was expected for this start; it is not a failed confirm.

## How a player gets into the train

There is no "join service" call and no start option for it. The ways in:

- **The world start** (when the train is ready): `JumpToFarLocation(train)` (`0x11B8100`, the same
  function the UFUNCTION calls) and `SetControlledDrivable(train, cab, 0, false, null)`
  (`0x11C2130`), where `cab` is the name of the train's `UInteractionEnvironmentComponent` with
  `EnvironmentRole` Driver and `VehicleSide` equal to the `DrivingCabSide` that
  `GetPlayerDrivableRailVehicleInService` returns (the list is built by `0x1269FA0`).
- **Walking in**: the player walks to the cab and interacts with it; for a train of another
  service the takeover card above comes first.
- **`ATS2PrototypePlayerController` calls** that exist: `JumpToService(ServiceName)` (`0x11B87C0`:
  moves the walker 10 m above the service's first vehicle, does not seat), `JumpToRailVehicle`,
  `JumpToFarLocation`, `SetControlledDrivable` / `…FromSeat` / `…FromCamera`,
  `GetReservedDrivableActor`, `ReleaseReservedDrivable`, `ForceRelinquishService`,
  `HandleServiceStarted` (bound to the timetable's `OnServiceStarted`: when the reserved train's
  service starts and is AI-only, it gives the service up).
- When the player's drivable changes, the composer's `OnDrivableActorChangedDelegate`
  (`0x102DB50`) lays out the objectives of the boarded train's service (or of the service that
  will start from its formation), so boarding by `SetControlledDrivable` keeps the objectives
  right.

The start settings offer no "in the cab" versus "on the platform" choice:
`UDriveModeSettings::bSpawnDriving` is not read by the world start, and `SpawnLocationTag` /
`PlayerSpawnLocation` only place a walker. The timetable menu's `OnFootMenu` is Free Roam on foot.
Starting the world later (after the feeder's arrival) would make the formation ready but changes
the service's times and relies on the world start placing a feeder that started before it; not
used.

## What decides when the train arrives

The train arrives when its feeder chain runs: `AI_RE-3409` must have started from the portal at
07:38, which needs its own formation `AI2_RE-3446_End` ready, which needs `AI2_RE-3446` to have
reached the portal (the unit drove RE-3446 until about 07:24); then the dispatcher has to set the
route from the portal to Ingelheim platform 1. Each runtime service
also carries who may drive it (`FRouteTimetableService::DriverPermissions` +0xA4,
`EServiceDriverPermission` Player 0 / AI 1 / Both 2; `CanServiceBeAIDriven` is AI or Both; the
game switches the player's service between Player and AI in `0x10C40F0`).

17 game minutes without a train leave two candidates, neither checked:

- the chain did not get going: the whole chain began before the world did (07:04, 07:24:38,
  07:38), so the world start would have to place a unit that is just coming back out of the
  portal, and whether it does is unknown;
- the dispatcher held `AI_RE-3409` (as the RB75 at Wiesbaden, answer 8, in
  [signaller-red-exit-signal.md](signaller-red-exit-signal.md) §7).

The tsw-sdk takeover now logs, once a minute while it waits, each service of the chain with its
running state, current instruction, driver permission and how far its first vehicle is from the
player (below). That tells the two apart in the next run.

## Built from this

- **tsw-sdk `69ec36f`**: `tsw_sdk_host::service_train` (`ServiceTrains`: the world's timetable,
  the composer's service, `sight` = running state, active or formation ready, the drivable vehicle
  and its speed, permission; `report` = the service and up to three services that bring its train;
  `cab` = the driver's environment on the driving side; `board` = `SetControlledDrivable` into it;
  pure `plan::decide` and `plan::feeders` with 9 tests). The adapter's takeover after `tsw.service`
  (or `tsw.takeover`, then for the composer's service) waits for the card as before; when the
  loaded world has the service, the player has stood on foot for 10 s and no card came, it logs
  "starts on foot", reports the wait each minute (or when the reason changes), and boards the train
  once the service is ready and the train stands (< 0.3 m/s), at most 90 minutes. The card scan (an
  object walk) stops while it waits. `tsw.service` also sets the player mode to Driver, as the menu
  does. `Train::board_in` takes the cab name.
- **tsw-autopilot `f7e0519`**: with `autopilot.board` on and no scenario step, a player on foot is
  put in the composer's service's train the same way, the wait logged once a minute.

## Check in game

1. `tsw.service Rhine 1 RE-3409`. Expected: no card; after about 10 s
   `takeover: RE-3409 starts on foot; waiting for its train` and
   `takeover: waiting for RE-3409's train: its train has not arrived (…); RE-3409 not started, instruction …, … (formation AI_RE-3409_End); brought by AI_RE-3409 …; brought by AI2_RE-3446 …`,
   repeated each minute.
2. If `AI_RE-3409` is `running` and its first vehicle's distance falls: the train is coming; at
   the platform expect `takeover: boarding RE-3409's train … in <cab> (…): done`, the player in the
   front cab, the objective "Fahrgäste einsteigen lassen" still shown; then the autopilot can be
   engaged.
3. If `AI_RE-3409` stays `not started` or its distance stays the same: note its instruction and
   whether its vehicle is in the world at all; if it stands at a red signal, call the signaller
   from its position to see the dispatcher's answer (or use the reader of todo §1 item 20 once
   built).
4. Autopilot path: start RE-3409 from the game's own timetable menu, set `autopilot.board true`,
   engage the autopilot on foot: `autopilot: on foot, waiting for RE-3409's train: …` each minute,
   then `autopilot: boarding RE-3409's train …: true` and readying.
5. A normal service (RB75-28701) still shows its card and is confirmed
   (`takeover: confirmed …`) with no on-foot lines.

## Open

- Whether the feeder chain runs at all when the world starts after `AI_RE-3409`'s start, and what
  RE-3409's driver permission is at runtime (the new log line answers both).
- If the AI drives RE-3409 off before the player boards (permission AI or Both): the takeover
  boards when the train stands at Ingelheim, which should be before 07:46.
- Whether `SetControlledDrivable` alone makes the player the service's owner for every class
  (`GetOwnedServiceName` reads the reserved drivable), so that the timetable reader sees the
  service after boarding.
