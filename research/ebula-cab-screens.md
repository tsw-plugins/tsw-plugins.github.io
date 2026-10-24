---
name: ebula-cab-screens
description: >-
  Every drivable train in the TSW 7 and TSW 5 pak dumps, checked for a cab EbuLa or timetable screen: how
  each one is built (UMG page, static texture, nothing), its page class, root widget, draw size and where the
  timetable sits, whether tsw-ebula's `is_ebula_page` matches it today and why not, the physical keys next
  to each screen with what the game does with them, one free key per screen type to toggle tsw-ebula's
  classic and modern looks, and the static-screen cases. Ends with an implementation proposal for tsw-ebula
  and tsw-sdk.
game_build: 26080373 (TSW 7; base, LeftRhine, European and UK content pack re-dumped), TSW 5 as installed 2026-10-24
created: 2026-10-24T03:30+0200
last_edited: 2026-10-24T03:30+0200
---

# EbuLa cab screens in every train (2026-10-24)

The owner wants our EBuLa page on the train's own EbuLa screen in every train that has one, with no HUD
panel floating beside an empty screen. This page lists what the game has and what tsw-ebula would
need for each. The background (how a cab screen is hosted and drawn on) is in [ebula.md](ebula.md)
Part 3. The two looks are in [ebula-real-screens.md](ebula-real-screens.md) and
[ebula-alt-view.md](ebula-alt-view.md).

Markers: **[V]** read in the decompiled game data or the raw assets. **[I]** inferred.
*Unverified in game* means nobody has seen it in a running game yet.

## Summary

- **36 drivable trains**: 30 in TSW 7 (13 paks) and 6 in TSW 5 (7 paks). Every class with its own
  cab counts once per DLC copy. TSW 5 has no German route paks, only New Journeys BR 423 and the
  Training Centre.
- **23 have a UMG EbuLa page** (kind a): 20 in TSW 7 and 3 in TSW 5. **3 have a physical EbuLa unit
  with keys but no page and no render target** (kind b: LeftRhine BR 103, BR 110 and the Bnrdzf 463
  cab car). **10 have no timetable screen** (kind c: UK, US and steam trains, the BR 363 shunter).
- **Missed today** (no page on the cab screen, so the HUD panel takes over):
  1. **BR 442 Talent 2** (`WBP_DLG_DB_BR442_ESF_C`): the name lacks "ebula", and the tree has no
     `CanvasPanel` anywhere (`InvalidationBox` → `Overlay` → `Border` / `VerticalBox`), so
     `canvas_in` would fail even with the name fixed.
  2. **BR 411 ICE-T** (FTF, DLG; `MTD_*_BR411_MFA_Ebula_C`): the name and canvas match, but the page
     is made lazily. It exists only after the driver has stepped the right MTD screen to it with
     the UD key. Until then there is nothing to find.
  3. **LeftRhine BR 103, BR 110, Bnrdzf 463** (new in this dump): the cab has an EbuLa housing and
     ten working keys (`S3_*`), but no widget component and no screen material. That is the
     "empty physical screen with the panel beside it" the owner saw.

  Every other page matches by name and has a canvas within `canvas_in`'s four levels. *Unverified in
  game* for the BR 146.2, BR 185.2, Vectron, BR 423 (FTF, CTP) and Training Centre trains: so far
  only the BR 143, BR 430 and the FSN Dosto cab car have been seen working.
- **Toggle key**: no free key changes any state on its page widget, because a free key is one the
  game ignores on that screen. So the state to read is the key itself: the `UPushButtonComponent` on
  the train's simulation actor (`RVM_*`), `GetCurrentInputValue()` (1 while held) or its reflected
  bool `bIsPushed`. tsw-sdk's `cab::controls` already reads `UVirtualHIDComponent`s by name.
  The proposed key is **UD** wherever the EbuLa screen has a free one: BR 143/114 `Ebula_UD`,
  the S-Bahn `S3_Button_UD`, the Dosto `Timetable_Button_UD`, the Vectron `S4_Button_UD`, the BR 442
  `S3_Button_UD` and LeftRhine `S3_UD`. The BR 146.2/185.2 EbuLa screen has only four keys, so there it is
  `S3_Button_0`. On the BR 411, UD is the page key, so there it is `S2_09`.
