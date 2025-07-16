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
import { Goal } from '../_constants/interface';

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

  private goalsSubject = new BehaviorSubject<Goal[]>([]);
  goals$ = this.goalsSubject.asObservable();

  reportSignal = signal<any[]>([]);
  bibleStudySignal = signal<any[]>([]);
  goalsSignal = signal<Goal[]>([]);

  private unsubscribeReports?: () => void;
  private unsubscribeBibleStudies?: () => void;
  private unsubscribeGoals?: () => void;

  constructor(
    private auth: Auth,
    private fireStore: Firestore
  ) {
    // Listen for auth state changes and setup listeners when user logs in
    this.auth.onAuthStateChanged((user) => {
      if (user) {
        this.setupRealtimeListeners();
      } else {
        this.cleanupListeners();
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

    const reportsCollection = collection(this.fireStore, 'users', user.uid, 'reports');
    const reportsQuery = query(reportsCollection);

    // 🔥 Real-time listener for reports
    this.unsubscribeReports = onSnapshot(reportsQuery, (snapshot) => {
      const reports = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Keep original Firestore timestamp format for charts
          report_date: data['report_date'] || null,
        };
      });

      this.reportSignal.set(reports);
      this.reportsSubject.next(reports);
      console.log(`Reports updated: ${reports.length} items`);
    });
  }

  private listenToBibleStudies() {
    const user = this.auth.currentUser;
    if (!user) return;

    const bibleStudiesCollection = collection(this.fireStore, 'users', user.uid, 'bibleStudies');
    const studiesQuery = query(bibleStudiesCollection);

    // 🔥 Real-time listener for bible studies
    this.unsubscribeBibleStudies = onSnapshot(studiesQuery, (snapshot) => {
      const studies = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      this.bibleStudySignal.set(studies);
      this.bibleStudiesSubject.next(studies);
      console.log(`Bible studies updated: ${studies.length} items`);
    });
  }

  private listenToGoals() {
    const user = this.auth.currentUser;
    if (!user) return;

    const goalsCollection = collection(this.fireStore, 'users', user.uid, 'goals');
    const goalsQuery = query(goalsCollection);

    // 🔥 Real-time listener for goals
    this.unsubscribeGoals = onSnapshot(goalsQuery, (snapshot) => {
      const goals = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: String(doc.id),
          goal_title: data['goal_title'] ?? '',
          goal_description: data['goal_description'] ?? '',
          target_date: data['target_date'] ?? null,
          category: data['category'] ?? '',
          ...data,
        } as Goal;
      });

      this.goalsSignal.set(goals);
      this.goalsSubject.next(goals);
      console.log(`Goals updated: ${goals.length} items`);
    });
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

      const reportsCollection = collection(this.fireStore, 'users', user.uid, 'reports');
      await addDoc(reportsCollection, report);
      // No need to call getReports() - real-time listener will update automatically
    } catch (error) {
      console.error('Error creating report:', error);
      throw error;
    }
  }

  async updateReport(report: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!report?.id) throw new Error('Report ID is required');

      const reportDoc = doc(this.fireStore, 'users', user.uid, 'reports', report.id);

      await updateDoc(reportDoc, { ...report });
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error updating report:', error);
      throw error;
    }
  }

  async addStudy(study: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      const bibleStudiesCollection = collection(this.fireStore, 'users', user.uid, 'bibleStudies');
      await addDoc(bibleStudiesCollection, study);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error adding study:', error);
      throw error;
    }
  }

  async updateStudy(study: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!study?.id) throw new Error('Study ID is required');

      const studyDoc = doc(this.fireStore, 'users', user.uid, 'bibleStudies', study.id);

      // Use the same pattern as updateGoal for consistency
      const { id, ...updateData } = study;
      await updateDoc(studyDoc, updateData);
      console.log('Study updated successfully:', study.id);
      console.log('Updated data:', updateData);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error updating study:', error);
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

      const studyDoc = doc(this.fireStore, 'users', user.uid, 'bibleStudies', study.id);

      await deleteDoc(studyDoc);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error deleting study:', error);
      throw error;
    }
  }

  async addGoal(goal: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      const goalsCollection = collection(this.fireStore, 'users', user.uid, 'goals');
      await addDoc(goalsCollection, goal);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error adding goal:', error);
      throw error;
    }
  }

  async updateGoal(goal: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!goal?.id) throw new Error('Goal ID is required');

      const goalDoc = doc(this.fireStore, 'users', user.uid, 'goals', goal.id);
      await updateDoc(goalDoc, { ...goal });
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error updating goal:', error);
      throw error;
    }
  }

  async deleteGoal(goal: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');
      if (!goal?.id) throw new Error('Goal ID is required');

      const goalDoc = doc(this.fireStore, 'users', user.uid, 'goals', goal.id);
      await deleteDoc(goalDoc);
      // Real-time listener will update automatically
    } catch (error) {
      console.error('Error deleting goal:', error);
      throw error;
    }
  }

  // 🔹 Optional: Keep these methods for initial loading or manual refresh
  async getReports() {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      const reportsCollection = collection(this.fireStore, 'users', user.uid, 'reports');

      // 🔹 Always get fresh data from server for manual calls
      const querySnapshot = await getDocs(reportsCollection);

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
    } catch (error) {
      console.error('Error getting reports:', error);
      throw error;
    }
  }

  async getBibleStudies() {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      const bibleStudiesCollection = collection(this.fireStore, 'users', user.uid, 'bibleStudies');

      const querySnapshot = await getDocs(bibleStudiesCollection);

      const studiesData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return studiesData;
    } catch (error) {
      console.error('Error getting studies:', error);
      throw error;
    }
  }

  async getGoals() {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('User not logged in');

      const goalsCollection = collection(this.fireStore, 'users', user.uid, 'goals');

      const querySnapshot = await getDocs(goalsCollection);

      const goalsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      console.log('Goals fetched:', goalsData);

      return goalsData;
    } catch (error) {
      console.error('Error getting goals:', error);
      throw error;
    }
  }
}
