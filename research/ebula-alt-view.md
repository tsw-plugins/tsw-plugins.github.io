---
name: ebula-alt-view
description: >-
  A second EBuLa look the owner wants as a selectable view mode next to the classic one: two reference screenshots (Munich–Mühldorf, Markt Schwaben and Dorfen) and what they show, column by column. The reference for tsw-ebula's alternative view.
created: 2026-10-24T00:05+0200
last_edited: 2026-10-24T00:05+0200
---

# Alternative EBuLa view (2026-10-24)

The owner sent two screenshots of a different EBuLa style and asked for it as an
**alternate view mode**: a new option next to the existing look (which follows
[ebula-real-screens.md](ebula-real-screens.md)), not a replacement.

| Markt Schwaben | Dorfen |
| :---: | :---: |
| ![Markt Schwaben](ebula-alt-view/markt-schwaben.png) | ![Dorfen](ebula-alt-view/dorfen.png) |

Route in both: Munich–Mühldorf (Markt Schwaben, Poing, Dorfen).

## What the view shows

- **Header**: the current speed limit and the current km, e.g. `110 | 63,4`.
- **Columns**, left to right:
  - speed limit, bold, boxed where it changes;
  - km with one decimal;
  - a track-graphic column (the line, with branches at stations);
  - a symbol column (e.g. `¥`, a blue crossed Z);
  - the text column. Signals are written with their names right-aligned (`Asig A50`,
    `Esig E50`, `Sbk 6501`), stations in bold (`Dorfen Bahnhof`, `Markt Schwaben`), level
    crossings as `BÜ km 33.299`.
- **Times** with a tenths digit: arrival and departure (`15:59.1` / `16:03.4`); a pass time
  sits in the departure column (`15:54.0`).
- **Current position**: a yellow line across the rows.
- **Soft-key bar** at the bottom: icon buttons (antenna/satellite, ◆, `/R`, `RW`), `GSM-R`,
  the delay (`+411.2 min`) and an (i) button.
- **Status line** below it with the clock (`23:59:44`, `00:00:02`).

## For tsw-ebula

A setting chooses the look (for example `ebula.style = classic | alt`), switchable at
runtime. The data model stays the same; only the renderer differs. The todo item is in
`tasks/todo.md` under "2. tsw-ebula".
