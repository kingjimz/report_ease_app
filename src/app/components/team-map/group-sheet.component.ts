import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '@angular/fire/auth';
import { GroupsService, GroupMember, GroupMembership } from '../../_services/groups.service';
import { LocationSharingService } from '../../_services/location-sharing.service';
import { formatGroupCode } from '../../_utils/group-code';
import { ModalComponent } from '../modal/modal.component';

type SheetView = 'list' | 'create' | 'join' | 'manage';

/** Matches HIDE_MS in TeamMapComponent so the roster agrees with the pins. */
const SHARING_CUTOFF_MS = 15 * 60 * 1000;

/**
 * Group management for the team map: pick the active group, create one, join one
 * by code, and (as the owner) rename it or manage who is on it.
 *
 * Rendered by TeamMapComponent behind an *ngIf, following the same bottom-sheet
 * pattern as the rest of the app.
 */
@Component({
  selector: 'app-group-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  template: `
    <app-modal (dismissed)="closed.emit()">
      <div class="w-full">
        <!-- Header -->
        <div class="flex items-center gap-2 mb-3 pb-3 border-b border-gray-200">
          <button
            *ngIf="view !== 'list'"
            type="button"
            (click)="showList()"
            aria-label="Back"
            class="shrink-0 flex items-center justify-center w-8 h-8 -ml-1 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <i class="bi bi-chevron-left"></i>
          </button>
          <div
            *ngIf="view === 'list'"
            class="flex items-center justify-center w-9 h-9 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg shrink-0"
          >
            <i class="bi bi-people-fill text-white text-base"></i>
          </div>
          <h3 class="text-base font-semibold text-gray-800">{{ headings[view] }}</h3>
        </div>

        <!-- Status -->
        <p
          *ngIf="message"
          class="mb-3 px-3 py-2 text-xs rounded-lg"
          [ngClass]="isError ? 'text-amber-800 bg-amber-50' : 'text-emerald-800 bg-emerald-50'"
        >
          {{ message }}
        </p>

        <!-- ------------------------------ LIST ------------------------------ -->
        <ng-container *ngIf="view === 'list'">
          <p *ngIf="groupsSvc.groups().length === 0" class="mb-4 text-sm text-gray-600">
            You are not in any groups yet. Create one and share the code, or join a group with a
            code someone gave you.
          </p>

          <ul *ngIf="groupsSvc.groups().length > 0" class="mb-4 space-y-2">
            <li *ngFor="let group of groupsSvc.groups()">
              <!-- Tinted rows need an explicit dark variant. styles.css flips
                   .dark .text-gray-* to a near-white, but it only darkens
                   bg-white/bg-gray-*, so a bg-emerald-50 row kept its light
                   tint and the group name above the code went invisible. -->
              <div
                class="flex items-center gap-3 p-3 rounded-lg border transition-colors"
                [ngClass]="
                  isStale(group.id)
                    ? 'border-amber-200 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/30'
                    : group.id === groupsSvc.activeGroupId()
                      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/30'
                      : 'border-gray-200 bg-white'
                "
              >
                <button
                  type="button"
                  [disabled]="busy || isStale(group.id)"
                  (click)="activate(group)"
                  class="min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                >
                  <p class="text-sm font-medium text-gray-800 truncate">{{ group.name }}</p>
                  <p *ngIf="!isStale(group.id)" class="text-xs text-gray-500 font-mono">
                    {{ code(group.id) }}
                  </p>
                  <p *ngIf="isStale(group.id)" class="text-xs text-amber-700 dark:text-amber-300">
                    No longer available
                  </p>
                </button>

                <i
                  *ngIf="group.id === groupsSvc.activeGroupId() && !isStale(group.id)"
                  class="bi bi-check-circle-fill text-emerald-600 dark:text-emerald-400 shrink-0"
                  aria-label="Active group"
                ></i>

                <button
                  *ngIf="!isStale(group.id)"
                  type="button"
                  (click)="copyCode(group.id)"
                  [attr.aria-label]="'Copy code for ' + group.name"
                  class="shrink-0 flex items-center justify-center w-8 h-8 text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <i
                    class="bi"
                    [ngClass]="copiedId === group.id ? 'bi-check2' : 'bi-clipboard'"
                  ></i>
                </button>

                <button
                  *ngIf="isStale(group.id)"
                  type="button"
                  [disabled]="busy"
                  (click)="forget(group.id)"
                  class="shrink-0 px-2 py-1 text-xs font-medium text-amber-800 bg-amber-100 rounded-md hover:bg-amber-200 transition-colors"
                >
                  Remove
                </button>
              </div>
            </li>
          </ul>

          <div class="flex gap-2 mb-2">
            <button
              type="button"
              (click)="show('create')"
              class="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <i class="bi bi-plus-lg mr-1"></i>Create group
            </button>
            <button
              type="button"
              (click)="show('join')"
              class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <i class="bi bi-box-arrow-in-right mr-1"></i>Join by code
            </button>
          </div>

          <button
            *ngIf="groupsSvc.activeGroupId()"
            type="button"
            (click)="show('manage')"
            class="w-full px-4 py-2.5 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <i class="bi bi-gear mr-1"></i>Manage "{{ groupsSvc.activeGroup()?.name }}"
          </button>
        </ng-container>

        <!-- ----------------------------- CREATE ----------------------------- -->
        <form *ngIf="view === 'create'" (ngSubmit)="create()">
          <label for="groupName" class="block mb-1 text-xs font-medium text-gray-600">
            Group name
          </label>
          <input
            id="groupName"
            name="groupName"
            type="text"
            maxlength="40"
            required
            [(ngModel)]="newGroupName"
            placeholder="Saturday Morning"
            class="w-full px-3 py-2.5 mb-3 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <p class="mb-4 text-xs text-gray-500">
            You will get a code to share. Only people who have it can join and see each other on the
            map.
          </p>
          <button
            type="submit"
            [disabled]="busy || !newGroupName.trim()"
            class="w-full px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {{ busy ? 'Creating...' : 'Create group' }}
          </button>
        </form>

        <!-- ------------------------------ JOIN ------------------------------ -->
        <form *ngIf="view === 'join'" (ngSubmit)="join()">
          <label for="joinCode" class="block mb-1 text-xs font-medium text-gray-600">
            Share code
          </label>
          <input
            id="joinCode"
            name="joinCode"
            type="text"
            autocapitalize="characters"
            autocomplete="off"
            required
            [(ngModel)]="joinCode"
            placeholder="ABCD-EFGH"
            class="w-full px-3 py-2.5 mb-4 text-sm font-mono tracking-widest uppercase border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            [disabled]="busy || !joinCode.trim()"
            class="w-full px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {{ busy ? 'Joining...' : 'Join group' }}
          </button>
        </form>

        <!-- ----------------------------- MANAGE ----------------------------- -->
        <ng-container *ngIf="view === 'manage' && groupsSvc.activeGroupId()">
          <!-- Code -->
          <div class="mb-4 p-3 bg-gray-50 rounded-lg">
            <p class="mb-1 text-xs font-medium text-gray-600">Share code</p>
            <div class="flex items-center gap-2">
              <span class="flex-1 text-lg font-mono tracking-widest text-gray-800">
                {{ code(groupsSvc.activeGroupId()!) }}
              </span>
              <button
                type="button"
                (click)="copyCode(groupsSvc.activeGroupId()!)"
                class="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100 transition-colors"
              >
                {{ copiedId === groupsSvc.activeGroupId() ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </div>

          <!-- Rename (owner) -->
          <form *ngIf="groupsSvc.isActiveGroupOwner()" (ngSubmit)="rename()" class="mb-4">
            <label for="renameGroup" class="block mb-1 text-xs font-medium text-gray-600">
              Group name
            </label>
            <div class="flex gap-2">
              <input
                id="renameGroup"
                name="renameGroup"
                type="text"
                maxlength="40"
                [(ngModel)]="renameValue"
                class="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="submit"
                [disabled]="busy || !renameValue.trim()"
                class="shrink-0 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </div>
          </form>

          <!-- Roster -->
          <p class="mb-2 text-xs font-medium text-gray-600">
            Members ({{ groupsSvc.members().length }})
          </p>
          <ul class="mb-4 space-y-1">
            <li
              *ngFor="let member of groupsSvc.members()"
              class="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50"
            >
              <span
                class="flex items-center justify-center w-7 h-7 text-xs font-semibold text-white rounded-full shrink-0"
                [style.background]="'#6b7280'"
              >
                {{ initial(member) }}
              </span>
              <span class="min-w-0 flex-1 text-sm text-gray-800 truncate">
                {{ member.displayName }}
                <span *ngIf="member.uid === myUid" class="text-gray-400">(you)</span>
              </span>
              <span
                class="shrink-0 text-xs"
                [ngClass]="isSharing(member.uid) ? 'text-emerald-600' : 'text-gray-400'"
              >
                {{ isSharing(member.uid) ? 'Sharing' : 'Not sharing' }}
              </span>
              <button
                *ngIf="groupsSvc.isActiveGroupOwner() && member.uid !== myUid"
                type="button"
                [disabled]="busy"
                (click)="confirmRemove = member.uid"
                [attr.aria-label]="'Remove ' + member.displayName"
                class="shrink-0 flex items-center justify-center w-7 h-7 text-gray-400 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors"
              >
                <i class="bi bi-person-dash"></i>
              </button>
            </li>
          </ul>

          <!-- Remove confirm -->
          <div *ngIf="confirmRemove" class="mb-4 p-3 bg-red-50 rounded-lg">
            <p class="mb-2 text-xs text-red-800">
              Remove this person? They will stop appearing on the map and will not be able to rejoin
              with the code.
            </p>
            <div class="flex gap-2">
              <button
                type="button"
                (click)="confirmRemove = null"
                class="flex-1 px-3 py-2 text-xs font-medium text-gray-700 bg-white rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                [disabled]="busy"
                (click)="removeMember(confirmRemove)"
                class="flex-1 px-3 py-2 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>

          <!-- Leave / delete -->
          <div *ngIf="!confirmDanger" class="flex gap-2">
            <button
              *ngIf="!groupsSvc.isActiveGroupOwner()"
              type="button"
              (click)="confirmDanger = 'leave'"
              class="flex-1 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              Leave group
            </button>
            <button
              *ngIf="groupsSvc.isActiveGroupOwner()"
              type="button"
              (click)="confirmDanger = 'delete'"
              class="flex-1 px-4 py-2.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              Delete group
            </button>
          </div>

          <div *ngIf="confirmDanger" class="p-3 bg-red-50 rounded-lg">
            <p class="mb-2 text-xs text-red-800">
              {{
                confirmDanger === 'delete'
                  ? 'Delete this group for everyone? The code stops working and all pins are removed.'
                  : 'Leave this group? Your pin is removed. You can rejoin with the code.'
              }}
            </p>
            <div class="flex gap-2">
              <button
                type="button"
                (click)="confirmDanger = null"
                class="flex-1 px-3 py-2 text-xs font-medium text-gray-700 bg-white rounded-md"
              >
                Cancel
              </button>
              <button
                type="button"
                [disabled]="busy"
                (click)="confirmDanger === 'delete' ? deleteGroup() : leaveGroup()"
                class="flex-1 px-3 py-2 text-xs font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {{ busy ? 'Working...' : confirmDanger === 'delete' ? 'Delete' : 'Leave' }}
              </button>
            </div>
          </div>

          <!-- The owner is the only one who can clear a group out, so leaving
               would strand it: the code keeps working and nobody can manage it. -->
          <p *ngIf="groupsSvc.isActiveGroupOwner()" class="mt-2 text-xs text-gray-500">
            You created this group, so deleting is the way to leave it.
          </p>
        </ng-container>
      </div>
    </app-modal>
  `,
})
export class GroupSheetComponent {
  @Output() closed = new EventEmitter<void>();

  readonly headings: Record<SheetView, string> = {
    list: 'Groups',
    create: 'Create a group',
    join: 'Join a group',
    manage: 'Manage group',
  };

  view: SheetView = 'list';
  newGroupName = '';
  joinCode = '';
  renameValue = '';
  message: string | null = null;
  isError = false;
  busy = false;
  copiedId: string | null = null;
  confirmRemove: string | null = null;
  confirmDanger: 'leave' | 'delete' | null = null;

  constructor(
    public groupsSvc: GroupsService,
    private sharingSvc: LocationSharingService,
    private auth: Auth,
  ) {}

  get myUid(): string | undefined {
    return this.auth.currentUser?.uid ?? undefined;
  }

  code(groupId: string): string {
    return formatGroupCode(groupId);
  }

  isStale(groupId: string): boolean {
    return this.groupsSvc.staleGroupIds().includes(groupId);
  }

  /**
   * Someone counts as sharing when they have a position doc fresh enough that
   * the map would still be drawing their pin. Same cutoff the map uses, so the
   * roster and the pins never disagree.
   */
  isSharing(uid: string): boolean {
    const loc = this.sharingSvc.locations().find((l) => l.uid === uid);
    if (uid === this.myUid && this.sharingSvc.sharing()) return true;
    return !!loc && Date.now() - loc.updatedAt.getTime() <= SHARING_CUTOFF_MS;
  }

  initial(member: GroupMember): string {
    return (member.displayName || '?').charAt(0).toUpperCase();
  }

  show(view: SheetView): void {
    this.view = view;
    this.message = null;
    this.confirmRemove = null;
    this.confirmDanger = null;
    if (view === 'manage') this.renameValue = this.groupsSvc.activeGroup()?.name ?? '';
  }

  showList(): void {
    this.show('list');
  }

  async copyCode(groupId: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(formatGroupCode(groupId));
      this.copiedId = groupId;
      setTimeout(() => (this.copiedId = null), 2000);
    } catch {
      this.fail('Could not copy. The code is ' + formatGroupCode(groupId));
    }
  }

  async activate(group: GroupMembership): Promise<void> {
    if (group.id === this.groupsSvc.activeGroupId()) return;
    await this.run(() => this.groupsSvc.activateGroup(group.id), `Now showing "${group.name}".`);
  }

  async create(): Promise<void> {
    const name = this.newGroupName;
    await this.run(async () => {
      const code = await this.groupsSvc.createGroup(name);
      this.newGroupName = '';
      this.view = 'list';
      return `Group created. Share the code ${formatGroupCode(code)}.`;
    });
  }

  async join(): Promise<void> {
    const raw = this.joinCode;
    await this.run(async () => {
      await this.groupsSvc.joinGroup(raw);
      this.joinCode = '';
      this.view = 'list';
      return 'Joined. You can see each other on the map now.';
    });
  }

  async rename(): Promise<void> {
    const groupId = this.groupsSvc.activeGroupId();
    if (!groupId) return;
    await this.run(() => this.groupsSvc.renameGroup(groupId, this.renameValue), 'Group renamed.');
  }

  async removeMember(uid: string): Promise<void> {
    const groupId = this.groupsSvc.activeGroupId();
    if (!groupId) return;
    await this.run(() => this.groupsSvc.removeMember(groupId, uid), 'Removed from the group.');
    this.confirmRemove = null;
  }

  async leaveGroup(): Promise<void> {
    const groupId = this.groupsSvc.activeGroupId();
    if (!groupId) return;
    await this.run(async () => {
      await this.groupsSvc.leaveGroup(groupId);
      this.view = 'list';
      return 'You left the group.';
    });
    this.confirmDanger = null;
  }

  async deleteGroup(): Promise<void> {
    const groupId = this.groupsSvc.activeGroupId();
    if (!groupId) return;
    await this.run(async () => {
      await this.groupsSvc.deleteGroup(groupId);
      this.view = 'list';
      return 'Group deleted.';
    });
    this.confirmDanger = null;
  }

  async forget(groupId: string): Promise<void> {
    await this.run(() => this.groupsSvc.forgetGroup(groupId), 'Removed from your list.');
  }

  /**
   * Every mutation goes through here so the busy flag, the success line, and
   * the friendly error message are handled in exactly one place.
   */
  private async run(action: () => Promise<string | void>, successMessage?: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.message = null;
    try {
      const result = await action();
      this.isError = false;
      this.message = (typeof result === 'string' ? result : successMessage) ?? null;
    } catch (e) {
      this.fail(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      this.busy = false;
    }
  }

  private fail(message: string): void {
    this.isError = true;
    this.message = message;
  }
}
