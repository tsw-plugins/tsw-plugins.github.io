---
name: game-state-journal
description: >-
  The game state journal and crash reports added after two unexplained events in one test, skipping the start-up intro, and why a fast skip lost the DLC collection.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-17T20:38+0200
last_edited: 2026-10-17T21:27+0200
---

# Game state journal, crash reports and the start-up skip (2026-10-17)

## Why: two unexplained events in one test

1. **World restarted after `drive spawn`.** In free roam at Frankfurt Hbf,
   `tswcmd drive spawn FTF_423_Single_E` spawned a BR 423 625 m away and
   "boarded" it. A minute later the world had restarted: clock back at
   10:00:00, player on foot at the start point. What the relayed stream
   (recorded at 10 Hz) shows, and only that:
   - the in-game clock stood at 10:07:40 from 2–10 s after boarding on;
     no vehicle moved (AI included): the game was paused or halted, not
     running;
   - no speed spike or height jump anywhere (no sign of a derailment or
     collision at speed);
   - `drive ready` reported READY with `seat=none` (a false positive: the
     pawn never sat in the cab);
   - 2 s after the last `drive diag`, snapshots stopped for 21 s (game thread
     blocked, a loading screen), then a fresh world.
   What paused it and what restarted it is **unknown**: no screenshot was
   taken right after boarding, and TSW 7 (shipping build) writes no game log.
2. **Crash 10 min later**: `EXCEPTION_ACCESS_VIOLATION reading 0x10`, stack
   only in UE4SS.dll. Cause: my Lua probe chained
   `car:GetViewActor():GetClass()` on a car whose view actor was null.
   `pcall` does not catch access violations. Rule: check `IsValid()` on every
   returned UObject in Lua probes, never chain calls on returns.

## The journal (`mod/native/src/journal.rs`)

One `state:` line in `tswcoop-native.log` per change, with the UTC time of
day (the clock UE4SS.log uses, so both logs line up):

