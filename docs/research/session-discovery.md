# Sessions: codes, public listing, query, server browser, connectivity (2026-10-17)

Concept, not built. Asked for by the maintainer: hosts may list a session
publicly (opt-in in the mod settings), set a password and a player limit;
a public query returns name, players, max players, MOTD and so on (like
Steam's A2S or Minecraft's server list ping); a server browser and the
live map live on GitHub Pages (docs/08 "Host web server"); a session ID
users can type; and a look at UPnP / hole punching and at how OpenOMSI and
other projects do all this. Research by three parallel agents, sources at
the end.

## Short answer

- **The relay is the meeting point, so the relay answers every public
  question.** Players never connect to the host; every game already holds
  one outbound WebSocket to a relay. The relay knows each session's
  players, limits and settings, so the query, the listing and the code
  lookup are relay endpoints over HTTPS. The host's own web server stays
  local (`127.0.0.1`), the GitHub Pages site never talks to a player's PC.
- **Session codes are opaque and issued by the relay, not an encoding of
  IP:port.** An address code exposes the host's home IP to everyone it is
  shared with, breaks when the IP changes, fails behind CGNAT, cannot
  carry IPv6 in a typeable length, and points at a machine nobody connects
  to anyway.
- **A small master server collects public listings from relays** (relays
  push heartbeats, entries expire); the Pages site reads only the master.
- **No UPnP or hole punching for the default path.** Add an optional direct
  mode where the host runs the relay inside its own process (LAN, port
  forward, Tailscale/ZeroTier, optional UPnP/PCP). Hole punching stays out
  of v1; if it is ever wanted, iroh 1.0, not a home-made STUN/ICE stack.
  The deciding number is host upload, below.

## What OpenOMSI does (from its source, `openOMSI` HEAD 44c11460)

The "encrypted hello" over ntfy.sh is not encrypted. Details with file
references are in the agent report summarised here:

- **Join code** `OMSI-XXXX-XXXX-…` (base32 without 0/1/I/O, CRC-16) packs a
  48-bit session id, the protocol version, the port and up to three IPv4
  addresses (VPN, LAN, public). The "mask" over the addresses is derived
  from bytes in the code, so every code decodes to the host's addresses.
  The session id comes from `RandomState` over time and pid, not a CSPRNG.
- **ntfy.sh as rendezvous**: host and joiner post their candidate addresses
  (and the cloudflared tunnel URL) to topics named after a hash of the
  session id, as plain text plus a truncated HMAC keyed by the session id.
  The MAC stops forgery; anyone holding the code (or guessing the topic)
  reads the host's and every joiner's IP. ntfy.sh rate limits already
  locked hosts out once (a comment in `bridge.rs` says so). Good part: the
  official server's address is posted with an Ed25519 signature and a
  freshness check.
- **No master server and no browser yet** (planned); a local server list
  plus an HTTP `GET /status` per server (name, motd, map, players,
  max_players, version, password flag, icon) at game port + 10. Worth
  copying as a field set.
- **No join password** (`password` hard-coded false); `max_players` from
  the config is advertised but not enforced (only a hard limit of 32).
- **NAT traversal**: public STUN (Google, Cloudflare), hand-written
  UPnP/SOAP, simultaneous hello/punch to all candidates coordinated through
  ntfy, and as last resort a downloaded `cloudflared` quick tunnel with
  UDP-in-WebSocket. Four free third-party services in the join path, hand
  parsers for SSDP/SOAP/STUN, no IPv6.

Take from it: trying all candidates in parallel, signed announcements, the
`/status` field set. Leave: a public pub/sub service in the join path and a
code that reveals the host's IP.

## How others list and query

| Project | Listing | Freshness | Code → session | Password |
| --- | --- | --- | --- | --- |
| Steam A2S / master | server registers with Steam; UDP query per server | Steam | IP:port | host checks; public flag only |
| Minecraft | none central; TCP status ping (JSON: version, players, MOTD, favicon) or UDP Query | — | address | host |
| BeamMP | server POSTs heartbeat to backend (HTTPS, auth key tied to a Discord account) | on change after 5 s, else every 30 s | IP:port | flag only |
| KissMP | server POSTs to master, master records sender IP | TTL 10 s | IP:port | — |
| Factorio | matchmaking API (create, heartbeat, remove), account token | heartbeats | opaque `game_id` from the directory | host; `has_password` public |
| Valheim crossplay | PlayFab | PlayFab | 6-digit code, new per restart | host |
| Among Us | rooms on a server | — | random 6 letters, scoped to the server | — |

Common pattern: hosts (here: relays) push heartbeats to a directory, the
directory expires silent entries, the authority alone checks passwords and
the list carries only `has_password`. UDP queries (A2S, Minecraft Query)
needed challenge tokens against reflection DDoS; an HTTPS-only design does
not have that problem.

