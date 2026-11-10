import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OfflineOperationsPage } from './offline-operations.page';
import { OfflineOperationsLocalStore } from '../offline/offline-operations-local.store';
import { TenantApiService } from '../services/tenant-api.service';
import { vi } from 'vitest';

describe('OfflineOperationsPage', () => {
  let fixture: ComponentFixture<OfflineOperationsPage>;
  const store = { read: vi.fn(async () => []) };
  const api = { identidad: signal({ empresa_id: 4, usuario_id: 8, sucursal_id: null, empresa_nombre: 'A', empresa_slug: 'a' }) };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OfflineOperationsPage],
      providers: [provideRouter([]), { provide: OfflineOperationsLocalStore, useValue: store }, { provide: TenantApiService, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(OfflineOperationsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('muestra el estado vacío sin crear operaciones', () => {
    expect(fixture.nativeElement.textContent).toContain('Sin operaciones locales');
    expect(store.read).toHaveBeenCalledTimes(1);
  });
});
