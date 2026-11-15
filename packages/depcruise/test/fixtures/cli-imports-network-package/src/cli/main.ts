import { request } from "undici";

export const call = (url: string): unknown => request(url);
