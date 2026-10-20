-- Phase 2: shared reporting, authenticated RPCs, RLS and private attachments.
-- Run once via Supabase migrations. No service-role key is used by the browser.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
do $$ begin
 if exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='postgis' and n.nspname<>'extensions') then
  raise exception 'PostGIS must be installed in the extensions schema. Use a fresh project or resolve its schema before applying this migration.';
 end if;
end $$;
create schema if not exists civic_private;
revoke all on schema civic_private from public;
grant usage on schema civic_private to authenticated;

create table public.agencies (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (length(name) between 1 and 160),
 categories text[] not null default '{}',
 is_demo boolean not null default false,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.service_areas (
 id uuid primary key default gen_random_uuid(), agency_id uuid not null references public.agencies,
 name text not null, district text, categories text[] not null,
 boundary extensions.geometry(MultiPolygon,4326) not null,
 priority integer not null default 0, is_demo boolean not null default false,
 source_url text, verified_at timestamptz,
 check (extensions.st_isvalid(boundary))
);
create index service_areas_boundary_idx on public.service_areas using gist(boundary);
create table public.agency_members (
 user_id uuid not null references auth.users(id) on delete cascade,
 agency_id uuid not null references public.agencies(id), primary key(user_id,agency_id)
);
create table public.workspace_admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
create table public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=100),
 created_at timestamptz not null default now()
);
create table public.incidents (
 id uuid primary key default gen_random_uuid(),
 reference bigint generated always as identity unique,
 category text not null check(category in ('water','road','lighting','other')),
 title text not null check(length(title) between 1 and 90),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 location_label text not null default '' check(length(location_label)<=200),
 point extensions.geography(Point,4326) generated always as
  (extensions.st_setsrid(extensions.st_makepoint(longitude,latitude),4326)::extensions.geography) stored,
 environment text not null check(environment in ('demo','live')),
 agency_id uuid references public.agencies(id), service_area_id uuid references public.service_areas(id),
 district text, routing_reason text not null,
 status text not null default 'Submitted' check(status in ('Submitted','Acknowledged','In progress','Resolved')),
 revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index incidents_point_idx on public.incidents using gist(point);
create index incidents_queue_idx on public.incidents(environment,agency_id,status,created_at desc);
create table public.reports (
 id uuid primary key, incident_id uuid not null references public.incidents(id),
 owner_id uuid not null references auth.users(id),
 requested_incident_id uuid references public.incidents(id),
 description text not null check(length(btrim(description)) between 1 and 1200),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 created_at timestamptz not null default now()
);
create index reports_incident_idx on public.reports(incident_id);
create index reports_owner_idx on public.reports(owner_id);
create table public.photos (
 id uuid primary key default gen_random_uuid(), report_id uuid not null references public.reports(id),
 owner_id uuid not null references auth.users(id), object_path text not null unique,
 state text not null default 'pending' check(state in ('pending','ready')),
 mime_type text not null default 'image/jpeg' check(mime_type='image/jpeg'),
 created_at timestamptz not null default now()
);
create table public.status_history (
 id uuid primary key default gen_random_uuid(), incident_id uuid not null references public.incidents(id),
 actor_id uuid not null references auth.users(id), status text not null,
 note text not null check(length(note)<=500), created_at timestamptz not null default now()
);
create index status_history_incident_idx on public.status_history(incident_id,created_at);
create table public.delivery_attempts (
 id uuid primary key default gen_random_uuid(), incident_id uuid not null references public.incidents(id),
 state text not null check(state in ('queued','sent','accepted','failed')),
 external_ticket text, error_message text, created_at timestamptz not null default now()
);

create function civic_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.workspace_admins where user_id=auth.uid());
$$;
create function civic_private.can_manage(p_incident uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (civic_private.is_admin() or exists(
  select 1 from public.incidents i join public.agency_members m on m.agency_id=i.agency_id
  where i.id=p_incident and m.user_id=auth.uid()));
$$;
create function civic_private.can_view(p_incident uuid) returns boolean language sql stable security definer set search_path='' as $$
 select civic_private.can_manage(p_incident) or exists(select 1 from public.reports r where r.incident_id=p_incident and r.owner_id=auth.uid());
$$;
create function civic_private.can_read_photo(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.photos p join public.reports r on r.id=p.report_id
 where p.object_path=p_path and p.state='ready' and (r.owner_id=auth.uid() or civic_private.can_manage(r.incident_id)));
$$;
create function civic_private.can_upload_photo(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.photos p where p.object_path=p_path and p.owner_id=auth.uid() and p.state='pending');
$$;

alter table public.agencies enable row level security;
alter table public.service_areas enable row level security;
alter table public.agency_members enable row level security;
alter table public.workspace_admins enable row level security;
alter table public.profiles enable row level security;
alter table public.incidents enable row level security;
alter table public.reports enable row level security;
alter table public.photos enable row level security;
alter table public.status_history enable row level security;
alter table public.delivery_attempts enable row level security;
create policy agencies_read on public.agencies for select to authenticated using(active);
create policy areas_read on public.service_areas for select to authenticated using(true);
create policy memberships_read on public.agency_members for select to authenticated using(user_id=auth.uid());
create policy admins_read on public.workspace_admins for select to authenticated using(user_id=auth.uid());
create policy profiles_read on public.profiles for select to authenticated using(user_id=auth.uid());
create policy incidents_read on public.incidents for select to authenticated using(civic_private.can_view(id));
create policy reports_read on public.reports for select to authenticated using(owner_id=auth.uid() or civic_private.can_manage(incident_id));
create policy photos_read on public.photos for select to authenticated using(owner_id=auth.uid() or exists(select 1 from public.reports r where r.id=report_id and civic_private.can_manage(r.incident_id)));
create policy history_read on public.status_history for select to authenticated using(civic_private.can_view(incident_id));
create policy deliveries_read on public.delivery_attempts for select to authenticated using(civic_private.can_manage(incident_id));
-- No direct browser mutations; audited functions below are the only write path.
revoke all on public.agencies,public.service_areas,public.agency_members,public.workspace_admins,public.profiles,public.incidents,public.reports,public.photos,public.status_history,public.delivery_attempts from anon,authenticated;
grant select on public.agencies,public.service_areas,public.agency_members,public.workspace_admins,public.profiles,public.incidents,public.reports,public.photos,public.delivery_attempts to authenticated;
grant select(id,incident_id,status,note,created_at) on public.status_history to authenticated;
revoke all on sequence public.incidents_reference_seq from anon,authenticated;

create function public.workspace_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('userId',auth.uid(),'isAdmin',civic_private.is_admin(),
 'agencyIds',coalesce((select jsonb_agg(agency_id) from public.agency_members where user_id=auth.uid()),'[]'::jsonb));
$$;
create function public.resolve_route(p_category text,p_lat double precision,p_lng double precision,p_environment text default 'demo') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a record;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if p_category is null or p_category not in ('water','road','lighting','other') or p_environment not in ('demo','live') or p_environment is null or p_lat is null or p_lng is null or not (p_lat between -90 and 90 and p_lng between -180 and 180) then raise exception 'Invalid location or workspace.'; end if;
 select s.*,g.name as agency_name into a from public.service_areas s join public.agencies g on g.id=s.agency_id
 where g.active and p_category=any(s.categories) and p_category=any(g.categories)
 and (p_environment='demo' or (not s.is_demo and not g.is_demo and nullif(btrim(s.source_url),'') is not null and s.verified_at is not null and s.verified_at<=now()))
 and extensions.st_covers(s.boundary,extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326))
 order by s.priority desc,s.id limit 1;
 if found then return jsonb_build_object('agencyId',a.agency_id,'agency',a.agency_name,'areaId',a.id,'area',a.name,'district',a.district,'reason','Matched service boundary and category.','isDemo',a.is_demo); end if;
 return jsonb_build_object('agencyId',null,'agency',null,'areaId',null,'area',null,'district',null,'reason','No verified service-area match. Manual routing review required.','isDemo',p_environment='demo');
