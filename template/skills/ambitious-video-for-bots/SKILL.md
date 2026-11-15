---
name: ambitious-video-for-bots
description: For the Ambitious Bot only. Plan, price, render and check a video from a declarative script with the Ambitious Video CLI. Use when the owner asks the Ambitious Bot for a video made from screen recordings, title cards, stills, captions or voiceover, or asks what such a video would cost.
---

# Make a video with Ambitious Video

Use the installed `ambitious-video` binary in `/workspace/ambitious/bin`. It needs Python 3.13, with ffmpeg and Pillow for rendering; the `ambitious-module-installer` sync and the module's `selfcheck` report what is missing in `data.problems` and `data.tools`. If something is missing, tell the owner and stop; do not install software unasked.
A video is described by a script: JSON or YAML naming clips on tracks, such as screen recordings, title cards, still images, captions, voiceover and cuts. Write the script with the owner, save it beside the media files it names, and pass it with `--in`; paths in a script are relative to the script's directory. Keep scripts and media out of `/home/box/agent-data`.

Work in this order, and show the owner each result before the next step.

| Step | Command | What it returns |
| --- | --- | --- |
| 1 | `validate` | Whether the script is usable, its duration, and any problems. |
| 2 | `plan` | The ordered steps and the media files the script names. |
| 3 | `estimate` | A dry-run price. No provider is called. |
| 4 | `render` | Renders the script and records a job. With only `jobId`, retries that failed or abandoned job. |
| 5 | `verify` | Checks the rendered job's duration, resolution, audio, and title and cut frames. |
| Any time | `jobs`, `ledger` | The jobs so far, and the recorded cost lines. |

Always run `estimate` and get the owner's go-ahead on the price before `render`. Quote costs only from `estimate` and `ledger`; never work out a price yourself.
A script with `voice` set makes a keyed speech call during `render`, which sends the voiceover text to the speech provider. Do that only when the owner asked for spoken voiceover and has supplied `XAI_API_KEY` in the environment for that call. Never write the key to a file, a script, a Page or a log. Without `voice`, voiceover clips are captions only and nothing leaves the computer; `E_NO_KEY` means a voice was set without a key.
Retry a failed render with its `jobId`, not as a new job, so the cost is not recorded twice. `E_JOB_STATE` means the job cannot be retried: read `jobs`. Call a video finished only after `verify` passes; `E_VERIFY` lists the failed checks in `data.checks`.

Script problems name their fix: `E_UNKNOWN_STEP` for an unknown clip type, `E_OVERLAP` for two clips overlapping on one track, `E_MEDIA` for a missing file or a time outside it, `E_RANGE` for a cut off a clip boundary or a video longer than 1800 seconds, `E_TOOL` for missing ffmpeg or Pillow, and `E_SPEECH` when the speech service refused the call.
The rendered file stays on this computer. Tell the owner where it is; do not upload or send it anywhere. Read the envelope and exit code after every command, and relay `errors[].message` and `errors[].hint` on failure.
