---
name: sdk-guide-manifest
description: >-
  Planned guide to plugin.toml, the tsw-sdk plugin manifest. Not written yet; links to the design sections that define it.
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# The manifest (`plugin.toml`)

> [!NOTE]
> **Planned.** tsw-sdk is a proposal; this guide is written once the SDK exists. Until then see
> the [design](../../design/tsw-sdk.md).

Will cover, as the design defines it:

- the fields and an example manifest ([2.3](../../design/tsw-sdk.md#23-manifest-plugintoml))
- where a plugin lives: `Win64/tsw/plugins/<id>/` ([2.2](../../design/tsw-sdk.md#22-folder-layout-binarieswin64))
- load order, dependencies, conflicts, enabling and disabling, safe mode
  ([2.4](../../design/tsw-sdk.md#24-load-order-enable-and-disable))
- the `sdk` and `game` version requirements ([3.4](../../design/tsw-sdk.md#34-versioning-and-compatibility))
