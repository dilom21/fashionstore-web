import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { ConfirmDialog } from '../../../../../shared/components/confirm-dialog/confirm-dialog';
import { CiudadDetalleDialog } from '../../components/ciudad-detalle-dialog/ciudad-detalle-dialog';
import { CiudadFormDialog } from '../../components/ciudad-form-dialog/ciudad-form-dialog';
import { SucursalDetalleDialog } from '../../components/sucursal-detalle-dialog/sucursal-detalle-dialog';
import { SucursalFormDialog } from '../../components/sucursal-form-dialog/sucursal-form-dialog';
import { Ciudad } from '../../models/ciudad.model';
import { Sucursal } from '../../models/sucursal.model';
import { CiudadesService } from '../../services/ciudades.service';
import { SucursalesService } from '../../services/sucursales.service';
import { traducirErrorInventario } from '../../utils/http-error.util';

/** Pestañas disponibles de la pantalla. */
type TabActiva = 'sucursales' | 'ciudades';

/** Valores posibles del filtro de estado (sin "Todas"). */
type FiltroEstado = 'activas' | 'inactivas';

/** Confirmación de habilitar/deshabilitar una sucursal. */
interface ConfirmacionSucursal {
  sucursal: Sucursal;
  habilitar: boolean;
}

/** Confirmación de habilitar/deshabilitar una ciudad. */
interface ConfirmacionCiudad {
  ciudad: Ciudad;
  habilitar: boolean;
}

/**
 * Gestionar sucursales y ciudades (CU06) - /admin/inventario/sucursales-ciudades.
 *
 * Pantalla con dos pestañas:
 * - Sucursales: listado con búsqueda, filtro de ciudad y filtro de estado
 *   (Activas/Inactivas), acciones Ver / Editar / Habilitar / Deshabilitar y
 *   formulario de creación/edición (las ciudades disponibles provienen del
 *   backend y siempre son activas).
 * - Ciudades: listado con búsqueda y filtro de estado, acciones Ver/Editar y
 *   Habilitar/Deshabilitar. El estado nunca se edita en el formulario.
 *
 * Los listados usan GET /sucursales y GET /ciudades con filtros reales del
 * backend. Por compatibilidad con CU03, sin filtro de estado el backend solo
 * responde registros activos; aquí el filtro inicial es "Activas".
 */
