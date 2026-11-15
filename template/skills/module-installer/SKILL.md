---
name: module-installer
description: Install checksum-pinned module releases and run their selfchecks on first chat and every routine start.
---

# Module installer

Read [the lock file](../../modules.lock.json) and validate it against [its schema](../../modules.lock.schema.json) before downloading or changing anything.
Each row has `module`, `version`, `url` and `sha256`. The module is the CLI suffix, such as `tasks`, and the version is an exact semantic version.
Reject repeated module names, unknown fields, non-HTTPS locations and any asset filename that differs from the module and version in the row.
The asset filename is `ambitious-` followed by the module, a hyphen, the version, then `.mjs` or `.pyz`.
Never resolve a moving release alias or edit the pins during a routine.

The shipped empty array is intentional. Report "No module releases are pinned. Installation and module selfchecks did not run."
Do not describe that result as a successful module health check or discover substitute downloads.

## Install a pinned release

1. Use `/workspace/ambitious/bin`, or `bin` under an explicitly configured `AMBITIOUS_HOME`. Refuse paths resolving into `/home/box/agent-data` before opening or creating anything. Use Node 24 for `.mjs` or Python 3.13 for `.pyz`; report a missing or wrong runtime instead of installing packages.
2. Check the installed versioned asset and the `ambitious-` module link. If the asset checksum matches the lock, skip the download. If the link and checksum record also match, make no installation writes. Repair only a missing or incorrect link or checksum record for that verified asset.
3. Otherwise download the exact asset URL and its sibling `SHA256SUMS` into unique temporary files inside `bin`. Keep transport requests free of account and business data. Require successful HTTPS downloads; do not execute downloaded bytes yet.
4. Compute SHA-256 locally. Require the result to match both the lock's `sha256` and the one checksum line naming that exact asset in `SHA256SUMS`. Reject missing, duplicate or conflicting entries. A downloaded checksum list alone cannot replace the lock's trusted digest.
5. Make the verified asset executable. Rename it into its versioned filename within `bin`. Stage the module link and local `SHA256SUMS` record in `bin`, then rename them into place. Keep checksum lines for other installed modules. Each replacement uses a rename within `bin`, never a partially written final file.
6. A different installed version stays beside the requested one until the requested asset is verified and the link switches. On a download or verification failure, remove only this run's temporary files, leave the existing asset, link and checksum record untouched, and report failure. Do not delete module databases or older versions.

Serialize installer runs on this computer so overlapping routines do not overwrite each other's link or checksum changes.
Rerunning after an interruption must converge on the pinned asset, link and checksum record. Repeat these checks after Update Bot's Computer.
Installation itself never opens, creates or changes a module database. Do not run package managers or install runtime dependencies.
Use only module skills supplied with the same pinned release through its documented, checksum-verified distribution. If those skills are unavailable, report the missing skills instead of copying instructions from a moving branch.

## Selfcheck and handoff

After installation, call `selfcheck --json` through each pinned module's link in `bin`, including modules whose installation was already current.
For example, a pinned tasks module is called as `/workspace/ambitious/bin/ambitious-tasks selfcheck --json`.
Selfcheck is separate from installation; it may create the module database and apply the module's pending forward migrations.
Check the exit status and envelope as required by [the bot instructions](../../INSTRUCTIONS.md).
Read the reported runtime version, binary checksum, database integrity result, schema version and `data.problems`.
Require the reported binary checksum to match the pin and `data.problems` to be empty before marking that module ready.
If a module fails, show its plain-language problem and next action. Continue checking independent modules, but do not start work that depends on a failed module.
If a command cannot start or its output is invalid, say what failed without inventing an envelope or a clean selfcheck.
