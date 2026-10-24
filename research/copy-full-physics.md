---
name: copy-full-physics
description: >-
  Why a guest's copy of the host's train stayed kinematic although bPhysicsRequired was set on every car: SpawnFormation registers the cars with the route timetable, whose physics requester overrides the flag. What makes a formation full physics in Auto, who asks, the cvar, and the coop change (branch copy-physics).
game_build: 886 (TSW 7, Steam build 25890949); offsets cross-checked in the TSW 5 export
created: 2026-10-24T08:00+0200
last_edited: 2026-10-24T08:00+0200
---

# Full physics for a guest's train copy (2026-10-24)

In the two-game test of 2026-10-24 the guest's copy of the host's train (spawned with
`SpawnFormation`, tsw-coop `copy/formation.rs`) followed the host fine on simple physics, but
stayed **kinematic** although `URailVehicleComponent::bPhysicsRequired` was set on all 5 cars
(`still kinematic (simple physics) 5 s after asking for full physics`). A guest who drives the
copy needs its own cab physics. This page explains why the flag did not take and what does.

Source: the auto-analysed Ghidra export of the TSW 7 exe
(`tsw-decomp/fullghidra/tsw7/export/TrainSimWorld.c`, function names `FUN_<address>`), field
names from the CXX header dump (`tsw-coop/dumps/tsw7-886/CXXHeaderDump/TS2Prototype.hpp`),
reflected natives from `fullghidra/tsw7/reflected/natives.tsv`. The same code was found in the
TSW 5 export (`FUN_141236xxx`), every offset 0x20 higher.

## Answer in short

- The flag is **not** read only at spawn: the game re-decides each formation's physics **every
  frame**. But it reads `bPhysicsRequired` **only while the car's native requester list is
  empty**, and `SpawnFormation` fills that list: it registers every car with the route
  timetable (`ARouteTimetable`), which adds a requester delegate to each car.
- The timetable's requester says yes only for (a) the vehicle a player controls or has
  reserved, or (b) a vehicle that is already on full physics **and** moving faster than 0.1 mph
  (0.044704 m/s). A copy nobody controls is never (a), and since it never got full physics it
  is never (b). So it stays kinematic forever, whatever the flag says.
- The copy is **not** in the vault (the vault exit runs inside `SpawnFormation`; a vaulted car
  is hidden and never kinematic).
- Fix (coop branch `copy-physics`): together with `bPhysicsRequired`, empty the copy cars'
  requester lists. Then the game goes by the flag, and the next frame's decision makes the
  formation `DynamicDirect`.

## How the game decides (TSW 7)

`URailVehicleComponent` fields used below (TSW 7 offsets; TSW 5 +0x20):

| Offset | Field | Note |
|---|---|---|
| 0x150 bit 0 | `bPhysicsRequired` | reflected |
| 0x670 bit 0 | a flag inside `Node` (`FSimulationNode_RailVehicle` +0x518) | set: never dynamic, never kinematic |
| 0xD00 | `RuntimeReferences` | reflected `TArray` |
| 0xD10 / 0xD18 | requester list: `TArray<TDelegate<bool(URailVehicleComponent*)>>` | native, not reflected |
| 0xDB8 bit 0 | `bVehicleIsInVault` | reflected |
| 0xDC4 | `SimPhysicsEnabledState` | reflected; 1 Kinematic, 2 DynamicDirect, 3 DynamicIndirect |

**`FUN_1412eaeb0(formation's car, results, ...)`** decides one formation. For each car not in
the vault, with the cvar `ts2.dbg.RailVehiclePhysicsEnabled` (0 off, 1 all, 2 Auto):

- cvar 1: full physics;
- Auto, requester list **empty**: full physics when `bPhysicsRequired`;
- Auto, list **not empty**: full physics when any bound requester returns true. The flag is not
  looked at.

One such car makes the formation dynamic (it `DynamicDirect`, the others `DynamicIndirect`);
otherwise the two end cars go `Kinematic` (when neither in the vault nor 0x670) and the middle
ones off.

**When it runs:**

| Caller | When |
|---|---|
| `FUN_1412d1150` → `FUN_1412e7a20` | **every frame**, once per formation (stamps `GFrameCounter` at +0xDC0 on every car), for a formation not in the vault and without 0x670 |
| `FUN_1412de5f0` (`OnConnectionChanged`) | coupling or uncoupling |
| `FUN_1412dd050` / `FUN_1412e2d80` | vault enter / exit |
| `FUN_1411bd380` | another re-evaluation (no direct callers, a delegate) |

The every-frame run matches experiment 4 of [train-copies.md](train-copies.md): a boarded
train written to Kinematic was back on full physics within 1 s. So no explicit re-evaluation is
needed after changing the inputs.

## Who adds requesters

The list is only appended to in two places, both in the route timetable code, both binding the
same predicate to the `ARouteTimetable` (a `TBaseUObjectMethodDelegateInstance`, vtable
`0x143c84b08`, method `FUN_141138740`):

