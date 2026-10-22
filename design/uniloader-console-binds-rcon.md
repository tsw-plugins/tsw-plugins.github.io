---
name: uniloader-console-binds-rcon
description: >-
  A Source/Counter-Strike-style console for uniloader: binds that run console code, aliases, cfg files, plugin-suggested default binds the user can unbind, and a password-protected Source RCON server that runs console code as if typed. Design and ordered implementation plan; nothing implemented yet.
status: proposal
created: 2026-10-22T07:45+0200
last_edited: 2026-10-22T07:45+0200
---

# uniloader: console, binds and RCON (proposal, 2026-10-22)

The owner's request, in his words:

> a more complex but powerful hotkey/setting/command system like counter strike has, where a bind
> just executes a command, and a command can change a setting, so for example in console
> `bind A "exec plugin.command arg1 arg2"` or `bind CTRL+F9 "set plugin.setting value;reload"` ...
> plugins can just suggest default binds, which the user can "unbind" which gets saved ... would
> be nice if you could then "use" that remotely, ideally with a uniloader provided "rcon" system so
> anything that has the rcon pw can execute commands/change settings/run this pseudo console code
> as if the user typed it.

This document is the design and plan only. Nothing here is implemented. It is written against
uniloader `436f0c6` plus the uncommitted game-speed work (`uniloader.speed`, `speed.rs`,
`timescale.rs`) that another agent is landing at the same time; that feature is used as the
running example.

## Verdict

**Feasible, mostly inside `uniloader-core` (pure, unit-testable) with a thin platform layer.**
Today's pieces already cover half of it: a console grammar, a settings registry with typed
validation and persistence, a hotkey registry with defaults and per-action user overrides
(`hotkeys.toml`), a capture path (`console_capture`) that returns a command's output, and a
16 ms input thread. What is missing is a real script grammar (quotes, `;`), a key-to-script bind
table on top of the action registry, aliases, cfg files, key-release edges for `+`/`-` commands,
a command buffer, and the RCON listener. The plugin ABI stays at version 1: everything new is
appended, and `host.hotkey(name, help, default)` keeps working unchanged.

