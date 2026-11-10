import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  OFFLINE_IDENTITY_STORAGE_KEY,
  TenantApiService,
  TenantIdentidad,
} from '../services/tenant-api.service';
import { OfflineIdentityService } from './offline-identity.service';

const identity: TenantIdentidad = {
  usuario_id: 12,
  empresa_id: 3,
  empresa_slug: 'moda-sur',
  empresa_nombre: 'Moda Sur',
  rol: 'CAJERO',
  contexto: 'personal',
  plan_codigo: 'PRO',
  permite_reportes_ia: true,
  sucursal_id: 2,
};

describe('OfflineIdentityService recarga local', () => {
  beforeEach(() => sessionStorage.clear());

  it('recupera en la misma sesión la última identidad verificada', () => {
    let live: TenantIdentidad | null = identity;
    TestBed.configureTestingModule({
      providers: [
        OfflineIdentityService,
        { provide: TenantApiService, useValue: { identidad: () => live } },
      ],
    });
    const service = TestBed.inject(OfflineIdentityService);
    expect(service.identityForLocal()?.usuario_id).toBe(12);
    live = null;
    expect(service.identityForLocal()?.empresa_id).toBe(3);
  });

  it('rechaza una identidad histórica expirada', () => {
    sessionStorage.setItem(
      OFFLINE_IDENTITY_STORAGE_KEY,
      JSON.stringify({
        identity,
        verified_at: '2020-01-01T00:00:00Z',
        expires_at: '2020-01-02T00:00:00Z',
      }),
    );
    TestBed.configureTestingModule({
      providers: [
        OfflineIdentityService,
        { provide: TenantApiService, useValue: { identidad: () => null } },
      ],
    });
    expect(TestBed.inject(OfflineIdentityService).identityForLocal()).toBeNull();
    expect(sessionStorage.getItem(OFFLINE_IDENTITY_STORAGE_KEY)).toBeNull();
  });
});
