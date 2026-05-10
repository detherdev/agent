-- Track where each workspace is in the first-run wizard. Lets the web app
-- decide whether to redirect to /onboarding or straight to /inbox.

alter table workspaces
  add column if not exists onboarding_step smallint not null default 0;

-- 0 = just-created (haven't picked a job)
-- 1 = picked at least one job, haven't connected accounts
-- 2 = connected required accounts
-- 3 = onboarding done
