const C='r2o-v5';const A=['./','./index.html','./route.js','./navdata.json','./manifest.webmanifest','./icon-192.png','https://unpkg.com/leaflet@1.9.4/dist/leaflet.css','https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(A)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
// Network first (always get the latest version when online), cache as offline fallback.
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=e.request.url;if(/tile\.openstreetmap/.test(u))return;
e.respondWith(fetch(e.request,{cache:'no-cache'}).then(res=>{if(res.ok&&(u.startsWith(self.location.origin)||/unpkg\.com/.test(u))){const cl=res.clone();caches.open(C).then(c=>c.put(e.request,cl));}return res;}).catch(()=>caches.match(e.request,{ignoreSearch:true})));});
