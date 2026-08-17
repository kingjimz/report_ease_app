import { Injectable, OnDestroy, effect, signal } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { GeoService, LatLng } from './geo.service';
import { SettingsService } from './settings.service';
import { NetworkService } from './network.service';
import { GroupsService } from './groups.service';

/** One user's shared live position, as rendered on the team map. */
export interface SharedLocation {
  uid: string;
  lat: number;
  lng: number;
  displayName: string;
  photoURL: string | null;
  updatedAt: Date;
}

// Write gate: a fix is written when this long has passed since the last
// write, or sooner when the user has clearly moved (fresher pins for people
// actively travelling, without doubling the write budget).
const WRITE_INTERVAL_MS = 45_000;
const MOVED_WRITE_INTERVAL_MS = 20_000;
const MOVED_THRESHOLD_KM = 0.025; // 25 m

/**
 * Server-side lifetime of a position doc, enforced by the Firestore TTL policy
 * on `expiresAt`. Far longer than the map's own staleness cutoff because this
 * is a garbage collector, not a display filter: it sweeps up docs orphaned by a
 * failed logout cleanup, an interrupted group deletion, or a removed member. The
 * generous margin also keeps a slow client clock from tripping the rules check
 * that `expiresAt` is in the future.
 */
const LOCATION_TTL_MS = 60 * 60 * 1000;

/**
 * Live location sharing within a group (opt-in "team map" feature).
 *
 * Sharing model: one doc per user at `groups/{groupId}/locations/{uid}`,
 * overwritten on every update. Doc existence means "sharing is on"; stopping
 * deletes the doc so a stopped sharer leaves no data behind. Only members of
 * the group can read it, enforced in firestore.rules; staleness is filtered by
 * the map.
 *
 * The group comes from GroupsService, and the dependency runs one way: this
 * service watches `activeGroupId` and reacts. GroupsService never calls back.
 *
 * Writes deliberately bypass the offline queue: a replayed stale position
 * with a fresh serverTimestamp would show someone where they are not, so we
 * simply skip writes while offline.
 */
@Injectable({ providedIn: 'root' })
export class LocationSharingService implements OnDestroy {
  /** Whether this device is currently sharing (mirrors the settings flag). */
  readonly sharing = signal(false);
  /** All shared locations in the active group; consumers apply staleness rules. */
  readonly locations = signal<SharedLocation[]>([]);
  /** Last geolocation/permission error, for inline display on the map. */
  readonly error = signal<string | null>(null);
  /**
   * My own live position from the raw GPS feed, updated on every fix (not
   * throttled like the Firestore writes). Lets the map show my pin instantly
   * and move it smoothly, while others still get the quota-friendly cadence.
   */
  readonly myPosition = signal<LatLng | null>(null);

  private watchId: number | null = null;
  private unsubscribeLocations?: () => void;
  private lastWriteAt = 0;
  private lastWrittenPos: LatLng | null = null;
  private pausedByVisibility = false;
  /** Set while the map is open, so a group switch re-attaches the listener. */
  private listening = false;
  /** The group we are actually writing to; null gates writes during a switch. */
  private sharingGroupId: string | null = null;
  /** In-flight position write, so a group switch can wait for it to land. */
  private pendingWrite: Promise<void> | null = null;
  /** Serializes group switches so two fast taps cannot interleave. */
  private switchChain: Promise<void> = Promise.resolve();
  private readonly onVisibilityChange = () => this.handleVisibilityChange();

  constructor(
    private auth: Auth,
    private fireStore: Firestore,
    private geo: GeoService,
    private settings: SettingsService,
    private network: NetworkService,
    private groups: GroupsService,
  ) {
    // Resume sharing on login if the user previously opted in; tear
    // everything down (and remove the pin) on logout.
    this.auth.onAuthStateChanged((user) => {
      if (user) {
        this.resumeSharingIfStillAMember();
      } else {
        this.teardown();
      }
    });

    // React to the active group changing, whoever changed it - this tab, another
    // tab, or a sign-in hydrating settings.
    effect(() => {
      const target = this.groups.activeGroupId();
      this.queueGroupSwitch(target);
    });

    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.teardown();
  }

