# 03 — Architecture

## Goals and non-goals

Goals, in priority order:

1. Players on the same route, at the same in-game time, see each other's
   trains as correctly placed, correctly composed, moving consists.
2. Visible state follows: lights, doors, pantographs, horn, cab occupancy.
3. Optional: the local signalling and dispatcher react to remote trains.

Non-goals, at least for v1: shared physics, coupling to a remote player's
train, shared timetable scoring, console support, anything that requires
DTG cooperation.

## Core constraint: every client runs its own full simulation

TSW is single-player. Each client simulates its own train with SimuGraph,
its own AI traffic, its own dispatcher and signals. There is no authority
to share. So the design is **"everyone is authoritative for their own
train, everything else is a ghost"**:

- The player's own consist is simulated locally, exactly as today.
- Remote players' consists are **ghosts**: locally spawned actors that are
  moved to where the remote simulation says they are. They do not simulate,
  do not collide (phase 1), and are not known to the local dispatcher.
- AI traffic is the open problem. Each client has different AI trains
  unless they share a timetable session and seed, and even then they drift.
  See "Signalling and AI" below.

## Layers

```
+-----------------------------------------------------------------------+
| TrainSimWorld.exe (UE 4.26, TS2Prototype)                             |
|  +-----------------------------------------------------------------+  |
|  | UE4SS (proxy dwmapi.dll)                                        |  |
|  |  +-----------------------------------------------------------+  |  |
|  |  | tsw-coop C++ mod (CppUserModBase)                         |  |  |
|  |  |  L1 Capture   read own train state each tick             |  |  |
|  |  |  L2 Transport client thread <-> relay server             |  |  |
|  |  |  L3 Ghosts    spawn/move remote consists                 |  |  |
|  |  |  L4 Sim-link  (later) feed ghosts into signalling        |  |  |
|  |  |  L0 Core      main-thread queue, logging, config, ImGui  |  |  |
|  |  +-----------------------------------------------------------+  |  |
|  |  | tsw-coop Lua mod: debug commands, experiments             |  |  |
|  +-----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
         |  localhost (optional)
         v
   DTG HTTP API (-HTTPAPI :31270)  -- telemetry fallback / presence-only mode

   relay server (standalone, cross-platform, no game code)
```

### L0 — Core (loader integration)

- UE4SS vendored as a submodule, built with CMake per upstream docs. This
  repo carries `assets/CustomGameConfigs/Train Sim World 7/UE4SS-settings.ini`
  if any override is needed (none known for TSW 5).
- Entry: `start_mod()` exports a `CppUserModBase`. `on_unreal_init` resolves
  all `UFunction*`/`UClass*` handles once and caches them. `on_update` drains a
  main-thread queue and runs L1 and L3 each frame.
- Everything that touches UObjects runs on the game thread. The network
  thread only pushes immutable snapshots into lock-free queues (pattern taken
  from `TSW5Mods/Shared/mainthreadqueue`).
- Crash safety: wrap every hook body in SEH, guard against level transitions
  (hook `PlayerController:ClientRestart` and `UWorld` changes to flush all
  cached pointers and despawn ghosts).

### L1 — State capture (own train)

Per tick (throttled to the network rate, e.g. 10–20 Hz), build a
`TrainSnapshot`:

| Field | Source (observed on TSW 5, see 02-prior-art) |
| --- | --- |
| Consist definition | Walk the formation from the drivable actor; per vehicle: `ObjectClass` (e.g. `RVM_CRG_DB_BR101_C`), orientation, livery id, coupled order |
| Position per vehicle | `AActor` world transform **plus** the current world tile (`currentTile {x,y}`) because TSW streams and rebases the world in tiles; also `GetActorLatLong` as a tile-independent reference |
| Kinematics | `GetVelocity`, speed from `HUD_GetSpeed`, acceleration |
| Visible controls | VirtualHID values of a whitelist: headlights, cab lights, doors L/R, pantographs, horn, bell, wipers, reverser, and a coarse throttle/brake for sound |
| Driver | `GetDriverPawn`, `SeatSide`, camera mode (so a ghost can show an occupied cab) |
| Clock | `GetDateTime` for drift checks between clients |

Design decision: **send track-relative position when possible**. World XYZ
in a tile-streamed world is fragile. TSW's track network is a graph of
spline sections; if the dump reveals a "track node + distance along node"
accessor (SimuGraph or the driver-aid code must have one, since
`DriverAid.Data` reports distances to signals), prefer `(trackId, offset,
direction)` and let the receiver resolve it to a transform locally. Fall
back to `(tile, local XYZ, rotation)` with lat/lon for sanity checks.

