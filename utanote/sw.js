/* アプリ本体はオンライン時に更新し、オフラインでは保存済みの画面を使う */
var CACHE='utanote-v20';
var SHELL=['./','index.html','learn.html','manifest.webmanifest','icon-192.png','icon-512.png','icon-512-maskable.png','apple-touch-icon.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(SHELL)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(k){return k.indexOf('utanote-')===0&&k!==CACHE}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){
  var req=e.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin)return;
  e.respondWith(caches.open(CACHE).then(async function(c){
    try{var res=await fetch(req);if(res.ok&&!res.redirected)await c.put(req,res.clone());return res}
    catch(err){return (await c.match(req))||(req.mode==='navigate'?await c.match(url.pathname.endsWith('/learn.html')?'learn.html':'index.html'):null)||Response.error()}
  }));
});
