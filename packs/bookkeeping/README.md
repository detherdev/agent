# Bookkeeping Pack

Prebuilt agent workflows for bookkeeping firms. Each workflow ships as a JSON
spec (workflow definition + test cases) plus a system prompt in
`system-prompts/`.

## Workflows

- `invoice-to-quickbooks` — incoming invoice email → QuickBooks bill draft,
  reply to vendor with confirmation. Approval required for amounts > $1000.
- `ar-chasing` — daily, scans QuickBooks for overdue invoices, sends one
  polite reminder per customer (escalating tone with age). Approval
  required at final-notice tier or for balances > $5000.

## Coming next

- `expense-categorization` — receipt photos / forwarded emails → categorized
  ledger entry with auto-class.
- `month-end-status` — monthly close summary email per client (open items,
  reconciliation status, what the bookkeeper needs from them).

## Installing

```bash
psql $DATABASE_URL -f db/schema.sql
node scripts/install-pack.js packs/bookkeeping  # TODO
```
