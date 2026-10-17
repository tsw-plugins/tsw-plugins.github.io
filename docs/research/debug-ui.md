# An in-game UI for the debug menu (2026-10-17)

Question: does our mod or UE4SS give us a way to show a debug menu in the game, or can we reuse the
game's own menus and HUD for it?

Short answer: **yes, three ways, none of them tried in game yet.**

1. The game's own **HUD notifications** take any header and text from Lua through one reflected call.
   That covers output (status, replies to commands).
2. A **UMG widget built at runtime from Lua** (no cooked asset) can show a text menu on top of the
   game. Navigate it with keys polled on the game thread.
3. A **C++ tab in the UE4SS ImGui window** is the richest option (buttons, tables, text input). The
   C++ shim can register one. It is a separate OS window, not an overlay.

Lua has no ImGui API. Classic on-screen debug text (`PrintString`, `AddOnScreenDebugMessage`) is
compiled out of Shipping builds.

Method: read only. Sources were the repo, `external/RE-UE4SS` at `06474186` (the installed zDEV
build), the reflection dumps in `dumps/tsw7-886/`, the installed `ue4ss/` folder, and the web. Nothing
was run in the game. Everything marked *untested* is a reading of the code and dumps.

## 1. What we have today

- `mod-lua/TswCoopDebug/Scripts/main.lua:1-3`: a command bridge with no UI. Commands come from
  `ue4ss/tswcoop/cmd.txt`, polled every 500 ms by the `sched` pump (`main.lua:655-675`), or from the
  game console as `tswcoop <cmd>` (`RegisterConsoleCommandHandler`, `main.lua:676-684`). Replies go to
  `cmd.log` and `UE4SS.log`. `console()` (`main.lua:31-37`) runs any console command through
  `KismetSystemLibrary:ExecuteConsoleCommand`.
- `main.lua:476-489` already reads **from** the HUD: the objective `TextBlock`s under
  `HUDObjectiveWidget.WidgetTree`. This shows UMG widgets are reachable from Lua by `FindAllOf("TextBlock")`.
- `mod/shim/` (C++ `CppUserModBase`, `dllmain.cpp` + `capture.hpp`) has no UI code. The toolchain
  already compiles against UE4SS's headers. `toolchain/out/obj/UE4SS.def` (generated from the
  installed `UE4SS.dll`) exports `CppUserModBase::register_tab`, `UE4SSProgram::add_gui_tab` /
  `remove_gui_tab`, `get_current_imgui_context` and `get_current_imgui_allocator_functions`. It
  exports **no ImGui functions**, so a mod must compile its own ImGui (same version, v1.92.1, already
  vendored in `external/imgui`) and adopt UE4SS's context.

## 2. What UE4SS offers

### The ImGui "UE4SS Debugging Tools" window

- Enabled in the installed `ue4ss/UE4SS-settings.ini:137-158`: `ConsoleEnabled = 1`,
  `GuiConsoleEnabled = 1`, `GuiConsoleVisible = 1`, `GraphicsAPI = dx11`, `RenderMode = ExternalThread`.
  Ctrl+O toggles it (`UE4SS/src/UE4SSProgram.cpp:987`).
- **It is always a separate top-level OS window, never an overlay.** `Backend_Windows::create_window`
  calls `CreateWindow(..., WS_OVERLAPPEDWINDOW, ...)` with its own D3D11 device
  (`UE4SS/src/GUI/Windows.cpp:40-83`), titled "UE4SS Debugging Tools (DX11) - ExternalThread". The
  OpenGL backend opens a GLFW window instead (`GLFW3_OpenGL3.cpp:38`). `RenderMode` only chooses
  which thread renders: `EngineTick` / `GameViewportClientTick` draw into the same separate window
  from the game thread (`UE4SSProgram.cpp:999-1005`).
- Under Proton: the window has been created on this machine. `ue4ss/imgui.ini` was written at
  11:32 today with `[UE4SSData][Backend_Window] Pos=-32000,-32000`, which is where Win32 puts a
  minimised window. Nobody has looked at it on screen yet. On the KDE desktop it should be a second
  XWayland window rendered by DXVK. In Steam Gaming Mode (gamescope) only the focused window is
  shown, so expect not to see it there. To use it the player must alt-tab, which suits a developer
  tool and does not suit players.
