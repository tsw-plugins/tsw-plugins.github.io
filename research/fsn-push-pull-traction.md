---
name: fsn-push-pull-traction
description: >-
  Driving the Frankfurt S-Bahn (FSN) push-pull train from the Dosto cab car: how the 766pbzfa's own traction lock works, what its Throttle sends to the BR 143, what the loco checks before it makes force, and the control sequence after a change of ends. Decompiled.
game_build: 886 (TSW 7)
created: 2026-10-21T21:40+0200
last_edited: 2026-10-21T21:40+0200
---

# FSN push-pull: traction from the Dosto cab car (2026-10-21)

Question from tsw-autopilot: in the FSN route's push-pull train (`RVM_FSN_DB_BR143_C` loco plus
`RVM_FSN_DB_766pbzfa_C` Dosto cab car), after a change of ends the cab car's HUD showed the traction
locked and the train made no force. What does the lock read, what does the cab car's `Throttle`
do, and which inputs give traction?

Sources: `TS2Prototype-WindowsNoEditor-FrankfurtSBahn.pak` (plugins `FSN_DB_Doppelstock`,
`FSN_DB_BR143`), unpacked and decompiled with kdecomp (2026-10-21; commands in
`/run/media/system/Data/tsw-decomp/NOTES.md`). Paths below are under
`/run/media/system/Data/tsw-decomp/out/TS2Prototype/Plugins/DLC/`:

- `FSN_DB_Doppelstock/Content/Simulation/RVM_FSN_DB_766pbzfa.txt` (cab car; parent
  `RVM_FSN_DB_Doppelstock_Base`)
- `FSN_DB_BR143/Content/Simulation/RVM_FSN_DB_BR143.txt` (loco)
- `../../Content/Core/RailVehicles/RVM/Traction/LocomotiveConditionManager.txt`

`@N` is a Kismet bytecode offset (in the ubergraph unless a function is named). Markers:
**[decomp]** read in decompiled code, **[inferred]**, **[game]** seen in game. Lever values now
come straight from the decompiler: the float bug noted in [traction-locks.md](traction-locks.md)
is fixed (see "Decompiler fix").

## Summary

1. The cab car has **its own** `LocomotiveConditionManager`. `HUD_GetIsTractionLocked` on the
   766pbzfa reads only that; it does not look at the loco.
2. The cab car's lock **latches while the Throttle is at 0.0** and releases when the Throttle
   moves to 0.1 or above. The 0.0 position is "off", not the release position.
3. Traction then needs the loco to accept the cab car's demand: no lock in the loco's own
   condition manager and `bAFB_ResetRequired` false (loco tap changer at 0). The loco re-checks
   only when a cable parameter changes, so move the Throttle once more after the loco is clear.
4. The Throttle is a **force demand**: 0.1 = 0 kN, 1.0 = 288 kN, linear. The loco's AFB and
   speed selector are not used from the cab car.

## 1. The cab car's traction lock

`HUD_GetIsTractionLocked` (and `IS_GetTractionLock`) return
`this.LocomotiveConditionManager.GetTractionLock()` of the 766pbzfa itself [decomp]. The manager
is the shared core component; its rule is unchanged from the BR 143:
`IsLocked = (IsLocked && !CanRelease) || TractionConditions > 0`, where `CanRelease` holds while
no release condition is set (`UpdateIsLocked` @0–228, `UpdateCanRelease` @0–236). `UpdateIsLocked`
runs only when a lock condition changes or when `CanRelease` turns true [decomp].

Conditions the cab car sets (names from the class defaults) [decomp]:

| Condition (`ConditionType`) | Set while | Where |
| :--- | :--- | :--- |
| `Reverser` (0, lock) | `Reverser` output 0 or −1 (neutral or off) | Reverser event @13940–14046 |
| `TrainBrake` (0) | `TrainBrake` output ≥ 0.05 | @13733–13767 |
| `DynamicBrake` (0) | `DynamicBrake` output ≥ 0.05 | @13591–13625 |
| `PassengerDoors` (0) | doors not locked, only with `InterlockingSystem` at output 2 | `SetDoorTractionLockEnabled`, `HandleIncomingParameter (UIC568)` |
| `SIFA` (1, penalty → lock) | Sifa penalty brake | @13000 |
| `FullEmergency` (2, emergency → lock) | `EmergencyButton` ≥ 0.5 | @13147 |
| `Emergency` (2) | `EmergencyBrake` ≥ 0.5 | @13464 |
| `PZB_Emergency` (2) | PZB forced brake | @15741 |
| **`Throttle` (3, release)** | **`Throttle` output ≤ −0.5, i.e. input 0.0** | Throttle event @15507–15541 |
| `RemoteSupplyAvaliable`, `HasRemoteSupply` (4, non-critical) | loco has no line supply | @18191, @18312 |

