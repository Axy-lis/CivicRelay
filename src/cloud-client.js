import {createClient} from '@supabase/supabase-js';

export function validateConfig(config) {
 const url=new URL(config.url);
 if(url.protocol!=='https:' && !(['localhost','127.0.0.1'].includes(url.hostname)&&url.protocol==='http:')) throw new Error('Use your HTTPS Supabase project URL.');
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/') throw new Error('Use the project base URL without credentials or a path.');
 const key=String(config.publishableKey||'').trim();
 if(key.startsWith('sb_secret_')) throw new Error('Use a publishable key, never a secret key.');
 if(!key.startsWith('sb_publishable_')) {
  try {const body=JSON.parse(atob(key.split('.')[1].replaceAll('-','+').replaceAll('_','/')));if(body.role!=='anon')throw Error();}
  catch {throw new Error('Use a publishable key or legacy anon key. Service-role keys are not allowed.');}
 }
 if(!['demo','live'].includes(config.environment))throw new Error('Choose the test or live workspace.');
 return {...config,url:url.origin,publishableKey:key};
}
export function createCloud(config, factory=createClient) {
 const settings=validateConfig(config);
 const client=factory(settings.url,settings.publishableKey,{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'civic-relay-auth-'+new URL(settings.url).hostname},
  global:{fetch: (input,init={})=>fetch(input,{...init,signal:init.signal||AbortSignal.timeout(20000)})}
 });
 const rpc=async(name,args={})=>{const {data,error}=await client.rpc(name,args);if(error){if(error.code==='PGRST202'&&args.p_category==='safety')throw new Error('Run migration 202610240005_safety_reporting.sql in Supabase to enable non-emergency reporting.');throw new Error(error.message);}return data;};
 const requireResult=({data,error})=>{if(error)throw new Error(error.message);return data;};
 return {
  client,settings,
  session:async()=>requireResult(await client.auth.getSession()).session,
  signIn:async(email,password)=>requireResult(await client.auth.signInWithPassword({email,password})),
  signUp:async(email,password)=>requireResult(await client.auth.signUp({email,password,options:{emailRedirectTo:globalThis.location?.origin}})),
  signOut:async()=>{const {error}=await client.auth.signOut();if(error)throw error;},
  access:()=>rpc('workspace_access'),
  saveProfile:name=>rpc('save_profile',{p_name:name}),
  memberships:()=>rpc('agency_memberships'),
  setMembership:(user,agency,enabled)=>rpc('set_agency_member',{p_user:user,p_agency:agency,p_enabled:enabled}),
  audit:incident=>rpc('incident_audit',{p_incident:incident}),
  resetPassword:async email=>requireResult(await client.auth.resetPasswordForEmail(email,{redirectTo:globalThis.location.origin+globalThis.location.pathname+'?auth=recovery'})),
  resendConfirmation:async email=>requireResult(await client.auth.resend({type:'signup',email,options:{emailRedirectTo:globalThis.location.origin+globalThis.location.pathname}})),
  setPassword:async password=>requireResult(await client.auth.updateUser({password})),
  list:()=>rpc('list_workspace',{p_environment:settings.environment}),
  agencies:async()=>{const {data,error}=await client.from('agencies').select('id,name,is_demo,categories').eq('active',true);if(error)throw error;return data.filter(a=>settings.environment==='demo'||!a.is_demo);},
  async analyze(input,{signal}={}){
   const session=requireResult(await client.auth.getSession()).session;
   if(!session?.access_token)throw new Error('Sign in before using AI analysis.');
   const response=await fetch(settings.url+'/functions/v1/analyze-report',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:settings.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(input),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(45000)]):AbortSignal.timeout(45000)});
   let body;try{body=await response.json();}catch{throw new Error('Analysis is unavailable. Deploy the analyze-report Edge Function in Supabase.');}
   if(!response.ok)throw new Error(body.error||(response.status===404?'Deploy the analyze-report Edge Function in Supabase.':'Analysis failed. Check the function setup or continue manually.'));
   if(body.source!=='ai'||body.mode!==input.mode)throw new Error('Unexpected analysis response. Continue manually.');
   return body;
  },
  async route(category,lat,lng){try{return await rpc('resolve_route',{p_category:category,p_lat:lat,p_lng:lng,p_environment:settings.environment});}catch(e){if(category==='safety'&&/Invalid location or workspace/.test(e.message))throw new Error('Run migration 202610240005_safety_reporting.sql in Supabase to enable non-emergency reporting.');throw e;}},
  nearby:(draft)=>rpc('nearby_incidents',{p_category:draft.category,p_lat:draft.lat,p_lng:draft.lng,p_environment:settings.environment}),
  submit:(draft,requestId,existingId)=>rpc('submit_report',{
   p_request_id:requestId,p_category:draft.category,p_description:draft.description,p_lat:draft.lat,p_lng:draft.lng,
   p_location:draft.location||'',p_environment:settings.environment,p_existing:existingId||null,p_has_photo:!!draft.photo,...(draft.category==='safety'?{p_non_emergency_confirmed:draft.nonEmergencyConfirmed===true}:{})
  }),
  update:(incident,status,note='',agency=null)=>rpc('update_incident',{
   p_incident:incident.databaseId,p_revision:incident.revision,p_status:status,p_note:note,p_agency:agency
  }),
  async deleteIncident(incident){
   const {error}=await client.rpc('delete_incident',{p_incident:incident.databaseId,p_revision:incident.revision});
   if(error){if(error.code==='PGRST202'||/Could not find the function/.test(error.message))throw new Error('Run database migration 202610240004_delete_reports.sql in Supabase to enable report deletion.');throw new Error(error.message);}
  },
  async uploadPhoto(reportId,path,dataUrl){
   // This app's encoder produces JPEG. Reject arbitrary URLs and over-sized data
   // before upload; bucket policies enforce the same limits server-side.
   if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(dataUrl))throw new Error('A JPEG photo is required.');
   const bytes=Uint8Array.from(atob(dataUrl.split(',')[1]),c=>c.charCodeAt(0));
   if(bytes.length>3145728)throw new Error('The compressed photo exceeds 3 MB. Try a smaller photo.');
   const {error}=await client.storage.from('report-photos').upload(path,bytes,{contentType:'image/jpeg',upsert:false});
   // If a previous attempt uploaded but its completion response was lost,
   // complete_photo verifies the existing object under the same immutable path.
   if(error && !['409','Duplicate'].includes(String(error.statusCode||error.code)))throw new Error(error.message);
   await rpc('complete_photo',{p_report_id:reportId});
  },
  async photoUrl(path){const {data,error}=await client.storage.from('report-photos').createSignedUrl(path,300);if(error)throw new Error(error.message);return data.signedUrl;}
 };
}
