---
name: discord-flat2vr-tsw7-thread
description: >-
  Community findings from the Flat2VR Modding "train sim world 7" Discord thread: UEVR on TSW 7, DX12, console variable injection and a Proton injection crash.
game_build: not verified in game (community anecdote, read 2026-10-17)
created: 2026-10-17T06:15+0200
last_edited: 2026-10-17T06:15+0200
---

# 06 — Discord thread: "train sim world 7" (Flat2VR Modding)

| | |
| --- | --- |
| Server | Flat2VR Modding |
| Thread | "train sim world 7" (forum post) |
| URL | https://discord.com/channels/747967102895390741/1548333981240393728 |
| Date range | 2026-09-12 to 2026-10-07 |
| Messages | 23 (starter post is a screenshot with no text) |
| Participants | 5: gavin (thread author, most of the content), skinnyraf, Aernoud, algendi4000, Notagameaddict |

Read on 2026-10-17. Everything below is community anecdote from a handful of
users, not measured by us; "works" means one person reported it working on
their machine. The attached images were not inspected.

## Key findings

**UEVR on TSW 7 works (Windows).**

- gavin runs TSW 7 in VR with the **UEVR nightly build** on a Ryzen 7 5800X,
  RTX 3090, 32 GB RAM, PICO 4. Reports it "smooth" (2026-09-13).
- He shared his UEVR profile as `TrainSimWorld_profile__gavin.rar` (82 KB,
  Discord attachment, 2026-09-25). Install: unzip into
  `C:\Users\<name>\AppData\Roaming\UnrealVRMod`. The profile folder name
  implies the UEVR profile key is the executable name `TrainSimWorld`, i.e.
  the same binary name as TSW 5/6 (consistent with 02-prior-art).
- No one in the thread mentions anti-cheat, signature checks or injection
  being blocked on Windows. Injection is the stock UEVR external injector.

**Renderer / upscaling.**

- DLSS "seems to work well" in VR on TSW 7: no anti-aliasing artefacts and
  the expected performance gain (gavin, 2026-09-12).
- skinnyraf (Linux, see below) got it running with **FSR** and calls the
  TSW 6 → TSW 7 visual difference in VR "incredible".
- skinnyraf's first attempts crashed; the cause was an old UEVR profile
  "crashing with DX12". Once replaced, the game launched. So TSW 7 is
  running on **DX12** for at least one user and UEVR handles that; a stale
  profile (presumably TSW 6-era) is enough to crash it. Unverified whether
  DX11 is still selectable in TSW 7.

**UEVR settings that mattered.**

- Volumetric clouds show "moving lines" in stereo (algendi4000). Fix:
  nightly build + `VR_NativeStereoFix=true` (gavin; he is "unsure" he
  re-ticked it on TSW 7 but his clouds render correctly).
- HUD "click spot" / HUD dot alignment is off by default (Aernoud). gavin
  posted a screenshot of settings that line the dot up for him; says it
  depends on headset and he has learned where to click. He plays with
  physical throttle levers and button boxes, so he rarely needs it.
- HUD/UI in the screen corners falls outside the VR FOV with default
  settings (skinnyraf). gavin keeps **"UI follow view" unticked** so the
  HUD stays world-fixed and he can look into the corners; he normally runs
  the game's minimal HUD. skinnyraf prefers "UI follow view" on, with TSW 6
  values that keep HUD and GUI inside the FOV.
- Cursor workflow: bind a UEVR "cursor" key, show the cursor only in menus;
  right-click hides the HUD dot and locks the game view so the mouse no
  longer drags it; right-click again to re-enable the dot for selecting a
  cab control.

**Companion mod: god mode / LOD.**

- `Foob_GodMode_0-7-0_TSW5-6` (a TSW 5/6 mod, not specific to VR) "works
  atm" on TSW 7 (gavin, 2026-09-16). He uses its route `.ini` to raise
  draw distances, which removes most LOD pop-in and tree/shadow swimming
  when turning your head:
  - `foliage.LODDistanceScale=12`
  - `r.ViewDistanceScale=15`
  - `grass.CullDistanceScale=10`
  (values "may have to be different depending on your hardware"). These
  are plain UE4 cvars; how that mod injects them (ini vs. console) is not
  stated, and the mod's loader is not named.

**Linux / Proton: not working as of 2026-09-27.**

- skinnyraf: TSW 7 "crashes quietly upon injection" on Linux (2026-09-25).
  Two days later: UEVR "fails to detect openxr/openvr environments (I tried
  both)" and closes the game. He had the same symptom on TSW 6 and a
  **game patch** fixed it there, so the thread treats it as a game-side
  issue rather than a Proton one. His 2026-10-07 message says it now
  launches after swapping the old profile, but does not state whether that
  was on Linux or a Windows box; treat Linux status as **unknown/unverified**.

## General info

- The thread is a sharing/help thread, not a development effort: one
  experienced user (gavin, same person who did TSW 6 in the same server)
  answers setup questions, others confirm or report their issues.
- Status at the end of the thread: VR via UEVR nightly works on Windows with
  DLSS; clouds and HUD alignment have known workarounds; the thread author's
  profile is the de-facto starting point.
- Open issues: HUD click-spot accuracy is still imprecise (per-headset
  tuning); Linux injection/runtime detection; whether
  `VR_NativeStereoFix` is actually needed on TSW 7.
- Nothing in the thread about UE4SS, Lua mods, the HTTP API, engine
  version, or multiplayer.

## Relevance to tsw-coop

- **Injection is not blocked.** UEVR's external DLL injector attaches to
  TSW 7 on Windows without any mention of anti-cheat or integrity checks,
  which matches our "no anti-cheat" assumption in 02-prior-art and bodes
  well for a `dwmapi.dll` proxy load.
- **UEVR and UE4SS will coexist on real users' machines.** VR players on
  this server will run UEVR nightly plus a god-mode mod plus, eventually,
  our loader. UEVR hooks D3D12 present and `ProcessEvent` globally; our
  UE4SS mod hooks specific UFunctions. No conflicts are known, but we
  should test the three-way combination early and keep our render-side
  footprint (ImGui GUI) off by default.
- **DX12 is the live RHI** for at least one TSW 7 user, and an old UEVR
  profile was enough to crash it. Any D3D hook we add must be DX12-capable;
  do not assume DX11.
- **Cvars are usable.** `r.ViewDistanceScale`, `foliage.LODDistanceScale`,
  `grass.CullDistanceScale` are accepted at runtime via a third-party mod,
  confirming the console/cvar path is open (relevant to our
  `ExecuteConsoleCommand` plans in 02-prior-art).
- **Linux/Proton** injection of TSW 7 is unresolved in this thread. Since
  this workstation is Bazzite, our own testing on Proton should budget for
  the same "silent crash on inject" symptom and record which TSW build
  fixes it.
- **Physical controls are common** among these players (levers, button
  boxes), so control-sync has to tolerate input arriving through the
  virtual HID layer from several sources, not just mouse clicks.
