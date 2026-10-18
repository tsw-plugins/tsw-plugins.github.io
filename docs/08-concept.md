# 08 — Concept and scope decisions (2026-10-17)

Answers given by the maintainer on 2026-10-17. These override the more
open-ended options in 03 and 04 wherever they conflict.

## One sentence

A host runs a normal TSW 7 scenario, opens a private lobby and hands out a
join code; friends join *that* world as walking passengers who can explore
the route, ride trains, and drive the host's train whenever the seat is
free. The host's simulation is the only truth.

## Decisions

| Topic | Decision |
| --- | --- |
| Session model | **Host → clients.** The host selects and owns route, train, scenario, clock and weather. Guests do not bring their own scenario. |
| Lobby lifecycle | Host starts a scenario first, then opens the lobby. A route change ends the session. |
| Guest body | A walking passenger pawn, visible to all other players, able to board trains and sit. |
| Explore scope | The whole loaded route on foot, including riding the host's AI trains as a passenger. |
| Simulation | **Host always simulates** its train. A driving guest sends inputs; the host runs physics and replicates state back. Accept input lag over trust problems. |
| AI, signals, switches, time | Host-authoritative and replicated. Guests suppress their own AI, dispatcher and clock. |
| Driver handover | Empty seat = first come. Host can always reclaim. If the driving guest disconnects, control returns to the host; if the host is absent from the cab the train gets an emergency brake application. |
| Remote train rendering | Real `RVM_*` vehicle actors spawned kinematic (03 strategy B), visible controls driven through VirtualHID. |
| Mod language | **Rust wherever native code is possible**, performance and player-to-player compatibility being the priority. UE4SS only offers a C++ `CppUserModBase` entry point, so the game-side mod is a thin C++ shim (lifecycle, hooks, UObject access) over a Rust core (`cdylib`: protocol, networking, replication state, validation, lobby). The relay and tools are Rust. Exceptions where another language is pragmatic: entitlement/version checks, installers, web join page. Lua stays for prototyping and the debug bridge. |
| Players | Up to 8 per session. |
| Platforms | PC only. Linux/Proton is a first-class target (the maintainer's setup). |
| Spectator mode | HTTP-API-only clients may join as map spectators (no in-game presence). |
| Host web server | Added 2026-10-17 (maintainer), revised the same day. The mod runs an **API-only** HTTP server: server info, player list and map data as JSON, realtime updates over Server-Sent Events (`text/event-stream`), and dev endpoints (simulated hotkeys, quit, console commands) for tests. **No website in the mod:** the map and live view are one static site on GitHub Pages; the user enters a session ID there and the page connects to that session's API and renders the data. The page that `GET /` serves today (`mod/native/src/web/map.html`) is the starting point for that site and leaves the mod once the site exists. Proposal for codes, public listing, query, browser and connectivity: `docs/research/session-discovery.md` (the relay answers public queries and serves the map stream; the host's server stays local). |
| Entitlements | **Honest-client check**: the client reports installed + licensed route/loco DLC (Steam local API + asset presence); the host refuses joins that lack the route or any vehicle currently spawned. Not forgery-proof by design. |
| Mod sync | Host → guest sync of the coop mod version/config and **data-only** content (liveries, reskins, scenario data). Never DLLs or Lua. Version mismatch = refuse join with a download hint. |
| Anticheat | Host validates every guest message (plausible movement, rate limits, no spawn/teleport/cheat requests at all). Guests also sanity-check the host and leave with a warning on impossible or malformed updates. |
| Invites v1 | Join code typed in-game, `tswcoop://` URI + web link, Steam overlay invites. Discord later. |
| First test route | Training Centre (Free Edition) until a second licensed install exists. |
| Release | `github.com/Bluscream/tsw-coop`, MIT. |

## Non-negotiables (maintainer, 2026-10-17)

- These decisions are the written record; update this file when one
  changes rather than letting conversation state drift. `AGENTS.md` points
  here.
- Polish over features: as bug- and glitch-free as possible before
  adding scope.
- Compatibility between players: one protocol version, one mod version,
  one game build per session; mismatches are refused with a clear message,
  never papered over.
- Rudimentary anticheat from day one: nothing a guest sends can spawn,
  teleport or crash anything on another machine.

## Networking: what OpenOMSI does, and what we do

OpenOMSI (OMSI 2 rewrite in Rust) runs the host as the server over UDP
(LAN port 27015). For internet play it combines public STUN (Google,
Cloudflare) for address discovery, UPnP port mapping, the public ntfy.sh
service as a rendezvous channel for the session code, and, when all of
that fails, downloads and runs `cloudflared` to open a tunnel; the joiner
hellos every candidate address at once and keeps the first that answers
(10 s timeout). It also has a server browser and TeamSpeak-style voice.
Its multiplayer is widely considered rough, and the tunnel/ntfy chain is a
large part of why: four third-party dependencies in the join path.

**Revised 2026-10-17 (maintainer): each host carries its own session's
traffic; guests connect to the host's game directly (the relay runs inside
the host's mod), and everything works without any central service. The
paragraph below is the earlier decision, kept for the reasoning; the
current design is `docs/research/session-discovery.md`.**

