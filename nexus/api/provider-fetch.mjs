// Bound the complete provider operation, including response-body parsing.
export async function providerFetch(fetcher,url,options,read=r=>r,timeoutMs=10000){
 const controller=new AbortController();let timer;
 try{return await Promise.race([
  Promise.resolve().then(()=>fetcher(url,{...options,signal:controller.signal})).then(read),
  new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Provider deadline exceeded'));},timeoutMs);})
 ]);}catch{throw Error('Provider request unavailable');}finally{clearTimeout(timer);}
}