A browser page on `https://…github.io` cannot query game hosts itself:
`fetch`/`ws` to a plain `http://IP` is mixed content and blocked (only
`localhost` is exempt), Chrome 142+ asks the user before a public page may
reach private or loopback addresses (Local Network Access), and hosts
send no CORS headers. Everyone therefore puts one HTTPS API with CORS in
between; the static page reads only that.

## Proposal

### Session code

- Issued by the relay when a host opens a session: **6 characters of
  Crockford base32** (no I, L, O, U; case-insensitive), shown `K7Q-4ZM`,
  about a billion values, valid only while the session lives, reissued on
  request (a leaked code can be revoked).
- Bare code = the default public relay (the master can also resolve a bare
  code to whichever listed relay holds it). Other relays:
  `relay.example.org/K7Q-4ZM`, `tswcoop://relay.example.org/K7Q-4ZM`,
  `https://<pages>/join#relay.example.org/K7Q-4ZM`.
- Lookups per IP are rate-limited so codes cannot be enumerated.
- Replaces the `TSW-XXXX-XXXX` placeholder in docs/08.

### Session settings (host, in the mod settings)

| Setting | Meaning | Enforced by |
| --- | --- | --- |
| `public` | list on the master (default off) | relay sends or withholds it |
| `name`, `motd` | ≤ 64 / ≤ 256 characters, control and bidi characters stripped | relay |
| `password` | optional | relay before forwarding any traffic; host may re-check |
| `max_players` | 2–8 (docs/08 limit) | relay at join (count plus pending), with an explicit "full" error; host may kick |
| `show_players` | player names in the public query and on the master (host decides, default off); without it the listing has no `names` array but still the player count | relay |

Password: the host sends a salted hash (Argon2id) to the relay when opening
the session; a joiner sends the password over `wss://` (TLS to the relay);
the relay compares, limits attempts per IP and session (e.g. 5 per minute
then back off), never logs it, and only `has_password` leaves the relay.

### Public query (relay, HTTPS, CORS `*`, GET only, cached ~5 s)

- `GET /v1/sessions`: the relay's public sessions.
- `GET /v1/sessions/{code}`: one session, public or not, for whoever has
  the code (so a private session can still show "3/8 players, password").

```json
{ "code": "K7Q-4ZM", "name": "blu's Rhein-Ruhr evening", "motd": "Freight only",
  "players": 3, "max_players": 8, "has_password": true,
  "route": "/TrainingCentre/Map/TrainingCentreMap", "timetable": "freeroam",
  "game_build": 886, "mod_version": "0.1.0", "protocol": 0,
  "relay": "wss://relay.example.org", "region": "eu-central",
  "started_at": "2026-10-17T19:00:00Z", "names": ["blu", "rd"] }
```

`names` only with `show_players`; without it the field is left out and `players` (the count) stays. Live map data (positions) is a separate,
opt-in stream: `GET /v1/sessions/{code}/events` (SSE) relayed from what the
relay already forwards (snapshots and avatars, thinned to 1–2 Hz), so the
Pages map works for anyone with the code without touching the host's PC.
The host decides whether its session's map is visible (`public_map`, off
by default; a password-protected session's map needs the password).

### Master server and browser

- A small HTTPS service (could share a process with the default relay).
  Relays, not hosts, push `POST /v1/heartbeat` with their public sessions:
  on change (debounced to 5 s) and at least every 30 s; a session expires
  after 90 s without one, a relay after 120 s; a closed session is removed
  at once.
- Only known relays (API key) are accepted, or an unknown relay is verified
  by the master fetching its `/v1/sessions` itself, which defeats fake
  listings. Caps: sessions per relay, sessions per host IP at the relay,
  heartbeats per relay.
- **Hosting (maintainer, 2026-10-17):** the master backend runs as a Docker
  container on the NAS, reachable from the internet through Tailscale
  Funnel or a Cloudflare Tunnel (either gives it a public HTTPS name
  without opening ports). Its API needs CORS for the Pages origin.
- **The UI is a GitHub Pages site**, a server list with a details page per
  session (query fields, player names if the host shares them, live map if
  enabled). Address: `tsw-coop.github.io` needs a GitHub account or
  organisation named `tsw-coop`; otherwise the project site of the
  repository, `bluscream.github.io/tsw-coop`. The list reads
  `GET /v1/sessions` from the master; the details page reads the session's
  query and map stream from its relay. Join: copy the code, or a
  `tswcoop://` link the installed mod handles.
- The site is the only place with styling and the map (docs/08); the mod
  serves data.

### Connectivity

Host upload is what decides between relay and direct: with direct
connections the host sends every snapshot to each guest.

| Snapshot | Host upload, direct to 7 guests | via relay | relay traffic per session-hour |
| --- | --- | --- | --- |
| 5 KB at 10 Hz | ~2.8 Mbit/s | ~0.4 Mbit/s | ~1.3 GB |
| 20 KB at 10 Hz | ~11.2 Mbit/s | ~1.6 Mbit/s | ~5 GB |

