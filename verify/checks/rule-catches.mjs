import { appendFileSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { must, repoRoot, sh } from "./scratch.mjs";

const BREAKS = {
  comment: {
    file: join("src", "domain", "greeting.ts"),
    added: "// note\n",
    tool: ["eslint", "."],
    message: "Delete the comment. Encode the rule in a type, name or test; if it is a non-obvious why, use // WHY: (budget 10 left)",
  },
  sqlite: {
    file: join("src", "domain", "greeting.ts"),
    added: 'import "node:sqlite";\n',
    tool: ["depcruise", "src", "--output-type", "err-long"],
    message: "node:sqlite is only allowed in src/db. Move the query into src/db and export a function that returns plain data.",
  },
};

const chosen = BREAKS[process.argv[2]];
if (chosen === undefined) {
  process.stderr.write(`Usage: node verify/checks/rule-catches.mjs <${Object.keys(BREAKS).join("|")}>\n`);
  process.exit(2);
}

const scratch = mkdtempSync(join(repoRoot, ".tmp-rule-catches-"));
try {
  const module = join(scratch, "hello");
  cpSync(join(repoRoot, "examples", "hello"), module, {
    recursive: true,
    filter: (source) => !["dist", "node_modules"].some((skipped) => source.endsWith(`/${skipped}`)),
  });
  const [tool, ...args] = chosen.tool;
  const check = () => sh(join(repoRoot, "node_modules", ".bin", tool), args, { cwd: module });

  must(check().status === 0, `the unchanged example module passes ${tool}`);
  appendFileSync(join(module, chosen.file), chosen.added);
  const broken = check();
  must(broken.status !== 0, `after adding ${JSON.stringify(chosen.added.trim())} to ${chosen.file}, ${tool} fails`);
  must(broken.output.replace(/\s+/g, " ").includes(chosen.message), `the failure says how to fix it: "${chosen.message}"`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
