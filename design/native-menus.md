# Native, mouse-driven menus (2026-10-18)

Goal: replace the key-driven text overlays (`menu.rs` F9 menu, `chat_box.rs`, `scoreboard/`) with
real menu entries that look and behave like the game's, and add a plugin indicator on every menu
screen. Read-only research: header dumps of build 886, the object dumps, and the cooked menu assets
read straight out of the paks (see "Method").

## Verdict

**Native injection is possible, at medium effort, without any cooked asset.** Three findings make
it possible:

1. The game has its own **menu stack on the HUD** with a native call that pushes a widget *instance*
   we created: `ATS2HUDBase::OpenCreatedWidget(UTS2MenuWidgetBase*, isOverlay, canBack,
   EWidgetStack, shouldCloseOverlays, Animate, alwaysVisible)`
   (`CXXHeaderDump/TS2Prototype.hpp:10813`). `UTS2MenuWidgetBase` and `UTS2MainMenuWidget` are
   *not* abstract (`UHTHeaderDump-TS2Prototype/Public/TS2MenuWidgetBase.h:14`,
   `TS2MainMenuWidget.h:21`: `UCLASS(Blueprintable, EditInlineNew)`). So a runtime-built screen
   can live on the real stack, and the game handles back, fades and focus for it.
2. Every menu screen is a widget blueprint whose buttons sit in **plain UMG panels we can add to**:
   a `HorizontalBox` in the main navigation bar, a `GridPanel` on the home screen and in the pause
   options, a `WrapBox` of categories in Settings. The button widgets are **reusable BP classes**
   (`ScreenButton_C`, `MainTileButton_C`, `PauseTileButton_C`, `DialogButton_C`), so an added
   entry looks native.
3. A click can be observed **without a `ProcessEvent` hook**. Options: poll `UButton::IsPressed` /
   `UWidget::IsHovered`, or use the game's own "call function *name* on *object*" buttons
   (`UTS2MainMenuControlButtonWidget::SetButtonFunction`, `FMainMenuButtonDetails.FunctionName`).
   For the second, the target is one native `UFunction` whose `Func` pointer (`UFunction::Func =
   0xD8`, `dumps/tsw7-886/UE4SS.log:280`) we swap for our own thunk.

There is **no data-driven list of menu entries** to append to. The entries are fixed BP variables,
wired at compile time through `ComponentDelegateBinding`s. So injection means adding widgets to
panels, not adding rows to a table.

**Recommendation:** runtime UMG on the game's own stack and panels (option 1 + option 3a below).
Reuse the game's BP button classes for the entry points. Build our screens from those classes plus
plain UMG. Keep it fail-soft: if a panel or class name is missing after a game update, log it and
fall back to the plugin indicator alone. Skip ImGui and cooked paks.

## Method

- Pak indices: v11, zlib, **unencrypted index and data** (footer compression methods `['Zlib']`).
  None of the shipped paks has a `.sig` next to it, in `Content/Paks` or `Content/DLC`. A ~60-line
  Python reader (directory index → encoded entry → zlib blocks) pulled out the `.uasset` files of the
  menu widgets. Their name tables list the widget variables, functions, events and parent classes.
  That gives the structure, but not the layout or the BP logic order.
- The object dumps hold no main-menu BP classes: the startup dump is taken before the menu, and the
  other dump is in a route. The class names below come from the paks and the headers.
- Asset versions: `FileVersionUE4 = 522` (4.26), **`FileVersionLicenseeUE4 = 5`** (DTG's own engine
  changes), from `ScreenButton.uasset`.
- No CommonUI (0 hits for `CommonUI`/`CommonActivatable` in the dumps), no WebBrowser/CEF module.
  The menus are plain UMG on top of DTG's own base classes.

## 1. How TSW builds its menus

### Native base classes (`CXXHeaderDump/TS2Prototype.hpp`)

