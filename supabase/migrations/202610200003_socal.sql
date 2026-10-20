-- Real geographic context is separate from asset ownership and agency delivery.
create table public.routing_datasets(kind text primary key,source jsonb not null,imported_at timestamptz not null default now());
create table public.routing_features(
 kind text not null references public.routing_datasets(kind),source_id text not null,name text not null,properties jsonb not null,
 boundary extensions.geometry(MultiPolygon,4326) not null check(extensions.st_isvalid(boundary)),primary key(kind,source_id)
);
create index routing_features_boundary_idx on public.routing_features using gist(boundary);
create table public.routing_contacts(kind text not null,source_id text not null,categories text[] not null,contact jsonb not null,primary key(kind,source_id));
alter table public.routing_datasets enable row level security;
alter table public.routing_features enable row level security;
alter table public.routing_contacts enable row level security;
revoke all on public.routing_datasets,public.routing_features,public.routing_contacts from public,anon,authenticated;
-- Public source material is available through the sanitized resolver, not editable by users.
alter table public.incidents add column routing_snapshot jsonb;

alter function public.resolve_route(text,double precision,double precision,text) set schema civic_private;
alter function civic_private.resolve_route(text,double precision,double precision,text) rename to resolve_fixture_route;
revoke all on function civic_private.resolve_fixture_route(text,double precision,double precision,text) from public,anon,authenticated;

create function public.resolve_route(p_category text,p_lat double precision,p_lng double precision,p_environment text default 'demo') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
 pt extensions.geometry; c record; city record; water record; contact jsonb; sources jsonb;
 county_count integer; city_count integer; water_count integer; district_count integer; district_name text;
 border boolean; district_border boolean; water_border boolean; result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 if p_category is null or p_category not in ('water','road','lighting','other') or p_environment is null or p_environment not in ('demo','live') or p_lat is null or p_lng is null or not(p_lat between -90 and 90 and p_lng between -180 and 180) then raise exception 'Invalid location or workspace.';end if;
 if p_environment='demo' then return civic_private.resolve_fixture_route(p_category,p_lat,p_lng,p_environment);end if;
 pt:=extensions.st_setsrid(extensions.st_makepoint(p_lng,p_lat),4326);
 result:=jsonb_build_object('agency',null,'agencyId',null,'areaId',null,'area',null,'district',null,'county',null,'city',null,'provider',null,'suggestedAgency',null,'isDemo',false,'coverage','socal','delivery','manual','sources','[]'::jsonb);
 select count(*) into county_count from public.routing_features where kind='counties' and extensions.st_covers(boundary,pt);
 if county_count<>1 then return result||jsonb_build_object('reason','Outside the ten-county SoCal area or on an ambiguous county boundary. Manual location review required.');end if;
 select * into c from public.routing_features where kind='counties' and extensions.st_covers(boundary,pt);
 select count(*) into city_count from public.routing_features where kind='cities' and extensions.st_covers(boundary,pt);
 select * into city from public.routing_features where kind='cities' and extensions.st_covers(boundary,pt) limit 1;
 select exists(select 1 from public.routing_features where kind in ('counties','cities') and extensions.st_dwithin(extensions.st_boundary(boundary)::extensions.geography,pt::extensions.geography,100)) into border;
 select count(*),min(name) into district_count,district_name from public.routing_features where kind='districts' and extensions.st_covers(boundary,pt);
 select exists(select 1 from public.routing_features where kind='districts' and extensions.st_dwithin(extensions.st_boundary(boundary)::extensions.geography,pt::extensions.geography,100)) into district_border;
 district_border:=district_border or district_count<>1 or current_date not between date '2025-01-03' and date '2027-01-02';
 select jsonb_agg(source order by kind) into sources from public.routing_datasets where kind in ('counties','cities','districts');
 result:=result||jsonb_build_object('county',c.name,'city',case when city_count=1 then city.name end,'area',case when city_count=1 then city.name when city_count>1 then 'City jurisdiction needs review' else 'Unincorporated area' end||' · '||c.name||' County','district',case when not district_border then district_name||' · 119th Congress' end,'boundaryReview',border,'districtReview',district_border,'sources',sources);
 if p_category='water' then
  select count(*) into water_count from public.routing_features where kind='water' and extensions.st_covers(boundary,pt);
  result:=result||jsonb_build_object('providers',coalesce((select jsonb_agg(properties order by source_id) from public.routing_features where kind='water' and extensions.st_covers(boundary,pt)),'[]'::jsonb));
  result:=jsonb_set(result,'{sources}',sources||coalesce((select jsonb_build_array(source) from public.routing_datasets where kind='water'),'[]'::jsonb));
  if water_count=1 then
   select * into water from public.routing_features where kind='water' and extensions.st_covers(boundary,pt);
   select r.contact into contact from public.routing_contacts r where kind='water' and source_id=water.source_id;
   select exists(select 1 from public.routing_features where kind='water' and extensions.st_dwithin(extensions.st_boundary(boundary)::extensions.geography,pt::extensions.geography,25)) into water_border;
   result:=result||jsonb_build_object('provider',water.name,'providerVerifiedAt',water.properties->>'verifiedAt','waterBoundaryReview',water_border,'suggestedAgency',coalesce(contact->>'name',water.name),'intake',contact,'reason',case when water_border then 'Near a water-service boundary. Verify the provider before forwarding.' when contact is not null then 'One verified water-service area matched. Official leak contact available; confirm public-pipe ownership before forwarding.' else 'Water provider identified. Its leak intake and asset ownership still need verification.' end);
  else result:=result||jsonb_build_object('reason',case when water_count>1 then 'Overlapping verified water-service areas. A coordinator must confirm the provider.' else 'No verified retail water-service area matched. A coordinator must check the water provider.' end);end if;
 elsif p_category in ('road','lighting') then
  if not border and city_count<=1 then select r.contact into contact from public.routing_contacts r where r.kind=case when city_count=1 then 'city' else 'county' end and r.source_id=case when city_count=1 then city.source_id else c.source_id end and p_category=any(r.categories);end if;
  result:=result||jsonb_build_object('suggestedAgency',contact->>'name','intake',contact,'highwayContact',jsonb_build_object('name','Caltrans · State highway maintenance','url','https://csr.dot.ca.gov/'),'reason',case when border then 'Near a city or county boundary. Verify jurisdiction and asset ownership.' when contact is not null then 'Official local intake identified. Check whether this is a local public asset, a state highway, a utility-owned light, or private property before forwarding.' else 'Jurisdiction identified. A verified department intake and asset ownership are still needed.' end);
 else result:=result||jsonb_build_object('reason','Jurisdiction identified. This category needs department review.');end if;
 if contact is not null then result:=jsonb_set(result,'{sources}',(result->'sources')||jsonb_build_array(jsonb_build_object('id','intake','url',contact->>'url','retrievedAt',coalesce(contact->>'checkedAt','2026-10-20'))));end if;
 return result;
