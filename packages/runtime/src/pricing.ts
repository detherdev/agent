export interface ModelPricing {
  input_per_mtok: number;
  output_per_mtok: number;
  cache_read_per_mtok: number;
  cache_write_per_mtok: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-6": {
    input_per_mtok: 3,
    output_per_mtok: 15,
    cache_read_per_mtok: 0.3,
    cache_write_per_mtok: 3.75,
  },
  "claude-opus-4-7": {
    input_per_mtok: 15,
    output_per_mtok: 75,
    cache_read_per_mtok: 1.5,
    cache_write_per_mtok: 18.75,
  },
  "claude-haiku-4-5-20251001": {
    input_per_mtok: 1,
    output_per_mtok: 5,
    cache_read_per_mtok: 0.1,
    cache_write_per_mtok: 1.25,
  },
};

export function priceTurn(
  model: string,
  usage: {
    input_tokens?: number | null;
    output_tokens?: number | null;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  },
): number {
  const p = PRICING[model];
  if (!p) return 0;
  const i = (usage.input_tokens ?? 0) / 1_000_000;
  const o = (usage.output_tokens ?? 0) / 1_000_000;
  const cr = (usage.cache_read_input_tokens ?? 0) / 1_000_000;
  const cw = (usage.cache_creation_input_tokens ?? 0) / 1_000_000;
  return (
    i * p.input_per_mtok +
    o * p.output_per_mtok +
    cr * p.cache_read_per_mtok +
    cw * p.cache_write_per_mtok
  );
}
