import { runTestPack } from "./runner.js";

const workflowId = process.argv[2];
if (!workflowId) {
  console.error("usage: pnpm --filter evals run <workflow_id>");
  process.exit(1);
}

const results = await runTestPack(workflowId);

const passed = results.filter((r) => r.passed).length;
const total = results.length;
const totalCost = results.reduce((s, r) => s + r.cost_usd, 0);

console.log(`\n${passed}/${total} passed   (cost: $${totalCost.toFixed(4)})\n`);
for (const r of results) {
  const tag = r.passed ? "PASS" : "FAIL";
  console.log(`[${tag}] ${r.name}  score=${r.score.toFixed(2)}  cost=$${r.cost_usd.toFixed(4)}`);
  if (!r.passed) console.log(`        ${r.reasoning}\n`);
}

process.exit(passed === total ? 0 : 1);
