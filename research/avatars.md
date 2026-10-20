---
name: avatars
description: >-
  Bodies for other players: spawning a plain Character, dressing it from the game's modular character meshes, the animation assets in the paks, and the plan for the Rust DLL.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-17T21:03+0200
last_edited: 2026-10-18T04:07+0200
---

# Guest avatars: bodies for other players (2026-10-17)

Follows 05 §10g (a second driver pawn re-hides itself; a plain `ACharacter`
renders). Spike from Lua at Frankfurt-Fulda, free roam, scripts in the
session scratchpad (`avatar-spike.lua`, `avatar-dress.lua`, `avatar-snap.lua`).

## What works

1. `BeginDeferredActorSpawnFromClass(ctx, /Script/Engine.Character, T, AlwaysSpawn)`
   + `FinishSpawningActor`: a capsule with an empty `Mesh` (`CharacterMesh0`).
2. `Mesh:SetSkeletalMesh(/Game/Core/Characters/NPC/C2020/Male/Meshes_V2/CH_M_Casual_01)`:
   the **body only** (clothes, hands, shoes). TSW characters are modular:
   heads (`/Game/Core/Characters/Male/Heads/Meshes_V3/CH_M_White02`) and
   hair (`.../Male/Hair/Meshes_V3/CH_M_Hair_RecedingShort_Top`) are separate
   skeletal meshes on the same skeleton, as the station dioramas show
   (`Legacy_Coffee_Table_Diorama_*`: one actor, body + head + hair + props).
3. Head and hair: `actor:AddComponentByClass(SkeletalMeshComponent, false, T, false)`,
   `SetSkeletalMesh(head)`, `SetMasterPoseComponent(body, true)` and
   `K2_AttachToComponent(body, None, SnapToTarget ×3)`. Without the attach
   they sit at their own relative transform and the master pose draws them
   there (88 cm under the body in the spike). Result: a complete person,
   `WasRecentlyRendered = true` on all three components.
4. Animation: `SetAnimClass` (not `SetAnimInstanceClass`, which this build
   does not have) with `/Game/Core/Characters/Male/ABPs/ABP_GenericPassenger_Male.ABP_GenericPassenger_Male_C`
   gives a seated idle that breathes and moves its head. That ABP has no
   variables besides `bValidFloor`; `ABP_GenericDriver_*` neither. The game
   has **no locomotion anim blueprint for characters**; walking NPCs play
   sequences.

## Animation assets (pak index)

`/Game/Core/Characters/{Male,Female}/Anims/`:

- `Locomotion/CH_M_Walk_Loop`, `CH_M_WalkSlow_Loop`, `CH_M_Walk_Loop_0cms`
  (in place), `CH_M_StairsRun_43_*`, `CH_M_TurnIP_90_*`, `CH_M_Locomotion_BlendSpace`;
  female `CH_F_*` equivalents.
- `Stand/CH_M_Stand1_Idle*`, `CH_M_Stand5_Idle2` (loaded at Fulda).
- `Carriage/CH_M_CarSit1_Idle*`, `Sit/CH_M_BenchSit*` (seated).
- `Crouch/CH_M_hiker1`: the only male crouch (the female one is
  `Hiking/CH_F_hiker_Crouched`). Other low poses that might serve:
  `CH_M_Trackside_Welding_Loop`, `CH_M_Trackside_Sawing_Loop`,
  `CH_M_Trackside_Gesturing_Low`, `CH_M_Shoveling_Snow`.

The list comes from the pak indexes: the directory index sits in the last
tens of MB of each `Content/Paks/*.pak` in plain text, so
`tail -c 60000000 <pak> | grep -a -o '[A-Za-z0-9_]*\.uasset'` lists the
asset names and `grep -a -o -P 'Male/Anims/Crouch/.{0,600}'` shows the
files after a directory (2026-10-18: ~49,000 names over the 7 paks).

UE4SS `LoadAsset` fails for every `Locomotion/` asset (returns an invalid
object, nothing is loaded). The engine's own loader works:
`KismetSystemLibrary::LoadAsset_Blocking(Conv_SoftObjPathToSoftObjRef(MakeSoftObjectPath("/Game/.../CH_M_Walk_Loop.CH_M_Walk_Loop")))`
returns the `AnimSequence`, and `Mesh:PlayAnimation(walk, true)` makes the
dressed character walk in place (`walk-loop.png`); head and hair follow
through the master pose. The same loader chain (class variant) already
loads ghost view classes in `mod/native`.

