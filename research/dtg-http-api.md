---
name: dtg-http-api
description: >-
  Dovetail's external HTTP API (port 31270): routes, nodes, how writes and function calls behave, the VirtualRailDriver node, subscriptions, latency measured on TSW 7, the RailDriver input path behind it, and what the official and community documentation do and do not say.
game_build: 886 (TSW 7, Steam build 25890949); official documentation is for TSW 6 build 493
created: 2026-10-21T20:15+0200
last_edited: 2026-10-21T20:15+0200
---

# The DTG HTTP API (2026-10-17)

Question: besides UE4SS Lua inside the process, what can be read and controlled from outside the
game through Dovetail's own HTTP API, and how well does it behave? This note is the API reference.
The side-by-side comparison with the other interfaces, and the write tests that came after this
research, are in [interfaces.md](interfaces.md).

Research done on 2026-10-17 by three parallel agents: one probed the live game with GET requests
only, two read the web. Markers:

- **[live]**: checked with GET against the running TSW 7, BR 146 in the Training Centre.
- **[bin]**: read from the shipped exe (strings) or the reflection and object dumps.
- **[doc]**: stated in Dovetail's official documentation.
- **[web]**: community sources (forums, tool READMEs); not checked here.

Probe script and raw listings: `tsw-coop/dumps/tsw7-886/experiments/interfaces/external/`
(`tsw_api_inventory.py`, `NOTES.md`, `live/`). The script reads the key file at run time and never
prints it.

## Setup

- Launch the game with `-HTTPAPI` [doc]. On this machine the launch options are
  `WINEDLLOVERRIDES="dwmapi=n,b" %command% -HTTPAPI`.
- The game writes a key to `Documents\My Games\TrainSimWorld<N>\Saved\Config\CommAPIKey.txt` the
  first time it reaches the main menu with the API on [doc]. Every request sends it in a
  `DTGCommKey` header. Use the whole file minus a trailing CR/LF, and read it at start: it changes
  if the file is deleted [doc]. A wrong key gives 403 `dtg.comm.InvalidKey` [doc].
- It listens on `127.0.0.1:31270`, plain HTTP [doc]. Adding
  `[HTTPServer.Listeners] DefaultBindAddress=0.0.0.0` to
  `Saved\Config\WindowsNoEditor\Engine.ini` opens it to the LAN [doc; the strings are in the exe,
  bin].
- The worker inside the game is `DTGCommWorkerRC`, part of the `DTGComm` module [bin].

## Routes

From `/info` [live] and the official PDF [doc]:

| Method | Route | Notes |
| :--- | :--- | :--- |
| GET | `/info` | Lists the commands. ThirdRails' TSW 5 notes show `APIVersion: 1` [web]. |
| GET | `/list[/<node path>]` | Tree of `Nodes` and `Endpoints`, each endpoint with `Writable`. A full listing can be about 415 KB [doc]. |
| GET | `/get/<node>.<endpoint>` | Nodes are separated by `/`, the endpoint by `.` |
| PATCH | `/set/<node>.<endpoint>?Value=<v>` | Writes a value |
| POST | `/subscription/<path>?Subscription=<id>` | Adds one path per call |
| GET | `/subscription?Subscription=<id>` | `Entries[]` with `Path`, `NodeValid`, `Values` |
| DELETE | `/subscription?Subscription=<id>` | An unknown id gives `dtg.comm.NoSuchSubscription` [doc] |
| GET | `/listsubscriptions` | The subscriptions, without values |
| POST | `/execdev` | Development builds only [doc]; not in the shipping game |

Values around 3.4e38 mean "undefined" [web, ThirdRails].

## Nodes (TSW 7, live)

Root nodes with a train in scope: `VirtualRailDriver`, `Objectives` (one child per objective),
`WeatherManager`, `TimeOfDay`, `Timetable`, `Player`, `DriverAid`, `DriverInput`,
`CurrentDrivableActor`, `CurrentFormation`. `DriverInput` and `CurrentDrivableActor` appear only
while the player has a train; the older dump in `dumps/tsw7-886/httpapi/in-scenario` lacks them.

- **`DriverInput/<control>`** (new compared with the published documentation): only the active
  cab's controls (58 on the BR 146, e.g. `Throttle_F`, `Reverser_F`, `ReverserHandle_F`,
  `SifaPedal_F`). Each is the VirtualHID component with its reflected properties and functions,
  plus two writable endpoints, `InputValue` and `Interacting`.
- **`CurrentDrivableActor/<control>`**: both cabs (about 220 children), but only `ObjectName`,
  `ObjectClass`, `InputValue` and `Interacting`.
