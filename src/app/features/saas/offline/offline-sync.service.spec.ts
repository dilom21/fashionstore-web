import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { TenantApiService } from '../services/tenant-api.service';
import { OfflineOperacion } from './offline.models';
import { OfflineSyncService, payloadOperacion } from './offline-sync.service';

const venta: OfflineOperacion = {
  operacion_uuid: '9f4c1e8e-7a2b-4f6c-9d2e-3a1b5c7d9e01',
  uuid: '9f4c1e8e-7a2b-4f6c-9d2e-3a1b5c7d9e01',
  scope_key: '3:personal:12:2',
  tipo: 'VENTA_CONTADO',
  empresa_id: 3,
  empresa_slug: 'moda-sur',
  usuario_id: 12,
  contexto: 'personal',
  rol: 'CAJERO',
  sucursal_id: 2,
  sucursal_nombre: 'Centro',
  fecha: '2026-11-10T10:00:00Z',
  snapshot_key: 'scope',
  lineas: [
    {
      inventario_id: 5,
      producto_id: 1,
      producto_nombre: 'Abrigo',
      variante_id: 2,
      sku: 'A-1',
      talla: 'M',
      color: 'Negro',
      cantidad: 1,
      precio_unitario_provisional: 20,
    },
  ],
  importe_provisional: 20,
  metodo_pago: 'EFECTIVO',
  efectivo_recibido: '30.00',
  fecha_atencion: null,
  observacion: null,
  cliente_id: null,
  estado: 'PENDIENTE',
  intentos: 0,
  ultimo_error: null,
  error_codigo: null,
  id_definitivo: null,
  resultado: null,
  created_at: '2026-11-10T10:00:00Z',
  updated_at: '2026-11-10T10:00:00Z',
};

/** CU19: la reserva del CLIENTE se envía con variante_id, nunca inventario_id. */
const reserva: OfflineOperacion = {
  ...venta,
  operacion_uuid: '1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081',
  uuid: '1b2c3d4e-5f60-4718-9a2b-3c4d5e6f7081',
  scope_key: '3:cliente:12:todas',
  tipo: 'RESERVA',
  contexto: 'cliente',
  rol: 'CLIENTE',
  lineas: [
    {
      inventario_id: null,
      producto_id: 1,
      producto_nombre: 'Abrigo',
      variante_id: 2,
      sku: 'A-1',
      talla: 'M',
      color: 'Negro',
      cantidad: 3,
      precio_unitario_provisional: 20,
    },
  ],
  importe_provisional: null,
  metodo_pago: null,
  efectivo_recibido: null,
  fecha_atencion: '2026-11-15T19:30:00.000Z',
  observacion: 'Reserva offline',
};

describe('OfflineSyncService contrato cerrado', () => {
  it('CU20 construye el DTO POS con inventario_id y sin campos de tenant', () => {
    expect(payloadOperacion(venta)).toEqual({
      operacion_uuid: venta.operacion_uuid,
      tipo: 'VENTA_CONTADO',
      sucursal_id: 2,
      lineas: [{ inventario_id: 5, cantidad: 1 }],
      efectivo_recibido: '30.00',
    });
  });

  it('CU19 construye el DTO RESERVA con variante_id y SIN inventario_id', () => {
    const payload = payloadOperacion(reserva);

    expect(payload).toEqual({
      operacion_uuid: reserva.operacion_uuid,
      tipo: 'RESERVA',
      sucursal_id: 2,
      lineas: [{ variante_id: 2, cantidad: 3 }],
      fecha_atencion: '2026-11-15T19:30:00.000Z',
      observacion: 'Reserva offline',
    });
    expect('inventario_id' in (payload.lineas[0] as object)).toBe(false);
    expect('cliente_id' in payload).toBe(false);
    expect('total' in payload).toBe(false);
    expect('empresa_id' in payload).toBe(false);
  });

  it('CU19 rechaza una reserva sin fecha de atención', () => {
    expect(() =>
      payloadOperacion({ ...reserva, fecha_atencion: null }),
    ).toThrow('fecha de atención');
  });

  it('no realiza HTTP mientras ledger/flag no estén validados', async () => {
    const api = {
      registrarOperacionOffline: vi.fn(),
      consultarOperacionOffline: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [OfflineSyncService, { provide: TenantApiService, useValue: api }],
    });
    const service = TestBed.inject(OfflineSyncService);
    await expect(firstValueFrom(service.enviar(venta))).rejects.toThrow(
      'Sincronización deshabilitada',
    );
    expect(api.registrarOperacionOffline).not.toHaveBeenCalled();
  });
});
