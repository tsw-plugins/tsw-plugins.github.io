---
name: native-code
description: >-
  Reading TSW 7's own code: unpacking and decompiling the cooked blueprints (repak, kdecomp) and headless Ghidra on TrainSimWorld.exe. Findings in the native code: the simulation graph and its parameter API, how levers and buttons tick, the two brake valve nodes, the traction converter's gates, the native Sifa, and how the AI driver computes its target speed. Also why rea was not adopted.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-21T20:15+0200
last_edited: 2026-10-21T20:15+0200
---

# The game's code: blueprints and native (2026-10-21)

Question from tsw-autopilot: the header dumps give names and offsets but no behaviour. How do the
game's safety systems, brakes, traction and AI actually work, and what can a mod call? Two tools
were set up on 2026-10-21, both read-only on the game install:

1. a blueprint decompiler for the cooked Kismet bytecode in the paks;
2. headless Ghidra on `TrainSimWorld.exe` for the native C++.

Nothing below was run in the game unless a note says so. Findings that depend on these tools are
written up per topic in [safety-systems-and-hud.md](safety-systems-and-hud.md),
[traction-locks.md](traction-locks.md), [scenarios.md](scenarios.md), [ebula.md](ebula.md) and
[timetable-mode-start.md](timetable-mode-start.md). Full notes and commands:
`/run/media/system/Data/tsw-decomp/NOTES.md` and `/run/media/system/Data/tsw-decomp/ghidra/NOTES.md`.

## Blueprints: unpack and decompile

