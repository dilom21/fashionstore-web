import { DatePipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { AdminIcon } from '../../features/administracion/components/admin-icon/admin-icon';
import { SaasSessionService } from '../services/saas-session.service';
import {
  esOperacionPendiente,
  etiquetaEstadoOffline,
  etiquetaTipoOperacion,
  OperacionOffline,
  ResumenSincronizacion,
  TipoOperacionOffline,
} from './offline.models';
import { SaasOfflineQueueService } from './offline-queue.service';
import { SaasOfflineSyncService } from './offline-sync.service';
import { SaasConnectivityService } from './saas-connectivity.service';

/**
 * Indicador de conexión, contador de pendientes y sincronización manual.
 *
 * Se usa en dos modos:
 * - `compacto` en la cabecera del shell (estado + contador + botón).
 * - `panel` en las pantallas comerciales, con el detalle por operación, los
 *   conflictos y las acciones de reintento/descarte.
 *
 * Limitación de filtrado por tipo: la cola SIEMPRE se separa por empresa y
 * usuario; `tipos` solo oculta en pantalla operaciones de otro módulo.
 */
@Component({
  selector: 'app-saas-offline-panel',
  imports: [AdminIcon, DatePipe],
  templateUrl: './saas-offline-panel.html',
  styleUrl: './saas-offline-panel.css',
})
export class SaasOfflinePanel {
  private readonly queue = inject(SaasOfflineQueueService);
  private readonly sync = inject(SaasOfflineSyncService);
  private readonly connectivity = inject(SaasConnectivityService);
  private readonly sesion = inject(SaasSessionService);

  /** Tipos que muestra el panel; `null` muestra todos. */
  readonly tipos = input<readonly TipoOperacionOffline[] | null>(null);

  /** Modo compacto para la cabecera del shell. */
  readonly compacto = input(false);

  /** Emite tras un drenaje real para que la página refresque sus datos. */
  readonly sincronizado = output<void>();

  readonly enLinea = this.connectivity.enLinea;
  readonly sincronizando = this.sync.sincronizando;
  readonly cargando = this.queue.cargando;

  /** Resultado del último intento, en lenguaje claro. */
  readonly mensaje = signal<string | null>(null);

  readonly visibles = computed(() => {
    const tipos = this.tipos();
    return [...this.queue.operaciones()]
      .filter(
        (operacion) => tipos === null || tipos.includes(operacion.tipo),
      )
      .sort((a, b) => b.creada_en.localeCompare(a.creada_en));
  });

  readonly pendientes = computed(() =>
    this.visibles().filter(esOperacionPendiente),
  );

  readonly conflictos = computed(() =>
    this.visibles().filter((operacion) => operacion.estado === 'CONFLICTO'),
  );

  readonly confirmadas = computed(() =>
    this.visibles().filter((operacion) => operacion.estado === 'CONFIRMADO'),
  );

  constructor() {
    // Carga la cola del scope y drena al entrar, al hidratar la sesión o al
    // recuperar conexión. El efecto no escribe señales que vuelva a leer.
    effect(() => {
      const enLinea = this.connectivity.enLinea();
      const haySesion = this.sesion.sesion() !== null;
      void this.queue.cargar();
      if (enLinea && haySesion) {
        void this.sync.sincronizar().then((resumen) => {
          if (huboCambios(resumen)) {
            this.sincronizado.emit();
          }
        });
      }
    });
  }

  /** Sincronización manual: ignora el backoff y reintenta errores. */
  async sincronizarAhora(): Promise<void> {
    if (!this.enLinea() || this.sincronizando()) {
      return;
    }
    this.mensaje.set(null);
    try {
      const resumen = await this.sync.sincronizar({ forzar: true });
      this.mensaje.set(describirResumen(resumen.confirmadas, resumen.conflictos, resumen.errores));
      if (huboCambios(resumen)) {
        this.sincronizado.emit();
      }
    } catch {
      this.mensaje.set(
        'No se pudo completar la sincronización. Las operaciones siguen guardadas localmente.',
      );
    }
  }

  async reintentar(operacion: OperacionOffline): Promise<void> {
    if (!this.enLinea() || this.sincronizando()) {
      return;
    }
    this.mensaje.set(null);
    try {
      await this.sync.reintentarUna(operacion.operacion_id);
    } catch {
      this.mensaje.set(
        'No se pudo reintentar. La operación permanece en la cola local.',
      );
    }
  }

  async descartar(operacion: OperacionOffline): Promise<void> {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Se borrará esta operación de la cola local. El servidor no la registró. ¿Descartar?',
      )
    ) {
      return;
    }
    await this.queue.descartar(operacion.operacion_id);
    this.mensaje.set(
      `Se descartó localmente la operación ${operacion.operacion_id}.`,
    );
  }

  tipo(operacion: OperacionOffline): string {
    return etiquetaTipoOperacion(operacion.tipo);
  }

  estado(operacion: OperacionOffline): string {
    return etiquetaEstadoOffline(operacion.estado);
  }

  /** Detalle visible del último error o conflicto. */
  detalle(operacion: OperacionOffline): string | null {
    if (operacion.conflicto !== null) {
      return `HTTP ${operacion.conflicto.codigo}: ${operacion.conflicto.detalle}`;
    }
    return operacion.ultimo_error;
  }

  /** Código corto del UUID para no romper la tabla. */
  referencia(operacion: OperacionOffline): string {
    return operacion.operacion_id.slice(0, 8);
  }
}

/** `true` si el drenaje cambió el estado de alguna operación. */
function huboCambios(resumen: ResumenSincronizacion): boolean {
  return resumen.confirmadas + resumen.conflictos + resumen.errores > 0;
}

function describirResumen(
  confirmadas: number,
  conflictos: number,
  errores: number,
): string {
  const partes: string[] = [];
  if (confirmadas > 0) {
    partes.push(`${confirmadas} confirmada(s)`);
  }
  if (conflictos > 0) {
    partes.push(`${conflictos} en conflicto`);
  }
  if (errores > 0) {
    partes.push(`${errores} rechazada(s)`);
  }
  if (partes.length === 0) {
    return 'No había operaciones pendientes de envío.';
  }
  return `Sincronización terminada: ${partes.join(' · ')}.`;
}
