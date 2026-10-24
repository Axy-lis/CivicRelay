begin;
-- This adds non-emergency records and official contact handoffs, not dispatch.
alter table public.incidents drop constraint incidents_category_check;
alter table public.incidents add constraint incidents_category_check check(category in ('water','road','lighting','other','safety'));
alter table public.incidents add column non_emergency_confirmed boolean not null default false;
alter table public.incidents add constraint incidents_safety_confirmation check(category<>'safety' or non_emergency_confirmed);

insert into public.agencies(id,name,categories,is_demo) values('10000000-0000-4000-8000-000000000009','Demo Public Safety',array['safety'],true) on conflict(id) do nothing;
insert into public.service_areas(id,agency_id,name,district,categories,boundary,is_demo,priority)
select ('20000000-0000-4000-8000-'||lpad((21+side)::text,12,'0'))::uuid,'10000000-0000-4000-8000-000000000009'::uuid,
case when side=0 then 'West service area' else 'East service area' end,case when side=0 then 'District A' else 'District B' end,array['safety'],
extensions.st_multi(extensions.st_makeenvelope(case when side=0 then -121.94 else -121.895 end,37.30,case when side=0 then -121.895 else -121.85 end,37.36,4326)),true,case when side=0 then 1 else 0 end
from generate_series(0,1) side on conflict(id) do nothing;

alter function public.resolve_route(text,double precision,double precision,text) set schema civic_private;
alter function civic_private.resolve_route(text,double precision,double precision,text) rename to resolve_infrastructure_route;
revoke all on function civic_private.resolve_infrastructure_route(text,double precision,double precision,text) from public,anon,authenticated;
create function public.resolve_route(p_category text,p_lat double precision,p_lng double precision,p_environment text default 'demo') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;contact jsonb;pt extensions.geometry;a record;city_count integer;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 if p_category is null or p_category not in ('water','road','lighting','other','safety') or p_environment is null or p_environment not in ('demo','live') or p_lat is null or p_lng is null or not(p_lat between -90 and 90 and p_lng between -180 and 180) then raise exception 'Invalid location or workspace.';end if;
 if p_category<>'safety' then return civic_private.resolve_infrastructure_route(p_category,p_lat,p_lng,p_environment);end if;
 pt:=extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326);
 if p_environment='demo' then
  select s.*,g.name as agency_name into a from public.service_areas s join public.agencies g on g.id=s.agency_id where s.is_demo and g.is_demo and g.active and 'safety'=any(s.categories) and 'safety'=any(g.categories) and extensions.st_covers(s.boundary,pt) order by s.priority desc,s.id limit 1;
  if found then return jsonb_build_object('agencyId',a.agency_id,'agency',a.agency_name,'areaId',a.id,'area',a.name,'district',a.district,'isDemo',true,'sensitive',true,'reason','Fictional safety department match. Demo only; no police notified.');end if;
  return jsonb_build_object('agency',null,'area',null,'district',null,'isDemo',true,'sensitive',true,'reason','Outside demo service areas. Manual jurisdiction review required; no police notified.');
 end if;
 r:=civic_private.resolve_infrastructure_route('other',p_lat,p_lng,p_environment)||jsonb_build_object('sensitive',true,'reason','No verified non-emergency contact for this location. A coordinator must verify jurisdiction; saving here does not notify police.');
 if coalesce((r->>'boundaryReview')::boolean,true) then return r||jsonb_build_object('reason',case when r->>'county' is not null then 'Near a jurisdiction boundary. A coordinator must verify the non-emergency reporting agency.' else 'No verified non-emergency contact for this location. A coordinator must verify jurisdiction; saving here does not notify police.' end);end if;
 select count(*) into city_count from public.routing_features where kind='cities' and extensions.st_covers(boundary,pt);
 if city_count<=1 then
  select c.contact into contact from public.routing_contacts c join public.routing_features f on f.source_id=c.source_id
  where c.kind=case when city_count=1 then 'safety-city' else 'safety-county' end and f.kind=case when city_count=1 then 'cities' else 'counties' end
  and 'safety'=any(c.categories) and extensions.st_covers(f.boundary,pt) limit 1;
 end if;
 if contact is not null then return r||jsonb_build_object('suggestedAgency',contact->>'name','intake',contact,'reason','Official non-emergency contact identified. Jurisdiction and report eligibility need confirmation; saving in Civic Relay does not notify police.','sources',coalesce(r->'sources','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id','non-emergency contact','url',contact->>'url','retrievedAt',contact->>'checkedAt')));end if;
 return r;
end $$;
revoke all on function public.resolve_route(text,double precision,double precision,text) from public,anon;
grant execute on function public.resolve_route(text,double precision,double precision,text) to authenticated;

