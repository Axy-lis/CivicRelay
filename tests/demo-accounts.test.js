import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountDemo,demoAccount,visibleDemoState,updateDemoIncident} from '../dist/demo-accounts.js';
import {AGENCIES,createSubmission} from '../dist/core.js';
test('demo residents see only owned evidence, without changing the underlying workspace',()=>{
 const data=createAccountDemo();const resident=demoAccount('demo-resident');const visible=visibleDemoState(data,resident);
 assert.ok(visible.incidents.length>0);assert.ok(visible.incidents.length<data.incidents.length);
 assert.equal(visible.incidents.every(i=>i.reports.every(r=>r.owner===resident.id)),true);
 assert.equal(visible.incidents.every(i=>!i.canManage),true);assert.equal(data.incidents.length,7);
 assert.equal(visible.incidents.every(i=>i.history.every(h=>h.actorId===undefined)),true);
});
test('department demo identities see and update only matching department incidents',()=>{
 const data=createAccountDemo();const staff=demoAccount('demo-water-staff');const visible=visibleDemoState(data,staff);
 assert.equal(visible.incidents.every(i=>i.route.agency===AGENCIES.water),true);
 const item=visible.incidents[0];const next=updateDemoIncident(data,staff,item.id,'In progress','Inspection scheduled');
 assert.equal(next.incidents.find(i=>i.id===item.id).history.at(-1).actorId,staff.id);
 assert.equal(data.incidents.find(i=>i.id===item.id).status,'Submitted');
 assert.throws(()=>updateDemoIncident(data,staff,'CR-1042','Resolved'),/cannot update/);
 assert.throws(()=>updateDemoIncident(data,staff,item.id,'Resolved','',AGENCIES.road),/coordinator/);
});
test('coordinator demo can assign unassigned reports',()=>{
 const data=createAccountDemo(),coordinator=demoAccount('demo-coordinator');const missing=data.incidents.find(i=>!i.route.agency);
 const next=updateDemoIncident(data,coordinator,missing.id,missing.status,'Assigned',AGENCIES.water);
 assert.equal(visibleDemoState(next,demoAccount('demo-water-staff')).incidents.some(i=>i.id===missing.id),true);
});
test('new resident demo reports have unique IDs and remain separate from other residents',()=>{
 const data=createAccountDemo();const result=createSubmission(data,{category:'road',description:'Test sample report',lat:37.334,lng:-121.88},'demo-resident');
 assert.equal(result.id,'CR-1048');
 assert.equal(visibleDemoState(result.state,demoAccount('demo-neighbor')).incidents.some(i=>i.id===result.id),false);
 assert.equal(visibleDemoState(result.state,demoAccount('demo-road-staff')).incidents.some(i=>i.id===result.id),true);
});
