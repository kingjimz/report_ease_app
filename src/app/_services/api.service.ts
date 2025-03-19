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
  
      console.log('Report successfully saved under:', `users/${user.uid}/reports`);
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
  
      // 🔹 Fetch from `users/{userId}/reports`
      const reportsCollection = collection(this.fireStore, 'users', user.uid, 'reports');
  
      const querySnapshot = await getDocs(reportsCollection);
  
      // 🔹 Extract reports and include document IDs
      const reportsData = querySnapshot.docs.map((doc) => ({
        id: doc.id, // Include Firestore document ID
        ...doc.data(),
      }));

      this.reportSignal.set(reportsData);

      console.log('Fetched reports:', reportsData);
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
