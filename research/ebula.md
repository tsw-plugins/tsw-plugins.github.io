---
name: ebula
description: >-
  EBuLa (Elektronischer Buchfahrplan und La), the German cab timetable display: history, hardware, what
  it shows and why, the data chain, the rules in Ril 408, successors and foreign equivalents; how other
  simulators and fan tools model it; and how TSW 7 implements its EbuLa screens (decompiled), with what an
  autopilot can read instead.
game_build: 886 (TSW 7)
created: 2026-10-21T15:55+0200
last_edited: 2026-10-22T20:00+0200
---

# EBuLa: the real system, simulators, and TSW (2026-10-21)

Sources:
- Primary DB documents: Ril 408.2341 and Annex 408.2341A01 (version valid from 13.12.2015), the
  BahnPraxis issues 12/2003 and 1/2004, and the DB InfraGO and DB Systel pages.
- Wikipedia (de), the Zusi, Loksim3D and Dovetail forums, and the fan tools' own pages.
- For TSW: the pak listings in `/run/media/system/Data/tsw-decomp/lists/` and the UE4SS header dumps
  (`tsw-coop/dumps/tsw7-886`). Ten EbuLa widgets were unpacked from the paks and decompiled with the
  existing `kdecomp` into a scratch directory, not into `tsw-decomp/out`; see
  [Reproduce](#reproduce).

Markers: **[V]** read in a primary source or in the decompiled game data. **[I]** inferred, or taken
from a secondary or community source.

Existing notes already cover the timetable classes (`ARouteTimetable`, `GetDriverAidData`,
`GetTrackData`): see [timetable-and-map.md](timetable-and-map.md). The HUD interface, PZB and Sifa are
in [safety-systems-and-hud.md](safety-systems-and-hud.md). This note does not repeat them.

## Part 1: the real world

### What it is

EBuLa ("Elektronischer Buchfahrplan und Verzeichnis der Langsamfahrstellen") is DB's on-board display
of the train's timetable in the cab. It replaces the two printed booklets of the *Buchfahrplan*: the
*Geschwindigkeitsheft* (GeH: line, km and permitted speeds) and the *Fahrzeitenheft* (FzH: the train's
times). It was also meant to replace the daily printed *La*, the list of temporary speed restrictions
("Verzeichnis der vorübergehenden Langsamfahrstellen und anderen Besonderheiten"). DB Systel develops and
operates it. DB InfraGO (formerly DB Netz) supplies the data and runs the "Systemstelle EBuLa".
([BahnPraxis 12/2003][bp0312] [V], [de.wikipedia EBuLa][wp] [I], [DB InfraGO EBuLa][infrago] [V])

### History

| When | What | Source |
| :--- | :--- | :--- |
| 1980s | First ideas. They failed on the cost of devices and storage and on network-wide data consistency. Locos used across regions carried "libraries" of up to 300 booklets. | [bp0312] [V] |
| 1994 | The DB board added the project "Elektronischer Buchfahrplan und La" to its action programme (Wikipedia: March 1994). | [bp0312] [V] |
| 22 Feb 1999 | Integration test Dresden–Děčín, then field trials. 2000: delays from software problems. | [wp] [I] |
| Timetable 2003 (Dec 2002) | EBuLa became the regular procedure, at first **without the La part**. | [bp0312], [bp0401] [V] |
| 2003–2005 | La integration was planned for mid-May 2004, then for the 2005 timetable. | [bp0312], [bp0401] [V] |
| 1 Aug 2006 – Dec 2008 | **EBuLa-Funk**: data over GSM-R instead of a PCMCIA card. All DB trains used it from the December 2008 timetable change. Updates went from 72 h to under 5 h, and the data stations were decommissioned. | [wp] [I] |
| 12 Dec 2010 | Occasional (special) trains fully covered. | [wp] [I] |
| Dec 2011 | La integrated for regular routes for a few weeks. **Dropped in early December 2014.** La has been distributed as PDF/HTML since the 2017 timetable, and DB Netz stopped printing it in December 2017. | [wp], [rwth] [I] |
| 2018 | ZLR "Grüne Funktion": control-centre driving advice shown in EBuLa. | [wp] [I] |
| 2019 → Aug 2024 → 2025 | Successor **"Digitaler Fahrplan"** on a personal tablet (DB Fernverkehr, DB Regio, DB Systel). About 5,000 Fernverkehr drivers use it; about 15,000 at DB Regio are being added. | [systel] [V] |
| Today | DB InfraGO still runs EBuLa as an established service for all railway undertakings (EVU), including occasional traffic. **La integration is currently deactivated.** The operating rules are in R 497 "EBuLa-Richtlinie". | [infrago] [V] |
| From timetable year 2027 | DB InfraGO is replacing today's timetable documents and how they are provided with new documents and systemic provision processes. | [infrago-2027] [I] |

### Hardware

- **On-board unit (Bordgerät, BG):** a proprietary industrial PC with a colour display, a soft-key row
  and number keys.
  - Vendors: DLoG (the oldest generation), Gercom/Deuta and GERSYS ([bp0312] names DLoG and GERSYS LEDs [V]).
  - Wikipedia adds the technical details: a 133 MHz AMD CPU (DLoG), Windows 95/NT/XP Embedded, a
    2.5" hard disk, a CompactFlash "blackbox", and heating and cooling to keep 0–55 °C [I].
- **Power-up:** the unit takes about 90 s to boot. The display wakes only once the reverser is out of
  "0" [V].
- **Soft keys** (BahnPraxis 12/2003, table 1) [V]:

  | Key | Name | Function |
  | :--- | :--- | :--- |
  | 1 | Zug | train selection |
  | 2 | FSD | timetable master data |
  | 3, 4 | LaD, LaT | La, not active in 2003 |
  | 5 | LW | route (Laufweg) change |
  | 6 | GW | track change (regular or opposite track) |
  | 7 | Zeit | position-marker control |
  | 8 | Plan | timetable view |
  | 9 | GNT | column 2b speeds for tilting trains |
  | 10 | G | main menu |

  There are also arrow ("Blättern") keys, "E" (Eingabe), "Lösch" (delete), "Aus", brightness and
  day/night.
- **Data before radio:** a PCMCIA "EBuLa-Karte" loaded at a local data station (EBuLa-Dast). It had to
  be refreshed at every shift start and was valid at most 48 h (00:00 today to 23:59 tomorrow). There were
  about 650 Dast, one per crew depot [V]/[I].
- **Data since 2008:** entering the train number triggers a GSM-R data call to the EBuLa radio server.
  The ICE 4 uses LTE through DB's "Mobile Integrationsplattform" [I].

### What it shows (Ril 408.2341A01, valid from 13.12.2015) [V]

There are three views:
- **Fahrplanauswahl:** per train number, the origin and destination, the days of running, the minimum
  brake percentage and the classes of the working traction units.
- **Fahrplan- und Streckengrunddaten:** the train class and number, origin and destination, Sperrfahrt,
  days of running, loco classes, load (with "GL" for a limit load), permitted train length, minimum brake
  percentage, the train's maximum speed and brake position, the emergency-brake override, diesel gear
  (SG/LG), the double-timetable note, the "90 % of axles braked" note, and banking sections.
- **Fahrplandarstellung:** the timetable itself.
  - **Header:** the train number, how long the data is valid, and the unit's date and time. Expired data
    must not be used.
  - **The list reads bottom to top**, like the line ahead. It has six columns:

| Column | Content |
| :--- | :--- |
| **Speed** (Geschwindigkeit) | Permitted speed per section of the selected track. **Inverse** (white on black) means the speed is not signalled. A lower speed applies from the km shown, or from Lf 5/Lf 7 at level crossings. A higher speed applies once the whole train has passed the km (solid line), or once the head reaches the km or the level crossing's road centre (dashed line). Speeds that apply only temporarily are highlighted, with the invalid value in brackets. A vertical **speed-level bar** at the side gives orientation. GNT trains can switch between two speed sets (2a/2b). |
| **Kilometrierung** | km to 100 m precision. It lists the points of speed changes, signal locations, stations (Betriebsstellen), level crossings the crew must protect, LZB area-code changes, train radio area changes, the bounds of the "Sägelinien" (gradient class), tunnel start and end, km jumps (shortfall or overlength), the "¥" end-of-points mark, and bracketed km on short sections. |
| **Grafik** | One or two tracks, with the **selected track drawn bold**: right means the regular track, left the opposite track. Tunnel portals are drawn over it. Symbols beside it mark signals at a braking distance more than 5 % short, stub or shortened entry tracks, LZB begin/end, GNT begin/end, train radio begin/end, El 1/El 3/El 4/El 5 (main switch off, lower or raise the pantograph), current limits ("600 A"), end of electrification, train-bus switching, signals on the "wrong" side, Ne 14, and ETCS begin/end/level change. |
| **Text** | Station names (with "ohne Asig" for no exit signal and "[ZF]" for a block post on train radio), track names, main signals, Hp 2 speeds that are not 40 ("E 50"), "ohne Zs 6", distant signals at abnormal places, level-crossing protection procedures ("Schranke", "ET", "AutomET", "HET", "AutomHET", "Posten"), "VMZ … km/h", El 1/El 4 with a speed, **Sägelinien** (none: 0–10 ‰, one: >10–20 ‰, two: >20 ‰), train radio mode and channel ("- ZF GSM-R -"), "Betriebsbremsung" (a test brake for freight), and route indicators ("Zsig Ri F"). |
| **Ankunft** (arrival) | Arrival time to **10 s**. An entry orders a stop. "x" marks a request stop, "Halt" a stop to protect a level crossing, "+" an operational stop, "H"/"U" stations without an exit signal, "N" an unpublished stop, "A"/"Z" alighting or boarding only, and "*)" footnotes. |
| **Abfahrt** (departure) | Departure time, or the **passing time** if the arrival column is empty (to 10 s). |

- **Position marker (Ortsmarker)** [V, BahnPraxis 12/2003]:
  - In the 2003 units it is **time-driven**. The driver presses "E" on departure (recommended: about 30
    s early), and the marker then advances by the scheduled times.
  - The "Zeit" menu takes a delay in minutes. Entering 0 jumps the marker to the station the train should
    be at now. The marker can also be stepped manually, or the driver pages through with the arrow keys
    like a booklet.
  - Later units add **location-driven** control from wheel sensors or GPS [I, wp]. It needs no
    correction after delays and is required for ESF energy advice.
  - Delays appear only as the minutes the driver entered. EBuLa itself shows schedule times, not a live
    forecast [I].
- **Extensions** [I, wp]:
  - ESF ("Energiesparende Fahrweise", up to 20 % savings): coasting points, which need location control.
  - TEMA-box energy values.
  - ZLR green-wave advice (2018).

### Why: the rules and how drivers use it

- **Legal basis** [V, Ril 408.2341 §2]:
  - The permitted speeds of a signal-controlled train are prescribed by **the train's timetable and the
    La**. The lower of the two applies.
  - A higher La speed applies only if the La says "Geschwindigkeitsheraufsetzung" and the brake
    percentage is sufficient.
  - The timetable's maximum speed is never exceeded.
  - Annex A01 explains the cab display and A02 the printed Buchfahrplan.
- **The cab must carry everything needed** for a safe and punctual run: the Buchfahrplan (or EBuLa), the
  local rules and the La [V, bp0312].
- **How drivers use it:**
  - to anticipate speed changes (the column reads like the line ahead);
  - to see where signals stand when they are not in the usual place;
  - to keep time to 10 s at stations and passing points;
  - to know stops and stop types (request, alighting only, level-crossing stops);
  - to check gradients for securing a train, pantograph and main-switch points, and train radio
    channels.
  - The editorial lists the goals as safety, "relieving the driver in favour of watching the line", and
    cost [V].

### Data chain

1. **DB InfraGO timetable IT** (the network timetable plus occasional and short-notice trains, and
   Fplo construction orders for selected EVU) feeds the EBuLa server.
2. **The server sends to the vehicle:** formerly the Dast and the card, since 2008 GSM-R (LTE on the ICE
   4). The on-board software release is approved by the EBA (Federal Railway Authority) [I].
3. **The driver enters the train number**, picks the run (day, traction), and starts the marker.
4. **La:** officially part of EBuLa, but integration was switched off in 2014. Today La comes as a
   separate PDF/HTML or in apps, e.g. "La-Select" in the Digitaler Fahrplan [V, infrago, systel].
5. **Third-party EVU** get EBuLa through DB InfraGO's customer advisers. DB InfraGO says the data feed has
   been modernised for TAF/TAP TSI and "special EVU systems" [V, infrago]. An XML interface for the EBuLa
   timetable is mentioned in [ei2024] [I].

### When it fails (BahnPraxis 1/2004, Ril 408) [V]

- **Unit fails before departure:** the EVU is responsible. It can swap the unit, print a timetable at a
  staffed data station, have the infrastructure manager dictate a *Fahrplan-Mitteilung*, or provide
  another loco.
- **Unit fails en route:** the control centre (BZ) decides. Options:
  - a Fahrplan-Mitteilung (the speed may be lowered to cut the amount of data dictated);
  - running by the **40 km/h column of the Ersatzfahrplan** (the replacement timetable);
  - a printed timetable handed over at a later station;
  - a unit swap or a replacement loco.
- **Total and partial failure** are distinguished; without the variable data the timetable is invalid.
  On a failure in motion the train must stop [I, wp].
- **Today's fallback** is EBuLa-IRE, a web viewer and printer on the DB intranet and, since 2006, the
  internet [I, wp]. Failures of the card or the data station are handled by the EVU, only as far as the
  next point with valid data.

### Successors and equivalents

| System | Who | What | Source |
| :--- | :--- | :--- | :--- |
| Digitaler Fahrplan | DB Fernverkehr, DB Regio (DB Systel) | Android tablet app, independent of the vehicle. It combines the timetable, La-Select, "Fernglas/Rückspiegel" (trains ahead and behind) and planned energy feedback. A forum report says DB Regio keeps EBuLa as its fallback for a year. | [systel] [V], [zusi-df] [I] |
| RailTab (INAVET), IVU.Pad | private EVU | tablet timetable, independent of an EBuLa unit (IVU.Pad trialled 2017) | [inavet], [rwth] [I] |
| ÖBB elektronischer Buchfahrplan | ÖBB-Infrastruktur (ZFM) | full download since timetable 2024, per train since 2025; optional for EVU, with PDF and paper alongside | [oebb] [V] |
| LEA (Lokpersonal Electronic Assistant) | SBB, Thurbo, zb, RegionAlps | personal tablet with the timetable and route description: 2001 Psion, 2009 LEA II, iPad since about 2013 | [rwth], [lea] [I] |
| ETCS / anzeigegeführt | all | under LZB/ETCS the cab signal shows the target speed, target distance and permitted speed. The timetable still supplies times, stops and non-signalled data. | Ril 408.2341 §2(2) [V] |

## Part 2: other simulators and fan tools

| Sim / tool | What it shows | Position / data | Fidelity | Source |
| :--- | :--- | :--- | :--- | :--- |
| **Zusi 3** + **ZusiDisplay** | Buchfahrplan in "EBuLa" layout (ZusiDisplay), plus Buchfahrplan bitmaps (a 1979 layout is included) | Zusi itself generates a **raw XML Buchfahrplan** from the route, and the TCP server (port 1436) streams live data. ZusiDisplay connects, asks for the train number, and follows the train. | Highest: built from the real route data model (signals, km, speeds), with the timetable times | [zusi3], [zusi-fo] [V] |
| **Loksim3D** | F5 shows the full Buchfahrplan (speeds, signals, stops). A 2010 tool by Jens Eggert shows an EBuLa. | Station names must match the route exactly | medium | [loksim] [I] |
| **Train Simulator Classic** | Community EbuLa screens and 155/182 repaints for some German routes. TS-MFD shows an EBuLa in a separate window. | Mostly static textures, "doesn't really work but is just there" | low to medium | [dtg-14464], [dtg-344465] [I] |
| **OpenBVE / Open Rails** | No EBuLa found. OpenBVE routes can carry a timetable image; the Open Rails F1 monitor lists stops with times. | – | – | [I] |
| **TSW**, in game | EbuLa screen with background art, clock and date (Part 3) | none | cosmetic | decompiled [V] |
| **TSW** "ebula" Excel tool (OpenMinded, tygerways; 2022, dormant since 2023) | EBuLa-style rows with times, delay, GNT, a train-length counter | Time only (no API). The user syncs a clock, and a time-warp factor compensates. Only Tharandter Rampe was done. | Drifts. Users found it unreliable. | [dtg-ebula] [I] |
| **TSW online-EBuLa** (online-ebula.de) | A web EBuLa: status bar (delay ±, track /r /l, GNT), bottom-to-top list, FSD train data, day/night | Three modes: manual, time-based, and **"Ortung" via TSW's official HTTP API** (PC only, `CommAPIKey.txt` and a client program). Timetables are entered by hand per DLC. | Best TSW option. No km or La mentioned. | [online-ebula] [V] |
| **TSW Simple EBuLa** (Juice) | Always-on-top overlay of community Buchfahrplan PDFs (noir, Gesingus) | static PDF, manual scroll | reference sheet only | [dtg-simple] [I] |
| **TSW community PDFs** (noir and others on Train Sim Community) | "EBuLa-inspired" book timetables for many German and Austrian routes | static | good as paper | [tsc-noir] [I] |
| **TSW5Mods** `EbulaWebsocketMod` / `EbulaDisplay` | in-game WebSocket feed (see [02-prior-art.md](02-prior-art.md)) | UE4SS, in process | disabled in the build | [V, prior-art] |

Dovetail never answered the 2021 forum poll (88 % yes) for a working EbuLa [dtg-344465].

## Part 3: TSW (decompiled, build 886)

### Which trains carry an EbuLa asset [V]

From the pak listings of the **installed** DLC (other DLC may have more): 61 asset paths in 6 paks.

| DLC / train | EbuLa assets |
| :--- | :--- |
| Training Centre BR 146 and Dosto (`TTC_BR146`, `TTC_Doppelstock`) | `WBP_TTC_DD_Ebula`, `WBP_TTC_Doppelstock_DD_Ebula`, texture `T_DD_EbuLa` |
| Frankfurt–Fulda: BR 114, BR 146, Dosto, BR 411 (ICE-T), BR 423, Vectron | `WBP_FTF_DB_114_Ebula`, `WBP_FTF_DB_DD_Ebula`, `WBP_DB_DD_Ebula`, `MTD_FTF_DB_BR411_MFA_Ebula`, `WBP_FTF_DD_EbuLa` (+ `DT_FTF_DD_EbuLa_PageTable`), `WBP_DB_Vectron_DD_EbuLa` (+ brightness page, "EbulaOff" sound) |
| Frankfurt S-Bahn: BR 143, BR 423, BR 430, Dosto | `WBP_FSN_DB_143_Ebula`, `WBP_FSN_DD_EbuLa`, `WBP_FSN_DB_BR430_DD_EbuLa`, `WBP_DB_DD_Ebula` |
| Dresden–Leipzig: BR 143, BR 146.2, BR 185.2, BR 411, BR 442 (Talent 2), Dosto | `WBP_DLG_DB_143_Ebula`, `WBP_DLG_DB_DD_Ebula`, `WBP_DLG_DD_Ebula`, `MTD_DLG_DB_BR411_MFA_Ebula`, `EBuLa_RVV` → `WBP_DLG_DB_BR442_ESF` |
| New Journeys BR 423 (Köln–Aachen) | `WBP_CTP_DD_EbuLa`, `EbuLa_Day/Night` textures |
| European Content Pack Dosto | `WBP_DB_DD_Ebula` |

### What the widgets do [V]

**All decompiled EbuLa widgets are cosmetic.** None reads the timetable or `ARouteTimetable`.

| Widget | Content and logic |
| :--- | :--- |
| `WBP_DB_Vectron_DD_EbuLa` | `Background` image swapped between `T_DB_Vectron_EbuLa_BackgroundDay/Night` in `OnDisplayModeChanged(bNightmode)`, plus a live clock and date widget. Nothing else. |
| `WBP_DB_DD_Ebula` (Dosto), `WBP_TTC_DD_Ebula`, `WBP_TTC_Doppelstock_DD_Ebula` | A 1024×768 image `MI_DD_DB_EbuLa`, ten soft-key labels `ButtonText_0..9`, a clock and date. Ammeter and voltage fields are inherited from the DD base page. `Set_DayNight(bool)`. |
| `WBP_DLG_DB_143_Ebula`, `WBP_FTF_DB_114_Ebula` | Border components, a status bar and a button bar, plus a `GNT_Service` interface field. No data calls. |
| `WBP_FTF_DD_EbuLa` (BR 423) | Title, loco number, and time `{HH}:{MM}:{SS}` and date `{DD}.{MM}.{YYYY}` from `TS2GameplayFunctionLibrary::GetDateTime`. Shown as an on/off page. |
| `MTD_FTF_DB_BR411_MFA_Ebula` (ICE-T) | The EbuLa image `MI_FTF_DB_BR411_EbuLa`, plus a **GNT overlay**: when the GNT service (`FindService('DTG_GNT')`) is active, each `Tick` calls `PlayerController.GetDriverAidData` and shows the text "ES-Profil: {current} km/h / Nächste: {next} km/h / {distance} m". The distance is `DistanceToNextSpeedLimit / 100`, grid-snapped to 50 m, and the overlay also shows "WIRKSAM", "BEREIT" or "AUS". **This is the only "live" EbuLa content found**, and it comes from the HUD's driver aid, not from a timetable. |
| `WBP_DLG_DB_BR442_ESF` (Talent 2, via `EBuLa_RVV`) | A real **row-based layout**: `AddRow(DLG_DB_BR442_ESF_RowStruct { float Km; enum Icon (3 values); FText Message; FText Time1; FText Time2 })` builds `WBP_DLG_DB_BR442_ESF_Row` widgets into `RowContainer_VerticalBox`, with `SetCode(Text)`, a clock and date from `GetDateTime`, and day/night via `MPC_FontParametersCollection.IsDay`. **No caller of `AddRow` or `SetCode` was found** in `EBuLa_RVV` or the widget, so the table stays empty. [I: no other BR 442 asset was decompiled; a caller elsewhere is not ruled out.] |
| BR 143 RVM (`RVM_DLG_DB_BR143`) | 26 `PushButtonComponent`s per cab (`Ebula_0..9`, `E`, `C`, `Up/Down/Left/Right`, `UD`, `V=0`, `V>0`, `St`, `i`, `S`, `DayNight`, `Brightness`, `Power`): the real key set is modelled as cab controls. |

In short: TSW models the **device** (its housing, keys, power, day/night, clock), not the **timetable**.
The screen shows fixed artwork of a timetable (a texture per DLC), which matches community descriptions
of an "empty" or static display. Correct speeds, km, times or position are not shown.

### How a cab screen is built, and how a mod draws on it (2026-10-22) [V]

Read in the full pak dump (`/var/mnt/nas/gamedumps/tsw7/paks/`, FrankfurtSBahn, DresdenLeipzig,
FrankfurtFulda, core pak):

- **Host:** every DigitalDisplay screen is a `DigitalDisplay_V1_ScreenClient_C` component, a subclass
  of `WidgetProximityComponent` (a widget component made only near the player). Its user widget
  (`GetUserWidgetObject`) is a page container (`WBP_FSN_DB_143_PageContainer_C :
  DigitalDisplay_V1_PageClient_C`) with two `WidgetSwitcher`s (`PageSwitcher`, `OverlayWidget`). The
  pages come from a DataTable of `Struct_DigitalDisplay_V1_PageData { Class, SlotNames, Instance }`:
  BR 143 FSN `DT_FSN_DB_143_PageTable` has `GSMR`, `Brightness` (overlay) and `EbuLa`. Every page is
  an ordinary user widget instance; the component renders the container into the cab.
- **The BR 143 / BR 114 EbuLa page is an empty frame.** `WBP_FSN_DB_143_Ebula_C`,
  `WBP_DLG_DB_143_Ebula_C` and `WBP_FTF_DB_114_Ebula_C` share one layout on a 640×520 root
  `CanvasPanel_0`: a status bar on top, a header row at y 30 (18 px; three cells 0.4 / 1 / 0.4), a
  grid `CanvasPanel_33` at (0, 48) of 630×405 with six bordered columns whose borders sit at x 40,
  110, 230, 500 and 580 (the six EBuLa columns), a status line at y 453 (19 px) and the soft-key bar
  at the bottom (50 px). No widget fills the grid: the device is there, its content is not.
- **Other EbuLa pages** (Dosto `WBP_DB_DD_Ebula`, BR 423 `WBP_FSN_DD_EbuLa`, Vectron) draw a picture of
  a timetable (`MI_DD_DB_EbuLa`, `T_*_EbuLa_Day/Night`) with a clock on top.
- **Drawing on it:** the page widgets are not in the viewport, so `GetAllWidgetsOfClass(world,
  UserWidget, TopLevelOnly = false)` lists them (it walks the class hash, not the object array). A
  mod picks them by class name (`*Ebula*`), takes the root canvas from the page's `WidgetTree`, and
  adds its own widgets there (`AddChildToCanvas`, slot anchors and offsets); the screen component
  renders them with the page, only while that page is the selected one. tsw-sdk's
  `tsw_sdk_host::cab_screen` does this; [tsw-ebula](https://github.com/tsw-plugins/tsw-ebula) puts its
  page into the BR 143 / BR 114 frame and over the whole page on the others. *Not yet verified in
  game* (the first test is owed).

### Day, night and brightness on the cab screens (2026-10-22) [V]

Read in the FrankfurtSBahn pak (FSN Dosto `FSN_DB_Doppelstock/Content/DigitalDisplays`, BR 143
`FSN_DB_BR143/Content/DigitalDisplays`); the Dosto copies in the other packs are the same.

| | Dosto (`WBP_DB_DD_*`) | BR 143 (`WBP_FSN_DB_143_*`) |
| :--- | :--- | :--- |
| Night switch | DataStore key `DayNight` (bool); `WBP_DB_DD_Main` calls `Set_DayNight(IsNight)` on every page | `DigitalDisplay_V1` display mode, 1 = night (`GetDisplayMode` / `SetDisplayMode`, a cab key toggles 0/1); pages get `OnDisplayModeChanged(Mode)` |
| What a page does | `WBP_DB_DD_Base::Set_DayNight_Local`: `DayNight_Mask` = grey 0.6 by day, black by night (`MaskAlt` the inverse, `MaskAlt2` white/black). The EbuLa page tints its `Background` image (`MI_DD_DB_EbuLa`: `M_AlphaMask`, translucent unlit, texture `T_DD_DB_EbuLa`) with it and invalidates its `InvalidationBox_0` | `WBP_FSN_DB_143_PageBase`: `bNightmode = (Mode == 1)`, then `UpdateColors` reads `DT_FSN_DB_143_ColorTable` (DayColor / NightColor per row) |
| Night colours (linear) | material parameter collection `DB_DD_Pallete_Night`: `Night_Background` 0.021, `Night_Text` 1.0 (day: background 0.65, text 0) | `Background` 0.052, `Text` 1.0, `BorderPrimary` 0.84, `BorderSecondary` 0.67 (day: 0.56-0.58, 0, 0.40, 0.72) |
| Brightness ("Helligkeit") | the container `DB_FSN_DD_WidgetContainer` (a `WidgetProximityComponent`): button 22 adds 0.1 to DataStore `Brightness` (wraps above 1.0 to 0.1); `UpdateBrightness` sets the component's `TintColorAndOpacity` to (1, 1, 1, Brightness), or all 0 without power. Default tint (1, 1, 1, 0.5) | `BP_FSN_DB_143_DD_ScreenClient`: `GetBrightness` mapped to `MinimumBrightness..1` into the tint's RGB, alpha 1 with power and in gear, else 0 (page `WBP_FSN_DB_143_Brightness`) |
| Screen material | `MI_DB_DD_WidgetScreen` (parent `M_DB_DD_WidgetScreen`, `IsScreen` 1): parameters `SlateUI` (the render target), `TintColorAndOpacity`, `BackColor` (0, 0, 0, 1), `EmissiveAdjustment*`, `EmissiveCapMult`, `IsLamp`; no shading-model override, so **default lit** (Specular 0.5, Metallic 0) with the widget as emissive | `MI_FSN_DB_BR143_Screen` (parent `M_FSN_DB_BR143_Screen`, masked): the same parameter set, also lit |

**Why a dark page looks light blue (run 29, FSN Dosto cab car, 05:46, night).** Both screens of the
desk showed the same haze: the game's own traction page in night mode (white text, background linear
0.021) came out sRGB 98,151,190 at its top and 78,139,184 at its bottom, our EbuLa page (paper linear
0.004) sRGB 127,163,191, the dark desk beside them 41,30,40. A near-black page that comes out far lighter
than the dimly lit desk is not the page's colour but light the surface adds: the screen material is lit, so
the cab's light and reflections (and the exposure of a dark cab) lay a haze over every page, varying
with the angle. No paper colour removes it, and the brightness keys only scale the widget's own light.
What helps is bright text: the game's own night pages use text 1.0 for that reason. tsw-ebula's night
ink went from 0.20 to 0.85 (tsw-ebula 0eb039f). *Unverified in game:* how the haze compares at full
`Brightness`, and in the BR 143 (same kind of material, so the same is expected).

Reading the cab's own state would let `ebula.night = auto` follow the driver's day/night key instead
of the clock: the Dosto page's `DayNight_Mask` (black = night), the BR 143 page's `bNightmode`. Not
built.

### What a mod can read instead (for tsw-autopilot)

The data an EBuLa would display exists natively.

| EBuLa column | TSW source | Status |
| :--- | :--- | :--- |
| Speed and km of the next changes | `URailVehicleComponent::QueryTrackRestrictions(FTrackRestrictionQuery&)`. The query sets `MaxSearchDistance`, `SearchDirection`, `MaxReturnedSpeedLimits` and `MaxReturnedSignals`, and returns `FoundSpeedLimits[] { FNetworkRibbonLocation, RestrictionType, SpeedLimitMS, DistanceCM }` and `FoundSignals[]`. `ETrackNetworkRestrictionType` distinguishes `TrackPropertySpeedLimit, TrackRuleSpeedLimit, SignalSpeedLimit, SetAgainstJunction, EndOfTrack, SignalAncillary, TemporarySpeedLimit` (the La equivalent). | [V] headers. *Unverified* at runtime. `GetDriverAidData`'s built-in query asks for only 4 limits and 4 signals (HTTP API dump: `maxSearchDistance 10000`, `maxReturnedSpeedLimits 4`). A mod can run its own query with a longer horizon. |
| Braking curve to the next restriction | `FSpeedCurveQuery { ExpectedDecelerationMS2, MinDistanceFromSpeedLimit, MinDistanceFromSignal } → OutMaxSpeedMS, OutTargetSpeedMS, OutDistanceToRestrictionCM, OutRestrictionType`, evaluated through `UPhysicsFunctionLibrary::GetTrackRestrictionSpeeds`, `GetDistanceToSpeedCurve`, `GetTimeToSpeedCurve`, and the LZB variants `GetLZBRestrictions` / `GetDistanceToSpeedCurveLZB` | [V] headers. The game computes target speeds for a given deceleration itself. |
| Station names, stops and times (Ankunft/Abfahrt) | `ARouteTimetable` instructions, `GetServiceExpectedTimes`, `GetTrackData` stations and markers ahead | already in [timetable-and-map.md](timetable-and-map.md) |
| Delay | `FRouteTimetableService::EstimatedLateness` | same |
| Main signals by kind (Esig, Asig, Zsig, Bksig, Sbk) in the text column | our own `QueryTrackRestrictions` on the driven vehicle (the driver aid's `FoundSignals` comes back empty) → `UNetworkSignalProperty::SignalId` / `SignalDisplayID` / `SignalType`, classified by name, plate and place | [ebula-signal-kinds.md](ebula-signal-kinds.md); *unverified* at runtime |
| Gradient (Sägelinien) | `FTS2DriverAidData::Gradient`, `FTS2TrackData::TrackHeights` | [V] headers |
| Tunnels, LZB/ETCS begin and end, El signals, radio channels | no reflected source found | [I] not available |

The ICE-T overlay above shows the game's own pattern: `GetDriverAidData` once per tick, km/h through
`UnitConversion::MetresPerSecToKPH`, and distance in cm divided by 100. The same units are assumed in
timetable-and-map.md.

### Reproduce

Read-only on the game. Pak listings are in `/run/media/system/Data/tsw-decomp/lists/`. Unpack with
`repak unpack -q -o <scratch>/extract -i <path> <pak>`, then run `kdecomp.dll <usmap> <scratch>/out
<scratch>/extract <assets…>` in `build-box`, as in `tools/decomp.sh`, but with a scratch output directory.
Unpacked: `FTF_DB_Vectron/Content/DigitalDisplaysNew/Widgets`, `FTF_DB_BR423/Content/DigitalDisplay`,
`FTF_DB_Doppelstock/Content/DigitalDisplays/Widgets`, `FTF_DB_BR411/Content/View/Screens/MTD_Right`,
`FTF_DB_BR114/Content/DigitalDisplays/DE` (FrankfurtFulda pak), `DLG_DB_BR143/Content/DigitalDisplays`,
`DLG_DB_BR442/Content/DigitalDisplays/Screens` including `Panel4` (DresdenLeipzig pak).

## Open questions

- Does `GetAllWidgetsOfClass` with `TopLevelOnly = false` see the cab screen pages (their `GetWorld`
  must be the player's world), and does the screen component re-render widgets added at runtime?
  First test with tsw-ebula on BR 143 FSN.

- Does anything call `WBP_DLG_DB_BR442_ESF.AddRow`? Decompile the rest of `DLG_DB_BR442/Content`.
- Do newer DLC that are not installed here (e.g. TSW 6/7 German routes) ship a data-driven EbuLa?
- At runtime, what do `QueryTrackRestrictions` and the speed curves return with a long horizon? Does
  TSW use `TemporarySpeedLimit` at all?
- Which official HTTP API fields does online-EBuLa's "Ortung" use? Probably the `DriverAid` node and
  `CurrentDrivableActor` lat/long; see `tsw-coop/dumps/tsw7-886/httpapi/`.

[bp0312]: https://www.uv-bund-bahn.de/fileadmin/user_upload/inhalte/dokumente/Publikationen/BahnPraxis_B/Archiv/BahnPraxisB-2003_12.pdf
[bp0401]: https://www.uv-bund-bahn.de/fileadmin/user_upload/inhalte/dokumente/Publikationen/BahnPraxis_B/Archiv/BahnPraxisB-2004_01.pdf
[ril408]: https://www.jonroma.net/media/rail/opdocs/world/germany/ril/rw_408.21-27_neuherausgabe.pdf
[ril408-2026]: https://www.dbinfrago.com/resource/blob/13175008/b7ee5ccbe188a51429cdb6d52427e7c7/Ril-408-21-27-INB-2026-data.pdf
[wp]: https://de.wikipedia.org/wiki/EBuLa
[infrago]: https://www.dbinfrago.com/web/schienennetz/betrieb/allgemeine-betriebsinformationen/ebula-11857410
[infrago-2027]: https://www.dbinfrago.com/resource/blob/13641032/779d507eed0b81d6c024376a84477d0b/Informationsveranstaltung-Vertiefung-ujBau-vom-27-11-2025-data.pdf
[ei2024]: https://cn-mobility.eu/api/media/file/EI_2024-05_Dynamischer%20Fahrplan.pdf
[systel]: https://www.dbsystel.de/dbsystel/Digital-Stories/der-digitale-fahrplan-13637386
[rwth]: https://www.via.rwth-aachen.de/downloads/ETR_10_19_Stoll_Niessen_Nelles_Brandl.pdf
[inavet]: https://inavet.de/de/aktuelles/thema/railtab-der-digitale-fuehrerstand
[oebb]: https://infrastruktur.oebb.at/de/geschaeftspartner/schienennetz/dokumente-und-daten/elektronisches-zugfahrtmanagement/zfm-auf-einen-blick/elektronischer-buchfahrplan
[lea]: https://franco.wiki/fr/Lokpersonal_Electronic_Assistant.html
[zusi-df]: https://forum.zusi.de/viewtopic.php?t=20225
[zusi3]: https://verschiedenes.zusi.de/forum/zusi3fkt/zusi3uebersicht.htm
[zusi-fo]: https://forum.zusi.de/viewtopic.php?t=12120
[loksim]: https://www.loksim3d.de/de/addons/tool-zur-anzeige-der-ebula
[dtg-14464]: https://forums.dovetailgames.com/threads/working-ebula-for-german-locos.14464/
[dtg-344465]: https://forums.dovetailgames.com/posts/344465/
[dtg-ebula]: https://forums.dovetailgames.com/posts/471641/
[dtg-simple]: https://forums.dovetailgames.com/threads/introducing-simple-ebula.81175/
[online-ebula]: https://online-ebula.de/anleitung/
[tsc-noir]: https://www.trainsimcommunity.com/mods/c3-train-sim-world/c115-documentation/i5185-ebula-inspired-book-timetables
