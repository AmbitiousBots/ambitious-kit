# packages/kit/spec

A TLA+ model of the installer in `../src/install/install.ts`, checked by TLC with `npm run tlc` at the repository root.

`Install.tla` models one installer run as the steps the code takes (download into memory, compare the checksum, rename the file into place, record the checksum, switch the link), a crash between any two steps, and a file being damaged from outside. It checks that an unverified file is never put in place, that the link never points at a missing file, and that a recorded checksum always has its file.

`broken/InstallNoVerify` skips the checksum comparison and `broken/InstallLinkFirst` switches the link before the file is placed. TLC must catch each one breaking the invariant listed in `broken/EXPECTED.json`.

`verify/formal/SKILL.md` at the repository root maps every model step to the code, states the bounds, and says what to do when the installer changes.

`Runtime.tla` models `../src/install/runtime.ts`, the opt-in pinned runtime of a Python module: the lock is verified, the environment is built in a staging directory, marked, and renamed into place. It checks that the directory a module loads from is never half-built and that only a verified lock is ever built. `broken/RuntimeBuiltInPlace` builds in the final directory and `broken/RuntimeNoVerify` skips the lock's checksum comparison.
