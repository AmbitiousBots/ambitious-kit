import { failure } from "./failure.ts";
import { isRecord } from "./json.ts";

export type Guide = { readonly topic: string; readonly title: string; readonly text: string };

const TOPIC = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const parseGuides = (value: unknown): readonly Guide[] => {
  if (!Array.isArray(value)) throw new Error("The embedded guides must be a list.");
  return value.map((entry: unknown): Guide => {
    if (!isRecord(entry) || typeof entry.topic !== "string" || !TOPIC.test(entry.topic) || typeof entry.title !== "string" || entry.title === "" || typeof entry.text !== "string" || entry.text === "") {
      throw new Error("Each embedded guide needs a lower-case topic, a title and its text.");
    }
    return { topic: entry.topic, title: entry.title, text: entry.text };
  });
};

export const guideFor = (guides: readonly Guide[], topic: string): Guide => {
  const guide = guides.find((candidate) => candidate.topic === topic);
  if (guide === undefined) {
    throw failure("E_USAGE", `There is no guide named "${topic}".`, `The guides are ${guides.map((candidate) => candidate.topic).join(", ")}. Run the guide command with no topic to list them with their titles.`);
  }
  return guide;
};
