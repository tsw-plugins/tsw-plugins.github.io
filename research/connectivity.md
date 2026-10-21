---
name: connectivity
description: >-
  Background research behind tsw-coop's session design: NAT traversal options (UPnP-IGD, NAT-PMP, PCP, STUN, hole punching) with measured success rates, why systems keep relays, host upload cost; iroh in detail (tickets, relays and their terms, the Wine fix, footprint); server query and listing protocols (A2S, Minecraft, Satisfactory, BeamMP, KissMP, Factorio and others); browser limits for a Pages site; and how OpenOMSI does it, from its source.
game_build: n/a (networking research; no game involved)
created: 2026-10-21T20:15+0200
last_edited: 2026-10-21T20:15+0200
---

# Connectivity research: NAT, iroh, server queries, OpenOMSI (2026-10-17)

Questions for tsw-coop's hosted sessions: how do guests reach a host behind a home router, what
should carry the traffic, how do other games list and query sessions, and what did OpenOMSI (a
co-op mod for another simulator) build? Four agents researched this on 2026-10-17, three in
parallel in the evening and the iroh one an hour later. The **decisions** taken from it, and what
was built, are in [session-discovery.md](session-discovery.md); this note keeps the evidence. The
bandwidth measurements of snapshot encodings are in session-discovery.md too ("Keeping the traffic
small").

Markers: claims carry their source link; **[inferred]** marks the agents' own conclusions.

## NAT traversal

### Port mapping: UPnP-IGD, NAT-PMP, PCP

- UPnP-IGD finds the router by SSDP multicast (239.255.255.250:1900), reads an XML description, then
  sends SOAP `AddPortMapping`. NAT-PMP (RFC 6886) and its successor PCP (RFC 6887) are small UDP
  request/response protocols to the gateway's port 5351. PCP is the only one that can work with a
  cooperating carrier-grade NAT.
- A 2019 Trend Micro scan found UPnP enabled on 76 % of the routers it saw (one vendor's sample)
  ([Trend Micro](https://www.trendmicro.com/en_us/research/19/c/upnp-enabled-connected-devices-in-home-unpatched-known-vulnerabilities.html)).
- Port mapping does nothing behind CGNAT or DS-Lite (most mobile lines, a growing share of German
  cable and fibre). BeamMP's documentation says forwarding does not work at all under CGNAT
  ([BeamMP](https://docs.beammp.com/server/port-forwarding/)).
- UPnP has no authentication; CallStranger (CVE-2020-12695) showed exfiltration and DDoS
  amplification through it ([Help Net Security](https://www.helpnetsecurity.com/2020/06/09/cve-2020-12695/)).
  A mod that maps a port should use a lease and delete the mapping at session end.
- Rust crates: `igd-next` (maintained fork, MIT; [lib.rs](https://www.lib.rs/crates/igd-next)),
  `crab_nat` (PCP and NAT-PMP only, gateway supplied by the caller; [docs.rs](https://docs.rs/crab_nat)),
  `portmapper` (n0, used by iroh: UPnP, PCP and NAT-PMP with renewal on network change;
  [docs.rs](https://docs.rs/crate/portmapper/0.19.0)).
- Wine passes Winsock through to host sockets and Proton shares the host's network namespace, so
  SSDP and UDP to 5351 should work [inferred]; the only Wine UPnP bug found was fixed in 2009
  ([WineHQ #18423](https://www.winehq.org/pipermail/wine-bugs/2009-July/187454.html)).
  (What was built and tested on the maintainer's router is in session-discovery.md.)

### STUN, ICE, hole punching

- STUN (RFC 5389/8489) tells a client its public address. Punching works when the NAT maps
  endpoint-independently ("cone"); it fails when both sides are behind symmetric NATs, and usually
  behind CGNAT, corporate firewalls and some mobile carriers. ICE (RFC 8445) is the full
  procedure: gather host, reflexive and relayed candidates, exchange them over signalling, test
  pairs.
- Measured success:
  - ProbeLab (IMC '26): 4.4 million attempts across 85 000 networks, about **70 % ± 7 %**, counted
    after relay reservation and address discovery had succeeded; TCP and QUIC statistically
    indistinguishable ([arXiv 2510.27500](https://arxiv.org/html/2510.27500v1),
    [ProbeLab](https://probelab.io/publications/large-scale-measurement-of-nat-traversal-for-the-decentralized-web-a-case-study-of-dcutr-in-ipfs/)).
  - n0 claims about 90 % for iroh, which it calls anecdotal ([iroh docs](https://docs.iroh.computer/concepts/holepunching)).
  - An older UDP study: over 80 % success between punchable NATs, but only about 64 % of peers
    behind such NATs ([Halkes 2011](https://dl.ifip.org/IFIP-LNCS/hal-01597969v1)).
  - So 10–30 % of pairs always need a relay.
- CGNAT (NAT444) punching works only with endpoint-independent mapping
  ([IETF draft](https://datatracker.ietf.org/doc/draft-chan-tsvwg-eipf-cgnat/)).
- Rust options: iroh (below); libp2p (AutoNAT + DCUtR + circuit relay v2), much heavier, and its
  Rust implementation punched worse than Go's in the Punchr campaign
  ([ProbeLab](https://probelab.io/blog/can-libp2p-punch-through-nats/)); str0m (sans-IO WebRTC,
  peer-to-peer ICE less tested than its SFU use; [docs.rs](https://docs.rs/crate/str0m/0.23.1));
  webrtc-rs (large, maintenance status unconfirmed). Both WebRTC routes need STUN, TURN and
  signalling servers.

### Why every serious system keeps a relay

| System | Behaviour |
| :--- | :--- |
| Tailscale | starts on DERP, upgrades to direct, falls back to DERP on hard NATs ([docs](https://tailscale.com/docs/reference/connection-types)) |
| Steam Datagram Relay | P2P falls back to Valve relays and never reveals IPs; the open GameNetworkingSockets needs your own STUN, TURN and signalling ([Steamworks](https://partner.steamgames.com/doc/features/multiplayer/steamdatagramrelay)) |
| EOS P2P | punch first, then relay automatically ([coherence docs](https://docs.coherence.io/2.4/hosting/client-hosting/implementing-client-hosting/epic-online-services-eos-relay)) |
| iroh, libp2p | the relay is part of the design and also carries signalling |

The recurring reasons: the 10–30 % of pairs that cannot punch, hiding player IPs, and the need for
a rendezvous channel anyway. Game mods without that (BeamMP, Skyrim Together Reborn) use a plain
server with manual forwarding and a public list, and their forums are full of "cannot join"
threads. Players already use Tailscale, ZeroTier or Hamachi to get around CGNAT; a direct-address
mode works through them with no extra code.

### Host upload with direct connections

Star topology, 10 Hz to 7 guests, before any delta encoding:

| Snapshot | Host upload, direct (×7) | Host upload via a relay (×1) | Relay traffic per hour |
| :--- | :--- | :--- | :--- |
| 5 KB | about 2.8 Mbit/s | about 0.4 Mbit/s | about 1.3 GB |
| 20 KB | about 11.2 Mbit/s | about 1.6 Mbit/s | about 5 GB |

Many German DSL lines have 10–40 Mbit/s up, so 20 KB snapshots would saturate a host. A small EU
VPS includes about 20 TB of traffic a month. Direct paths save only about 10–40 ms per hop, which a
host-authoritative sim interpolating 10 Hz snapshots barely notices [inferred]. (This argument for
a relay was overtaken by the maintainer's decision that each host carries its own traffic, which
made delta snapshots a requirement; see session-discovery.md.)

## iroh

- **Versions:** iroh 1.0.0 released 2026-06-15, 1.3.0 on 2026-09-28 (crates.io). Based on QUIC; you
  dial a 32-byte Ed25519 endpoint id. It bundles a port mapper, hole punching and a relay that is
  always available as fallback ([1.0 rc blog](https://iroh.computer/blog/iroh-1-0-0-rc-1)).
- **Tickets:** an `EndpointTicket` is `endpoint` + base32 of postcard bytes: a version byte, the
  endpoint id and an address list (a relay URL, or about 9 bytes per IPv4 and 21 per IPv6 address)
  (iroh-tickets 1.0.0 source, `src/endpoint.rs`). Estimated length: about 77 characters for one IPv4
  address, about 140 for three IPv4 and one IPv6, about 190–200 with an n0 relay URL [inferred].
  The endpoint id can replace a TLS fingerprint, since iroh authenticates peers by it.
- **No relay, no discovery:** `Builder::empty()` gives no address lookup and `RelayMode::Disabled`;
  iroh then uses the given addresses directly ([Builder docs](https://docs.rs/iroh/1.3.0/iroh/endpoint/struct.Builder.html),
  [FAQ](https://docs.iroh.computer/about/faq)). `address_lookup()` takes custom services (a master
  could map ids to addresses), `external_addr()` advertises a manual forward, `portmapper_config()`
  controls the mapper.
- **Punching needs a working path first**, normally a relay: in n0's draft spec both ends first
  share a QUIC connection over a relay path, then exchange REACH_OUT frames
  ([QNT draft](https://datatracker.ietf.org/doc/draft-bruynooghe-n0-quic-nat-traversal/),
  [NAT traversal](https://docs.iroh.computer/concepts/nat-traversal)). Without a relay, two NATed
  peers cannot meet. n0's 0.96 notes listed "holepunching is not re-triggered when your network
  conditions change" as a regression; not confirmed fixed in 1.0
  ([0.96 blog](https://iroh.computer/blog/iroh-0-96-0-the-quic-multipaths-to-1-0)).
- **n0's public relays:** free to all iroh users but "suitable for development and hobby use only",
  no SLA, only the latest release supported ([public relays](https://docs.iroh.computer/iroh-services/relays/public));
  rate limits are unpublished and tuned per connection ([rate limiting](https://docs.iroh.computer/relays/rate-limiting)).
  Paid shared relays cost about $19 a month with a 5 MB/s limit.
- **Self-hosted `iroh-relay`:** needs a public IP, a DNS name and TLS (ACME built in); rate limiting
  is off by default (`[limits.client.rx] bytes_per_second`); access by allowlist or shared token
  ([README](https://github.com/n0-computer/iroh/blob/main/iroh-relay/README.md)). Docker image about
  15 MB. On the NAS it would need TCP 443 and a UDP port forwarded; Cloudflare Tunnel and Tailscale
  Funnel carry no UDP.
- **Wine and Proton:** "iroh does not work under Wine or Steam Proton" (bind failed with error
  10045; [iroh#3901](https://github.com/n0-computer/iroh/issues/3901)) was fixed by
  [iroh#3902](https://github.com/n0-computer/iroh/pull/3902) (merged 2026-04-07, with Wine and
  Proton in CI) together with [noq#392](https://github.com/n0-computer/noq/pull/392),
  [#414](https://github.com/n0-computer/noq/pull/414) and [#393](https://github.com/n0-computer/noq/pull/393).
  iroh now uses **noq**, n0's hard fork of quinn ([announcement](https://iroh.computer/blog/noq-announcement)).
  noq-udp 1.3.0 (`src/windows.rs`, read) detects Wine through `wine_get_version` in ntdll, turns
  off `IP_PKTINFO` there, treats ECN, DONTFRAG and PKTINFO as optional, ignores the missing
  `SIO_UDP_CONNRESET`, probes GSO and falls back to one segment, and still needs `WSARecvMsg`
  (which Wine has).
- **Upstream quinn is still broken under Wine:** [quinn#2532](https://github.com/quinn-rs/quinn/pull/2532)
  made ECN optional, but [quinn#2587](https://github.com/quinn-rs/quinn/issues/2587) (error 10045
  with quinn-udp 0.6.1) is open, and Wine reportedly still rejects `IP_RECVECN` (Wine bug 59427,
  unconfirmed).
- **Other report:** a Godot + Rust game hung inside rustls/ring's EdDSA on Windows when built for
  windows-gnu ([iroh#3968](https://github.com/n0-computer/iroh/issues/3968)); an MSVC build avoids
  that.
- **Footprint:** tokio, rustls, reqwest, noq, iroh-relay, netwatch and optionally portmapper, about
  70–90 crates. `ring` needs a C compiler when cross-compiling. Run its tokio runtime on a dedicated
  thread, never start it from `DllMain` [inferred]. (Measured later: see session-discovery.md,
  "Spike 1".)
- German DS-Lite and cable lines usually have native IPv6; a host's IPv6 address plus a router
  IPv6 opening is often the easiest route [inferred].

Alternatives compared: quinn with our own punch coordination (Wine-broken upstream; noq directly
avoids that); WebSocket/TCP plus port mapping and overlays (no Wine socket risk, but head-of-line
blocking on lossy links, and TCP punching is rarely attempted); str0m or webrtc-rs (WebRTC needs
offer/answer signalling, which a one-shot invite cannot carry).

## Server query and listing

### Query protocols

- **Valve A2S** (UDP): `A2S_INFO` (name, map, players, max, version, a password byte),
  `A2S_PLAYER`, `A2S_RULES`. The reply is much larger than the request, so spoofed queries made
  game servers DDoS reflectors; in December 2020 Valve added a challenge step (`S2C_CHALLENGE`, opt-in
  via `STEAM_GAMESERVER_A2S_INFO_REQUIRE_CHALLENGE=1`). The Steam master holds the list and filters
  (e.g. `\password\0`). ([Valve wiki](https://developer.valvesoftware.com/wiki/Server_queries), 403
  for the agent, read via search summary;
  [announcement](https://steamcommunity.com/discussions/forum/14/2974028351344359625/),
  [steam.py](https://steam.readthedocs.io/en/latest/api/steam.game_servers.html))
- **Minecraft Server List Ping** (TCP, game port): handshake with next state 1, status request; JSON
  reply with `version`, `players {max, online, sample[]}`, `description` (MOTD), `favicon` (64×64
  PNG data URI); optional ping/pong ([wiki](https://minecraft.wiki/w/Java_Edition_protocol/Server_List_Ping)).
- **Minecraft Query** (UDP, GameSpy4-compatible, `0xFEFD`): a challenge token bound to the client's
  address, all tokens invalidated about every 30 s; basic and full stat (full cached for 5 s); a
  wrong token gets no reply ([wiki](https://minecraft.wiki/w/Query)).
- **Satisfactory Lightweight Query API** (UDP): the server echoes a cookie and returns a small
  state with change counters telling the client when to refetch via HTTPS
  ([wiki](https://satisfactory.wiki.gg/wiki/Dedicated_servers/Lightweight_Query_API)).

### How games list sessions

| Project | Listing | Heartbeat / TTL | Code → session | Password | Abuse controls |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Steam / A2S | server registers with the Steam master; UDP query per server | Steam | IP:port | host checks; public flag only | challenge step |
| BeamMP | server POSTs `/heartbeat` over HTTPS (header `api-v: 2`) | after 5 s on change, else every 30 s; backends in failover order | IP:port; "private" only hides | `pass` flag only | auth key tied to a Discord account, keys per account limited |
| KissMP | server POSTs JSON to the master, which records the sender IP | TTL 10 s, pruned on list | IP:port | not listed | 10 ports per IP, name filter, exact version; never probes servers |
| Factorio | matchmaking API: create, heartbeat, remove | not documented | opaque `game_id` | host; `has_password` public | factorio.com account token |
| Valheim crossplay | PlayFab | PlayFab | 6-digit code, new per restart | host | platform account |
| Among Us | rooms on a server | | random 6 letters, scoped to one server | | |
| Skyrim Together Reborn | public list by name | not found | name/IP | a hoster guide says passworded servers are hidden (unverified) | not found |
| tModLoader | no master; Steam invites or IP | | Steam lobby | host | Steam |
| Magic Wormhole (pattern) | rendezvous server, one-shot | | number + words | the code is the secret; SPAKE2 allows one guess per code | |

Common pattern: hosts push heartbeats to a directory, the directory expires silent entries, only
the authority checks passwords, and the list carries a boolean. A design using only HTTPS has no
reflection problem.

Sources: [BeamMP heartbeat](https://raw.githubusercontent.com/BeamMP/BeamMP-Server/master/src/THeartbeatThread.cpp),
[BeamMP auth key](https://xgamingserver.com/docs/beammp/auth-key),
[KissMP master](https://raw.githubusercontent.com/TheHellBox/KISS-multiplayer/master/kissmp-master/src/main.rs),
[Factorio](https://wiki.factorio.com/Matchmaking_API), [Valheim](https://low.ms/blog/valheim-crossplay-join-codes),
[Among Us](https://hindenburg.js.org/pages/plugins/api/game-codes.html),
[Skyrim Together](https://shockbyte.com/billing/knowledgebase/838),
[tModLoader](https://supercraft.host/wiki/terraria/tmodloader_multiplayer_not_working/),
[Magic Wormhole](https://magic-wormhole.readthedocs.io/en/latest/welcome.html). Skyrim Together and
Valheim details come from hosting-company guides, not official docs.

### Encoding the address in the code

IPv4 plus port is 48 bits: 10 characters of Crockford base32, or four to five words from a
2048-word list. It needs no server, but it is the host's IP lightly disguised, breaks when the IP
or port changes, does not work behind NAT, and does not fit IPv6. Opaque directory codes (5–6
characters, scoped to live sessions) hide addresses and can be revoked, but need a directory.

### What a GitHub Pages page can reach

- Mixed content: an `https://` page cannot `fetch()` an `http://IP` address, and `ws://` to a public
  host is blocked; loopback is the exception ([MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content)).
- Chrome 142 shipped Local Network Access: a permission prompt for public → private or loopback
  requests, replacing the abandoned Private Network Access preflight; WebSockets not yet gated
  ([Chrome](https://developer.chrome.com/blog/local-network-access)).
- Arbitrary hosts send no CORS headers and have no TLS certificates.
- So everyone puts one HTTPS API with CORS in between, and the static page reads only that.

## OpenOMSI (from its source, HEAD `44c11460`, 2026-10-17)

Paths relative to `/run/media/system/Data/Projects/openOMSI`.

- **Join code** `OMSI-XXXX-XXXX-…`: alphabet without 0, 1, I, O, case-insensitive, CRC-16
  (`crates/omsi-net/src/lib.rs:161-165`, `374-410`). It packs a 48-bit session id (shuffled by
  `mix48`), the protocol version, the port and 1–3 IPv4 addresses XORed with a mask derived from the
  session id (`lib.rs:209`, `271-304`). The mask comes from bytes in the code itself, so **every
  code decodes to the host's LAN, VPN and public addresses**. 24 characters for one address, 31 or
  37 for two or three. The session id is a `RandomState` hash of time and pid, not a CSPRNG
  (`lib.rs:508-524`).
- **ntfy.sh as rendezvous** (`crates/omsi-net/src/bridge.rs`): topic `omsi2rw-` + hex of 12 bytes of
  SHA-256 over the session id (`:83-87`), `-c` for the joiner. Posts `H - <addrs>` / `C - <addrs>`
  (up to 8) and `W 0 <tunnel url>`, each with a 16-byte truncated HMAC keyed from the session id
  (`:95-115`). **Not encrypted**: anyone with the code or the topic reads the host's and every
  joiner's IP. Polling: host reads every 6 s and posts on change or every 15 min; client posts
  every 10 s and reads every 2 s for 90 s; backoff 10 s doubling to 300 s. A comment
  (`:276-280`) records that ntfy.sh's rate limits once locked hosts out.
- **Official server announcement**: `OFFICIAL <url> <unix time>` every 5 min, Ed25519-signed, accepted
  if at most 40 min old (`official.rs:21`, `55-69`). Sound.
- **No master or browser**: a local `servers.json` with the official server first
  (`crates/omsi-launcher-api/src/lib.rs:363-378`); a planned lobby topic (`docs/SERVER.md:154`); a
  Cloudflare Worker that only counts players. LAN discovery by UDP broadcast `DISCOVER|<proto>`.
- **Query**: HTTP `GET /status` on game port + 10 (name, motd, map, players, max_players, version,
  icon flag, time, weather, password flag, protocol, counts; `ws.rs:28-61`, `145-162`), `GET /icon.png`,
  optional `GET /players`, `POST /admin` (localhost, challenge-response password).
- **No join password** (`password` hard-coded false, `crates/omsi-app/src/server.rs:30`); the
  configured `max_players` is advertised but not enforced, only `MAX_PEERS = 32` (`lib.rs:140`).
- **NAT traversal**: STUN to Google and Cloudflare from the game socket every 20 s (`bridge.rs:25`,
  `174-186`, hand-parsed); hand-written UPnP with a 1 h lease renewed every 20 min, skipped behind
  CGNAT (`:463-532`); simultaneous punching coordinated through ntfy (`\xFFPUNCH` every 0.25 s for
  15 s; symmetric NAT not handled); last resort a downloaded, hash-checked `cloudflared` quick
  tunnel carrying UDP datagrams as WebSocket messages (`tunnel.rs`). No IPv6.

Worth copying: trying all candidates at once, the signed announcement, the `/status` field set.
Not worth copying: free third-party services in the join path, and a code that reveals the host's
address.

## Open (as of this research)

- SSDP multicast and PCP under Proton (tested afterwards; see session-discovery.md).
- iroh's size inside the game DLL and across real NATs (partly measured afterwards).
