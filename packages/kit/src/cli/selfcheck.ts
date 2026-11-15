import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import type { ErrorEntry } from "../domain/envelope.ts";
import { Failure } from "../domain/failure.ts";
import type { JsonObject } from "../domain/json.ts";
import type { Migration } from "../domain/migrations.ts";
import { integrityCheck, migrate } from "../db/migrate.ts";
import { openDb, readUserVersion, type Db } from "../db/open-db.ts";

export type SelfcheckContext = {
  readonly module: string;
  readonly dbPath: string;
  readonly binaryPath: string;
  readonly migrations: readonly Migration[];
};

type Finding = { readonly problem: string; readonly error: ErrorEntry };

type DbReport = {
  readonly integrityCheck: string;
  readonly userVersion: number;
  readonly migrationsApplied: readonly string[];
  readonly findings: readonly Finding[];
};

const NOT_CHECKED = "not checked";

const findingsOf = (error: unknown): readonly Finding[] => {
  if (error instanceof Failure) return error.errors.map((entry) => ({ problem: entry.message, error: entry }));
  const detail = error instanceof Error ? error.message : String(error);
  return [
    {
      problem: `The self-check could not finish: ${detail}.`,
      error: { code: "E_INTERNAL", message: "The self-check hit an unexpected error.", hint: "Report it with the stderr log." },
    },
  ];
};

const checkDb = ({ module, dbPath, migrations }: SelfcheckContext): DbReport => {
  const unread = { integrityCheck: NOT_CHECKED, userVersion: 0, migrationsApplied: [] };
  let db: Db;
  try {
    db = openDb(dbPath, { readonly: false });
  } catch (error) {
    return { ...unread, findings: findingsOf(error) };
  }
  try {
    const migration = (() => {
      try {
        return { applied: migrate(db, migrations), findings: [] };
      } catch (error) {
        return { applied: [], findings: findingsOf(error) };
      }
    })();
    const integrity = integrityCheck(db);
    const corrupt: readonly Finding[] =
      integrity === "ok"
        ? []
        : [
            {
              problem: `The database failed its integrity check: ${integrity}.`,
              error: {
                code: "E_DB",
                message: "The database failed its integrity check.",
                hint: `Restore ${module}.sqlite from a backup, then run selfcheck again.`,
              },
            },
          ];
    return {
      integrityCheck: integrity,
      userVersion: readUserVersion(db),
      migrationsApplied: migration.applied,
      findings: [...migration.findings, ...corrupt],
    };
  } catch (error) {
    return { ...unread, findings: findingsOf(error) };
  } finally {
    db.close();
  }
};

const binaryReport = (binaryPath: string): { readonly path: string; readonly sha256: string } => {
  const path = realpathSync(binaryPath);
  return { path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
};

export const selfcheck = (context: SelfcheckContext): JsonObject => {
  const { findings, ...db } = checkDb(context);
  const data = {
    runtime: { name: "node", version: process.versions.node },
    binary: binaryReport(context.binaryPath),
    db: { path: context.dbPath, ...db },
    problems: findings.map(({ problem }) => problem),
  };
  const [first, ...rest] = findings.map(({ error }) => error);
  if (first !== undefined) throw new Failure([first, ...rest], data);
  return data;
};
