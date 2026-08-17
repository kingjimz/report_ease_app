import { Injectable, OnDestroy, computed, signal } from '@angular/core';
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  Timestamp,
} from '@angular/fire/firestore';
import { Auth, User } from '@angular/fire/auth';
import { SettingsService } from './settings.service';
import { NetworkService } from './network.service';
import { generateGroupCode, isValidGroupCode, normalizeGroupCode } from '../_utils/group-code';

/** A group as it appears in the user's own bookmark list. */
export interface GroupMembership {
  id: string;
  name: string;
  joinedAt: Date | null;
}

/** Someone on a group's roster, whether or not they are currently sharing. */
export interface GroupMember {
  uid: string;
  displayName: string;
  photoURL: string | null;
  joinedAt: Date | null;
}

/** Firestore caps a batch at 500 writes; group teardown chunks against this. */
const BATCH_LIMIT = 450;
const MAX_CODE_ATTEMPTS = 5;

/**
 * Groups: private location-sharing groups.
 *
 * Model: `groups/{CODE}` where the document ID *is* the 8-character share code,
 * with `members` and `locations` subcollections underneath. Membership is
 * enforced in firestore.rules, so a non-member is denied at the database rather
 * than filtered in the client.
 *
 * `users/{uid}/groups/{CODE}` mirrors the groups you have joined. It is a
 * bookmark list, not the source of truth - it makes "my groups" a single
 * owner-scoped query instead of a collection-group query needing its own index
 * and read rule. Because a group owner cannot write into another user's tree,
 * the mirror can outlive a group that was deleted or a membership that was
 * revoked; `activateGroup` detects both and cleans up on use.
 *
 * This service deliberately knows nothing about LocationSharingService. The
 * dependency runs one way (sharing depends on groups) so there is no cycle:
 * sharing watches `activeGroupId` and reacts.
 */
@Injectable({ providedIn: 'root' })
export class GroupsService implements OnDestroy {
  /** Groups this user has joined, newest first. */
  readonly groups = signal<GroupMembership[]>([]);
  /** Group this device shares into and displays. Mirrors the settings value. */
  readonly activeGroupId = signal<string | null>(null);
  /** Roster of the active group; only populated while the map is open. */
  readonly members = signal<GroupMember[]>([]);
  /** Mirror entries whose group or membership has gone away. */
  readonly staleGroupIds = signal<string[]>([]);
  /** Surfaced for problems discovered asynchronously, e.g. being removed. */
  readonly error = signal<string | null>(null);

  readonly activeGroup = computed(
    () => this.groups().find((r) => r.id === this.activeGroupId()) ?? null,
  );
  readonly isActiveGroupOwner = signal(false);

  private unsubscribeGroups?: () => void;
  private unsubscribeMembers?: () => void;
  /** Set once the map asks for a roster, so a group switch re-attaches it. */
  private membersWanted = false;

