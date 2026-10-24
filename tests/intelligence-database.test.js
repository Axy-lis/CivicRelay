import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import{PGlite}from'@electric-sql/pglite';
test('analysis budgets are private, authenticated, atomic, per-user and reset on UTC day changes',async()=>{
 const db=new PGlite(),one='40000000-0000-4000-8000-000000000001',two='40000000-0000-4000-8000-000000000002';
 const actor=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create schema civic_private;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,civic_private to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
  await db.query('insert into auth.users values($1),($2)',[one,two]);await db.exec(await readFile(new URL('../supabase/migrations/202610240006_report_intelligence.sql',import.meta.url),'utf8'));
  await actor('','anon');await assert.rejects(()=>db.exec('select public.reserve_report_analysis()'),/permission denied/);
  await actor(one);await db.exec('select public.reserve_report_analysis()');await assert.rejects(()=>db.exec('select public.reserve_report_analysis()'),/Analysis limit/);await assert.rejects(()=>db.exec('select * from civic_private.report_analysis_usage'),/permission denied/);
  await actor(two);await db.exec('select public.reserve_report_analysis()');
  await db.exec('reset role');await db.query("update civic_private.report_analysis_usage set requests=20,last_request_at=now()-interval '1 minute' where user_id=$1",[one]);await actor(one);await assert.rejects(()=>db.exec('select public.reserve_report_analysis()'),/Analysis limit/);
  await db.exec('reset role');await db.query("update civic_private.report_analysis_usage set period=period-1 where user_id=$1",[one]);await actor(one);await db.exec('select public.reserve_report_analysis()');await db.exec('reset role');assert.equal((await db.query('select requests from civic_private.report_analysis_usage where user_id=$1',[one])).rows[0].requests,1);
 }finally{await db.close();}
});
