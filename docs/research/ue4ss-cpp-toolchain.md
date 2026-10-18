# Building a UE4SS C++ mod (shim + Rust core) on Linux

**Historical.** The C++ shim (`mod/shim`), the probe (`toolchain/probe`) and
their build scripts were removed on 2026-10-18; the last commit that has them
is `cd84737`. The game DLL is now pure Rust (`mod/native`, a `dwmapi.dll`
proxy). Kept for the record: how a `CppUserModBase` mod is built without MSVC,
should one ever be needed again. Paths below are as they were.

State as of 2026-10-17. Everything here was actually run on `blu-pc-bazzite`
inside the `build-box` distrobox. Nothing touched the game install or a
running game; the installed `UE4SS.dll` was only read.

## Result in one paragraph

A UE4SS C++ mod (`CppUserModBase` subclass, MSVC ABI, Windows x64) **plus a
Rust core** builds on this host in about 5 s with `clang-cl` + `lld-link` +
the xwin-splatted MSVC CRT/Windows SDK that were already present in
`build-box`. No MSVC, no Wine, no CI. The import library for `UE4SS.dll` is
generated from the installed DLL's export table, which pins the mod to the
exact ABI of the installed zDEV build (`06474186`). Output:
`toolchain/out/TswCoopProbe/dlls/main.dll` exporting `start_mod` /
`uninstall_mod`, importing `UE4SS.dll`, `MSVCP140.dll`, `VCRUNTIME140.dll`
and the UCRT, with the Rust `std` statically linked in.

**Not yet done:** loading `main.dll` in the game (needs a game restart, see
"What remains").

```
toolchain/build-probe.sh      # does everything below; run from the host
```

## Paths that fail or are pointless (and why)

| Option | Verdict |
| --- | --- |
| (a) xwin + clang-cl + lld-link, target `x86_64-pc-windows-msvc` | **Works. Chosen.** |
| (b) mingw-w64 (`x86_64-pc-windows-gnu`) | Impossible for the shim: `UE4SS.dll` exports MSVC-mangled C++ (`?on_update@CppUserModBase@RC@@UEAAXXZ`, `std::basic_string<wchar_t>` in signatures, virtual tables laid out by MSVC). GCC uses the Itanium ABI and libstdc++; you cannot subclass `RC::CppUserModBase` or pass `std::wstring` across that boundary. mingw remains fine for a *pure-C-ABI* Rust `cdylib`, but the shim must be MSVC ABI, and since Rust builds for `-msvc` just as easily there is no reason to mix. |
| (c) Wine/Proton + Visual Studio Build Tools | Not needed. `vs_BuildTools.exe` / `visualcppbuildtools_full.exe` exist on the NAS (`/var/mnt/nas/downloads`) if ever required; expect a multi-GB prefix and `cl.exe` under Wine being slow and fragile. Keep as a last resort only. |
| (d) GitHub Actions | Workflows do not run under this account. Upstream's own CI artifacts are what `MSVC-Game__Shipping__Win64.zip` on the NAS is (`UE4SS.dll` + `.pdb` only, 2024-08, no `.lib`, no headers), so they would not help anyway. |
| Full upstream CMake build of RE-UE4SS, then link the mod against the `UE4SS` target | Not attempted and not needed. It would rebuild UE4SS (PolyHook, zydis, imgui, glfw, patternsleuth via corrosion+Rust) only to obtain `UE4SS.lib`, and the result would be a *different* UE4SS.dll than the one installed. The mod only needs the headers and an import library; both are obtained without compiling UE4SS. |

## What already existed in build-box (no download was necessary)

