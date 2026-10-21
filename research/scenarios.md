---
name: scenarios
description: >-
  How TSW 7 scenarios are built (scenario manager, objective actions, the composer that turns timetable instructions into objectives, failures, completion), a catalogue of the scripted events in the installed routes' 29 scenarios, the native random-fault system, and for each kind of event what tsw-autopilot would need and whether it can handle it.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-21T19:30+0200
last_edited: 2026-10-21T19:30+0200
---

# Scenarios and scripted events (2026-10-21)

Owner's question: scenarios contain scripted events (a failed loco, faults, coupling,
shunting, waiting for instructions, talking to the signaller, passing a signal at danger,
changing ends, refuelling). How are they built, what do they need, and can
[tsw-autopilot](../design/tsw-autopilot.md) complete them, or are some out of reach?

**Sources.** Each finding is marked:

- **[verified]**: seen in the decompiled blueprints or data of build 886, or in the UHT header dump.
- **[inferred]**: follows from those, or comes from Dovetail's public material, but was not
  checked in the running game.

Nothing here was run in game.

- Decompiled: `tsw-decomp/out` (core `ScenarioManager`, `ObjectiveAction_*`).
- Every scenario of the six installed route packs (Frankfurt–Fulda, Frankfurt S-Bahn,
  Dresden–Leipzig, Left Rhine, New Journeys BR 423 / Köln–Aachen, Training Centre) and the
  BR 442 fault data were unpacked and decompiled for this note into a scratch tree, which is
  not kept. To reproduce, unpack `…/<Route>_Route_Gameplay/Content/{Scenarios,Common}` with
  `repak` and run `kdecomp` as in `tsw-decomp/NOTES.md`.
- Native API: `tsw-coop/dumps/tsw7-886/UHTHeaderDump-TS2Prototype`.
- English objective texts: each route-gameplay plugin's `en/*.locres`. Left Rhine and the
  Training Centre ship none in their paks, so their texts show as keys only.

## How a scenario is built

### The pieces [verified]

Each scenario is a folder `…/<Route>_Route_Gameplay/Content/Scenarios/ScX/` with:

