-- Allow ten-minute local generation plus thirty seconds for saving.
-- Existing runs keep their original expiry.
alter table public.runs
  alter column expires_at set default now() + interval '630 seconds';