| Thing | Where | Size |
| --- | --- | --- |
| MSVC 14.44 (VS 17.14) CRT headers + libs, STL `_MSVC_STL_UPDATE 202503` | `/opt/xwin/crt` | together 641 MB |
| Windows SDK 10.0.26100 (ucrt, um, shared, winrt) | `/opt/xwin/sdk` | (in the 641 MB) |
| xwin download cache (manifest 17, `.vsix`/`.msi` payloads) | `/opt/xwin-cache` | 1.1 GB |
| `xwin` 0.10.0, `cargo-xwin` 0.23.1 | `/usr/local/bin/xwin`, `/opt/rust/cargo/bin/cargo-xwin` | |
| LLVM 19: `clang-cl-19`, `lld-link-19`, `llvm-lib-19`, `llvm-readobj-19`, `llvm-rc-19` | `/usr/bin` | |
| Rust 1.97.1 with targets `x86_64-pc-windows-msvc`, `x86_64-pc-windows-gnu` | `/opt/rust` | |

`/opt/xwin` was splatted on 2026-10-08 (root-owned). `cargo-xwin` was *not*
used: it would download its own 1.1 GB copy into `~/.cache/cargo-xwin`. The
probe links with plain `cargo` + `lld-link` and `-Lnative` paths into
`/opt/xwin` instead (`probe/rust/.cargo/config.toml`).

## What was fetched (all shallow, all untracked, all in `.gitignore`)

| Source | Pin | Why | Size |
| --- | --- | --- | --- |
| `external/RE-UE4SS` | `06474186b6f179ce106f4085bfdc20fbcdc5f106` (2026-04-29, "Fix Static Mesh Dumper crashing in 5.6 and above games") = the Git SHA in the installed zDEV build's `UE4SS.log` | headers | 52 MB |
| `external/RE-UE4SS/deps/first/Unreal` | submodule `d72d2f38` of `Re-UE4SS/UEPseudo` | Unreal headers | (in the 52 MB) |
| `external/fmt` | tag `11.2.0` (what `deps/third/CMakeLists.txt` fetches) | `DynamicOutput/Output.hpp` includes `<fmt/...>`; fmt is compiled into UE4SS.dll but **not exported**, so the mod uses `FMT_HEADER_ONLY` | 4.1 MB |
| `external/imgui` | tag `v1.92.1` | `GUI/GUI.hpp` (pulled in by `CppUserModBase.hpp`) | 9.5 MB |
| `external/ImGuiColorTextEdit` | `UE4SS-RE` fork, tag `v1.2.0` | `GUI/Console.hpp` → `TextEditor.h` | 0.3 MB |
| `external/IconFontCppHeaders` | `main` (upstream pins `main` too) | GUI headers | 7.3 MB |
| `external/zydis` + `zycore` submodule | tag `v4.1.1` | `ASMHelper/ASMHelper.hpp` → `Zydis/Zydis.h` | 18 MB |

Total `external/`: 90 MB. Build outputs: `toolchain/out` 5.3 MB,
`toolchain/probe/rust/target` 7.8 MB.

Notes:
- The upstream guide says the `Unreal` submodule needs Epic-org GitHub
  access. **It does not today**: `https://github.com/Re-UE4SS/UEPseudo` cloned
  anonymously over HTTPS. Only the `.gitmodules` URL is SSH, hence
  `git -c url.https://github.com/.insteadOf=git@github.com: submodule update`.
- Fetching a *short* SHA fails (`couldn't find remote ref 06474186`); resolve
  it to the full SHA via `https://api.github.com/repos/UE4SS-RE/RE-UE4SS/commits/06474186`.
- `patternsleuth` (the other submodule, a Rust crate) is not needed for mods.
- PolyHook is only reached through `Unreal/Hooks.hpp`. The probe does not
  include it; the day a mod does, fetch
  `stevemk14ebr/PolyHook_2_0` at `298d56210b9d9e66cde8f96481d6053925c6ae15`
  (plus its asmjit/asmtk submodules) and add the include dirs.
- `docs/guides/creating-a-c++-mod.md` in the clone is the upstream guide;
  the mod must live at `Mods/<Name>/dlls/main.dll` (`UE4SS/src/Mod/CppMod.cpp`),
  and `dlls/` is added to the DLL search path (`AddDllDirectory`), so a
  standalone Rust `cdylib` next to `main.dll` would also be found.

