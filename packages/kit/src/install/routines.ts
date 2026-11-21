import { join } from "node:path";
import { failure } from "../domain/failure.ts";
import { classifyRoutine, parseRoutineOffers, routineMessage, ROUTINES_HINT, type RoutineFinding, type TemplateRoutine } from "../domain/routines.ts";
import { fingerprintOf, textOfFile } from "./text-file.ts";

export type RoutinesReport = {
  readonly state: "checked" | "not checked";
  readonly routines: readonly (RoutineFinding & { readonly proposed: string })[];
  readonly messages: readonly string[];
};

export const proposedRoutineFile = (name: string): string => `routines/${name}.md`;

export const proposedRoutinePath = (home: string, name: string): string => join(home, "template", proposedRoutineFile(name));

export const routineOffersIn = (file: string): ReturnType<typeof parseRoutineOffers> => {
  const text = textOfFile(file, "The routines file", ROUTINES_HINT);
  try {
    return parseRoutineOffers(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) throw failure("E_INPUT_SCHEMA", `The routines file ${file} could not be read as JSON: ${error.message}.`, ROUTINES_HINT);
    throw error;
  }
};

export const checkRoutines = (file: string | null, home: string, template: readonly TemplateRoutine[]): RoutinesReport => {
  if (file === null) return { state: "not checked", routines: [], messages: [] };
  const mine = routineOffersIn(file).map(({ name, schedule, prompt }) => ({ name, schedule, ...fingerprintOf(prompt) }));
  const routines = template.map((routine) => ({ ...classifyRoutine(routine, mine), proposed: proposedRoutinePath(home, routine.name) }));
  return { state: "checked", routines, messages: routines.flatMap((finding) => routineMessage(finding, finding.proposed) ?? []) };
};
