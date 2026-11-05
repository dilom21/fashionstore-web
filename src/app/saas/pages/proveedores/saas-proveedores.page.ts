import {
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';

import { AdminIcon } from '../../../features/administracion/components/admin-icon/admin-icon';
import {
  TenantErrorNormalizado,
  TenantProducto,
  TenantProveedor,
  TenantProveedorCreado,
  TenantProveedorCrear,
} from '../../models/tenant.models';
import { SaasCatalogoService } from '../../services/saas-catalogo.service';
import { SaasErrorService } from '../../services/saas-error.service';
import { SaasPermissionsService } from '../../services/saas-permissions.service';
import { SaasProveedoresService } from '../../services/saas-proveedores.service';

/** Límites del contrato `POST /tenant/proveedores`. */
export const MAX_RAZON_SOCIAL_PROVEEDOR = 150;
export const MAX_NIT_PROVEEDOR = 30;
export const MAX_CORREO_PROVEEDOR = 150;
export const MAX_TELEFONO_PROVEEDOR = 30;
export const MAX_DIRECCION_PROVEEDOR = 255;
export const MAX_PRODUCTOS_PROVEEDOR = 100;

/** Tamaños de página del listado (paginación en cliente). */
export const TAMANOS_PAGINA_PROVEEDORES = [10, 20, 50] as const;

/** Tamaño de página por defecto del listado. */
export const TAMANO_PAGINA_PROVEEDORES_POR_DEFECTO = 20;

/** Máximo del filtro de texto (misma cota que los filtros del backend). */
export const MAX_TEXTO_PROVEEDORES = 60;

/** Productos que se consultan para asociar (tope de la página del catálogo). */
const LIMITE_PRODUCTOS = 100;

/** Clasificación del error para explicar la causa real. */
type TipoErrorProveedores =
  | 'permiso'
  | 'deshabilitado'
  | 'conflicto'
  | 'validacion'
  | 'otro';

/** Campo del alta con mensaje de validación propio. */
type CampoAltaProveedor =
  | 'razon_social'
  | 'nit'
  | 'correo'
  | 'telefono'
  | 'direccion';

/** Formulario tipado del alta de proveedor. */
type FormAltaProveedor = FormGroup<{
  razon_social: FormControl<string>;
  nit: FormControl<string>;
  correo: FormControl<string>;
  telefono: FormControl<string>;
  direccion: FormControl<string>;
}>;

/**
 * Proveedores de la empresa.
 *
 * Contrato real y LIMITACIONES (la pantalla las advierte):
 * - NO existe `GET /tenant/proveedores`: el listado se obtiene del catálogo,
 *   `GET /tenant/catalogo/proveedores` (permiso COMPRAS/CONSULTAR). Ese
 *   contrato no acepta `texto`, `limit` ni `offset`, así que el filtro y la
 *   paginación son EN CLIENTE sobre la lista devuelta.
 * - El listado solo publica `{id, razon_social, estado}`: no hay NIT, correo
 *   ni total de productos. El total asociado solo se conoce tras crear un
 *   proveedor o tras reemplazar sus productos.
 * - `POST /tenant/proveedores` exige COMPRAS/GESTIONAR (403 en otro caso).
 * - `PUT /tenant/proveedores/{id}/productos` REEMPLAZA las asociaciones; no
 *   existe un endpoint que las devuelva, por eso la selección empieza vacía.
 *
 * Todos los errores pasan por `SaasErrorService`; nunca se muestra el error
 * HTTP crudo.
 */
@Component({
  selector: 'app-saas-proveedores-page',
  imports: [ReactiveFormsModule, AdminIcon],
  styleUrl: './saas-proveedores.page.css',
  templateUrl: './saas-proveedores.page.html',
})
export class SaasProveedoresPage {
  private readonly catalogoService = inject(SaasCatalogoService);
  private readonly proveedoresService = inject(SaasProveedoresService);
  private readonly permisos = inject(SaasPermissionsService);
  private readonly errores = inject(SaasErrorService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tamanos = TAMANOS_PAGINA_PROVEEDORES;
  readonly maxTexto = MAX_TEXTO_PROVEEDORES;
  readonly maxRazonSocial = MAX_RAZON_SOCIAL_PROVEEDOR;
  readonly maxNit = MAX_NIT_PROVEEDOR;
  readonly maxCorreo = MAX_CORREO_PROVEEDOR;
  readonly maxTelefono = MAX_TELEFONO_PROVEEDOR;
  readonly maxDireccion = MAX_DIRECCION_PROVEEDOR;
  readonly maxProductos = MAX_PRODUCTOS_PROVEEDOR;

  /** `true` si el rol puede crear y asociar; el backend vuelve a autorizar. */
  readonly puedeGestionar = computed(() =>
    this.permisos.puede('COMPRAS', 'GESTIONAR'),
  );

  // =============================== Listado ===============================

  readonly proveedores = signal<TenantProveedor[]>([]);
  readonly cargando = signal(true);
  readonly errorListado = signal<TenantErrorNormalizado | null>(null);
  readonly sinPermiso = signal(false);

  /** Total de productos asociados conocido (solo tras crear o reemplazar). */
  readonly totalProductos = signal<Record<number, number>>({});

  readonly filtroTexto = signal('');
  readonly limite = signal<number>(TAMANO_PAGINA_PROVEEDORES_POR_DEFECTO);
  readonly pagina = signal(0);
  readonly offset = computed(() => this.pagina() * this.limite());

  readonly proveedoresFiltrados = computed(() => {
    const texto = this.filtroTexto().toLocaleLowerCase('es');
    if (texto.length === 0) {
      return this.proveedores();
    }
    return this.proveedores().filter(
      (proveedor) =>
        proveedor.razon_social.toLocaleLowerCase('es').includes(texto) ||
        String(proveedor.id).includes(texto),
    );
  });

  readonly totalFiltrado = computed(() => this.proveedoresFiltrados().length);

  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.totalFiltrado() / this.limite())),
  );

  readonly visibles = computed(() =>
    this.proveedoresFiltrados().slice(
      this.offset(),
      this.offset() + this.limite(),
    ),
  );

  readonly hayPaginaAnterior = computed(() => this.pagina() > 0);

  readonly hayPaginaSiguiente = computed(
    () => this.offset() + this.limite() < this.totalFiltrado(),
  );

  readonly textoRango = computed(() => {
    const total = this.totalFiltrado();
    if (total === 0) {
      return 'Sin resultados';
    }
    const desde = this.offset() + 1;
    return `Mostrando ${desde}–${this.offset() + this.visibles().length} de ${total}`;
  });

  readonly tieneFiltros = computed(() => this.filtroTexto().length > 0);

  // ========================= Catálogo de productos =======================

  readonly productos = signal<TenantProducto[]>([]);
  readonly cargandoProductos = signal(false);
  readonly errorProductos = signal<string | null>(null);
  readonly productosSinPermiso = signal(false);
  private readonly productosCargados = signal(false);

  // ================================= Alta ================================

  readonly altaAbierta = signal(false);
  readonly guardandoAlta = signal(false);
  readonly errorAlta = signal<TenantErrorNormalizado | null>(null);
  readonly seleccionadosAlta = signal<ReadonlySet<number>>(new Set<number>());

  readonly formAlta: FormAltaProveedor = new FormGroup({
    razon_social: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        textoRequerido,
        Validators.maxLength(MAX_RAZON_SOCIAL_PROVEEDOR),
      ],
    }),
    nit: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_NIT_PROVEEDOR)],
    }),
    correo: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_CORREO_PROVEEDOR), correoValido],
    }),
    telefono: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_TELEFONO_PROVEEDOR)],
    }),
    direccion: new FormControl('', {
      nonNullable: true,
      validators: [Validators.maxLength(MAX_DIRECCION_PROVEEDOR)],
    }),
  });

  readonly mensajeSeleccionAlta = computed(() => {
    const total = this.seleccionadosAlta().size;
    if (total === 0) {
      return 'Sin productos asociados: el proveedor se crea, pero la orden de compra rechazará sus productos hasta asociarlos.';
    }
    return `${total} producto${total === 1 ? '' : 's'} asociado${total === 1 ? '' : 's'}.`;
  });

  // ============================ Asociaciones =============================

  readonly proveedorAsociando = signal<TenantProveedor | null>(null);
  readonly seleccionados = signal<ReadonlySet<number>>(new Set<number>());
  readonly guardandoAsociacion = signal(false);
  readonly errorAsociacion = signal<TenantErrorNormalizado | null>(null);

  readonly mensajeSeleccion = computed(() => {
    const total = this.seleccionados().size;
    if (total === 0) {
      return 'Sin productos seleccionados: al guardar se quitarán todas las asociaciones del proveedor.';
    }
    return `${total} producto${total === 1 ? '' : 's'} seleccionado${total === 1 ? '' : 's'}: reemplazarán las asociaciones actuales.`;
  });

  readonly mensajeExito = signal<string | null>(null);

  constructor() {
    this.cargarProveedores();
  }

  // ================================ Carga ================================

  recargar(): void {
    if (this.cargando()) {
      return;
    }
    this.cargarProveedores();
  }

  /**
   * Carga el catálogo de productos de la empresa (una vez por pantalla).
   *
   * Un 403 solo bloquea la asociación de productos, no el listado ni el alta.
   */
  cargarProductos(forzar = false): void {
    if (this.cargandoProductos()) {
      return;
    }
    if (this.productosCargados() && !forzar) {
      return;
    }

    this.cargandoProductos.set(true);
    this.errorProductos.set(null);
    this.productosSinPermiso.set(false);

    this.catalogoService
      .listarProductos({ limit: LIMITE_PRODUCTOS, offset: 0 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (productos) => {
          this.productos.set(
            [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre)),
          );
          this.productosCargados.set(true);
          this.cargandoProductos.set(false);
        },
        error: (error: unknown) => {
          this.productos.set([]);
          this.productosCargados.set(false);
          this.cargandoProductos.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'proveedores/productos',
          );
          if (normalizado.estado === 403) {
            this.productosSinPermiso.set(true);
          }
          this.errorProductos.set(normalizado.mensaje);
        },
      });
  }

  // ============================== Paginación =============================

  paginaSiguiente(): void {
    if (!this.hayPaginaSiguiente()) {
      return;
    }
    this.pagina.update((valor) => valor + 1);
  }

  paginaAnterior(): void {
    if (!this.hayPaginaAnterior()) {
      return;
    }
    this.pagina.update((valor) => valor - 1);
  }

  // ================================ Filtros ==============================

  /** Aplica el texto buscado (máximo 60) y vuelve a la primera página. */
  aplicarBusqueda(texto: string): void {
    this.filtroTexto.set(texto.trim().slice(0, MAX_TEXTO_PROVEEDORES));
    this.pagina.set(0);
  }

  /** Quita el texto de búsqueda. */
  limpiarBusqueda(): void {
    if (this.filtroTexto().length === 0) {
      return;
    }
    this.filtroTexto.set('');
    this.pagina.set(0);
  }

  /** Cambia el tamaño de página y vuelve a la primera página. */
  cambiarLimite(evento: Event): void {
    const objetivo = evento.target;
    if (!(objetivo instanceof HTMLSelectElement)) {
      return;
    }
    const numero = Number.parseInt(objetivo.value, 10);
    const valido = TAMANOS_PAGINA_PROVEEDORES.some(
      (opcion) => opcion === numero,
    );
    this.limite.set(
      valido ? numero : TAMANO_PAGINA_PROVEEDORES_POR_DEFECTO,
    );
    this.pagina.set(0);
  }

  // ================================= Alta ================================

  /** Abre el alta y asegura el catálogo de productos. */
  abrirAlta(): void {
    if (!this.puedeGestionar() || this.guardandoAlta()) {
      return;
    }
    this.mensajeExito.set(null);
    this.errorAlta.set(null);
    this.formAlta.reset({
      razon_social: '',
      nit: '',
      correo: '',
      telefono: '',
      direccion: '',
    });
    this.seleccionadosAlta.set(new Set<number>());
    this.altaAbierta.set(true);
    this.cargarProductos();
  }

  cerrarAlta(): void {
    if (this.guardandoAlta()) {
      return;
    }
    this.altaAbierta.set(false);
    this.errorAlta.set(null);
    this.seleccionadosAlta.set(new Set<number>());
    this.formAlta.reset({
      razon_social: '',
      nit: '',
      correo: '',
      telefono: '',
      direccion: '',
    });
  }

  /** Mensaje de error visible de un campo del alta (solo si ya fue tocado). */
  mensajeCampoAlta(campo: CampoAltaProveedor): string | null {
    const control = this.formAlta.controls[campo];
    if (control.untouched || !control.invalid) {
      return null;
    }
    if (control.hasError('required')) {
      return 'La razón social es obligatoria.';
    }
    if (control.hasError('maxlength')) {
      return 'El valor supera el máximo permitido.';
    }
    if (control.hasError('correoInvalido')) {
      return 'Indica un correo válido o deja el campo vacío.';
    }
    return 'Revisa este campo.';
  }

  /** `true` si el producto está marcado en el alta. */
  estaSeleccionadoAlta(productoId: number): boolean {
    return this.seleccionadosAlta().has(productoId);
  }

  /** Alterna un producto de la empresa en el alta. */
  alternarProductoAlta(productoId: number, evento: Event): void {
    this.seleccionadosAlta.set(
      alternarSeleccion(
        this.seleccionadosAlta(),
        productoId,
        evento,
        MAX_PRODUCTOS_PROVEEDOR,
      ),
    );
    this.errorAlta.set(null);
  }

  /** `true` si hay razón social válida y no hay un envío en curso. */
  puedeGuardarAlta(): boolean {
    return (
      !this.guardandoAlta() &&
      this.formAlta.controls.razon_social.value.trim().length > 0
    );
  }

  /**
   * Envía el alta. Ante error conserva los datos escritos para reintentar.
   *
   * 403/409/422/503 se clasifican con `tipoErrorAlta` y el mensaje del
   * `SaasErrorService`; nunca se muestra el error HTTP crudo.
   */
  guardarProveedor(): void {
    if (this.guardandoAlta() || !this.puedeGestionar()) {
      return;
    }

    this.formAlta.markAllAsTouched();
    this.errorAlta.set(null);
    this.mensajeExito.set(null);

    if (!this.puedeGuardarAlta() || this.formAlta.invalid) {
      return;
    }

    const valores = this.formAlta.getRawValue();
    const dto: TenantProveedorCrear = {
      razon_social: valores.razon_social.trim(),
      producto_ids: [...this.seleccionadosAlta()].sort((a, b) => a - b),
    };
    const nit = valores.nit.trim();
    const correo = valores.correo.trim();
    const telefono = valores.telefono.trim();
    const direccion = valores.direccion.trim();
    if (nit.length > 0) {
      dto.nit = nit;
    }
    if (correo.length > 0) {
      dto.correo = correo;
    }
    if (telefono.length > 0) {
      dto.telefono = telefono;
    }
    if (direccion.length > 0) {
      dto.direccion = direccion;
    }

    this.guardandoAlta.set(true);

    this.proveedoresService
      .crear(dto)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (proveedor) => {
          this.guardandoAlta.set(false);
          this.altaAbierta.set(false);
          this.formAlta.reset({
            razon_social: '',
            nit: '',
            correo: '',
            telefono: '',
            direccion: '',
          });
          this.seleccionadosAlta.set(new Set<number>());
          this.integrarProveedor(proveedor);
          this.mensajeExito.set(
            `Proveedor «${proveedor.razon_social}» creado (#${proveedor.id}) con ${proveedor.total_productos} producto(s).`,
          );
        },
        error: (error: unknown) => {
          this.guardandoAlta.set(false);
          // Los datos se conservan: corregir y reintentar es seguro.
          this.errorAlta.set(
            this.errores.normalizar(error, 'proveedores/crear'),
          );
        },
      });
  }

  // ============================ Asociaciones =============================

  /** Abre el panel de asociaciones de un proveedor existente. */
  abrirAsociacion(proveedor: TenantProveedor): void {
    if (!this.puedeGestionar() || this.guardandoAsociacion()) {
      return;
    }
    this.mensajeExito.set(null);
    this.proveedorAsociando.set(proveedor);
    this.seleccionados.set(new Set<number>());
    this.errorAsociacion.set(null);
    this.cargarProductos();
  }

  cerrarAsociacion(): void {
    if (this.guardandoAsociacion()) {
      return;
    }
    this.proveedorAsociando.set(null);
    this.errorAsociacion.set(null);
    this.seleccionados.set(new Set<number>());
  }

  /** `true` si el producto está marcado para la asociación. */
  estaSeleccionado(productoId: number): boolean {
    return this.seleccionados().has(productoId);
  }

  /** Alterna un producto respetando el máximo admitido por el alta. */
  alternarProducto(productoId: number, evento: Event): void {
    this.seleccionados.set(
      alternarSeleccion(
        this.seleccionados(),
        productoId,
        evento,
        MAX_PRODUCTOS_PROVEEDOR,
      ),
    );
    this.errorAsociacion.set(null);
  }

  /**
   * `PUT /tenant/proveedores/{id}/productos` con la selección completa.
   *
   * El backend reemplaza las asociaciones y devuelve el total resultante; la
   * fila se actualiza en sitio con ese valor (sin recargar el listado).
   */
  guardarAsociacion(): void {
    const proveedor = this.proveedorAsociando();
    if (
      proveedor === null ||
      this.guardandoAsociacion() ||
      !this.puedeGestionar()
    ) {
      return;
    }

    const productoIds = [...this.seleccionados()].sort((a, b) => a - b);
    this.guardandoAsociacion.set(true);
    this.errorAsociacion.set(null);

    this.proveedoresService
      .reemplazarProductos(proveedor.id, productoIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resultado) => {
          this.guardandoAsociacion.set(false);
          this.totalProductos.update((mapa) => ({
            ...mapa,
            [resultado.proveedor_id]: resultado.total_productos,
          }));
          this.proveedorAsociando.set(null);
          this.seleccionados.set(new Set<number>());
          this.mensajeExito.set(
            `Asociaciones del proveedor «${proveedor.razon_social}» actualizadas: ${resultado.total_productos} producto(s).`,
          );
        },
        error: (error: unknown) => {
          this.guardandoAsociacion.set(false);
          this.errorAsociacion.set(
            this.errores.normalizar(error, 'proveedores/asociar'),
          );
        },
      });
  }

  // ============================== Errores ===============================

  readonly tipoErrorListado = computed<TipoErrorProveedores | null>(() =>
    clasificarError(this.errorListado()),
  );

  readonly tipoErrorAlta = computed<TipoErrorProveedores | null>(() =>
    clasificarError(this.errorAlta()),
  );

  readonly tipoErrorAsociacion = computed<TipoErrorProveedores | null>(() =>
    clasificarError(this.errorAsociacion()),
  );

  // ============================ Presentación =============================

  /** Total asociado conocido de un proveedor (o `null` si no se conoce). */
  totalProductosDe(proveedorId: number): number | null {
    return this.totalProductos()[proveedorId] ?? null;
  }

  /** Etiqueta accesible del botón de asociación de una fila. */
  etiquetaAsociacion(proveedor: TenantProveedor): string {
    return `Asociar productos al proveedor ${proveedor.razon_social}`;
  }

  // =============================== Interno ==============================

  /** Integra el proveedor creado al listado sin recargar todo. */
  private integrarProveedor(proveedor: TenantProveedorCreado): void {
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
    this.totalProductos.update((mapa) => ({
      ...mapa,
      [proveedor.id]: proveedor.total_productos,
    }));
    this.filtroTexto.set('');
    this.pagina.set(0);
    this.errorListado.set(null);
    this.sinPermiso.set(false);
    this.cargando.set(false);
  }

  private cargarProveedores(): void {
    this.cargando.set(true);
    this.errorListado.set(null);
    this.sinPermiso.set(false);

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
          this.cargando.set(false);
          this.ajustarPagina();
        },
        error: (error: unknown) => {
          this.proveedores.set([]);
          this.cargando.set(false);
          const normalizado = this.errores.normalizar(
            error,
            'proveedores/listar',
          );
          if (normalizado.estado === 403) {
            this.sinPermiso.set(true);
            return;
          }
          this.errorListado.set(normalizado);
        },
      });
  }

  /** Corrige la página si el listado se redujo (p. ej. tras un filtro). */
  private ajustarPagina(): void {
    if (this.pagina() > 0 && this.offset() >= this.totalFiltrado()) {
      this.pagina.set(Math.max(0, this.totalPaginas() - 1));
    }
  }
}

