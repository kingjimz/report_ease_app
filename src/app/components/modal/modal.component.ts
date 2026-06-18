import {
  Component,
  EventEmitter,
  HostBinding,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { ModalService } from '../../_services/modal.service';
import { bottomSheet } from '../../_animations/bottom-sheet.animation';
import { DragToCloseDirective } from '../../_directives/drag-to-close.directive';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [DragToCloseDirective],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.css',
  animations: [bottomSheet],
})
export class ModalComponent implements OnInit, OnDestroy {
  // Plays the slide-down on close: when a parent removes <app-modal> via *ngIf,
  // the host's :leave transition runs before the element is detached.
  @HostBinding('@bottomSheet') sheet = true;

  // When true (default), the sheet can be dragged down to dismiss; the parent
  // must handle (dismissed) by flipping its *ngIf. Set false for modals that
  // require an explicit choice (e.g. onboarding).
  @Input() dismissible = true;
  @Output() dismissed = new EventEmitter<void>();

  constructor(private modalService: ModalService) {}

  ngOnInit(): void {
    this.modalService.openModal();
  }

  ngOnDestroy(): void {
    this.modalService.closeModal();
  }
}
