import { Injectable, signal } from '@angular/core';
import { Firestore, collection, doc, addDoc, getDocs, setDoc, CollectionReference, DocumentData, onSnapshot, query, updateDoc, deleteDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable, BehaviorSubject } from 'rxjs';


@Injectable({
  providedIn: 'root'
})

export class ApiService {
  private aggregatedDataSubject = new BehaviorSubject<any>({});
  aggregatedData$ = this.aggregatedDataSubject.asObservable();

  private bibleStudiesSubject = new BehaviorSubject<any[]>([]);
  bibleStudies$ = this.bibleStudiesSubject.asObservable();

  private reportsSubject = new BehaviorSubject<any[]>([]);
  reports$ = this.reportsSubject.asObservable();

  reportSignal = signal<any[]>([]);
  bibleStudySignal = signal<any[]>([]); 
  

  constructor(private auth: Auth, private fireStore: Firestore) { 
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


  private listenToReports() {
    const user = this.auth.currentUser;
    if (!user) return; // Ensure user is authenticated

    const reportsCollection = collection(this.fireStore, 'users', user.uid, 'reports');
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
  
      const reportsCollection = collection(this.fireStore, 'users', user.uid, 'reports');
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

    const reportsCollection = collection(this.fireStore, 'users', user.uid, 'reports');

    let querySnapshot = await getDocs(reportsCollection);
  
    
    // Only log when fresh data is fetched and cached
    if (!querySnapshot.metadata.fromCache) {
      console.log('Fresh data fetched and cached');
    }

    // 🔹 Extract reports and include document IDs
    const reportsData = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const reportsArray = reportsData.map((report: any) => ({
      ...report,
      report_date: report.report_date ? new Date(report.report_date.seconds * 1000) : null,
    }));

    this.updateReports(reportsArray);
    
    return reportsData;
  } catch (error) {
    console.error('Error getting reports:', error);
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
  
      const reportDoc = doc(this.fireStore, 'users', user.uid, 'reports', report.id);
  
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
  
      const bibleStudiesCollection = collection(this.fireStore, 'users', user.uid, 'bibleStudies');
      const docRef = await addDoc(bibleStudiesCollection, study);
  
      // 🔹 Manually update signal for instant UI feedback
      this.bibleStudySignal.set([...this.bibleStudySignal(), { id: docRef.id, ...study }]);
  
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
  
      const bibleStudiesCollection = collection(this.fireStore, 'users', user.uid, 'bibleStudies');
  
      // 🔹 Try fetching from cache first
      let querySnapshot;
      try {
        querySnapshot = await getDocs(bibleStudiesCollection);
        // If cache is empty, force fetch from server
        if (querySnapshot.empty) {
          console.log('Cache is empty, fetching from Firestore...');
          querySnapshot = await getDocs(bibleStudiesCollection);
        } else {
          console.log('Loaded from cache');
        }
        this.updateBibleStudies(querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })));
      } catch (cacheError) {
        console.warn('Cache unavailable, fetching from Firestore...', cacheError);
        querySnapshot = await getDocs(bibleStudiesCollection);
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
  
      const studyDoc = doc(this.fireStore, 'users', user.uid, 'bibleStudies', study.id);
      
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
  
      const studyDoc = doc(this.fireStore, 'users', user.uid, 'bibleStudies', study.id);

      await updateDoc(studyDoc, { ...study }); // Only update existing fields

      this.getBibleStudies();

    } catch (error) {
      console.error('Error updating study:', error);
      throw error;
    }

  }
}


