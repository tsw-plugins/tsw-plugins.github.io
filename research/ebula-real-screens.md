---
name: ebula-real-screens
description: >-
  What real EBuLa screens look like, read from two in-cab photos on Wikimedia Commons (a 2006 Hamburg screen by day, a 2004 one in night mode) and the 1982 printout prototype: header boxes, the line under them, the columns, how signals, stations and times are written, and what is never shown (aspects, coloured rows). Extended with 20 more references (in-cab photos 2000–2024, the manufacturer's screenshot, Zusi and other replicas) and a consolidated, measured spec of the look. The reference for tsw-ebula's default look.
created: 2026-10-22T10:40+0200
last_edited: 2026-10-22T11:40+0200
---

# Real EBuLa screens (2026-10-22)

Sources, all on Wikimedia Commons:
- [File:EBuLa.jpg](https://commons.wikimedia.org/wiki/File:EBuLa.jpg): day mode, train 21058, Hamburg Dammtor to Hamburg Hbf, 05.03.06.
- [File:928_676_EBuLa_Wiki.jpg](https://commons.wikimedia.org/wiki/File:928_676_EBuLa_Wiki.jpg): night mode, train 39342, 09.12.04.
- [File:MusterEbula.gif](https://commons.wikimedia.org/wiki/File:MusterEbula.gif): the 1982 printout prototype "Eine andere Darstellung des Fahrplanes".

The owner asked for this after a friend who works for DB pointed out that the EBuLa never shows signal aspects (see [ebula-signal-kinds.md](ebula-signal-kinds.md)).

## Layout (day mode)

- **Header row of boxes**, black on white, each framed:
  - the train number (large, "21058");
  - a small two-line validity note ("EBuLa-Karte gültig bis 05.03.2006");
  - the date ("05.03.06", large);
  - the clock with seconds ("13:30:30", large).
- **A thin line under the header:**
  - left: the speed ahead ("ab km 291,2: 40 km/h");
  - right: the next stop ("Nächster Halt: Elmshorn").
- **The timetable**, white paper, black text. **No horizontal grid lines between rows and no row fills**: no yellow next-stop row and no red signal row. Only vertical column borders.
  - Columns from the left:
    1. A speed column. A thick vertical line shows the permitted speed level, and the speed number (60, 40) stands at its change, low and to the left.
    2. A narrow graphic column with the track line. The train's position is a ◆ diamond on it.
    3. The km column. Hectometres are drawn small and lowered: "288,1" shows the "1" as a small subscript.
    4. The text column.
    5. The arrival column.
    6. The departure column.
  - Text column:
    - station names **bold** ("Hmb Dammtor Hp", "Hamburg Hbf");
    - signals by kind and number in regular weight: "Sbk103", "Sbk101", "Asig", "Zsig";
    - distant signals with a ▽ triangle before them: "▽ Bvsig", "▽ Avsig";
    - "¥", the end-of-points mark;
    - the train radio channel with a phone symbol: "☎ - ZF A 66 -".
  - Times are hours:minutes, with the tenth of a minute as a small lowered digit ("08:48" with a small "3"). There are no seconds.
  - The list runs bottom to top. Rows are spaced by km, not one per item. Blank space marks long gaps.
- **A status line at the bottom:** a symbol, the speed ("40"), "RWW", the radio channel, and a deviation such as "+286 mm".
- **Softkey labels** along the bottom edge, matching the buttons under the screen: "Zug", "FSD", "LW", "GW", "G".
- Night mode inverts the screen: light text on a dark background.

## The 1982 prototype

The printout already wrote signals by kind and number ("BKSIG C 351", "SBK 657", "SBK 683"), entry and exit speeds as "E 50" and "A 50", and radio channels ("- ZBF A 63 -"). It never wrote an aspect.

## What this means for tsw-ebula's default look

- Signals as kind and number (Esig, Asig, Zsig, Bksig, Sbk 103; ▽ for distant signals).
- No aspect text.
- Bold station names.
- No coloured row fills and no horizontal row lines.
- The position shown as a ◆ on the track line, with a speed-level bar.
- Small hectometre digits.
- Times as HH:MM plus a small tenth-of-a-minute digit.
- Header boxes with the train number, date and clock, and the "ab km …" / "Nächster Halt" line under them.
- Danger rows, aspects and highlighted next stops can stay available as opt-in settings.

## More references (2026-10-22)

Looked at in the browser, nothing downloaded. "Real" is a photo of a DB on-board unit or the
manufacturer's own screenshot; "replica" is a simulator or app drawing of it. Pixel values were
read from the replica PNGs (lossless), never guessed from the photos.

| # | Source | Kind, year, vehicle | Mode | What it adds |
|---|---|---|---|---|
| 1 | [Commons: EBuLa.jpg](https://commons.wikimedia.org/wiki/File:EBuLa.jpg) | real, 2006; Commons says BR 185 | day | (above) ◆ on the speed/km border, stepped speed bar, stops bold, cream status line, grey softkey bar |
| 2 | [Commons: 928_676_EBuLa_Wiki.jpg](https://commons.wikimedia.org/wiki/File:928_676_EBuLa_Wiki.jpg) | real, 2004, VS 928 (retrofit) | night | (above) |
| 3 | [Commons: 2013-09-15 E 155 Elektronischer Fahrplan](https://commons.wikimedia.org/wiki/File:2013-09-15_15-18-00_E_155_Elektronischer_Fahrplan.jpg) | real, 2013, BR 155, freight 45017, Rheintalbahn | day | sharpest real photo: "Fahrplan gültig!" centred, **grey underline under every text row**, symbol sub-column (¥, boxed "LZB"), "LZB-Bk 66261", "Sbk 66257" with a space, passing times "00:47" + small ".5" in the departure column, yellow box behind the current speed "100", cream status line "RW /r · 600 A · GSM-R · -367 min", softkeys Zug FSD … LW GW Zeit … G |
| 4 | [Commons: ICE 407.2.jpg](https://commons.wikimedia.org/wiki/File:ICE_407.2.jpg) | real, ICE 3 (BR 407) | night | black page, light-blue lines, inverse (light) symbol boxes, stepped speed line |
| 5 | [Commons: Talent2 fuehrerstand FO.jpg](https://commons.wikimedia.org/wiki/File:Talent2_fuehrerstand_FO.jpg) | real, Talent 2 (BR 442) | night | a message dialog over the dark page; unreadable otherwise |
| 6 | [DB InfraGO EBuLa page, photo](https://www.dbinfrago.com/resource/blob/11857414/a2330319529865b306b0c3802382bcec/ebula-1--data.jpg) ([page](https://www.dbinfrago.com/web/schienennetz/betrieb/allgemeine-betriebsinformationen/ebula-11857410)) | real, 2022, IC 2072 (Berlin–Hamburg line), loco cab, plus a tablet with the La | day | date with weekday "Mi 26.10.22"; ◆ **mid-page** on the track line; "160" in a yellow box at the bottom of the speed column; boxed "600 A" in the status line; "+4 min" |
| 7 | [Bahnblogstelle, DB photo by D. Dupont](https://bahnblogstelle.com/wp-content/uploads/2024/12/2024-12-Symbolbild-Lokfuehrer-Fuehrerstand-EbuLa-Display__c__DB-AG-Dominic-Dupont.jpg) | real, 2021 date on screen, Talent 2 / Dosto-type desk | night | black page, cream text and lines, grey row underlines, **blue status line**, "Do 25.02.21" |
| 8 | [GERSYS BC7-EBuLa product image](https://www.gersys.de/fileadmin/_processed_/b/c/csm_GERSYS_Produkte-freigestellt__BC7-EBuLa_9d3ae9a83a.png) ([page](https://www.gersys.de/produkte/fahrerassistenzsysteme)) | manufacturer screenshot, 2021, S-Bahn Hannover 34111 | day | the cleanest real layout: stops bold ("H-Leinhausen Hp", "Seelze"), signals regular and greyer ("Sbk 956", "Asig Ri S", "Esig Hannover Hbf"), info "ℹ 600 A", "S-Bahn", footnote "*1)", zigzag at the text column's right edge, arrival "06:24.0" / departure "06:24.4" with small tenths |
| 9 | [sh1.org cab displays: stw.jpg](https://www.sh1.org/fotos/jpeg/stw.jpg) ([page](https://www.sh1.org/fotos/locos.htm)) | real, Nov 2000, control car | day | first generation: yellow-green STN-LCD tint |
| 10 | [baureihe654.de, VT 654 desk (M. Lötzgen)](http://baureihe654.de/wp-content/uploads/vbg_fuehrerpult2.jpg) ([page](https://www.baureihe654.de/?page_id=87)) | real, 2007, VBG Regio-Shuttle (private operator) | night | "EBuLa-Karte gültig bis 30.07.2007", La entries as inverse "Lf" boxes, "Betriebsbremsung", blue status line |
| 11 | [rail-sim.de: ET 423 14297 photo](https://rail-sim.de/forum/wcf/attachment/604867-blick-auf-ebula-des-et423-14297-jpg/) ([thread](https://rail-sim.de/forum/thread/42029-dtg-frankfurt-fulda-kinzigtalbahn/?pageNo=6)) | real, 2004, S-Bahn Stuttgart 4347 | day | speed steps with a horizontal line each, bold numbers at the right; "Esig" with "E50" at the right of the text column; radio "☎ - ZF A 78 -" bold; only "Backnang" bold although the Hp have times |
| 12 | [BERUFENET cab photo](https://rest.arbeitsagentur.de/infosysbub/berufepool-rest/ct/v1/bilder/dkz_136200_05.jpg) | real, ICE 4 desk | dark | position of the EBuLa in a modern desk only |
| 13 | [Zusi 3 professional EBuLa](https://www.zusi.de/images/professional/software/displays/ebula.PNG) ([page](https://www.zusi.de/zusi-3-professional/training-betriebsdienst/software/displays.html)) | replica (training simulator), 2012 | day | pixel-exact: see the measurements below; tunnel portals and dashed tunnel track in the graphic column, crossed "LZB" box for LZB end, softkeys Zug FSD LaD LaT LW GW Zeit … G |
| 14 | [ZusiDisplay](https://www.zusidisplay.de/images/screen_EBuLa.webp) ([page](https://www.zusidisplay.de/)) | replica, 2021 | day | "Keine TCP-Verbindung" in the centre of the line under the header; boxed ← before "Bksig" (signal left of the track); "ETCS-Bk 33159" |
| 15 | [Zusi 2 / virtualRailroads EBuLa](http://www.zusi.de/images/zusi2/ebula.png) | replica, 2009 | night | night palette measured below; stops bold white, other names grey |
| 16 | [online-EBuLa, night](https://online-ebula.de/wp-content/uploads/2024/08/2024_08_28_11_31_28_EBuLa.png) ([site](https://online-ebula.de/)) | replica for TSW, 2024 | night | speed segments framed, white ◆ on the speed/km border, route name bold in the header ("RE München - Salzburg"), "ESF + 0 kWh - 0 kWh" cell, blue status line |
| 17 | [YouTube "Mit EBuLa auf der Maintalbahn" thumbnail](https://i.ytimg.com/vi/u1WiYtdFS-g/maxresdefault.jpg) ([video](https://www.youtube.com/watch?v=u1WiYtdFS-g)) | online-EBuLa in TSW 5, by a working driver, 2024 | day | the same in day mode: ◆ mid-page, "Esig E60" with "E60" right-aligned, -5s/+5s keys |
| 18 | [vEBuLa iPad app](https://thurnwald.eu/wp-content/uploads/2021/01/iPad-Features-1240x744.png) ([page](https://thurnwald.eu/vebula/)) | replica (tablet), 2020 | day + night | "Fahrplan ungültig!" variant, stops bold, "Hp", "Bft" prefixes |
| 19 | [rail-sim.de "EbuLa Fahrpläne" screenshot](https://rail-sim.de/forum/wcf/attachment/592378-screenshot-2024-09-06-011903-png/) ([thread](https://rail-sim.de/forum/thread/41997-ebula-fahrpläne/)) | replica for TSW, 2024 | night | "Sbk/Evsig 58 018", "Asig 59 M5 … A60", "- ZF GSM-R -" bold, "+417.1 min" |
| 20 | [EBuLa replica by J. Haupert](https://picup.oliverlamm.de/files/IMG_d597b7390505eb04409010aae5a4a869_65ki4nsez_UC6.png) | replica, 2008, exactly 640 × 480 | day | pixel-exact at the design width: see below; symbols (¥, ☎, chequered square, Evsig mark) in the km column's right part, no row underlines (older generation), softkey "GNT" |
| 21 | [Train Sim Community: DB BR 401 EBuLa mod](https://image-cdn.aveia.tech/oSXdD8A3oLcsv2wTzjoBJDxkXQc=/tscmr-prod/images/1015629232820150272.jpg) ([mod](https://www.trainsimcommunity.com/mods/c3-train-sim-world/c19-patches/i2842-db-br-401-ebu-la-mod)) | replica in a TSW cab, 2019 data | night | ¥ and ☎ as inverse boxes in night mode, "Kassel-Wilhelmshöhe" bold |
| 22 | [TS-MFD](https://www.ts-mfd.de/images/Pic_ts-mfd/timtableMFD_5.png) ([site](https://www.ts-mfd.de/)) | replica for Train Simulator Classic | night | a loose copy (km as decimals, seconds in times); shown only to mark what not to copy |
| 23 | [Commons: BfplEbula1996.gif](https://commons.wikimedia.org/wiki/File:BfplEbula1996.gif), [EbulaPrior1983.jpg](https://commons.wikimedia.org/wiki/File:EbulaPrior1983.jpg) | letters, 1983 and 1996 | – | history only (project start 1994, name EBuLa once the La was added) |

TSW's own EbuLa pages (Dosto, BR 423, Vectron, BR 143/114, BR 442 ESF) are listed in
[ebula.md](ebula.md): most draw a fixed picture or an empty frame, so they are no layout reference.
Found nothing usable from Loksim3D, and no public copy of Ril 408.2341's figures; YouTube
cab-ride stills were too small to read beyond the frame.

### Measured layouts of the two pixel-exact replicas

Zusi 3 (#13, page 630 px wide inside a 1 px frame, 460 px tall) and Haupert (#20, 640 × 480):

| Part | Zusi 3 | Haupert | at 640 px |
|---|---|---|---|
| Header height | 30 | 28 | 30 |
| Header boxes (train, message, date, clock) | 84, 297, 130, 111 | 101, 304, 132, 93 | 100, 300, 130, 110 |
| Line under the header | 18 | 16 | 18 |
| Row pitch, rows | 23 px, 15 rows | ≈ 20 px, 18 rows | 22 px, 15 rows |
| Status line | 25 | 26 | 24 |
| Softkey bar | 34 | 36 | 30 |
| Main lines (frame, header, columns) | 2 px | 3 px | 2 px |
| Speed column | 103 | 110 | 104 |
| Speed bar width | 7 | 7 | 7 |
| Bar position | 0.40 px per km/h from the column's left | 0.34 px per km/h | 0.32 px per km/h (300 km/h at the right) |
| km column | 108 | 105 (symbols in its right part) | 92 |
| Graphic column (track, tunnels) | 14, right of the km column | 9, right of the km column | 12 |
| Symbol sub-column, then text | 20 + 225 | in km column + 268 | 20 + 252 |
| Arrival, departure | 79, 73 | 75, 59 | 80, 80 |

Colours (sRGB, then linear):

| Element | Zusi 3 / Zusi 2 | Haupert | online-EBuLa |
|---|---|---|---|
| Day paper | 245 (0.913) | 255 | 255 |
| Day ink, lines | 20 | 0 | 0 |
| Row underline (day) | 195 (0.546) | none | dark grey |
| Day status line | 253,245,230 (0.98, 0.91, 0.79) | 255,255,191 (1, 1, 0.52) | – |
| Current-speed box | 255,255,0 | 255,255,0 | – |
| Softkey bar | 211 (0.65) | 192 with 3-D bevel | 157,160,174 |
| Night page | 30 (0.013) | – | 16 (0.005) |
| Night text | 245, others 138 | – | 234 |
| Night status line | 70,130,180 (0.06, 0.22, 0.46) | – | 0,31,204 (0, 0.014, 0.60) |

### Consolidated spec

**Consistent across all real screens and the good replicas (2004–2024):**

- **Frame and lines.** Black frame and column lines on light paper; the main separators (under
  the header, under the line below it, above the status line, between the columns) are thicker
  (2–3 px at 640) than the inner ones (1 px). No row fills.
- **Header, four framed boxes:** train number (bold, large) · message box (centred: "Fahrplan
  gültig!", "Fahrplan ungültig!", "EBuLa-Karte gültig bis …", "La-Daten für …", or the route name)
  · date (bold, large) · clock with seconds (bold, large). The message box is the widest.
- **Line under the header:** a small framed box at the left sized to its text, "ab km 283,1:
  120 km/h"; a small framed box at the right sized to its text, "Nächster Halt: Ludwigslust";
  between them blank or a system message ("Keine TCP-Verbindung"). Small bold text.
- **Columns, left to right:** speed · km · narrow graphic column (track line, tunnel portals,
  dashed track in tunnels) · symbol sub-column + text · arrival · departure. The km column
  comes right after the speed column; **the ◆ position marker sits on the line between the
  speed and km columns**, not in a column of its own.
- **Speed column:** a thick (7 px) black vertical bar whose horizontal place is the permitted
  speed (further right = faster), running the whole height; at every change a thin horizontal
  line crosses the speed column, and the new speed stands **bold, right-aligned at the column's
  right edge**, just above that line (lists run bottom to top, so the number sits where the
  speed begins). The current speed at the bottom has a **yellow box** behind it.
- **km:** "171,8", the hectometre digit small and lowered; right-aligned, one row per item.
- **Rows:** a fixed pitch, one place per row (km always filled even when the text is empty).
  Long gaps are not drawn longer.
- **Text column:** symbols in a narrow sub-column at its left (¥ end of points, ☎ radio, boxed
  "LZB" / crossed "LZB" for LZB start and end, ▽ distant signal, ← signal on the left, ℹ info,
  inverse "Lf" boxes for La entries); then the text in a proportional sans (Arial/Helvetica-like):
  - **stops bold** (the train's scheduled stops, those with times), stations passed and all
    signals regular;
  - signals by kind and number with a space: "Esig", "Asig", "Zsig", "Bksig", "Sbk 66257",
    "LZB-Bk 66261", "ETCS-Bk 33159", "Asig Ri S", "Esig Hannover Hbf";
  - entry/exit speeds right-aligned in the text column: "E50", "E60", "A60";
  - radio channel bold: "☎ - ZF A 66 -", "- ZF GSM-R -";
  - footnotes "*1)", operational notes ("S-Bahn", "Betriebsbremsung", "Pz-Gleis").
- **Times:** HH:MM, then a small ".t" (dot and tenth of a minute, both small), no seconds.
  Arrival and departure for stops; passing times alone in the departure column.
- **Status line** (one line, cream by day, blue by night): a state icon at the left;
  "RW /r", the current-limit box "600 A", the radio system "GSM-R" (or "- ZF A 66 -"), the
  timetable offset "+4 min" / "-367 min"; at the right a separate cell with a red-crossed
  "ESF" (energy-saving advice off), or "ESF + 0 kWh - 0 kWh".
- **Softkey bar** under it: light grey with raised buttons, "Zug", "FSD", (LaD, LaT), "LW",
  "GW", "Zeit", (GNT), and "G" at the far right.
- **Night mode** inverts: near-black page, white/cream text and light lines; stops stay the
  brightest, signals and passed stations grey; symbols become inverse (light box, dark symbol);
  the status line turns blue with light text; the yellow speed box stays yellow.
- **Scrolling:** the ◆ climbs the page as the train runs (seen at the bottom, four rows up and
  mid-page) and the list moves on in jumps, not continuously.

**What varies (generations, operators, replicas):**

- Date: "05.03.06" (2004–2013) vs "Mi 26.10.22" with the weekday (2021 on); Zusi 3 writes
  "17.08.2012".
- Message box: "EBuLa-Karte gültig bis …" (2004–2008) vs "Fahrplan gültig!" (2012 on); the
  replicas often put the route there.
- Row underlines: absent before about 2008, present on every row since (2013, 2021, 2022).
- Bold: the 2004 S-Bahn photo bolds only "Backnang", although the Hp have times; every later
  source bolds the stops. The 2013 and 2022 photos show only passed places, hence nothing bold.
- Signals without a space ("Sbk103", 2006) vs with ("Sbk 956", 2013 on).
- Paper: yellow-green (2000), light blue-grey LCD (2004–2013 photos), neutral white/grey
  (2021 manufacturer screenshot, replicas).
- Night status line: steel blue (Zusi) vs saturated blue (online-EBuLa, real 2021 photo).
- Symbols in the km column (Haupert) vs in the text column (Zusi, real 2013/2022).
- Softkeys differ by vehicle and software (LaD/LaT, GNT, -5s/+5s).
