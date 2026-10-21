create or replace function public.commit_version(
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
  -- Conversational turns complete atomically without manufacturing a code version.
  if p_source = 'ai' and p_files = p.working_files then
    insert into public.messages(project_id, run_id, role, content, steps)
      values(p_project_id, p_run_id, 'assistant', left(p_summary, 4000), p_steps) returning * into m;
    update public.runs set status = 'completed', finished_at = now() where id = p_run_id;
    update public.projects set active_run_id = null, updated_at = now()
      where id = p_project_id returning * into p;
    return jsonb_build_object('project', to_jsonb(p), 'version', null, 'message', to_jsonb(m));
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
