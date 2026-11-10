import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { OfflineCatalogoData, OfflineCatalogoReaderService } from '../offline/offline-catalogo-reader.service';
import { OfflineOperationsService } from '../offline/offline-operations.service';
import { OfflineOperacion, OfflineOperacionLinea, OfflineOperacionTipo } from '../offline/offline.models';
import { TenantApiService } from '../services/tenant-api.service';

interface CandidatoOffline extends OfflineOperacionLinea {
  sucursal_id: number;
  stock_conocido: number | null;
}

@Component({
  selector: 'app-offline-operacion',
  imports: [CurrencyPipe, RouterLink],
  templateUrl: './offline-operacion.page.html',
  styleUrl: './offline-pages.css',
})
export class OfflineOperacionPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly reader = inject(OfflineCatalogoReaderService);
  private readonly operations = inject(OfflineOperationsService);
  readonly api = inject(TenantApiService);

  readonly tipo = this.route.snapshot.data['tipo'] as OfflineOperacionTipo;
  readonly data = signal<OfflineCatalogoData | null>(null);
  readonly sucursalId = signal<number | null>(
    this.api.identidad()?.sucursal_id ?? null,
  );
  readonly lineas = signal<OfflineOperacionLinea[]>([]);
  readonly fechaAtencion = signal(this.fechaLocalInicial());
  readonly observacion = signal('');
  readonly efectivoRecibido = signal('');
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);
  readonly creada = signal<OfflineOperacion | null>(null);

  readonly esVenta = computed(() => this.tipo === 'VENTA_CONTADO');
  readonly total = computed(() =>
    this.lineas().reduce(
      (sum, line) =>
        sum + (line.precio_unitario_provisional ?? 0) * line.cantidad,
      0,
    ),
  );
  readonly candidatos = computed<CandidatoOffline[]>(() => {
    const data = this.data();
    const branchId = this.sucursalId();
    if (!data || !branchId) return [];
    return this.esVenta()
      ? this.candidatosVenta(data, branchId)
      : this.candidatosReserva(data, branchId);
  });

  /**
   * CU19: una reserva del CLIENTE se identifica por `variante_id`.
   *
   * El snapshot de un cliente no incluye inventario POS (CU17/CU18), por lo
   * que las variantes del catálogo son la fuente válida. El stock conocido se
   * muestra solo si la copia trae una referencia; FastAPI revalidará siempre.
   */
  private candidatosReserva(
    data: OfflineCatalogoData,
    branchId: number,
  ): CandidatoOffline[] {
    const rows: CandidatoOffline[] = [];
    for (const variant of data.variantes) {
      const product = data.productos.find(
        (row) => row.producto_id === variant.producto_id,
      );
      if (!product) continue;
      const stockRows = data.disponibilidad.filter(
        (row) =>
          row.variante_id === variant.variante_id &&
          row.sucursal_id === branchId,
      );
      rows.push({
        inventario_id: null,
        producto_id: product.producto_id,
        producto_nombre: product.nombre,
        variante_id: variant.variante_id,
        sku: variant.sku,
        talla: variant.talla,
        color: variant.color,
        cantidad: 1,
        precio_unitario_provisional: product.precio,
        sucursal_id: branchId,
        stock_conocido: stockRows.length
          ? stockRows.reduce(
              (sum, row) => sum + Math.max(0, row.stock_disponible_conocido),
              0,
            )
          : null,
      });
    }
    return rows.sort(
      (a, b) =>
        a.producto_nombre.localeCompare(b.producto_nombre) ||
        a.sku.localeCompare(b.sku),
    );
  }

  /** CU20: la venta de contado sigue exigiendo `inventario_id` del POS. */
  private candidatosVenta(
    data: OfflineCatalogoData,
    branchId: number,
  ): CandidatoOffline[] {
    const candidates: CandidatoOffline[] = [];
    for (const stock of data.disponibilidad) {
      if (
        stock.sucursal_id !== branchId ||
        stock.inventario_id === null ||
        !Number.isInteger(stock.inventario_id) ||
        stock.inventario_id < 1
      ) {
        continue;
      }
      const variant = data.variantes.find(
        (row) => row.variante_id === stock.variante_id,
      );
      const product = data.productos.find(
        (row) => row.producto_id === variant?.producto_id,
      );
      if (!variant || !product) continue;
      candidates.push({
        inventario_id: stock.inventario_id,
        producto_id: product.producto_id,
        producto_nombre: product.nombre,
        variante_id: variant.variante_id,
        sku: variant.sku,
        talla: variant.talla,
        color: variant.color,
        cantidad: 1,
        precio_unitario_provisional: product.precio,
        sucursal_id: stock.sucursal_id,
        stock_conocido: stock.stock_disponible_conocido,
      });
    }
    return candidates;
  }

  async ngOnInit(): Promise<void> {
    try {
      const data = await this.reader.leer();
      this.data.set(data);
      if (!this.sucursalId() && data.sucursales.length === 1) {
        this.sucursalId.set(data.sucursales[0].sucursal_id);
      }
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'No se pudo leer la copia local.',
      );
    }
  }

  cambiarSucursal(value: string): void {
    this.sucursalId.set(value ? Number(value) : null);
    this.lineas.set([]);
    this.creada.set(null);
  }

  /** Clave de línea: inventario en CU20, variante en CU19. */
  clave(line: Pick<OfflineOperacionLinea, 'inventario_id' | 'variante_id'>): number {
    return this.esVenta()
      ? Number(line.inventario_id)
      : line.variante_id;
  }

  agregar(candidate: CandidatoOffline): void {
    const current = this.lineas();
    const key = this.clave(candidate);
    const existing = current.find((line) => this.clave(line) === key);
    if (existing) {
      this.cambiarCantidad(key, Math.min(existing.cantidad + 1, 1000));
      return;
    }
    const { sucursal_id: _branch, stock_conocido: _stock, ...line } = candidate;
    this.lineas.set([...current, line]);
  }

  cambiarCantidad(clave: number, cantidad: number): void {
    if (cantidad < 1) {
      this.lineas.update((rows) =>
        rows.filter((row) => this.clave(row) !== clave),
      );
      return;
    }
    this.lineas.update((rows) =>
      rows.map((row) =>
        this.clave(row) === clave
          ? { ...row, cantidad: Math.min(1000, Math.floor(cantidad)) }
          : row,
      ),
    );
  }

  async registrar(): Promise<void> {
    // Se activa antes del primer await: evita dos UUID por doble toque.
    if (this.guardando()) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      const data = this.data();
      const branchId = this.sucursalId();
      const branch = data?.sucursales.find(
        (row) => row.sucursal_id === branchId,
      );
      if (!data?.snapshot) throw new Error('Primero descarga una instantánea offline.');
      if (!branchId || !branch) throw new Error('Selecciona una sucursal autorizada.');
      if (this.lineas().length === 0) throw new Error('Agrega al menos una variante.');
      const date = this.esVenta()
        ? null
        : new Date(this.fechaAtencion()).toISOString();
      const created = await this.operations.registrar({
        tipo: this.tipo,
        sucursal_id: branchId,
        sucursal_nombre: branch.nombre,
        snapshot_key: data.snapshot.key,
        lineas: this.lineas(),
        importe_provisional: this.esVenta() ? this.total() : null,
        efectivo_recibido:
          this.esVenta() && this.efectivoRecibido().trim()
            ? Number(this.efectivoRecibido()).toFixed(2)
            : null,
        fecha_atencion: date,
        observacion: this.observacion(),
      });
      this.creada.set(created);
      this.lineas.set([]);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'No se pudo registrar la operación local.',
      );
    } finally {
      this.guardando.set(false);
    }
  }

  private fechaLocalInicial(): string {
    const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }
}
