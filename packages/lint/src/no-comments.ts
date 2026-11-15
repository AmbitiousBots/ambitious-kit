import type { AST, Rule } from "eslint";
import { BUDGET_COMMENT } from "./budget.ts";

type Comment = NonNullable<AST.Program["comments"]>[number];

const LICENSE = /Copyright|SPDX-License-Identifier/;
const TS_EXPECT_ERROR_WITH_REASON = /^ @ts-expect-error \S.{2,}$/;

const isLine = (comment: Comment): boolean => comment.type === "Line";

const startLine = (node: { readonly loc?: AST.SourceLocation | null | undefined }): number => node.loc?.start.line ?? 0;
const endLine = (node: { readonly loc?: AST.SourceLocation | null | undefined }): number => node.loc?.end.line ?? 0;

const leadingBlock = (comments: readonly Comment[]): readonly Comment[] => {
  const [first, ...rest] = comments;
  if (first === undefined) return [];
  if (!isLine(first)) return [first];
  const block = [first];
  for (const comment of rest) {
    if (!isLine(comment) || startLine(comment) !== endLine(block[block.length - 1] ?? first) + 1) break;
    block.push(comment);
  }
  return block;
};

export const noComments: Rule.RuleModule = {
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: { budget: { type: "integer", minimum: 0 }, used: { type: "integer", minimum: 0 } },
        required: ["budget", "used"],
        additionalProperties: false,
      },
    ],
    messages: {
      banned:
        "Delete the comment. Encode the rule in a type, name or test; if it is a non-obvious why, use // WHY: (budget {{left}} left).",
      overBudget:
        "This repo has {{used}} // WHY: and // SAFETY: comments and the budget is {{budget}}. Delete {{over}} of them: encode each rule in a type, name or test.",
    },
  },
  create(context) {
    const [{ budget, used }] = context.options;
    const { sourceCode } = context;

    const startsItsLine = (comment: Comment): boolean => {
      const before = sourceCode.getTokenBefore(comment, { includeComments: true });
      return before === null || endLine(before) < startLine(comment);
    };

    const sitsAboveCode = (comment: Comment): boolean => {
      const after = sourceCode.getTokenAfter(comment, { includeComments: true });
      if (after === null || startLine(after) !== endLine(comment) + 1) return false;
      return after.type !== "Block" && (after.type !== "Line" || BUDGET_COMMENT.test(after.value));
    };

    const isBudgetComment = (comment: Comment): boolean =>
      isLine(comment) && BUDGET_COMMENT.test(comment.value) && startsItsLine(comment) && sitsAboveCode(comment);

    return {
      Program() {
        const comments = sourceCode
          .getAllComments()
          .filter((comment) => !(sourceCode.text.startsWith("#!") && comment.range?.[0] === 0));
        const beforeCode = comments.filter((comment) => sourceCode.getTokenBefore(comment) === null);
        const header = leadingBlock(beforeCode);
        const license = header.some((comment) => LICENSE.test(comment.value)) ? new Set(header) : new Set<Comment>();

        for (const comment of comments) {
          if (license.has(comment)) continue;
          if (isLine(comment) && TS_EXPECT_ERROR_WITH_REASON.test(comment.value)) continue;
          if (comment.loc === null || comment.loc === undefined) continue;
          if (!isBudgetComment(comment)) {
            context.report({ loc: comment.loc, messageId: "banned", data: { left: Math.max(0, budget - used) } });
          } else if (used > budget) {
            context.report({ loc: comment.loc, messageId: "overBudget", data: { used, budget, over: used - budget } });
          }
        }
      },
    };
  },
};