**The one risk to say plainly:** the RCON password is equivalent to running arbitrary code in the
game process as the user. Plugins expose commands that load DLLs (`plugin load`), run Lua, change
file paths plugins read, and quit the game. "As if the user typed it" (the owner's wording) means
exactly that power goes to anyone holding the password, and Source RCON sends the password in
clear text. Hence: off by default, loopback by default, LAN only by explicit opt-in, never over
the internet without a tunnel (Tailscale, SSH).

## 1. What exists today

| Piece | Where | What it does |
| --- | --- | --- |
| Line grammar | `uniloader-core/src/console.rs` | One line, first word decides: `help`, `list`, `plugin <op>`, `hotkeys`, `hooks`, `get`, `set`, `quit`, `<plugin.key> [value]`, `<plugin.command> args`. No quotes, no `;`; `#` and `//` lines are comments. `set` takes the raw rest of the line as value. |
| Executor | `uniloader/src/console.rs` | Runs a parsed line against `State` under the state lock and returns an `Outcome` (notifications, files to persist, a plugin command or lifecycle op to perform *after* unlocking). |
| Entry points | `uniloader/src/win/mod.rs` `run_console_line[_capture]` | Used by the `--loader-console` window thread (`win/console.rs`), by plugins (`console_exec`, `console_capture`), by the overlay console, and by the remote doors below. Runs on the calling thread. |
| Settings | `uniloader-core/src/settings.rs`, `store.rs` | Typed descriptors (bool, int, float, enum, string, file, directory, colour, date/time, flags, key), validated on set, persisted to `config/<plugin>.toml` unless `TRANSIENT`. |
| Hotkeys | `uniloader-core/src/hotkeys.rs`, `keys.rs` | Actions `<plugin>.<action>` with default chords from the plugin and user overrides from `config/hotkeys.toml` (by action name; `none` = unbound). Chord grammar `ctrl+shift+f9`, `0x7b`, `sc29` (by position), comma-separated lists. Exact modifier match, press edge only. Polled every 16 ms on the `uniloader-hotkeys` thread while a window of the process has focus (`GetAsyncKeyState`); `sc..` bindings arrive via `hotkey_press` from a plugin that subclasses the window (the overlay). `input_capture` lets a typing overlay suppress other plugins' hotkeys. |
| Plugin use | tsw-coop `menu` f9, tsw-unlock `panel` f5, tsw-autopilot `toggle` f4, tsw-ui `console` ctrl+shift+c and `plugins` ctrl+shift+p | All through `host.hotkey(action, title, default)` and `on_hotkey(action)`. tsw-coop and tsw-ui also register a *command* of the same name (`menu`, `console`) that does roughly the same. |
| Rebinding UI | tsw-sdk `tsw-ui/src/rebind.rs` | Records a chord in the game's menus and writes it with `hotkey_rebind` (actions) or `set` (key settings). |
| Remote door 1 | dayz-plugins `dayz-debug-plugin` (`server.rs`, protocol crate `dayz-debug-protocol`), client `dayz-ctl` | A uniloader plugin: JSON line protocol on `127.0.0.1:48621`, `{"op":"exec","line":...}` returns the printed lines; also state, symbols, hooks. **No authentication**; loopback only by design. |
| Remote door 2 | tsw-coop `mod/native/src/web` | `tiny_http` server; `POST /dev/console {"command": ...}` queues a console line for the game thread; allowed callers by the `web_dev` setting (`off`/`local`/`any`, default `local`), same-site checks against DNS rebinding. **No password.** |

Threading today: a console line runs on whatever thread submits it (console window thread, hotkey
thread, a plugin's thread, a socket thread). Plugin callbacks (`on_hotkey`, `on_command`) arrive
on that thread, and plugins that must touch the game marshal to the game thread themselves
(tsw-coop's `Web::take_commands`, tsw-autopilot's tick). The loader is game-agnostic and owns no
game-thread hook.

## 2. Reference: what Source and GoldSrc do

- **Command buffer.** Text is appended to a buffer (`Cbuf_AddText`) and executed once per frame;
  `wait` stops execution until the next frame. Keys, `exec`, the console and RCON all feed it.
- **Grammar.** Commands separated by `;` or newline outside quotes. Arguments split on
  whitespace; `"..."` groups, with **no escape for a quote inside a quote** (the classic
  limitation; aliases are the workaround). `//` starts a comment.
- **Binds.** `bind <key> "<script>"` stores a script per key; `bind <key>` prints it; `unbind`,
  `unbindall`, `key_listboundkeys`. A key has exactly one bind. Key names are case-insensitive
  (`MOUSE1`, `MWHEELUP`, `KP_ENTER`, `JOY1`). No modifier chords; people emulate them with
  `+`/`-` aliases that rebind keys while a modifier is held.
- **`+`/`-` commands.** A bind whose script starts with `+` runs `+cmd` on press and the matching
  `-cmd` on release (`bind mouse1 +attack`). `alias +fast "..."; alias -fast "..."` makes custom
  hold actions.
- **Variables.** `name value` sets a cvar; `toggle name [v1 v2 ...]`, `incrementvar name min max
  step`; cvars with the archive flag are written to `config.cfg`.
- **Files.** `exec name` runs `cfg/name.cfg`. `config.cfg` is machine-written (binds and archived
  cvars, rewritten on exit); `autoexec.cfg` is the user's, run after it and never rewritten.
- **RCON (Source protocol).** TCP to the server port. Packet: `i32 size` (little-endian, bytes
  after this field), `i32 id`, `i32 type`, body as NUL-terminated ASCII, then an empty
  NUL-terminated string. Types: `SERVERDATA_AUTH` 3, `SERVERDATA_AUTH_RESPONSE` 2,
  `SERVERDATA_EXECCOMMAND` 2, `SERVERDATA_RESPONSE_VALUE` 0. A failed auth answers with id `-1`.
  Bodies are at most about 4 KB; longer output comes as several `RESPONSE_VALUE` packets, and
  clients detect the end by sending an empty `RESPONSE_VALUE` after the command and waiting for
  its echo. Servers ban addresses after repeated failures (`sv_rcon_maxfailures`,
  `sv_rcon_banpenalty`). No encryption. Many clients speak it: `mcrcon`, `rcon-cli` (gorcon),
  ARRCON, the Python `rcon` package, web panels.

## 3. Script grammar

One grammar for the console window, the overlay console, cfg files, bind scripts, aliases,
`console_exec` and RCON. It lives in `uniloader-core::script` (new, pure).

```
script   = command { (";" | newline) command }
command  = [ word { ws word } ] [ comment ]
word     = bare | quoted
bare     = 1*( any char except ws, ";", '"', and the start of "//" )
quoted   = '"' { char | '\"' | '\\' } '"'
comment  = "//" to end of line          ; outside quotes only
         | "#" as the first non-blank character of a line   ; kept for today's files
```

- `;` and newlines split commands only outside quotes. `"set a.b x; echo y"` inside a `bind` stays
  one argument and is split when the bind runs.
- **Escapes, a deliberate deviation from Source:** inside double quotes `\"` is a quote and `\\` a
  backslash; any other backslash is literal (so Windows paths still work:
  `set x.dir "C:\Games\TSW"`). This removes the need for alias gymnastics to nest a quoted
  argument inside a bind: `bind f6 "echo \"two words\""`.
- **Names are case-insensitive** (lower-cased), values and arguments keep their case, as today.
- **What a plugin command receives.** `on_command(name, args)` keeps receiving the *raw text*
  after the command word (quotes and escapes preserved, `;`-split already done, trimmed), so every
  existing plugin parses its arguments exactly as before. The SDK gains
  `uniloader_sdk::args::split(args) -> Vec<String>` using the same tokenizer, for plugins that
  want quoted arguments.
- **`set` stays compatible:** `set a.b Hello World` still sets `Hello World` (the raw remainder);
  if the remainder is exactly one quoted word, the quotes are removed (`set a.b "x;y"` sets
  `x;y`).
- **Limits** (stop runaway aliases and hostile input): 64 KiB per submitted script, 1000
  commands per submission including alias expansion, alias/exec nesting depth 16, each a clear
  error rather than a hang.

The existing `console::parse` becomes the per-command step after splitting; its `Line` enum gains
the new built-ins. `BUILTIN_NAMES` and its "every completion candidate is known to the grammar"
test carry over.

## 4. Commands

New built-ins (existing ones keep their meaning):

| Command | Meaning |
| --- | --- |
| `bind <chord> [script]` | Without script: print what the chord runs. With script: the user's bind for that chord. |
| `unbind <chord>` | Remove whatever the chord runs, including a plugin's default (persisted as an explicit removal, section 6). |
| `unbindall` | Remove every bind, defaults included (Source semantics). Prints how to undo: `binds reset all`. |
| `binds [filter]` | List effective binds: chord, script, and where it comes from (`default <plugin>`, `user`, `removed`, `shadowed`, `conflicts with game: <name>`). `hotkeys` stays as a synonym. |
| `binds reset <chord\|plugin.action\|all>` | Drop the user's change and go back to the plugin's suggestion. |
| `rebind <plugin.action> <chords\|none>` | Move a plugin action to other keys (what `hotkey_rebind` and tsw-ui's rebind screen do); this is the line `binds.cfg` stores for moved defaults. |
| `alias <name> [script]` | Define, print or (with `""`) delete an alias. Names have no dot (dots are plugin namespaces), may start with `+`/`-`, and cannot shadow a built-in. |
| `aliases` | List aliases. |
| `exec <name>` | Run `config/<name>.cfg`. Name restricted to `[a-z0-9_.-]+`, no path separators, `.cfg` added; nesting limited. |
| `action <plugin.action>` | Fire a plugin hotkey action (`on_hotkey`) from a script. `plugin.action` alone also works when no setting or command has that name. |
| `toggle <setting> [v1 v2 ...]` | Bool: flip. Enum without values: next choice. With values: cycle through them. |
| `incrementvar <setting> <min> <max> <step>` | Source semantics: add `step`, wrap within `[min, max]`. Int and float settings. |
| `reset <setting>` | Back to the descriptor default. |
| `echo <text>` | Print text (useful in binds for feedback; the overlay can toast it). |
| `wait [ms]` | Defer the rest of the script by one tick (16 ms) or `ms` (max 60 s). Only meaningful with the command buffer (section 8); owner decision whether it is wanted. |

**Resolution order for a dotted word** `a.b`: setting, then plugin command, then plugin hotkey
action, then "unknown". For an undotted word: built-in, then alias, then today's bare-variable
fallback. A bind or alias whose target does not exist yet is accepted (plugins may load later)
and reported when it runs.

`+`/`-`: a bind whose script is a single `+name` command runs `+name` on press and `-name` on
release, as in Source. Plugins can register `+`/`-` commands like any other
(`host.command("+boost", ...)`), and users can build their own with alias pairs.

The game-speed feature as the example:

```
// hold mouse 5 for 4x, back to normal on release
alias +fast "set uniloader.speed 4"
alias -fast "reset uniloader.speed"
bind mouse5 +fast

// step the speed with the keypad, wrapping at 4.0
bind add "incrementvar uniloader.speed 0.1 4 0.1"
bind ctrl+add "uniloader.speed_up"            // the command the speed work registers
bind ctrl+subtract "uniloader.speed_down"
```

The owner's own examples parse as intended: `bind A "exec plugin.command arg1 arg2"` (where
`exec` would actually be `plugin.command arg1 arg2` directly; `exec` is the cfg runner, a
Source-ism worth pointing out to him) and
`bind CTRL+F9 "set plugin.setting value;reload"` (two commands, run in order on press).

## 5. Key chords

Keep `keys.rs` as is and extend it:

- **Keyboard:** unchanged names, `0x..` codes, `sc..` positions, `ctrl`/`alt`/`shift` modifiers
  with exact match (`f9` does not fire while Ctrl is held; `ctrl+f9` is a separate bind). Names
  are case-insensitive, so CS-style `CTRL+F9` and `KP_ENTER`-style aliases can be added to the
  name table (`kp_enter`, `kp_plus`, `kp_5`, ...). The key `+` is named `plus`; `;` is
  `semicolon`, so neither collides with the grammar.
- **One chord per bind.** `binds.cfg` writes one `bind` per chord. The comma list stays valid for
  `rebind` and for the `Key` setting kind, which already use it.
- **Mouse buttons** (cheap): `mouse1`..`mouse5` are virtual keys 0x01, 0x02, 0x04, 0x05, 0x06 and
  poll through `GetAsyncKeyState` like any key. Binding `mouse1` without a modifier is allowed but
  warned about (it also clicks in the game).
- **Mouse wheel** (`mwheelup`, `mwheeldown`): not pollable. Needs window messages, i.e. the
  overlay's window subclass reporting `WM_MOUSEWHEEL` through a new `input_event` host call (a
  generalised `hotkey_press`). Fires press and release in the same tick.
- **Gamepad** (optional, later step): XInput polling (`XInputGetState`, `xinput1_4.dll`, works
  under Proton) on the same thread: `pad_a`, `pad_b`, `pad_x`, `pad_y`, `pad_lb`, `pad_rb`,
  `pad_lt`, `pad_rt` (trigger threshold 0.5), `pad_back`, `pad_start`, `pad_ls`, `pad_rs`,
  `pad_up/down/left/right`, with a pad button allowed as modifier (`pad_lb+pad_a`). Caveat: Steam
  Input may remap or hide the pad from XInput, and TSW uses the pad for driving, so pad binds
  collide with the game far more than keys do.
- **Release edges.** `hotkeys::Registry::poll` returns presses today; it returns press and
  release events instead, which `+`/`-` binds need. A chord's release fires when its main key
  goes up, regardless of modifiers, so releasing Ctrl first still ends `+fast`.

The loader cannot swallow a key: polling sees the key, and so does the game. A bind on a key the
game uses does both things. Swallowing would need the overlay's window subclass to eat the message
and is out of scope here (noted under open work).

## 6. Default binds, user changes and persistence

Three layers, merged into one effective table (`chord -> script`):

1. **Plugin suggestions** (defaults). Every `host.hotkey(action, title, default)` becomes "action
   `plugin.action`, suggested on chords `default`". New: `host.bind_default(chord, script)` lets a
   plugin suggest any script, not only an action. Suggestions are never written to disk; they come
   back from the plugins every start.
2. **User changes to suggestions**, keyed by the *action*, not the chord. `unbind f9` while f9 holds
   tsw-coop's suggestion records `rebind tsw-coop.menu none`; moving it records
   `rebind tsw-coop.menu f10`. Keying by action (which is what `hotkeys.toml` does today) keeps the
   user's intent when a plugin later changes its default: an action the user removed stays removed
   instead of reappearing on the plugin's new key.
3. **User binds**: `bind <chord> "<script>"` written by the user. A user bind on a chord that a
   suggestion holds takes the chord (the suggestion is recorded as moved off it, layer 2).

Two plugins suggesting the same chord: the first registered keeps it, the later one is
`shadowed`, logged at warn and shown by `binds` and in the overlay, until the user decides. A
suggestion on a chord the user already bound is shadowed the same way.

**Files** in `uniloader/config/`:

| File | Written by | Content |
| --- | --- | --- |
| `binds.cfg` | the loader, after every change (atomic write, after unlocking, like settings files) | Header comment, then layer 2 as `rebind` lines, layer 3 as `bind` lines, and the aliases, sorted. A valid script: it is executed at startup before plugins start, so `rebind` of an action that is not registered yet lands in the pending overrides map exactly as `hotkeys.toml` entries do today. |
| `autoexec.cfg` | the user, never the loader | Run once after every plugin has started (`Phase::Running`). |
| `<name>.cfg` | the user | Run with `exec <name>`. |
| `<plugin>.toml` | unchanged | Settings stay in the typed TOML store, which the overlay editor, validation and `TRANSIENT` already rely on. A `set` from a bind persists like any other `set`. |
| `hotkeys.toml` | read once for migration | Converted into `rebind` lines in `binds.cfg` on first start, then renamed `hotkeys.toml.migrated`. |

Example `binds.cfg`:

```
// Written by uniloader. Edit it while the game is closed, or use the console:
// bind / unbind / rebind / alias / binds reset.
rebind tsw-autopilot.toggle ctrl+f10
rebind tsw-coop.menu none
alias +fast "set uniloader.speed 4"
alias -fast "reset uniloader.speed"
bind ctrl+f9 "set tsw-autopilot.enabled true; echo autopilot on"
bind mouse5 +fast
```

## 7. Conflicts with the game's own keys

The loader is game-agnostic, so the game's bindings are supplied from outside:

- **Adapter plugins report them**: new host call `keys_reserve(label, chords)` (appended to
  `HostApi`). For TSW, tsw-sdk reads the live input mappings (Unreal `UInputSettings`
  action/axis mappings plus the user's overrides; research/input-injection.md found the table is
  not on disk and must be read from the running game) and reserves them with labels such as
  `game: Destination` for F7/F8.
- **Fallback for games without an adapter**: `loader.toml` `game_keys = ["f1", "f2", "f3", "f7",
  "f8", "ctrl+f10", "ctrl+f12"]` with a label. The TSW defaults the owner listed (F1-F3, F7/F8,
  Ctrl+F10, Ctrl+F12) go there until tsw-sdk reports the real table.
- **Effect**: never blocking. `bind` on a reserved chord succeeds and prints
  `note: ctrl+f10 is also the game's <label>; both will run`; `binds` and the overlay mark it;
  plugin suggestions on a reserved chord log a warning at registration so plugin authors notice
  (the code binds tsw-autopilot's toggle to F4 today; an older research note still names
  Ctrl+F10, which this list would flag).

## 8. Threading: one command buffer

Introduce a loader-owned **command buffer** (a queue of `(source, script, completion)`), the
Source model:

- Keys, the console window, the overlay console, `console_exec`, `exec`, cfg files and RCON
  *enqueue*; the `uniloader-hotkeys` thread drains the buffer every tick (16 ms) after polling
  keys. This serialises all sources (a bind and an RCON command never interleave), gives `wait`
  a meaning, and keeps socket threads from calling into plugins.
- Each command still runs through today's `execute` under the state lock and performs plugin
  calls after unlocking (the "never hold a lock across a call into a plugin" rule is unchanged).
- **Synchronous callers keep working:** `console_capture`, RCON and dayz-ctl need the output.
  They enqueue with a completion handle and block on it with a timeout (5 s); output printed
  before a `wait` is returned, the rest still runs. A call that arrives *from inside* buffer
  execution (a plugin command calling `console_exec`) runs inline instead of enqueueing, which
  avoids deadlocking the drain thread; nesting depth counts towards the limit.
- **Game thread:** plugin callbacks keep arriving on the loader's thread, as documented in
  `callbacks.rs`; plugins that touch the game keep marshalling. Optional later step: an adapter
  plugin registers a game-tick source (`host.tick_source`) and the loader then drains the buffer
  on the game thread, which would let simple plugins skip their own marshalling. Not needed for a
  first version; owner decision.
- `input_capture` (an overlay typing) keeps suppressing *key* binds other than the capturing
  plugin's; scripts from the console or RCON are not suppressed.

## 9. Plugin ABI and SDK (backwards compatible)

`API_VERSION` stays 1. Fields are appended to `HostApi` and `PluginCallbacks`; the loader checks
`struct_size` before using a field a plugin's table may not have, as the ABI rules already require.

| Addition | Kind | Purpose |
| --- | --- | --- |
| `bind_default(host, plugin, chord, script)` | `HostApi`, start phase only | Suggest a bind running any script. |
| `keys_reserve(host, plugin, label, chords)` | `HostApi` | Game keys, for conflict reporting. |
| `input_event(host, kind, code, down)` | `HostApi` | Generalised `hotkey_press`: wheel, buttons, releases, from a window subclass. |
| `on_hotkey_release(ctx, action)` | `PluginCallbacks`, optional | Release edge for actions, so `+`/`-` works for plugin actions too. |
| `SettingFlags::SECRET` (8) | flag | Never printed, listed, enumerated or logged; see section 10. |

Unchanged and reimplemented over the bind table: `hotkey_register` (= action + suggestion),
`hotkey_enumerate` (one entry per action with its effective chords), `hotkey_rebind` (= `rebind`
line), `hotkey_press`, `on_hotkey`, `console_exec`, `console_capture`, `console_names` (now also
aliases, cfg names, key names after `bind `). Every current plugin (tsw-coop, tsw-unlock,
tsw-autopilot, tsw-ui, the DayZ ones) keeps working without a rebuild; the default bind for an
existing hotkey is `bind <default> "plugin.action"`, or `"action plugin.action"` where the plugin
also has a command of the same name (tsw-coop `menu`, tsw-ui `console`) so the bind keeps calling
`on_hotkey` as today.

SDK: `host.bind_default`, `host.reserve_keys`, `uniloader_sdk::args::split`, and the
`on_hotkey_release` trait method with an empty default.

## 10. RCON

### Protocol

**Source RCON over TCP**, so `mcrcon`, `rcon-cli`, ARRCON, Python's `rcon` and web panels work
unchanged. Specifics:

- Auth: `SERVERDATA_AUTH` with the password; answer an empty `RESPONSE_VALUE` then
  `AUTH_RESPONSE` with the request id, or id `-1` on failure (what Source servers send, and what
  clients expect). Any packet other than `AUTH` before authentication closes the connection.
- `EXECCOMMAND` body = a script (section 3; `;` works). Output = the lines the script printed,
  joined with `\n`, split into `RESPONSE_VALUE` packets of at most 4096 body bytes, all with the
  request id. An empty `RESPONSE_VALUE` from the client is echoed back (the multi-packet end
  marker clients use).
- UTF-8 bodies (Source says ASCII; every modern client sends UTF-8 and the console is UTF-8).
- Packet size cap 4096 + 10 bytes inbound; anything larger closes the connection.

Not chosen as the primary: the dayz-debug JSON line protocol (no auth, no existing third-party
tools) and WebSocket (browser-friendly but needs Origin checks and TLS considerations; can be a
later front end over the same core, for a web console in tsw-coop's page).

### Configuration (settings of the `uniloader` plugin entry the speed work introduces)

| Setting | Default | Notes |
| --- | --- | --- |
| `uniloader.rcon` | `false` | Master switch. Also off while the password is empty. |
| `uniloader.rcon_bind` | `127.0.0.1` | `0.0.0.0` or one interface address to opt into LAN. `RESTART_REQUIRED` or a live restart of the listener. |
| `uniloader.rcon_port` | `27015`? | Owner decision; 27015 is what RCON tools default to, but also the Source game port. |
| `uniloader.rcon_password` | empty | `SECRET`. Stored as a salted hash (Argon2id via the `argon2` crate), never as text: RCON only needs to verify. Setting it from the console logs `uniloader.rcon_password = <set>`. |
| `uniloader.rcon_allow` | empty | Optional comma list of CIDRs allowed to connect, checked before auth. |

A non-loopback bind is refused with a clear log line unless the password is at least 12
characters.

### Secrets never in logs

The password can enter through a typed line (`set uniloader.rcon_password ...`), the overlay
console history, a cfg file, RCON itself, dayz-ctl and `/dev/console`. So redaction happens at the
one place they all pass: the executor parses first and echoes the *redacted* line (`> set
uniloader.rcon_password <redacted>`) to the scrollback, the log, the console window and the audit
log. Secret settings answer `get`/`list`/`setting_enumerate`/RCON with `<set>` or `<unset>`, and
the overlay settings editor shows a password field. The attempted password of a failed auth is
never logged.

### Abuse limits

- At most 4 connections at once; an unauthenticated connection is closed after 10 s; idle
  authenticated ones after 15 min.
- Per source address: 3 failed auths within 10 min ⇒ every further attempt from it is refused for
  15 min (Source's `sv_rcon_maxfailures`/`banpenalty` idea, smaller numbers). One failure answers
  only after a 1 s delay. Bans are in memory and logged.
- Password compared in constant time (on the hash).
- 20 commands per second per connection; excess waits.

### What RCON may run

Everything "as if typed", per the owner, including `quit`, `plugin load/stop`, `exec`, `bind`
and settings. Plainly, this means:

- `plugin load <name>` runs any DLL already in `plugins/`; plugin commands can run Lua or game
  functions; `File`/`Directory` settings can point a plugin at other files. Holding the password
  is code execution as the user.
- RCON can change `uniloader.rcon_*` itself (lock the owner out, open the LAN bind). Proposed
  exception: the `rcon_*` settings are refused over RCON (owner decision).
- Optional `uniloader.rcon_deny` (comma list of command prefixes, empty by default) for owners
  who want a narrower door, e.g. `quit, plugin, exec`.

### Audit log

`uniloader/logs/rcon.log` (and info lines in the main log): time, peer address, connection id,
`auth ok` / `auth failed` / `banned`, every executed script (redacted as above) with its status
and output line count. Output itself is not written, because it can contain anything a plugin
prints.

### Relation to dayz-ctl and tsw-coop's web API

- **dayz-debug-plugin** stays a plugin: it also serves state, symbols and hooks, which RCON does
  not. Its `exec` should go through the same command buffer (it already calls `console_capture`,
  so that happens automatically) and therefore gets redaction and audit for free. `dayz-ctl` can
  grow `--rcon host:port` later; the password then comes from an environment variable or a file,
  never the command line.
- **tsw-coop `/dev/console`**: keep for dev and tests (loopback, same-site checks, `web_dev`); it
  already queues for its own game thread and calls the console, so it also inherits redaction and
  audit. No change needed for the first version.
- **Unify?** Recommendation: not now. One core (buffer + redaction + audit) and several doors is
  already the unification that matters; merging the JSON protocol into the loader would add a
  second unauthenticated door to every game. A later WebSocket front end could replace
  `/dev/console` for browsers.

## 11. Overlay and tsw_ui console

- Console line input goes through the same buffer; history stores the redacted line.
- Completion (`console_names`): built-ins incl. `bind`/`alias`/`exec`, aliases, cfg files,
  setting names after `set`/`toggle`/`incrementvar`, key names after `bind `/`unbind `.
- tsw-ui gets a **Binds** screen: every effective bind with its source, buttons Unbind,
  Reset to default, Record key (the existing `rebind.rs` recorder), and a text field for the
  script; conflicts and shadowed suggestions highlighted. The per-plugin settings screen keeps its
  "Peek key: f8" buttons, which now write `rebind`.
- `echo` output from a key bind can be shown as a toast (tsw-ui notices) so a bind gives
  feedback with no console open.

## 12. Implementation plan

Each step is independently gateable (`scripts/gate.sh`), one revertable commit, and leaves
everything working. Sizes are rough added/changed lines including tests.

| # | Step | Where | Size |
| --- | --- | --- | --- |
| 1 | Script tokenizer and splitter (quotes, escapes, `;`, comments, limits) + `args::split` in the SDK; `console::parse` takes tokens. No behaviour change for single-word lines. | core `script.rs`, `console.rs`, sdk | 350 |
| 2 | Bind table in core: layers, effective map, shadowing, `rebind` semantics, `binds.cfg` writer/reader, `hotkeys.toml` migration. Registry yields press **and** release events. | core `binds.rs`, `hotkeys.rs` | 600 |
| 3 | Built-ins `bind`/`unbind`/`unbindall`/`binds`/`binds reset`/`rebind`/`alias`/`aliases`/`exec`/`action`/`echo`/`reset`/`toggle`/`incrementvar`; `hotkey_*` ABI reimplemented over the table; `binds.cfg` at start, `autoexec.cfg` when running. | loader `console.rs` (split into two files to stay < 1000 lines), `state.rs` | 700 |
| 4 | Command buffer drained by the input thread; completion handles with timeout; inline execution when nested; `wait`. | loader `buffer.rs`, `win/mod.rs` | 300 |
| 5 | `+`/`-` binds, `on_hotkey_release`, mouse buttons, CS-style key name aliases. | core `keys.rs`, loader, api, sdk | 250 |
| 6 | `SettingFlags::SECRET`, redacted echo/log/enumerate, password field in tsw-ui. | api, core, loader, tsw-ui | 250 |
| 7 | Source RCON codec (pure, in core or its own crate; search crates.io first per coding-dev §3) and the listener: auth, limits, bans, audit log, settings. | core `rcon.rs`, loader `win/rcon.rs` | 600 |
| 8 | Conflict reporting: `keys_reserve`, `loader.toml game_keys`, warnings; tsw-sdk reports TSW's live mappings. | api, loader, tsw-sdk | 300 |
| 9 | tsw-ui Binds screen, completion, echo toasts. | tsw-sdk `tsw-ui` | 400 |
| 10 | Optional: `input_event` (wheel) via overlay subclass; XInput gamepad; game-thread tick source; WebSocket front end; `dayz-ctl --rcon`. | various | each 150-400 |

Steps 1-3 deliver the owner's console/bind request; 4-5 make it Source-like; 6-7 deliver RCON;
8-9 are polish. RCON (7) depends on 4 (buffer) and 6 (secrets) and must not land before them.

## 13. Test strategy

- **Parser (step 1)**, table-driven unit tests: quotes, `\"` and `\\`, Windows paths, `;` inside and
  outside quotes, `//` inside quotes, empty commands (`a;;b`), unterminated quote (error with
  column), size and depth limits, CS-style uppercase, the owner's two examples verbatim, and a
  round-trip test that quoting then splitting any argument list gives it back (a property test if
  the workspace accepts `proptest` as a dev-dependency).
- **Binds (2-3)**: layer merging, unbind of a default persisted as `rebind x none`, plugin default
  changing between runs while the user's removal survives, shadowing order, `binds reset`,
  migration from a real `hotkeys.toml`, `binds.cfg` written then re-read gives the same table,
  alias recursion limit, `exec` refusing `..` and absolute names.
- **Buffer (4)**: ordering across sources, `wait` deferral with a fake clock, nested
  `console_exec` from a plugin command does not deadlock, capture timeout.
- **Edges (5)**: `+`/`-` with the existing fake `KeyState`; release after modifier released first.
- **Secrets (6)**: no log line, scrollback line, enumerate result or audit entry contains a set
  password (assert on captured output).
- **RCON (7)**: codec unit tests against byte vectors taken from the Valve wiki examples;
  an in-process client test (std `TcpStream` on an ephemeral loopback port, no game) covering auth
  ok, auth fail answering `-1`, ban after 3 failures, multi-packet output > 4096 bytes with the
  empty-packet end marker, oversized packet closing the connection, and command-before-auth
  closing it. One manual interoperability check with `mcrcon` or `rcon-cli` against the smoke
  test in the Windows VM (`smoke.sh --vm`), no game launch needed.
- **In game**: by code per the standing rules: drive binds through `console_exec` and the dev API,
  check `binds` output, the log and `binds.cfg`; one real key press check per release.

## 14. Owner decisions

1. **RCON port**: 27015 (what tools assume; collides with Source games and some servers) or a
   uniloader-specific default such as 48622 next to the debug socket.
2. **May RCON change its own `rcon_*` settings?** Proposal: no.
3. **Passwordless loopback?** dayz-ctl and `/dev/console` work without a password today.
   Proposal: RCON always requires a password, even on loopback; the existing doors stay as they are.
4. **`wait` and the command buffer**: wanted (Source-like, serialises everything), or keep
   "runs on the calling thread" and skip `wait`? Proposal: buffer.
5. **Default for two plugins suggesting the same chord**: first one wins and the other is shadowed
   (proposal), or both run (today's behaviour).
6. **`hotkeys.toml` migration**: convert into `binds.cfg` (proposal), or keep both files.
7. **Gamepad binds and the game-thread tick source**: in scope now or later (proposal: later).
8. **The `exec` word**: in Source it runs cfg files, but the owner's example uses it to run a
   command. Keep Source meaning (proposal) or make `exec` fall back to running a command when no
   cfg of that name exists.
