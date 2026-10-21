-- Cloud owns authentication, project data and commits. The local worker only computes.
create table public.generation_jobs (
  run_id uuid primary key references public.runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  context text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  claim_id uuid,
  steps jsonb not null default '[]',
  result jsonb,
  created_at timestamptz not null default now()
);
alter table public.generation_jobs enable row level security;
create policy jobs_owner_read on public.generation_jobs for select to authenticated using(owner_id = auth.uid());
grant select on public.generation_jobs to authenticated;
create table public.generation_worker (
  id boolean primary key default true check(id),
  seen_at timestamptz not null
);
alter table public.generation_worker enable row level security;

create function public.enqueue_generation(p_project_id uuid, p_request_key uuid, p_revision integer, p_prompt text, p_context text)
returns public.runs language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.runs;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_context is null or length(p_context)>40000 then raise exception 'INVALID_CONTEXT'; end if;
  perform pg_advisory_xact_lock(7744921);
  if not exists(select 1 from generation_worker where seen_at>now()-interval '30 seconds') then
    raise exception 'WORKER_OFFLINE';
  end if;
  if exists(select 1 from generation_jobs j join runs active on active.id=j.run_id
    where j.status in ('queued','running') and active.status='running' and active.expires_at>now()) then
    raise exception 'PROJECT_BUSY';
  end if;
  select * into r from start_run(p_project_id,p_request_key,p_revision,p_prompt);
  insert into generation_jobs(run_id,project_id,owner_id,context) values(r.id,p_project_id,auth.uid(),p_context);
  return r;
end; $$;
revoke all on function public.enqueue_generation(uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.enqueue_generation(uuid,uuid,integer,text,text) to authenticated;

create function public.claim_generation()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.generation_jobs;
begin
  perform pg_advisory_xact_lock(7744921);
  insert into generation_worker(id,seen_at) values(true,now()) on conflict(id) do update set seen_at=now();
  select q.* into j from generation_jobs q join runs r on r.id=q.run_id
    where q.status='queued' and r.status='running' and r.expires_at>now()
    order by q.created_at limit 1 for update of q skip locked;
  if j.run_id is null then return null; end if;
  update generation_jobs set status='running',claim_id=gen_random_uuid() where run_id=j.run_id returning * into j;
  return jsonb_build_object('runId',j.run_id,'claimId',j.claim_id,'prompt',j.context,
    'files',(select working_files from projects where id=j.project_id),
    'expiresAt',(select expires_at from runs where id=j.run_id));
end; $$;

create function public.update_generation(p_run_id uuid,p_claim_id uuid,p_steps jsonb,p_files jsonb default null,p_summary text default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.generation_jobs; r public.runs; output jsonb;
begin
  -- Use the same project -> run/job lock order as stop/commit/delete.
  perform 1 from projects where id=(select project_id from generation_jobs where run_id=p_run_id) for update;
  select * into j from generation_jobs where run_id=p_run_id for update;
  if j.run_id is null or j.claim_id is distinct from p_claim_id then raise exception 'NOT_FOUND'; end if;
  if j.status='completed' then return jsonb_build_object('status','completed'); end if;
  select * into r from runs where id=p_run_id;
  if r.status<>'running' or r.expires_at<=now() then
    update generation_jobs set status='failed' where run_id=p_run_id;
    return jsonb_build_object('status','cancelled');
  end if;
  if p_steps is null or jsonb_typeof(p_steps)<>'array' or jsonb_array_length(p_steps)>200 or octet_length(p_steps::text)>100000 then
    raise exception 'INVALID_STEPS';
  end if;
  update generation_jobs set steps=p_steps where run_id=p_run_id;
  insert into generation_worker(id,seen_at) values(true,now()) on conflict(id) do update set seen_at=now();
  -- Only service_role can invoke this wrapper; ownership comes from the immutable job.
  perform set_config('request.jwt.claim.sub',j.owner_id::text,true);
  if p_error is not null then
    perform fail_run(j.project_id,p_run_id,p_error);
    update generation_jobs set status='failed' where run_id=p_run_id;
    return jsonb_build_object('status','failed');
  elsif p_files is not null then
    output := commit_version(j.project_id,r.base_revision,p_files,p_summary,'ai',p_run_id,null,p_steps);
    update generation_jobs set status='completed',result=output where run_id=p_run_id;
    return jsonb_build_object('status','completed');
  end if;
  return jsonb_build_object('status','running');
end; $$;
revoke all on function public.claim_generation() from public,anon,authenticated;
revoke all on function public.update_generation(uuid,uuid,jsonb,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.claim_generation() to service_role;
grant execute on function public.update_generation(uuid,uuid,jsonb,jsonb,text,text) to service_role;
