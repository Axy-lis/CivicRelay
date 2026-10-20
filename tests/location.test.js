import test from 'node:test';
import assert from 'node:assert/strict';
import {requestLocation} from '../dist/location.js';

function setup(geolocation,extra={}){
 let fire;let cleared=false;const success=[],failure=[];
 const cancel=requestLocation({geolocation,secureContext:true,policy:null,
  onSuccess:p=>success.push(p),onError:e=>failure.push(e),
  setTimer:fn=>{fire=fn;return 7;},clearTimer:id=>{assert.equal(id,7);cleared=true;},...extra});
 return {success,failure,cancel,fire:()=>fire?.(),cleared:()=>cleared};
}
test('independent watchdog stops a provider that never invokes a callback',()=>{
 const r=setup({getCurrentPosition(){}});assert.equal(r.failure.length,0);r.fire();
 assert.equal(r.failure[0].code,'timeout');assert.match(r.failure[0].message,/Safari or Chrome/);assert.equal(r.cleared(),true);
});
test('late success after timeout is ignored',()=>{
 let success;const r=setup({getCurrentPosition(fn){success=fn;}});r.fire();success({coords:{latitude:37.33,longitude:-121.9,accuracy:30}});
 assert.equal(r.success.length,0);assert.equal(r.failure.length,1);
});
test('successful location clears watchdog and uses approximate-position options',()=>{
 let options;const r=setup({getCurrentPosition(fn,_error,opt){options=opt;fn({coords:{latitude:37.33,longitude:-121.9,accuracy:30}});}});
 assert.deepEqual(r.success,[{lat:37.33,lng:-121.9,accuracy:30}]);assert.equal(r.cleared(),true);assert.equal(options.enableHighAccuracy,false);r.fire();assert.equal(r.failure.length,0);
});
test('denied, unavailable, and provider timeouts produce distinct guidance',()=>{
 for(const [code,kind] of [[1,'denied'],[2,'unavailable'],[3,'timeout']]){
  const r=setup({getCurrentPosition(_success,fail){fail({code});}});assert.equal(r.failure[0].code,kind);assert.match(r.failure[0].message,/sample location/);
 }
});
test('unsupported browser, insecure page and blocked embedding fail without waiting',()=>{
 assert.equal(setup({}).failure[0].code,'unsupported');
 assert.equal(setup({}, {secureContext:false}).failure[0].code,'insecure');
 assert.equal(setup({getCurrentPosition(){}},{policy:{allowsFeature:()=>false}}).failure[0].code,'blocked');
});
test('cancellation ignores late provider results and watchdog',()=>{
 let success;const r=setup({getCurrentPosition(fn){success=fn;}});r.cancel();success({coords:{latitude:37.33,longitude:-121.9}});r.fire();assert.equal(r.success.length,0);assert.equal(r.failure.length,0);
});
test('synchronous provider exceptions and invalid position data finish cleanly',()=>{
 assert.equal(setup({getCurrentPosition(){throw {name:'SecurityError'};}}).failure[0].code,'denied');
 assert.equal(setup({getCurrentPosition(fn){fn({coords:{latitude:NaN,longitude:0}});}}).failure[0].code,'unavailable');
});