| Class | Line | What matters |
| --- | --- | --- |
| `ATS2HUDBase : AHUD` | 10765 | `MainWidgetStack` / `OverlayWidgetStack` / `DialogWidgetStack` (`TArray<FWidgetInfo>` at 0x420/0x430/0x440); `OpenMenu_Blueprint`, **`OpenCreatedWidget`**, `MenuBack`, `MenuBackTo`, `GetTopMenuInStack`, `IsMenuInStack`, `AddMenuToStack`, `RemoveMenuFromStack`, `RefocusCurrentTopWidget`, **`BindUIInputAction(Object, ActionName, KeyEvent, FunctionName)`**, `GetThemeTexture(FName)`, `HeaderWidget`, `FooterWidget` |
| `ATS2FrontEndHUD` / `ATS2GameHUD` | 10703 / 10728 | Both derive from `ATS2HUDBase`, so the same stack API serves the main menu *and* the pause menu in a route |
| `FWidgetInfo` | 9260 | `{UTS2MenuWidgetBase* Widget; bool isOverlay, CanGoBack, alwaysVisible}`, 0x10 bytes |
| `EWidgetStack` | `TS2Prototype_enums.hpp:3412` | `Main`, `Overlay`, `Dialog` |
| `UTS2MenuWidgetBase : UUserWidget` | 19652 | `OpenMenu`, `OpenExistingMenu`, `AddMenu`, `MenuBack`, `OnWidgetOpen` / `OnWidgetClose` (BlueprintNativeEvent), `RefocusCurrentWidget`, `bAllowBack` |
| `UTS2MainMenuWidget` | 19608 | `SetMenuTitle(Name, Subtitle, Icon)`, `ShowFooterButtons(...)`, `SetFooterActive(EMenuType)`, `EnableBackOverride` / `DisableBackOverride`, `OnMenuBackPressed` |
| `UTS2MainMenuFooterWidget` | 19429 | parent of `MainNavigationBar_C`; `SetFooterType`, `OnNextPage` / `OnPreviousPage` (LB/RB) |
| `UTS2MainMenuControlButtonWidget` | 19400 | `KeyboardKey`, `ControllerKey`, `Description`, `FunctionName`, **`SetButtonFunction(UObject*, FName)`**, **`CallButtonDelegate()`** (all native) |
| `UTS2ButtonPromptManager` | 17866 | `GetButtonPromptManager(World)`, **`AddButtonPrompt(UObject*, FMainMenuButtonDetails)`**, `RemoveButtonPromptWithDescription` |
| `FMainMenuButtonDetails` | 3137 | `ControllerType`, `KeyboardType` (FKey), `Description`, **`FunctionName`**, `Interactable`, `ActionName`, `CustomWidget` |
| `UTS2GameButton : UButton` | 18172 | adds focus and keyboard-click delegates; used inside the tile buttons |
| `UTS2HomeScreenWidget` | 19216 | `HomeScreenGrid` (`UGridPanel*` 0x298), **`SetTileSizeOnGrid(TileButton, RowSpan, ColSpan)`**, `AddCMSButtonDetails(FDynamicUpsellButton)` |
| `UTS2TileButtonBase` | 19963 | `Size`, `TopCanvasPanel`, `ButtonOverlay`, `SetSize` |
| `UTS2PauseMenuWidget : UTS2InGameMenuWidget` | 19710 | `OnBackPressed`, `OnTogglePauseMenuPressed`, `OnGoBack` |
| `UTS2MainMenuSettingsWidget` | 19524 | thin: DTL login and help functions |
| `UGenericDialogWidget` | 13774 | `SetTitle`, `SetDescription` |

### The blueprints (from the cooked name tables)

All under `/Game/Core/Assets/HUD/`.

