import { request } from "node:https";
import { greet } from "../domain/greeting.js";

export const start = (name: string): void => {
  request("https://example.invalid", { method: "POST" }).end(greet(name));
};
