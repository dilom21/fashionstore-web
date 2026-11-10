import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { TenantApiService, TenantSucursal } from '../services/tenant-api.service';
import { OfflineDbService } from './offline-db.service';
import { OfflineIdentityService } from './offline-identity.service';
import {
  OfflineDisponibilidad,
  OfflineEstado,
  OfflineProducto,
  OfflineSnapshot,
  OfflineSucursal,
  OfflineVariante,
  offlineScopeKey,
} from './offline.models';

interface CatalogoProductoApi {
  id: number;
  nombre: string;
  descripcion: string | null;
  precio: number | string;
  categoria_id: number;
  categoria_nombre: string;
}

interface CatalogoVarianteApi {
  id: number;
  producto_id: number;
  sku: string;
  talla: string;
  color: string;
}

interface InventarioPosApi {
  inventario_id: number;
  sucursal_id: number;
  sucursal_nombre: string;
  variante_producto_id: number;
  stock_disponible: number;
}

interface PaginaInventarioPos {
  items: InventarioPosApi[];
  total: number;
  limit: number;
  offset: number;
}

@Injectable({ providedIn: 'root' })
export class OfflineDownloadService {
  static readonly PAGE_SIZE = 100;
  static readonly MAX_PAGES = 1000;
  static readonly VARIANT_CONCURRENCY = 8;

  private readonly api = inject(TenantApiService);
  private readonly db = inject(OfflineDbService);
  private readonly offlineIdentity = inject(OfflineIdentityService);

  readonly estado = signal<OfflineEstado>('SIN_DATOS');
  readonly progreso = signal(0);
  readonly error = signal<string | null>(null);
  readonly snapshot = signal<OfflineSnapshot | undefined>(undefined);

  async cargarEstado(): Promise<void> {
    const identidad = this.offlineIdentity.identityForLocal();
    if (!identidad) return;
    const value = await this.db.getSnapshot(offlineScopeKey(identidad));
    this.snapshot.set(value);
    if (!value) {
      this.estado.set('SIN_DATOS');
      return;
    }
    this.estado.set(
      value.expires_at && Date.parse(value.expires_at) < Date.now()
        ? 'DESACTUALIZADO'
        : 'DISPONIBLE_LOCAL',
    );
  }

