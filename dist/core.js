// Geographic fixtures are fictional demo service areas, not official jurisdiction data.
export const CATEGORIES = { water: 'Water leak', road: 'Road damage', lighting: 'Streetlight', other: 'Other issue' };
export const STATUSES = ['Submitted', 'Acknowledged', 'In progress', 'Resolved'];
export const AGENCIES = {water:'Demo Water Services',road:'Demo Public Works',lighting:'Demo Street Lighting'};
const rectangle=(west,south,east,north)=>[[west,south],[east,south],[east,north],[west,north],[west,south]];
export const AREAS = [
 {id:'west',name:'West service area',district:'District A',ring:rectangle(-121.94,37.30,-121.895,37.36)},
 {id:'east',name:'East service area',district:'District B',ring:rectangle(-121.895,37.30,-121.85,37.36)}
];
export const LOCATIONS = [
 {name:'Willow corner',label:'Sample location · West area',lat:37.326,lng:-121.91},
 {name:'Parkside avenue',label:'Sample location · East area',lat:37.334,lng:-121.88},
 {name:'Outside demo coverage',label:'Sample location · Manual review',lat:37.38,lng:-121.96}
];
export function validCoordinates(lat,lng){return typeof lat==='number'&&typeof lng==='number'&&Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180;}
export function pointInPolygon(lng,lat,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [xi,yi]=ring[i], [xj,yj]=ring[j];
  // Boundary points are included; first matching service area wins deterministically.
  const cross=(lng-xi)*(yj-yi)-(lat-yi)*(xj-xi);
  if(Math.abs(cross)<1e-10&&lng>=Math.min(xi,xj)&&lng<=Math.max(xi,xj)&&lat>=Math.min(yi,yj)&&lat<=Math.max(yi,yj))return true;
  if((yi>lat)!==(yj>lat)&&lng<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;
 }
 return inside;
}
export function routeReport(category,lat,lng){
 if(!validCoordinates(lat,lng))return {agency:null,district:null,area:null,reason:'A valid location is required.'};
 const area=AREAS.find(a=>pointInPolygon(lng,lat,a.ring));
 if(!area)return {agency:null,district:null,area:null,reason:'Outside demo service areas. A coordinator needs to verify ownership.'};
 if(!AGENCIES[category])return {agency:null,district:area.district,area:area.name,reason:'This category needs manual department review.'};
 return {agency:AGENCIES[category],district:area.district,area:area.name,reason:`Location falls within ${area.name.toLowerCase()}; category maps to ${AGENCIES[category]}.`};
}
export function distanceMeters(a,b){const rad=x=>x*Math.PI/180;const dlat=rad(b.lat-a.lat),dlng=rad(b.lng-a.lng);const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
export function findDuplicates(incidents,draft){return incidents.filter(i=>i.category===draft.category&&i.status!=='Resolved'&&distanceMeters(i,draft)<=60).sort((a,b)=>distanceMeters(a,draft)-distanceMeters(b,draft));}
export function clusterAlerts(incidents,now=Date.now()){
 const groups=new Map();
 for(const i of incidents){if(i.status==='Resolved'||!i.route.district||i.created>now||now-i.created>7*86400000)continue;const key=i.route.district+'|'+i.category;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
 return [...groups.entries()].filter(([,items])=>items.length>=3).map(([key,items])=>({key,district:items[0].route.district,category:items[0].category,count:items.length,ids:items.map(i=>i.id)}));
}
export function makeSeed(now=Date.now()){
 const rows=[['water','Water pooling beside the sidewalk',37.326,-121.91,'Submitted'],['road','Pothole near the crossing',37.334,-121.88,'Acknowledged'],['lighting','Streetlight stays dark after sunset',37.32,-121.92,'In progress'],['water','Water flowing along the curb',37.339,-121.906,'Submitted'],['water','Possible leak near the park entrance',37.314,-121.915,'Acknowledged'],['road','Cracked road surface at intersection',37.345,-121.87,'Resolved'],['other','Loose utility cover',37.38,-121.96,'Submitted']];
 return {version:1,incidents:rows.map(([category,title,lat,lng,status],n)=>{
 const created=now-(n+1)*5*3600000;return {id:'CR-'+(1041+n),category,title,lat,lng,location:'Sample location',status,created,updated:created,route:routeReport(category,lat,lng),reports:[{id:'sample-'+n,description:title,photo:null,created,owner:'sample'}],history:[{status:'Submitted',at:created,note:'Sample report created.'},...(status==='Submitted'?[]:[{status,at:created+3600000,note:'Sample agency update.'}])]};})};
}
export function createSubmission(state,draft,owner,existingId=null,now=Date.now(),resolveRoute=routeReport){
 if(!CATEGORIES[draft.category]||!validCoordinates(draft.lat,draft.lng)||!draft.description?.trim()||draft.description.length>1200)throw new Error('Choose a category, valid location, and description (up to 1,200 characters).');
 const next=structuredClone(state);
 const report={id:crypto.randomUUID(),description:draft.description.trim(),photo:draft.photo||null,created:now,owner};
 if(existingId){const incident=next.incidents.find(i=>i.id===existingId);if(!incident||!findDuplicates([incident],draft).length)throw new Error('This incident is no longer a duplicate candidate. Review your location.');incident.reports.push(report);incident.updated=now;incident.history.push({status:incident.status,at:now,note:'A resident added supporting evidence.'});return {state:next,id:incident.id};}
 const maxId=Math.max(1040,...next.incidents.map(i=>Number(i.id.slice(3))||0));const id='CR-'+(maxId+1);
 next.incidents.unshift({id,category:draft.category,title:draft.description.trim().split('\n')[0].slice(0,90),lat:draft.lat,lng:draft.lng,location:draft.location||'Selected location',status:'Submitted',created:now,updated:now,route:resolveRoute(draft.category,draft.lat,draft.lng),reports:[report],history:[{status:'Submitted',at:now,note:'Saved locally. External delivery is not connected.'}]});
 return {state:next,id};
}