So the only release condition is the Throttle being at 0.0. While it sits there, any lock
(reverser passing neutral, a brake application, Sifa, PZB) stays latched after its cause clears.
Moving the Throttle to 0.1 or higher removes the release condition, and the lock drops if no lock
condition is left. With the Throttle already at 0.1 or above there is no latch at all; the lock
follows its conditions directly [decomp]. The DLG/FSN BR 143 does the opposite (release only
with its speed selector Off), so a driver used to the loco gets this wrong.

Conditions update only on their levers' change events. A lever written without a change event
leaves its condition stale [decomp, as on the BR 110].

`TractionLockOverride_Fuse` and `BrakeOverride` are declared but never read in the blueprint
(`BrakeOverride` also has `bInputEnabled = False`) [decomp]. They do not release anything.

## 2. The cab car's Throttle

`Throttle` (`IrregularLeverComponent`, identifier `Throttle`) [decomp]:

| Input | Output | Meaning |
| :--- | :--- | :--- |
| 0.0 (notch) | −1 | Off: `IsOn` = 0, blocks lock release |
| 0.1 (notch, blocker) | 0 | Zero force, power on (`IsOn` = 1); releases the lock |
| 0.11–0.99 (range) | (in − 0.1) / 0.9 | Force fraction |
| 1.0 (notch) | 1 | Full force |

Converters: `IsOn` remaps output −1..0 to 0..1 (so 1 from input 0.1 up); `Power`/`Display` are
for the HUD (`HUD_GetPowerHandle` = floor(10 × Power)).

`UpdateTractionBrakingOutParams` (cab car) sends over `JumperCable_F` (UIC568 cable,
parameter set `DE_Generic`) [decomp]:

- parameter 0, target tractive effort (N) =
  `slave.MaxTractiveEffortN × FClamp(Throttle output, 0, 1)`, or 0 when the cab car is locked,
  the reverser is Off (`IsEngaged` < 0.5) or `DynamicBrake` output > 0. The slave is
  `ISManager.GetSlaveLocomotive()`; the BR 143 reports `MaximumTractiveEffort` = 288 000 N.
- parameter 3, power handle on = `Throttle.IsOn` ≥ 0.5 (input ≥ 0.1), sent even while locked.
- parameter 1, dynamic brake effort = `DynamicBrake` output × `MaxDynamicBrakingEffortN`
  (150 000 N).
- parameter 2, air brake effort = `MaxAirBrakingEffort × TrainBrake.TargetEffort × MasterKey`.
- parameters 5/4, forward/reverse, come from `Reverser` converters `IsForward`/`IsReverse` through
  the cable's `VirtualHIDBindings`.

It runs only while the cab car is master (`IS_GetActiveCab` = `JumperCable_F.bIsMaster`) and the
ISManager finds the loco. Triggers: Throttle, DynamicBrake and Reverser change events, and
`OnIsLockedChanged` (@18135 → @18115), so a released lock re-sends the force at once [decomp].

On the loco (`RVM_FSN_DB_BR143`) [decomp]:

- `GetTargetTractiveEffort`: force = parameter 0 if exactly one of forward/reverse (5/4) is set
  and parameter 1 < 1, else 0.
- `IsPowerHandleOn` = parameter 3 set **and** loco not locked **and** `!bAFB_ResetRequired`.
- `MU_UpdateTractiveEffortAndDynBraking`: with power on and force > 0 it enables the
  traction/braking actuator, sets `TapChanger_UseTargetPowerInput` and writes the force (N) to
  `TractionBrakingSelector.TractionBrakingSetPoint`. Otherwise it sets the setpoint to 0 and
  `TapChanger_TargetOperation` = 2 (run down).
- It runs only from `IncomingParameterChanged` (cable parameters 0, 1, 3, 13, 14). **Nothing
  re-runs it when the loco's own lock or AFB reset clears**; the next cable change does.

So the Throttle drives a force setpoint and the tap changer follows it. Neither the AFB target
speed nor `ForceSelector` is involved when the cab car drives.

## 3. The loco while the cab car drives

With both loco cabs inactive (`JumperCable_F/B.bIsMaster` false) [decomp]:

