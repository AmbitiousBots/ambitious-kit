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
