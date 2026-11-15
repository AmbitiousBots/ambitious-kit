import type { ErrorCode, ErrorEntry } from "./envelope.ts";
import type { JsonObject } from "./json.ts";

export class Failure extends Error {
  readonly errors: readonly [ErrorEntry, ...ErrorEntry[]];
  readonly data: JsonObject;

  constructor(errors: readonly [ErrorEntry, ...ErrorEntry[]], data: JsonObject = {}) {
    super(errors.map(({ code, message }) => `${code}: ${message}`).join(" "));
    this.name = "Failure";
    this.errors = errors;
    this.data = data;
  }
}

export const failure = (code: ErrorCode, message: string, hint: string, data: JsonObject = {}): Failure =>
  new Failure([{ code, message, hint }], data);
