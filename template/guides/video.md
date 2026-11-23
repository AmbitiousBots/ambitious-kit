# Make a video with Ambitious Video

This is reference text for the `ambitious-video-for-bots` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one. Where this text says "this skill", it means that skill.

Use the installed `ambitious-video` binary in `/workspace/ambitious/bin`. It needs Python 3.13, with ffmpeg and Pillow for rendering; the `ambitious-module-installer` sync and the module's `selfcheck` report what is missing in `data.problems` and `data.tools`. If something is missing, tell the owner and stop; do not install software unasked.
A video is described by a script: JSON or YAML naming clips on tracks, such as screen recordings, title cards, still images, captions, voiceover, speech, generated scenes, lip-sync and cuts. Write the script with the owner, save it beside the media files it names, and pass it with `--in`; paths in a script are relative to the script's directory. Keep scripts and media out of `/home/box/agent-data`.

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
Pass `--offline` to `plan`, `estimate` and `render`: that calls no provider and needs no key. A `speech` clip is then captions only, a generated scene shows its fallback clip, and lip-sync shows the presenter as it is or a drawn mouth. Each such step is marked with `fallback` and costs 0.
A `voiceover` clip is captions only. To have a line spoken, use a `speech` clip that names a provider, a model and a voice. `xai-speech` uses `XAI_API_KEY`. `elevenlabs-speech` uses `ELEVENLABS_API_KEY`. A `lip_sync` clip uses `SYNC_API_KEY`. Omit `--offline`, which sends the clip text or media to that provider, only when this bot's instructions allow a module to call an outside provider, the owner asked for that paid step, and the owner supplied that provider's key in the environment. Under instructions that let nothing leave the computer except through the Ambitious connection, keep `--offline` and tell the owner why. Never write a key to a file, a script, a Page or a log.
Retry a failed render with its `jobId`, not as a new job, so the cost is not recorded twice. `E_JOB_STATE` means the job cannot be retried: read `jobs`. `E_PENDING` means a scene or lip-sync step is not ready yet: retry the same `jobId` later, and nothing is sent twice. `E_BUDGET` means the steps that are not in the step cache cost more than the cap, and nothing was sent. Call a video finished only after `verify` passes; `E_VERIFY` lists the failed checks in `data.checks`.

Script problems name their fix: `E_UNKNOWN_STEP` for an unknown clip type, `E_OVERLAP` for two clips overlapping on one track, `E_MEDIA` for a missing file or a time outside it, `E_RANGE` for a cut off a clip boundary or a video longer than 1800 seconds, `E_TOOL` for missing ffmpeg or Pillow, and `E_PROVIDER` when a provider refused the call. Use `--resend` only when retries keep failing with `E_PROVIDER`: it sends the step again, and the provider may charge for the earlier request as well.
The rendered file stays on this computer. Tell the owner where it is; do not upload or send it anywhere. Read the envelope and exit code after every command, and relay `errors[].message` and `errors[].hint` on failure.
