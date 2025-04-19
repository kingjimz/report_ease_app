import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BibleStudiesComponent } from './bible-studies.component';

describe('BibleStudiesComponent', () => {
  let component: BibleStudiesComponent;
  let fixture: ComponentFixture<BibleStudiesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BibleStudiesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BibleStudiesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
