---
name: pure-rust-game-dll
description: >-
  Can a UE4SS mod be written in Rust alone? The three options (pure-Rust UE4SS mod, a hand-built CppUserModBase, dropping UE4SS for an own proxy DLL), the existing Rust projects checked, effort and risk. The study behind moving the game DLL to pure Rust.
game_build: 886 (TSW 7); UE4SS zDEV v3.0.1-947-g06474186
created: 2026-10-21T20:15+0200
last_edited: 2026-10-21T20:15+0200
---

# A game DLL in Rust only (2026-10-17)

Question from the maintainer: "can the DLL be built with Rust? If so, use that instead." At the
time the game-side mod was a UE4SS C++ mod: a thin C++ shim (`mod/shim`, about 510 lines,
`CppUserModBase` subclass exported through `start_mod` / `uninstall_mod`) over a Rust core with a C
ABI. How that shim was built on Linux is in [ue4ss-cpp-toolchain.md](ue4ss-cpp-toolchain.md).

Research on 2026-10-17 (web, GitHub, crates.io, the UE4SS source); nothing was built for it. The
outcome: the shim was removed on 2026-10-18 and the game DLL became pure Rust (`mod/native`, a
`dwmapi.dll` proxy with its own patternsleuth scan), i.e. option 2 below. Later that core moved into
uniloader and tsw-sdk.

## How UE4SS loads a C++ mod

UE4SS loads `dlls/main.dll`, looks up `start_mod` and `uninstall_mod`, and talks to the returned
object through its virtual functions (`UE4SS/src/Mod/CppMod.cpp`,
`UE4SS/include/Mod/CppUserModBase.hpp` in
[RE-UE4SS](https://github.com/UE4SS-RE/RE-UE4SS)). That object is a C++ class with MSVC internals:
`std::wstring` members, a `std::vector<shared_ptr<GUITab>>`, constructors that live in
`UE4SS.dll`. There is no C interface, no Rust crate (crates.io had 0 hits for "ue4ss") and no
official bindings. UE4SS uses Rust only for its pattern scanner (`deps/first/patternsleuth_bind`).

The installed build was zDEV v3.0.1-947-g06474186, well past the v3.0.1 tag; the shim used
`Hook::RegisterEngineTickPostCallback`, which the tag does not have.

## Existing projects (as of 2026-10-17)

| Project | State | Verdict |
| :--- | :--- | :--- |
| [abix-/modforge "ueforge"](https://github.com/abix-/modforge) | created 2026-05, last push 2026-10-12, 1 star, self-described as AI-generated; UE5, UE4SS v3.0.1 | still compiles a C++ shim (`ueforge/cpp/ueforge_shim.cpp`) with its own copy of `CppUserModBase`; its notes say earlier copies crashed because the function slots did not match. Confirms the shim pattern. |
| [iris-cat-dev/UE4SS.Lite](https://github.com/iris-cat-dev/UE4SS.Lite) | created 2026-06, last push 2026-09-29, 2 stars | a Rust-first rewrite of UE4SS itself, still with C++ adapters; incompatible with our install, too young |
| [trumank/mint](https://github.com/trumank/mint/tree/master/hook), `hook` crate | 456 stars, last push 2025-12 | a mature pure-Rust injected DLL for Deep Rock Galactic (UE 4.27) without UE4SS: the template for option 2 |
| [trumank/patternsleuth](https://github.com/trumank/patternsleuth) | 89 stars, active (2026-09-30) | the scanner UE4SS itself uses |

## Options

1. **Keep UE4SS plus the thin C++ shim.** Works; the C++ is small and only does startup, hooks and
   object access. Every alternative either still has a shim or drops UE4SS.
2. **Drop UE4SS and do everything in Rust** (what mint does): load as a proxy DLL, find
   `GUObjectArray`, the `FName` conversion, `ProcessEvent`, `UEngine::Tick` and `FMalloc` with
   patternsleuth, hook with a detour crate, and write the UE 4.26 layouts (`UObject`,
   `FUObjectArray`, `FName`, `FProperty`, `UFunction`, `FWeakObjectPtr`, `TArray`, `FString`) in Rust;
   mint's `hook/src/ue/*.rs` is a near match. Estimated 2–4 weeks: layouts and lookup about a week,
   scanner and tick hook 2–5 days, logging and wiring about 2 days. Costs: no UE4SS live viewer,
   object dumper or Lua bridge unless both run side by side (and both hook `ProcessEvent` and the
   tick); patterns can break on game updates.
3. **Rebuild `CppUserModBase` by hand in Rust** and call UE4SS's exported C++ functions by mangled
   name. The lifecycle part is doable with a `#[repr(C)]` struct and a hand-built vtable, but must
   match this exact dev build's layout. The engine calls are the problem: `Output::send<LogLevel>`
   and `GetValuePtrByPropertyNameInChain<T>` are header templates, not exports; callback
   registration takes a `std::function`; mangled names change with UE4SS. Rejected: roughly 1–2
   weeks plus breakage on every UE4SS update.

Recommendation at the time: keep option 1 for now; if "no C++ at all" is the goal, option 2 once
the shim's API surface is stable, swapping the layer under an unchanged Rust core. The maintainer
chose option 2 the next day.
