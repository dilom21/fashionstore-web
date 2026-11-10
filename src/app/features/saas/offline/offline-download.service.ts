import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TenantApiService } from '../services/tenant-api.service';
import { OfflineDbService } from './offline-db.service';
import { OfflineDisponibilidad, OfflineEstado, OfflineProducto, OfflineSnapshot, OfflineSucursal, OfflineVariante } from './offline.models';

@Injectable({ providedIn: 'root' })
export class OfflineDownloadService {
  private static readonly PAGE_SIZE = 100;
  private static readonly MAX_PAGES = 1000;
  private static readonly VARIANT_CONCURRENCY = 8;
  private readonly api = inject(TenantApiService);
  private readonly db = inject(OfflineDbService);
  readonly estado = signal<OfflineEstado>('SIN_DATOS');
  readonly progreso = signal(0);
  readonly error = signal<string | null>(null);
  readonly snapshot = signal<OfflineSnapshot | undefined>(undefined);

  async cargarEstado(): Promise<void> {
    const i = this.api.identidad(); if (!i) return;
    const key = `${i.empresa_id}:${i.usuario_id}:${i.sucursal_id ?? 'todas'}`;
    const value = await this.db.getSnapshot(key); this.snapshot.set(value);
    this.estado.set(value?.estado === 'DISPONIBLE_LOCAL' ? (value.expires_at && Date.parse(value.expires_at) < Date.now() ? 'DESACTUALIZADO' : 'DISPONIBLE_LOCAL') : 'SIN_DATOS');
  }

  async descargar(): Promise<void> {
    const identity = this.api.identidad(); if (!identity) throw new Error('La sesión empresarial no está confirmada');
    const key = `${identity.empresa_id}:${identity.usuario_id}:${identity.sucursal_id ?? 'todas'}`;
    this.estado.set('DESCARGANDO'); this.error.set(null); this.progreso.set(10);
    const started = new Date().toISOString();
    try {
      const products = await this.descargarProductos();
      this.progreso.set(35);
      const variants = await this.descargarVariantes(products);
      this.progreso.set(60);
      let stock: any[] = [];
      if (identity.contexto === 'personal' && (identity.rol === 'ADMINISTRADOR' || identity.rol === 'ENCARGADO_SUCURSAL')) {
        const params = identity.sucursal_id ? `&sucursal_id=${identity.sucursal_id}` : '';
        stock = await this.descargarInventario(params);
      }
      this.validarInventario(stock, new Set(variants.map(v => v.id)));
      this.progreso.set(80);
      const now = new Date().toISOString();
      const productRows: OfflineProducto[] = products.map(p => ({ ...p, empresa_id: identity.empresa_id, snapshot_key: key }));
      const variantRows: OfflineVariante[] = variants.map(v => ({ ...v, empresa_id: identity.empresa_id, snapshot_key: key }));
      const availability: OfflineDisponibilidad[] = stock.map(row => ({ id: `${key}:${row.variante_producto_id}:${row.sucursal_id}`, empresa_id: identity.empresa_id, variante_id: row.variante_producto_id, sucursal_id: row.sucursal_id, stock_disponible_conocido: Math.max(0, Number(row.stock_disponible ?? 0)), fecha_actualizacion: row.fecha_actualizacion, snapshot_key: key }));
      const sucursales: OfflineSucursal[] = [...new Map(stock.map(row => [row.sucursal_id, { id: row.sucursal_id, empresa_id: identity.empresa_id, nombre: row.sucursal_nombre, snapshot_key: key }])).values()];
      const snapshot: OfflineSnapshot = { key, schema_version: 1, empresa_id: identity.empresa_id, empresa_slug: identity.empresa_slug, usuario_id: identity.usuario_id, sucursal_id: identity.sucursal_id ?? null, generado_en: now, version_datos: `${now}:${products.length}:${variants.length}`, download_started_at: started, download_completed_at: now, last_successful_sync_at: now, estado: 'DISPONIBLE_LOCAL', source: 'FashionStore SaaS /tenant/catalogo + /tenant/inventario', counts: { productos: productRows.length, variantes: variantRows.length, disponibilidad: availability.length, sucursales: sucursales.length } };
      await this.db.replaceSnapshot(snapshot, productRows, variantRows, availability, sucursales);
      this.snapshot.set(snapshot); this.progreso.set(100); this.estado.set('DISPONIBLE_LOCAL');
    } catch (e) { this.estado.set('ERROR'); this.error.set(e instanceof Error ? e.message : 'No se pudo completar la descarga'); throw e; }
  }