The mesh's forward is +Y: the body needs a relative yaw of -90° to face the
actor's forward, and its pivot is at the feet, so it sits at minus the
capsule half height (88 cm) below the actor.

**Seen in game (2026-10-20, Fulda Free Roam, guest of a headless host whose body
cycles every pose, `HEADLESS_BODY`):** every pose loads and plays. Crouch is the
kneeling `CH_M_hiker1`, seated the carriage sit `CH_M_CarSit1_Idle2` (on a platform
it sits on an invisible seat; a body is seated only while its player is in a
vehicle), walk and run the in-place walk loop, idle and jump the standing idle.
The bench sit `CH_M_BenchSit1_Idle1` stays the crouch's fallback and is not needed.

## Plan for `mod/native`

- `avatar` message (proto, added with the emulator's patrol work): far
  position, yaw, `idle|walk|run|jump|seated`, optional vehicle and velocity.
- Per remote player one `Character` with body + head + hair as above; state
  picks the single-node animation (`PlayAnimation(seq, loop)`), stand idle
  as fallback when walk sequences do not load. Seated players inside the
  host's ghost train are hidden for now (cab seats are not modelled).
- Motion as for ghosts: extrapolate by `vel` (at most 0.5 s), ease, snap
  beyond 50 m. Capsule collision off so a guest's body never blocks the
  host.

## Skins and a live preview (2026-10-20)

The skin selector (`mod/native/src/skins.rs`, `portrait.rs`) dresses a body
from the profile: `UPlayerProfile.AvatarPresets` (8 rows) and the profile's own
`AvatarInfo` give gender (`CharacterBase.Gender`, Female = 1), head
(`CharacterBase.Head`) and hair (a `CharacterHair` data asset whose `HairMesh`
is the mesh); the body is one of the NPC outfits of that gender.

The page's picture is a render target made at runtime and filled by a scene
capture, all through reflection:

- `KismetRenderingLibrary:CreateRenderTarget2D(ctx, 340, 510, RTF_RGBA8, clear)`.
- A spawned `SceneCapture2D`; on its `CaptureComponent2D`: `TextureTarget` =
  the target, `CaptureSource` = `SCS_FinalColorLDR` (2), `PrimitiveRenderMode`
  = `PRM_UseShowOnlyList` (2), `FOVAngle` 30, then
  `ShowOnlyActorComponents(body)`. Only the body is drawn, on black; the
  world's lights still light it (day, night and the main menu all look right).
- The body stands 30 m above the camera (`GameplayStatics:GetPlayerCameraManager`
  → `GetCameraLocation`, plus the world origin), out of the player's view, and
  the capture 3 m in front of it on +X looking back.
- `UMG.Image:SetBrushResourceObject(target)` shows it; the brush and
  `TextureTarget` keep the target alive.

This works at the main menu (`FrontendLevel` is a real world) and in a route.

### See-through background (2026-10-20)

`SCS_FinalColorLDR` gives alpha 1 everywhere in this build, also with
`r.PostProcessing.PropagateAlpha=2` (read-only at runtime; set in the user
`Engine.ini` only while the game is closed, since the game rewrites that file
on exit; it did take, `GetConsoleVariableIntValue` read 2, and changed
nothing). `SCS_SceneColorHDR` into `RTF_RGBA16f` carries alpha = 1 − coverage.

So the preview is two captures of the body from the same spot, combined each
frame with `BeginDrawCanvasToRenderTarget` into a third RGBA8 target:
`K2_DrawTexture(colour, BLEND_Opaque)`, then
`K2_DrawTexture(shape, BLEND_AlphaHoldout)` (destination × (1 − source alpha)).
The body keeps its colour, the rest becomes transparent; the UMG image shows
it straight over the menu with a clean outline.

Canvas text (`K2_DrawText`) does not write alpha, so it cannot be cut out
this way; the "?" for "Random" is a `TextRenderActor` (`K2_SetText`,
`SetWorldSize` 170, centred) pictured by the same two captures.