Many German DSL lines upload 10–40 Mbit/s, so a direct star saturates them
at full player count; through the relay the host uploads once. A small EU
VPS (around 20 TB traffic included) carries thousands of session-hours a
month; the NAS on a cable line (around 50 Mbit/s up) about 4 full sessions
at 20 KB. Delta encoding and compression would cut all of this several
times and are worth doing first.

Layers:

1. **Relay (default, v1).** One outbound WebSocket, works behind any NAT
   and CGNAT, hides player IPs, no third-party service in the path.
2. **Direct mode (v1, small).** The host runs the relay code inside its
   own process (the `server/` relay as a library) on a configurable port.
   Guests join via LAN, a forwarded port, or Tailscale/ZeroTier (the
   documented answer to CGNAT). Optional UPnP-IGD/PCP/NAT-PMP through the
   `portmapper` crate (the one iroh uses): off by default, with a lease,
   removed on exit, logged; needs a test under Proton (SSDP multicast).
   Same wire protocol, so the code format above works unchanged
   (`192.168.2.20:7420/K7Q-4ZM`).
3. **Hole punching (post-v1, only if asked for).** Measured success is
   about 70 % of pairs (IPFS DCUtR study, 4.4 M attempts), so a relay stays
   necessary for the rest; every serious system (Tailscale DERP, Steam SDR,
   EOS, iroh) keeps one. If built: iroh 1.0 (QUIC, dial by key, port
   mapping, punching, self-hostable relay) as a direct-path upgrade
   between host and guest with our fan-out relay as fallback. Risks: a
   second transport stack in the DLL, and `quinn-udp` socket options under
   Wine need a spike first. Not WebRTC or libp2p (heavier, worse results).

This keeps the docs/08 decision ("transport is a relay, NAT punching out
of scope for v1") with a stronger reason (host upload, the 10–30 % that
cannot punch) and widens the existing `--lan-host` idea into the
in-process relay.

## Open questions for the maintainer

- ~~Who runs the master?~~ Answered 2026-10-17: Docker on the NAS behind
  Tailscale Funnel or a Cloudflare Tunnel; UI on GitHub Pages. Still open:
  the same for the default public relay (it carries the game traffic, see
  the bandwidth table), and which of the two tunnels (Cloudflare's terms
  and WebSocket limits vs. Funnel's bandwidth).
- ~~Player names in the listing?~~ Answered: the host decides
  (`show_players`); without it only the count is shown.
- Account-free listing (anyone can host) or tie public listing to
  something (a GitHub login, a per-relay key only)?
- Should a public session's live map be visible to strangers at all, or
  only to people with the code?
- Pages address: create a `tsw-coop` GitHub organisation for
  `tsw-coop.github.io`, or use the repository's project site?

## Sources

- OpenOMSI source: `/run/media/system/Data/Projects/openOMSI`
  (`crates/omsi-net/src/lib.rs`, `bridge.rs`, `ws.rs`, `tunnel.rs`,
  `official.rs`; `crates/omsi-app/src/server.rs`; `docs/SERVER.md`).
- Valve server queries: https://developer.valvesoftware.com/wiki/Server_queries,
  challenge change: https://steamcommunity.com/discussions/forum/14/2974028351344359625/
- Minecraft: https://minecraft.wiki/w/Java_Edition_protocol/Server_List_Ping,
  https://minecraft.wiki/w/Query
- Satisfactory query API: https://satisfactory.wiki.gg/wiki/Dedicated_servers/Lightweight_Query_API
- BeamMP heartbeat: https://raw.githubusercontent.com/BeamMP/BeamMP-Server/master/src/THeartbeatThread.cpp,
  port forwarding/CGNAT: https://docs.beammp.com/server/port-forwarding/
- KissMP master: https://raw.githubusercontent.com/TheHellBox/KISS-multiplayer/master/kissmp-master/src/main.rs
- Factorio: https://wiki.factorio.com/Matchmaking_API
- Among Us codes: https://hindenburg.js.org/pages/plugins/api/game-codes.html
- Magic Wormhole codes: https://magic-wormhole.readthedocs.io/en/latest/welcome.html
- Mixed content: https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content,
  Local Network Access: https://developer.chrome.com/blog/local-network-access
- UPnP security (CallStranger): https://www.helpnetsecurity.com/2020/06/09/cve-2020-12695/,
  `portmapper`: https://docs.rs/crate/portmapper/0.19.0, `igd-next`: https://www.lib.rs/crates/igd-next
- Hole punching success: https://arxiv.org/html/2510.27500v1,
  https://probelab.io/blog/can-libp2p-punch-through-nats/
- iroh: https://docs.iroh.computer/concepts/holepunching, https://iroh.computer/blog/iroh-1-0-0-rc-1
- Tailscale connection types: https://tailscale.com/docs/reference/connection-types,
  Steam Datagram Relay: https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay
