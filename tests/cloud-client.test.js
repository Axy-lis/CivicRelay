import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloud,validateConfig} from '../src/cloud-client.js';
const config={url:'https://example.supabase.co',publishableKey:'sb_publishable_example',environment:'demo'};
test('connection configuration rejects secret/service-role keys and invalid origins',()=>{
 assert.equal(validateConfig(config).url,config.url);
 assert.throws(()=>validateConfig({...config,publishableKey:'sb_secret_example'}),/never a secret/);
 const jwt='a.'+btoa(JSON.stringify({role:'service_role'}))+'.b';
 assert.throws(()=>validateConfig({...config,publishableKey:jwt}),/Service-role/);
 assert.throws(()=>validateConfig({...config,url:'http://example.com'}),/HTTPS/);
 assert.throws(()=>validateConfig({...config,url:'https://example.com/path'}),/base URL/);
});
test('submit sends immutable request key, coordinates, and environment to the database',async()=>{
 let call;const client={rpc:async(name,args)=>{call={name,args};return {data:{id:'CR-1'},error:null};}};
 const cloud=createCloud(config,()=>client);const draft={category:'water',description:'Leak',lat:37.3,lng:-121.9,location:'Corner',photo:'photo'};
 await cloud.submit(draft,'request-key','incident-key');assert.equal(call.name,'submit_report');assert.equal(call.args.p_environment,'demo');assert.equal(call.args.p_request_id,'request-key');assert.equal(call.args.p_existing,'incident-key');assert.equal(call.args.p_has_photo,true);
});
test('photo retry finalizes an existing object after an earlier upload response was lost',async()=>{
 let complete=false;const cloud=createCloud(config,()=>({rpc:async(name)=>{complete=name==='complete_photo';return {data:null,error:null};},storage:{from:()=>({upload:async()=>({error:{statusCode:409}})})}}));
 await cloud.uploadPhoto('r','user/r.jpg','data:image/jpeg;base64,/9j/');assert.equal(complete,true);
});
test('photo transport failures are surfaced and do not mark missing uploads complete',async()=>{
 let complete=false;const cloud=createCloud(config,()=>({rpc:async()=>{complete=true;},storage:{from:()=>({upload:async()=>({error:{message:'Offline',statusCode:503}})})}}));
 await assert.rejects(()=>cloud.uploadPhoto('r','user/r.jpg','data:image/jpeg;base64,/9j/'),/Offline/);assert.equal(complete,false);
 await assert.rejects(()=>cloud.uploadPhoto('r','user/r.jpg','https://remote/image.jpg'),/JPEG/);
});

test('deletion sends revision and surfaces a missing database migration',async()=>{
 let args;const cloud=createCloud(config,()=>({rpc:async(name,params)=>{args={name,params};return {data:null,error:null};}}));
 await cloud.deleteIncident({databaseId:'incident-id',revision:4});assert.deepEqual(args,{name:'delete_incident',params:{p_incident:'incident-id',p_revision:4}});
 const old=createCloud(config,()=>({rpc:async()=>({error:{code:'PGRST202',message:'Function not found'}})}));await assert.rejects(()=>old.deleteIncident({databaseId:'id',revision:1}),/202610240004_delete_reports.sql/);
});

test('safety submissions send explicit consent and report missing migration without breaking infrastructure calls',async()=>{
 let args;const cloud=createCloud(config,()=>({rpc:async(name,params)=>{args=params;return {data:{id:'CR-1'},error:null};}}));
 await cloud.submit({category:'safety',description:'Past property damage',lat:34,lng:-118,nonEmergencyConfirmed:true},'r');assert.equal(args.p_non_emergency_confirmed,true);
 await cloud.submit({category:'water',description:'Leak',lat:34,lng:-118},'r');assert.equal(Object.hasOwn(args,'p_non_emergency_confirmed'),false);
 const old=createCloud(config,()=>({rpc:async()=>({error:{code:'PGRST202',message:'Function not found'}})}));await assert.rejects(()=>old.submit({category:'safety',nonEmergencyConfirmed:true},'r'),/202610240005/);
});

test('AI client calls the authenticated same-project function without location or API secrets',async()=>{
 const original=globalThis.fetch;let call;
 try{
  globalThis.fetch=async(url,options)=>{call={url,options};return Response.json({source:'ai',provider:'gemini',mode:'description',analysis:{}});};
  const cloud=createCloud(config,()=>({auth:{getSession:async()=>({data:{session:{access_token:'user-token'}},error:null})}}));
  await cloud.analyze({mode:'description',description:'A pothole'});assert.equal(call.url,'https://example.supabase.co/functions/v1/analyze-report');assert.equal(call.options.headers.Authorization,'Bearer user-token');assert.deepEqual(JSON.parse(call.options.body),{mode:'description',description:'A pothole'});
  globalThis.fetch=async()=>Response.json({source:'ai',mode:'description',analysis:{}});await assert.rejects(()=>cloud.analyze({mode:'description',description:'A pothole'}),/Gemini version/);
  globalThis.fetch=async()=>Response.json({error:'Run migration 006'},{status:503});await assert.rejects(()=>cloud.analyze({mode:'description',description:'A pothole'}),/migration 006/);
 }finally{globalThis.fetch=original;}
});

test('analysis explains Safari transport errors, gateway failures, cancellations and timeouts without losing the draft',async()=>{
 const original=globalThis.fetch;const cloud=createCloud(config,()=>({auth:{getSession:async()=>({data:{session:{access_token:'user-token'}},error:null})}}));const input={mode:'photo',description:'Water near a pipe',photo:'data:image/jpeg;base64,/9j/AA=='};
 try{
  globalThis.fetch=async()=>{throw new TypeError('Load failed');};await assert.rejects(()=>cloud.analyze(input),/analyze-report is deployed.*ALLOWED_ORIGINS/);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>cloud.analyze(input,{signal:controller.signal}),/canceled/);
  globalThis.fetch=async()=>{throw new DOMException('Timeout','TimeoutError');};await assert.rejects(()=>cloud.analyze(input),/too long/);
  for(const [status,code,message,expected] of [[404,'NOT_FOUND','Requested function does not exist',/Adding a Gemini secret alone/],[401,401,'Invalid JWT',/Sign out and sign in/],[503,'BOOT_ERROR','Function failed to start',/_shared files/]]){globalThis.fetch=async()=>Response.json({code,message},{status});await assert.rejects(()=>cloud.analyze(input),expected);}
  globalThis.fetch=async()=>new Response('not JSON',{status:500});await assert.rejects(()=>cloud.analyze(input),/HTTP 500/);
  globalThis.fetch=async()=>Response.json({error:'Gemini free quota or rate limit reached.'},{status:429});await assert.rejects(()=>cloud.analyze(input),/Gemini free quota/);
  assert.equal(input.description,'Water near a pipe');
 }finally{globalThis.fetch=original;}
});

test('analysis explains session lookup failures before attempting a provider request',async()=>{
 const cloud=createCloud(config,()=>({auth:{getSession:async()=>{throw new TypeError('Load failed');}}}));
 await assert.rejects(()=>cloud.analyze({mode:'description',description:'A pothole'}),/Could not confirm your sign-in/);
});
