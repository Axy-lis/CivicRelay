-- Soft deletion removes an entire incident and supporting reports from active
-- views while retaining evidence and attribution for a later retention policy.
alter table public.incidents add column deleted_at timestamptz;
alter table public.incidents add column deleted_by uuid references auth.users(id);

create or replace function civic_private.can_manage(p_incident uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.incidents i where i.id=p_incident and i.deleted_at is null and
 (civic_private.is_admin() or exists(select 1 from public.agency_members m where m.agency_id=i.agency_id and m.user_id=auth.uid())));
$$;
create or replace function civic_private.can_view(p_incident uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.incidents i where i.id=p_incident and i.deleted_at is null and
 (civic_private.can_manage(i.id) or exists(select 1 from public.reports r where r.incident_id=i.id and r.owner_id=auth.uid())));
$$;
create or replace function civic_private.can_read_photo(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.photos p join public.reports r on r.id=p.report_id join public.incidents i on i.id=r.incident_id
 where p.object_path=p_path and p.state='ready' and i.deleted_at is null and (r.owner_id=auth.uid() or civic_private.can_manage(i.id)));
$$;
create or replace function civic_private.can_upload_photo(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.photos p join public.reports r on r.id=p.report_id join public.incidents i on i.id=r.incident_id
 where p.object_path=p_path and p.owner_id=auth.uid() and p.state='pending' and i.deleted_at is null);
$$;
drop policy reports_read on public.reports;
create policy reports_read on public.reports for select to authenticated using(civic_private.can_view(incident_id) and (owner_id=auth.uid() or civic_private.can_manage(incident_id)));
drop policy photos_read on public.photos;
create policy photos_read on public.photos for select to authenticated using(exists(select 1 from public.reports r where r.id=report_id and civic_private.can_view(r.incident_id) and (r.owner_id=auth.uid() or civic_private.can_manage(r.incident_id))));

create function public.delete_incident(p_incident uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare item public.incidents;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 select * into item from public.incidents where id=p_incident for update;
 if not found then raise exception 'Agency access required.' using errcode='42501';end if;
 if not(civic_private.is_admin() or exists(select 1 from public.agency_members m where m.user_id=auth.uid() and m.agency_id=item.agency_id)) then raise exception 'Agency access required.' using errcode='42501';end if;
 -- Allow a retry after a successful deletion whose response was lost.
 if item.deleted_at is not null then return;end if;
 if p_revision is distinct from item.revision then raise exception 'This report changed. Refresh and review before deleting.' using errcode='40001';end if;
 update public.incidents set deleted_at=now(),deleted_by=auth.uid(),updated_at=now(),revision=revision+1 where id=item.id;
 insert into public.status_history(incident_id,actor_id,status,note) values(item.id,auth.uid(),'Deleted','Report and supporting evidence removed from active views by agency staff.');
end $$;
revoke all on function public.delete_incident(uuid,integer) from public,anon;
grant execute on function public.delete_incident(uuid,integer) to authenticated;

create or replace function public.nearby_incidents(p_category text,p_lat double precision,p_lng double precision,p_environment text default 'demo') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if p_category is null or p_category not in ('water','road','lighting','other') or p_environment not in ('demo','live') or p_environment is null or p_lat is null or p_lng is null or not(p_lat between -90 and 90 and p_lng between -180 and 180) then raise exception 'Invalid location or workspace.'; end if;
 -- Only a minimal issue summary is public to signed-in residents. No descriptions,
 -- photos, resident identities, or status notes are disclosed through this lookup.
 return coalesce((select jsonb_agg(x) from (select id::text as "databaseId",'CR-'||reference as id,category,
 'Possible '||category||' issue nearby' as title,latitude as lat,longitude as lng,status
 from public.incidents where deleted_at is null and environment=p_environment and category=p_category and status<>'Resolved'
 and extensions.st_dwithin(point,extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography,60)
 order by created_at desc limit 10) x),'[]'::jsonb);
end $$;

create or replace function public.submit_report(p_request_id uuid,p_category text,p_description text,p_lat double precision,p_lng double precision,
 p_location text default '',p_environment text default 'demo',p_existing uuid default null,p_has_photo boolean default false)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); item public.incidents; previous public.reports; routing jsonb; path text;
