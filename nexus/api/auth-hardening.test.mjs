import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EncryptJWT} from 'jose';
import {logoutGoogle} from './google-auth.mjs';
import {magicRequest} from './magic-auth.mjs';
import {providerFetch} from './provider-fetch.mjs';
const origin='https://nexus.example.invalid',secret='s'.repeat(60);
test('both logout methods clear malformed, expired, rotated and unrevocable cookies',async()=>{
 const key=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)));
 for(const magic of [false,true])for(const kind of ['malformed','expired','rotated','store-throws','store-false']){
  let value='broken';
  if(kind!=='malformed')value=await new EncryptJWT({sid:'a'.repeat(43)}).setProtectedHeader({alg:'dir',enc:'A256GCM'}).setExpirationTime(kind==='expired'?1:'1h').encrypt(key);
  const path=magic?'/api/auth/magic/logout':'/auth/logout';
  const name=magic?'__Host-dig_nexus_magic':'__Host-dig_nexus_session';
  const env={MAGIC_LINK_ENABLED:true,MAGIC_LINK_SESSION_SECRET:kind==='rotated'?secret+'x':secret,GOOGLE_SESSION_SECRET:kind==='rotated'?secret+'x':secret,
   authStateStore:async()=>{if(kind==='store-throws')throw Error('private');return false;}};
  const req=new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/json',cookie:name+'='+value},body:'{}'});
  const r=magic?await magicRequest(req,env,path):await logoutGoogle(req,env);
  assert.equal(r.status,503,kind);assert.match(r.headers.get('set-cookie'),/Max-Age=0/);assert.doesNotMatch(await r.text(),/private/);
 }
});
test('provider deadline bounds ignored abort and stalled body, sanitizes errors',async()=>{
 for(const body of [false,true]){
  let signal;
  await assert.rejects(providerFetch(async(_url,opts)=>{signal=opts.signal;return body?{}:new Promise(()=>{});},'https://synthetic.invalid',{},body?()=>new Promise(()=>{}):r=>r,5),/Provider request unavailable/);
  assert.equal(signal.aborted,true);
 }
 await assert.rejects(providerFetch(async()=>{throw Error('provider-secret');},'https://synthetic.invalid',{}),/^Error: Provider request unavailable$/);
});
test('all outbound auth and ticket providers enforce their deadline with injected fetch',async t=>{
 const {sendMagicEmail}=await import('./magic-auth.mjs');
 const {fetchZeffyPayment,sendTransactionEmail}=await import('./ntc-providers.mjs');
 const {startGoogleLogin,finishGoogleLogin}=await import('./google-auth.mjs');
 const env={PUBLIC_ORIGIN:origin,MAILERSEND_API_TOKEN:'synthetic',MAILERSEND_FROM_EMAIL:'sender@example.invalid',ZEFFY_API_KEY:'synthetic',DIG_TRANSACTIONAL_EMAIL_ENABLED:true,
 GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_REDIRECT_URI:origin+'/auth/google/callback',GOOGLE_SESSION_SECRET:secret,authStateStore:async()=>true};
 const start=await startGoogleLogin(new Request(origin+'/auth/google/start'),env);
 const state=new URL(start.headers.get('location')).searchParams.get('state');
 const signals=[];const stalled=async(_url,options)=>{signals.push(options.signal);return new Promise(()=>{});};
 const promises=[
 sendMagicEmail(env,{to:'recipient@example.invalid',token:'a'.repeat(43),event:'synthetic',origin},stalled),
 fetchZeffyPayment(env,'00000000-0000-4000-8000-000000000001',stalled),
 sendTransactionEmail(env,{kind:'registration',email:'recipient@example.invalid',confirmationReference:'synthetic'},stalled),
 finishGoogleLogin(new Request(origin+'/auth/google/callback?code=synthetic&state='+state,{headers:{cookie:start.headers.get('set-cookie').split(';')[0]}}),env,{fetcher:stalled})
 ];
 const results=await Promise.allSettled(promises);
 assert.equal(signals.length,4);assert.ok(signals.every(s=>s.aborted));
 for(const r of results.slice(0,3)){assert.equal(r.status,'rejected');assert.equal(r.reason.message,'Provider request unavailable');}
 assert.equal(results[3].value.status,401);
});
test('revoked explicit Google session never substitutes a valid magic session',async()=>{
 const {attendeeIdentity}=await import('./magic-auth.mjs');
 const key=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)));
 const seal=payload=>new EncryptJWT(payload).setProtectedHeader({alg:'dir',enc:'A256GCM'}).setExpirationTime('1h').encrypt(key);
 const google=await seal({sid:'g'.repeat(43),issuer:'https://accounts.google.com',subject:'google',email:'google@example.invalid',emailVerified:true});
 const magic=await seal({sid:'m'.repeat(43),issuer:'urn:dig:nexus:magic',subject:'magic:00000000-0000-4000-8000-000000000001',email:'magic@example.invalid',emailVerified:true});
 const env={MAGIC_LINK_ENABLED:true,MAGIC_LINK_SESSION_SECRET:secret,GOOGLE_SESSION_SECRET:secret,GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',GOOGLE_REDIRECT_URI:origin+'/auth/google/callback',authStateStore:async(_action,sid)=>sid==='m'.repeat(43)};
 const req=cookie=>new Request(origin,{headers:{cookie}});
 assert.equal((await attendeeIdentity(req('__Host-dig_nexus_magic='+magic),env)).email,'magic@example.invalid');
 await assert.rejects(attendeeIdentity(req('__Host-dig_nexus_magic='+magic+'; __Host-dig_nexus_session='+google),env),/revoked/);
});
test('magic DB adapter returns permanent subject and binds token hash',async()=>{
 const {createMagicDb}=await import('./magic-db.mjs');
 const account={email:'synthetic@example.invalid',eventSlug:'synthetic',subject:'magic:00000000-0000-4000-8000-000000000001'};
 const db=createMagicDb({query:async(sql,params)=>{
  assert.deepEqual(params,['a'.repeat(64)]);
  if(sql==='SELECT nexus_magic_available($1) AS value')return {rows:[{value:true}]};
  assert.equal(sql,'SELECT nexus_magic_consume($1) AS value');
  return {rows:[{value:account}]};
 }});
 assert.equal(await db.available('a'.repeat(64)),true);
 assert.deepEqual(await db.consume('a'.repeat(64)),account);
});