  async descargar(): Promise<void> {
    const identity = this.api.identidad();
    if (!identity) {
      throw new Error('La sesión empresarial no está confirmada.');
    }
    const key = offlineScopeKey(identity);
    this.offlineIdentity.remember(identity);
    this.estado.set('DESCARGANDO');
    this.error.set(null);
    this.progreso.set(5);
    const started = new Date().toISOString();

    try {
      const products = await this.descargarProductos();
      this.progreso.set(35);
      const variants = await this.descargarVariantes(products);
      this.progreso.set(60);

      let stock: InventarioPosApi[] = [];
      let branches: Pick<TenantSucursal, 'id' | 'nombre'>[] = [];
      const rol = identity.rol.trim().toUpperCase();
      const puedeDescargarPos =
        identity.contexto === 'personal' &&
        (rol === 'ADMINISTRADOR' || rol === 'CAJERO');
      // CU19: un CLIENTE no recibe inventario POS, pero sí necesita las
      // sucursales activas para elegir dónde registrar la reserva offline.
      // `GET /tenant/empresa/sucursales` es de solo lectura para miembros.
      if (identity.contexto === 'cliente') {
        branches = (await firstValueFrom(this.api.sucursales()))
          .filter((branch) => branch.estado)
          .map((branch) => ({ id: branch.id, nombre: branch.nombre }));
      }
      if (puedeDescargarPos) {
        stock = await this.descargarInventarioPos(identity.sucursal_id ?? null);
        if (rol === 'ADMINISTRADOR') {
          branches = (await firstValueFrom(this.api.sucursales()))
            .filter((branch) => branch.estado)
            .map((branch) => ({ id: branch.id, nombre: branch.nombre }));
        }
      }
      this.validarInventario(stock, new Set(variants.map((v) => v.id)));
      this.progreso.set(80);

      const now = new Date().toISOString();
      const productRows: OfflineProducto[] = products.map((product) => ({
        id: `${key}:${product.id}`,
        producto_id: product.id,
        empresa_id: identity.empresa_id,
        nombre: product.nombre,
        descripcion: product.descripcion ?? null,
        precio: Number(product.precio),
        categoria_id: product.categoria_id,
        categoria_nombre: product.categoria_nombre,
        snapshot_key: key,
      }));
      const variantRows: OfflineVariante[] = variants.map((variant) => ({
        id: `${key}:${variant.id}`,
        variante_id: variant.id,
        empresa_id: identity.empresa_id,
        producto_id: variant.producto_id,
        sku: variant.sku,
        talla: variant.talla,
        color: variant.color,
        snapshot_key: key,
      }));
      const availability: OfflineDisponibilidad[] = stock.map((row) => ({
        id: `${key}:${row.inventario_id}`,
        inventario_id: row.inventario_id,
        empresa_id: identity.empresa_id,
        variante_id: row.variante_producto_id,
        sucursal_id: row.sucursal_id,
        stock_disponible_conocido: Math.max(
          0,
          Number(row.stock_disponible ?? 0),
        ),
        fecha_actualizacion: null,
        snapshot_key: key,
      }));

      const branchMap = new Map<number, { id: number; nombre: string }>();
      for (const branch of branches) branchMap.set(branch.id, branch);
      for (const row of stock) {
        branchMap.set(row.sucursal_id, {
          id: row.sucursal_id,
          nombre: row.sucursal_nombre,
        });
      }
      const sucursales: OfflineSucursal[] = [...branchMap.values()].map(
        (branch) => ({
          id: `${key}:${branch.id}`,
          sucursal_id: branch.id,
          empresa_id: identity.empresa_id,
          nombre: branch.nombre,
          snapshot_key: key,
        }),
      );

      const snapshot: OfflineSnapshot = {
        key,
        schema_version: 2,
        empresa_id: identity.empresa_id,
        empresa_slug: identity.empresa_slug,
        usuario_id: identity.usuario_id,
        contexto: identity.contexto,
        sucursal_id: identity.sucursal_id ?? null,
        generado_en: now,
        version_datos: `${now}:${products.length}:${variants.length}:${stock.length}`,
        download_started_at: started,
        download_completed_at: now,
        last_successful_sync_at: now,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        estado: 'DISPONIBLE_LOCAL',
        source:
          identity.contexto === 'cliente'
            ? '/tenant/catalogo + /tenant/empresa/sucursales'
            : '/tenant/catalogo + /tenant/inventario/pos',
        counts: {
          productos: productRows.length,
          variantes: variantRows.length,
          disponibilidad: availability.length,
          sucursales: sucursales.length,
        },
      };

      await this.db.replaceSnapshot(
        snapshot,
        productRows,
        variantRows,
        availability,
        sucursales,
      );
      this.snapshot.set(snapshot);
      this.progreso.set(100);
      this.estado.set('DISPONIBLE_LOCAL');
    } catch (error) {
      this.estado.set('ERROR');
      this.error.set(
        error instanceof Error
          ? error.message
          : 'No se pudo completar la descarga.',
      );
      throw error;
    }
  }

  private async descargarProductos(): Promise<CatalogoProductoApi[]> {
    const rows: CatalogoProductoApi[] = [];
    const ids = new Set<number>();
    for (let page = 0; page < OfflineDownloadService.MAX_PAGES; page += 1) {
      const offset = page * OfflineDownloadService.PAGE_SIZE;
      const response = await firstValueFrom(
        this.api.consultar<CatalogoProductoApi[]>(
          `/tenant/catalogo/productos?limit=${OfflineDownloadService.PAGE_SIZE}&offset=${offset}`,
        ),
      );
      if (!Array.isArray(response)) {
        throw new Error(`Respuesta inválida de productos en offset ${offset}.`);
      }
      for (const row of response) {
        if (!row || !Number.isInteger(row.id) || row.id <= 0) {
          throw new Error(`Producto inválido en offset ${offset}.`);
        }
        if (ids.has(row.id)) throw new Error(`Producto duplicado: ${row.id}.`);
        ids.add(row.id);
        rows.push(row);
      }
      if (response.length < OfflineDownloadService.PAGE_SIZE) return rows;
    }
    throw new Error('Se excedió el límite defensivo de páginas de productos.');
  }

