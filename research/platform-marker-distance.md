---
name: platform-marker-distance
description: >-
  Which end of a platform the track data's marker distance points to in Train Sim World 7 (GetTrackData's FStationDetail): one point of the marker's nearest per-segment fragment, the far end when the marker lies in one track segment, the near end when it spans segments; no direction or second end is returned. Why the HUD objective's distance read 0 m, and the read that works with the HUD hidden. Decompiled; tsw-sdk and tsw-autopilot changes.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-23T12:00+0200
last_edited: 2026-10-23T12:00+0200
---

# Which end of a platform the marker distance gives (2026-10-23)

The question came from tsw-autopilot missing the stop at Mainz-Kastel (FSN, S1-35137, BR 430),
runs 34-46. That platform has one track item, `Platform Mainz-Kastel [Mainz-Kastel Bstg 2]`,
245 m long, and no station-wide item. The autopilot took the marker's distance as the
platform's near end, so it aimed 75-190 m past the far end. The game failed the stop each
time the front ran past that far end. The notes so far said a marker gives its *start*, the
far end "when the platform runs against the train". The decompiled code says something else.

Everything below is from the Ghidra export of build 886 (`TrainSimWorld.c`) and the
exe's registration tables. None of it was checked in game yet.

## Where `GetTrackData` comes from

- `ATS2PrototypePlayerController::GetTrackData` (`FUN_1411b5380`) only copies a cached
  `FTS2TrackData` at controller+0xCE8.
- An async task (`FUN_1411aeb40`) fills the cache, using `FUN_1411d1710`. That function makes
  three track walks:
  1. heights 2 km behind the train,
  2. heights 8 km ahead,
  3. markers 8 km ahead.
- The marker walk calls `FUN_1411a1e30` once per track segment. That callback goes through the
  segment's `UTrackMarkerProperty` objects. Each one is a `UNetworkRangePropertyBase`:
  - it covers `Start`..`End` (offsets 0x40/0x44) as parameters on that one segment;
  - a platform that spans segments is one such fragment per segment.
- A marker name already listed is skipped. So the first fragment found, the nearest one,
  decides the item.

## Which point the distance measures

The callback takes the point from virtual 0x290 of the fragment (`FUN_140fe3780`), passing
whether the walk runs against the segment's own direction:

```
t = walking along the segment ? End : Start
```

That is the fragment's far point in the direction of travel, as long as `Start < End`. If `t` is
exactly 0 or 1, the point is a segment end: the marker goes on into the next segment. The callback
then uses virtual 0x288 instead (`FUN_140fe6940`, the opposite choice), which is the fragment's
near point. If that one is a segment end too, it goes back to the first.

`DistanceToStationCM` is the distance to that point:
`|walk distance at the segment end - segment length * |t_end - t||`.

| Marker | Fragments | Item distance | Seen |
| :--- | :--- | :--- | :--- |
| inside one segment | one | **far end** | Hanau Hbf Bstg 7 (932 m, station item 624 m, 308 m long); Wolfgang (Hanau) Bstg 3; Mainz-Kastel Bstg 2 (objective at the marker, run 45) |
| spans segments | several | **near end** (the first fragment's far point is a segment end) | Rodenbach Bstg 2 (7195 m, the station item too) |

So "runs against the train" was really "lies within one segment". The direction of travel
does not enter into it, except through `Start < End` on the segment. Station-wide items (the
`Stations` array, empty marker name) gave the near end in every case seen.

## What the game does not give

- **No direction, facing or second end.** `FStationDetail` is `StationName`,
  `DistanceToStation` (`FVector2D`), `DistanceToStationCM`, `PlatformLength`, `MarkerType` and
  `MarkerName`. `DistanceToStation` is the HUD graph's point, *not* a second distance:
  - X: the walk distance at the end of the segment the fragment was found on, plus the graph's
    offset;
  - Y: the track height there.
- `UTrackMarkerProperty` has `LineSide` (the platform side) and `PlatformClass`. Neither is a
  direction relative to the train.
- `QueryTrackRestrictions` (`FTrackRestrictionQuery`) returns signals and speed limits only, no
  markers.

Telling the two cases apart from the track data alone would mean reading the marker's fragments
(`UTrackMarkerProperty` with that `MarkerName`, by an object walk) and the walk's direction on
each segment. That was not built. The game itself knows the stop from its objective instead.

## The game's stop: the objective

Each `GoTo` has an `UObjectiveActionMoveToComponent`. Its `GetStopAtPlacementCetrePosition`
(a ribbon location at 0x654, made into a world position) is where the front should halt, a few
metres short of the platform's far end. The HUD draws its marker there.

### Why it read 0 m (run 46)

`UTS2HUDObjectiveWidget::GetDistanceToObjective` (`FUN_140f92bd0`) goes:

1. `GetOwningPlayer`
2. `MyHUD`
3. `ATS2GameHUD.HUDWidget`
4. `HUDMarkersManager.ObjectiveMarkers`

With exactly one marker it returns `true` and that marker's native float at 0x2B0
(`UTS2ObjectiveMarkerWidget::GetDistance`). Only `UpdateObjectiveMarkerPosition`
(`FUN_140fb0db0`, vtable 0x488) writes that float. The only caller is the marker blueprint's
`Tick` (`HUD_DynamicObjectiveMarker`).

A marker the HUD does not draw never ticks:
- the HUD hidden (F1);
- objective markers off (`GetShowObjectiveMarker`, the visibility binding of
  `HUD_DynamicObjectiveMarker`).

It answers `true` with 0. Run 45 read 3.8 km on the same service, run 46 read 0 m for the whole
approach.

### The read that works hidden

tsw-sdk now calls `UpdateObjectiveMarkerPosition` itself, with zero margin and height, as the
blueprint's `Tick` does. It does this on the single marker in
`APlayerController::GetHUD` → `ATS2GameHUD::GetHUDWidget` → `HUDMarkersManager.ObjectiveMarkers`,
and reads its `Distance` out parameter (cm, a straight line from the camera). There is no object
walk any more. It returns `None`:
- when the call returns `false`;
- when there is not exactly one marker;
- for a distance of 0.

## In tsw-sdk and tsw-autopilot

- tsw-sdk `timetable::Objective::distance_m(controller)`: the read above.
- `timetable::Ahead` documents which end its distance can be.
- tsw-autopilot `route::stop_point(items, next, train_m, objective_m)` decides which end the
  marker gives:
  1. **The objective.** The marker's distance is the far end when the objective lies nearer to
     it than to the distance plus the length. The objective counts only when it is more than
     50 m away and within half a platform of either end.
  2. **Without the objective:** the old station-wide-item test.
  3. **Otherwise:** the near end.
- The controller again takes the objective as the stop only within 220 m either way. The
  450 m-short allowance from run 45 is gone, because the stop point now knows the far end.

**In-game check:** at Mainz-Kastel the status line `stop N m (objective M m)` should show the
objective from kilometres out, never 0 m. The stop should equal it: the track's stop is
centred about 80 m short of the objective (245 m platform, a BR 430 of about 70 m), so the
controller takes the objective. The stop should never be a platform's length beyond it. The
train should stop within the platform even with the HUD hidden (F1).
