---
name: ready-any-train
description: >-
  Making any train ready to drive from code, for tsw-autopilot's auto-ready: a survey of every TSW 7 train's controls, what the game offers (presets, service setup), the class-independent check-and-fix loop and its results per class.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-21T01:40+0200
last_edited: 2026-10-21T01:40+0200
---

# Ready any train (2026-10-21)

Owner's request: the autopilot readies the train itself (battery, pantograph or engine,
breaker, keys, reverser, brakes) and supports every train it can. Probes and data:
`tsw-coop/dumps/tsw7-886/experiments/ready/` (`survey.lua`, `survey-tsw7.jsonl`,
`generic.lua`, `batch.sh`).

## Survey: 19 formations, every route of TSW 7

`survey.lua` spawns one formation per class in Frankfurt–Fulda Free Roam (every route's
Scenario Designer formations are loaded there, 375 in all), boards it and records every
control (name, component class, value, range, notches), the lock managers, the current
collectors, the simulation preset, the component classes and the blueprint's power-up
functions.

| Formation | Driven vehicle |
| --- | --- |
| TTC_146_Light, FTF_SD_146_LL | BR 146 (`RVM_TTC_BR146_C`, `RVM_FTF_DB_146_-2_C`) |
| TTC_Class66_Light | Class 66 (`RVM_SEH_EWS_Class66_C`) |
| TTC_Class323 | Class 323 (`RVM_TTC_Class323_DMS_A_C`) |
| TTC_Class8F_Light | 8F steam (`RVM_TTC_8F_Engine_C`) |
| TTC_766_Dostox4 | Doppelstock cab car (`RVM_TTC_Doppelstock_766pbzfa_C`) |
| FSN_SD_BR143_LL, FTF_SD_114_LL | BR 143, BR 114 |
| FSN_SD_185_LL, FTF_SD_193_… | BR 185, BR 193 Vectron |
| FSN_SD_363_LL | BR 363 diesel shunter |
| FSN_SD_BR411_x1_E, DLG_ScC_ICE | BR 411 ICE-T |
| FSN_SD_BR442_x1_E | BR 442 Talent 2 |
| FTF_SD_423x1_E, FSN_430_x1_E | BR 423, BR 430 S-Bahn units |
| LFR_SD_103_LE, LFR_SD_110_LightEngine | BR 103, BR 110 |

Every spawned train is in preset `RunningStopped` (1). What each still needs differs:
most locos have a pantograph up and the breaker closed but the reverser key out; the
EMUs (411, 423, 430, 442) have the pantograph down (on another car than the cab); the
Class 323 spawns with an emergency lock.

### Control names

A control's component name is a base name, an optional cab end or desk side and an
optional kind: `F_AutoBrake (Irregular Lever)`, `Reverser_F`, `PZB_Acknowledge_BL`,
`Throttle_L`, `MasterController`. Taken apart, the bases fall into families that hold
across classes; tsw-sdk `cab::family` has the table:

| Family | Bases seen |
| --- | --- |
| power | `Throttle`, `Regulator`, `MasterController` (193: −1..1; 423/430: 0..1 resting at 0.5), `ThrottleAndBrake` (442: −1.29..1), `PowerBrakeHandle` (323) |
| brake | `TrainBrake`, `AutoBrake` (Class 66, `F_`/`B_` prefix), `VacuumBrake` |
| reverser | `Reverser`, `ReverserProxy` (363, −1..1), `Reverser_RailDriver` (8F) |
| key | `ReverserHandle`, `ReverserKey`, `MasterKey`, `BrakeKey` (103/110/114/143 need both a reverser key and the brake valve key) |
| battery | `Battery`, `BatteryControl`, `BatterySwitch`, `Battery_MainSwitch`, `BatteryControlSwitch` |
| pantograph | `Pantograph`, `PantographControl`, `PantographStateSwitch`, `PantographRaise` |
| breaker | `MainCircuitBreaker`, `CircuitBreaker`, `PantographCircuitBreaker` |
| parking release | `ParkingBrake_Release`, `ReleaseParkingBrake`, `ParkingBrakeRelease`, `HandbrakeRelease` |
| engine start | `EngineStart`, `EngineStartNew`, `EngineStartUp` |

Before this, tsw-sdk's role table knew exact names only: the Class 66's brake
(`F_AutoBrake (Irregular Lever)`) and every `MasterController` train were not drivable.

