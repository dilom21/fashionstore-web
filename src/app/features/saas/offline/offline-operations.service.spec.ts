import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { TenantApiService } from '../services/tenant-api.service';
import { OfflineDbService } from './offline-db.service';
import { OfflineOperationsService } from './offline-operations.service';

const ventaLine = {
  inventario_id: 5,
  producto_id: 1,
  producto_nombre: 'Abrigo',
  variante_id: 2,
  sku: 'A-1',
  talla: 'M',
  color: 'Negro',
  cantidad: 1,
  precio_unitario_provisional: 20,
};
/** CU19: el CLIENTE no recibe inventario_id; solo variante + cantidad. */
const reservaLine = { ...ventaLine, inventario_id: null };

const identity = (
  rol: string,
  contexto: 'personal' | 'cliente',
  sucursal_id: number | null = 2,
) => ({
  usuario_id: 12,
  empresa_id: 3,
  empresa_slug: 'moda-sur',
  empresa_nombre: 'Moda Sur',
  rol,
  contexto,
  plan_codigo: 'PRO',
  permite_reportes_ia: true,
  sucursal_id,
});

async function serviceFor(
  rol: string,
  contexto: 'personal' | 'cliente',
  branch: number | null = 2,
) {
  const db = {
    addOperacion: vi.fn().mockResolvedValue(undefined),
    listOperaciones: vi.fn().mockResolvedValue([]),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      OfflineOperationsService,
      { provide: TenantApiService, useValue: { identidad: () => identity(rol, contexto, branch) } },
      { provide: OfflineDbService, useValue: db },
    ],
  });
  return { service: TestBed.inject(OfflineOperationsService), db };
}

describe('OfflineOperationsService permisos CU19/CU20', () => {
  it.each(['CAJERO', 'ADMINISTRADOR'])(
    'autoriza VENTA_CONTADO a %s con inventario_id',
    async (rol) => {
      const { service, db } = await serviceFor(
        rol,
        'personal',
        rol === 'CAJERO' ? 2 : null,
      );
      const result = await service.registrar({
        tipo: 'VENTA_CONTADO',
        sucursal_id: 2,
        sucursal_nombre: 'Centro',
        snapshot_key: 'scope',
        lineas: [ventaLine],
        importe_provisional: 20,
        efectivo_recibido: '20.00',
      });
      expect(result.estado).toBe('PENDIENTE');
      expect(result.metodo_pago).toBe('EFECTIVO');
      expect(result.id_definitivo).toBeNull();
      expect(result.lineas[0].inventario_id).toBe(5);
      expect(db.addOperacion).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ['CLIENTE', 'cliente'],
    ['ENCARGADO_SUCURSAL', 'personal'],
    ['SUPERADMINISTRADOR', 'personal'],
  ])('rechaza VENTA_CONTADO a %s', async (rol, contexto) => {
    const { service, db } = await serviceFor(
      rol,
      contexto as 'personal' | 'cliente',
    );
    await expect(
      service.registrar({
        tipo: 'VENTA_CONTADO',
        sucursal_id: 2,
        sucursal_nombre: 'Centro',
        snapshot_key: 'scope',
        lineas: [ventaLine],
      }),
    ).rejects.toThrow('no está autorizado');
    expect(db.addOperacion).not.toHaveBeenCalled();
  });

  it('registra RESERVA solo para CLIENTE usando variante_id, sin inventario_id', async () => {
    const { service, db } = await serviceFor('CLIENTE', 'cliente', null);
    const result = await service.registrar({
      tipo: 'RESERVA',
      sucursal_id: 2,
      sucursal_nombre: 'Centro',
      snapshot_key: 'scope',
      lineas: [reservaLine],
      fecha_atencion: '2099-01-01T10:00:00-04:00',
      observacion: 'Prueba',
    });
    expect(result.operacion_uuid).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result.fecha_atencion).toContain('2099');
    expect(result.estado).toBe('PENDIENTE');
    expect(result.lineas[0]).toMatchObject({
      inventario_id: null,
      variante_id: 2,
      cantidad: 1,
    });
    expect(result.cliente_id).toBeNull();
    expect(result.efectivo_recibido).toBeNull();
    expect(result.empresa_id).toBe(3);
    expect(result.scope_key).toBe('3:cliente:12:todas');
    expect(db.addOperacion).toHaveBeenCalledOnce();
  });

  it('rechaza RESERVA sin variante_id válido', async () => {
    const { service, db } = await serviceFor('CLIENTE', 'cliente', null);
    await expect(
      service.registrar({
        tipo: 'RESERVA',
        sucursal_id: 2,
        sucursal_nombre: 'Centro',
        snapshot_key: 'scope',
        lineas: [{ ...reservaLine, variante_id: 0 }],
        fecha_atencion: '2099-01-01T10:00:00-04:00',
      }),
    ).rejects.toThrow('variante válida');
    expect(db.addOperacion).not.toHaveBeenCalled();
  });

  it('rechaza variantes duplicadas en una RESERVA', async () => {
    const { service, db } = await serviceFor('CLIENTE', 'cliente', null);
    await expect(
      service.registrar({
        tipo: 'RESERVA',
        sucursal_id: 2,
        sucursal_nombre: 'Centro',
        snapshot_key: 'scope',
        lineas: [reservaLine, { ...reservaLine }],
        fecha_atencion: '2099-01-01T10:00:00-04:00',
      }),
    ).rejects.toThrow('variantes duplicadas');
    expect(db.addOperacion).not.toHaveBeenCalled();
  });

  it('CU20 sigue rechazando una línea sin inventario_id', async () => {
    const { service, db } = await serviceFor('CAJERO', 'personal', 2);
    await expect(
      service.registrar({
        tipo: 'VENTA_CONTADO',
        sucursal_id: 2,
        sucursal_nombre: 'Centro',
        snapshot_key: 'scope',
        lineas: [reservaLine],
      }),
    ).rejects.toThrow('inventario válido');
    expect(db.addOperacion).not.toHaveBeenCalled();
  });

  it('impide al CAJERO elegir otra sucursal', async () => {
    const { service } = await serviceFor('CAJERO', 'personal', 2);
    await expect(
      service.registrar({
        tipo: 'VENTA_CONTADO',
        sucursal_id: 9,
        sucursal_nombre: 'Ajena',
        snapshot_key: 'scope',
        lineas: [ventaLine],
      }),
    ).rejects.toThrow('sucursal asignada');
  });
});
