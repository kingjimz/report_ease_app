import { TestBed } from '@angular/core/testing';
import { Auth } from '@angular/fire/auth';

import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(() => {
    // Settings are namespaced by uid, so the service needs Auth. A stub is
    // enough: the only thing it uses is the auth-state callback.
    const authStub = { onAuthStateChanged: () => () => undefined } as unknown as Auth;
    TestBed.configureTestingModule({
      providers: [{ provide: Auth, useValue: authStub }],
    });
    service = TestBed.inject(SettingsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
