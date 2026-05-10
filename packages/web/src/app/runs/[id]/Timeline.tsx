import type { TurnRow } from "@/lib/api";

interface AssistantBlock {
  type: "text" | "tool_use";
  text?: string;
  name?: string;
  input?: unknown;
  id?: string;
}

interface ToolTurnContent {
  tool_use_id: string;
  content: string;
}

export function Timeline({ turns }: { turns: TurnRow[] }) {
  if (turns.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 px-6 py-8 text-center text-sm text-neutral-500">
        No turns yet. (The worker may not have picked this up.)
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {turns.map((t, i) => (
        <li key={i} className="relative pl-8">
          <span
            className={
              "absolute left-0 top-2 flex h-5 w-5 items-center justify-center rounded-full text-xs " +
              (t.role === "assistant"
                ? "bg-blue-950 text-blue-300"
                : t.role === "tool"
                ? "bg-emerald-950 text-emerald-300"
                : "bg-neutral-800 text-neutral-400")
            }
          >
            {t.step}
          </span>
          {t.role === "assistant" ? (
            <AssistantTurn turn={t} />
          ) : t.role === "tool" ? (
            <ToolTurn turn={t} />
          ) : (
            <RawTurn turn={t} />
          )}
        </li>
      ))}
    </ol>
  );
}

function AssistantTurn({ turn }: { turn: TurnRow }) {
  const blocks = (turn.content as AssistantBlock[]) ?? [];
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n");
  const toolUses = blocks.filter((b) => b.type === "tool_use");

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="flex items-center justify-between text-xs text-neutral-500">
        <div>
          assistant
          {turn.input_tokens != null && (
            <span className="ml-2">
              {turn.input_tokens} in / {turn.output_tokens ?? 0} out
            </span>
          )}
        </div>
        <div>
          {turn.cost_usd != null && `$${Number(turn.cost_usd).toFixed(4)}`}
          {turn.duration_ms != null && ` • ${turn.duration_ms}ms`}
        </div>
      </div>
      {text && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-200">{text}</p>
      )}
      {toolUses.length > 0 && (
        <div className="mt-3 space-y-2">
          {toolUses.map((tu, i) => (
            <details key={i} className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
              <summary className="cursor-pointer text-xs">
                <span className="font-mono text-blue-300">{tu.name}</span>
                <span className="ml-2 text-neutral-500">
                  {summarizeInput(tu.input)}
                </span>
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto text-xs text-neutral-400">
                {JSON.stringify(tu.input, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function ToolTurn({ turn }: { turn: TurnRow }) {
  const c = (turn.content as ToolTurnContent | null) ?? null;
  const result = (turn.tool_result as { is_error?: boolean } | null) ?? null;
  const isError = result?.is_error === true;
  return (
    <div
      className={
        "rounded-xl border p-4 " +
        (isError
          ? "border-red-900/60 bg-red-950/20"
          : "border-emerald-900/40 bg-emerald-950/10")
      }
    >
      <div className="text-xs">
        <span className={isError ? "text-red-300" : "text-emerald-300"}>
          {turn.tool_name ?? "tool"}
        </span>
        <span className="ml-2 text-neutral-500">{isError ? "error" : "result"}</span>
      </div>
      <pre className="mt-2 max-h-64 overflow-auto text-xs text-neutral-300">
        {c?.content ?? JSON.stringify(turn.content, null, 2)}
      </pre>
    </div>
  );
}

function RawTurn({ turn }: { turn: TurnRow }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="text-xs text-neutral-500">{turn.role}</div>
      <pre className="mt-2 max-h-64 overflow-auto text-xs text-neutral-400">
        {JSON.stringify(turn.content, null, 2)}
      </pre>
    </div>
  );
}

function summarizeInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input !== "object") return String(input).slice(0, 60);
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length === 0) return "";
  return entries
    .slice(0, 2)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v.slice(0, 30) : JSON.stringify(v).slice(0, 30)}`)
    .join(", ");
}
