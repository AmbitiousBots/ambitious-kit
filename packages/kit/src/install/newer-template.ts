import { isNewerVersion } from "../domain/lock.ts";
import { latestInstallerVersion, networkFetchers, type Fetchers } from "./release.ts";

export type TemplateStatus =
  | { readonly update: "current" }
  | { readonly update: "available"; readonly latest: string }
  | { readonly update: "not checked"; readonly why: string };

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const templateStatus = async (own: string, mirror: string | null, fetchers: Fetchers = networkFetchers): Promise<TemplateStatus> => {
  try {
    const latest = await latestInstallerVersion(mirror, fetchers);
    return latest !== null && isNewerVersion(latest, own) ? { update: "available", latest } : { update: "current" };
  } catch (error) {
    return { update: "not checked", why: `Could not look for a newer template release: ${reason(error)}.` };
  }
};

export const templateNote = (own: string, status: TemplateStatus): string | null => {
  if (status.update === "available") {
    return `A newer template is available: release ${status.latest}, and this installer is ${own}. Update the bot's template to get it. Nothing from the newer release was downloaded, installed or run.`;
  }
  if (status.update === "not checked") return `${status.why} The pins that came with this installer were used.`;
  return null;
};
