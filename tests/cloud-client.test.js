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
