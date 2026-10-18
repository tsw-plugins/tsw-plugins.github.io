---
name: sdk-guide-rust
description: >-
  Planned guide to writing a Rust plugin for tsw-sdk. Not written yet; links to the design sections that define it.
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# Rust plugins

> [!NOTE]
> **Planned.** tsw-sdk is a proposal; this guide is written once the SDK exists. Until then see
> the [design](../../design/tsw-sdk.md).

Will cover, as the design defines it:

- the crates: `tsw-sdk-abi` (the contract) and `tsw-sdk` (the safe wrapper every plugin depends
  on) ([3.2 Crates](../../design/tsw-sdk.md#32-crates))
- a `cdylib` with the `Plugin` trait and `export_plugin!`, which embeds `plugin.toml`
  ([3.3](../../design/tsw-sdk.md#33-exports-and-tables-sketch))
- depending on the SDK by git tag, and a local `[patch]` for development
  ([8.1](../../design/tsw-sdk.md#81-repositories-githubcomtsw-plugins))
- panics, threads and the game-thread rule ([2.6](../../design/tsw-sdk.md#26-failure-isolation))
- the worked example, tsw-jump in Rust ([7.1](../../design/tsw-sdk.md#71-rust))
