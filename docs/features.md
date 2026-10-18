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
| Drive spawn command | spawn a train and make it drivable in one command (Lua, `spawn.lua`) | ✅ | ✅ | ✅ (`test_spawn`: blocked point skipped, board, ready, no clear track, refusal unless forced) | ✅ (before the move into `spawn.lua`; unchanged code) |
| Lua lint/test workflow | `scripts/lint-lua`: luac, luacheck, offline tests with a fake UE4SS (build-box) | ✅ | ✅ | ✅ | ➖ |
| Headless client emulator | `tsw-coop-emu`: scripted network peers and scenarios for manual and automated tests | ✅ | ✅ | ✅ | ✅ |
| Fake player crowd | `crowd`/`walker` bots that walk, run, jump, crouch and sit around the host | ✅ | ✅ | ✅ | ✅ |
| Toast notifications | game notifications for the mod (Lua and Rust `toast.rs`) | ✅ | ✅ | ✅ (Lua `test_toast` against a fake dispatcher; the Rust port's icon paths in `mod_assets`) | ✅ |
| Runtime text menu | debug menu built at runtime (F9, Lua only; Rust has the UMG helpers but no menu) | ✅ | 🟡 | ✅ | ✅ |
| Spawned train simulation | research: how spawned trains get their simulation (boarding turns it on) | ✅ | ✅ | ➖ | ✅ |
| AI takeover probes | research: take over and hand back AI trains (`docs/research/interfaces.md`) | ✅ | ✅ | ➖ | ✅ |
| Performance on Linux | research and fixes for slow motion with many vehicles (`docs/research/performance.md`) | ✅ | ✅ | ➖ | ✅ |
| Cheap telemetry in Rust | host capture of train, consists, clock in the Rust DLL, 3 ms per capture | ✅ | ✅ | ✅ (room from the world package, sweep slices cover every slot, forward speed; `tswcoop_core` capture tests) | ✅ |
| Rust DLL instead of C++ | the game-side mod as a Rust `dwmapi.dll` proxy that chain-loads UE4SS | ✅ | ✅ | ✅ | ✅ |
| Game state journal | what the game did (loads, crashes) as a journal (`journal.rs`, `crashes.rs`) | ✅ | ✅ | ✅ (clock stop/jump, motion, widget diff, crash report parsing and once-only reporting) | ✅ |
| Skip intro | skip the start-up videos (`skip_intro.rs`) | ✅ | ✅ | ✅ (screen wait/advance decision, last screen from the array) | ✅ |
| Dev API | web dev endpoints: simulated keys, quit, console, used for code-driven tests (`devapi.sh`) | ✅ | ✅ | ✅ | ✅ |

## Players and the world

| Feature | Description | Started | Finished | Harness | In game |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Player bodies | remote players as walking bodies: walk, run, jump, crouch, sit, removed when silent | ✅ | ✅ | ✅ | ✅ (bots) |
| Real crouch animation | male hiker crouch (`CH_M_hiker1`), bench sit as fallback | ✅ | ✅ | ✅ (`mod_assets`: the crouch and every other asset path the mod loads exist in the installed game's paks) | ❌ |
| Jump on Space | optional jump on Space instead of photo mode (photo mode to O); Lua only, Rust sends the jump state from vertical speed | ✅ | 🟡 | 🟡 | 🟡 |
| Jump synced in MP | other players see a player jump | ✅ | ✅ | ✅ | ✅ (bots) |
| Name tags | name, Dovetail Live level and country above each body, facing the camera, scaled with distance | ✅ | ✅ | ✅ | ✅ |
| TAB scoreboard | names, ids, levels, flags, host/you; refused and banned joins section | ✅ | ✅ | ✅ | 🟡 (refused section not yet) |
| Countries from IP | the host derives countries from addresses (GeoLite2 from GitHub), clients' claims ignored | ✅ | ✅ | ✅ | ✅ |
| Own assets | flags and the tsw-coop logo as PNGs loaded at runtime (no pak) | ✅ | ✅ | ✅ (`mod_assets`: logo and 250 flags are PNGs named as the scoreboard asks) | ✅ |
| Main menu badge | "tsw-coop loaded" logo on the main menu | ✅ | ✅ | ✅ (screen preference test, logo PNG size) | ✅ |
| In-game chat | F6 chat box, toasts, chat panel in the web view, through the relay | ✅ | ✅ | ✅ | 🟡 (bot chat in the log only) |
| Host's train on guests | the host's consist drawn on guests as view actors following its snapshots | ✅ | ✅ | ✅ (consist reconcile keeps unchanged cars, follow/extrapolate/snap, facing, spawn transform; client tests deliver consist and snapshots) | ✅ (replayed host) |
| AI traffic on guests | the host's AI trains drawn on guests: the host sends every other vehicle's view class (`traffic` events, changes first, then the rest in turn), positions come with its snapshots (the 64 vehicles nearest the host); a guest draws view-actor ghosts within 3 km of its pawn, at most 150, and drops vehicles unseen for 15 s (`ghost/traffic.rs`) | ✅ | ✅ | 🟡 (entry and distance tests; spawning only in game) | ❌ |
| Guest AI suppression | guests switch off their own AI, dispatcher, clock and weather: their own timetable's AI vehicles are hidden without collision (not destroyed, so the timetable stays intact; shown again after the session, `quiet.rs`), the host's clock, weather, junctions and signals override their own | ✅ | ✅ | 🟡 (hide decision test; engine side only in game) | ❌ |
| Signals, switches, time, weather | host-authoritative and replicated to guests; time: a guest more than 30 s off the host's snapshot `clock` sets its world clock to it (`clock_sync.rs`, `SetDateTime`); weather: the host announces its weather scenario class (`weather` event), a guest switches to it (`weather.rs`, `OverrideScenario`); switches and signals: the host sends junction lever states and signal aspects by object path (`junctions`, `signals` events: changes first, the rest in turn), a guest sets what differs (`world.rs`) | ✅ | ✅ | ✅ (clock, weather and resend-order tests; engine calls only in game) | ❌ |
| One session, any route | a guest on another route is told where the host is; the host refuses its driving | ✅ | ✅ | ✅ | ❌ |
| Game build and timetable | the game's build number and the world's timetable in `hello` and rooms | ✅ | ✅ | ✅ | ❌ |

## Driving together

| Feature | Description | Started | Finished | Harness | In game |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Guest drives the host's train | free seat = first come (F8), the host applies the guest's lever values, the host reclaims (BR 146) | ✅ | ✅ | ✅ | 🟡 (emulated guest) |
| Guest cab view | the driving guest looks out of the ghost cab | ✅ | ✅ | ✅ (stay/leave and car choice tests, rotator layout) | 🟡 (emulated host) |
| Stop on a lost driver | the host's train stops when the driving guest leaves or is silent for 4 s | ✅ | ✅ | ✅ | ❌ |
| Brake when the host leaves | the train the host leaves (out of the cab for 2 s, or into another train at once) gets power off and full train brake; a remote driver loses the seat with it (`drive/leave.rs`) | ✅ | ✅ | ✅ (decision tests incl. a 2 s grace for camera changes) | ❌ |
| Other train classes | guests drive by role (`power`, `brake`, `reverser`); the host picks each role's lever per class (BR 146, Class 66, Doppelstock cab car, 8F steam, Class 323 combined handle, from the object dump) and sends its range; from the rear cab (the pawn's interaction environment, `VehicleSide`) its own `_B` levers | ✅ | ✅ | ✅ (lever choice per class and cab end, ranges, combined-handle stop) | ❌ |

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
| Master on the NAS | `https://tsw-coop-master.minopia.de`: Docker image (`server/Dockerfile`) on the NAS, loopback port behind the Cloudflare Tunnel, real client address from the tunnel's `X-Forwarded-For` | ✅ | ✅ | ✅ (deployed; list, CORS, refusal and the forwarded address checked through the tunnel) | ❌ |
| Server browser (Pages) | static site (`site/`): public session list, session page with details, invite, copy and join link; `?master=` for other masters | ✅ | ✅ | ✅ (local master, `headless_host`, crowd bots, browser) | ❌ |
| Live map (Pages) | session code → page with the players and the host's train on a map, moving between the host's 5 s map posts (`POST /v1/map`, public sessions only) | ✅ | ✅ | ✅ (`announce` test, browser) | ❌ |
| Local web view | live map, players, chat, host controls from the mod's web server (SSE) | ✅ | ✅ | 🟡 (mock in a browser) | 🟡 (dev endpoints yes, page no) |
| Kick and ban | at runtime from the web view, bans from the config, refused list | ✅ | ✅ | ✅ | 🟡 (config ban only) |
| Server log | joins, leaves, timeouts, refusals (banned, password, full, mismatch), chat into the mod log | ✅ | ✅ | ✅ (filter and one line per event through a capturing subscriber) | ✅ |
| Version compatibility | one protocol, mod version and game build per session; mismatches refused (`error{code:"version"}`) with both versions named, no retry | ✅ | ✅ | ✅ | ❌ |
| Entitlement check | guests report their installed DLC packs (pak indices, cached); the host refuses joins lacking the pack of its route or of a car of its train (`error{code:"entitlement"}`); guests already in when the host changes train get a non-fatal `entitlement` warning (toast) and stay; AI trains need nothing (a ghost whose class is not installed is simply not drawn); not yet: Steam licence check (`BIsDlcInstalled`, needs a pack → app id mapping) | ✅ | 🟡 | ✅ (pak reader on this machine's DLC, relay and client tests, incl. the in-session warning) | ❌ |
| Mod/data sync | host → guest sync of mod version/config and data-only content; so far a version refusal names the download page | 🟡 | ❌ | ❌ | ❌ |
| tswcoop:// links | clicking a `tswcoop://join/` link starts the game (Steam) if needed and joins, or switches a running game to that session; Windows: the mod registers `rundll32 dwmapi.dll,JoinLink`; Linux desktops: `scripts/tswcoop-link --install` | ✅ | ✅ | ✅ (Wine tests, real `rundll32` in Wine, script with a fake game folder) | ❌ |
| Steam invites | Steam friends get "Join game": the invite as rich presence `connect` through the game's own Steamworks (flat API, SDK 1.52); a friend's game started by Steam finds it on its command line, a running one gets it by callback (`GameRichPresenceJoinRequested_t`); `steam_join = off` turns it off | ✅ | ✅ | ✅ (Wine tests with a fake steam_api: registration, callback dispatch through the vtable, rich presence, launch line) | ❌ |
| Discord invites | invites through Discord | ❌ | ❌ | ❌ | ❌ |
| Spectators | watch a session without the game: `GET /spectate` on the host's game port is a live map page (players, the host's train, every 2 s) fed by `GET /map` and `/status`, the invite secret guarding private sessions; links in `tswcoop-spectate.txt` and `/api/invite`; clients may also join in `presence` mode | ✅ | ✅ | ✅ (relay test over a real socket, the page in a browser against `headless_host`) | ❌ |
| Reconnect | lost connections retried with backoff, state restored | ✅ | ✅ | ✅ | ❌ |
| Up to 8 players | session limit 8 | ✅ | ✅ | ✅ | ✅ |
| Installer | install the mod into the game: `install.bat` (Windows, `rundll32 dwmapi.dll,Install`: finds the game via Steam's libraries, keeps UE4SS's dwmapi.dll, starter `tswcoop.cfg`, registers links) and `scripts/install-tswcoop` (Linux/Proton, also `--uninstall`, `--check`, checks the launch options) | ✅ | ✅ | ✅ | ❌ |

## Network and traffic

| Feature | Description | Started | Finished | Harness | In game |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Small sync traffic | `snap1` binary deltas, dead reckoning, stream deflate | ✅ | ✅ | ✅ | 🟡 (in use, not measured in game) |
| UPnP port mapping | the host's router forwards the port (TCP, and UDP with QUIC) | ✅ | ✅ | ✅ (fake IGD: permanent-lease fallback, TCP+UDP mapped and removed on drop, no mapping behind NAT; fake PCP/NAT-PMP routers) | 🟡 (TCP yes, UDP no) |
| PCP / NAT-PMP / IPv6 pinholes | PCP and NAT-PMP at the default gateway when UPnP-IGD gives no mapping; an IPv6 firewall pinhole by PCP when the host has a global IPv6 address | ✅ | ✅ | ✅ (fake routers; PCP mapped and removed on the real Fritz!Box; IPv6 only against a fake, no IPv6 here) | ❌ |
| QUIC transport | iroh QUIC beside WebSocket, host key verified, dial race | ✅ | ✅ | ✅ | ❌ |
| Hole punching | NAT traversal when the host cannot be reached directly: host opt-in `nat_relay = n0` (or an own iroh relay); the relay goes into the invite, guests meet the host there and iroh punches a direct path (decided: relay as rendezvous, not the master) | ✅ | ✅ | ✅ (iroh test relay, guest with no reachable address) | ❌ |
| Works without central services | private sessions need only the host and the invite | ✅ | ✅ | ✅ | ✅ |

## Anticheat

| Feature | Description | Started | Finished | Harness | In game |
| :--- | :--- | :---: | :---: | :---: | :---: |
| Host validates guests | rate limits, size limits, schema, finite in-bounds values; no spawn/teleport requests exist | ✅ | ✅ | ✅ | ❌ |
| Guests check the host | every relayed message is checked (`tsw_coop_proto::sanity`, client `guard.rs`): bad numbers, oversize, malformed, echoes and duplicates are dropped, teleports counted; 20 bad messages in 10 s mute a guest, or make us leave a host | ✅ | ✅ | ✅ | ❌ |
