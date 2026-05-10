import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "claude-sonnet-4-6";

export interface Verdict {
  passed: boolean;
  reasoning: string;
  score: number; // 0..1
}

const SYSTEM = `You are an evaluator for an AI agent's output. You receive:
- the test case input,
- a natural-language pass rubric,
- the agent's actual output.

Reply with ONLY a JSON object: {"passed": boolean, "score": number 0..1, "reasoning": string}.
Be strict but fair. The agent passes if it satisfies every clause in the rubric.`;

export async function judge(args: {
  input: unknown;
  rubric: string;
  output: unknown;
}): Promise<Verdict> {
  const res = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 600,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `INPUT:\n${JSON.stringify(args.input)}\n\nRUBRIC:\n${args.rubric}\n\nAGENT OUTPUT:\n${
          typeof args.output === "string" ? args.output : JSON.stringify(args.output)
        }`,
      },
    ],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return { passed: false, reasoning: `Judge returned non-JSON: ${text}`, score: 0 };
  try {
    const parsed = JSON.parse(match[0]) as Verdict;
    return parsed;
  } catch (err) {
    return { passed: false, reasoning: `Judge JSON parse failed: ${(err as Error).message}`, score: 0 };
  }
}
