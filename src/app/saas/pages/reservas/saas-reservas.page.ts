import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import {
  ReservaComercial,
  TenantErrorNormalizado,
} from '../../models/tenant.models';
import { SaasOfflinePanel } from '../../offline/saas-offline-panel';
import { SaasOfflineQueueService } from '../../offline/offline-queue.service';
import { SaasConnectivityService } from '../../offline/saas-connectivity.service';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasReservasService } from '../../services/saas-reservas.service';
import { generarOperacionId } from '../../utils/operacion-id.util';

/** Tamaño de página del listado (backend: máx. 100, default 50). */
const LIMITE_RESERVAS = 50;

/** Máximo de la observación opcional de las dos acciones. */
const MAX_OBSERVACION = 500;

/** Acción transaccional disponible sobre una reserva. */
type TipoAccionReserva = 'cancelar' | 'finalizar-sin-compra';

/** Acción pendiente de confirmación en el diálogo. */
interface AccionReservaPendiente {
  tipo: TipoAccionReserva;
  reserva: ReservaComercial;
}

/** Clasificación del error de la acción para explicar la causa. */
type TipoErrorAccion = 'permiso' | 'deshabilitado' | 'conflicto' | 'otro';

/**
 * Reservas comerciales (`/tenant/comercial/reservas`).
 *
 * LIMITACIONES DEL CONTRATO (se advierten en pantalla):
 * - El listado y el detalle exigen rol ADMINISTRADOR y solo devuelven
 *   `{id, estado}`: no hay prendas, cliente, sucursal ni fecha.
 * - No existe listado por sucursal, ni confirmación de reserva, ni detalle
 *   ampliado. La pantalla no inventa esos datos.
 * - Las acciones son `cancelar` y `finalizar-sin-compra`; el backend valida el
 *   rol y el estado, y puede responder 403/409/503.
 * - El backend no publica el total de reservas: se pagina con `offset` y una
 *   página completa habilita "Siguiente".
 */