## The build, step by step (what `build-probe.sh` does)

Run everything through
`distrobox enter build-box -- bash -c 'export PATH=/opt/rust/cargo/bin:$PATH RUSTUP_HOME=/opt/rust/rustup CARGO_HOME=$HOME/.cargo; ...'`.
Use absolute tool paths inside the container; `~/.local/bin` wrappers
shadow `cmake`, `python3` etc. there.

1. **Import library from the installed DLL** (nothing ships `UE4SS.lib`):
   ```
   { echo "LIBRARY UE4SS.dll"; echo "EXPORTS";
     /usr/bin/llvm-readobj-19 --coff-exports "$UE4SS_DLL" | sed -n 's/^ *Name: //p'; } > UE4SS.def
   /usr/bin/llvm-lib-19 /nologo /machine:x64 /def:UE4SS.def /out:UE4SS.lib
   ```
   4067 exports (3581 in `RC::Unreal`, `RC::Output::*`, `RC::File::*`,
   `CppUserModBase` ctor/dtor/virtuals, plus a few C exports such as
   `is_ue4ss_initialized`). Because the headers default to
   `__declspec(dllimport)` when none of the `RC_*_BUILD_STATIC` macros are
   defined, this is exactly what upstream mods link against too.

2. **Rust core**, `probe/rust`, `crate-type = ["staticlib", "cdylib"]`:
   ```
   cargo build --release --target x86_64-pc-windows-msvc
   cargo rustc --release --target x86_64-pc-windows-msvc --crate-type staticlib -- --print native-static-libs
   #   -> kernel32.lib ntdll.lib userenv.lib ws2_32.lib dbghelp.lib /defaultlib:msvcrt
   ```
   1.1 s. Produces `tswcoop_core_probe.lib` (staticlib, 3.6 MB),
   `tswcoop_core_probe.dll` + `.dll.lib` (cdylib, 100 KB) and a `.pdb`.
   `cargo clippy --target x86_64-pc-windows-msvc -- -D warnings -W clippy::pedantic`
   and `cargo fmt --check` pass. The msvc target links the **dynamic** CRT
   (`/defaultlib:msvcrt`), which is what UE4SS.dll uses (it imports
   `MSVCP140.dll`/`VCRUNTIME140.dll`, i.e. `/MD`), so there is a single CRT
   heap in the process.

3. **C++ shim** with clang-cl, flags mirrored from upstream CMake
   (`cmake/modules/CompilerOptions/msvc-compatible.cmake`,
   `cmake/modules/ProjectConfig.cmake` triplet `Game__Shipping__Win64`,
   `UE4SS/CMakeLists.txt` version defines from `generated_src/version.cache`
   = `3.0.1.0.0`):
   ```
   /usr/bin/clang-cl-19 --target=x86_64-pc-windows-msvc /clang:-std=c++23 /EHsc /MD /O2 /Zi /Gy \
     /Zc:inline /Zc:strictStrings /W3 /wd4005 /wd4251 /wd4068 /D_DISABLE_CONSTEXPR_MUTEX_CONSTRUCTOR \
     /DUE_GAME /DUE_BUILD_SHIPPING /DPLATFORM_WINDOWS /DPLATFORM_MICROSOFT \
     /DOVERRIDE_PLATFORM_HEADER_NAME=Windows /DUBT_COMPILED_PLATFORM=Win64 \
     /DHAS_INPUT /D_UNICODE /DUNICODE /D_WIN32_WINNT=0x0A00 /DWINVER=0x0A00 \
     /DUE4SS_LIB_VERSION_MAJOR=3 /DUE4SS_LIB_VERSION_MINOR=0 /DUE4SS_LIB_VERSION_HOTFIX=1 \
     /DUE4SS_LIB_VERSION_PRERELEASE=0 /DUE4SS_LIB_VERSION_BETA=0 /DUE4SS_LIB_BETA_STARTED=1 /DUE4SS_LIB_IS_BETA=1 \
     '/DUE4SS_LIB_BUILD_GITSHA="06474186"' '/DUE4SS_CONFIGURATION="Game__Shipping__Win64"' \
     /DFMT_HEADER_ONLY /DZYDIS_STATIC_BUILD /DZYCORE_STATIC_BUILD \
     /imsvc/opt/xwin/crt/include /imsvc/opt/xwin/sdk/include/ucrt /imsvc/opt/xwin/sdk/include/um \
     /imsvc/opt/xwin/sdk/include/shared /imsvc/opt/xwin/sdk/include/winrt \
     /clang:-isystem<RE-UE4SS>/UE4SS/include /clang:-isystem<RE-UE4SS>/UE4SS/generated_include \
     /clang:-isystem<RE-UE4SS>/deps/first/Unreal/include ... (full list in ue4ss-build-lib.sh) \
     /c dllmain.cpp /Fo dllmain.obj /Fd dllmain.pdb
   ```
   Compiles in ~3 s with **zero warnings** in our code. (With `-I` instead of
   `-isystem` the vendored Unreal headers emit 13 `-Wunused-*`/`-Wswitch`
   warnings; upstream silences the same ones through
   `cmake/modules/ThirdPartyWarnings.cmake`.)

