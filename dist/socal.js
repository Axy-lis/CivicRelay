import {SAFETY_DIRECTORY} from './safety.js';
import {pointInPolygon,validCoordinates} from './core.js';

export const SOCAL_LOCATIONS=[
 {name:'Los Angeles',label:'Civic Center · Los Angeles County',lat:34.0537,lng:-118.2428},
 {name:'San Diego',label:'Downtown · San Diego County',lat:32.7157,lng:-117.1611},
 {name:'Irvine',label:'Orange County · Water district lookup',lat:33.6846,lng:-117.8265},
 {name:'Joshua Tree',label:'Unincorporated · San Bernardino County',lat:34.1347,lng:-116.3131}
];
export const INTAKES={
 'CA1910067':{name:'Los Angeles Department of Water and Power',url:'https://lacity.gov/residents/request-services-report-problems',phone:'18003425397'},
 'CA3710020':{name:'San Diego Public Utilities',url:'https://getitdone.sandiego.gov/TSWCommunityFAQ',phone:'16195153525'}
};
export const DIRECTORY=[
 {id:'0644000',kind:'city',name:'Los Angeles · MyLA311',categories:['road','lighting'],url:'https://lacity.gov/myla311'},
 {id:'0666000',kind:'city',name:'San Diego · Get It Done',categories:['road','lighting'],url:'https://www.sandiego.gov/get-it-done'},
 {id:'06037',kind:'county',name:'Los Angeles County Public Works',categories:['road'],url:'https://pw.lacounty.gov/theworks/'},
 {id:'06059',kind:'county',name:'Orange County Public Works',categories:['road'],url:'https://pwom.oc.gov/service-areas/oc-operations-maintenance/service-requests/pothole-repair'},
 {id:'06065',kind:'county',name:'Riverside County Transportation',categories:['road'],url:'https://trans.rctlma.org/road-maintenance-operations'},
 {id:'06071',kind:'county',name:'San Bernardino County Public Works',categories:['road'],url:'https://dpw.sbcounty.gov/transportation/'},
 {id:'06073',kind:'county',name:'San Diego County Public Works',categories:['road','lighting'],url:'https://www.sandiegocounty.gov/content/sdc/dpw/roads/contacts.html'},
 {id:'06079',kind:'county',name:'San Luis Obispo County Public Works',categories:['road'],url:'https://www.slocounty.ca.gov/departments/public-works/our-divisions/transportation'},
 {id:'06029',kind:'county',name:'Kern County Public Works',categories:['road'],url:'https://www.kernpublicworks.com/services/transportation/road-maintenance/report-a-problem'}
].map(x=>({...x,checkedAt:'2026-10-20',delivery:'manual'}));

