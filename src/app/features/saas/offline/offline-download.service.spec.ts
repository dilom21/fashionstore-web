import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { TenantApiService } from '../services/tenant-api.service';
import { OfflineDbService } from './offline-db.service';
import { OfflineDownloadService } from './offline-download.service';

describe('OfflineDownloadService CU17', () => {
  it('descarga más de 100 productos, variantes e inventario paginado', async () => {
    const identity = { usuario_id: 12, empresa_id: 3, empresa_slug: 'moda-sur', empresa_nombre: 'Moda Sur', rol: 'CAJERO', contexto: 'personal' as const, plan_codigo: 'PRO', permite_reportes_ia: true, sucursal_id: 2 };
    const calls: string[] = [];
    const api = {
      identidad: () => identity,
      consultar: vi.fn((route: string) => {
        calls.push(route);
        if (route.includes('/tenant/catalogo/productos?')) {
          const offset = Number(new URL(`http://x${route}`).searchParams.get('offset'));
          const count = offset === 0 ? 100 : 25;
          return of(Array.from({ length: count }, (_, index) => ({ id: offset + index + 1, nombre: `P${offset + index + 1}`, descripcion: null, precio: '10.00', categoria_id: 1, categoria_nombre: 'Moda' })));
        }
        if (route.includes('/variantes')) {
          const productId = Number(route.split('/productos/')[1].split('/')[0]);
          return of([{ id: productId, producto_id: productId, sku: `SKU-${productId}`, talla: 'M', color: 'Negro' }]);
        }
        const offset = Number(new URL(`http://x${route}`).searchParams.get('offset'));
        const items = offset === 0
          ? Array.from({ length: 100 }, (_, index) => ({ inventario_id: index + 1, sucursal_id: 2, sucursal_nombre: 'Centro', variante_producto_id: index + 1, stock_disponible: 2 }))
          : Array.from({ length: 25 }, (_, index) => ({ inventario_id: offset + index + 1, sucursal_id: 2, sucursal_nombre: 'Centro', variante_producto_id: offset + index + 1, stock_disponible: 2 }));
        return of({ items, total: 125, limit: 100, offset });
      }),
      sucursales: vi.fn(() => of([])),
    };
    const db = { getSnapshot: vi.fn(), replaceSnapshot: vi.fn().mockResolvedValue(undefined) };
    TestBed.configureTestingModule({ providers: [OfflineDownloadService, { provide: TenantApiService, useValue: api }, { provide: OfflineDbService, useValue: db }] });
    const service = TestBed.inject(OfflineDownloadService);
    await service.descargar();
    expect(calls.filter((route) => route.includes('/tenant/catalogo/productos?'))).toHaveLength(2);
    expect(calls.filter((route) => route.includes('/tenant/inventario/pos'))).toHaveLength(2);
    const [saved, products, variants, stock] = db.replaceSnapshot.mock.calls[0];
    expect(saved.counts).toEqual({ productos: 125, variantes: 125, disponibilidad: 125, sucursales: 1 });
    expect(products).toHaveLength(125);
    expect(variants).toHaveLength(125);
    expect(stock).toHaveLength(125);
  });

  it('CU19 descarga sucursales activas para CLIENTE sin pedir inventario POS', async () => {
    const identity = {
      usuario_id: 21,
      empresa_id: 3,
      empresa_slug: 'moda-sur',
      empresa_nombre: 'Moda Sur',
      rol: 'CLIENTE',
      contexto: 'cliente' as const,
      plan_codigo: 'PRO',
      permite_reportes_ia: true,
      sucursal_id: null,
    };
    const calls: string[] = [];
    const api = {
      identidad: () => identity,
      consultar: vi.fn((route: string) => {
        calls.push(route);
        if (route.includes('/tenant/catalogo/productos?')) {
          return of([
            {
              id: 7,
              nombre: 'Abrigo',
              descripcion: null,
              precio: '10.00',
              categoria_id: 1,
              categoria_nombre: 'Moda',
            },
          ]);
        }
        return of([
          { id: 70, producto_id: 7, sku: 'ABR-M', talla: 'M', color: 'Negro' },
        ]);
      }),
      sucursales: vi.fn(() =>
        of([
          {
            id: 1,
            ciudad_id: 1,
            nombre: 'Centro',
            direccion: 'Calle 1',
            telefono: null,
            estado: true,
          },
          {
            id: 2,
            ciudad_id: 1,
            nombre: 'Cerrada',
            direccion: 'Calle 2',
            telefono: null,
            estado: false,
          },
        ]),
      ),
    };
    const db = {
      getSnapshot: vi.fn(),
      replaceSnapshot: vi.fn().mockResolvedValue(undefined),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        OfflineDownloadService,
        { provide: TenantApiService, useValue: api },
        { provide: OfflineDbService, useValue: db },
      ],
    });
    const service = TestBed.inject(OfflineDownloadService);

    await service.descargar();

    expect(calls.some((route) => route.includes('/tenant/inventario/pos'))).toBe(
      false,
    );
    expect(api.sucursales).toHaveBeenCalledOnce();
    const [saved, , , stock, branches] = db.replaceSnapshot.mock.calls[0];
    expect(saved.counts).toEqual({
      productos: 1,
      variantes: 1,
      disponibilidad: 0,
      sucursales: 1,
    });
    expect(saved.source).toContain('/tenant/empresa/sucursales');
    expect(stock).toHaveLength(0);
    expect(branches).toEqual([
      { id: '3:cliente:21:todas:1', sucursal_id: 1, empresa_id: 3, nombre: 'Centro', snapshot_key: '3:cliente:21:todas' },
    ]);
  });
});
