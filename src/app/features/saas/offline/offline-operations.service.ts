import { Injectable, inject } from '@angular/core';

import { OfflineDbService } from './offline-db.service';
import { OfflineIdentityService } from './offline-identity.service';
import {
  NuevaOfflineOperacion,
  OfflineOperacion,
  offlineScopeKey,
} from './offline.models';

@Injectable({ providedIn: 'root' })
export class OfflineOperationsService {
  private readonly db = inject(OfflineDbService);
  private readonly offlineIdentity = inject(OfflineIdentityService);

  async registrar(datos: NuevaOfflineOperacion): Promise<OfflineOperacion> {
    const identity = this.offlineIdentity.identityForLocal();
    if (!identity) throw new Error('La sesión empresarial no está confirmada.');
    const rol = identity.rol.trim().toUpperCase();
    if (
      datos.tipo === 'RESERVA' &&
      (identity.contexto !== 'cliente' || rol !== 'CLIENTE')
    ) {
      throw new Error('Solo un cliente empresarial puede registrar esta solicitud.');
    }
    if (
      datos.tipo === 'VENTA_CONTADO' &&
      (identity.contexto !== 'personal' ||
        (rol !== 'CAJERO' && rol !== 'ADMINISTRADOR'))
    ) {
      throw new Error('El rol no está autorizado para ventas de contado offline.');
    }
    if (!Number.isInteger(datos.sucursal_id) || datos.sucursal_id < 1) {
      throw new Error('Selecciona una sucursal autorizada.');
    }
    if (datos.lineas.length < 1 || datos.lineas.length > 100) {
      throw new Error('La operación debe incluir entre 1 y 100 líneas.');
    }
    const esReserva = datos.tipo === 'RESERVA';
    const claves = new Set<number>();
    for (const line of datos.lineas) {
      if (
        !Number.isInteger(line.cantidad) ||
        line.cantidad < 1 ||
        line.cantidad > 1000
      ) {
        throw new Error('Las líneas contienen cantidades inválidas.');
      }
      if (esReserva) {
        // CU19: el cliente identifica la prenda por variante; el backend
        // deriva el inventario de la sucursal al sincronizar.
        if (!Number.isInteger(line.variante_id) || line.variante_id < 1) {
          throw new Error('Cada reserva debe identificar una variante válida.');
        }
        if (claves.has(line.variante_id)) {
          throw new Error('Las líneas contienen variantes duplicadas.');
        }
        claves.add(line.variante_id);
        continue;
      }
      // CU20 conserva el contrato POS basado en inventario_id.
      if (
        line.inventario_id === null ||
        !Number.isInteger(line.inventario_id) ||
        line.inventario_id < 1
      ) {
        throw new Error('Cada venta debe identificar un inventario válido.');
      }
      if (claves.has(line.inventario_id)) {
        throw new Error('Las líneas contienen inventarios duplicados.');
      }
      claves.add(line.inventario_id);
    }
    if (datos.tipo === 'RESERVA') {
      if (!datos.fecha_atencion || Date.parse(datos.fecha_atencion) <= Date.now()) {
        throw new Error('La fecha de atención debe ser futura y tener zona horaria.');
      }
    }
    if ((datos.observacion?.length ?? 0) > 500) {
      throw new Error('La observación no puede superar 500 caracteres.');
    }
    if (rol === 'CAJERO' && identity.sucursal_id !== datos.sucursal_id) {
      throw new Error('El cajero solo puede operar en su sucursal asignada.');
    }
    if (!globalThis.crypto?.randomUUID) {
      throw new Error('Este navegador no permite generar UUID seguros.');
    }

    const uuid = globalThis.crypto.randomUUID();
    const now = new Date().toISOString();
    const operacion: OfflineOperacion = {
      operacion_uuid: uuid,
      uuid,
      scope_key: offlineScopeKey(identity),
      tipo: datos.tipo,
      empresa_id: identity.empresa_id,
      empresa_slug: identity.empresa_slug,
      usuario_id: identity.usuario_id,
      contexto: identity.contexto,
      rol,
      sucursal_id: datos.sucursal_id,
      sucursal_nombre: datos.sucursal_nombre,
      fecha: now,
      snapshot_key: datos.snapshot_key,
      lineas: datos.lineas.map((line) => ({
        ...line,
        // RESERVA nunca persiste un inventario administrativo.
        inventario_id: esReserva ? null : line.inventario_id,
      })),
      importe_provisional: datos.importe_provisional ?? null,
      metodo_pago: datos.tipo === 'VENTA_CONTADO' ? 'EFECTIVO' : null,
      efectivo_recibido:
        datos.tipo === 'VENTA_CONTADO'
          ? datos.efectivo_recibido ?? null
          : null,
      fecha_atencion: datos.fecha_atencion ?? null,
      observacion: datos.observacion?.trim() || null,
      cliente_id:
        datos.tipo === 'VENTA_CONTADO' ? datos.cliente_id ?? null : null,
      estado: 'PENDIENTE',
      intentos: 0,
      ultimo_error: null,
      error_codigo: null,
      id_definitivo: null,
      resultado: null,
      created_at: now,
      updated_at: now,
    };
    await this.db.addOperacion(operacion);
    return operacion;
  }

  async listar(): Promise<OfflineOperacion[]> {
    const identity = this.offlineIdentity.identityForLocal();
    if (!identity) return [];
    return this.db.listOperaciones(offlineScopeKey(identity));
  }
}
