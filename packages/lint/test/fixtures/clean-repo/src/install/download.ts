import { get } from "node:https";

export const download = (url: string, onStatus: (status: number | undefined) => void): void => {
  get(url, (response) => onStatus(response.statusCode));
};
