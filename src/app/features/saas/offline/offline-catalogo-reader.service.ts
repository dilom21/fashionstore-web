import { Injectable, inject } from '@angular/core';
import { TenantApiService } from '../services/tenant-api.service';
import { OfflineDbService } from './offline-db.service';
import { OfflineDisponibilidad, OfflineProducto, OfflineSnapshot, OfflineSucursal, OfflineVariante } from './offline.models';

export interface OfflineCatalogoQuery { buscar?: string; categoriaId?: number; talla?: string; color?: string; sucursalId?: number; conStock?: boolean; }
export interface OfflineCatalogoItem extends OfflineProducto { varianteCount: number; stockConocido: number | null; }

export interface OfflineCatalogoData {
  snapshot?: OfflineSnapshot;
  productos: OfflineCatalogoItem[];
  variantes: OfflineVariante[];
  disponibilidad: OfflineDisponibilidad[];
  sucursales: OfflineSucursal[];
}

/** Lector CU18: nunca llama HTTP; solo consume la instantánea íntegra de CU17. */
@Injectable({ providedIn: 'root' })
export class OfflineCatalogoReaderService {
  private readonly api = inject(TenantApiService);
  private readonly db = inject(OfflineDbService);

  async leer(query: OfflineCatalogoQuery = {}): Promise<OfflineCatalogoData> {
    const identidad = this.api.identidad();
    if (!identidad) throw new Error('La sesión empresarial no está confirmada.');
    const key = `${identidad.empresa_id}:${identidad.usuario_id}:${identidad.sucursal_id ?? 'todas'}`;
    const rows = await this.db.readSnapshotRows(key);
    if (!rows.snapshot) return { ...rows, productos: [] };
    const variantes = rows.variantes.filter(v => v.snapshot_key === key);
    const disponibilidad = rows.disponibilidad.filter(d => d.snapshot_key === key && (!query.sucursalId || d.sucursal_id === query.sucursalId));
    const normaliza = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const texto = normaliza(query.buscar);
    const productos = rows.productos.filter(producto => {
      const pv = variantes.filter(v => v.producto_id === producto.id);
      const matchesText = !texto || normaliza(`${producto.nombre} ${producto.descripcion ?? ''} ${producto.categoria_nombre ?? ''}`).includes(texto);
      const matchesCategory = query.categoriaId === undefined || producto.categoria_id === query.categoriaId;
      const matchesTalla = !query.talla || pv.some(v => normaliza(v.talla) === normaliza(query.talla));
      const matchesColor = !query.color || pv.some(v => normaliza(v.color) === normaliza(query.color));
      const stock = pv.reduce((total, v) => total + disponibilidad.filter(d => d.variante_id === v.id).reduce((sum, d) => sum + Math.max(0, d.stock_disponible_conocido), 0), 0);
      return matchesText && matchesCategory && matchesTalla && matchesColor && (!query.conStock || stock > 0);
    }).sort((a, b) => a.nombre.localeCompare(b.nombre)).map(producto => {
      const ids = variantes.filter(v => v.producto_id === producto.id).map(v => v.id);
      const stockRows = disponibilidad.filter(d => ids.includes(d.variante_id));
      return { ...producto, varianteCount: ids.length, stockConocido: stockRows.length ? stockRows.reduce((sum, d) => sum + Math.max(0, d.stock_disponible_conocido), 0) : null };
    });
    return { snapshot: rows.snapshot, productos, variantes, disponibilidad, sucursales: rows.sucursales };
  }

  async detalle(id: number): Promise<{ snapshot?: OfflineSnapshot; producto?: OfflineProducto; variantes: OfflineVariante[]; disponibilidad: OfflineDisponibilidad[]; sucursales: OfflineSucursal[] }> {
    const data = await this.leer();
    const producto = data.productos.find(p => p.id === id);
    const variantes = data.variantes.filter(v => v.producto_id === id);
    const ids = new Set(variantes.map(v => v.id));
    return { snapshot: data.snapshot, producto, variantes, disponibilidad: data.disponibilidad.filter(d => ids.has(d.variante_id)), sucursales: data.sucursales };
  }
}
