self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open('ggs-store-v3').then((cache) => {
      return cache.addAll([
        '/GraficaGGS%202/',
        '/GraficaGGS%202/index.html',
        '/GraficaGGS%202/Formulario.html',
        '/GraficaGGS%202/admin.html',
        '/GraficaGGS%202/css/main.css',
        '/GraficaGGS%202/css/store.css',
        '/GraficaGGS%202/js/main.js',
        '/GraficaGGS%202/js/firebaseApp.js',
        '/GraficaGGS%202/js/anonAuth.js',
        '/GraficaGGS%202/js/adminAuth.js',
        '/GraficaGGS%202/js/whatsapp.js',
        '/GraficaGGS%202/js/pdfFieldMap.js',
        '/GraficaGGS%202/js/pdfAuthorizationService.js',
        '/GraficaGGS%202/js/pdfMergeService.js',
        '/GraficaGGS%202/js/zipService.js',
        '/GraficaGGS%202/js/requestService.js',
        '/GraficaGGS%202/js/formularioController.js',
        '/GraficaGGS%202/js/adminPanel.js',
        '/GraficaGGS%202/templates/autorizacao-2026.pdf',
        '/GraficaGGS%202/images/logo.png'
      ]);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== 'ggs-store-v3').map((key) => caches.delete(key)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
