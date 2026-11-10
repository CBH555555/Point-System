// Nur die privaten Medien dieses Projekts über die angemeldete Seite abrufen.
const storageOrigin = 'https://punkte-paar-271.pages.dev';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function getMedia(event, key) {
  let client = event.clientId ? await self.clients.get(event.clientId) : null;
  if (!client && event.request.mode === 'navigate') {
    const windows = await self.clients.matchAll({type:'window'});
    client = windows.find(w => w.url.startsWith(self.registration.scope));
  }
  if (!client || !client.url.startsWith(self.registration.scope)) {
    return new Response('Bitte die Punkte-Seite öffnen.', {status: 401});
  }
  const channel = new MessageChannel();
  const auth = await new Promise(resolve => {
    const timeout = setTimeout(() => resolve(null), 5000);
    channel.port1.onmessage = message => {
      clearTimeout(timeout);
      resolve(message.data);
    };
    client.postMessage('punkte-medien-anmeldung', [channel.port2]);
  });
  channel.port1.close();
  if (!auth) return new Response('Bitte erneut anmelden.', {status: 401});
  const res = await fetch(storageOrigin + '/media/' + key, {
    headers: {Authorization: auth}, credentials: 'omit', redirect: 'error', cache: 'no-store'
  });
  if (!res.ok) return new Response(null, {status: res.status});
  const blob = await res.blob();
  const headers = {'Content-Type': blob.type, 'Cache-Control':'no-store', 'Accept-Ranges':'bytes'};
  const range = /^bytes=(\d+)-(\d*)$/.exec(event.request.headers.get('Range') || '');
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]),blob.size - 1) : blob.size - 1;
    if (start > end) return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+blob.size}});
    headers['Content-Range'] = `bytes ${start}-${end}/${blob.size}`;
    headers['Content-Length'] = String(end-start+1);
    return new Response(blob.slice(start,end+1),{status:206,headers});
  }
  return new Response(blob,{headers});
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin === storageOrigin && /^\/media\/[0-9a-f]{64}$/.test(url.pathname)) {
    event.respondWith(getMedia(event,url.pathname.slice(7)));
    return;
  }
  const prefix = new URL('private-medien/',self.registration.scope).href;
  if (event.request.method !== 'GET' || !url.href.startsWith(prefix)) return;
  const key = url.href.slice(prefix.length);
  if (/^[a-f0-9]{64}$/.test(key)) event.respondWith(getMedia(event,key));
});
