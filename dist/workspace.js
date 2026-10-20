import {backendConfig} from './backend-config.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EMPTY=()=>({version:1,incidents:[]});
export class SharedWorkspace {
 constructor({onChange,onError}){
  this.onChange=onChange;this.onError=onError;this.mode='local';this.user=null;this.state=EMPTY();this.access={isAdmin:false,agencyIds:[]};this.agencies=[];this.ready=false;this.generation=0;
  this.config=backendConfig;
  try{this.config=JSON.parse(localStorage.getItem('civic-relay-db-config')||'null')||backendConfig;this.mode=localStorage.getItem('civic-relay-mode')||'local';}catch{}
  document.getElementById('workspace-button').onclick=()=>this.open();
 }
 async initialize(){if(this.mode==='shared'&&this.config.url){try{await this.connect(this.config);}catch(e){this.failed=e.message;this.emit();}}else{this.mode='local';this.emit();}}
 emit(){this.onChange(this);}
 async connect(config){
  const {createCloud}=await import('./cloud-client.js');
  this.generation++;this.subscription?.unsubscribe();this.cloud=createCloud(config);this.config=this.cloud.settings;
  localStorage.setItem('civic-relay-db-config',JSON.stringify(this.config));localStorage.setItem('civic-relay-mode','shared');
  this.mode='shared';this.state=EMPTY();this.user=null;this.ready=false;this.failed='';this.emit();
  this.subscription=this.cloud.client.auth.onAuthStateChange(()=>{setTimeout(()=>this.refresh().catch(e=>{this.failed=e.message;this.emit();}),0);}).data.subscription;
  await this.refresh();
 }
 async refresh(){
  if(this.mode!=='shared'||!this.cloud)return;
  const generation=++this.generation;
  const session=await this.cloud.session();
  if(generation!==this.generation||this.mode!=='shared')return;
  const nextUser=session?.user||null;
  if(this.user?.id!==nextUser?.id){this.state=EMPTY();this.access={isAdmin:false,agencyIds:[]};this.agencies=[];this.ready=false;}
  this.user=nextUser;
  if(!this.user){this.state=EMPTY();this.ready=true;this.failed='';this.emit();return;}
  try{
   const [access,state,agencies]=await Promise.all([this.cloud.access(),this.cloud.list(),this.cloud.agencies()]);
   if(generation!==this.generation||this.mode!=='shared')return;
   this.access=access;this.state=state;this.agencies=agencies;this.ready=true;this.failed='';this.emit();
  }catch(e){if(generation===this.generation){this.ready=false;this.failed='Could not load the shared workspace: '+e.message;this.emit();}throw e;}
 }
 local(){this.generation++;this.subscription?.unsubscribe();this.mode='local';this.user=null;this.state=EMPTY();this.ready=false;this.failed='';localStorage.setItem('civic-relay-mode','local');this.emit();}
 async submit(draft){
  if(!this.user||!this.ready)throw new Error('Sign in and load the shared workspace before submitting.');
  const result=await this.cloud.submit(draft,draft.requestId,draft.duplicate?draft.candidates?.find(i=>i.id===draft.duplicate)?.databaseId:null);
  let warning='';
  if(draft.photo){try{await this.cloud.uploadPhoto(result.reportId,result.photoPath,draft.photo);}catch(e){warning='Report saved, but the photo did not finish uploading. Open the report to retry. '+e.message;}}
  try{await this.refresh();}catch{warning=(warning?warning+' ':'')+'The report was saved; refresh the workspace to load it.';}
  return {...result,warning};
 }
 open(){
  const dialog=document.getElementById('workspace-dialog');
  dialog.innerHTML=`<div class="panel-head"><h2 id="workspace-title">Shared workspace</h2><button class="dialog-close" id="close-workspace" aria-label="Close workspace settings">×</button></div><div class="dialog-body"><p class="muted small">Connect a Supabase project after applying the database migration. Local sample reports stay separate and are never uploaded automatically.</p>${this.failed?`<p class="error">${escape(this.failed)}</p>`:''}<div class="form-field"><label for="db-url">Supabase project URL</label><input id="db-url" type="url" placeholder="https://your-project.supabase.co" value="${escape(this.config.url)}"></div><div class="form-field"><label for="db-key">Publishable key</label><input id="db-key" autocomplete="off" placeholder="sb_publishable_…" value="${escape(this.config.publishableKey)}"><p class="small muted">Public connection key only. Never enter a secret or service-role key.</p></div><div class="form-field"><label for="db-environment">Shared workspace data</label><select id="db-environment"><option value="demo" ${this.config.environment==='demo'?'selected':''}>Shared test workspace</option><option value="live" ${this.config.environment==='live'?'selected':''}>Live workspace (verified routing only)</option></select></div><button class="primary block" id="connect-database" style="margin-top:16px">Connect database</button><hr>${this.mode==='shared'?`<p class="small">${this.user?'Signed in as '+escape(this.user.email):'Sign in to save and track shared reports.'}</p>${!this.user?'<div class="form-field"><label for="auth-email">Email</label><input id="auth-email" type="email" autocomplete="email"></div><div class="form-field"><label for="auth-password">Password</label><input id="auth-password" type="password" autocomplete="current-password" minlength="8"></div><div class="form-actions"><button class="primary" id="sign-in">Sign in</button><button class="secondary" id="sign-up">Create account</button></div>':'<button class="secondary block" id="sign-out" style="margin-top:12px">Sign out</button>'}`:''}<p id="workspace-message" class="small" role="status" aria-live="polite" style="margin:15px 0;line-height:1.6"></p><button class="ghost block" id="use-local">Use local demo instead</button></div>`;
  const message=(text,err=false)=>{const el=document.getElementById('workspace-message');el.textContent=text;el.classList.toggle('error',err);};
  const run=async(fn)=>{dialog.querySelectorAll('button').forEach(b=>b.disabled=true);message('Working…');try{await fn();}catch(e){message(e.message,true);}finally{dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}};
  document.getElementById('close-workspace').onclick=()=>dialog.close();
  document.getElementById('use-local').onclick=()=>{this.local();dialog.close();};
  document.getElementById('connect-database').onclick=()=>run(async()=>{
   await this.connect({url:document.getElementById('db-url').value.trim(),publishableKey:document.getElementById('db-key').value.trim(),environment:document.getElementById('db-environment').value});this.open();message('Connection configured. Sign in to load your reports.');
  });
  for(const [id,method] of [['sign-in','signIn'],['sign-up','signUp']])document.getElementById(id)?.addEventListener('click',()=>run(async()=>{
   const email=document.getElementById('auth-email').value.trim(),password=document.getElementById('auth-password').value;
   if(!email||password.length<8)throw new Error('Enter your email and a password with at least 8 characters.');
   const result=await this.cloud[method](email,password);await this.refresh();
   if(method==='signUp'&&!result.session){message('Check your email to confirm your account, then sign in here.');return;}
   this.open();message('Signed in. Reports are shared across your devices.');
  }));
  document.getElementById('sign-out')?.addEventListener('click',()=>run(async()=>{await this.cloud.signOut();await this.refresh();this.open();message('Signed out.');}));
  if(!dialog.open)dialog.showModal();
 }
}
