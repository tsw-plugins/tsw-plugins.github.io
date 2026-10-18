# UE4SS Lua pitfalls that crash TSW 7

Installed: UE4SS build in `…/Binaries/Win64/ue4ss/` (reports zDEV v3.0.1, but has the newer
game-thread timer API listed below). Source for reference: `external/RE-UE4SS` (May 2026).

## 1. Never run Lua on the async thread (2026-10-17, read from source + two game crashes)

`LoopAsync`, `ExecuteWithDelay` and `ExecuteAsync` callbacks run on UE4SS's async thread
(`LuaMod::update_async` → `process_delayed_actions`, every 5 ms). They call into `async_lua()`
**without any lock**. `async_lua`, `main_lua` and `hook_lua` are all `lua_newthread`s of one global
state (a source comment says they intend to move to `lua_newstate`). Game-thread callbacks
(`ExecuteInGameThread`, hooks, console commands) run on the game thread at the same time. Two
threads inside one Lua state corrupt it.

Symptoms we saw, all during busy `drive` sequences (30 ms polling loops plus `FindAllOf` over every
control on the game thread):
- `attempt to index a number value (local 'c')` while iterating `FindAllOf(...)` results.
- EXCEPTION_ACCESS_VIOLATION reading 0xa in `lua_setiuservalue` ←
  `LuaType::UObjectBase::construct` ← `auto_construct_object` ← a global function
  (dump: `dumps/tsw7-886/experiments/crash-lua-async-race/`, 11:42).
- A game exit without a crash report at 11:28, same phase.

After the switch to `sched` (11:47), the same sequences, including the parking brake step both
crashes had happened at, ran through on three locos without a crash.

**Rule:** use the game-thread timers instead. The installed build has `ExecuteInGameThreadWithDelay`,
`LoopInGameThreadWithDelay`, `CancelDelayedAction` (verified with `strings` on UE4SS.dll).
`mod-lua/TswCoopDebug/Scripts/sched.lua` wraps this: **one** `LoopInGameThreadWithDelay(30)`
registered at load time drives a Lua-side timer list (`sched.after`, `sched.every`). The offline test
fake makes `LoopAsync` / `ExecuteWithDelay` throw, so a regression fails `scripts/lint-lua`.

The remaining users of `LoopAsync` are `TswCoopTelemetry` (disabled in mods.txt) and `TswCoopDump`
(a one-shot dumper).

## 2. Do not create a UE4SS timer from inside a timer callback (2026-10-17, read from source)

Game-thread actions live in `std::vector`s that UE4SS walks with `std::erase_if` while holding a
*recursive* mutex. Registering a new action from inside a callback takes the same mutex again and
`emplace_back`s into the vector being iterated (iterator invalidation). `process_simple_actions`
also refuses to run nested actions (`m_is_currently_executing_game_action`).

**Rule:** register UE4SS timers only at script load. Continuations use `sched` (plain Lua tables;
a timer added inside a callback runs from the next pump).

## 3. Check `IsValid()` before calling any method on a looked-up object (2026-10-17, game crash)

A UObject wrapper can point at NULL and still be truthy, e.g. `d.SomeProperty` for a property this
class does not have, or an empty object property. Calling a method on it (`GetClass`, `GetFName`, …)
dereferences NULL inside UE4SS: EXCEPTION_ACCESS_VIOLATION reading 0x10 (UObject::ClassPrivate) in
`UObjectBase::setup_member_functions` lambda. `pcall` cannot catch a native access violation.
Crash: `dumps/tsw7-886/experiments/crash-null-uobject-getclass/` (probe read
`d.RailVehicleComponent` on a BR 146, which has no such property, then called `:GetClass()`).

**Rule:** `drive_ctl.valid(o)` (type check + `pcall(o.IsValid)`) before every method call;
`drive_ctl.component(d, prop)` and `drive_ctl.prop(o, prop)` for property reads.

## 4. Smaller facts

- `os.clock()` in UE4SS is MSVC `clock()`: wall-clock milliseconds since process start, not CPU
  time. `sched` uses it as its clock.
- Return values of UFunctions work from Lua; float **out-parameters** do not (they come back 0).
- Reading simulation values: `d.Simulation:GetSimulation():GetNodePinFloatParameter(FName(node),
  FName(param), -1)` (node/param names as the DTG HTTP API lists them).
- Mod reload: `RestartCurrentMod()` / `RestartMod(name)` (bridge: `tswcmd reload [mod]`). Ctrl+R via
  the GUI is unreliable. UE4SS drops a restarted mod's delayed actions.
- Lua 5.4: no `setfenv`; give `load` the environment as its 4th argument.
