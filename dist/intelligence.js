import {validateAnalysis} from './intelligence-contract.js';
export {validateAnalysis};
export const DEPARTMENT_TYPES={water:'Water services',road:'Public works / roads',lighting:'Street lighting',other:'Manual department review'};
const RULES=[
 ['water',/\b(?:water (?:main|pipe|leak)|burst pipe|broken (?:water )?pipe|leaking (?:pipe|hydrant)|hydrant (?:is )?leaking|pipe (?:is )?leaking|water (?:is )?(?:gushing|leaking))\b/gi],
 ['road',/\b(?:potholes?|broken (?:sidewalk|pavement)|damaged (?:road|sidewalk|pavement)|cracked (?:sidewalk|pavement)|road (?:damage|surface)|sidewalk (?:is )?(?:broken|cracked))\b/gi],
 ['lighting',/\b(?:(?:broken|flickering|damaged) (?:street ?light|lamp ?post)|street ?light (?:is )?(?:out|broken|flickering|not working|isn't working)|street ?light outage)\b/gi]
];
export function suggestFromDescription(description){
 const text=String(description||'').trim();if(text.length<8)return null;
 // A deterministic offline helper, deliberately conservative around negation and multiple issues.
 const hits=RULES.flatMap(([category,pattern])=>{pattern.lastIndex=0;const matches=[...text.matchAll(pattern)].filter(m=>!/(?:\bno|\bnot|\bwithout|\bisn't)\s+(?:\w+\s+){0,2}$/i.test(text.slice(Math.max(0,m.index-28),m.index)));return matches.length?[{category,phrases:matches.map(m=>m[0])}]:[];});
 if(hits.length!==1)return {category:'other',certainty:'uncertain',summary:hits.length?'Several issue types are mentioned. Choose the main issue or submit separate reports.':'No clear infrastructure match. Add the affected object and what is wrong with it, or keep Other.',description:'',observations:[],limitations:['This is a local keyword suggestion, not AI image analysis.'],source:'rules'};
 const h=hits[0];return {category:h.category,certainty:'clear',summary:'Your description mentions '+h.phrases.slice(0,2).map(x=>'“'+x+'”').join(' and ')+'.',description:'',observations:[],limitations:['The actual department depends on the confirmed pin and service boundaries.'],source:'rules'};
}
export function analysisStamp(draft,mode){return JSON.stringify([mode,draft.description,mode==='photo'?draft.photo:null]);}
