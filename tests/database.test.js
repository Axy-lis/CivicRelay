import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {postgis} from '@electric-sql/pglite-postgis';

const USER='30000000-0000-4000-8000-000000000001';
const OTHER='30000000-0000-4000-8000-000000000002';
const STAFF='30000000-0000-4000-8000-000000000003';
const ADMIN='30000000-0000-4000-8000-000000000004';
const ROAD='10000000-0000-4000-8000-000000000002';
const WATER='10000000-0000-4000-8000-000000000001';
const ID='40000000-0000-4000-8000-000000000001';
let db;let incident;
const actor=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
const rpc=async(name,args=[])=>{const slots=args.map((_,i)=>'$'+(i+1)).join(',');const r=await db.query(`select public.${name}(${slots}) as result`,args);return r.rows[0].result;};
const submit=(id=ID,category='water',description='A real test report',lat=37.326,lng=-121.91,env='demo',existing=null,hasPhoto=false)=>rpc('submit_report',[id,category,description,lat,lng,'Test location',env,existing,hasPhoto]);

test('database integration: real PostgreSQL/PostGIS migrations and access controls',async t=>{
 db=new PGlite({extensions:{postgis}});
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;
 insert into auth.users values('${USER}'),('${OTHER}'),('${STAFF}'),('${ADMIN}');`);
 await db.exec(await readFile(new URL('../supabase/migrations/202610200001_backend.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
 await db.exec(`insert into public.agency_members values('${STAFF}','${WATER}');insert into public.workspace_admins values('${ADMIN}');`);
 await db.exec(`insert into public.agencies(id,name,categories,is_demo) values('10000000-0000-4000-8000-000000000004','Live Test Roads',array['road'],false);
 insert into public.service_areas(agency_id,name,categories,boundary,is_demo,source_url,verified_at)
 values('10000000-0000-4000-8000-000000000004','Verified test polygon',array['road'],extensions.st_multi(extensions.st_makeenvelope(-119,33,-117,35,4326)),false,'https://example.test/source',now());`);
 await actor(USER);
 await t.test('routes test fixtures, excludes them from live, includes boundary deterministically',async()=>{
  assert.equal((await rpc('resolve_route',['water',37.326,-121.91,'demo'])).agency,'Demo Water Services');
  assert.equal((await rpc('resolve_route',['water',37.33,-121.895,'demo'])).area,'West service area');
  assert.equal((await rpc('resolve_route',['water',37.326,-121.91,'live'])).agency,null);
  assert.equal((await rpc('resolve_route',['road',34,-118,'live'])).agency,'Live Test Roads');
 });
 await t.test('atomic submission is idempotent and validates fields',async()=>{
  const a=await submit();incident=a.databaseId;const again=await submit();assert.equal(a.id,again.id);
  assert.equal((await db.query('select count(*)::int n from public.reports')).rows[0].n,1);
  await assert.rejects(()=>submit(ID,'water','Different report'),/already used/);
  await assert.rejects(()=>submit(crypto.randomUUID(),'water',' ',100,0),/Invalid/);
 });
 await t.test('residents see own reports but cannot update incidents, grant roles, or enumerate private evidence',async()=>{
  assert.equal((await rpc('list_workspace',['demo'])).incidents.length,1);
  await assert.rejects(()=>rpc('update_incident',[incident,1,'Resolved','',null]),/access required/);
  await assert.rejects(()=>db.exec('select actor_id from public.status_history'),/permission denied/);
  await assert.rejects(()=>db.exec(`insert into public.workspace_admins values('${USER}')`),/permission denied/);
  await actor(OTHER);assert.equal((await rpc('list_workspace',['demo'])).incidents.length,0);
  assert.equal((await db.query('select * from public.reports')).rows.length,0);
  const nearby=await rpc('nearby_incidents',['water',37.326,-121.91,'demo']);assert.equal(nearby.length,1);assert.equal(nearby[0].description,undefined);assert.equal(nearby[0].title,'Possible water issue nearby');
 });
 await t.test('supporting reports join one incident without exposing other resident evidence',async()=>{
  await submit('40000000-0000-4000-8000-000000000002','water','Supporting evidence',37.326,-121.91,'demo',incident);
  const state=await rpc('list_workspace',['demo']);assert.equal(state.incidents.length,1);assert.equal(state.incidents[0].reports.length,1);assert.equal(state.incidents[0].reportCount,2);
  await assert.rejects(()=>submit(crypto.randomUUID(),'road','Wrong category',37.326,-121.91,'demo',incident),/no longer/);
 });
 await t.test('staff scoped to assignment; stale revisions rejected; residents receive updates',async()=>{
  await actor(STAFF);let item=(await rpc('list_workspace',['demo'])).incidents[0];assert.equal(item.reports.length,2);
  await rpc('update_incident',[incident,item.revision,'In progress','Inspection scheduled',null]);
  await assert.rejects(()=>rpc('update_incident',[incident,item.revision,'Resolved','',null]),/changed/);
  await assert.rejects(()=>rpc('update_incident',[incident,item.revision+1,'In progress','',ROAD]),/coordinators/);
  await actor(USER);item=(await rpc('list_workspace',['demo'])).incidents[0];assert.equal(item.status,'In progress');assert.equal(item.history.at(-1).note,'Inspection scheduled');
 });
 await t.test('report survives failed photo; only owner can upload to reserved path',async()=>{
  const id='40000000-0000-4000-8000-000000000003';const a=await submit(id,'water','Photo test',37.326,-121.91,'demo',null,true);
  assert.equal((await rpc('list_workspace',['demo'])).incidents.some(i=>i.databaseId===a.databaseId),true);
  await assert.rejects(()=>rpc('complete_photo',[id]),/valid JPEG/);
  await actor(OTHER);await assert.rejects(()=>db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['report-photos',a.photoPath,{size:10,mimetype:'image/jpeg'}]),/row-level security/);
  await actor(USER);await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['report-photos',a.photoPath,{size:10,mimetype:'image/jpeg'}]);await rpc('complete_photo',[id]);
  await actor(OTHER);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  await actor(STAFF);assert.equal((await db.query('select * from storage.objects')).rows.length,1);
 });
 await t.test('unassigned live report requires coordinator; reassignment removes previous staff access',async()=>{
  await actor(USER);const live=await submit(crypto.randomUUID(),'water','Live record',37.326,-121.91,'live');
  await actor(STAFF);assert.equal((await rpc('list_workspace',['live'])).incidents.length,0);
  await actor(ADMIN);assert.equal((await rpc('list_workspace',['live'])).incidents.length,1);
  await assert.rejects(()=>rpc('update_incident',[live.databaseId,1,'Acknowledged','',WATER]),/unavailable/);
  const item=(await rpc('list_workspace',['demo'])).incidents.find(i=>i.databaseId===incident);
  await rpc('update_incident',[incident,item.revision,'In progress','Rerouted',ROAD]);
  await actor(STAFF);assert.equal((await rpc('list_workspace',['demo'])).incidents.some(i=>i.databaseId===incident),false);
 });
 await t.test('anonymous sessions cannot invoke write functions',async()=>{
  await actor('','anon');await assert.rejects(()=>submit(crypto.randomUUID()),/permission denied/);
 });
 }finally{await db.close();}
});
