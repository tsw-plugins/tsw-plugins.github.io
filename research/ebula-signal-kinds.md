---
name: ebula-signal-kinds
description: >-
  How a mod tells what kind of main signal lies ahead (Esig, Asig, Zsig, Bksig, Sbk) for an EBuLa
  text column: what the real EBuLa shows, what TSW 7 exposes at runtime (the driver aid's found
  signals, `UNetworkSignalProperty` ids, plates and types), how the German routes name their
  signals (Frankfurt S-Bahn surveyed), and the classification rules with their confidence.
game_build: 886 (TSW 7)
created: 2026-10-22T11:00+0200
last_edited: 2026-10-22T20:00+0200
---

# Signal kinds for the EBuLa (2026-10-22)

Sources:
- The UHT and C++ header dumps (`tsw-coop/dumps/tsw7-886`), the DTG HTTP API dump of the driver aid
  (`httpapi/in-scenario/get_DriverAid.Data.json`).
- The full pak dump on the NAS (`/var/mnt/nas/gamedumps/tsw7/paks/`): the Frankfurt S-Bahn map tiles
  (`FrankfurtSBahn/Content/Map/Tiles/TT_*.txt`, every `DE_SignalModel_C` object) and the signal
  blueprints of the European Content Pack (`RailNetwork/Signals/DE_SignalModel`).
- Ril 408.2341A01 as summarised in [ebula.md](ebula.md), and a remark by a DB employee to the owner.

How a real screen writes them (spelling, the ▽, bold station names) is in
[ebula-real-screens.md](ebula-real-screens.md).

Markers: **[V]** read in the headers, the pak data or a primary source. **[I]** inferred, or from a
secondary source. *Unverified in game* marks what still needs a run.

## The real EBuLa never shows aspects [V]

