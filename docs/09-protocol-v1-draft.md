# 09 — Protocol v1 (DRAFT for maintainer review)

> **Status: draft, not implemented, not agreed.** Written 2026-10-17 alongside
> the client emulator (`server/crates/tsw-coop-emu`). Nothing here exists on
> the wire yet: the relay speaks v0 (`07-protocol.md`) and rejects every
> message below with `error{code:"schema"}` (scenario `13-v1-draft-gap`).
> Names, fields and the split between relay and host are proposals to decide
> on, not decisions. When a decision is made, record it in `08-concept.md`
> and turn the relevant part of this file into `07`'s successor.

## Why v0 is not enough for 08

Each point was observed with the emulator against the v0 relay; the scenario
that shows it is named.

| # | v0 behaviour | Conflict with 08 | Shown by |
| --- | --- | --- | --- |
| 1 | Rooms are keyed by `(route, timetable)`; anyone naming them joins. | Private lobby, join code `TSW-XXXX-XXXX`. | `06-limits-room-full` |
| 2 | `host` is the oldest member; when it leaves, the next oldest is promoted. A spectator or guest that connects first becomes host. | Host owns the session; a host leaving ends it. | `10-disconnects` |
| 3 | 64 vehicles per `consist`/`snapshot`. | Host replicates its train **and all AI**: the recorded Training Centre sample already has 104 vehicles and is rejected. | `11-replay-sample` |
| 4 | Everything is broadcast to the room. | Seat grants, join rejections, input to the host need directed delivery. | — |
| 5 | Any client sending `hello` with a known player id evicts that player (`auth`, `kicked`). | Anticheat: a guest must not be able to kick others. | `08-adversarial-protocol` |
| 6 | `presence` clients never receive snapshots. | Spectators are *map* spectators: they need positions. | `03-late-join` |
| 7 | Only text frames reset the idle timer; a listen-only client is dropped after 30 s. | Walking guests between pawn updates, spectators. | `07-limits-timeouts` |
| 8 | 32 players per room, any mix. | Up to 8 players per session. | `06-limits-room-full` |
| 9 | Only `proto` is checked. | One mod version, one game build per session; entitlement check; refusal with a download hint. | — |
| 10 | Any member may send any message type. | Only the host sends world state; guests send pawn/seat/input only. | `09-adversarial-motion` |
| 11 | No sender validation of motion (by design). | Host validates guests, guests validate host (08). Emulator roles already do both; the protocol needs a way to report it. | `09-adversarial-motion` |

## Proposed principles

- The relay stays dumb about simulation but learns **sessions, roles and
  per-type sender permissions**: a cheap table check, not game logic. This
  closes 2, 5, 10 at the relay instead of trusting every client.
- **Directed messages**: an optional `to` (player id) on any message; the
  relay delivers to that player only. Without `to`, broadcast as in v0.
- The host stays the only authority for anything simulated (08). The relay
  never interprets world state beyond size and rate limits.
- Versioning: `proto: 1`. v0 clients are refused with `error{code:"proto"}`.

## Messages

`→R` client to relay, `R→` relay to client(s), `H` host, `G` guest, `S`
spectator. All carry `seq` from the sender, `from`/`t` on delivery as in v0.

### Lobby and handshake (L6)

| Message | Dir | Fields | Notes |
| --- | --- | --- | --- |
| `session_create` | H→R | `proto`, `mod`, `game{build}`, `player{id,name}`, `route`, `scenario`, `max_players` (≤ 8), `require{route, vehicles[], packs[{id,hash}]}` | Replaces `hello` for hosts. |
| `session_created` | R→H | `code` (`TSW-XXXX-XXXX`), `session`, `resume` (secret token) | |
| `session_join` | G/S→R | `code`, `proto`, `mod`, `game{build}`, `player`, `mode` (`player` \| `spectator`), `owns{routes[], vehicles[], dlc[]}`, `packs[{id,hash}]` | Replaces `hello` for guests. Relay checks `proto`, `mod`, `game.build` against the host's and refuses mismatches itself (`join_rejected`). |
| `join_request` | R→H | `player`, `mode`, `owns`, `packs` | Host decides entitlement (08: honest-client check). |
| `join_accept` | H→R | `to` | |
| `join_rejected` | R→G | `reason` (`version` \| `build` \| `entitlement` \| `full` \| `refused`), `missing[]`, `hint` (download URL or text) | Fatal; replaces v0 `error{code:"room"}` for sessions. |
| `welcome` | R→G/S | v0 fields plus `session`, `code`, `resume`, `host` (always the session creator) | Followed by the stored world state (below). |
| `session_end` | R→all | `reason` (`host_left` \| `route_changed` \| `host_ended`) | Host leaving ends the session (no promotion). |
| `kick` | H→R | `to`, `reason` | Only the host may kick. |
| `resume` | G→R | `session`, `player`, `resume` | Reconnect within a grace period; replaces "same id evicts". A `session_join` with an id that is present is refused. |
| `ping` / `pong` | any↔R | `seq`, `rtt_ms` (pong) | Counts as activity (fixes 7); gives RTT for the driver-lag question in 08. |

### Host-authoritative world (L1/L3)