create or replace function civic_private.can_manage(p_incident uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.incidents i where i.id=p_incident and i.deleted_at is null and
 (civic_private.is_admin() or exists(select 1 from public.agency_members m join public.agencies a on a.id=m.agency_id where m.agency_id=i.agency_id and m.user_id=auth.uid() and (i.category<>'safety' or (a.active and 'safety'=any(a.categories))))));
$$;

create or replace function public.nearby_incidents(p_category text,p_lat double precision,p_lng double precision,p_environment text default 'demo') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if p_category is null or p_category not in ('water','road','lighting','other','safety') or p_environment not in ('demo','live') or p_environment is null or p_lat is null or p_lng is null or not(p_lat between -90 and 90 and p_lng between -180 and 180) then raise exception 'Invalid location or workspace.'; end if;
 if p_category='safety' then return '[]'::jsonb;end if;
 -- Only a minimal issue summary is public to signed-in residents. No descriptions,
 -- photos, resident identities, or status notes are disclosed through this lookup.
 return coalesce((select jsonb_agg(x) from (select id::text as "databaseId",'CR-'||reference as id,category,
 'Possible '||category||' issue nearby' as title,latitude as lat,longitude as lng,status
 from public.incidents where deleted_at is null and environment=p_environment and category=p_category and status<>'Resolved'
 and extensions.st_dwithin(point,extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography,60)
 order by created_at desc limit 10) x),'[]'::jsonb);
end $$;

drop function public.submit_report(uuid,text,text,double precision,double precision,text,text,uuid,boolean);

create function public.submit_report(p_request_id uuid,p_category text,p_description text,p_lat double precision,p_lng double precision,
 p_location text default '',p_environment text default 'demo',p_existing uuid default null,p_has_photo boolean default false,p_non_emergency_confirmed boolean default false)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare who uuid:=auth.uid(); item public.incidents; previous public.reports; routing jsonb; path text;
begin
 if who is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if p_request_id is null or p_category is null or p_category not in ('water','road','lighting','other','safety') or p_description is null or length(btrim(p_description)) not between 1 and 1200
 or p_lat is null or p_lng is null or not(p_lat between -90 and 90 and p_lng between -180 and 180)
 or p_environment is null or p_environment not in ('demo','live') or length(coalesce(p_location,''))>200 then raise exception 'Invalid report fields.'; end if;
 if p_category='safety' and p_non_emergency_confirmed is distinct from true then raise exception 'Confirm this is a non-emergency before saving.';end if;
 if p_category='safety' and p_existing is not null then raise exception 'Safety reports cannot be attached to another resident report.';end if;
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
   insert into public.incidents(category,title,latitude,longitude,location_label,environment,agency_id,service_area_id,district,routing_reason,non_emergency_confirmed)
   values(p_category,case p_category when 'water' then 'Water leak reported' when 'road' then 'Road damage reported' when 'lighting' then 'Streetlight issue reported' when 'safety' then 'Non-emergency safety report' else 'Issue needs review' end,p_lat,p_lng,coalesce(p_location,''),p_environment,(routing->>'agencyId')::uuid,(routing->>'areaId')::uuid,routing->>'district',routing->>'reason',p_category='safety' and p_non_emergency_confirmed) returning * into item;
  end if;
  insert into public.reports(id,incident_id,owner_id,requested_incident_id,description,latitude,longitude) values(p_request_id,item.id,who,p_existing,btrim(p_description),p_lat,p_lng);
  insert into public.status_history(incident_id,actor_id,status,note) values(item.id,who,item.status,
   case when p_category='safety' then 'Saved in Civic Relay. No police report filed or police notified.' when p_existing is null then 'Saved in Civic Relay. External delivery is not connected.' else 'A resident added supporting evidence.' end);
 end if;
 if p_has_photo then
  path:=who::text||'/'||p_request_id::text||'.jpg';
  insert into public.photos(report_id,owner_id,object_path) values(p_request_id,who,path) on conflict(object_path) do nothing;
 end if;
 return jsonb_build_object('databaseId',item.id,'id','CR-'||item.reference,'reportId',p_request_id,'photoPath',path);
