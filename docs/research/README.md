# Research notes ("Erkenntnisse")

Findings about the game, UE4SS and our tooling, written down as they are made. One topic per file;
each finding says how it was verified and when. Older, chronological notes live in
[`../05-tsw-internals.md`](../05-tsw-internals.md); new findings go here.

| File | Topic |
| :--- | :--- |
| [driving-trains.md](driving-trains.md) | Getting a train from any state to moving in code: what blocks it, the `drive` toolkit, per-class recipes |
| [interfaces.md](interfaces.md) | Every interface into the running game (Lua, hooks, DTG HTTP API, VirtualRailDriver, virtual pad), tested side by side; recommendations for tests and co-op |
| [ue4ss-lua-pitfalls.md](ue4ss-lua-pitfalls.md) | UE4SS Lua rules that crash the game when broken: threads, NULL object wrappers, timers |
| [developer-functions.md](developer-functions.md) | Is there a built-in "make train ready"? Presets, AI service setup, cheats, simple controls |

Tooling referenced throughout:

| Command | What it does |
| :--- | :--- |
| `tswup [A\|B\|C\|path]` | One step towards "game running, scenario loaded" per call (launch, wait, load); exit 0 when there |
| `tswcmd drive diag [json]` | Everything that matters for driving the current train, with a verdict |
| `tswcmd drive ready [filter]` | Any state to drivable (boards a train matching `filter` first) |
| `tswcmd drive go [filter] [power]` | `ready`, then power |
| `tswcmd drive stop` | Cancel all running drive sequences, release held controls |
| `tswlua '<lua>'` | Run Lua on the game thread through the bridge |
| `scripts/lint-lua` | Lua gate: `luac5.4 -p`, `luacheck`, offline tests (fake UE4SS, virtual clock) |
