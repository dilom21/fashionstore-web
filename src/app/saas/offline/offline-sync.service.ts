import { isPlatformBrowser } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, OnDestroy, PLATFORM_ID, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { detalleDeTexto } from '../services/saas-error.service';
import { SaasClienteService } from '../services/saas-cliente.service';
import { SaasReservasService } from '../services/saas-reservas.service';
import { SaasSessionService } from '../services/saas-session.service';
import { SaasVentasService } from '../services/saas-ventas.service';
import {
  esReintentable,
  OperacionOffline,
  PayloadReservaAccion,
  PayloadReservaCrear,
  PayloadVentaContado,
  ResultadoOperacionOffline,
  ResumenSincronizacion,
} from './offline.models';
import { SaasOfflineQueueService } from './offline-queue.service';
import { SaasConnectivityService } from './saas-connectivity.service';

/** Resultado interno de un intento de envío. */
interface ResultadoEnvio {
  estado: 'confirmado' | 'reintentar' | 'conflicto' | 'error';
  resultado?: ResultadoOperacionOffline;
  codigo?: number;
  detalle?: string;
}

/** Opciones de una sincronización. */
export interface OpcionesSincronizar {
  /** Ignora el backoff y reintenta errores definitivos (botón manual). */
  forzar?: boolean;
  /** Agenda el siguiente reintento automático. Por defecto, `true`. */
  autoReintento?: boolean;
}

/** Códigos HTTP que representan un fallo transitorio de comunicación. */
const ESTADOS_TRANSITORIOS = new Set([0, 408, 429, 500, 502, 504]);

/** Estados finales de las acciones de reserva. */
const ESTADO_ESPERADO: Record<string, string> = {
  RESERVA_CANCELAR: 'CANCELADA',
  RESERVA_FINALIZAR: 'ATENDIDA',
};

/**
 * Drenaje de la cola offline contra los endpoints TENANT reales.
 *
 * Garantías:
 * - Solo usa `/tenant/ventas/contado` y `/tenant/reservas` (nunca rutas
 *   legacy).
 * - Reenvía el MISMO `operacion_id` de la venta: el servidor responde 200
 *   (replay) en lugar de duplicar.
 * - La reserva no acepta clave de idempotencia en su contrato; antes de
 *   reintentar se consulta `GET /tenant/cliente/reservas` y se confirma si ya
 *   existe una reserva con el mismo carrito y hora de atención.
 * - Un 409 se resuelve consultando el estado del servidor: si la operación ya
 *   estaba registrada se marca CONFIRMADO; si no, queda CONFLICTO y se avisa.
 * - Nada se borra por el hecho de enviarse.
 */
