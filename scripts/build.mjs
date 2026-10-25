import {copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
await build({entryPoints:['src/cloud-client.js'],outfile:'dist/cloud-client.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,sourcemap:false});
console.log('Built shared database client.');

await copyFile('supabase/functions/_shared/contract.js','dist/intelligence-contract.js');

await import('./build-analysis-function.mjs');
