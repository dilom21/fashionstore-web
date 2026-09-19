import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { ToastService } from '../../../../core/services/toast.service';
import { AdminIcon } from '../../../administracion/components/admin-icon/admin-icon';
import { Sucursal } from '../../../administracion/inventario/models/sucursal.model';
import { SucursalesService } from '../../../administracion/inventario/services/sucursales.service';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import {
  formatearFecha,
  formatearFechaHora,
} from '../../../reservas/utils/reserva-fecha.util';
import {
  AtencionReservaFiltros,
  AtencionReservaResumen,
} from '../../models/atencion-reserva.model';
import { AtencionReservasService } from '../../services/atencion-reservas.service';
import { traducirErrorAtencionReserva } from '../../utils/atencion-reserva-error.util';

/** Tamaños de página admitidos por el backend (LIMITE_MAXIMO = 100). */
const OPCIONES_LIMITE = [20, 50, 100] as const;

/** Milisegundos de espera de la búsqueda (evita una petición por tecla). */
const DEBOUNCE_BUSCAR_MS = 350;

/**
 * CU18 - Reservas por atender (/personal/reservas/atencion).
 *
 * Listado operativo: el backend devuelve solo reservas CONFIRMADA de la
 * sucursal del empleado autenticado, por lo que NO existe selector de sucursal.
 * La acción "Atender" navega al detalle de CU18 con el reserva_id.
 */
