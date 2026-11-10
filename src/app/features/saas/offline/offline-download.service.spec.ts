import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { OfflineDownloadService } from './offline-download.service';
import { OfflineDbService } from './offline-db.service';
import { TenantApiService } from '../services/tenant-api.service';

describe('OfflineDownloadService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('descarga 151 productos y continúa hasta la página corta final', async () => {
    const rows = Array.from({ length: 151 }, (_, id) => ({ id: id + 1, nombre: `P${id}`, precio: 1, categoria_id: 1, categoria_nombre: 'C' }));
    const calls: number[] = [];
    const api = {
      identidad: () => ({ empresa_id: 1, usuario_id: 2, sucursal_id: null, empresa_slug: 'x', contexto: 'cliente', rol: 'CLIENTE' }),
      consultar: (url: string) => {
        if (url.includes('/variantes')) return of([]);
        const offset = Number(new URLSearchParams(url.split('?')[1]).get('offset'));
        calls.push(offset); return of(rows.slice(offset, offset + 100));
      },
    };
    const db = { getSnapshot: async () => undefined, replaceSnapshot: async () => undefined };
    TestBed.configureTestingModule({ providers: [OfflineDownloadService, { provide: TenantApiService, useValue: api }, { provide: OfflineDbService, useValue: db }] });
    await TestBed.inject(OfflineDownloadService).descargar();
    expect(calls).toEqual([0, 100]);
  });

  it('no sustituye el snapshot cuando falla la segunda página', async () => {
    let writes = 0;
    const api = {
      identidad: () => ({ empresa_id: 1, usuario_id: 2, sucursal_id: null, empresa_slug: 'x', contexto: 'cliente', rol: 'CLIENTE' }),
      consultar: (url: string) => url.includes('offset=100') ? throwError(() => new Error('fallo página 2')) : of(Array.from({ length: 100 }, (_, id) => ({ id: id + 1, nombre: 'P', precio: 1, categoria_id: 1, categoria_nombre: 'C' }))),
    };
    const db = { getSnapshot: async () => ({ key: '1:2:todas', estado: 'DISPONIBLE_LOCAL' }), replaceSnapshot: async () => { writes++; } };
    TestBed.configureTestingModule({ providers: [OfflineDownloadService, { provide: TenantApiService, useValue: api }, { provide: OfflineDbService, useValue: db }] });
    let error: unknown;
    try { await TestBed.inject(OfflineDownloadService).descargar(); } catch (caught) { error = caught; }
    expect((error as Error).message).toBe('fallo página 2');
    expect(writes).toBe(0);
  });
});