  /** Opt in: start the GPS watch and persist the preference. */
  async startSharing(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;
    if (!this.groups.activeGroupId()) {
      this.error.set('Join or create a group first, then you can share your location.');
      return;
    }
    this.error.set(null);
    this.settings.setLiveShareEnabled(true);
    this.sharing.set(true);
    this.startWatch();
  }

  /** Opt out: stop the watch and delete the doc so no data remains. */
  async stopSharing(): Promise<void> {
    this.settings.setLiveShareEnabled(false);
    this.sharing.set(false);
    this.stopWatch();
    this.myPosition.set(null);
    await this.deleteOwnDoc(this.sharingGroupId);
  }

  /**
   * Called by AuthService right before signOut: stop tracking and remove our
   * pin from every group while we still have write permission (after sign-out
   * the rules would reject the delete). The opt-in preference is kept so
   * sharing auto-resumes on the next login.
   */
  async prepareForLogout(): Promise<void> {
    this.stopWatch();
    this.sharing.set(false);
    const user = this.auth.currentUser;
    if (!user) return;

    // Sweep every group we know about, not just the active one: switching groups
    // on another device could have left a pin behind here.
    const groupIds = new Set(this.groups.groups().map((r) => r.id));
    if (this.sharingGroupId) groupIds.add(this.sharingGroupId);
    if (groupIds.size === 0) return;

    // Safe as one batch: every delete resolves through the "my own doc" branch
    // of the rules, which short-circuits before any lookup, and deleting a doc
    // that is not there is a no-op.
    const batch = writeBatch(this.fireStore);
    for (const groupId of groupIds) {
      batch.delete(doc(this.fireStore, 'groups', groupId, 'locations', user.uid));
    }
    try {
      await batch.commit();
    } catch (e) {
      // The pin ages out of the map on its own via HIDE_MS, and the TTL policy
      // on expiresAt eventually removes the document.
      console.error('Failed to clear shared locations on logout:', e);
    }
  }

  /**
   * Resume a previous opt-in, but only if we are still on the group's roster -
   * otherwise a removed member would spend the whole session retrying denied
   * writes against a group they cannot see.
   */
  private async resumeSharingIfStillAMember(): Promise<void> {
    if (!this.settings.isLiveShareEnabled() || this.watchId !== null) return;
    const user = this.auth.currentUser;
    const groupId = this.settings.getActiveGroupId();
    if (!user || !groupId) return;
    try {
      const snap = await getDoc(doc(this.fireStore, 'groups', groupId, 'members', user.uid));
      if (!snap.exists()) return;
    } catch {
      // Offline or unreachable: fall through and let the write path decide.
    }
    if (this.watchId !== null) return;
    this.startWatch();
    this.sharing.set(true);
  }

  /** Remove this user's pin from one group. */
  private async deleteOwnDoc(groupId: string | null): Promise<void> {
    const user = this.auth.currentUser;
    if (!user || !groupId) return;
    try {
      await deleteDoc(doc(this.fireStore, 'groups', groupId, 'locations', user.uid));
    } catch (e) {
      console.error('Failed to delete shared location:', e);
    }
  }

  /** Map page attaches the collection listener only while it is open. */
  startListening(): void {
    this.listening = true;
    this.attachLocationsListener();
  }

  stopListening(): void {
    this.listening = false;
    this.detachLocationsListener();
  }

