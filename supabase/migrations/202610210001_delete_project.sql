-- Serialize with generation/save RPCs; only the owner can delete an idle project.
create function public.delete_project(p_project_id uuid)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.projects;
begin
  if auth.uid() is null then raise exception 'UNAUTHORIZED'; end if;
  select * into p from public.projects
    where id = p_project_id and owner_id = auth.uid() for update;
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from public.runs where id = p.active_run_id
    and status = 'running' and expires_at > now()) then
    raise exception 'PROJECT_BUSY';
  end if;
  delete from public.projects where id = p.id;
end;
$$;
revoke all on function public.delete_project(uuid) from public, anon;
grant execute on function public.delete_project(uuid) to authenticated;
