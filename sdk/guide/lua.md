---
name: sdk-guide-lua
description: >-
  Planned guide to writing a Lua plugin for tsw-sdk. Not written yet; links to the design sections that define it.
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# Lua plugins

> [!NOTE]
> **Planned.** tsw-sdk is a proposal; this guide is written once the SDK exists. Until then see
> the [design](../../design/tsw-sdk.md).

Will cover, as the design defines it:

- Lua 5.4 embedded in the SDK, one state per plugin, on the game thread
  ([4.1](../../design/tsw-sdk.md#41-options))
- `plugin.toml` with `kind = "lua"` and `entry = "main.lua"`, the `tsw` module, objects as
  userdata ([4.2](../../design/tsw-sdk.md#42-lua-api-shape))
- editor support through `tsw/lua/tsw.d.lua`
- hot reload from the Plugins screen ([2.5](../../design/tsw-sdk.md#25-hot-reload))
- the worked example, tsw-jump in Lua ([7](../../design/tsw-sdk.md#7-example-tsw-jump-as-a-standalone-plugin))
