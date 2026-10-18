# Sessions: codes, public listing, query, server browser, connectivity (2026-10-17)

**Status 2026-10-18:** built, tested without the game (unit and loopback
integration tests), not yet tried in game:
- snapshot traffic (`snap1`, "Keeping the traffic small" below);
- the invite, join proof and status document (`server/crates/tsw-coop-session`);
- admission with secret, password and player limit
  (`tsw-coop-relay/src/admission.rs`, docs/07 "Joining a hosted session");
- the relay inside the host's game, `GET /status` on its port
  (`tsw-coop-relay/src/host.rs`, `http.rs`);
- `host =` / `join =` in `tswcoop.cfg` (`mod/native/src/hosting.rs`);
- port mapping, UPnP-IGD only (`tsw-coop-client/src/portmap.rs`, "Reaching
  the host" below).

Built later on 2026-10-18 (see their sections): the master with short
codes, QUIC over iroh. Not built yet: PCP / NAT-PMP, IPv6 pinholes, hole
punching, the Pages site. Current state of every feature:
`docs/features.md`. The text below is the concept as decided.

Originally a concept. Asked for by the maintainer: hosts may list a session
publicly (opt-in in the mod settings), set a password and a player limit;
a public query returns name, players, max players, MOTD and so on (like
Steam's A2S or Minecraft's server list ping); a server browser and the
live map live on GitHub Pages (docs/08 "Host web server"); a session ID
users can type; and a look at UPnP / hole punching and at how OpenOMSI and
other projects do all this. Research by three parallel agents, sources at
the end.

## Decisions (maintainer, 2026-10-17)

These overrule the first draft of this document (which made a shared
relay the meeting point) and the docs/08 line "the transport is a relay":

1. **Each host carries its own session's traffic.** Guests connect to the
   host's game; there is no public relay. The NAS uploads 15 Mbit/s for
   the whole household and only runs the master (small JSON traffic).
2. **Everything works without the master and without the Pages site.** A
   private session needs nothing but the host's game and an invite sent by
   chat; the master only adds public listing, short codes and the browser.
3. **Public means everything is public** (names, map, details); a password
   only guards joining. Private sessions list nothing anywhere.
4. Master backend: Docker on the NAS behind the existing Cloudflare Tunnel
   and/or Tailscale Funnel. UI: GitHub Pages (server list, session details).

Consequences, worked out below: the invite has to carry the way to the host
itself (so it is an address encoding after all, the maintainer's first
idea, now justified because guests connect to that address anyway); the
host must keep its upload small (delta snapshots); NAT traversal is the
host's job (port mapping, overlays, hole punching where a rendezvous is
available); the public query runs on the host.

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

## Design (after the decisions)

### The host is the server

The relay code in `server/` becomes a library the host's mod runs in
process: one listening port (WebSocket over TCP today, the same wire
protocol), up to 8 players, the host's game authoritative as before. A
self-hosted standalone relay stays possible for groups that have a VPS,
but nothing depends on one.

Host upload is the cost. Today a host snapshot is about 18 KB (mostly the
AI traffic around it), so 10 Hz to 7 guests is ~10 Mbit/s, too much for
many DSL lines. Before direct play ships the traffic has to shrink (next
section); target ≤ 2 KB per snapshot on average, i.e. ≤ ~1.5 Mbit/s for
7 guests, and far less for a parked train.

### Keeping the traffic small (requirement, maintainer 2026-10-17)

"Minimise it as much as possible, only send what changed, best practice."
The usual toolbox for snapshot replication, in the order it pays off:

1. **Delta against an acknowledged baseline** (Quake 3 / Source model):
   each guest acks the last snapshot it received; the host sends only the
   fields that differ from that baseline, per entity. Lost packets cost
   nothing extra (the next delta is against the last *acked* state), and
   an entity that did not move costs zero bytes.
2. **Change thresholds**: a value only counts as changed beyond a small
   epsilon (position 1 cm, heading 0.1°, lever 0.005), so jitter is not
   sent.
3. **Quantisation and compact encoding**: positions as integer
   centimetres relative to a per-snapshot origin, headings as 16-bit
   angles, velocities as 16-bit, binary encoding instead of JSON for the
   game traffic (JSON stays for events and the query).
