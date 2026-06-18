import { Injectable, signal } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  addDoc,
  getDocs,
  setDoc,
  CollectionReference,
  DocumentData,
  onSnapshot,
  query,
  updateDoc,
  deleteDoc,
  getDocsFromCache,
  getDocsFromServer,
  where,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable, BehaviorSubject } from 'rxjs';
import { NetworkService } from './network.service';
import { OfflineStorageService } from './offline-storage.service';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private aggregatedDataSubject = new BehaviorSubject<any>({});
  aggregatedData$ = this.aggregatedDataSubject.asObservable();

  private bibleStudiesSubject = new BehaviorSubject<any[]>([]);
  bibleStudies$ = this.bibleStudiesSubject.asObservable();

  private reportsSubject = new BehaviorSubject<any[]>([]);
  reports$ = this.reportsSubject.asObservable();

  private goalsSubject = new BehaviorSubject<any[]>([]);
  goals$ = this.goalsSubject.asObservable();

  private missionCompletionsSubject = new BehaviorSubject<any[]>([]);
  missionCompletions$ = this.missionCompletionsSubject.asObservable();

  reportSignal = signal<any[]>([]);
  bibleStudySignal = signal<any[]>([]);
  goalsSignal = signal<any[]>([]);
  missionCompletionsSignal = signal<any[]>([]);

  private unsubscribeReports?: () => void;
  private unsubscribeBibleStudies?: () => void;
  private unsubscribeGoals?: () => void;
  private unsubscribeMissionCompletions?: () => void;
  private isSyncing = false;
  // Tracks which user the live listeners are currently attached for, so a
  // repeat auth event for the same user doesn't tear them down and re-subscribe
  // (a re-subscribe can trigger a fresh full-collection sync = billed reads).
  private listenersUserId?: string;

  constructor(
    private auth: Auth,
    private fireStore: Firestore,
    private networkService: NetworkService,
    private offlineStorage: OfflineStorageService,
  ) {
    // Listen for auth state changes and setup listeners when user logs in
    this.auth.onAuthStateChanged((user) => {
      if (user) {
        this.setupRealtimeListeners();
        // Start syncing if online
        if (this.networkService.isOnline) {
          this.syncQueuedOperations();
        }
        // If offline, try to load from cache immediately
        if (!this.networkService.isOnline) {
          this.loadCachedDataOnInit();
        }
      } else {
        this.cleanupListeners();
      }
    });

    // Listen for network status changes and sync when back online
    this.networkService.onlineStatus$.subscribe((isOnline) => {
      if (isOnline && this.auth.currentUser) {
        this.syncQueuedOperations();
      }
    });
  }
  
  // Load cached data when user is offline on initialization
  private async loadCachedDataOnInit() {
    const user = this.auth.currentUser;
    if (!user) return;
    
    try {
      // Try to load from cache and update signals/subjects
      const cachedReports = await this.offlineStorage.getCachedData(`reports_${user.uid}`);
      if (cachedReports && cachedReports.length >= 0) {
        this.reportSignal.set(cachedReports);
        this.reportsSubject.next(cachedReports);
      }
      
      const cachedStudies = await this.offlineStorage.getCachedData(`bibleStudies_${user.uid}`);
      if (cachedStudies && cachedStudies.length >= 0) {
        this.bibleStudySignal.set(cachedStudies);
        this.bibleStudiesSubject.next(cachedStudies);
      }
      
      const cachedGoals = await this.offlineStorage.getCachedData(`goals_${user.uid}`);
      if (cachedGoals && cachedGoals.length >= 0) {
        this.goalsSignal.set(cachedGoals);
        this.goalsSubject.next(cachedGoals);
      }

      const cachedMissions = await this.offlineStorage.getCachedData(`missionCompletions_${user.uid}`);
      if (cachedMissions && cachedMissions.length >= 0) {
        this.missionCompletionsSignal.set(cachedMissions);
        this.missionCompletionsSubject.next(cachedMissions);
      }
    } catch (error) {
      console.error('Error loading cached data on init:', error);
    }
  }

  private setupRealtimeListeners() {
    const user = this.auth.currentUser;
    if (!user) return;

    // Already listening for this exact user: do nothing. Re-running would
    // unsubscribe and re-attach all four listeners, each re-syncing its whole
    // collection from the server and billing reads we don't need.
    if (this.listenersUserId === user.uid && this.unsubscribeReports) {
      return;
    }

    // Different user (or first attach): clear any stale listeners first.
    this.cleanupListeners();

    this.listenToReports();
    this.listenToBibleStudies();
    this.listenToGoals();
    this.listenToMissionCompletions();
    this.listenersUserId = user.uid;
  }

  // --- Rolling-window boundaries for the live (server-syncing) listeners ---
  // The live listeners only stream RECENT data so each server sync bills a small,
  // bounded number of reads. Full history (older calendar months, lifetime streak
  // stats) is served on demand from the local cache, which is free, via the
  // getAll* helpers below.

  // Reports window: from the start of the current service year (Sep–Aug) OR the
  // start of last month, whichever is earlier. This always covers the dashboard
  // (current + previous month, service-year totals), the chart, and the current
  // calendar month, with margin for month boundaries.
  private reportsWindowStart(): Date {
    const now = new Date();
    const serviceYearStartYear =
      now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const serviceYearStart = new Date(serviceYearStartYear, 8, 1); // Sep 1
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return serviceYearStart < prevMonthStart ? serviceYearStart : prevMonthStart;
  }

  // Mission completions window: last 120 days as a YYYY-MM-DD key. Mission docs
  // store a `date` string field, so we filter on that. Covers the current streak
  // and recent practice calendar; lifetime stats use the cache-first full fetch.
  private missionWindowStartKey(): string {
    const d = new Date();
    d.setDate(d.getDate() - 120);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Public boundary so consumers can merge the live (windowed) stream with the
  // full-history fetch without duplicating the window math.
  getMissionWindowStartKey(): string {
    return this.missionWindowStartKey();
  }

  private cleanupListeners() {
    if (this.unsubscribeReports) {
      this.unsubscribeReports();
      this.unsubscribeReports = undefined;
    }
    if (this.unsubscribeBibleStudies) {
      this.unsubscribeBibleStudies();
      this.unsubscribeBibleStudies = undefined;
    }
    if (this.unsubscribeGoals) {
      this.unsubscribeGoals();
      this.unsubscribeGoals = undefined;
    }
    if (this.unsubscribeMissionCompletions) {
      this.unsubscribeMissionCompletions();
      this.unsubscribeMissionCompletions = undefined;
    }
    this.listenersUserId = undefined;
  }

  private listenToReports() {
    const user = this.auth.currentUser;
    if (!user) return;

    const reportsCollection = collection(
      this.fireStore,
      'users',
      user.uid,
      'reports',
    );
    // Only stream reports inside the rolling window. Older reports are loaded on
    // demand from the cache (free) by getAllReports() when the calendar browses
    // back. This bounds the per-sync read count instead of pulling all history.
    // where() accepts a JS Date and converts it to a Timestamp for comparison.
    const reportsQuery = query(
      reportsCollection,
      where('report_date', '>=', this.reportsWindowStart()),
    );

    // 🔥 Real-time listener for reports (works offline with Firestore cache).
    // No includeMetadataChanges: we only care about real data changes, not
    // cache/server metadata transitions, which would fire the callback (and
    // rewrite the offline cache) far more often than needed.
    this.unsubscribeReports = onSnapshot(
      reportsQuery,
      (snapshot) => {
        const reports = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Keep original Firestore timestamp format for charts
            report_date: data['report_date'] || null,
          };
        });
        
        // Cache the data for offline access
        this.offlineStorage.cacheData(`reports_${user.uid}`, reports).catch(console.error);
        
        this.reportSignal.set(reports);
        this.reportsSubject.next(reports);
        console.log(`Reports updated: ${reports.length} items (fromCache: ${snapshot.metadata.fromCache})`);
      },
      (error) => {
        console.error('Error in reports listener:', error);
        // Try to load from cache if online operation fails
        this.loadReportsFromCache();
      }
    );
  }

  private listenToBibleStudies() {
    const user = this.auth.currentUser;
    if (!user) return;

    const bibleStudiesCollection = collection(
      this.fireStore,
      'users',
      user.uid,
      'bibleStudies',
    );
    const studiesQuery = query(bibleStudiesCollection);

    // 🔥 Real-time listener for bible studies (works offline with Firestore cache)
    this.unsubscribeBibleStudies = onSnapshot(
      studiesQuery,
      (snapshot) => {
        const studies = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        
        // Cache the data for offline access
        this.offlineStorage.cacheData(`bibleStudies_${user.uid}`, studies).catch(console.error);
        
        this.bibleStudySignal.set(studies);
        this.bibleStudiesSubject.next(studies);
        console.log(`Bible studies updated: ${studies.length} items (fromCache: ${snapshot.metadata.fromCache})`);
      },
      (error) => {
        console.error('Error in bible studies listener:', error);
        // Try to load from cache if online operation fails
        this.loadBibleStudiesFromCache();
      }
    );
  }

  private listenToGoals() {
    const user = this.auth.currentUser;
    if (!user) return;

    const goalsCollection = collection(
      this.fireStore,
      'users',
      user.uid,
      'goals',
    );
    const goalsQuery = query(goalsCollection);

    // 🔥 Real-time listener for goals (works offline with Firestore cache)
    this.unsubscribeGoals = onSnapshot(
      goalsQuery,
      (snapshot) => {
        const goals = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        
        // Cache the data for offline access
        this.offlineStorage.cacheData(`goals_${user.uid}`, goals).catch(console.error);
        
        this.goalsSignal.set(goals);
        this.goalsSubject.next(goals);
        console.log(`Goals updated: ${goals.length} items (fromCache: ${snapshot.metadata.fromCache})`);
      },
      (error) => {
        console.error('Error in goals listener:', error);
        // Try to load from cache if online operation fails
        this.loadGoalsFromCache();
      }
    );
  }

  private listenToMissionCompletions() {
    const user = this.auth.currentUser;
    if (!user) return;

    const missionsCollection = collection(
      this.fireStore,
      'users',
      user.uid,
      'missionCompletions',
    );
    // Only stream the recent window. Lifetime stats (longest streak, total
    // passed) and older practice-calendar months read the full set from cache
    // (free) via getAllMissionCompletions().
    const missionsQuery = query(
      missionsCollection,
      where('date', '>=', this.missionWindowStartKey()),
    );

    // 🔥 Real-time listener for mission completions (works offline with Firestore cache)
    this.unsubscribeMissionCompletions = onSnapshot(
      missionsQuery,
      (snapshot) => {
        const completions = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Cache the data for offline access
        this.offlineStorage.cacheData(`missionCompletions_${user.uid}`, completions).catch(console.error);

        this.missionCompletionsSignal.set(completions);
        this.missionCompletionsSubject.next(completions);
        console.log(`Mission completions updated: ${completions.length} items (fromCache: ${snapshot.metadata.fromCache})`);
      },
      (error) => {
        console.error('Error in mission completions listener:', error);
        this.loadMissionCompletionsFromCache();
      }
    );
  }

  // Clean up listeners when service is destroyed
  ngOnDestroy() {
    this.cleanupListeners();
  }

  updateAggregatedData(data: any) {
    this.aggregatedDataSubject.next(data);
  }

  updateBibleStudies(data: any[]) {
    this.bibleStudiesSubject.next(data);
  }

  updateReports(data: any[]) {
    this.reportsSubject.next(data);
  }

  notifyGoalChange(data: any[]) {
    this.goalsSubject.next(data);
  }

  // Durability net: when a write fails for ANY reason (offline, rule denial,
  // unreachable backend, transient error), queue it so it is retried on the next
  // sync rather than silently dropped. A write that throws never committed to the
  // server, so re-queuing cannot create duplicates. Queued writes flush on
  // reconnect, on app start, and immediately below when we're already online.
  private async queueForRetry(
    type: 'create' | 'update' | 'delete',
    collection: 'reports' | 'bibleStudies' | 'goals' | 'missionCompletions',
    data: any,
    context: string,
  ): Promise<void> {
    try {
      await this.offlineStorage.queueOperation(type, collection, data);
      console.warn(`${context}: write did not reach Firestore, queued for retry`);
      // If we're online, the reconnect event won't fire, so kick a sync now.
      if (this.networkService.isOnline) {
        this.syncQueuedOperations().catch((e) =>
          console.error('Retry sync failed:', e),
        );
      }
    } catch (queueError) {
      console.error(`${context}: failed to queue write for retry`, queueError);
    }
  }

  // Commit a Firestore write WITHOUT blocking the UI on server acknowledgment.
  // With persistentLocalCache enabled, the mutation is written to the local
  // cache the instant the op is issued, the onSnapshot listener reflects it
  // immediately, and Firestore replays it to the server on its own when
  // connectivity returns. The promise these ops return only resolves on SERVER
  // ack — awaiting it hangs forever while offline (and navigator.onLine can be
  // true on a throttled/flaky connection, e.g. DevTools "Offline"), leaving the
  // caller's "saving" spinner stuck. So we fire the op, let the caller proceed,
  // and only fall back to the retry queue if Firestore actually REJECTS it
  // (e.g. a rules denial) — a rejected write never committed, so re-queuing it
  // cannot create a duplicate.
  private commitWrite(
    op: Promise<unknown>,
    type: 'create' | 'update' | 'delete',
    collection: 'reports' | 'bibleStudies' | 'goals' | 'missionCompletions',
    data: any,
    context: string,
  ): void {
    op.catch((error) => {
      console.error(`${context}: Firestore write rejected`, error);
      this.queueForRetry(type, collection, data, context);
    });
  }

  // 🔹 Simplified methods - no need for manual fetching since we have real-time listeners
  async createReport(report: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      const reportsCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'reports',
      );
      // Pre-generate the doc id locally so the caller can optimistically render
      // the new report immediately (even offline) under the SAME id the live
      // listener will later emit — so the optimistic row and the synced row
      // reconcile instead of duplicating.
      const newReportRef = doc(reportsCollection);
      this.commitWrite(
        setDoc(newReportRef, report),
        'create',
        'reports',
        report,
        'Report create',
      );
      return newReportRef.id;
      // The real-time listener will reconcile automatically when the write syncs.
    } catch (error) {
      console.error('Error creating report:', error);
      await this.queueForRetry('create', 'reports', report, 'Report create');
      return undefined;
    }
  }

  async updateReport(report: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!report?.id) throw new Error('Report ID is required');

      const reportDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'reports',
        report.id,
      );

      this.commitWrite(
        updateDoc(reportDoc, { ...report }),
        'update',
        'reports',
        report,
        'Report update',
      );
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error updating report:', error);
      await this.queueForRetry('update', 'reports', report, 'Report update');
    }
  }

  async deleteReport(reportId: string) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!reportId) throw new Error('Report ID is required');

      const reportDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'reports',
        reportId,
      );

      this.commitWrite(
        deleteDoc(reportDoc),
        'delete',
        'reports',
        { id: reportId },
        'Report delete',
      );
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error deleting report:', error);
      await this.queueForRetry('delete', 'reports', { id: reportId }, 'Report delete');
    }
  }

  async addStudy(study: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      const bibleStudiesCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'bibleStudies',
      );
      this.commitWrite(
        addDoc(bibleStudiesCollection, study),
        'create',
        'bibleStudies',
        study,
        'Study create',
      );
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error adding study:', error);
      await this.queueForRetry('create', 'bibleStudies', study, 'Study create');
    }
  }

  async updateStudy(study: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!study?.id) throw new Error('Study ID is required');

      const studyDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'bibleStudies',
        study.id,
      );

      // Use the same pattern as updateGoal for consistency
      const { id, ...updateData } = study;
      this.commitWrite(
        updateDoc(studyDoc, updateData),
        'update',
        'bibleStudies',
        study,
        'Study update',
      );
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error updating study:', error);
      await this.queueForRetry('update', 'bibleStudies', study, 'Study update');
    }
  }

  async deleteStudy(study: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!study?.id) throw new Error('Study ID is required');

      const studyDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'bibleStudies',
        study.id,
      );

      this.commitWrite(
        deleteDoc(studyDoc),
        'delete',
        'bibleStudies',
        { id: study.id },
        'Study delete',
      );
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error deleting study:', error);
      await this.queueForRetry('delete', 'bibleStudies', { id: study.id }, 'Study delete');
    }
  }

  async addGoal(goal: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      const goalsCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'goals',
      );
      this.commitWrite(
        addDoc(goalsCollection, goal),
        'create',
        'goals',
        goal,
        'Goal create',
      );
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error adding goal:', error);
      await this.queueForRetry('create', 'goals', goal, 'Goal create');
    }
  }

  async updateGoal(goal: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!goal?.id) throw new Error('Goal ID is required');

      const goalDoc = doc(this.fireStore, 'users', user.uid, 'goals', goal.id);
      this.commitWrite(
        updateDoc(goalDoc, { ...goal }),
        'update',
        'goals',
        goal,
        'Goal update',
      );
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error updating goal:', error);
      await this.queueForRetry('update', 'goals', goal, 'Goal update');
    }
  }

  async deleteGoal(goal: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!goal?.id) throw new Error('Goal ID is required');

      const goalDoc = doc(this.fireStore, 'users', user.uid, 'goals', goal.id);
      this.commitWrite(
        deleteDoc(goalDoc),
        'delete',
        'goals',
        { id: goal.id },
        'Goal delete',
      );
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error deleting goal:', error);
      await this.queueForRetry('delete', 'goals', { id: goal.id }, 'Goal delete');
    }
  }

  // Mark a mission complete for a given day. dateId (YYYY-MM-DD) is the doc ID,
  // so writing twice on the same day is idempotent (no duplicate records).
  async markMissionComplete(dateId: string, data: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!dateId) throw new Error('Date ID is required');

      const record = { ...data, id: dateId };

      const missionDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'missionCompletions',
        dateId,
      );
      const { id, ...writeData } = record;
      this.commitWrite(
        setDoc(missionDoc, writeData),
        'create',
        'missionCompletions',
        record,
        'Mission complete',
      );
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error marking mission complete:', error);
      await this.queueForRetry('create', 'missionCompletions', { ...data, id: dateId }, 'Mission complete');
    }
  }

  async unmarkMissionComplete(dateId: string) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!dateId) throw new Error('Date ID is required');

      const missionDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'missionCompletions',
        dateId,
      );
      this.commitWrite(
        deleteDoc(missionDoc),
        'delete',
        'missionCompletions',
        { id: dateId },
        'Mission unmark',
      );
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error unmarking mission complete:', error);
      await this.queueForRetry('delete', 'missionCompletions', { id: dateId }, 'Mission unmark');
    }
  }

  // Full report history for views that browse beyond the live window (the
  // calendar). Cache-first: the local persistent cache is free to read, so this
  // only hits the server when older data was never synced (e.g. cold device,
  // first time browsing far back). Does NOT touch reportSignal/reports$, which
  // stay scoped to the live window.
  async getAllReports(): Promise<any[]> {
    const user = this.auth.currentUser;
    if (!user) return [];
    const reportsCollection = collection(
      this.fireStore,
      'users',
      user.uid,
      'reports',
    );
    const mapReports = (snap: any) =>
      snap.docs.map((doc: any) => {
        const data = doc.data();
        return { id: doc.id, ...data, report_date: data['report_date'] || null };
      });
    try {
      const cached = mapReports(await getDocsFromCache(reportsCollection));
      // If the cache is empty but we're online, fall back to the server once so
      // a cold device still gets full history.
      if (cached.length === 0 && this.networkService.isOnline) {
        return mapReports(await getDocsFromServer(reportsCollection));
      }
      return cached;
    } catch {
      if (this.networkService.isOnline) {
        try {
          return mapReports(await getDocsFromServer(reportsCollection));
        } catch (e) {
          console.error('getAllReports server fetch failed:', e);
        }
      }
      return [];
    }
  }

  // Full mission-completion history for lifetime stats and the practice calendar.
  // Cache-first, same rationale as getAllReports().
  async getAllMissionCompletions(): Promise<any[]> {
    const user = this.auth.currentUser;
    if (!user) return [];
    const missionsCollection = collection(
      this.fireStore,
      'users',
      user.uid,
      'missionCompletions',
    );
    const mapDocs = (snap: any) =>
      snap.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
    try {
      const cached = mapDocs(await getDocsFromCache(missionsCollection));
      if (cached.length === 0 && this.networkService.isOnline) {
        return mapDocs(await getDocsFromServer(missionsCollection));
      }
      return cached;
    } catch {
      if (this.networkService.isOnline) {
        try {
          return mapDocs(await getDocsFromServer(missionsCollection));
        } catch (e) {
          console.error('getAllMissionCompletions server fetch failed:', e);
        }
      }
      return [];
    }
  }

  // 🔹 Optional: Keep these methods for initial loading or manual refresh
  async getReports() {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      // If offline, try to get from cache first
      if (!this.networkService.isOnline) {
        const cachedData = await this.offlineStorage.getCachedData(`reports_${user.uid}`);
        if (cachedData) {
          console.log('Loading reports from cache (offline)');
          return cachedData;
        }
        // Try Firestore cache
        try {
          const reportsCollection = collection(
            this.fireStore,
            'users',
            user.uid,
            'reports',
          );
          const querySnapshot = await getDocsFromCache(reportsCollection);
          const reportsData = querySnapshot.docs.map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              ...data,
              report_date: data['report_date'] || null,
            };
          });
          return reportsData;
        } catch (cacheError) {
          console.error('Error getting reports from cache:', cacheError);
          return [];
        }
      }

      const reportsCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'reports',
      );

      // Prefer in-memory data kept current by the real-time listener (no reads).
      const currentReports = this.reportSignal();
      if (currentReports && currentReports.length > 0) {
        return currentReports;
      }

      // Otherwise read from the local Firestore cache (the active onSnapshot
      // listener keeps it fresh). A server round-trip on every navigation was
      // billing a full collection read each time and is unnecessary here.
      const mapReports = (querySnapshot: any) =>
        querySnapshot.docs.map((doc: any) => {
          const data = doc.data();
          return { id: doc.id, ...data, report_date: data['report_date'] || null };
        });
      try {
        return mapReports(await getDocsFromCache(reportsCollection));
      } catch (cacheError) {
        return mapReports(await getDocsFromServer(reportsCollection));
      }
    } catch (error) {
      console.error('Error getting reports:', error);
      // Try cache as last resort
      try {
        const user = this.auth.currentUser;
        if (user) {
          const cachedData = await this.offlineStorage.getCachedData(`reports_${user.uid}`);
          if (cachedData) return cachedData;
        }
      } catch {}
      throw error;
    }
  }

  async getBibleStudies() {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      // If offline, try to get from cache first
      if (!this.networkService.isOnline) {
        const cachedData = await this.offlineStorage.getCachedData(`bibleStudies_${user.uid}`);
        if (cachedData) {
          console.log('Loading bible studies from cache (offline)');
          return cachedData;
        }
        // Try Firestore cache
        try {
          const bibleStudiesCollection = collection(
            this.fireStore,
            'users',
            user.uid,
            'bibleStudies',
          );
          const querySnapshot = await getDocsFromCache(bibleStudiesCollection);
          return querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
        } catch (cacheError) {
          console.error('Error getting bible studies from cache:', cacheError);
          return [];
        }
      }

      const bibleStudiesCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'bibleStudies',
      );

      // Prefer in-memory data kept current by the real-time listener (no reads).
      const currentStudies = this.bibleStudySignal();
      if (currentStudies && currentStudies.length > 0) {
        return currentStudies;
      }

      // Otherwise read from the local cache; the listener keeps it fresh.
      const mapStudies = (querySnapshot: any) =>
        querySnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      try {
        return mapStudies(await getDocsFromCache(bibleStudiesCollection));
      } catch (cacheError) {
        return mapStudies(await getDocsFromServer(bibleStudiesCollection));
      }
    } catch (error) {
      console.error('Error getting studies:', error);
      // Try cache as last resort
      try {
        const user = this.auth.currentUser;
        if (user) {
          const cachedData = await this.offlineStorage.getCachedData(`bibleStudies_${user.uid}`);
          if (cachedData) return cachedData;
        }
      } catch {}
      throw error;
    }
  }

  async getGoals() {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      // If offline, try to get from cache first
      if (!this.networkService.isOnline) {
        const cachedData = await this.offlineStorage.getCachedData(`goals_${user.uid}`);
        if (cachedData) {
          console.log('Loading goals from cache (offline)');
          return cachedData;
        }
        // Try Firestore cache
        try {
          const goalsCollection = collection(
            this.fireStore,
            'users',
            user.uid,
            'goals',
          );
          const querySnapshot = await getDocsFromCache(goalsCollection);
          return querySnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
        } catch (cacheError) {
          console.error('Error getting goals from cache:', cacheError);
          return [];
        }
      }

      const goalsCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'goals',
      );

      // Prefer in-memory data kept current by the real-time listener (no reads).
      const currentGoals = this.goalsSignal();
      if (currentGoals && currentGoals.length > 0) {
        return currentGoals;
      }

      // Otherwise read from the local cache; the listener keeps it fresh.
      const mapGoals = (querySnapshot: any) =>
        querySnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      try {
        return mapGoals(await getDocsFromCache(goalsCollection));
      } catch (cacheError) {
        return mapGoals(await getDocsFromServer(goalsCollection));
      }
    } catch (error) {
      console.error('Error getting goals:', error);
      // Try cache as last resort
      try {
        const user = this.auth.currentUser;
        if (user) {
          const cachedData = await this.offlineStorage.getCachedData(`goals_${user.uid}`);
          if (cachedData) return cachedData;
        }
      } catch {}
      throw error;
    }
  }

  // Helper methods for loading from cache
  private async loadReportsFromCache() {
    try {
      const user = this.auth.currentUser;
      if (!user) return;
      const cachedData = await this.offlineStorage.getCachedData(`reports_${user.uid}`);
      if (cachedData) {
        this.reportSignal.set(cachedData);
        this.reportsSubject.next(cachedData);
      }
    } catch (error) {
      console.error('Error loading reports from cache:', error);
    }
  }

  private async loadBibleStudiesFromCache() {
    try {
      const user = this.auth.currentUser;
      if (!user) return;
      const cachedData = await this.offlineStorage.getCachedData(`bibleStudies_${user.uid}`);
      if (cachedData) {
        this.bibleStudySignal.set(cachedData);
        this.bibleStudiesSubject.next(cachedData);
      }
    } catch (error) {
      console.error('Error loading bible studies from cache:', error);
    }
  }

  private async loadGoalsFromCache() {
    try {
      const user = this.auth.currentUser;
      if (!user) return;
      const cachedData = await this.offlineStorage.getCachedData(`goals_${user.uid}`);
      if (cachedData) {
        this.goalsSignal.set(cachedData);
        this.goalsSubject.next(cachedData);
      }
    } catch (error) {
      console.error('Error loading goals from cache:', error);
    }
  }

  private async loadMissionCompletionsFromCache() {
    try {
      const user = this.auth.currentUser;
      if (!user) return;
      const cachedData = await this.offlineStorage.getCachedData(`missionCompletions_${user.uid}`);
      if (cachedData) {
        this.missionCompletionsSignal.set(cachedData);
        this.missionCompletionsSubject.next(cachedData);
      }
    } catch (error) {
      console.error('Error loading mission completions from cache:', error);
    }
  }

  // Sync queued operations when back online
  async syncQueuedOperations(): Promise<void> {
    if (this.isSyncing || !this.networkService.isOnline) {
      return;
    }

    const user = this.auth.currentUser;
    if (!user) {
      return;
    }

    this.isSyncing = true;
    console.log('Starting sync of queued operations...');

    try {
      const operations = await this.offlineStorage.getQueuedOperations();
      console.log(`Found ${operations.length} queued operations`);

      for (const operation of operations) {
        try {
          if (operation.retries >= this.offlineStorage.getMaxRetries()) {
            console.warn(`Operation ${operation.id} exceeded max retries, removing`);
            await this.offlineStorage.removeOperation(operation.id);
            continue;
          }

          switch (operation.collection) {
            case 'reports':
              await this.syncReportOperation(operation);
              break;
            case 'bibleStudies':
              await this.syncBibleStudyOperation(operation);
              break;
            case 'goals':
              await this.syncGoalOperation(operation);
              break;
            case 'missionCompletions':
              await this.syncMissionCompletionOperation(operation);
              break;
          }

          await this.offlineStorage.removeOperation(operation.id);
          console.log(`Successfully synced operation ${operation.id}`);
        } catch (error) {
          console.error(`Error syncing operation ${operation.id}:`, error);
          await this.offlineStorage.incrementRetry(operation.id);
        }
      }

      console.log('Sync completed');
    } catch (error) {
      console.error('Error during sync:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  private async syncReportOperation(operation: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not logged in');

    const reportsCollection = collection(
      this.fireStore,
      'users',
      user.uid,
      'reports',
    );

    switch (operation.type) {
      case 'create':
        await addDoc(reportsCollection, operation.data);
        break;
      case 'update':
        const reportDoc = doc(this.fireStore, 'users', user.uid, 'reports', operation.data.id);
        const { id, ...updateData } = operation.data;
        await updateDoc(reportDoc, updateData);
        break;
      case 'delete':
        const deleteDocRef = doc(this.fireStore, 'users', user.uid, 'reports', operation.data.id);
        await deleteDoc(deleteDocRef);
        break;
    }
  }

  private async syncBibleStudyOperation(operation: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not logged in');

    const bibleStudiesCollection = collection(
      this.fireStore,
      'users',
      user.uid,
      'bibleStudies',
    );

    switch (operation.type) {
      case 'create':
        await addDoc(bibleStudiesCollection, operation.data);
        break;
      case 'update':
        const studyDoc = doc(this.fireStore, 'users', user.uid, 'bibleStudies', operation.data.id);
        const { id, ...updateData } = operation.data;
        await updateDoc(studyDoc, updateData);
        break;
      case 'delete':
        const deleteDocRef = doc(this.fireStore, 'users', user.uid, 'bibleStudies', operation.data.id);
        await deleteDoc(deleteDocRef);
        break;
    }
  }

  private async syncGoalOperation(operation: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not logged in');

    const goalsCollection = collection(
      this.fireStore,
      'users',
      user.uid,
      'goals',
    );

    switch (operation.type) {
      case 'create':
        await addDoc(goalsCollection, operation.data);
        break;
      case 'update':
        const goalDoc = doc(this.fireStore, 'users', user.uid, 'goals', operation.data.id);
        const { id, ...updateData } = operation.data;
        await updateDoc(goalDoc, updateData);
        break;
      case 'delete':
        const deleteDocRef = doc(this.fireStore, 'users', user.uid, 'goals', operation.data.id);
        await deleteDoc(deleteDocRef);
        break;
    }
  }

  private async syncMissionCompletionOperation(operation: any): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not logged in');

    switch (operation.type) {
      case 'create':
      case 'update':
        // Use setDoc with the date-based ID to keep daily records idempotent
        const missionDoc = doc(this.fireStore, 'users', user.uid, 'missionCompletions', operation.data.id);
        const { id, ...writeData } = operation.data;
        await setDoc(missionDoc, writeData);
        break;
      case 'delete':
        const deleteDocRef = doc(this.fireStore, 'users', user.uid, 'missionCompletions', operation.data.id);
        await deleteDoc(deleteDocRef);
        break;
    }
  }
}