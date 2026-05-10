# Sales pack

Starter workflows for the sales / RevOps function at a small business.
System prompts here are reasonable starting points; per-tenant tuning
(your ICP, qualification rubric, tone, signature) typically happens after
install via the chat-driven Setup Assistant.

## Workflows
- `lead-qualification` — webhook from contact-form posts; qualify, draft
  email reply, ping the AE in Slack for one-click send.
- `meeting-prep` — manual trigger before a meeting; pulls prior email
  threads with attendees and drops a brief in Slack.

## Tasks
- `tasks/quarterly-business-review-prep` — multi-phase QBR prep:
  pull account history → draft narrative → human review → schedule.