| Message | Dir | Fields | Notes |
| --- | --- | --- | --- |
| `world_consists` | H→all | `consists[{id, kind: "player"\|"ai", vehicles[ConsistVehicle]}]` | Full formation list incl. AI; on change. Stored for late joiners. |
| `world` | H→all | `clock`, `consists[{id, speed, vehicles[SnapshotVehicle]}]`, `applied_input` (`{player: seq}`) | Replaces per-player `snapshot` for the host. Limit per *message* (bytes), not per train; may be split with `part`/`parts` when a route has many AI trains. 10–20 Hz. Stored for late joiners. |
| `signals` | H→all | `full` (bool), `aspects[{id, aspect}]`, `switches[{id, state}]` | Deltas plus a full set every few seconds. |
| `clock` | H→all | `date_time`, `rate`, `paused` | Also inside `world`; separate for pause/jump. |
| `weather` | H→all | preset or parameters | On change. |

Relay rule: only the host may send `world*`, `signals`, `clock`, `weather`,
`seat_grant`, `seat_deny`, `seat_reclaim`, `join_accept`, `kick`; anything
else from a guest is `error{code:"auth"}` and not forwarded.

### Players and seats (L5)

| Message | Dir | Fields | Notes |
| --- | --- | --- | --- |
| `pawn` | H/G→all | `far[3]`, `yaw`, `anim`, `seat` (`{vehicle, seat}` or null) | Walking passengers, 5–10 Hz. Spectators receive, never send. **Partly shipped in v0 as `avatar`** (07, 2026-10-17: `far`, `yaw`, `state` as `anim`, `vehicle`, optional `vel`; no seat slot yet, broadcast, presence clients excluded). v1 adds the seat slot, spectator delivery and sender permissions. |
| `seat_request` | G→H | `vehicle`, `seat` (`driver`) | Directed to the host. |
| `seat_grant` | H→all | `to`, `vehicle`, `seat` | Broadcast so everyone renders the driver. First come wins (08). |
| `seat_deny` | H→G | `to`, `reason` (`taken` \| `not_allowed`) | |
| `seat_release` | G→H | `vehicle` | Guest leaves the cab. |
| `seat_reclaim` | H→all | `vehicle`, `from` (previous driver) | Host can always reclaim. Also sent by the host when the driving guest disconnects. |
| `input` | G→H | `vehicle`, `controls{name: value}` | Directed; only from the granted driver, rate limit ~30/s. Host applies, reports `applied_input` in `world`. |
| `emergency_brake` | H→all | `vehicle`, `reason` (`driver_lost`) | Driver dropped while the host is out of the cab (08). |

### Validation reports (anticheat)

| Message | Dir | Fields | Notes |
| --- | --- | --- | --- |
| `violation` | H→R (logged), H→G (`to`) | `player`, `kind` (`teleport` \| `rate` \| `malformed` \| `not_allowed`), `detail` | Host tells the offender and may `kick`. |
| `leave` | G→R | `reason` (`host_invalid`, `detail`) | Guest leaving on impossible host updates (08), visible to everyone. |

## Emulator scenarios that would test v1

The emulator's message layer already sends any of these raw (`send_json`)
and supports plugin roles; v1 roles would be registered in a `Registry`
instead of changing the core. Proposed scenarios once the relay speaks v1:

| Scenario | What it asserts |
| --- | --- |
| `v1-lobby-code` | Host creates a session, gets a code; guests join by code; a client using the wrong code gets `join_rejected`. |
| `v1-version-mismatch` | Guest with another `mod` or `game.build` is refused with `reason` and `hint`; nothing reaches the host. |
| `v1-entitlement` | Host refuses a guest missing a spawned vehicle; `missing[]` names it. |
| `v1-session-full` | 8 players fit; the 9th gets `join_rejected{reason:"full"}`. |
| `v1-host-only-types` | A guest sending `world`, `signals` or `seat_grant` gets `error{code:"auth"}`; peers receive nothing. |
| `v1-world-large` | Host replays the 104-vehicle sample as `world`; guests receive it; a 300-vehicle synthetic world is split into parts and reassembled. |
| `v1-late-join-world` | Late joiner gets `world_consists`, the last `world`, `signals` and `clock` right after `welcome`. |
| `v1-seat-handover` | `seat_request` → `seat_grant`; guest `input` reaches only the host; `applied_input` comes back in `world`; host `seat_reclaim`; later `input` from the guest is rejected. |
| `v1-seat-race` | Two guests request the seat at the same instant; exactly one grant, one deny. |
| `v1-driver-drop` | Driving guest drops abruptly; host reclaims; with the host out of the cab, `emergency_brake`. |
| `v1-host-leaves` | Host leaves; everyone gets `session_end{reason:"host_left"}`; no promotion. |
| `v1-resume` | Guest drops and resumes with its token; a third client using the same id without the token is refused (fixes v0 eviction). |
| `v1-spectator-map` | Spectator receives `world` and `pawn`, may not send them. |
| `v1-keepalive` | A listen-only guest sending only `ping` stays connected past the idle timeout; RTT is reported. |
| `v1-guest-validates-host` | Host teleports; guests flag it and `leave{reason:"host_invalid"}`. |
| `v1-host-validates-guest` | Guest pawn teleports or floods `input`; host sends `violation` and `kick`. |

## Open points for the maintainer

- Does the relay check `mod`/`build` itself (fast refusal, relay needs to know
  the host's values) or only forward to the host (simpler relay)? The draft
  says relay, since 08 wants mismatches refused "with a clear message".
- `world` chunking versus a binary encoding (`hello.encodings` from 07) for
  large routes.
- Whether `pawn` goes through the host (validated) or straight to everyone
  (lower latency, validated by every receiver).
- Grace period for `resume` and what the host's train does meanwhile.
- Whether v0 rooms stay available for the presence-only HTTP-API tool.
