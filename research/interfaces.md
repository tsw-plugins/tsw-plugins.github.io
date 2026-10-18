---
name: interfaces
description: >-
  Every interface into the running game (UE4SS Lua, hooks, DTG HTTP API, VirtualRailDriver, virtual pad), tested side by side on a BR 146, with recommendations for tests and co-op.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-17T12:22+0200
last_edited: 2026-10-18T09:50+0200
---

# Interfaces into a running TSW 7: what each can do (2026-10-17)

Until now we drove trains through one path: Lua calls on the cab controls (`drive_ctl`). This note
compares every interface we found, tested live on a BR 146 in the Training Centre, scenario A. Probe
scripts and raw notes: `dumps/tsw7-886/experiments/interfaces/{external,input,native}/`.

## Summary

| Interface | Reads | Writes controls | Interlocks honoured | Needs focus | Fires the blueprint event | Use it for |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| UE4SS Lua: `Begin*Digital(pc)` / `EndChanging` (held input) | everything | every control | yes | no | yes | test automation (`drive`), host-side replay |
| UE4SS Lua: `SetCurrentInputValue` (plain set) | | every control | lever clamped by locks | no | yes (`VirtualHIDChanged`) | quick sets; jumps instead of moving |
| UE4SS Lua: blueprint functions (`SetBatteryState`, `SetParkingBrakeLocal`) | | the function's state | bypasses the button | no | no | where no button works |
| UE4SS hooks on the player controller's VHID calls | **player input** | | | no | | **co-op: capture what a player does** |
| DTG HTTP API `DriverInput/<ctl>.InputValue` | yes | active cab only | yes (lever pulled back to the locked range) | no | yes | external tools, no mod needed |
| DTG HTTP API `VirtualRailDriver` | yes | ~7 axes + buttons, per-loco mapping | yes (lever moves, no traction) | no | yes | RailDriver-style external input |
| DTG HTTP API subscriptions | 16 paths per read, p50 17 ms | | | no | | cheap external state polling |
| Virtual Xbox pad (uinput) | | gamepad bindings | yes (real input) | **yes**: ignored when unfocused | yes, through the controller RPCs | foreground end-to-end tests only |
| Keyboard tools (ydotool, xdotool) | | key bindings | yes | yes, and they take over the desktop | | not used |
| Fake RailDriver over uhid | | as VirtualRailDriver | | no (inferred) | | not tested: needs root, udev rule, launch option; the API's VirtualRailDriver covers the same path |

## How player input really flows (hooks, 12:19)

With `native/03_hooks_observe.lua` hooked, a virtual pad moving the throttle produced:

```
BeginIncreasingVHIDComponent  Throttle_F value=0.0
InputValueChanged             Throttle_F 0.000 -> 0.008 by TS2DefaultPlayerController_C   (x ~16, every frame)
EndUsingVHIDComponent         Throttle_F value=0.215
```

So real input goes through `ATS2PrototypePlayerController::Begin{Increasing,Decreasing,Changing,Dragging}VHIDComponent`
/ `EndUsingVHIDComponent` / `ToggleVHIDComponent`. These are server RPCs, i.e. the game's own
"what the player did" messages. **For co-op that is the capture point**: hook them on a guest,
send (component name, call, timestamp), replay on the host with the same calls or with
`Begin*Digital(pc)`. Our Lua `move` produced `InputValueChanged` without those RPCs (instigator not
the player controller), so the hook does not echo our own replays.

Reloading the mod (`tswcmd reload`) unregisters every hook it registered.

## Findings that changed our code or notes

- **Push buttons with `bUseDecreaseInputToOperate`** only react to the decrease input. The BR 146
  `ParkingBrake_Release_F` is one; our `press` always used the increase input, which is why it "did
  nothing from code". `drive_ctl.press` now reads the flag. Verified: parking brake applied
  (1.8 bar), `drive press ParkingBrake_Release_F` filled it to 9.9 bar.
- `BatteryControl_F` has input identifier `None` (no key binding), which is probably why pressing it
  does nothing; `SetBatteryState(true)` stays.
- Plain sets fire the control's blueprint event too ([driving-trains.md](driving-trains.md)).
- **DTG API writes respect the traction lock.** With the train brake applied, `InputValue=0.5` on
  the throttle was pulled back to 0.1 and gave no tractive effort; unlocked, the same write drove
  the loco. The earlier note "the API goes around interlocks" was wrong for the throttle.
  Between-notch values snap (0.2 and 0.3 became 0.1 on the BR 146, 4 notches).
