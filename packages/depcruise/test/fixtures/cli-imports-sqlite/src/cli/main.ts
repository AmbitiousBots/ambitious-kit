import { DatabaseSync } from "node:sqlite";

export const open = (path: string): DatabaseSync => new DatabaseSync(path);