- **Tabs from mods: C++ only.** `CppUserModBase::register_tab(name, fn)`
  (`UE4SS/include/Mod/CppUserModBase.hpp:212`, `src/Mod/CppUserModBase.cpp:56-60`) and the
  `on_ui_init()` hook, where `UE4SS_ENABLE_IMGUI()` must run (`CppUserModBase.hpp:58-62`,
  `include/UE4SSProgram.hpp:28-40`). UE4SS renders mod tabs after its own (`src/GUI/GUI.cpp:193-205`).
  The upstream guide is `docs/guides/creating-gui-tabs-with-c++-mod.md`, and
  `cppmods/KismetDebuggerMod/src/dllmain.cpp:21-22` is a working example. The Lua API registers
  no GUI or ImGui function (full list of globals in `src/Mod/LuaMod.cpp`; nothing GUI-related).
- **Threading:** with `ExternalThread` the tab callback runs on the GUI render thread. It must not
  touch UObjects. It should draw a snapshot the game thread copied, and push button presses into the
  shim's main-thread queue (the rule in `AGENTS.md`).
- Caveat: `UE4SS_ENABLE_IMGUI()` busy-waits until UE4SS has created the ImGui context
  (`UE4SSProgram.hpp:31-34`). Call it only from `on_ui_init`, as the guide says.

### Key binds (`RegisterKeyBind`)

- The callback does **not** run on the game thread. Key events are polled in UE4SS's event loop
  (`UE4SSProgram.cpp:1096-1160`, `m_input_handler.process_event()` at 1146, every 5 ms). The Lua
  callback runs right there, holding `LuaMod::m_thread_actions_mutex` (`LuaMod.cpp:1634-1644`).
  That mutex keeps it from running at the same time as the game-thread timers (`process_event_hook` /
  `engine_tick_hook`, `LuaMod.cpp:3799-3818`, which is where `sched` runs). It does **not** keep it
  from running at the same time as `RegisterHook` callbacks or console commands, which take no lock.
  This is the same class of problem as pitfall 1 in `ue4ss-lua-pitfalls.md`.
- Keys only register while the foreground window class is `UnrealWindow` or `ConsoleWindowClass`
  (`deps/first/Input/src/Platform/Win32AsyncInputSource.cpp:12-24`, `PlatformInit.cpp:9`). They do
  not register while the ImGui window has focus.
- **Rule if used:** the callback only sets a Lua flag (`pending = "up"`), and `sched` consumes it.
  No UObject calls inside the callback. Better still, avoid `RegisterKeyBind` altogether and poll keys
  on the game thread (option B below).

### BPModLoader / LogicMods

