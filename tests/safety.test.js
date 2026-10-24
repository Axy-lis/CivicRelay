import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {CATEGORIES,AGENCIES,createSubmission,findDuplicates,clusterAlerts} from '../dist/core.js';
import {createSoCalRouter} from '../dist/socal.js';import {createAccountDemo,demoAccount,visibleDemoState,updateDemoIncident,deleteDemoIncident} from '../dist/demo-accounts.js';import {routeStamp,SAFETY_DIRECTORY} from '../dist/safety.js';
const data=Object.fromEntries(await Promise.all(['counties','cities','districts','water'].map(async k=>[k,JSON.parse(await readFile(new URL('../dist/data/'+k+'.geojson',import.meta.url),'utf8'))])));const router=createSoCalRouter(data);
test('safety routing uses verified non-emergency jurisdiction contacts, boundaries, and review fallbacks',()=>{
 assert.equal(CATEGORIES.safety,'Suspicious activity');assert.equal(SAFETY_DIRECTORY.length,7);
 const la=router.route('safety',34.0537,-118.2428);assert.equal(la.suggestedAgency,'Los Angeles Police Department');assert.equal(la.intake.phone,'18772755273');assert.equal(la.agency,null);assert.equal(la.sensitive,true);
 assert.equal(router.route('safety',32.7157,-117.1611).suggestedAgency,'San Diego Police Department');
 assert.match(router.route('safety',34.1347,-116.3131).suggestedAgency,/San Bernardino/);
 assert.equal(router.route('safety',33.6846,-117.8265).suggestedAgency,null);
 assert.equal(router.route('safety',37.326,-121.91).agency,null);
 const f=data.cities.features.find(f=>f.properties.name==='Los Angeles'),[lng,lat]=f.geometry.coordinates[0][0][0];const b=router.route('safety',lat,lng);assert.equal(b.suggestedAgency,null);
});
test('safety reports require non-emergency confirmation and do not expose duplicates or district signals',()=>{
 const draft={category:'safety',description:'Observed damage to a parked bicycle yesterday',lat:37.326,lng:-121.91};
 assert.throws(()=>createSubmission({incidents:[],version:1},draft,'resident'),/non-emergency/);
 const d={...draft,nonEmergencyConfirmed:true};const saved=createSubmission({incidents:[],version:1},d,'resident');assert.equal(saved.state.incidents[0].title,'Non-emergency safety report');assert.equal(saved.state.incidents[0].nonEmergencyConfirmed,true);
 assert.deepEqual(findDuplicates(saved.state.incidents,d),[]);assert.throws(()=>createSubmission(saved.state,d,'other',saved.id),/cannot be attached/);
 const all=[0,1,2].map(n=>({...saved.state.incidents[0],id:'S-'+n}));assert.deepEqual(clusterAlerts(all),[]);
 assert.notEqual(routeStamp(d),routeStamp({...d,lng:d.lng+.01}));assert.notEqual(routeStamp(d),routeStamp({...d,nonEmergencyConfirmed:false}));
});
test('simulated safety staff can track, update, and delete safety reports without exposing them to other identities',()=>{
 const d={category:'safety',description:'Property damage seen yesterday',lat:37.326,lng:-121.91,nonEmergencyConfirmed:true};const saved=createSubmission(createAccountDemo(),d,'demo-resident');
 const safety=demoAccount('demo-safety-staff');assert.equal(visibleDemoState(saved.state,safety).incidents.length,1);
 assert.equal(visibleDemoState(saved.state,demoAccount('demo-neighbor')).incidents.some(i=>i.id===saved.id),false);
 assert.equal(visibleDemoState(saved.state,demoAccount('demo-water-staff')).incidents.some(i=>i.id===saved.id),false);
 assert.throws(()=>updateDemoIncident(saved.state,demoAccount('demo-coordinator'),saved.id,'Acknowledged','',AGENCIES.water),/safety department/);
 const updated=updateDemoIncident(saved.state,safety,saved.id,'Acknowledged','Demo review');assert.equal(updated.incidents[0].status,'Acknowledged');assert.equal(deleteDemoIncident(updated,safety,saved.id).incidents.some(i=>i.id===saved.id),false);
});
