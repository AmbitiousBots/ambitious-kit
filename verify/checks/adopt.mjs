import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { must, repoRoot, sh } from "./scratch.mjs";

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const kit = readJson(join(repoRoot, "package.json"));
const hello = readJson(join(repoRoot, "examples", "hello", "package.json"));
const tarballs = ["kit", "lint", "depcruise"].map((name) => `ambitious-${name}-${kit.version}.tgz`);
const scratch = mkdtempSync(join(tmpdir(), "ambitious-verify-adopt-"));

try {
  const release = join(scratch, "release");
  const module = join(scratch, "ambitious-hello");
  mkdirSync(module);

  must(sh(process.execPath, [join(repoRoot, "scripts", "release-build.mjs"), release]).status === 0, "the release files build");
  sh("git", ["init", "--quiet", module]);
  must(sh(process.execPath, [join(repoRoot, "scripts", "apply-template.mjs"), module]).status === 0, "the repo template is applied to an empty repository");

  for (const entry of ["src", "migrations", "test", "scripts/build.mjs", "eslint.config.js", ".dependency-cruiser.mjs", "tsconfig.json"]) {
    cpSync(join(repoRoot, "examples", "hello", entry), join(module, entry), { recursive: true });
  }
  mkdirSync(join(module, "vendor"));
  for (const tarball of tarballs) cpSync(join(release, tarball), join(module, "vendor", tarball));
  const template = readJson(join(module, "package.json"));
  writeFileSync(
    join(module, "package.json"),
    `${JSON.stringify(
      {
        ...template,
        name: hello.name,
        version: hello.version,
        scripts: { ...template.scripts, ...hello.scripts, lint: `${hello.scripts.lint} && ${template.scripts.lint}` },
        devDependencies: {
          "@ambitious/kit": `file:vendor/${tarballs[0]}`,
          "@ambitious/lint": `file:vendor/${tarballs[1]}`,
          "@ambitious/depcruise": `file:vendor/${tarballs[2]}`,
          ...Object.fromEntries(["@types/node", "dependency-cruiser", "esbuild", "eslint", "typescript"].map((name) => [name, kit.devDependencies[name]])),
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(module, ".gitignore"), "node_modules/\ndist/\n");

  const npm = (...args) => sh("npm", args, { cwd: module, env: { ...process.env, npm_config_workspaces: undefined } });
  must(npm("install", "--prefer-offline", "--no-audit", "--no-fund").status === 0, "npm installs the three kit tarballs as devDependencies");
  sh("git", ["-C", module, "add", "--all"]);
  for (const [script, claim] of [
    ["typecheck", "the module typechecks against the type declarations in the kit tarball"],
    ["lint", "the module passes the kit lint rules and the standalone check"],
    ["depcruise", "the module passes the kit dependency rules"],
    ["build", "the module bundles into one file"],
    ["test", "the module's own tests pass, the contract tests included"],
    ["contract", "the built module passes the contract tests run from the installed kit"],
  ]) {
    must(npm("run", "--silent", script).status === 0, claim);
  }
  const selfcheck = sh(process.execPath, [join(module, "dist", "ambitious-hello.mjs"), "selfcheck", "--now", "2026-01-01T00:00:00Z"]);
  must(selfcheck.status === 0 && JSON.parse(selfcheck.stdout).ok === true, "the module built outside the kit repository answers selfcheck with ok");

  const greeting = join(module, "src", "domain", "greeting.ts");
  const original = readFileSync(greeting, "utf8");
  appendFileSync(greeting, "// note\n");
  const commented = npm("run", "--silent", "lint");
  must(
    commented.status !== 0 && commented.output.includes("Delete the comment. Encode the rule in a type, name or test"),
    "a stray comment fails the installed lint rules with the fix message",
  );
  writeFileSync(greeting, `${original}import "@ambitious/kit/db/open-db";\n`);
  const crossed = npm("run", "--silent", "depcruise");
  must(
    crossed.status !== 0 && crossed.output.includes("src/domain may not import src/db, src/cli, src/ai or src/install"),
    "importing the kit's database helper from src/domain fails the installed dependency rules",
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
