export function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Pick a job" },
    { n: 2, label: "Connect accounts" },
    { n: 3, label: "All set" },
  ];
  return (
    <ol className="mb-8 flex items-center gap-3 text-sm">
      {steps.map((s, i) => {
        const isCurrent = s.n === current;
        const isDone = s.n < current;
        return (
          <li key={s.n} className="flex items-center gap-2">
            <span
              className={
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium " +
                (isCurrent
                  ? "bg-emerald-500 text-emerald-950"
                  : isDone
                  ? "bg-emerald-950 text-emerald-200"
                  : "border border-neutral-800 text-neutral-500")
              }
            >
              {isDone ? "✓" : s.n}
            </span>
            <span
              className={
                isCurrent ? "text-neutral-100" : isDone ? "text-neutral-400" : "text-neutral-600"
              }
            >
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-neutral-700">›</span>}
          </li>
        );
      })}
    </ol>
  );
}
