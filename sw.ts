// Service worker for app shell caching and file sharing
const CACHE = 'app-cache-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : Promise.resolve()))))
  );
});

self.addEventListener('fetch', (event: any) => {
  const req: Request = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => cached)
    )
  );
});

// Handle file sharing and file handling
self.addEventListener('message', (event: any) => {
  if (event.data && event.data.type === 'SHARE_VIDEO') {
    // Forward the shared video data to the main app
    (self as any).clients.matchAll().then((clients: any[]) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'SHARED_VIDEO',
          file: event.data.file
        });
      });
    });
  }
});

// Handle share target (when app is opened via share)
self.addEventListener('fetch', (event: any) => {
  const url = new URL(event.request.url);
  
  // Handle share target POST requests
  if (event.request.method === 'POST' && url.pathname === '/') {
    event.respondWith(
      event.request.formData().then((formData) => {
        const file = formData.get('video') as File;
        if (file && file.type.startsWith('video/')) {
          // Store the shared file in IndexedDB and redirect to the app
          return storeSharedFile(file).then(() => {
            return new Response(null, {
              status: 302,
              headers: {
                'Location': '/?shared=true'
              }
            });
          });
        }
        return new Response('Invalid file type', { status: 400 });
      }).catch(() => {
        return new Response('Error processing shared file', { status: 500 });
      })
    );
  }
});

// Store shared file in IndexedDB
async function storeSharedFile(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('GIFMakerDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['sharedFiles'], 'readwrite');
      const store = transaction.objectStore('sharedFiles');
      
      const fileData = {
        id: Date.now(),
        file: file,
        timestamp: new Date().toISOString()
      };
      
      store.add(fileData);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('sharedFiles')) {
        db.createObjectStore('sharedFiles', { keyPath: 'id' });
      }
    };
  });
}

// Retrieve shared file from IndexedDB
async function getSharedFile(): Promise<File | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('GIFMakerDB', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction(['sharedFiles'], 'readonly');
      const store = transaction.objectStore('sharedFiles');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        const files = getAllRequest.result;
        if (files.length > 0) {
          // Get the most recent file
          const latestFile = files.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
          resolve(latestFile.file);
        } else {
          resolve(null);
        }
      };
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('sharedFiles')) {
        db.createObjectStore('sharedFiles', { keyPath: 'id' });
      }
    };
  });
}

