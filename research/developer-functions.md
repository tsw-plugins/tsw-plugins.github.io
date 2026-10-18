---
name: developer-functions
description: >-
  Whether the game has a built-in way to ready an existing train: spawn presets, AI service setup, cheats and simple controls, searched in the reflection dumps and partly tested.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-17T11:59+0200
last_edited: 2026-10-17T11:59+0200
---

# Is there a built-in "get the train ready"? (2026-10-17)

Short answer: **not for a train that already exists.** The game readies trains only when it spawns
them, from a per-vehicle preset. Everything after spawn goes through the cab controls, both for the
player and for the AI driver. That is why `drive ready` works the controls itself.

Sources: reflection dumps (`dumps/tsw7-886/`: CXX/UHT headers, console variables, object dump),
searched 2026-10-17; candidates marked *tested* were tried in game.

## Spawn presets

| Function | Result |
| :--- | :--- |
| `USimulationComponent::ResetSimulation(ESimulationPreset, FName ConfigName)` | *tested*: on a live train the game crashes a few frames later, or when a player boards it (`dumps/.../cpp-telemetry-7/crash-resetsimulation/`). Resets only the simulation graph, not the cab levers. |
| `URailVehicleComponent::ApplySimulationPreset(ESimulationPreset, FName)` (on `RailVehiclePhysicsComponent0`) | *tested* with `RunningActivePreset` (2) on a parked BR 146: no crash in 40 s seated and through a following `drive ready`. The actor's `Preset` reads 2 and the battery comes on, but **all air goes to 0 bar** (main reservoir, brake pipe, parking brake cylinder), pantographs stay down and the breaker open. Not a "ready" button; it is the spawn-time reset. |
| `URailVehicleComponent::ResetPhysics(ESimulationPreset, FName)` | not tried. |
| Spawn side: `ATrainSpawner::bApplyPreset` + `FPresetConfiguration`, timetable `SpawnType` | this is where the game really applies presets: a scenario's player train spawns `RunningActive` (our BR 146 "preset 2" loco came with air, pantograph up and breaker closed); parked consists spawn `Parked` (0). |

`ESimulationPreset`: 0 `ParkedPreset`, 1 `RunningStoppedPreset`, 2 `RunningActivePreset`. Each RVM
blueprint handles the `ApplyPresetConfiguration` delegate for its own cab state.

## The AI driver's own startup

`RailVehicleComponent.PerformServiceSetupTask(AController*, FServiceSetupInfo)` is a delegate the
BR 146, Class 66, Class 323, Doppelstock and 8F blueprints implement. The behaviour-tree task
`UBTTask_SetupService` (900 s timeout) drives it. It makes the AI operate the controls through
gameplay tasks: realistic, slow, and needs an AI controller. Related: `ApplyVHIDPreset(...)` moves a
named set of controls to target values (`VHIDPresets` on the vehicle; names not in the dumps).
Not tried yet: worth a look as a per-class source of "which controls, which values".

## Cheats and debug commands (console)

Nothing readies a train. Useful ones: `ts2.dbg.CompleteCurrentObjective`,
`ts2.dbg.CompleteCurrentServiceInstruction`, `ts2.dbg.SetTrainSpeed` and
`ts2.dbg.SetSimplePhysicsPowerOrBrake` (bypass the simulation), `ts2.dbg.FaultsManager.ClearActiveFaults`,
`ts2.dbg.ToggleDriverPermission`, `ts2.dbg.AISetDrivable`.

## Simple controls / assist levels

`UTS2GameUserSettings::SetUseSimpleControls`, `UScenarioDefinition::bForceBeginnerControls`, cvar
`ts2.dbg.UseSimpleControls`, and `SetPlayerAssistLevel(Beginner|Standard|Expert)` exist.
`USimpleControlsComponent` only covers throttle, brake, reverser, horn, bell, doors, lights, wipers:
no battery, pantograph or breaker. Assist levels change auto-couple, auto-junctions, notifications
and the AI conductor. None of them starts a cold loco.

## Ruled out

- `TTC_BR146_DriverAssist_C`: tutorial tip pop-ups ("pantograph", "circuit breaker", ...).
- `TTC_BR146_ArtificialDriver_C` (`BankingCOMM_ArtificialDriver`): relays throttle/reverser between
  multiple-unit locos.
- `BP_TTC_BR146_StartupShutdown_C::BeginStartup`: audio only.
