import { get } from "node:https";

export const download = (url: string): void => {
  get(url);
};
