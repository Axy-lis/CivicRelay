import test from 'node:test';
import assert from 'node:assert/strict';
import {routeReport,validCoordinates,findDuplicates,makeSeed,clusterAlerts,createSubmission} from '../dist/core.js';
const now=Date.now();
test('routes category and coordinates, distinguishes district',()=>{
 assert.equal(routeReport('water',37.326,-121.91).agency,'Demo Water Services');
 assert.equal(routeReport('road',37.334,-121.88).district,'District B');
 assert.equal(routeReport('lighting',37.334,-121.88).agency,'Demo Street Lighting');
});
test('manual review for unsupported categories and uncovered locations',()=>{
 assert.equal(routeReport('other',37.326,-121.91).agency,null);
 assert.equal(routeReport('water',37.38,-121.96).area,null);
 assert.equal(routeReport('water',null,-121.91).agency,null);
 assert.equal(validCoordinates(NaN,0),false);assert.equal(validCoordinates(91,0),false);
});
test('boundary behavior is deterministic and covers polygon edges',()=>{
 assert.equal(routeReport('water',37.33,-121.895).district,'District A');
 assert.equal(routeReport('water',37.30,-121.94).district,'District A');
 assert.equal(routeReport('water',37.36,-121.85).district,'District B');
 assert.equal(routeReport('water',37.299,-121.90).agency,null);
});
test('nearby duplicate search excludes different categories, distant, and resolved issues',()=>{
 const state=makeSeed(now);const draft={category:'water',lat:37.32601,lng:-121.91001};
 assert.deepEqual(findDuplicates(state.incidents,draft).map(i=>i.id),['CR-1041']);
 assert.equal(findDuplicates(state.incidents,{...draft,category:'road'}).length,0);
 state.incidents[0].status='Resolved';assert.equal(findDuplicates(state.incidents,draft).length,0);
});
test('submission creates a routed record without mutating previous state',()=>{
 const before=makeSeed(now);const result=createSubmission(before,{category:'road',description:'Test pothole',lat:37.33,lng:-121.88},'resident',null,now);
 assert.equal(before.incidents.length,7);assert.equal(result.state.incidents.length,8);
 assert.equal(result.state.incidents[0].route.agency,'Demo Public Works');
 assert.equal(result.state.incidents[0].reports[0].owner,'resident');
});
test('supporting reports do not create extra incidents or inflate cluster threshold',()=>{
 const before=makeSeed(now);const result=createSubmission(before,{category:'water',description:'Still leaking',lat:37.326,lng:-121.91},'resident','CR-1041',now);
 assert.equal(result.state.incidents.length,7);assert.equal(result.state.incidents[0].reports.length,2);
 assert.equal(clusterAlerts(result.state.incidents,now)[0].count,3);
 assert.equal(before.incidents[0].reports.length,1);
});
test('rejects stale duplicate, invalid coordinates, category and description',()=>{
 const state=makeSeed(now);const d={category:'water',description:'Leak',lat:37.326,lng:-121.91};
 assert.throws(()=>createSubmission(state,d,'a','missing'));
 assert.throws(()=>createSubmission(state,{...d,lat:100},'a'));
 assert.throws(()=>createSubmission(state,{...d,category:'unknown'},'a'));
 assert.throws(()=>createSubmission(state,{...d,description:' '},'a'));
});
test('cluster alerts count distinct, recent, unresolved incidents only',()=>{
 const state=makeSeed(now);assert.equal(clusterAlerts(state.incidents,now).length,1);
 state.incidents[0].status='Resolved';assert.equal(clusterAlerts(state.incidents,now).length,0);
 state.incidents[0].status='Submitted';state.incidents[0].created=now-8*86400000;
 assert.equal(clusterAlerts(state.incidents,now).length,0);
});
