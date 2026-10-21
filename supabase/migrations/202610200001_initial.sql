-- Run in Supabase SQL Editor, or apply with `supabase db push`.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  working_files jsonb not null default '{}'::jsonb,
  template_version text not null default 'react-v1',
  revision integer not null default 0,
  head_version_id uuid,
  active_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  request_key uuid not null,
  base_revision integer not null,
  status text not null default 'running' check (status in ('running','completed','failed')),
  error text,
  expires_at timestamptz not null default now() + interval '110 seconds',
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unique(project_id, request_key)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  run_id uuid references public.runs(id) on delete set null,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  steps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  number integer not null,
  files jsonb not null,
  template_version text not null default 'react-v1',
  summary text not null,
  source text not null check (source in ('ai','manual','restore')),
  restored_from_id uuid references public.versions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_id, number)
);

alter table public.projects add constraint project_head_fk foreign key (head_version_id) references public.versions(id) on delete set null;
alter table public.projects add constraint project_run_fk foreign key (active_run_id) references public.runs(id) on delete set null;
create index projects_owner_updated on public.projects(owner_id, updated_at desc);
create index messages_project_created on public.messages(project_id, created_at);
create index versions_project_number on public.versions(project_id, number desc);
create index runs_project_created on public.runs(project_id, created_at desc);

alter table public.projects enable row level security;
alter table public.messages enable row level security;
alter table public.versions enable row level security;
alter table public.runs enable row level security;

create policy own_projects_read on public.projects for select to authenticated
  using (owner_id = (select auth.uid()));
create policy own_messages_read on public.messages for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy own_versions_read on public.versions for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));
create policy own_runs_read on public.runs for select to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = (select auth.uid())));

-- Mutations only use narrow RPCs. Every SECURITY DEFINER function checks auth.uid().
revoke all on public.projects, public.messages, public.versions, public.runs from anon, authenticated;
grant select on public.projects, public.messages, public.versions, public.runs to authenticated;

create function public.create_project(p_name text, p_files jsonb)
returns public.projects
language plpgsql security definer set search_path = public, pg_temp as $$
declare result public.projects;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  if p_files is null or jsonb_typeof(p_files) <> 'object' or octet_length(p_files::text) > 350000 then
    raise exception 'INVALID_FILES';
  end if;
  insert into public.projects(owner_id, name, working_files)
    values (auth.uid(), p_name, p_files) returning * into result;
  return result;
end;
$$;

create function public.rename_project(p_project_id uuid, p_name text)
returns public.projects
language plpgsql security definer set search_path = public, pg_temp as $$
declare result public.projects;
begin
  update public.projects set name = p_name, updated_at = now()
    where id = p_project_id and owner_id = auth.uid() returning * into result;
  if result.id is null then raise exception 'NOT_FOUND'; end if;
  return result;
end;
$$;

create function public.start_run(p_project_id uuid, p_request_key uuid, p_revision integer, p_prompt text)
returns public.runs
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.projects; result public.runs;
begin
  select * into p from public.projects where id = p_project_id and owner_id = auth.uid() for update;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  if p_prompt is null or length(p_prompt) not between 1 and 4000 then raise exception 'INVALID_PROMPT'; end if;
  if p_revision is null or p.revision <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
  if exists(select 1 from public.runs where project_id = p_project_id and request_key = p_request_key) then
    raise exception 'DUPLICATE_REQUEST';
  end if;
  if p.active_run_id is not null then
    if exists(select 1 from public.runs where id = p.active_run_id and status = 'running' and expires_at > now()) then
      raise exception 'PROJECT_BUSY';
    end if;
    update public.runs set status = 'failed', error = '执行中断或超时', finished_at = now()
      where id = p.active_run_id and status = 'running';
  end if;
  insert into public.runs(project_id, request_key, base_revision)
    values (p_project_id, p_request_key, p_revision) returning * into result;
  update public.projects set active_run_id = result.id where id = p_project_id;
  insert into public.messages(project_id, run_id, role, content)
    values (p_project_id, result.id, 'user', p_prompt);
  return result;
end;
$$;

