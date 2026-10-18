# 07 — Relay protocol v0

Wire format for the relay server and all clients (the in-game mod, the
presence-only HTTP-API client, the fake-client simulator). JSON text frames
over WebSocket for v0; every message is one JSON object with a `type`
field. Numbers are JSON numbers; positions are metres unless stated.
Snapshots can instead travel as binary deltas once both ends agree
([Binary snapshots](#binary-snapshots-snap1)); the game-side client always
asks for them.

## Design rules

- The relay never simulates. It validates, rate-limits, stores the latest
  `consist`, `snapshot` and `avatar` per player for late joiners, and fans
  out.
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

## Transports

The messages are the same on every transport; only their framing differs.

- **WebSocket over TCP** (every relay): a text frame per JSON message, a
  binary frame per `snap1` message.
- **QUIC over iroh** (a hosted session; relay feature `iroh`): the host's
  iroh endpoint listens on the game port's UDP side, ALPN `tsw-coop/0`, no
  n0 discovery and no relay servers. The client opens one bidirectional
  stream and sends `hello` on it; each message either way is
  `kind:u8 len:u32 BE payload` (kind 0 JSON text, 1 `snap1` binary;
  `tsw_coop_wire::frame`). The endpoint id is the host's public key, the
  `host key` of the invite, so the connection itself proves the host is
  the one that made the invite. A finished stream is the end of the
  connection, as a WebSocket close is.

A guest with an invite dials both at once, over every address of the
invite, and keeps the first connection (`transport = auto`); `websocket`
and `quic` restrict it. The host's own game always joins over loopback
WebSocket.

## Client → relay

### `hello` (first message, exactly once)

```json
{"type":"hello","proto":0,"mod":"tsw-coop/0.1.0","game":{"build":886,"name":"Train Sim World 7"},
 "player":{"id":"<uuid>","name":"blu","level":42},
 "room":{"route":"TrainingCentre","timetable":"freeroam"},"mode":"full","encodings":["snap1"]}
```

- `player.level` (optional): the game's driver level (the player
  profile's, as Dovetail Live shows it); above 9999 it is dropped. Not
  checked against anything: it is what the player's game says.
- The **country** (ISO 3166-1 alpha-2, for a flag next to the name) is
  not the client's to say: the relay looks the connection's address up in
  a `GeoLite2` country database; a player on the host's machine or LAN gets
  the country of the host's public address. Without a database there is
  none. A `player.country` in the hello is ignored, except by a relay in
  testing mode (`--trust-claimed-country`, host setting `geoip = claims`).
  Level and country travel on in `welcome.players` and `joined`; the
  joiner's own country comes in `welcome.country`.

- `proto` must equal the relay's protocol version (0) or the relay answers
  `error{code:"proto"}` and closes.
- `mode` is `full` (renders ghosts, sends snapshots) or `presence`
  (HTTP-API client, transmit-only; never receives `snapshot`).
- `encodings` (optional) lists binary encodings the client speaks; the
  relay echoes the ones it uses in `welcome.encodings`. Only `snap1`
  exists ([Binary snapshots](#binary-snapshots-snap1)).
- `auth` (optional) is the join proof for a player-hosted session
  ([Joining a hosted session](#joining-a-hosted-session)).
- `packs` (optional) lists the client's installed DLC packs, for the
  host's entitlement check (same section).
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
  every 2 s. The relay merges them into the sender's control state; what
  it forwards as JSON carries that whole state.
- Vehicles missing from a snapshot keep their last known state.

### `avatar` (5–10 Hz while the player is in the world)

The player's own body: the walking passenger pawn of 08 ("Guest body").
Added 2026-10-17 as an additive v0 message (old relays reject it with
`error{code:"schema"}`, nothing else changes).

```json
{"type":"avatar","seq":916,"far":[100105.4,-15241.7,8771.2],"yaw":90.0,"state":"walk",
 "vel":[0.0,140.0,0.0]}
{"type":"avatar","seq":917,"far":[…],"yaw":270.0,"state":"seated","vehicle":"8F2C…"}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `seq` | int | Monotonic per client, shared with the other messages. |
| `far` | `[f64;3]` | Pawn root in far space, centimetres, UE axes (the convention of `snapshot.vehicles[].far`). |
| `yaw` | float | Facing in degrees, `[0, 360)`, 0 = +X, 90 = +Y. |
| `state` | string | `idle`, `walk`, `run`, `jump` (in the air), `seated` or `crouch`. Optional, default `idle`. |
| `vehicle` | string | Optional. `RailVehicleID` the player sits or rides in. |
| `vel` | `[f64;3]` | Optional. cm/s, for extrapolation between updates. |

- Send at 5–10 Hz while moving; a standing player may drop to 1 Hz.
- Relay checks: every `far` component finite and within ±1e9 cm, `yaw` and
  `vel` finite, `vehicle` 1–128 characters, `state` one of the six; any
  failure is a non-fatal `error{code:"schema"}` and the message is dropped.
- Rate: 30/s per player, its own budget (not shared with `snapshot` or
  `event`/`chat`); excess is dropped silently like snapshots.
- Stored per player and replayed to late joiners after their `welcome`,
  together with `consist` and `snapshot`. Like `snapshot`, it is never
  delivered to `presence` clients.
- Receivers validate motion (08 anticheat): the emulator flags an avatar on
  foot moving faster than 12 m/s, or a seated/riding one faster than
  150 m/s, as a teleport.

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
 "clock":"2026-10-17T08:07:50","host":"<player id>","encodings":["snap1"]}
```

Followed immediately by the stored `consist`, last `snapshot` and last
`avatar` of every other player in the room (so a late joiner can spawn
ghosts and avatars at once; `presence` joiners get only the consists).

### Joining a hosted session

A relay run by a host (the mod's own server) admits only invite holders.
Its answer to a `hello` without `auth` is

```json
{"type":"challenge","nonce":"5f0c…(32 hex)"}
```

and the client sends `hello` again with
`auth = hex(HMAC-SHA256(key, nonce ‖ 0x00 ‖ player.id))`, where
`key = SHA256("tsw-coop join v1" ‖ secret ‖ password)`: `secret` is the
invite's 16 bytes, `password` the session password or empty
(`tsw-coop-session::proof`). The nonce is new per connection, so a proof
is good for that connection only; neither secret nor password crosses the
wire. A wrong proof is a non-fatal `error{code:"auth"}`; the third one on
a connection is fatal, and after 5 wrong proofs in a minute from one
address that address is refused until the minute is over. A full session
answers `error{code:"room", fatal:true}`. A relay without a session (the
standalone `tsw-coop-relay`) never challenges.

Bans (host: `ban = <player id or IP>, …` in `tswcoop.cfg`; standalone
relay: `--ban`) are checked before anything else: a banned player id or
address gets `error{code:"auth", fatal:true}` "you are banned from this
session." An IPv4-mapped IPv6 address counts as the IPv4 address.

One mod version and one game build per session (docs/08): after the proof,
a guest whose mod version (after the client name: `tsw-coop-native/0.1.0`
is `0.1.0`) differs from the session's, or whose game build differs from
the host's (once the host is in; 0 = unknown, not compared), gets
`error{code:"version", fatal:true}` naming both versions and where to
download the session's (`https://github.com/Bluscream/tsw-coop/releases`).
Its client does not retry.

DLC (docs/08 "Entitlements", an honest-client check): `hello.packs` lists
the DLC packs the client has installed (`Content/DLC/…-<Pack>.pak`; the
pack's content roots come from its pak index, `tsw-coop-client::content`).
The host tells its relay which packs its route and its spawned trains need
(those that are DLC on the host; base-game content needs nothing), and a
guest lacking one gets `error{code:"entitlement", fatal:true}` naming the
packs and what needs them. Its client does not retry.

**What the relay logs** (the host: `server:` lines in
`tswcoop-native.log`; standalone: stderr), with connection, address,
player id and name: every join (country, level, mod, game build, route),
leave with its reason (`closed`, `timeout`, `kicked`), idle and hello
timeouts, every refusal (protocol mismatch, invalid hello, wrong
password, too many tries or failures from the address, banned, session
full, version mismatch), a duplicate id replacing a connection, chat text (one
line, at most 200 characters) and dropped messages over the rate limit.
Proofs and passwords never.

The same port answers `GET /status` (plain HTTP, CORS `*`, JSON; fields
in docs/research/session-discovery.md "Query"): to anyone for a public
session, otherwise only with `?secret=<hex of the invite's secret>` (403
without). The standalone relay answers 404. Players are counted over all
rooms, the host first in `names`; `route`/`timetable` are the host's.
Under the same rule, `GET /map` gives the live map (`{"players": [{name,
far, yaw, host}], "train": [[x,y,z], …]}`, far-space cm, the host's train
front to back) and `GET /spectate` an HTML page that shows status and map
every 2 s, for spectators without the game. The host writes one spectator
link per invite address (`http://addr/spectate?secret=…`) to
`tswcoop-spectate.txt`; it carries the secret, so it is shared like the
invite.

A hosted session is **one room whatever the route**: each player's own
room (the `hello.room` it sent) comes as `room` in its `welcome.players`
and `joined` entries, and `welcome.room` is the joiner's own. `welcome.host`
is always the session's host, even while it is not connected (in the main
menu), never a guest. `snapshot` and `avatar` (also the replay to a late
joiner) only pass between players on the same route; `consist`, `event`
and `chat` reach everyone. A guest whose host is on another route says so
(the mod: "<host> is on <route>; load it to play together"), and sees the
host once it loads that route (a room change is a new connection).

### `joined` / `left`

```json
{"type":"joined","player":{"id":"…","name":"…","mode":"full","game":{"build":886}}}
{"type":"left","player":{"id":"…"},"reason":"closed|timeout|kicked"}
```

### Fan-out of `consist`, `snapshot`, `avatar`, `event`, `chat`

The client message with two fields added: `from` (player id) and `t`
(relay receive time, ms). Senders do not receive their own messages.
Snapshots go to a `snap1` connection as binary frames instead, re-encoded
for that connection (below); to everyone else as the JSON `snapshot` with
the merged `controls`.

## Binary snapshots (`snap1`)

Negotiated per connection: the client lists `snap1` in `hello.encodings`,
the relay answers with it in `welcome.encodings`, and from then on
snapshots go **both ways** as binary WebSocket frames. Everything else
stays JSON text. A client sends JSON snapshots until its `welcome` arrived.
Binary frames on a connection that did not negotiate `snap1` are a
non-fatal `error{code:"schema"}`; an unreadable binary frame on one that
did is fatal (`proto`): the stream state is lost and the client reconnects.

Each direction of a connection is one stream with state on both ends
(`server/crates/tsw-coop-wire`, layout in its crate docs):

- **Tables once**: a vehicle id or control name is sent the first time it
  appears on the stream, later only its index. Snapshots of several
  players share a relay → client stream in slots (`SOURCE` record: slot
  plus player id).
- **Quantised deltas against what the receiver has**: positions in cm,
  angles in 0.01° (heading and pitch from `fwd`, yaw as an offset from the
  heading), velocities in cm/s; only changed fields, zigzag varints.
- **Dead reckoning**: the receiver moves every vehicle along its last
  velocity; the sender runs the same integer prediction and sends a
  vehicle only when the prediction is off by its tier's threshold. The
  sender's own train (the ids of its last `consist`): 1 cm, 0.1°, 1 cm/s.
  Everything else: 25 cm, 0.5°, 0.5 m/s, and any start or stop. Parked
  vehicles cost nothing.
- **Controls as state**: each value is sent once per change; the receiver
  reports the changed ones as `controls`, as the JSON message would.
- **Stream deflate**: raw deflate with one context per stream, sync-flushed
  per frame, without the `00 00 FF FF` tail (as permessage-deflate).
- **Keyframes**: a new connection starts with empty state, so the first
  snapshot of every player on it is complete. That covers joining and
  reconnecting; the relay replays its stored state (with the merged
  controls) to a late joiner the same way.

The relay decodes what a sender sends and encodes for every receiver
separately; a snapshot dropped by the rate limit still updates the state
it forwards next, so no control change is lost. Times: a binary sender
stamps its own milliseconds (prediction time base); the relay's `t` (wall
clock) travels along per slot, so a receiver still sees `from` and `t`.

Measured on recordings (`server/crates/tsw-coop-wire/examples/measure.rs`,
2026-10-18), relay → guest per snapshot:

| Recording | JSON | `snap1` | guest error, max |
| --- | --- | --- | --- |
| Training Centre, 64 vehicles parked, BR 146 shunting | 9 698 B | 6 B (p95 11) | 0.8 cm |
| Frankfurt, 64 vehicles, ~19 AI moving | 10 205 B | 63 B (p95 202) | train 0.5 cm, AI 25.3 cm |

The first snapshot on a stream is a keyframe of about 2.3–2.6 KB.

### `error`

```json
{"type":"error","code":"proto|room|rate|schema|auth|version|entitlement","message":"…","fatal":true}
```

`fatal:true` means the relay closes the connection after sending it.

## Limits (relay defaults)

| Limit | Value |
| --- | --- |
| `snapshot` rate | 30/s per player, excess dropped (not an error) |
| `avatar` rate | 30/s per player, own budget, excess dropped (not an error) |
| `event`/`chat` rate | 10/s per player |
| vehicles per consist or snapshot | 64 |
| message size | 64 KiB |
| players per room | 32 (a hosted session: its `max_players`) |
| idle timeout | 30 s without any message → `left{reason:"timeout"}` |
| `hello` timeout | 5 s after connect |

## Client-side ghost rules (not enforced by the relay)

- Ghost is frozen after 5 s without snapshot, faded after 10 s, despawned
  after 15 s or on `left`.
- Extrapolate at most 250 ms along `vel`; interpolate otherwise.
- Never attach the local driver pawn to a ghost; ghosts are kinematic.

## Versioning

`proto` bumps on any incompatible change. Additive fields are allowed
within a version. Binary encodings are negotiated with `hello.encodings`
(`snap1` for snapshots); a client or relay that does not list one keeps
JSON, so old and new ends interoperate.
