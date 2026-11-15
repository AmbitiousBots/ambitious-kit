#!/usr/bin/env node
import { saveGreeting } from "../db/greetings.ts";
import { greet } from "../domain/greeting.ts";

const now = new Date();
const seed = Math.floor(Math.random() * 2 ** 32);
const greeting = greet(process.argv[2] ?? "world", { now: () => now });

saveGreeting(":memory:", greeting);
console.log(JSON.stringify({ ok: true, data: greeting, meta: { now: now.toISOString(), seed } }));
setTimeout(() => console.error("done"), 0);
