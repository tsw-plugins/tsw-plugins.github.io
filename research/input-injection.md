---
name: input-injection
description: >-
  How a player's key, pad and mouse input reaches TSW 7's cab controls, the game-native and engine-level ways to inject input or let the game do the work (AI takeover, service setup, VHID presets, spawn presets), and OS-level input under Proton on KDE Wayland (uinput pads, a uhid RailDriver, ydotool, xdotool, libei).
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-21T20:15+0200
last_edited: 2026-10-21T20:15+0200
---

# Input paths and injection (2026-10-17)

Questions from the co-op and test work:

1. How does a real key, gamepad or mouse input reach a cab control, and can a mod inject input
   inside the game process so the game behaves exactly as for a human?
2. Which of the game's own systems could do work we do by hand (readying, driving, spawning)?
3. From outside the process on this desktop (Proton, KDE Plasma Wayland): what input reaches the
   game, and does it need focus?

Three agents worked on this in parallel on 2026-10-17: two read the reflection dumps and the
UE4SS source (offline, the game was busy), one read the web. Their probes were run in game the
same day; **the results of those runs are in [interfaces.md](interfaces.md)** and are only
summarised here. Markers: **[dump]** read from the headers or object dump, **[src]** UE4SS source,
**[game]** verified in game (see interfaces.md), **[web]** web sources, **[inferred]**.

Header lines refer to `dumps/tsw7-886/UHTHeaderDump-TS2Prototype/` unless named. Probe scripts:
`dumps/tsw7-886/experiments/interfaces/input/` (01–08) and `…/native/` (01–13).

## 1. How player input reaches a control

- **Key bindings.** Each control's `UVirtualHIDComponent.InputIdentifier.Identifier`
  (`VirtualHIDComponent.h:38`) is looked up in `UVirtualHIDInputSettings::StandardInputs`, whose
  entries hold `Identifier`, `VirtualHIDName` and the increase and decrease key chords [dump].
  Per-control keys also exist: `UPushButtonComponent.Inputs` (`PushButtonComponent.h:45`),
  `ULeverBaseComponent.IncreaseInputs` / `DecreaseInputs` (`LeverBaseComponent.h:49/52`).
- **Where they are bound.** Probably on the controller's `ControlledDrivableInputComponent`
  (`TS2PrototypePlayerController.h:192`), rebuilt by `RebuildDrivableInputComponent()` (:384).
  These are native bindings, invisible to Lua [dump, inferred].
- **Rebinding** goes through `UKeyboardBinder` (`UTS2GameInstance.KeyboardBinder`), e.g.
  `GetVehicleIdentifiers(const AActor* Drivable, const FName& InteriorName)`
  (`KeyboardBinder.h:51`) [dump].
- **No key names on disk.** The user's `Input.ini` is empty and `DefaultInput.ini` sits inside the
  pak, so the table has to be read from the running game (probe `input/02`, output
  `02_input_settings.out.txt`).
- **Every input becomes a controller RPC.** Hooks showed that pad input arrives as
  `ATS2PrototypePlayerController::BeginIncreasingVHIDComponent`, then `InputValueChanged` every
  frame, then `EndUsingVHIDComponent` [game]. The full set (`TS2PrototypePlayerController.h:290–584`):
  `BeginIncreasingVHIDComponent`, `BeginDecreasingVHIDComponent`, `BeginChangingVHIDComponent`,
  `BeginDraggingVHIDComponent`, `SetDragDeltaVHIDComponent(UActorComponent*, float)`,
  `EndUsingVHIDComponent`, `ToggleVHIDComponent`, plus `NotifyBeginInteraction` /
  `NotifyEndInteraction` (:426/423). They are server RPCs that run locally in single player, and
  they fire `InteractionStarted` / `InteractionEnded` (:186/189), which scenario objectives
  probably listen to (`ObjectiveActionComponent.h:376`) [dump, inferred].
- **Mouse.** The looked-at control is `GetLookingAtInteractiveComponent()` (:500) and
  `SelectedVHIDInteractionComponent` (:164); underneath, the component's own
  `BeginChangingAnalogue` / `SetPositionDeltaAnalogue(const AController*, float)` [dump].

### The standard input table (read in game, BR 146 session)

Excerpt of `StandardInputs` (identifier: increase / decrease):