| Screen (BP) | Parent | Container we can add to | Existing entries | How a click is wired |
| --- | --- | --- | --- | --- |
| `MenuScreens/MainMenu` (`MainMenu_C`) | `TS2MainMenuWidget` | root canvas (our logo already hangs there) | — | `ClearStacks`, `OpenMenu`/`OpenExistingMenu` of `HomeScreen_C`, `MainNavigationBar_C`, `MainMenuProfileHeader_C`, `ButtonPromptWidget_C`, `TSWLogoImage_C` |
| `MenuScreens/Elements/MainNavigationBar` | `TS2MainMenuFooterWidget` | **`ScreenButtonBox` (HorizontalBox)**; `ScreenButtons` array (LB/RB order) | `HomeButton`, `LiveButton`, `QuickdriveButton`, `SettingsButton`, `StoreButton`, `ProfileButton` (all `ScreenButton_C`) | `BndEvt__<Var>_..._OnScreenButtonClicked` per *variable*; `SelectScreenButton`, `MenuBackTo` + `OpenMenu_Blueprint` |
| `MenuScreens/FlowScreens/HomeScreen` | `TS2HomeScreenWidget` | **`HomeScreenGrid` (GridPanel)** | `MainTileButton_C` tiles: `ResumeButton`, `ResumeJourneyButton`, `RideNowButton`, `TrainingButton`, `SettingsButton`, `StoreButton`, `DTLiveButton`, `CreatorsClubButton`, `ArtemisButton`, `StartCollectionButton` | `BndEvt__<Var>_..._OnClicked`; `SetRow`/`SetColumn`/`SetTileSizeOnGrid` |
| `MenuScreens/Settings/MainMenuSettigns` (sic) | `TS2MainMenuSettingsWidget` | **`CategoryButtonsWrapBox` (WrapBox)**; a `WidgetSwitcher`; `CurrentSettingsWidget` | `DialogButton_C`: `GeneralButton`, `AudioButton`, `ControlsButton`, `HUDButton`, `AccessibilityButton`, `AdvancedButton`, `DTLButton`, `PlayerAssistButton`, `Troubleshooting` | `BndEvt__DialogButton_N_..._ButtonClicked` → `SelectCategory` |
| `Widgets/PauseMenu/PauseMenuWidget` | `TS2PauseMenuWidget` | `PauseMenuWidgetSwitcher` (WidgetSwitcher) | pages `PauseOverviewWidget_C`, `PauseMenuOptionsWidget_C`, schedule, log, map, help, controls | `SelectTab`, `ButtonPromptWidget`, `ControlButton_C` prompts |
| `Widgets/PauseMenu/PauseMenuNavigationBar` | `TS2MainMenuWidget` | **`TabsBox` (HorizontalBox)**, `TabButtons` array | `ScreenButton_C`: `OverviewButton`, `MapButton`, `ScheduleButton`, `LogButton`, `OptionsButton`, `ControlsButton`, `HUDGuideButton`, `HelpButton` | `SelectTab` → `SetActiveWidgetIndex` on the switcher; `NextTab`/`PreviousTab` on shoulders |
| `Widgets/PauseMenu/PauseMenuOptionsWidget` | `TS2InGameMenuWidget` | **`ButtonsGridPanel` (GridPanel)** | `PauseTileButton_C`: `SettingsButton`, `SaveButton`, `RestartButton`, `PhotoModeButton`, `MainMenuButton`, `ExitButton` | `BndEvt__PauseTileButton_N_..._OnClicked` |
| `MenuScreens/Dialog/DialogWidget` | `TS2MainMenuWidget` | — | `Button1`, `Button2` (`DialogButton_C`), `Title`, `Description` | `SetDialogData`, `Option1Clicked` / `Option2Clicked` delegates |
| `MenuScreens/Elements/ControlButton` | `TS2MainMenuControlButtonWidget` | — | footer key prompt | **calls `CallButtonDelegate`** (it is in the name table) |
| `ScreenButton_C`, `PauseTileButton_C`, `MainTileButton_C`, `DialogButton_C` | — | — | — | own `OnScreenButtonClicked` / `OnClicked` / `ButtonClicked` delegates; they do **not** call `CallButtonDelegate` |

Element widgets the paks offer for our own screens (`MenuScreens/Elements/`,
`MenuScreens/Settings/Widgets/`): `CheckboxWidget`, `ToggleButton`, `DropdownButton` /
`DropdownWidget`, `RadioButton`, `TabButton`, `VerticalTabButton`, `SubsectionHeader`,
`MainMenuSettingsSimpleButton`, `MainMenuSettingsSliderButton`, `MainMenuSlider`,
`MainMenuSettingsSelectableSlider`, `PaginationButton`, `SimpleIconButton`, `ScrollingText`, plus
`Header/MainMenuTitleHeader`.

