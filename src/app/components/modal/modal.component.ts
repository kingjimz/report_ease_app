import { Component, OnDestroy, OnInit } from '@angular/core';
import { ModalService } from '../../_services/modal.service';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [],
  templateUrl: './modal.component.html',
  styleUrl: './modal.component.css',
})
export class ModalComponent implements OnInit, OnDestroy {
  constructor(private modalService: ModalService) {}

  ngOnInit(): void {
    this.modalService.openModal();
  }

  ngOnDestroy(): void {
    this.modalService.closeModal();
  }
}
