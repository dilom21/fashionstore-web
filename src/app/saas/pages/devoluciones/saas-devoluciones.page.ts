import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ReactiveFormsModule,
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';

import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import {
  DevolucionCreada,
  DevolucionDetalle,
  DevolucionProcesada,
  DevolucionResumen,
  EstadoDevolucion,
  ReembolsoProcesado,
  ReembolsoTenant,
  TenantErrorNormalizado,
  VentaLineasTenant,
} from '../../models/tenant.models';
import { SaasDevolucionesService } from '../../services/saas-devoluciones.service';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasSessionService } from '../../services/saas-session.service';
import { formatearBolivianos, formatearMonto } from '../../utils/monto.util';
import { formatearFechaHora } from '../../utils/fecha.util';
import {
  generarOperacionId,
  siguienteOperacionId,
} from '../../utils/operacion-id.util';
import {
  CampoItemDevolucion,
  LineaDevolucionEntrada,
  MAX_LINEAS_DEVOLUCION,
  MAX_MOTIVO_DEVOLUCION,
  MAX_OBSERVACION_DEVOLUCION,
  construirDevolucion,
  validarItemsDevolucion,
} from './crear-devolucion.util';

/** Tamaño de página del listado (backend: 1..200, default 50). */
const LIMITE_DEVOLUCIONES = 50;

/** Roles que el backend autoriza para operar devoluciones. */
const ROLES_OPERACION = new Set(['ADMINISTRADOR', 'ENCARGADO_SUCURSAL']);

/** Medio que el backend usa cuando no puede ejecutar el reembolso. */
const MEDIO_NO_DISPONIBLE = 'NO_DISPONIBLE';

/** Opciones del filtro de estado (los 4 valores del backend). */
export const ESTADOS_DEVOLUCION: ReadonlyArray<{
  valor: EstadoDevolucion;
  etiqueta: string;
}> = [
  { valor: 'SOLICITADA', etiqueta: 'Solicitada' },
  { valor: 'APROBADA', etiqueta: 'Aprobada' },
  { valor: 'RECHAZADA', etiqueta: 'Rechazada' },
  { valor: 'COMPLETADA', etiqueta: 'Completada' },
];

/** Confirmación pendiente de aprobar o rechazar. */
type TipoConfirmacion = 'aprobar' | 'rechazar';

interface ConfirmacionDevolucion {
  tipo: TipoConfirmacion;
  devolucion: DevolucionResumen;
}

/** Clasificación del error de una operación para explicar la causa. */
type TipoErrorOperacion =
  | 'permiso'
  | 'deshabilitado'
  | 'conflicto'
  | 'validacion'
  | 'no-existe'
  | 'otro';

/** Grupo tipado de un ítem de la devolución. */
type ItemDevolucionForm = FormGroup<{
  detalle_venta_id: FormControl<number>;
  cantidad: FormControl<number | null>;
  reponer: FormControl<boolean>;
  motivo: FormControl<string>;
}>;

/**
 * Devoluciones de venta (`/tenant/devoluciones`).
 *
 * Contrato real:
 * - ADMINISTRADOR y ENCARGADO_SUCURSAL.
 * - Alta: se indica el número de venta, se cargan sus líneas con
 *   `GET /tenant/devoluciones/ventas/{venta_id}/lineas` y se envían
 *   `detalle_venta_id` reales con `operacion_id` (UUID de idempotencia).
 * - `SOLICITADA` → aprobar o rechazar (sin cuerpo).
 * - `APROBADA` → procesar con `operacion_id`.
 * - `COMPLETADA`/`RECHAZADA` → solo lectura.
 *
 * Sigue sin existir edición/borrado de una devolución. Los reembolsos son
 * informativos: esta pantalla NO ejecuta pagos ni devoluciones financieras.
 */
