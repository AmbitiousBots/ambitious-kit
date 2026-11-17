---
name: ambitious-video-for-bots
description: For the Ambitious Bot only. Plan, price, render and check a video from a declarative script with the Ambitious Video CLI. Use when the owner asks the Ambitious Bot for a video made from screen recordings, title cards, stills, captions or voiceover, or asks what such a video would cost.
---

Template version: 0.4.0

# Make a video with Ambitious Video

Use the installed `ambitious-video` binary in `/workspace/ambitious/bin`. If its `selfcheck` reports something missing, tell the owner and stop; do not install software unasked.

Read how to write a script and the order of `validate`, `plan`, `estimate`, `render` and `verify`:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide video --json
```

If it is missing or answers `E_USAGE`, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- Always run `estimate` and get the owner's go-ahead on the price before `render`. Quote costs only from `estimate` and `ledger`; never work out a price yourself.
- Leave `voice` unset: voiceover clips are then captions only and nothing leaves the computer. Set `voice`, which sends the voiceover text to the speech provider, only when this bot's instructions allow a module to call an outside provider, the owner asked for spoken voiceover, and the owner supplied the key in the environment. Never write the key to a file, a script or a log.
- Keep scripts and media out of `/home/box/agent-data`. The rendered file stays on this computer: tell the owner where it is, and do not upload or send it anywhere.