@Component({
  selector: 'app-reservas-por-atender-page',
  imports: [ReactiveFormsModule, AdminIcon],
  styleUrl: './reservas-por-atender-page.css',
  templateUrl: './reservas-por-atender-page.html',
})
export class ReservasPorAtenderPage implements OnInit {
  private readonly atencionService = inject(AtencionReservasService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * ADMINISTRADOR: elige sucursal (y puede ver todas). ENCARGADO_SUCURSAL y
   * CAJERO: solo su sucursal, sin selector editable.
   */
  readonly esAdministrador = computed(() => this.authService.esAdministrador());

  readonly sucursales = signal<Sucursal[]>([]);
  readonly cargandoSucursales = signal(false);
  readonly sucursalAsignada = signal<string | null>(null);

  readonly reservas = signal<AtencionReservaResumen[]>([]);
  readonly total = signal(0);
  readonly limit = signal<number>(OPCIONES_LIMITE[0]);
  readonly offset = signal(0);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly rangoInvalido = signal(false);

  readonly opcionesLimite = OPCIONES_LIMITE;

  readonly filtrosForm = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(100)],
    }),
    sucursalId: new FormControl<number | null>(null),
    fechaDesde: new FormControl('', { nonNullable: true }),
    fechaHasta: new FormControl('', { nonNullable: true }),
  });

  readonly hayResultados = computed(() => this.reservas().length > 0);

  constructor() {
    // Selector de sucursal (solo ADMINISTRADOR): recarga desde la página 1.
    this.filtrosForm.controls.sucursalId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refrescar());

    for (const control of this.controlesFecha()) {
      control.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          const invalido = this.calcularRangoInvalido();
          this.rangoInvalido.set(invalido);
          if (!invalido) {
            this.refrescar();
          }
        });
    }

    this.filtrosForm.controls.buscar.valueChanges
      .pipe(
        debounceTime(DEBOUNCE_BUSCAR_MS),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.refrescar());
  }

  ngOnInit(): void {
    if (this.esAdministrador()) {
      this.cargarSucursales();
    } else {
      this.resolverSucursalAsignada();
    }
    this.cargar(0);
  }

  private readonly authService = inject(AuthService);

  // ===== Carga =====

  /** Recarga desde la primera página cuando cambian los filtros. */
  refrescar(): void {
    if (this.rangoInvalido()) {
      this.error.set(
        'La fecha inicial no puede ser posterior a la fecha final.',
      );
      this.reservas.set([]);
      this.total.set(0);
      return;
    }
    this.error.set(null);
    this.cargar(0);
  }

  cargar(offset: number): void {
    if (this.rangoInvalido()) {
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    this.atencionService
      .listarReservas({ ...this.filtros(), limit: this.limit(), offset })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.cargando.set(false);
          this.reservas.set(respuesta.items ?? []);
          this.total.set(respuesta.total ?? 0);
          this.limit.set(respuesta.limit ?? this.limit());
          this.offset.set(respuesta.offset ?? offset);
          this.completarSucursalDesdeListado();
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.reservas.set([]);
          this.total.set(0);
          this.manejarError(error);
        },
      });
  }

  // ===== Sucursales =====

  /** GET /sucursales (las mismas sucursales activas que usa CU17). */
  private cargarSucursales(): void {
    this.cargandoSucursales.set(true);
    this.sucursalesService
      .listarSucursalesActivas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursales) => {
          this.cargandoSucursales.set(false);
          this.sucursales.set(sucursales ?? []);
        },
        error: () => {
          this.cargandoSucursales.set(false);
          this.sucursales.set([]);
        },
      });
  }

  /** Nombre de la sucursal del empleado (solo informativo, sin selector). */
  private resolverSucursalAsignada(): void {
    const sucursalId = this.authService.sucursalId();
    if (sucursalId === null) {
      return;
    }
    this.sucursalesService
      .obtenerSucursal(sucursalId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursal) => this.sucursalAsignada.set(sucursal.nombre),
        error: () => {
          // Se completará con el nombre real que devuelve el listado.
        },
      });
  }

  /** Fallback: si la sesión no traía sucursal, se toma del propio listado. */
  private completarSucursalDesdeListado(): void {
    if (this.esAdministrador() || this.sucursalAsignada() !== null) {
      return;
    }
    const nombre = this.reservas()[0]?.sucursal_nombre;
    if (nombre) {
      this.sucursalAsignada.set(nombre);
    }
  }

  // ===== Filtros =====

  private controlesFecha(): AbstractControl[] {
    return [
      this.filtrosForm.controls.fechaDesde,
      this.filtrosForm.controls.fechaHasta,
    ];
  }

  private calcularRangoInvalido(): boolean {
    const { fechaDesde, fechaHasta } = this.filtrosForm.getRawValue();
    if (fechaDesde.length === 0 || fechaHasta.length === 0) {
      return false;
    }
    return fechaDesde > fechaHasta;
  }

  /** Filtros reales de CU18: el admin puede elegir sucursal; el resto no. */
  private filtros(): AtencionReservaFiltros {
    const valores = this.filtrosForm.getRawValue();
    const buscar = valores.buscar.trim();
    return {
      buscar: buscar.length > 0 ? buscar : undefined,
      sucursal_id: this.esAdministrador()
        ? (valores.sucursalId ?? undefined)
        : undefined,
      fecha_desde: valores.fechaDesde || undefined,
      fecha_hasta: valores.fechaHasta || undefined,
    };
  }

  limpiarFiltros(): void {
    this.filtrosForm.reset(
      { buscar: '', sucursalId: null, fechaDesde: '', fechaHasta: '' },
      { emitEvent: false },
    );
    this.rangoInvalido.set(false);
    this.refrescar();
  }

  hayFiltros(): boolean {
    const valores = this.filtrosForm.getRawValue();
    return (
      valores.buscar.trim().length > 0 ||
      valores.fechaDesde.length > 0 ||
      valores.fechaHasta.length > 0
    );
  }

  // ===== Paginación =====

  irAnterior(): void {
    if (!this.hayAnterior()) {
      return;
    }
    this.cargar(Math.max(0, this.offset() - this.limit()));
  }

  irSiguiente(): void {
    if (!this.haySiguiente()) {
      return;
    }
    this.cargar(this.offset() + this.limit());
  }

  cambiarLimite(evento: Event): void {
    const valor = Number((evento.target as HTMLSelectElement).value);
    if (!OPCIONES_LIMITE.includes(valor as (typeof OPCIONES_LIMITE)[number])) {
      return;
    }
    this.limit.set(valor);
    this.cargar(0);
  }

  hayAnterior(): boolean {
    return !this.cargando() && this.offset() > 0;
  }

  haySiguiente(): boolean {
    return (
      !this.cargando() &&
      this.total() > this.offset() + this.reservas().length
    );
  }

  inicioVisible(): number {
    return this.total() === 0 ? 0 : this.offset() + 1;
  }

  finVisible(): number {
    return this.total() === 0
      ? 0
      : Math.min(this.total(), this.offset() + this.reservas().length);
  }

  paginaActual(): number {
    return this.limit() > 0 ? Math.floor(this.offset() / this.limit()) + 1 : 1;
  }

  totalPaginas(): number {
    return this.limit() > 0 ? Math.ceil(this.total() / this.limit()) : 0;
  }

  // ===== Acción principal =====

  /** Abre el detalle operativo de CU18 (misma área, sin elegir sucursal). */
  atender(reserva: AtencionReservaResumen): void {
    void this.router.navigate([
      '/personal/reservas/atencion',
      reserva.reserva_id,
    ]);
  }

  // ===== Presentación =====

  /** Código solo de presentación: la identidad real es `reserva_id`. */
  codigoReserva(reservaId: number): string {
    return `RES-${String(reservaId).padStart(5, '0')}`;
  }

  nombreCliente(reserva: {
    cliente_nombre: string;
    cliente_apellido: string;
  }): string {
    return `${reserva.cliente_nombre ?? ''} ${
      reserva.cliente_apellido ?? ''
    }`.trim();
  }

  fechaReserva(iso: string): string {
    return formatearFecha(iso);
  }

  fechaAtencion(iso: string): string {
    return formatearFechaHora(iso);
  }

  claseEstado(estado: string): string {
    return (estado ?? '').trim().toLowerCase() || 'desconocido';
  }

  reintentar(): void {
    this.cargar(this.offset());
  }

  private manejarError(error: unknown): void {
    const traducido = traducirErrorAtencionReserva(error);
    if (traducido.sesionExpirada) {
      this.toast.mostrar(traducido.mensaje, 'error');
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.error.set(traducido.mensaje);
  }
}
