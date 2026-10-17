# 07 — Relay protocol v0

Wire format for the relay server and all clients (the in-game mod, the
presence-only HTTP-API client, the fake-client simulator). JSON text frames
over WebSocket for v0; every message is one JSON object with a `type`
field. Numbers are JSON numbers; positions are metres unless stated.

## Design rules

- The relay never simulates. It validates, rate-limits, stores the latest
  `consist` and `snapshot` per player for late joiners, and fans out.
- One WebSocket connection = one player. Rooms are keyed by
  `(route, timetable)`; a player is in at most one room.
- Positions are **far-space** coordinates as the game reports them
  (`URailVehicleComponent::GetPosition()`: double X, double Y, float Z, in
  centimetres, UE axes). Receivers convert to UE-local with
  `local = far - GetWorldOriginLocation()` (see 05-tsw-internals §10c).
  Far space is route-specific, so a room never mixes routes.
- Per-vehicle data, not per-consist: cars can be reordered or uncoupled.
- Every client message carries `seq` (monotonic per client) and the relay
  stamps `t` (server receive time, ms since epoch) on fan-out.
- Unknown fields are ignored; unknown `type` is rejected with `error`.

## Client → relay

### `hello` (first message, exactly once)

```json
{"type":"hello","proto":0,"mod":"tsw-coop/0.1.0","game":{"build":886,"name":"Train Sim World 7"},
 "player":{"id":"<uuid>","name":"blu"},"room":{"route":"TrainingCentre","timetable":"freeroam"},
 "mode":"full"}
```

- `proto` must equal the relay's protocol version (0) or the relay answers
  `error{code:"proto"}` and closes.
- `mode` is `full` (renders ghosts, sends snapshots) or `presence`
  (HTTP-API client, transmit-only; never receives `snapshot`).
- `room.route` is the route's content id (`URouteDefinition` name once
  known; the map package name until then). `timetable` is the timetable or
  scenario id, or `freeroam`.

### `consist` (on join, and whenever the formation changes)

```json
{"type":"consist","seq":12,"vehicles":[
  {"id":"8F2C…-…","class":"RVM_TTC_Class323_DMS_A_C","definition":"/TTC_Class323/Data/RVD/RVD_TTC_Class323_DMS_A","flipped":false,"livery":""},
  {"id":"…","class":"RVM_TTC_Class323_PTS_C","definition":"…","flipped":false,"livery":""}
]}
```

- `id` is the vehicle's `RailVehicleID` GUID (stable for the session).
- `class` is the `RVM_*_C` class name; `definition` the
  `URailVehicleDefinition` asset path (what a receiver needs to find the
  local asset or to decide it is missing). `livery` is `ReskinID` or empty.
- Order is front to back in the direction of travel of the lead vehicle.

### `snapshot` (10–20 Hz while in a vehicle; 1 Hz when parked)

```json
{"type":"snapshot","seq":913,"clock":"2026-10-17T08:07:50","speed":12.4,
 "vehicles":[
  {"id":"8F2C…","far":[-2387.7,46013.6,8696.6],"fwd":[-0.9,-0.5,0.0],"yaw":208.4,"vel":[-11.1,-5.5,0.0]},
  {"id":"…","far":[…],"fwd":[…],"yaw":…,"vel":[…]}
 ],
 "controls":{"Headlights_F":1,"Doors_L":0,"Doors_R":0,"Pantograph_F":1,"Horn_F":0,"Reverser_F":1}}
```

- `far` in centimetres (as the game stores it), `vel` in cm/s, `speed` in
  m/s signed along the lead vehicle's forward vector, `clock` the in-game
  date-time. `yaw` is the view actor's yaw in degrees (full rotation is
  reconstructed from `fwd`; pitch/roll follow the track locally).
- `controls` is a whitelist of visible VirtualHID values (0–1 floats or
  ints), only keys that changed since the last snapshot plus a full set
  every 2 s.
- Vehicles missing from a snapshot keep their last known state.

### `event`

```json
{"type":"event","seq":914,"name":"horn","args":{"on":true}}
```

Short-lived things that must not be lost to snapshot throttling: `horn`,
`bell`, `coupled`, `uncoupled`, `derailed`, `cab_changed`.

### `chat`

```json
{"type":"chat","seq":915,"text":"hello"}
```

### `leave` (optional; closing the socket is equivalent)

## Relay → client

### `welcome` (reply to `hello`)

```json
{"type":"welcome","player":{"id":"<uuid>"},"room":{"route":"TrainingCentre","timetable":"freeroam"},
 "players":[{"id":"…","name":"…","mode":"full","game":{"build":886}}],
 "clock":"2026-10-17T08:07:50","host":"<player id>"}
```

Followed immediately by the stored `consist` and last `snapshot` of every
other player in the room (so a late joiner can spawn ghosts at once).

### `joined` / `left`

```json
{"type":"joined","player":{"id":"…","name":"…","mode":"full","game":{"build":886}}}
{"type":"left","player":{"id":"…"},"reason":"closed|timeout|kicked"}
```

### Fan-out of `consist`, `snapshot`, `event`, `chat`

The client message with two fields added: `from` (player id) and `t`
(relay receive time, ms). Senders do not receive their own messages.

### `error`

```json
{"type":"error","code":"proto|room|rate|schema|auth","message":"…","fatal":true}
```

`fatal:true` means the relay closes the connection after sending it.

## Limits (relay defaults)

| Limit | Value |
| --- | --- |
| `snapshot` rate | 30/s per player, excess dropped (not an error) |
| `event`/`chat` rate | 10/s per player |
| vehicles per consist | 64 |
| message size | 64 KiB |
| players per room | 32 |
| idle timeout | 30 s without any message → `left{reason:"timeout"}` |
| `hello` timeout | 5 s after connect |

## Client-side ghost rules (not enforced by the relay)

- Ghost is frozen after 5 s without snapshot, faded after 10 s, despawned
  after 15 s or on `left`.
- Extrapolate at most 250 ms along `vel`; interpolate otherwise.
- Never attach the local driver pawn to a ghost; ghosts are kinematic.

## Versioning

`proto` bumps on any incompatible change. Additive fields are allowed
within a version. Binary (CBOR or MessagePack) encoding may be negotiated
later via a `hello.encodings` list; v0 is JSON only.
