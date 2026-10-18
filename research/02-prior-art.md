---
name: prior-art
description: >-
  Existing Train Sim World mods and tools from public sources: engine facts, the TSW-specific UE4SS fork, DTG's official HTTP API, ThirdRails and other prior work.
game_build: not verified in game (public sources, mostly TSW 5)
created: 2026-10-17T03:20+0000
last_edited: 2026-10-17T03:23+0000
---

# 02 — Prior art on Train Sim World

Everything here is from public sources read on 2026-10-17. "Observed on
TSW 5" means the source only demonstrates it on TSW 5; re-verify on TSW 7.

## Engine facts

- TSW 5, 6 and 7 are **Unreal Engine 4** ("SimuGraph and Unreal Engine 4
  technology", DTG's TSW 7 FAQ). UE4SS lists TSW 5 as `426_…`, i.e. **4.26**.
  Assume the same for 6 and 7 until a dump says otherwise.
- Game module is `TS2Prototype` (`/Script/TS2Prototype.*`), executable
  `TrainSimWorld.exe` under `WindowsNoEditor\TS2Prototype\Binaries\Win64\`.
  Each TSW release is a separate install with its own folder.
- The game is a single-player build: no listen server, no replication in use.
- No anti-cheat.

## UE4SS on TSW

- **Compatibility:** `docs.ue4ss.com/dev/patternsleuth-games.html` lists
  "426_Train Sim World 5" under "all AOBs found by Patternsleuth". That page
  warns this does not guarantee full support.
- **Install (observed on TSW 5):** unzip into `…\Binaries\Win64\` so that
  `dwmapi.dll` and `ue4ss\` sit next to `TrainSimWorld.exe`. Mods go in
  `…\Win64\ue4ss\Mods\`. Game Pass build path:
  `\XBoxGames\Train Sim World- 5\Content\TS2Prototype\Binaries\WinGDK\`.
- **TSW-specific fork:** `github.com/vanlueckn/RE-UE4SS-TSW` ("UE4SS Code
  Library" on Train Sim Community, build `UE4SS-TSW-0525.zip`, May 2025).
  It is upstream UE4SS at commit `437a8ff` (2025-04-09, xmake build) with
  the default cppmods stripped. It carries **no TSW-specific signature or
  config changes** (checked `assets/CustomGameConfigs` and
  `assets/UE4SS_Signatures`), which confirms stock UE4SS works on TSW 5.
- **Stability reports:** the weather mod's page says "sometimes the game
  crashes after the journey" and that some users crash for unknown reasons;
  it also broke for two patches and came back. The controller-mod author
  reports no crashes. Treat UE4SS on TSW as "works, needs care around
  level transitions and game updates".

## Open-source TSW mods built on UE4SS

### `vanlueckn/TSW5Mods` (MIT) — weather sync + WebSocket API

Two C++ mods plus a `Shared` helper library. The helper is the most useful
reference for reading player state in-process:

| Need | How the mod does it |
| --- | --- |
| Player controller | `UObjectGlobals::FindAllOf(STR("PlayerController"), …)`, then `ProcessEvent(K2_GetPawn)` |
| Current train / vehicle | pawn → `GetDrivableActor` (see controller mod) |
| Velocity | `GetVelocity` via `ProcessEvent` on the actor |
| Geo position | static `GetActorLatLong` on the `/Script/TS2Prototype.TS2GameplayFunctionLibrary` default object |
| In-game date/time | static `GetDateTime` on the same library; hooks the time-of-day setter to detect changes |
| Camera | `FindFirstOf(STR("TS2DefaultCameraManager_C"))` |
| Console commands | `Hook::RegisterProcessConsoleExecGlobalPostCallback` + Kismet `ExecuteConsoleCommand` |
| Level load detection | `RegisterHook` on `/Script/Engine.PlayerController:ClientRestart` |
| Main-thread marshalling | own `mainthreadqueue` drained from `on_update()` |
| Networking | uWebSockets server thread inside the game (`EbulaWebsocketMod`) |

`TS2DebugFunctionLibrary` and `KismetSystemLibrary` default objects are also
used. Build is xmake + MSVC with UE4SS as a submodule.

### `LiahMartens/tsw-controller-app` — direct cab control

Supports TSW **5/6/7** per its README (the newest evidence that UE4SS mods
run on TSW 7). Its `tsw-controller-mod/ue4ss-mod` C++ mod drives cab
controls through TSW's virtual HID layer, which gives us the control-sync
vocabulary:

- Class/function names (exact): `VirtualHIDComponent`,
  `/Script/TS2Prototype.VirtualHIDComponent:InputValueChanged` (hooked with
  `RegisterHook`), `FindVirtualHIDComponent` on the drivable actor,
  `GetDrivableActor`, `GetDriverPawn`, `GetAttachedSeatComponent`,
  `IsPlayerController`, `BeginChangingVHIDComponent`, `EndUsingVHIDComponent`,
  `NotifyBeginInteraction`, `NotifyEndInteraction`, `SetCurrentInputValue`,
  `SetNormalisedInputValue`, `GetCurrentInputValue`, `GetNormalisedInputValue`,
  `SetPushedState`, `IsChanging`, `EndChanging`, `CallUpdateFunctions`,
  `Identifier`, `InputIdentifier`, `SeatSide`.
- Control names are per-loco, e.g. `Throttle_F`, `TrainBrake_F`,
  `Reverser_F`, `Pantograph_F`, `AFB_Speed_F`; `_F`/`_B` is cab side.
- Rolling stock blueprints are `RVM_<…>_C` deriving from `ARailVehicle`
  (forum example: `ARVM_BPE_AMTK_Acela_PowerCarBase_C : ARailVehicle`).
  UE4SS "Generate LUA Types" dumps them into `ue4ss\Mods\shared\types`.
- IPC is a Go-built C-shared socket DLL linked into the mod.
- Note in its README: the proxy DLL can be vendored under another name
  (`user32.dll`) by editing `proxy_generator`.

### Other community mods on the same base

- "Automatic Train Announcements" (Tyler58546), closed source as far as found.
- EbulaDisplay (in TSW5Mods, disabled in the build).

## DTG's official external HTTP API

Shipped since TSW 5 (Matt Peddlesden post, Oct 2025: "HTTP requests over
TCP with JSON response blocks", PC only, used by TSControllers, ThirdRails
and ProCab). Official PDF: "TSW External Interface API 1.5.1" (forum
attachment, login-walled). Unofficial doc from ThirdRails covers what they
use:

- Enable with launch option `-HTTPAPI`. Key file
  `Documents\My Games\TrainSimWorld<N>\Saved\Config\CommAPIKey.txt`
  (`N` = 5, 6; assume 7). Header `DTGCommKey: <key>` on every request.
  Base URL `http://localhost:31270/`; remote access can be opened per the
  PDF's "Opening Network Access to Other Computers".
- Routes: `GET /info`, `GET /list[/path]`, `GET /get/{path}`,
  `PATCH /set/{path}?Value=…`, `GET|POST|DELETE /subscription`,
  `GET /listsubscriptions`.
- Useful paths observed:
  `CurrentDrivableActor.Function.HUD_GetSpeed` (m/s),
  `CurrentDrivableActor.LatLon`, `CurrentDrivableActor/<Control>.Value`
  (writable, e.g. `Pantograph_F`), `CurrentFormation.FormationLength`,
  `CurrentFormation/{i}.ObjectClass` (→ `RVM_CRG_DB_BR101_C`),
  `DriverAid.Data` (signals/speed limits ahead with world positions),
  `DriverAid.PlayerInfo` (`geoLocation`, **`currentTile {x,y}`**,
  `playerProfileName`, `cameraMode`), `TimeOfDay.data`,
  `WeatherManager.Data`.
- Limits for our purpose: it exposes **only the local player's train and
  surroundings**. No endpoint lists other consists, spawns anything, or sets
  a position. It is read-mostly, with `/set` limited to cab controls and
  weather.

Why it still matters: a zero-injection "presence" mode (what ThirdRails
does), a robust fallback for telemetry if a game update breaks UE4SS
signatures, and a quick way to validate what the in-process reader sees.

## ThirdRails

Companion app (`thirdrails.org`) for TSC and TSW 5/6, listing TSW 7 on one
mod page. Reads the HTTP API (`TSWDataService`), uploads position to its
own backend, and shows other players on a live map with chat. No in-game
rendering of other trains. It is the existence proof that players want
shared presence, and its backend is the kind of relay server the co-op
layer needs, but it is closed source.

## Sources

- https://docs.ue4ss.com/dev/patternsleuth-games.html
- https://www.trainsimcommunity.com/mods/c3-train-sim-world/c109-other/i5711-ue4ss-code-library
- https://www.trainsimcommunity.com/mods/c3-train-sim-world/c109-other/i5712-tsw-live-historical-weather
- https://github.com/vanlueckn/TSW5Mods
- https://github.com/vanlueckn/RE-UE4SS-TSW
- https://github.com/LiahMartens/tsw-controller-app
- https://forums.dovetailgames.com/threads/i-created-a-mod-software-to-directly-control-in-game-trains-using-a-joystick-no-raildriver.90609/
- https://forums.dovetailgames.com/threads/train-sim-world-api-support.94488/
- https://thirdrails.org/Downloads/TSW_API_Unofficial_Documentation.pdf
- https://github.com/TheJAG/tsw_connect
- https://steamcommunity.com/app/2362300/discussions/0/4140563392622982290/
- https://support.dovetailgames.com/hc/en-us/articles/35735377213458-Train-Sim-World-7-FAQ