- **Static screens** (LeftRhine): nothing to hook. Drawing there needs a widget component added
  at run time (`AActor::AddComponentByClass`), placed in game. See [Static screens](#static-screens-kind-b).

## How the survey was done

- **Drivable trains**: every `RVM_*` simulation blueprint in each pak, from `tswdump find RVM_`, keeping
  those with a cab.
- **Screen widgets**: every `WidgetBlueprintGeneratedClass` export in each train plugin, from the
  `tswdump` SQLite index, 548 classes. Their widget trees and blueprint code come from the kdecomp
  mirror.
- **Which screen shows the page**: the screen containers in each `RVV_*` (`PrimaryPage`, `PageData`,
  `ButtonMap` / `ButtonReferenceMap`, `ScreenID`).
- **What each key does**: the containers' and pages' `ButtonPress*` code.
- **Two values kdecomp does not print were read from the raw assets** (scripts in
  [Reproduce](#reproduce)):
  - **Draw sizes**: kdecomp prints `DrawSize` as `System.Int32[]`. The values come from the tagged
    `IntPoint` in the `.uexp`.
  - **Key enum values**: user-defined enums are often reordered in the editor, so `NewEnumerator9`
    is not value 9. The key maps name the enumerators, while the code compares numbers. The
    `(name, value)` pairs come from each enum's `.uexp`, for example `DB_DD_Buttons` `NewEnumerator9` = 10
    and `E_FSN_DD_Buttons` `NewEnumerator24` (UD) = 26.

## Screen families

Seventeen page classes fall into eight designs.

| Family | Trains | Page class(es) | Root | Draw size | What it draws |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **DigitalDisplay V1 frame** | BR 143 (FSN, DLG), BR 114 (FTF) | `WBP_FSN_DB_143_Ebula_C`, `WBP_DLG_DB_143_Ebula_C`, `WBP_FTF_DB_114_Ebula_C` | `CanvasPanel_0` | **640×525** (RVV) | Empty vector EbuLa frame: status bar 0–30, header row 30–48, grid (0, 48) 630×405, status line `Top=-67` (458–477), soft-key bar `Top=-50` (475–525) |
| **Dosto DD** | Dosto cab car 766pbzfa (FSN, FTF, DLG, EU, TTC), BR 146.2 (TTC, FTF, DLG), BR 185.2 (DLG) | `WBP_DB_DD_Ebula_C`, `WBP_TTC_Doppelstock_DD_Ebula_C`, `WBP_TTC_DD_Ebula_C`, `WBP_FTF_DB_DD_Ebula_C`, `WBP_DLG_DB_DD_Ebula_C`, `WBP_DLG_DD_Ebula_C` | `InvalidationBox_0` → `CanvasPanel_0` | 640×480 (container CDO) | Picture `MI_DD_(DB_)EbuLa` (1024×768 texture stretched over the page), date at (416, 8), clock at (552, 8), soft-key labels `ButtonText_0..9` in a collapsed bar at the bottom (62 px) |
| **S-Bahn FSN** | BR 423 (FSN), BR 430 (FSN) | `WBP_FSN_DD_EbuLa_C`, `WBP_FSN_DB_BR430_DD_EbuLa_C` | `CanvasPanel_27` | 640×480 (`FSN_DD_Widget_EbuLa` CDO; BR 430 via `FSN_DB_BR430_DD_ScreenContainer`) | Picture `T_FSN_DB_BR4x0_DD_EBuLa_Day/Night` 640×480 in an `ImageSwitcher`, date (416, 7), clock (552, 7) |
| **S-Bahn FTF** | BR 423 (FTF) | `WBP_FTF_DD_EbuLa_C` | `CanvasPanel_27` | **630×460** (`FTF_DD_ScreenContainer` CDO) | Empty vector frame like the BR 143's: header boxes (loco no. 0–85, title 88–384, date 386–516, clock 518–630) to y 31, lines at y 31 and 51, column lines at x 104, 473 and 554 from y 51, bottom line y 398, button bar `WBP_FTF_DD_Buttons` `Top=-60` (400–460) |
| **S-Bahn CTP** | BR 423 New Journeys (TSW 7 and TSW 5) | `WBP_CTP_DD_EbuLa_C` | `InvalidationBox_0` → `CanvasPanel_27` | **630×460** (`CTP_DD_ScreenContainer` CDO) | Picture `EbuLa_Day` 1024×512 auto-sized at (0, 0), clipped to the canvas, with loco number, title, date and clock on top |
| **Vectron** | Vectron (FTF) | `WBP_DB_Vectron_DD_EbuLa_C` | `CanvasPanel_0` | 640×480 (RVV `Screen_Baseline3_F/B`) | Picture `T_DB_Vectron_EbuLa_BackgroundDay/Night` 630×460, clock (546, 4), date (411, 4) |
| **BR 411 MTD** | ICE-T (FTF, DLG) | `MTD_FTF_DB_BR411_MFA_Ebula_C`, `MTD_DLG_DB_BR411_MFA_Ebula_C` | `CanvasPanel_0` | **1252×941** (`*_BR411_DD_ScreenContainer` CDO) | Picture `MI_*_BR411_EbuLa` stretched over the page, date (868, 20), clock (1124, 20), GNT panel (468, 128) 360×728 (the game's only live EbuLa content, see ebula.md) |
| **Talent 2 ESF** | BR 442 (DLG) | `WBP_DLG_DB_BR442_ESF_C` | `InvalidationBox_2` → `Overlay_0` | **1024×768** (`EBuLa_RVV` CDO) | Grid picture `MI_DLG_DB_BR442_Panel4Grid` behind a `VerticalBox`: header (code, date, clock), an empty `RowContainer_VerticalBox` (`AddRow` is never called), and a 1020×61 "Windows" bar at the bottom. **No `CanvasPanel`** |

Where the timetable sits: in every **picture** design, the whole page is fake artwork of a timetable,
with the game's clock and date on top. Our page should cover all of it (`Fit::FILL`). In the three
**frame** designs, the game draws an empty frame. There our page goes inside the frame and leaves the
game's own soft-key bar visible ([proposal](#proposal)).

How each screen is set up:

- **BR 143/114**: one screen per cab end (`EbuLa_Screen_F/B`, `PageData` row `EbuLa`), page made at once.
- **Dosto, BR 146.2, BR 185.2**: a third container per end (`Screen3` / `B_Display_3` / `DRA_Display_x_3`) with
  `PrimaryPage = Ebula`. `WBP_*_DD_Main.Setup` makes the primary page at once (the other pages are made
  lazily by `CreateWidgetPage`).
- **S-Bahn**: `*_DD_Widget_EbuLa` (`ScreenID = EbuLa`). The page also shows the screen's on/off state.
- **Vectron**: `Screen_Baseline3_F/B` (`ScreenID = Ebula_Front/Back`, row `EbuLa`).
- **BR 411**: `MTD_Right` starts on `BrakeData` (service `CustomDataFloat MTD_Right_UD = 1`). The UD key steps the
  screen through `Main` → `BrakeData` → `Ebula` → `FIS_Main` (`(UD + 1) % 4`, service `DD_ShowPage`), and
  `LoadPage` makes each page only when it is first shown. The screen's camera is named
  `EbuLaScreenCamera`.
- **BR 442**: `EBuLa_RVV_C`, a `WidgetProximityComponent` attached to `Screen_3`, whose own widget class is the ESF page.

## TSW 7

Kinds: **a** UMG page, **b** static (keys, no page), **c** no timetable screen. "Matched today" is
`display.rs` `is_ebula_page` plus `Ui::canvas_in`. The toggle key is the RVM component name; `_F`/`_B`
means one per cab end. Key values are the decoded enum values.

| Train | Pak | Kind | Page class | Root | Draw size | Timetable rect | Matched today | Toggle key → state | Notes |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| BR 143 | FrankfurtSBahn | a | `WBP_FSN_DB_143_Ebula_C` | Canvas | 640×525 | frame (0, 30)–(640, 477) | **yes**, seen in game (run 20) | `Ebula_UD_F/B` → `bIsPushed` | Today's rect ends at y 472, 5 px short of the status line's end (the frame was measured at 520 high). Night `bNightmode`; brightness dims the whole screen (no `BrightnessKey`) |
| BR 143 | DresdenLeipzig | a | `WBP_DLG_DB_143_Ebula_C` | Canvas | 640×525 | same | yes (same design) | `Ebula_UD_F/B` | |
| BR 114 | FrankfurtFulda | a | `WBP_FTF_DB_114_Ebula_C` | Canvas | 640×525 | same | yes | `Ebula_UD_F/B` | |
| BR 423 | FrankfurtSBahn | a | `WBP_FSN_DD_EbuLa_C` | Canvas | 640×480 | whole page | yes | `S3_Button_UD` → `bIsPushed` | Night `_isNightMode` (Kontrast), brightness `DisplayService` |
| BR 430 | FrankfurtSBahn | a | `WBP_FSN_DB_BR430_DD_EbuLa_C` | Canvas | 640×480 | whole page | **yes**, seen in game (runs 25, 44) | `S3_Button_UD` | as BR 423 |
| BR 423 | FrankfurtFulda | a | `WBP_FTF_DD_EbuLa_C` | Canvas | 630×460 | frame (0, 0)–(630, 398) | yes, but FILL hides the game's button bar | `S3_Button_UD` | A frame, not a picture: needs a rect |
| BR 423 / 433 | NewJourneysBR423 | a | `WBP_CTP_DD_EbuLa_C` | InvalidationBox → Canvas | 630×460 | whole page | yes (`canvas_in`, depth 1) | `S3_Button_UD` | Page root caches: `Ui::refresh` after each paint (already done for every page) |
| Dosto 766pbzfa | FrankfurtSBahn | a | `WBP_DB_DD_Ebula_C` | InvalidationBox → Canvas | 640×480 | whole page | **yes**, seen in game (runs 27–30) | `Timetable_Button_UD` → `bIsPushed` | Night `DayNight_Mask`, brightness `DataStore`. Keys `TimeTable_Button_0..9` have `bInputEnabled = False` |
| Dosto 766pbzfa | FrankfurtFulda | a | `WBP_DB_DD_Ebula_C` | same | 640×480 | whole page | yes | `Timetable_Button_UD` | |
| Dosto 766pbzfa | DresdenLeipzig | a | `WBP_DB_DD_Ebula_C` | same | 640×480 | whole page | yes | `Timetable_Button_UD` | |
| Dosto 766pbzfa | EuropeanContentPack | a | `WBP_DB_DD_Ebula_C` | same | 640×480 | whole page | yes | `Timetable_Button_UD` | re-dumped pak (build 26080373), unchanged design |
| Dosto 766pbzfa | TrainingCentre | a | `WBP_TTC_Doppelstock_DD_Ebula_C` | same | 640×480 | whole page | yes | `Timetable_Button_UD` | |
| BR 146.2 | TrainingCentre | a | `WBP_TTC_DD_Ebula_C` | InvalidationBox → Canvas | 640×480 | whole page | yes | `S3_Button_0_F/B` → `bIsPushed` | EbuLa screen `B/F_Display_3`, keys only 0, Aus, Helligkeit, Kontrast |
| BR 146.2 | FrankfurtFulda | a | `WBP_FTF_DB_DD_Ebula_C` | same | 640×480 | whole page | yes | `S3_Button_0_F/B` | |
| BR 146.2 | DresdenLeipzig | a | `WBP_DLG_DB_DD_Ebula_C` | same | 640×480 | whole page | yes | `S3_Button_0_F/B` | |
| BR 185.2 | DresdenLeipzig | a | `WBP_DLG_DD_Ebula_C` | same | 640×480 | whole page | yes | `S3_Button_0_F/B` | screen `DRA_Display_F/B_3` |
| Vectron | FrankfurtFulda | a | `WBP_DB_Vectron_DD_EbuLa_C` | Canvas | 640×480 | whole page | yes | `S4_Button_UD_F/B` → `bIsPushed` | Night `bNightmode` (page base). The brightness overlay `WBP_DB_Vectron_DD_BrightnessPage_EBuLa_C` is rightly left out |
| BR 411 ICE-T | FrankfurtFulda | a | `MTD_FTF_DB_BR411_MFA_Ebula_C` | Canvas | 1252×941 | whole page | **only after UD**: page made lazily | `S2_09` → `bIsPushed`, while the page is shown | UD (25) is the page key, `S2_00` (10) leaves the EbuLa for `BrakeData`. No night or brightness key on the page |
| BR 411 ICE-T | DresdenLeipzig | a | `MTD_DLG_DB_BR411_MFA_Ebula_C` | Canvas | 1252×941 | whole page | same | `S2_09` | |
| BR 442 Talent 2 | DresdenLeipzig | a | `WBP_DLG_DB_BR442_ESF_C` | InvalidationBox → **Overlay** | 1024×768 | whole page | **no**: name lacks "ebula", and no canvas anywhere | `S3_Button_UD` → `bIsPushed` | Night = global MPC `MPC_FontParametersCollection.IsDay` (key 23 flips it), not a page variable. Aus (16) toggles `EBuLa_RVV.isAus` |
| BR 103 | LeftRhine | **b** | none | – | – | – | **no**: no widget | `S3_UD_F/B` → `bIsPushed` | Keys `S3_{Aus,Brightness,Clear,Contrast,Down,Enter,Left,Right,UD,Up}_F/B`, none used by any blueprint; key backlights `EbulaButtonLightController_F/B` follow the battery |
| BR 110 | LeftRhine | **b** | none | – | – | – | no | `S3_UD_F/B` | Key interactions in the RVV give the unit's place (see below) |
| Bnrdzf 463 cab car | LeftRhine | **b** | none | – | – | – | no | `S3_UD_F` | front cab only; the cab skeleton has an `EBULA_Breaker` bone |
| BR 363 | DresdenLeipzig | c | – | – | – | – | – (HUD) | – | shunter, no screens |
| Class 323 | TrainingCentre | c | – | – | – | – | – (HUD) | – | UK; only a destination display |
| Class 66 | TrainingCentre | c | – | – | – | – | – (HUD) | – | UK EM2000 screen, no timetable |
| Class 8F | TrainingCentre | c | – | – | – | – | – (HUD) | – | steam |
| SD40-2 | TrainingCentre | c | – | – | – | – | – (HUD) | – | US PTC screen only |
| NJT BiLevel cab car | USContentPack | c | – | – | – | – | – (HUD) | – | US IDU/SDU screens |
| Rotem cab car (and Palm Cloud livery) | USContentPack | c | – | – | – | – | – (HUD) | – | US |

The UK pack (re-dumped) and the NL and CZ packs have wagons or station boards only. The base pak has
no rail vehicle with a cab.

## TSW 5

| Train | Pak | Kind | Page class | Root | Draw size | Timetable rect | Matched today | Toggle key → state | Notes |
| :--- | :--- | :---: | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| BR 423 / 433 | NewJourneysBR423 (new) | a | `WBP_CTP_DD_EbuLa_C` | InvalidationBox → Canvas | 630×460 | whole page | yes | `S3_Button_UD` | identical to the TSW 7 copy |
| BR 146.2 | TrainingCentre | a | `WBP_TTC_DD_Ebula_C` | InvalidationBox → Canvas | 640×480 | whole page | yes | `S3_Button_0_F/B` | |
| Dosto 766pbzfa | TrainingCentre | a | `WBP_TTC_Doppelstock_DD_Ebula_C` | InvalidationBox → Canvas | 640×480 | whole page | yes | `Timetable_Button_UD` | |
| Class 323 | TrainingCentre | c | – | – | – | – | – (HUD) | – | |
| Class 66 | TrainingCentre | c | – | – | – | – | – (HUD) | – | |
| Class 8F | TrainingCentre | c | – | – | – | – | – (HUD) | – | |

The TSW 5 European, NL, UK and US packs hold no drivable vehicle.

## Why pages are missed

| Page | Name matches | Canvas found | Page exists when we look | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| BR 143/114, S-Bahn, Vectron (canvas at the root) | yes | yes (root) | yes | matched |
| Dosto, BR 146.2/185.2, CTP BR 423 (`InvalidationBox` root) | yes | yes (depth 1) | yes (primary page) | matched |
| BR 411 `MTD_*_MFA_Ebula_C` | yes | yes | **no** until the driver steps `MTD_Right` to it (one UD press from its start page) | missed until then |
| BR 442 `WBP_DLG_DB_BR442_ESF_C` | **no** | **no**: `Overlay` and boxes only | yes | missed twice over |
| LeftRhine BR 103/110/Bnrdzf | – | – | no widget at all | missed: static |

## Keys next to each screen

What the game does with each key on the EbuLa screen, from the containers' and pages' code. Values are
the decoded enum values.

| Family | Keys on the screen (RVM names) | Used on the EbuLa page | Free |
| :--- | :--- | :--- | :--- |
| BR 143/114 | `Ebula_{0..9,C,E,i,S,St,UD,Up,Down,Left,Right,V=0,V>0,Power,Brightness,DayNightMode}_F/B` (26) | The screen client maps only Brightness (5: Helligkeit overlay page), Contrast (6: display mode, `bNightmode`), C (8), Up (9) and Down (10). `WBP_*_143_PageBase.OnButtonDown` returns false, and the EbuLa page does not override it | everything else; the number keys, E, i, S, St, UD, V=0 and V>0 are not even mapped |
| Dosto cab car | `TimeTable_Button_0..9` (input disabled), `Timetable_Button_{OnOff,Brightness,Contrast,UD}` | Brightness (22): container, `DataStore.Brightness` +0.1. OnOff (16) and Contrast (23 `DayNight`): `DB_DD_Navigation` row `Default`. Row `Ebula` has an empty `ActionMap` | UD (24) |
| BR 146.2, BR 185.2 | `S3_Button_{0,Aus,Brightness,Contrast}_F/B` | Aus (16), Brightness (22), Contrast (23) as above | `S3_Button_0` (`NewEnumerator9` = 10) |
| S-Bahn (FSN/FTF/CTP 423, FSN 430) | `S3_Button_{00,06,Aus,Brightness,Contrast,UD}` | `*_DD_ScreenContainer.ButtonPress`: Aus (18) `Toggle_OnOff`, Brightness (24) `Set_Brightness` −1 (EbuLa widget) or the brightness page, Contrast (25) `Toggle_DisplayMode`. Everything else goes to the page, and `WBP_*_DD_EbuLa.ButtonPress` returns `Handled = false` | UD (26), plus 00 and 06 (unmapped) |
| Vectron | `S4_Button_{0..9,C,E,UD,Power,Brightness,Contrast,Up/Down/Left/RightArrow}_F/B` (all mapped) | `WBP_DB_Vectron_DD_Base_PageBase.ButtonPress`: Power (17) `ToggleOnOff`, Brightness (19) toggles page `Ebula_Brightness`, Contrast (20) `ToggleDisplayMode`, 22 (`NewEnumerator28`) language page. The container's `OnButtonPressed` is empty | UD (21), the number keys, C, E and the arrows |
| BR 411 MTD | `S2_{00..09,Aus,Brightness,Clear,Contrast,Down,Enter,Left,Right,UD,Up}` (RVM; RVV `S2_Button_*`) | Container: UD (25) steps the page. Page `MFA_Ebula.HandleButtonPress`: `S2_00` (10) shows `BrakeData` | 01–09, Clear, arrows and Enter, *while the EbuLa page is shown* (on other MTD pages the number keys do things) |
| BR 442 | `S3_Button_{0..9,C,E,St,UD,Up,Down,Left,Right,V=0,V>0,VerticalBar,Aus,Brightness,Contrast}` | RVV binds only Aus (`EBuLa_RVV` 16: `isAus`) and Contrast (23: MPC `IsDay`) | all others, including UD |
| LeftRhine | `S3_{Aus,Brightness,Clear,Contrast,Down,Enter,Left,Right,UD,Up}_F/B` | nothing (no blueprint reads them) | all |

**Why UD**: on the DB displays, UD switches the display ("Umschalten"). It sits on the EbuLa unit of
every family except the BR 146.2/185.2, and it does nothing there except on the BR 411. Like
Helligkeit and Kontrast, it is a screen key, not a timetable key, so pressing it to change the
screen's look is natural. Nothing the game draws changes when it is pressed.

**State to read**: none of the free keys writes anything on the page widget, its base or its container.
That follows from being free; checked for every family above. The readable state is the key's own
component on the RVM:

- `UVirtualHIDComponent::GetCurrentInputValue()`, a float, 1 while pressed (`PushMode` default,
  momentary; `ReleasedOutputValue` 0), read through tsw-sdk `cab::controls::Vhid::value`; or
- `UPushButtonComponent::bIsPushed`, a reflected `uint8:1` (`find_bool(class, "bIsPushed")`), the same
  kind of read as `NightKey` does on `_isNightMode`.

A rising edge (released → pressed) flips the look. The keys were checked for `bInputEnabled`: all
proposed keys keep the default (enabled). The Dosto's `TimeTable_Button_0..9` are disabled, which rules
them out.

The page-side states the game does keep, for reference: `bNightmode` (BR 143/114 pages, Vectron page base),
`_isNightMode` (S-Bahn page base), `DayNight_Mask` (Dosto-family base), MPC `IsDay` (BR 442, global),
the BR 411 service's `CustomDataFloat MTD_Right_UD` (0–3, 2 = EbuLa shown) and the BR 442 container's `isAus`.

## Static screens (kind b)

LeftRhine BR 103, BR 110 and the Bnrdzf 463 cab car:

- **What is there**: no `WidgetComponent` in any LeftRhine train (`tswdump` exports of the five
  LFR plugins: only HUD widgets and the IC coach PIS page), no render-target or screen material
  on the cab mesh (BR 103 cab materials are decals, glass and numbers), and no EbuLa texture. The
  EbuLa face is part of the cab mesh's static textures. The ten keys are live `PushButtonComponent`s,
  their backlights follow the battery (BR 103 `UpdateDisplayButtonLights`), and nothing reads
  them.
- **What can be hooked**: nothing existing. No material parameter turns into a screen, and there is no
  widget class to subclass.
- **What would work**: add our own `UWidgetComponent` to the train's view actor at run time
  (`AActor::AddComponentByClass(WidgetComponent, bManualAttachment, RelativeTransform, false)`, which can
  be called through reflection), give it a user widget with a canvas (`SetWidget`, `SetDrawSize(640, 480)`), and attach
  it to the cab mesh (`K2_AttachToComponent` on `SK_Cab_F/B`, or the RVV root) in front of the EbuLa face.
  The place comes from the key interactions:
  - BR 110 (`RVV_LFR_DB_BR110_399`): keys between x 690.6–699.8, y 2.7–26.0, z 257.7–274.0 cm, with
    the key plane at pitch about 6° and yaw about −34.5°. Aus at (697.4, 2.7, 274.0) is the top left
    key, and Enter at (690.6, 26.0, 257.7) the bottom right one.
  - BR 103 and Bnrdzf: their interaction components are not in the RVV, so the place must be
    measured in game.

  The screen rectangle has to be placed and checked in game (screenshot, then adjust). Until that
  exists, the HUD panel is the only way to show the page in these trains.

## Proposal

### `is_ebula_page`

Keep the name rule, add the Talent 2's ESF, and leave out its row class:

```rust
pub fn is_ebula_page(class: &str) -> bool {
    let c = class.to_ascii_lowercase();
    (c.contains("ebula") || c.ends_with("_esf_c"))
        && !c.contains("button")
        && !c.contains("brightness")
        && !c.contains("_row")
}
```

New tests: `WBP_DLG_DB_BR442_ESF_C` yes; `WBP_DLG_DB_BR442_ESF_Row_C` no;
`WBP_DB_Vectron_DD_BrightnessPage_EBuLa_C` no; `MTD_FTF_DB_BR411_MFA_Ebula_C` yes.

### Per-class screen profile

Replace `cab_fit` with a profile that also names the toggle keys and how to attach. Width stays
`WIDTH` = 640. The height is our page's design height for the rect's aspect.

| Class (lowercase test) | Attach | Fit | Height | Toggle keys (RVM) | Gate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| contains `_143_ebula` or `_114_ebula` | canvas | `Fit::rect(0, 30, 640, 447)` (was 442: the screen is 640×525, the status line ends at y 477) | 447 | `Ebula_UD_F`, `Ebula_UD_B` | – |
| `wbp_ftf_dd_ebula_c` | canvas | `Fit::rect(0, 0, 630, 398)`: over the game's header and frame, above its button bar (400–460) | 404 (640 × 398 / 630) | `S3_Button_UD` | – |
| `wbp_fsn_dd_ebula_c`, `wbp_fsn_db_br430_dd_ebula_c` | canvas | `FILL` | 480 | `S3_Button_UD` | – |
| `wbp_ctp_dd_ebula_c` | canvas | `FILL` | 467 (640 × 460 / 630) | `S3_Button_UD` | – |
| `wbp_db_dd_ebula_c`, `wbp_ttc_doppelstock_dd_ebula_c` | canvas | `FILL` | 480 | `Timetable_Button_UD` | – |
| `wbp_ttc_dd_ebula_c`, `wbp_ftf_db_dd_ebula_c`, `wbp_dlg_db_dd_ebula_c`, `wbp_dlg_dd_ebula_c` | canvas | `FILL` | 480 | `S3_Button_0_F`, `S3_Button_0_B` | – |
| `wbp_db_vectron_dd_ebula_c` | canvas | `FILL` | 480 | `S4_Button_UD_F`, `S4_Button_UD_B` | – |
| contains `_br411_mfa_ebula` | canvas | `FILL` | 481 (640 × 941 / 1252) | `S2_09` | page shown |
| `wbp_dlg_db_br442_esf_c` | **overlay** | fill the overlay | 480 | `S3_Button_UD` | – |
| anything else matching | canvas | `FILL` | 480 | none (hotkey only) | – |

How the toggle works:

- Watch both cab ends' names. Only the occupied cab's key gets pressed.
- On a rising edge, flip `ebula.style` (classic ↔ modern), as the style hotkey does.
- Read the keys from the driven vehicle's RVM with tsw-sdk's `cab::controls` (`Controls::refresh(vhid,
  train)`, `get(name)`, `vhid.value(control)`), at the paint cadence (250 ms). A press is held longer
  than that, but polling at the 2 s look cadence would miss it. Some cab screens belong to another
  vehicle than the driven one (the BR 411 MTD is on the TW car the player sits in), so take the train
  from the controller's current drivable actor.

### What tsw-sdk needs

1. **Attach to an `Overlay`** (BR 442): `Ui::overlay_in(widget)` (the same breadth-first walk as
   `canvas_in`, looking for `/Script/UMG.Overlay`), and `CabScreens::fit_overlay(overlay, widget)` with
   `Overlay:AddChildToOverlay`, `OverlaySlot:SetHorizontalAlignment(HAlign_Fill)`,
   `SetVerticalAlignment(VAlign_Fill)` and `SetPadding`. The new child is the overlay's last, so it draws
   on top. The root is an `InvalidationBox`, so `Ui::refresh` after each paint, as for the Dosto.
2. **A named key watch**: `cab::controls` already resolves `GetCurrentInputValue` on
   `UVirtualHIDComponent`, and `UPushButtonComponent` derives from it. A small `cab_screen::KeyWatch {
   names, last }` that returns `true` on a rising edge would keep tsw-ebula free of control
   plumbing. Optional: read `bIsPushed` with `find_bool` instead of calling the function.
3. **Page shown** (BR 411 gate, useful everywhere): walk `Widget:GetParent` from the page. At each
   `WidgetSwitcher`, the active widget (`WidgetSwitcher:GetActiveWidget`) must be on the path. The
   BR 411 `PageSwitcher`, the Dosto `WidgetPages` and the V1 `PageSwitcher` all work this way.
4. **BR 442 night** (optional): `NightKey::Mpc`, reading
   `KismetMaterialLibrary::GetScalarParameterValue(world, MPC_FontParametersCollection, 'IsDay') < 0.5`.
5. **BR 411 page** (optional, needs the owner's yes, since it changes the game's screen): when a BR 411 is
   driven and no `*_BR411_MFA_Ebula_C` page exists, call the service's `DD_ShowPage('MTD_Right', 'Ebula')`
   once, which the UD key would otherwise do. Otherwise the HUD panel stays until the driver
   presses UD.
6. **LeftRhine** (later): a runtime `WidgetComponent` as in [Static screens](#static-screens-kind-b),
   plus a user widget with a canvas root. A plain `UserWidget` has an empty `WidgetTree`; one option is
   to spawn a `CanvasPanel` with the tree as outer and set `WidgetTree.RootWidget` before the component
   builds its Slate.

### Checks in game

For each family, sit in the cab and run `ebula.widgets ebula` (and `ebula.widgets esf` on the BR 442).
Expect the class from the tables, then `ebula.status` showing the page on the cab screen.

- **BR 146.2 and BR 185.2**: the page should already be on the third screen.
- **FTF BR 423**: the game's button bar should stay visible under our page.
- **BR 143**: our status line should reach the frame's bottom line.
- **The toggle**: press the UD key (or `S3_Button_0` on the BR 146.2/185.2) and expect the look to
  change at once.

## Reproduce

Read-only, no game needed.

- **Index queries**:
  - `tswdump find RVM_` lists the drivable trains.
  - The `export` table with class `WidgetBlueprintGeneratedClass` (SQLite, `tswdump.sqlite`) lists the widgets.
  - `tswdump which <Class>_C` gives the kdecomp path.
  - `tswdump text 'PrimaryPage = Ebula'` and the `*_Widget_EbuLa` container objects in the RVVs show
    which screen shows the page.
- **Widget trees**: a small script (`tree.py`, kept in the survey session's scratchpad, not in a
  repo) prints `RootWidget` and the slot layout from a kdecomp file. It keys slots by name and outer, because kdecomp repeats `CanvasPanelSlot_N`
  names across panels.
- **Enum values**: `enum.py` (same place) reads a `UserDefinedEnum`'s `(name, value)`
  pairs from the raw `.uasset`/`.uexp`. It takes the name map from the summary, then finds the
  `TArray<TPair<FName, int64>>` in the export.
- **Draw sizes**: `drawsize.py` (same place) finds every tagged `DrawSize`
  `StructProperty IntPoint` in the `.uexp`. The order matches kdecomp's object order. Classes without
  an override take the container class's CDO value.
- **Raw assets** (single files, copied once from the NAS): `E_DB_Vectron_DD_Buttons`,
  `E_FSN_DD_Buttons`, `DB_DD_Buttons` (five copies), `DD_Buttons`, `FTF_DB_BR411_DD_Buttons`,
  `E_FSN_DB_143_ScreenButtons`, `442_Buttons_Enum`, the screen containers and the RVVs named above.
