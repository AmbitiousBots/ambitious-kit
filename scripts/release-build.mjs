#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const USAGE = `Usage: node scripts/release-build.mjs [output directory]

Builds every file of a kit release into the output directory (default:
release/ at the repository root, which git ignores):

  ambitious-kit-<version>.tgz        @ambitious/kit, compiled to JavaScript with type declarations
  ambitious-lint-<version>.tgz       @ambitious/lint, compiled the same way
  ambitious-depcruise-<version>.tgz  @ambitious/depcruise, compiled the same way
  ambitious_kit-<version>.pyz        the Python kit; import it from a module, or run it to contract-test a binary
  ambitious-hello-<version>.mjs      the example module, one bundled file
  ambitious-install-<version>.mjs    the installer, one bundled file
  SHA256SUMS                         the SHA-256 of every file above

The version is the "version" in the root package.json, and every package
must carry the same one. Needs the pinned tools: run "mise trust && mise
install" and "npm ci" first.
`;

const repoRoot = join(import.meta.dirname, "..");
const PACKAGES = ["kit", "lint", "depcruise"];
const NOT_PACKED = new Set(["node_modules", "test", "spec", "scripts", "dist", "src"]);

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], ...options });

const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const compiledExport = (target) =>
  typeof target === "string" && target.endsWith(".ts")
    ? { types: target.replace(/\.ts$/, ".d.ts"), default: target.replace(/\.ts$/, ".js") }
    : target;

const compiledManifest = ({ private: _private, ...manifest }) => ({
  ...manifest,
  exports:
    typeof manifest.exports === "string"
      ? { ".": compiledExport(manifest.exports) }
      : Object.fromEntries(Object.entries(manifest.exports).map(([subpath, target]) => [subpath, compiledExport(target)])),
});

const packPackage = (name, version, scratch, output) => {
  const source = join(repoRoot, "packages", name);
  const stage = join(scratch, name);
  mkdirSync(stage);
  for (const entry of readdirSync(source)) {
    if (!NOT_PACKED.has(entry)) cpSync(join(source, entry), join(stage, entry), { recursive: true });
  }
  cpSync(join(repoRoot, "LICENSE"), join(stage, "LICENSE"));
  cpSync(join(repoRoot, "NOTICE"), join(stage, "NOTICE"));
  const manifest = readJson(join(source, "package.json"));
  if (manifest.version !== version) {
    throw new Error(`packages/${name}/package.json is version ${manifest.version}, but the release is ${version}. Give every package the same version.`);
  }
  writeFileSync(join(stage, "package.json"), `${JSON.stringify(compiledManifest(manifest), null, 2)}\n`);
  for (const bin of existsSync(join(stage, "bin")) ? readdirSync(join(stage, "bin")) : []) {
    const path = join(stage, "bin", bin);
    writeFileSync(path, readFileSync(path, "utf8").replace(/(from "\.\.\/src\/[^"]+)\.ts"/g, '$1.js"'));
  }
  const tsconfig = join(scratch, `tsconfig.${name}.json`);
  writeFileSync(
    tsconfig,
    JSON.stringify({
      extends: join(repoRoot, "tsconfig.json"),
      compilerOptions: {
        noEmit: false,
        declaration: true,
        rewriteRelativeImportExtensions: true,
        rootDir: join(source, "src"),
        outDir: join(stage, "src"),
        typeRoots: [join(repoRoot, "node_modules", "@types")],
      },
      include: [join(source, "src")],
      exclude: [],
    }),
  );
  run(join(repoRoot, "node_modules", ".bin", "tsc"), ["--project", tsconfig]);
  const [{ filename }] = JSON.parse(run("npm", ["pack", "--json", "--pack-destination", output], { cwd: stage }));
  return filename;
};

const build = (output) => {
  const { version } = readJson(join(repoRoot, "package.json"));
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), "ambitious-release-"));
  try {
    run("npm", ["run", "--silent", "build"]);
    cpSync(join(repoRoot, "examples", "hello", "dist", "ambitious-hello.mjs"), join(output, `ambitious-hello-${version}.mjs`));
    cpSync(join(repoRoot, "packages", "kit", "dist", "ambitious-install.mjs"), join(output, `ambitious-install-${version}.mjs`));
    for (const name of PACKAGES) packPackage(name, version, scratch, output);
    run(process.execPath, [
      join(repoRoot, "scripts", "with-pinned-tools.mjs"),
      "python3",
      "-c",
      "import sys; from pathlib import Path; import ambitious_kit; from ambitious_kit.build import build_zipapp; " +
        "build_zipapp(Path(sys.argv[1]), [Path(ambitious_kit.__file__).resolve().parent], 'ambitious_kit.cli.contract_main:contract_main')",
      join(output, `ambitious_kit-${version}.pyz`),
    ]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  const files = readdirSync(output).sort();
  writeFileSync(join(output, "SHA256SUMS"), files.map((file) => `${sha256(join(output, file))}  ${file}\n`).join(""));
  process.stdout.write(`Release ${version} built in ${output}:\n${readFileSync(join(output, "SHA256SUMS"), "utf8")}`);
};

const [argument, ...extra] = process.argv.slice(2);
if (argument === "--help" || extra.length > 0 || argument?.startsWith("--")) {
  (argument === "--help" ? process.stdout : process.stderr).write(USAGE);
  process.exitCode = argument === "--help" ? 0 : 2;
} else {
  try {
    build(resolve(argument ?? join(repoRoot, "release")));
  } catch (error) {
    process.stderr.write(`release build failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
