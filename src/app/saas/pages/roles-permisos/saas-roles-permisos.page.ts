import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, of } from 'rxjs';

import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import {
  MatrizPermisos,
  MatrizPermisosRol,
  PermisoCambio,
  TenantRol,
} from '../../models/tenant.models';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasPermissionsService } from '../../services/saas-permissions.service';
import { SaasRolesService } from '../../services/saas-roles.service';
import {
  agruparPorFuncion,
  clavePermiso,
  esRolAdministrador,
} from './matriz-permisos.util';

/**
 * Roles y permisos de la empresa.
 *
 * Edita excepciones de la matriz nominal (`PATCH
 * /tenant/empresa/roles/{rol_id}/permisos`) enviando SOLO las filas
 * modificadas. La matriz del rol ADMINISTRADOR es de solo lectura en el
 * backend (409) y aquí se muestra deshabilitada con un aviso.
 *
 * No se ofrecen crear, renombrar ni eliminar roles: el backend no publica esos
 * endpoints y la pantalla no inventa acciones.
 */
@Component({
  selector: 'app-saas-roles-permisos-page',
  imports: [AdminIcon],
  styleUrl: './saas-roles-permisos.page.css',
  templateUrl: './saas-roles-permisos.page.html',
})
export class SaasRolesPermisosPage {
  private readonly rolesService = inject(SaasRolesService);
  private readonly permisosService = inject(SaasPermissionsService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly roles = signal<TenantRol[]>([]);
  readonly matriz = signal<MatrizPermisos | null>(null);
  readonly rolSeleccionado = signal<number | null>(null);

  readonly cargando = signal(true);
  readonly mensajeError = signal<string | null>(null);
  readonly mensajeExito = signal<string | null>(null);
  readonly mensajeErrorGuardar = signal<string | null>(null);
  readonly guardando = signal(false);

  /** Estado actual de cada checkbox (clave función|acción). */
  readonly valores = signal<Record<string, boolean>>({});
  /** Estado con el que llegó la matriz; sirve para calcular los cambios. */
  readonly originales = signal<Record<string, boolean>>({});

  /** `true` si el rol puede escribir la matriz (PERSONAL/ADMINISTRAR). */
  readonly puedeEditarPermisos = computed(() =>
    this.permisosService.puede('PERSONAL', 'ADMINISTRAR'),
  );

  /** Fila de la matriz del rol seleccionado. */
  readonly filaActual = computed<MatrizPermisosRol | null>(() => {
    const rolId = this.rolSeleccionado();
    if (rolId === null) {
      return null;
    }
    return this.matriz()?.roles.find((fila) => fila.rol_id === rolId) ?? null;
  });

  readonly rolActual = computed(() => this.filaActual()?.rol ?? '');

  /** El ADMINISTRADOR no es editable; el backend responde 409 si se intenta. */
  readonly esAdministradorSeleccionado = computed(() =>
    esRolAdministrador(this.rolActual()),
  );

  /** Checkboxes deshabilitados por rol insuficiente o por ser ADMINISTRADOR. */
  readonly soloLectura = computed(
    () => this.esAdministradorSeleccionado() || !this.puedeEditarPermisos(),
  );

  readonly grupos = computed(() =>
    agruparPorFuncion(this.filaActual()?.permisos ?? []),
  );

  /** Solo las filas modificadas, listas para el PATCH. */
  readonly cambios = computed<PermisoCambio[]>(() => {
    const valores = this.valores();
    const originales = this.originales();

    return Object.entries(valores)
      .filter(([clave, valor]) => originales[clave] !== valor)
      .map(([clave, permitido]) => {
        const [funcion, accion] = clave.split('|');
        return { funcion, accion, permitido };
      });
  });

  readonly hayCambios = computed(() => this.cambios().length > 0);
  readonly totalCambios = computed(() => this.cambios().length);

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

  /** Selecciona un rol y reinicia el estado editable desde la matriz. */
  seleccionarRol(rolId: number): void {
    const fila = this.matriz()?.roles.find((item) => item.rol_id === rolId);
    if (fila === undefined) {
      return;
    }

    this.rolSeleccionado.set(rolId);
    const valores: Record<string, boolean> = {};
    for (const permiso of fila.permisos) {
      valores[clavePermiso(permiso.funcion, permiso.accion)] =
        permiso.permitido;
    }
    this.valores.set(valores);
    this.originales.set({ ...valores });
    this.mensajeExito.set(null);
    this.mensajeErrorGuardar.set(null);
  }

  // ============================== Edición ===============================

  /** Valor actual de un checkbox. */
  valor(funcion: string, accion: string): boolean {
    return this.valores()[clavePermiso(funcion, accion)] ?? false;
  }

  /** Alterna un permiso; se ignora si la matriz es de solo lectura. */
  alternar(funcion: string, accion: string, evento: Event): void {
    if (this.soloLectura()) {
      return;
    }
    const objetivo = evento.target;
    if (!(objetivo instanceof HTMLInputElement)) {
      return;
    }
    const clave = clavePermiso(funcion, accion);
    const permitido = objetivo.checked;
    this.valores.update((valores) => ({ ...valores, [clave]: permitido }));
    this.mensajeExito.set(null);
    this.mensajeErrorGuardar.set(null);
  }

  /** Descarta los cambios sin guardar. */
  descartar(): void {
    if (this.guardando()) {
      return;
    }
    this.valores.set({ ...this.originales() });
    this.mensajeExito.set(null);
    this.mensajeErrorGuardar.set(null);
  }

  /** Envía solo las filas modificadas al backend. */
  guardar(): void {
    const rolId = this.rolSeleccionado();
    const cambios = this.cambios();
    if (
      rolId === null ||
      cambios.length === 0 ||
      this.guardando() ||
      this.soloLectura()
    ) {
      return;
    }

    this.guardando.set(true);
    this.mensajeExito.set(null);
    this.mensajeErrorGuardar.set(null);

    this.rolesService
      .guardarPermisos(rolId, cambios)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (respuesta) => {
          this.guardando.set(false);
          this.aplicarGuardado(cambios);
          this.originales.set({ ...this.valores() });
          this.mensajeExito.set(
            `${respuesta.actualizados} permiso(s) actualizados en el rol ${respuesta.rol}.`,
          );
          // La navegación y los guards leen la matriz compartida.
          this.refrescarMatrizCompartida();
        },
        error: (error: unknown) => {
          this.guardando.set(false);
          this.mensajeErrorGuardar.set(
            this.errores.mensajeDeError(error, 'roles/permisos'),
          );
        },
      });
  }

  // =============================== Interno ==============================

  private cargar(): void {
    this.cargando.set(true);
    this.mensajeError.set(null);

    forkJoin({
      matriz: this.rolesService.obtenerMatriz(),
      // La lista de roles exige ADMINISTRADOR; si falla, la matriz ya trae
      // los roles de la empresa y se usa como respaldo.
      roles: this.rolesService.listarRoles().pipe(catchError(() => of([]))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ matriz, roles }) => {
          this.matriz.set(matriz);
          this.roles.set(
            roles.length > 0
              ? roles
              : matriz.roles.map((fila) => ({
                  id: fila.rol_id,
                  nombre: fila.rol,
                  estado: true,
                })),
          );
          this.cargando.set(false);

          const seleccion = this.rolSeleccionado();
          const existe =
            seleccion !== null &&
            matriz.roles.some((fila) => fila.rol_id === seleccion);
          const primero = matriz.roles[0]?.rol_id ?? null;
          const destino = existe ? seleccion : primero;
          if (destino !== null) {
            this.seleccionarRol(destino);
          } else {
            this.rolSeleccionado.set(null);
            this.valores.set({});
            this.originales.set({});
          }
        },
        error: (error: unknown) => {
          this.matriz.set(null);
          this.roles.set([]);
          this.cargando.set(false);
          this.mensajeError.set(
            this.errores.mensajeDeError(error, 'roles/permisos/listar'),
          );
        },
      });
  }

  /** Refleja en la matriz en memoria los permisos recién guardados. */
  private aplicarGuardado(cambios: PermisoCambio[]): void {
    const matriz = this.matriz();
    const rolId = this.rolSeleccionado();
    if (matriz === null || rolId === null) {
      return;
    }

    const porClave = new Map(
      cambios.map((cambio) => [
        clavePermiso(cambio.funcion, cambio.accion),
        cambio.permitido,
      ]),
    );

    this.matriz.set({
      ...matriz,
      roles: matriz.roles.map((fila) =>
        fila.rol_id !== rolId
          ? fila
          : {
              ...fila,
              permisos: fila.permisos.map((permiso) => {
                const permitido = porClave.get(
                  clavePermiso(permiso.funcion, permiso.accion),
                );
                return permitido === undefined
                  ? permiso
                  : { ...permiso, permitido, origen: 'EXCEPCION' as const };
              }),
            },
      ),
    });
  }

  /** Vuelve a cargar la matriz compartida para actualizar menú y guards. */
  private refrescarMatrizCompartida(): void {
    this.permisosService.limpiar();
    this.permisosService.cargar().subscribe({
      error: () => {
        /* La matriz se recargará de nuevo al navegar. */
      },
    });
  }
}