- `Interacting` (DTG API) takes a number (`1`/`0`), not `true`; it changed nothing visible.
- `VirtualRailDriver`: `Enabled` takes `1`/`0`. Its `Throttle` is the RailDriver's combined
  power/brake lever: 0.5 neutral, 1 full power, 0.75 gave Throttle_F 0.17, below 0.5 moves the
  dynamic brake (0 = 0.8). `Reverser` 0.5 set Reverser_F to 0.66; 0 and 1 did not move it.
  Locked train: lever went to 1.0, tractive effort stayed 0.
- Subscriptions work in TSW 7 (contrary to forum reports for TSW 5/6). `CurrentDrivableActor/Function.X`
  paths are not valid in a subscription; `DriverInput/…`, `DriverAid.*`, `TimeOfDay.Data`,
  `VirtualRailDriver.Data`, `CurrentFormation/0.ObjectClass`, `WeatherManager.*` are.
- Virtual pad: works only while TSW has focus (UE4 drops background gamepad input). The game took
  focus back by itself afterwards.
- The BR 146's VHID presets are only light settings (6 presets, headlights/instrument lights);
  `DrivingControlLayout` / `SafeExitControlLayout` are empty. No startup data there.
- UE4SS can list delegate bindings from Lua (`GetBindings`): `timetable.OnServiceStarted`,
  `rvc.PerformServiceSetupTask`, `rvc.OnFormationChanged`, `pc.DrivableActorChangedEvent` and more
  name the exact handler to hook.
- Probe state must go into `_G` explicitly: the bridge's `eval` gives each run its own environment,
  so a plain global in one probe is invisible to the next (`03b` could not unhook `03`'s hooks).

- **The loco's own service setup does not start it for the player** (`native/06`, variant
  "broadcast", 12:20, cold BR 146): `NotifyBeginTask(SetupService)` plus a broadcast of
  `PerformServiceSetupTask(pc, …)` left battery, pantographs, breaker and air untouched after 42 s.
  Afterwards the cab showed key in, reverser forward, train and dynamic brake 0.2; whether the setup
  did that is unknown (the levers were not recorded before the call). The rest
  presumably runs as gameplay tasks that need an AI controller. `drive ready`'s recipes stay.

### AI takeover and handback (12:24–12:28, fresh scenario A, `native/04` + `05`)

- **Takeover works.** `SetServiceDriverPermission(PlayerService, Both=2)` + `pc:ForceRelinquishService`
  moved the player out of the cab at once; an `AIC_RailVehicleControlBase_C` took the train, ran its
  service setup in ~6 s (state 1 → 3 CompletedSuccess; it put the reverser key in and the reverser
  forward), and drove: 0 → 7.5 m/s in ~25 s (target 8.3), later reversed (target −8.3 m/s).
- **The AI drives with simple physics, not the cab.** While it accelerated, `Throttle_F` stayed 0,
  tractive effort read 0 N, and the main reservoir sat frozen at 9.72 bar for over a minute. The
  simulation is not what moves an AI train, so AI driving tells us nothing about the cab or
  interlocks, and it is no shortcut for readying a train for the player.
- **Handback works.** Permission `Player=0` + `pawn:SetControlledDrivable(train, …)`: the AI
  controller was gone within 2 s, the player owned the service and sat in the cab again. No shutdown
  sequence ran (battery, pantograph, breaker stayed up). The train kept its speed (−5.4 m/s,
  coasting through the simulation now), then stopped within ~4 s at t+18 s (cause not identified).
  Afterwards: train and dynamic brake 0.2, traction locked; `drive ready` fixes that.
- Use: AI takeover can provide moving test traffic or hand a service to the AI while a co-op player
  is away. It does not exercise the cab.

### Remaining probes (12:28–12:35)

- **Controller RPCs work from Lua** (`input/06`): `pc:BeginIncreasingVHIDComponent(Throttle_F)`,
  600 ms, `pc:EndUsingVHIDComponent` moved the lever, `IsChanging()` true and the instigator was
  the player controller, exactly as for pad input. Locked: stopped at 0.1. Unlocked, 1.5 s: 0.44 and
  44 kN tractive effort; `BeginDecreasing…` 2.5 s brought it back to 0. **A co-op host can replay
  captured guest input with the very same calls.**
