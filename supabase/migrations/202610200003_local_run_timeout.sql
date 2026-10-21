-- Local subscription runs may take up to five minutes. Leave time to commit.
-- Existing runs retain their original expiry; only future runs are affected.
alter table public.runs
  alter column expires_at set default now() + interval '310 seconds';
