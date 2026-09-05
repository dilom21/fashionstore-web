import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { BitacoraDetalleDialog } from '../../components/bitacora-detalle-dialog/bitacora-detalle-dialog';
import {
  BitacoraEvento,
  BitacoraUsuarioFiltro,
} from '../../models/bitacora.model';
import { BitacoraService } from '../../services/bitacora.service';
import { traducirErrorBitacora } from '../../utils/http-error.util';
import {
  esEventoDeSistema,
  humanizarBitacora,
  humanizarCodigo,
  textoDescripcionEvento,
  textoIpEvento,
  textoRolEvento,
  textoUsuarioEvento,
} from '../../utils/humanizar.util';

/** Tamaños de página permitidos por el backend (máximo 100). */
const OPCIONES_LIMITE = [25, 50, 100] as const;

/**
 * Convierte el valor de un input date (YYYY-MM-DD) a un instante ISO sin zona
 * horaria. El backend interpreta las fechas sin timezone como UTC. Para
 * "fecha_hasta" se envía el final del día para incluir todo ese día.
 */
function instanteISO(fecha: string, finDeDia: boolean): string | undefined {
  const valor = fecha.trim();
  if (valor.length === 0) {
    return undefined;
  }
  return finDeDia ? `${valor}T23:59:59` : `${valor}T00:00:00`;
}

/**
 * Consultar Bitácora del Sistema (CU05) - /admin/seguridad/bitacora.
 *
 * Pantalla de auditoría SOLO LECTURA: listado paginado con búsqueda y filtros
 * reales (usuario, acción, entidad, rango de fechas). Nunca carga toda la
 * bitácora en memoria: usa total/limit/offset devueltos por GET /bitacora.
 * Los catálogos de los selects vienen de GET /bitacora/catalogos (jamás se
 * hardcodean acciones ni entidades).
 */
@Component({
  selector: 'app-bitacora-page',
  imports: [ReactiveFormsModule, DatePipe, BitacoraDetalleDialog],
  styleUrls: ['./bitacora-page.css', './bitacora-page-tabla.css'],
  templateUrl: './bitacora-page.html',
})
export class BitacoraPage {
  private readonly bitacoraService = inject(BitacoraService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly items = signal<BitacoraEvento[]>([]);
  readonly total = signal(0);
  readonly limit = signal(50);
  readonly offset = signal(0);

  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);

  readonly cargandoCatalogos = signal(false);
  readonly errorCatalogos = signal<string | null>(null);
  readonly acciones = signal<string[]>([]);
  readonly entidades = signal<string[]>([]);
  readonly usuariosCatalogo = signal<BitacoraUsuarioFiltro[]>([]);

  readonly detalleId = signal<number | null>(null);

  readonly opcionesLimite = OPCIONES_LIMITE;

