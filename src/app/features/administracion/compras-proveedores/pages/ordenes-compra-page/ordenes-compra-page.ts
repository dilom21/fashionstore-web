import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { ConfirmDialog } from '../../../../../shared/components/confirm-dialog/confirm-dialog';
import { Sucursal } from '../../../inventario/models/sucursal.model';
import { SucursalesService } from '../../../inventario/services/sucursales.service';
import { OrdenCompraDetalleDialog } from '../../components/orden-compra-detalle-dialog/orden-compra-detalle-dialog';
import { OrdenCompraDetallesDialog } from '../../components/orden-compra-detalles-dialog/orden-compra-detalles-dialog';
import { OrdenCompraFormDialog } from '../../components/orden-compra-form-dialog/orden-compra-form-dialog';
import {
  ESTADOS_ORDEN_COMPRA,
  EstadoOrdenCompra,
  OrdenCompra,
} from '../../models/orden-compra.model';
import { Proveedor } from '../../models/proveedor.model';
import { OrdenesCompraService } from '../../services/ordenes-compra.service';
import { ProveedoresService } from '../../services/proveedores.service';
import { traducirErrorOrdenesCompra } from '../../utils/ordenes-compra-error.util';
import {
  etiquetaEstado as etiquetaEstadoOrden,
  formatearFecha as formatearFechaTexto,
  puedeCancelar as puedeCancelarOrden,
  puedeEditarCabecera,
  puedeEnviar as puedeEnviarOrden,
  puedeGestionarDetalles,
  puedeRecibir as puedeRecibirOrden,
} from '../../utils/ordenes-compra.util';

/** Acción de cambio de estado pendiente de confirmación. */
type TipoAccion = 'enviar' | 'cancelar' | 'recibir';

/** Confirmación activa (enviar/cancelar/recibir). */
interface ConfirmacionAccion {
  tipo: TipoAccion;
  orden: OrdenCompra;
}

/** Diálogo de detalles (editable o solo lectura). */
interface GestionDetalles {
  orden: OrdenCompra;
  soloLectura: boolean;
}

/** Opción del filtro de estado (incluye "todos"). */
type FiltroEstado = EstadoOrdenCompra | 'TODOS';

/**
 * Gestionar compras a proveedores (CU12) -
 * /admin/compras-proveedores/ordenes-compra.
 *
 * Lista, crea y edita órdenes de compra, gestiona sus detalles y ejecuta
 * enviar/cancelar/recibir. El backend es la autoridad final: el frontend solo
 * decide qué acciones ofrecer y muestra el `detail` real ante 403/404/409/422.
 *
 * El listado NO calcula un total monetario (evita N+1): solo muestra
 * `total_detalles`. El total económico se ve en el detalle de la orden, donde
 * sí se cargan sus detalles.
 *
 * La recepción es crítica y anti doble click: un solo POST, botón bloqueado y
 * sin actualizar inventario desde Angular.
 */
