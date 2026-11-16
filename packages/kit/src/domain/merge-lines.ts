export type LineChange = { readonly startLine: number; readonly endLine: number; readonly before: string; readonly after: string };

export type LineConflict = { readonly startLine: number; readonly endLine: number; readonly base: string | null; readonly current: string; readonly published: string };

export type LineMerge = { readonly merged: string; readonly localChangesKept: readonly LineChange[]; readonly conflicts: readonly LineConflict[] };

type Edit = { readonly start: number; readonly end: number; readonly lines: readonly string[] };
type SidedEdit = Edit & { readonly side: "current" | "published" };

const MAX_CELLS = 2_000_000;
const linesOf = (text: string): readonly string[] => text.replace(/\r\n?/g, "\n").split("\n");
const textOf = (lines: readonly string[]): string => lines.join("\n");
const append = (target: string[], ...parts: readonly (readonly string[])[]): void => {
  for (const part of parts) for (const line of part) target.push(line);
};

const editsOf = (base: readonly string[], changed: readonly string[]): readonly Edit[] => {
  let start = 0;
  while (start < base.length && start < changed.length && base[start] === changed[start]) start += 1;
  let end = base.length;
  let changedEnd = changed.length;
  while (end > start && changedEnd > start && base[end - 1] === changed[changedEnd - 1]) {
    end -= 1;
    changedEnd -= 1;
  }
  const [before, after] = [base.slice(start, end), changed.slice(start, changedEnd)];
  const width = after.length + 1;
  if ((before.length + 1) * width > MAX_CELLS) return [{ start, end, lines: after }];
  const common = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      common[i * width + j] = before[i] === after[j] ? (common[(i + 1) * width + j + 1] ?? 0) + 1 : Math.max(common[(i + 1) * width + j] ?? 0, common[i * width + j + 1] ?? 0);
    }
  }
  const edits: Edit[] = [];
  let [i, j] = [0, 0];
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      i += 1;
      j += 1;
      continue;
    }
    const [from, changedFrom] = [i, j];
    while ((i < before.length || j < after.length) && !(i < before.length && j < after.length && before[i] === after[j])) {
      if (j >= after.length || (i < before.length && (common[(i + 1) * width + j] ?? 0) >= (common[i * width + j + 1] ?? 0))) i += 1;
      else j += 1;
    }
    edits.push({ start: from + start, end: i + start, lines: after.slice(changedFrom, j) });
  }
  return edits;
};

const changedRange = (base: readonly string[], start: number, end: number, edits: readonly Edit[]): readonly string[] => {
  const result: string[] = [];
  let cursor = start;
  for (const edit of edits) {
    append(result, base.slice(cursor, edit.start), edit.lines);
    cursor = edit.end;
  }
  append(result, base.slice(cursor, end));
  return result;
};

const markedConflict = (current: readonly string[], published: readonly string[], base: readonly string[] | null): readonly string[] => [
  "<<<<<<< current",
  ...current,
  ...(base === null ? [] : ["||||||| base", ...base]),
  "=======",
  ...published,
  ">>>>>>> published",
];

export const unknownBaseMerge = (current: string, published: string): LineMerge => ({
  merged: `${textOf(markedConflict(linesOf(current), linesOf(published), null))}\n`,
  localChangesKept: [],
  conflicts: [{ startLine: 1, endLine: linesOf(current).length, base: null, current, published }],
});

export const mergeLines = (baseText: string, currentText: string, publishedText: string): LineMerge => {
  const base = linesOf(baseText);
  const edits: SidedEdit[] = [
    ...editsOf(base, linesOf(currentText)).map((edit) => ({ ...edit, side: "current" as const })),
    ...editsOf(base, linesOf(publishedText)).map((edit) => ({ ...edit, side: "published" as const })),
  ].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: string[] = [];
  const localChangesKept: LineChange[] = [];
  const conflicts: LineConflict[] = [];
  let cursor = 0;
  let next = 0;
  while (next < edits.length) {
    const first = edits[next];
    if (first === undefined) break;
    const group = [first];
    let end = first.end;
    next += 1;
    while (next < edits.length) {
      const edit = edits[next];
      if (edit === undefined || edit.start > end || (edit.start === end && edit.start !== edit.end && !group.some((item) => item.start === item.end && item.end === end))) break;
      group.push(edit);
      end = Math.max(end, edit.end);
      next += 1;
    }
    const ours = group.filter(({ side }) => side === "current");
    const theirs = group.filter(({ side }) => side === "published");
    const original = base.slice(first.start, end);
    const current = changedRange(base, first.start, end, ours);
    const published = changedRange(base, first.start, end, theirs);
    const same = current.length === published.length && current.every((line, index) => line === published[index]);
    const conflict = ours.length > 0 && theirs.length > 0 && !same;
    append(merged, base.slice(cursor, first.start), conflict ? markedConflict(current, published, original) : ours.length > 0 ? current : published);
    if (conflict) conflicts.push({ startLine: first.start + 1, endLine: end, base: textOf(original), current: textOf(current), published: textOf(published) });
    else for (const edit of ours) localChangesKept.push({ startLine: edit.start + 1, endLine: edit.end, before: textOf(base.slice(edit.start, edit.end)), after: textOf(edit.lines) });
    cursor = end;
  }
  append(merged, base.slice(cursor));
  return { merged: textOf(merged), localChangesKept, conflicts };
};
