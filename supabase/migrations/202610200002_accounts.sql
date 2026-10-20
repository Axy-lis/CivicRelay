-- Phase 3: profiles, staff administration, and privacy-aware audit attribution.
create table public.membership_history (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references auth.users(id),
 user_id uuid not null references auth.users(id),
 agency_id uuid not null references public.agencies(id),
 action text not null check(action in ('granted','revoked')),
 created_at timestamptz not null default now()
);
alter table public.membership_history enable row level security;
revoke all on public.membership_history from anon,authenticated;
grant select on public.membership_history to authenticated;
create policy membership_history_admin on public.membership_history for select to authenticated using(civic_private.is_admin());

create or replace function public.workspace_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('userId',auth.uid(),'isAdmin',civic_private.is_admin(),
 'displayName',coalesce((select display_name from public.profiles where user_id=auth.uid()),''),
 'role',case when civic_private.is_admin() then 'coordinator' when exists(select 1 from public.agency_members where user_id=auth.uid()) then 'agency' else 'resident' end,
 'agencyIds',coalesce((select jsonb_agg(agency_id) from public.agency_members where user_id=auth.uid()),'[]'::jsonb),
 'agencyNames',coalesce((select jsonb_agg(a.name order by a.name) from public.agency_members m join public.agencies a on a.id=m.agency_id where m.user_id=auth.uid()),'[]'::jsonb));
$$;
create function public.save_profile(p_name text) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 100 then raise exception 'Enter a display name between 1 and 100 characters.'; end if;
 insert into public.profiles(user_id,display_name) values(auth.uid(),btrim(p_name))
 on conflict(user_id) do update set display_name=excluded.display_name;
end $$;
create function public.agency_memberships() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not civic_private.is_admin() then raise exception 'Coordinator access required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'agencyId',m.agency_id,'agency',a.name,
 'displayName',coalesce(p.display_name,'Agency staff')) order by a.name,m.user_id)
 from public.agency_members m join public.agencies a on a.id=m.agency_id left join public.profiles p on p.user_id=m.user_id),'[]'::jsonb);
end $$;
create function public.set_agency_member(p_user uuid,p_agency uuid,p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if not civic_private.is_admin() then raise exception 'Coordinator access required.' using errcode='42501'; end if;
 if p_user is null or p_agency is null or p_enabled is null then raise exception 'Choose an existing account and department.'; end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'Account not found. Ask the staff member to create an account first.'; end if;
 if not exists(select 1 from public.agencies where id=p_agency and (active or not p_enabled)) then raise exception 'Department not available.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text||p_agency::text,0));
 if p_enabled then
  insert into public.agency_members(user_id,agency_id) values(p_user,p_agency) on conflict do nothing;
 else
  delete from public.agency_members where user_id=p_user and agency_id=p_agency;
 end if;
 get diagnostics changed=row_count;
 if changed>0 then
  insert into public.membership_history(actor_id,user_id,agency_id,action)
  values(auth.uid(),p_user,p_agency,case when p_enabled then 'granted' else 'revoked' end);
 end if;
end $$;
create function public.incident_audit(p_incident uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not civic_private.can_view(p_incident) then raise exception 'Report access required.' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('status',h.status,'at',extract(epoch from h.created_at)*1000,'note',h.note,
 'actor',case when h.actor_id=auth.uid() then 'You'
  when civic_private.can_manage(p_incident) then coalesce(nullif(p.display_name,''),'Account '||left(h.actor_id::text,8))
  else 'Report update' end,
 'actorId',case when civic_private.can_manage(p_incident) then h.actor_id else null end) order by h.created_at)
 from public.status_history h left join public.profiles p on p.user_id=h.actor_id where h.incident_id=p_incident),'[]'::jsonb);
end $$;
revoke all on function public.workspace_access(),public.save_profile(text),public.agency_memberships(),public.set_agency_member(uuid,uuid,boolean),public.incident_audit(uuid) from public,anon;
grant execute on function public.workspace_access(),public.save_profile(text),public.agency_memberships(),public.set_agency_member(uuid,uuid,boolean),public.incident_audit(uuid) to authenticated;
