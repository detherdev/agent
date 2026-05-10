import type { Guardrails, ApprovalRule } from "./types.js";

export type GuardrailDecision =
  | { kind: "ok" }
  | { kind: "needs_approval"; rule: ApprovalRule }
  | { kind: "step_cap_exceeded" }
  | { kind: "budget_exceeded" };

export function checkPreToolCall(args: {
  guardrails: Guardrails;
  step: number;
  cost_usd: number;
  tool_name: string;
}): GuardrailDecision {
  const { guardrails, step, cost_usd, tool_name } = args;

  if (step >= guardrails.step_cap) return { kind: "step_cap_exceeded" };
  if (cost_usd >= guardrails.budget_usd) return { kind: "budget_exceeded" };

  const rule = guardrails.approvals.find((r) => r.tool === tool_name);
  if (rule) return { kind: "needs_approval", rule };

  return { kind: "ok" };
}

export function checkPreTurn(args: {
  guardrails: Guardrails;
  step: number;
  cost_usd: number;
}): GuardrailDecision {
  const { guardrails, step, cost_usd } = args;
  if (step >= guardrails.step_cap) return { kind: "step_cap_exceeded" };
  if (cost_usd >= guardrails.budget_usd) return { kind: "budget_exceeded" };
  return { kind: "ok" };
}

const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, "[REDACTED_EMAIL]"],
  [/\b(?:\d[ -]*?){13,16}\b/g, "[REDACTED_CARD]"],
  [/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]"],
];

export function redactPII(text: string): string {
  let out = text;
  for (const [pat, replace] of PII_PATTERNS) out = out.replace(pat, replace);
  return out;
}
