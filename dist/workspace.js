import {backendConfig} from './backend-config.js';
import {DEMO_ACCOUNTS,demoAccount} from './demo-accounts.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EMPTY=()=>({version:1,incidents:[]});
const NO_ACCESS=()=>({isAdmin:false,agencyIds:[],agencyNames:[],displayName:'',role:'resident'});
export class SharedWorkspace {
 constructor({onChange,onError}){
  Object.assign(this,{onChange,onError,mode:'local',user:null,state:EMPTY(),access:NO_ACCESS(),agencies:[],ready:false,generation:0,config:backendConfig,demoAccountId:null});
  this.recovering=new URLSearchParams(globalThis.location?.search).get('auth')==='recovery';
  try{
   this.config=JSON.parse(localStorage.getItem('civic-relay-db-config')||'null')||backendConfig;
   this.mode=localStorage.getItem('civic-relay-mode')||'local';
   this.demoAccountId=demoAccount(localStorage.getItem('civic-relay-demo-account'))?.id||null;
  }catch{}
  document.getElementById('workspace-button').onclick=()=>this.open();
  document.getElementById('workspace-dialog').addEventListener('cancel',event=>{if(this.accountBusy)event.preventDefault();});
 }
 emit(){this.onChange(this);}
 async initialize(){
  if((this.mode==='shared'||this.recovering)&&this.config.url){try{await this.connect(this.config);if(this.recovering)this.open();}catch(e){this.failed=e.message;this.emit();}}
  else{this.mode='local';this.emit();}
 }
 async connect(config){
  const {createCloud}=await import('./cloud-client.js');
  const cloud=createCloud(config);
  const generation=++this.generation;
  this.subscription?.unsubscribe();this.cloud=cloud;this.config=cloud.settings;
  localStorage.setItem('civic-relay-db-config',JSON.stringify(this.config));localStorage.setItem('civic-relay-mode','shared');
  this.mode='shared';this.state=EMPTY();this.user=null;this.access=NO_ACCESS();this.ready=false;this.failed='';this.emit();
  this.subscription=cloud.client.auth.onAuthStateChange(event=>{
   if(generation!==this.generation)return;
   if(event==='PASSWORD_RECOVERY')this.recovering=true;
   setTimeout(()=>this.refresh().then(()=>{if(event==='PASSWORD_RECOVERY'&&generation===this.generation)this.open();}).catch(e=>{this.failed=e.message;this.emit();}),0);
  }).data.subscription;
  await this.refresh();
 }
 refresh(){
  if(this.mode!=='shared'||!this.cloud)return Promise.resolve();
  const generation=this.generation,cloud=this.cloud;
  const load=async()=>{
   if(generation!==this.generation||this.mode!=='shared')return;
   try{
    const session=await cloud.session();
    if(generation!==this.generation||this.mode!=='shared')return;
    const user=session?.user||null;
    if(this.user?.id!==user?.id){this.state=EMPTY();this.access=NO_ACCESS();this.agencies=[];this.ready=false;}
    this.user=user;
    if(!user){this.state=EMPTY();this.ready=true;this.failed='';this.emit();return;}
    const [access,state,agencies]=await Promise.all([cloud.access(),cloud.list(),cloud.agencies()]);
    if(generation!==this.generation||this.mode!=='shared')return;
    this.access=access;this.state=state;this.agencies=agencies;this.ready=true;this.failed='';this.emit();
   }catch(e){
    if(generation===this.generation){this.state=EMPTY();this.access=NO_ACCESS();this.ready=false;this.failed='Could not load the shared workspace: '+e.message;this.emit();}
    throw e;
   }
  };
  this.refreshQueue=(this.refreshQueue||Promise.resolve()).catch(()=>{}).then(load);
  return this.refreshQueue;
 }
 local(accountId=null){
  this.generation++;this.subscription?.unsubscribe();this.mode='local';this.user=null;this.state=EMPTY();this.access=NO_ACCESS();this.ready=false;this.failed='';this.recovering=false;
  this.demoAccountId=demoAccount(accountId)?.id||null;
  localStorage.setItem('civic-relay-mode','local');
  if(this.demoAccountId)localStorage.setItem('civic-relay-demo-account',this.demoAccountId);else localStorage.removeItem('civic-relay-demo-account');
  this.emit();
 }
 async submit(draft){
  if(!this.user||!this.ready)throw new Error('Sign in and load the shared workspace before submitting.');
  const result=await this.cloud.submit(draft,draft.requestId,draft.duplicate?draft.candidates?.find(i=>i.id===draft.duplicate)?.databaseId:null);
  let warning='';
  if(draft.photo){try{await this.cloud.uploadPhoto(result.reportId,result.photoPath,draft.photo);}catch(e){warning='Report saved, but the photo did not finish uploading. Open the report to retry. '+e.message;}}
  try{await this.refresh();}catch{warning=(warning?warning+' ':'')+'The report was saved; refresh the workspace to load it.';}
  return {...result,warning};
 }
 accountMarkup(){
  if(this.mode!=='shared')return `<section class="account-section"><h3>Try an account</h3><p class="small muted">Simulated identities using separate sample data. No sign-up or Supabase connection needed. These controls do not sign you into a real account.</p><div class="demo-account-grid">${DEMO_ACCOUNTS.map(a=>`<button class="demo-account ${this.demoAccountId===a.id?'selected':''}" data-demo-account="${a.id}"><strong>${a.label}</strong><span>${a.name}</span><small>${escape(a.description)}</small></button>`).join('')}</div>${this.demoAccountId?'<p class="small muted">Selected: '+escape(demoAccount(this.demoAccountId).name)+'</p>':''}</section>`;
  if(!this.user)return `<section class="account-section"><h3>Sign in</h3><p class="small muted">New accounts start as residents. Only a coordinator can assign agency access.</p><div class="form-field"><label for="auth-email">Email</label><input id="auth-email" type="email" autocomplete="email"></div><div class="form-field"><label for="auth-password">Password</label><input id="auth-password" type="password" autocomplete="current-password"></div><div class="form-actions"><button class="primary" id="sign-in">Sign in</button><button class="secondary" id="sign-up">Create account</button></div><div class="account-links"><button class="text-button" id="forgot-password">Forgot password?</button><button class="text-button" id="resend-confirmation">Resend confirmation</button></div></section>`;
  const role=this.access.isAdmin?'Coordinator':this.access.agencyIds?.length?'Agency staff':'Resident';
  return `<section class="account-section"><span class="pill">${role}</span><h3 style="margin-top:12px">${escape(this.access.displayName||'Your account')}</h3><p class="small muted">${escape(this.user.email)}</p>${this.access.agencyNames?.length?`<p class="small">${this.access.agencyNames.map(escape).join(' · ')}</p>`:''}<div class="form-field"><label for="profile-name">Display name</label><input id="profile-name" maxlength="100" autocomplete="name" value="${escape(this.access.displayName)}"></div><button class="secondary block" id="save-profile" style="margin-top:12px">Save profile</button><details class="account-details"><summary>Account ID for staff access</summary><label for="account-id" class="small">Share this ID with your coordinator.</label><input id="account-id" readonly value="${escape(this.user.id)}"></details><details class="account-details" ${this.recovering?'open':''}><summary>${this.recovering?'Set your new password':'Change password'}</summary><label for="new-password">New password</label><input id="new-password" type="password" autocomplete="new-password" minlength="8"><label for="confirm-password" style="margin-top:10px">Confirm password</label><input id="confirm-password" type="password" autocomplete="new-password"><button class="secondary block" id="save-password" style="margin-top:12px">Update password</button></details>${this.access.isAdmin?'<button class="secondary block" id="manage-staff" style="margin:12px 0">Manage agency access</button><div id="staff-access"></div>':''}<button class="ghost block" id="sign-out">Sign out</button></section>`;
 }
 connectionMarkup(){
  return `<details class="account-details"><summary>Database connection</summary><p class="small muted">Apply all six database migrations and import SoCal data before using live routing. Local samples are never uploaded automatically.</p><div class="form-field"><label for="db-url">Supabase project URL</label><input id="db-url" type="url" placeholder="https://your-project.supabase.co" value="${escape(this.config.url)}"></div><div class="form-field"><label for="db-key">Publishable key</label><input id="db-key" autocomplete="off" placeholder="sb_publishable_…" value="${escape(this.config.publishableKey)}"><p class="small muted">Use a public publishable key. Never enter a secret or service-role key.</p></div><div class="form-field"><label for="db-environment">Workspace data</label><select id="db-environment"><option value="demo" ${this.config.environment==='demo'?'selected':''}>Shared test workspace</option><option value="live" ${this.config.environment==='live'?'selected':''}>Live workspace</option></select></div><button class="primary block" id="connect-database" style="margin-top:16px">Connect database</button></details>`;
 }
 open(){
  const dialog=document.getElementById('workspace-dialog');
  dialog.innerHTML=`<div class="panel-head"><h2 id="workspace-title">Account & workspace</h2><button class="dialog-close" id="close-workspace" aria-label="Close account">×</button></div><div class="dialog-body">${this.failed?`<p class="error">${escape(this.failed)}</p>`:''}${this.accountMarkup()}${this.connectionMarkup()}<p id="workspace-message" class="small" role="status" aria-live="polite" style="margin:15px 0;line-height:1.6"></p><button class="ghost block" id="use-local">${this.demoAccountId?'Exit account demo':'Use local sandbox'}</button></div>`;
  const message=(text,err=false)=>{const el=document.getElementById('workspace-message');el.textContent=text;el.classList.toggle('error',err);};
  const run=async fn=>{
   if(this.accountBusy)return;this.accountBusy=true;
   dialog.querySelectorAll('button').forEach(b=>b.disabled=true);message('Working…');
   try{await fn();}catch(e){message(e.message,true);}finally{this.accountBusy=false;dialog.querySelectorAll('button').forEach(b=>b.disabled=false);}
  };
  const handle=(id,fn)=>document.getElementById(id)?.addEventListener('click',()=>run(fn));
  const email=()=>{const input=document.getElementById('auth-email');if(!input?.value.trim()||!input.checkValidity())throw new Error('Enter a valid email address.');return input.value.trim();};
  document.getElementById('close-workspace').onclick=()=>dialog.close();
  document.getElementById('use-local').onclick=()=>{this.local();dialog.close();};
  dialog.querySelectorAll('[data-demo-account]').forEach(button=>button.onclick=()=>{this.local(button.dataset.demoAccount);dialog.close();});
  handle('connect-database',async()=>{
   await this.connect({url:document.getElementById('db-url').value.trim(),publishableKey:document.getElementById('db-key').value.trim(),environment:document.getElementById('db-environment').value});
   this.open();message(this.user?'Workspace connected.':'Connection configured. Sign in to load your reports.');
  });
  for(const [id,method] of [['sign-in','signIn'],['sign-up','signUp']])handle(id,async()=>{
   const address=email(),password=document.getElementById('auth-password').value;
   if(!password||(method==='signUp'&&password.length<8))throw new Error(method==='signUp'?'Use a password with at least 8 characters.':'Enter your password.');
   const result=await this.cloud[method](address,password);await this.refresh();
   if(method==='signUp'&&!result.session){document.getElementById('auth-password').value='';message('Check your email to confirm your account, then sign in here.');return;}
   this.open();message('Signed in. Reports are shared across your devices.');
  });
  handle('forgot-password',async()=>{await this.cloud.resetPassword(email());message('If this account exists, a password reset email will arrive. Open its link to choose a new password.');});
  handle('resend-confirmation',async()=>{await this.cloud.resendConfirmation(email());message('If confirmation is needed, check your inbox for a new confirmation email.');});
  handle('save-profile',async()=>{const name=document.getElementById('profile-name').value.trim();if(!name)throw new Error('Enter your display name.');await this.cloud.saveProfile(name);await this.refresh();this.open();message('Profile saved.');});
  handle('save-password',async()=>{
   const password=document.getElementById('new-password').value;
   if(password.length<8)throw new Error('Use a password with at least 8 characters.');
   if(password!==document.getElementById('confirm-password').value)throw new Error('The passwords do not match.');
   await this.cloud.setPassword(password);this.recovering=false;
   const url=new URL(location.href);url.searchParams.delete('auth');history.replaceState(null,'',url);
   this.open();message('Password updated.');
  });
  handle('sign-out',async()=>{await this.cloud.signOut();this.recovering=false;await this.refresh();this.open();message('Signed out.');});
  handle('manage-staff',()=>this.staffPanel(run,message));
  if(!dialog.open)dialog.showModal();
 }
 async staffPanel(run,message){
  const target=document.getElementById('staff-access');const members=await this.cloud.memberships();
  target.innerHTML=`<h3>Agency access</h3><p class="small muted">Staff must create an account first and share their account ID. This grants department access, not coordinator access.</p><div class="staff-list">${members.length?members.map((m,n)=>`<div><strong>${escape(m.displayName)}</strong><span>${escape(m.agency)}</span><small>${escape(m.userId)}</small><button class="text-button" data-revoke-member="${n}">Remove access</button></div>`).join(''):'<p class="small muted">No agency assignments yet.</p>'}</div><label for="staff-user-id">Account ID</label><input id="staff-user-id" placeholder="Account UUID"><label for="staff-agency" style="margin-top:12px">Department</label><select id="staff-agency"><option value="">Choose department</option>${this.agencies.map(a=>`<option value="${escape(a.id)}">${escape(a.name)}</option>`).join('')}</select><button class="secondary block" id="grant-staff" style="margin:12px 0">Grant agency access</button>`;
  const save=async(user,agency,enabled)=>{
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user)||!agency)throw new Error('Enter an account ID and choose a department.');
   await this.cloud.setMembership(user,agency,enabled);await this.refresh();await this.staffPanel(run,message);message(enabled?'Agency access granted.':'Agency access removed.');
  };
  document.getElementById('grant-staff').onclick=()=>run(()=>save(document.getElementById('staff-user-id').value.trim(),document.getElementById('staff-agency').value,true));
  target.querySelectorAll('[data-revoke-member]').forEach(button=>button.onclick=()=>run(async()=>{
   const member=members[+button.dataset.revokeMember];
   if(!confirm('Remove '+member.displayName+' from '+member.agency+'?'))return;
   await save(member.userId,member.agencyId,false);
  }));
 }
}