### Data-driven entries?

None that we can use. The only data-driven pieces are:

- **CMS upsell tiles** on the home screen: `AddCMSButtonDetails(FDynamicUpsellButton)`,
  `UpsellBtnDetails : TArray<FUpsellDetails>` (`TS2Prototype.hpp:8989`). Their actions are store and
  article links only.
- **Button prompts** (`FMainMenuButtonDetails`). These *are* a supported way to add a clickable,
  key-bound entry; see 3b.
- Prompt icons (`ButtonPromptDataTable`, `FButtonPromptData`) and tips (`GetTipsFromDataTable`).
  These are cosmetic.

### When a screen appears

`OnWidgetOpen` / `OnWidgetClose` are BlueprintNativeEvents, and most BPs override them
(`MainMenu_C`, `DialogWidget_C`, `MainMenuSettigns_C`, `PauseMenuWidget_C`). An override is a
script function, so patching the native thunk would not see those calls. `Construct` is BP-only.
**Poll instead:** once per tick, read `GetTopMenuInStack(Main/Overlay/Dialog)` on the player
controller's HUD, or read `MainWidgetStack` directly (0x420). When the top widget changes, find its
class (`MainMenu_C`, `HomeScreen_C`, `MainMenuSettigns_C`, `PauseMenuWidget_C`, …), look up its
panel by property name (`find_property(class, "ScreenButtonBox")`), and inject. Mark the panel as
done by keeping a `Held` to our child, as `menu_logo.rs` does. The cost is one native call and a
pointer compare per frame.

## 2. Injecting an entry: mechanics

1. **Get the class.** `find_paths` if it is loaded (on that screen it is), otherwise
   `LoadClassAsset_Blocking` (`Engine.hpp:13172`; `ghost.rs:390-406` already does this).
2. **Create** with `WidgetBlueprintLibrary::Create(World, Class, PlayerController)` (`UMG.hpp:1953`).
   A BP widget gets its full tree and BP logic, and so looks exactly like the game's.
3. **Configure before adding.** Set its BP variables by reflection: for `ScreenButton_C` that is
   `ButtonText` / `IconTexture` / `Description` / `ButtonIndex`; for `DialogButton_C`, `ButtonText`;
   for tiles, call `SetTitle` / `SetSubtitle`. `PreConstruct` applies them when Slate builds the
   widget. Icons: `ImportFileAsTexture2D` (already in `umg.rs`) or `ATS2HUDBase::GetThemeTexture`.
4. **Add** with `AddChildToHorizontalBox` / `AddChildToGrid` (`UMG.hpp:661`) /
   `AddChildToWrapBox` (`UMG.hpp:2182`). For a home tile, also call
   `UTS2HomeScreenWidget::SetTileSizeOnGrid`. The panel slot keeps it alive for the GC.
5. **Detect the click.** The BP's `BndEvt` bindings are made per *variable* at `Initialize`, so our
   button's own delegate fires into nothing. The game ignores it, and we observe it ourselves:
   - **3a. Polling (zero hooks).** Find the inner `UButton` (`Button` property on `ScreenButton_C`
     and the tiles). Each tick read `IsPressed()` (`UMG.hpp:320`) and `IsHovered()`
     (`UMG.hpp:1810`). A click is pressed→released while hovered. Gamepad A / Enter on a focused
     button also holds `IsPressed` until key-up (SButton press method `DownAndUp`), so it works too.
     The cost is two native calls per visible entry per frame. It misses a press and release inside
     one frame, which does not happen at menu frame rates.
   - **3b. A callback thunk.** Take one parameterless native `UFunction` and replace its `Func` at
     `+0xD8` with our `exec` thunk. The thunk calls the original unless `Context` is one of our
     *listener* objects (one cheap `UObject` per entry). Point the game's name-based callers at it:
     `SetButtonFunction(listener, name)` on a `ControlButton_C` / `ScreenButton_C`,
     `FMainMenuButtonDetails.FunctionName` for prompts, `BindUIInputAction` for keys. This is exact
     and fires the same frame. It touches no `ProcessEvent` hook, so it does not collide with UEVR's
     global hooks. Pick the function so the game never reaches it through `ProcessEvent` on our
     listener class. *Untested.*
   - Avoid: appending to a `FMulticastScriptDelegate` ourselves. It needs a `FWeakObjectPtr` with a
     serial number (`FUObjectArray` serial allocation) and a GMalloc realloc of the `TArray`.
     `engine.rs` only wraps `Free`.
