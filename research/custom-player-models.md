---
name: custom-player-models
description: >-
  Whether custom player/NPC character models exist for TSW, how our mod stack could load one (mod pak, runtime import, recolouring), and how a coop host could hand the same model to every guest. Paused, partly verified.
game_build: 886 (TSW 7, Steam build 25890949); TSW 5 checked for pak format only
created: 2026-10-23T22:00+0200
last_edited: 2026-10-23T22:00+0200
---

# Custom player models (2026-10-23, paused)

Owner, 2026-10-23: "research wether custom player/npc model mods are a thing for TSW5/7 and if
yes or no, what the easiest way would be to load and allow custom player moddels (since its
unreal engine, maybe a .pak?, and which sources? fbx? idk) and how we could then sync those
properly (distribute to joining guests so everyone has the same, and sees the same)".

## 1. Do character model mods exist?

**None found** (web searches only, see Status for what is still unchecked):

- Train Sim Community's TSW categories (pak file skins, patches, PC Editor creations, utilities)
  show train replacements, liveries, timetable and RailDriver mods; no driver, player or passenger
  model mod turned up in four searches.
- A 2022 DTG forum thread "Access To Character Models?" asks whether NPC models can be replaced or
  deleted in the game files
  ([thread](https://forums.dovetailgames.com/threads/access-to-character-models.60576)); the
  answers could not be read (the DTG forums redirect to a maintenance notice since 2026-10-21).
- The **Creators Club** is liveries and scenarios only (Livery Designer, Scenario Planner)
  ([DTG support](https://support.dovetailgames.com/hc/en-us/articles/28572861168914)).
- The **TSW PC Editor (Beta)** is DTG's UE4 editor for routes, trains and scenarios, PC only, on
  the Epic store, tied to owning TSW (the listing is the TSW 6 one)
  ([Epic store](https://store.epicgames.com/p/train-sim-world-6--train-sim-world-pc-editor-beta),
  [DTG FAQ](https://support.dovetailgames.com/hc/en-us/articles/28572815421330-Train-Sim-World-PC-Editor-beta-FAQ),
  403 to the fetcher). Its Mod Manager cooks a mod and exports a `.pak` with UnrealPak (DTG forum
  "Tutorial Guide For The Mod Manager", Oct 2025, known only from search snippets). Whether it
  can cook skeletal meshes for characters is not verified.
- DTG's own article on passengers describes palettised outfits (colours vary per instance) and
  height scaling, not swappable models
  ([live.trainsimworld.com, "Rush Hour: creating passengers"](https://live.trainsimworld.com/news/rush-hour-creating-passengers),
  from a search snippet; page not read yet).

How TSW pak mods are installed (generic, applies to any model mod we would make): copy the `.pak`
into `TS2Prototype/Content/DLC` or `Documents/My Games/TrainSimWorld7/Saved/UserContent`; no
`_P` suffix, no signature bypass
([UK Train Replacement Mods](https://www.trainsimcommunity.com/mods/c3-train-sim-world/c19-patches/i7871-uk-train-replacement-mods),
[flyawaysimulation guide](https://flyawaysimulation.com/ask/answers/install-community-mods-train-sim-world/)).
Asset edits in those mods are done with UAssetGUI on cooked assets.

## Verified locally

- **Paks are unsigned and unencrypted, v11, zlib, in both TSW 7 and TSW 5** (footer read
  2026-10-23: version 11, index not encrypted, zero key GUID; no `.sig` files beside any pak).
  v11 is the UE 4.26/4.27 pak format. TSW 7's exe says `++UE4+Release-4.26`; the `.usmap` is
  `TS2Prototype-4.26.1-0+++UE4+Release-4.26`. The exe has the stock `signedpak` switch and the
  stock signature error strings, but nothing enforces signing without `.sig` files.
- Base content: `Content/Paks/*.pak` (game and content packs); DLC routes: `Content/DLC/*.pak`,
  mounted by DTG's `UDLCManagementSystem` (it keeps `FailedPakFiles`, `CachedContentList`;
  its mount code is native and not reflected: `UHTHeaderDump-TS2Prototype/Public/DLCManagementSystem.h`).
  UE4SS's BPModLoader `Content/Paks/LogicMods` also loads unsigned paks ([debug-ui.md](debug-ui.md)).
- The exe has an in-game workshop (`UTS2WorkshopHubWidget`, `UTS2WorkshopMyModsWidget`,
  `UTS2WorkshopSubscriptionsWidget`, `UGCModQuery`, a `.../mods/upload` route on a DTG UGC API
  host) and Steam's `FOnlineAsyncTaskMountPak::Steam` / `UnmountPak`. So the game itself mounts
  paks at runtime somewhere. Not traced.
- **Character rig**: two skeletons, `/Game/Core/Characters/Male/Rig/CH_Male_Rig_01_Skeleton` and
  `/Game/Core/Characters/Female/Rig/CH_Female_Rig_01_Skeleton`. Bodies, heads and hair are separate
  skeletal meshes on those skeletons (see [avatars.md](avatars.md)); animations live in
  `/Game/Core/Characters/{Male,Female}/Anims/`. Driver uniforms exist in core
  (`Core/Characters/Drivers/{DB,FlixTrain,Generic/...}`, with `MI_*` material instances and
  `*_PalMasks` textures) and in DLC plugins as player outfits
  (`/FTF_DB_BR146/Characters/Player/Female/Meshes/CH_F_DBDriver_02`, own material and textures).
  `PalMasks` textures are the palette masks behind the recolouring.
- Coop today: `tsw-coop/mod/native/src/skins.rs` dresses remote bodies from NPC outfit meshes
  (`/Game/Core/Characters/NPC/C2020/{Male,Female}/Meshes_V2/...`) plus profile head and hair. No
  pak mounting code exists in uniloader, tsw-sdk or tsw-coop.

## 2. Routes to a custom model (assessment, not built or tested)

**(c) Recolour/retexture existing characters: cheapest, no new assets to ship.**
`CreateDynamicMaterialInstance` on the body's material slots and setting the palette parameters
(or a texture parameter to a texture made at runtime) changes colours per player. The sync is a
few numbers in the avatar message. The parameter names of the character master material are not
read yet (decompile an `MI_*` from the pak). Textures could come from PNG at runtime
(`KismetRenderingLibrary::ImportFileAsTexture2D` exists in 4.26; untested in TSW).

**(a) Mod pak with a skeletal mesh: the real "custom model" route.** Steps:
1. Source: FBX (the UE 4.26 importer's format; Blender/Maya export), skinned to a copy of
   `CH_Male_Rig_01` / `CH_Female_Rig_01` with the same bone names and hierarchy, so the game's
   animations and `SetMasterPoseComponent` work without retargeting at runtime. The skeleton has
   to be exported from the game (FModel/UModel can export the skeleton and a body mesh as
   psk/glTF; to be checked) and recreated in a UE 4.26 project at the same path, or the mod
   mesh's skeleton reference will not match.
2. Cook with UE 4.26 (the TSW PC Editor if it cooks skeletal meshes, otherwise a stock 4.26
   project named `TS2Prototype` with the `.usmap`-matching paths) into a pak whose assets sit
   under `/Game/Mods/<id>/` so no plugin registration is needed.
3. **Materials: reuse the game's master material.** A mesh whose materials are instances of a
   material that already ships in the game needs no new shader code. A new master material needs
   compiled shaders in a shader library the game does not open for us; avoid it.
4. Load: either put the pak in `Content/DLC` / `UserContent` before launch (the game mounts it),
   or mount at runtime from uniloader (FPakPlatformFile::Mount or the `FCoreDelegates::MountPak`
   delegate, found by signature; neither is reflected), then `LoadAsset_Blocking` the mesh by
   path and `SetSkeletalMesh` on our body as `skins.rs` does now.
5. Safety: a pak can hold Blueprints (code). Accept only paks whose every asset class is
   `SkeletalMesh`, `Texture2D`, `MaterialInstanceConstant` (parent in `/Game/Core/...`),
   `PhysicsAsset`; reject anything else by parsing the pak index and the uasset export classes
   before mounting (repak + a UAsset header reader in Rust).

**(b) Runtime import (glTF/VRM/FBX into a USkeletalMesh at runtime): not realistic here.** UE
4.26 has no runtime skeletal mesh builder in a shipping build without editor modules; libraries
that do it (glTFRuntime) are UE plugins that must be compiled into the game. Building
`FSkeletalMeshLODRenderData` by hand through raw memory is possible in principle but fragile per
build. Static meshes at runtime (`ProceduralMeshComponent`, if the game ships it) would give
unskinned props only. Not checked whether `ProceduralMeshComponent` is in the TSW exe.

**Licence:** DTG's EULA and PC Editor terms on modding and sharing were not read (pages 403).
Shipping meshes extracted from the game, or from other games, is out; user-made meshes on the
game's skeleton are the open question for the EULA.

## 3. Sync design for coop (proposal)

- A model is a **content-addressed package**: SHA-256 of the pak bytes is its id; a small manifest
  (name, author, base skeleton male/female, asset list, size) beside it.
- Each player's avatar state carries `model: {hash, gender}` (none = stock look). The host
  relays every player's model id in the roster, so a late joiner learns all of them at once.
- A guest missing a hash fetches it from the host: by HTTP from the host web server
  (`tsw-coop/mod/native/src/web/mod.rs`, new route `GET /content/<hash>`; needs to be reachable for
  relay sessions too) or as `blob` events through the relay (`tsw-coop-client::transfer`, today
  capped at 8 MB per blob and ten events a second shared with game sync; a model pak will often
  be larger, so HTTP/QUIC direct first, relay as slow fallback). The host serves only packages it
  has, so a guest's model goes guest → host → others.
- Verify hash, run the asset-class whitelist, store in `tswcoop-models/<hash>.pak` (cache, size cap
  with LRU), mount, then respawn that player's body in the model (same pattern as liveries
  respawning ghost cars, [mod-sync.md](mod-sync.md)).
- Fallback: stock look (current skin) while downloading, when refused by the whitelist, when the
  player opted out ("show custom models": off / friends / all), or when the mount fails.
- Mid-session mount vs restart: open. Runtime mounting would avoid a restart; if only pre-launch
  `DLC`/`UserContent` mounting works, a guest sees the model from its next launch.

## Status (paused 2026-10-23)

Remaining, in order:

1. Read the DTG forum threads once the forums are back (they redirect to a maintenance notice):
   "Access To Character Models?" (threads/access-to-character-models.60576) and the Mod Manager
   tutorial (forums.dovetailgames.com/goto/post?id=1050804, 1055652, 1046480): can the PC Editor
   cook skeletal meshes/characters, its engine version, where its paks go.
2. Read https://live.trainsimworld.com/news/rush-hour-creating-passengers (palettisation details).
3. Search Nexus Mods (TSW 5/6/7 game pages gave 403 to the fetcher; try search engines with
   `site:nexusmods.com`), Reddit r/trainsimworld, Train Sim Community for "character", "driver
   outfit", "passengers", and the UE4 modding communities for TSW (FModel/UE4SS Discord threads).
4. Read the DTG EULA / PC Editor terms on modding and redistributing mods.
5. Locally: decompile one character `MI_*` and its parent material (repak + kdecomp, see
   [native-code.md](native-code.md)) for the palette parameter names; check the exe for
   `ProceduralMeshComponent` and `ImportFileAsTexture2D`.
6. Find the game's runtime pak mount (Ghidra: callers of the `FOnlineAsyncTaskMountPak::Steam`
   string, `FPakPlatformFile::Mount`, `FCoreDelegates::MountPak`) and whether a pak mounted
   mid-session loads by `LoadAsset_Blocking`.
7. Spike (needs the game, main session only): a test pak with one renamed copy of a game body mesh
   under `/Game/Mods/test/` in `UserContent`, load it on a coop body.
8. Then finalise the recommendation and add the sync work to tasks.
