// Blob persistence for the sql.js engine on web and Capacitor (both use IndexedDB).

import type { BlobStore } from './engine';

const DB_NAME = 'weha-device-framework';
const STORE_NAME = 'blobs';
const BLOB_KEY = 'sqlite';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function whenTransactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IndexedDbBlobStore implements BlobStore {
  async load(): Promise<Uint8Array | null> {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const result = await requestToPromise(tx.objectStore(STORE_NAME).get(BLOB_KEY));
      if (!result) return null;
      if (result instanceof Uint8Array) return result;
      if (result instanceof ArrayBuffer) return new Uint8Array(result);
      return null;
    } finally {
      db.close();
    }
  }

  async save(data: Uint8Array): Promise<void> {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      // Store as ArrayBuffer — structured-clone friendly across browsers.
      const copy = data.slice().buffer;
      await requestToPromise(tx.objectStore(STORE_NAME).put(copy, BLOB_KEY));
      // The put request succeeding does NOT mean the data is durable: the
      // transaction commits asynchronously, and a navigation (page reload)
      // before that aborts it — losing the write (e.g. the mobile session
      // row right after login). Await the commit before reporting success.
      await whenTransactionDone(tx);
    } finally {
      db.close();
    }
  }
}

export class MemoryBlobStore implements BlobStore {
  private data: Uint8Array | null = null;

  async load(): Promise<Uint8Array | null> {
    return this.data;
  }

  async save(data: Uint8Array): Promise<void> {
    this.data = data.slice();
  }
}