@Component({
  selector: 'app-sucursales-ciudades-page',
  imports: [
    ReactiveFormsModule,
    ConfirmDialog,
    SucursalFormDialog,
    CiudadFormDialog,
    SucursalDetalleDialog,
    CiudadDetalleDialog,
  ],
  styleUrls: ['./sucursales-ciudades-page.css', './sucursales-ciudades-page-tabla.css'],
  templateUrl: './sucursales-ciudades-page.html',
})
export class SucursalesCiudadesPage {
  private readonly sucursalesService = inject(SucursalesService);
  private readonly ciudadesService = inject(CiudadesService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly tabActiva = signal<TabActiva>('sucursales');

  // ===== Sucursales =====
  readonly sucursales = signal<Sucursal[]>([]);
  readonly cargandoSucursales = signal(false);
  readonly errorSucursales = signal<string | null>(null);
  readonly exitoSucursales = signal<string | null>(null);
  readonly procesandoEstadoSucursal = signal(false);

  /** Ciudades activas: catálogo para el filtro de ciudad y el formulario. */
  readonly ciudadesActivas = signal<Ciudad[]>([]);
  readonly cargandoCiudadesActivas = signal(false);
  readonly errorCiudadesActivas = signal<string | null>(null);

  readonly filtrosSucursales = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    ciudadId: new FormControl<number | null>(null),
    estado: new FormControl<FiltroEstado>('activas', { nonNullable: true }),
  });

  // ===== Ciudades =====
  readonly ciudades = signal<Ciudad[]>([]);
  readonly cargandoCiudades = signal(false);
  readonly errorCiudades = signal<string | null>(null);
  readonly exitoCiudades = signal<string | null>(null);
  readonly procesandoEstadoCiudad = signal(false);
  /** La pestaña de ciudades carga su listado la primera vez que se abre. */
  readonly ciudadesCargadas = signal(false);

  readonly filtrosCiudades = new FormGroup({
    buscar: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(150)],
    }),
    estado: new FormControl<FiltroEstado>('activas', { nonNullable: true }),
  });

  // ===== Diálogos =====
  readonly dialogoSucursalAbierto = signal(false);
  readonly sucursalEnForm = signal<Sucursal | null>(null);
  readonly dialogoCiudadAbierto = signal(false);
  readonly ciudadEnForm = signal<Ciudad | null>(null);
  readonly detalleSucursal = signal<Sucursal | null>(null);
  readonly detalleCiudad = signal<Ciudad | null>(null);

  readonly confirmacionSucursal = signal<ConfirmacionSucursal | null>(null);
  readonly confirmacionCiudad = signal<ConfirmacionCiudad | null>(null);

  constructor() {
    this.filtrosSucursales.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarSucursales());
    this.filtrosSucursales.controls.ciudadId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarSucursales());
    this.filtrosCiudades.controls.estado.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cargarCiudades());
  }

  ngOnInit(): void {
    this.cargarCiudadesActivas();
    this.cargarSucursales();
  }

  // ===== Pestañas =====

  activarTab(tab: TabActiva): void {
    if (this.tabActiva() === tab) {
      return;
    }
    this.tabActiva.set(tab);
    if (tab === 'ciudades' && !this.ciudadesCargadas()) {
      this.cargarCiudades();
    }
  }

  esTabActiva(tab: TabActiva): boolean {
    return this.tabActiva() === tab;
  }

  // ===== Filtros de sucursales =====

  buscarSucursales(): void {
    this.cargarSucursales();
  }

  limpiarFiltrosSucursales(): void {
    this.filtrosSucursales.reset(
      { buscar: '', ciudadId: null, estado: 'activas' },
      { emitEvent: false },
    );
    this.cargarSucursales();
  }

  tieneFiltrosSucursales(): boolean {
    const valores = this.filtrosSucursales.getRawValue();
    return Boolean(valores.buscar.trim() || valores.ciudadId !== null);
  }

  // ===== Filtros de ciudades =====

  buscarCiudades(): void {
    this.cargarCiudades();
  }

  limpiarFiltrosCiudades(): void {
    this.filtrosCiudades.reset({ buscar: '', estado: 'activas' }, { emitEvent: false });
    this.cargarCiudades();
  }

  tieneFiltrosCiudades(): boolean {
    return this.filtrosCiudades.controls.buscar.value.trim().length > 0;
  }

  // ===== Carga de sucursales =====

  private cargarSucursales(): void {
    this.cargandoSucursales.set(true);
    this.errorSucursales.set(null);

    const valores = this.filtrosSucursales.getRawValue();
    this.sucursalesService
      .listarSucursales({
        buscar: valores.buscar.trim() || undefined,
        ciudad_id: valores.ciudadId ?? undefined,
        estado: this.estadoAFiltro(valores.estado),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursales) => {
          this.cargandoSucursales.set(false);
          this.sucursales.set(sucursales);
        },
        error: (error: unknown) => {
          this.cargandoSucursales.set(false);
          this.sucursales.set([]);
          this.manejarError(error, 'sucursales');
        },
      });
  }

  private cargarCiudadesActivas(): void {
    this.cargandoCiudadesActivas.set(true);
    this.errorCiudadesActivas.set(null);

    this.ciudadesService
      .listarCiudadesActivas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ciudades) => {
          this.cargandoCiudadesActivas.set(false);
          this.ciudadesActivas.set(ciudades);
          this.ajustarFiltroCiudadActiva();
        },
        error: (error: unknown) => {
          this.cargandoCiudadesActivas.set(false);
          this.ciudadesActivas.set([]);
          const traducido = traducirErrorInventario(error);
          if (traducido.sesionExpirada) {
            this.cerrarSesion();
            return;
          }
          this.errorCiudadesActivas.set(traducido.mensaje);
        },
      });
  }

  /**
   * Si la ciudad seleccionada en el filtro de sucursales dejó de estar
   * activa (se deshabilitó desde la pestaña Ciudades), se limpia el filtro
   * para no mantener una opción invisible que ya no representa el catálogo.
   */
  private ajustarFiltroCiudadActiva(): void {
    const seleccionada = this.filtrosSucursales.controls.ciudadId.value;
    if (seleccionada === null) {
      return;
    }
    const existe = this.ciudadesActivas().some(
      (ciudad) => ciudad.id === seleccionada,
    );
    if (!existe) {
      this.filtrosSucursales.controls.ciudadId.setValue(null, {
        emitEvent: false,
      });
      this.cargarSucursales();
    }
  }

  // ===== Carga de ciudades =====

  private cargarCiudades(): void {
    this.cargandoCiudades.set(true);
    this.errorCiudades.set(null);

    const valores = this.filtrosCiudades.getRawValue();
    this.ciudadesService
      .listarCiudades({
        buscar: valores.buscar.trim() || undefined,
        estado: this.estadoAFiltro(valores.estado),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (ciudades) => {
          this.cargandoCiudades.set(false);
          this.ciudades.set(ciudades);
          this.ciudadesCargadas.set(true);
        },
        error: (error: unknown) => {
          this.cargandoCiudades.set(false);
          this.ciudades.set([]);
          this.manejarError(error, 'ciudades');
        },
      });
  }

  private estadoAFiltro(estado: FiltroEstado): boolean {
    return estado === 'activas';
  }

  // ===== Acciones de sucursales =====

  abrirNuevaSucursal(): void {
    if (this.ciudadesActivas().length === 0) {
      return;
    }
    this.sucursalEnForm.set(null);
    this.dialogoSucursalAbierto.set(true);
  }

  abrirEditarSucursal(sucursal: Sucursal): void {
    // El listado trae los datos completos (incluida la ciudad). Si por algún
    // motivo faltara ciudad_id, se consulta GET /sucursales/{id} primero.
    if (!this.filaSucursalListable(sucursal)) {
      this.cargarDetalleSucursal(sucursal.id);
      return;
    }
    this.sucursalEnForm.set(sucursal);
    this.dialogoSucursalAbierto.set(true);
  }

  private cargarDetalleSucursal(sucursalId: number): void {
    this.errorSucursales.set(null);
    this.exitoSucursales.set(null);
    this.sucursalesService
      .obtenerSucursal(sucursalId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (sucursal) => {
          this.sucursalEnForm.set(sucursal);
          this.dialogoSucursalAbierto.set(true);
        },
        error: (error: unknown) => {
          this.manejarError(error, 'sucursales');
        },
      });
  }

  private filaSucursalListable(sucursal: Sucursal): boolean {
    return (
      sucursal.nombre.trim().length > 0 &&
      sucursal.direccion.trim().length > 0 &&
      sucursal.ciudad !== null &&
      sucursal.ciudad !== undefined &&
      sucursal.ciudad.id !== null &&
      sucursal.ciudad.id !== undefined
    );
  }

  cerrarDialogoSucursal(): void {
    this.dialogoSucursalAbierto.set(false);
    this.sucursalEnForm.set(null);
  }

  onSucursalGuardada(sucursal: Sucursal): void {
    const editando = this.sucursalEnForm();
    this.cerrarDialogoSucursal();
    this.exitoSucursales.set(
      editando === null
        ? `Sucursal "${sucursal.nombre}" creada correctamente.`
        : `Sucursal "${sucursal.nombre}" actualizada correctamente.`,
    );
    this.cargarSucursales();
  }

  verSucursal(sucursal: Sucursal): void {
    this.detalleSucursal.set(sucursal);
  }

  cerrarDetalleSucursal(): void {
    this.detalleSucursal.set(null);
  }

  solicitarCambioEstadoSucursal(sucursal: Sucursal): void {
    if (this.procesandoEstadoSucursal()) {
      return;
    }
    this.confirmacionSucursal.set({ sucursal, habilitar: !sucursal.estado });
  }

  cancelarCambioEstadoSucursal(): void {
    this.confirmacionSucursal.set(null);
  }

  confirmarCambioEstadoSucursal(): void {
    const pendiente = this.confirmacionSucursal();
    this.confirmacionSucursal.set(null);
    if (pendiente === null) {
      return;
    }

    const { sucursal, habilitar } = pendiente;
    const accion = habilitar ? 'habilitó' : 'deshabilitó';
    this.procesandoEstadoSucursal.set(true);
    this.errorSucursales.set(null);
    this.exitoSucursales.set(null);

    this.sucursalesService
      .cambiarEstadoSucursal(sucursal.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.procesandoEstadoSucursal.set(false);
          this.exitoSucursales.set(`Se ${accion} la sucursal "${actualizada.nombre}".`);
          this.cargarSucursales();
        },
        error: (error: unknown) => {
          this.procesandoEstadoSucursal.set(false);
          this.manejarError(error, 'sucursales');
        },
      });
  }

  // ===== Acciones de ciudades =====

  abrirNuevaCiudad(): void {
    this.ciudadEnForm.set(null);
    this.dialogoCiudadAbierto.set(true);
  }

  abrirEditarCiudad(ciudad: Ciudad): void {
    this.ciudadEnForm.set(ciudad);
    this.dialogoCiudadAbierto.set(true);
  }

  cerrarDialogoCiudad(): void {
    this.dialogoCiudadAbierto.set(false);
    this.ciudadEnForm.set(null);
  }

  onCiudadGuardada(ciudad: Ciudad): void {
    const editando = this.ciudadEnForm();
    this.cerrarDialogoCiudad();
    this.exitoCiudades.set(
      editando === null
        ? `Ciudad "${ciudad.nombre}" creada correctamente.`
        : `Ciudad "${ciudad.nombre}" actualizada correctamente.`,
    );
    this.cargarCiudades();
    // El catálogo de ciudades activas del tab Sucursales se mantiene fresco.
    this.cargarCiudadesActivas();
  }

  verCiudad(ciudad: Ciudad): void {
    this.detalleCiudad.set(ciudad);
  }

  cerrarDetalleCiudad(): void {
    this.detalleCiudad.set(null);
  }

  solicitarCambioEstadoCiudad(ciudad: Ciudad): void {
    if (this.procesandoEstadoCiudad()) {
      return;
    }
    this.confirmacionCiudad.set({ ciudad, habilitar: !ciudad.estado });
  }

  cancelarCambioEstadoCiudad(): void {
    this.confirmacionCiudad.set(null);
  }

  confirmarCambioEstadoCiudad(): void {
    const pendiente = this.confirmacionCiudad();
    this.confirmacionCiudad.set(null);
    if (pendiente === null) {
      return;
    }

    const { ciudad, habilitar } = pendiente;
    const accion = habilitar ? 'habilitó' : 'deshabilitó';
    this.procesandoEstadoCiudad.set(true);
    this.errorCiudades.set(null);
    this.exitoCiudades.set(null);

    this.ciudadesService
      .cambiarEstadoCiudad(ciudad.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (actualizada) => {
          this.procesandoEstadoCiudad.set(false);
          this.exitoCiudades.set(`Se ${accion} la ciudad "${actualizada.nombre}".`);
          this.cargarCiudades();
          this.cargarCiudadesActivas();
        },
        error: (error: unknown) => {
          this.procesandoEstadoCiudad.set(false);
          this.manejarError(error, 'ciudades');
        },
      });
  }

  // ===== Utilidades de presentación =====

  mensajeVacioSucursales(): string {
    const valores = this.filtrosSucursales.getRawValue();
    if (this.tieneFiltrosSucursales()) {
      return 'No hay sucursales que coincidan con los filtros aplicados.';
    }
    return valores.estado === 'activas'
      ? 'Todavía no hay sucursales activas registradas.'
      : 'No hay sucursales inactivas en este momento.';
  }

  mensajeVacioCiudades(): string {
    const valores = this.filtrosCiudades.getRawValue();
    if (this.tieneFiltrosCiudades()) {
      return 'No hay ciudades que coincidan con los filtros aplicados.';
    }
    return valores.estado === 'activas'
      ? 'Todavía no hay ciudades activas registradas.'
      : 'No hay ciudades inactivas en este momento.';
  }

  // ===== Errores =====

  private manejarError(error: unknown, destino: 'sucursales' | 'ciudades'): void {
    const traducido = traducirErrorInventario(error);
    if (traducido.sesionExpirada) {
      this.cerrarSesion();
      return;
    }
    if (destino === 'sucursales') {
      this.errorSucursales.set(traducido.mensaje);
      return;
    }
    this.errorCiudades.set(traducido.mensaje);
  }

  private cerrarSesion(): void {
    this.authService.cerrarSesion();
    void this.router.navigateByUrl('/auth/personal/login');
  }
}
