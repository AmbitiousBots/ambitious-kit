import { load } from "@example/helpers/db/store";

export const rank = (): number => load().length;
