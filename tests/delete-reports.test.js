import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {postgis} from '@electric-sql/pglite-postgis';

test('report deletion enforces assignment, revisions, evidence privacy, audit, and duplicate rules',async()=>{
 const db=new PGlite({extensions:{postgis}});
 const resident='30000000-0000-4000-8000-000000000001',neighbor='30000000-0000-4000-8000-000000000002',waterStaff='30000000-0000-4000-8000-000000000003',roadStaff='30000000-0000-4000-8000-000000000004',admin='30000000-0000-4000-8000-000000000005';
 const actor=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
 const rpc=async(name,args=[])=>{const r=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args);return r.rows[0].r;};
 const first=crypto.randomUUID(),second=crypto.randomUUID();
 const submit=(id=first,env='demo',existing=null,photo=true)=>rpc('submit_report',[id,'water','Leak near sidewalk',37.326,-121.91,'Sample location',env,existing,photo]);
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
   create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
   alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
  for(const id of [resident,neighbor,waterStaff,roadStaff,admin])await db.query('insert into auth.users values($1)',[id]);
  for(const file of ['202610200001_backend.sql','202610200002_accounts.sql','202610200003_socal.sql','202610240004_delete_reports.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
  await db.query("insert into public.agency_members values($1,'10000000-0000-4000-8000-000000000001'),($2,'10000000-0000-4000-8000-000000000002')",[waterStaff,roadStaff]);await db.query('insert into public.workspace_admins values($1)',[admin]);
  await actor(resident);const report=await submit();
  await db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['report-photos',report.photoPath,{size:10,mimetype:'image/jpeg'}]);await rpc('complete_photo',[first]);
  await actor(neighbor);const support=await submit(second,'demo',report.databaseId);
  await actor(resident);await assert.rejects(()=>rpc('delete_incident',[report.databaseId,2]),/Agency access/);
  await actor(roadStaff);await assert.rejects(()=>rpc('delete_incident',[report.databaseId,2]),/Agency access/);
  await actor(waterStaff);await assert.rejects(()=>rpc('delete_incident',[report.databaseId,1]),/changed/);
  assert.equal((await rpc('list_workspace',['demo'])).incidents.length,1);
  await rpc('delete_incident',[report.databaseId,2]);await rpc('delete_incident',[report.databaseId,2]);
  assert.equal((await rpc('list_workspace',['demo'])).incidents.length,0);
  await assert.rejects(()=>rpc('update_incident',[report.databaseId,3,'Resolved']),/Agency access/);
  for(const id of [resident,neighbor,waterStaff,admin]){
   await actor(id);assert.equal((await rpc('list_workspace',['demo'])).incidents.length,0);
   for(const table of ['incidents','reports','photos','status_history'])assert.equal((await db.query('select id from public.'+table)).rows.length,0);
   assert.equal((await db.query('select * from storage.objects')).rows.length,0);
   assert.equal((await rpc('nearby_incidents',['water',37.326,-121.91,'demo'])).length,0);
   await assert.rejects(()=>rpc('incident_audit',[report.databaseId]),/access required/);
  }
  await actor(resident);await assert.rejects(()=>submit(),/deleted/);await assert.rejects(()=>submit(crypto.randomUUID(),'demo',report.databaseId),/no longer/);await assert.rejects(()=>rpc('complete_photo',[first]),/not found/);
  await actor(neighbor);await assert.rejects(()=>db.query('insert into storage.objects(bucket_id,name,metadata) values($1,$2,$3)',['report-photos',support.photoPath,{size:10,mimetype:'image/jpeg'}]),/row-level security/);
  await db.exec('reset role');const retained=(await db.query('select deleted_by,revision from public.incidents where id=$1',[report.databaseId])).rows[0];assert.equal(retained.deleted_by,waterStaff);assert.equal(retained.revision,3);
  assert.equal((await db.query("select count(*)::int n from public.status_history where status='Deleted'")).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from public.reports')).rows[0].n,2);
  await actor(resident);const unassigned=await submit(crypto.randomUUID(),'live',null,false);await actor(waterStaff);await assert.rejects(()=>rpc('delete_incident',[unassigned.databaseId,1]),/Agency access/);
  await actor(admin);await rpc('delete_incident',[unassigned.databaseId,1]);assert.equal((await rpc('list_workspace',['live'])).incidents.length,0);
  await actor('','anon');await assert.rejects(()=>rpc('delete_incident',[report.databaseId,2]),/permission denied/);
 }finally{await db.close();}
});
