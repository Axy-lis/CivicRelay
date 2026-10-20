import {validCoordinates} from './core.js';

export const LOCATION_WAIT_MS = 15000;

export function locationError(code) {
 const guidance = 'You can choose a sample location or enter coordinates instead.';
 const messages = {
  denied: 'Location access was denied. Allow location for this website and your browser in system settings, then retry.',
  unavailable: 'Your device could not determine a location. Check Location Services and try again.',
  timeout: 'Location did not respond in time. If you are using an in-app preview, open the demo link in Safari or Chrome and allow location, then retry.',
  unsupported: 'This browser does not provide location access. Open the demo link in Safari or Chrome to try there.',
  insecure: 'Location requires a secure connection. Open the HTTPS demo link in Safari or Chrome.',
  blocked: 'This preview blocks location access. Open the demo link in Safari or Chrome and allow location there.'
 };
 return {code, message: `${messages[code] || messages.unavailable} ${guidance}`};
}

// The browser's timeout does not include time spent obtaining permission. This
// independent watchdog also covers hosts that never deliver either callback.
export function requestLocation({
 geolocation = globalThis.navigator?.geolocation,
 secureContext = globalThis.isSecureContext,
 policy = globalThis.document?.permissionsPolicy || globalThis.document?.featurePolicy,
 timeoutMs = LOCATION_WAIT_MS,
 onSuccess, onError,
 setTimer = setTimeout, clearTimer = clearTimeout
}) {
 let finished = false;
 let timer;
 const finish = (callback, result) => {
  if (finished) return;
  finished = true;
  if (timer !== undefined) clearTimer(timer);
  callback(result);
 };
 const fail = code => finish(onError, locationError(code));
 const cancel = () => { finished = true; if (timer !== undefined) clearTimer(timer); };
 if (!secureContext) { fail('insecure'); return cancel; }
 if (!geolocation?.getCurrentPosition) { fail('unsupported'); return cancel; }
 try {
  if (policy?.allowsFeature && !policy.allowsFeature('geolocation')) { fail('blocked'); return cancel; }
 } catch { /* A host may not implement Permissions Policy inspection. */ }
 timer = setTimer(() => fail('timeout'), timeoutMs);
 try {
  geolocation.getCurrentPosition(position => {
   const {latitude, longitude, accuracy} = position?.coords || {};
   if (!validCoordinates(latitude, longitude)) return fail('unavailable');
   finish(onSuccess, {lat: latitude, lng: longitude, accuracy: Number.isFinite(accuracy) ? Math.max(0, accuracy) : null});
  }, error => fail(({1:'denied',2:'unavailable',3:'timeout'})[error?.code] || 'unavailable'), {
   // Approximate device positioning is sufficient to start; residents can correct it.
   enableHighAccuracy: false,
   timeout: Math.min(10000, timeoutMs),
   maximumAge: 60000
  });
 } catch (error) {
  fail(error?.name === 'SecurityError' || error?.name === 'NotAllowedError' ? 'denied' : 'unavailable');
 }
 return cancel;
}
