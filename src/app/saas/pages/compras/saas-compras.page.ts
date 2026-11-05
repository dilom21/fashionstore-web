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
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import {
  EstadoOrdenCompra,
  OrdenCompraCreada,
  OrdenCompraDetalle,
  OrdenCompraResumen,
  RecepcionResultado,
  RecepcionSolicitud,
  TenantErrorNormalizado,
  TenantProveedor,
  TenantProveedorCreado,
  TenantSucursal,
  TenantTemporada,
  TenantVarianteEmpresa,
} from '../../models/tenant.models';
import { SaasCatalogoService } from '../../services/saas-catalogo.service';
import { SaasComprasService } from '../../services/saas-compras.service';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasSessionService } from '../../services/saas-session.service';
import { SaasSucursalesService } from '../../services/saas-sucursales.service';
import { formatearBolivianos, formatearMonto } from '../../utils/monto.util';
import { formatearFecha } from '../../utils/fecha.util';
import {
  generarOperacionId,
  siguienteOperacionId,
} from '../../utils/operacion-id.util';
import {
  LineaOrdenCompraEntrada,
  MAX_CANTIDAD_ORDEN_COMPRA,
  MAX_LINEAS_ORDEN_COMPRA,
  MAX_OBSERVACION_ORDEN_COMPRA,
  CampoLineaOrdenCompra,
  construirOrdenCompra,
  fechaLocalAIso,
  validarLineasOrdenCompra,
} from './crear-orden.util';
import {
  LineaRecepcionEntrada,
  construirLineasRecepcion,
} from './compras.util';
import { SaasNuevoProveedorPanel } from './nuevo-proveedor/nuevo-proveedor';

/** Tamaño de página del listado (backend: 1..200, default 50). */
const LIMITE_COMPRAS = 50;

/** Máximo de la observación (cancelación: backend 2000). */
const MAX_OBSERVACION = 2000;

/** Roles que el backend autoriza para operar compras. */
const ROLES_OPERACION = new Set(['ADMINISTRADOR', 'ENCARGADO_SUCURSAL']);

/** Opciones del filtro de estado (los 5 valores del backend). */
export const ESTADOS_ORDEN_COMPRA: ReadonlyArray<{
  valor: EstadoOrdenCompra;
  etiqueta: string;
}> = [
  { valor: 'BORRADOR', etiqueta: 'Borrador' },
  { valor: 'ENVIADA', etiqueta: 'Enviada' },
  { valor: 'PARCIAL', etiqueta: 'Parcial' },
  { valor: 'RECIBIDA', etiqueta: 'Recibida' },
  { valor: 'CANCELADA', etiqueta: 'Cancelada' },
];

/** Clasificación del error de una operación para explicar la causa. */
type TipoErrorOperacion =
  | 'permiso'
  | 'deshabilitado'
  | 'conflicto'
  | 'validacion'
  | 'otro';

/** Grupo tipado de una línea del alta de orden. */
type LineaOrdenForm = FormGroup<{
  variante_producto_id: FormControl<number | null>;
  temporada_id: FormControl<number | null>;
  cantidad: FormControl<number | null>;
  costo_unitario: FormControl<string>;
}>;

/**
 * Órdenes de compra (`/tenant/ordenes-compra`).
 *
 * Contrato real:
 * - Listado, detalle y alta para ADMINISTRADOR/ENCARGADO_SUCURSAL.
 * - Alta (`POST /tenant/ordenes-compra`): proveedor, sucursal, líneas con
 *   variante + temporada, cantidad y costo unitario.
 * - `BORRADOR`: enviar (sin cuerpo) o cancelar (con observación).
 * - `ENVIADA`/`PARCIAL`: recepcionar con `operacion_id` y líneas.
 * - `RECIBIDA`/`CANCELADA`: solo lectura.
 *
 * NO EXISTE en el contrato tenant: editar una orden ni `PUT /detalles`. La
 * pantalla lo explica y no simula esas operaciones. El alta no permite crear
 * proveedores: si la empresa no tiene ninguno, se bloquea con un aviso.
 */