## What the game offers, and why it is not enough

| Path | Result |
| --- | --- |
| `URailVehicleComponent::ApplySimulationPreset(RunningActivePreset, "Default")` | Air reservoirs refilled; nothing in the cab moves (pantograph, breaker, levers stay) |
| `ResetPhysics(RunningActivePreset, "Default")` | Air full, brake cylinders 0, parking brake released (cylinder 9.7 bar), every vehicle of the component's own; pantograph and breaker untouched |
| The blueprint's `BndEvt__…PresetConfigurationInitializationSignature` handler, called directly | No visible change |
| `UCurrentCollectorComponent::DeployCollector(true)`, `SetCircuitBreakerOpen(false)` | Raise the pantograph and close the collector's own breaker, but the BR 146's blueprint breaker logic stays open (`LostRemoteSupply`) and afterwards its cab switches no longer work: the blueprint's state and the component's disagree. Not for use. |
| The blueprint's `BndEvt__…RailVehiclePerformServiceSetupDelegate` handler (AI service setup), called with the player's controller and `bIsDrivingVehicle` | Nothing moves (BR 430): it presumably queues gameplay tasks for an AI driver |

So readying goes through the cab controls, as the player would.

## Class-independent ready (`generic.lua`)

Converging like `drive_ready.lua`: evaluate the checks in order, fix the first failing one,
wait for it, start again from the top; a check that keeps failing blocks with its detail.

| Check | Passes when | Fix |
| --- | --- | --- |
| each key | at its named "on" ("Ein", "Eingesteckt"), else its maximum | a held press where "on" is the top; else, and for a key that ignores the press (BR 430 `ReverserKey`, BR 143 `BrakeKey_F`), a plain set |
| pantograph | no collector on the **whole formation** is down (`GetFormation(0)`; an EMU's pantograph is on a middle car) | battery switch held up (first try), pantograph switch held up 2.5 s; 20 s to rise |
| breaker | a raised collector's breaker is closed | power to neutral, breaker switch held up 1.5 s |
| engine | the starter held once (BR 363 `EngineStartNew`) | starter held up 4 s; 10 s to run up |
| reverser | at its named "Vorwärts" (an output position is found by a sweep once the keys are in), else its maximum | a plain set (held input stalls on the BR 430) |
| brake valve cut-in | its output in the named cut-in position ("Zugeschaltet") | press (a toggle; the BR 193 spawns "Getrennt", its brake pipe never charges past 3.4 bar) |
| brake | in its named running position ("Fahren", "Fahrstellung"), else the bottom 15 % of its range or where it settled after a release set (Class 66: −1 springs back to 0) | a set to the running position, else the minimum |
| dynamic brake | in the bottom 15 % | a set to the minimum (`DynamicBrakeActive` lock on the BR 146) |
| parking brake | pressed once | the release button (decrease input where `bUseDecreaseInputToOperate`) |
| combined handle | off its braking side, where there is no separate brake | a set to neutral (Class 323 spawns at −1, emergency, locked `InEmergency`) |
| locks | no lock manager (`LockManager_C`, also named `TractionLockManager`) locked | waited for 30 s once (an emergency resets at a standstill), then report |

Then a traction test: 40 % power from the handle's neutral, 25 s, the peak speed. The power
is set repeatedly: a notched throttle moves one notch edge per set (the first runs left the
TRAXX locos at the 0.1 "Min." step, which looked like "ready but no traction").

## What a control says about itself

Names are not enough: the BR 143/114 brake is `DriversBrake_F`, their power control
`SpeedSelector_F`, and "maximum" is not always "on". Every `UVirtualHIDComponent` carries
two more things, both readable by reflection:

- `InputIdentifier.Identifier` (`FName`), the game's input mapping: `Throttle`,
  `AutomaticBrake`, `IndependentBrake`, `DynamicBrake`, `Reverser`, `MasterSwitch`,
  `BrakeKey`, `Handbrake`, `EmergencyBrake`, `Pantograph`, `CircuitBreaker`,
  `AuxBatteryPower`, `EngineStartStop`… A control whose name is in no family is found by
  it (BR 143: `DriversBrake_F` is `AutomaticBrake`, `SpeedSelector_F` is `Throttle`).
- `DisplayInfo.NamedValues` (`TArray<FVirtualHIDComponentNamedValueMapping>`: `ValueSource`,
  `ValueRange` min/max, `DisplayName` `FText`): the positions the cab names. The ones
  readying wants:

| Control | Named position | Range | Value source |
| --- | --- | --- | --- |
| TRAXX / BR 146 / BR 185 `TrainBrake_F` | "Fahren" / "Fahrstellung" (running) | 0.05..0.15; below is "Lösen", the release surge | input |
| BR 442 `MasterSwitch` | "Ein" | 0.5..1.5 of −1..2; **2 is "Entkuppeln Fernsteuerung"** (uncouple) | input |
| BR 143 `BrakeKey_F` | "Ein" | 0.5..1.5 of 0..1 | input |
| BR 143 `DriversBrake_F` | "Fahrstellung" | −0.5..0.0625 | **output** |
| BR 363 `DriversBrakeValve_L` | "Fahren" | 0.5..1.5 (a notch number of 6) | not recorded |
| BR 146 `Reverser_F` | "Vorwärts" | 1.5..2.5 of 0..1 | output |

`EVirtualHIDValueSource`: 0 input, 1 input normalised, 2 output, 3 output normalised. Input
positions can be set directly; output positions are what the blueprint makes of the input
(`GetCurrentOutputValue`, updated within the set), so they have to be mapped back by
sampling: tsw-sdk's `ready::Sweep` steps the input up from the low end (a brake's release
end, so it never reaches emergency) until the output has been in the range and left it. A
key or switch is set to its named "on" rather than its maximum: held up, the BR 442's master
switch would run on to "uncouple".

