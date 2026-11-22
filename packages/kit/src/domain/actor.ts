import { failure } from "./failure.ts";

export const ACTOR_MAX_CHARACTERS = 200;

export const ACTOR_RULE = `actor is 1 to ${ACTOR_MAX_CHARACTERS} Unicode characters, with no control characters or line breaks and no leading or trailing whitespace. Internal spaces are allowed. Nothing is trimmed.`;

const REFUSED = /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u;
const EDGE_WHITESPACE = /^\p{White_Space}|\p{White_Space}$/u;

export const actorProblem = (raw: unknown): string | null => {
  if (typeof raw !== "string") return "is not a string";
  if (raw === "") return "is empty";
  if (REFUSED.test(raw)) return "has a control character, a line break or half of a surrogate pair";
  if (EDGE_WHITESPACE.test(raw)) return "starts or ends with whitespace";
  const characters = [...raw].length;
  return characters > ACTOR_MAX_CHARACTERS ? `has ${characters} characters` : null;
};

export const parseActor = (raw: unknown): string => {
  const problem = actorProblem(raw);
  if (problem !== null || typeof raw !== "string") {
    throw failure("E_INPUT_SCHEMA", `The input field "actor" ${problem ?? "is not a string"}.`, `Send an actor that fits this rule: ${ACTOR_RULE}`);
  }
  return raw;
};
