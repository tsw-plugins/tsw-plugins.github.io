---
name: signaller-red-exit-signal
description: >-
  Why tsw-autopilot waited 2.5 hours at Wiesbaden Hbf's red exit signal (FSN RB75-28701, runs 27 and 29), how TSW 7 lets a driver contact the signaller (cab radio BP_SimpleRadio, the HUD's "Request pass signal", ADispatcher::RequestPassSignalAtDanger and its 18 answers), what the autopilot now does about it, and the two follow-on faults of run 29: the train crept into the PZB 2000 Hz magnet as its brake leaked off, and readying left the Dosto cab car's traction latched.
game_build: 886 (TSW 7, Steam build 25890949)
created: 2026-10-22T20:10+0200
last_edited: 2026-10-22T20:10+0200
---

# A red exit signal and the signaller (2026-10-22)

Question from tsw-autopilot: in FSN timetable service RB75-28701 (Dosto cab car `766pbzfa`
leading, Wiesbaden Hbf Bstg 3, departure 05:38) the stop completed at 05:38, the current
instruction became "GoTo Mainz Hbf Pl 4", the autopilot closed the doors, drove up the
platform and stopped 24 m before the exit signal, which showed Stop. It then stood for 2.5 real
hours at game speed 2x and the signal never cleared (runs 27 and 29, identical). Why, and what
would a driver do?

Sources: the loader log of run 29 (`uniloader/logs/loader.log`, 09:26 to 12:07 UTC; run 27's
log is gone, `loader.prev.log` holds a later run), the kdecomp mirror
(`/run/media/system/Data/tsw-decomp/index/text/tsw7/`, found with `tswdump`) and the Ghidra
export and reflection lists of the TSW 7 binary (`/var/mnt/nas/gamedumps/tsw7/binary/`).
Markers: **[log]** seen in the run's log, **[decomp]** read in decompiled blueprints or data,
**[binary]** in the native code or its strings, **[inferred]**.

## Summary

1. **No action was missing.** TSW has no "ready to depart" request for a timetable service:
   the dispatcher sets routes for the player's service from its path, as for AI services.
   The stop had completed with the doors locked [log]; the native `ADispatcher` has only five
   callable functions (level crossings, `RequestEnterDispatchedNetwork`,
   `RequestPassSignalAtDanger`), and no blueprint calls `RequestEnterDispatchedNetwork`
   [binary, decomp]. The "ReadyToDepart" names in the routes are training-scenario waits with
   a voice-over, not a signal request [decomp].
2. **The dispatcher could not or would not set the route.** Five game hours at a stand outlast
   any ordinary occupation of the line by the timetable's own trains, so the route was
   blocked for good: a stuck or deadlocked AI move at the terminus throat, or no usable path
   for the service [inferred]. The shipping build writes no game log, so
   `ts2.dbg.LogDispatcherServiceStatus` (it exists [binary]) shows nothing; the signaller's
   answer is the only place the game says which it was.
3. **What a driver does: contact the signaller.** TSW 7 lets every player ask for permission
   to pass a signal at danger, by the cab radio or the HUD's shortcut menu. Granted, the train
   passes on sight. The autopilot now does this (below).
4. Run 29's **protection emergency brake** at 12:06 was PZB's 2000 Hz forced brake: the train
   crept 21 m into the signal's magnet while its automatic brake leaked off.
5. Readying after it ended with **"traction stays latched until Throttle clears"**: readying put
   the cab car's Throttle at 0.0, which is what latches that lock. Fixed in tsw-sdk.

## 1. Run 29, step by step [log]

| UTC | What |
| :--- | :--- |
| 09:27:40 | Autopilot on, boarding at Wiesbaden Hbf ("FAHRGÄSTE EINSTEIGEN LASSEN"), signal Stop 170 m ahead |
| 09:28:01 | Stop complete, target 21 km/h, next Mainz Hbf; the train closes up |
| 09:28:36 | Stands 24 m before the signal, train brake 0.70, gauge 1 = 5.04/3.18 bar (pipe/cylinder, absolute) |
| 09:28 to 11:24 | Signal Stop 24 m all along; the cylinder needle falls from 3.57 to 1.01 bar (0 bar gauge), the pipe stays at 5.02 |
| 11:24 to 12:06 | With no cylinder pressure left the train creeps: 23 m, 22 m ... 3 m, about 1 m every 33 s at "0 km/h" |
| 12:06:32 | `protection emergency brake: true`; the train does not go: Emergency |
| 12:06:32 | Readying: `Throttle set 0.00`, breaker, train brake held down, `PZB_Release` pressed |
| 12:06:50 | "Autopilot could not ready the train: traction stays latched until Throttle clears." |

