import { Injectable } from '@angular/core';
import { 
  Auth, User, signInWithPopup, signOut, 
  signInWithEmailAndPassword, createUserWithEmailAndPassword, 
  onAuthStateChanged,
} from '@angular/fire/auth';
import { GoogleAuthProvider } from 'firebase/auth';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();
  isLoading = new BehaviorSubject<boolean>(true);  // Loading state

  constructor(private auth: Auth, private router: Router) {
  
    onAuthStateChanged(this.auth, (user) => {
      this.userSubject.next(user);
      if (user) {
        this.router.navigate(['/']);
      } else {
        this.router.navigate(['/login']);
      }
    });
  }
  

  async signUp(email: string, password: string) {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      console.log('User signed up:', userCredential.user);
      this.userSubject.next(userCredential.user);
      this.router.navigate(['/dashboard']); // Redirect after sign-up
      return userCredential.user;
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  }

  async login(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      console.log('User logged in:', userCredential.user);
      this.userSubject.next(userCredential.user);
      this.router.navigate(['/dashboard']); // Redirect after login
      return userCredential.user;
    } catch (error) {
      console.error('Error logging in:', error);
      throw error;
    }
  }

  async logout() {
    try {
      await signOut(this.auth);
      this.userSubject.next(null);
      this.router.navigate(['/login']); // Redirect after logout
    } catch (error) {
      console.error('Error logging out:', error);
      throw error;
    }
  }

  async signinWithGoogle() {
    try {
      const result = await signInWithPopup(this.auth, new GoogleAuthProvider());
      this.userSubject.next(result.user);
      this.router.navigate(['/dashboard']); // Redirect after Google login
      return result.user;
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  }
}
