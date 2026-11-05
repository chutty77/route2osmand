// Route -> GPX service worker. Always fetch fresh from the network (bypassing the HTTP cache) and keep a copy for offline use.
const C='r2o-2.2.0';
const A=['./','./index.html','./route.js','./navdata.json','./manifest.webmanifest','./icon-192.png','./version.json'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>Promise.all(A.map(u=>fetch(u,{cache:'no-store'}).then(r=>r.ok&&c.put(u,r)).catch(()=>{})))));});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==self.location.origin)return; // map tiles, leaflet: browser handles normally
  const key=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
  e.respondWith(fetch(url.href,{cache:'no-store',credentials:'same-origin'}).then(res=>{
    if(res.ok){const cl=res.clone();caches.open(C).then(c=>c.put(key,cl));}return res;
  }).catch(()=>caches.match(key).then(r=>r||caches.match(req,{ignoreSearch:true}))));
});
