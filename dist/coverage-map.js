// Offline map: the same bundled polygons power the map and location lookup.
export function mountCoverageMap(host,router,{lat=null,lng=null,onSelect=()=>{},category='water',initialZoom=null,defaultCenter=[-118.2428,34.0537],regionBounds=[-121.5,32.3,-114,36.9]}={}){
 if(!host||!router)return;
 let selected=lat!==null&&lng!==null;
 lat=lat??defaultCenter[1];lng=lng??defaultCenter[0];
 let zoom=initialZoom??5,center=[lng,lat],svg,bounds,down=false,offset=[0,0];
 const ns='http://www.w3.org/2000/svg';
 const el=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
 host.innerHTML='<div class="pin-instruction"><span>⌖</span><div><strong>Drag the pin to the issue</strong><small>You can also tap anywhere on the map.</small></div></div><div class="coverage-map-controls"><button type="button" data-zoom="-1" aria-label="Zoom out">−</button><button type="button" data-zoom="1" aria-label="Zoom in">＋</button><button type="button" data-center>Find pin</button><button type="button" data-region>Whole area</button></div><div class="coverage-canvas"></div><p class="pin-location" role="status" aria-live="polite"></p><p class="small muted map-disclosure">Boundary map · City and water-service outlines, without street imagery. Search a city or use your location to start nearby.</p>';
 const canvas=host.querySelector('.coverage-canvas'),status=host.querySelector('.pin-location');
 function describe(){
  if(!selected){status.textContent='Move the pin to choose your report location.';return;}
  const route=router.route?.('other',lat,lng);
  status.textContent=route?.area?'Pin placed · '+route.area:'Pin placed · Location ready for review';
 }
 function paintPin(){
  const [w,s,e,n]=bounds,x=(lng-w)/(e-w)*600,y=(n-lat)/(n-s)*360;
  svg.querySelector('.map-marker')?.setAttribute('transform',`translate(${x} ${y}) scale(1.4)`);
 }
 function draw(focus=false){
  const width=regionBounds[2]-regionBounds[0],height=regionBounds[3]-regionBounds[1];
  bounds=zoom===0?regionBounds:[center[0]-width/2/2**zoom,center[1]-height/2/2**zoom,center[0]+width/2/2**zoom,center[1]+height/2/2**zoom];
  const [w,s,e,n]=bounds,project=([x,y])=>[(x-w)/(e-w)*600,(n-y)/(n-s)*360];
  svg=el('svg',{viewBox:'0 0 600 360','aria-label':'Choose the issue location on the map'});
  svg.append(el('rect',{width:600,height:360,fill:'#e8f0ed'}));
  const path=(f,cls)=>{const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;const d=polygons.map(rings=>rings.map(r=>r.map((p,i)=>(i?'L':'M')+project(p).join(',')).join('')+'Z').join('')).join('');return el('path',{d,class:cls,'fill-rule':'evenodd'});};
  for(const f of router.data.counties.features){svg.append(path(f,'map-county'));if(zoom===0){const b=f.bbox,p=project([(b[0]+b[2])/2,(b[1]+b[3])/2]);const t=el('text',{x:p[0],y:p[1],class:'map-label'});t.textContent=f.properties.name;svg.append(t);}}
  if(zoom>=2)for(const f of router.data.cities.features){const b=f.bbox;if(b[2]<w||b[0]>e||b[3]<s||b[1]>n)continue;svg.append(path(f,'map-city'));}
  if(zoom>=4&&category==='water')for(const f of router.data.water.features){const b=f.bbox;if(b[2]<w||b[0]>e||b[3]<s||b[1]>n)continue;svg.append(path(f,'map-water'));}
  const marker=el('g',{class:'map-marker',tabindex:0,role:'button','aria-label':'Drag location pin, or use arrow keys to move it. Enter selects this location.'});
  marker.append(el('circle',{cx:0,cy:-18,r:38,fill:'transparent',class:'map-pin-target'}));
  marker.append(el('ellipse',{cx:0,cy:1,rx:14,ry:5,class:'map-pin-shadow'}));
  marker.append(el('path',{d:'M0 0C-5-9-18-20-18-32a18 18 0 1 1 36 0C18-20 5-9 0 0Z',class:'map-pin-body'}));
  marker.append(el('circle',{cx:0,cy:-32,r:6,fill:'white',class:'map-pin-center'}));
  svg.append(marker);canvas.replaceChildren(svg);paintPin();describe();
  marker.onkeydown=e=>{
   const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.key];
   if(!d&&!['Enter',' '].includes(e.key))return;e.preventDefault();
   if(d){const fine=e.shiftKey?.1:1;lng+=d[0]*(bounds[2]-w)/60*fine;lat+=d[1]*(n-s)/60*fine;}
   commit();draw(true);
  };
  svg.onpointerdown=e=>{
   if(e.button!==0)return;e.preventDefault();down=true;svg.setPointerCapture(e.pointerId);
   const p=pointer(e);offset=e.target.closest('.map-marker')?[p[0]-(lng-w)/(east()-w)*600,p[1]-(n-lat)/(n-s)*360]:[0,0];
   svg.classList.add('dragging');move(e);
  };
  svg.onpointermove=e=>{if(down)move(e);};
  svg.onpointerup=e=>{if(!down)return;move(e);down=false;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);draw();};
  svg.onpointercancel=()=>{down=false;draw();};
  if(focus)marker.focus();
 }
 const east=()=>bounds[2];
 function pointer(e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const local=p.matrixTransform(svg.getScreenCTM().inverse());return [local.x,local.y];}
 function commit(){lat=+Math.max(-90,Math.min(90,lat)).toFixed(6);lng=+Math.max(-180,Math.min(180,lng)).toFixed(6);selected=true;onSelect(lat,lng);}
 function move(e){const [x,y]=pointer(e),[w,s,east,n]=bounds;lng=w+Math.max(0,Math.min(600,x-offset[0]))/600*(east-w);lat=n-Math.max(0,Math.min(360,y-offset[1]))/360*(n-s);commit();paintPin();status.textContent='Placing your pin…';}
 host.querySelectorAll('[data-zoom]').forEach(b=>b.onclick=()=>{zoom=Math.max(0,Math.min(zoom+Number(b.dataset.zoom),9));center=[lng,lat];draw();});
 host.querySelector('[data-region]').onclick=()=>{zoom=0;draw();};
 host.querySelector('[data-center]').onclick=()=>{center=[lng,lat];zoom=Math.max(5,zoom);draw();};
 draw();
 return {setPoint(a,b){lat=a;lng=b;selected=true;center=[b,a];zoom=Math.max(5,zoom);draw();}};
}
