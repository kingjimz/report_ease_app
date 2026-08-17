import { Injectable } from '@angular/core';

interface QueuedOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  collection: 'reports' | 'bibleStudies' | 'goals' | 'missionCompletions';
  data: any;
  timestamp: number;
  retries: number;
  /**
   * Identity of the write, so repeated attempts at the same document collapse
   * onto one row instead of each minting a fresh entry with a clean retry
   * budget. Empty for creates without an id - those are genuinely distinct
   * events and must never merge. Absent on rows written before this existed.
   */
  dedupeKey?: string;
}

@Injectable({
  providedIn: 'root',
})
export class OfflineStorageService {
  private dbName = 'ReportEaseOfflineDB';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;
  private readonly maxRetries = 3;

  constructor() {
    this.initDB();
  }

  private async initDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB opened successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains('operations')) {
          const operationsStore = db.createObjectStore('operations', { keyPath: 'id' });
          operationsStore.createIndex('timestamp', 'timestamp', { unique: false });
          operationsStore.createIndex('collection', 'collection', { unique: false });
        }

        if (!db.objectStoreNames.contains('cache')) {
          const cacheStore = db.createObjectStore('cache', { keyPath: 'key' });
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (this.db) {
      return this.db;
    }
    await this.initDB();
    if (!this.db) {
      throw new Error('Failed to initialize IndexedDB');
    }
    return this.db;
  }

  async queueOperation(
    type: 'create' | 'update' | 'delete',
    collection: 'reports' | 'bibleStudies' | 'goals' | 'missionCompletions',
    data: any,
  ): Promise<string> {
    const db = await this.ensureDB();
    // Creates have no document id yet, so they can never be deduplicated.
    const dedupeKey = data?.id ? `${type}:${collection}:${data.id}` : '';

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['operations'], 'readwrite');
      const store = transaction.objectStore('operations');
      const existingRequest = store.getAll();

      existingRequest.onsuccess = () => {
        const existing = dedupeKey
          ? (existingRequest.result as QueuedOperation[]).find((op) => op.dedupeKey === dedupeKey)
          : undefined;

        const operation: QueuedOperation = {
          // Reuse the id so the sync loop's removeOperation(op.id) still matches.
          id: existing?.id ?? `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type,
          collection,
          data,
          timestamp: Date.now(),
          // Carry the budget forward. Minting retries: 0 on every enqueue is why
          // maxRetries never fired and a failing write could queue forever.
          retries: existing?.retries ?? 0,
          dedupeKey,
        };

        // put, not add: add() rejects when the key already exists, and merging
        // onto an existing row is the whole point.
        const request = store.put(operation);

        request.onsuccess = () => {
          console.log(`Operation queued: ${type} ${collection}`, operation.id);
          resolve(operation.id);
        };

        request.onerror = () => {
          console.error('Failed to queue operation:', request.error);
          reject(request.error);
        };
      };

      existingRequest.onerror = () => {
        console.error('Failed to read operation queue:', existingRequest.error);
        reject(existingRequest.error);
      };
    });
  }

  async getQueuedOperations(): Promise<QueuedOperation[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['operations'], 'readonly');
      const store = transaction.objectStore('operations');
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('Failed to get queued operations:', request.error);
        reject(request.error);
      };
    });
  }

  async removeOperation(operationId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['operations'], 'readwrite');
      const store = transaction.objectStore('operations');
      const request = store.delete(operationId);

      request.onsuccess = () => {
        console.log(`Operation removed: ${operationId}`);
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to remove operation:', request.error);
        reject(request.error);
      };
    });
  }

  async incrementRetry(operationId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['operations'], 'readwrite');
      const store = transaction.objectStore('operations');
      const getRequest = store.get(operationId);

      getRequest.onsuccess = () => {
        const operation = getRequest.result;
        if (operation) {
          operation.retries += 1;
          const putRequest = store.put(operation);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async cacheData(key: string, data: any): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const request = store.put({ key, data, timestamp: Date.now() });

      request.onsuccess = () => {
        console.log(`Data cached: ${key}`);
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to cache data:', request.error);
        reject(request.error);
      };
    });
  }

  async getCachedData(key: string): Promise<any | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['cache'], 'readonly');
      const store = transaction.objectStore('cache');
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.data : null);
      };

      request.onerror = () => {
        console.error('Failed to get cached data:', request.error);
        reject(request.error);
      };
    });
  }

  async clearCache(): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['cache'], 'readwrite');
      const store = transaction.objectStore('cache');
      const request = store.clear();

      request.onsuccess = () => {
        console.log('Cache cleared');
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to clear cache:', request.error);
        reject(request.error);
      };
    });
  }

  getMaxRetries(): number {
    return this.maxRetries;
  }
}
