import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { failure } from "../domain/failure.ts";
import { refuseAgentData } from "../paths/refuse-agent-data.ts";

export type Db = DatabaseSync;

export type OpenOptions = { readonly readonly: boolean };

const BUSY_TIMEOUT_MS = 5000;

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const readUserVersion = (db: Db): number => {
  const version = db.prepare("PRAGMA user_version").get()?.user_version;
  return typeof version === "number" ? version : 0;
};

export const openDb = (path: string, { readonly }: OpenOptions): Db => {
  const file = refuseAgentData(path);
  if (readonly && !existsSync(file)) {
    throw failure("E_MIGRATION", `The database ${file} does not exist yet.`, "Run selfcheck to create it and apply its migrations.");
  }
  try {
    if (!readonly) mkdirSync(dirname(file), { recursive: true });
    const db = new DatabaseSync(readonly ? `${pathToFileURL(file).href}?mode=ro` : file, {
      readOnly: readonly,
      timeout: BUSY_TIMEOUT_MS,
    });
    try {
      if (readonly) db.exec("PRAGMA query_only=ON");
      else db.exec("PRAGMA journal_mode=WAL");
      db.exec("PRAGMA foreign_keys=ON");
      readUserVersion(db);
      return db;
    } catch (error) {
      db.close();
      throw error;
    }
  } catch (error) {
    throw failure(
      "E_DB",
      `The database ${file} could not be opened for ${readonly ? "reading" : "writing"}: ${describe(error)}.`,
      "Run selfcheck and read data.problems.",
    );
  }
};