6. **Act.** Usually by pushing our own screen (next section).

**Navigation:** UMG's default navigation is spatial, so D-pad focus reaches an added button in a
`HorizontalBox` / `GridPanel` / `WrapBox` without extra work. The main bar's LB/RB cycling walks the
`ScreenButtons` array, which we would have to append to; leave that out at first. Mouse works
unchanged, because the menus already run in UI input mode with a cursor.

### Our own screen on the game's stack

1. Create a host instance: `Create(World, /Script/TS2Prototype.TS2MainMenuWidget, PC)`. This is a
   concrete native class. In 4.26 `UUserWidget::Initialize` gives a non-BP widget an empty
   transient `WidgetTree` (from engine source memory; verify).
2. Build the tree. Set `WidgetTree.RootWidget` (the `Ui::root_widget` property `umg.rs` already
   resolves) to a canvas holding a game title header (`MainMenuTitleHeader_C`) and a `ScrollBox` of
   rows made from the game's element BPs (`MainMenuSettingsSimpleButton_C`, `CheckboxWidget_C`,
   `MainMenuSlider_C`, `DialogButton_C`) or plain `UButton` / `UCheckBox` / `USlider` /
   `UEditableTextBox` (all reflected, `UMG.hpp:293,366,1332,579`).
3. Push it: `HUD.OpenCreatedWidget(w, isOverlay=false, canBack=true, Main, shouldCloseOverlays=false,
   Animate=true, alwaysVisible=false)`. Back (Esc / B) pops it through `MenuBack`, and the stack
   array keeps it referenced. For a modal, use `EWidgetStack::Dialog`, or open the game's own
   `DialogWidget_C` and fill it with `SetDialogData` (a BP function; read its parameter layout at
   runtime).
4. Optionally call `SetMenuTitle` and `ShowFooterButtons` on it, and add footer prompts through
   `UTS2ButtonPromptManager::AddButtonPrompt(ourWidget, {Description:"Back", KeyboardType:Escape,
   FunctionName:…})`.

In a route the same applies: `ATS2GameHUD` is also an `ATS2HUDBase`, and the pause menu is on its
stack.

### Feasibility per entry point

| Entry point | How | Rating |
| --- | --- | --- |
| Main nav bar "Multiplayer" button | `ScreenButton_C` → `ScreenButtonBox` | **medium** (LB/RB order needs the array; skip) |
| Home screen tile | `MainTileButton_C` → `HomeScreenGrid` + `SetTileSizeOnGrid` | **medium** (find a free row/column; the CMS tiles move around) |
| Settings category "Multiplayer" | `DialogButton_C` → `CategoryButtonsWrapBox`, click pushes our screen on top | **medium**, the most natural home for coop settings |
| Pause menu Options tile | `PauseTileButton_C` → `ButtonsGridPanel` | **medium** |
| Pause menu tab with its own page | `ScreenButton_C` → `TabsBox`, page → `PauseMenuWidgetSwitcher`, set `ButtonIndex`, append `TabButtons` | **hard** (BP index logic; TArray append) |
| Footer key prompt ("F9 Multiplayer") | `AddButtonPrompt` with `FunctionName` → 3b | **easy–medium**, but needs 3b |
| Own full screen | `OpenCreatedWidget` | **medium** |
| Replacing/changing existing entries | edit BP graphs | **impossible** at runtime |

