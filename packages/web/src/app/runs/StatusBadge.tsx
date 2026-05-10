const STYLES: Record<string, string> = {
  succeeded: "bg-emerald-950 text-emerald-200",
  failed: "bg-red-950 text-red-200",
  awaiting_approval: "bg-amber-950 text-amber-200",
  running: "bg-blue-950 text-blue-200",
  queued: "bg-neutral-800 text-neutral-300",
  cancelled: "bg-neutral-800 text-neutral-400",
  budget_exceeded: "bg-red-950 text-red-200",
};

const LABELS: Record<string, string> = {
  succeeded: "OK",
  failed: "Failed",
  awaiting_approval: "Needs you",
  running: "Running",
  queued: "Queued",
  cancelled: "Cancelled",
  budget_exceeded: "Over budget",
};

export function StatusBadge({ status }: { status: string }) {
  const klass = STYLES[status] ?? "bg-neutral-800 text-neutral-300";
  const label = LABELS[status] ?? status;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${klass}`}>
      {label}
    </span>
  );
}
