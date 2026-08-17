import { Injectable } from '@angular/core';
import {
  Auth,
  User,
  signInWithPopup,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
} from '@angular/fire/auth';
import { GoogleAuthProvider } from 'firebase/auth';
import { BehaviorSubject } from 'rxjs';
import { Router } from '@angular/router';
import { NetworkService } from './network.service';
import { LocationSharingService } from './location-sharing.service';

/** How long logout waits for the location cleanup before signing out anyway. */
const LOGOUT_CLEANUP_TIMEOUT_MS = 2500;

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();
  isLoading = new BehaviorSubject<boolean>(true);

  constructor(
    private auth: Auth,
    private router: Router,
    private networkService: NetworkService,
    private locationSharing: LocationSharingService,
  ) {
    onAuthStateChanged(this.auth, (user) => {
      this.userSubject.next(user);
      if (user) {
        this.router.navigate(['/']);
      } else if (this.networkService.isOnline) {
        // Only redirect to login when online. Offline, a transient null (e.g.
        // the session token can't be refreshed without network) must not eject
        // a previously logged-in user from a working cached page.
        this.router.navigate(['/login']);
      }
    });
  }

  async signUp(email: string, password: string) {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      console.log('User signed up:', userCredential.user);
      this.userSubject.next(userCredential.user);
      this.router.navigate(['/']);
      return userCredential.user;
    } catch (error) {
      console.error('Error signing up:', error);
      throw error;
    }
  }

  async login(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      this.userSubject.next(userCredential.user);
      this.router.navigate(['/']);
      return userCredential.user;
    } catch (error) {
      console.error('Error logging in:', error);
      throw error;
    }
  }

  async logout() {
    try {
      // Remove the shared location pins while still signed in - the rules
      // reject the delete once the auth token is gone.
      //
      // Time-boxed on purpose. Under the persistent local cache a write promise
      // only settles on server ack, so offline this would never resolve and the
      // user could not sign out at all. Firestore keeps the mutation queue per
      // user, so an unsent delete replays on their next sign-in; failing that,
      // the pin ages off the map client-side and the TTL policy sweeps the doc.
      await Promise.race([
        this.locationSharing.prepareForLogout(),
        new Promise((resolve) => setTimeout(resolve, LOGOUT_CLEANUP_TIMEOUT_MS)),
      ]);
      await signOut(this.auth);
      this.userSubject.next(null);
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Error logging out:', error);
      throw error;
    }
  }

  async signinWithGoogle() {
    try {
      const result = await signInWithPopup(this.auth, new GoogleAuthProvider());
      this.userSubject.next(result.user);
      this.router.navigate(['/']);
      return result.user;
    } catch (error) {
      console.error('Error signing in with Google:', error);
      throw error;
    }
  }
}
