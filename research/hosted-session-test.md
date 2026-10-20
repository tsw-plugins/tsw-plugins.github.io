---
name: hosted-session-test
description: >-
  First in-game hosted session with seven bots: what works (GeoIP flags, name tags, TAB scoreboard, menu badge, server log), four bugs found and fixed, the GC rule for cached objects.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T03:32+0200
last_edited: 2026-10-20T05:45+0200
---

# Hosted session with a crowd, in game (2026-10-18)

First runs of a session hosted inside the game (`host = 7441`) with seven
`crowd` bots (`server/crates/tsw-coop-client/examples/crowd.rs`) walking,
running, jumping, crouching and sitting around the host in the Training
Centre. Driven entirely by code: `devapi.sh ttc`, `devapi.sh key TAB 6`,
`crowd <invite> - 7 <seconds>`, screenshots of the game window.

## What works (seen in game)

- **Hosting:** the game's own client joins its server over loopback; the
  Fritz!Box maps the port (UPnP) and the invite carries the public and LAN
  addresses. Bots dialling every address at once reach it through the LAN
  address and through the router's public address (hairpin NAT works).
- **Countries from addresses:** `geoip = auto` downloaded
  `GeoLite2-Country.mmdb` (3.4 MB) in 0.5 s through urlmon; every local
  player (loopback, LAN) was flagged with the country of the router's
  public address (DE). `geoip = claims` (testing) showed the bots' claimed
  DE/GB/FR/PL/NL/BE.
- **Bodies:** seven bodies spawn in ~30 ms together, follow walk/run/jump/
  crouch/seated, and are removed 10 s after a player goes silent.
- **Name tags:** "Name · Lv N · CC" above each body, readable (not
  mirrored), turned toward the camera.
- **TAB scoreboard:** runtime UMG on `HUDWidgetsCanvasPanel`; flag images
  from `Win64/tswcoop/flags/*.png` via `ImportFileAsTexture2D`, names,
  levels, id prefixes, "host · you".
- **Main menu badge:** `Win64/tswcoop/logo.png` on the menu's
  `TSWLogoImage_C` canvas; top right covered the profile header, bottom
  centre is free.
- **Server log:** joins (name, country, level, mod, route, peer), bans
  (`warn join refused: banned … by=player id`), chat lines, leaves with the
  reason (`Closed`, `Timeout` after 30 s of a frozen client).

Screenshots (2050×1238, the game window):

| | |
| :--- | :--- |
| ![Main menu badge](img/hosted-session-menu.png) | Main menu with the tsw-coop badge at the bottom centre |
| ![Name tags](img/hosted-session-tags.png) | Bots walking, crouching and sitting; name tags with level and country |
| ![Scoreboard, claimed countries](img/hosted-session-flags.png) | TAB scoreboard in `geoip = claims` mode; Gustav is banned and missing |
| ![Scoreboard with own level](img/hosted-session-tab.png) | TAB scoreboard after the level fix (own row Lv 1), second crowd after a forced GC |

## What broke, and the fixes

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| Game gone ~1 s after start, before UE4SS loaded | the DLL had gained a static `winhttp.dll` import | download with `URLDownloadToFileW`, urlmon loaded on demand |
| Host never joined its own session: "hello must be the first message" | the client sent queued snapshots before answering the relay's challenge | nothing but `hello` until the welcome (`conn.rs`, regression test `data_queued_before_the_welcome_waits_for_it`) |
| Own level unknown | `GetDriverLevel` counts from 0 (menu "LV 1" = 0) | shown level = raw + 1 |
| Crash (access violation reading 0x280 in `PlayAnimation`) as the bots left | animation assets cached as raw pointers; nothing roots them, GC freed one | `Held` (object-array slot checked) for cached assets, meshes, the toast icon, the cab view, the frozen pawn; assets reloaded when freed |

The crash was found from the minidump (`Saved/Crashes/UE4CC-*/UE4Minidump.dmp`;
Proton adds stream type 0xFFF0, which the Python `minidump` package rejects
unless unknown types are mapped to unused) and `llvm-symbolizer
--relative-address --inlining` on our PDB: the stack held
`Avatars::animate → NativeFn::call_void` (avatar.rs, `PlayAnimation`).