Earlier decision: **the host PC is the authority, but the transport
is a relay** (the Rust relay in `server/`, run on the maintainer's NAS or
a small VPS, self-hostable by anyone). The join code is a relay session
id. Reasons:

- No port forwarding, UPnP, STUN or tunnel binaries; the join path is one
  outbound WebSocket for everyone, which also works through Tailscale and
  corporate NAT.
- The relay is dumb (fan-out, rate limits, replay for late joiners) so
  cheating still has to get past the host, not the relay.
- A direct LAN mode (`--lan-host`, guests connect to the host's IP) stays
  as a zero-infrastructure option; NAT punching is explicitly out of
  scope for v1.
- Join code formats: `TSW-XXXX-XXXX` typed in-game, `tswcoop://join/<code>`
  and `https://<relay>/j/<code>` (web page that opens the URI), Steam rich
  presence `connect` string carrying the same code.

## What this changes in the architecture (03)

- L1 capture now runs **only on the host**, and captures everything that
  must be replicated: own train, every AI consist, signal and switch
  states, clock, weather, the formation list.
- L3 ghosts on guests cover the host's train *and* its AI traffic.
- New layer **L5 Players**: pawn replication (position, animation state,
  seat), seat arbitration, and input forwarding from the driving guest to
  the host's `VirtualHID` components.
- New layer **L6 Lobby**: host/join flow, join codes, entitlement and
  version handshake, data-pack sync, in-game overlay (ImGui).
- Guests must **suppress** their local AI service spawning, dispatcher
  clock and weather before the host state arrives (candidates:
  `ts2.dbg.LoadTimetable` with an empty timetable, `AISetDrivable`,
  removing AI formations after load, `SetWorldDateTime`).

## Revised milestones

| # | Milestone | Exit criterion |
| --- | --- | --- |
| M1 | Loader + dumps | done (3d9c26e); Rust+C++ mod toolchain proven in game (05 §10h) |
| M2 | Telemetry | host-side capture of own train + AI consists + clock + weather at 10 Hz, C++ mod, numbers match HTTP API |
| M3 | Relay + lobby | host opens lobby, guest joins by code through the relay, version/entitlement handshake, overlay shows players |
| M4 | Guest world | guest loads the same route in a quiet state (no local AI), sees the host's train and AI as kinematic ghosts with lights/doors/pantos |
| M5 | Players | walking pawns replicated, boarding and sitting, seat arbitration, guest drives host's train via input forwarding |
| M6 | Polish | data-pack sync, Steam/URI invites, anticheat validation both ways, reconnect, installer |
| M7 | Spectator + extras | HTTP-API spectator client, Discord invites, text chat |

## Open questions carried forward

- Input forwarding latency: is 50–100 ms round trip acceptable for a
  driving guest, or does the host need to run guest inputs with a small
  client-side prediction on throttle/brake levers (visual only)?
- How to suppress a guest's AI cleanly without breaking the route's
  scenario state the host expects.
- ~~Passenger pawn class for guests.~~ Answered 2026-10-17 (05 §10g): a
  second `TS2DefaultDriverPawn_C` re-hides its own mesh every tick, a
  plain `ACharacter` dressed with the game's NPC skeletal meshes renders.
  Guest avatars use their own actor class. Animation: no anim instance
  needed, `PlayAnimation` with the NPC walk/stand/seated sequences works
  (`docs/research/avatars.md`). Still open: whether the seat manager can
  seat it.
- Driver handover is built for the BR 146 (`docs/research/remote-driving.md`):
  seat, driver announcement, lever values applied by the host, F8 reclaim.
  The driving guest looks out of the ghost cab (view target, pawn stays
  put). Not yet: emergency brake when the host leaves the cab, per-class
  control tables, which cab end, moving ghost levers.
- Ghost lifecycle (05 §10f): `SpawnFormation` ghosts register in track
  occupancy, cannot be repositioned at the physics level while kinematic,
  and `K2_DestroyActor` leaves a stale occupancy GUID. Signal aspects are
  therefore replicated from the host, ghosts are pooled per session, and a
  clean despawn path is still to be found.
- Jumping (added 2026-10-17, `mod-lua/TswCoopDebug/Scripts/jump.lua`,
  optional with `tswcmd jump on|off`): Space calls `Jump()` on the on-foot
  driver pawn. Photo mode moves from Space to O. The game's own
  movement does the rest (about 1.2 m). For co-op the jump must reach the
  other players: the pawn position travels in snapshots already, but guest
  avatars need the falling/landing state to animate it. Port it to the Rust
  mod with the M5 player replication.
- Entitlement: exact Steam local API call available from inside the game
  process under Proton (`ISteamApps::BIsDlcInstalled` + `BIsSubscribedApp`).
  Resolved 2026-10-18: the mod calls `BIsDlcInstalled` through the game's
  flat API. Each pack's app id comes from Steam's `appmanifest`: every DLC
  is one depot holding one pak, matched by size (`steam_dlc.rs`). The game's
  own `TS2BlueprintSupportLibrary::GetStoreId(DLCName)` would be a second
  source, if size matching ever fails.
