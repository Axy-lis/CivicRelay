import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';import {postgis} from '@electric-sql/pglite-postgis';import {coverageSQL} from '../scripts/build-socal-sql.mjs';import{createSoCalRouter}from'../dist/socal.js';
test('non-emergency backend: routing, consent, privacy, department permissions, photos, tracking, and deletion',async()=>{
 const db=new PGlite({extensions:{postgis}}),ids=['30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000005'];const [resident,other,water,safety,admin]=ids;
 const actor=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
 const rpc=async(name,args=[])=>{const r=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args);return r.rows[0].r;};
 const request=crypto.randomUUID(),description='A bicycle lock was damaged yesterday';
 const submit=(ack=true,id=request,existing=null)=>rpc('submit_report',[id,'safety',description,34.0537,-118.2428,'Los Angeles','live',existing,true,ack]);
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
  for(const id of ids)await db.query('insert into auth.users values($1)',[id]);
  for(const f of ['202610200001_backend.sql','202610200002_accounts.sql','202610200003_socal.sql','202610240004_delete_reports.sql','202610240005_safety_reporting.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));await db.exec(await coverageSQL());
  const waterAgency=(await db.query("select id from public.agencies where name='Los Angeles Department of Water and Power'")).rows[0].id;
  const police=(await db.query("select id from public.agencies where name='Los Angeles Police Department'")).rows[0].id;
  await db.query("insert into public.agency_members values($1,'10000000-0000-4000-8000-000000000001'),($2,$3)",[water,safety,police]);await db.query('insert into public.workspace_admins values($1)',[admin]);
  await actor(resident);
  const data=Object.fromEntries(await Promise.all(['counties','cities','districts','water'].map(async k=>[k,JSON.parse(await readFile(new URL('../dist/data/'+k+'.geojson',import.meta.url),'utf8'))]))),router=createSoCalRouter(data);
  for(const [lat,lng] of [[34.0537,-118.2428],[32.7157,-117.1611],[34.1347,-116.3131],[33.6846,-117.8265]]){const sql=await rpc('resolve_route',['safety',lat,lng,'live']),js=router.route('safety',lat,lng);for(const key of ['county','city','district','suggestedAgency','reason','agency'])assert.equal(sql[key],js[key],key);}
  assert.equal((await rpc('resolve_route',['safety',37.326,-121.91,'demo'])).agency,'Demo Public Safety');
  await assert.rejects(()=>submit(false),/non-emergency/);const report=await submit();assert.equal((await submit()).id,report.id);
  await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['report-photos',report.photoPath,{size:10,mimetype:'image/jpeg'}]);await rpc('complete_photo',[request]);
  let row=(await rpc('list_workspace',['live'])).incidents[0];assert.equal(row.category,'safety');assert.equal(row.nonEmergencyConfirmed,true);assert.equal(row.title,'Non-emergency safety report');assert.equal(row.route.suggestedAgency,'Los Angeles Police Department');assert.equal(row.route.sensitive,true);assert.equal(row.route.agency,null);
  await actor(other);assert.equal((await rpc('nearby_incidents',['safety',34.0537,-118.2428,'live'])).length,0);assert.equal((await rpc('list_workspace',['live'])).incidents.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);await assert.rejects(()=>submit(true,crypto.randomUUID(),report.databaseId),/cannot be attached/);
  await actor(water);assert.equal((await rpc('list_workspace',['live'])).incidents.length,0);await assert.rejects(()=>rpc('update_incident',[report.databaseId,1,'Acknowledged']),/Agency access/);
  await actor(admin);await assert.rejects(()=>rpc('update_incident',[report.databaseId,1,'Acknowledged','Wrong department',waterAgency]),/unavailable/);
  await rpc('update_incident',[report.databaseId,1,'Acknowledged','Demo intake review; no police notified.',police]);
  await actor(safety);row=(await rpc('list_workspace',['live'])).incidents[0];assert.equal(row.canManage,true);assert.equal((await db.query('select * from storage.objects')).rows.length,1);await rpc('update_incident',[report.databaseId,2,'In progress','Demo coordinator reviewing.']);
  await actor(resident);row=(await rpc('list_workspace',['live'])).incidents[0];assert.equal(row.status,'In progress');assert.equal(row.route.agency,'Los Angeles Police Department');assert.equal(row.history.at(-1).note,'Demo coordinator reviewing.');assert.equal((await rpc('incident_audit',[report.databaseId])).every(h=>h.actorId===null),true);
  await actor(water);await assert.rejects(()=>rpc('delete_incident',[report.databaseId,3]),/Agency access/);await assert.rejects(()=>rpc('incident_audit',[report.databaseId]),/access required/);
  await actor(safety);await rpc('delete_incident',[report.databaseId,3]);await actor(resident);assert.equal((await rpc('list_workspace',['live'])).incidents.length,0);assert.equal((await db.query('select * from storage.objects')).rows.length,0);
  // Existing clients can still submit infrastructure reports using the old nine arguments.
  assert.ok((await rpc('submit_report',[crypto.randomUUID(),'water','Water leak',34.0537,-118.2428,'LA','live',null,false])).id);
  await actor('','anon');await assert.rejects(()=>submit(),/permission denied/);
 }finally{await db.close();}
});
