# 04 — Roadmap and open questions

## Milestones

| # | Milestone | Needs a game install? | Exit criterion |
| --- | --- | --- | --- |
| M0 | Research (this repo) | no | Docs 01–04 reviewed |
| M1 | Loader bring-up on TSW 7 | **yes** | Stock UE4SS loads, no crash through main menu → journey → exit; object dump + UHT headers committed to `dumps/`. Partly done: the tsw-controller-app UE4SS mod already runs on the maintainer's install, so the loader side is proven; the dump is still outstanding |
| M2 | Telemetry mod | yes | C++ mod logs `TrainSnapshot` at 10 Hz for the own train, incl. tile + XYZ + lat/lon + consist classes; numbers match the HTTP API |
| M3 | Relay + two clients | yes (two installs or two PCs) | Snapshots round-trip through the relay; a debug overlay lists remote players |
| M4 | Ghosts A | yes | Remote consist visible as static meshes moving smoothly on the right track |
| M5 | Ghosts B | yes | Real `RVM_*` actors with lights/doors/pantos following remote controls; no physics interaction |
| M6 | Session management | yes | Route/timetable rooms, late join, DLC mismatch handling, chat, installer |
| M7 | Signalling link (research) | yes | Decision document on whether C or a dispatcher hook is feasible |

## What can be done without a PC (now)

- Everything in M0, including protocol schema and the relay server skeleton
  with a fake-client simulator.
- A header-level model of the mod (interfaces for L0–L3) against the UE4SS
  API, compiled on CI against the vendored submodule.

## What needs your PC first

1. **UE4SS object dump of TSW 7.** Install the latest UE4SS zDEV build into
   `…\TS2Prototype\Binaries\Win64\`, enable the object dumper and UHT dumper
   in `UE4SS-settings.ini`, launch into a journey, dump. Commit the output
   (it is large; keep only `TS2Prototype` and the `RVM_` headers, plus the
   `.usmap`). This single artifact unblocks most of M2–M5 design.
2. Confirm the engine version string from `TrainSimWorld.exe` properties
   or the UE4SS log.
3. Run `/info`, `/list`, `/list/CurrentDrivableActor`, `/get/DriverAid.PlayerInfo`
   with `-HTTPAPI` on TSW 7 and save the JSON, to confirm the API survived
   the version bump.

## Open questions

- **Track-relative positioning.** Is there a reachable "track node +
  distance" accessor on `ARailVehicle` or its bogies? Determines whether
  snapshots are robust to tile rebasing.
- **World origin.** Does TSW use UE's `WorldOriginLocation` rebasing, its
  own tile offset, or both? `currentTile` in `DriverAid.PlayerInfo` suggests
  its own scheme.
- **Spawning `RVM_*` classes outside the game's own spawner.** Do they
  require an initialised SimuGraph context to not crash on `BeginPlay`?
- **Dispatcher representation of track occupancy.** Needed for M7.
- **Asset availability.** How to detect which route/loco DLC the local
  player owns, to map a remote `ObjectClass` to a local asset or placeholder.
- **Game updates.** TSW patches have broken UE4SS mods for a patch or two
  before. Pin UE4SS per game build and ship the HTTP-API presence fallback.
- **Policy.** DTG EULA on code injection; no anti-cheat exists, but a public
  project should state clearly that it is unofficial and PC-only.

## Reply to the obvious alternative

"Why not just extend ThirdRails?" It is closed source, HTTP-API-only, and
therefore cannot render trains in-game. Its relay and map are a good model
for the presence-only mode and nothing more.