  private async descargarVariantes(
    products: CatalogoProductoApi[],
  ): Promise<CatalogoVarianteApi[]> {
    const rows: CatalogoVarianteApi[] = [];
    const ids = new Set<number>();
    for (
      let start = 0;
      start < products.length;
      start += OfflineDownloadService.VARIANT_CONCURRENCY
    ) {
      const batch = products.slice(
        start,
        start + OfflineDownloadService.VARIANT_CONCURRENCY,
      );
      const responses = await Promise.all(
        batch.map(async (product) => ({
          product,
          response: await firstValueFrom(
            this.api.consultar<CatalogoVarianteApi[]>(
              `/tenant/catalogo/productos/${product.id}/variantes`,
            ),
          ),
        })),
      );
      for (const { product, response } of responses) {
        if (!Array.isArray(response)) {
          throw new Error(`Variantes inválidas para producto ${product.id}.`);
        }
        for (const row of response) {
          if (
            !Number.isInteger(row.id) ||
            row.id <= 0 ||
            row.producto_id !== product.id
          ) {
            throw new Error(`Variante inválida para producto ${product.id}.`);
          }
          if (ids.has(row.id)) throw new Error(`Variante duplicada: ${row.id}.`);
          ids.add(row.id);
          rows.push(row);
        }
      }
    }
    return rows;
  }

  private async descargarInventarioPos(
    sucursalId: number | null,
  ): Promise<InventarioPosApi[]> {
    const rows: InventarioPosApi[] = [];
    const ids = new Set<number>();
    let total: number | undefined;
    for (let page = 0; page < OfflineDownloadService.MAX_PAGES; page += 1) {
      const offset = page * OfflineDownloadService.PAGE_SIZE;
      const sucursal = sucursalId ? `&sucursal_id=${sucursalId}` : '';
      const response = await firstValueFrom(
        this.api.consultar<PaginaInventarioPos>(
          `/tenant/inventario/pos?disponibilidad=TODOS&limit=${OfflineDownloadService.PAGE_SIZE}&offset=${offset}${sucursal}`,
        ),
      );
      if (
        !response ||
        !Array.isArray(response.items) ||
        !Number.isInteger(response.total) ||
        response.total < 0 ||
        response.offset !== offset ||
        response.limit !== OfflineDownloadService.PAGE_SIZE
      ) {
        throw new Error(`Paginación inválida de inventario en offset ${offset}.`);
      }
      total ??= response.total;
      if (total !== response.total) {
        throw new Error('El total de inventario cambió durante la descarga.');
      }
      for (const row of response.items) {
        if (!Number.isInteger(row.inventario_id) || row.inventario_id <= 0) {
          throw new Error(`Inventario inválido en offset ${offset}.`);
        }
        if (ids.has(row.inventario_id)) {
          throw new Error(`Inventario duplicado: ${row.inventario_id}.`);
        }
        ids.add(row.inventario_id);
        rows.push(row);
      }
      if (rows.length >= total || response.items.length === 0) {
        if (rows.length !== total) {
          throw new Error(`Inventario incompleto: ${rows.length}/${total}.`);
        }
        return rows;
      }
    }
    throw new Error('Se excedió el límite defensivo de inventario.');
  }

  private validarInventario(
    rows: InventarioPosApi[],
    variantIds: Set<number>,
  ): void {
    for (const row of rows) {
      if (!variantIds.has(row.variante_producto_id)) {
        throw new Error(
          `Inventario referencia variante inexistente: ${row.variante_producto_id}.`,
        );
      }
    }
  }
}
