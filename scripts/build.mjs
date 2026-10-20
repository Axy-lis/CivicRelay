import {build} from 'esbuild';
await build({entryPoints:['src/cloud-client.js'],outfile:'dist/cloud-client.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,sourcemap:false});
console.log('Built shared database client.');