end $$;
create function public.nearby_incidents(p_category text,p_lat double precision,p_lng double precision,p_environment text default 'demo') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if p_category is null or p_category not in ('water','road','lighting','other') or p_environment not in ('demo','live') or p_environment is null or p_lat is null or p_lng is null or not(p_lat between -90 and 90 and p_lng between -180 and 180) then raise exception 'Invalid location or workspace.'; end if;
 -- Only a minimal issue summary is public to signed-in residents. No descriptions,
 -- photos, resident identities, or status notes are disclosed through this lookup.
 return coalesce((select jsonb_agg(x) from (select id::text as "databaseId",'CR-'||reference as id,category,
 'Possible '||category||' issue nearby' as title,latitude as lat,longitude as lng,status
 from public.incidents where environment=p_environment and category=p_category and status<>'Resolved'
 and extensions.st_dwithin(point,extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326)::extensions.geography,60)
 order by created_at desc limit 10) x),'[]'::jsonb);
end $$;

create function public.submit_report(p_request_id uuid,p_category text,p_description text,p_lat double precision,p_lng double precision,
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
  select * into item from public.incidents where id=previous.incident_id;
  if previous.description<>btrim(p_description) or previous.latitude<>p_lat or previous.longitude<>p_lng or item.category<>p_category or item.environment<>p_environment or previous.requested_incident_id is distinct from p_existing then raise exception 'Request reference already used for different report data.'; end if;
 else
  if p_existing is not null then
   select * into item from public.incidents where id=p_existing for update;
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

create function public.complete_photo(p_report_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare path text;
begin
 select p.object_path into path from public.photos p where p.report_id=p_report_id and p.owner_id=auth.uid();
 if not found then raise exception 'Photo not found.' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='report-photos' and o.name=path and
 coalesce((o.metadata->>'size')::bigint,0) between 1 and 3145728 and o.metadata->>'mimetype'='image/jpeg') then raise exception 'A valid JPEG upload is required.'; end if;
 update public.photos set state='ready' where report_id=p_report_id and owner_id=auth.uid();
end $$;

create function public.update_incident(p_incident uuid,p_revision integer,p_status text,p_note text default '',p_agency uuid default null)
 returns void language plpgsql security definer set search_path='' as $$
declare item public.incidents;
begin
 if not civic_private.can_manage(p_incident) then raise exception 'Agency access required.' using errcode='42501'; end if;
 if p_status is null or p_status not in ('Submitted','Acknowledged','In progress','Resolved') or length(coalesce(p_note,''))>500 then raise exception 'Invalid update.'; end if;
 select * into item from public.incidents where id=p_incident for update;
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

create function public.list_workspace(p_environment text default 'demo') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if p_environment is null or p_environment not in ('demo','live') then raise exception 'Invalid workspace.'; end if;
 return jsonb_build_object('version',1,'incidents',coalesce((select jsonb_agg(payload order by updated_at desc) from (
 select i.updated_at,jsonb_build_object(
 'id','CR-'||i.reference,'databaseId',i.id,'revision',i.revision,'category',i.category,'title',i.title,'lat',i.latitude,'lng',i.longitude,
 'location',i.location_label,'status',i.status,'created',extract(epoch from i.created_at)*1000,'updated',extract(epoch from i.updated_at)*1000,
 'canManage',civic_private.can_manage(i.id),'reportCount',(select count(*) from public.reports where incident_id=i.id),
 'route',jsonb_build_object('agency',a.name,'agencyId',i.agency_id,'area',s.name,'district',i.district,'reason',i.routing_reason,'isDemo',i.environment='demo'),
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

-- Supabase Storage enforces size/type limits as well as path ownership.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('report-photos','report-photos',false,3145728,array['image/jpeg']);
create policy civic_photos_insert on storage.objects for insert to authenticated
 with check(bucket_id='report-photos' and civic_private.can_upload_photo(name));
create policy civic_photos_select on storage.objects for select to authenticated
 using(bucket_id='report-photos' and civic_private.can_read_photo(name));
-- Uploads are immutable; retries reuse an existing object rather than overwriting it.

revoke all on all functions in schema civic_private from public,anon;
grant execute on all functions in schema civic_private to authenticated;
revoke all on function public.workspace_access(),public.resolve_route(text,double precision,double precision,text),
 public.nearby_incidents(text,double precision,double precision,text),
 public.submit_report(uuid,text,text,double precision,double precision,text,text,uuid,boolean),
 public.complete_photo(uuid),public.update_incident(uuid,integer,text,text,uuid),public.list_workspace(text) from public,anon;
grant execute on function public.workspace_access(),public.resolve_route(text,double precision,double precision,text),
 public.nearby_incidents(text,double precision,double precision,text),
 public.submit_report(uuid,text,text,double precision,double precision,text,text,uuid,boolean),
 public.complete_photo(uuid),public.update_incident(uuid,integer,text,text,uuid),public.list_workspace(text) to authenticated;
