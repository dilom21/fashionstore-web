import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { TenantMerchandisingService } from '../../services/tenant-merchandising.service';
import { TenantColeccion, TenantColeccionDetalle, TenantProductoResumen, TenantTemporada, TenantTemporadaDetalle } from '../../models/tenant-merchandising.model';

type EstadoFiltro = 'todos' | 'activos' | 'inactivos';

@Component({
  selector: 'app-temporadas-colecciones-page',
  imports: [CommonModule, ReactiveFormsModule],
  styleUrls: ['./temporadas-colecciones-page.css', './temporadas-colecciones-page-tabla.css'],
  templateUrl: './temporadas-colecciones-page.html',
})
export class TemporadasColeccionesPage {
  private readonly api = inject(TenantMerchandisingService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly tabActiva = signal<'temporadas' | 'colecciones'>('temporadas');
  readonly temporadas = signal<TenantTemporada[]>([]);
  readonly colecciones = signal<TenantColeccion[]>([]);
  readonly temporadaDetalle = signal<TenantTemporadaDetalle | null>(null);
  readonly coleccionDetalle = signal<TenantColeccionDetalle | null>(null);
  readonly productos = signal<TenantProductoResumen[]>([]);
  readonly productosTitulo = signal('');
  readonly productosAbiertos = signal(false);
  readonly cargando = signal(false);
  readonly cargandoDetalle = signal(false);
  readonly error = signal<string | null>(null);
  readonly paginaTemporadas = signal(0);
  readonly paginaColecciones = signal(0);
  readonly readonlyPageSize = 20;
  readonly temporadasFiltro = new FormGroup({ buscar: new FormControl('', { nonNullable: true }), estado: new FormControl<EstadoFiltro>('todos', { nonNullable: true }) });
  readonly coleccionesFiltro = new FormGroup({ buscar: new FormControl('', { nonNullable: true }), temporada_id: new FormControl<number | null>(null), estado: new FormControl<EstadoFiltro>('todos', { nonNullable: true }) });

  ngOnInit(): void { this.cargarTemporadas(); }
  activarTab(tab: 'temporadas' | 'colecciones'): void { this.tabActiva.set(tab); if (tab === 'colecciones' && this.colecciones().length === 0) this.cargarColecciones(); }
  esTabActiva(tab: 'temporadas' | 'colecciones'): boolean { return this.tabActiva() === tab; }
  buscarTemporadas(): void { this.paginaTemporadas.set(0); this.cargarTemporadas(); }
  buscarColecciones(): void { this.paginaColecciones.set(0); this.cargarColecciones(); }
  limpiarTemporadas(): void { this.temporadasFiltro.reset({ buscar: '', estado: 'todos' }); this.buscarTemporadas(); }
  limpiarColecciones(): void { this.coleccionesFiltro.reset({ buscar: '', temporada_id: null, estado: 'todos' }); this.buscarColecciones(); }
  tieneFiltrosTemporadas(): boolean { return !!this.temporadasFiltro.controls.buscar.value || this.temporadasFiltro.controls.estado.value !== 'todos'; }
  tieneFiltrosColecciones(): boolean { const f = this.coleccionesFiltro.getRawValue(); return !!f.buscar || f.temporada_id !== null || f.estado !== 'todos'; }
  nombreTemporada(id: number): string { return this.temporadas().find((item) => item.id === id)?.nombre ?? `Temporada #${id}`; }
  siguienteTemporadas(): void { this.paginaTemporadas.update((page) => page + 1); this.cargarTemporadas(); }
  anteriorTemporadas(): void { if (this.paginaTemporadas() > 0) { this.paginaTemporadas.update((page) => page - 1); this.cargarTemporadas(); } }
  siguienteColecciones(): void { this.paginaColecciones.update((page) => page + 1); this.cargarColecciones(); }
  anteriorColecciones(): void { if (this.paginaColecciones() > 0) { this.paginaColecciones.update((page) => page - 1); this.cargarColecciones(); } }

  verTemporada(item: TenantTemporada): void { this.cargandoDetalle.set(true); this.api.obtenerTemporada(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (detail) => { this.temporadaDetalle.set(detail); this.cargandoDetalle.set(false); }, error: (error) => this.handleError(error) }); }
  verColeccion(item: TenantColeccion): void { this.cargandoDetalle.set(true); this.api.obtenerColeccion(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (detail) => { this.coleccionDetalle.set(detail); this.cargandoDetalle.set(false); }, error: (error) => this.handleError(error) }); }
  verProductosColeccion(item: TenantColeccion): void { this.cargandoDetalle.set(true); this.productosAbiertos.set(true); this.api.listarProductosColeccion(item.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (result) => { this.productos.set(result.productos); this.productosTitulo.set(`Productos de ${item.nombre}`); this.cargandoDetalle.set(false); }, error: (error) => this.handleError(error) }); }
  cerrarDetalles(): void { this.temporadaDetalle.set(null); this.coleccionDetalle.set(null); this.productos.set([]); this.productosAbiertos.set(false); }

  private cargarTemporadas(): void { this.cargando.set(true); this.error.set(null); const f = this.temporadasFiltro.getRawValue(); this.api.listarTemporadas({ buscar: f.buscar.trim() || undefined, estado: this.estado(f.estado), limit: this.readonlyPageSize, offset: this.paginaTemporadas() * this.readonlyPageSize }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (items) => { this.temporadas.set(items); this.cargando.set(false); }, error: (error) => this.handleError(error) }); }
  private cargarColecciones(): void { this.cargando.set(true); this.error.set(null); const f = this.coleccionesFiltro.getRawValue(); this.api.listarColecciones({ buscar: f.buscar.trim() || undefined, temporada_id: f.temporada_id ?? undefined, estado: this.estado(f.estado), limit: this.readonlyPageSize, offset: this.paginaColecciones() * this.readonlyPageSize }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (items) => { this.colecciones.set(items); this.cargando.set(false); }, error: (error) => this.handleError(error) }); }
  private estado(value: EstadoFiltro): boolean | undefined { return value === 'activos' ? true : value === 'inactivos' ? false : undefined; }
  private handleError(error: { status?: number }): void { this.cargando.set(false); this.cargandoDetalle.set(false); this.error.set(error.status === 403 ? 'No tienes permiso para consultar el catálogo de la empresa.' : error.status === 404 ? 'El recurso no existe o no pertenece a esta empresa.' : error.status === 503 ? 'La consulta CU09 no está disponible temporalmente.' : 'No fue posible consultar la información tenant.'); if (error.status === 401) void this.router.navigateByUrl('/saas/login'); }
}
