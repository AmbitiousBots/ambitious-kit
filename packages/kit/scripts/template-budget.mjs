export const TEMPLATE_BUDGET = { totalBytes: 33280, perSkillBytes: 8192 };

export const BUDGET_NOTE = "This is a conservative budget, not a measured platform limit.";

const FIX =
  'Keep in the skill only when to use it, the one or two commands to run, what to read in the result and the hard rules; move reference text (field tables, step-by-step procedures, edge cases) into the installer\'s help, a file under template/guides that "ambitious-modules guide" prints.';

const bytesOf = (text) => Buffer.byteLength(text, "utf8");

export const templateSizes = (skills, routines) => {
  const items = [
    ...skills.map(({ name, description, body }) => ({ kind: "skill", name, bytes: bytesOf(body) + bytesOf(description) })),
    ...routines.map(({ name, prompt }) => ({ kind: "routine prompt", name, bytes: bytesOf(prompt) })),
  ];
  return { items, totalBytes: items.reduce((total, { bytes }) => total + bytes, 0) };
};

export const budgetProblems = ({ items, totalBytes }, budget = TEMPLATE_BUDGET) => [
  ...items
    .filter(({ kind, bytes }) => kind === "skill" && bytes > budget.perSkillBytes)
    .map(({ name, bytes }) => `The skill ${name} is ${bytes} bytes (body and description, UTF-8), which is ${bytes - budget.perSkillBytes} over the budget of ${budget.perSkillBytes} bytes for one skill. ${FIX}`),
  ...(totalBytes > budget.totalBytes
    ? [
        `The template is ${totalBytes} bytes (every skill body and description and every routine prompt, UTF-8), which is ${totalBytes - budget.totalBytes} over the budget of ${budget.totalBytes} bytes. ` +
          `The largest items are ${[...items].sort((a, b) => b.bytes - a.bytes).slice(0, 3).map(({ kind, name, bytes }) => `the ${kind} ${name} (${bytes})`).join(", ")}. ${FIX}`,
      ]
    : []),
];

export const budgetTable = ({ items, totalBytes }, budget = TEMPLATE_BUDGET) => {
  const width = Math.max(...items.map(({ kind, name }) => `${kind} ${name}`.length), "total".length);
  const line = (label, bytes, limit) => `  ${label.padEnd(width)}  ${String(bytes).padStart(6)}${limit === null ? "" : ` of ${limit}`}`;
  return [...items.map(({ kind, name, bytes }) => line(`${kind} ${name}`, bytes, kind === "skill" ? budget.perSkillBytes : null)), line("total", totalBytes, budget.totalBytes)].join("\n");
};

export const templateBudgetFailure = (skills, routines, budget = TEMPLATE_BUDGET) => {
  const problems = budgetProblems(templateSizes(skills, routines), budget);
  return problems.length === 0 ? null : `template size budget exceeded. ${BUDGET_NOTE}\n${problems.map((problem) => `- ${problem}`).join("\n")}`;
};
