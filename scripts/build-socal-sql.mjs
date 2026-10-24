import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {SAFETY_DIRECTORY} from '../dist/safety.js';
import {DIRECTORY,INTAKES} from '../dist/socal.js';

const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
export async function coverageStatements(){
 const statements=['begin;','delete from public.routing_features;','delete from public.routing_datasets;','delete from public.routing_contacts;'];
 for(const kind of ['counties','cities','districts','water']){
  const data=JSON.parse(await readFile(new URL('../dist/data/'+kind+'.geojson',import.meta.url),'utf8'));
  statements.push(`insert into public.routing_datasets(kind,source) values(${quote(kind)},${quote(JSON.stringify(data.source))}::jsonb);`);
  for(const f of data.features)statements.push(`insert into public.routing_features(kind,source_id,name,properties,boundary) values(${quote(kind)},${quote(f.properties.id)},${quote(f.properties.name)},${quote(JSON.stringify(f.properties))}::jsonb,extensions.st_multi(extensions.st_geomfromgeojson(${quote(JSON.stringify(f.geometry))})));`);
 }
 for(const c of [...DIRECTORY,...SAFETY_DIRECTORY,...Object.entries(INTAKES).map(([id,x])=>({...x,id,kind:'water',categories:['water'],checkedAt:'2026-10-20'}))]){
  statements.push(`insert into public.routing_contacts(kind,source_id,categories,contact) values(${quote(c.kind)},${quote(c.id)},${quote('{'+c.categories.join(',')+'}')}::text[],${quote(JSON.stringify(c))}::jsonb);`);
 }
 for(const c of [...DIRECTORY,...SAFETY_DIRECTORY,...Object.values(INTAKES).map(x=>({...x,categories:['water']})),{name:'Caltrans · State highway maintenance',categories:['road','lighting']}])statements.push(`insert into public.agencies(name,categories,is_demo) values(${quote(c.name)},${quote('{'+c.categories.join(',')+'}')}::text[],false) on conflict(name) do update set categories=excluded.categories;`);
 statements.push('commit;');return statements;
}
export async function coverageSQL(){return (await coverageStatements()).join('\n')+'\n';}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const target=process.argv[2]||'supabase/socal.generated.sql';await writeFile(target,await coverageSQL());console.log('Wrote '+target+'. Apply after migration 003 using a privileged database connection or SQL Editor.');
}
