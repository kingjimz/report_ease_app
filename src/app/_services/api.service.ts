import { Injectable, signal } from '@angular/core';
import { Firestore, collection, doc, addDoc, getDocs, setDoc } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  reportSignal = signal<any[]>([]);

  constructor(private auth: Auth, private fireStore: Firestore) { }

  async createReport(report: any) {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        throw new Error('User not logged in');
      }
  
      // 🔹 Save inside `users/{userId}/reports`
      const reportsCollection = collection(this.fireStore, 'users', user.uid, 'reports');
  
      await addDoc(reportsCollection, report);
  
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
  
      // 🔹 Try fetching from cache first
      let querySnapshot;
      try {
        querySnapshot = await getDocs(reportsCollection);
        // If cache is empty, force fetch from server
        if (querySnapshot.empty) {
          console.log('Cache is empty, fetching from Firestore...');
          querySnapshot = await getDocs(reportsCollection);
        } else {
          console.log('Loaded from cache');
        }
      } catch (cacheError) {
        console.warn('Cache unavailable, fetching from Firestore...', cacheError);
        querySnapshot = await getDocs(reportsCollection);
      }
  
      // 🔹 Extract reports and include document IDs
      const reportsData = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
  
      this.reportSignal.set(reportsData);
      
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
  
      // 🔹 Update inside `users/{userId}/reports/{reportId}`
      const reportDoc = doc(this.fireStore, 'users', user.uid, 'reports', report.id);
  
      await setDoc(reportDoc, report, { merge: true });
  
      console.log('Report successfully updated under:', `users/${user.uid}/reports/${report.id}`);
    } catch (error) {
      console.error('Error updating report:', error);
      throw error;
    }
  }
}
