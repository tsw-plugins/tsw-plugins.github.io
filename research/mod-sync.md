---
name: mod-sync
description: >-
  How a host brings its guests the coop mod's version and config and data-only content: the version check at join, the transport, what the game has for liveries, and the plan.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T09:57+0200
last_edited: 2026-10-19T19:05+0200
---

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
- Where they are saved (exe strings and `DTGReskin.hpp`): the save slot `UGCLiveries`
  (`UGCLiveries_%d` per user index), i.e. `SaveGames/<user>/UGCLiveries.sav`, a
  `UDTGUserGeneratedContentSave` with `Reskins` (`FReskinSave`: ID, date, names, base
  definition, elements) and `CompressedReskins` (`FCompressedReskin`: `FName ID`,
  `TArray<uint8>`). The live collection keeps that save object as `UGCSaves` (0xD8), so the
  host reads a livery's compressed bytes from memory by its `ReskinID`; no save-file parsing.
  `FindReskin(FName)` gives the `UDTGReskin` itself.

## Liveries in game (2026-10-19, build 886)

Found with `tsw.livery` (tsw-sdk adapter) and Ghidra:

- **Making one by code works.** `GetReskinnableDefinitionsByCategory(0..3)` lists 79
  definitions here (`TArray<FReskinnableDefinitionDetails>`, 0x40 each, the soft pointer
  first). `CreateReskin(soft pointer, name)` then `SaveReskin` gives a livery with the
  definition's base look and an ID like `L_<32 hex>`; `SaveReskin` writes the slot at once.
- **The slot is per Steam user:** `SaveGames/<steam id>/UGCLiveries_0.sav`. Its name is an
  `FString` on the collection at `+0xE0`, user index at `+0xF0` (not reflected; read in
  `ReloadReskins`, `0x35AA6E0`). `SaveGameToSlot("UGCLiveries_0")` without the folder writes a
  second file in `SaveGames/` that the game never reads.
- **`ReloadReskins`** loads the slot from disk and compresses any `Reskins` entries into
  `CompressedReskins`. Each compressed entry whose ID is not in `AllReskins` is decompressed
  (`0x357C6D0`) and becomes a `UDTGReskin` (`0x359C3F0`). A slot file copied in while the game runs
  is picked up by the next reload.
- **Import** (what a guest does): append `{ID, bytes}` to the live
  `UGCSaves.CompressedReskins` (with `GMalloc`), `SaveGameToSlot` into the collection's own
  slot, `ReloadReskins`, then `FindReskin(ID)`. Tested with a livery deleted and imported from
  its 582 saved bytes: it comes back under the same ID. `DeleteReskin` saves on its own and
  asynchronously, so a write right after it can be overtaken; import never deletes first.
- **A view actor in a livery** (`0x12BF990`, what a vehicle does for its own view): a
  `UReskinViewActorConstructionModifier` with the view actor as outer, `Reskin` set,
  `SubDefinitionIndex` = the vehicle's unreflected int at `+0x30C` (which car of a multi-car
  definition), appended to `AViewActor::ConstructionModifiers` before `FinishSpawning`.

## Built (2026-10-19)

- tsw-sdk `reskins.rs`: list, create, save, find, delete, saved form, import (taken out of the
  slot again when the game cannot load it, e.g. a train the guest lacks), `dress_view`,
  `view_livery`.
- tsw-coop: the consist carries `livery_part` (read from the host's own view modifier). The
  host sends each user livery as a `blob` of kind `livery`. A guest's `Wardrobe` imports it
  for as long as the host is there, then deletes it again; the IDs it added are listed in
  `tswcoop-liveries/imported.txt` so a crash's leftovers go at the next start. Ghost cars
  spawn in the livery, and cars drawn before it arrived are spawned again.
- Unit tested, and run end to end in game (2026-10-19): the game as guest of a headless host
  (`HEADLESS_VIEWS`, `HEADLESS_AT`, `HEADLESS_LIVERY`) with a three-car Class 323 in a livery made
  by code; the livery arrived, was imported, and the ghost cars were spawned again in it, parts
  0-2.

## Open
- Whether imported liveries should stay with the guest (a "keep this livery" choice) instead of
  going when the host leaves.
- Scenario data (user scenarios, `UGCScenarios`) the same way, kind `scenario`. See below.

## User scenarios (research, 2026-10-20)

What the game has (TSW 7, reflection dumps):

- A recipe is `FScenarioDesignRecipe` (0xB0, reflected): name, description,
  `UserScenarioGuid`, `UGCItemId` (its workshop item when published), rule flags,
  `TargetAsset` (the route's `UScenarioDesignAsset`), `Services` (each with a formation:
  train entry, reskins (= liveries), or a `UGCFormationName`), start time, weather.
- The one being played: `UDriveModeSettings::UserScenarioRecipe` (+0x138, with
  `bUserScenario`), also kept in the save game (`UTS2SaveGame` +0x220).
  `UTS2GameInstance::IsPlayingUserScenario()`.
- Saved recipes: `UScenarioDesignFunctionLibrary` `LoadScenarioDesignRecipes(world, cache,
  page, per page, design asset, out)`, `SaveScenarioDesignRecipe(world, cache, recipe,
  dependencies)`, `DeleteScenarioDesignRecipe`, `InvalidateCache`; the cache
  (`FScenarioDesignSaveCache`) lists `AvailableFiles`, one file per recipe, through a
  handler `UUGCScenarios` (`GetUGCScenarioSaves()`, no reflected fields). The handler is
  null at the main menu until the planner made it (`tsw.ugc probe`).
- The planner (`UTS2MainMenuScenarioDesignWidget`) also talks to the workshop:
  `QueryMod`, `FindUGCRecipeModId(UGCItemId)`, and the exe has a setting "exporting of
  recipes as UGC on saving".

Plan: the host sends the recipe it plays (reflected fields to JSON, the services'
formations and liveries along, user formations as kind `formation` the same way as
liveries); a guest saves it with `SaveScenarioDesignRecipe` and finds it in its own
planner, under the same `UserScenarioGuid`. A published recipe could instead go by its
workshop id. Open before building: what a save writes (one file per recipe under
`SaveGames`?) and whether saving can publish to the workshop. Test with a throwaway
profile or with export to UGC off, never by saving into the player's profile blind.
