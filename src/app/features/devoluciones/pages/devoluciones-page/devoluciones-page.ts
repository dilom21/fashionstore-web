import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';

import { AdminIcon } from '../../../administracion/components/admin-icon/admin-icon';
import { SucursalesService } from '../../../administracion/inventario/services/sucursales.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { codigoVenta } from '../../../ventas/models/comprobante-venta.model';
import { formatearFecha } from '../../../ventas/models/historial-compras.model';
import { DevolucionEstadoBadge } from '../../components/devolucion-estado-badge/devolucion-estado-badge';
import {
  DevolucionResumen,
  DevolucionesListaResponse,
  ESTADOS_DEVOLUCION,
  EstadoDevolucion,
  TAMANO_PAGINA_DEVOLUCIONES,
  codigoDevolucion,
} from '../../models/devolucion.model';
import { DevolucionService } from '../../services/devolucion.service';
import {
  ErrorDevolucion,
  traducirErrorListadoDevoluciones,
} from '../../utils/devolucion-error.util';

/** Sucursal usada por el filtro (solo ADMINISTRADOR). */
interface OpcionSucursal {
  id: number;
  nombre: string;
}

/**
 * CU25 - Listado de devoluciones (/personal/devoluciones).
 *
 * Pantalla de entrada del caso de uso: consulta `GET /devoluciones` con los
 * filtros reales (estado, sucursal —solo ADMINISTRADOR—, rango de fechas y
 * página) y abre el registro o el detalle de cada devolución.
 *
 * Solo consulta: aprobar/rechazar/procesar viven en el detalle. El orden y la
 * paginación los resuelve el backend.
 */
@Component({
  selector: 'app-devoluciones-page',
  imports: [AdminIcon, RouterLink, DevolucionEstadoBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: [
    './devoluciones-page.css',
    '../../styles/devoluciones-shared.css',
  ],
  templateUrl: './devoluciones-page.html',
})
export class DevolucionesPage implements OnInit {
  private readonly devolucionService = inject(DevolucionService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly estados = ESTADOS_DEVOLUCION;

  readonly estado = signal<EstadoDevolucion | null>(null);
  readonly sucursalId = signal<number | null>(null);
  readonly fechaDesde = signal<string | null>(null);
  readonly fechaHasta = signal<string | null>(null);

  readonly devoluciones = signal<DevolucionResumen[]>([]);
  readonly pagina = signal(1);
  readonly tamanoPagina = signal(TAMANO_PAGINA_DEVOLUCIONES);
  readonly totalRegistros = signal(0);
  readonly totalPaginas = signal(0);

  readonly cargando = signal(true);
  readonly error = signal<ErrorDevolucion | null>(null);
  readonly errorFiltros = signal<string | null>(null);
  readonly sucursales = signal<OpcionSucursal[]>([]);
  readonly cargandoSucursales = signal(false);

  /** El selector de sucursal es solo para ADMINISTRADOR (el backend lo exige). */
  readonly esAdministrador = computed(() => this.authService.esAdministrador());

  readonly hayFiltros = computed(
    () =>
      this.estado() !== null ||
      this.sucursalId() !== null ||
      this.fechaDesde() !== null ||
      this.fechaHasta() !== null,
  );
  readonly sinResultados = computed(
    () => !this.cargando() && this.error() === null && this.devoluciones().length === 0,
  );
  readonly listaVacia = computed(() => this.sinResultados() && !this.hayFiltros());
  readonly puedeAnterior = computed(() => this.pagina() > 1 && !this.cargando());
  readonly puedeSiguiente = computed(
    () =>
      this.totalPaginas() > 0 &&
      this.pagina() < this.totalPaginas() &&
      !this.cargando(),
  );

  readonly codigoDevolucion = codigoDevolucion;
  readonly codigoVenta = codigoVenta;
  readonly formatearFecha = formatearFecha;

  ngOnInit(): void {
    this.cargarDevoluciones();
    if (this.esAdministrador()) {
      this.cargarSucursales();
    }
  }

  /** Consulta el listado con los filtros y la página actuales. */
  cargarDevoluciones(): void {
    const desde = this.fechaDesde();
    const hasta = this.fechaHasta();

    if (desde !== null && hasta !== null && desde > hasta) {
      this.errorFiltros.set(
        'La fecha desde no puede ser posterior a la fecha hasta.',
      );
      return;
    }

    this.errorFiltros.set(null);
    this.cargando.set(true);
    this.error.set(null);

    this.devolucionService
      .listarDevoluciones({
        estado: this.estado(),
        sucursal_id: this.esAdministrador() ? this.sucursalId() : null,
        fecha_desde: desde,
        fecha_hasta: hasta,
        pagina: this.pagina(),
        tamano_pagina: this.tamanoPagina(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta: DevolucionesListaResponse) => {
          this.devoluciones.set(respuesta.items);
          this.pagina.set(respuesta.pagina);
          this.tamanoPagina.set(respuesta.tamano_pagina);
          this.totalRegistros.set(respuesta.total_registros);
          this.totalPaginas.set(respuesta.total_paginas);
          this.cargando.set(false);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          const traducido = traducirErrorListadoDevoluciones(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.devoluciones.set([]);
          this.totalRegistros.set(0);
          this.totalPaginas.set(0);
          this.error.set(traducido);
        },
      });
  }

  /** Sucursales reales para el filtro del administrador. */
  private cargarSucursales(): void {
    this.cargandoSucursales.set(true);
    this.sucursalesService
      .listarSucursalesActivas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursales) => {
          this.sucursales.set(
            sucursales.map((sucursal) => ({
              id: sucursal.id,
              nombre: sucursal.nombre,
            })),
          );
          this.cargandoSucursales.set(false);
        },
        error: () => {
          this.cargandoSucursales.set(false);
        },
      });
  }

  // ===== Filtros =====

  cambiarEstado(valor: string): void {
    this.estado.set((valor || null) as EstadoDevolucion | null);
  }

  cambiarSucursal(valor: string): void {
    const id = Number(valor);
    this.sucursalId.set(valor === '' || !Number.isInteger(id) ? null : id);
  }

  cambiarFechaDesde(valor: string): void {
    this.fechaDesde.set(valor || null);
  }

  cambiarFechaHasta(valor: string): void {
    this.fechaHasta.set(valor || null);
  }

  aplicarFiltros(): void {
    if (this.cargando()) {
      return;
    }
    this.pagina.set(1);
    this.cargarDevoluciones();
  }

  limpiarFiltros(): void {
    this.estado.set(null);
    this.sucursalId.set(null);
    this.fechaDesde.set(null);
    this.fechaHasta.set(null);
    this.errorFiltros.set(null);
    this.pagina.set(1);
    this.cargarDevoluciones();
  }

  // ===== Paginación (metadatos reales) =====

  irAPagina(pagina: number): void {
    if (this.cargando() || pagina < 1 || pagina === this.pagina()) {
      return;
    }
    if (this.totalPaginas() > 0 && pagina > this.totalPaginas()) {
      return;
    }
    this.pagina.set(pagina);
    this.cargarDevoluciones();
  }

  paginaAnterior(): void {
    this.irAPagina(this.pagina() - 1);
  }

  paginaSiguiente(): void {
    this.irAPagina(this.pagina() + 1);
  }

  reintentar(): void {
    this.cargarDevoluciones();
  }

  /** Sesión expirada: mecanismo existente del área de personal. */
  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigate(['/auth/personal/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