- **`FUN_141135070`**: registers the actors of a spawned formation with the timetable (map at
  `ARouteTimetable`+0x3F0, key = the component's GUID at +0xF0), adds the requester to every
  car, then takes the formation out of the vault (`FUN_1412e2d80`) at its spawn point.
  `SpawnFormation` (`UTimetableRuntimeExtensionLibrary`, exec `0x141496f80` →
  `FUN_1411540b0`, service name `QuickDriveFormation` → `FUN_141154190`) calls it through
  `FUN_14113f140`. Timetable services spawn the same way.
- **`FUN_1410dd880`**: a single vehicle spawned by the timetable with its "physics" option set.

Nothing removes requesters again; the list is freed with the component (`FUN_1412cbdc0`).

**The predicate `FUN_141138740(timetable, car)`** looks the car's GUID up in the timetable's map
and returns true when its entry's flags (entry +0x28) have bit 0 or bit 1, or when the car is
not in the map at all. The flags are recomputed on every timetable tick (`FUN_141143500`, the
`TimeOfDay` tick → `FUN_1411443b0`):

- **bit 0**: the car is already `DynamicDirect`/`DynamicIndirect` (`FUN_1412e6430`: not in the
  vault, not 0x670) **and** its speed is above 0.044704 m/s. A hysteresis: a moving train on full
  physics stays on it, a stopped one falls back.
- **bit 1**: for every `ATS2PrototypePlayerController` in the world, the rail vehicle it
  **controls** (a native interface at +0x570) and its **`ReservedDrivableActor`** (+0xA18,
  `TLazyObjectPtr`, reflected; `GetReservedDrivableActor`).

So in Auto a timetable-registered formation is full physics exactly when a local player drives
it or has it reserved, or it is already dynamic and rolling. The player's proximity does not
count, and there is no reflected `RequestPhysics`-like function: `URailVehicleComponent`'s
natives (`ResetPhysics`, `DetectNearbyPhysicsBody`, `OnConnectionChanged`,
`OnSimulationComponentRuntime*`, ...) and `ARouteTimetable`'s do not touch the list or the
flags.

## The options

| Option | Scope | Verdict |
|---|---|---|
| cvar `ts2.dbg.RailVehiclePhysicsEnabled 1` (console command from code) | **every formation in the world**: every AI train on full physics (cost, and AI trains then run their own physics) | too broad; also gated by another global (`DAT_1451b01ad`) |
| Board the copy (`SetControlledDrivable`) | the copy only | works by itself (bit 1); already happens when the guest takes the copy's cab. Not for a copy the host drives while the guest watches or rides |
| Write the guest controller's `ReservedDrivableActor` to a copy car | the copy, bit 1 | changes what the game thinks the guest's own train is (`FindPlayerForService(bIncludePlayerReservation)`, `ReleaseReservedDrivable` kicks from the seat); the guest's own train loses its reservation. Rejected |
| Kick the copy dynamic once while moving (bit 0 hysteresis) | the copy | needs a native call to force the state; drops back to kinematic at every stop. Rejected |
| **Empty the copy cars' requester lists, keep `bPhysicsRequired`** | the copy only | chosen: one native write per car (`Num` = 0), after which the existing, reflected flag decides, every frame |

## The change (tsw-coop branch `copy-physics`)

`copy/formation.rs`: `Formation::require_physics(component)` sets `bPhysicsRequired` (as before)
and then sets the requester list's `Num` to 0 (`drop_requesters`). The list's offset is found at
run time from two reflected anchors that must agree: `RuntimeReferences` + 0x10 and the byte of
`bPhysicsRequired` + 0xBC0 (TSW 7: 0xD10, TSW 5: 0xD30). A header that does not look like a
`TArray` (negative or over-capacity count, more than 16, null buffer) is left alone. The
delegate instances are not destroyed (0x30 bytes per car stay allocated; the game frees the
buffer with the car). `copy/run.rs` calls it where it already set the flag: once per copy, after
the host's controls are on the copy's cab car, so the copy's brakes hold when the physics
switch (train-copies experiment 3: a train switched to full physics with released brakes ran
away).

**What to look for in the guest's `tswcoop-native.log`:**

- `copy: full physics asked for on 5 of 5 cars; 5 timetable requesters dropped` (one per car;
  `the requester list of N cars unreadable` means the header check refused them);
- then `copy: full physics` within a frame or two, and no `still kinematic ... 5 s after asking`
  line;
- `copy: RailVehicleComponent's physics requester list not where expected` at start means the
  two anchors disagreed (a new game build): nothing was written.

What to check in game: the copy on full physics follows the host through the host's levers
plus the trim (it no longer gets the simple-physics effort); gap lines stay within a few metres;
the copy holds at a stop with the host's brake; the guest's own train is unaffected.