  readonly filtros = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    usuarioId: new FormControl<number | null>(null),
    accion: new FormControl('', { nonNullable: true }),
    entidad: new FormControl('', { nonNullable: true }),
    fechaDesde: new FormControl('', { nonNullable: true }),
    fechaHasta: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.filtros.controls.usuarioId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.aplicarFiltros());
    this.filtros.controls.accion.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.aplicarFiltros());
    this.filtros.controls.entidad.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.aplicarFiltros());
    this.filtros.controls.fechaDesde.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.aplicarFiltros());
    this.filtros.controls.fechaHasta.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.aplicarFiltros());
  }

  /** Delegaciones de presentación para el template. */
  readonly esSistema = esEventoDeSistema;
  readonly textoUsuario = textoUsuarioEvento;
  readonly textoRol = textoRolEvento;
  readonly textoIp = textoIpEvento;
  readonly textoDescripcion = textoDescripcionEvento;

  /** true cuando el rango "desde" es posterior a "hasta" (sin enviar). */
  readonly rangoInvalido = computed(() => {
    const desde = this.filtros.controls.fechaDesde.value;
    const hasta = this.filtros.controls.fechaHasta.value;
    if (desde.length === 0 || hasta.length === 0) {
      return false;
    }
    return desde > hasta;
  });

  /** true cuando hay al menos un filtro con valor. */
  readonly filtrosActivos = computed(() => {
    const v = this.filtros.getRawValue();
    return Boolean(
      v.buscar.trim() ||
        v.usuarioId ||
        v.accion ||
        v.entidad ||
        v.fechaDesde ||
        v.fechaHasta,
    );
  });

  ngOnInit(): void {
    this.cargarCatalogos();
    this.cargarBitacora(0);
  }

  /** Humaniza un valor de la tabla o de las opciones de filtro. */
  humanizar(valor: string): string {
    return humanizarCodigo(valor);
  }

  humanizarEntidad(valor: string | null): string {
    return humanizarBitacora(valor);
  }

  // ===== Filtros =====

  /** Reacciona a los selects/fechas: vuelve a la primera página. */
  private aplicarFiltros(): void {
    this.cargarBitacora(0);
  }

  buscar(): void {
    this.cargarBitacora(0);
  }

  limpiarFiltros(): void {
    this.filtros.reset(
      {
        buscar: '',
        usuarioId: null,
        accion: '',
        entidad: '',
        fechaDesde: '',
        fechaHasta: '',
      },
      { emitEvent: false },
    );
    this.cargarBitacora(0);
  }

  // ===== Paginación =====

  cambiarLimite(evento: Event): void {
    const limite = Number((evento.target as HTMLSelectElement).value);
    this.limit.set(limite);
    this.cargarBitacora(0);
  }

  irAnterior(): void {
    if (!this.hayAnterior()) {
      return;
    }
    this.cargarBitacora(Math.max(0, this.offset() - this.limit()));
  }

  irSiguiente(): void {
    if (!this.haySiguiente()) {
      return;
    }
    this.cargarBitacora(this.offset() + this.limit());
  }

  hayAnterior(): boolean {
    return !this.cargando() && this.offset() > 0;
  }

  haySiguiente(): boolean {
    return (
      !this.cargando() &&
      this.total() > this.offset() + this.items().length
    );
  }

  inicioVisible(): number {
    return this.total() === 0 ? 0 : this.offset() + 1;
  }

  finVisible(): number {
    if (this.total() === 0) {
      return 0;
    }
    return Math.min(this.total(), this.offset() + this.items().length);
  }

  paginaActual(): number {
    return this.limit() > 0 ? Math.floor(this.offset() / this.limit()) + 1 : 1;
  }

  totalPaginas(): number {
    return this.limit() > 0 ? Math.ceil(this.total() / this.limit()) : 0;
  }

  // ===== Detalle =====

  verDetalle(evento: BitacoraEvento): void {
    this.detalleId.set(evento.id);
  }

  cerrarDetalle(): void {
    this.detalleId.set(null);
  }

  // ===== Reintentos =====

  reintentar(): void {
    this.cargarBitacora(this.offset());
  }

  // ===== Carga de datos =====

  private cargarBitacora(offset: number): void {
    if (this.rangoInvalido()) {
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    this.offset.set(offset);

    const valores = this.filtros.getRawValue();
    this.bitacoraService
      .listarBitacora({
        buscar: valores.buscar.trim() || undefined,
        usuario_id: valores.usuarioId ?? undefined,
        accion: valores.accion || undefined,
        entidad_afectada: valores.entidad || undefined,
        fecha_desde: instanteISO(valores.fechaDesde, false),
        fecha_hasta: instanteISO(valores.fechaHasta, true),
        limit: this.limit(),
        offset,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.cargando.set(false);
          this.items.set(respuesta.items);
          this.total.set(respuesta.total);
          this.limit.set(respuesta.limit);
          this.offset.set(respuesta.offset);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.items.set([]);
          this.total.set(0);
          this.manejarError(error, 'lista');
        },
      });
  }

  cargarCatalogos(): void {
    this.cargandoCatalogos.set(true);
    this.errorCatalogos.set(null);

    this.bitacoraService
      .obtenerCatalogos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (catalogos) => {
          this.cargandoCatalogos.set(false);
          this.acciones.set(catalogos.acciones);
          this.entidades.set(catalogos.entidades);
          this.usuariosCatalogo.set(catalogos.usuarios);
        },
        error: (error: unknown) => {
          this.cargandoCatalogos.set(false);
          this.manejarError(error, 'catalogos');
        },
      });
  }

  private manejarError(error: unknown, destino: 'lista' | 'catalogos'): void {
    const traducido = traducirErrorBitacora(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    if (destino === 'catalogos') {
      this.errorCatalogos.set(traducido.mensaje);
      return;
    }
    this.error.set(traducido.mensaje);
  }
}
