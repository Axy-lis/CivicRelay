import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createSoCalRouter,contains,edgeDistance,loadSoCal} from '../dist/socal.js';
import {createSubmission,clusterAlerts} from '../dist/core.js';
export const data=Object.fromEntries(await Promise.all(['counties','cities','districts','water'].map(async k=>[k,JSON.parse(await readFile(new URL('../dist/data/'+k+'.geojson',import.meta.url),'utf8'))])));
export const points=[
 ['Los Angeles','Los Angeles',34.0537,-118.2428],['San Diego','San Diego',32.7157,-117.1611],['Orange','Santa Ana',33.7455,-117.8677],
 ['Riverside','Riverside',33.9806,-117.3755],['San Bernardino','San Bernardino',34.1083,-117.2898],['Imperial','El Centro',32.792,-115.5631],
 ['Ventura','San Buenaventura (Ventura)',34.2746,-119.229],['Santa Barbara','Santa Barbara',34.4208,-119.6982],['San Luis Obispo','San Luis Obispo',35.2828,-120.6596],['Kern','Bakersfield',35.3733,-119.0187]
];
const router=createSoCalRouter(data);
test('official dataset covers ten counties and independently identifies city and congressional context',()=>{
 assert.equal(data.counties.features.length,10);assert.equal(data.cities.features.length,235);assert.equal(data.water.features.length,612);
 for(const [county,city,lat,lng] of points){const r=router.route('road',lat,lng);assert.equal(r.county,county);assert.equal(r.city,city);if(county==='Kern'){assert.equal(r.district,null);assert.equal(r.districtReview,true);}else assert.match(r.district,/CA-\d+ · 119th Congress/);assert.equal(r.agency,null);}
 assert.equal(router.route('road',34.1347,-116.3131).city,null);
 assert.equal(router.route('road',34.1347,-116.3131).county,'San Bernardino');
});
test('water territories identify providers separately from city and require ownership review',()=>{
 const a=router.route('water',34.0537,-118.2428);assert.match(a.provider,/WATER & POWER/);assert.equal(a.providerVerifiedAt,'2023-12-20');assert.equal(a.intake.phone,'18003425397');assert.equal(a.agency,null);
 assert.equal(router.route('water',32.7157,-117.1611).provider,'SAN DIEGO, CITY OF');
 assert.equal(router.route('water',33.6846,-117.8265).provider,null);
 const altered=structuredClone(data);altered.water.features.push({...structuredClone(altered.water.features.find(f=>f.properties.id==='CA1910067')),properties:{id:'overlap',name:'Overlapping provider'}});
 const overlap=createSoCalRouter(altered).route('water',34.0537,-118.2428);assert.equal(overlap.provider,null);assert.match(overlap.reason,/Overlapping/);assert.equal(overlap.providers.length,2);
});
test('holes, islands and polygon boundaries are handled; border districts do not create signals',()=>{
 const f={geometry:{type:'MultiPolygon',coordinates:[[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[2,1],[2,2],[1,2],[1,1]]],[[[10,10],[11,10],[11,11],[10,11],[10,10]]]]}};
 assert.equal(contains(f,3,3),true);assert.equal(contains(f,1.5,1.5),false);assert.equal(contains(f,10.5,10.5),true);assert.equal(contains(f,5,5),false);assert.equal(edgeDistance(f,0,2),0);
 const district=data.districts.features.find(f=>f.properties.id==='0634'),p=district.geometry.coordinates[0][0][0];
 const r=router.route('road',p[1],p[0]);assert.equal(r.district,null);
 assert.equal(clusterAlerts([1,2,3].map(id=>({id,category:'road',route:r,status:'Submitted',created:Date.now()}))).length,0);
});
test('outside SoCal, invalid inputs, and missing assets fail into review',async()=>{
 assert.equal(router.route('water',37.326,-121.91).county,null);assert.equal(router.route('other',34.0537,-118.2428).suggestedAgency,null);
 assert.equal(router.route('water',NaN,0).agency,null);
 await assert.rejects(()=>loadSoCal(async()=>({ok:false})),/could not be loaded/);
});
test('a real local submission stores the sourced routing result without using fictional fixtures',()=>{
 const result=createSubmission({version:1,incidents:[]},{category:'water',description:'Water beside a public sidewalk',lat:34.0537,lng:-118.2428},'resident',null,Date.now(),router.route);
 assert.equal(result.state.incidents[0].route.county,'Los Angeles');assert.equal(result.state.incidents[0].route.isDemo,false);assert.equal(result.state.incidents[0].route.sources.length,5);
});