export const contains=(f,lng,lat)=>{
 if(f.bbox&&(lng<f.bbox[0]||lat<f.bbox[1]||lng>f.bbox[2]||lat>f.bbox[3]))return false;
 const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
 return polygons.some(rings=>pointInPolygon(lng,lat,rings[0])&&!rings.slice(1).some(h=>pointInPolygon(lng,lat,h)));
};
// Distance in meters to a generalized polygon edge, including holes and islands.
export function edgeDistance(f,lng,lat){
 const sx=111320*Math.cos(lat*Math.PI/180),sy=111320;
 const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
 let best=Infinity;
 for(const rings of polygons)for(const ring of rings)for(let i=1;i<ring.length;i++){
  const a=[(ring[i-1][0]-lng)*sx,(ring[i-1][1]-lat)*sy],b=[(ring[i][0]-lng)*sx,(ring[i][1]-lat)*sy];
  const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,-(a[0]*dx+a[1]*dy)/(dx*dx+dy*dy||1)));
  best=Math.min(best,Math.hypot(a[0]+t*dx,a[1]+t*dy));
 }
 return best;
}
const near=(f,lng,lat,meters)=>{
 const dlat=meters/111320,dlng=dlat/Math.cos(lat*Math.PI/180),b=f.bbox;
 return (!b||(lng>=b[0]-dlng&&lng<=b[2]+dlng&&lat>=b[1]-dlat&&lat<=b[3]+dlat))&&edgeDistance(f,lng,lat)<=meters;
};
export function createSoCalRouter(data){
 const hits=(kind,lat,lng)=>data[kind].features.filter(f=>contains(f,lng,lat));
 return {
  data,
  route(category,lat,lng){
   const result={agency:null,area:null,district:null,county:null,city:null,provider:null,suggestedAgency:null,sources:[],isDemo:false,delivery:'manual',coverage:'socal',reason:'A valid location is required.'};
   if(!validCoordinates(lat,lng)||!['water','road','lighting','other','safety'].includes(category))return result;
   const counties=hits('counties',lat,lng),cities=hits('cities',lat,lng),districts=hits('districts',lat,lng);
   if(counties.length!==1)return {...result,reason:'Outside the ten-county SoCal area or on an ambiguous county boundary. Manual location review required.'};
   const county=counties[0],city=cities.length===1?cities[0]:null;
   Object.assign(result,{county:county.properties.name,city:city?.properties.name||null,area:(city?city.properties.name:cities.length>1?'City jurisdiction needs review':'Unincorporated area')+' · '+county.properties.name+' County'});
   result.sources=['counties','cities','districts'].map(k=>data[k].source);
   const boundary=data.counties.features.some(f=>near(f,lng,lat,100))||data.cities.features.some(f=>near(f,lng,lat,100));
   const districtBoundary=data.districts.features.some(f=>near(f,lng,lat,100))||new Date()>=new Date('2027-01-03T00:00:00Z')||new Date()<new Date('2025-01-03T00:00:00Z');
   if(districts.length===1&&!districtBoundary)result.district=districts[0].properties.name+' · 119th Congress';
   result.boundaryReview=boundary;result.districtReview=districtBoundary||districts.length!==1;
   if(category==='water'){
    const water=hits('water',lat,lng);result.sources.push(data.water.source);
    result.providers=water.map(f=>f.properties);
    if(water.length===1){
     const provider=water[0].properties;result.provider=provider.name;result.providerVerifiedAt=provider.verifiedAt;
     const intake=INTAKES[provider.id],waterBorder=data.water.features.some(f=>near(f,lng,lat,25));
     result.suggestedAgency=intake?.name||provider.name;
     if(intake){result.intake=intake;result.sources.push({url:intake.url,id:'intake',retrievedAt:'2026-10-20'});}
     // A water territory identifies a provider; private plumbing still needs triage.
     result.reason=waterBorder?'Near a water-service boundary. Verify the provider before forwarding.':intake?'One verified water-service area matched. Official leak contact available; confirm public-pipe ownership before forwarding.':'Water provider identified. Its leak intake and asset ownership still need verification.';
     result.waterBoundaryReview=waterBorder;
    }else result.reason=water.length?'Overlapping verified water-service areas. A coordinator must confirm the provider.':'No verified retail water-service area matched. A coordinator must check the water provider.';
   }else if(category==='road'||category==='lighting'){
    const entry=!boundary&&cities.length<=1?DIRECTORY.find(d=>d.kind===(city?'city':'county')&&d.id===(city||county).properties.id&&d.categories.includes(category)):null;
    if(entry){result.suggestedAgency=entry.name;result.intake=entry;result.sources.push({url:entry.url,id:'intake',retrievedAt:entry.checkedAt});}
    result.reason=boundary?'Near a city or county boundary. Verify jurisdiction and asset ownership.':entry?'Official local intake identified. Check whether this is a local public asset, a state highway, a utility-owned light, or private property before forwarding.':'Jurisdiction identified. A verified department intake and asset ownership are still needed.';
    result.highwayContact={name:'Caltrans · State highway maintenance',url:'https://csr.dot.ca.gov/'};
   }else if(category==='safety'){
    result.sensitive=true;
    const entry=!boundary&&cities.length<=1?SAFETY_DIRECTORY.find(d=>d.kind===(city?'safety-city':'safety-county')&&d.id===(city||county).properties.id):null;
    if(entry){result.suggestedAgency=entry.name;result.intake=entry;result.sources.push({url:entry.url,id:'non-emergency contact',retrievedAt:entry.checkedAt});}
    result.reason=boundary?'Near a jurisdiction boundary. A coordinator must verify the non-emergency reporting agency.':entry?'Official non-emergency contact identified. Jurisdiction and report eligibility need confirmation; saving in Civic Relay does not notify police.':'No verified non-emergency contact for this location. A coordinator must verify jurisdiction; saving here does not notify police.';
   }else result.reason='Jurisdiction identified. This category needs department review.';
   return result;
  }
 };
}

export async function loadSoCal(fetcher=fetch){
 const entries=await Promise.all(['counties','cities','districts','water'].map(async k=>{
  const response=await fetcher(new URL('./data/'+k+'.geojson',import.meta.url),{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Official coverage could not be loaded. Retry the page.');
  const collection=await response.json();if(collection.type!=='FeatureCollection'||!collection.features?.length||!collection.source?.url)throw new Error('Incomplete coverage data.');return [k,collection];
 }));
 return createSoCalRouter(Object.fromEntries(entries));
}
