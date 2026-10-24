import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {coverageStatements} from './build-socal-sql.mjs';

// Each editor query has its own transaction. Stage privately until the last
// query verifies completeness and activates the snapshot in one transaction.
export async function coverageEditorSQL(limit=450000){
 const statements=await coverageStatements(),tables=['datasets','features','contacts'];
 const init=['begin;'];
 for(const t of tables){init.push(`drop table if exists civic_private.socal_import_${t};`,`create table civic_private.socal_import_${t} (like public.routing_${t} including all);`,`revoke all on civic_private.socal_import_${t} from public,anon,authenticated;`);}
 init.push('commit;');
 const files=[{name:'01-start.sql',sql:init.join('\n')+'\n'}];
 let batch=[],size=0;
 const flush=()=>{if(!batch.length)return;files.push({name:String(files.length+1).padStart(2,'0')+'-load.sql',sql:['begin;',...batch,'commit;'].join('\n')+'\n'});batch=[];size=0;};
 for(let sql of statements){
  const t=tables.find(t=>sql.startsWith('insert into public.routing_'+t+'('));if(!t)continue;
  sql=sql.replace('insert into public.routing_'+t+'(','insert into civic_private.socal_import_'+t+'(').slice(0,-1);
  sql+=t==='datasets'?' on conflict(kind) do update set source=excluded.source;':t==='features'?' on conflict(kind,source_id) do update set name=excluded.name,properties=excluded.properties,boundary=excluded.boundary;':' on conflict(kind,source_id) do update set categories=excluded.categories,contact=excluded.contact;';
  const bytes=Buffer.byteLength(sql)+1;if(bytes+20>limit)throw new Error('An individual geometry exceeds the editor chunk size. Use a direct database connection.');
  if(size+bytes+20>limit)flush();batch.push(sql);size+=bytes;
 }
 flush();
 const finish=['begin;','do $$ begin'];
 for(const kind of ['counties','cities','districts','water']){
  const d=JSON.parse(await readFile(new URL('../dist/data/'+kind+'.geojson',import.meta.url),'utf8'));
  finish.push(`if (select count(*) from civic_private.socal_import_features where kind='${kind}')<>${d.features.length} then raise exception 'Incomplete ${kind} import. Run every load file before finishing.';end if;`);
 }
 const contacts=statements.filter(s=>s.startsWith('insert into public.routing_contacts(')).length;
 finish.push(`if (select count(*) from civic_private.socal_import_datasets)<>4 or (select count(*) from civic_private.socal_import_contacts)<>${contacts} then raise exception 'Incomplete source/contact import. Run every load file.';end if;`,'end $$;');
 finish.push('delete from public.routing_features;','delete from public.routing_datasets;','delete from public.routing_contacts;');
 for(const t of tables)finish.push(`insert into public.routing_${t} select * from civic_private.socal_import_${t};`);
 finish.push(...statements.filter(s=>s.startsWith('insert into public.agencies(')));
 for(const t of tables)finish.push(`drop table civic_private.socal_import_${t};`);
 finish.push('commit;','select kind,count(*) from public.routing_features group by kind order by kind;');
 files.push({name:String(files.length+1).padStart(2,'0')+'-finish.sql',sql:finish.join('\n')+'\n'});
 return files;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const dir=process.argv[2]||'supabase/socal-editor.generated';await mkdir(dir,{recursive:true});
 const files=await coverageEditorSQL();
 for(const f of files)await writeFile(dir+'/'+f.name,f.sql);
 await writeFile(dir+'/README.txt','Run these files in Supabase SQL Editor, in numbered order, one new query per file.\n\n'+files.map(f=>f.name).join('\n')+'\n\nRun 01-start only once at the beginning. Load files can be retried. Run the finish file last: it checks completeness and activates the data. Stop on any error and share the error text.\n');
 console.log(JSON.stringify(files.map(f=>({name:f.name,bytes:Buffer.byteLength(f.sql)}))));
}
