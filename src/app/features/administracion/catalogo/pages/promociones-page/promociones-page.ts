import { CommonModule } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { TenantMerchandisingService } from '../../services/tenant-merchandising.service';
import { TenantPrecioPromocional, TenantProductoResumen, TenantPromocion } from '../../models/tenant-merchandising.model';

type EstadoFiltro = 'todos' | 'activos' | 'inactivos';

@Component({
  selector: 'app-promociones-page',
  imports: [CommonModule, ReactiveFormsModule],
  styleUrls: ['./promociones-page.css', './promociones-page-tabla.css'],
  templateUrl: './promociones-page.html',
})
export class PromocionesPage {
  private readonly api = inject(TenantMerchandisingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly promociones = signal<TenantPromocion[]>([]);
  readonly productos = signal<TenantProductoResumen[]>([]);
  readonly productosAbiertos = signal(false);
  readonly precio = signal<TenantPrecioPromocional | null>(null);
  readonly detalle = signal<TenantPromocion | null>(null);
  readonly productosTitulo = signal('');
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly pagina = signal(0);
  readonly readonlyPageSize = 20;
  readonly filtros = new FormGroup({ buscar: new FormControl('', { nonNullable: true }), estado: new FormControl<EstadoFiltro>('todos', { nonNullable: true }), tipo: new FormControl<'todos' | 'PORCENTAJE' | 'MONTO'>('todos', { nonNullable: true }), vigentes: new FormControl(false, { nonNullable: true }) });
  readonly productoId = new FormControl('', { nonNullable: true });

  ngOnInit(): void { this.cargar(); }
  buscar(): void { this.pagina.set(0); this.cargar(); }
  limpiar(): void { this.filtros.reset({ buscar: '', estado: 'todos', tipo: 'todos', vigentes: false }); this.buscar(); }
  tieneFiltros(): boolean { const f = this.filtros.getRawValue(); return !!f.buscar || f.estado !== 'todos' || f.tipo !== 'todos' || f.vigentes; }
  siguiente(): void { this.pagina.update((page) => page + 1); this.cargar(); }
  anterior(): void { if (this.pagina() > 0) { this.pagina.update((page) => page - 1); this.cargar(); } }
  valor(item: TenantPromocion): string { return item.tipo_descuento === 'PORCENTAJE' ? `${item.valor_descuento}%` : `$ ${item.valor_descuento.toFixed(2)}`; }
  fecha(value: string): string { return new Intl.DateTimeFormat('es', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
  vigencia(item: TenantPromocion): string { const now = Date.now(); if (!item.estado) return 'Deshabilitada'; if (new Date(item.fecha_inicio).getTime() > now) return 'Próxima'; if (new Date(item.fecha_fin).getTime() < now) return 'Vencida'; return 'Vigente'; }
  ver(item: TenantPromocion): void { this.api.obtenerPromocion(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (detail) => this.detalle.set(detail), error: (error) => this.handleError(error) }); }
  verProductos(item: TenantPromocion): void { this.productosAbiertos.set(true); this.api.listarProductosPromocion(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => { this.productos.set(result.productos); this.productosTitulo.set(`Productos de ${item.nombre}`); }, error: (error) => this.handleError(error) }); }
  consultarPrecio(): void { const id = Number(this.productoId.value); if (!Number.isInteger(id) || id <= 0) { this.error.set('Ingresa un ID de producto válido.'); return; } this.error.set(null); this.api.precioPromocional(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => this.precio.set(result), error: (error) => this.handleError(error) }); }
  cerrar(): void { this.detalle.set(null); this.productos.set([]); this.productosAbiertos.set(false); this.precio.set(null); }
  private cargar(): void { this.cargando.set(true); this.error.set(null); const f = this.filtros.getRawValue(); this.api.listarPromociones({ buscar: f.buscar.trim() || undefined, estado: f.estado === 'todos' ? undefined : f.estado === 'activos', tipo_descuento: f.tipo === 'todos' ? undefined : f.tipo, vigentes: f.vigentes, limit: this.readonlyPageSize, offset: this.pagina() * this.readonlyPageSize }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (items) => { this.promociones.set(items); this.cargando.set(false); }, error: (error) => this.handleError(error) }); }
  private handleError(error: { status?: number }): void { this.cargando.set(false); this.error.set(error.status === 403 ? 'No tienes permiso para consultar el catálogo de la empresa.' : error.status === 404 ? 'El producto o promoción no existe o no pertenece a esta empresa.' : error.status === 503 ? 'La consulta CU09 no está disponible temporalmente.' : 'No fue posible consultar la información tenant.'); if (error.status === 401) void this.router.navigateByUrl('/saas/login'); }
}