create function public.fail_run(p_project_id uuid, p_run_id uuid, p_error text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.projects;
begin
  select * into p from public.projects where id = p_project_id and owner_id = auth.uid() for update;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  update public.runs set status = 'failed', error = left(p_error, 500), finished_at = now()
    where id = p_run_id and project_id = p_project_id and status = 'running';
  if found then
    insert into public.messages(project_id, run_id, role, content)
      values(p_project_id, p_run_id, 'system', left(p_error, 500));
  end if;
  update public.projects set active_run_id = null where id = p_project_id and active_run_id = p_run_id;
end;
$$;

create function public.commit_version(
  p_project_id uuid, p_revision integer, p_files jsonb, p_summary text,
  p_source text, p_run_id uuid default null, p_restored_from uuid default null,
  p_steps jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.projects; v public.versions; m public.messages; old public.versions;
begin
  select * into p from public.projects where id = p_project_id and owner_id = auth.uid() for update;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  if p_revision is null or p.revision <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
  if p_source is null or p_source not in ('ai','manual','restore') then raise exception 'INVALID_SOURCE'; end if;

  if p_source = 'ai' then
    if p_run_id is null or p.active_run_id is distinct from p_run_id or
      not exists(select 1 from public.runs where id = p_run_id and project_id = p_project_id
        and base_revision = p_revision and status = 'running' and expires_at > now()) then
      raise exception 'RUN_EXPIRED';
    end if;
  else
    if p_run_id is not null then raise exception 'INVALID_RUN'; end if;
    if p.active_run_id is not null then
      if exists(select 1 from public.runs where id = p.active_run_id and status = 'running' and expires_at > now()) then
        raise exception 'PROJECT_BUSY';
      end if;
      update public.runs set status = 'failed', error = '执行中断或超时', finished_at = now()
        where id = p.active_run_id and status = 'running';
    end if;
  end if;

  if p_source = 'restore' then
    select * into old from public.versions where id = p_restored_from and project_id = p_project_id;
    if old.id is null then raise exception 'NOT_FOUND'; end if;
    p_files := old.files;
    p.template_version := old.template_version;
  elsif p_restored_from is not null then
    raise exception 'INVALID_RESTORE';
  end if;
  if p_files is null or jsonb_typeof(p_files) <> 'object' or octet_length(p_files::text) > 350000 or not p_files ? '/App.tsx' then
    raise exception 'INVALID_FILES';
  end if;
  insert into public.versions(project_id, number, files, template_version, summary, source, restored_from_id)
    values(p_project_id, p.revision + 1, p_files, p.template_version, left(p_summary, 4000), p_source, p_restored_from)
    returning * into v;
  update public.projects set working_files = p_files, revision = p.revision + 1,
    head_version_id = v.id, active_run_id = null, template_version = p.template_version, updated_at = now()
    where id = p_project_id returning * into p;
  insert into public.messages(project_id, run_id, role, content, steps)
    values(p_project_id, p_run_id, case when p_source = 'ai' then 'assistant' else 'system' end,
      left(p_summary, 4000), p_steps) returning * into m;
  if p_run_id is not null then
    update public.runs set status = 'completed', finished_at = now() where id = p_run_id;
  end if;
  return jsonb_build_object('project', to_jsonb(p), 'version', to_jsonb(v) - 'files', 'message', to_jsonb(m));
end;
$$;

revoke execute on function public.create_project(text,jsonb) from public, anon;
revoke execute on function public.rename_project(uuid,text) from public, anon;
revoke execute on function public.start_run(uuid,uuid,integer,text) from public, anon;
revoke execute on function public.fail_run(uuid,uuid,text) from public, anon;
revoke execute on function public.commit_version(uuid,integer,jsonb,text,text,uuid,uuid,jsonb) from public, anon;
grant execute on function public.create_project(text,jsonb) to authenticated;
grant execute on function public.rename_project(uuid,text) to authenticated;
grant execute on function public.start_run(uuid,uuid,integer,text) to authenticated;
grant execute on function public.fail_run(uuid,uuid,text) to authenticated;
grant execute on function public.commit_version(uuid,integer,jsonb,text,text,uuid,uuid,jsonb) to authenticated;