- **`CurrentFormation/<i>`**: one entry per vehicle. The player's vehicle is not always index 0:
  multiple units reverse their order at termini [doc].
- **`DriverAid.Data`**: distance to and aspect of the next signals, current and next speed limits
  with distances, gradient, track, service and formation maximum speeds. `DriverAid.PlayerInfo`:
  geo position, current tile, profile name, camera mode. `DriverAid.TrackData` also exists [doc].
- **`TimeOfDay.Data`** is read-only [doc]. **`WeatherManager`**: Temperature, Cloudiness,
  Precipitation, Wetness, GroundSnow, PiledSnow and FogDensity are writable [doc].
- Missing, per forum users: departure times, stop marker positions, "stopped at the objective",
  loading state [web]. The `PIS_Manager` destination is read-only [web].

## Writes

- Write a control with `/set/CurrentDrivableActor/<control>.InputValue?Value=0.25` [doc]. Read its
  range first with `Function.GetMinimumInputValue`, `GetMaximumInputValue` and `GetNotchCount`
  [doc]. A value between notches snaps to the nearest notch [doc].
- Controls have an input and an output value. Keyboard, joystick and API all write the input, and
  the last writer wins: if the player moves a lever, an app has to read it back [doc].
- `.Value` is accepted on some nodes too: ThirdRails writes
  `CurrentDrivableActor/Pantograph_F.Value?Value=true` [web].
- `Interacting` is meant to act like clicking the control, while `InputValue` forces a position.
  This comes from a Steam guide seen only as a search snippet (the page returned 429) [web].
- Later tests, in [interfaces.md](interfaces.md): API writes **do** respect the BR 146's traction
  lock (the throttle was pulled back to the locked range), `Interacting` takes `1`/`0` and changed
  nothing visible.

## Calling functions

`GET /get/<node>.Function.<Name>` **runs the UFunction** [live, doc]. It returns
`{"ReturnValue": …}` or the named out values; `HUD_GetSpeed` returns m/s [doc].

- Out and by-reference parameters get garbage or default values: a `Get*ByReference` call
  returned `-4.27e-28`, a struct out-parameter `FoundComponent: false` [live].
- Functions with side effects are listed beside the getters (`UnlockLeverRange`,
  `ConditionalBeginTick`, `CalcTarget*`), so a GET is not automatically safe. The probe script
  refuses anything that does not look like a getter.

## VirtualRailDriver

Endpoints [live]: `Data` (read-only, every value), `Enabled` (writable, false by default), and
writable `Reverser`, `Throttle`, `Auto Brake`, `Independent Brake`, `Bail Off`,
`Rotary Switch 1/2`, 28 buttons (`Front Top Row 1 (0)` … `Front Bottom Row 14 (27)`),
`Rocker Up/Down`, the D-pad, `Range Forward/Back`, `E-Stop Forward/Back`, `Alerter`, `Sand`,
`P Button`, `Bell`, `Horn Forward/Back`.

- The documented use is `Enabled=true` first, then e.g. `Throttle?Value=0.5`. Enabling it switches
  the real RailDriver interface off [doc]. Nothing else about it is documented.
- **Endpoints whose names contain a space cannot be addressed one at a time.** `%20`, `+`, `_` and
  no space all fail with "Node failed to return valid data" [live]; forum users report the same for
  `/set` [web]. So `Auto Brake` and `Independent Brake` are out of reach; `Reverser`, `Throttle`,
  `Enabled` and `Data` work. Names with `/` (`AWS/TPWS`) are also unclear [web].
- Later tests ([interfaces.md](interfaces.md)): `Enabled` takes `1`/`0`; `Throttle` is the
  RailDriver's combined power and brake lever (0.5 neutral).

## The RailDriver path behind it [bin]

- The game ships `PieHid64.dll` in `TS2Prototype/Binaries/ThirdParty/PieHid/Binaries/`. The exe
  has the workers `DTGCommWorkerRailDriver`, `DTGCommWorkerTrackIR` (NaturalPoint) and
  `DTGCommWorkerTCP` next to the HTTP one, and the cvars `dtg.Comm.Enabled`,
  `dtg.Comm.DebugEnabled`, `dtg.Comm.CalibrateControl` and
  `ts2.dbg.SaveRailDriverDeviceConfiguration`. The strings `ExternalHardware` and
  `NoExternalHardware` next to `HTTPAPI` look like further command-line switches (unverified).