4. **Static data once**: vehicle classes, liveries, consists, names only
   when they change (the consist message already works that way).
5. **Interest management and rate tiers**: the host's own train and
   vehicles near any player at full rate (10 Hz); AI traffic far from
   every player at 1–2 Hz or only on start/stop; parked vehicles once.
   Each guest gets what is relevant around it.
6. **Prediction instead of sending**: guests extrapolate along the track
   with the last speed (already done for ghosts); the host sends a
   correction only when the guest's extrapolation would be off by more
   than the threshold (dead reckoning).
7. **Compression last**: zstd per message (with a dictionary trained on
   recorded snapshots) or per stream; on top of deltas it mostly removes
   the remaining repetition.

**Measured** (2026-10-17, `dumps/tsw7-886/experiments/compress-1/`:
`analyze.py`, `results.txt`; recordings: Training Centre with a parked
BR 146, 64 vehicles; Frankfurt with ~19 moving AI vehicles per snapshot,
125 different vehicles over 150 s):

| Encoding | parked, B/snapshot | moving AI, B/snapshot | moving AI, 7 guests |
| --- | --- | --- | --- |
| JSON today | 10 740 | 10 205 | 4.9 Mbit/s |
| JSON + zstd per message | 2 802 | 3 704 | 1.8 Mbit/s |
| binary, full snapshot | 1 618 | 1 609 | 0.76 Mbit/s |
| binary deltas (reliable stream) | 21 | 190 | 0.09 Mbit/s |
| + zstd over the stream | 16 | 123 | 0.06 Mbit/s |
| + rate tiers (AI at 2 Hz) | 16 | 47 | 0.02 Mbit/s |

AI traffic is 96–98 % of today's bytes; the 35-character vehicle id alone
is 28 % of each vehicle entry. A full binary vehicle record is 25 bytes,
a delta record of a moving vehicle 10–14 bytes. AI at 2 Hz is off by up to
38 cm (p95) when extrapolated, 6.6 m at worst when braking; a 25 cm
dead-reckoning check fixes that for ~50 % more bytes. Missing in the data:
the player's train driving at speed (adds a few kbit/s).

**Decided (delegated, 2026-10-17):** vehicle and control-name tables once
(on join and change, indices in snapshots); the binary format above with
1 cm / 0.1° / 1 cm/s thresholds against what each guest was last sent;
the player's train every tick, other moving vehicles by dead reckoning
(25 cm), stationary ones only when they start; zstd level 3 over the
stream, flushed per message; a full keyframe on join and reconnect. On a
reliable stream this is ~0.1 Mbit/s for 7 guests, so host upload stops
mattering. Unreliable datagrams with acked baselines (Quake 3 style)
only if head-of-line stalls show up.

**Implemented (2026-10-18, `snap1`, `server/crates/tsw-coop-wire`, spec in
docs/07 "Binary snapshots").** Two changes against the decision:

- **Deflate instead of zstd.** Measured on the same recordings
  (`analyze.py`, rows `5c`/`6c`/`7c` in `results.txt`): raw deflate over the
  stream, sync-flushed and without the 4-byte tail, is smaller than zstd-3
  on these tiny messages (parked 10 vs 16 B, moving AI with dead reckoning
  60 vs 67 B); zstd's per-block framing costs more than its better
  matching wins. Deflate is also pure Rust (`flate2`/`miniz_oxide`), where
  zstd would mean cross-compiling C into the game DLL.
- **Dead reckoning for the train too**, with tight thresholds (1 cm, 0.1°,
  1 cm/s against the prediction) instead of "every tick": a train cruising
  at constant speed costs almost nothing, and the error stays at the
  quantum.

The relay decodes each sender's stream and re-encodes per receiver, so
"against what each guest was last sent" holds also for late joiners and
for snapshots the rate limit drops. Through the real code, host → relay →
guest (`cargo run --release -p tsw-coop-wire --example measure -- REC...`):

