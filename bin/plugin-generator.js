#!/usr/bin/env node
import { main } from '../src/main.js';
import { Cancelled } from '../src/prompt.js';

main(process.argv.slice(2)).catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = error instanceof Cancelled ? 130 : 1;
});