- **Drag** (`input/07`, `BeginDraggingVHIDComponent` + `SetDragDeltaVHIDComponent`, and the
  component's `BeginChangingAnalogue`/`SetPositionDeltaAnalogue`): only the first step moved the
  dynamic brake slightly (0.80 → 0.799 with −0.05, → 0.764 with −2), later steps did nothing, and the
  lever snapped back to 0.8. Not usable as is.
- **Bindings** (`input/01`, `02`; output saved next to the probes): 87 of the BR 146's 166 controls
  have no input identifier (mouse only), among them `BatteryControl_*`, `PantographSelector`,
  `AirCompressor_*`. Keyboard: Throttle A/D, Reverser W/S, Handbrake `\` / Shift+`\`, Pantograph
  P / Shift+P, Sand X, CabLights L. Gamepad: right trigger = throttle up.
- `input/03`: with the cab idle, nothing is looked at or selected (mouse path inactive).
- `input/08` (synthetic key via `CreatePressedReleasedKeyEvent`): no live menu widget in a scenario;
  the class-default fallback (crash risk) not run.
- `native/09`: the `ts2.dbg.Log*` commands ran, but the shipping build writes no game log
  (`Saved/Logs` has only CrashReportClient logs), so their output is invisible.
- **`ApplyVHIDPreset` works** (`native/07`): `FrontHeadightsBright` set HeadlightBrightness_F 1.0
  and SignalLights_F 0 within 1 s. On the BR 146 the presets are only lights.
- **Spawned trains come up nearly running** (`native/08`): a BR 146 from `SpawnFormation` (bridge
  `spawn`) is `Preset=1` (RunningStopped): battery on, rear pantograph up, breaker closed, main
  reservoir 9.74 bar, brake pipe 4.6 bar. Only the cab is not set up (key, reverser, brakes 0.2).
  `ApplySimulationPreset(2)` on the fresh loco set `Preset=2` and kept the air (unlike on a live
  loco), but nothing else differed.
- **Reverser key on a spawned loco did not go in** (`drive ready` BLOCKED after 2 presses, begin
  returned true). Not resolved: the game was paused at that time (see below), so the result is
  invalid and must be repeated.
- **Spawning derailed the scenario train and ended the scenario.** `B.spawnFormation(…, 8000)`
  places the consist 80 m along the track from the pawn, onto track that was already occupied (the
  scenario's train stood there after the handback). blu saw the train jump and the game ended the
  scenario with "entgleist" (derailed); the end screen ("Szenario wiederholen / Hauptmenü") paused
  the game (`IsGamePaused` true) and every control then "stalled". The `ready` failure on the
  spawned loco happened in that state and must be repeated. Rules: never spawn onto track near
  other vehicles in a running scenario (check occupancy first, or spawn in free roam on an empty
  siding), and check `IsGamePaused` plus a screenshot before blaming a probe. Repeated later away
  from traffic: the reverser key went in normally, so the failure was the pause.

### Spawner and synthetic key, away from traffic (12:40–12:47)

- **Free roam from code:** `con ts2.dbg.LoadTimetable /TrainingCentre_Route_Gameplay/Timetable/TC_Timetable.TC_Timetable`
  loads the route in timetable mode: walking pawn, 84 parked vehicles, no AI drivers, no
  `SandboxManager`. Works as a free-roam stand-in without touching the menus.
- **`FindTrainSpawnLocationNearDriverPawn(pawn, DistanceCM, …)` is not an offset along the track.**
  `GetTransformAtTrackLocation(pawn, loc, out)` (out struct filled in place: `out.Translation`)
  showed: 8000/20000/40000 → a point 5 m from the pawn, 80000 → 229 m away, 150000 → not found.
  That is why the scenario spawn hit the train the pawn sat in. The bridge's `spawn` now resolves
  the point and refuses when any vehicle (view actor position; the `RailVehicle` actors can all
  report one location in timetable mode) is within 100 m, unless `force`. The direction comes
  back as `dir.OutLocalSpawnDir`; the bridge used `dir[1]` (always nil → Forwards).
- **`ATrainSpawner` works** (`native/08b_spawner_clear_point.lua`, placed on the 80000 point
  184 m from the nearest vehicle): deferred spawn + `bApplyPreset`/`PresetConfig{Preset=2}` +
  `SpawnConsist()` made one BR 146 with `Preset=2`, both pantographs down. No crash.
- That spawner-made loco never simulated: brake cylinder 1.06 / pipe 4.61 / main 9.74 bar frozen,
  0 V, `power 0.3` gave 0 N. **Cause: it was never properly boarded.** `drive board` had answered
  "no drivable vehicle matching … among 0 candidates" (the ATrainSpawner consist is not found as a
  drivable), yet `drive diag` showed it, so the failure went unnoticed. See the next section.

### What switches a train's simulation on (12:48–12:57)

`RailVehicleComponent.SimPhysicsEnabledState` (0 Disabled, 1 Kinematic, 2 DynamicDirect,
3 DynamicIndirect) and `CurrentPhysicsMode` (0 Dynamic, 1 Static, 2 Kinematic, 3 Disabled) plus
`SimulationComponentsEnabled()` show it. Every vehicle not driven by the player is `1/2/false`:
kinematic, simulation off, values frozen at their spawn/preset numbers (9.742 bar main reservoir
on every preset-1/2 BR 146). No reflected function switches it; writing
`SimPhysicsEnabledState = 2` is reverted by the game within 5 s.

**Boarding switches it** (`pawn:SetControlledDrivable`, i.e. `drive board`): the boarded loco goes
to `2/0/true` and its air starts moving at once; the previously boarded one drops back to `1/2`.
Verified in scenario A (the scenario loco, a cold service-less loco, and a **bridge-spawned** loco on
a point 298 m from other vehicles) and in timetable mode (a parked loco). The spawned loco was then
`READY` in 5 s (preset 1 spawns are almost running) and made 58 kN / 1.4 m/s at power 0.3.

So spawned trains are usable test trains: spawn on clear track, `drive board <name>`, `drive ready`.
Only the boarded consist simulates; other spawned consists stay kinematic scenery (the AI moves
them with simple physics, see the AI takeover section).
- **Synthetic key via `CreatePressedReleasedKeyEvent` on the class default object:** no crash, no
  effect (key `L`, cab lights stayed 0.50; TSW was not focused). Not a usable input path.

### Spawned trains derail in Free Roam (Frankfurt S-Bahn DLC, 13:29–13:45)

`drive spawn` from the debug menu ended a real Free Roam ("Freies Spiel") session with the toast
"Zugdienst fehlgeschlagen: Fahrzeug Entgleist" and the "Wohin geht es als nächstes" outro.
`native/09_derail_watch.lua` (derail hooks + a 100 ms `IsDerailed`/speed sampler) showed the
spawned loco derail **at 0 km/h, 0.3–6 s after boarding**, before `drive ready` touched anything:

| Mode, route Frankfurt S-Bahn | Spawned + boarded | Result |
| --- | --- | --- |
| Free Roam, platform track 4 m from the pawn | TTC BR 146 | derailed 0.3 s after boarding |
| Free Roam, open line 742 m out | TTC BR 146 | derailed |
| Free Roam, open line 742 m out | route's own BR 143 (`FSN_ScA_BR143Solo`) | derailed |
| Timetable (`S-bahnTimetable_Reduced` via `ts2.dbg.LoadTimetable`) | TTC BR 146 | fine, session continues |

So it is the mode, not the route, the spot or the rolling stock. Supporting signs in Free Roam:
the brake pipe stayed frozen at 4.61 bar while `ready` tried to release (5.03 bar and moving in
timetable mode), and the derailed loco was found 33 m from and 11 m above where it was placed
(a freshly spawned, unboarded one sat 2.7 m / +5.3 m from the point), so switching physics on
throws the train rather than letting it settle. No junction was flagged `bBroken` afterwards, which
argues against the `ConvergingJunction` derail reason. The spawner lives in
`TimetableRuntimeExtensionLibrary`; Free Roam has no timetable runtime, which is the likely
reason the spawned consist is not set up for physics. A derail ends the session in every mode.

Also measured: `FNetworkRibbonLocation.RibbonLocation` is a 0–1 fraction of the ribbon (1.0 on a
18.6 m ribbon here), extrapolated linearly outside that range, and
`FindTrainSpawnLocationNearDriverPawn` returned ribbon ends (1.0) for every distance tried.

**Rule:** spawn test trains only in timetable or scenario mode. `tswcmd play <route> t1` gives a
timetable session on any installed route (next section).

### Starting content without the menus (14:18–14:27)

`UDLCManagementFunctionLibrary` knows every installed route before any of it is mounted, and can
mount a route's content on demand. With that, one bridge command (`tswcmd play`,
`mod-lua/TswCoopDebug/Scripts/play.lua`) starts any timetable or scenario.

- **The catalogue.** `GetCachedContentWithRouteList(pc, out)` fills `out` with one `FCachedContent`
  per installed route. Read each entry with `out[i]:get()`; the nested arrays index directly
  (`c.Timetables[j]`, with no `:get()`). Each route has `DLCName`,
  `RouteDefinition.RouteDisplayName`, `Timetables` (`Name`, `CachedServices`) and
  `ScenarioDefinitions` (`DisplayName`; `ScenarioType` is 0 for a scenario, 1 for training).
  `GetPathOfSoftObject(x.SoftObject).AssetPathName` gives the asset path.

  The five routes installed on 2026-10-17:

  | Route | Timetables | Scenarios |
  | --- | --- | --- |
  | TrainingCentre | 1 | 31 |
  | DresdenLeipzig | 1 | 13 |
  | FrankfurtFulda | 1 | 14 |
  | FrankfurtSBahn | 2 | 9 |
  | LeftRhine | 1 | 10 |

- **Mounting.** Pass that same cached struct to `RequestContentLoadForTimetableOnlySynchronous(pc, tt)`
  or `RequestContentLoadForScenarioSynchronous(pc, sc)`. Both return true at once.
  `GetActiveMountPoints` still lists nothing afterwards, but the load that follows works.
- **Loading.** For a timetable, use `ts2.dbg.LoadTimetable <asset path>`. For a scenario, call
  `LoadAsset(path)` and then `TS2GameplayFunctionLibrary.LoadScenario(pc, def)`. Each takes about
  50 s to reach the cab or the platform.

  Before the mount step, a DLC timetable loaded only from inside a world of the same route.

Verified, each checked with `GetCurrentRoute`/`GetCurrentScenario`/`GetTimetable` and `status`:

| Start from | Command | Result |
| --- | --- | --- |
| main menu | mount + `LoadTimetable` FrankfurtSBahn reduced | timetable session, 662 vehicles |
| Frankfurt S-Bahn world | `LeftRhine` scenario A "Kalter Stahl" | scenario running, BR 110 drivable, 237 vehicles |
| Left Rhine scenario | `tswcmd play dresden t1` | Leipzig–Dresden timetable, 1277 vehicles |
| main menu (`tswcmd menu`) | `tswcmd play fulda testzug` | scenario ScC, Vectron cab, first objective shown |

A timetable session puts the player on foot at the route's default spawn. To drive a particular
service, use `ts2.dbg.JumpToService` or `drive spawn`.

Free Roam has no native "start" function. `UDriveModeSettings` (`FrontEndDriveModeSettings` on
the game instance) has `bSandboxMode`, `bClearTimetable`, `SandboxManagerClass`, `Timetable`,
`InitialTimetableService`, `TrainEntry` and `bSpawnDriving`; the front end
(`WBP_Artemis_GameplayModeSelectWidget:OpenFreeroamMenu`) fills these in Blueprint, and
`UTS2MainMenuWidget::Load()` loads whatever they hold (`GetDriveModeSettings()` returns them).
2026-10-18, from the headers and the object dump, not yet run: `play <route> free` (`play.lua`)
sets the route's first timetable, `bSandboxMode`, `bClearTimetable`, `bSpawnDriving = false`
and `SandboxManagerClass = /Game/Core/Sandbox/BP_SandboxManager.BP_SandboxManager_C` on the main
menu's settings, then calls `Load()`. To check in game: whether it lands in Free Roam ("Freies
Spiel"), and whether `Timetable` must be the route's or may stay empty. Spawned trains derail in
Free Roam anyway (above), so timetable mode is the better test bed.

## Recommendations

**Test automation:** keep UE4SS Lua (`drive`) as the driver: it reaches every control, works
unfocused, honours interlocks with held input, and `drive diag` reads everything. Add DTG API
subscriptions as an independent observer where a test should not trust the mod (one HTTP read for
16 values). Use the virtual pad only for an end-to-end "real input" smoke test while TSW has focus.

**Co-op input replication:** capture on the guest with hooks on the player controller's
`Begin*/End*/ToggleVHIDComponent` RPCs (plus `InputValueChanged` for the resulting values), send
component + action, replay on the host with held input (`Begin*Digital(pc)` / `EndChanging`), which
honours the host's interlocks. The DTG API is a fallback for a mod-free client (it also honours the
lock), but only reaches the active cab.

## Open

- Whether a consist the player does not drive can be made to simulate (co-op: the host simulates
  only its own train; guests' trains would be kinematic on the host).
- Why `drive board` does not find ATrainSpawner-made vehicles.
- How to detect Free Roam from Lua, so `drive spawn` can refuse there instead of ending the session.
- Whether a replayed `BeginIncreasingVHIDComponent` RPC from Lua is accepted (input probe 06).
