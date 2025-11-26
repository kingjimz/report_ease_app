import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PwaInstallPromptComponent } from './pwa-install-prompt.component';

describe('PwaInstallPromptComponent', () => {
  let component: PwaInstallPromptComponent;
  let fixture: ComponentFixture<PwaInstallPromptComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PwaInstallPromptComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PwaInstallPromptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