@Component({
  selector: 'app-saas-reservas-page',
  imports: [ReactiveFormsModule, AdminIcon, SaasOfflinePanel],
  styleUrl: './saas-reservas.page.css',
  templateUrl: './saas-reservas.page.html',
})
export class SaasReservasPage {
  private readonly reservasService = inject(SaasReservasService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly offline = inject(SaasOfflineQueueService);
  private readonly connectivity = inject(SaasConnectivityService);

  readonly limite = LIMITE_RESERVAS;
  readonly maxObservacion = MAX_OBSERVACION;

  // =============================== Listado ===============================

  readonly reservas = signal<ReservaComercial[]>([]);
  readonly cargando = signal(true);
  readonly errorListado = signal<string | null>(null);

  /** `true` cuando el listado respondió 403 (estado informativo, no fatal). */
  readonly sinPermiso = signal(false);

  /** Número de página (0-based); `offset = pagina * limite`. */
  readonly pagina = signal(0);
  readonly offset = computed(() => this.pagina() * LIMITE_RESERVAS);

  /** El backend no envía total: solo se avanza con una página completa. */
  readonly hayPaginaSiguiente = computed(
    () => this.reservas().length === LIMITE_RESERVAS,
  );

  readonly textoRango = computed(() => {
    const total = this.reservas().length;
    if (total === 0) {
      return 'Sin resultados en esta página';
    }
    const desde = this.offset() + 1;
    return `Mostrando ${desde}–${this.offset() + total} · página ${this.pagina() + 1}`;
  });

  // =============================== Acciones ==============================

  readonly accion = signal<AccionReservaPendiente | null>(null);
  readonly ejecutando = signal(false);
  readonly errorAccion = signal<TenantErrorNormalizado | null>(null);

  /** Observación opcional (máx. 500); vacía se omite del cuerpo. */
  readonly formObservacion = new FormGroup({
    observacion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_OBSERVACION)],
    }),
  });

  readonly mensajeExito = signal<string | null>(null);

  /** Aviso ámbar cuando la acción de reserva quedó en la cola local. */
  readonly avisoOffline = signal<string | null>(null);

  /** Elemento que abrió el diálogo, para devolverle el foco al cerrarlo. */
  private focoPrevio: HTMLElement | null = null;

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

  // =============================== Diálogo ==============================

  abrirAccion(
    tipo: TipoAccionReserva,
    reserva: ReservaComercial,
    evento?: Event,
  ): void {
    if (this.ejecutando()) {
      return;
    }
    const disparador = evento?.currentTarget;
    this.focoPrevio = disparador instanceof HTMLElement ? disparador : null;
    this.formObservacion.reset({ observacion: '' });
    this.errorAccion.set(null);
    this.mensajeExito.set(null);
    this.avisoOffline.set(null);
    this.accion.set({ tipo, reserva });
  }

  cerrarAccion(): void {
    if (this.ejecutando()) {
      return;
    }
    this.accion.set(null);
    this.errorAccion.set(null);
    this.formObservacion.reset({ observacion: '' });
    this.restaurarFoco();
  }

  /**
   * Mantiene el foco dentro del diálogo mientras está abierto
   * (`role="dialog" aria-modal="true"`).
   */
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

  /** Ejecuta la acción confirmada y refresca el listado con su resultado. */
  confirmarAccion(): void {
    const pendiente = this.accion();
    if (pendiente === null || this.ejecutando()) {
      return;
    }

    this.formObservacion.markAllAsTouched();
    this.errorAccion.set(null);
    this.mensajeExito.set(null);
    this.avisoOffline.set(null);

    if (this.formObservacion.invalid) {
      return;
    }

    const observacion = this.formObservacion.controls.observacion.value;

    // Sin conexión la acción se guarda completa (con UUID local) y se
    // sincroniza al recuperar red. El servidor sigue siendo la autoridad.
    if (!this.connectivity.enLinea()) {
      void this.guardarAccionEnCola(pendiente, observacion);
      return;
    }

    const peticion =
      pendiente.tipo === 'cancelar'
        ? this.reservasService.cancelar(pendiente.reserva.id, observacion)
        : this.reservasService.finalizarSinCompra(
            pendiente.reserva.id,
            observacion,
          );

    this.ejecutando.set(true);

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (respuesta) => {
        this.ejecutando.set(false);
        this.accion.set(null);
        this.formObservacion.reset({ observacion: '' });
        this.mensajeExito.set(
          pendiente.tipo === 'cancelar'
            ? `Reserva #${respuesta.reserva_id} cancelada (estado ${respuesta.estado}).`
            : `Reserva #${respuesta.reserva_id} finalizada sin compra (estado ${respuesta.estado}).`,
        );
        this.restaurarFoco();
        this.cargar();
      },
      error: (error: unknown) => {
        this.ejecutando.set(false);
        if (error instanceof HttpErrorResponse && error.status === 0) {
          void this.guardarAccionEnCola(pendiente, observacion);
          return;
        }
        this.errorAccion.set(
          this.errores.normalizar(error, 'reservas/accion'),
        );
      },
    });
  }

  /** Guarda una acción de reserva en IndexedDB para enviarla más tarde. */
  private async guardarAccionEnCola(
    pendiente: AccionReservaPendiente,
    observacion: string,
  ): Promise<void> {
    this.ejecutando.set(true);
    const texto = observacion.trim();
    try {
      await this.offline.encolar(
        pendiente.tipo === 'cancelar'
          ? 'RESERVA_CANCELAR'
          : 'RESERVA_FINALIZAR',
        {
          reserva_id: pendiente.reserva.id,
          ...(texto.length > 0 ? { observacion: texto } : {}),
        },
        generarOperacionId(),
      );
      this.ejecutando.set(false);
      this.accion.set(null);
      this.formObservacion.reset({ observacion: '' });
      this.avisoOffline.set(
        pendiente.tipo === 'cancelar'
          ? `La cancelación de la reserva #${pendiente.reserva.id} quedó guardada en este dispositivo y se enviará al recuperar la conexión.`
          : `El cierre de la reserva #${pendiente.reserva.id} quedó guardado en este dispositivo y se enviará al recuperar la conexión.`,
      );
      this.restaurarFoco();
      if (this.connectivity.enLinea()) {
        this.cargar();
      }
    } catch (error: unknown) {
      this.ejecutando.set(false);
      this.errorAccion.set(
        this.errores.normalizar(error, 'reservas/offline'),
      );
    }
  }

  /** Refresca el listado tras una sincronización de la cola local. */
  recargarTrasSincronizacion(): void {
    this.avisoOffline.set(null);
    this.cargar();
  }

  /** Tipo de error de la acción (guía la explicación visible). */
  readonly tipoErrorAccion = computed<TipoErrorAccion | null>(() => {
    const error = this.errorAccion();
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
    return 'otro';
  });

  /** Título del diálogo según la acción. */
  tituloAccion(pendiente: AccionReservaPendiente): string {
    return pendiente.tipo === 'cancelar'
      ? `Cancelar la reserva #${pendiente.reserva.id}`
      : `Finalizar sin compra la reserva #${pendiente.reserva.id}`;
  }

  // =============================== Interno ==============================

  private cargar(): void {
    this.cargando.set(true);
    this.errorListado.set(null);
    this.sinPermiso.set(false);

    this.reservasService
      .listar(LIMITE_RESERVAS, this.offset())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (reservas) => {
          this.reservas.set(
            [...reservas].sort((a, b) => a.id - b.id),
          );
          this.cargando.set(false);
        },
        error: (error: unknown) => {
          this.reservas.set([]);
          this.cargando.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'reservas/listar',
          );
          if (normalizado.estado === 403) {
            this.sinPermiso.set(true);
            return;
          }
          this.errorListado.set(normalizado.mensaje);
        },
      });
  }

  /** Devuelve el foco al botón que abrió el diálogo. */
  private restaurarFoco(): void {
    const previo = this.focoPrevio;
    this.focoPrevio = null;
    if (previo !== null) {
      previo.focus();
    }
  }
}
