# Features: everything asked for or brainstormed, and where each stands

Every feature the maintainer asked for or that we decided on together
(conversation 2026-10-17/18, `docs/08-concept.md`,
`docs/research/session-discovery.md`), with its state. Kept up to date as
work lands; the evidence for a mark is in the linked doc, test or commit.

- **Started / Finished**: code exists / does what was asked.
- **Harness**: tested without the game: Rust or Lua unit/integration
  tests, the emulator (`tsw-coop-emu`), fake clients, Wine tests of the DLL
  (`mod/native/build.sh`).
- **In game**: verified in the running game (TSW 7 build 886, Proton).
  Guest-side features need a second game as guest; until one exists they
  are verified with emulated or bot peers against the real game, which the
  description says.

✅ yes · 🟡 partly · ❌ no · ➖ not applicable (tooling or research)

Last full audit: 2026-10-18 (two read-only audits of code, tests, docs and
git history).

## Tooling and research (asked for along the way)

| Feature | Description | Started | Finished | Harness | In game |
| :--- | :--- | :---: | :---: | :---: | :---: |
| UE4SS zDEV + dumps | UE4SS zDEV in the game, object/UHT/CXX dumps and usmap committed (`dumps/tsw7-886/`) | ✅ | ✅ | ➖ | ✅ |
| Game lifecycle by code | `tswup`: launch the game and load a scenario, timetable or path without menus (`scripts/tswup`, `play.lua`); Free Roam cannot be started yet | ✅ | 🟡 | 🟡 | ✅ |
| Drive status command | `tswcmd drive diag`: everything that matters for driving the current train, with a verdict (Lua) | ✅ | ✅ | ✅ | ✅ |
| Drive "start" command | `tswcmd drive ready/go/stop`: any state to drivable / moving (Lua, `docs/research/driving-trains.md`) | ✅ | ✅ | ✅ | ✅ |
| Drive spawn command | spawn a train and make it drivable in one command (Lua) | ✅ | ✅ | ❌ | ✅ |
| Lua lint/test workflow | `scripts/lint-lua`: luac, luacheck, offline tests with a fake UE4SS (build-box) | ✅ | ✅ | ✅ | ➖ |
| Headless client emulator | `tsw-coop-emu`: scripted network peers and scenarios for manual and automated tests | ✅ | ✅ | ✅ | ✅ |
| Fake player crowd | `crowd`/`walker` bots that walk, run, jump, crouch and sit around the host | ✅ | ✅ | ✅ | ✅ |
| Toast notifications | game notifications for the mod (Lua and Rust `toast.rs`) | ✅ | ✅ | 🟡 | ✅ |
| Runtime text menu | debug menu built at runtime (F9, Lua only; Rust has the UMG helpers but no menu) | ✅ | 🟡 | ✅ | ✅ |
| Spawned train simulation | research: how spawned trains get their simulation (boarding turns it on) | ✅ | ✅ | ➖ | ✅ |
| AI takeover probes | research: take over and hand back AI trains (`docs/research/interfaces.md`) | ✅ | ✅ | ➖ | ✅ |
| Performance on Linux | research and fixes for slow motion with many vehicles (`docs/research/performance.md`) | ✅ | ✅ | ➖ | ✅ |
| Cheap telemetry in Rust | host capture of train, consists, clock in the Rust DLL, 3 ms per capture | ✅ | ✅ | 🟡 | ✅ |
| Rust DLL instead of C++ | the game-side mod as a Rust `dwmapi.dll` proxy that chain-loads UE4SS | ✅ | ✅ | ✅ | ✅ |
| Game state journal | what the game did (loads, crashes) as a journal (`journal.rs`, `crashes.rs`) | ✅ | ✅ | ❌ | ✅ |
| Skip intro | skip the start-up videos (`skip_intro.rs`) | ✅ | ✅ | ❌ | ✅ |
| Dev API | web dev endpoints: simulated keys, quit, console, used for code-driven tests (`devapi.sh`) | ✅ | ✅ | ✅ | ✅ |

