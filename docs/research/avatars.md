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

UE4SS `LoadAsset` returns the package for an already loaded sequence but
**fails for every `Locomotion/` asset** (package does not load, nothing is
found afterwards), although the pak index lists them next to the stand
idles. Not yet tried: `LoadAsset_Blocking` from the native mod (the path
that loads ghost classes of other routes), or a `TSoftObjectPtr` through
`RequestContentLoadSynchronous`.

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
