import { Injectable, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';

import { TenantApiService } from '../services/tenant-api.service';
import {
  OfflineOperacion,
  OfflineOperacionPayload,
  OfflineOperacionPayloadReserva,
  OfflineOperacionPayloadVenta,
  OfflineOperacionResponse,
} from './offline.models';

/**
 * Contrato CU21 preparado, deliberadamente cerrado.
 *
 * La migración 106 no está instalada/validada y el frontend no conoce el flag
 * SAAS_OFFLINE_ENABLED del despliegue. Por ello no hay envío, polling,
 * reintento ni Background Sync comercial habilitado en esta entrega.
 */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly api = inject(TenantApiService);
  readonly habilitada = false;

  enviar(operation: OfflineOperacion): Observable<OfflineOperacionResponse> {
    if (!this.habilitada) {
      return throwError(
        () =>
          new Error(
            'Sincronización deshabilitada hasta validar ledger 106 y SAAS_OFFLINE_ENABLED.',
          ),
      );
    }
    return this.api.registrarOperacionOffline<OfflineOperacionResponse>(
      payloadOperacion(operation),
      operation.operacion_uuid,
    );
  }

  consultar(uuid: string): Observable<OfflineOperacionResponse> {
    if (!this.habilitada) {
      return throwError(
        () => new Error('Consulta remota deshabilitada en esta entrega.'),
      );
    }
    return this.api.consultarOperacionOffline<OfflineOperacionResponse>(uuid);
  }
}

/** DTO estricto: nunca incluye empresa, usuario, rol, total, precios ni estado. */
export function payloadOperacion(
  operation: OfflineOperacion,
): OfflineOperacionPayload {
  const observacion = operation.observacion ?? undefined;

  if (operation.tipo === 'RESERVA') {
    if (!operation.fecha_atencion) {
      throw new Error('La reserva no tiene fecha de atención.');
    }
    const reserva: OfflineOperacionPayloadReserva = {
      operacion_uuid: operation.operacion_uuid,
      tipo: 'RESERVA',
      sucursal_id: operation.sucursal_id,
      // CU19: variante + cantidad. NUNCA inventario_id (lo deriva el backend).
      lineas: operation.lineas.map((line) => ({
        variante_id: line.variante_id,
        cantidad: line.cantidad,
      })),
      fecha_atencion: operation.fecha_atencion,
    };
    if (observacion) reserva.observacion = observacion;
    return reserva;
  }

  const venta: OfflineOperacionPayloadVenta = {
    operacion_uuid: operation.operacion_uuid,
    tipo: 'VENTA_CONTADO',
    sucursal_id: operation.sucursal_id,
    // CU20 conserva el contrato POS basado en inventario_id.
    lineas: operation.lineas.map((line) => {
      if (line.inventario_id === null) {
        throw new Error('La venta de contado no tiene un inventario válido.');
      }
      return { inventario_id: line.inventario_id, cantidad: line.cantidad };
    }),
  };
  if (observacion) venta.observacion = observacion;
  if (operation.efectivo_recibido) {
    venta.efectivo_recibido = operation.efectivo_recibido;
  }
  if (operation.cliente_id) venta.cliente_id = operation.cliente_id;
  return venta;
}