| Line | Source |
| --- | --- |
| `player controller …` / `no player controller` | capture's controller |
| `world World <name> #idx in <package>` | controller → level → world (a reload of the same map is a new object) |
| `pawn …`, `drives …`, `seated yes/no` | `Controller::Pawn`, `DriverPawn::GetDrivableActor`, `GetAttachedSeatComponent` |
| `paused yes/no` | `UGameplayStatics::IsGamePaused` |
| `world origin [x, y, z]` | `GetWorldOriginLocation` (rebasing) |
| `player train moving/stopped/at N m/s`, `derailed` | `URailVehicleComponent::GetForwardsVelocity`, `IsDerailed` on the driven vehicle |
| `clock stopped (not paused)`, `clock running again`, `clock jumped` | `GetDateTime` vs real time; only in a route (the menu's clock stands still) |
| `widgets +[…] -[…]` | `UWidgetBlueprintLibrary::GetAllWidgetsOfClass(UserWidget, TopLevelOnly)` once a second: pause menu, fail/end screens, dialogs, loading screens |
| `game thread stalled N s` | gap between two engine ticks ≥ 1 s (loading screens) |
| `earlier crash <folder> …: <error>; stack [module+offset …]` | at startup, every new `Saved/Crashes/*/CrashContext.runtime-xml` (the last 2 days; folders are remembered in `tswcoop-crashes-seen.txt`) |

Verified at boot: the crash list named the UE4SS crash above; the journal
logged the frontend world, the diorama pawn, the splash widget and the
switch to the main menu's widgets
(`HomeScreen_C`, `MainMenu_C`, `MainNavigationBar_C`, …).

## Start-up skip (`mod/native/src/skip_intro.rs`)

TSW 7 has no option for it: the exe's strings have no skip switch, the
videos are plain files in `Content/Movies`, and the logo videos, safety
notice and title screen are screens 0–5 of one `SplashScreenWidget_C`
(`UTS2SplashScreenWidget`: `GetCurrentSplashScreenIndex`, `CanAdvance`,
`ForwardPressed`, `AdvanceToNextScreen`). `ForwardPressed` is what "press any
key" does; calling it from Lua went safety notice → title → main menu.

**First version (wrong): emulated "press any key".** Calling `ForwardPressed`
every 300 ms whenever `CanAdvance` held kept the safety notice up for 73 to
250 s (750 calls), which I misread as the main menu loading behind it. One
real key press passed it in under 3 s, so the repeated calls themselves
held it. Worse, the `OnForwardPressed` broadcast reached the main menu and
opened the route selection a few seconds after the menu appeared.

**Now: `AdvanceToNextScreen`, no input at all.** One call per screen, the
next only once the index changed (or 3 s passed), done after the last
screen. Measured 2026-10-17 19:26 UTC: screens 0, 1, 3 and 4 passed in 420,
215 and 213 ms, **main menu 0.9 s after the widget appeared** (5.7 s after
the DLL started), no route selection afterwards
(`dumps/tsw7-886/experiments/skip-intro-advance/main-menu-after-0.9s.png`).
So nothing was loading behind the notice; it only waits for input.

Tried and not needed: `UTS2GameInstance::SetGameInstanceState(MainMenu)`
(enum `EGameInstanceState`: SplashScreen 0, MainMenu 3, ...) is accepted
(`GetGameInstanceState` reads 3 afterwards) but the splash widget does not
react; it drives itself.

The widget stays alive inside the main menu after its last screen and keeps
answering `CanAdvance = true`, so it is looked up top-level only. On by
default; the flag file `tswcoop-no-skip-intro` next to the exe turns it off.

### 2026-10-19: the fast skip cost the player their collection

With the skip on, the title showed **FREE EDITION** and the main menu offered
the Training Centre only, although Steam reported all five DLC packs owned. A
boot left to the player showed "Zu den Zügen – Ihre Sammlung". So the skip
was the cause, not the loader.

`GetPlayerEntitlementType` cannot tell when the game is done: it answers Free
(1) from the first frame, not Unknown. Where the value comes from was found
in the exe with Ghidra (tsw-sdk `scripts/pe-refs.py` +
`scripts/ghidra-decompile.sh`, no full analysis needed):

- `execGetPlayerEntitlementType` (`TSW+0x13B3040`) → `TSW+0xE63A40` reads one
  byte, `GameInstance → DLCManagementSystem (+0x278) → +0xA34`.
- That byte is written by `TSW+0xE4A190`: Free when the `EntitlementData`
  table is missing, otherwise the platform's entitlement list (Steam DLC)
  matched against the table: Paid 3, Upgrade 2, Free 1.
- Its only caller is the content refresh `TSW+0xE6B030`, run from the DLC
  system's tick state machine (`TSW+0xE51930`, state byte `+0x6E1`) once its
  queue of content work is empty. The refresh ends by clearing the reflected
  `RouteDataTable` and `DifficultyTable`.
- The debug cvar `ts2.dbg.DLCManagementSystem.PlayerEntitlementType` is
  registered but nothing reads it in the shipping build (and forcing it would
  only bypass ownership anyway). There is nothing to "log in": the check is
  local, it just has to finish.

Measured with the skip only watching (`tswcoop-intro-watch`): during the
first logo screen `CachedContentList` grows 0 → 11 over 4.3 s, then the
entitlement turns Paid at 5.7 s, exactly when the logo screen moves on by
itself. The skip advanced that screen after 0.5 s, cut the caching short, and
the entitlement stayed Free for good. `ForwardPressed` on the title was a red
herring: it is ignored there, and `AdvanceToNextScreen` on the title works
once the content is settled.

Now the skip waits until the entitlement is above Free, or (the Free Edition
stays Free) the content is cached and `RouteDataTable` let go; then one
`AdvanceToNextScreen` per screen, never repeated. Main menu 6.5 s after the
DLL started, with the collection (tsw-sdk e579a89).
