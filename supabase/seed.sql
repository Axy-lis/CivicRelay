-- Explicit test fixtures only. These are NOT real service territories.
insert into public.agencies(id,name,categories,is_demo) values
 ('10000000-0000-4000-8000-000000000001','Demo Water Services',array['water'],true),
 ('10000000-0000-4000-8000-000000000002','Demo Public Works',array['road'],true),
 ('10000000-0000-4000-8000-000000000003','Demo Street Lighting',array['lighting'],true)
on conflict(id) do nothing;
insert into public.service_areas(id,agency_id,name,district,categories,boundary,is_demo,priority)
select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,a.id,
 case when side=0 then 'West service area' else 'East service area' end,
 case when side=0 then 'District A' else 'District B' end,a.categories,
 extensions.st_multi(extensions.st_makeenvelope(case when side=0 then -121.94 else -121.895 end,37.30,
 case when side=0 then -121.895 else -121.85 end,37.36,4326)),true,case when side=0 then 1 else 0 end
from (select a.*,row_number() over(order by id)*2+side as n,side from public.agencies a cross join generate_series(0,1) side where a.is_demo and a.name<>'Demo Public Safety') a
on conflict(id) do nothing;