@Component({
  selector: 'app-saas-devoluciones-page',
  imports: [ReactiveFormsModule, AdminIcon],
  styleUrl: './saas-devoluciones.page.css',
  templateUrl: './saas-devoluciones.page.html',
})
export class SaasDevolucionesPage {
  private readonly devolucionesService = inject(SaasDevolucionesService);
  private readonly sesion = inject(SaasSessionService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly estados = ESTADOS_DEVOLUCION;
  readonly limite = LIMITE_DEVOLUCIONES;

  /** `true` si el rol puede operar; el backend vuelve a autorizar siempre. */
  readonly puedeOperar = computed(() =>
    ROLES_OPERACION.has((this.sesion.rol() ?? '').trim().toUpperCase()),
  );

  // =============================== Listado ===============================

  readonly devoluciones = signal<DevolucionResumen[]>([]);
  readonly cargando = signal(true);
  readonly errorListado = signal<string | null>(null);
  readonly sinPermiso = signal(false);

  readonly filtroEstado = signal<EstadoDevolucion | null>(null);

  /** Número de página (0-based); `offset = pagina * limite`. */
  readonly pagina = signal(0);
  readonly offset = computed(() => this.pagina() * LIMITE_DEVOLUCIONES);

  readonly hayPaginaSiguiente = computed(
    () => this.devoluciones().length === LIMITE_DEVOLUCIONES,
  );

  readonly textoRango = computed(() => {
    const total = this.devoluciones().length;
    if (total === 0) {
      return 'Sin resultados en esta página';
    }
    const desde = this.offset() + 1;
    return `Mostrando ${desde}–${this.offset() + total} · página ${this.pagina() + 1}`;
  });

  // =============================== Detalle ===============================

  readonly devolucionSeleccionada = signal<DevolucionResumen | null>(null);
  readonly detalle = signal<DevolucionDetalle | null>(null);
  readonly cargandoDetalle = signal(false);
  readonly errorDetalle = signal<string | null>(null);

  // =============================== Acciones ==============================

  readonly confirmacion = signal<ConfirmacionDevolucion | null>(null);
  readonly confirmando = signal(false);
  readonly errorConfirmacion = signal<TenantErrorNormalizado | null>(null);

  readonly operacionProceso = signal(generarOperacionId());
  readonly procesando = signal(false);
  readonly errorProceso = signal<TenantErrorNormalizado | null>(null);
  readonly resultadoProceso = signal<DevolucionProcesada | null>(null);

  readonly mensajeExito = signal<string | null>(null);

  // ======================== Alta de devolución ===========================

  readonly maxLineasDevolucion = MAX_LINEAS_DEVOLUCION;
  readonly maxMotivo = MAX_MOTIVO_DEVOLUCION;
  readonly maxObservacionDevolucion = MAX_OBSERVACION_DEVOLUCION;

  readonly altaAbierta = signal(false);
  readonly ventaCargada = signal<number | null>(null);
  readonly lineasVenta = signal<VentaLineasTenant | null>(null);
  readonly cargandoLineas = signal(false);
  readonly errorLineas = signal<TenantErrorNormalizado | null>(null);
  readonly numeroItems = signal(0);

  readonly creando = signal(false);
  readonly errorCreacion = signal<TenantErrorNormalizado | null>(null);
  readonly resultadoCreacion = signal<DevolucionCreada | null>(null);
  readonly mensajeValidacionDevolucion = signal<string | null>(null);
  readonly erroresItems = signal<
    Record<string, Partial<Record<CampoItemDevolucion, string>>>
  >({});

  /** UUID de idempotencia: se conserva ante error y rota tras un éxito. */
  readonly operacionDevolucion = signal(generarOperacionId());

  readonly formDevolucion = new FormGroup({
    venta_id: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    motivo: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.maxLength(MAX_MOTIVO_DEVOLUCION),
      ],
    }),
    observacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_OBSERVACION_DEVOLUCION)],
    }),
    items: new FormArray<ItemDevolucionForm>([]),
  });

  private readonly ventaInput =
    viewChild<ElementRef<HTMLInputElement>>('ventaInput');
  private readonly motivoDevolucionInput =
    viewChild<ElementRef<HTMLInputElement>>('motivoDevolucionInput');
  private readonly observacionDevolucionInput =
    viewChild<ElementRef<HTMLTextAreaElement>>('observacionDevolucionInput');
  private readonly cantidadItemInputs =
    viewChildren<ElementRef<HTMLInputElement>>('devolucionCantidadInput');
  private readonly motivoItemInputs =
    viewChildren<ElementRef<HTMLInputElement>>('devolucionMotivoItemInput');

  readonly tipoErrorLineas = computed<TipoErrorOperacion | null>(() =>
    clasificarError(this.errorLineas()),
  );

  readonly tipoErrorCreacion = computed<TipoErrorOperacion | null>(() =>
    clasificarError(this.errorCreacion()),
  );

  constructor() {
    // Si cambia la venta indicada, las líneas cargadas dejan de ser válidas.
    this.formDevolucion.controls.venta_id.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((valor) => {
        if (valor !== this.ventaCargada()) {
          this.limpiarLineasVenta();
        }
      });
    this.cargar();
  }

  /** Líneas del formulario de alta para la plantilla. */
  get itemsDevolucion(): FormArray<ItemDevolucionForm> {
    return this.formDevolucion.controls.items;
  }

  // =============================== Carga ================================

  recargar(): void {
    if (this.cargando()) {
      return;
    }
    this.cargar();
  }

  recargarDetalle(): void {
    const devolucion = this.devolucionSeleccionada();
    if (devolucion === null || this.cargandoDetalle()) {
      return;
    }
    this.cargarDetalle(devolucion.id);
  }

  paginaSiguiente(): void {
    if (!this.hayPaginaSiguiente() || this.cargando()) {
      return;
    }
    this.pagina.update((valor) => valor + 1);
    this.cargar();
  }

  paginaAnterior(): void {
    if (this.pagina() === 0 || this.cargando()) {
      return;
    }
    this.pagina.update((valor) => valor - 1);
    this.cargar();
  }

  cambiarFiltro(evento: Event): void {
    const objetivo = evento.target;
    if (!(objetivo instanceof HTMLSelectElement)) {
      return;
    }
    const valor = objetivo.value;
    const estado = ESTADOS_DEVOLUCION.some((opcion) => opcion.valor === valor)
      ? (valor as EstadoDevolucion)
      : null;

    this.filtroEstado.set(estado);
    this.pagina.set(0);
    this.cargar();
  }

  // =============================== Detalle ==============================

  verDetalle(devolucion: DevolucionResumen): void {
    if (this.cargandoDetalle()) {
      return;
    }
    this.devolucionSeleccionada.set(devolucion);
    this.detalle.set(null);
    this.errorDetalle.set(null);
    this.errorProceso.set(null);
    this.mensajeExito.set(null);
    this.cargarDetalle(devolucion.id);
  }

  cerrarDetalle(): void {
    if (this.confirmando() || this.procesando()) {
      return;
    }
    this.devolucionSeleccionada.set(null);
    this.detalle.set(null);
    this.errorDetalle.set(null);
    this.errorProceso.set(null);
  }

  // ========================= Aprobar y rechazar =========================

  abrirConfirmacion(tipo: TipoConfirmacion): void {
    const detalle = this.detalle();
    if (
      detalle === null ||
      detalle.estado !== 'SOLICITADA' ||
      !this.puedeOperar()
    ) {
      return;
    }
    this.errorConfirmacion.set(null);
    this.mensajeExito.set(null);
    this.confirmacion.set({ tipo, devolucion: detalle });
  }

  cerrarConfirmacion(): void {
    if (this.confirmando()) {
      return;
    }
    this.confirmacion.set(null);
    this.errorConfirmacion.set(null);
  }

  /** Mantiene el foco dentro del diálogo (`role="dialog" aria-modal="true"`). */
  contenerFoco(evento: KeyboardEvent): void {
    if (evento.key !== 'Tab') {
      return;
    }
    const contenedor = evento.currentTarget;
    if (!(contenedor instanceof HTMLElement)) {
      return;
    }
    const focos = Array.from(
      contenedor.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focos.length === 0) {
      return;
    }
    const primero = focos[0];
    const ultimo = focos[focos.length - 1];
    const activo = document.activeElement;

    if (evento.shiftKey && activo === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && activo === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  /** `POST .../aprobar` o `.../rechazar` SIN cuerpo. */
  confirmarAccion(): void {
    const pendiente = this.confirmacion();
    if (pendiente === null || this.confirmando()) {
      return;
    }

    this.confirmando.set(true);
    this.errorConfirmacion.set(null);
    this.mensajeExito.set(null);

    const peticion =
      pendiente.tipo === 'aprobar'
        ? this.devolucionesService.aprobar(pendiente.devolucion.id)
        : this.devolucionesService.rechazar(pendiente.devolucion.id);

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (respuesta) => {
        this.confirmando.set(false);
        this.confirmacion.set(null);
        this.mensajeExito.set(
          pendiente.tipo === 'aprobar'
            ? `Devolución #${respuesta.devolucion_id} aprobada (estado ${respuesta.estado}).`
            : `Devolución #${respuesta.devolucion_id} rechazada (estado ${respuesta.estado}).`,
        );
        this.cargarDetalle(pendiente.devolucion.id);
        this.cargar();
      },
      error: (error: unknown) => {
        this.confirmando.set(false);
        this.errorConfirmacion.set(
          this.errores.normalizar(error, 'devoluciones/confirmar'),
        );
      },
    });
  }

  // =============================== Procesar =============================

  /**
   * Procesa la devolución aprobada.
   *
   * Ante error se conserva el `operacion_id` (reintento idempotente); tras un
   * éxito se ROTA para que la siguiente operación no sea un replay.
   */
  procesar(): void {
    const detalle = this.detalle();
    if (
      detalle === null ||
      detalle.estado !== 'APROBADA' ||
      this.procesando() ||
      !this.puedeOperar()
    ) {
      return;
    }

    this.procesando.set(true);
    this.errorProceso.set(null);
    this.mensajeExito.set(null);
    this.resultadoProceso.set(null);

    this.devolucionesService
      .procesar(detalle.id, this.operacionProceso())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.procesando.set(false);
          this.operacionProceso.set(
            siguienteOperacionId(true, this.operacionProceso()),
          );
          this.resultadoProceso.set(respuesta);
          this.mensajeExito.set(
            `Devolución #${respuesta.devolucion_id} completada: ${respuesta.unidades_repuestas} unidades repuestas.`,
          );
          this.cargarDetalle(detalle.id);
          this.cargar();
        },
        error: (error: unknown) => {
          this.procesando.set(false);
          // Conserva el UUID: el reintento idéntico sigue siendo idempotente.
          this.operacionProceso.set(
            siguienteOperacionId(false, this.operacionProceso()),
          );
          this.errorProceso.set(
            this.errores.normalizar(error, 'devoluciones/procesar'),
          );
        },
      });
  }

  cerrarResultadoProceso(): void {
    this.resultadoProceso.set(null);
  }

  // ========================= Alta de devolución =========================

  abrirAlta(): void {
    if (!this.puedeOperar() || this.creando()) {
      return;
    }
    this.altaAbierta.set(true);
    this.errorCreacion.set(null);
    this.resultadoCreacion.set(null);
    this.mensajeValidacionDevolucion.set(null);
    this.erroresItems.set({});
    this.formDevolucion.reset({
      venta_id: null,
      motivo: '',
      observacion: '',
    });
    this.limpiarLineasVenta();
  }

  cerrarAlta(): void {
    if (this.creando()) {
      return;
    }
    this.altaAbierta.set(false);
    this.errorCreacion.set(null);
    this.mensajeValidacionDevolucion.set(null);
    this.erroresItems.set({});
    this.formDevolucion.reset({
      venta_id: null,
      motivo: '',
      observacion: '',
    });
    this.limpiarLineasVenta();
  }

  /** Mensaje de validación del número de venta. */
  mensajeVentaId(): string | null {
    return mensajeDeControl(this.formDevolucion.controls.venta_id, {
      required: 'Indica el número de venta del comprobante.',
      min: 'El número de venta debe ser mayor que 0.',
    });
  }

  mensajeMotivo(): string | null {
    return mensajeDeControl(this.formDevolucion.controls.motivo, {
      required: 'Indica el motivo general de la devolución.',
      maxlength: `El motivo admite como máximo ${MAX_MOTIVO_DEVOLUCION} caracteres.`,
    });
  }

  mensajeObservacion(): string | null {
    return mensajeDeControl(this.formDevolucion.controls.observacion, {
      maxlength: `La observación admite como máximo ${MAX_OBSERVACION_DEVOLUCION} caracteres.`,
    });
  }

  /** Carga las líneas devolvibles de la venta indicada. */
  cargarLineasVenta(): void {
    if (this.cargandoLineas()) {
      return;
    }

    this.formDevolucion.controls.venta_id.markAsTouched();
    this.errorLineas.set(null);
    this.mensajeValidacionDevolucion.set(null);
    this.erroresItems.set({});

    const ventaId = this.formDevolucion.controls.venta_id.value;
    if (ventaId === null || !esEnteroPositivo(ventaId)) {
      this.formDevolucion.controls.venta_id.setErrors({ required: true });
      this.ventaInput()?.nativeElement.focus();
      return;
    }

    this.limpiarLineasVenta();
    this.cargandoLineas.set(true);

    this.devolucionesService
      .lineasVenta(ventaId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (lineas) => {
          if (this.formDevolucion.controls.venta_id.value !== ventaId) {
            this.cargandoLineas.set(false);
            return;
          }
          this.ventaCargada.set(ventaId);
          this.lineasVenta.set(lineas);
          this.crearItems(lineas);
          this.cargandoLineas.set(false);
        },
        error: (error: unknown) => {
          if (this.formDevolucion.controls.venta_id.value !== ventaId) {
            this.cargandoLineas.set(false);
            return;
          }
          this.lineasVenta.set(null);
          this.numeroItems.set(0);
          this.formDevolucion.controls.items.clear();
          this.cargandoLineas.set(false);
          this.errorLineas.set(
            this.errores.normalizar(error, 'devoluciones/lineas-venta'),
          );
        },
      });
  }

  /** `true` cuando la línea ya no tiene unidades por devolver. */
  itemSinDisponible(indice: number): boolean {
    return this.disponibleDeItem(indice) <= 0;
  }

  /** `cantidad_disponible_devolver` de la fila (máximo permitido). */
  disponibleDeItem(indice: number): number {
    const detalleId = this.itemsDevolucion.at(indice)?.controls
      .detalle_venta_id.value;
    if (detalleId === undefined) {
      return 0;
    }
    const linea = this.lineasVenta()?.lineas.find(
      (item) => item.detalle_venta_id === detalleId,
    );
    return Math.max(0, linea?.cantidad_disponible_devolver ?? 0);
  }

  /** Mensaje de error visible de un campo del ítem. */
  errorItem(indice: number, campo: CampoItemDevolucion): string | null {
    return this.erroresItems()[String(indice)]?.[campo] ?? null;
  }

  /** `true` si la fila ya fue marcada como tocada y su campo es inválido. */
  itemInvalido(indice: number, campo: CampoItemDevolucion): boolean {
    const control = this.itemsDevolucion.at(indice)?.controls[campo];
    return control !== undefined && control.touched && control.invalid;
  }

  /** Descarta los errores de fila cuando la persona corrige los datos. */
  limpiarErroresDevolucion(): void {
    this.erroresItems.set({});
    this.mensajeValidacionDevolucion.set(null);
  }

  /**
   * Envía el alta con el `operacion_id` vigente.
   *
   * Ante error se conserva el UUID (reintento idempotente); tras un éxito se
   * rota para que la siguiente devolución no sea un replay.
   */
  enviarDevolucion(): void {
    if (this.creando() || !this.puedeOperar()) {
      return;
    }

    this.formDevolucion.markAllAsTouched();
    this.errorCreacion.set(null);
    this.mensajeExito.set(null);
    this.mensajeValidacionDevolucion.set(null);
    this.erroresItems.set({});
    this.resultadoCreacion.set(null);

    if (this.formDevolucion.controls.venta_id.invalid) {
      this.mensajeValidacionDevolucion.set(
        'Indica un número de venta válido y carga sus líneas.',
      );
      this.ventaInput()?.nativeElement.focus();
      return;
    }
    if (this.formDevolucion.controls.motivo.invalid) {
      this.mensajeValidacionDevolucion.set(
        'El motivo general es obligatorio (1 a 255 caracteres).',
      );
      this.motivoDevolucionInput()?.nativeElement.focus();
      return;
    }
    if (this.formDevolucion.controls.observacion.invalid) {
      this.mensajeValidacionDevolucion.set(
        `La observación admite como máximo ${MAX_OBSERVACION_DEVOLUCION} caracteres.`,
      );
      this.observacionDevolucionInput()?.nativeElement.focus();
      return;
    }

    const ventaId = this.formDevolucion.controls.venta_id.value;
    if (ventaId === null || this.ventaCargada() === null) {
      this.mensajeValidacionDevolucion.set(
        'Pulsa «Cargar líneas» para validar la venta antes de continuar.',
      );
      this.ventaInput()?.nativeElement.focus();
      return;
    }
    if (this.ventaCargada() !== ventaId) {
      this.mensajeValidacionDevolucion.set(
        'La venta indicada cambió: vuelve a cargar sus líneas.',
      );
      this.ventaInput()?.nativeElement.focus();
      return;
    }

    const entradas: LineaDevolucionEntrada[] = this.itemsDevolucion.controls.map(
      (item, indice) => ({
        detalle_venta_id: item.controls.detalle_venta_id.value,
        disponible: this.disponibleDeItem(indice),
        cantidad: item.controls.cantidad.value,
        reponer: item.controls.reponer.value,
        motivo: item.controls.motivo.value,
      }),
    );

    const validacion = validarItemsDevolucion(entradas);
    if (!validacion.ok) {
      const porFila: Record<
        string,
        Partial<Record<CampoItemDevolucion, string>>
      > = {};
      for (const errorItem of validacion.errores) {
        const clave = String(errorItem.indice);
        porFila[clave] = {
          ...porFila[clave],
          [errorItem.campo]: errorItem.mensaje,
        };
      }
      this.erroresItems.set(porFila);
      this.mensajeValidacionDevolucion.set(
        validacion.mensajeGeneral ??
          'Revisa las cantidades marcadas antes de crear la devolución.',
      );
      this.enfocarPrimerErrorDevolucion();
      return;
    }

    const dto = construirDevolucion({
      ventaId,
      motivo: this.formDevolucion.controls.motivo.value,
      observacion: this.formDevolucion.controls.observacion.value,
      operacionId: this.operacionDevolucion(),
      items: validacion.items,
    });

    this.creando.set(true);

    this.devolucionesService
      .crear(dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.creando.set(false);
          this.operacionDevolucion.set(
            siguienteOperacionId(true, this.operacionDevolucion()),
          );
          this.resultadoCreacion.set(respuesta);
          this.mensajeExito.set(
            respuesta.idempotente
              ? `Devolución #${respuesta.devolucion_id} ya registrada (reintento idempotente).`
              : `Devolución #${respuesta.devolucion_id} creada en estado ${this.etiquetaEstado(respuesta.estado)}.`,
          );
          this.altaAbierta.set(false);
          this.formDevolucion.reset({
            venta_id: null,
            motivo: '',
            observacion: '',
          });
          this.limpiarLineasVenta();
          this.pagina.set(0);
          this.cargar();
        },
        error: (error: unknown) => {
          this.creando.set(false);
          // Se conserva el UUID: el reintento idéntico sigue siendo idempotente.
          this.operacionDevolucion.set(
            siguienteOperacionId(false, this.operacionDevolucion()),
          );
          this.errorCreacion.set(
            this.errores.normalizar(error, 'devoluciones/crear'),
          );
        },
      });
  }

  /** Etiqueta del medio de reembolso declarado por el backend. */
  textoReembolso(medio: string, ejecutado: boolean): string {
    return ejecutado
      ? `Reembolso declarado por ${medio}`
      : `Reembolso declarado (${medio}), no ejecutado por el sistema`;
  }

  // =============================== Errores ==============================

  readonly tipoErrorConfirmacion = computed<TipoErrorOperacion | null>(() =>
    clasificarError(this.errorConfirmacion()),
  );

  readonly tipoErrorProceso = computed<TipoErrorOperacion | null>(() =>
    clasificarError(this.errorProceso()),
  );

  // ============================ Presentación =============================

  etiquetaEstado(estado: string): string {
    return (
      ESTADOS_DEVOLUCION.find((opcion) => opcion.valor === estado)?.etiqueta ??
      estado
    );
  }

  /** Fecha y hora legibles (o `—`). */
  fechaHora(iso: string | null | undefined): string {
    return formatearFechaHora(iso);
  }

  /** Monto con prefijo para columnas de monto. */
  monto(valor: number | string | null | undefined): string {
    return formatearBolivianos(valor);
  }

  /** Monto sin prefijo para columnas ya rotuladas. */
  montoSimple(valor: number | string | null | undefined): string {
    return formatearMonto(valor);
  }

  /** Sí/No legible del indicador `reponer`. */
  textoBooleano(valor: boolean): string {
    return valor ? 'Sí' : 'No';
  }

  /** `true` cuando el backend declaró el reembolso como no disponible. */
  reembolsoNoDisponible(
    reembolso: ReembolsoTenant | ReembolsoProcesado | null,
  ): boolean {
    return reembolso !== null && reembolso.medio === MEDIO_NO_DISPONIBLE;
  }

  /** Título del diálogo de confirmación. */
  tituloConfirmacion(confirmacion: ConfirmacionDevolucion): string {
    return confirmacion.tipo === 'aprobar'
      ? `Aprobar la devolución #${confirmacion.devolucion.id}`
      : `Rechazar la devolución #${confirmacion.devolucion.id}`;
  }

  // =============================== Interno ==============================

  private crearItems(lineas: VentaLineasTenant): void {
    const items = this.formDevolucion.controls.items;
    items.clear();
    for (const linea of lineas.lineas) {
      items.push(
        new FormGroup<{
          detalle_venta_id: FormControl<number>;
          cantidad: FormControl<number | null>;
          reponer: FormControl<boolean>;
          motivo: FormControl<string>;
        }>({
          detalle_venta_id: new FormControl<number>(linea.detalle_venta_id, {
            nonNullable: true,
          }),
          cantidad: new FormControl<number | null>(null, {
            validators: [Validators.min(0)],
          }),
          reponer: new FormControl<boolean>(true, { nonNullable: true }),
          motivo: new FormControl('', {
            nonNullable: true,
            validators: [Validators.maxLength(MAX_MOTIVO_DEVOLUCION)],
          }),
        }),
      );
    }
    this.numeroItems.set(items.length);
  }

  private limpiarLineasVenta(): void {
    this.ventaCargada.set(null);
    this.lineasVenta.set(null);
    this.formDevolucion.controls.items.clear();
    this.numeroItems.set(0);
    this.erroresItems.set({});
    this.errorLineas.set(null);
    this.cargandoLineas.set(false);
  }

  /** Lleva el foco al primer campo inválido del alta. */
  private enfocarPrimerErrorDevolucion(): void {
    const candidatos: Array<[boolean, ElementRef<HTMLElement> | undefined]> = [
      [
        this.formDevolucion.controls.motivo.invalid,
        this.motivoDevolucionInput(),
      ],
      [
        this.formDevolucion.controls.observacion.invalid,
        this.observacionDevolucionInput(),
      ],
    ];
    for (const [invalido, referencia] of candidatos) {
      if (invalido && referencia !== undefined) {
        referencia.nativeElement.focus();
        return;
      }
    }

    const filas = Object.keys(this.erroresItems())
      .map((clave) => Number(clave))
      .sort((a, b) => a - b);
    for (const indice of filas) {
      const erroresFila = this.erroresItems()[String(indice)] ?? {};
      if (erroresFila.cantidad !== undefined) {
        this.cantidadItemInputs()[indice]?.nativeElement.focus();
        return;
      }
      if (erroresFila.motivo !== undefined) {
        this.motivoItemInputs()[indice]?.nativeElement.focus();
        return;
      }
    }
  }

  private cargar(): void {
    this.cargando.set(true);
    this.errorListado.set(null);
    this.sinPermiso.set(false);

    this.devolucionesService
      .listar({
        estado: this.filtroEstado(),
        limit: LIMITE_DEVOLUCIONES,
        offset: this.offset(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (devoluciones) => {
          this.devoluciones.set(
            [...devoluciones].sort((a, b) => b.id - a.id),
          );
          this.cargando.set(false);
        },
        error: (error: unknown) => {
          this.devoluciones.set([]);
          this.cargando.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'devoluciones/listar',
          );
          if (normalizado.estado === 403) {
            this.sinPermiso.set(true);
            return;
          }
          this.errorListado.set(normalizado.mensaje);
        },
      });
  }

  private cargarDetalle(id: number): void {
    this.cargandoDetalle.set(true);
    this.errorDetalle.set(null);

    this.devolucionesService
      .obtener(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          if (this.devolucionSeleccionada()?.id !== id) {
            return;
          }
          this.detalle.set(detalle);
          this.devolucionSeleccionada.set(detalle);
          this.cargandoDetalle.set(false);
        },
        error: (error: unknown) => {
          if (this.devolucionSeleccionada()?.id !== id) {
            return;
          }
          this.detalle.set(null);
          this.cargandoDetalle.set(false);
          this.errorDetalle.set(
            this.errores.mensajeDeError(error, 'devoluciones/detalle'),
          );
        },
      });
  }
}

/** `true` si el error corresponde a un conflicto de estado/idempotencia. */
function clasificarError(
  error: TenantErrorNormalizado | null,
): TipoErrorOperacion | null {
  if (error === null) {
    return null;
  }
  if (error.estado === 403) {
    return 'permiso';
  }
  if (error.estado === 404) {
    return 'no-existe';
  }
  if (error.estado === 503) {
    return 'deshabilitado';
  }
  if (error.estado === 409) {
    return 'conflicto';
  }
  if (error.esValidacion) {
    return 'validacion';
  }
  return 'otro';
}

/** `true` si el valor es un entero >= 1. */
function esEnteroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1;
}

/** Mensaje de error visible de un control (solo si ya fue tocado). */
function mensajeDeControl(
  control: AbstractControl,
  mensajes: Record<string, string>,
): string | null {
  if (control.untouched || !control.invalid) {
    return null;
  }
  for (const [clave, mensaje] of Object.entries(mensajes)) {
    if (control.hasError(clave)) {
      return mensaje;
    }
  }
  return 'Revisa este campo.';
}