## Players and the world

| Feature | Description | Started | Finished | Harness | In game |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Player bodies | remote players as walking bodies: walk, run, jump, crouch, sit, removed when silent | ✅ | ✅ | ✅ | ✅ (bots) |
| Real crouch animation | male hiker crouch (`CH_M_hiker1`), bench sit as fallback | ✅ | ✅ | ❌ | ❌ |
| Jump on Space | optional jump on Space instead of photo mode (photo mode to O); Lua only, Rust sends the jump state from vertical speed | ✅ | 🟡 | 🟡 | 🟡 |
| Jump synced in MP | other players see a player jump | ✅ | ✅ | ✅ | ✅ (bots) |
| Name tags | name, Dovetail Live level and country above each body, facing the camera, scaled with distance | ✅ | ✅ | ✅ | ✅ |
| TAB scoreboard | names, ids, levels, flags, host/you; refused and banned joins section | ✅ | ✅ | ✅ | 🟡 (refused section not yet) |
| Countries from IP | the host derives countries from addresses (GeoLite2 from GitHub), clients' claims ignored | ✅ | ✅ | ✅ | ✅ |
| Own assets | flags and the tsw-coop logo as PNGs loaded at runtime (no pak) | ✅ | ✅ | ❌ | ✅ |
| Main menu badge | "tsw-coop loaded" logo on the main menu | ✅ | ✅ | ❌ | ✅ |
| In-game chat | F6 chat box, toasts, chat panel in the web view, through the relay | ✅ | ✅ | ✅ | 🟡 (bot chat in the log only) |
| Host's train on guests | the host's consist drawn on guests as view actors following its snapshots | ✅ | ✅ | 🟡 | ✅ (replayed host) |
| AI traffic on guests | the host's AI trains drawn on guests | ✅ | 🟡 (on the web map only) | ❌ | ❌ |
| Guest AI suppression | guests switch off their own AI, dispatcher, clock and weather | ❌ | ❌ | ❌ | ❌ |
| Signals, switches, time, weather | host-authoritative and replicated to guests | ❌ | ❌ | ❌ | ❌ |
| One session, any route | a guest on another route is told where the host is; the host refuses its driving | ✅ | ✅ | ✅ | ❌ |
| Game build and timetable | the game's build number and the world's timetable in `hello` and rooms | ✅ | ✅ | ✅ | ❌ |

## Driving together

| Feature | Description | Started | Finished | Harness | In game |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Guest drives the host's train | free seat = first come (F8), the host applies the guest's lever values, the host reclaims (BR 146) | ✅ | ✅ | ✅ | 🟡 (emulated guest) |
| Guest cab view | the driving guest looks out of the ghost cab | ✅ | ✅ | ❌ | 🟡 (emulated host) |
| Stop on a lost driver | the host's train stops when the driving guest leaves or is silent for 4 s | ✅ | ✅ | ✅ | ❌ |
| Brake when the host leaves | emergency brake when the host leaves the cab with nobody driving | ❌ | ❌ | ❌ | ❌ |
| Other train classes | control tables beyond the BR 146 | ❌ | ❌ | ❌ | ❌ |

## Sessions, joining, discovery