end $$;
revoke all on function public.resolve_route(text,double precision,double precision,text) from public,anon;
grant execute on function public.resolve_route(text,double precision,double precision,text) to authenticated;

create function civic_private.capture_routing() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' and new.environment='live' then
  new.routing_snapshot:=public.resolve_route(new.category,new.latitude,new.longitude,new.environment);
 elsif TG_OP='UPDATE' and new.agency_id is distinct from old.agency_id and new.routing_snapshot is not null then
  new.routing_snapshot:=new.routing_snapshot||jsonb_build_object('agencyId',new.agency_id,'agency',(select name from public.agencies where id=new.agency_id),'reason','Manually assigned by workspace coordinator.');
 end if;
 return new;
end $$;
revoke all on function civic_private.capture_routing() from public,anon,authenticated;
create trigger incidents_routing_snapshot before insert or update on public.incidents for each row execute function civic_private.capture_routing();

create or replace function public.list_workspace(p_environment text default 'demo') returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 if p_environment is null or p_environment not in ('demo','live') then raise exception 'Invalid workspace.'; end if;
 return jsonb_build_object('version',1,'incidents',coalesce((select jsonb_agg(payload order by updated_at desc) from (
 select i.updated_at,jsonb_build_object(
 'id','CR-'||i.reference,'databaseId',i.id,'revision',i.revision,'category',i.category,'title',i.title,'lat',i.latitude,'lng',i.longitude,
 'location',i.location_label,'status',i.status,'created',extract(epoch from i.created_at)*1000,'updated',extract(epoch from i.updated_at)*1000,
 'canManage',civic_private.can_manage(i.id),'reportCount',(select count(*) from public.reports where incident_id=i.id),
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
