import { HttpErrorResponse } from '@angular/common/http';
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AdminIcon } from '../../../administracion/components/admin-icon/admin-icon';
import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import {
  codigoVenta,
  etiquetaCanal,
  formatearFechaHora,
  formatearMonto,
} from '../../../ventas/models/comprobante-venta.model';
import { ConfirmDialog } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { ResultDialog } from '../../../../shared/components/result-dialog/result-dialog';
import { DevolucionEstadoBadge } from '../../components/devolucion-estado-badge/devolucion-estado-badge';
import {
  DevolucionDetalle,
  DevolucionItem,
  codigoDevolucion,
  puedeAprobarDevolucion,
  puedeProcesarDevolucion,
  puedeRechazarDevolucion,
} from '../../models/devolucion.model';
import { DevolucionService } from '../../services/devolucion.service';
import { ProductoImagenService } from '../../services/producto-imagen.service';
import {
  ErrorDevolucion,
  traducirErrorAccionDevolucion,
  traducirErrorDetalleDevolucion,
} from '../../utils/devolucion-error.util';

/** Acciones mutables reales de CU25. */
type AccionDevolucion = 'aprobar' | 'rechazar' | 'procesar';

/** Resultado de la última transición (para el aviso de la pantalla). */
interface ResultadoDevolucion {
  titulo: string;
  mensaje: string;
  tono: 'ok' | 'info' | 'error';
}

/** Datos del modal flotante de éxito (solo tras procesar correctamente). */
interface ResultadoCompletada {
  codigo: string;
  referencia: string;
  unidades: number;
}

/**
 * CU25 - Detalle de una devolución (/personal/devoluciones/:devolucion_id).
 *
 * Muestra el detalle real (`GET /devoluciones/{id}`) y ofrece únicamente las
 * acciones que el estado permite:
 *
 *   SOLICITADA -> RECHAZAR | APROBAR
 *   APROBADA   -> PROCESAR (sp_registrar_devolucion: repone stock)
 *   RECHAZADA  -> sin acciones
 *   COMPLETADA -> sin acciones
 *
 * Aprobar y rechazar NO tocan el inventario; solo PROCESAR repone stock. No hay
 * reembolso financiero ni cambios en `pago` o en la venta original.
 */
