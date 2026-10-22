---
name: ebula-real-screens
description: >-
  What real EBuLa screens look like, read from two in-cab photos on Wikimedia Commons (a 2006 Hamburg screen by day, a 2004 one in night mode) and the 1982 printout prototype: header boxes, the line under them, the columns, how signals, stations and times are written, and what is never shown (aspects, coloured rows). The reference for tsw-ebula's default look.
created: 2026-10-22T10:40+0200
last_edited: 2026-10-22T10:40+0200
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