begin
 if who is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if p_request_id is null or p_category is null or p_category not in ('water','road','lighting','other') or p_description is null or length(btrim(p_description)) not between 1 and 1200
 or p_lat is null or p_lng is null or not(p_lat between -90 and 90 and p_lng between -180 and 180)
 or p_environment is null or p_environment not in ('demo','live') or length(coalesce(p_location,''))>200 then raise exception 'Invalid report fields.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into previous from public.reports where id=p_request_id;
 if found then
  if previous.owner_id<>who then raise exception 'Request reference unavailable.' using errcode='42501'; end if;
  select * into item from public.incidents where id=previous.incident_id for update;
  if item.deleted_at is not null then raise exception 'This report was deleted. Start a new report.';end if;
  if previous.description<>btrim(p_description) or previous.latitude<>p_lat or previous.longitude<>p_lng or item.category<>p_category or item.environment<>p_environment or previous.requested_incident_id is distinct from p_existing then raise exception 'Request reference already used for different report data.'; end if;
 else
  if p_existing is not null then
   select * into item from public.incidents where id=p_existing and deleted_at is null for update;
   if not found or item.environment<>p_environment or item.category<>p_category or item.status='Resolved'
   or not extensions.st_dwithin(item.point,extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography,60) then raise exception 'Incident is no longer a nearby duplicate. Review your report.'; end if;
   update public.incidents set updated_at=now(),revision=revision+1 where id=item.id;
  else
   routing:=public.resolve_route(p_category,p_lat,p_lng,p_environment);
   insert into public.incidents(category,title,latitude,longitude,location_label,environment,agency_id,service_area_id,district,routing_reason)
   values(p_category,case p_category when 'water' then 'Water leak reported' when 'road' then 'Road damage reported' when 'lighting' then 'Streetlight issue reported' else 'Issue needs review' end,p_lat,p_lng,coalesce(p_location,''),p_environment,(routing->>'agencyId')::uuid,(routing->>'areaId')::uuid,routing->>'district',routing->>'reason') returning * into item;
  end if;
  insert into public.reports(id,incident_id,owner_id,requested_incident_id,description,latitude,longitude) values(p_request_id,item.id,who,p_existing,btrim(p_description),p_lat,p_lng);
  insert into public.status_history(incident_id,actor_id,status,note) values(item.id,who,item.status,
   case when p_existing is null then 'Saved in Civic Relay. External delivery is not connected.' else 'A resident added supporting evidence.' end);
 end if;
 if p_has_photo then
  path:=who::text||'/'||p_request_id::text||'.jpg';
  insert into public.photos(report_id,owner_id,object_path) values(p_request_id,who,path) on conflict(object_path) do nothing;
 end if;
 return jsonb_build_object('databaseId',item.id,'id','CR-'||item.reference,'reportId',p_request_id,'photoPath',path);
end $$;

create or replace function public.complete_photo(p_report_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare path text;
begin
 select p.object_path into path from public.photos p join public.reports r on r.id=p.report_id join public.incidents i on i.id=r.incident_id where p.report_id=p_report_id and p.owner_id=auth.uid() and i.deleted_at is null for update of i;
 if not found then raise exception 'Photo not found.' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='report-photos' and o.name=path and
 coalesce((o.metadata->>'size')::bigint,0) between 1 and 3145728 and o.metadata->>'mimetype'='image/jpeg') then raise exception 'A valid JPEG upload is required.'; end if;
 update public.photos set state='ready' where report_id=p_report_id and owner_id=auth.uid();
end $$;

create or replace function public.update_incident(p_incident uuid,p_revision integer,p_status text,p_note text default '',p_agency uuid default null)
 returns void language plpgsql security definer set search_path='' as $$
declare item public.incidents;
begin
 if not civic_private.can_manage(p_incident) then raise exception 'Agency access required.' using errcode='42501'; end if;
 if p_status is null or p_status not in ('Submitted','Acknowledged','In progress','Resolved') or length(coalesce(p_note,''))>500 then raise exception 'Invalid update.'; end if;
 select * into item from public.incidents where id=p_incident for update;
 if item.deleted_at is not null or not civic_private.can_manage(p_incident) then raise exception 'Agency access required.' using errcode='42501';end if;
 if p_revision is distinct from item.revision then raise exception 'This report changed. Refresh and review before saving.' using errcode='40001'; end if;
 if p_agency is not null then
  if not civic_private.is_admin() then raise exception 'Only coordinators can reassign departments.' using errcode='42501'; end if;
  if not exists(select 1 from public.agencies where id=p_agency and active and (item.environment='demo' or not is_demo)) then raise exception 'Agency is unavailable for this workspace.'; end if;
 end if;
 update public.incidents set status=p_status,updated_at=now(),revision=revision+1,
 agency_id=coalesce(p_agency,agency_id),routing_reason=case when p_agency is null then routing_reason else 'Manually assigned by workspace coordinator.' end where id=p_incident;
 insert into public.status_history(incident_id,actor_id,status,note) values(p_incident,auth.uid(),p_status,
 coalesce(nullif(btrim(p_note),''),case when p_agency is not null then 'Department assignment updated.' else 'Status updated by agency staff.' end));
end $$;