| Asset | Class | Contents |
| --- | --- | --- |
| `*_Definition` | `ScenarioDefinition` (data) | Name, description, start and end location, trains, date and time, weather. `Timetable`, `PlayerOnlyServices` (e.g. `[PlayerService]`), `bStartScenarioDrivingTrain`, `ScenarioManagerClass`, `bGenerateServiceObjectives = True`, `ObjectiveComposerClass` (the route's `Common/*_ObjectiveComposer`), score thresholds. |
| `*_Timetable` | `RouteTimetableDefinition` | Formations and services, as in timetable mode: `GoTo`, `LoadUnload`, `Couple`, `Uncouple` instructions with times, tolerances and `bFailIfPassedThrough`. |
| `*_Objectives` | Blueprint subclass of `ScenarioManagerBP_C` (native `AScenarioManagerActor`) | The scripted part (see below). |
| `Tiles/SST_x*_y*` | sub-levels | Placed actors: walk-to and look-at markers, NPCs (`DLG_RailFan_*`, `FSN_RailFanSinger`), props. Yard control boxes live in the route itself. |
| `Formations/`, `Dialogue/`, weather | data, sound | Formations, voice-over cues, the weather scenario. |

The 29 installed scenarios all follow this pattern. A scenario's player service is an
ordinary timetable service, so the reader the autopilot already uses (`timetable::Reader`)
works in scenarios; the RB51 test on 2026-10-21 already ran into a scenario's end
(`route.rs`).

### Objectives: action components in flows [verified]

The `*_Objectives` blueprint holds one component per objective step, each a subclass of
`UObjectiveActionComponent`. It puts them into flows, which are ordered lists that run one
action after another:

- `FlowAddAction(action)` appends an action to a flow.
- `FlowGroupAddMasterAction` / `FlowGroupAddSubAction(action, CanCompleteGroup)` make a group
  (`EObjectiveGroupType` `Concurrent` or `Sequential`). With `CanCompleteGroup`, a sub-action
  can end the whole group.

`AScenarioManagerActor` keeps `ObjectiveFlowManagers` (each with an `ActionReferenceList` and
a `CurrentActionIndex`).

Three sources fill the flows:

1. **The composer.** With `bGenerateServiceObjectives`, the native `AObjectiveComposerActor`
   turns the player service's timetable instructions into actions. Its class slots are
   `Service`, `Seat` ("sit in the driver's seat"), `MoveTo` (for `GoTo`), `Coupler`, `Wait`,
   `Cargo`, `EnterExit`, `Button` and `Lever` (`ObjectiveComposerBP`). The route composers
   (`FTF_ObjectiveComposer` etc.) are empty subclasses.
2. **Composer hooks in the scenario blueprint.** These are `OnComposerWillAddService`,
   `OnComposerDidAddService`, `OnComposerWillAddInstruction` and
   `OnComposerDidAddInstruction(ServiceName, InstructionIndex, Action)`. Every scenario
   inserts its own steps after a particular instruction this way. For example, "after
   `PlayerService` instruction 1, add: brake full, reverser off, key out, sit in the other
   cab, key in, reverser forward, headlights, apply power". Change-ends sequences are written
   out like this, step by step, in FSN ScA, FSN ScB, FSN ScE, FTF ScB, FTF ScC, FTF ScD,
   LFR ScA, LFR ScF, DLG ScC, DLG ScE and CTP ScB.
3. **Event handlers in the scenario blueprint.** `OnActionDidIntro`, `OnActionDidOutro` and
   `OnActionDidComplete` run a script when a given action starts or ends: spawn props, fade
   the screen, move NPCs, set a vehicle's controls, or lower a pantograph. Timers and
   delegates (`K2_SetTimer`, `OnIsLockedChanged`, `OnBatteryStateChanged`,
   `RequestPassAtDangerCallbackDelegate`) end actions with
   `action.ForceComplete(true, None)`.

### Action types and how each completes

The table counts components across the 29 installed scenarios, both hand-placed ones and the
composer's templates. Completion checks run every tick, natively
(`CheckSuccessCondition` / `CheckFailureCondition`).

| Action (`ObjectiveAction_*BP`) | Count | Completes when | Key fields |
| --- | --- | --- | --- |
| `Lever` | 417 | The control's output is at, above or below a value, optionally held for a time | `ModelComponentReference` (control name), `bCheckForSpecificOutput` / `bCheckForAboveOutput` / `bCheckForBelowOutput`, `OutputValue`, `MinimumRange` / `MaximumRange`, `MinHoldTime`, `SetCount`; `bUseComponentInExternalActor` + `ExternalActorReference` for a control outside the train |
| `Wait` | 174 | A time has passed (`WaitTime`, `bUseTimeOfDay`), doors opened or closed, or the script force-completes it | Mostly briefings with `VoiceOverStart`. Many have `WaitTime = 10:00:00` and are ended only by the script. |
| `Button` | 130 | A push button reaches an output, `PressCount` times, held for `MinPressTime` | As for `Lever`. NPC conversations are buttons on the NPC (`NPC_FirstTextOptionPicked`, `NPC_TextOptionPicked`). |
| `MoveTo` | 58 + composer | Train: the train stands at, is within, or passes a `NetworkTrackMarker` or ribbon location (`ConditionTest`, `ConditionTolerance`, `bFailOnDestinationPassedThrough`). On foot: the player reaches a walk-to marker. | `GetStopAtPlacementCetrePosition` (what tsw-sdk's `timetable::Objective` already reads through the HUD) |
| `Seat` | 44 | The player sits in a named seat (`SeatComponentReference`: `DriverSeat_B`, `Driver_F (Seat)`) | change ends, sit down |
| `EnterExit` | 20 | The player enters or leaves the vehicle | `bCheckForEntering` / `bCheckForExiting` |
| `Junction` | 16 | A set of points has the wanted state (`CheckJunctionState`) | `JunctionReference`; the component itself has `SetNetworkJunctionState(From, To, Immediately)` |
| `Speed` | 15 | Speed within `Minimum/MaximumSpeedRange` (m/s), above or below `RequiredSpeed`, or stopped for a time | e.g. LFR ScC: 20 km/h ±0.5 at each castle |
| `Coupler` | 11 | A coupler between two vehicles is connected or disconnected | `CouplerRailVehicleID`, `ThisCouplerSide` / `OtherCouplerSide`, `bCheckIfConnected` / `bCheckIfDisconnected` |
| `LookAt` | 4 | The camera looks at a marker (train inspection) | |
| `Simugraph` | 3 | A simulation parameter crosses a value | FSN ScB/ScC: `BrakeIntensifierControlReservoir.Pressure_BAR_G` `DecreasedPast 0` ("wait for the brakes to release"). TC ScC: the tender's water. |
| `Cargo`, `CargoFuel`, `FuelConnector`, `Pressure(_V2)`, `Turntable`, `MultiSeat`, `ShortcutMenu`, `SimpleControls*`, `InvertAxis`, `Signal`, `Service` | 0 in these scenarios | (core classes, used by other routes, tutorials and the composer) | |

The lever and button blueprints call `ProcessOutput(lever, dt)` every tick while the action
checks its condition, whether or not the player touched the control
(`ObjectiveAction_LeverBP` ubergraph 543–712) [verified]. A control set from code (as the
autopilot does with `SetCurrentInputValue`) should therefore satisfy a lever objective. This
is **[inferred]**: `ProcessOutput` is native, and `MinHoldTime` / `bMustEndInNotch` may add
conditions.

### Reading the current objective from code [verified API]

`AScenarioManagerActor` has static `FindScenarioManagerActor(world)`, plus
`GetCurrentAction()`, `GetCurrentActionForFlow(i)`, `GetActiveActionList(bIgnorePause)`,
`GetActionList()`, `IsFlowCompleted(i)` and `State` (`EScenarioManagerState`: `Idle` …
`CheckActions` … `Completed`).

Each action exposes:

- `State` (`EObjectiveActionState`), `IsCompleted()`, `ObjectiveName` / `ObjectiveDescription`
  (FText);
- `GetPrimaryModelComponentReference()`, `GetVirtualHIDFromPrimaryComponentReference()`
  (the actual control), `GetRailVehicle()`, `GetWorldLocation()`;
- `ServiceName` / `InstructionIndex` / `bLinkedToServiceInstruction`;
- `ForceComplete(success, FailureKey)`.

From these a plugin can see what the game wants next, as a class plus target values, without
parsing text.

### Failure and completion

- **Per action** [verified]: `FailureType` (`EObjectiveActionFailure`: `Soft`, `Hard`,
  `Prompt`, `SkipTo`), `FailureNotificationKey`, `bCheckFailureTime` / `FailureTime`, and
  `SkipToObjective`. `ScenarioManagerBP::ShowHUDObjectiveFailure` picks soft, hard or prompt
  text by `FailureType`; a hard failure ends the scenario with the failure screen.
- **Scenario-wide hooks** [verified]: `OnAnySPAD`, `OnAnyVehicleDerailed`, failure and
  warning colliders (`ScenarioColliderBP`, `ScenarioSpeedColliderBP` with
  `CheckIsSpeedAbove/Below`, `ScenarioDirectionColliderBP`, `BindTriggersForFailure`), and
  `SetOutOfBoundsFlag`. None of the 29 installed scenarios places a failure collider in its
  tiles. Their failures come from the timetable (`bFailIfPassedThrough` on a stop) and the
  global hooks.
- **Score** [verified]: driving distance reward, speeding, impact, wiper and unsafe-exit
  penalties (`ScoreLog`). `CheckSafetySystems` asks every `I_SafetyDevice` component of the
  train whether it was used correctly (PZB/Sifa switched in). Punctuality comes from the
  instructions' `EarlyTolerance` / `LateTolerance` (5 min typical).
- **Completion** [verified]: every flow completed → `OnDidComplete` → outro; or
  `CompleteScenario()`. With the composer, completing the player service ends it
  (`OnScenarioManagerDidComplete`, `OnSandboxServiceCompleted`).
- **Player assists** [verified]: the scenario manager has `bDisablePlayerAssistAutoCoupling`,
  `bDisablePlayerAssistOneButtonUncouple` and `bDisablePlayerAssistAutoSetJunction`. By
  default the game itself couples on contact, uncouples with one button and sets yard points.
- **Escape hatches** [verified API]: `ARouteTimetable::ForceEarlyCompletionForServiceInstruction(service, index)`
  and `UObjectiveActionComponent::ForceComplete`. Scenario scripts use both themselves
  (FTF ScF, FSN ScA, and every "contact signaller" step).

**[inferred]** The flow is strictly sequential. A scripted step (for example "set the
headlights to NORMAL") holds the flow until it is done. The timetable instruction behind the
next `MoveTo` still completes natively (the service runs on its own), and the action records
it (`bInstructionSuccessful`). An autopilot that ignores the scripted steps would arrive with
a backlog of open objectives. Whether the scenario then counts the stops, or fails them as
"not current", needs a test.

## The native fault system (not scenario-specific)

Since TSW 6, **Train Faults** is a setting. Faults occur at random on the player's train only;
a "Driver Assist" pop-up explains the fault and how to fix it, sometimes by leaving the seat
to reset a breaker or fuse; a frequency setting goes up to "High". The launch list includes
the DB BR 442, BR 294, Class 150/220, Arrow III and ALP-45DP. The BR 411, BR 146 and BR 185
were announced for later ([Dovetail features
article](https://live.trainsimworld.com/news/features-everything-you-need-to-know),
[support: Train Faults](https://support.dovetailgames.com/hc/en-us/articles/36927727591186)).
The same article lists timetable-only **signal delays** and **temporary speed restrictions**.

Build 886 [verified]:

- `UFaultsManagerComponent` on the rail vehicle has:
  - `LocoFaultsDataAsset` (`ULocoFaultTableDataAsset`: `Faults[]` of `FFaultInstance`
    { `UFaultDataAsset`, components to fault }, plus `VHidWatchers`);
  - `Minimum/MaximumTimeToRandomFault`;
  - `SetRandomFaultsEnabled`, `AddFault`, `AddFaultToComponent`, `RemoveFault`,
    `IsFaultActive`, `IsAnyFaultActive`, and the delegate `FaultAddedRemoved`.
- A `UFaultDataAsset` names a gameplay tag. It has `FaultFixes` (groups of
  `ResolvingGameplayTags`, `bRequireHardReset`), `bInOrder`, `bStopRandomFaultsUntilFixed` and
  notification rows.
- Components that can fail implement `IFaultableComponentInterface` (`AddFault`,
  `RemoveFault`, `IsFaulty`, `HasFault`).
- Installed data: only the **BR 442 Talent 2** (Dresden–Leipzig) has a fault table. Its
  faults are `CircuitBreakerOpen` (`RailVehicleFaults.CurrentCollector.CircuitBreakerOpen`),
  `Handbrake` (`…Handbrake.Applied`), `PantographBlocked`
  (`…CurrentCollector.DeploymentBlocked`), `PassengerDoorStuck`, `PassengerLights`
  (`…TrainLinePower.Off`), `Tempomat` (`…VHID.SetOff`) and `WiperBladeStuck`.
- `DLG_DB_BR422_FaultsManager` wires these up to fuses, collectors, doors, the speed control
  and a diesel engine (`DieselEngineStalled` tag, `IsFuelInjectorActive`). The BR 411 has only
  a notification table so far.

**For the autopilot** this matters in timetable mode, not only in scenarios. With faults on,
a BR 442 can lose its breaker or pantograph, get stuck with a handbrake on, or have its
tempomat switched off. The autopilot sees no traction (or a held brake) and, today, hands
back as "stalled" after 25 s. Reading `IsAnyFaultActive` and the active `UActiveFault`'s
`FaultDataAsset` names the fault. Many faults are fixed in the cab: re-close the breaker,
raise the pantograph again, re-select the tempomat. Readying's thorough pass already does
these things. Faults whose fix group needs a breaker or fuse outside the cab need walking.

## Catalogue of scripted events (installed routes)

| Scenario | What happens | Events (from the decompiled flow) |
| --- | --- | --- |
| FTF ScA *Mind the Gap* (ICE-T) | A stranded ICE alongside; passengers cross over a bridge | Script sets reverser and doors; walk to the doors (`MoveTo` marker); the other train's door opened by script; a bridge actor spawned and removed with screen fades; "open/close the left doors" ended by a timer that polls `AreDoorsInFormationUnlocked`; sit back down |
| FTF ScB *Pull* (BR 114) | "A loco has failed and its formation needs pulling" | Walk to the loco in the sidings; yard control box (EOW): insert key, set track 393, wait, remove key (`Button`/`Lever` on an external actor); **contact signaller**; couple to the failed formation; change ends; MCB close; `ForceComplete` from `OnServiceInstructionCompleted` |
| FTF ScC *Test Train* (Vectron) | Test run, couple to carriages | **Contact signaller** (polls `GetDistantSignalPassRequestStatus`); couple; brake cut-out in/out; change ends |
| FTF ScD *ICE into the Night* (ICE-T) | Park the train at Frankfurt | Wake a sleeping NPC passenger; change ends by **walking through the train** (7 `EnterExit`, 7 `Coupler` sub-actions as markers); fades |
| FTF ScE *Frankfurt Ferry* (BR 146 + cab car) | Shuttle with change ends at each end | Change ends loco ↔ cab car; finish at a walk marker |
| FTF ScF *Cheesed to Meet You* (Vectron, then passenger) | Freight, then a passenger train | Uncouple; script sets the cab car's master key and lights; `ForceEarlyCompletionForServiceInstruction` |
| FSN ScA *S-Bahn Breakdown* (BR 430) | "Help out a stuck train before towing them to the depot" | Change ends (twice); **contact signaller** for permission to pass a signal at danger (completed when the dispatcher answers `PassAtDangerCallOn` = 5); couple to the stuck train (timetable `Couple`, `FormationName = stuck train`); tow |
| FSN ScB *Regionalbahn Breakdown* (BR 143 + Dosto) | Help a doubled-up unit | **Contact signaller**; change ends to the cab car; **brakes that do not release**: "press and hold the brake overcharge button" (cab car `BrakeOvercharge`), "wait for the brakes to release" (`Simugraph`: brake intensifier reservoir below 0 bar), `LocomotiveConditionManager.OnIsLockedChanged` |
| FSN ScC *Flip Flop* | S-Bahn out, BR 143 back | Walk across the platform to another train; couple loco and train; brake-release wait (`Simugraph`) |
| FSN ScD *Hear That Train A-Comin'* (BR 430) | Charter for a late rock star | NPC passengers seated by script; battery, pantograph and MCB steps ended by delegates (`OnBatteryStateChanged`, `DeployedChanged`, `AvailableLocalSupplyChanged`) |
| FSN ScE *Triple Header* (BR 430) | Wash and assemble an S-Bahn | Change ends four times; **contact signaller**; **uncouple** with the BR 430's uncoupling key, switch and button (held), checked by polling `Coupler_F.IsConnected()`; parking brake set by script |
| DLG ScA *Diceversion* (ICE-T) | ICE diverted via Friedrichstadt | Switch tilting off and on (**GNT isolation switch**, NeiTec) for the diversion; leave the train at the end |
| DLG ScB *Put It in Reverse* (BR 143) | Propel into the sidings with "a set of eyes" | Talk to station staff (NPC); propelling move with radio calls at 50 m / 20 m (voice-over waits); change cab |
| DLG ScC *Geisterwagen* (BR 185) | Freight on a misty evening, a ghost wagon | Unscheduled stop at Weißig siding (`MoveTo` on a track marker not in the timetable); couple and uncouple; change cabs; ghost actor and lights set by script |
| DLG ScD *Wagon Once Over* (BR 363) | Yard, inspect a formation | Climb down, **find the broken wagon** by talking to NPCs at each wagon; headlights checked by a timer; shunting with manually controlled moves (`bManuallyControlledMainlineManouevre`), couple ×3, uncouple ×4 |
| DLG ScE *Above Ground Adventure* (BR 442) | Diverted S-Bahn, change ends | Change ends; couple and uncouple ×3 in the timetable |
| DLG ScF *Caught with Your Pantograph Down* (BR 185 ×2) | Double-headed freight in a storm | **Pantograph fault**: when the train passes a ribbon point (`FakeStopClear`), the script lowers both pantographs of the *second* loco (`CurrentCollector_F/B.DeployCollector(false)`); unscheduled stop group at Röderau track 5 (stop, or pass the clearing point) |
| LFR ScA *Cold Steel* (BR 110) | To Koblenz-Mosel yard | Couple and uncouple; change ends; brake keys at both ends |
| LFR ScB *Red Rhine* (BR 110) | Wait at St. Goar for a service to pass | Unscheduled stop at St. Goar (track marker), wait for the other service |
| LFR ScC *Castle Collection* (BR 103) | Sightseeing | Five **speed objectives**: 20 km/h ±0.5 at each castle between markers (`Speed` + 30 invisible `MoveTo` markers) |
| LFR ScD *Jump Around*, ScE *Single Line Rider*, ScF *All Change* | Express run; single line; change trains | ScE: talk to staff (NPC token exchange on the single line); ScF: change from BR 110 to the cab car and later to a BR 103, emergency brake valve and brake keys set by script, brake test |
| CTP ScA *Reverse Charge* (BR 423) | Service terminated by a "blockage", reverse back | Reverser key set by script; camera sequence; reverse at Müngersdorf |
| CTP ScB *Düren Düren* | Change ends at Düren | Change-ends sequence |
| CTP ScC *Snowblind* | Storm, fog, maintenance | Wipers and window heating; **scenario-only speed limits** 50 and 65 km/h through maintenance zones (speed events bound with `BindSpeedChangedEvent`, which show help tips "Speeding") |
| TC ScA *If You Build It* (BR 146) | Shunting | 13 `Junction` objectives (set points by hand), couple ×3, change ends |
| TC ScB *Stop Go* (Class 323) | Driving lesson | Reach and keep speeds, stop, emergency brake press and release, inspect the train (`LookAt`) |
| TC ScC *Put the Kettle On* (8F steam) | Steam servicing | Water the tender (hose connect, `Simugraph` on the tank), coal, points |

None of the installed scenarios scripts an **engine stall**, a **PZB fault** or a
**Zs 1 / Ersatzsignal** as such. What they do script is "contact the signaller and pass a red
signal with permission" (5 scenarios), a dropped pantograph, brakes that do not release, a
failed loco to be rescued or rescuing a stuck train, coupling, change ends, NPC talks and
yard boxes. Engine stalls, fuses and breakers come from the random fault system (BR 442 here;
diesels such as the BR 294 elsewhere).

## What the autopilot would need, kind by kind

Feasibility key:

- **works**: done by today's code;
- **feasible**: known API, moderate work;
- **hard**: possible, but needs new subsystems or in-game research;
- **out of scope**: not sensible to automate; skip it with `ForceComplete` or leave it to the
  player.

| Kind | What to read | What to call / which controls | Feasibility |
| --- | --- | --- | --- |
| **Ready the train, cab steps** ("insert reverser", "brake key ON", "MCB close", "panto up", headlights, wipers, passenger lights) | current action: class `Lever`/`Button`, `GetVirtualHIDFromPrimaryComponentReference`, `OutputValue` and check mode | `SetCurrentInputValue` on that control (tsw-sdk `Vhid::set_input`) | **works** in part: readying does keys, battery, panto, breaker, reverser and brakes by family. **Feasible** in general: an *objective follower* that sets exactly the control and value the current lever/button action asks for. This covers ~550 of the ~890 components, including headlights, GNT/NeiTec, wipers, window heating, signal lights and brake cut-out. |
| **Shut-down steps** (brake full, reverser off, key out, tail lights) | same | same | **Feasible**: the follower again. Today the autopilot hands back when the service completes, before these steps. |
| **Briefings** (`Wait` with voice-over) | action class `Wait` | nothing | **works**: they end on their own. |
| **Timed waits** ("wait for the loco", "wait for the service to pass", brake release `Simugraph`) | current action is `Wait`/`Simugraph`, not done | hold the train | **Feasible**: do not depart while the current action is a wait tied to the player's train. The timetable departure already makes most of these come out right. |
| **Timetable stops, doors, departure** | timetable | today's stops logic | **works**: the design doc's stop logic. Door objectives in FTF ScA are `Wait` actions completed by the script when it sees the doors unlocked, so working the doors completes them [inferred]. |
| **Unscheduled stops** (`MoveTo` on a track marker not in the timetable: Weißig siding, Röderau track 5, St. Goar) | current action `MoveTo` with `bUseNetworkTrackMarker`; distance via the HUD's `GetDistanceToObjective` (already read) | stop there; then wait for the next action | **Feasible**: the controller already takes the objective's distance, but only when it agrees with a timetable stop (within 220 m). Accept it alone when the current action is a train `MoveTo` with a stop condition. |
| **Speed objectives** (castles at 20 km/h, "maintain 80–90 mph") | current action `Speed`: `MinimumSpeedRange`/`MaximumSpeedRange`/`RequiredSpeed` (m/s) | a temporary limit for the planner | **Feasible**: one more constraint in `plan`. |
| **Scenario-only speed limits** (CTP ScC maintenance zones) | not in the driver aid; only in the scenario script (help tips) | — | **Hard**: invisible to the autopilot except as help-tip events (`ShowHelpTip('Speeding…')`). They only warn and cost score. Temporary speed restrictions in timetable mode do show in the HUD [inferred: they should be in the driver aid]. |
| **Contact the signaller / pass a signal at danger** (FSN ScA/ScB/ScE, FTF ScB/ScC) | standing at a red signal; current action `Button` on `ContactSignaller*`; or the dispatcher callback `RequestPassAtDangerCallbackDelegate` | `ADispatcher::RequestPassSignalAtDanger(ServiceName)` or `ATS2PrototypePlayerController::RequestPassSignalAtDanger()` (what `BP_SimpleRadio::ContactSignaller` does); bind the callback; `EPassAtDangerResponse::PassAtDangerCallOn` (5) = permission | **Feasible**. After permission the planner must pass that one signal at danger at caution speed (the dispatcher records it in `ActivePassAtDangerAllowedServices`) instead of holding 25 m before it. The approach is then "on sight", usually to a train ahead (next row). |
| **Approach and couple to a standing train** (rescue a stuck train, pick up carriages, `Couple` instructions in 11 scenarios) | current instruction `Couple` (`FormationName`); distance to the coupling target: the objective's marker distance (`Coupler` action with an auto marker) [inferred], or the other formation's position | creep at ≤ 1 m/s into contact; the game couples on contact (auto-coupling assist) | **Hard but worth it**: a new "on sight" mode with a reliable distance to the vehicle ahead. The track-data reader has no vehicle item; the coupler target must come from the objective or from the formation's position. |
| **Uncouple** (`Uncouple` instructions, BR 430 uncoupling key + switch + button) | current instruction `Uncouple` / action `Coupler` with `bCheckIfDisconnected` | `UCouplerComponent::PerformManualUncouple()` on the right coupler, or the cab's uncoupling controls via the follower | **Feasible**: one call. The BR 430's in-cab procedure is lever and button actions the follower can do. |
| **Change ends** (13 scenarios; walking through the ICE in FTF ScD) | current action `Seat` (`SeatComponentReference`, vehicle by `RailVehicleID`) | `ADriverPawn::SetControlledDrivableFromSeat(seat, smooth)`; then readying and driving from the other cab (`CabSide` already handles `_B` controls) | **Feasible**: the seat change is one call, and the follower does the shut-down and set-up steps. The ICE walk-through (`EnterExit` per car) is the same seat call to the far end, then `ForceComplete` on the walk sub-actions. |
| **Change trains** (FSN ScC, LFR ScF, FTF ScB: walk to another train) | `MoveTo` to a walk marker, `EnterExit`, `Seat` in another vehicle | Teleport the pawn (tsw-jump) or seat directly with `SetControlledDrivableFromSeat` | **Hard**: possible, but it means taking over the player's body. Recommended: `ForceComplete` the walk, seat directly, carry on. |
| **Walk-to markers, leave the train, look at parts** | `MoveTo` walk marker, `EnterExit` exit, `LookAt` | teleport or camera | **Out of scope** for driving: skip with `ForceComplete(true)`, or hand back to the player with a message. |
| **NPC conversations** (talk to staff, find the broken wagon, wake a passenger) | `Button` on `NPC_*TextOptionPicked` in an external actor | setting that component's value would probably pass the check [inferred] | **Out of scope** (story content); `ForceComplete` if the user wants the run to go on. |
| **Yard control boxes, hand points** (FTF ScB EOW box; TC ScA/ScC `Junction`) | `Button`/`Lever` with `bUseComponentInExternalActor`; `Junction` action | set the external actor's control (the follower); `UObjectiveActionJunctionComponent::SetNetworkJunctionState(from, to, true)` (the scripts call it themselves) | **Feasible** for the actions. Shunting moves themselves (`bManuallyControlledMainlineManouevre`, propelling with radio calls) are **hard**: the route ahead is not signalled, so the train must be driven on sight to a marker. |
| **Brakes that do not release** (FSN ScB) | `Simugraph` wait; `LocomotiveConditionManager.IsLocked`; brake cylinder pressure | the follower presses and holds `BrakeOvercharge` (button with hold time) | **Feasible** through the follower. Without it the train stalls, and today the autopilot hands back after 25 s. |
| **Pantograph dropped / breaker opened** (DLG ScF script; BR 442 random faults) | `CurrentCollector.IsDeployed`, breaker state, `FaultsManagerComponent::IsAnyFaultActive` | readying's panto and breaker steps while moving (coast, raise, close) | **Feasible**: run readying's power part whenever traction is lost, not only at a stand. In DLG ScF it is the second loco; whether the lead cab's multiple-unit panto control raises it is [inferred]. |
| **Random faults needing an out-of-cab fix** (fuses, handbrake on a car, stuck door) | fault tag names | the fault's fix is a gameplay tag set by a control (`FaultVHidWatcher` ranges) | **Hard / out of scope**: walking to a fuse panel. Option: `RemoveFault` (a cheat; fine for a test driver, not as a feature). |
| **Engine stall** (diesel faults, `DieselEngineStalled`) | engine-running parameter | readying's engine start | **Feasible** for diesels readying already starts. None of the installed scenarios scripts one. |
| **Tilt / GNT, PZB/LZB/Sifa isolation** | `Lever` action on `GNTIsolationSwitch`, `GST_Switch` | the follower | **Feasible**. Isolating PZB while it is on would change the autopilot's planning; none of the installed scenarios does it. |
| **Steam servicing** (water, coal) | `Simugraph` on the tender, hose `OnConnectedDelegate`, `CoalBunkerComponent` | | **Out of scope**: steam driving itself is untested. |
| **Signal delays** (timetable mode, TSW 6+) | the signal ahead | already handled: wait at red | **works**. |
| **Scenario hooks that move the player's levers** (FTF ScA sets throttle and brake; LFR ScF sets the emergency valve, brake key and reverser; FSN ScE sets the parking brake; CTP ScA the reverser key) | — | — | **Hazard**: `watch` takes any lever not where the autopilot left it as the player's hand and hands back. Most of these run at the start, before the autopilot is on; the rest would cause a spurious hand-back. Fix: ignore changes while the current action's script is known to set them, or re-baseline levers at action changes. |

## Suggested order of work

1. **Read the scenario state.** Find the scenario manager, the current action, its class,
   control, target and linked instruction, and show it in `autopilot.status`. This is
   read-only and settles the open **[inferred]** points in game:
   - do lever objectives complete on code-set values?
   - what happens to stops reached while scripted steps are still open?
2. **Objective follower for in-cab `Lever`/`Button` actions** in the player's train: set the
   asked value, honour hold times and press counts. This alone covers most set-up, shut-down,
   change-ends, wiper, light, tilt, uncoupling-key and brake-overcharge steps. It also makes
   "stay on after the service completes" possible, so shut-down objectives get done.
3. **Do not depart while the current action is a wait on the player's train**, and stop at
   unscheduled `MoveTo` track markers (use the objective distance even without a timetable
   stop).
4. **Speed objectives** as a planner constraint.
5. **Power loss while moving**: detect a lowered pantograph or open breaker (and
   `IsAnyFaultActive`), then coast and re-ready. This covers DLG ScF and the BR 442 random
   faults that are fixed in the cab.
6. **Change ends** by `SetControlledDrivableFromSeat` to the asked seat, then ready that cab;
   `ForceComplete` walk-through sub-actions.
7. **Contact the signaller**: `RequestPassSignalAtDanger`, the callback, and a pass-at-danger
   mode (one red signal at caution speed).
8. **Coupling on sight**: creep to the coupling target using the objective's distance, couple
   on contact. Also uncoupling by `PerformManualUncouple` or the in-cab controls.
9. **Optional "skip" setting** for what a driver robot should not do (walk markers, NPC talks,
   inspections, out-of-cab fault fixes): `ForceComplete(true)` on the current action, logged,
   off by default. For the tsw-coop test-driver use it makes every installed scenario runnable
   end to end.
10. Out of scope: steam servicing, yard shunting without signals beyond simple propelling
    moves, and scenario-only speed limits that only exist as help tips.

## Summary

TSW scenarios are timetable services plus a scripted layer. A `ScenarioDefinition` names a
timetable, a weather, and a blueprint subclass of `ScenarioManagerBP` that holds objective
action components. The native composer turns the player service's instructions into
`MoveTo`/`Coupler`/`Seat`/… objectives. The blueprint inserts hand-made steps after chosen
instructions and runs scripts on action start and end. Completion is checked per action every
tick (lever or button output, position, speed, seat, coupler, simulation value). Failures are
per action (soft, hard, prompt) or global (SPAD, derailment, colliders). Since TSW 6 a
separate native fault system can fail the player's train at random; only the BR 442 has fault
data among the installed trains.

The 29 installed scenarios script passing a red signal after contacting the signaller,
rescuing or towing failed trains, coupling and uncoupling, changing ends, brakes that do not
release, a dropped pantograph, unscheduled stops, sightseeing speed limits, yard boxes,
points, NPC talks and steam servicing. None scripts an engine stall or a PZB fault.

The autopilot drives the timetable part already. With a read of the current action and an
*objective follower* for in-cab levers and buttons, most scripted steps become doable through
the same controls. Other kinds need new work but have a known API:

- unscheduled stops and speed objectives;
- power loss while moving;
- change ends (`SetControlledDrivableFromSeat`);
- permission to pass at danger (`RequestPassSignalAtDanger`);
- uncoupling (`PerformManualUncouple`).

Coupling on sight is hard but valuable. Walking, NPC dialogue, inspections, out-of-cab fault
fixes and steam servicing are out of scope for a driver. An optional, logged `ForceComplete`
"skip" would still let a test driver finish every installed scenario.