/** Clasificación del error para el título visible. */
function clasificarError(
  error: TenantErrorNormalizado | null,
): TipoErrorProveedores | null {
  if (error === null) {
    return null;
  }
  if (error.estado === 403) {
    return 'permiso';
  }
  if (error.estado === 409) {
    return 'conflicto';
  }
  if (error.estado === 503) {
    return 'deshabilitado';
  }
  if (error.esValidacion) {
    return 'validacion';
  }
  return 'otro';
}

/** Alterna un identificador en un conjunto inmutable respetando el máximo. */
function alternarSeleccion(
  actual: ReadonlySet<number>,
  productoId: number,
  evento: Event,
  maximo: number,
): ReadonlySet<number> {
  const marcado =
    evento.target instanceof HTMLInputElement ? evento.target.checked : false;
  const siguiente = new Set(actual);
  if (marcado) {
    if (siguiente.size >= maximo) {
      if (evento.target instanceof HTMLInputElement) {
        evento.target.checked = false;
      }
      return siguiente;
    }
    siguiente.add(productoId);
  } else {
    siguiente.delete(productoId);
  }
  return siguiente;
}

/** Valida un correo opcional con el mismo criterio que el backend. */
function correoValido(control: AbstractControl): ValidationErrors | null {
  const texto = String(control.value ?? '').trim();
  if (texto.length === 0) {
    return null;
  }
  const partes = texto.split('@');
  const valido =
    partes.length === 2 &&
    partes[0].length > 0 &&
    partes[1].includes('.') &&
    !texto.includes(' ');
  return valido ? null : { correoInvalido: true };
}

/** Exige texto no vacío después de recortar espacios (razón social). */
function textoRequerido(control: AbstractControl): ValidationErrors | null {
  const texto = String(control.value ?? '').trim();
  return texto.length === 0 ? { required: true } : null;
}
