#!/usr/bin/env node
import { contractMain } from "../src/cli/contract-main.ts";

process.exitCode = contractMain(process.argv.slice(2));