The text column names **what kind of main signal** stands at a km, not what it shows ([ebula.md,
Text column](ebula.md#what-it-shows-ril-4082341a01-valid-from-13122015-v)):

| Text | Meaning |
| :--- | :--- |
| Esig | Einfahrsignal: entry into a station |
| Asig | Ausfahrsignal: exit from a station ("ohne Asig" on the station row when there is none) |
| Zsig | Zwischensignal: between the entry and exit signals |
| Bksig | Blocksignal on the open line |
| Sbk103 | Selbstblocksignal (automatic block) with its number, no space on the real screen |
| ▽ Bvsig | Vorsignal (distant signal) of entry signal B, with a triangle before it |
| "Zsig Ri F", "E 50", "ohne Zs 6" | distant signals at unusual places, route indicators, Hp 2 speeds other than 40, missing Zs 6 |

A timetable is printed (or loaded) long before the train runs; the aspect is what the driver sees
outside. tsw-ebula's earlier "Signal HALT" rows were therefore unlike any real EBuLa. The aspect view
stays as the opt-in setting `ebula.signal_aspects`.

## What the game exposes at runtime [V]

`ATS2PrototypePlayerController::GetDriverAidData(FTS2DriverAidData&)` (tsw-sdk's `timetable`
reader calls it twice a second for tsw-ebula) fills:

| Field | Content | Kind? |
| :--- | :--- | :--- |
| `SignalAspectClass`, `DistanceToSignal`, `bSignalIsPermissive`, `NextSignalPosition`, `SignalPropertyGuid` | the next signal | no |
| `NextSignals: TArray<FFoundSignalAspect>` | `{ESignalAspectClass Value, float DistanceToNextSignal, FVector NextSignalPosition}` per signal | no |
| `NextSignalProperty: FSignalPropertyReference` | `{RibbonReference, PropertyReference}` GUIDs of the next signal; `UNetworkBlueprintFunctionLibrary::GetNetworkSignalProperty(World, Ref)` turns it into the object | via the object |
| `TrackRestrictionQuery.FoundSignals: TArray<FFoundSignal>` | `{TWeakObjectPtr<UNetworkPointPropertyBase> Signal, float DistanceCM}`: the signals the aid's own query found; **empty in game** (below). The query asks for `MaxReturnedSignals` 4 within `MaxSearchDistance` 10000 (as the HTTP API prints it) with `SignalFlags` 7 | via the object |

`SignalFlags` is an `ESignalTypeBitFlags` mask: `Mainline 1 | YardEntry 2 | YardExit 4` = 7, so the
aid lists main, yard-entry and yard-exit signals, never shunting signals or distant signals (those
are `UNetworkSignalAncillaryProperty`, a different class) [V, enums header; I, that the mask means
exactly this].

The signal object is a `UNetworkSignalProperty` (on German routes the blueprint `DE_SignalModel_C`,
outer: the `NetworkRibbon` of its tile):

| Property | Offset | Content |
| :--- | :--- | :--- |
| `SignalId: FString` | 0x58 | the route builder's id: `FMB_Asig_P1`, `FKBW_BkSig_731`, `FMZ_Esig_A323`, `FF_01A249` |
| `SignalDisplayID: FString` | 0x68 | the plate: `P1`, `731`, `A_323`, `01A_249` (the route map tooltip shows it as `FSignalTooltipDescriptor::DisplayID`) |
| `SignalType: ESignalType` | 0x78 | `Mainline 0, YardEntry 1, YardExit 2, Yard 3, Shunt 4` |
| `RouteTable`, `ControlGroup`, `DispatchBlockCount`, `SignalAspect`, `SignalIndications` | | routes and live state, no kind |

`DE_SignalModel_C` adds `SignalSystem` (`E_DESystem`, unnamed enumerators; 3 selects the Hl logic),
`HasKs2/Hp2`, `HasZs3`, `AlwaysHp0`, `PassRequestAspect` (`DE_Asp_Sh1_C` or `DE_Asp_Zs7_C`),
`KSSpeedSignalling` and the Hl bar flags. **No property anywhere says entry, exit or block.** The
heads of the separate view actor (`DE_SignalView_C.Heads`, e.g. `DE_Head_HvK_HSB_Zs1_C`) and the
mast plates beside it (`BP_DE_SignalSign_WhiteYellowWhiteYellowWhite_C`, the Sbk mast sign, 7 in
FSN) are separate actors with no link to the property that a mod could follow cheaply [V].

**`FoundSignals` comes back empty from `GetDriverAidData` (run 29, 2026-10-22).** In game every signal
read Unknown and the one-time "found signals, none readable" log never appeared: the array the call
copies out has no elements, with a train too. The aid's next signals (`NextSignals`) carry only aspect,
distance and position.

### Where the names come from now (tsw-sdk, 2026-10-22)

Candidates, read in the headers and the decompiled blueprints:

| Source | Gives | Verdict |
| :--- | :--- | :--- |
| `NextSignalProperty` + `UNetworkBlueprintFunctionLibrary::GetNetworkSignalProperty(World, Ref)` | the next signal only | too little: the page lists 4 |
| our own `URailVehicleComponent::QueryTrackRestrictions(FTrackRestrictionQuery&)` | `FoundSignals` with weak pointers to the signal properties, as many as asked | **chosen** |

`QueryTrackRestrictions` is what the safety systems call themselves: `GNT_Service` runs
`RailVehicle.RailVehiclePhysicsComponent.QueryTrackRestrictions(...)` with queries such as
`MaxSearchDistance 4000, MaxReturnedSignals 1, SignalFlags 1` (`IntermittentTrackRestrictionQuery`)
and reads `FoundSignals[i].DistanceCM`; ACSES, ATB, KVB and the Czech code reader do the same.
`MaxSearchDistance` is an `FDistanceQuantity` in metres (GNT looks 4 and 15 km ahead), `DistanceCM`
centimetres.

tsw-sdk's timetable reader (`timetable::read`, `query_signals`) now asks the aid's own query again
(10 km, `bWholeFormation`, 4 signals, `SignalFlags` 7, no speed limits) on the `URailVehicleComponent`
of the vehicle the player drives (`Controller.Pawn` → `DriverPawn::GetDrivableActor` →
`RailVehiclePhysicsComponent`), once per driver aid read (twice a second for tsw-ebula), and pairs the
found signals with the aid's `NextSignals` by distance (within 20 m; no pairing by order any more).
`SearchDirection` is relative to the vehicle, and a cab car can face backwards: the reader keeps the
direction that last put found signals at the aid's distances and tries the other one when none match.
Cost per read: one track walk of at most 10 km (GNT runs a 15 km one for its continuous supervision), two when the
direction turns, plus two `FString` reads per signal. The aid's own `FoundSignals` path is gone.

Check in game: the plugin log line, once per world,
`timetable: signal names from QueryTrackRestrictions (forwards|backwards): N of M listed signals named,
K found, J with a kind`. N should equal M; if N is 0 the distances do not match (the aid may measure
from another point than `bWholeFormation`), if K is 0 the call found nothing.

## How the German routes name their signals [V, FSN pak dump]

Frankfurt S-Bahn has 1941 `DE_SignalModel_C`: 1039 `Mainline`, 327 `YardExit`, 575 `Shunt`.

**Ids with a kind word.** 242 of the 1039 main signals (23 %) carry one in their id, written by the
route builder: `Asig` 89, `Zsig` 60, `Esig` 53, `BkSig` 38, `Block` 2 (`FMB_Asig_N201`,
`FWO_Zsig_R501`, `FMZ_Esig_AA295`, `FKBW_BkSig_731`, `FKCH_Block_223`). The prefix is the station's
Ril 100 code (FMB, FMZ, FWO, FKBW, ...). No id in FSN says `Sbk`.

**Plates follow DB's naming habits** [V for FSN; I for the habits as a DB rule]:

| Plate | Kind | Examples |
| :--- | :--- | :--- |
| A–H, J, K alone, doubled (opposite track), or with a number | Esig | `A`, `F`, `AA`, `FF`, `BB_294`, `A_323`, `F681`, `H623` |
| N or P with a track number | Asig | `N201`, `N_648`, `P1`, `P_604`, `P:563` |
| a Z pair, or O, Q, R, S, T, U, X, with a number | Zsig | `ZR213`, `72_ZT2`, `R_502`, `S421`, `Q11`, `T_408`, `U_641` |
| a bare number | Bksig | `731`, `519`, `14_801` |
| a number with a Roman suffix, `01A…`, a letter run with a suffix | not told | `350I`, `203II`, `01A_249`, `W_567X`, `554Y` |

Checked against the 242 ids with a kind word, the plate rule alone gives the same kind for 232
(**96 %**). The ten that differ are route-builder exceptions: `FKOS_Asig_E`/`F` (exit signals
lettered like entry signals), `FMZ_Esig_S133`/`S134`, `FMW_BkSig_A540`/`A541`, `FMB_Zsig_P1`.
Of the 797 main signals without a kind word, the plate tells 515 (Block 158, Entry 143, Exit 126,
Intermediate 88) and leaves 282 open, mostly `350I`/`203II` style plates (179, of them 48 with `MLShunt` or
`shunt` in the id: main-line shunting signals) and the `01A_…` signals of the city tunnel (50).

The yard-exit signals (327) have plates like `601Y`, `W087`, `176II` and ids like
`FMB_YardExit_W087`; their type is the most useful thing about them.

## Classification (tsw-sdk `timetable::kind_from_names`, `kinds_by_place`)

In order; the first rule that answers wins.

| # | Rule | Confidence |
| :--- | :--- | :--- |
| 1 | The id contains `Esig`, `Asig`, `Zsig`, `Sbk`, `BkSig` or `Block` as a word start (any case; `FSBK_12` is a station code, not `Sbk`) | high: written by the route builder |
| 2 | The plate (else the id's last `_` word), made one word with a leading area number dropped when letters follow (`30_F` is `F`, `14_803` stays `14803`), by the table above | medium: 96 % against rule 1 in FSN |
| 3 | `SignalType` `YardEntry` is Esig, `YardExit` is Asig | low to medium [I] |
| 4 | The place, from the stations ahead (`GetTrackData` platform markers, one span per station from the first platform start to the last platform end): the last signal from the span start to 400 m past its end is the Asig, earlier ones there Zsig; the first signal up to 1500 m before the span is the Esig, later ones before the span Zsig; signals a nearer station already placed keep their kind; any other signal up to the last station listed is a Bksig; beyond it, unknown | low: platform markers are not the station limits, and the window lengths are guesses [I] |

Distant signals (`SignalKind::Distant`, shown "▽ Bvsig"): "vsig" anywhere in the id, or a plate
with V before or after entry letters (`vB`, `Bv`); `distant_of` gives the entry signal's letters.
They show only where a route models a distant signal as a main signal: the driver aid's query
lists no `UNetworkSignalAncillaryProperty` [I].

Rules 1 to 3 run in tsw-sdk when the driver aid is read (`SignalAhead::kind`, `id`, `plate`), on the
signals of its own query (above).
Rule 4 runs in tsw-ebula, which has the stations ahead. Only what none of them tells shows as
"Sig". "Sbk" comes only from rule 1, with the plate's digits as its number ("Sbk103"); a block signal is
"Bksig" otherwise. `bSignalIsPermissive` exists for the next signal only, so it is not used to tell
Sbk from Bksig (a row would change name as the train comes closer).

## Open questions (check in game)

- ~~Is `TrackRestrictionQuery.FoundSignals` filled in the copy `GetDriverAidData` returns?~~ No (run 29);
  replaced by our own query, see above. *Unverified in game:* that our query's distances match the aid's.
- Do the distances of our query's `FoundSignals` (`DistanceCM`) and `NextSignals` (`DistanceToNextSignal`)
  agree? tsw-sdk pairs them within 20 m only.
- Do the 4 found signals include yard exit signals the train is not routed through?
- Dresden–Leipzig, Frankfurt–Fulda and Linke Rheinstrecke: the same naming habits? (Their tiles were
  not surveyed yet.)

## Reproduce

Read-only on the NAS dump. One line per signal model of a route:

```bash
cd /var/mnt/nas/gamedumps/tsw7/paks/TS2Prototype-WindowsNoEditor-FrankfurtSBahn/kdecomp/TS2Prototype/Plugins/DLC/FrankfurtSBahn/Content/Map/Tiles
awk '/^object /{ s = ($0 ~ /: DE_SignalModel_C/); if (s) print "@@ " FILENAME " " $0; next }
     s && length($0) < 300 && $0 !~ /RouteTable|PropertyGuid|^    Location =/' *.txt > fsn-signals.txt
```

`SignalType` is printed only when it is not `Mainline`. The header facts: `CXXHeaderDump/TS2Prototype.hpp`
(`FTS2DriverAidData`, `FTrackRestrictionQuery`, `FFoundSignal`, `UNetworkSignalProperty`) and
`TS2Prototype_enums.hpp` (`ESignalType`, `ESignalTypeBitFlags`).