- **AFB reset.** Every `Update_ActiveCab` sets `bAFB_ResetRequired = true` and calls
  `TryReset_AFB` (@1121–1132). With no active loco cab the selector term is −1 (off), so it
  clears as soon as `TapChanger_ClosestTapIndex` is 0. `OnTapChangerReachZero` calls
  `TryReset_AFB` again. While it holds, `TLM_AFB_Reset` locks the loco and `IsPowerHandleOn` is
  false.
- **Loco lock conditions** that still apply: `TLConditionBrakingConverter`
  (`TractionBrakingConverter.ExternalBrakeSetPoint` > 1.25, the brake demand, bar
  [inferred]), `TL_PantoRaisedCB_Open` (no local supply: pantograph down or breaker open),
  `BatteryOffCondition`, `TL_ConditionAFB/Power` (AFB active without supply),
  `TLCondition AFBReset` (`AFBController_Reset`), `TLM_Doors` (cable parameters 13/14),
  `TractionFromEmergency` (`ELM_PZB`, `ELM_Sifa` of the loco). `TLM_ReverserNeutral` is cleared
  when no loco cab is master (`UpdateReverserTractionLock`).
- **Loco release conditions:** `ELM_Release_Stopped` (set by an emergency, cleared at a stand)
  and `TR_SpeedSet_F`. In the FSN loco `TR_SpeedSet_F` is set only by **`SpeedSelector_B`** on
  (`IsOn` > 0.5, @22335–22369); the F selector's handler tests `IsOn < 0`, which never holds
  (@21836–21933). This differs from the DLG BR 143, which uses `TR_SpeedSet_F`/`_B` with
  output > −0.5. Also new in FSN: `ELM_Sifa` is an emergency (type 2), not a penalty.
- **Loco HUD.** The loco's `HUD_GetIsTractionLocked` reads the loco's manager, so the cab car's
  HUD can show "unlocked" while the loco is locked, and the other way round.
- **Pantograph, breaker, line power from the cab car** are messages, not cable parameters
  (`BroadcastNewMessage`, protocol 0), handled by the loco @17739–18742:

  | Cab car control | Message | Loco action |
  | :--- | :--- | :--- |
  | `PantographControl` input 1.0 (out +1) / 0.33 (out −1) / 0.0 (out −2, sent as −1) | id 0 | `Set_Pantograph(value == 1)`: raise needs loco battery, breaker **open**, 5-bar aux reservoir at its limit; uses the loco's `PantographSelector` |
  | `CircuitBreaker` input 1.0 (out +1) / 0.0 (out −1) | id 1 | `Set_MCB(open = value == −1)`: close needs loco battery or supply, line voltage at a collector and MCB air reservoir at its limit |
  | `TrainLinePower` input 1.0 (out +1) / 0.0 (out −1) | id 2 | `Set_ECH`: train heating/line supply, not a traction gate |

  All three rest in a neutral middle (0.66, 0.5, 0.5 → output 0) that sends nothing.

## 4. The other cab car controls

| Control | Values | Role for traction |
| :--- | :--- | :--- |
| `Battery_MainSwitch` | 0/1 | Must be 1: cab-active (`UpdateActiveCab`) and the ISManager need it; service setup sets it |
| `ReverserHandle` (`MasterSwitch`) | pressed | Enables `Reverser` input (`UpdateInterlock_ReverserHandle`) |
| `MasterKey` (`BrakeKey`) | 0/1 | Below 0.5 the brake valve is sealed (`UpdateTrainBrakeLock`) and no air brake is sent; set 1 |
| `Reverser` | 0.0 → −2 R, 0.333 → −1 Off (default), 0.666 → 0 neutral, 1.0 → +1 V | Cab active when not Off; lock while 0 or −1; forward = 1.0 |
| `TrainBrake` (`AutomaticBrake`) | 0.0 → −1 fill, 0.1 → 0 running (default), up to 1.0 | Lock while output ≥ 0.05; drives `DynamicBrake` as slave lever |
| `DynamicBrake` | 0–0.1 → 0, 0.1–0.8 → 0–1 | Lock while ≥ 0.05; any output > 0 zeroes the force sent |
| `DirectBrake` (`IndependentBrake`) | 0.0 → −1 release, 0.5 → 0 hold, 1.0 → +1 apply | −1 opens `DirectReleaseEPV`; above 0.5 applies. Not a lock condition, but its cylinder pressure feeds the loco's 1.25 bar check [inferred] |
| `InterlockingSystem` | 0 → 0, 0.5 → 1, 1.0 → 2 (default) | Door mode: at 2 the door traction lock is on (doors must be locked, else lock **and** direct brake applied); 0 or 1 bypass it |
| `BrakeOverride` | 0/0.5/1 → 0/1/2, input disabled | Not used |
| `TractionLockOverride_Fuse` | button | Not used |
| `TrainLinePower`, `CircuitBreaker`, `PantographControl` | spring-centred | Commands to the loco (table above); neutral sends nothing |
| `DistributerCutOff` (parent class) | out −1 default; ±1 → valve Open, 0 → Closed | Brake distributor; leave at default |
| `NBU-EPSwitch` | out −1/0/+1 | Not read in the blueprints (simulation graph only, if at all) |
| `BrakeOvercharge` | button | `AutoAirBrakeValve.ForceOvercharge` while held; not a gate |

