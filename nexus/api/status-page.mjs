// Static, privacy-safe fallback for browser routes. Never interpolate request or DB details.
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function statusPage(title, message, status, extraHeaders = {}) {
 return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · DIG Nexus</title></head><body><a href="#main">Skip to main content</a><main id="main"><h1>${escape(title)}</h1><p>${escape(message)}</p><p><a href="/portal">Go to the member portal</a></p></main></body></html>`, {status, headers:{
 'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',
 'referrer-policy':'no-referrer','x-frame-options':'DENY',
 'content-security-policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",...extraHeaders}});
}
