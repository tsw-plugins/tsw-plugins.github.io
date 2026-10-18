---
name: plugin-tsw-coop
description: >-
  tsw-coop, co-op multiplayer for Train Sim World 7: what it is, its state, and the index of its documents (concept, features, protocol, architecture, roadmap) and the session browser.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-18T11:57+0200
last_edited: 2026-10-18T11:57+0200
---

# tsw-coop

A host runs a normal TSW 7 scenario, opens a private lobby and hands out a join code; friends
join *that* world as walking passengers who can explore the route, ride trains, and drive the
host's train whenever the seat is free. The host's simulation is the only truth.

**State: in development.** The game-side mod is a pure-Rust `dwmapi.dll`
([`mod/native`](https://github.com/tsw-plugins/tsw-coop/tree/main/mod/native)); the relay and
master servers are in
[`server/`](https://github.com/tsw-plugins/tsw-coop/tree/main/server). Once
[tsw-sdk](../tsw-sdk.md) exists, tsw-coop becomes a plugin of it. Installing: [install.md](../../install.md).

- **[Session browser](sessions/):** public sessions listed by the master, and a live map per session.

## Documents

| Document | What it covers |
| --- | --- |
| [Concept](../../design/tsw-coop-concept.md) | Scope decisions: host-owned world, walking guests, driver handover, relay transport, entitlements, anticheat (was `08-concept.md`) |
| [features.md](features.md) | Every feature asked for or decided on, and where each stands |
| [protocol.md](protocol.md) | Relay wire protocol v0, as implemented (was `07-protocol.md`) |
| [protocol-v1-draft.md](protocol-v1-draft.md) | Protocol v1, a draft for review, not implemented (was `09-protocol-v1-draft.md`) |
| [architecture.md](architecture.md) | The original layered design: loader, state capture, netcode, ghost trains, signalling (was `03-architecture.md`) |
| [roadmap.md](roadmap.md) | Milestones and open questions, superseded in part by the concept (was `04-roadmap.md`) |

Research behind it is in [research/](../../research/), in particular
[session-discovery.md](../../research/session-discovery.md),
[remote-driving.md](../../research/remote-driving.md),
[ghosts-native.md](../../research/ghosts-native.md) and
[hosted-session-test.md](../../research/hosted-session-test.md).
