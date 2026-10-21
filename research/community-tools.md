---
name: community-tools
description: >-
  Community tools that read or drive Train Sim World from outside the game (live maps, controller bridges, Arduino cabs, RailDriver DLL replacements, UE4SS mods), sorted by the interface each uses, with what they learned about writing controls.
game_build: not version-specific (public sources, TSW 2020 to TSW 7)
created: 2026-10-21T20:15+0200
last_edited: 2026-10-21T20:15+0200
---

# Community tools and the interfaces they use (2026-10-17)

Question: which existing projects observe or control TSW from outside the game process, through
which interface, and what did they learn about interlocks, snapping levers, polling rates and
window focus? Web research only, 2026-10-17, plus one follow-up search on 2026-10-21 for an
existing autopilot. **[D]** means a source states it; **[I]** is an inference. Nothing here was
run.

The API itself is described in [dtg-http-api.md](dtg-http-api.md); the in-game comparison of the
interfaces is in [interfaces.md](interfaces.md). Older prior art (TSW5Mods, tsw-controller-app's
UE4SS mod, ThirdRails) is in [02-prior-art.md](02-prior-art.md).

## Interface 1: the DTG HTTP API (port 31270)

| Tool | What it does and what it documents |
| :--- | :--- |
| **ThirdRails** live map | Reads speed, `DriverAid` (signals, limits, gradient), position, time and weather; writes `SetFeatureStatus`. Ships a C# wrapper (`TSWData.dll`) inside the app; closed source [D]. |
| **tsw-steam-bridge** (Zig) | Writes `InputValue` normalised to 0..1; a notch is `notch_index / (count − 1)`. The game does not expose notch counts in a usable way, so they are set by hand per loco. Digital controls are held true/false, but some (pantograph) are toggles. Two writers on one control fight each other [D]. |
| **Trenino** (Elixir, Arduino cab) | Writes `…/Throttle(Lever).InputValue`, reads `.Min`, `.Max`, `.Notches`, `.NotchesIndex`. Detects the train every 15 s, refreshes displays every 200 ms, and **re-sends momentary buttons every 100 ms** [D], which suggests held values lapse otherwise [I]. |
| **TrainDeck** | Tablet → UDP 47331 → a Windows bridge → the API, keyboard as fallback [D]. |
| **RailBridge** | Telemetry through subscriptions; claims to send input "without requiring the game window to be in focus" [D]. |
| **tsw_connect** (Python), **tsw6-realtime-weather** | Read-only, and weather writes [D]. |
| **SimHub** | No TSW plugin found; only SimHub's generic UDP "external sim" feature [D]. |

A search snippet of one mapper's comments recommends the API's virtual RailDriver as the easier
route, because control names differ between classes and even between versions of one class [D,
snippet only].

## Interface 2: UE4SS mods inside the process

- **Custom Controller Mapper / tsw-controller-app** (LiamMartens) has three modes [D]:
  - `direct_control`: a UE4SS mod moves the controls itself, "no raildriver compatibility layer";
  - `api_control`: the HTTP API, in a 15 Hz loop (about 67 ms) with a `max_change_rate`;
  - `sync_control` (deprecated): key presses until the value is within 0.005 of the target.

  Interlocks exist only as user-written `conditions` in a profile; nothing is read from the game.
  Proxy mode needs the API opened to the network. On Linux, UE4SS needs Proton 9 or 10.
- **TSW WebSocket API**: a UE4SS mod serving WebSocket on `localhost:9187`, with intervals per
  subscription and console-command execution [D].

## Interface 3: replacing the RailDriver DLL (`PieHid64.dll`)

- The game loads `pieHid64.dll` from `TS2Prototype\Binaries\ThirdParty\PieHid\Binaries` [D; the
  file is there in TSW 7].
- **skaako/raildriver** replaces it to feed seven 8-bit channels (reverser, throttle, automatic
  brake, independent brake, bail-off, two rotaries) from an Arduino over serial or from XInput [D].