  constructor(
    private auth: Auth,
    private fireStore: Firestore,
    private settings: SettingsService,
    private network: NetworkService,
  ) {
    // Settings is the single source of truth for the active group, so this one
    // subscription covers a fresh sign-in, a cross-tab switch, and a local set
    // without any of them needing to know about each other.
    this.settings.settings$.subscribe((s) => {
      if (s.activeGroupId !== this.activeGroupId()) {
        this.activeGroupId.set(s.activeGroupId);
        this.refreshOwnership();
        if (this.membersWanted) this.attachMembersListener();
      }
    });

    this.auth.onAuthStateChanged((user) => {
      if (user) {
        this.attachGroupsListener(user);
        this.refreshOwnership();
      } else {
        this.teardown();
      }
    });
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  /* ------------------------------- listeners ------------------------------ */

  private attachGroupsListener(user: User): void {
    this.unsubscribeGroups?.();
    const col = collection(this.fireStore, 'users', user.uid, 'groups');
    this.unsubscribeGroups = onSnapshot(
      col,
      (snapshot) => {
        const list: GroupMembership[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            name: (data['name'] as string) || 'Group',
            joinedAt: (data['joinedAt'] as Timestamp | null)?.toDate() ?? null,
          });
        });
        list.sort((a, b) => (b.joinedAt?.getTime() ?? 0) - (a.joinedAt?.getTime() ?? 0));
        this.groups.set(list);
      },
      (err) => console.error('Groups listener error:', err),
    );
  }

  /** Called by the map so a roster is only fetched while it is on screen. */
  startMembersListening(): void {
    this.membersWanted = true;
    this.attachMembersListener();
  }

  stopMembersListening(): void {
    this.membersWanted = false;
    this.unsubscribeMembers?.();
    this.unsubscribeMembers = undefined;
    this.members.set([]);
  }

  private attachMembersListener(): void {
    this.unsubscribeMembers?.();
    this.unsubscribeMembers = undefined;
    this.members.set([]);
    const groupId = this.activeGroupId();
    if (!groupId) return;

    const col = collection(this.fireStore, 'groups', groupId, 'members');
    this.unsubscribeMembers = onSnapshot(
      col,
      (snapshot) => {
        const list: GroupMember[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            uid: d.id,
            displayName: (data['displayName'] as string) || 'Someone',
            photoURL: (data['photoURL'] as string | null) ?? null,
            joinedAt: (data['joinedAt'] as Timestamp | null)?.toDate() ?? null,
          });
        });
        list.sort((a, b) => a.displayName.localeCompare(b.displayName));
        this.members.set(list);
      },
      (err) => {
        // A read denial here means the membership doc is gone, i.e. the owner
        // removed us. There is no caller to catch this, so self-heal and say so.
        if ((err as { code?: string }).code === 'permission-denied') {
          this.handleRemovedFromGroup(groupId);
        } else {
          console.error('Members listener error:', err);
        }
      },
    );
  }

  /* -------------------------------- queries ------------------------------- */

  /** Whether the signed-in user owns the active group (drives the admin UI). */
  private async refreshOwnership(): Promise<void> {
    const groupId = this.activeGroupId();
    const user = this.auth.currentUser;
    if (!groupId || !user) {
      this.isActiveGroupOwner.set(false);
      return;
    }
    try {
      const snap = await getDoc(doc(this.fireStore, 'groups', groupId));
      this.isActiveGroupOwner.set(snap.exists() && snap.data()['ownerUid'] === user.uid);
    } catch {
      this.isActiveGroupOwner.set(false);
    }
  }

  /* -------------------------------- mutations ----------------------------- */

  /**
   * Create a group and join it. Returns the share code.
   *
   * Collisions are detected by reading the candidate code first rather than by
   * inferring them from a rejected write. A real clash is vanishingly unlikely
   * at 31^8, so treating every rejection as a clash would report "could not
   * generate a unique code" for what is almost always a permissions problem.
   * The rules are still the backstop if someone claims the code in between.
   */
  async createGroup(name: string): Promise<string> {
    const user = this.requireUser();
    this.requireOnline();
    const groupName = this.cleanGroupName(name);

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateGroupCode();
      if ((await getDoc(doc(this.fireStore, 'groups', code))).exists()) continue;

      const batch = writeBatch(this.fireStore);
      batch.set(doc(this.fireStore, 'groups', code), {
        name: groupName,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
      });
      batch.set(doc(this.fireStore, 'groups', code, 'members', user.uid), {
        ...this.profileOf(user),
        joinedAt: serverTimestamp(),
      });
      batch.set(doc(this.fireStore, 'users', user.uid, 'groups', code), {
        name: groupName,
        joinedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (e) {
        console.error('Failed to create group:', e);
        if ((e as { code?: string }).code === 'permission-denied') {
          throw new Error(
            'The database rejected the group. The app’s security rules may be out of date — they need to be deployed before groups will work.',
          );
        }
        throw new Error('Could not create the group. Please try again.');
      }
      // We just wrote it, so skip the verification reads activateGroup would do.
      this.setActiveGroupId(code);
      this.isActiveGroupOwner.set(true);
      return code;
    }
    throw new Error('Could not generate a unique code. Please try again.');
  }

  /** Join by share code and make it the active group. */
  async joinGroup(rawCode: string): Promise<string> {
    const user = this.requireUser();
    this.requireOnline();

    const code = normalizeGroupCode(rawCode);
    if (!isValidGroupCode(code)) {
      throw new Error('That code does not look right. Codes are 8 characters.');
    }

    const groupSnap = await getDoc(doc(this.fireStore, 'groups', code));
    if (!groupSnap.exists()) {
      throw new Error('Group not found. Check the code and try again.');
    }
    const groupName = (groupSnap.data()['name'] as string) || 'Group';

    // Re-writing an existing member doc would change joinedAt, which the update
    // rule forbids, so rejoining a group you are already in must skip that write.
    // A denial here means the doc is not readable, which for our own member doc
    // means it does not exist yet - treat that as "not a member" rather than
    // letting a raw Firestore error reach the user.
    const memberRef = doc(this.fireStore, 'groups', code, 'members', user.uid);
    const alreadyMember = await getDoc(memberRef)
      .then((snap) => snap.exists())
      .catch(() => false);

    const batch = writeBatch(this.fireStore);
    if (!alreadyMember) {
      batch.set(memberRef, { ...this.profileOf(user), joinedAt: serverTimestamp() });
    }
    batch.set(doc(this.fireStore, 'users', user.uid, 'groups', code), {
      name: groupName,
      joinedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (e) {
      if ((e as { code?: string }).code === 'permission-denied') {
        throw new Error('You cannot join this group.');
      }
      console.error('Failed to join group:', e);
      throw new Error('Could not join the group. Please try again.');
    }

    this.dropStale(code);
    this.setActiveGroupId(code);
    await this.refreshOwnership();
    return code;
  }

  /**
   * Switch to a group from the bookmark list, verifying it is still real and
   * still ours. Two reads, but activation is rare and this is where every
   * mirror drift case gets resolved.
   */
  async activateGroup(groupId: string): Promise<void> {
    const user = this.requireUser();
    if (groupId === this.activeGroupId()) return;
    this.requireOnline();

    const groupSnap = await getDoc(doc(this.fireStore, 'groups', groupId));
    if (!groupSnap.exists()) {
      await this.purgeGroup(groupId);
      throw new Error('That group no longer exists. It has been removed from your list.');
    }

    // Missing or unreadable both mean the same thing for our own member doc:
    // we are not on this roster any more.
    const stillMember = await getDoc(doc(this.fireStore, 'groups', groupId, 'members', user.uid))
      .then((snap) => snap.exists())
      .catch(() => false);
    if (!stillMember) {
      await this.purgeGroup(groupId);
      throw new Error('You are no longer in that group. It has been removed from your list.');
    }

    // Keep the bookmark's cached name honest after an owner rename.
    const groupName = (groupSnap.data()['name'] as string) || 'Group';
    const bookmark = this.groups().find((r) => r.id === groupId);
    if (bookmark && bookmark.name !== groupName) {
      await setDoc(
        doc(this.fireStore, 'users', user.uid, 'groups', groupId),
        { name: groupName },
        { merge: true },
      ).catch((e) => console.error('Failed to refresh group name:', e));
    }

    this.dropStale(groupId);
    this.setActiveGroupId(groupId);
    this.isActiveGroupOwner.set(groupSnap.data()['ownerUid'] === user.uid);
  }

  /** Leave a group, taking our pin with us. Owners should delete instead. */
  async leaveGroup(groupId: string): Promise<void> {
    const user = this.requireUser();
    this.requireOnline();

    const batch = writeBatch(this.fireStore);
    batch.delete(doc(this.fireStore, 'groups', groupId, 'locations', user.uid));
    batch.delete(doc(this.fireStore, 'groups', groupId, 'members', user.uid));
    batch.delete(doc(this.fireStore, 'users', user.uid, 'groups', groupId));

    try {
      await batch.commit();
    } catch (e) {
      console.error('Failed to leave group:', e);
      throw new Error('Could not leave the group. Please try again.');
    }
    this.dropStale(groupId);
    if (this.activeGroupId() === groupId) this.setActiveGroupId(null);
  }

  /**
   * Remove someone from a group. Owner only.
   *
   * All three writes go together on purpose: dropping the member doc alone
   * would leave their last position sitting in the group, and skipping the ban
   * doc would let them rejoin with the code they still have.
   */
  async removeMember(groupId: string, uid: string): Promise<void> {
    this.requireUser();
    this.requireOnline();

    const batch = writeBatch(this.fireStore);
    batch.delete(doc(this.fireStore, 'groups', groupId, 'locations', uid));
    batch.delete(doc(this.fireStore, 'groups', groupId, 'members', uid));
    batch.set(doc(this.fireStore, 'groups', groupId, 'bans', uid), {
      bannedAt: serverTimestamp(),
    });

    try {
      await batch.commit();
    } catch (e) {
      console.error('Failed to remove member:', e);
      throw new Error('Could not remove that person. Please try again.');
    }
  }

  /** Rename a group. Owner only. */
  async renameGroup(groupId: string, name: string): Promise<void> {
    const user = this.requireUser();
    this.requireOnline();
    const groupName = this.cleanGroupName(name);
    try {
      await updateDoc(doc(this.fireStore, 'groups', groupId), { name: groupName });
      await setDoc(
        doc(this.fireStore, 'users', user.uid, 'groups', groupId),
        { name: groupName },
        { merge: true },
      );
    } catch (e) {
      console.error('Failed to rename group:', e);
      throw new Error('Could not rename the group. Please try again.');
    }
  }

  /**
   * Delete a group. Owner only.
   *
   * Firestore does not cascade, so the children go first and the group document
   * last. The reverse order creates an unrepairable ghost: membership checks
   * read the member doc, not the group doc, so surviving members would keep
   * reading each other forever while the owner loses the ownership check that
   * would let them clean anything up.
   */
  async deleteGroup(groupId: string): Promise<void> {
    const user = this.requireUser();
    this.requireOnline();

    try {
      const [members, locations, bans] = await Promise.all([
        getDocs(collection(this.fireStore, 'groups', groupId, 'members')),
        getDocs(collection(this.fireStore, 'groups', groupId, 'locations')),
        getDocs(collection(this.fireStore, 'groups', groupId, 'bans')),
      ]);

      const refs = [...locations.docs, ...members.docs, ...bans.docs].map((d) => d.ref);
      for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(this.fireStore);
        for (const ref of refs.slice(i, i + BATCH_LIMIT)) batch.delete(ref);
        await batch.commit();
      }

      // Children are gone; the group doc is safe to drop.
      await deleteDoc(doc(this.fireStore, 'groups', groupId));
      await deleteDoc(doc(this.fireStore, 'users', user.uid, 'groups', groupId));
    } catch (e) {
      console.error('Failed to delete group:', e);
      // Partial deletes are idempotent, so retrying is always safe.
      throw new Error('Could not fully delete the group. Please try again.');
    }

    this.dropStale(groupId);
    if (this.activeGroupId() === groupId) this.setActiveGroupId(null);
  }

  /** Drop a bookmark whose group is gone. Used by the "remove" affordance. */
  async forgetGroup(groupId: string): Promise<void> {
    const user = this.requireUser();
    await deleteDoc(doc(this.fireStore, 'users', user.uid, 'groups', groupId)).catch((e) =>
      console.error('Failed to forget group:', e),
    );
    this.dropStale(groupId);
    if (this.activeGroupId() === groupId) this.setActiveGroupId(null);
  }

  /* -------------------------------- internals ----------------------------- */

  /**
   * Central write point for the active group. Only the settings value is
   * written; the subscription in the constructor applies the rest, so a local
   * switch, a cross-tab switch, and a fresh sign-in all take the same path.
   */
  private setActiveGroupId(groupId: string | null): void {
    if (this.activeGroupId() === groupId) return;
    this.settings.setActiveGroupId(groupId);
  }

  /**
   * Remove every trace of us from a group that is gone or that we were removed
   * from. Each delete resolves through the "is this my own doc" branch of the
   * rules, which short-circuits, so all three still work with the group deleted.
   */
  private async purgeGroup(groupId: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;
    const targets = [
      doc(this.fireStore, 'groups', groupId, 'locations', user.uid),
      doc(this.fireStore, 'groups', groupId, 'members', user.uid),
      doc(this.fireStore, 'users', user.uid, 'groups', groupId),
    ];
    await Promise.all(targets.map((ref) => deleteDoc(ref).catch(() => undefined)));
    this.dropStale(groupId);
    if (this.activeGroupId() === groupId) this.setActiveGroupId(null);
  }

  private handleRemovedFromGroup(groupId: string): void {
    this.staleGroupIds.update((ids) => (ids.includes(groupId) ? ids : [...ids, groupId]));
    this.error.set('You are no longer in this group.');
    this.purgeGroup(groupId);
  }

  private dropStale(groupId: string): void {
    this.staleGroupIds.update((ids) => ids.filter((id) => id !== groupId));
    this.error.set(null);
  }

  /** Name and avatar denormalized onto the member doc, within rule limits. */
  private profileOf(user: User): { displayName: string; photoURL: string | null } {
    const name = user.displayName || user.email?.split('@')[0] || 'Someone';
    return {
      displayName: name.slice(0, 100),
      photoURL: user.photoURL ? user.photoURL.slice(0, 500) : null,
    };
  }

  private cleanGroupName(name: string): string {
    const trimmed = (name || '').trim().slice(0, 40);
    if (!trimmed) throw new Error('Please give the group a name.');
    return trimmed;
  }

  private requireUser(): User {
    const user = this.auth.currentUser;
    if (!user) throw new Error('You need to be signed in.');
    return user;
  }

  /**
   * Group operations need a live connection. Offline, a cached read cannot tell
   * us whether a group exists, and under the persistent cache a write promise
   * simply never settles - so a collision and a dead link look identical.
   */
  private requireOnline(): void {
    if (!this.network.isOnline) {
      throw new Error('You need to be online to manage groups.');
    }
  }

  private teardown(): void {
    this.unsubscribeGroups?.();
    this.unsubscribeGroups = undefined;
    this.stopMembersListening();
    this.groups.set([]);
    // Do not carry a group across a user switch; the next sign-in re-hydrates
    // from that user's own settings.
    this.activeGroupId.set(null);
    this.staleGroupIds.set([]);
    this.isActiveGroupOwner.set(false);
    this.error.set(null);
  }
}
