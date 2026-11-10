import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { OfflineCatalogoReaderService } from '../offline/offline-catalogo-reader.service';
import { OfflineOperationsService } from '../offline/offline-operations.service';
import { TenantApiService } from '../services/tenant-api.service';
import { OfflineOperacionPage } from './offline-operacion.page';

describe('OfflineOperacionPage doble toque', () => {
  it('inicia una sola escritura local mientras la primera sigue pendiente', async () => {
    let resolver!: () => void;
    const pending = new Promise<never>((resolve) => {
      resolver = resolve as () => void;
    });
    const operations = { registrar: vi.fn(() => pending) };
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { data: { tipo: 'VENTA_CONTADO' } } } },
        { provide: OfflineCatalogoReaderService, useValue: {} },
        { provide: OfflineOperationsService, useValue: operations },
        { provide: TenantApiService, useValue: { identidad: () => ({ sucursal_id: 2 }), esCajero: () => true } },
      ],
    });
    const page = TestBed.runInInjectionContext(() => new OfflineOperacionPage());
    page.data.set({
      snapshot: { key: 'scope', schema_version: 2, empresa_id: 3, empresa_slug: 'moda-sur', usuario_id: 12, contexto: 'personal', sucursal_id: 2, generado_en: '', version_datos: '', download_started_at: '', download_completed_at: '', last_successful_sync_at: '', expires_at: null, estado: 'DISPONIBLE_LOCAL', source: 'test', counts: { productos: 1, variantes: 1, disponibilidad: 1, sucursales: 1 } },
      productos: [], variantes: [], disponibilidad: [],
      sucursales: [{ id: 'scope:2', sucursal_id: 2, empresa_id: 3, nombre: 'Centro', snapshot_key: 'scope' }],
    });
    page.lineas.set([{ inventario_id: 5, producto_id: 1, producto_nombre: 'Abrigo', variante_id: 2, sku: 'A-1', talla: 'M', color: 'Negro', cantidad: 1, precio_unitario_provisional: 20 }]);
    void page.registrar();
    void page.registrar();
    expect(operations.registrar).toHaveBeenCalledOnce();
    expect(page.guardando()).toBe(true);
    resolver();
  });

  it('CU19 arma candidatos con variante_id aunque no exista inventario_id y registra la reserva', async () => {
    const operations = {
      registrar: vi.fn().mockResolvedValue({
        operacion_uuid: '9f4c1e8e-7a2b-4f6c-9d2e-3a1b5c7d9e01',
        estado: 'PENDIENTE',
      }),
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { tipo: 'RESERVA' } } },
        },
        { provide: OfflineCatalogoReaderService, useValue: {} },
        { provide: OfflineOperationsService, useValue: operations },
        {
          provide: TenantApiService,
          useValue: {
            identidad: () => ({ sucursal_id: null }),
            esCajero: () => false,
          },
        },
      ],
    });
    const page = TestBed.runInInjectionContext(() => new OfflineOperacionPage());
    page.data.set({
      snapshot: {
        key: 'scope',
        schema_version: 2,
        empresa_id: 3,
        empresa_slug: 'moda-sur',
        usuario_id: 21,
        contexto: 'cliente',
        sucursal_id: null,
        generado_en: '',
        version_datos: '',
        download_started_at: '',
        download_completed_at: '',
        last_successful_sync_at: '',
        expires_at: null,
        estado: 'DISPONIBLE_LOCAL',
        source: 'test',
        counts: { productos: 1, variantes: 1, disponibilidad: 0, sucursales: 1 },
      },
      productos: [
        {
          id: 'scope:7',
          producto_id: 7,
          empresa_id: 3,
          nombre: 'Abrigo',
          descripcion: null,
          precio: 20,
          categoria_id: 1,
          categoria_nombre: 'Moda',
          snapshot_key: 'scope',
          variantes: 1,
          stockConocido: null,
        },
      ],
      variantes: [
        {
          id: 'scope:70',
          variante_id: 70,
          empresa_id: 3,
          producto_id: 7,
          sku: 'ABR-M',
          talla: 'M',
          color: 'Negro',
          snapshot_key: 'scope',
        },
      ],
      disponibilidad: [],
      sucursales: [
        {
          id: 'scope:1',
          sucursal_id: 1,
          empresa_id: 3,
          nombre: 'Centro',
          snapshot_key: 'scope',
        },
      ],
    });
    page.sucursalId.set(1);

    const candidatos = page.candidatos();
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0]).toMatchObject({
      inventario_id: null,
      variante_id: 70,
      sku: 'ABR-M',
      stock_conocido: null,
    });

    page.agregar(candidatos[0]);
    page.agregar(candidatos[0]);
    expect(page.lineas()).toHaveLength(1);
    expect(page.lineas()[0].cantidad).toBe(2);

    await page.registrar();

    expect(operations.registrar).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'RESERVA',
        sucursal_id: 1,
        lineas: [
          expect.objectContaining({
            inventario_id: null,
            variante_id: 70,
            cantidad: 2,
          }),
        ],
      }),
    );
  });

  it('CU20 sigue exigiendo inventario_id para listar candidatos', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { tipo: 'VENTA_CONTADO' } } },
        },
        { provide: OfflineCatalogoReaderService, useValue: {} },
        { provide: OfflineOperationsService, useValue: {} },
        {
          provide: TenantApiService,
          useValue: {
            identidad: () => ({ sucursal_id: 2 }),
            esCajero: () => true,
          },
        },
      ],
    });
    const page = TestBed.runInInjectionContext(() => new OfflineOperacionPage());
    page.data.set({
      snapshot: {
        key: 'scope',
        schema_version: 2,
        empresa_id: 3,
        empresa_slug: 'moda-sur',
        usuario_id: 12,
        contexto: 'personal',
        sucursal_id: 2,
        generado_en: '',
        version_datos: '',
        download_started_at: '',
        download_completed_at: '',
        last_successful_sync_at: '',
        expires_at: null,
        estado: 'DISPONIBLE_LOCAL',
        source: 'test',
        counts: { productos: 1, variantes: 1, disponibilidad: 2, sucursales: 1 },
      },
      productos: [
        {
          id: 'scope:7',
          producto_id: 7,
          empresa_id: 3,
          nombre: 'Abrigo',
          descripcion: null,
          precio: 20,
          categoria_id: 1,
          categoria_nombre: 'Moda',
          snapshot_key: 'scope',
          variantes: 1,
          stockConocido: 3,
        },
      ],
      variantes: [
        {
          id: 'scope:70',
          variante_id: 70,
          empresa_id: 3,
          producto_id: 7,
          sku: 'ABR-M',
          talla: 'M',
          color: 'Negro',
          snapshot_key: 'scope',
        },
      ],
      disponibilidad: [
        {
          id: 'scope:5',
          inventario_id: 5,
          empresa_id: 3,
          variante_id: 70,
          sucursal_id: 2,
          stock_disponible_conocido: 3,
          fecha_actualizacion: null,
          snapshot_key: 'scope',
        },
        {
          id: 'scope:sin',
          inventario_id: null,
          empresa_id: 3,
          variante_id: 70,
          sucursal_id: 2,
          stock_disponible_conocido: 0,
          fecha_actualizacion: null,
          snapshot_key: 'scope',
        },
      ],
      sucursales: [],
    });
    page.sucursalId.set(2);

    const candidatos = page.candidatos();
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].inventario_id).toBe(5);
  });
});
