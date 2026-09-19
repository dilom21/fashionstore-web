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
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  of,
} from 'rxjs';

import { ToastService } from '../../../../../core/services/toast.service';
import { ConfirmDialog } from '../../../../../shared/components/confirm-dialog/confirm-dialog';
import { AdminIcon } from '../../../components/admin-icon/admin-icon';
import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import {
  formatearFecha,
  formatearFechaHora,
} from '../../../../reservas/utils/reserva-fecha.util';
import { Sucursal } from '../../../inventario/models/sucursal.model';
import { SucursalesService } from '../../../inventario/services/sucursales.service';
import {
  EstadoReservaSucursal,
  ReservaSucursalDetalle,
  ReservaSucursalFiltros,
  ReservaSucursalResumen,
  ReservasSucursalResumen,
} from '../../models/reserva-sucursal.model';
import { ReservasSucursalService } from '../../services/reservas-sucursal.service';
import { traducirErrorReservasSucursal } from '../../utils/reservas-sucursal-error.util';

/** Tamaños de página admitidos por el backend (LIMITE_MAXIMO = 100). */
const OPCIONES_LIMITE = [20, 50, 100] as const;

/** Milisegundos de espera de la búsqueda (evita una petición por tecla). */
const DEBOUNCE_BUSCAR_MS = 350;

/** Opciones del filtro de estado (estados reales del backend). */
const ESTADOS_RESERVA: ReadonlyArray<{
  valor: EstadoReservaSucursal;
  label: string;
}> = [
  { valor: 'PENDIENTE', label: 'Pendiente' },
  { valor: 'CONFIRMADA', label: 'Confirmada' },
  { valor: 'ATENDIDA', label: 'Atendida' },
  { valor: 'CANCELADA', label: 'Cancelada' },
  { valor: 'VENCIDA', label: 'Vencida' },
];

/** Acción pendiente de confirmación. */
type AccionReserva = 'confirmar' | 'cancelar';

/**
 * CU17 - Gestionar reservas de sucursal - /admin/reservas.
 *
 * Master-detail en una sola ruta: filtros + resumen + listado a la izquierda y
 * panel de detalle a la derecha (sin navegar).
 *
 * Solo CONFIRMAR (PENDIENTE) y CANCELAR (PENDIENTE/CONFIRMADA). No atiende
 * reservas (CU18), no toca inventario y no edita prendas, cantidades, fechas ni
 * sucursal. El alcance por sucursal lo aplica el backend.
 */