The signal was at danger from the first status line, during boarding, and never changed.

## 2. The timetable data [decomp]

`S-bahnTimetable` (FrankfurtSBahn_Route_Gameplay), service `RB75-28701`: formation
`RB75-28700_End` (the train of the inbound service, driven from its other end,
`PlayerDrivableSide=Back`), start 05:36, `bIsAIConductorResponsibleForDoors=True`,
`SignallingContext=Mainline`. Instructions:

| # | Type | Where | Times | Notes |
| :--- | :--- | :--- | :--- | :--- |
| 0 | LoadUnload | Wiesbaden Hbf | departure 05:38 | doors right, `bLockDoorsToComplete`, `bDispatchBeyondStop` |
| 1 | GoTo | Mainz Hbf Pl 4 | | `bDispatchBeyondStop` |
| 2 | LoadUnload | Mainz Hbf | 05:48 to 05:49 | |
| 3 | GoTo | Mainz Römisches Theater Pl 3 | | |
| 4 | LoadUnload | | 05:52 to 05:52:30 | |
| 5 | GoTo | Mainz-Bischofsheim Pl 2 | | |
| 6 | LoadUnload | | 05:57 | |

The service's path is built at run time (`PathingStatus=Undefined`, empty `ServicePath` in the
asset). Nothing in the definition waits for a player action other than the stop itself.
`bDispatchBeyondStop` lets the dispatcher set the route past the stop before it completes, so
a free route would have shown proceed during boarding already.

## 3. Contacting the signaller

### The dispatcher call [decomp, binary]

`ADispatcher::RequestPassSignalAtDanger(FName ServiceName) -> bool` (exec at `0x139eed0`, impl
`0x110fc30`). It finds the service's current signal, returns `false` when there is none, and
otherwise queues the request and returns `true`. The answer comes later through the
multicast `RequestPassAtDangerCallbackDelegate(ServiceName, FSignalPropertyReference,
EPassAtDangerResponse)`. A granted service is kept in the AI dispatchers'
`ActivePassAtDangerAllowedServices` (tsw-sdk `dispatcher.rs`).

`EPassAtDangerResponse`, from `BP_SimpleRadio_C::GetResponseText` and its HUD texts:

| Value | Meaning | HUD text |
| :--- | :--- | :--- |
| 0 | NotImplemented | Denied request pass signal |
| 1 | SignalNotAtDanger | Request pass signal: proceed |
| 2 | SignalBroken, route clear, proceed with caution | Request pass signal: proceed restricted |
| 3 | WaitForSignal | Denied (wait signal) |
| 4 | SetManualJunctions | Denied (junctions) |
| 5 | **PassAtDangerCallOn** (granted) | Request pass signal: proceed restricted |
| 6 | NoActiveRouteAhead | Denied (no route) |
| 7 | SignalNotNextSignal | Denied (off path) |
| 8 | RefusedNotConsistOperation | Denied (wait signal) |
| 9 | NoRequiredRailVehiclesInBlock | Denied (wait signal) |
| 10 | RefusedRouteAheadOccupied | Denied (train ahead) |
| 11 | WaitingForApproachReleaseStart | Denied (too far) |
| 12 | WaitingForApproachReleaseEnd | Denied (wait signal) |
| 13 to 16 | Service / service definition / formation not found, formation empty | Denied (service) |
| 17 | SignalNotFound | Denied (no route) |

FSN scenario A completes its "contact the signaller" step on answer 5 for `PlayerService`
(`FSN_ScA_Objectives::CheckSignal`). Answer 11 means the train is too far from the signal:
closing up to it first, as the autopilot does, is what the game wants.

### Two ways in [decomp]

- **The cab radio** `BP_SimpleRadio_C` (Core, `RailVehicles/RVM/Radio`), a component of 27
  trains (all Dosto cab cars, BR 143, 146, 185, 411, 423, 430, 442, 114, 103, 110, Vectron,
  Class 66, SD40-2 and more). The FSN Dosto cab car's `ContactSignaller` push button calls
  `SimpleRadio.ContactSignaller()`. That finds its vehicle's service
  (`RouteTimetable::FindServiceNameForRailVehicleActor`), stores it in `ServiceName`, binds
  `HandleRequestPassAtDangerCallback` and calls the dispatcher; on a `false` it unbinds and
  clears `ServiceName` at once. The handler shows the answer text on the HUD
  (`TS2GameHUDWidget::ShowSignalResponse`) and sets `ServiceName` back to `None`. So
  `ServiceName` set means a call is open.
