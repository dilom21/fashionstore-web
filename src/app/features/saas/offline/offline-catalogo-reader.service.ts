import { Injectable, inject } from '@angular/core';

import { OfflineDbService } from './offline-db.service';
import { OfflineIdentityService } from './offline-identity.service';
import {
  OfflineDisponibilidad,
  OfflineProducto,
  OfflineSnapshot,
  OfflineSucursal,
  OfflineVariante,
  offlineScopeKey,
} from './offline.models';

export interface OfflineCatalogoQuery {
  buscar?: string;
  categoriaId?: number;
  talla?: string;
  color?: string;
  sucursalId?: number;
  conStock?: boolean;
}

export interface OfflineCatalogoItem extends OfflineProducto {
  variantes: number;
  stockConocido: number | null;
}

export interface OfflineCatalogoData {
  snapshot?: OfflineSnapshot;
  productos: OfflineCatalogoItem[];
  variantes: OfflineVariante[];
  disponibilidad: OfflineDisponibilidad[];
  sucursales: OfflineSucursal[];
}

/** CU18: este servicio no inyecta HttpClient ni realiza solicitudes de red. */
@Injectable({ providedIn: 'root' })
export class OfflineCatalogoReaderService {
  private readonly db = inject(OfflineDbService);
  private readonly offlineIdentity = inject(OfflineIdentityService);

  async leer(query: OfflineCatalogoQuery = {}): Promise<OfflineCatalogoData> {
    const identity = this.offlineIdentity.identityForLocal();
    if (!identity) throw new Error('La sesión empresarial no está confirmada.');
    const key = offlineScopeKey(identity);
    const rows = await this.db.readSnapshotRows(key);
    if (!rows.snapshot) return { ...rows, productos: [] };
    const normaliza = (value: unknown): string =>
      String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
    const texto = normaliza(query.buscar);
    const availability = rows.disponibilidad.filter(
      (row) => !query.sucursalId || row.sucursal_id === query.sucursalId,
    );
    const productos = rows.productos
      .filter((product) => {
        const variants = rows.variantes.filter(
          (variant) => variant.producto_id === product.producto_id,
        );
        const stock = variants.reduce(
          (total, variant) =>
            total +
            availability
              .filter((row) => row.variante_id === variant.variante_id)
              .reduce(
                (sum, row) => sum + Math.max(0, row.stock_disponible_conocido),
                0,
              ),
          0,
        );
        return (
          (!texto ||
            normaliza(
              `${product.nombre} ${product.descripcion ?? ''} ${product.categoria_nombre}`,
            ).includes(texto)) &&
          (query.categoriaId === undefined ||
            product.categoria_id === query.categoriaId) &&
          (!query.talla ||
            variants.some(
              (variant) => normaliza(variant.talla) === normaliza(query.talla),
            )) &&
          (!query.color ||
            variants.some(
              (variant) => normaliza(variant.color) === normaliza(query.color),
            )) &&
          (!query.conStock || stock > 0)
        );
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map((product) => {
        const variantIds = rows.variantes
          .filter((variant) => variant.producto_id === product.producto_id)
          .map((variant) => variant.variante_id);
        const stockRows = availability.filter((row) =>
          variantIds.includes(row.variante_id),
        );
        return {
          ...product,
          variantes: variantIds.length,
          stockConocido: stockRows.length
            ? stockRows.reduce(
                (sum, row) => sum + Math.max(0, row.stock_disponible_conocido),
                0,
              )
            : null,
        };
      });
    return { ...rows, disponibilidad: availability, productos };
  }

  async detalle(productoId: number): Promise<{
    snapshot?: OfflineSnapshot;
    producto?: OfflineProducto;
    variantes: OfflineVariante[];
    disponibilidad: OfflineDisponibilidad[];
    sucursales: OfflineSucursal[];
  }> {
    const data = await this.leer();
    const producto = data.productos.find(
      (row) => row.producto_id === productoId,
    );
    const variantes = data.variantes.filter(
      (row) => row.producto_id === productoId,
    );
    const ids = new Set(variantes.map((row) => row.variante_id));
    return {
      snapshot: data.snapshot,
      producto,
      variantes,
      disponibilidad: data.disponibilidad.filter((row) =>
        ids.has(row.variante_id),
      ),
      sucursales: data.sucursales,
    };
  }
}
