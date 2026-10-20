import {makeSeed,AGENCIES} from './core.js';

// These identities are presentation fixtures, not authentication or authorization.
// Every real account's access is enforced in the database, never by this module.
export const DEMO_ACCOUNTS=[
 {id:'demo-resident',name:'Alex Rivera',role:'resident',label:'Resident',description:'Submit and track your own reports.'},
 {id:'demo-neighbor',name:'Jordan Lee',role:'resident',label:'Another resident',description:'See a different resident’s reports.'},
 {id:'demo-water-staff',name:'Taylor Morgan',role:'agency',agency:AGENCIES.water,label:'Water staff',description:'Manage incidents assigned to Water Services.'},
 {id:'demo-road-staff',name:'Casey Park',role:'agency',agency:AGENCIES.road,label:'Road staff',description:'Manage incidents assigned to Public Works.'},
 {id:'demo-coordinator',name:'Sam Chen',role:'coordinator',label:'Coordinator',description:'Review all incidents and route unassigned reports.'}
];
export function demoAccount(id){return DEMO_ACCOUNTS.find(a=>a.id===id)||null;}
export function createAccountDemo(now=Date.now()){
 const data=makeSeed(now);
 data.incidents.forEach((i,n)=>{
  i.reports.forEach(r=>r.owner=n%2===0?'demo-resident':'demo-neighbor');
  i.history.forEach(h=>{h.actorId=h.status==='Submitted'?i.reports[0].owner:'demo-coordinator';h.actor=demoAccount(h.actorId).name;});
 });
 return data;
}
export function canManageDemo(account,incident){return !!account&&(account.role==='coordinator'||(account.role==='agency'&&account.agency===incident.route.agency));}
export function visibleDemoState(data,account){
 if(!account)return structuredClone(data);
 const next=structuredClone(data);
 next.incidents=next.incidents.filter(i=>canManageDemo(account,i)||i.reports.some(r=>r.owner===account.id));
 next.incidents.forEach(i=>{
  const manager=canManageDemo(account,i);i.canManage=manager;i.reportCount=i.reports.length;
  if(!manager)i.reports=i.reports.filter(r=>r.owner===account.id);
  if(!manager)i.title=({water:'Water leak',road:'Road damage',lighting:'Streetlight',other:'Issue needing review'})[i.category]+' reported';
  i.history=i.history.map(h=>({...h,actor:h.actorId===account.id?'You':manager?(h.actor||'Demo account'):'Report update',actorId:manager?h.actorId:undefined}));
 });
 return next;
}
export function updateDemoIncident(data,account,id,status,note='',agency=null){
 const next=structuredClone(data);const incident=next.incidents.find(i=>i.id===id);
 if(!incident||!canManageDemo(account,incident))throw new Error('This demo account cannot update that report.');
 if(agency&&account.role!=='coordinator')throw new Error('Only the coordinator can assign departments.');
 if(!['Submitted','Acknowledged','In progress','Resolved'].includes(status))throw new Error('Choose a valid status.');
 if(agency&&!Object.values(AGENCIES).includes(agency))throw new Error('Choose a demo department.');
 incident.status=status;incident.updated=Date.now();
 if(agency)incident.route={...incident.route,agency,reason:'Assigned by demo coordinator.'};
 incident.history.push({status,at:incident.updated,note:note||'Updated in account demo.',actorId:account.id,actor:account.name});
 return next;
}
