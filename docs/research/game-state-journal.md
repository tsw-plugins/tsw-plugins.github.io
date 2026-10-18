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
