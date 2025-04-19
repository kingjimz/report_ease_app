import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService } from '../../_services/api.service';

@Component({
  selector: 'app-bible-studies',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bible-studies.component.html',
  styleUrl: './bible-studies.component.css'
})
export class BibleStudiesComponent {
  @Input() bibleStudies: any[] = []; 
  @Output() edit = new EventEmitter<any>();

  constructor(private api: ApiService) { }

  ngOnInit() {} 

  editStudy(study: any) {
    this.edit.emit(study);
  }

}
