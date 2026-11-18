import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import worker from './worker.mjs';
const origin='https://synthetic.invalid';
const request=(path,method='GET')=>new Request(origin+path,{method});
async function htmlFailure(response,status){
 assert.equal(response.status,status);
 assert.match(response.headers.get('content-type'),/^text\/html/);
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.match(response.headers.get('content-security-policy'),/default-src 'none'/);
 const body=await response.text();
 assert.match(body,/<html lang="en">/);assert.match(body,/<h1>/);
 assert.match(body,/<a href="#main">Skip/);assert.match(body,/<main id="main">/);
 assert.doesNotMatch(body,/<script|private-detail|attendee@|secret-token|data-event=/);
 return body;
}
test('HTML agenda failures are accessible and private; equivalent API errors remain JSON',async()=>{
 const cases=[
  ['missing',{},503,'GET'],['draft',{agendaDb:{getPublishedAgenda:async()=>null}},404,'GET'],
  ['unknown',{agendaDb:{getPublishedAgenda:async()=>null}},404,'GET'],
  ['%3Cscript%3E',{},404,'GET'],['event',{},405,'POST'],
  ['event',{agendaDb:{getPublishedAgenda:async()=>{throw Error('private-detail');}}},503,'GET']
 ];
 for(const [slug,env,status,method] of cases){
  const r=await worker.fetch(request('/events/'+slug,method),env);
  if(status===405)assert.equal(r.headers.get('allow'),'GET');
  await htmlFailure(r,status);
  const api=await worker.fetch(request('/api/events/'+slug+'/agenda',method),env);
  assert.equal(api.status,status);assert.match(api.headers.get('content-type'),/application\/json/);
  assert.deepEqual(Object.keys(await api.json()),['error']);
 }
});
test('disabled association document contains next steps and no active workspace',async()=>{
 for(const flags of [{},{CONSTITUENTS_ENABLED:'false',CAMPAIGNS_ENABLED:'false'}]){
  const body=await htmlFailure(await worker.fetch(request('/association'),flags),503);
  assert.match(body,/Contact your DIG administrator/);assert.doesNotMatch(body,/<form|member-detail/);
 }
});
const identity={verified:true,emailVerified:true,issuer:'https://accounts.google.com',subject:'synthetic',email:'attendee@synthetic.invalid'};
test('check-in shell and script require both explicit flags before identity lookup',async()=>{
 for(const flags of [{},{NTC_TICKETING_ENABLED:true},{NTC_CHECKIN_ENABLED:true},{NTC_TICKETING_ENABLED:'false',NTC_CHECKIN_ENABLED:'true'}]){
  const env={...flags,verifyTicketingIdentity:async()=>{throw Error('must not authenticate while disabled');}};
  await htmlFailure(await worker.fetch(request('/checkin/test'),env),503);
  const script=await worker.fetch(request('/checkin-client.mjs'),env);
  assert.equal(script.status,503);assert.match(script.headers.get('content-type'),/application\/json/);
  assert.deepEqual(await script.json(),{error:'checkin_unavailable'});
 }
});
test('check-in requires a verified Google session; spoofed identity headers never suffice',async()=>{
 const flags={NTC_TICKETING_ENABLED:true,NTC_CHECKIN_ENABLED:'true'};
 for(const id of [null,{...identity,verified:false},{...identity,emailVerified:false},{...identity,issuer:'https://magic.invalid'}]){
  const env={...flags,verifyTicketingIdentity:async()=>id};
  await htmlFailure(await worker.fetch(request('/checkin/test'),env),401);
  assert.equal((await worker.fetch(request('/checkin-client.mjs'),env)).status,401);
 }
 await htmlFailure(await worker.fetch(new Request(origin+'/checkin/test',{headers:{'x-role':'admin','x-member-id':'synthetic'}}),flags),401);
 const env={...flags,verifyTicketingIdentity:async()=>identity};
 const page=await worker.fetch(request('/checkin/test'),env);assert.equal(page.status,200);
 const body=await page.text();assert.match(body,/Skip to check-in/);assert.doesNotMatch(body,/attendee@/);
 assert.equal((await worker.fetch(request('/checkin-client.mjs'),env)).status,200);
 await htmlFailure(await worker.fetch(request('/checkin/test','POST'),env),405);
});
const payment={id:'50000000-0000-4000-8000-000000000005',object:'payment',campaign_id:'20000000-0000-4000-8000-000000000002',type:'online',status:'succeeded',currency:'usd',refund_status:'none',dispute:null,amount:2550,buyer:{email:identity.email},items:[{type:'ticket',rate_id:'30000000-0000-4000-8000-000000000003',amount:2500}]};
test('signed independently fetched webhooks acknowledge privately; verification and persistence failures stay retryable',async()=>{
 const secret='whsec_synthetic-secret',body=JSON.stringify({id:'event-synthetic-123',type:'payment.completed',data:{id:payment.id}});
 const t=Math.floor(Date.now()/1000),signature='t='+t+',v1='+createHmac('sha256',secret).update(t+'.'+body).digest('hex');
 const signed=()=>new Request(origin+'/api/zeffy/webhook',{method:'POST',body,headers:{'zeffy-signature':signature}});
 let fetched=0,resolved=0;
 const env={NTC_TICKETING_ENABLED:true,NTC_ZEFFY_WEBHOOK_ENABLED:true,ZEFFY_WEBHOOK_SECRET:secret,ZEFFY_API_KEY:'synthetic',zeffyFetch:async()=>{fetched++;return Response.json(payment);}};
 for(const status of ['paid','paid_review','refund_review','duplicate']){
  const r=await worker.fetch(signed(),{...env,ticketingDb:{reconcile:async()=>({status,private:'secret-token'}),resolveReview:async()=>{resolved++;}}});
  assert.equal(r.status,200);assert.deepEqual(await r.json(),{acknowledged:true});
 }
 assert.equal(fetched,4);assert.equal(resolved,1);
 for(const db of [
  {reconcile:async()=>{throw Error('private-detail');}},
  {reconcile:async()=>({status:'paid'}),resolveReview:async()=>{throw Error('private-detail');}},
  {reconcile:async()=>{throw Object.assign(Error('private-detail'),{code:'P0002'});},review:async()=>{throw Error('private-detail');}}
 ]){
  const r=await worker.fetch(signed(),{...env,ticketingDb:db});assert.equal(r.status,503);
  assert.deepEqual(await r.json(),{error:'webhook_unavailable'});
 }
 const db={reconcile:async()=>{throw Error('must not reconcile');}};
 const unavailable=await worker.fetch(signed(),{...env,ticketingDb:db,zeffyFetch:async()=>{throw Error('private-detail');}});
 assert.equal(unavailable.status,503);
 const invalid=await worker.fetch(signed(),{...env,ticketingDb:db,zeffyFetch:async()=>Response.json({...payment,type:'manual'})});
 assert.equal(invalid.status,422);
});
test('checked-in proxy keeps access logging disabled and jobs require independent enablement',async()=>{
 const caddy=await readFile(new URL('../../deploy/Caddyfile',import.meta.url),'utf8');
 const directives=caddy.split('\n').filter(line=>!line.trim().startsWith('#')).join('\n');
 assert.doesNotMatch(directives,/\b(log|log_append|log_name|debug)\b/);
 const compose=await readFile(new URL('../../compose.yaml',import.meta.url),'utf8');
 assert.match(compose,/NEXUS_JOB_WORKER_ENABLED: "false"/);
 assert.match(compose,/authorized operator must independently set/);
 const security=await readFile(new URL('../../SECURITY.md',import.meta.url),'utf8');
 assert.match(security,/including its path and query/);assert.match(security,/RFC 8058/);
});
