export const ANALYSIS_CATEGORIES=['water','road','lighting','other'];
export const ANALYSIS_SCHEMA={type:'object',additionalProperties:false,properties:{category:{type:'string',enum:ANALYSIS_CATEGORIES},certainty:{type:'string',enum:['clear','uncertain']},summary:{type:'string'},description:{type:'string'},observations:{type:'array',items:{type:'string'}},limitations:{type:'array',items:{type:'string'}}},required:['category','certainty','summary','description','observations','limitations']};
export function validateAnalysis(value){
 if(!value||!ANALYSIS_CATEGORIES.includes(value.category)||!['clear','uncertain'].includes(value.certainty))throw Error('The analysis was unclear. Please choose a category yourself.');
 for(const k of ['summary','description'])if(typeof value[k]!=='string'||value[k].length>(k==='summary'?600:1200))throw Error('The analysis returned an invalid description.');
 for(const k of ['observations','limitations'])if(!Array.isArray(value[k])||value[k].length>6||value[k].some(x=>typeof x!=='string'||x.length>400))throw Error('The analysis returned invalid observations.');
 return {category:value.certainty==='uncertain'?'other':value.category,certainty:value.certainty,summary:value.summary,description:value.description,observations:value.observations,limitations:value.limitations};
}
