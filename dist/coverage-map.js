// Offline SVG map: the exact same bundled polygons power the map and lookup.
export function mountCoverageMap(host,router,{lat=null,lng=null,onSelect=()=>{},category='water',initialZoom=null}={}){
 if(!host||!router)return;
 let zoom=initialZoom??(lat===null?0:2),center=[lng??-118,lat??34.5];
 const ns='http://www.w3.org/2000/svg';
 const el=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 host.innerHTML='<div class="coverage-map-controls"><button type="button" data-zoom="-1" aria-label="Zoom out">−</button><button type="button" data-zoom="1" aria-label="Zoom in">＋</button><button type="button" data-region>All SoCal</button></div><div class="coverage-canvas"></div><p class="small muted">Tap the map or drag the pin to the issue. Use coordinates for precise placement. County and city outlines are generalized; this map has no street basemap.</p>';
 const canvas=host.querySelector('.coverage-canvas');
 let svg,bounds,down=false;
 function draw(){
  bounds=zoom===0?[-121.5,32.3,-114,36.9]:[center[0]-3.75/2**zoom,center[1]-2.3/2**zoom,center[0]+3.75/2**zoom,center[1]+2.3/2**zoom];
  const [w,s,e,n]=bounds,project=([x,y])=>[(x-w)/(e-w)*600,(n-y)/(n-s)*360];
  svg=el('svg',{viewBox:'0 0 600 360',role:'img','aria-label':'Southern California county boundaries and selected issue location'});
  svg.append(el('rect',{width:600,height:360,fill:'#e8f0ed'}));
  const path=(f,cls)=>{const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;const d=polygons.map(rings=>rings.map(r=>r.map((p,i)=>(i?'L':'M')+project(p).join(',')).join('')+'Z').join('')).join('');return el('path',{d,class:cls,'fill-rule':'evenodd'});};
  for(const f of router.data.counties.features){svg.append(path(f,'map-county'));if(zoom===0){const b=f.bbox,p=project([(b[0]+b[2])/2,(b[1]+b[3])/2]);const t=el('text',{x:p[0],y:p[1],class:'map-label'});t.textContent=f.properties.name;svg.append(t);}}
  if(zoom>=2)for(const f of router.data.cities.features){const b=f.bbox;if(b[2]<w||b[0]>e||b[3]<s||b[1]>n)continue;svg.append(path(f,'map-city'));}
  if(zoom>=4&&category==='water')for(const f of router.data.water.features){const b=f.bbox;if(b[2]<w||b[0]>e||b[3]<s||b[1]>n)continue;svg.append(path(f,'map-water'));}
  if(lat!==null&&lng!==null){const [x,y]=project([lng,lat]);svg.append(el('circle',{cx:x,cy:y,r:14,class:'map-pin-halo'}));svg.append(el('circle',{cx:x,cy:y,r:6,class:'map-pin'}));}
  canvas.replaceChildren(svg);
  svg.onpointerdown=e=>{e.preventDefault();down=true;svg.setPointerCapture(e.pointerId);select(e);};
  svg.onpointermove=e=>{if(down)select(e);};
  svg.onpointerup=e=>{down=false;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);draw();};
  svg.onpointercancel=()=>{down=false;draw();};
 }
 function select(e){const box=svg.getBoundingClientRect();const [w,s,east,n]=bounds;lng=+(w+(e.clientX-box.left)/box.width*(east-w)).toFixed(6);lat=+(n-(e.clientY-box.top)/box.height*(n-s)).toFixed(6);onSelect(lat,lng);const circle=svg.querySelector('.map-pin'),halo=svg.querySelector('.map-pin-halo');if(circle){for(const c of [circle,halo]){c.setAttribute('cx',(lng-w)/(east-w)*600);c.setAttribute('cy',(n-lat)/(n-s)*360);}}}
 host.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{zoom=Math.max(0,Math.min(zoom+Number(b.dataset.zoom),9));if(lat!==null)center=[lng,lat];draw();});
 host.querySelector('[data-region]').onclick=()=>{zoom=0;draw();};
 draw();
 return {setPoint(a,b){lat=a;lng=b;center=[b,a];if(zoom===0)zoom=4;draw();}};
}
