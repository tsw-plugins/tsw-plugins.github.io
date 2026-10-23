---
name: tsw-coop-concept
description: >-
  The maintainer's scope decisions for tsw-coop: a host-owned world, walking guests, driver handover, relay transport, sessions, mod sync, entitlements and two-way anticheat, with the revised milestones.
game_build: 886 (TSW 7, Steam build 25890949)
status: accepted
created: 2026-10-17T07:06+0200
last_edited: 2026-10-20T20:50+0200
---

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

## Decisions 2026-10-20: guests live in the host's world

The maintainer's requirements (2026-10-20), replacing the "ghost only" reading of M4/M5:

- **Same world on join.** A guest loads the host's route, mode and timetable (or scenario)
  automatically; being told where the host is no longer suffices.
- **The host's trains, real on the guest.** The host's own train and its AI trains are spawned
  on the guest wherever the guest has their DLC. The guest's own AI trains are **despawned**,
  not hidden, to make room for them.
- **Guests get into the host's train:** any passenger seat, standing in the cab, the driver's
  seat.
- **Full control from the driver's seat.** A guest in the host's cab operates *everything*
  through the game's own controls: every lever, switch and button (lights, pantograph,
  horn, doors, safety systems), with any input the game accepts, custom hardware
  controllers included. Not just roles (power, brake, reverser) mapped by the mod.
- **Exactly synchronised**, within network latency.

**Consequence for the architecture.** View-actor ghosts (today's L3) cannot be walked in, sat
in or driven: the game only routes player input, controllers included, into a *drivable*
the pawn controls. So the guest needs **real local copies** of the host's trains, boarded
like any train, with a simulation that follows the host instead of running free:

- **Host authoritative.** The host's simulation is the only one that counts.
- **Copies follow the host.** The guest's copies take position, speed and control states
  from the host's snapshots.
- **Controls go to the host by name.** The guest's control changes on its copy are captured
  at the controls (`VirtualHIDComponent` by name, or the controller RPCs
  `Begin*/EndUsingVHIDComponent`), sent to the host and applied there. The host's resulting
  states come back for every car.
- **Bodies ride with the car.** Avatars carry their position relative to the car they are in,
  so bodies ride with the train instead of drifting next to it.

**Stages** (each ends with an in-game check):

| # | Stage | Main unknown | State (2026-10-20, tsw-coop) |
| --- | --- | --- | --- |
| G1 | Auto-load: the host sends mode + timetable/scenario; the guest mounts and loads it (tsw-sdk loaders: `freeroam`, `LoadTimetable`, `LoadScenario`) and then joins | Free Roam start point; scenario identity | Code (ab52df1, b75c270): a guest connects from the main menu and starts Free Roam on the host's timetable; `/follow` leaves another world for the menu. Free Roam only. Not tried in game yet |
| G2 | Despawn the guest's AI cleanly (no stale track occupancy) | No clean despawn known yet (05 §10f) | Code (382c08d): Free Roam's `ASandboxManager::StartRemovingTrain` per formation, hidden as before if it stays. A G1 guest starts with the timetable cleared (no AI). Not tried in game yet |
| G3 | Spike: spawn a consist as a real train at an exact track position, and keep it on the host's position (kinematic, or simulated and corrected) | The two biggest unknowns: spawn position, external position control | Experiments 1–4 (research/train-copies). Code (57ff6a9, setting `train_copies`, off): the lead vehicle from its own `URailVehicleDefinition` via `SpawnFormation`, held by simple-physics effort. Not tried in game yet |
| G4 | Generic controls: all `VirtualHIDComponent`s by name, the guest → host input and host → guest state, interlocks, buttons, blueprint-only controls (battery, parking brake) | Controls that need blueprint calls | Code (4b054c8): every control under `@<name>` in the host's snapshots; a driving guest in a train of the host's class sends what it moves by name and gets the host's values. Blueprint-only controls still open. Not tried in game yet |
| G5 | Riding along: seats, standing in the cab, car-relative avatar positions | Seat manager on a copied train | Code (73d88f2): `avatar.rel`, the body's place in the host's car; seats are the copy's own. Not tried in game yet |
| G6 | The host's AI trains as real copies (G3 at scale), the DLC check per train | Cost of many simulated copies | Waits for G3 in game. AI vehicles often have no definition (`CreatedFromPtr` null): a view class → definition map is needed |

## Decisions 2026-10-23: hosting and joining

After the first two-machine test (hand-edited config files, both players named "blu", a
refused reconnect, the guest 28 km from the host), the owner's requirements:

- **Hosting and joining need no file editing.** They happen in the game, from the **coop
  menu**: a native screen (the game's own menus through `tsw_ui`) that clicking the coop
  card on the main menu opens, also F9 and `coop.menu`. Join links (`tswcoop://`) and
  Steam's "Join game" land in the same flow. Nothing goes online at launch.
- **Sessions are listed as a native feature.** "Find sessions" shows every session in one
  list: the master's public list, sessions on the local network (UDP beacons on port
  7442), and Steam friends' (their rich presence). Each row: name, route, players, ping,
  where it was found, and what keeps us out (another mod version or game build, missing
  DLC, full, unreachable). Filters, sort, refresh; a session with a password asks for it.
  "Join by invite, code or address" takes a link, a master code or `ip[:port]` (an open
  session hands its invite to `GET /invite` on its game port).
- **Hosting** from the same menu, on the current world or from the main menu (guests
  follow wherever the host goes). Its options are the game's own settings (`coop.*`):
  player name (default: the Steam name), session name, visibility, players (2–8),
  message of the day, password (typed in a dialog), port. Visibility decides who learns
  the invite:

  | Visibility | Master list | Master code | LAN beacon + `/invite` | Steam/Discord "Join" |
  | --- | --- | --- | --- | --- |
  | `public` | yes | yes | yes | yes |
  | `friends` (default) | no | no | no | yes |
  | `lan` | no | no | yes | no |
  | `invite` | no | yes | no | no |

- **`tswcoop.cfg` is optional**: only advanced network keys (master, port mapping,
  advertise, NAT relay, transport, bans, web server). An older file's name, password and
  session options move into the settings once; `host`/`join` lines go.
- **Identity is a key.** Each player has an Ed25519 key (`tswcoop-player.key`); the player
  id is derived from it and every join proves it. A reconnect from any address replaces
  the old connection instead of being refused.
- **Guests always start next to the host**, on join and after every world reload in a
  session: once the guest's body and the host's fresh avatar are on the same route, a
  guest on foot more than 50 m away is moved 3 m to the host's right with the game's far
  jump (`ATS2PrototypePlayerController::JumpToFarLocation`, which moves the world origin
  along). "Go to host" (menu, `/goto`) does it at any distance. A guest driving a train is
  not moved. Next: into the host's train (copies, G3/G5) when the host is in it.
- **The master tells the host what is wrong.** Heartbeats back off after failures; a host
  whose port the master cannot reach is listed as reachable through its relay server
  only (signed heartbeat with a relay in the invite), and the menu says what to forward
  otherwise.
- **The host's game speed is the session's** (`uniloader.speed`): guests take it on, a
  change of their own is set back with a notice, their own speed returns when they leave.
- **Plugin state.** Other plugins share state with the session over loader events: a
  plugin publishes `coop.share` (`key\ndata`), the host sends each key to its guests on
  change and every 10 s, and a guest's coop re-publishes it as `coop.shared` (empty data
  when the session ends). First user: tsw-ebula's look (the Kontrast key's day/night
  choice and the Helligkeit step), so a guest in the host's train sees its screens as the
  host does; `ebula.display` and `ebula.night` stay each player's own.

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
