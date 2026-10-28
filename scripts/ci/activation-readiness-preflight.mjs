#!/usr/bin/env node
// Compatibility entry point: one implementation is authoritative.
import { inspectActivationReadiness } from '../activation-readiness-preflight.mjs';
export { REQUIRED_ARTIFACTS } from '../activation-readiness-preflight.mjs';
export const inspectReadiness = inspectActivationReadiness;
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const result = inspectReadiness({root:process.argv[2] ?? '.'});
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
  if (!result.ok) process.exitCode=1;
}