| Identifier | Keys |
| :--- | :--- |
| `Throttle` | A, pad right trigger / D, pad right shoulder |
| `Reverser` | W, left stick up / S, left stick down |
| `AutomaticBrake` | `'` / `;` |
| `IndependentBrake` | `]` / `[` |
| `DynamicBrake` | `.` / `,` |
| `EmergencyBrake` | Backspace / Shift+Backspace |
| `Handbrake` | `\` / Shift+`\` |
| `Pantograph` | P / Shift+P |
| `CircuitBreaker` | Ctrl+P / Shift+Ctrl+P |
| `MasterSwitch` | Ctrl+W / Shift+Ctrl+W |
| `EngineStartStop` | Z / Shift+Z |
| `Alerter`, `AWS_Reset` | Q |
| `WarningDevices`, `SignallingSystems` | Shift+Enter, Ctrl+Enter (the Sifa and PZB fuses on German locos) |
| `PZB_Acknowledge`, `PZB_Release`, `PZB_Override` | Page Down, End, Delete |
| `CruiseControl`, `CruiseControlAdjust` | Ctrl+R, R / F |
| `MoveToLap` | `/` |

On the BR 146, 87 of 166 controls have no identifier at all (mouse only), among them
`BatteryControl_*`, `PantographSelector` and `AirCompressor_*` [game]. A control without an
identifier cannot be reached by key, which explains why pressing `BatteryControl_F` from code did
nothing.

## 2. Injecting input inside the process

Ranked as the agents proposed them, with the in-game result:

| # | Candidate | Reachable from | Result |
| :--- | :--- | :--- | :--- |
| 1 | `UPushButtonComponent.bUseDecreaseInputToOperate` (`PushButtonComponent.h:23`): some buttons operate on the **decrease** input. `drive_ctl.press` always used increase. | Lua | **Confirmed** [game]: the BR 146 `ParkingBrake_Release_F` works with decrease. The other suspect, the blueprint veto `BlueprintIsInputEnabled(const AController*)` (:283), was not needed. |
| 2 | The controller RPCs above, called from Lua with the player controller | Lua | **Works** [game]: `BeginIncreasingVHIDComponent(Throttle_F)`, 600 ms, `EndUsingVHIDComponent` moved the lever exactly like pad input, instigator the player controller, traction lock respected. This is the co-op replay path. |
| 3 | Mouse drag: `BeginDraggingVHIDComponent` + `SetDragDeltaVHIDComponent`, or the component's `BeginChangingAnalogue` / `SetPositionDeltaAnalogue` | Lua | **Not usable** [game]: only the first step moved the dynamic brake slightly, then it snapped back. |
| 4 | `UTS2MainMenuRouteHoppingWidget::CreatePressedReleasedKeyEvent(int32, FKey)` (`TS2MainMenuRouteHoppingWidget.h:23`), the only game function that builds a key event | Lua (`FKey` as `{KeyName = FName("L")}`) | **No effect** [game] on the class default object, no crash. A tap only, no modifiers, and it goes to whatever has UI focus. |
| 5 | `APlayerController::InputKey`, `UPlayerInput::InputKey`, `UGameViewportClient::InputKey`, `FSlateApplication::ProcessKeyDownEvent` | C++/Rust only | Not tried. Not exposed to Lua (absent from `APlayerController`, `Engine.hpp:7850`). UE4SS ships 4.26 virtual offsets only for `UConsole` (`InputKey` at 0x320), so these need their address found first. |

Not useful [dump]: `UPlayerInput` (`SetBind`, `InvertAxis`) and `UCheatManager` simulate nothing;
`UInputSettings::AddActionMapping` only changes bindings; no `ts2.dbg.*` command simulates a key;
`UGameplayTask_MoveLeverToInputPosition` is an AI task that needs a task owner.

## 3. The game doing the work itself

| Path | Call | Result |
| :--- | :--- | :--- |
| AI takeover | `ARouteTimetable::SetServiceDriverPermission(svc, Both=2)` (`RouteTimetable.h:113`), then `pc:ForceRelinquishService(svc)`; checks `CanServiceBeAIDriven`, `FindPlayerForService` | **Works** [game]; the AI drives with simple physics, not the cab, so it says nothing about interlocks. Timetable services only. |
| Handback | `SetServiceDriverPermission(svc, Player=0)`, then `pawn:SetControlledDrivable(train, FName("None"), 0, false, nil)` | **Works** [game]; no shutdown sequence runs. |
| The vehicle's own startup | `rvc:NotifyBeginTask(8)` + `rvc.PerformServiceSetupTask:Broadcast(pc, {bIsDrivingVehicle=true, …})` | **Nothing started** [game]; presumably queues gameplay tasks for an AI driver. |
| VHID presets | `URailVehicleComponent::ApplyVHIDPreset(GameplayTasksComponent, pc, PresetName, …)` with the vehicle's `GameplayTasksComponent` (`RailVehicle.h:30`) | **Works** [game], but the BR 146's six presets are only lights. |
| Spawn presets | `ATrainSpawner` (`bApplyPreset`, `PresetConfig{Preset=2}`, `SpawnConsist()`); `SpawnFormation` takes no preset | Spawner works; formation spawns come up `RunningStopped`. See [developer-functions.md](developer-functions.md) and [ready-any-train.md](ready-any-train.md). |
| Console | TS2 has no `CheatManager` subclass; its only `Exec` is `DerailMyTrain`. Useful: `ts2.dbg.RelinquishService`, `EnableAIDriverSpawning`, `LogAIStatus`, `sandbox.{ForceEnabled,ForceTrainEntry,Spawn}`, `JumpToService`, `JumpToSignal`, `JumpToRailVehicle`, `CompleteCurrentObjective`, `RestartScenario` | The shipping build writes no game log, so `ts2.dbg.Log*` output is invisible [game]. |

**Do not call `TaskMoveLeverToInputPosition` or `TaskPushOrToggleButton` from Lua.** Their owner
parameter is an interface type, and UE4SS fills in only half of an interface value
(`LuaUObject.cpp:1846–1875`) [src]; that almost certainly crashes. From native code they are fine.

### Observing input (for co-op)

Besides the RPCs, these are hookable game functions [dump]: `RailVehicleComponent:NotifyBeginTask`
/ `NotifyEndTask`, `HandleServiceStarted` / `HandleServiceStopped` /
`HandleServiceInstructionArrived`, `ScenarioManagerActor:OnSignalAspectChanged`, `OnAnySPAD`,
`OnRelinquishedService`, `TS2AIController:OnInstructionArrived`, and the BR 146's seat-occupied
handlers. UE4SS can list a delegate's bindings from Lua (`GetBindings`, also `Broadcast`,
`Add`/`Remove`; `LuaXDelegateProperty.cpp:150–290`) [src], which names the exact function to hook
[game].

## 4. Input from outside the process (Linux, Proton, KDE Wayland)

The game window is **XWayland** (`steam_app_4678800`). `/dev/uinput` is writable by the user;
`/dev/uhid` is root only. `ydotool`, `xdotool` and `kdotool` are installed [game: environment
check].

### Virtual gamepads (uinput)

- Wine's `winebus.sys` has three backends: SDL (on by default), udev evdev/hidraw and hidraw. When
  SDL starts, the evdev backend is switched off. Ordinary pads go through SDL unless they are Sony
  pads, on a built-in list of sim hardware, or listed under `EnableHidraw` [web: Wine source].
- SDL finds devices through udev/evdev, so a uinput pad with the Xbox 360 ids (045e:028e) should
  appear as an XInput controller. Wine's SDL backend does no id filtering; it calls a device a
  gamepad only with 6 axes and at least 14 buttons, so the virtual pad must copy the full xpad
  layout [web].
- A Wine bug report says uinput and xpadneo pads can show "connected" while every button reads 0
  on GE-Proton and Proton Experimental; unconfirmed, worked around by presenting a DualSense
  (Wine bug 60226) [web].
- Steam Input creates its own virtual pad (28de:11ff) per managed controller and tells SDL to
  ignore the physical one; it may duplicate a uinput pad. Fix: Steam Input off for the game, or
  `SDL_GAMECONTROLLER_IGNORE_DEVICES` [web].
- UE4 standalone builds reportedly read XInput while unfocused (UE-18946) [web], and Wine's SDL
  backend creates no window, so it should not be gated on focus [inferred]. **In game the pad was
  ignored while TSW was unfocused** [game], and TSW took focus back by itself. So a virtual pad is
  for foreground end-to-end tests only. A setting `bAllowJoystickInputInBackground` could not be
  confirmed for UE4.
- `GameUserSettings.ini` has `WindowFocus=True` (`UTS2GameUserSettings::SetWindowFocus`); its
  meaning is unverified (likely pause or mute on focus loss).

### A virtual RailDriver (uhid)

- uhid registers a device with the kernel's HID core, and such devices get hidraw nodes, so Wine
  sees it like a USB device [web].
- The documented recipe for a real RailDriver under Proton: udev rule
  `KERNEL=="hidraw*", ATTRS{idVendor}=="05f3", MODE="0666", TAG+="uaccess"` and launch option
  `PROTON_ENABLE_HIDRAW="0x05f3/0x00d2" %command%` [web].
- A uhid device's parent is not USB, so `ATTRS{idVendor}` may not match; match on
  `KERNELS=="*:05F3:00D2.*"` instead [inferred]. `PROTON_ENABLE_HIDRAW` is not in Valve's README;
  GE-Proton 10-3 fixed its behaviour [web].
- HID reports do not depend on focus [inferred]. **Not tested**: it needs root for `/dev/uhid` and
  a udev rule, and the API's `VirtualRailDriver` reaches the same input path without any of that
  ([dtg-http-api.md](dtg-http-api.md)).

### Keyboard and mouse

- **ydotool** writes through uinput, so input goes to the focused window [web].
- **xdotool `--window`** uses `XSendEvent`, which Wine ignores; without `--window` it uses XTEST,
  which reaches only the focused window. KWin can route Xwayland XTEST through the RemoteDesktop
  portal and libei [web].
- **KWin scripting** can focus a window (`workspace.activeWindow`); `kdotool windowactivate` does
  that but cannot type [web].
- **`org_kde_kwin_fake_input`** is deprecated for ordinary clients; the RemoteDesktop portal with
  libei replaces it, and its input also goes to the focused window [inferred]. `kwin-mcp` talks to
  KWin's EIS interface directly and can run a nested session [web].
- **From inside the prefix**: a small Windows helper in the same wineserver could use `SendInput`
  or `PostMessage`. Whether UE4 accepts that while unfocused is uncertain (it reads raw input) [web].

All keyboard paths take focus away from the person using the desktop, so they were not used.

## Conclusions

- For tests and for co-op replay, the controller RPCs (or held input with `Begin*Digital(pc)`)
  from inside the process are the human-equivalent path: they work unfocused and respect
  interlocks.
- For capture on a guest, hook the RPCs.
- OS-level input is only useful for a foreground "real input" smoke test.

## Open

- What `BindControllerMethods` on a VHID component means (perhaps a bit mask for Classic and
  Immersion modes).
- What validation the RPCs run before they accept a call.
- Whether the installed UE4SS cleans up hooks on mod reload as the source does (it did in game:
  `tswcmd reload` unregistered them).

## Sources

- Dumps: `TS2PrototypePlayerController.h`, `VirtualHIDComponent.h`, `PushButtonComponent.h`,
  `LeverBaseComponent.h`, `KeyboardBinder.h`, `TS2MainMenuRouteHoppingWidget.h`,
  `RouteTimetable.h`, `ObjectiveActionComponent.h`, `CXXHeaderDump/Engine.hpp`, `ts2-console-variables.txt`
- UE4SS source at the installed commit `06474186`: `LuaUObject.cpp`, `LuaXDelegateProperty.cpp`,
  `LuaTArray.cpp`
- Wine: https://raw.githubusercontent.com/wine-mirror/wine/master/dlls/winebus.sys/main.c,
  https://raw.githubusercontent.com/wine-mirror/wine/master/dlls/winebus.sys/bus_sdl.c,
  bug 60226: https://list.winehq.org/hyperkitty/list/wine-bugs@list.winehq.org/thread/ETLD2UVTEUFN7JRX6M3S25Z4P4V5O2EU/,
  XSendEvent: https://forum.winehq.org/viewtopic.php?p=46369, https://bbs.archlinux.org/viewtopic.php?id=282231
- Steam Input and SDL: https://github.com/libsdl-org/sdl/issues/10073,
  https://github.com/ValveSoftware/steam-for-linux/issues/10175
- UE background gamepad input: https://answers.unrealengine.com/questions/277506/view.html
- uhid: https://kernel.org/doc/Documentation/hid/uhid.rst,
  https://pkgbuild.com/~ffy00/documentation/hid-tools/hidtools.uhid.html
- RailDriver on Linux: https://forums.dovetailgames.com/threads/guide-how-to-use-raildriver-on-linux.90059
- Proton README: https://raw.githubusercontent.com/ValveSoftware/Proton/proton_10.0/README.md
- KWin: https://develop.kde.org/docs/plasma/kwin/api/, https://invent.kde.org/plasma/kwin/-/merge_requests/5619,
  https://invent.kde.org/plasma/kwin/-/merge_requests/5496, https://github.com/jinliu/kdotool,
  https://discuss.kde.org/t/kwin-mcp-mcp-server-for-gui-automation-using-kwins-eis-interface-and-virtual-sessions/44678