4. **Link** one DLL:
   ```
   /usr/bin/lld-link-19 /nologo /DLL /MACHINE:X64 /DEBUG:FULL /INCREMENTAL:NO /OPT:REF /OPT:ICF \
     /LIBPATH:/opt/xwin/crt/lib/x86_64 /LIBPATH:/opt/xwin/sdk/lib/um/x86_64 /LIBPATH:/opt/xwin/sdk/lib/ucrt/x86_64 \
     /OUT:main.dll /PDB:main.pdb dllmain.obj tswcoop_core_probe.lib UE4SS.lib \
     kernel32.lib ntdll.lib userenv.lib ws2_32.lib dbghelp.lib /defaultlib:msvcrt
   ```
   `main.dll` 224 KB, exports `start_mod`, `uninstall_mod`; imports from
   `UE4SS.dll`: `CppUserModBase` ctor/dtor + virtuals, `UObjectGlobals::FindObject`,
   `UObject::GetFullName`, `FName::FName`, `Output::DefaultTargets::get_default_devices_ref`.

## Failures hit on the way (verbatim causes)

- `clang-cl-19: warning: argument unused during compilation: '/std:c++23'` →
  clang-cl 19 only knows `/std:c++14|17|20|latest`; the file was compiled as
  C++14 and every header broke (`no template named 'basic_string_view'`,
  `no member named 'filesystem'`, ...). Fix: `/clang:-std=c++23`.
- `unknown argument ignored in clang-cl: '-isystem...'` → use
  `/clang:-isystem<dir>` (or `/imsvc` for the MSVC/SDK dirs).
- `fatal error: 'TextEditor.h' file not found` (ImGuiColorTextEdit),
  `'Zydis/Zydis.h' file not found` (zydis + zycore) → fetched, see table.
- `fmt/base.h: static assertion failed ... formatting of non-void pointers
  is disallowed` → `Output::send` is wide-char fmt; pass `std::wstring`,
  not `const char*`.
- `using declaration cannot refer to a namespace` → `RC::Output`,
  `RC::LogLevel`, `RC::Unreal::UObjectGlobals` are namespaces, not classes.
- `cargo`/`git`: `fatal: couldn't find remote ref 06474186` → full SHA needed.
- The MSVC-target staticlib is `tswcoop_core_probe.lib`, not `lib*.a`.

## What remains