What breaks on a game update: renamed BP variables (`ScreenButtonBox`, `ButtonsGridPanel`,
`CategoryButtonsWrapBox`, `HomeScreenGrid`) and BP class paths. Resolve everything by name. Extend
`server/crates/tsw-coop-client/tests/mod_assets.rs` to check the class paths against the paks, and
at runtime log and skip anything that is missing. Native signatures (`OpenCreatedWidget`,
`SetButtonFunction`, `AddButtonPrompt`) have been stable since the stack design, which predates
TSW 7.

## 3. Asset approach (cooked pak)

- **Can a pak add or override assets? Yes.** Nothing is signed (no `.sig` anywhere), indices are not
  encrypted, and UE mounts every `Content/Paks/*.pak`, with `_P` paks taking priority.
  `Content/Paks/LogicMods/` exists, and UE4SS's `BPModLoaderMod` is enabled in `ue4ss/Mods/mods.txt`
  (only when UE4SS is loaded; we ship our own `dwmapi.dll`). DTG's own mod path is
  `Content/DLC/*.pak` (the official DLC sit there too).
- **Toolchain.** DTG publishes the *Train Sim World PC Editor (beta)* on the Epic store. It packages
  through UnrealPak from its `ModStaging` folder ([DTG forum](https://forums.dovetailgames.com/goto/post?id=1050804),
  [mod manager tutorial](https://forums.dovetailgames.com/goto/post?id=1055652)). The listing found
  is for TSW 6; a TSW 7 editor is unverified (`debug-ui.md` §5). The alternative is stock UE 4.26
  plus a stub `TS2Prototype` module generated from `UHTHeaderDump-TS2Prototype`, so a WBP can derive
  from `UTS2MainMenuWidget`. Stock 4.26 writes licensee version 0. The game is at 5, and loading a
  *lower* licensee version is accepted, but DTG's custom serialization for their own types is a risk.
- **Override (`MainMenu_P.pak` replacing `MainNavigationBar`).** This replaces DTG's asset as a
  whole. The next patch that touches it leaves a stale copy that breaks the menu. It also ships a
  modified DTG asset, which is a licensing problem. **Do not.**
- **Add-only (our own WBP in a LogicMods or DLC pak).** This is legitimate and looks fully native
  (designer layout, animations), but it needs the Windows editor install, a cook per game version,
  binary assets in the repo, and the injection code from section 2 anyway to put the entry point
  into DTG's screens.
- **Rating: hard**, and it buys little over runtime UMG built from DTG's own element BPs. Keep it as
  a later polish step, for example one hand-designed "Plugins" screen.

## 4. Alternatives for mouse-driven menus

| Option | Look | Effort | Robustness to updates | VR (UEVR / flat2vr) | Rating |
| --- | --- | --- | --- | --- | --- |
| **Runtime UMG with the game's BP elements**, pushed with `OpenCreatedWidget` (recommended) | native (same buttons, fonts, sounds, back handling) | medium | good: name lookups that degrade gracefully | **yes**: Slate/UMG is what UEVR projects onto its UI plane | **recommended** |
| Runtime UMG with plain `UButton`/`UCheckBox`/`USlider` (no BP elements) | clean, not DTG-styled unless we copy brushes | medium | best: engine classes only | yes | fallback |
| ImGui/egui overlay on a present hook (as `dayz-plugin-loader`: `dxgi.dll` proxy, egui + `egui-directx11`, `crates/dayz-plugin-loader/src/win/ui/mod.rs:1-11`) | foreign | **hard**: TSW 7 renders **D3D12** (default since TSW4, `performance.md:170`; `vkd3d-proton.cache` next to the exe), so it needs a D3D12 command-queue/present hook through VKD3D-Proton, plus WndProc input capture | good against game patches, fragile against Proton/VKD3D/UEVR | **no**: drawn into the flat back buffer after Slate; UEVR also hooks D3D12 present (`06-discord-flat2vr-tsw7-thread.md:106-111`) | dev tools only |
| Web UI on our local server (`mod/native/src/web/`) | browser | easy | best | no (alt-tab; Steam overlay browser at most) | companion (map, admin), not menus |
| UE4SS ImGui window | separate window | low | — | no | dev only (`debug-ui.md` C) |

The DayZ loader draws everything itself because DayZ (Enfusion) has no reflected UI system to
borrow. TSW has one, fully reflected, and borrowing it is what makes the result native.

## 5. Plugin indicator ("puzzle piece")

**Host.** One small widget of our own, kept on the **viewport** rather than on each screen. A
`TS2MainMenuWidget` instance, created once, with `AddToViewport(ZOrder high)` and root visibility
`SelfHitTestInvisible`, so only the icon takes the mouse. It survives screen changes. Viewport
widgets are dropped on map travel (`RemoveAllViewportWidgets` on LoadMap), so the existing
`in_viewport` check (`umg.rs`, as in `menu_logo.rs`) re-adds it. Show it only while a menu is up:
the front-end HUD, or any non-empty stack on the game HUD (pause menu). Hide it while driving so it
never takes the cursor.

**Anchor.** A corner the game leaves free. The top right holds `MainMenuProfileHeader`, the top
centre the nav bar, the bottom centre our logo and button prompts. Default to bottom-left with a 24
px margin (`CanvasPanelSlot` anchors (0,1), alignment (0,1)), configurable. Check it on the home,
settings and pause screens with a screenshot.

**Icon.** A 48×48 `UImage` wrapped in a `UButton` with a transparent style (or `SimpleIconButton_C`
for the game's hover glow). The texture is a PNG via `ImportFileAsTexture2D`, as `logo.png` is
today.

**Hover / tooltip.** No polling needed: `UWidget::SetToolTipText(FText)` (`UMG.hpp:1785`) gives
Slate's native delayed tooltip with mouse follow. Use it for the text ("UE4SS v… (date)" if
`UE4SS.dll` is loaded, read from its version resource; then "- TSW SDK v{ver} by {authors}", one line
per loaded plugin). For a styled tooltip, call `SetToolTip(UWidget)` (`UMG.hpp:1786`) with a
`Border` + `VerticalBox` of `TextBlock`s built like the scoreboard. Rebuild the content when the
plugin list changes.

**Click.** 3a polling on the icon's `UButton` (`IsPressed` falling edge while `IsHovered`), or 3b.
On click, push the **Plugins** screen with `OpenCreatedWidget(…, Main, canBack=true)`: a title header
and one row per plugin (name, version, authors, status) with a `CheckboxWidget_C` "enabled next
start" and a `DialogButton_C` "Settings" that pushes that plugin's own settings screen. The game's
Back closes it.

**Gamepad.** Give the icon a focusable button and a footer prompt (`AddButtonPrompt`, e.g. View/Back
+ "Plugins") on the screens we recognise, since a corner icon is hard to reach by D-pad.

## Suggested order

1. Click detection 3a, and stack polling (`GetTopMenuInStack`): the plugin indicator with tooltip.
   This proves the hover, click, viewport and travel cycle.
2. Our screen via `OpenCreatedWidget` (Plugins screen), first with plain UMG, then with the game's
   element BPs.
3. Entry points: Settings category "Multiplayer", pause options tile, main nav button. Each guarded
   by name lookups.
4. Port the F9 menu, scoreboard and chat input onto these screens; remove the key-driven overlays.
5. Only if 3a proves limiting: the 3b thunk, then footer key prompts.

## Open (to verify in game)

- `Create` of a native `TS2MainMenuWidget` yields an empty `WidgetTree`, and `OpenCreatedWidget`
  shows it with our `RootWidget` (fades use `FadeLayers`; an empty array is assumed to be fine).
- The exact variable names and types inside `ScreenButton_C` / `MainTileButton_C`
  (`ButtonText`, `Button`) as reflected at runtime. Dump their properties once on the main menu.
- `SetDialogData` parameter layout (BP function) for reusing `DialogWidget_C`.
- Whether the indicator corner collides with any screen's prompts.