| Recording | JSON | `snap1` | 7 guests | guest error, max |
| --- | --- | --- | --- | --- |
| Training Centre, parked + shunting BR 146 | 9 698 B | 6 B | 0.003 Mbit/s | 0.8 cm |
| Frankfurt, ~19 AI moving | 10 205 B | 63 B | 0.03 Mbit/s | train 0.5 cm, AI 25.3 cm |

Keyframe (first snapshot on a stream): 2.3–2.6 KB.

Measure again after each step with the recorded host streams (`tsw-coop-emu`
replays and the relay's traffic counters): bytes per snapshot and per
second per guest, for a parked train, a running train with AI around, and
a busy station.

### Reaching the host

The host collects its candidate addresses and the guest tries all of them
at once, first answer wins (as OpenOMSI does):

1. LAN address (same network).
2. Overlay address (Tailscale, ZeroTier, Hamachi): the documented answer
   for CGNAT and strict NATs; zero extra code.
3. Port mapping on the host's router: UPnP-IGD / PCP / NAT-PMP through the
   `portmapper` crate, with a lease, removed on exit, logged; skipped when
   the router's external address is private (CGNAT). Needs a test under
   Proton (SSDP multicast).

   **Built (2026-10-18), UPnP-IGD only, with `igd-next` 0.17 instead of
   `portmapper`:** `portmapper` brings iroh's tokio stack, netwatch and
   metrics into the DLL; `igd-next` is blocking with no TLS (attohttpc,
   xmltree, url). 0.17 because 0.18 needs Rust 1.88. The DLL grew 4.9 →
   5.6 MB, mostly `url`'s IDNA tables. How it works: a thread searches for
   the router (3 s), asks for its external address, maps the host's port
   (same port outside) only when that address is public, with a 20 min
   lease renewed every 10 min (a router that only keeps permanent mappings
   gets lease 0), and removes it when hosting ends; a killed game leaves it
   to the lease. Hosting waits at most 4 s for it (the mod's init thread,
   not the game's); a mapping that comes later is kept but is not in that
   invite. The public address goes into the invite after `advertise`.
   `portmap = off` in `tswcoop.cfg` turns it off.
   Checked from Linux with `cargo run -p tsw-coop-client --example
   portmap` (search and address only, nothing mapped): the maintainer's
   Fritz!Box answers at `192.168.2.1:49000` and its external IPv4 address
   is public, so a mapping would reach the host. Then `-- 7441 15` (Linux,
   same PC): the router mapped 7441 to this machine at once and removed it
   on request; renewal (after 10 min) not yet seen. Fritz!OS only accepts
   mappings from devices with "allow independent port sharing" (Selbstständige
   Portfreigaben) switched on; otherwise the router refuses and the log
   says so. Under Proton: still to try whether the SSDP multicast gets out.
   **PCP, NAT-PMP and IPv6 pinholes built (2026-10-18)**, without new
   dependencies (`portmap/pcp.rs`, plain UDP to port 5351): when UPnP-IGD
   finds no router or the router refuses, the mod asks the default gateway
   (the UPnP router, the default route from `/proc/net/route`, which Proton
   reads through Wine's `Z:` drive, then `.1` of the LAN) with PCP MAP,
   and with NAT-PMP when the router answers PCP with "unsupported version"
   or not at all. A host with a global IPv6 address also asks the IPv6
   default gateway (`/proc/net/ipv6_route`) for a PCP pinhole, independent
   of the IPv4 mapping (DS-Lite: no IPv4 mapping possible, IPv6 open).
   Probing the maintainer's Fritz!Box: it answers PCP (version 2, ANNOUNCE
   succeeds) and replies to NAT-PMP with a PCP header, i.e. no NAT-PMP.
   `portmap -- pcp 7499 5` mapped TCP and UDP there over PCP (the router
   grants 120 s leases, renewed at half) and removed both. No IPv6 on this
   LAN, so the pinhole is tested against a fake server only. Not built:
   IGDv2 WANIPv6FirewallControl (PCP covers the Fritz!Box).
4. Manual port forward (the host enters its public address/port, or the
   mod learns the public address from STUN).
5. Hole punching (later): needs both sides' addresses at the same moment,
   i.e. a rendezvous. The master can be that rendezvous while it is up;
   without it, punching is unavailable and 1–4 remain. If built: iroh 1.0
   (it also offers dial-by-key with public relays run by n0, an optional
   third-party fallback the host can switch on).

### Transport (decided, delegated, 2026-10-17)

- **v1: keep WebSocket over TCP**, now to the host's in-process server,
  plus the `portmapper` crate (UPnP-IGD/PCP/NAT-PMP; needs a Proton test of
  SSDP multicast). Global IPv6 goes first in the invite: German DS-Lite and
  cable lines usually have it, and a Fritz!Box IPv6 opening or PCP makes
  the host reachable without NAT.
- **Next: iroh 1.x as the target transport**, after a spike. It is the only
  Rust QUIC stack tested under Wine/Proton (iroh#3901 fixed by #3902 with
  Wine CI; its UDP layer `noq-udp` detects Wine and drops the socket
  options Wine lacks; upstream quinn still fails under Wine, quinn#2587).
  Used with `Builder::empty()` (no n0 discovery, no relay), a persisted
  host key, port mapping on, our own ALPN; unreliable datagrams for
  snapshots, a stream for events. Needs a dedicated tokio runtime thread
  (not started from `DllMain`) and adds several MB to the DLL. Spike
  checks: build with our MSVC cross toolchain (`ring`), run under Proton,
  size.
  **Spike 1 done (2026-10-18, `dumps/tsw7-886/experiments/iroh-spike-1`):**
  iroh 1.3.0 builds for MSVC once `ring` gets clang-cl and llvm-lib with
  the xwin headers (9.6 MB exe). It runs under GE-Proton11-9: loopback
  and LAN both ways between a Proton and a Linux process, 50/50
  datagrams, RTT median 0.15–0.28 ms, stream echo fine. Binding takes
  about 1 s under Proton (3 ms on Linux). Still open: growth of the DLL
  itself, inside the game process, across the internet.
  **Built (2026-10-18), beside WebSocket, not instead of it:** the hosted
  relay serves QUIC on the game port's UDP side (`tsw-coop-relay` feature
  `iroh`, `src/quic.rs`), one bidirectional stream per player carrying
  the protocol's messages length-prefixed (07-protocol "Transports"), into
  the same per-connection pump as WebSocket. The host key file is now the
  endpoint's secret key (`tswcoop-host-secret.key`; the old
  `tswcoop-host.key` went into invites as it was, so it could not become
  a secret) and the invite carries its public key, so a guest's QUIC
  connection verifies the host. Guests race QUIC against the WebSocket
  addresses and keep whichever connects first (`transport =
  auto|websocket|quic`). With QUIC on, the router mapping covers the UDP
  port too (a refused UDP mapping is only logged). Each QUIC link has its own one-worker tokio
  runtime, so the client stays blocking. Datagrams for snapshots are not
  used yet: `snap1` is a delta stream that needs a reliable link, and a
  datagram variant needs keyframes. Tests: relay (QUIC and WebSocket
  players in one session, kick notice before the stream ends), client (a
  QUIC-only guest with a WebSocket guest; a wrong host key fails), and in
  the Windows DLL under Wine (a guest joins over QUIC). The release DLL
  is 14.5 MB with it (iroh without its own port mapper: ours maps UDP too).
  Not tried yet: in the game, across the internet.
- **No hole punching in v1.** iroh punches only over an already working
  path, normally a relay; without one, two NATed peers cannot meet. The
  NAS cannot be that relay (needs UDP and TCP 443 forwarded, Cloudflare
  Tunnel and Funnel carry no UDP, uplink 15 Mbit/s).
- **n0's public relays: host opt-in, off by default**, labelled "best
  effort, no guarantee": n0 offers them free but "for development and
  hobby use only", with unpublished rate limits and no SLA. When on, the
  relay URL goes into the invite and enables punching and a relayed
  fallback.
  **Built (2026-10-18):** `nat_relay = n0` (or any iroh relay's
  `https://` URL) in `tswcoop.cfg`. The host's endpoint connects to the
  relay at start (waits up to 5 s; without it the session works as
  before and the log says so), the home relay's URL goes into the
  invite's `relay` field, and a guest adds it to the host's addresses
  when dialling QUIC: iroh connects through the relay when no direct
  path answers and then tries to punch one. Tested with iroh's own test
  relay on loopback (`tsw-coop-client/tests/quic.rs`: the invite's only
  address is a closed port, the guest still joins over QUIC). Not yet
  tried: across two real NATs, in the game.

### Invite: self-contained, works with no server

- **Full invite** (copy and paste, a chat link): `tswcoop://join/<invite>`
  where `<invite>` is base32 (Crockford, checksum) of: format version,
  session secret (128 bit random, also the join credential), the host's
  key (32 bytes; with iroh this is its endpoint id, which also
  authenticates the host, so a guest cannot be redirected to an impostor),
  the candidate addresses (global IPv6, mapped public IPv4:port, LAN,
  overlay) and, only if the host opted in, a relay URL. About 100–150
  characters (~200 with a relay): fine to paste, not to type.
- While the master is up it also maps the host key to current addresses,
  so an invite with stale addresses keeps working.
- **Short code** (`K7Q-4ZM`, typeable): issued by the master for a session
  that registered there (public or not); resolves to the full invite. Only
  works while the master is up; the full invite always works.
- The invite reveals the host's addresses to whoever gets it. With direct
  connections that is unavoidable (a guest's game connects to that address
  anyway); a host who wants to hide its address uses an overlay or a
  self-hosted relay.
- When the host's public address changes, its old invites stop working;
  the mod shows a fresh one (and updates the master's short code).

### Session settings (host, in the mod settings)

| Setting | Meaning | Enforced by |
| --- | --- | --- |
| `public` | list on the master with all details (default off) | host |
| `name`, `motd` | ≤ 64 / ≤ 256 characters, control and bidi characters stripped | host, again by the master |
| `password` | optional; only guards joining | host |
| `max_players` | 2–8 (docs/08 limit), explicit "full" error | host |

Password check: challenge–response over the TLS connection to the host, a
few attempts per IP per minute, never logged. The session secret from the
invite is required in addition, so a public listing does not let strangers
into a password-less private session; for a public session the master
hands out the invite to anyone, which is the point of public.

### Query (on the host)

`GET /status` on the host's game port (HTTPS with the session's key, CORS
`*`), the OpenOMSI/Minecraft field set:

```json
{ "name": "blu's Rhein-Ruhr evening", "motd": "Freight only",
  "players": 3, "max_players": 8, "has_password": true, "public": true,
  "route": "/TrainingCentre/Map/TrainingCentreMap", "timetable": "freeroam",
  "game_build": 886, "mod_version": "0.1.0", "protocol": 0,
  "names": ["blu", "rd"], "started_at": "2026-10-17T19:00:00Z" }
```

For a private session it answers only with the session secret (from the
invite) and then without `public`-only extras. The in-game server list and
the invite preview ("3/8 players, password") query hosts directly.

### Master (NAS) and the Pages site

- Hosts of public sessions (and private ones that want a short code) send
  `POST /v1/heartbeat` to the master: the status document plus the full
  invite, on change (debounced to 5 s) and at least every 30 s; expiry
  after 90 s; an explicit close on session end. The master checks a new
  host by querying its `/status` itself once (stops fake listings) and
  rate-limits per IP.
- `GET /v1/sessions` (public list), `GET /v1/sessions/{code}` (details and
  invite), CORS for the Pages origin.
- **Built 2026-10-18** (`server/crates/tsw-coop-master`, host side
  `tsw-coop-client::announce`, game side `master =` setting): heartbeats
  with a token from the first answer (a later heartbeat without it is
  refused, so a public invite does not let others rewrite or close the
  listing), the `/status` check at public addresses only, 90 s expiry,
  4 sessions and a burst of 5 registrations (then one per 20 s) per
  address. Debouncing on change, the position set for the live map and the
  Pages site are not built yet; the master is not deployed. Traffic is a few KB per heartbeat and
  per page view, fine for the NAS uplink.
- Pages site: server list → session details (status fields, names, join
  button = `tswcoop://` link, copyable invite and short code). The browser
  cannot reach hosts itself (https page → plain address is blocked, see
  above), so all it shows comes from the master.
- Live map of a public session on the site: the host includes a thinned
  position set (players, its train, at most every 5 s) in the heartbeat;
  the site animates between them. Second-by-second live view is in-game
  and on the host's own local page; streaming every public session live
  through the NAS would not fit its uplink.
- If the master or the site is down: public listing and short codes are
  gone, everything else (invites, joining, playing, query from the game)
  works.

### Spectators (built 2026-10-18)

The host's game port serves `GET /spectate`, a page with the same map
code as the site (`site/livemap.js`, copied into the relay crate and kept
equal by a test), fed every 2 s by `GET /map` and `/status` on the same
port. A plain-`http://` page served by the host itself avoids the
https→http block above, and a private session's spectators need the
invite's secret, as for `/status`. The links (one per invite address) go
to `tswcoop-spectate.txt` and `/api/invite`.

### Steam "Join game" (built 2026-10-18)

The game ships Steamworks SDK 1.52 (`Engine/Binaries/ThirdParty/Steamworks/
Steamv152/Win64/steam_api64.dll`), whose flat API exports
`SteamAPI_SteamFriends_v017`, `SteamAPI_ISteamFriends_SetRichPresence`,
`SteamAPI_SteamApps_v008`, `SteamAPI_ISteamApps_GetLaunchCommandLine` and
`SteamAPI_RegisterCallback`. The mod looks them up in the already loaded
DLL (it never loads Steam itself) and:

- sets rich presence `connect` to the session's invite (hosting or
  joined; `steam_join = off` turns it off; an empty value removes only that
  key, never the game's own presence), so Steam friends see "Join game";
- at start, looks for a `tswcoop://join/` on the command line and in
  `GetLaunchCommandLine` (Steam starts a friend's game with the `connect`
  value there);
- while running, registers a hand-built `CCallbackBase` for
  `GameRichPresenceJoinRequested_t` (id 337: a `CSteamID`, then 256 bytes
  of connect string). MSVC orders the two `Run` overloads in reverse, so
  both vtable slots point to the same function, which only reads the data
  argument.

Either path leaves the invite as a join request, the same as a clicked
link. Open for the in-game test: whether the game pumps
`SteamAPI_RunCallbacks` (so registered callbacks fire; the start path does
not depend on it), and how Steam shows the button for the friend.

### Discord "Ask to Join" (2026-10-18)

`mod/native/src/discord.rs`, on with the setting `discord_app` (a Discord
application id; none exists for the project yet). The mod speaks Discord's
local RPC over `\\.\pipe\discord-ipc-0..9` (frames: `u32` opcode, `u32`
length, JSON; handshake `{"v":1,"client_id":…}`), the same protocol the
Game SDK uses, so no Discord library ships with the mod:

- `SET_ACTIVITY` for our process: "Hosting a co-op session" / "In a co-op
  session", "N of 8 players", a party (id from the host key, so everyone in
  the session shares it) and, as `secrets.join`, the invite without its
  scheme. Discord caps join secrets at 128 characters; later addresses are
  left out until it fits (the first, preferred one always stays).
- `SUBSCRIBE ACTIVITY_JOIN`: when a friend's request is accepted, Discord
  hands the friend's game the secret; it becomes a join request like a
  clicked link.

Unit-tested: framing, the activity and dispatch JSON, fitting the secret,
and the whole exchange against a fake Discord on a real named pipe under
Wine. Open: an application id, and the in-game test with two Discord
accounts (whether Discord still offers "Ask to Join" to an unverified
application).

## Open questions for the maintainer

- ~~Pages address~~: a `tsw-coop` GitHub organisation (`tsw-coop.github.io`),
  set up by the maintainer when the site is built (decided 2026-10-17).
- ~~Hole punching, n0 relays~~: decided above (not in v1; n0 relays as
  host opt-in, off by default).
- ~~Short codes for private sessions?~~ Decided 2026-10-17 (delegated):
  yes, but only on request. A private session's host may press "get a
  short code"; the master then stores just the invite and an expiry (no
  name, no players, never listed), drops it after 90 s without a
  heartbeat or on close, and rate-limits lookups per IP. Without that
  button the master never learns of a private session. The full invite
  stays the primary way to join.

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