| Tool | Source | Revision | Purpose |
| :--- | :--- | :--- | :--- |
| repak CLI | github.com/trumank/repak | 355b5f6 | list paks, filtered unpack (Rust, built in build-box) |
| UAssetAPI | github.com/atenfyr/UAssetAPI (submodule of kismet-analyzer) | 6c2959b | asset and Kismet parser (.NET) |
| kismet-analyzer | github.com/trumank/kismet-analyzer | e8982e9 | only the UAssetAPI checkout; its own output is CFG graphs with raw `EX_*` opcodes |
| kdecomp | `tsw-decomp/tools/kdecomp/` (about 400 lines of C#, written for this) | | Kismet bytecode to C-like pseudo-code |

- **The paks are v11, zlib, not encrypted** (`repak info`: encrypted index false, zero GUID). No
  keys were needed.
- kdecomp uses the game's `.usmap` (unversioned properties) and prints per asset: the class header,
  every function with one statement per line prefixed by its bytecode offset, and every
  non-function export (class defaults, component templates, curves, data assets) with its values.
  `push_flow`/`pop_flow` are the Kismet flow stack; `ExecuteUbergraph_X(N)` means an event's body
  starts at offset N of the ubergraph.
- The first run decompiled 572 assets with 0 failures (13 MB of text): `Core/RailVehicles`, `AI`,
  `Gameplay`, `Player`, `GameModes`, `RailNetwork`, `Signals`, `GuardMode`, plus the BR 110, BR 143
  and Class 323 simulation folders. Later runs added the HUD menus and scenario assets.
- Layout: `tsw-decomp/lists/` (pak listings), `extract/` (raw assets), `out/` (pseudo-code),
  `tools/`. `tools/decomp.sh <extract-root> [filter]` decompiles a tree.
- **Known bug:** plain float properties in templates and defaults print as 0 (in `Value()` of
  `Program.cs`); see [traction-locks.md](traction-locks.md#decompiler-caveat). Simulation-graph
  expressions are not printed at all; they were decoded from raw `.uexp` with throwaway scripts.

## Native: headless Ghidra

Binary: `TrainSimWorld.exe` of build 886, copied read-only, image base 0x140000000. Addresses below
are RVAs (`TSW+0x…`).

- **Not packed**: normal sections, a full `.pdata` table, clean decompilation. The game classes
  have no RTTI, so classes and vtables were recovered from UE reflection data.
- No full auto-analysis: with about 16 GB of RAM available and 12 GB to be kept free, Ghidra got a
  4 GB heap. The exe is imported without analysis and functions are created and decompiled on
  demand, 10–40 s per run (container JDK in build-box, 4 threads, `nice 10`).
- `scripts/run-all.sh` reproduces everything in about 5 minutes. `decompile.sh` follows tsw-sdk's
  `ghidra-decompile.sh` and adds a names file so `FUN_14…` become reflected names.
- `scripts/uescan.py` works on the PE alone: an index of RIP-relative references, the
  `FNameNativePtrPair` arrays (9730 exec thunks mapped to their class through
  StaticRegisterNatives → GetPrivateStaticClass), vtables and their diffs against the parent,
  USTRUCT construct functions, and enum values. Outputs: `out/natives.tsv`, `out/enums.txt`,
  `out/simnode-params.txt`, `names/*.txt`, decompiled C under `out/{controls,brakes,traction,ai,collector}`.
- Exec thunks are `Class::execFoo`; `impl-names.py` names the implementation behind each.
  Virtual UFUNCTIONs show up as vtable calls in their thunks, which gave the slot numbers below.

### The simulation graph

Brakes, traction, electrics and steam are not methods of the vehicle classes. They are
`FSimulationNode_*` structs with a 41-slot vtable, living in a `USimulationRuntime` owned by
`USimulationComponent` (`+0xD0 SimulationGraphInstance`). Slot 31 is the per-step update, slot 6
returns the node's parameter table, slot 10 is `GetFloatParameter(FName, pin)`.

- **One public API reads and writes any node:**
  `USimulationRuntime::GetNodePin{Float,Boolean,Int}Parameter(FName Node, FName Param, int32 Pin)`
  and the matching `SetNodePin*` (UFUNCTIONs). Implementation `0x1093960`: looks the node up in
  `CachedNodeIndexMap`, then calls the node's slot 10.
- **Only the names in `out/simnode-params.txt` exist**; other members need reflection or offsets.
  Node names differ per vehicle; list them from `USimulationRuntime+0xB8 CachedNodeIndexMap`.
- Parameters useful to an autopilot: pipes, reservoirs and cylinders `Pressure_BAR_G` (and
  `Pressure`, `PressurePSI`); `DriversBrakeValveV2.TargetRegulatorValvePressure`,
  `HandlePosition`; `ACTractionConverter(V2).RequestedEffortTorque`, `CurrentEffortTorque`,
  `IsIsolated`; motors `NetTractiveEffort`, `Current_A`; `ElectricalController.InVoltage_V`;
  `DieselEngine.IsEngineRunning`.

### Cab controls

| Class | Vtable | Slots |
| :--- | :--- | :--- |
| `UVirtualHIDComponent` | 3eb83c8 | 142 |
| `ULeverBaseComponent` | 3eb98f0 | 150 |
| `UIrregularLeverComponent` | 3ebb2e0 | 150 |
| `USimpleLeverComponent` | 3ebdd00 | 150 |
| `UPushButtonComponent` | 3eba200 | 142 |

Slots: 129 InputValueChanged, 130 OutputValueChanged, 131 IsInputEnabled, 138
SetCurrentInputValue, 139 SetCurrentOutputValue, 142/143 input↔output, 144/145 target output and
input, 146–148 notch lookups. Enums: `ELeverDigitalInteractionMode` 0 HoldIncreaseDecrease … 4
NotchCycleDecreaseOnly; `EButtonPushMode` 0 PushAndHold, 1 Toggle, 2 ToggleAndHold.

- **Lever tick** (`0x136aa20`), every frame: when nobody is changing the lever, the input moves
  toward `TargetInputValue` at `InputRange × dt × NotchSnapSensitivity`, which is the spring-back
  and notch snap. While a key is held it moves at `DigitalSensitivity` and **dwells 0.5 s in each
  new notch**. The output follows at `OutputChangeFactor` per second (jumps if 0).
- **So writing `CurrentInputValue` alone is undone** by the snap. Call `SetCurrentInputValue`
  (slot 138; it clamps, applies constraints and updates the target) and read
  `CurrentOutputValue` for what the simulation sees.
- Irregular levers: `ValueMap` interpolates input to output and quantises to
  `LinearOutputValueInterval`; outside a notch the target snaps to the nearer edge of the
  neighbouring notches (`CalcTargetInputValue` `0x135b070`).
- Push buttons: the state is `bIsPushed`; the tick drives the input toward pushed or released. Use
  `SetPushedState(bPushed, bSkipTransition)`; it is refused while a blocking fault tag is active.
- `InputIdentifier` is only the lookup key for bindings, HUD and `FindVirtualHIDComponent`; the
  value logic ignores it.

### Brake valves

- **`DriversBrakeValve` (V1)**: positions 0 Release, 1 Running, 2 Lap, 3 Application, 4 Emergency.
  It has **no pressure regulation**; in Running it is only an opening from the feed to the pipe.
  The ~5 bar level comes from regulating nodes upstream (pilot reducing or limiting valves). It
  self-laps in Application with `bSelfLapping`.
- **`DriversBrakeValveV2`** (most modern stock): target =
  `MinSpring + (MaxSpring − MinSpring) × clamp(curve(handle))`, with hysteresis toward release and
  states 0 Release, 1 Running, 2 Service, 3 Emergency, 4 Neutral. A self-lapping regulating valve
  opens feed or exhaust in proportion to the error. **In Running the pipe settles at the target
  minus a body-pressure term and leakage**, so "below 5 bar in Running" is normal; read
  `TargetRegulatorValvePressure` and the pipe's `Pressure_BAR_G` to see both.

### Traction gates

`FSimulationNode_ACTractionConverterV2::Step` (`0x126d550`), flag bits at +0x70: 0 reverse,
1 manually isolated, 2 auto brake hold, 3 square braking, 4 auto brake hold primed, 5 traction lock
on low brake pipe, 6 e-brake lock on low brake pipe, 7 isolated by low brake pipe.

- Demand is forced to 0 when the brake pipe is below `BrakePipeMinimumPressureForPower` (+0x15C)
  with bit 5 set, when manually isolated, or (negative demand) with bit 6. The signal then ramps at
  `RateOfChange` rather than jumping.
- The motors have no voltage unless the current collector is deployed and fully raised, current is
  available, no `RailVehicleFaults.CurrentCollector.LocalPowerCut` fault is set, the breaker is
  closed, and the supply type fits (`0x12c5080`).
- `TractionBrakingControl` (`0x126ebf0`) is an automatic traction/brake state machine.
- When a safety system isolates traction is decided in blueprints; see
  [traction-locks.md](traction-locks.md).

### Safety devices

Only Sifa and LZB are native; PZB, AWS and TPWS exist only as blueprints.

- `USifaBaseComponent` (vtable 3e8ddc0): flags at +0xE8 (pedal pressed, enabled, active,
  additional conditions), state at +0x100 (0 Neutral, 1 first warning, 2 second warning,
  3 emergency). Active while the speed is at least `ActiveAboveSpeed`. Pedal released longer than
  `SifaPedalTriggerWindow` → emergency; pedal held → warning states step up on a timer (or by
  distance). `SetSifaPedalPressedState(true)` resets to Neutral even from emergency.
- The BR 110 uses the blueprint `BP_Sifa_Service` instead, with different rules; see
  [safety-systems-and-hud.md](safety-systems-and-hud.md).
- LZB helpers: `UPhysicsFunctionLibrary::GetDistanceToSpeedCurveLZB`, `GetLZBRestrictions`,
  `URailVehicleComponent::GetForceLZB`, `GetLZBValidityDistance`.

### The AI driver's target speed

`ATS2AIController` (vtable 3ddf190). Every behaviour-tree tick `UBTService_UpdateRailVehicleTargets`
(`0xddd860`) calls `UpdateTargetVelocity` (`0xde0530`, slot 259) and reads `GetTargetVelocity`
(+0x3D4). In outline:

- One constant comfortable deceleration `a` (the vehicle's, or an override).
- Look-ahead: 100 m plus the braking distance.
- Target = the minimum of: `√(2|a|d)` to each stop point (instruction marker, path end, blocked
  route) minus a stop offset (probably the cvar `ts2.dbg.AIStopPointTargetOffset`, unverified);
  `√(v_lim² + 2|a|d)` for each speed restriction ahead; the vehicle's and the path's maximum.
- A reason byte at +0x3D1 says why the target is 0: 2–5 no pawn/vehicle/service/path, 6 path end,
  8 braking to a stop point, 0xB rolling the wrong way, 0xC route not acquired, 0x11 instruction
  target speed 0, 0x17/0x19 service setup/shutdown, 0x1A locked.
- Levers are moved by behaviour-tree tasks (`UBTTask_MoveLeverToInputPosition`); unpowered AI
  consists use `FRailVehicleSimplePhysics.TargetEffortOrBrakeFraction`. In game the AI was seen to
  drive on simple physics only ([interfaces.md](interfaces.md)).

Callable timetable functions with their implementations: `GetServiceCurrentInstruction`
`0x112dac0`, `GetInstructionDueArrivalTime` `0x112a940`, `GetInstructionExpectedArrivalTime`
`0x112aab0`, `GetInstructionTargetSpeed` `0x112ada0`, `GetServiceNextMarker` `0x112f700`; plus
`GetDriverAidData` (exec `0x14e4430`) and `APassengerInfoSystemBoard::GetServiceStopLocationOnPlatform`.
The reflected side is in [timetable-and-map.md](timetable-and-map.md).

## Ruled out: rea (2026-10-17)

[morluto/rea](https://github.com/morluto/rea) (npm `rea-agents` 6.5.0, MIT, very active) was
checked as a reverse-engineering helper. It is an MCP server and CLI that drives existing tools
(Ghidra, IDA, Hopper, objdump, Rizin); it does no disassembly itself, and most of it targets JS,
.NET, Android, web and firmware. It did not fit:

- its crash inspector reads only Linux ELF core files, not the game's Windows minidumps;
- the UE internals we need are reflection data, already covered by the UE4SS dumps;
- live debugging through its GDB and Rizin sessions does not suit a Proton game;
- for the rare non-reflected routine it adds little over running Ghidra directly, which is what
  was done four days later.

For crash minidumps, `rust-minidump`'s `minidump-stackwalk` with our own PDB was suggested instead
(not set up).

## Open

- Slot 105 of `UActorComponent` is labelled `TickComponent_guess`: every ticking subclass
  overrides it and calls the parent's, but it is not confirmed.
- The AI's stop offset cvar.
- Nothing here was tried in game except where linked notes say so.