### L2 — Transport

- **Relay server, not peer-to-peer.** A small standalone server (Rust or Go,
  no game dependencies) holds rooms keyed by `(route id, timetable/scenario
  id)`. It fans out snapshots, holds the last snapshot per player for late
  joiners, and runs chat. It never simulates.
- Protocol: WebSocket for v1 (ships in TSW5Mods already via uWebSockets, easy
  to debug, fine at 20 Hz for a handful of trains). Keep message schema
  transport-agnostic so a UDP/ENet path can be added for larger sessions.
- Messages: `Hello{route, timetable, gameBuild, modVersion}`,
  `ConsistDef{playerId, vehicles[]}` (on join and on change),
  `Snapshot{playerId, seq, t, perVehicle[{pos, rot, vel}], controls}`,
  `Event{horn, doors…}`, `Chat`, `Leave`.
- Versioning: server rejects mismatched `modVersion`; a `gameBuild` mismatch
  (from `/info` → `GameBuildNumber`) is a warning, since vehicles may differ.
- Session time: the server publishes the host's in-game clock; clients show a
  drift warning, they do not force time (that is the player's setting).

### L3 — Ghost trains

Three spawning strategies, in increasing fidelity and risk. Start with A,
aim for B, keep C as research.

**A. Mesh ghosts.** For each remote vehicle, spawn a plain `AActor` with a
`UStaticMeshComponent`/`USkeletalMeshComponent` cloned from the real
`RVM_*` blueprint's visual components, no physics, no tick logic. Move it
with `SetActorTransform` each frame, interpolating between snapshots
(hermite on position, slerp on rotation, extrapolate on velocity up to
~250 ms). Requires that the vehicle's assets are installed locally; if not,
substitute a placeholder and tell the user which DLC the other player is
running.

**B. Real vehicle actors, simulation disabled.** `StaticConstructObject` /
`SpawnActor` the actual `RVM_*` class so lights, doors, pantographs and
bogies animate through the game's own code, then suppress its SimuGraph
tick and physics (candidate approach: find the simulation component on
`ARailVehicle`, disable it or hook its tick to early-return, keep the actor
out of the dispatcher's registry). Drive visible controls by writing the
same VirtualHID components the controller mod writes. This is where most of
the reverse engineering budget goes.

**C. Native AI consist.** Spawn the remote train through the game's own AI
service/timetable spawning so the dispatcher and signals treat it as real
traffic, then continuously override its target speed/position to track the
remote snapshot. Highest fidelity, highest risk (fighting the AI driver,
timetable conflicts, desync when the override lags).

Common rules for ghosts:
- Never let a ghost become the "current drivable actor" or get a driver pawn.
- Despawn on `Leave`, on timeout (no snapshot for 5 s → freeze and fade,
  15 s → despawn), and on any level change.
- Ghosts do not collide in A and B. Collision with a ghost would otherwise
  derail the local player because only one side simulates it.

### L4 — Signalling and AI (later)

What a shared railway needs that ghosts do not give:

- **Signals reacting to remote trains.** Requires either strategy C, or a
  hook into the track-occupancy/dispatcher code so a ghost's track section
  counts as occupied. Unknown feasibility until `TS2Prototype` dispatcher
  classes are dumped and read.
- **Shared AI traffic.** Option 1: everyone runs the same timetable and the
  mod suppresses AI services whose paths are driven by human players.
  Option 2: one client (the host) keeps its AI, others hide theirs and show
  the host's AI as ghosts (AI becomes just more remote trains from the
  host's L1, which scales badly but is simple). Option 2 is the likely v1.
- **Passenger/freight tasks** stay local.

## Presence-only mode (no injection)

A reduced client that uses only DTG's HTTP API (`DriverAid.PlayerInfo`,
`CurrentDrivableActor.LatLon`, `HUD_GetSpeed`, `CurrentFormation/{i}.ObjectClass`)
can publish snapshots to the same relay. It cannot render ghosts, but it lets
console-free "ThirdRails-style" users appear on PC players' tracks, and it
is the fallback whenever a game update breaks UE4SS. The relay protocol
treats such clients as "transmit-only".

## Security and trust

- The relay accepts only schema-valid snapshots with rate limits; a hostile
  client can at worst place a ghost somewhere silly.
- No remote code: ghosts are built from locally installed assets by class
  name; class names are validated against the local object table before use.
- The mod listens on nothing by default (outbound WebSocket only). The
  DTG API stays localhost unless the user opens it.
