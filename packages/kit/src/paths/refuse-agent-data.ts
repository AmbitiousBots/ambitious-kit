import { lstatSync, readlinkSync } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve, sep } from "node:path";
import { failure } from "../domain/failure.ts";

export const AGENT_DATA_ROOT = "/home/box/agent-data";
export const DEFAULT_AMBITIOUS_HOME = "/workspace/ambitious";

const MAX_LINKS = 40;

const isUnder = (path: string, root: string): boolean => path === root || path.startsWith(`${root}${sep}`);

const refuse = (path: string): never => {
  throw failure(
    "E_FORBIDDEN_PATH",
    `The path ${path} is under ${AGENT_DATA_ROOT}/, which modules never read or write.`,
    "Use a path under AMBITIOUS_HOME, or omit --db to use the default.",
  );
};

const linkTarget = (path: string): string | null => {
  try {
    return lstatSync(path).isSymbolicLink() ? readlinkSync(path) : null;
  } catch {
    return null;
  }
};

const withLinksResolved = (path: string, forbidden: (resolved: string) => boolean): string => {
  const follow = (current: string, pending: readonly string[], links: number): string => {
    if (forbidden(current)) return current;
    const [segment, ...rest] = pending;
    if (segment === undefined) return current;
    const next = join(current, segment);
    if (forbidden(next)) return next;
    const target = linkTarget(next);
    if (target === null) return follow(next, rest, links);
    if (links >= MAX_LINKS) return next;
    const absolute = isAbsolute(target) ? target : resolve(dirname(next), target);
    const { root } = parse(absolute);
    return follow(root, [...absolute.slice(root.length).split(sep).filter((part) => part !== ""), ...rest], links + 1);
  };
  const { root } = parse(path);
  return follow(root, path.slice(root.length).split(sep).filter((part) => part !== ""), 0);
};

export const refuseAgentData = (path: string): string => {
  const absolute = resolve(path);
  if (isUnder(absolute, AGENT_DATA_ROOT)) refuse(path);
  const resolvedRoot = withLinksResolved(dirname(AGENT_DATA_ROOT), () => false);
  const roots = [AGENT_DATA_ROOT, join(resolvedRoot, "agent-data")];
  const forbidden = (resolved: string): boolean => roots.some((root) => isUnder(resolved, root));
  if (forbidden(withLinksResolved(absolute, forbidden))) refuse(path);
  return absolute;
};

export const ambitiousHome = (environment: Readonly<Record<string, string | undefined>>): string => {
  const configured = environment.AMBITIOUS_HOME;
  return refuseAgentData(configured === undefined || configured === "" ? DEFAULT_AMBITIOUS_HOME : configured);
};
