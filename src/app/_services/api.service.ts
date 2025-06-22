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

  constructor(
    private auth: Auth,
    private fireStore: Firestore,
  ) {
    this.listenToReports();
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

  private listenToReports() {
    const user = this.auth.currentUser;
    if (!user) return; // Ensure user is authenticated

    const reportsCollection = collection(
      this.fireStore,
      'users',
      user.uid,
      'reports',
    );
    const reportsQuery = query(reportsCollection);

    // 🔥 Firestore real-time listener
    onSnapshot(reportsQuery, (snapshot) => {
      const reports = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      this.reportSignal.set(reports); // Update the signal dynamically
    });
  }

  async createReport(report: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User not logged in');
      }

      const reportsCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'reports',
      );
      await addDoc(reportsCollection, report);

      this.getReports(); // Refresh the reports list after adding a new report
    } catch (error) {
      console.error('Error creating report:', error);
      throw error;
    }
  }

  async getReports() {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User not logged in');
      }

      const reportsCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'reports',
      );

      let querySnapshot;
      
      // 🔹 Try cache first, then server if cache fails
      try {
        querySnapshot = await getDocsFromCache(reportsCollection);
        console.log('Reports loaded from cache');
      } catch (cacheError) {
        console.log('Cache unavailable, fetching from server...');
        querySnapshot = await getDocsFromServer(reportsCollection);
        console.log('Fresh reports data fetched and cached');
      }

      // 🔹 Extract reports and include document IDs
      const reportsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      const reportsArray = reportsData.map((report: any) => ({
        ...report,
        report_date: report.report_date
          ? new Date(report.report_date.seconds * 1000)
          : null,
      }));

      this.updateReports(reportsArray);

      return reportsData;
    } catch (error) {
      console.error('Error getting reports:', error);
      throw error;
    }
  }

  async getGoals() {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User not logged in');
      }

      const goalsCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'goals',
      );

      let querySnapshot;
      
      // 🔹 Try cache first, then server if cache fails
      try {
        querySnapshot = await getDocsFromCache(goalsCollection);
        console.log('Goals loaded from cache');
      } catch (cacheError) {
        console.log('Cache unavailable, fetching from server...');
        querySnapshot = await getDocsFromServer(goalsCollection);
        console.log('Fresh goals data fetched and cached');
      }

      const goalsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      return goalsData;
    } catch (error) {
      console.error('Error getting goals:', error);
      throw error;
    }
  }

  async updateReport(report: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User not logged in');
      }

      if (!report?.id) {
        throw new Error('Report ID is required');
      }

      const reportDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'reports',
        report.id,
      );

      await updateDoc(reportDoc, { ...report }); // Only update existing fields

      this.getReports(); // Refresh the reports list after updating
    } catch (error) {
      console.error('Error updating report:', error);
      throw error;
    }
  }

  async addStudy(study: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User not logged in');
      }

      const bibleStudiesCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'bibleStudies',
      );
      const docRef = await addDoc(bibleStudiesCollection, study);

      // 🔹 Manually update signal for instant UI feedback
      this.bibleStudySignal.set([
        ...this.bibleStudySignal(),
        { id: docRef.id, ...study },
      ]);
    } catch (error) {
      console.error('Error adding study:', error);
      throw error;
    }
  }

  async getBibleStudies() {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User not logged in');
      }

      const bibleStudiesCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'bibleStudies',
      );

      let querySnapshot;
      
      // 🔹 Try cache first, then server if cache fails
      try {
        querySnapshot = await getDocsFromCache(bibleStudiesCollection);
        console.log('Bible studies loaded from cache');
      } catch (cacheError) {
        console.log('Cache unavailable, fetching from server...');
        querySnapshot = await getDocsFromServer(bibleStudiesCollection);
        console.log('Fresh bible studies data fetched and cached');
      }

      // 🔹 Extract studies and include document IDs
      const studiesData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      this.updateBibleStudies(studiesData);

      return studiesData;
    } catch (error) {
      console.error('Error getting studies:', error);
      throw error;
    }
  }

  async deleteStudy(study: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User not logged in');
      }

      if (!study?.id) {
        throw new Error('Study ID is required');
      }

      const studyDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'bibleStudies',
        study.id,
      );

      await deleteDoc(studyDoc); // 🔥 Actually delete the document

      console.log('Study deleted successfully');
      await this.getBibleStudies(); // Refresh the list after deletion
    } catch (error) {
      console.error('Error deleting study:', error);
      throw error;
    }
  }

  async updateStudy(study: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User not logged in');
      }

      if (!study?.id) {
        throw new Error('Study ID is required');
      }

      const studyDoc = doc(
        this.fireStore,
        'users',
        user.uid,
        'bibleStudies',
        study.id,
      );

      await updateDoc(studyDoc, { ...study }); // Only update existing fields

      this.getBibleStudies();
    } catch (error) {
      console.error('Error updating study:', error);
      throw error;
    }
  }

  async addGoal(goal: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User not logged in');
      }

      const goalsCollection = collection(
        this.fireStore,
        'users',
        user.uid,
        'goals',
      );
      const docRef = await addDoc(goalsCollection, goal);
    } catch (error) {
      console.error('Error adding goal:', error);
      throw error;
    }
  }

  async deleteGoal(goal: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User not logged in');
      }

      if (!goal?.id) {
        throw new Error('Goal ID is required');
      }

      const goalDoc = doc(this.fireStore, 'users', user.uid, 'goals', goal.id);

      await deleteDoc(goalDoc); // 🔥 Actually delete the document

      console.log('Goal deleted successfully');
    } catch (error) {
      console.error('Error deleting goal:', error);
      throw error;
    }
  }

  async updateGoal(goal: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User not logged in');
      }

      if (!goal?.id) {
        throw new Error('Goal ID is required');
      }

      const goalDoc = doc(this.fireStore, 'users', user.uid, 'goals', goal.id);

      await updateDoc(goalDoc, { ...goal }); // Only update existing fields

      this.getGoals(); // Refresh the goals list after updating
    } catch (error) {
      console.error('Error updating goal:', error);
      throw error;
    }
  }
}