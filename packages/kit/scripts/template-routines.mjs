const SETTINGS = ["Schedule", "Time zone", "Destination", "Starts"];

export const routinesOf = (markdown) =>
  markdown
    .split(/^## /m)
    .slice(1)
    .filter((section) => section.startsWith("ambitious-"))
    .map((section) => {
      const [name, ...lines] = section.split("\n");
      const setting = (label) => {
        const index = lines.findIndex((line) => line.startsWith(`${label}: `));
        if (index === -1) throw new Error(`The routine ${name} in routines.md needs a "${label}: " line.`);
        return lines.splice(index, 1)[0].slice(label.length + 2).trim();
      };
      const [schedule, timeZone, destination, starts] = SETTINGS.map(setting);
      if (starts !== "active" && starts !== "paused") throw new Error(`The routine ${name} in routines.md must have "Starts: active" or "Starts: paused".`);
      return { name, schedule, timeZone, destination, prompt: lines.join("\n").trim(), paused: starts === "paused" };
    });