The game's ranges can overlap: the BR 442's `Reverser` names "Vorwärts" −0.5..1.5 and
"Neutral" −0.5..0.5, so an output counts as a position only where no other named position
claims it; a position shown with a number (`{BrakeValue}`, `{TargetSpeed} km/h`) is no
position. A swept range's middle is not where a notched lever stays (0.625 asked, 1.0 read),
so driving takes the lever's value once it is ready.

Not every power lever sets a force: the BR 143/114 `SpeedSelector_F` (identifier `Throttle`)
sets the cruise control's target speed (output 0 "Ein", then "{TargetSpeed} km/h" 5..165;
input 0.3 is 30 km/h, 0.6 is 70 km/h) and the loco drives to it by itself, braking
electrically too (0.3 held ~33 km/h with negative tractive effort, 2026-10-21).

## Gotcha: one spawned train per Free Roam session

Boarding a second spawned train ends the Free Roam session: the game opens
`NextOptionOutroWidget_C` ("Wohin geht es als Nächstes?", world paused) 2–4 s after
`SetControlledDrivable` on it, whether or not the pawn stood up first
(`NotifyOnNewObject` on the widget class, 01:29:15 and 01:31:11). One train alone ran for
minutes. Destroying spawned trains is not the trigger. `batch.sh` therefore reloads Fulda
(`GotoMainMenu(false, false, pc, 3)`, `tsw.freeroam fulda`, ~20 s) before every class.

## Results per class

Fulda Free Roam, 2026-10-21. Prototype = `generic.lua`; Rust = the autopilot's own readying
(`rust-ready.sh`: the train spawned and boarded cold, then `set autopilot.enabled true`).

| Class | Prototype | Rust readying, then the autopilot driving |
| --- | --- | --- |
| BR 146 (TTC) | ready, 24 m/s | ready 8 s; drove to 78 km/h |
| BR 185 | ready, 20.7 m/s | — |
| BR 442 | ready, 6.8 m/s | ready 6 s (master switch "Ein"); drove to 34 km/h, braked for a signal |
| BR 193 + 10 wagons | ready, no motion: brake pipe 3.4 bar | ready 6 s with the valve cut in; drove to 39 km/h |
| Class 66 (TTC) | ready, 2 m/s | ready 4 s; drove to 27 km/h, then handed back "you moved the brake" (open) |
| BR 143 | key fixed since | ready 7 s; speed-lever driving under test |
| Class 323 (TTC) | locked `InEmergency` | ready 5 s (handle to neutral); barely moves (open) |
| BR 363 | ready, no motion | ready 7 s (engine started); handed back "you moved the power" (open) |
| BR 411, 423, 430, 103, 110 | ready, moved (first run) | — |

A Free Roam session also ends when a spawned train rolls back into the player's own
(the 143 with released brakes and no force, on a gradient).