  private async descargarProductos(): Promise<any[]> {
    const rows: any[] = [];
    const ids = new Set<number>();
    for (let page = 0; page < OfflineDownloadService.MAX_PAGES; page++) {
      const offset = page * OfflineDownloadService.PAGE_SIZE;
      const response = await firstValueFrom(this.api.consultar<unknown[]>(`/tenant/catalogo/productos?limit=${OfflineDownloadService.PAGE_SIZE}&offset=${offset}`));
      if (!Array.isArray(response)) throw new Error(`Respuesta inválida de productos en offset ${offset}`);
      for (const row of response as any[]) {
        if (!row || !Number.isInteger(row.id) || row.id <= 0) throw new Error(`Producto inválido en offset ${offset}`);
        if (ids.has(row.id)) throw new Error(`Producto duplicado: ${row.id}`);
        ids.add(row.id); rows.push(row);
      }
      if (response.length < OfflineDownloadService.PAGE_SIZE) return rows;
    }
    throw new Error('Límite defensivo de páginas de productos excedido');
  }

  private async descargarVariantes(products: any[]): Promise<any[]> {
    const rows: any[] = [];
    const ids = new Set<number>();
    for (let start = 0; start < products.length; start += OfflineDownloadService.VARIANT_CONCURRENCY) {
      const batch = products.slice(start, start + OfflineDownloadService.VARIANT_CONCURRENCY);
      const responses = await Promise.all(batch.map(async product => {
        const response = await firstValueFrom(this.api.consultar<unknown[]>(`/tenant/catalogo/productos/${product.id}/variantes`));
        if (!Array.isArray(response)) throw new Error(`Respuesta inválida de variantes para producto ${product.id}`);
        return { product, response };
      }));
      for (const { product, response } of responses) for (const row of response as any[]) {
        if (!row || !Number.isInteger(row.id) || row.id <= 0 || row.producto_id !== product.id) throw new Error(`Variante inválida para producto ${product.id}`);
        if (ids.has(row.id)) throw new Error(`Variante duplicada: ${row.id}`);
        ids.add(row.id); rows.push(row);
      }
    }
    return rows;
  }

  private async descargarInventario(params: string): Promise<any[]> {
    const rows: any[] = [];
    const ids = new Set<string>();
    let total: number | undefined;
    for (let page = 0; page < OfflineDownloadService.MAX_PAGES; page++) {
      const offset = page * OfflineDownloadService.PAGE_SIZE;
      const response = await firstValueFrom(this.api.consultar<unknown>(`/tenant/inventario?limit=${OfflineDownloadService.PAGE_SIZE}&offset=${offset}${params}`));
      if (!response || typeof response !== 'object' || !Array.isArray((response as any).items) || !Number.isInteger((response as any).total) || (response as any).total < 0) {
        throw new Error(`Respuesta inválida de inventario en offset ${offset}`);
      }
      const pageData = response as { items: any[]; total: number; limit: number; offset: number };
      if (pageData.offset !== offset || pageData.limit !== OfflineDownloadService.PAGE_SIZE) throw new Error(`Paginación inconsistente de inventario en offset ${offset}`);
      if (total === undefined) total = pageData.total;
      if (total !== pageData.total) throw new Error('El total de inventario cambió durante la descarga');
      for (const row of pageData.items) {
        if (!row || !Number.isInteger(row.variante_producto_id) || !Number.isInteger(row.sucursal_id)) throw new Error(`Fila inválida de inventario en offset ${offset}`);
        const id = `${row.variante_producto_id}:${row.sucursal_id}`;
        if (ids.has(id)) throw new Error(`Fila de inventario duplicada: ${id}`);
        ids.add(id); rows.push(row);
      }
      if (rows.length >= total || pageData.items.length === 0) {
        if (rows.length !== total) throw new Error(`Inventario incompleto: ${rows.length}/${total}`);
        return rows;
      }
    }
    throw new Error('Límite defensivo de páginas de inventario excedido');
  }

  private validarInventario(rows: any[], variantIds: Set<number>): void {
    for (const row of rows) if (!variantIds.has(row.variante_producto_id)) throw new Error(`Inventario referencia variante inexistente: ${row.variante_producto_id}`);
  }
}
