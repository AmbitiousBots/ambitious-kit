import type { Rule } from "eslint";

export const noBarrelFiles: Rule.RuleModule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      barrel:
        "Barrel files hide where a name is defined. Import each name from the file that defines it and delete this re-export.",
    },
  },
  create(context) {
    return {
      ExportAllDeclaration(node) {
        context.report({ node, messageId: "barrel" });
      },
      Program(node) {
        const reExports = node.body.filter(
          (statement) => statement.type === "ExportNamedDeclaration" && statement.source != null,
        );
        if (reExports.length === 0 || reExports.length !== node.body.length) return;
        for (const statement of reExports) context.report({ node: statement, messageId: "barrel" });
      },
    };
  },
};