- **CobraOne's "TSW Raildriver and Joystick Interface"** replaces the same DLL. Its author says
  nothing can be read back from TSW, calibration is TSW's own (`Raildriver.ini`), and throttle and
  dynamic brake share one lever axis [D].
- Focus should not matter, since the game polls the device through its own DLL [I].
- Linux: Proton needs `PROTON_ENABLE_HIDRAW="0x05f3/0x00d2"` and a udev rule for the real device
  [D]; see [input-injection.md](input-injection.md).

### The RailDriver mapping is per locomotive

Each loco ships an External Hardware Configuration (EHC) data asset in its pak; community paks
override them, and some inputs are not linked to anything in the vehicle's blueprint [D]. The
reflection side of this is in [dtg-http-api.md](dtg-http-api.md), section "The RailDriver path behind it".

## Interface 4: key presses plus memory reading

**TSWRDConnector** (archived, TSW 2020) read lever values from game memory and sent keystrokes until
they matched. Its levers "run away", and the game limits how fast a key moves them [D]. Keystrokes
need the window focused [I].

## What these projects learned, together

- Nobody models interlocks; the game's own reaction is all there is. Where a tool has anything, it
  is a user-defined profile condition.
- Writes are absolute positions with notches set by hand, and two writers to one control fight.
- Momentary inputs are repeated (100 ms) rather than held.
- Polling at 5–15 Hz is normal; nobody reports the API as a bottleneck.
- Generic code has to cope with control names that differ per class and per version.

## Not found

- No published TSW autopilot (searched again on 2026-10-21). Existing tools are maps, radar and
  manual-driving bridges.
- No vJoy bridge made for TSW, no AutoHotkey project, no maintained Python, Rust or Node wrapper
  for the API (the only C# wrapper lives inside ThirdRails).
- The official API PDF could not be fetched (403); see [dtg-http-api.md](dtg-http-api.md).

## Sources

- tsw-controller-app: https://github.com/LiamMartens/tsw-controller-app,
  https://raw.githubusercontent.com/LiamMartens/tsw-controller-app/main/PROFILE_EXPLAINER.md,
  https://tsw-controller-app.vercel.app/docs/proxy-mode,
  https://www.trainsimcommunity.com/mods/c3-train-sim-world/c75-utilities/i6396-custom-controller-mapper-control-train-sim-world-with-any-joystick-or-analog-controller-no-rail-driver-required
- tsw-steam-bridge: https://github.com/londospark/tsw-steam-bridge
- Trenino: https://github.com/albertorestifo/trenino/blob/master/docs/train-configuration.md
- TrainDeck: https://github.com/ShaneioCantrai/TrainDeck
- RailBridge: https://www.trainsimcommunity.com/mods/c3-train-sim-world/c75-utilities/i7626-rail-bridge
- tsw_connect: https://github.com/TheJAG/tsw_connect; weather: https://github.com/GarethLowe/tsw6-realtime-weather
- SimHub: https://manual.simhubdash.com/external-sim-integration
- TSW WebSocket API: https://www.trainsimcommunity.com/mods/c3-train-sim-world/c109-other/i5723-tsw-web-socket-api
- skaako/raildriver: https://github.com/skaako/raildriver
- CobraOne: https://forums.dovetailgames.com/threads/ts-world-raildriver-and-joystick-interface.61440/,
  https://forums.dovetailgames.com/posts/753408/
- RailDriver on Linux: https://forums.dovetailgames.com/threads/guide-how-to-use-raildriver-on-linux.90059
- TSWRDConnector: https://github.com/Yamazaki93/TSWRDConnector
- EHC remaps: https://www.trainsimcommunity.com/mods/c3-train-sim-world/c19-patches/i5470-rail-driver-reconfiguration-mod-us-locomotives,
  https://www.trainsimcommunity.com/mods/c3-train-sim-world/c109-other/i5225-raildriver-button-remapping-of-uk-locomotives-for-tsw-5
- ThirdRails: https://thirdrails.org/Downloads/TSW_API_Unofficial_Documentation.pdf