@Component({
  selector: 'app-reservas-sucursal-page',
  imports: [ReactiveFormsModule, ConfirmDialog, AdminIcon],
  styleUrls: [
    './reservas-sucursal-page.css',
    './reservas-sucursal-page-tabla.css',
  ],
  templateUrl: './reservas-sucursal-page.html',
})
export class ReservasSucursalPage implements OnInit {
  private readonly reservasService = inject(ReservasSucursalService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly authService = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  /** ADMINISTRADOR: elige sucursal. ENCARGADO: tarjeta informativa. */
  readonly esAdministrador = computed(() => this.authService.esAdministrador());

  /**
   * CU18: ADMINISTRADOR y ENCARGADO_SUCURSAL pueden pasar a atender la reserva
   * (el CAJERO no accede a CU17). La autorización real la aplica el backend.
   */
  readonly puedeAtender = computed(() =>
    this.authService.puedeAtenderReservas(),
  );

  // ===== Sucursales =====
  readonly sucursales = signal<Sucursal[]>([]);
  readonly cargandoSucursales = signal(false);
  readonly sucursalAsignada = signal<string | null>(null);

  // ===== Listado =====
  readonly reservas = signal<ReservaSucursalResumen[]>([]);
  readonly total = signal(0);
  readonly limit = signal<number>(OPCIONES_LIMITE[0]);
  readonly offset = signal(0);
  readonly cargandoLista = signal(false);
  readonly errorLista = signal<string | null>(null);

  // ===== Resumen (tarjetas) =====
  readonly resumen = signal<ReservasSucursalResumen>({
    total: 0,
    pendientes: 0,
    confirmadas: 0,
    canceladas: 0,
  });
  readonly cargandoResumen = signal(false);

  // ===== Detalle (panel derecho) =====
  readonly seleccionada = signal<ReservaSucursalResumen | null>(null);
  readonly detalle = signal<ReservaSucursalDetalle | null>(null);
  readonly cargandoDetalle = signal(false);
  readonly errorDetalle = signal<string | null>(null);

  // ===== Acciones =====
  readonly confirmacion = signal<AccionReserva | null>(null);
  readonly procesando = signal<AccionReserva | null>(null);
  readonly rangoInvalido = signal(false);

  readonly opcionesLimite = OPCIONES_LIMITE;
  readonly estados = ESTADOS_RESERVA;

  readonly panelAbierto = computed(() => this.seleccionada() !== null);

  readonly filtrosForm = new FormGroup({
    sucursalId: new FormControl<number | null>(null),
    estado: new FormControl<EstadoReservaSucursal | null>(null),
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(100)],
    }),
    fechaDesde: new FormControl('', { nonNullable: true }),
    fechaHasta: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    // Los selects recargan desde la primera página.
    const controlesSelect: AbstractControl[] = [
      this.filtrosForm.controls.estado,
      this.filtrosForm.controls.sucursalId,
    ];
    for (const control of controlesSelect) {
      control.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.refrescar());
    }

    // Rango de fechas: si Desde > Hasta se avisa y NO se consulta al backend.
    for (const control of [
      this.filtrosForm.controls.fechaDesde,
      this.filtrosForm.controls.fechaHasta,
    ]) {
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

    // Búsqueda por cliente / código de reserva con debounce.
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
    this.refrescar();
  }

  // ===== Carga de datos =====

  /** Recarga listado y tarjetas cuando cambian los filtros. */
  refrescar(): void {
    if (this.rangoInvalido()) {
      this.errorLista.set(
        'La fecha inicial no puede ser posterior a la fecha final.',
      );
      this.reservas.set([]);
      this.total.set(0);
      return;
    }
    this.errorLista.set(null);
    this.cargarLista(0);
    this.cargarResumen();
  }

  cargarLista(offset: number): void {
    if (this.rangoInvalido()) {
      return;
    }
    this.cargandoLista.set(true);
    this.errorLista.set(null);
    this.reservasService
      .listarReservas({
        ...this.filtrosSeleccionados(),
        limit: this.limit(),
        offset,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.cargandoLista.set(false);
          this.reservas.set(respuesta.items ?? []);
          this.total.set(respuesta.total ?? 0);
          this.limit.set(respuesta.limit ?? this.limit());
          this.offset.set(respuesta.offset ?? offset);
          this.sincronizarSeleccion();
        },
        error: (error: unknown) => {
          this.cargandoLista.set(false);
          this.reservas.set([]);
          this.total.set(0);
          this.manejarError(error);
        },
      });
  }

  /**
   * Cuenta con el `total` real del backend (limit=1 por estado). Nunca se
   * presentan como globales los números de una sola página.
   */
  private cargarResumen(): void {
    const base = this.filtrosBase();
    this.cargandoResumen.set(true);

    forkJoin({
      total: this.contar(base),
      pendientes: this.contar(base, 'PENDIENTE'),
      confirmadas: this.contar(base, 'CONFIRMADA'),
      canceladas: this.contar(base, 'CANCELADA'),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((valores) => {
        this.cargandoResumen.set(false);
        const previo = this.resumen();
        this.resumen.set({
          total: valores.total ?? previo.total,
          pendientes: valores.pendientes ?? previo.pendientes,
          confirmadas: valores.confirmadas ?? previo.confirmadas,
          canceladas: valores.canceladas ?? previo.canceladas,
        });
      });
  }

  private contar(base: ReservaSucursalFiltros, estado?: EstadoReservaSucursal) {
    return this.reservasService
      .contarReservas(estado ? { ...base, estado } : base)
      .pipe(catchError(() => of(null)));
  }

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

  /**
   * Nombre de la sucursal del encargado desde la sesión (si existe) y, si no,
   * desde el propio listado. No se inventa alcance: el backend es la autoridad.
   */
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
          // Se completará con el listado de reservas.
        },
      });
  }

  private cargarDetalle(reservaId: number): void {
    this.cargandoDetalle.set(true);
    this.errorDetalle.set(null);
    this.reservasService
      .obtenerReserva(reservaId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.cargandoDetalle.set(false);
          this.detalle.set(detalle);
          this.completarSucursalDesdeDetalle(detalle);
        },
        error: (error: unknown) => {
          this.cargandoDetalle.set(false);
          this.detalle.set(null);
          this.manejarError(error, true);
        },
      });
  }

  /** Si el encargado no conocía su sucursal, se toma del dato real devuelto. */
  private completarSucursalDesdeDetalle(detalle: ReservaSucursalDetalle): void {
    if (this.esAdministrador() || this.sucursalAsignada() !== null) {
      return;
    }
    if (detalle.sucursal_nombre) {
      this.sucursalAsignada.set(detalle.sucursal_nombre);
    }
  }

  // ===== Filtros =====

  /** Filtros comunes: sin estado ni paginación. */
  private filtrosBase(): ReservaSucursalFiltros {
    const valores = this.filtrosForm.getRawValue();
    const buscar = valores.buscar.trim();
    return {
      // El encargado nunca envía sucursal: el backend aplica su alcance.
      sucursal_id: this.esAdministrador()
        ? (valores.sucursalId ?? undefined)
        : undefined,
      buscar: buscar.length > 0 ? buscar : undefined,
      fecha_desde: valores.fechaDesde || undefined,
      fecha_hasta: valores.fechaHasta || undefined,
    };
  }

  private filtrosSeleccionados(): ReservaSucursalFiltros {
    const valores = this.filtrosForm.getRawValue();
    return { ...this.filtrosBase(), estado: valores.estado ?? undefined };
  }

  private calcularRangoInvalido(): boolean {
    const { fechaDesde, fechaHasta } = this.filtrosForm.getRawValue();
    if (fechaDesde.length === 0 || fechaHasta.length === 0) {
      return false;
    }
    return fechaDesde > fechaHasta;
  }

  limpiarFiltros(): void {
    this.filtrosForm.reset(
      {
        sucursalId: null,
        estado: null,
        buscar: '',
        fechaDesde: '',
        fechaHasta: '',
      },
      { emitEvent: false },
    );
    this.rangoInvalido.set(false);
    this.cerrarDetalle();
    this.refrescar();
  }

  hayFiltros(): boolean {
    const valores = this.filtrosForm.getRawValue();
    return (
      valores.sucursalId !== null ||
      valores.estado !== null ||
      valores.buscar.trim().length > 0 ||
      valores.fechaDesde.length > 0 ||
      valores.fechaHasta.length > 0
    );
  }

  // ===== Selección (master-detail, sin navegar) =====

  seleccionar(reserva: ReservaSucursalResumen): void {
    if (this.seleccionada()?.reserva_id === reserva.reserva_id) {
      return;
    }
    this.seleccionada.set(reserva);
    this.detalle.set(null);
    this.errorDetalle.set(null);
    this.cargarDetalle(reserva.reserva_id);
  }

  cerrarDetalle(): void {
    this.seleccionada.set(null);
    this.detalle.set(null);
    this.errorDetalle.set(null);
  }

  esFilaSeleccionada(reservaId: number): boolean {
    return this.seleccionada()?.reserva_id === reservaId;
  }

  private sincronizarSeleccion(): void {
    const seleccion = this.seleccionada();
    if (seleccion === null) {
      return;
    }
    const sigueVisible = this.reservas().some(
      (reserva) => reserva.reserva_id === seleccion.reserva_id,
    );
    if (!sigueVisible) {
      this.cerrarDetalle();
    }
  }

  // ===== Acciones por estado =====

  puedeConfirmar(estado: string): boolean {
    return this.reservasService.esConfirmable(estado);
  }

  puedeCancelar(estado: string): boolean {
    return this.reservasService.esCancelable(estado);
  }

  /**
   * CU18: abre la atención de la reserva (misma reserva, otro módulo).
   * La autorización real la aplica el backend de CU18 (403 si no corresponde).
   */
  atenderReserva(): void {
    const reserva = this.seleccionada();
    if (reserva === null) {
      return;
    }
    void this.router.navigate([
      '/personal/reservas/atencion',
      reserva.reserva_id,
    ]);
  }

  solicitarConfirmar(): void {
    if (this.procesando() !== null) {
      return;
    }
    this.confirmacion.set('confirmar');
  }

  solicitarCancelar(): void {
    if (this.procesando() !== null) {
      return;
    }
    this.confirmacion.set('cancelar');
  }

  cancelarConfirmacion(): void {
    this.confirmacion.set(null);
  }

  confirmarAccion(): void {
    const accion = this.confirmacion();
    this.confirmacion.set(null);
    const reserva = this.seleccionada();
    if (accion === null || reserva === null || this.procesando() !== null) {
      return;
    }

    this.procesando.set(accion);
    const peticion =
      accion === 'confirmar'
        ? this.reservasService.confirmarReserva(reserva.reserva_id)
        : this.reservasService.cancelarReserva(reserva.reserva_id, null);

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (detalle) => {
        this.procesando.set(null);
        this.aplicarDetalle(detalle);
        this.toast.mostrar(
          accion === 'confirmar'
            ? 'Reserva confirmada.'
            : 'Reserva cancelada.',
          'ok',
        );
        // Solo se refresca la información afectada, sin recargar la app.
        this.cargarLista(this.offset());
        this.cargarResumen();
      },
      error: (error: unknown) => {
        this.procesando.set(null);
        const traducido = traducirErrorReservasSucursal(error);
        if (traducido.sesionExpirada) {
          this.cerrarSesion();
          return;
        }
        this.toast.mostrar(traducido.mensaje, 'error');
        // El estado real puede haber cambiado: se vuelve a consultar.
        this.cargarLista(this.offset());
      },
    });
  }

  /** Detalle + fila + selección coherentes con la respuesta del backend. */
  private aplicarDetalle(detalle: ReservaSucursalDetalle): void {
    this.detalle.set(detalle);
    this.reservas.update((items) =>
      items.map((item) =>
        item.reserva_id === detalle.reserva_id
          ? {
              ...item,
              estado: detalle.estado,
              observacion: detalle.observacion,
              cantidad_lineas: detalle.items.length,
              cantidad_unidades: detalle.cantidad_total_unidades,
            }
          : item,
      ),
    );
    const seleccion = this.seleccionada();
    if (seleccion !== null && seleccion.reserva_id === detalle.reserva_id) {
      this.seleccionada.set({ ...seleccion, estado: detalle.estado });
    }
  }

  // ===== Paginación =====

  irAnterior(): void {
    if (!this.hayAnterior()) {
      return;
    }
    this.cerrarDetalle();
    this.cargarLista(Math.max(0, this.offset() - this.limit()));
  }

  irSiguiente(): void {
    if (!this.haySiguiente()) {
      return;
    }
    this.cerrarDetalle();
    this.cargarLista(this.offset() + this.limit());
  }

  cambiarLimite(evento: Event): void {
    const valor = Number((evento.target as HTMLSelectElement).value);
    if (!OPCIONES_LIMITE.includes(valor as (typeof OPCIONES_LIMITE)[number])) {
      return;
    }
    this.limit.set(valor);
    this.cerrarDetalle();
    this.cargarLista(0);
  }

  hayAnterior(): boolean {
    return !this.cargandoLista() && this.offset() > 0;
  }

  haySiguiente(): boolean {
    return (
      !this.cargandoLista() &&
      this.total() > this.offset() + this.reservas().length
    );
  }

  inicioVisible(): number {
    return this.total() === 0 ? 0 : this.offset() + 1;
  }

  finVisible(): number {
    if (this.total() === 0) {
      return 0;
    }
    return Math.min(this.total(), this.offset() + this.reservas().length);
  }

  paginaActual(): number {
    return this.limit() > 0 ? Math.floor(this.offset() / this.limit()) + 1 : 1;
  }

  totalPaginas(): number {
    return this.limit() > 0 ? Math.ceil(this.total() / this.limit()) : 0;
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

  reintentarLista(): void {
    this.cargarLista(this.offset());
  }

  reintentarDetalle(): void {
    const seleccion = this.seleccionada();
    if (seleccion !== null) {
      this.cargarDetalle(seleccion.reserva_id);
    }
  }

  private manejarError(error: unknown, esDetalle = false): void {
    const traducido = traducirErrorReservasSucursal(error);
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    if (esDetalle) {
      this.errorDetalle.set(traducido.mensaje);
      return;
    }
    this.errorLista.set(traducido.mensaje);
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigateByUrl('/auth/personal/login');
  }
}
