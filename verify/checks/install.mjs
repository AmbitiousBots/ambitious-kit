import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { must, repoRoot, sh } from "./scratch.mjs";

const home = process.env.AMBITIOUS_HOME;
const installer = join(repoRoot, "packages", "kit", "dist", "ambitious-install.mjs");
const release = mkdtempSync(join(tmpdir(), "ambitious-verify-release-"));
const asset = "ambitious-hello-0.1.0.mjs";
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const install = (version, from = release) => {
  const run = sh(process.execPath, [installer, "hello", version, "--from", from]);
  return { ...run, envelope: JSON.parse(run.stdout) };
};

try {
  cpSync(join(repoRoot, "examples", "hello", "dist", "ambitious-hello.mjs"), join(release, asset));
  writeFileSync(join(release, "SHA256SUMS"), `${sha256(join(release, asset))}  ${asset}\n`);

  const first = install("0.1.0");
  must(first.status === 0 && first.envelope.data.action === "installed", "the installer verifies the checksum and installs into $AMBITIOUS_HOME/bin");
  must(readlinkSync(join(home, "bin", "ambitious-hello")) === asset, "the link ambitious-hello points at the installed version");

  const selfcheck = sh(join(home, "bin", "ambitious-hello"), ["selfcheck", "--now", "2026-01-01T00:00:00Z", "--seed", "7"]);
  const checked = JSON.parse(selfcheck.stdout);
  must(selfcheck.status === 0 && checked.ok === true, "the installed binary runs through the link and its selfcheck is ok");
  must(checked.data.binary.sha256 === sha256(join(release, asset)), "selfcheck reports the checksum of the released asset");

  const again = install("0.1.0", join(release, "moved-away"));
  must(again.status === 0 && again.envelope.data.action === "unchanged", "installing the same version again changes nothing and downloads nothing");

  writeFileSync(join(release, "ambitious-hello-0.2.0.mjs"), "tampered\n");
  writeFileSync(join(release, "SHA256SUMS"), `${sha256(join(release, asset))}  ${asset}\n${"0".repeat(64)}  ambitious-hello-0.2.0.mjs\n`);
  const tampered = install("0.2.0");
  must(tampered.status === 1 && tampered.envelope.errors[0].code === "E_INSTALL_CHECKSUM", "a download whose checksum does not match is refused");
  must(readlinkSync(join(home, "bin", "ambitious-hello")) === asset, "after the refused download the link still points at the working version");
} finally {
  rmSync(release, { recursive: true, force: true });
}
