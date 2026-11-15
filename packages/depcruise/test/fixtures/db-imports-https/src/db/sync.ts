import { get } from "https";

export const pull = (url: string): void => {
  get(url);
};