end $$;
revoke all on function public.submit_report(uuid,text,text,double precision,double precision,text,text,uuid,boolean,boolean) from public,anon;
grant execute on function public.submit_report(uuid,text,text,double precision,double precision,text,text,uuid,boolean,boolean) to authenticated;

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
  if not exists(select 1 from public.agencies where id=p_agency and active and (item.environment='demo' or not is_demo) and (item.category<>'safety' or 'safety'=any(categories))) then raise exception 'Department is unavailable for this category or workspace.'; end if;
 end if;
 update public.incidents set status=p_status,updated_at=now(),revision=revision+1,
 agency_id=coalesce(p_agency,agency_id),routing_reason=case when p_agency is null then routing_reason else 'Manually assigned by workspace coordinator.' end where id=p_incident;
 insert into public.status_history(incident_id,actor_id,status,note) values(p_incident,auth.uid(),p_status,
 coalesce(nullif(btrim(p_note),''),case when p_agency is not null then 'Department assignment updated.' else 'Status updated by agency staff.' end));
end $$;

create or replace function public.list_workspace(p_environment text default 'demo') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if p_environment is null or p_environment not in ('demo','live') then raise exception 'Invalid workspace.'; end if;
 return jsonb_build_object('version',1,'incidents',coalesce((select jsonb_agg(payload order by updated_at desc) from (
 select i.updated_at,jsonb_build_object(
 'id','CR-'||i.reference,'databaseId',i.id,'revision',i.revision,'category',i.category,'title',i.title,'lat',i.latitude,'lng',i.longitude,
 'location',i.location_label,'status',i.status,'created',extract(epoch from i.created_at)*1000,'updated',extract(epoch from i.updated_at)*1000,
 'nonEmergencyConfirmed',i.non_emergency_confirmed,'canManage',civic_private.can_manage(i.id),'reportCount',(select count(*) from public.reports where incident_id=i.id),
 'route',coalesce(i.routing_snapshot,jsonb_build_object('agency',a.name,'agencyId',i.agency_id,'area',s.name,'district',i.district,'reason',i.routing_reason,'isDemo',i.environment='demo')),
 'reports',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'owner',case when r.owner_id=auth.uid() then auth.uid()::text else 'resident' end,
 'description',r.description,'created',extract(epoch from r.created_at)*1000,
 'photoPath',(select p.object_path from public.photos p where p.report_id=r.id and p.state='ready' limit 1),
 'photoPending',exists(select 1 from public.photos p where p.report_id=r.id and p.state='pending'),'photo',null) order by r.created_at)
 from public.reports r where r.incident_id=i.id and (r.owner_id=auth.uid() or civic_private.can_manage(i.id))),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(jsonb_build_object('status',h.status,'at',extract(epoch from h.created_at)*1000,'note',h.note) order by h.created_at) from public.status_history h where h.incident_id=i.id),'[]'::jsonb)
 ) as payload from public.incidents i left join public.agencies a on a.id=i.agency_id left join public.service_areas s on s.id=i.service_area_id
 where i.environment=p_environment and civic_private.can_view(i.id)
 ) permitted),'[]'::jsonb));
end $$;