| Feature | Description | Started | Finished | Harness | In game |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Host → clients | the relay runs inside the host's game; the host joins over loopback | ✅ | ✅ | ✅ | ✅ |
| Standalone relay | rooms, fan-out, late-join replay (`tsw-coop-relay`) | ✅ | ✅ | ✅ | ✅ |
| Invite | `tswcoop://join/…`: secret, host key, addresses; log, file, `/api/invite` | ✅ | ✅ | ✅ | 🟡 (bots joined) |
| Join proof and password | challenge–response with the invite secret and optional password | ✅ | ✅ | ✅ | 🟡 (proof yes, password no) |
| Max players | 2–8, explicit "full" refusal | ✅ | ✅ | ✅ | 🟡 (8 joined, "full" not seen) |
| Status query | `GET /status` on the game port: name, MOTD, players, names (public) | ✅ | ✅ | ✅ | ❌ |
| Public / private | public = everything listed; private = nothing anywhere; password guards joining | ✅ | ✅ | ✅ | ❌ |
| Master server | heartbeats, list, short codes, `/status` verification (`tsw-coop-master`) | ✅ | ✅ | ✅ | ❌ |
| Master on the NAS | Docker container on the NAS behind the Cloudflare Tunnel / Tailscale | ❌ | ❌ | ❌ | ❌ |
| Server browser (Pages) | GitHub Pages: public server list, session details, join link | ❌ | ❌ | ❌ | ❌ |
| Live map (Pages) | enter a session id on the Pages site, see the map and players | ❌ | ❌ | ❌ | ❌ |
| Local web view | live map, players, chat, host controls from the mod's web server (SSE) | ✅ | ✅ | 🟡 (mock in a browser) | 🟡 (dev endpoints yes, page no) |
| Kick and ban | at runtime from the web view, bans from the config, refused list | ✅ | ✅ | ✅ | 🟡 (config ban only) |
| Server log | joins, leaves, timeouts, refusals (banned, password, full, mismatch), chat into the mod log | ✅ | ✅ | 🟡 | ✅ |
| Version compatibility | one protocol, mod version and game build per session; mismatches refused (`error{code:"version"}`) with both versions named, no retry | ✅ | ✅ | ✅ | ❌ |
| Entitlement check | guests report route/loco DLC; the host refuses joins lacking the route or a spawned vehicle | ❌ | ❌ | ❌ | ❌ |
| Mod/data sync | host → guest sync of mod version/config and data-only content | ❌ | ❌ | ❌ | ❌ |
| tswcoop:// links | clicking a `tswcoop://join/` link opens the game and joins | ❌ | ❌ | ❌ | ❌ |
| Steam invites | Steam overlay invites / rich presence `connect` | ❌ | ❌ | ❌ | ❌ |
| Discord invites | invites through Discord | ❌ | ❌ | ❌ | ❌ |
| Spectators | HTTP-API-only clients join as map spectators | 🟡 (relay presence mode) | ❌ | 🟡 | ❌ |
| Reconnect | lost connections retried with backoff, state restored | ✅ | ✅ | ✅ | ❌ |
| Up to 8 players | session limit 8 | ✅ | ✅ | ✅ | ✅ |
| Installer | install the mod into the game | ❌ | ❌ | ❌ | ❌ |

## Network and traffic

| Feature | Description | Started | Finished | Harness | In game |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Small sync traffic | `snap1` binary deltas, dead reckoning, stream deflate | ✅ | ✅ | ✅ | 🟡 (in use, not measured in game) |
| UPnP port mapping | the host's router forwards the port (TCP, and UDP with QUIC) | ✅ | ✅ | 🟡 | 🟡 (TCP yes, UDP no) |
| PCP / NAT-PMP / IPv6 pinholes | other port-mapping protocols | ❌ | ❌ | ❌ | ❌ |
| QUIC transport | iroh QUIC beside WebSocket, host key verified, dial race | ✅ | ✅ | ✅ | ❌ |
| Hole punching | NAT traversal when neither side can be reached directly (master as rendezvous) | ❌ | ❌ | ❌ | ❌ |
| Works without central services | private sessions need only the host and the invite | ✅ | ✅ | ✅ | ✅ |

## Anticheat

| Feature | Description | Started | Finished | Harness | In game |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Host validates guests | rate limits, size limits, schema, finite in-bounds values; no spawn/teleport requests exist | ✅ | ✅ | ✅ | ❌ |
| Guests check the host | every relayed message is checked (`tsw_coop_proto::sanity`, client `guard.rs`): bad numbers, oversize, malformed, echoes and duplicates are dropped, teleports counted; 20 bad messages in 10 s mute a guest, or make us leave a host | ✅ | ✅ | ✅ | ❌ |
