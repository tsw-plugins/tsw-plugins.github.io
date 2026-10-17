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

The native mod presses forward whenever `CanAdvance` says so (at most every
300 ms, at most 600 presses), and stops for good once the widget leaves the
viewport. After the last screen the widget stays alive inside the main menu
and keeps answering `CanAdvance = true`, so it is looked up top-level only.
On by default; the flag file `tswcoop-no-skip-intro` next to the exe turns
it off.

Runs: screens 0→1 after 6 s, 1→3 after 7 s, then the safety notice held
for 73 s (first run) and 115 s (second run, main menu after 128.7 s and 380
presses) despite presses, until 4 and 5 followed within a second. Likely the
game keeps the notice up while the main menu loads behind it (not verified:
a boot without the skip, timed the same way, would show it). The skip saves
the key presses; it does not make loading faster.