@Injectable({ providedIn: 'root' })
export class SaasOfflineSyncService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly queue = inject(SaasOfflineQueueService);
  private readonly connectivity = inject(SaasConnectivityService);
  private readonly sesion = inject(SaasSessionService);
  private readonly ventas = inject(SaasVentasService);
  private readonly reservas = inject(SaasReservasService);
  private readonly cliente = inject(SaasClienteService);

  private readonly _sincronizando = signal(false);
  private readonly _ultimoResumen = signal<ResumenSincronizacion | null>(null);

  /** `true` mientras hay un drenaje en curso. */
  readonly sincronizando = this._sincronizando.asReadonly();

  /** Resultado del último drenaje (para la UI). */
  readonly ultimoResumen = this._ultimoResumen.asReadonly();

  private temporizador: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      // Recuperar conexión dispara un drenaje respetuoso del backoff.
      window.addEventListener('online', this.alRecuperarConexion);
    }
  }

  /**
   * Drena la cola del scope vigente.
   *
   * Nunca lanza: cada operación se clasifica en confirmada, conflicto, error
   * definitivo o reintento programado.
   */
  async sincronizar(
    opciones: OpcionesSincronizar = {},
  ): Promise<ResumenSincronizacion> {
    if (this._sincronizando()) {
      return this.resumenVacio('en-curso');
    }
    if (!this.connectivity.enLinea()) {
      return this.resumenVacio('sin-conexion');
    }
    if (this.queue.scopeActual() === null) {
      return this.resumenVacio('sin-sesion');
    }

    this._sincronizando.set(true);
    const resumen: ResumenSincronizacion = {
      ejecutada: true,
      confirmadas: 0,
      conflictos: 0,
      errores: 0,
      reintentables: 0,
      omitidas: 0,
      motivo: 'ok',
    };

    try {
      const operaciones = await this.queue.listarParaSincronizar(
        opciones.forzar === true,
      );
      if (operaciones.length === 0) {
        return this.cerrarResumen(resumen, 'sin-pendientes');
      }

      for (const operacion of operaciones) {
        if (opciones.forzar === true && !esReintentable(operacion)) {
          await this.queue.reintentar(operacion.operacion_id);
        }
        const actual = await this.releer(operacion);
        if (actual.estado === 'CONFIRMADO' || actual.estado === 'CONFLICTO') {
          // Otra pestaña ya resolvió esta operación.
          resumen.omitidas += 1;
          continue;
        }
        await this.queue.marcarEnviado(actual.operacion_id);
        const resultado = await this.enviar(actual);
        await this.aplicarResultado(actual, resultado);
        switch (resultado.estado) {
          case 'confirmado':
            resumen.confirmadas += 1;
            break;
          case 'conflicto':
            resumen.conflictos += 1;
            break;
          case 'error':
            resumen.errores += 1;
            break;
          case 'reintentar':
            resumen.reintentables += 1;
            break;
        }
      }

      if (opciones.autoReintento !== false) {
        this.programarSiguienteIntento();
      }
      return this.cerrarResumen(resumen, 'ok');
    } catch (error) {
      // IndexedDB no disponible o error local: no se pierde nada, se informa.
      console.error('[offline] No se pudo drenar la cola local.', error);
      return this.cerrarResumen(resumen, 'error-local');
    } finally {
      this._sincronizando.set(false);
    }
  }

  /** Reintenta manualmente una operación concreta. */
  async reintentarUna(operacionId: string): Promise<ResumenSincronizacion> {
    await this.queue.reintentar(operacionId);
    return this.sincronizar({ forzar: true, autoReintento: false });
  }

  // =============================== Envío ================================

  private async enviar(
    operacion: OperacionOffline,
  ): Promise<ResultadoEnvio> {
    switch (operacion.tipo) {
      case 'VENTA_CONTADO':
        return this.enviarVenta(operacion);
      case 'RESERVA_CREAR':
        return this.enviarReservaCrear(operacion);
      case 'RESERVA_CANCELAR':
      case 'RESERVA_FINALIZAR':
        return this.enviarReservaAccion(operacion);
      default:
        return {
          estado: 'error',
          detalle: `Tipo de operación no soportado: ${String(operacion.tipo)}`,
        };
    }
  }

  private async enviarVenta(
    operacion: OperacionOffline,
  ): Promise<ResultadoEnvio> {
    const payload = operacion.payload as PayloadVentaContado;
    try {
      const respuesta = await firstValueFrom(
        this.ventas.registrarContado({
          sucursal_id: payload.sucursal_id,
          metodo_pago: payload.metodo_pago,
          lineas: payload.lineas,
          // El UUID local es la clave de idempotencia del contrato tenant.
          operacion_id: operacion.operacion_id,
        }),
      );
      return {
        estado: 'confirmado',
        resultado: {
          referencia_id: respuesta.venta_id,
          estado: respuesta.estado,
          idempotente: respuesta.idempotente,
        },
      };
    } catch (error: unknown) {
      return this.resolverError(operacion, error);
    }
  }

  private async enviarReservaCrear(
    operacion: OperacionOffline,
  ): Promise<ResultadoEnvio> {
    const payload = operacion.payload as PayloadReservaCrear;
    // Tras un intento previo pudo perderse la respuesta: antes de reenviar se
    // comprueba si el servidor ya registró la reserva (mismo carrito + fecha).
    if (operacion.intentos > 0) {
      const existente = await this.buscarReservaDuplicada(payload);
      if (existente !== null) {
        return {
          estado: 'confirmado',
          resultado: {
            referencia_id: existente,
            estado: 'PENDIENTE',
            idempotente: true,
          },
        };
      }
    }
    try {
      const respuesta = await firstValueFrom(
        this.reservas.crear({
          carrito_id: payload.carrito_id,
          fecha_atencion: payload.fecha_atencion,
          ...(payload.observacion ? { observacion: payload.observacion } : {}),
        }),
      );
      return {
        estado: 'confirmado',
        resultado: {
          referencia_id: respuesta.reserva_id,
          estado: respuesta.estado,
          idempotente: false,
        },
      };
    } catch (error: unknown) {
      return this.resolverError(operacion, error);
    }
  }

  private async enviarReservaAccion(
    operacion: OperacionOffline,
  ): Promise<ResultadoEnvio> {
    const payload = operacion.payload as PayloadReservaAccion;
    try {
      const respuesta = await firstValueFrom(
        operacion.tipo === 'RESERVA_CANCELAR'
          ? this.reservas.cancelar(payload.reserva_id, payload.observacion)
          : this.reservas.finalizarSinCompra(
              payload.reserva_id,
              payload.observacion,
            ),
      );
      return {
        estado: 'confirmado',
        resultado: {
          referencia_id: respuesta.reserva_id,
          estado: respuesta.estado,
          idempotente: false,
        },
      };
    } catch (error: unknown) {
      return this.resolverError(operacion, error);
    }
  }

  // ============================ Clasificación ==========================

  private async resolverError(
    operacion: OperacionOffline,
    error: unknown,
  ): Promise<ResultadoEnvio> {
    if (!(error instanceof HttpErrorResponse)) {
      return { estado: 'reintentar', detalle: mensajeDeError(error) };
    }
    const detalle = mensajeDeError(error);
    if (ESTADOS_TRANSITORIOS.has(error.status)) {
      return { estado: 'reintentar', codigo: error.status, detalle };
    }
    if (error.status === 409) {
      return this.resolverConflicto(operacion, detalle);
    }
    return { estado: 'error', codigo: error.status, detalle };
  }

  /**
   * 409: se comprueba si el servidor ya registró el efecto antes de marcar
   * conflicto. Un rechazo real de stock/estado queda como conflicto visible.
   */
  private async resolverConflicto(
    operacion: OperacionOffline,
    detalle: string,
  ): Promise<ResultadoEnvio> {
    if (operacion.tipo === 'VENTA_CONTADO') {
      // El backend responde 200 en el replay idéntico; un 409 "ya registrada"
      // solo llega si otra capa devuelve el duplicado con ese texto.
      if (/ya\s+(?:estaba|fue|queda)\s+registrad|duplicad|replay|idempotente/i.test(detalle)) {
        return {
          estado: 'confirmado',
          resultado: {
            referencia_id: null,
            estado: null,
            idempotente: true,
          },
        };
      }
      return { estado: 'conflicto', codigo: 409, detalle };
    }

    if (operacion.tipo === 'RESERVA_CREAR') {
      const existente = await this.buscarReservaDuplicada(
        operacion.payload as PayloadReservaCrear,
      );
      if (existente !== null) {
        return {
          estado: 'confirmado',
          resultado: {
            referencia_id: existente,
            estado: 'PENDIENTE',
            idempotente: true,
          },
        };
      }
      return { estado: 'conflicto', codigo: 409, detalle };
    }

    const payload = operacion.payload as PayloadReservaAccion;
    const estado = await this.consultarEstadoReserva(payload.reserva_id);
    const esperado = ESTADO_ESPERADO[operacion.tipo] ?? null;
    if (esperado !== null && estado === esperado) {
      return {
        estado: 'confirmado',
        resultado: {
          referencia_id: payload.reserva_id,
          estado,
          idempotente: true,
        },
      };
    }
    return { estado: 'conflicto', codigo: 409, detalle };
  }

  private async aplicarResultado(
    operacion: OperacionOffline,
    resultado: ResultadoEnvio,
  ): Promise<void> {
    switch (resultado.estado) {
      case 'confirmado':
        await this.queue.marcarConfirmado(
          operacion.operacion_id,
          resultado.resultado ?? {
            referencia_id: null,
            estado: null,
            idempotente: true,
          },
        );
        break;
      case 'conflicto':
        await this.queue.marcarConflicto(
          operacion.operacion_id,
          resultado.codigo ?? 409,
          resultado.detalle ?? 'Conflicto sin detalle del servidor.',
        );
        break;
      case 'error':
        await this.queue.marcarError(
          operacion.operacion_id,
          resultado.detalle ?? 'El servidor rechazó la operación.',
        );
        break;
      case 'reintentar':
        await this.queue.reprogramar(
          operacion.operacion_id,
          resultado.detalle ?? 'Fallo de comunicación.',
        );
        break;
    }
  }

  // ============================== Consultas ============================

  /**
   * Busca en el canal cliente una reserva idéntica ya registrada.
   *
   * Es la verificación de duplicado de `POST /tenant/reservas`, que no acepta
   * clave de idempotencia: mismo carrito y misma hora de atención (±1 s).
   */
  private async buscarReservaDuplicada(
    payload: PayloadReservaCrear,
  ): Promise<number | null> {
    if (this.sesion.contexto() !== 'cliente') {
      return null;
    }
    try {
      const reservas = await firstValueFrom(this.cliente.listarReservas());
      const objetivo = Date.parse(payload.fecha_atencion);
      const coincidencia = reservas.find(
        (reserva) =>
          reserva.carrito_id === payload.carrito_id &&
          reserva.estado !== 'CANCELADA' &&
          Math.abs(Date.parse(reserva.fecha_atencion) - objetivo) <= 1000,
      );
      return coincidencia?.reserva_id ?? null;
    } catch {
      return null;
    }
  }

  /** Estado vigente de una reserva según el contexto de la sesión. */
  private async consultarEstadoReserva(
    reservaId: number,
  ): Promise<string | null> {
    try {
      if (this.sesion.contexto() === 'cliente') {
        const reservas = await firstValueFrom(this.cliente.listarReservas());
        return (
          reservas.find((reserva) => reserva.reserva_id === reservaId)
            ?.estado ?? null
        );
      }
      const reserva = await firstValueFrom(
        this.reservas.obtener(reservaId),
      );
      return reserva.estado;
    } catch {
      return null;
    }
  }

  // ============================== Interno ==============================

  /** Relee la operación porque el pase anterior u otra pestaña pudo cambiarla. */
  private async releer(
    operacion: OperacionOffline,
  ): Promise<OperacionOffline> {
    return (await this.queue.obtener(operacion.operacion_id)) ?? operacion;
  }

  private cerrarResumen(
    resumen: ResumenSincronizacion,
    motivo: ResumenSincronizacion['motivo'],
  ): ResumenSincronizacion {
    const cerrado = { ...resumen, motivo };
    this._ultimoResumen.set(cerrado);
    return cerrado;
  }

  private resumenVacio(
    motivo: ResumenSincronizacion['motivo'],
  ): ResumenSincronizacion {
    const resumen: ResumenSincronizacion = {
      ejecutada: false,
      confirmadas: 0,
      conflictos: 0,
      errores: 0,
      reintentables: 0,
      omitidas: 0,
      motivo,
    };
    this._ultimoResumen.set(resumen);
    return resumen;
  }

  /** Agenda el siguiente intento automático respetando el backoff. */
  private programarSiguienteIntento(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    if (this.temporizador !== null) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
    const fechas = this.queue
      .pendientes()
      .filter(
        (operacion) =>
          operacion.estado === 'PENDIENTE' &&
          operacion.proximo_intento_en !== null,
      )
      .map((operacion) => Date.parse(operacion.proximo_intento_en as string))
      .filter((fecha) => Number.isFinite(fecha));
    if (fechas.length === 0 || !this.connectivity.enLinea()) {
      return;
    }
    const espera = Math.max(1000, Math.min(...fechas) - Date.now());
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.sincronizar();
    }, espera);
  }

  private readonly alRecuperarConexion = (): void => {
    void this.sincronizar();
  };

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      window.removeEventListener('online', this.alRecuperarConexion);
    }
    if (this.temporizador !== null) {
      clearTimeout(this.temporizador);
      this.temporizador = null;
    }
  }
}

/** Mensaje seguro de un error, sin exponer cuerpos completos. */
function mensajeDeError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return (
      detalleDeTexto(error.error) ??
      (error.message.length > 0 ? error.message : `HTTP ${error.status}`)
    );
  }
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'Fallo de comunicación con el servidor.';
}