The observed values (TrainLinePower 0.5/0, CircuitBreaker 0.5/0, PantographControl 0.66/0,
InterlockingSystem 1/2, BrakeOverride 1/2, DistributerCutOff 0/−1, NBU-EPSwitch 0/−1,
DynamicBrake 0.1/0, DirectBrake 0/−1) are all neutral or harmless. The one to watch is
InterlockingSystem at 2 with doors unlocked.

## Sequence after a change of ends [inferred from the code]

Before leaving the loco cab:

1. Loco battery, pantograph up and breaker closed stay as they are (supply is a loco lock
   condition, and raising/closing from the cab car needs the loco's battery and air).
2. `SpeedSelector_F` (and `_B`) to 0.0 (Off) so the AFB is off and `SpeedSelector_B` cannot hold
   the release condition; tap changer back at 0. Release the loco's `DirectBrake_F`.
3. Then the loco's brake handle, reverser out, brake key off, as done.

In the cab car:

4. `Battery_MainSwitch` = 1 (normally already), `ReverserHandle` pressed, `MasterKey` = 1.
5. `Throttle` = 0.0, `DynamicBrake` = 0.1, `EmergencyBrake` released, `DirectBrake` = 0.0
   (release).
6. `TrainBrake` 0.0 (fill) → 0.1 (running); `BrakeOvercharge` if wanted. Wait until the loco's
   brake demand is below 1.25 bar.
7. `InterlockingSystem` = 1.0 with all doors closed and locked (or 0.5 to bypass the door lock).
8. `Reverser` = 1.0 (forward).
9. Acknowledge Sifa; for a PZB forced brake press `PZB_Release` at a stand.
10. `Throttle` = 0.1. This sends "power on" (parameter 3) and releases the cab car's latch.
    Check the cab car's `HUD_GetIsTractionLocked` = false, the loco's
    `LocomotiveConditionManager.IsLocked` = false and `bAFB_ResetRequired` = false.
11. `Throttle` = 0.1 + 0.9 × (kN / 288). This change event makes the loco re-check and apply the
    force. If the loco was still locked at step 10, a later throttle change is what applies it.

If the cab car locks again with the Throttle above 0.1, it unlocks by itself when the cause
clears; if the Throttle was at 0.0, move it to 0.1. After a loco-side lock or AFB reset, move the
Throttle again (any change) once the loco is clear.

## Diagnostics

- Cab car: `LocomotiveConditionManager.GetAllTractionConditions` / `GetAllReleaseConditions`
  name the blocker (`Throttle` in the release set means "at 0.0").
- Loco: the same on the loco's manager, plus `bAFB_ResetRequired` and
  `Simulation_TapChanger_ClosestTapIndex`.
- `HUD_GetTractiveEffort` on the loco shows whether the force arrived.

## Decompiler fix

kdecomp's `Value()` printed every `FloatProperty`, `DoubleProperty` and `ByteProperty` as 0
because those UAssetAPI types are not `PropertyData<T>`, so `RawValue` returns the type default.
Fixed 2026-10-21 in `tsw-decomp/tools/kdecomp/Program.cs` (reads the `Value` field); the base,
DLG, LFR, TTC, HUD and FSN outputs were regenerated. Lever tables and class defaults in the
decompiled text are now real values.

## Open

- Whether `GetIncomingParameterAnySet` on the loco's `JumperCable_F` sees a cab car coupled at
  the loco's B end (it reads only `_F`; the cable is a train-wide bus, so probably yes).
- The formula behind the loco's `ExternalBrakeSetPoint` (which brake pressure it is).
- Whether `AFBController_Reset` clears by itself in the simulation after `SetAFBActive(false)`.
- Not tried in game yet.
