import {createAnalysisHandler} from '../_shared/analysis.js';
Deno.serve(createAnalysisHandler({env:(key:string)=>Deno.env.get(key)}));
