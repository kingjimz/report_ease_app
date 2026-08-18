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
  // v2 clears the operations store on upgrade. An earlier auto-flag write loop
  // left thousands of doomed 'update' rows on every device it ran on, and the
  // sync drain works through them one network round trip at a time, so the
  // console spam outlived the code that caused it. This queue is a secondary
  // durability net (Firestore's own persistent cache replays real offline
  // mutations), so discarding it once is cheap.
  private dbVersion = 2;
  private db: IDBDatabase | null = null;
  private readonly maxRetries = 3;
  /** Rows older than this can no longer be meaningfully replayed. */
  private readonly maxAgeMs = 7 * 24 * 60 * 60 * 1000;
  /** Hard ceiling on queue size, so a repeatedly failing create cannot grow it without bound. */
  private readonly maxQueueSize = 100;

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

      // A tab still holding the previous version blocks the upgrade. Let the
      // older connection go so the newer tab is not stuck waiting on it - this
      // app is multi-tab (persistent Firestore cache), so it does happen.
      request.onblocked = () => {
        console.warn('Offline DB upgrade blocked by another tab');
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.db.onversionchange = () => {
          this.db?.close();
          this.db = null;
        };
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const openRequest = event.target as IDBOpenDBRequest;
        const db = openRequest.result;
        // The version-change transaction, needed to reach a store that already exists.
        const upgradeTx = openRequest.transaction;

        let operations: IDBObjectStore;
        if (!db.objectStoreNames.contains('operations')) {
          operations = db.createObjectStore('operations', { keyPath: 'id' });
          operations.createIndex('timestamp', 'timestamp', { unique: false });
          operations.createIndex('collection', 'collection', { unique: false });
        } else {
          operations = upgradeTx!.objectStore('operations');
        }

        // Dedupe by index rather than scanning the whole store on every enqueue.
        if (!operations.indexNames.contains('dedupeKey')) {
          operations.createIndex('dedupeKey', 'dedupeKey', { unique: false });
        }

        // One-shot purge of the legacy backlog. Only for devices coming FROM v1:
        // a fresh install starts empty anyway, and later upgrades must not wipe
        // writes that are legitimately waiting.
        if (event.oldVersion >= 1 && event.oldVersion < 2) {
          operations.clear();
          console.log('Offline queue purged (schema upgrade)');
        }

        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' });
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

      const write = (existing?: QueuedOperation) => {
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

      // Index lookup instead of getAll(): scanning every row on every enqueue is
      // O(n) per write. Creates skip the lookup entirely - they never merge.
      if (!dedupeKey) {
        write();
        return;
      }

      const lookup = store.index('dedupeKey').get(dedupeKey);
      lookup.onsuccess = () => write(lookup.result as QueuedOperation | undefined);
      lookup.onerror = () => {
        console.error('Failed to read operation queue:', lookup.error);
        reject(lookup.error);
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

  /**
   * Evict rows too old to be worth replaying, then trim the newest survivors
   * down to the size cap. Local only, so it costs nothing to run before every
   * sync - and it is what stops a stale backlog from being ground through one
   * Firestore round trip at a time. Resolves with the number removed.
   */
  async pruneOperations(): Promise<number> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['operations'], 'readwrite');
      const store = transaction.objectStore('operations');
      const request = store.getAll();
      let removed = 0;

      request.onsuccess = () => {
        const rows = (request.result as QueuedOperation[]) || [];
        const cutoff = Date.now() - this.maxAgeMs;
        const fresh: QueuedOperation[] = [];
        const doomed: QueuedOperation[] = [];

        for (const op of rows) {
          if ((op.timestamp ?? 0) < cutoff) {
            doomed.push(op);
          } else {
            fresh.push(op);
          }
        }
        // Newest first, then everything past the cap goes.
        fresh.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
        doomed.push(...fresh.slice(this.maxQueueSize));

        for (const op of doomed) {
          store.delete(op.id);
        }
        removed = doomed.length;
      };

      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => {
        if (removed > 0) {
          console.log(`Offline queue pruned: ${removed} stale operations removed`);
        }
        resolve(removed);
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /** Drop the whole queue. Escape hatch for a backlog that can never succeed. */
  async clearOperations(): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['operations'], 'readwrite');
      const request = transaction.objectStore('operations').clear();

      request.onsuccess = () => {
        console.log('Offline queue cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /** Cheap size read for diagnostics - no rows are deserialized. */
  async countOperations(): Promise<number> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['operations'], 'readonly');
      const request = transaction.objectStore('operations').count();

      request.onsuccess = () => resolve(request.result ?? 0);
      request.onerror = () => reject(request.error);
    });
  }

  async removeOperation(operationId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['operations'], 'readwrite');
      const store = transaction.objectStore('operations');
      const request = store.delete(operationId);

      request.onsuccess = () => {
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