@Component({
  selector: 'app-ordenes-compra-page',
  imports: [
    ReactiveFormsModule,
    ConfirmDialog,
    OrdenCompraFormDialog,
    OrdenCompraDetalleDialog,
    OrdenCompraDetallesDialog,
  ],
  styleUrls: ['./ordenes-compra-page.css', './ordenes-compra-page-tabla.css'],
  templateUrl: './ordenes-compra-page.html',
})
export class OrdenesCompraPage {
  private readonly ordenesService = inject(OrdenesCompraService);
  private readonly proveedoresService = inject(ProveedoresService);
  private readonly sucursalesService = inject(SucursalesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly estados = ESTADOS_ORDEN_COMPRA;

  readonly ordenes = signal<OrdenCompra[]>([]);
  readonly proveedores = signal<Proveedor[]>([]);
  readonly sucursales = signal<Sucursal[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);

  /** Acción en curso (evita doble envío y bloquea botones). */
  readonly accionEnCurso = signal<{ id: number; tipo: TipoAccion } | null>(null);
  readonly procesando = computed(() => this.accionEnCurso() !== null);

  // ===== Diálogos =====
  readonly dialogoFormAbierto = signal(false);
  readonly ordenEnForm = signal<OrdenCompra | null>(null);
  readonly detalleOrden = signal<OrdenCompra | null>(null);
  readonly gestion = signal<GestionDetalles | null>(null);
  readonly confirmacion = signal<ConfirmacionAccion | null>(null);

  readonly filtros = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    proveedorId: new FormControl<number | null>(null),
    sucursalId: new FormControl<number | null>(null),
    estado: new FormControl<FiltroEstado>('TODOS', { nonNullable: true }),
    fechaDesde: new FormControl('', { nonNullable: true }),
    fechaHasta: new FormControl('', { nonNullable: true }),
  });

  constructor() {
    this.filtros.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarOrdenes());
  }

  ngOnInit(): void {
    this.cargarCatalogos();
    this.cargarOrdenes();
  }

  // ===== Listado y filtros =====

  buscar(): void {
    this.cargarOrdenes();
  }

  limpiarFiltros(): void {
    this.filtros.reset(
      {
        buscar: '',
        proveedorId: null,
        sucursalId: null,
        estado: 'TODOS',
        fechaDesde: '',
        fechaHasta: '',
      },
      { emitEvent: false },
    );
    this.cargarOrdenes();
  }

  tieneFiltros(): boolean {
    const valores = this.filtros.getRawValue();
    return Boolean(
      valores.buscar.trim() ||
        valores.proveedorId !== null ||
        valores.sucursalId !== null ||
        valores.estado !== 'TODOS' ||
        valores.fechaDesde ||
        valores.fechaHasta,
    );
  }

  mensajeVacio(): string {
    if (this.tieneFiltros()) {
      return 'No hay órdenes de compra que coincidan con los filtros aplicados.';
    }
    return 'Todavía no hay órdenes de compra registradas.';
  }

  private cargarOrdenes(): void {
    this.cargando.set(true);
    this.error.set(null);
    const valores = this.filtros.getRawValue();
    this.ordenesService
      .listarOrdenes({
        buscar: valores.buscar.trim() || undefined,
        proveedor_id: valores.proveedorId ?? undefined,
        sucursal_id: valores.sucursalId ?? undefined,
        estado: valores.estado === 'TODOS' ? undefined : valores.estado,
        fecha_desde: valores.fechaDesde || undefined,
        fecha_hasta: valores.fechaHasta || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ordenes) => {
          this.cargando.set(false);
          this.ordenes.set(ordenes);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.ordenes.set([]);
          this.manejarError(error);
        },
      });
  }

  private cargarCatalogos(): void {
    forkJoin({
      proveedores: this.proveedoresService
        .listarProveedores()
        .pipe(catchError(() => of([] as Proveedor[]))),
      sucursales: this.sucursalesService
        .listarSucursales()
        .pipe(catchError(() => of([] as Sucursal[]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ proveedores, sucursales }) => {
        this.proveedores.set(proveedores);
        this.sucursales.set(sucursales);
      });
  }

  // ===== Alta y edición de cabecera =====

  abrirNueva(): void {
    this.ordenEnForm.set(null);
    this.dialogoFormAbierto.set(true);
  }

  abrirEditar(orden: OrdenCompra): void {
    if (this.procesando()) {
      return;
    }
    this.ordenEnForm.set(orden);
    this.dialogoFormAbierto.set(true);
  }

  cerrarForm(): void {
    this.dialogoFormAbierto.set(false);
    this.ordenEnForm.set(null);
  }

  onOrdenGuardada(orden: OrdenCompra): void {
    const editando = this.ordenEnForm();
    this.cerrarForm();
    this.exito.set(
      editando === null
        ? `Orden #${orden.id} creada en estado BORRADOR.`
        : `Orden #${orden.id} actualizada correctamente.`,
    );
    this.cargarOrdenes();
  }

  // ===== Detalle =====

  verOrden(orden: OrdenCompra): void {
    this.detalleOrden.set(orden);
  }

  cerrarDetalle(): void {
    this.detalleOrden.set(null);
  }

  // ===== Gestión de detalles =====

  abrirGestionDetalles(orden: OrdenCompra): void {
    if (this.procesando()) {
      return;
    }
    this.gestion.set({ orden, soloLectura: false });
  }

  verDetalles(orden: OrdenCompra): void {
    if (this.procesando()) {
      return;
    }
    this.gestion.set({ orden, soloLectura: true });
  }

  cerrarGestion(): void {
    this.gestion.set(null);
  }

  onDetallesGuardados(total: number): void {
    const gestion = this.gestion();
    this.exito.set(
      total === 0
        ? `Orden #${gestion?.orden.id ?? ''}: sin detalles registrados.`
        : `Orden #${gestion?.orden.id ?? ''}: ${total} detalle(s) guardado(s).`,
    );
    this.cargarOrdenes();
  }

  // ===== Enviar / cancelar / recibir =====

  solicitarEnviar(orden: OrdenCompra): void {
    if (this.procesando()) {
      return;
    }
    this.confirmacion.set({ tipo: 'enviar', orden });
  }

  solicitarCancelar(orden: OrdenCompra): void {
    if (this.procesando()) {
      return;
    }
    this.confirmacion.set({ tipo: 'cancelar', orden });
  }

  solicitarRecibir(orden: OrdenCompra): void {
    if (this.procesando()) {
      return;
    }
    this.confirmacion.set({ tipo: 'recibir', orden });
  }

  cancelarConfirmacion(): void {
    if (this.procesando()) {
      return;
    }
    this.confirmacion.set(null);
  }

  confirmarAccion(): void {
    const pendiente = this.confirmacion();
    if (pendiente === null) {
      return;
    }
    // Cierra el diálogo de inmediato para que no se pueda confirmar dos veces.
    this.confirmacion.set(null);

    if (this.procesando()) {
      return;
    }

    const { tipo, orden } = pendiente;
    this.accionEnCurso.set({ id: orden.id, tipo });
    this.error.set(null);
    this.exito.set(null);

    const peticion =
      tipo === 'enviar'
        ? this.ordenesService.enviarOrden(orden.id)
        : tipo === 'cancelar'
          ? this.ordenesService.cancelarOrden(orden.id)
          : this.ordenesService.recibirOrden(orden.id);

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (actualizada) => {
        this.accionEnCurso.set(null);
        this.exito.set(this.mensajeExito(tipo, actualizada));
        this.cargarOrdenes();
      },
      error: (error: unknown) => {
        this.accionEnCurso.set(null);
        this.manejarError(error);
      },
    });
  }

  private mensajeExito(tipo: TipoAccion, orden: OrdenCompra): string {
    if (tipo === 'enviar') {
      return `Orden #${orden.id} enviada correctamente.`;
    }
    if (tipo === 'cancelar') {
      return `Orden #${orden.id} cancelada.`;
    }
    return `Orden #${orden.id} recibida: la mercadería ingresó al inventario.`;
  }

  // ===== Presentación =====

  puedeEditar(orden: OrdenCompra): boolean {
    return puedeEditarCabecera(orden.estado);
  }

  puedeGestionar(orden: OrdenCompra): boolean {
    return puedeGestionarDetalles(orden.estado);
  }

  puedeEnviar(orden: OrdenCompra): boolean {
    return puedeEnviarOrden(orden.estado);
  }

  puedeCancelar(orden: OrdenCompra): boolean {
    return puedeCancelarOrden(orden.estado);
  }

  puedeRecibir(orden: OrdenCompra): boolean {
    return puedeRecibirOrden(orden.estado);
  }

  etiquetaEstado(estado: EstadoOrdenCompra): string {
    return etiquetaEstadoOrden(estado);
  }

  formatearFecha(valor: string | null): string {
    return formatearFechaTexto(valor);
  }

  estaProcesando(orden: OrdenCompra): boolean {
    return this.accionEnCurso()?.id === orden.id;
  }

  tipoEnCurso(orden: OrdenCompra): TipoAccion | null {
    const actual = this.accionEnCurso();
    return actual !== null && actual.id === orden.id ? actual.tipo : null;
  }

  tituloConfirmacion(tipo: TipoAccion): string {
    if (tipo === 'enviar') {
      return 'Enviar orden de compra';
    }
    if (tipo === 'cancelar') {
      return 'Cancelar orden de compra';
    }
    return 'Recibir orden de compra';
  }

  confirmarLabel(tipo: TipoAccion): string {
    if (tipo === 'enviar') {
      return 'Enviar';
    }
    if (tipo === 'cancelar') {
      return 'Cancelar orden';
    }
    return 'Recibir orden';
  }

  mensajeConfirmacion(pendiente: ConfirmacionAccion): string {
    const { tipo, orden } = pendiente;
    if (tipo === 'enviar') {
      return `¿Enviar la orden #${orden.id}? Pasará de BORRADOR a ENVIADA y ya no podrás editar sus detalles.`;
    }
    if (tipo === 'cancelar') {
      return `¿Cancelar la orden #${orden.id}? Quedará visible como CANCELADA. Si no tienes permiso para eliminarla, el backend rechazará la acción.`;
    }
    return 'Esta acción ingresará la mercadería al inventario y registrará los movimientos correspondientes. No puede ejecutarse dos veces.';
  }

  // ===== Utilidades =====

  private manejarError(error: unknown): void {
    const traducido = traducirErrorOrdenesCompra(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    this.error.set(traducido.mensaje);
  }
}
