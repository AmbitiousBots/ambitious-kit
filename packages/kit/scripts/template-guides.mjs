import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const GUIDE_FILE = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)\.md$/;

export const guideFile = (template, topic) => join(template, "guides", `${topic}.md`);

export const guideTopics = (template) =>
  readdirSync(join(template, "guides"), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const [, topic] = GUIDE_FILE.exec(entry.name) ?? [];
      if (topic === undefined) throw new Error(`template/guides/${entry.name}: a guide is a file named <topic>.md, with a lower-case topic.`);
      return topic;
    })
    .sort();

export const guidesOf = (template) =>
  guideTopics(template).map((topic) => {
    const text = readFileSync(guideFile(template, topic), "utf8");
    const [, title] = /^# (.+)\n/.exec(text) ?? [];
    if (title === undefined) throw new Error(`template/guides/${topic}.md must start with a "# Title" line, which the guide command lists.`);
    return { topic, title, text };
  });

export const guidesNamedIn = (text) => [...new Set([...text.matchAll(/ambitious-modules" guide ([a-z][a-z0-9-]*)|`guide ([a-z][a-z0-9-]*)`/g)].map(([, inCommand, inProse]) => inCommand ?? inProse))];