**Rule:** an `Object` kept across frames is a `Held`; `Object::is_live`
reads the object itself and is only for objects the game just returned.

## Second run: public session with a password (2026-10-18)

Free Roam on Frankfurt S-Bahn (`tswup play FrankfurtSBahn free`), `public = on`,
`password`, `master` = the NAS master, later `nat_relay = n0`. Bots from `crowd` with the
new switches (`CROWD_PACKS`, `CROWD_MOD`/`CROWD_BUILD`, `CROWD_TRANSPORT`, `CROWD_ADDRS`,
`CROWD_ROGUE`, `CROWD_FRONT`).

- **Crash at start, fixed:** the game ended right after the mod's first two log lines,
  before UE4SS loaded, with no crash report. The mod asked Steam (`GetLaunchCommandLine`,
  and the new DLC licence check) during the DLL load, before the game had initialised
  Steamworks. Both now run from the tick.
- **Seen working:** listing on the master with a short code, `/status` over LAN and the
  public address (hairpin), refusals for missing DLC, banned, full, wrong password, older
  mod and other build, each with its reason in the scoreboard's refused section; runtime
  kick (the waiting 9th bot took the seat); QUIC through the router's UDP mapping; a guest
  with no address joining through n0's relay; the web view page, the spectator page, the
  Pages site against the NAS master with the live map.
- **Rogue guest:** 1528 messages over the rate limit, 60 out-of-bounds positions and 59
  oversized messages were dropped; the game was unaffected. Two gaps fixed: every dropped
  message was a log line (now one count per player per 10 s), and chat lines had no length
  cap (now 500 characters).
- **Screenshots without the window:** the window-capture tool returns whatever window covers
  the game. `devapi.sh shot` asks the game itself (`shot showui`, the PNG lands in the
  Proton prefix's `Saved/Screenshots/WindowsNoEditor`), UI included, whatever is on top.
- **Keys reach the unfocused game:** under Proton the game read keys typed into another
  window (photo mode on O and the task panel on T opened while the maintainer typed
  elsewhere).

## Third run: Windows clients in a Linux-hosted session (2026-10-20)

The first cross-platform run. The host was TSW 7 on Linux (Proton) in Free Roam Fulda,
hosting with a password. The guests were three `crowd` bots built for native Windows
(`cargo xwin`, `x86_64-pc-windows-msvc`, `--features iroh`) and run in a Windows 11 VM on
the same machine. That VM has no GPU, so it cannot run the game itself yet.

- **It works end to end:**
  - All three joined over WebSocket through the invite's LAN address. In `auto` mode QUIC
    and WebSocket raced, and the loser was dropped.
  - Each sent ~1185 avatar updates over 2 minutes.
  - Their bodies walked, sat and chatted visibly in the Linux game.
  - They left cleanly, and their bodies were removed.
- **The DLC check refuses as designed:** without `CROWD_PACKS=FrankfurtFulda` the host
  answered "this session needs DLC you do not have installed: FrankfurtFulda (for the
  route)".
- **The same day, the loader ran natively on Windows (smoke host, no game):** uniloader's
  `scripts/smoke.sh --vm` passes (plugins, Lua, `.asi`, Direct3D 11 overlay). Running the
  Windows test binaries there found a real bug, now fixed (uniloader 7e08351): a plugin panic
  inside the SEH guard aborted the process instead of disabling the plugin.
- **Not yet:** the game itself on Windows. TSW 5 in the VM is blocked by the missing GPU
  (software rendering only), by one Steam account playing one game at a time, and by the
  Windows Steam client's EULA prompt.

## Still open

- The crouch pose is the male bench-sit idle (the only crouch animation,
  `CH_F_hiker_Crouched`, is for the female skeleton): a crouching bot looks
  seated in the air. *Since then:* the pak index has a male one,
  `Male/Anims/Crouch/CH_M_hiker1`, now played first (bench sit as the
  fallback); untested in game.
- The game build is not read yet (`build=0`), so a build mismatch is never
  reported. *Since then:* read with `GetBuildNumber` (`src/game_info.rs`),
  untested in game.
