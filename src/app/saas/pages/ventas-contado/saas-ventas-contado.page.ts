import { DatePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import {
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import {
  MetodoPagoTenant,
  TenantErrorNormalizado,
  TenantInventario,
  TenantSucursal,
  VentaComercialResumen,
  VentaContadoRespuesta,
  VentaContadoSolicitud,
  ComprobanteContadoTenant,
} from '../../models/tenant.models';
import { SaasOfflinePanel } from '../../offline/saas-offline-panel';
import { SaasConnectivityService } from '../../offline/saas-connectivity.service';
import { SaasOfflineQueueService } from '../../offline/offline-queue.service';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasInventarioService } from '../../services/saas-inventario.service';
import { SaasPermissionsService } from '../../services/saas-permissions.service';
import { SaasSucursalesService } from '../../services/saas-sucursales.service';
import { SaasVentasService } from '../../services/saas-ventas.service';
import { formatearBolivianos, formatearMonto } from '../../utils/monto.util';
import {
  etiquetaOpcionInventario,
  maximoCantidadPorStock,
  validarStockLineasVenta,
} from './inventario-opcion.util';
import {
  MAX_CANTIDAD_LINEA,
  MAX_LINEAS_VENTA,
  construirSolicitudContado,
  generarOperacionId,
  validarLineasVenta,
} from './ventas-contado.util';

/** Medio de pago por defecto del contrato. */
const METODO_POR_DEFECTO: MetodoPagoTenant = 'EFECTIVO';

/** Opciones del selector de método de pago (los 5 valores del backend). */
const METODOS_PAGO: ReadonlyArray<{
  valor: MetodoPagoTenant;
  etiqueta: string;
}> = [
  { valor: 'EFECTIVO', etiqueta: 'Efectivo' },
  { valor: 'TARJETA', etiqueta: 'Tarjeta' },
  { valor: 'TRANSFERENCIA', etiqueta: 'Transferencia' },
  { valor: 'QR', etiqueta: 'QR' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

/** Cuántas ventas recientes se consultan (vista mínima id/estado). */
const LIMITE_VENTAS_RECIENTES = 20;

/** Tamaño máximo de inventario que trae el selector (backend: 1..200). */
const LIMITE_INVENTARIO = 200;

/** Clasificación del error para mostrar la explicación correcta. */
type TipoErrorVenta =
  | 'operacion'
  | 'inventario'
  | 'deshabilitado'
  | 'stock'
  | 'validacion'
  | 'otro';

/** Grupo tipado de una línea de venta. */
type LineaVentaForm = FormGroup<{
  inventario_id: FormControl<number | null>;
  cantidad: FormControl<number | null>;
}>;

/**
 * Venta de contado (`POST /tenant/ventas/contado`).
 *
 * Requiere el permiso `VENTAS/REGISTRAR` (la ruta también lo exige) y el
 * backend además limita el rol a ADMINISTRADOR, ENCARGADO_SUCURSAL o CAJERO.
 *
 * El inventario de cada línea se elige de `GET /tenant/inventario` filtrado por
 * la sucursal de la venta (permiso `VENTAS/CONSULTAR`). La opción muestra SKU,
 * producto, talla/color y `stock_disponible`, y la cantidad se limita a
 * `min(MAX_CANTIDAD_LINEA, stock_disponible)`.
 *
 * LIMITACIONES DEL CONTRATO (se advierten en pantalla):
 * - `GET /tenant/comercial/ventas` solo devuelve `{id, estado}` y exige
 *   ADMINISTRADOR; no hay total, líneas ni fecha.
 * - `/auth/tenant/me` no publica `sucursal_id`: se preselecciona la primera
 *   sucursal activa y el usuario puede cambiarla.
 * - El selector pagina hasta 200 filas de inventario por sucursal.
 */
@Component({
  selector: 'app-saas-ventas-contado-page',
  imports: [ReactiveFormsModule, AdminIcon, SaasOfflinePanel, DatePipe],
  styleUrl: './saas-ventas-contado.page.css',
  templateUrl: './saas-ventas-contado.page.html',
})
export class SaasVentasContadoPage {
  private readonly ventasService = inject(SaasVentasService);
  private readonly sucursalesService = inject(SaasSucursalesService);
  private readonly inventarioService = inject(SaasInventarioService);
  private readonly permisos = inject(SaasPermissionsService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly offline = inject(SaasOfflineQueueService);
  private readonly connectivity = inject(SaasConnectivityService);

  readonly metodos = METODOS_PAGO;
  readonly maxLineas = MAX_LINEAS_VENTA;
  readonly maxCantidad = MAX_CANTIDAD_LINEA;

  /** `true` si el rol puede registrar ventas (el backend sigue autorizando). */
  readonly puedeRegistrar = computed(() =>
    this.permisos.puede('VENTAS', 'REGISTRAR'),
  );

  // ============================== Sucursales ==============================

  readonly sucursales = signal<TenantSucursal[]>([]);
  readonly cargandoSucursales = signal(true);
  readonly errorSucursales = signal<string | null>(null);

  readonly sucursalesActivas = computed(() =>
    this.sucursales().filter((sucursal) => sucursal.estado),
  );

  // =============================== Inventario =============================

  readonly inventario = signal<TenantInventario[]>([]);
  readonly cargandoInventario = signal(false);
  readonly errorInventario = signal<string | null>(null);
  readonly inventarioSinPermiso = signal(false);

  /** El inventario mostrado viene de IndexedDB (puede estar desactualizado). */
  readonly inventarioLocal = signal(false);
  readonly inventarioActualizadoEn = signal<string | null>(null);

  /** Las sucursales mostradas vienen de IndexedDB. */
  readonly sucursalesLocales = signal(false);

  // ================================ Formulario ============================

  readonly form = new FormGroup({
    sucursal_id: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(1)],
    }),
    metodo_pago: new FormControl<MetodoPagoTenant>(METODO_POR_DEFECTO, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    lineas: new FormArray<LineaVentaForm>([]),
  });

  /** Número de líneas vigente (el FormArray no es reactivo por sí mismo). */
  readonly numeroLineas = signal(0);

  /** UUID de idempotencia: se conserva en reintentos idénticos. */
  readonly operacionId = signal(generarOperacionId());

  readonly enviando = signal(false);
  readonly error = signal<TenantErrorNormalizado | null>(null);

  /** Errores de validación por fila (solo tras intentar enviar). */
  readonly erroresLineas = signal<
    Record<string, { inventario_id?: string; cantidad?: string }>
  >({});

  readonly mensajeValidacion = signal<string | null>(null);

  /** Resultado real del backend (201 alta o 200 replay). */
  readonly resultado = signal<VentaContadoRespuesta | null>(null);
  readonly comprobante = signal<ComprobanteContadoTenant | null>(null);
  readonly mensajeExito = signal<string | null>(null);

  /** Aviso ámbar cuando la venta quedó en la cola local. */
  readonly avisoOffline = signal<string | null>(null);

  private readonly sucursalInput =
    viewChild<ElementRef<HTMLSelectElement>>('sucursalInput');

  // ============================= Ventas recientes ========================

  readonly ventasRecientes = signal<VentaComercialResumen[]>([]);
  readonly cargandoVentas = signal(true);
  readonly errorVentas = signal<string | null>(null);
  readonly ventasSinPermiso = signal(false);

  constructor() {
    this.agregarLinea();
    // La sucursal define el inventario disponible: se recarga al cambiarla.
    this.form.controls.sucursal_id.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarInventario());
    this.cargarSucursales();
    this.cargarVentasRecientes();
  }

  /** Líneas del formulario para la plantilla. */
  get lineas(): FormArray<LineaVentaForm> {
    return this.form.controls.lineas;
  }

  // ================================ Líneas ===============================

  /** Agrega una línea vacía respetando el máximo del contrato. */
  agregarLinea(): void {
    if (this.lineas.length >= MAX_LINEAS_VENTA) {
      return;
    }
    this.lineas.push(
      new FormGroup({
        inventario_id: new FormControl<number | null>(null, {
          validators: [Validators.min(1)],
        }),
        cantidad: new FormControl<number | null>(null, {
          validators: [Validators.min(1), Validators.max(MAX_CANTIDAD_LINEA)],
        }),
      }),
    );
    this.numeroLineas.set(this.lineas.length);
    this.limpiarErroresLineas();
  }

  /**
   * Aplica el tope de cantidad de una fila tras elegir su inventario.
   *
   * `max` pasa a ser `min(MAX_CANTIDAD_LINEA, stock_disponible)` y se
   * descartan los errores visibles para no marcar una fila ya corregida.
   */
  cambiarInventarioLinea(indice: number): void {
    const grupo = this.lineas.at(indice);
    if (grupo === undefined) {
      return;
    }
    this.aplicarMaximoLinea(grupo);
    this.limpiarErroresLineas();
  }

  /** Cantidad máxima vigente de una fila (tope del contrato y del stock). */
  maximoCantidad(indice: number): number {
    return maximoCantidadPorStock(
      this.inventarioDeLinea(this.lineas.at(indice))?.stock_disponible,
    );
  }

  /** Etiqueta accesible de una opción del selector de inventario. */
  etiquetaInventario(item: TenantInventario): string {
    return etiquetaOpcionInventario(item);
  }

  /** Quita una línea; siempre queda al menos una fila visible. */
  quitarLinea(indice: number): void {
    if (this.lineas.length <= 1) {
      return;
    }
    this.lineas.removeAt(indice);
    this.numeroLineas.set(this.lineas.length);
    this.limpiarErroresLineas();
  }

  /** Descarta los errores de fila cuando la persona corrige los datos. */
  limpiarErroresLineas(): void {
    this.erroresLineas.set({});
    this.mensajeValidacion.set(null);
  }

  /** Mensaje de error visible de un campo de la fila. */
  errorLinea(indice: number, campo: 'inventario_id' | 'cantidad'): string | null {
    return this.erroresLineas()[String(indice)]?.[campo] ?? null;
  }

  /** `true` si la fila ya fue marcada como tocada y su campo es inválido. */
  lineaInvalida(indice: number, campo: 'inventario_id' | 'cantidad'): boolean {
    const grupo = this.lineas.at(indice);
    const control = grupo?.controls[campo];
    return control !== undefined && control.touched && control.invalid;
  }

  readonly puedeAgregarLinea = computed(
    () => this.numeroLineas() < MAX_LINEAS_VENTA,
  );

  readonly puedeQuitarLinea = computed(() => this.numeroLineas() > 1);

  // ================================ Envío ================================

  /**
   * Registra la venta con el `operacion_id` vigente.
   *
   * Ante error NO se limpian las líneas ni se rota el identificador: así el
   * reintento idéntico sigue siendo idempotente.
   */
  enviar(): void {
    if (this.enviando() || !this.puedeRegistrar()) {
      return;
    }

    this.form.markAllAsTouched();
    this.error.set(null);
    this.mensajeExito.set(null);
    this.avisoOffline.set(null);
    this.mensajeValidacion.set(null);
    this.erroresLineas.set({});

    const sucursalId = this.form.controls.sucursal_id.value;
    if (sucursalId === null || !esEnteroPositivo(sucursalId)) {
      this.form.controls.sucursal_id.markAsTouched();
      this.mensajeValidacion.set('Selecciona la sucursal de la venta.');
      this.sucursalInput()?.nativeElement.focus();
      return;
    }

    const entradas = this.lineas.controls.map((linea) => ({
      inventario_id: linea.controls.inventario_id.value,
      cantidad: linea.controls.cantidad.value,
    }));

    const validacion = validarLineasVenta(entradas);
    if (!validacion.ok) {
      const porFila: Record<
        string,
        { inventario_id?: string; cantidad?: string }
      > = {};
      for (const errorLinea of validacion.errores) {
        const clave = String(errorLinea.indice);
        porFila[clave] = {
          ...porFila[clave],
          [errorLinea.campo]: errorLinea.mensaje,
        };
      }
      this.erroresLineas.set(porFila);
      this.mensajeValidacion.set(
        validacion.mensajeGeneral ??
          'Revisa las líneas marcadas antes de registrar la venta.',
      );
      return;
    }

    // El stock del servidor es la autoridad: se valida contra el inventario
    // cargado antes de enviar y se explica el exceso por fila.
    const validacionStock = validarStockLineasVenta(
      entradas,
      this.inventario(),
      MAX_CANTIDAD_LINEA,
    );
    if (!validacionStock.ok) {
      const porFila: Record<
        string,
        { inventario_id?: string; cantidad?: string }
      > = {};
      for (const errorLinea of validacionStock.errores) {
        const clave = String(errorLinea.indice);
        porFila[clave] = {
          ...porFila[clave],
          [errorLinea.campo]: errorLinea.mensaje,
        };
      }
      this.erroresLineas.set(porFila);
      this.mensajeValidacion.set(
        validacionStock.mensajeGeneral ??
          'Revisa las cantidades: no pueden superar el stock disponible.',
      );
      return;
    }

    const dto = construirSolicitudContado({
      sucursalId,
      operacionId: this.operacionId(),
      metodoPago: this.form.controls.metodo_pago.value,
      lineas: validacion.lineas,
    });

    // Sin conexión no se intenta la red: la intención se guarda completa con
    // su UUID para que la sincronización la envíe idempotentemente.
    if (!this.connectivity.enLinea()) {
      void this.guardarEnCola(dto);
      return;
    }

    this.enviando.set(true);

    this.ventasService
      .registrarContado(dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.enviando.set(false);
          this.resultado.set(respuesta);
          this.avisoOffline.set(null);
          this.mensajeExito.set(
            respuesta.idempotente
              ? 'Venta ya registrada (reintento idempotente).'
              : `Venta #${respuesta.venta_id} registrada correctamente.`,
          );
          this.reiniciarVenta();
          this.cargarVentasRecientes();
        },
        error: (error: unknown) => {
          this.enviando.set(false);
          // Sin respuesta del servidor (red caída): se conserva la venta en la
          // cola local. Un 4xx/409/503 sí llegó al servidor y no se encola.
          if (error instanceof HttpErrorResponse && error.status === 0) {
            void this.guardarEnCola(dto);
            return;
          }
          // Las líneas y el operacion_id se conservan para reintentar igual.
          this.error.set(this.errores.normalizar(error, 'ventas/contado'));
        },
      });
  }

  /**
   * Guarda la venta en IndexedDB con su `operacion_id`.
   *
   * No se pierde nada si la pestaña se cierra: la cola sobrevive y se drena al
   * recuperar conexión. El mensaje aclara que el servidor aún no confirmó.
   */
  private async guardarEnCola(dto: VentaContadoSolicitud): Promise<void> {
    this.enviando.set(true);
    try {
      await this.offline.encolar(
        'VENTA_CONTADO',
        {
          sucursal_id: dto.sucursal_id,
          metodo_pago: dto.metodo_pago ?? METODO_POR_DEFECTO,
          lineas: dto.lineas,
        },
        dto.operacion_id,
      );
      this.enviando.set(false);
      this.error.set(null);
      this.resultado.set(null);
      this.avisoOffline.set(
        'Venta guardada en este dispositivo. Se enviará automáticamente al recuperar la conexión y el servidor confirmará stock y total.',
      );
      // No se consulta la red: acabamos de perderla o ya estaba caída. El
      // inventario visible se reconstruye desde la caché local.
      this.reiniciarVenta(false);
      const sucursalId = this.form.controls.sucursal_id.value;
      if (sucursalId !== null) {
        void this.cargarInventarioLocal(sucursalId);
      }
    } catch (error: unknown) {
      this.enviando.set(false);
      this.error.set(this.errores.normalizar(error, 'ventas/offline'));
    }
  }

  /**
   * Prepara una venta nueva: nuevo UUID, una línea vacía y método por defecto.
   *
   * La sucursal se mantiene para no repetir la selección en ventas seguidas.
   * `recargarInventario = false` evita consultar la red cuando la venta acaba
   * de guardarse offline.
   */
  reiniciarVenta(recargarInventario = true): void {
    this.operacionId.set(generarOperacionId());
    this.lineas.clear();
    this.agregarLinea();
    this.form.controls.metodo_pago.setValue(METODO_POR_DEFECTO);
    this.erroresLineas.set({});
    this.mensajeValidacion.set(null);
    this.error.set(null);
    // El backend acaba de mover stock: se refresca el selector si hay sucursal.
    if (recargarInventario && this.form.controls.sucursal_id.value !== null) {
      this.cargarInventario();
    }
  }

  /** Descarta el error de operación reutilizada y abre una venta nueva. */
  iniciarVentaNueva(): void {
    this.resultado.set(null);
    this.mensajeExito.set(null);
    this.avisoOffline.set(null);
    this.reiniciarVenta();
  }

  /** Loads the server-generated receipt without recalculating sale data. */
  verComprobante(): void {
    const venta = this.resultado();
    if (venta === null) return;
    this.ventasService.comprobanteContado(venta.venta_id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (receipt) => this.comprobante.set(receipt) });
  }

  // =============================== Errores ===============================

  /** Tipo de error del último envío (guía la explicación visible). */
  readonly tipoError = computed<TipoErrorVenta | null>(() => {
    const error = this.error();
    if (error === null) {
      return null;
    }
    if (error.estado === 503) {
      return 'deshabilitado';
    }
    if (error.estado === 403) {
      return 'inventario';
    }
    if (error.estado === 409) {
      const texto = `${error.detalle ?? ''} ${error.mensaje}`;
      return /operacion_id\s+reutilizado/i.test(texto)
        ? 'operacion'
        : 'stock';
    }
    if (error.esValidacion) {
      return 'validacion';
    }
    return 'otro';
  });

  // ============================ Presentación =============================

  /** Formato de moneda del backend sin recálculos (`Bs 120.00`). */
  monto(valor: number | string | null | undefined): string {
    return formatearBolivianos(valor);
  }

  /** Monto sin prefijo para columnas ya rotuladas. */
  montoSimple(valor: number | string | null | undefined): string {
    return formatearMonto(valor);
  }

  nombreSucursal(sucursalId: number | null): string {
    if (sucursalId === null) {
      return 'Sin sucursal';
    }
    return (
      this.sucursales().find((sucursal) => sucursal.id === sucursalId)
        ?.nombre ?? `Sucursal #${sucursalId}`
    );
  }

  /** Etiqueta legible del método de pago devuelto por el backend. */
  etiquetaMetodo(metodo: string): string {
    return (
      METODOS_PAGO.find((opcion) => opcion.valor === metodo)?.etiqueta ??
      metodo
    );
  }

  // ============================== Carga de datos =========================

  recargarSucursales(): void {
    if (this.cargandoSucursales()) {
      return;
    }
    this.cargarSucursales();
  }

  recargarVentas(): void {
    if (this.cargandoVentas()) {
      return;
    }
    this.cargarVentasRecientes();
  }

  /** Reintenta el inventario de la sucursal elegida (403 se muestra como aviso). */
  recargarInventario(): void {
    if (this.cargandoInventario()) {
      return;
    }
    this.cargarInventario();
  }

  /** Refresca los datos tras drenar la cola offline. */
  recargarTrasSincronizacion(): void {
    this.avisoOffline.set(null);
    if (!this.connectivity.enLinea()) {
      return;
    }
    this.cargarVentasRecientes();
    this.cargarInventario();
  }

  /** Fila de inventario seleccionada por una línea, si sigue existiendo. */
  private inventarioDeLinea(
    grupo: LineaVentaForm | undefined,
  ): TenantInventario | undefined {
    const inventarioId = grupo?.controls.inventario_id.value ?? null;
    if (inventarioId === null) {
      return undefined;
    }
    return this.inventario().find((item) => item.id === inventarioId);
  }

  /** Ajusta el validador `max` de una cantidad según el stock de la fila. */
  private aplicarMaximoLinea(grupo: LineaVentaForm): void {
    const fila = this.inventarioDeLinea(grupo);
    const maximo = maximoCantidadPorStock(fila?.stock_disponible);
    grupo.controls.cantidad.setValidators([
      Validators.min(1),
      Validators.max(maximo),
    ]);
    grupo.controls.cantidad.updateValueAndValidity({ emitEvent: false });
  }

  /**
   * Limpia selecciones que ya no existen en el inventario de la sucursal.
   *
   * Se conserva la cantidad escrita: si la fila sigue existiendo, la persona
   * solo debe volver a elegir el inventario.
   */
  private limpiarSeleccionesIncompatibles(): void {
    const ids = new Set(this.inventario().map((item) => item.id));
    for (const grupo of this.lineas.controls) {
      const actual = grupo.controls.inventario_id.value;
      if (actual !== null && !ids.has(actual)) {
        grupo.controls.inventario_id.setValue(null);
      }
      this.aplicarMaximoLinea(grupo);
    }
  }

  /** Carga el inventario de la sucursal elegida (tolera 403 sin romper). */
  private cargarInventario(): void {
    const sucursalId = this.form.controls.sucursal_id.value;
    this.errorInventario.set(null);
    this.inventarioSinPermiso.set(false);

    if (sucursalId === null || !esEnteroPositivo(sucursalId)) {
      this.inventario.set([]);
      this.cargandoInventario.set(false);
      this.limpiarSeleccionesIncompatibles();
      return;
    }

    this.cargandoInventario.set(true);

    if (!this.connectivity.enLinea()) {
      void this.cargarInventarioLocal(sucursalId);
      return;
    }

    this.inventarioService
      .listar({ sucursal_id: sucursalId, limit: LIMITE_INVENTARIO, offset: 0 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          // Si la sucursal cambió mientras llegaba la respuesta, se descarta.
          if (this.form.controls.sucursal_id.value !== sucursalId) {
            return;
          }
          this.inventario.set(
            [...items].sort((a, b) => a.sku.localeCompare(b.sku)),
          );
          this.cargandoInventario.set(false);
          this.inventarioLocal.set(false);
          this.inventarioActualizadoEn.set(null);
          this.limpiarSeleccionesIncompatibles();
          void this.cachearInventario(sucursalId, items);
        },
        error: (error: unknown) => {
          if (this.form.controls.sucursal_id.value !== sucursalId) {
            return;
          }
          const normalizado = this.errores.normalizar(
            error,
            'ventas/inventario',
          );
          if (normalizado.estado === 0) {
            void this.cargarInventarioLocal(sucursalId);
            return;
          }
          this.inventario.set([]);
          this.cargandoInventario.set(false);
          this.inventarioLocal.set(false);
          this.limpiarSeleccionesIncompatibles();
          if (normalizado.estado === 403) {
            this.inventarioSinPermiso.set(true);
          }
          this.errorInventario.set(normalizado.mensaje);
        },
      });
  }

  /** Guarda el inventario de la sucursal para vender sin conexión. */
  private async cachearInventario(
    sucursalId: number,
    items: TenantInventario[],
  ): Promise<void> {
    const scope = this.offline.scopeActual();
    if (scope === null) {
      return;
    }
    try {
      await this.offline.guardarInventario(scope, sucursalId, items);
    } catch {
      // La caché es best-effort: no debe romper la venta en línea.
    }
  }

  /** Recupera el inventario cacheado y avisa que puede estar desactualizado. */
  private async cargarInventarioLocal(sucursalId: number): Promise<void> {
    const scope = this.offline.scopeActual();
    const cache =
      scope === null
        ? null
        : await this.offline.leerInventario(scope, sucursalId);
    if (this.form.controls.sucursal_id.value !== sucursalId) {
      return;
    }
    this.cargandoInventario.set(false);
    if (cache === null || cache.datos.length === 0) {
      this.inventario.set([]);
      this.inventarioLocal.set(false);
      this.limpiarSeleccionesIncompatibles();
      this.errorInventario.set(
        'Sin conexión y sin inventario guardado para esta sucursal. La primera carga necesita conexión.',
      );
      return;
    }
    this.inventario.set(
      [...cache.datos].sort((a, b) => a.sku.localeCompare(b.sku)),
    );
    this.inventarioLocal.set(true);
    this.inventarioActualizadoEn.set(cache.actualizado_en);
    this.errorInventario.set(null);
    this.limpiarSeleccionesIncompatibles();
  }

  private cargarSucursales(): void {
    this.cargandoSucursales.set(true);
    this.errorSucursales.set(null);

    if (!this.connectivity.enLinea()) {
      void this.cargarSucursalesLocales();
      return;
    }

    this.sucursalesService
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursales) => {
          this.sucursales.set(
            [...sucursales].sort((a, b) => a.id - b.id),
          );
          this.cargandoSucursales.set(false);
          this.sucursalesLocales.set(false);
          this.preseleccionarSucursal();
          void this.cachearSucursales(sucursales);
        },
        error: (error: unknown) => {
          const normalizado = this.errores.normalizar(
            error,
            'ventas/sucursales',
          );
          if (normalizado.estado === 0) {
            void this.cargarSucursalesLocales();
            return;
          }
          this.sucursales.set([]);
          this.cargandoSucursales.set(false);
          this.sucursalesLocales.set(false);
          this.errorSucursales.set(normalizado.mensaje);
        },
      });
  }

  private async cachearSucursales(
    sucursales: TenantSucursal[],
  ): Promise<void> {
    const scope = this.offline.scopeActual();
    if (scope === null) {
      return;
    }
    try {
      await this.offline.guardarSucursales(scope, sucursales);
    } catch {
      // La caché es best-effort.
    }
  }

  private async cargarSucursalesLocales(): Promise<void> {
    const scope = this.offline.scopeActual();
    const cache =
      scope === null ? null : await this.offline.leerSucursales(scope);
    this.cargandoSucursales.set(false);
    if (cache === null || cache.datos.length === 0) {
      this.sucursales.set([]);
      this.sucursalesLocales.set(false);
      this.errorSucursales.set(
        'Sin conexión y sin sucursales guardadas. Abre esta pantalla una vez con conexión para operar offline.',
      );
      return;
    }
    this.sucursales.set([...cache.datos].sort((a, b) => a.id - b.id));
    this.sucursalesLocales.set(true);
    this.errorSucursales.set(null);
    this.preseleccionarSucursal();
  }

  /**
   * Preselecciona la sucursal de la venta.
   *
   * La sesión tenant NO publica `sucursal_id`, así que se usa la primera
   * sucursal activa. El usuario siempre puede cambiarla en el selector.
   */
  private preseleccionarSucursal(): void {
    if (this.form.controls.sucursal_id.value !== null) {
      return;
    }
    const primera = this.sucursalesActivas()[0];
    this.form.controls.sucursal_id.setValue(primera?.id ?? null);
  }

  private cargarVentasRecientes(): void {
    this.cargandoVentas.set(true);
    this.errorVentas.set(null);
    this.ventasSinPermiso.set(false);

    if (!this.connectivity.enLinea()) {
      this.ventasRecientes.set([]);
      this.cargandoVentas.set(false);
      this.errorVentas.set(
        'Sin conexión: las ventas recientes del servidor no están disponibles. Las ventas guardadas localmente se muestran en la cola offline.',
      );
      return;
    }

    this.ventasService
      .listarVentas(LIMITE_VENTAS_RECIENTES, 0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ventas) => {
          this.ventasRecientes.set(ventas);
          this.cargandoVentas.set(false);
        },
        error: (error: unknown) => {
          this.ventasRecientes.set([]);
          this.cargandoVentas.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'ventas/recientes',
          );
          if (normalizado.estado === 403) {
            this.ventasSinPermiso.set(true);
            return;
          }
          this.errorVentas.set(normalizado.mensaje);
        },
      });
  }
}

/** `true` si el valor es un entero >= 1. */
function esEnteroPositivo(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1;
}
