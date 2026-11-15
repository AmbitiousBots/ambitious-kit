import type { Migration } from "../domain/migrations.ts";

declare const AMBITIOUS_MODULE: string | undefined;
declare const AMBITIOUS_VERSION: string | undefined;
declare const AMBITIOUS_MIGRATIONS: readonly Migration[] | undefined;

export type Embedded = { readonly module: string; readonly version: string; readonly migrations: readonly Migration[] };

export const embedded = (): Embedded => {
  if (
    typeof AMBITIOUS_MODULE === "undefined" ||
    typeof AMBITIOUS_VERSION === "undefined" ||
    typeof AMBITIOUS_MIGRATIONS === "undefined"
  ) {
    throw new Error(
      "The module name, version and migrations are embedded when the binary is bundled. Build with bundleOptions() from @ambitious/kit/build/bundle-options and run the file in dist/.",
    );
  }
  return { module: AMBITIOUS_MODULE, version: AMBITIOUS_VERSION, migrations: AMBITIOUS_MIGRATIONS };
};

declare const AMBITIOUS_LOCK: unknown;

export const embeddedLock = (): unknown => {
  if (typeof AMBITIOUS_LOCK === "undefined") {
    throw new Error("The module pins are embedded when the installer is bundled. Run the file in dist/, or name a lock file with --lock.");
  }
  return AMBITIOUS_LOCK;
};

declare const AMBITIOUS_TEMPLATE_FILES: unknown;

export const embeddedTemplateFiles = (): unknown => {
  if (typeof AMBITIOUS_TEMPLATE_FILES === "undefined") {
    throw new Error("The template fixture files are embedded when the installer is bundled. Run the file in dist/.");
  }
  return AMBITIOUS_TEMPLATE_FILES;
};

declare const AMBITIOUS_INSTRUCTIONS: unknown;

export const embeddedInstructions = (): unknown => {
  if (typeof AMBITIOUS_INSTRUCTIONS === "undefined") {
    throw new Error("The template's instructions and their known versions are embedded when the installer is bundled. Run the file in dist/.");
  }
  return AMBITIOUS_INSTRUCTIONS;
};