@Component({
  selector: 'app-saas-compras-page',
  imports: [ReactiveFormsModule, AdminIcon, SaasNuevoProveedorPanel],
  styleUrl: './saas-compras.page.css',
  templateUrl: './saas-compras.page.html',
})
export class SaasComprasPage {
  private readonly comprasService = inject(SaasComprasService);
  private readonly catalogoService = inject(SaasCatalogoService);
  private readonly sucursalesService = inject(SaasSucursalesService);
  private readonly sesion = inject(SaasSessionService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly estados = ESTADOS_ORDEN_COMPRA;
  readonly limite = LIMITE_COMPRAS;
  readonly maxObservacion = MAX_OBSERVACION;
  readonly maxLineasOrden = MAX_LINEAS_ORDEN_COMPRA;
  readonly maxCantidadOrden = MAX_CANTIDAD_ORDEN_COMPRA;
  readonly maxObservacionOrden = MAX_OBSERVACION_ORDEN_COMPRA;

  /** `true` si el rol puede operar; el backend vuelve a autorizar siempre. */
  readonly puedeOperar = computed(() =>
    ROLES_OPERACION.has(
      (this.sesion.rol() ?? '').trim().toUpperCase(),
    ),
  );

  // =============================== Listado ===============================

  readonly ordenes = signal<OrdenCompraResumen[]>([]);
  readonly cargando = signal(true);
  readonly errorListado = signal<string | null>(null);
  readonly sinPermiso = signal(false);

  readonly filtroEstado = signal<EstadoOrdenCompra | null>(null);

  /** Número de página (0-based); `offset = pagina * limite`. */
  readonly pagina = signal(0);
  readonly offset = computed(() => this.pagina() * LIMITE_COMPRAS);

  readonly hayPaginaSiguiente = computed(
    () => this.ordenes().length === LIMITE_COMPRAS,
  );

  readonly textoRango = computed(() => {
    const total = this.ordenes().length;
    if (total === 0) {
      return 'Sin resultados en esta página';
    }
    const desde = this.offset() + 1;
    return `Mostrando ${desde}–${this.offset() + total} · página ${this.pagina() + 1}`;
  });

  // =============================== Detalle ===============================

  /** Fila seleccionada (para la cabecera mientras carga el detalle). */
  readonly ordenSeleccionada = signal<OrdenCompraResumen | null>(null);
  readonly detalle = signal<OrdenCompraDetalle | null>(null);
  readonly cargandoDetalle = signal(false);
  readonly errorDetalle = signal<string | null>(null);

  // =============================== Acciones ==============================

  readonly enviando = signal(false);
  readonly errorAccion = signal<TenantErrorNormalizado | null>(null);

  readonly cancelacion = signal<OrdenCompraDetalle | null>(null);
  readonly cancelando = signal(false);
  readonly errorCancelacion = signal<TenantErrorNormalizado | null>(null);

  readonly formCancelacion = new FormGroup({
    observacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_OBSERVACION)],
    }),
  });

  // ============================== Recepción ==============================

  readonly recepcionAbierta = signal(false);
  readonly operacionRecepcion = signal(generarOperacionId());
  readonly recepcionando = signal(false);
  readonly errorRecepcion = signal<TenantErrorNormalizado | null>(null);
  readonly resultadoRecepcion = signal<RecepcionResultado | null>(null);
  readonly erroresRecepcion = signal<Record<string, string>>({});
  readonly mensajeRecepcion = signal<string | null>(null);

  readonly formRecepcion = new FormGroup({
    observacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_OBSERVACION)],
    }),
    lineas: new FormArray<FormControl<number | null>>([]),
  });

  readonly numeroLineasRecepcion = signal(0);

  readonly mensajeExito = signal<string | null>(null);

  // ========================= Alta de orden de compra =====================

  readonly altaAbierta = signal(false);
  readonly guardandoOrden = signal(false);
  readonly errorAlta = signal<TenantErrorNormalizado | null>(null);
  readonly resultadoAlta = signal<OrdenCompraCreada | null>(null);
  readonly mensajeValidacionOrden = signal<string | null>(null);
  readonly erroresLineasOrden = signal<
    Record<string, Partial<Record<CampoLineaOrdenCompra, string>>>
  >({});

  /** Catálogos que alimentan el alta (se cargan al abrir el panel). */
  readonly proveedores = signal<TenantProveedor[]>([]);
  readonly temporadas = signal<TenantTemporada[]>([]);
  readonly variantesEmpresa = signal<TenantVarianteEmpresa[]>([]);
  readonly sucursalesEmpresa = signal<TenantSucursal[]>([]);

  readonly cargandoProveedores = signal(false);
  readonly cargandoTemporadas = signal(false);
  readonly cargandoVariantesEmpresa = signal(false);
  readonly cargandoSucursalesEmpresa = signal(false);

  readonly errorProveedores = signal<string | null>(null);
  readonly errorTemporadas = signal<string | null>(null);
  readonly errorVariantesEmpresa = signal<string | null>(null);
  readonly errorSucursalesEmpresa = signal<string | null>(null);

  readonly proveedoresSinPermiso = signal(false);
  readonly temporadasSinPermiso = signal(false);
  readonly variantesSinPermiso = signal(false);
  readonly sucursalesSinPermiso = signal(false);

  readonly formOrden = new FormGroup({
    proveedor_id: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    sucursal_id: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    fecha_estimada: new FormControl('', {
      nonNullable: true,
      validators: [fechaOpcionalValida],
    }),
    observacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_OBSERVACION_ORDEN_COMPRA)],
    }),
    lineas: new FormArray<LineaOrdenForm>([]),
  });

  readonly numeroLineasOrden = signal(0);

  readonly cargandoCatalogosOrden = computed(
    () =>
      this.cargandoProveedores() ||
      this.cargandoTemporadas() ||
      this.cargandoVariantesEmpresa() ||
      this.cargandoSucursalesEmpresa(),
  );

  private readonly proveedorOrdenInput =
    viewChild<ElementRef<HTMLSelectElement>>('proveedorOrdenInput');
  private readonly sucursalOrdenInput =
    viewChild<ElementRef<HTMLSelectElement>>('sucursalOrdenInput');
  private readonly fechaOrdenInput =
    viewChild<ElementRef<HTMLInputElement>>('fechaOrdenInput');
  private readonly observacionOrdenInput =
    viewChild<ElementRef<HTMLTextAreaElement>>('observacionOrdenInput');
  private readonly varianteSelects =
    viewChildren<ElementRef<HTMLSelectElement>>('ordenVarianteSelect');
  private readonly temporadaSelects =
    viewChildren<ElementRef<HTMLSelectElement>>('ordenTemporadaSelect');
  private readonly cantidadInputs =
    viewChildren<ElementRef<HTMLInputElement>>('ordenCantidadInput');
  private readonly costoInputs =
    viewChildren<ElementRef<HTMLInputElement>>('ordenCostoInput');

  /** `true` si el panel de alta de proveedor está visible. */
  readonly mostrarNuevoProveedor = signal(false);

  /** Mensaje honesto cuando la empresa no tiene proveedores. */
  readonly mensajeSinProveedores =
    'La empresa no tiene proveedores registrados. Puedes crear el primero desde esta pantalla antes de comprar';

  /** `true` solo si hay proveedores, temporadas, variantes y sucursales. */
  readonly catalogosOrdenListos = computed(
    () =>
      !this.cargandoCatalogosOrden() &&
      this.proveedores().length > 0 &&
      this.temporadas().length > 0 &&
      this.variantesEmpresa().length > 0 &&
      this.sucursalesEmpresa().length > 0,
  );

  readonly puedeGuardarOrden = computed(
    () =>
      this.puedeOperar() &&
      this.catalogosOrdenListos() &&
      !this.guardandoOrden(),
  );

  readonly tipoErrorAlta = computed<TipoErrorOperacion | null>(() =>
    clasificarError(this.errorAlta()),
  );

  constructor() {
    this.cargar();
  }

  // =============================== Carga ================================

  recargar(): void {
    if (this.cargando()) {
      return;
    }
    this.cargar();
  }

  recargarDetalle(): void {
    const orden = this.ordenSeleccionada();
    if (orden === null || this.cargandoDetalle()) {
      return;
    }
    this.cargarDetalle(orden.id);
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

  /** Cambia el filtro de estado y vuelve a la primera página. */
  cambiarFiltro(evento: Event): void {
    const objetivo = evento.target;
    if (!(objetivo instanceof HTMLSelectElement)) {
      return;
    }
    const valor = objetivo.value;
    const estado = ESTADOS_ORDEN_COMPRA.some(
      (opcion) => opcion.valor === valor,
    )
      ? (valor as EstadoOrdenCompra)
      : null;

    this.filtroEstado.set(estado);
    this.pagina.set(0);
    this.cargar();
  }

  // =============================== Detalle ==============================

  /** Abre el panel de detalle de la orden seleccionada. */
  verDetalle(orden: OrdenCompraResumen): void {
    if (this.cargandoDetalle()) {
      return;
    }
    this.ordenSeleccionada.set(orden);
    this.detalle.set(null);
    this.errorDetalle.set(null);
    this.errorAccion.set(null);
    this.mensajeExito.set(null);
    this.cerrarRecepcion();
    this.cargarDetalle(orden.id);
  }

  cerrarDetalle(): void {
    if (this.enviando() || this.cancelando() || this.recepcionando()) {
      return;
    }
    this.ordenSeleccionada.set(null);
    this.detalle.set(null);
    this.errorDetalle.set(null);
    this.errorAccion.set(null);
    this.cerrarRecepcion();
  }

  // ================================ Enviar ==============================

  /** `POST .../enviar` sin cuerpo: solo una orden BORRADOR puede enviarse. */
  enviarOrden(): void {
    const detalle = this.detalle();
    if (detalle === null || this.enviando() || !this.puedeOperar()) {
      return;
    }

    this.enviando.set(true);
    this.errorAccion.set(null);
    this.mensajeExito.set(null);

    this.comprasService
      .enviar(detalle.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.enviando.set(false);
          this.mensajeExito.set(
            `Orden de compra #${respuesta.orden_compra_id} enviada (estado ${respuesta.estado}).`,
          );
          this.cargarDetalle(detalle.id);
          this.cargar();
        },
        error: (error: unknown) => {
          this.enviando.set(false);
          this.errorAccion.set(
            this.errores.normalizar(error, 'compras/enviar'),
          );
        },
      });
  }

  // =============================== Cancelar =============================

  abrirCancelacion(): void {
    const detalle = this.detalle();
    if (detalle === null || detalle.estado !== 'BORRADOR' || !this.puedeOperar()) {
      return;
    }
    this.formCancelacion.reset({ observacion: '' });
    this.errorCancelacion.set(null);
    this.mensajeExito.set(null);
    this.cancelacion.set(detalle);
  }

  cerrarCancelacion(): void {
    if (this.cancelando()) {
      return;
    }
    this.cancelacion.set(null);
    this.errorCancelacion.set(null);
    this.formCancelacion.reset({ observacion: '' });
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

  /** `POST .../cancelar` con `{observacion?}` (siempre cuerpo JSON). */
  confirmarCancelacion(): void {
    const detalle = this.cancelacion();
    if (detalle === null || this.cancelando()) {
      return;
    }

    this.formCancelacion.markAllAsTouched();
    this.errorCancelacion.set(null);
    if (this.formCancelacion.invalid) {
      return;
    }

    const observacion = this.formCancelacion.controls.observacion.value;
    this.cancelando.set(true);

    this.comprasService
      .cancelar(detalle.id, observacion)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.cancelando.set(false);
          this.cancelacion.set(null);
          this.formCancelacion.reset({ observacion: '' });
          this.mensajeExito.set(
            `Orden de compra #${respuesta.orden_compra_id} cancelada (estado ${respuesta.estado}).`,
          );
          this.cargarDetalle(detalle.id);
          this.cargar();
        },
        error: (error: unknown) => {
          this.cancelando.set(false);
          this.errorCancelacion.set(
            this.errores.normalizar(error, 'compras/cancelar'),
          );
        },
      });
  }

  // ============================== Recepción =============================

  /** Abre el formulario de recepción con las líneas pendientes de la orden. */
  abrirRecepcion(): void {
    const detalle = this.detalle();
    if (detalle === null || !this.puedeOperar()) {
      return;
    }
    if (detalle.estado !== 'ENVIADA' && detalle.estado !== 'PARCIAL') {
      return;
    }
    this.errorRecepcion.set(null);
    this.resultadoRecepcion.set(null);
    this.erroresRecepcion.set({});
    this.mensajeRecepcion.set(null);
    this.formRecepcion.controls.observacion.reset('');
    this.prepararCantidades(detalle);
    this.recepcionAbierta.set(true);
  }

  cerrarRecepcion(): void {
    if (this.recepcionando()) {
      return;
    }
    this.recepcionAbierta.set(false);
    this.formRecepcion.controls.lineas.clear();
    this.numeroLineasRecepcion.set(0);
    this.formRecepcion.controls.observacion.reset('');
    this.errorRecepcion.set(null);
    this.erroresRecepcion.set({});
    this.mensajeRecepcion.set(null);
  }

  /** Líneas del formulario de recepción para la plantilla. */
  get lineasRecepcion(): FormArray<FormControl<number | null>> {
    return this.formRecepcion.controls.lineas;
  }

  /** Mensaje de error visible de una cantidad de recepción. */
  errorLineaRecepcion(indice: number): string | null {
    return this.erroresRecepcion()[String(indice)] ?? null;
  }

  /** `true` si la fila ya fue marcada como tocada y su cantidad es inválida. */
  lineaRecepcionInvalida(indice: number): boolean {
    const control = this.lineasRecepcion.at(indice);
    return (
      control !== undefined &&
      control.touched &&
      control.invalid &&
      this.errorLineaRecepcion(indice) === null
    );
  }

  /** Cierra el detalle y limpia los avisos al cambiar de pestaña o lista. */
  limpiarErroresRecepcion(): void {
    this.erroresRecepcion.set({});
    this.mensajeRecepcion.set(null);
  }

  /**
   * Envía la recepción con las líneas de cantidad > 0.
   *
   * Ante error se conservan cantidades y `operacion_id` (reintento
   * idempotente). Tras un éxito el UUID se ROTA.
   */
  recepcionar(): void {
    const detalle = this.detalle();
    if (detalle === null || this.recepcionando() || !this.puedeOperar()) {
      return;
    }

    this.formRecepcion.markAllAsTouched();
    this.errorRecepcion.set(null);
    this.mensajeRecepcion.set(null);
    this.erroresRecepcion.set({});
    this.resultadoRecepcion.set(null);

    const entradas: LineaRecepcionEntrada[] = detalle.lineas.map(
      (linea, indice) => ({
        detalle_orden_compra_id: linea.id,
        pendiente: linea.cantidad_pendiente,
        cantidad: this.lineasRecepcion.at(indice)?.value ?? null,
      }),
    );

    const validacion = construirLineasRecepcion(entradas);
    if (!validacion.ok) {
      this.erroresRecepcion.set(validacion.errores);
      this.mensajeRecepcion.set(validacion.mensajeGeneral);
      return;
    }

    const dto: RecepcionSolicitud = {
      operacion_id: this.operacionRecepcion(),
      lineas: validacion.lineas,
    };
    const observacion = this.formRecepcion.controls.observacion.value.trim();
    if (observacion.length > 0) {
      dto.observacion = observacion;
    }

    this.recepcionando.set(true);

    this.comprasService
      .recepcionar(detalle.id, dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.recepcionando.set(false);
          this.operacionRecepcion.set(
            siguienteOperacionId(true, this.operacionRecepcion()),
          );
          this.resultadoRecepcion.set(respuesta);
          this.mensajeExito.set(
            `Recepción #${respuesta.recepcion_id} registrada: ${respuesta.unidades_recibidas} unidades recibidas. Estado de la orden: ${respuesta.estado_orden}.`,
          );
          this.mensajeRecepcion.set(null);
          this.erroresRecepcion.set({});
          // El backend ya descontó lo pendiente: las cantidades vuelven a 0.
          const actualizado = this.detalle();
          if (actualizado !== null) {
            actualizado.lineas.forEach((_, indice) => {
              this.lineasRecepcion.at(indice)?.setValue(0);
            });
          }
          this.cargarDetalle(detalle.id);
          this.cargar();
        },
        error: (error: unknown) => {
          this.recepcionando.set(false);
          // Conserva cantidades y UUID: el reintento idéntico es idempotente.
          this.operacionRecepcion.set(
            siguienteOperacionId(false, this.operacionRecepcion()),
          );
          this.errorRecepcion.set(
            this.errores.normalizar(error, 'compras/recepcion'),
          );
        },
      });
  }

  /** Descarta el resultado visible de la última recepción. */
  cerrarResultadoRecepcion(): void {
    this.resultadoRecepcion.set(null);
  }

  // ========================= Alta de orden de compra =====================

  /** Líneas del alta para la plantilla. */
  get lineasOrden(): FormArray<LineaOrdenForm> {
    return this.formOrden.controls.lineas;
  }

  /** Abre el panel de alta y refresca los catálogos que lo alimentan. */
  abrirAlta(): void {
    if (!this.puedeOperar() || this.guardandoOrden()) {
      return;
    }
    this.altaAbierta.set(true);
    this.mostrarNuevoProveedor.set(false);
    this.errorAlta.set(null);
    this.resultadoAlta.set(null);
    this.mensajeValidacionOrden.set(null);
    this.erroresLineasOrden.set({});
    this.formOrden.reset({
      proveedor_id: null,
      sucursal_id: null,
      fecha_estimada: '',
      observacion: '',
    });
    this.formOrden.controls.lineas.clear();
    this.agregarLineaOrden();
    this.cargarCatalogosOrden();
    // Mientras no haya proveedores disponibles el selector queda deshabilitado
    // por el propio FormControl (el `[disabled]` del template no sirve con
    // `formControlName`: lo sobrescribe el estado reactivo).
    this.sincronizarProveedor();
  }

  cerrarAlta(): void {
    if (this.guardandoOrden()) {
      return;
    }
    this.altaAbierta.set(false);
    this.mostrarNuevoProveedor.set(false);
    this.errorAlta.set(null);
    this.mensajeValidacionOrden.set(null);
    this.erroresLineasOrden.set({});
    this.formOrden.controls.lineas.clear();
    this.numeroLineasOrden.set(0);
    this.formOrden.reset({
      proveedor_id: null,
      sucursal_id: null,
      fecha_estimada: '',
      observacion: '',
    });
  }

  /** Abre el panel de alta de proveedor (solo si el rol puede operar). */
  abrirNuevoProveedor(): void {
    if (!this.puedeOperar() || this.guardandoOrden()) {
      return;
    }
    this.mensajeExito.set(null);
    this.mostrarNuevoProveedor.set(true);
  }

  cerrarNuevoProveedor(): void {
    this.mostrarNuevoProveedor.set(false);
  }

  /**
   * Integra el proveedor recién creado en el selector sin recargar todo.
   *
   * El backend ya validó empresa, rol, plan y productos; aquí solo se refleja
   * la respuesta 201 y se selecciona el proveedor para continuar la orden.
   */
  alCrearProveedor(proveedor: TenantProveedorCreado): void {
    this.mostrarNuevoProveedor.set(false);
    this.proveedores.update((lista) =>
      [
        ...lista.filter((item) => item.id !== proveedor.id),
        {
          id: proveedor.id,
          razon_social: proveedor.razon_social,
          estado: proveedor.estado,
        },
      ].sort((a, b) => a.razon_social.localeCompare(b.razon_social)),
    );
    this.proveedoresSinPermiso.set(false);
    this.errorProveedores.set(null);
    this.cargandoProveedores.set(false);
    this.sincronizarProveedor();
    this.formOrden.controls.proveedor_id.setValue(proveedor.id);
    this.mensajeExito.set(
      `Proveedor «${proveedor.razon_social}» creado (#${proveedor.id}) con ${proveedor.total_productos} producto(s). Ya puedes usarlo en la orden.`,
    );
  }

  /** Reintenta todos los catálogos del alta (un 403 no rompe el listado). */
  recargarCatalogosOrden(): void {
    if (this.cargandoCatalogosOrden()) {
      return;
    }
    this.cargarCatalogosOrden();
    this.sincronizarProveedor();
  }

  /** Agrega una línea vacía respetando el máximo del contrato. */
  agregarLineaOrden(): void {
    if (this.lineasOrden.length >= MAX_LINEAS_ORDEN_COMPRA) {
      return;
    }
    this.lineasOrden.push(this.crearLineaOrden());
    this.sincronizarLineasOrden();
  }

  /** Quita una línea; siempre queda al menos una fila visible. */
  quitarLineaOrden(indice: number): void {
    if (this.lineasOrden.length <= 1) {
      return;
    }
    this.lineasOrden.removeAt(indice);
    this.sincronizarLineasOrden();
  }

  readonly puedeAgregarLineaOrden = computed(
    () => this.numeroLineasOrden() < MAX_LINEAS_ORDEN_COMPRA,
  );

  readonly puedeQuitarLineaOrden = computed(
    () => this.numeroLineasOrden() > 1,
  );

  /** Mensaje de error visible de un campo de la línea. */
  errorLineaOrden(
    indice: number,
    campo: CampoLineaOrdenCompra,
  ): string | null {
    return this.erroresLineasOrden()[String(indice)]?.[campo] ?? null;
  }

  /** `true` si la fila ya fue marcada como tocada y su campo es inválido. */
  lineaOrdenInvalida(indice: number, campo: CampoLineaOrdenCompra): boolean {
    const control = this.lineasOrden.at(indice)?.controls[campo];
    return control !== undefined && control.touched && control.invalid;
  }

  /** Descarta los errores de fila cuando la persona corrige los datos. */
  limpiarErroresOrden(): void {
    this.erroresLineasOrden.set({});
    this.mensajeValidacionOrden.set(null);
  }

  mensajeProveedorOrden(): string | null {
    return mensajeDeControl(this.formOrden.controls.proveedor_id, {
      required: 'Selecciona el proveedor de la orden.',
      min: 'Selecciona un proveedor válido.',
    });
  }

  mensajeSucursalOrden(): string | null {
    return mensajeDeControl(this.formOrden.controls.sucursal_id, {
      required: 'Selecciona la sucursal de destino.',
      min: 'Selecciona una sucursal válida.',
    });
  }

  mensajeFechaOrden(): string | null {
    return mensajeDeControl(this.formOrden.controls.fecha_estimada, {
      fechaInvalida: 'Indica una fecha y hora válidas o deja el campo vacío.',
    });
  }

  mensajeObservacionOrden(): string | null {
    return mensajeDeControl(this.formOrden.controls.observacion, {
      maxlength: `La observación admite como máximo ${MAX_OBSERVACION_ORDEN_COMPRA} caracteres.`,
    });
  }

  /** Etiqueta de una variante en el selector de líneas. */
  etiquetaVariante(variante: TenantVarianteEmpresa): string {
    return `${variante.sku} — ${variante.producto_nombre} — ${variante.talla}/${variante.color}`;
  }

  /**
   * Envía el alta. Ante error conserva los datos escritos para reintentar.
   *
   * 201 y 200 se tratan igual: el 200 es el replay idempotente del servidor.
   */
  enviarOrdenCompra(): void {
    if (!this.puedeGuardarOrden()) {
      return;
    }

    this.formOrden.markAllAsTouched();
    this.errorAlta.set(null);
    this.mensajeExito.set(null);
    this.mensajeValidacionOrden.set(null);
    this.erroresLineasOrden.set({});
    this.resultadoAlta.set(null);

    const proveedorId = this.formOrden.controls.proveedor_id.value;
    const sucursalId = this.formOrden.controls.sucursal_id.value;
    if (
      proveedorId === null ||
      !esEnteroPositivo(proveedorId) ||
      sucursalId === null ||
      !esEnteroPositivo(sucursalId)
    ) {
      this.mensajeValidacionOrden.set(
        'Selecciona el proveedor y la sucursal de la orden.',
      );
      this.enfocarPrimerErrorOrden();
      return;
    }

    const fechaTexto = this.formOrden.controls.fecha_estimada.value;
    const fechaEstimada = fechaLocalAIso(fechaTexto);
    if (fechaTexto.trim().length > 0 && fechaEstimada === null) {
      this.mensajeValidacionOrden.set(
        'La fecha estimada no es válida. Corrígela o deja el campo vacío.',
      );
      this.enfocarPrimerErrorOrden();
      return;
    }

    const entradas: LineaOrdenCompraEntrada[] = this.lineasOrden.controls.map(
      (linea) => ({
        variante_producto_id: linea.controls.variante_producto_id.value,
        temporada_id: linea.controls.temporada_id.value,
        cantidad: linea.controls.cantidad.value,
        costo_unitario: linea.controls.costo_unitario.value,
      }),
    );

    const validacion = validarLineasOrdenCompra(entradas);
    if (!validacion.ok) {
      const porFila: Record<
        string,
        Partial<Record<CampoLineaOrdenCompra, string>>
      > = {};
      for (const errorLinea of validacion.errores) {
        const clave = String(errorLinea.indice);
        porFila[clave] = {
          ...porFila[clave],
          [errorLinea.campo]: errorLinea.mensaje,
        };
      }
      this.erroresLineasOrden.set(porFila);
      this.mensajeValidacionOrden.set(
        validacion.mensajeGeneral ??
          'Revisa las líneas marcadas antes de crear la orden.',
      );
      this.enfocarPrimerErrorOrden();
      return;
    }

    const dto = construirOrdenCompra({
      proveedorId,
      sucursalId,
      fechaEstimada,
      observacion: this.formOrden.controls.observacion.value,
      lineas: validacion.lineas,
    });

    this.guardandoOrden.set(true);

    this.comprasService
      .crearOrden(dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.guardandoOrden.set(false);
          this.resultadoAlta.set(respuesta);
          this.mensajeExito.set(
            `Orden de compra #${respuesta.orden_compra_id} creada en estado ${this.etiquetaEstado(respuesta.estado)}.`,
          );
          this.altaAbierta.set(false);
          this.formOrden.controls.lineas.clear();
          this.numeroLineasOrden.set(0);
          this.formOrden.reset({
            proveedor_id: null,
            sucursal_id: null,
            fecha_estimada: '',
            observacion: '',
          });
          this.pagina.set(0);
          this.cargar();
        },
        error: (error: unknown) => {
          this.guardandoOrden.set(false);
          // Los datos se conservan: corregir y reintentar es seguro.
          this.errorAlta.set(this.errores.normalizar(error, 'compras/crear'));
        },
      });
  }

  // =============================== Errores ==============================

  readonly tipoErrorAccion = computed<TipoErrorOperacion | null>(() =>
    clasificarError(this.errorAccion()),
  );

  readonly tipoErrorCancelacion = computed<TipoErrorOperacion | null>(() =>
    clasificarError(this.errorCancelacion()),
  );

  readonly tipoErrorRecepcion = computed<TipoErrorOperacion | null>(() =>
    clasificarError(this.errorRecepcion()),
  );

  // ============================ Presentación =============================

  etiquetaEstado(estado: string): string {
    return (
      ESTADOS_ORDEN_COMPRA.find((opcion) => opcion.valor === estado)
        ?.etiqueta ?? estado
    );
  }

  /** Fecha legible del backend (o `—`). */
  fecha(iso: string | null | undefined): string {
    return formatearFecha(iso);
  }

  /** Monto con prefijo para costos y totales informativos. */
  monto(valor: number | string | null | undefined): string {
    return formatearBolivianos(valor);
  }

  /** Monto sin prefijo para columnas ya rotuladas. */
  montoSimple(valor: number | string | null | undefined): string {
    return formatearMonto(valor);
  }

  // =============================== Interno ==============================

  private crearLineaOrden(): LineaOrdenForm {
    return new FormGroup<{
      variante_producto_id: FormControl<number | null>;
      temporada_id: FormControl<number | null>;
      cantidad: FormControl<number | null>;
      costo_unitario: FormControl<string>;
    }>({
      variante_producto_id: new FormControl<number | null>(null, {
        validators: [Validators.required, Validators.min(1)],
      }),
      temporada_id: new FormControl<number | null>(null, {
        validators: [Validators.required, Validators.min(1)],
      }),
      cantidad: new FormControl<number | null>(null, {
        validators: [
          Validators.required,
          Validators.min(1),
          Validators.max(MAX_CANTIDAD_ORDEN_COMPRA),
        ],
      }),
      costo_unitario: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
    });
  }

  private sincronizarLineasOrden(): void {
    this.numeroLineasOrden.set(this.lineasOrden.length);
    this.erroresLineasOrden.set({});
    this.mensajeValidacionOrden.set(null);
  }

  /** Lleva el foco al primer campo inválido del alta. */
  private enfocarPrimerErrorOrden(): void {
    const candidatos: Array<[boolean, ElementRef<HTMLElement> | undefined]> = [
      [
        this.formOrden.controls.proveedor_id.invalid,
        this.proveedorOrdenInput(),
      ],
      [this.formOrden.controls.sucursal_id.invalid, this.sucursalOrdenInput()],
      [
        this.formOrden.controls.fecha_estimada.invalid,
        this.fechaOrdenInput(),
      ],
      [
        this.formOrden.controls.observacion.invalid,
        this.observacionOrdenInput(),
      ],
    ];
    for (const [invalido, referencia] of candidatos) {
      if (invalido && referencia !== undefined) {
        referencia.nativeElement.focus();
        return;
      }
    }

    const filas = Object.keys(this.erroresLineasOrden())
      .map((clave) => Number(clave))
      .sort((a, b) => a - b);
    for (const indice of filas) {
      const erroresFila = this.erroresLineasOrden()[String(indice)] ?? {};
      if (erroresFila.variante_producto_id !== undefined) {
        this.varianteSelects()[indice]?.nativeElement.focus();
        return;
      }
      if (erroresFila.temporada_id !== undefined) {
        this.temporadaSelects()[indice]?.nativeElement.focus();
        return;
      }
      if (erroresFila.cantidad !== undefined) {
        this.cantidadInputs()[indice]?.nativeElement.focus();
        return;
      }
      if (erroresFila.costo_unitario !== undefined) {
        this.costoInputs()[indice]?.nativeElement.focus();
        return;
      }
    }
  }

  /** Carga los cuatro catálogos del alta; cada 403 solo bloquea su selector. */
  private cargarCatalogosOrden(): void {
    this.cargarProveedores();
    this.cargarTemporadas();
    this.cargarVariantesEmpresa();
    this.cargarSucursalesEmpresa();
  }

  private cargarProveedores(): void {
    this.cargandoProveedores.set(true);
    this.errorProveedores.set(null);
    this.proveedoresSinPermiso.set(false);
    this.sincronizarProveedor();

    this.catalogoService
      .listarProveedores()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (proveedores) => {
          this.proveedores.set(
            [...proveedores].sort((a, b) =>
              a.razon_social.localeCompare(b.razon_social),
            ),
          );
          this.cargandoProveedores.set(false);
          this.sincronizarProveedor();
        },
        error: (error: unknown) => {
          this.proveedores.set([]);
          this.cargandoProveedores.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'compras/proveedores',
          );
          if (normalizado.estado === 403) {
            this.proveedoresSinPermiso.set(true);
          }
          this.errorProveedores.set(normalizado.mensaje);
          this.sincronizarProveedor();
        },
      });
  }

  /**
   * Habilita o deshabilita el selector de proveedor según el catálogo real.
   *
   * Se hace sobre el `FormControl` y no con `[disabled]` en el template: con
   * `formControlName` el estado reactivo siempre gana, así que el atributo del
   * HTML se ignoraba y el select quedaba habilitado sin opciones.
   */
  private sincronizarProveedor(): void {
    const control = this.formOrden.controls.proveedor_id;
    const disponible =
      !this.cargandoProveedores() &&
      this.proveedores().length > 0 &&
      !this.proveedoresSinPermiso();

    if (disponible && control.disabled) {
      control.enable({ emitEvent: false });
      return;
    }
    if (!disponible && control.enabled) {
      control.disable({ emitEvent: false });
    }
  }

  private cargarTemporadas(): void {
    this.cargandoTemporadas.set(true);
    this.errorTemporadas.set(null);
    this.temporadasSinPermiso.set(false);

    this.catalogoService
      .listarTemporadas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (temporadas) => {
          this.temporadas.set(
            [...temporadas].sort((a, b) =>
              a.nombre.localeCompare(b.nombre),
            ),
          );
          this.cargandoTemporadas.set(false);
        },
        error: (error: unknown) => {
          this.temporadas.set([]);
          this.cargandoTemporadas.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'compras/temporadas',
          );
          if (normalizado.estado === 403) {
            this.temporadasSinPermiso.set(true);
          }
          this.errorTemporadas.set(normalizado.mensaje);
        },
      });
  }

  private cargarVariantesEmpresa(): void {
    this.cargandoVariantesEmpresa.set(true);
    this.errorVariantesEmpresa.set(null);
    this.variantesSinPermiso.set(false);

    this.catalogoService
      .listarVariantesEmpresa({ limit: 200, offset: 0 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (variantes) => {
          this.variantesEmpresa.set(
            [...variantes].sort((a, b) => a.sku.localeCompare(b.sku)),
          );
          this.cargandoVariantesEmpresa.set(false);
        },
        error: (error: unknown) => {
          this.variantesEmpresa.set([]);
          this.cargandoVariantesEmpresa.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'compras/variantes',
          );
          if (normalizado.estado === 403) {
            this.variantesSinPermiso.set(true);
          }
          this.errorVariantesEmpresa.set(normalizado.mensaje);
        },
      });
  }

  private cargarSucursalesEmpresa(): void {
    this.cargandoSucursalesEmpresa.set(true);
    this.errorSucursalesEmpresa.set(null);
    this.sucursalesSinPermiso.set(false);

    this.sucursalesService
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursales) => {
          this.sucursalesEmpresa.set(
            [...sucursales]
              .filter((sucursal) => sucursal.estado)
              .sort((a, b) => a.nombre.localeCompare(b.nombre)),
          );
          this.cargandoSucursalesEmpresa.set(false);
        },
        error: (error: unknown) => {
          this.sucursalesEmpresa.set([]);
          this.cargandoSucursalesEmpresa.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'compras/sucursales',
          );
          if (normalizado.estado === 403) {
            this.sucursalesSinPermiso.set(true);
          }
          this.errorSucursalesEmpresa.set(normalizado.mensaje);
        },
      });
  }

  private cargar(): void {
    this.cargando.set(true);
    this.errorListado.set(null);
    this.sinPermiso.set(false);

    this.comprasService
      .listar({
        estado: this.filtroEstado(),
        limit: LIMITE_COMPRAS,
        offset: this.offset(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ordenes) => {
          this.ordenes.set([...ordenes].sort((a, b) => a.id - b.id));
          this.cargando.set(false);
        },
        error: (error: unknown) => {
          this.ordenes.set([]);
          this.cargando.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'compras/listar',
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

    this.comprasService
      .obtener(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          if (this.ordenSeleccionada()?.id !== id) {
            return;
          }
          this.detalle.set(detalle);
          this.ordenSeleccionada.set(detalle);
          this.cargandoDetalle.set(false);
          if (
            this.recepcionAbierta() &&
            (detalle.estado === 'ENVIADA' || detalle.estado === 'PARCIAL')
          ) {
            this.prepararCantidades(detalle);
          }
        },
        error: (error: unknown) => {
          if (this.ordenSeleccionada()?.id !== id) {
            return;
          }
          this.detalle.set(null);
          this.cargandoDetalle.set(false);
          this.errorDetalle.set(
            this.errores.mensajeDeError(error, 'compras/detalle'),
          );
        },
      });
  }

  /** Reinicia las cantidades del formulario según las líneas pendientes. */
  private prepararCantidades(detalle: OrdenCompraDetalle): void {
    const lineas = this.formRecepcion.controls.lineas;
    lineas.clear();
    for (const linea of detalle.lineas) {
      const maximo = Math.max(0, linea.cantidad_pendiente);
      lineas.push(
        new FormControl<number | null>(0, {
          validators: [Validators.min(0), Validators.max(maximo), enteroNoNegativo],
        }),
      );
    }
    this.numeroLineasRecepcion.set(lineas.length);
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

/** Valida un `datetime-local` opcional (vacío es válido). */
function fechaOpcionalValida(control: AbstractControl): ValidationErrors | null {
  const texto = String(control.value ?? '').trim();
  if (texto.length === 0) {
    return null;
  }
  return fechaLocalAIso(texto) === null ? { fechaInvalida: true } : null;
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

/** Exige un entero >= 0 cuando el campo tiene valor. */
function enteroNoNegativo(control: AbstractControl): ValidationErrors | null {
  const valor = control.value;
  if (valor === null || valor === undefined || valor === '') {
    return null;
  }
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 0
    ? null
    : { enteroNoNegativo: true };
}