1. **Load it in the game** (not done; the game was not touched this session):
   ```
   G="/run/media/system/Data/Games/Steam/steamapps/common/Train Sim World 7/WindowsNoEditor/TS2Prototype/Binaries/Win64/ue4ss/Mods"
   mkdir -p "$G/TswCoopProbe/dlls" && cp toolchain/out/TswCoopProbe/dlls/main.{dll,pdb} "$G/TswCoopProbe/dlls/"
   # add "TswCoopProbe : 1" to "$G/mods.txt" above the Keybinds line, restart the game,
   # then look for "[TswCoopProbe]" lines in ue4ss/UE4SS.log:
   #   constructed, rust abi version 1 / StaticFindObject -> Object /Script/CoreUObject.Object
   #   rust says (N bytes): tswcoop rust core probe ... / on_update ticks=1
   ```
   Expectation: it loads (same CRT, same UE4SS commit, same STL major 14.x).
   The one known risk is the STL *update* level: xwin has STL 202503, the
   zDEV build was made with whatever VS 17.x the UE4SS CI used in May 2026;
   `std::wstring`/`std::vector` layouts are stable across 14.x so this is
   expected to be fine, but the log is the proof.
2. Turn `external/RE-UE4SS` into the submodule AGENTS.md calls for
   (`git submodule add https://github.com/UE4SS-RE/RE-UE4SS.git external/RE-UE4SS`,
   pin to the installed commit), and vendor fmt/imgui/ImGuiColorTextEdit/
   IconFontCppHeaders/zydis the same way or pin them in a fetch script. The
   `.gitignore` currently ignores all of `external/`; narrow it when that
   happens.
3. ~~Move from the probe to the real `mod/` layout.~~ Done 2026-10-17:
   see `mod/README.md`. The core is its own Cargo workspace (it needs
   `unsafe` for the C ABI, which `server/` forbids) and shares the wire
   types through `server/crates/tsw-coop-proto`; staticlib in `main.dll`.
4. Re-run `build-probe.sh` whenever the installed UE4SS changes: it regenerates
   `UE4SS.lib` from the installed DLL and the `UE4SS_GITSHA` define must be
   updated to the SHA in `UE4SS.log`, with `external/RE-UE4SS` checked out to
   the matching commit.
5. If a mod ever needs `Unreal/Hooks.hpp`, fetch PolyHook (see above).

## Licensing

- **RE-UE4SS, UEPseudo, fmt, imgui, ImGuiColorTextEdit, IconFontCppHeaders,
  zydis/zycore:** MIT (fmt: MIT-style with a binary-exception clause). All
  fine to vendor and to ship a derived DLL under the project's MIT licence.
- **xwin / MSVC CRT / Windows SDK:** `xwin` itself is Apache-2.0/MIT, but the
  payload it downloads comes from Microsoft's Visual Studio package manifest
  and is covered by the **Visual Studio / Windows SDK licence terms**, not by
  an open-source licence. Microsoft permits using the SDK and CRT to build
  applications; the grey zone is that xwin consumes the packages outside a
  Visual Studio installation. Treat `/opt/xwin` as a *build-time* dependency
  only: do not redistribute it, do not commit it. Because the mod links the
  CRT dynamically (`/MD`), **no Microsoft binaries are redistributed with
  `main.dll`**; the target machine needs the VC++ 2015-2022 x64 runtime, which
  the game/UE4SS already require.
- The generated `UE4SS.lib` contains only symbol names from the installed
  UE4SS.dll (MIT); it is a build artefact, not something to ship.

## Files

```
toolchain/
  README.md               this file
  build-probe.sh          end-to-end build (host entry point, re-execs inside build-box)
  ue4ss-build-lib.sh      the shared steps (import lib, cargo, clang-cl flags, lld-link), also used by mod/build.sh
  probe/cpp/dllmain.cpp   CppUserModBase subclass calling the Rust core
  probe/rust/             Cargo crate: staticlib + cdylib for x86_64-pc-windows-msvc
  out/                    (ignored) obj/UE4SS.def, obj/UE4SS.lib, TswCoopProbe/dlls/main.dll
external/                 (ignored) RE-UE4SS, fmt, imgui, ImGuiColorTextEdit, IconFontCppHeaders, zydis
```