insert into public.routing_contacts(kind,source_id,categories,contact) values('safety-city','0644000',array['safety'],'{"id":"0644000","kind":"safety-city","name":"Los Angeles Police Department","url":"https://www.lapdonline.org/contact-us/","phone":"18772755273","categories":["safety"],"checkedAt":"2026-10-24","delivery":"manual","phoneLabel":"Non-emergency contact"}'::jsonb) on conflict(kind,source_id) do update set categories=excluded.categories,contact=excluded.contact;
insert into public.agencies(name,categories,is_demo) values('Los Angeles Police Department',array['safety'],false) on conflict(name) do update set categories=array(select distinct unnest(public.agencies.categories||excluded.categories));
insert into public.routing_contacts(kind,source_id,categories,contact) values('safety-city','0666000',array['safety'],'{"id":"0666000","kind":"safety-city","name":"San Diego Police Department","url":"https://www.sandiego.gov/police/services/file-police-report","phone":"16195312000","categories":["safety"],"checkedAt":"2026-10-24","delivery":"manual","phoneLabel":"Non-emergency contact"}'::jsonb) on conflict(kind,source_id) do update set categories=excluded.categories,contact=excluded.contact;
insert into public.agencies(name,categories,is_demo) values('San Diego Police Department',array['safety'],false) on conflict(name) do update set categories=array(select distinct unnest(public.agencies.categories||excluded.categories));
insert into public.routing_contacts(kind,source_id,categories,contact) values('safety-county','06037',array['safety'],'{"id":"06037","kind":"safety-county","name":"Los Angeles County Sheriff''s Department","url":"https://lasd.org/lasd-phone-directory/","categories":["safety"],"checkedAt":"2026-10-24","delivery":"manual","phoneLabel":"Non-emergency contact"}'::jsonb) on conflict(kind,source_id) do update set categories=excluded.categories,contact=excluded.contact;
insert into public.agencies(name,categories,is_demo) values('Los Angeles County Sheriff''s Department',array['safety'],false) on conflict(name) do update set categories=array(select distinct unnest(public.agencies.categories||excluded.categories));
insert into public.routing_contacts(kind,source_id,categories,contact) values('safety-county','06059',array['safety'],'{"id":"06059","kind":"safety-county","name":"Orange County Sheriff''s Department","url":"https://www.ocsheriff.gov/contact-us","categories":["safety"],"checkedAt":"2026-10-24","delivery":"manual","phoneLabel":"Non-emergency contact"}'::jsonb) on conflict(kind,source_id) do update set categories=excluded.categories,contact=excluded.contact;
insert into public.agencies(name,categories,is_demo) values('Orange County Sheriff''s Department',array['safety'],false) on conflict(name) do update set categories=array(select distinct unnest(public.agencies.categories||excluded.categories));
insert into public.routing_contacts(kind,source_id,categories,contact) values('safety-county','06065',array['safety'],'{"id":"06065","kind":"safety-county","name":"Riverside County Sheriff''s Office","url":"https://www.riversidesheriff.org/428/Who-to-Call","categories":["safety"],"checkedAt":"2026-10-24","delivery":"manual","phoneLabel":"Non-emergency contact"}'::jsonb) on conflict(kind,source_id) do update set categories=excluded.categories,contact=excluded.contact;
insert into public.agencies(name,categories,is_demo) values('Riverside County Sheriff''s Office',array['safety'],false) on conflict(name) do update set categories=array(select distinct unnest(public.agencies.categories||excluded.categories));
insert into public.routing_contacts(kind,source_id,categories,contact) values('safety-county','06071',array['safety'],'{"id":"06071","kind":"safety-county","name":"San Bernardino County Sheriff''s Department","url":"https://wp.sbcounty.gov/sheriff/","categories":["safety"],"checkedAt":"2026-10-24","delivery":"manual","phoneLabel":"Non-emergency contact"}'::jsonb) on conflict(kind,source_id) do update set categories=excluded.categories,contact=excluded.contact;
insert into public.agencies(name,categories,is_demo) values('San Bernardino County Sheriff''s Department',array['safety'],false) on conflict(name) do update set categories=array(select distinct unnest(public.agencies.categories||excluded.categories));
insert into public.routing_contacts(kind,source_id,categories,contact) values('safety-county','06073',array['safety'],'{"id":"06073","kind":"safety-county","name":"San Diego County Sheriff''s Office","url":"https://www.sdsheriff.gov/i-want-to/report","phone":"18588683200","categories":["safety"],"checkedAt":"2026-10-24","delivery":"manual","phoneLabel":"Non-emergency contact"}'::jsonb) on conflict(kind,source_id) do update set categories=excluded.categories,contact=excluded.contact;
insert into public.agencies(name,categories,is_demo) values('San Diego County Sheriff''s Office',array['safety'],false) on conflict(name) do update set categories=array(select distinct unnest(public.agencies.categories||excluded.categories));

create or replace function civic_private.capture_routing() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' and new.environment='live' then
  new.routing_snapshot:=public.resolve_route(new.category,new.latitude,new.longitude,new.environment);
 elsif TG_OP='UPDATE' and new.agency_id is distinct from old.agency_id and new.routing_snapshot is not null then
  new.routing_snapshot:=new.routing_snapshot||jsonb_build_object('agencyId',new.agency_id,'agency',(select name from public.agencies where id=new.agency_id),'reason','Manually assigned by workspace coordinator.');
 end if;
 return new;
end $$;

create or replace function public.delete_incident(p_incident uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare item public.incidents;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 select * into item from public.incidents where id=p_incident for update;
 if not found then raise exception 'Agency access required.' using errcode='42501';end if;
 if not(civic_private.is_admin() or exists(select 1 from public.agency_members m where m.user_id=auth.uid() and m.agency_id=item.agency_id and (item.category<>'safety' or exists(select 1 from public.agencies g where g.id=m.agency_id and g.active and 'safety'=any(g.categories))))) then raise exception 'Agency access required.' using errcode='42501';end if;
 -- Allow a retry after a successful deletion whose response was lost.
 if item.deleted_at is not null then return;end if;
 if p_revision is distinct from item.revision then raise exception 'This report changed. Refresh and review before deleting.' using errcode='40001';end if;
 update public.incidents set deleted_at=now(),deleted_by=auth.uid(),updated_at=now(),revision=revision+1 where id=item.id;
 insert into public.status_history(incident_id,actor_id,status,note) values(item.id,auth.uid(),'Deleted','Report and supporting evidence removed from active views by agency staff.');
end $$;

commit;
