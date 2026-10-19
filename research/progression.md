---
name: progression
description: >-
  Where TSW 7 keeps tutorial, task, mission and scenario progress, and how tsw-unlock finishes or resets it through the game's own functions.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-19T18:20+0200
---

# Progression: tasks, missions, tutorials, completion (2026-10-19)

Found for [tsw-unlock](https://github.com/tsw-plugins/tsw-unlock) in the UHT
and CXX header dumps (`tsw-coop/dumps/tsw7-886`) and checked in
`TrainSimWorld.exe` with headless Ghidra (tsw-sdk `scripts/pe-refs.py`,
`scripts/ghidra-decompile.sh`). RVAs are build 886.

## What tsw-unlock does (verified in game)

| Button | Game function | Verified |
| :--- | :--- | :--- |
| Finish current Task | `UObjectiveActionComponent::ForceComplete(success, FailureNotificationKey)` on the live action with `State` Intro..Update (2..4) | 4 tasks of `TTCDieselIntro` in a row, the tutorial moved on each time |
| Finish current Mission | `AScenarioManagerActor::CompleteScenario()` on the manager with `State` < Completed (7) | the game's own end screen ("Wohin geht es als nächstes") with the next tutorial offered |
| Finish all tutorials | `UTS2GameInstance::SaveTutorialPlayed(PlaintextName)` for every tutorial of the installed content, `SetFirstTutorialPlayed()` | 51 tutorials; still played after a restart |
| Reset Everything | `UPlayerProfileFunctionLibrary::ResetActivePlayerProfile` after `SaveBackupActivePlayerProfile` | not run on a real profile |

Before any profile change the plugin copies `Saved/SaveGames` to
`Saved/SaveGames-unlock-backups/<unix time>/` (128 KiB).

## Where the data lives

- **Installed scenarios at the main menu**: the definitions are not loaded
  there, but `UTS2GameInstance.DLCManagementSystem.CachedContentList[]`
  (`FCachedContent`, one per pack, `PropertiesSize` 0x2A0) has
  `ScenarioDefinitions[]` (`FCachedScenario`, 0x220): `PlaintextName`,
  `ScenarioType` (0 Mission, 1 Tutorial), `bMandatory`, the definition as
  `SoftObject`. tsw-sdk `content.rs` walks it; `tsw.scenario <name>` loads
  one with `LoadAsset_Blocking` + `UTS2GameplayFunctionLibrary::LoadScenario`.
- **"Played" tutorials** (what the menus' "play this tutorial first" checks):
  `UTS2GameInstance.TutorialsPlayed` (`TArray<FString>` of `PlaintextName`s),
  `bFirstTutorialPlayed`. `GetUnplayedMandatoryTutorial` (exec `0x14DD620` →
  `0xF51080`) returns the first scenario with `ScenarioType` Tutorial and the
  `MandatoryTutorial` bit for which `HasPlayedTutorial(PlaintextName)` is
  false.
- **Completion** (medals, "completed" ticks): `UPlayerProfile`.
  `HasPlayerCompletedScenario(Route, Scenario)` (exec `0x141F9D0` →
  `0x1096D40`) is "key present" in `ScenarioHighScoreTable`
  (`TMap<FScenarioHighScoreID{FName route, FName scenario}, int32>` at
  `+0x4D0`, elements 0x1C). `GetScenarioHighScore` is `0x1094C80`.
  `GetRouteTutorialsCompleteCount` reads a bit set in the route's
  `RouteStatistics` entry (`+0x340`, elements 0x138).
- **Writing completion**: the scenario end handler `0x10ECEF0` (stats
  "ScenariosCompleted", "AllRouteScenariosComplete", "TutorialsCompleted",
  "AllRouteTutorialsComplete" achievements) calls
  `0x109BE20 RecordScenario(profile, FString routeStatName, FString
  PlaintextName, int score, x)` or `0x109C3A0` (the same for tutorials; both
  `FindOrAdd` the high-score key and raise the score). The route name is
  `GetCurrentRouteStatTrackingName` (`FCachedRouteDefinition.StatTrackingName`).
  None of these is reflected, and the fifth argument goes on to telemetry as
  a number; calling them by address is not done yet.

## Open: "Finish Everything"

Real completion records for every scenario need one of:

1. the game's own path per scenario (`tsw.scenario` → `CompleteScenario` →
   back to the menu): exact records, stats and achievements, but one route
   load per scenario (heavy for the DLC routes);
2. the record functions above by address (pattern-scanned), once the fifth
   argument is understood;
3. editing the saved profile (GVAS) and reloading it
   (`GetPlayerProfile` + `SetActivePlayerProfile`).

Until then "Finish Everything" does what "Finish all tutorials" does.
