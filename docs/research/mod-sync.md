# Mod and data sync (2026-10-18)

docs/08-concept.md "Mod sync": the host brings its guests the coop mod's version and config and
**data-only** content (liveries, reskins, scenario data); never DLLs or Lua.

## Mod version

Done: a guest whose mod build differs is refused at join with the build numbers and the download
page (`error{code:"version"}`, relay `admission`). The mod does not update itself: a DLL from the
host would be code from a stranger.

## Transport for data-only content

Done, not yet wired to any content: `tsw-coop-client::transfer`. A blob (`kind`, `id`, bytes)
goes as `blob` events of 32 KB parts (base64, under the relay's 64 KB message cap) with its size
and SHA-256 on every part. The guest puts the parts back together in any order and takes the blob
only when the hash matches; kinds and ids are plain names (safe as file names), a blob is at most
8 MB, at most 8 arrive at once, and one that stops arriving is dropped after 60 s. The host paces
the parts: the relay allows ten events a second per player, shared with junctions, signals and
traffic.

## Liveries: what the game has (headers and object dump, build 886)

- A vehicle names its livery by `ARailVehicle::ReskinID` (`FName`) and holds the `UDTGReskin*`
  (`RailVehicle.h:49-52`); the consist already sends `ReskinID` as `livery`.
- User liveries are `UDTGReskin` objects (`/Script/DTGReskin`), listed by
  `UDTGReskinnablesCollection` with `SaveReskin` and `ReloadReskins`;
  `UPlayerProfile::RegisterUserCreatedLivery(const UDTGReskin*)` /
  `UnregisterUserCreatedLivery(FName)` keep the profile's list.
- `ReskinViewActorConstructionModifier` applies a reskin to a view actor (the guest's ghost is a
  view actor).
- No user livery exists on this machine yet (`Saved/UserContent` is empty), so where
  `SaveReskin` writes and in what format is unknown.

## Plan

1. In game: make a livery in the livery designer; see which file `SaveReskin` writes (under
   `Saved/`) and whether `ReloadReskins` picks up a copied file.
2. Host: for each car of its consist whose `livery` is a user livery, send that file as a
   `blob` of kind `livery`, id the livery's GUID, once per guest.
3. Guest: write it where the game keeps liveries (only if absent, never over the guest's own),
   `ReloadReskins`, then respawn the ghost car with the reskin applied.
4. Scenario data (user scenarios, `UUGCScenarios`) the same way, kind `scenario`.

## Open (needs the game)

- The livery file location and format; whether a copied file loads without the profile
  registering it (`RegisterUserCreatedLivery`).
- How to spawn a view actor with a given reskin from code (the modifier, or the vehicle's own
  `ReskinID` before `FinishSpawning`).