`BPModLoaderMod` is enabled (`Mods/mods.txt`). It loads `Content/Paks/LogicMods/<Mod>.pak` and spawns
`/Game/Mods/<Mod>/ModActor` (`Mods/BPModLoaderMod/Scripts/main.lua:20,119-161,223-231`). The folder
exists and is empty. There are no `.sig` files next to the game paks, and
`Documents/My Games/TrainSimWorld7/Saved/UserContent/` exists in the prefix, so unsigned paks are
loaded. That folder is DTG's own mod path for editor-made paks ([DTG forum, mod manager
tutorial](https://forums.dovetailgames.com/goto/post?id=1055652)). See option E.

## 3. UMG from Lua (no cooked asset)

Everything needed is reflected in the TSW 7 dump (`UE4SS_ObjectDump.txt.gz`):
`WidgetBlueprintLibrary:Create`, `UserWidget:AddToViewport` / `SetPositionInViewport` /
`SetDesiredSizeInViewport`, `PanelWidget:AddChild`, `CanvasPanel:AddChildToCanvas`,
`VerticalBox:AddChildToVerticalBox`, `TextBlock:SetText` / `SetColorAndOpacity`,
`Border:SetBrushColor`, `ContentWidget:SetContent`, `Widget:SetVisibility`,
`WidgetBlueprintLibrary:SetInputMode_GameAndUIEx` / `SetInputMode_UIOnlyEx`, and the classes
`WidgetTree`, `CanvasPanel`, `VerticalBox`, `TextBlock`, `Border`, `Button`, `ScrollBox`,
`EditableTextBox`. UE4SS Lua has `StaticConstructObject`, `FName` and `FText` globals
(`LuaMod.cpp:1877, 5106, 5115`).

`UWidgetTree::ConstructWidget` is a C++ template, not a UFUNCTION. Its Lua equivalent is
`StaticConstructObject(<widget class>, widgetTree, FName(...))`, then attaching the widget with the
panel's `AddChild*`. This is how UE 4.26 behaves, from memory of the engine source; *untested here*:

- `WidgetBlueprintLibrary::Create` → `CreateWidget` rejects **abstract** classes, and `UUserWidget`
  itself is abstract. So use a concrete native subclass as the host. `UGenericDialogWidget`
  (`/Script/TS2Prototype.GenericDialogWidget`, `UHTHeaderDump-TS2Prototype/Public/GenericDialogWidget.h:6-7`,
  `UCLASS(Blueprintable, EditInlineNew)`, no BP tree, no logic) is a good host.
- For a class that is not a blueprint class, `UUserWidget::Initialize` creates an empty `WidgetTree`.
  We set `WidgetTree.RootWidget` before `AddToViewport`, because the Slate widget is built lazily in
  `RebuildWidget` when it is added to the viewport.
- `StaticConstructObject` of the host directly also works if its outer is the `GameInstance` or the
  `World` (`UUserWidget::GetWorld` follows the outer). `Create` handles this for us.
- **Clicks are hard from Lua.** `UButton::OnClicked` is a dynamic multicast delegate. Lua cannot
  bind a closure to it, and no UFunction of ours exists to bind. Build a **keyboard-driven** list
  instead: a highlighted `TextBlock` row and up/down/enter keys.

On-screen debug text, the classic way:

- `KismetSystemLibrary:PrintString` / `PrintText` are reflected, but in UE 4.26 their bodies are
  compiled only for `!(UE_BUILD_SHIPPING || UE_BUILD_TEST) || USE_LOGGING_IN_SHIPPING`. The TSW exe
  contains the strings `BuildConfiguration` / `Shipping` and "Debug viewmodes not allowed in Test or
  Shipping builds", so expect no output. *Untested.*
- `GEngine->AddOnScreenDebugMessage` is not a UFUNCTION, so Lua cannot call it. Its drawing is a
  non-Shipping path as well.
- `HUD:DrawText` exists, but it is only valid while the HUD canvas is drawing (inside
  `ReceiveDrawHUD`). `TS2GameHUD_BP_C` does not implement `ReceiveDrawHUD`
  (`CXXHeaderDump/TS2GameHUD_BP.hpp:12-15`), so a UE4SS hook on it may never fire. Low priority.

## 4. Reusing TSW's own UI

All of these are native `TS2Prototype` UFUNCTIONs. The game objects exist in a loaded map: the
dump has `TrainingCentreMap:PersistentLevel.NotificationDispatcherActor_2147481305` and
`TS2GameHUD_BP_C_2147481867`.

| Call | What it gives | Notes |
| :--- | :--- | :--- |
| `ANotificationDispatcherActor::FindNotificationDispatcher(WorldContext)` then `CreateAndPostNotificationTimed(FText Header, FText Text, UTexture2D* Image, float TTL)` → `int32 id` | The game's toast at the side of the HUD | `NotificationDispatcherActor.h:29,35`. Also `...TimedTyped` (with `EMessageType` Notification/HelpTip/Alert/Reward/FaultNotification), `...Permanent` (`:41`, stays until `HideNotification(id)` `:23`), `...Dialog(Header, Text)` (`:44`). **Best first output channel.** The image may be nil (*untested*). Assist levels may filter notifications. |
| `ATS2GameHUD::DisplayGenericNotification(FText)` / `UTS2GameHUDWidget::ShowGenericNotification(FText)` | One-line generic notification | `TS2GameHUD.h:55`, `TS2GameHUDWidget.h:229`; implemented in `TS2GameHUD_BP_C` / `HUD_Widget_C` (`CXXHeaderDump/HUD_Widget.hpp:97`). HUD from `PlayerController:GetHUD()` or `FindFirstOf("TS2GameHUD_BP_C")`; widget from `hud:GetHUDWidget()` (`TS2GameHUD.h:52`). |
| `UTS2GameHUDWidget::ShowCustomDialog(FText Title, FText Message, FText Option1, FText Option2)` | The game's **two-choice dialog** | `TS2GameHUDWidget.h:232`, implemented in `HUD_Widget_C` (`HUD_Widget.hpp:108`). The choice comes back through the native `CustomDialogOp1Callback` / `CustomDialogOp2Callback` (`TS2GameHUDWidget.h:342,345`, `Private/TS2GameHUDWidget.cpp:161-164`). `RegisterHook` on those two functions tells us which button was pressed. *Untested:* what the native callbacks do when nobody "owns" the dialog, and whether input focus and pause behave. Good for a yes/no ("accept handover?"), not for a menu. |
| `ShowCustomAcknowledgement(FText)` | Single-button acknowledgement | `HUD_Widget.hpp:127` |
| `ShowInteractionNotification(FText, FKey kb, FKey xbox, FKey ps, float Time)` / `HideInteractionNotification()` | "Press [key] to …" prompt | `TS2GameHUDWidget.h:218,323` |
| `UTS2ButtonPromptManager::GetButtonPromptManager(World)` + `AddButtonPrompt(UObject*, FMainMenuButtonDetails)` | Footer key prompts. `FMainMenuButtonDetails.FunctionName` (`MainMenuButtonDetails.h:24`) names a function on `Object` to call when pressed | Menu-screen machinery; *untested* in a journey. |
| `ts2.dbg.ShowUtilityDebugUI <name>` (cvar list line 292) → `ATS2GameHUD::ShowUtilityDebugUI(TArray<FString>)` (`TS2GameHUD.h:43`) | DTG's own debug widgets, picked from `TS2GameHUD_BP_C.UtilityDebugWidgetClassMap : TMap<FString, TSoftClassPtr<UtilityDebugWidgetBase_C>>` (`TS2GameHUD_BP.hpp:9-12`) | It ships in the game. Example class: `Debug_UIObjectiveActionList_C` (complete/fail objective, save/load, unlock VHIDs). Map keys are unknown; read them with `TMap:ForEach` in a journey. It cannot host our content without a cooked subclass of `UtilityDebugWidgetBase_C` (option E). |
| Pause / end-screen menus (`UTS2PauseMenuWidget`, `UTS2InGameMenuWidget::RestartCurrentGame` / `GoBackToMainMenu`, `UTS2MenuWidgetBase::OpenMenu(TSubclassOf<UTS2MenuWidgetBase>, ...)`) | The game's menu stack | `TS2MenuWidgetBase.h`, `TS2InGameMenuWidget.h`. The menu content (buttons, lists) lives in BP assets. Injecting rows means building child widgets of their BP classes (`DialogButton_C` and others), which needs their exposed properties and delegates. High effort, and every game update can break it. Not recommended. |

**Input for a menu.** Two routes:

- Poll keys **on the game thread** in the `sched` pump with
  `PlayerController:WasInputKeyJustPressed({KeyName = FName("F8")})` / `IsInputKeyDown` (both
  reflected, `/Script/Engine.PlayerController`). This avoids the threading issue of `RegisterKeyBind`.
  *Untested:* whether TSW's input mode or menu stack swallows the keys, and the struct-from-table
  conversion for `FKey`.
- `RegisterKeyBind` with only the flag-setting rule from section 2.

Pick keys the game does not bind (the F-keys are partly taken by cameras; check the TSW keymap).

## 5. Blueprint mod (cooked widget pak)

Feasible, at high effort. DTG publishes the **Train Sim World PC Editor (Beta)** on the Epic Games
Store. It is UE4-based and tied to owning TSW on PC ([Epic store
page](https://store.epicgames.com/p/train-sim-world-6--train-sim-world-pc-editor-beta),
[DTG FAQ](https://support.dovetailgames.com/hc/en-us/articles/28572815421330-Train-Sim-World-PC-Editor-beta-FAQ)).
The listing shown is the TSW 6 one. Whether a TSW 7 editor exists, and whether its 4.26 build cooks
`WidgetBlueprint`s compatible with TSW 7 build 886, is not verified. A vanilla UE 4.26 editor plus
the `.usmap` could also cook a `ModActor` + WBP pak for `LogicMods`. That is the usual UE4SS route
when no mod kit exists. Downsides: an extra toolchain (Windows editor install, cooking), and a
binary asset in the repo that must be rebuilt per game version. Our Lua or C++ would then drive the
widget through its BP functions. Defer it until the runtime-built UMG proves too limited.

## Ranking

| # | Option | Effort | Risk | Players see it in game? |
| :--- | :--- | :--- | :--- | :--- |
| A | **Game notifications** (`CreateAndPostNotificationTimed` / `...Permanent`) for output | very low (≈20 lines of Lua) | low: native, used by the game every session | yes |
| B | **Runtime UMG text menu** (`Create` with `GenericDialogWidget` host, `CanvasPanel` → `Border` → `VerticalBox` of `TextBlock`s, `AddToViewport(1000)`), keys polled on the game thread | medium (≈150 lines of Lua) | medium: native crash risk if a widget is built wrong (use `IsValid` everywhere, pitfall 3). GC: keep a reference, and `RemoveFromParent` before travel or a reload | yes |
| C | **ImGui tab in the C++ shim** (`register_tab` + own ImGui 1.92.1 + `UE4SS_ENABLE_IMGUI`) | medium (C++ build already exists; add imgui sources, a snapshot struct, a command queue) | low for the game (separate window, no UObject access from the render thread); Proton: separate DXVK window, invisible in gamescope | no: separate window, needs alt-tab. Best for developer tooling |
| D | **Game dialogs** (`ShowCustomDialog` + hooks on `CustomDialogOp1/2Callback`) for yes/no prompts | low | medium: behaviour of the native callbacks unknown | yes |
| E | **Cooked widget blueprint pak** via BPModLoader/LogicMods or UserContent | high (editor plus cooking per game version) | medium: version coupling | yes, looks native |
| F | Inject into pause/main menus, `ShowUtilityDebugUI` | high / not hostable | high: BP internals | n/a |
| — | `PrintString`, `AddOnScreenDebugMessage`, `HUD:DrawText` | n/a | compiled out (Shipping) or never fires | no |

## Recommended first prototype

Do it in Lua through the bridge (`tswlua -f`), and promote it into `TswCoopDebug` once it works:

1. **Toast (A):**
   ```lua
   local cls = StaticFindObject("/Script/TS2Prototype.Default__NotificationDispatcherActor")
   local d = cls:FindNotificationDispatcher(pc())          -- check IsValid
   local id = d:CreateAndPostNotificationTimed(FText("tsw-coop"), FText("bridge ready"), nil, 5.0)
   ```
   Then `CreateAndPostNotificationPermanent` + `HideNotification(id)` for a sticky status line.
2. **Text menu (B)**, all on the game thread inside one `sched` callback:
   ```lua
   local WBL  = StaticFindObject("/Script/UMG.Default__WidgetBlueprintLibrary")
   local host = WBL:Create(pc(), StaticFindObject("/Script/TS2Prototype.GenericDialogWidget"), pc())
   local tree = host.WidgetTree                            -- created by Initialize; IsValid
   local canvas = StaticConstructObject(StaticFindObject("/Script/UMG.CanvasPanel"), tree, FName("TswCoopCanvas"))
   tree.RootWidget = canvas
   local box  = StaticConstructObject(StaticFindObject("/Script/UMG.VerticalBox"), tree, FName("TswCoopRows"))
   canvas:AddChildToCanvas(box)                            -- returns the slot; set position/size on it
   for i, label in ipairs(items) do
       local t = StaticConstructObject(StaticFindObject("/Script/UMG.TextBlock"), tree, FName("Row" .. i))
       t:SetText(FText(label)); box:AddChildToVerticalBox(t)
   end
   host:AddToViewport(1000)
   ```
   Highlight the selected row with `SetColorAndOpacity` (`FSlateColor`) and navigate with
   `WasInputKeyJustPressed` in the pump. Enter runs the item through the existing `run(line)`
   dispatcher, so the menu is just a front-end for `tswcmd` commands. Close with
   `RemoveFromParent()`. If `Create` returns an invalid object, fall back to
   `StaticConstructObject(GenericDialogWidget, gameInstance)`.
3. Only if B turns out to be too fiddly, or for richer developer tooling: the ImGui tab (C) in
   `mod/shim`.

Things to verify in that first run: whether notifications show with a nil image, how `FText`
behaves as a parameter, whether `FKey` converts from a table, whether TSW's input stack swallows
polled keys, and whether the widget survives map travel. It probably does not, so re-create it on
`ClientRestart`.
