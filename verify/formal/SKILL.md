---
name: verify-ambitious-kit-formal
description: Model-check the parts of the Ambitious kit where the order of steps matters and a mistake would cost the most, chiefly the installer, with TLA+ and the TLC model checker. Use when a change touches packages/kit/src/install/, the example module's write path, or any file under a spec/ directory.
---

# Formal verification of the kit

A test checks the cases someone wrote. A model check tries every order of steps in a small model of the design. The kit uses it where a wrong order harms the person relying on a bot: installing a binary that runs on every start.

One command checks every model:

```text
npm run tlc
```

It needs the pinned tools (`mise trust && mise install`): Java, and `tla2tools.jar`, the TLA+ tools, pinned by address and SHA-256 in `.mise.toml`. It takes well under a minute. It prints one table per spec directory and exits non-zero when a model fails or a broken variant is not caught.

## What is covered

Last confirmed in step with the code at commit `44512904db82e603a57e327e3299765e42f5672c`. Move this commit forward only after you have read the covered code at the new commit and confirmed that the model still describes it.

| Model | Covers | Each model step is this code |
|---|---|---|
| `packages/kit/spec/Install.tla` | `install` in `packages/kit/src/install/install.ts` | `AlreadyInstalled`: the early return when the installed file matches its recorded checksum (it only switches the link). `Download`: the two `fetched` calls, into memory. `RejectBadChecksum`: the `E_INSTALL_CHECKSUM` failures, before anything is written. `Place`: the first `placeByRename`, one rename of the verified bytes. `Record`: the second `placeByRename`, for `SHA256SUMS`. `SwitchLink`: `switchLink`, one rename of a new symbolic link. `Crash`: the process stopping between any two of those. `Damage`: something outside the installer corrupting an installed file. |
| `examples/hello/spec/Greetings.tla` | `greet` and `list` in `examples/hello/src/cli/main.ts` with `examples/hello/src/db/greetings.ts` | `Greet`: one `INSERT`, inside the single transaction the kit wraps around a write command. `List`: the read-only `SELECT`. |
| `spec/Sample.tla` | Nothing in the kit. It is the starting example every module repository gets. | |

## The properties, in plain words

| Invariant | Promise | Harm if it broke |
|---|---|---|
| `OnlyVerifiedAssetsInPlace` | The installer never puts a file in `bin` whose SHA-256 it did not match against `SHA256SUMS`. | A damaged or swapped download would run as the module on the next start. |
| `LinkNeverDangles` | The link `ambitious-<module>` never points at a file that is not there, also if the installer is stopped at any moment. | The bot's next start would fail to run the module at all. |
| `RecordedMeansInstalled` | A checksum line in `bin/SHA256SUMS` always has its file. | A later install would trust a record for a file that does not exist. |
| `NothingLost`, `OldestFirst` | `list` shows every greeting that `greet` accepted, in the order they were made. | Stored data would silently disappear or reorder. |

Bounds and assumptions: two versions of one module; a download is either exactly the published bytes or not; a rename is atomic; one installer runs at a time. The model does not cover two installers racing, a full disk, or whether `SHA256SUMS` itself is genuine: the installer checks that the asset matches the checksum file it was given, not who published it.

## Each property has been seen to fail

`packages/kit/spec/broken/` and `examples/hello/spec/broken/` hold copies of the models with one protection removed, and `broken/EXPECTED.json` names the invariant each must break and why. `npm run tlc` fails if a broken variant passes or breaks a different invariant. Each broken variant differs from its model only by the protection it removes, so a pass of the model and a failure of the variant together show that this protection is what keeps the promise.

| Broken variant | Protection removed | Must break |
|---|---|---|
| `InstallNoVerify` | The checksum comparison before `Place` | `OnlyVerifiedAssetsInPlace` |
| `InstallLinkFirst` | The order: the link is switched before the file is placed | `LinkNeverDangles` |
| `GreetingsOverwrite` | `greet` replaces the stored greetings instead of adding one | `NothingLost` |

## When you change covered code

1. Decide whether the change alters a step in the table above: a new write to `bin`, a different order, a new way to fail. If it does not, run `npm run tlc` and you are done.
2. If it does, change the model first so it describes the new design, run `npm run tlc`, then change the code to match.
3. If TLC reports a violation, read it with the pstack `/statechart` skill (pstack is a public plugin of agent skills; `/statechart` turns TLC output into the shortest failing path in plain words, and draws the state chart when the check passes). Retell the path in the code's terms, for example "the link was switched, the process stopped, the file was never placed".
4. Decide which is wrong. If the path can happen in the code, it is a real bug: fix the code, keep the property. If the path cannot happen in the code, the model is wrong: fix the model so it matches the code, and say in the pull request what was wrong with it. Never weaken or delete an invariant to get a pass.
5. For a new protection, add a broken variant that removes only that protection, with its entry in `EXPECTED.json`.
6. Update the coverage table and the sync commit above.