@Component({
  selector: 'app-devolucion-detalle-page',
  imports: [
    AdminIcon,
    RouterLink,
    ConfirmDialog,
    ResultDialog,
    DevolucionEstadoBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: [
    './devolucion-detalle-page.css',
    '../../styles/devoluciones-shared.css',
  ],
  templateUrl: './devolucion-detalle-page.html',
})
export class DevolucionDetallePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly devolucionService = inject(DevolucionService);
  private readonly imagenesService = inject(ProductoImagenService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly detalle = signal<DevolucionDetalle | null>(null);
  readonly cargando = signal(true);
  readonly error = signal<ErrorDevolucion | null>(null);

  readonly imagenes = signal<Record<number, string | null>>({});
  readonly accion = signal<AccionDevolucion | null>(null);
  /** Última acción ejecutada (para REINTENTAR sin inventar la acción). */
  private readonly ultimaIntentada = signal<AccionDevolucion | null>(null);
  readonly confirmacion = signal<AccionDevolucion | null>(null);
  readonly errorAccion = signal<ErrorDevolucion | null>(null);
  readonly resultado = signal<ResultadoDevolucion | null>(null);
  /**
   * Modal flotante de éxito. Solo se llena cuando el backend confirma
   * COMPLETADA (nunca antes de terminar el POST).
   */
  readonly completada = signal<ResultadoCompletada | null>(null);

  readonly puedeAprobar = computed(() =>
    puedeAprobarDevolucion(this.detalle()?.estado ?? ''),
  );
  readonly puedeRechazar = computed(() =>
    puedeRechazarDevolucion(this.detalle()?.estado ?? ''),
  );
  readonly puedeProcesar = computed(() =>
    puedeProcesarDevolucion(this.detalle()?.estado ?? ''),
  );
  readonly procesando = computed(() => this.accion() !== null);
  readonly esRechazada = computed(
    () => (this.detalle()?.estado ?? '').toUpperCase() === 'RECHAZADA',
  );
  readonly esCompletada = computed(
    () => (this.detalle()?.estado ?? '').toUpperCase() === 'COMPLETADA',
  );

  readonly codigoDevolucion = codigoDevolucion;
  readonly codigoVenta = codigoVenta;
  readonly formatearMonto = formatearMonto;
  readonly etiquetaCanal = etiquetaCanal;
  readonly formatearFechaHora = formatearFechaHora;

  ngOnInit(): void {
    this.cargar();
  }

  /** Carga el detalle real de la devolución. */
  cargar(): void {
    const parametro = this.route.snapshot.paramMap.get('devolucion_id');
    const id = Number(parametro);

    this.cargando.set(true);
    this.error.set(null);

    if (parametro === null || !Number.isInteger(id) || id <= 0) {
      this.cargando.set(false);
      this.error.set(
        traducirErrorDetalleDevolucion(new HttpErrorResponse({ status: 404 })),
      );
      return;
    }

    this.devolucionService
      .obtenerDevolucion(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.cargando.set(false);
          this.detalle.set(detalle);
          this.cargarImagenes(detalle.items);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          const traducido = traducirErrorDetalleDevolucion(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.detalle.set(null);
          this.error.set(traducido);
        },
      });
  }

  reintentar(): void {
    this.cargar();
  }

  // ===== Acciones según estado =====

  /** Abre el ConfirmDialog de la acción solicitada. */
  solicitar(accion: AccionDevolucion): void {
    if (this.procesando() || !this.accionPermitida(accion)) {
      return;
    }
    this.errorAccion.set(null);
    this.confirmacion.set(accion);
  }

  cancelarConfirmacion(): void {
    this.confirmacion.set(null);
  }

  /** Ejecuta la acción confirmada contra el backend real. */
  confirmarAccion(): void {
    const accion = this.confirmacion();
    this.confirmacion.set(null);
    if (accion === null || this.procesando()) {
      return;
    }
    this.ejecutar(accion);
  }

  reintentarAccion(): void {
    const accion = this.ultimaIntentada();
    if (accion === null || !this.accionPermitida(accion)) {
      this.errorAccion.set(null);
      this.cargar();
      return;
    }
    this.errorAccion.set(null);
    this.ejecutar(accion);
  }

  private ejecutar(accion: AccionDevolucion): void {
    const id = Number(this.detalle()?.devolucion_id);
    if (!Number.isInteger(id) || id <= 0) {
      return;
    }

    this.accion.set(accion);
    this.ultimaIntentada.set(accion);
    this.errorAccion.set(null);
    this.resultado.set(null);

    const peticion =
      accion === 'aprobar'
        ? this.devolucionService.aprobarDevolucion(id)
        : accion === 'rechazar'
          ? this.devolucionService.rechazarDevolucion(id)
          : this.devolucionService.procesarDevolucion(id);

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (detalle) => {
        this.accion.set(null);
        // 1) Se aplica la RESPUESTA REAL del backend.
        this.detalle.set(detalle);
        this.cargarImagenes(detalle.items);

        if (accion === 'procesar') {
          // El feedback de éxito de CU25 es el MODAL, no un banner permanente.
          if (this.esEstado(detalle.estado, 'COMPLETADA')) {
            this.abrirResultado(detalle);
          } else {
            // La respuesta no confirmó COMPLETADA (estado en caché del ORM tras
            // el SP): UNA sola lectura autoritativa. Sin polling.
            this.refrescarEstadoReal(this.idActual(), true);
          }
          return;
        }

        this.resultado.set(this.mensajeResultado(accion));

        // 2) Si la respuesta no confirma el estado objetivo, se hace UNA sola
        //    lectura autoritativa (aprobar/rechazar).
        if (!this.confirmaEstadoEsperado(detalle.estado, accion)) {
          this.refrescarEstadoReal(this.idActual(), false);
        }
      },
      error: (error: unknown) => {
        this.accion.set(null);
        const traducido = traducirErrorAccionDevolucion(error);
        if (traducido.sesionExpirada) {
          this.cerrarSesion();
          return;
        }
        this.errorAccion.set(traducido);
        // Un 409 de disponibilidad obliga a releer el estado real del backend.
        if (traducido.disponibilidadCambiada) {
          this.cargar();
        }
      },
    });
  }

  private accionPermitida(accion: AccionDevolucion): boolean {
    if (accion === 'aprobar') {
      return this.puedeAprobar();
    }
    if (accion === 'rechazar') {
      return this.puedeRechazar();
    }
    return this.puedeProcesar();
  }

  /** Estado que debe reportar el backend tras cada acción. */
  private estadoEsperadoTras(accion: AccionDevolucion): string {
    if (accion === 'aprobar') {
      return 'APROBADA';
    }
    return accion === 'rechazar' ? 'RECHAZADA' : 'COMPLETADA';
  }

  /** ¿La respuesta del backend ya refleja el estado objetivo de la acción? */
  private confirmaEstadoEsperado(
    estado: string,
    accion: AccionDevolucion,
  ): boolean {
    return (
      (estado ?? '').trim().toUpperCase() === this.estadoEsperadoTras(accion)
    );
  }

  /**
   * UNA sola lectura autoritativa (`GET /devoluciones/{id}`) cuando la
   * respuesta de la acción no confirmó el estado objetivo.
   *
   * No es polling ni un segundo `/procesar`: solo sincroniza la pantalla con
   * el estado real (COMPLETADA es terminal) sin destruir el listado.
   * `abrirResultadoSiCompletada` abre el modal de éxito si esa lectura confirma
   * COMPLETADA.
   */
  private refrescarEstadoReal(
    devolucionId: number | null,
    abrirResultadoSiCompletada = false,
  ): void {
    if (devolucionId === null) {
      return;
    }
    this.devolucionService
      .obtenerDevolucion(devolucionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.detalle.set(detalle);
          this.cargarImagenes(detalle.items);
          if (
            abrirResultadoSiCompletada &&
            this.esEstado(detalle.estado, 'COMPLETADA')
          ) {
            this.abrirResultado(detalle);
          }
        },
        error: () => {
          // Sin datos nuevos se conserva la respuesta de la acción.
        },
      });
  }

  /** Compara estados normalizados (mayúsculas, sin espacios). */
  private esEstado(estado: string, esperado: string): boolean {
    return (estado ?? '').trim().toUpperCase() === esperado;
  }

  /**
   * Abre el modal flotante de éxito con datos REALES de la respuesta.
   *
   * Se llama únicamente cuando el backend confirma `COMPLETADA` (nunca antes de
   * terminar el POST ni si la acción falla).
   */
  private abrirResultado(detalle: DevolucionDetalle): void {
    this.completada.set({
      codigo: codigoDevolucion(detalle.devolucion_id),
      referencia: `Venta ${codigoVenta(detalle.venta_id)}`,
      unidades: detalle.cantidad_total_unidades,
    });
  }

  /** Cierra el modal: la página queda en COMPLETADA (estado terminal). */
  cerrarResultado(): void {
    this.completada.set(null);
  }

  /** Texto de unidades con concordancia singular/plural. */
  textoUnidades(unidades: number): string {
    return unidades === 1
      ? 'El inventario fue actualizado con 1 unidad devuelta.'
      : `El inventario fue actualizado con ${unidades} unidades devueltas.`;
  }

  /** `devolucion_id` de la ruta (o del detalle ya cargado). */
  private idActual(): number | null {
    const deLaRuta = Number(this.route.snapshot.paramMap.get('devolucion_id'));
    if (Number.isInteger(deLaRuta) && deLaRuta > 0) {
      return deLaRuta;
    }
    const delDetalle = Number(this.detalle()?.devolucion_id);
    return Number.isInteger(delDetalle) && delDetalle > 0 ? delDetalle : null;
  }

  /** Aviso informativo de las transiciones que NO son el procesado. */
  private mensajeResultado(
    accion: 'aprobar' | 'rechazar',
  ): ResultadoDevolucion {
    if (accion === 'aprobar') {
      return {
        titulo: 'Devolución aprobada',
        mensaje:
          'La solicitud quedó APROBADA. Procésala para reponer las unidades al inventario.',
        tono: 'info',
      };
    }
    return {
      titulo: 'Devolución rechazada',
      mensaje: 'Esta solicitud no modificó el inventario.',
      tono: 'error',
    };
  }

  /** Si la imagen real no carga, se muestra el placeholder (sin reintentos). */
  marcarImagenRota(detalleDevolucionId: number): void {
    this.imagenes.update((actuales) => ({
      ...actuales,
      [detalleDevolucionId]: null,
    }));
  }

  volverAlListado(): void {
    void this.router.navigate(['/personal', 'devoluciones']);
  }

  /** Una sola petición por producto; el mapa se actualiza al resolver. */
  private cargarImagenes(items: ReadonlyArray<DevolucionItem>): void {
    if (items.length === 0) {
      return;
    }
    this.imagenesService
      .imagenesDeLineas(
        items.map((item) => ({
          clave: item.detalle_devolucion_id,
          producto_id: item.producto_id,
          color_nombre: item.color_nombre,
        })),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((mapa) => this.imagenes.set(mapa));
  }

  /** Sesión expirada: mecanismo existente del área de personal. */
  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigate(['/auth/personal/login'], {
      queryParams: { returnUrl: this.router.url },
    });
  }
}
