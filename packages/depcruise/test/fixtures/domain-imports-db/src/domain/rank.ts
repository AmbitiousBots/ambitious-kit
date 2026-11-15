import type { Row } from "../db/store.js";

export const first = (rows: readonly Row[]): Row | undefined => rows[0];
