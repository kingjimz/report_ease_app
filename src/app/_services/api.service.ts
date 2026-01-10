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

  reportSignal = signal<any[]>([]);
  bibleStudySignal = signal<any[]>([]);
  goalsSignal = signal<any[]>([]);

  private unsubscribeReports?: () => void;
  private unsubscribeBibleStudies?: () => void;
  private unsubscribeGoals?: () => void;
  private isSyncing = false;

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

  private setupRealtimeListeners() {
    // Clean up existing listeners first
    this.cleanupListeners();
    
    const user = this.auth.currentUser;
    if (!user) return;

    this.listenToReports();
    this.listenToBibleStudies();
    this.listenToGoals();
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
    const reportsQuery = query(reportsCollection);

    // 🔥 Real-time listener for reports (works offline with Firestore cache)
    this.unsubscribeReports = onSnapshot(
      reportsQuery,
      { includeMetadataChanges: true },
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
      { includeMetadataChanges: true },
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
      { includeMetadataChanges: true },
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

  // 🔹 Simplified methods - no need for manual fetching since we have real-time listeners
  async createReport(report: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      // If offline, queue the operation
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('create', 'reports', report);
        // Update local state optimistically with properly formatted report
        const tempId = `temp_${Date.now()}`;
        const tempReport = {
          ...report,
          id: tempId,
          // Ensure report_date is properly formatted for calendar display
          report_date: report.report_date instanceof Date 
            ? { seconds: Math.floor(report.report_date.getTime() / 1000) }
            : report.report_date
        };
        const currentReports = this.reportSignal();
        this.reportSignal.set([...currentReports, tempReport]);
        this.reportsSubject.next([...currentReports, tempReport]);
        console.log('Report queued for sync when online and added to calendar');
        return;
      }

      const reportsCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'reports',
      );
      await addDoc(reportsCollection, report);
      // No need to call getReports() - real-time listener will update automatically
    } catch (error) {
      console.error('Error creating report:', error);
      // If error and offline, queue it
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('create', 'reports', report);
        console.log('Report queued for sync after error');
        return;
      }
      throw error;
    }
  }

  async updateReport(report: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!report?.id) throw new Error('Report ID is required');

      // If offline, queue the operation
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('update', 'reports', report);
        // Update local state optimistically
        const currentReports = this.reportSignal();
        const updatedReports = currentReports.map(r => r.id === report.id ? { ...r, ...report } : r);
        this.reportSignal.set(updatedReports);
        this.reportsSubject.next(updatedReports);
        console.log('Report update queued for sync when online');
        return;
      }

      const reportDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'reports',
        report.id,
      );

      await updateDoc(reportDoc, { ...report });
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error updating report:', error);
      // If error and offline, queue it
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('update', 'reports', report);
        console.log('Report update queued for sync after error');
        return;
      }
      throw error;
    }
  }

  async deleteReport(reportId: string) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!reportId) throw new Error('Report ID is required');

      // If offline, queue the operation
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('delete', 'reports', { id: reportId });
        // Update local state optimistically
        const currentReports = this.reportSignal();
        const filteredReports = currentReports.filter(r => r.id !== reportId);
        this.reportSignal.set(filteredReports);
        this.reportsSubject.next(filteredReports);
        console.log('Report deletion queued for sync when online');
        return;
      }

      const reportDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'reports',
        reportId,
      );

      await deleteDoc(reportDoc);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error deleting report:', error);
      // If error and offline, queue it
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('delete', 'reports', { id: reportId });
        console.log('Report deletion queued for sync after error');
        return;
      }
      throw error;
    }
  }

  async addStudy(study: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      // If offline, queue the operation
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('create', 'bibleStudies', study);
        // Update local state optimistically
        const currentStudies = this.bibleStudySignal();
        this.bibleStudySignal.set([...currentStudies, { ...study, id: `temp_${Date.now()}` }]);
        this.bibleStudiesSubject.next([...currentStudies, { ...study, id: `temp_${Date.now()}` }]);
        console.log('Study queued for sync when online');
        return;
      }

      const bibleStudiesCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'bibleStudies',
      );
      await addDoc(bibleStudiesCollection, study);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error adding study:', error);
      // If error and offline, queue it
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('create', 'bibleStudies', study);
        console.log('Study queued for sync after error');
        return;
      }
      throw error;
    }
  }

  async updateStudy(study: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!study?.id) throw new Error('Study ID is required');

      // If offline, queue the operation
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('update', 'bibleStudies', study);
        // Update local state optimistically
        const currentStudies = this.bibleStudySignal();
        const updatedStudies = currentStudies.map(s => s.id === study.id ? { ...s, ...study } : s);
        this.bibleStudySignal.set(updatedStudies);
        this.bibleStudiesSubject.next(updatedStudies);
        console.log('Study update queued for sync when online');
        return;
      }

      const studyDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'bibleStudies',
        study.id,
      );

      // Use the same pattern as updateGoal for consistency
      const { id, ...updateData } = study;
      await updateDoc(studyDoc, updateData);
      console.log('Study updated successfully:', study.id);
      console.log('Updated data:', updateData);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error updating study:', error);
      // If error and offline, queue it
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('update', 'bibleStudies', study);
        console.log('Study update queued for sync after error');
        return;
      }
      console.error('Study data:', study);
      console.error('Full error:', error);
      throw error;
    }
  }

  async deleteStudy(study: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!study?.id) throw new Error('Study ID is required');

      // If offline, queue the operation
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('delete', 'bibleStudies', { id: study.id });
        // Update local state optimistically
        const currentStudies = this.bibleStudySignal();
        const filteredStudies = currentStudies.filter(s => s.id !== study.id);
        this.bibleStudySignal.set(filteredStudies);
        this.bibleStudiesSubject.next(filteredStudies);
        console.log('Study deletion queued for sync when online');
        return;
      }

      const studyDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'bibleStudies',
        study.id,
      );

      await deleteDoc(studyDoc);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error deleting study:', error);
      // If error and offline, queue it
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('delete', 'bibleStudies', { id: study.id });
        console.log('Study deletion queued for sync after error');
        return;
      }
      throw error;
    }
  }

  async addGoal(goal: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      // If offline, queue the operation
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('create', 'goals', goal);
        // Update local state optimistically
        const currentGoals = this.goalsSignal();
        this.goalsSignal.set([...currentGoals, { ...goal, id: `temp_${Date.now()}` }]);
        this.goalsSubject.next([...currentGoals, { ...goal, id: `temp_${Date.now()}` }]);
        console.log('Goal queued for sync when online');
        return;
      }

      const goalsCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'goals',
      );
      await addDoc(goalsCollection, goal);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error adding goal:', error);
      // If error and offline, queue it
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('create', 'goals', goal);
        console.log('Goal queued for sync after error');
        return;
      }
      throw error;
    }
  }

  async updateGoal(goal: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!goal?.id) throw new Error('Goal ID is required');

      // If offline, queue the operation
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('update', 'goals', goal);
        // Update local state optimistically
        const currentGoals = this.goalsSignal();
        const updatedGoals = currentGoals.map(g => g.id === goal.id ? { ...g, ...goal } : g);
        this.goalsSignal.set(updatedGoals);
        this.goalsSubject.next(updatedGoals);
        console.log('Goal update queued for sync when online');
        return;
      }

      const goalDoc = doc(this.fireStore, 'users', user.uid, 'goals', goal.id);
      await updateDoc(goalDoc, { ...goal });
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error updating goal:', error);
      // If error and offline, queue it
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('update', 'goals', goal);
        console.log('Goal update queued for sync after error');
        return;
      }
      throw error;
    }
  }

  async deleteGoal(goal: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!goal?.id) throw new Error('Goal ID is required');

      // If offline, queue the operation
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('delete', 'goals', { id: goal.id });
        // Update local state optimistically
        const currentGoals = this.goalsSignal();
        const filteredGoals = currentGoals.filter(g => g.id !== goal.id);
        this.goalsSignal.set(filteredGoals);
        this.goalsSubject.next(filteredGoals);
        console.log('Goal deletion queued for sync when online');
        return;
      }

      const goalDoc = doc(this.fireStore, 'users', user.uid, 'goals', goal.id);
      await deleteDoc(goalDoc);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error deleting goal:', error);
      // If error and offline, queue it
      if (!this.networkService.isOnline) {
        await this.offlineStorage.queueOperation('delete', 'goals', { id: goal.id });
        console.log('Goal deletion queued for sync after error');
        return;
      }
      throw error;
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

      // 🔹 Try server first, fallback to cache
      try {
        const querySnapshot = await getDocsFromServer(reportsCollection);
        const reportsData = querySnapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Keep original Firestore timestamp format for charts
            report_date: data['report_date'] || null,
          };
        });
        return reportsData;
      } catch (serverError) {
        console.warn('Server fetch failed, trying cache:', serverError);
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

      // Try server first, fallback to cache
      try {
        const querySnapshot = await getDocsFromServer(bibleStudiesCollection);
        return querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (serverError) {
        console.warn('Server fetch failed, trying cache:', serverError);
        const querySnapshot = await getDocsFromCache(bibleStudiesCollection);
        return querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
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

      // Try server first, fallback to cache
      try {
        const querySnapshot = await getDocsFromServer(goalsCollection);
        return querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (serverError) {
        console.warn('Server fetch failed, trying cache:', serverError);
        const querySnapshot = await getDocsFromCache(goalsCollection);
        return querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
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
}