- Mapping: `FDTGCommAxisBinding { VirtualAxisName, Source { Mode, ControllerId,
  AxisOrButtonIndex }, RemapCurve, bInvertInput }`, with `Mode` one of `DigitalIncrease`,
  `DigitalDecrease`, `AnalogueChange`. The bindings come per vehicle from
  `URailVehicleExternalHardwareConfig` data assets (default
  `/Game/Core/RailVehicles/RailDriverMappings/EHC_Default`), overridable per profile
  (`UKeyboardBinder::Update/Get/ClearRailDriverMapping`, `UPlayerProfile::RailDriverConfig`). The
  8F even has a separate `Reverser_RailDriver` lever.
- So RailDriver input, real or virtual, moves controls through the same increase/decrease and
  analogue-change calls as a keyboard or pad, not through a raw value set. That is why it should
  respect interlocks (inferred here, later confirmed for the throttle in
  [interfaces.md](interfaces.md)).
- Only the class defaults of `DTGCommExternalHardwareInterface_RailDriver` and
  `DTGCommRailDriverConfig` are in the object dump; without a device there is no live instance.
- The mapping covers about 7 axes plus fixed buttons, differs per loco, and some controls are not
  mapped [web]. Community paks remap it (see [community-tools.md](community-tools.md)).

## Subscriptions

- None were active during the GET-only probe [live]. A forum post (September 2025, before the
  official PDF) and a community OpenAPI spec say subscriptions returned no data in TSW 5/6 [web].
- **Later test: they work in TSW 7** (16 paths per read, p50 17 ms; [interfaces.md](interfaces.md)).
  `CurrentDrivableActor/Function.X` paths are not valid in a subscription.
- Official advice [doc]: use separate subscriptions for different rates (the example is 1 Hz
  against 60 Hz); subscriptions do not survive a game restart, so delete your ids at start.

## Latency and load [live]

Game capped at 62 fps:

| Connections | Throughput | Latency |
| :--- | :--- | :--- |
| 1 | 25–28 requests/s | p50 21–23 ms, p95 65–80 ms |
| 4 in parallel | 106 requests/s | |
| 8 in parallel | 168 requests/s | p50 32 ms |

Requests are served on the game thread about once per frame (UE's `HTTPServer`, with
`MaxConnectionsAcceptPerFrame` in the exe [bin]). The game applies no throttling, but floods can
cost frame rate [doc]. A forum user polled "multiple times per second" for over an hour without
trouble [web]. ThirdRails says exclusive fullscreen does not work and to use windowed or
borderless [web]; that is about display mode. RailBridge claims it sends input without window
focus [web].

## Versions

The API first appeared with TSW 5 (`APIVersion` 1). The official "TSW External Interface API
1.5.1" PDF targets TSW 6 build 493. Nothing was found about changes in TSW 7, except that one
mapper tool's changelog mentions "Updated with TSW7 path" for the key file [web].

## Ruled out or not reachable

- **The official PDF itself**: the forum attachment returns 403 without a login. It was read
  through a community Japanese translation linked in the API documentation thread.
- `-ExecCmds` automation: the string is not in the shipping exe [bin].
- UE Remote Control, WebRemote or Python plugins: none in the object dump [bin]. Only
  `WebSocketNetworking` and `TcpMessaging`/`UdpMessaging` exist, which are UE session messaging,
  not a game API.

## Open

- Whether `Interacting` does anything at all, and what for.
- Which BR 146 controls its RailDriver mapping (EHC) covers.
- The `ExternalHardware` / `NoExternalHardware` switches.

## Sources

- Official thread: https://forums.dovetailgames.com/threads/train-sim-world-api-support.94488/
  (DTG, 8 Oct 2025; attachment "tsw-external-interface-api-1-5-1-pdf.203411", login required)
- Japanese translation of the PDF, linked in post 1139054:
  https://forums.dovetailgames.com/threads/api-documentation.93807/#post-1139054
- API documentation thread: https://forums.dovetailgames.com/threads/api-documentation.93807/
  (posts 1041014, 1041061, 1041219, 1056221, 1056374, 1057505, 1057647, 1058073, 1080332)
- ThirdRails' unofficial documentation (TSW 5):
  https://thirdrails.org/Downloads/TSW_API_Unofficial_Documentation.pdf
- Community OpenAPI spec: https://tsw-inspector.waaghals.dev/openapi.yaml
- Steam guide on `Interacting` (search snippet only):
  https://steamcommunity.com/sharedfiles/filedetails/?id=3666549231
- Local: `dumps/tsw7-886/CXXHeaderDump/DTGComm.hpp`, `UE4SS_ObjectDump.txt.gz`,
  `TrainSimWorld.exe` strings, `Manifest_NonUFSFiles_Win64.txt`
