# Driving trains from code (2026-10-17, Training Centre, BR 146 and Class 323)

## Commands

```bash
tswup                          # repeat until exit 0: game running, scenario A loaded
tswcmd drive board BR146       # nearest other vehicle whose class contains the filter
tswcmd drive diag              # status + verdict; `diag json` also writes ue4ss/tswcoop/diag.json
tswcmd drive ready             # any state -> drivable
tswcmd drive power 0.3         # 0..1
tswcmd drive brake             # power off, full service brake
tswcmd drive stop              # cancel running sequences, release held controls
```

## `drive diag`: the one-stop status

One call reports everything that decided whether a train moved in this investigation:

| Section | Content |
| :--- | :--- |
| header | class, vehicle, recipe, spawn `Preset` (0 parked, 2 running-active), speed, seat |
| power | battery (`bBatteryActive`), `HasElectricPower()`, each current collector up/down and its breaker |
| sim | main reservoir, aux reservoir, brake pipe, brake cylinder, parking brake cylinder (bar), transformer input (V), tractive effort (N), power demand, DC link |
| levers | the class's relevant controls with their values |
| locks | every lock manager (traction, penalty, emergency), locked or free, with named conditions |
| safety | Sifa, PZB, AFB (cruise control) state |
| checks | every ready-check: ok/FAIL, what it means, the values it judged |
| objective | the scenario objective from the HUD |
| verdict | `READY` or `BLOCKED: <first failing check>` |

## `drive ready`: from any state

Each class recipe (`drive_recipes.lua`) is an ordered list of checks, each with a fix. `ready`
evaluates all checks, fixes the **first** failing one, waits for it to pass, then re-checks from the
top. Passing checks are never touched, so it is safe on a running train (4 s, 4 fixes on the
scenario's loco) and on a cold one. A check that keeps failing, or has no fix, ends with
`BLOCKED` plus the full diag.

BR 146 checks, in order, and why each is there:

| Check | Fix | Found out |
| :--- | :--- | :--- |
| battery | `SetBatteryState(true)` on the loco | The battery push button, pressed from code, does not wake a cold loco; the blueprint function does |
| reverser key | tap `ReverserHandle_F` (toggle, 1 = in) | |
| reverser forward | move `Reverser_F` to 1 (0 back, 0.33 off) | |
| pantograph up | wait for `CanPantographRise()`, hold `Pantograph_F` up | Needs aux air (~23 s on a cold loco). `PantographSelector` 0.67 raises the **rear** one; check any collector |
| breaker closed | throttle to 0, hold `MainCircuitBreaker_F` up | With the throttle open it does not close and the cab announces "Störung" |
| dynamic brake off | move `DynamicBrake_F` to 0 (rests at 0.1) | Traction lock condition `DynamicBrakeActive` otherwise |
| train brake running | move `TrainBrake_F` to 0.1 | Lock conditions `TrainBrakeActive` / `TrainBrakeEmergency` otherwise |
| parking brake released | `SetParkingBrakeLocal(false)` on the loco | Spring brake: released when its cylinder holds pressure (~9.7 bar running). The release button's `BeginIncreaseDigital` returns false from code and nothing happens; the blueprint function fills the cylinder (0 to 9.2 bar in ~5 s) |
| brake cylinders released | train brake to running, then wait (settle 45 s) | After a cold start the automatic brake vents slowly once the pipe is charged: declared ready at 1.5–2 bar, a parked loco crept at 0.04 m/s under 85 kN, then ran off at 18.8 m/s once vented. Measured: 4.0 bar to below 0.3 in 22 s |
| no traction lock | none (report) | `drive diag` names the condition |

Class 323 (`RVM_TTC_Class323_DMS_A_C`/`_B_C`): master key, reverser 0.667, power/brake handle not
braking. Its blueprints accept plain value sets; it moved at up to 16.9 m/s that way.

## Held input, not values

The BR 146 blueprints react to `VirtualHIDChanged` events. `SetCurrentInputValue` moves a lever and
fires nothing. `BeginIncreaseDigital(pc)` / `BeginDecreaseDigital(pc)` … `EndChanging(pc)` is a held
key and fires the events. The DTG HTTP API's `/set` goes around interlocks and gets snapped back.
`drive_ctl.move` holds until a target value; `hold` holds for a time; `press` taps a button.

## Verified runs

| When | Train | Start state | Result |
| :--- | :--- | :--- | :--- |
| 11:19 | BR 146 (preset 2, half-started by hand) | battery via blueprint, breaker, dyn brake fixed by hand | 11.9 m/s, braked to 0 |
| 11:48 | BR 146 (preset 2, scenario loco) | running, cab not set up | `ready`: READY in 4 s; `power 0.3`: 3.8 m/s; `brake`: 0 |
| 11:50 | BR 146 (preset 0, parked) | cold and dark | all checks fixed up to the parking brake; release button ignored; `SetParkingBrakeLocal(false)` released it; no crash (the earlier deaths at this step were the Lua thread race) |
| 11:53 | BR 146 (preset 0, untouched) | cold and dark | `drive go <name> 0.3`: READY in 36 s, but crept (brakes still venting) — led to the `brakes` check |
| 11:56 | same loco | braked after a run (train brake 0.8, dynamic brake 0.8, locks) | `ready`: READY in 26 s (22 s venting); `power 0.2`: 0.7 m/s within 6 s |
| 11:57 | BR 146 (preset 0) in a freshly reloaded scenario A | cold and dark, untouched | `drive go 2147469822 0.3`: every check fixed on its first try, READY in 77 s (40 s of it brakes venting); 5.4 m/s 13 s later; `brake`: 0 |

## Gotchas

- `drive go <filter> <power>`: vehicle names are numbers, so a lone number is taken as power only
  when it is 0..1, and power outside 0..1 is refused (once `go 2147481838` meant full power on the
  train already boarded).
- `drive board` matches class or vehicle name and skips the train you are in; it alternates between
  the two nearest when the filter is ambiguous. `drive diag` shows `preset` and battery so a cold
  loco is easy to spot.
- The transformer input reads 0 V on a running loco until traction draws current; it is not a
  breaker indicator. The collectors' `bCircuitBreakerOpen` is.

## Open

- Class 323 recipe has not been re-run since the rewrite.
- `ApplyVHIDPreset` / the AI's `PerformServiceSetupTask` might give per-class startup data for
  other locos ([developer-functions.md](developer-functions.md)).
