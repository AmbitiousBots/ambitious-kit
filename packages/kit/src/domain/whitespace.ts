export type TextMatch = "exact" | "whitespace";

const HORIZONTAL = /[\t\p{Zs}]+/gu;
const LINE_END = /\r\n?|[\u2028\u2029]/g;
const BYTE_ORDER_MARK = /^\uFEFF/;

export const foldWhitespace = (text: string): string =>
  text
    .replace(BYTE_ORDER_MARK, "")
    .replace(LINE_END, "\n")
    .split("\n")
    .map((line) => line.replace(HORIZONTAL, " ").trim())
    .filter((line) => line !== "")
    .join("\n");

export type Fingerprint = { readonly sha256: string; readonly whitespaceSha256: string };

export const matchOf = (given: Fingerprint, published: Fingerprint): TextMatch | null => {
  if (given.sha256 === published.sha256) return "exact";
  return given.whitespaceSha256 === published.whitespaceSha256 ? "whitespace" : null;
};
