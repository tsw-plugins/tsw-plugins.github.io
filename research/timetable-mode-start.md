---
name: timetable-mode-start
description: >-
  How the TSW 7 front end starts timetable mode driving a chosen service (every UDriveModeSettings field it writes, the time of day, the native conditions at world start) and why the start card ("BEGINNEN") pauses the game and how to dismiss it from code. Decompiled blueprints and Ghidra.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-21T20:15+0200
last_edited: 2026-10-23T02:30+0200
---

# Starting timetable mode with a service (2026-10-21)

Question: a mod can already start Free Roam from code by filling the main menu's
`UDriveModeSettings` (the game instance's `FrontEndDriveModeSettings`) and calling
`UTS2MainMenuWidget::Load()` ([interfaces.md](interfaces.md), section "Starting content without the menus").
For a timetable service the same approach (timetable, `InitialTimetableService`,
`bSpawnDriving = true`, `bSandboxMode = false`, `bClearTimetable = false`) loaded the world with
the player on foot on a platform, driving nothing. What does the front end set, and what does the
native code need?

Sources: the HUD menu blueprints (`Core/Assets/HUD`) and `Core/BlueprintResources/ScenarioManager`
unpacked and decompiled, and the native code in Ghidra (tools in [native-code.md](native-code.md)).
Pseudo-code: `tsw-decomp/out/…/HUD/MenuScreens/{FlowScreens,Timetable,TimetableSelection,Elements,FirstExperience}`
and `…/HUD/Widgets/Dialogs/ServiceTakeoverDialog.txt`; Ghidra output
`tsw-decomp/ghidra/out/{ttstart*,takeover*}`. RVAs are build 886. Nothing here was run in game by
the research; the result was built into tsw-sdk afterwards (below).

## What the front end writes

`MainMenuTimetable_C::StartService` (the Play button), in order. The settings object is
GameInstance+0x1B0.

1. With a timetable selected: `bSandboxMode = true` and `bClearTimetable = false` (bits 0 and 1 at
   +0x238). **The menu uses sandbox mode true for a service**, not false.
2. `RequestContentLoadForTimetableSynchronous(timetable, train)`; abort if it fails. Then
   `IsComplete()` must be true (its error text: "Either need to spawn driving or pick a spawn
   location").
3. Weather into the time-of-day settings (`Set Drive Mode Weather`).
4. `SetDriveModeSettingsTimeAndDate(h, m, s, day, month, year)` (native `0xF6BB50`) writes an
   `FDateTime` to +0x60, `TODSettings.LocalDateTime`. The menu uses the **service's exact start
   time** (`FCachedTimetableService.StartTime`).
5. `UIFunctionLibrary::ApplySelectionToSettings(settings, 1)` (`0x11E95D0`): flag 1 writes
   `TrainEntry` (+0x40) and `TrainEntryIndex` (+0x48) from the selected vehicle, if any.
6. `ClearFrontend()`, then `GameInstance.SetCurrentPlayerMode(1)` (Driver; byte GI+0x7B0). The
   guard-mode start uses mode 2 and also sets a spawn point.
7. `LoadWithTimetableService(def, name)` (native `0xF54280`):

   ```c
   s->Timetable = def; s->InitialTimetableService = name; s->bSpawnDriving = 1;   // +0x28 +0x30 +0x4C
   s->DLCPluginFilter = GI->BuildDLCPluginFilter();                             // +0x1E8
   GI->LoadDriveModeSettings(s, "LoadTimetableService");   // copies s to GI+0x2D8 and travels
   ```

   `Load()` is the same call without those four writes.

Not set for a service: `SpawnLocationTag`, `WorldOrigin`, `PlayerSpawnLocation`, `Scenario`,
`SandboxManagerClass`.

`FTimeOfDaySettings` (0x58 bytes): +0x00 `LocalDateTime` (`FDateTime`), +0x08 Precipitation,
+0x0C Temperature, +0x10 Wetness, +0x14 Cloudiness, +0x18 WindStrength, +0x1C WindDirection,
+0x20 SnowLevels, +0x24 FogDensity, +0x28 `bForceTODAndWeatherSettings`, +0x30 `WeatherScenario`
(soft class).

## What the world start needs (native `0xEDB870`)

In the game-mode code (vtable entry at `0x3E0E058`; the class is not confirmed, it lies outside
the recovered `ATS2GameMode` vtable):

```c
if (GI->CurrentPlayerMode == Guard /*2*/) SpawnOnFoot;     // FreightHauler (3) has its own path
// SaveGame (+0x110) → save-load path; Scenario (+0x38) → scenario path; otherwise:
if (name != None && (rt->IsServiceActive(name) /*0x1130480*/ || rt->IsServiceFormationReady(name) /*0x1130710*/)
    && (rv = rt->GetPlayerDrivableRailVehicleInService(name, &side) /*0x112C550*/))
    { possess(rv); bind the player to the service;
      if (!bUserScenario && Scenario == None) HUD->ShowNewServiceDialog(service, rv); }   // 0xF6F010
else SpawnOnFoot();                                                                       // 0xEE2930
```

- `bSpawnDriving` is **not** checked here.
- The service must be active, or its formation ready, **at the start time**, and must have a
  player-drivable vehicle. The player mode must not be Guard, and no save game or scenario may be
  set.
- The failed attempt loaded at 09:21, when the service was neither active nor ready, so the player
  spawned on foot. Setting the time of day to the service's start time (or just before) fixes that.
- At the start time itself a service can still be unready when its train is brought in by a
  hidden AI service that arrives just after (Left Rhine RE-3409): see
  [timetable-on-foot.md](timetable-on-foot.md).

## The start card pauses the game

When the service is possessed, the HUD shows `ServiceTakeoverDialog_C` (the card with "BEGINNEN").

- Its Tick calls `SetGamePaused(true)` once while `HasToPauseGame` is set (by `SetNewServiceData`).
  **The game stays paused while the card is up**, although the player already possesses the train.
  This looks like "drives no service" from code.
- The native `ConfirmDialog()` (`0x14EAA60`) only runs a native delegate at widget+0x2A8. Only the
  in-game "take over another train" path binds it (HUD `0xF6EC20` → `UpdateDialog`); the world-start
  path (`ShowNewServiceDialog`) binds nothing, so **`ConfirmDialog()` does nothing on this card**.
- The confirm button's click handlers do the work:
  - `CustomEvent` (bound in Construct): `SetGamePaused(false)`, `CheckGameModeSelection()` (player
    mode Driver, or Guard if the selector is on index 1), `ConfirmDialog()`.
  - `CustomEvent_1` (bound by `ShowNewServiceDialog`): `GoBack()`, i.e.
    `MenuBack(1, 0, true, false, 0)`, which closes the card; its `OnWidgetClose` unpauses again and
    starts campaign briefing slides if there are any.
  - Other cards: user scenario `CustomEvent_0` (GoBack), guard `CustomEvent_3` (mode 2, GoBack); the
    dismiss button runs `CustomEvent_2` (unpause, `DismissDialog`).
- **From code:** call `CustomEvent()` and then `CustomEvent_1()` on the card, or `GoBack()` plus
  `GameplayStatics::SetGamePaused(false)`.

## Built from this

tsw-sdk's adapter has `tsw.service <route> <timetable> [service]`
(`crates/tsw-adapter/src/freeroam.rs`), which fills the settings as above, and a watcher that
confirms the card the way its button does (`crates/tsw-adapter/src/takeover.rs`, commit `488c6f0`,
also `tsw.takeover`). Whether it worked in game is recorded in tsw-sdk, not here.

## Open

- Which class owns the world-start function at `0xEDB870`.
- What exactly `IsServiceFormationReady` checks, i.e. how early before the start time a load may
  begin.