  private attachLocationsListener(): void {
    this.detachLocationsListener();
    const groupId = this.groups.activeGroupId();
    if (!groupId) return;

    const col = collection(this.fireStore, 'groups', groupId, 'locations');
    this.unsubscribeLocations = onSnapshot(
      col,
      (snapshot) => {
        const list: SharedLocation[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          const ts = data['updatedAt'] as Timestamp | null;
          if (typeof data['lat'] !== 'number' || typeof data['lng'] !== 'number' || !ts) return;
          list.push({
            uid: d.id,
            lat: data['lat'],
            lng: data['lng'],
            displayName: data['displayName'] || 'Someone',
            photoURL: data['photoURL'] ?? null,
            updatedAt: ts.toDate(),
          });
        });
        this.locations.set(list);
      },
      (err) => console.error('Locations listener error:', err),
    );
  }

  private detachLocationsListener(): void {
    if (this.unsubscribeLocations) {
      this.unsubscribeLocations();
      this.unsubscribeLocations = undefined;
    }
    this.locations.set([]);
  }

  /* ------------------------------ group switch ----------------------------- */

  private queueGroupSwitch(target: string | null): void {
    this.switchChain = this.switchChain
      .then(() => this.switchGroup(target))
      .catch((e) => console.error('Group switch failed:', e));
  }

  /**
   * Move broadcasting from one group to another. Order matters at every step:
   * a write already in flight has to land before the delete, or it recreates
   * the pin we just removed in the group we just left.
   */
  private async switchGroup(target: string | null): Promise<void> {
    const previous = this.sharingGroupId;
    if (previous === target) return;

    // Gate writes for the duration of the swap.
    this.sharingGroupId = null;
    await this.pendingWrite?.catch(() => undefined);

    if (previous) await this.deleteOwnDoc(previous);

    this.sharingGroupId = target;
    // Clear the throttle so the next fix is written immediately rather than up
    // to 45s later, which would leave us invisible in the group we just entered.
    this.lastWriteAt = 0;
    this.lastWrittenPos = null;

    if (this.listening) this.attachLocationsListener();

    // Resetting the throttle is not enough on its own: watchPosition only fires
    // when the OS has a new fix, so someone standing still would have no pin in
    // the new group until they moved. Push the position we already have.
    const pos = this.myPosition();
    if (target && pos && this.sharing()) this.writeLocation(pos, Date.now());
  }

  /* ------------------------------ internals ------------------------------ */

  private startWatch(): void {
    if (this.watchId !== null) return;
    if (!('geolocation' in navigator)) {
      this.failSharing('Location is not supported on this device.');
      return;
    }
    // Force an immediate first write so the pin appears right away.
    this.lastWriteAt = 0;
    this.lastWrittenPos = null;
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          this.failSharing(
            'Location permission denied. Allow location access in your browser settings to share.',
          );
        }
        // Transient errors (timeout, unavailable): keep the watch alive.
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
  }

  private stopWatch(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  private failSharing(message: string): void {
    this.stopWatch();
    this.settings.setLiveShareEnabled(false);
    this.sharing.set(false);
    this.myPosition.set(null);
    this.error.set(message);
  }

  private onPosition(pos: LatLng): void {
    this.myPosition.set(pos);
    const now = Date.now();
    const elapsed = now - this.lastWriteAt;
    const movedKm = this.lastWrittenPos ? this.geo.distanceKm(this.lastWrittenPos, pos) : Infinity;
    const due =
      elapsed >= WRITE_INTERVAL_MS ||
      (movedKm > MOVED_THRESHOLD_KM && elapsed >= MOVED_WRITE_INTERVAL_MS);
    if (!due) return;
    this.writeLocation(pos, now);
  }

  private writeLocation(pos: LatLng, now: number): void {
    const user = this.auth.currentUser;
    const groupId = this.sharingGroupId;
    if (!user || !groupId || !this.network.isOnline) return;
    this.lastWriteAt = now;
    this.lastWrittenPos = pos;
    const displayName = user.displayName || user.email?.split('@')[0] || 'Someone';
    this.pendingWrite = setDoc(doc(this.fireStore, 'groups', groupId, 'locations', user.uid), {
      lat: pos.lat,
      lng: pos.lng,
      updatedAt: serverTimestamp(),
      // A Date is stored as a Firestore timestamp, which is what the TTL policy
      // and the rules check both expect.
      expiresAt: new Date(now + LOCATION_TTL_MS),
      displayName: displayName.slice(0, 100),
      photoURL: user.photoURL ? user.photoURL.slice(0, 500) : null,
    }).catch((e) => {
      // A denial here means we were removed from the group; GroupsService picks
      // that up from its own listener and cleans up.
      console.error('Failed to write shared location:', e);
    });
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      if (this.watchId !== null) {
        this.pausedByVisibility = true;
        this.stopWatch();
      }
    } else if (this.pausedByVisibility && this.sharing()) {
      this.pausedByVisibility = false;
      this.startWatch();
    }
  }

  private teardown(): void {
    this.stopWatch();
    this.stopListening();
    this.sharing.set(false);
    this.myPosition.set(null);
    this.pausedByVisibility = false;
    this.sharingGroupId = null;
  }
}
