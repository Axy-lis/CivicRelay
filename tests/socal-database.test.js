import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {postgis} from '@electric-sql/pglite-postgis';
import {coverageSQL} from '../scripts/build-socal-sql.mjs';
import {createSoCalRouter} from '../dist/socal.js';

test('SoCal PostGIS import, live resolver, immutable source context, and authorization',async()=>{
 const db=new PGlite({extensions:{postgis}}),user='30000000-0000-4000-8000-000000000001';
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
   alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;
   insert into auth.users values('${user}');`);
  for(const name of ['202610200001_backend.sql','202610200002_accounts.sql','202610200003_socal.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
  await db.exec(await coverageSQL());
  const data=Object.fromEntries(await Promise.all(['counties','cities','districts','water'].map(async k=>[k,JSON.parse(await readFile(new URL('../dist/data/'+k+'.geojson',import.meta.url),'utf8'))]))),router=createSoCalRouter(data);
  assert.equal((await db.query('select count(*)::int n from public.routing_features')).rows[0].n,892);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');
  const route=async(category,lat,lng,env='live')=>(await db.query('select public.resolve_route($1,$2,$3,$4) r',[category,lat,lng,env])).rows[0].r;
  for(const [lat,lng] of [[34.0537,-118.2428],[32.7157,-117.1611],[34.1347,-116.3131],[33.6846,-117.8265],[35.3733,-119.0187]])for(const category of ['water','road']){
   const sql=await route(category,lat,lng),js=router.route(category,lat,lng);
   for(const k of ['county','city','district','provider','suggestedAgency','reason','agency'])assert.equal(sql[k],js[k],`${category} ${lat} ${k}`);
  }
  assert.equal((await route('water',37.326,-121.91,'demo')).agency,'Demo Water Services');
  assert.equal((await route('water',37.326,-121.91)).agency,null);
  await assert.rejects(()=>db.exec('delete from public.routing_features'),/permission denied/);
  await assert.rejects(()=>db.exec("select civic_private.resolve_fixture_route('road',34.0,-118.0,'live')"),/permission denied/);
  const id=crypto.randomUUID();const saved=(await db.query('select public.submit_report($1,$2,$3,$4,$5,$6,$7) r',[id,'water','Water near sidewalk',34.0537,-118.2428,'Los Angeles','live'])).rows[0].r;
  const workspace=(await db.query("select public.list_workspace('live') r")).rows[0].r;
  assert.equal(workspace.incidents[0].route.county,'Los Angeles');assert.equal(workspace.incidents[0].route.sources.length,5);assert.equal(workspace.incidents[0].route.agency,null);assert.equal(saved.id,workspace.incidents[0].id);
  await db.exec('reset role');await db.query('insert into public.workspace_admins values($1)',[user]);await db.exec('set role authenticated');
  const agency=(await db.query("select id from public.agencies where name='Los Angeles Department of Water and Power'")).rows[0].id;
  await db.query('select public.update_incident($1,1,$2,$3,$4)',[saved.databaseId,'Acknowledged','Asset ownership checked.',agency]);
  const assigned=(await db.query("select public.list_workspace('live') r")).rows[0].r.incidents[0];assert.equal(assigned.route.agency,'Los Angeles Department of Water and Power');assert.equal(assigned.route.reason,'Manually assigned by workspace coordinator.');
  await db.exec('reset role');await db.exec('delete from public.routing_features');await db.exec('set role authenticated');
  assert.equal((await db.query("select public.list_workspace('live') r")).rows[0].r.incidents[0].route.county,'Los Angeles');
  await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('set role anon');
  await assert.rejects(()=>route('water',34.0537,-118.2428),/permission denied/);
 }finally{await db.close();}
});