- **The HUD shortcut menu** (`TrainInteractionShortcut`, "Request pass signal", any train,
  also `GamepadRequestPassSignalAtDanger`): `ATS2PrototypePlayerController::
  RequestPassSignalAtDanger()`; the answer comes back by `RequestPassSignalAtDangerResponse`.

The console has `ts2.dispatcher.RequestPassSignalAtDanger` and
`ts2.signals.SetPassRequestStatus` too [binary].

### PZB "Befehl" [decomp]

Permission does not switch off the train's PZB: the 2000 Hz magnet at the signal still forces
a brake. The driver holds "Befehl" while passing it: the Dosto cab car has `PZB_Override`
(`_L`, `_R`), which calls `PZB_Service_V3.PZB_Override(pressed)`. Under PZB 90 the train is
then held to 40 km/h, the speed of on-sight running under a Zs 1 or a written order.

## 4. What tsw-sdk and tsw-autopilot do now

- **tsw-sdk** `signaller.rs`: `Signaller::contact(controller, drivable)` calls the driven
  vehicle's radio (`ContactSignaller` on the first component whose class has it and a
  `ServiceName`), else the controller's HUD request; it returns the channel used.
  `Signaller::answer(channel, dispatcher, world, service)` is `Granted` when the dispatcher
  lists the service, `Refused` when the radio's call closed without that, else `Pending` (the
  HUD request's answer is not readable). `Family::ProtectionOverride` finds `PZB_Override`.
- **tsw-autopilot** `control/signaller.rs` (pure, unit-tested) and `pilot/signaller.rs`:
  - standing at a signal at danger within 400 m, not held by the stop, through the scheduled
    departure of the stop just served: call `autopilot.signaller_after_s` (default 180 s game
    time) after that departure; anywhere else after standing `autopilot.signaller_stand_s`
    (default 300 s); at least 20 s of standing first;
  - a call unanswered for 30 s, or refused, is made again after the stand setting;
  - granted (its own call or a scenario's): the signal is passed at caution, every limit is
    held to 40 km/h, PZB "Befehl" is held from 30 m before the signal until 5 m past it, and
    on-sight running ends at the next signal (or after 3 km when none shows);
  - every step is logged (`autopilot: stood ... contacting the signaller`, `called the
    signaller by the cab radio`, `the signaller refused`, `allows passing ... on sight`,
    `protection override (PZB Befehl) held`, `passed the signal at danger`, `on-sight running
    ends`) and the player gets a toast for the call, a refusal and the permission.

## 5. The protection emergency brake of run 29 [log, inferred]

Not the Sifa (it is not active at a stand) and not a PZB monitoring: the train had crept to 3 m
from the signal, onto its 2000 Hz magnet, which brakes any train passing a signal at danger.
It crept because its brake leaked off: the train brake handle stayed at 0.70 with the pipe at
5.02 bar absolute (about 1 bar reduction) while the cylinder needle fell from 3.57 to 1.01 bar
absolute between 09:43 and 11:24. On the slope towards the signal the train then rolled about
1 m every 33 s, too slow for the speedometer's 0 km/h. A driver standing this long holds the
train with the direct brake (Zusatzbremse) or renews the application. With the signaller called
after 3 minutes this stand does not recur here; holding a long stand is a separate task
(`tasks/todo.md`).

## 6. The latched cab-car lock [decomp, log]

The Dosto cab car's `LocomotiveConditionManager` has one release condition, `Throttle`, set
while the Throttle is at 0.0 (off, output −1); at 0.1 the Throttle is on at zero force and the
lock lets go ([fsn-push-pull-traction.md](fsn-push-pull-traction.md)). After the PZB brake
readying set the Throttle to 0.0 for the breaker step (`neutral` of a plain throttle is its low
end), which latched the lock, and its `unlatch` handled only combined handles (BR 430
`RC_ThrottleIdle`). So readying gave up. `Ready::unlatch` now also lifts a non-combined power
handle to 0.1 of its range when the latching release condition is named after it, here
`Throttle` at 0.1. The BR 430's path is unchanged.

## What to check in game

1. RB75-28701 again: around 05:41 the log shows the call and its channel ("the cab radio"),
   the HUD shows the answer text. If granted: "Befehl" held, the train passes at 40 km/h or
   less, no PZB brake, on-sight ends at the next signal. If refused, the HUD text says why
   (train ahead, no route, too far): write it here, it is the dispatcher's reason for the red
   signal.
2. A forced PZB brake at a stand followed by readying: readying ends "ready" with the Throttle
   at 0.1, not latched.
