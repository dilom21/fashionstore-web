import {
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { Color } from '../../models/color.model';
import { Producto } from '../../models/producto.model';
import {
  RecursoProducto,
  RecursoProductoCreatePayload,
  RecursoProductoUpdatePayload,
} from '../../models/recurso-producto.model';
import { ColoresService } from '../../services/colores.service';
import { RecursosProductoService } from '../../services/recursos-producto.service';
import { traducirErrorCatalogo } from '../../utils/http-error.util';

/** Modo del formulario embebido de recursos. */
type ModoFormulario = 'cerrado' | 'crear' | 'editar';

/** Confirmación pendiente de habilitar/deshabilitar un recurso. */
interface ConfirmacionRecurso {
  recurso: RecursoProducto;
  habilitar: boolean;
}

/**
 * Diálogo de gestión de recursos/imágenes de un producto (CU07).
 *
 * Los recursos se administran por URL (no existe upload/storage). El color es
 * opcional y solo puede haber un recurso principal activo por producto + color;
 * el backend realiza la sustitución al marcar otro como principal.
 *
 * Endpoints:
 * GET/POST /productos/{producto_id}/recursos,
 * PATCH /recursos-producto/{id},
 * PATCH /recursos-producto/{id}/estado,
 * PATCH /recursos-producto/{id}/principal.
 */
@Component({
  selector: 'app-producto-recursos-dialog',
  imports: [ReactiveFormsModule],
  styleUrl: './producto-recursos-dialog.css',
  templateUrl: './producto-recursos-dialog.html',
})
export class ProductoRecursosDialog {
  readonly producto = input.required<Producto>();

  readonly cerrado = output<void>();

  private readonly recursosService = inject(RecursosProductoService);
  private readonly coloresService = inject(ColoresService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly recursos = signal<RecursoProducto[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly exito = signal<string | null>(null);
  readonly procesandoEstado = signal(false);
  readonly procesandoPrincipal = signal(false);

  readonly coloresActivos = signal<Color[]>([]);

  readonly modoForm = signal<ModoFormulario>('cerrado');
  readonly recursoEnEdicion = signal<RecursoProducto | null>(null);
  readonly guardandoForm = signal(false);
  readonly errorForm = signal<string | null>(null);
  readonly previewFormRota = signal(false);

  readonly confirmacion = signal<ConfirmacionRecurso | null>(null);
  readonly imagenesRotas = signal<ReadonlySet<number>>(new Set());

  readonly form = new FormGroup({
    tipo: new FormControl('IMAGEN', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50)],
    }),
    url: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(2048),
        Validators.pattern(/^https?:\/\/.+/i),
      ],
    }),
    colorId: new FormControl<number | null>(null),
    esPrincipal: new FormControl(false, { nonNullable: true }),
  });

  ngOnInit(): void {
    this.cargarRecursos();
    this.cargarColoresActivos();
  }

  // ===== Carga =====

  private cargarRecursos(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.recursosService
      .listarRecursos(this.producto().id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (recursos) => {
          this.cargando.set(false);
          this.recursos.set(recursos);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          this.recursos.set([]);
          this.manejarError(error, 'lista');
        },
      });
  }

  private cargarColoresActivos(): void {
    this.coloresService
      .listarColores({ estado: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (colores) => this.coloresActivos.set(colores),
        error: (error: unknown) => this.manejarError(error, 'lista'),
      });
  }

  opcionesColores(): Color[] {
    const activos = this.coloresActivos();
    const recurso = this.recursoEnEdicion();
    if (recurso === null || recurso.color === null) {
      return activos;
    }
    if (activos.some((color) => color.id === recurso.color?.id)) {
      return activos;
    }
    return [
      ...activos,
      {
        id: recurso.color.id,
        nombre: `${recurso.color.nombre} (inactivo)`,
        estado: false,
      },
    ];
  }

  // ===== Formulario =====

  abrirCrear(): void {
    if (this.guardandoForm()) {
      return;
    }
    this.errorForm.set(null);
    this.previewFormRota.set(false);
    this.recursoEnEdicion.set(null);
    this.form.reset(
      { tipo: 'IMAGEN', url: '', colorId: null, esPrincipal: false },
      { emitEvent: false },
    );
    this.modoForm.set('crear');
  }

  abrirEditar(recurso: RecursoProducto): void {
    if (this.guardandoForm()) {
      return;
    }
    this.errorForm.set(null);
    this.previewFormRota.set(false);
    this.recursoEnEdicion.set(recurso);
    this.form.reset(
      {
        tipo: recurso.tipo,
        url: recurso.url,
        colorId: recurso.color_id,
        esPrincipal: recurso.es_principal,
      },
      { emitEvent: false },
    );
    this.modoForm.set('editar');
  }

  cerrarForm(): void {
    if (this.guardandoForm()) {
      return;
    }
    this.modoForm.set('cerrado');
    this.recursoEnEdicion.set(null);
    this.errorForm.set(null);
  }

  mensajeCampo(control: AbstractControl | null): string | null {
    if (control === null || control.untouched || !control.errors) {
      return null;
    }
    const errores = control.errors;
    if (errores['required']) {
      return 'Este campo es obligatorio.';
    }
    if (errores['minlength']) {
      return `Debe tener al menos ${errores['minlength'].requiredLength} caracteres.`;
    }
    if (errores['maxlength']) {
      return `Debe tener como máximo ${errores['maxlength'].requiredLength} caracteres.`;
    }
    if (errores['pattern']) {
      return 'La URL debe iniciar con http:// o https://.';
    }
    return null;
  }

  guardar(): void {
    if (this.guardandoForm()) {
      return;
    }
    this.errorForm.set(null);

    const controls = this.form.controls;
    if (controls.tipo.invalid || controls.url.invalid) {
      this.form.markAllAsTouched();
      this.errorForm.set('Revisa los campos del recurso.');
      return;
    }

    const recursoActual = this.recursoEnEdicion();
    const tipo = controls.tipo.value.trim();
    const url = controls.url.value.trim();
    const colorId = controls.colorId.value;
    const esPrincipal = controls.esPrincipal.value;

    this.guardandoForm.set(true);

    let peticion;
    if (recursoActual === null) {
      const payload: RecursoProductoCreatePayload = {
        tipo,
        url,
        color_id: colorId,
        es_principal: esPrincipal,
      };
      peticion = this.recursosService.crearRecurso(this.producto().id, payload);
    } else {
      const payload: RecursoProductoUpdatePayload = {};
      if (tipo !== recursoActual.tipo) {
        payload.tipo = tipo;
      }
      if (url !== recursoActual.url) {
        payload.url = url;
      }
      if (colorId !== recursoActual.color_id) {
        payload.color_id = colorId;
      }
      if (esPrincipal !== recursoActual.es_principal) {
        payload.es_principal = esPrincipal;
      }
      if (Object.keys(payload).length === 0) {
        this.guardandoForm.set(false);
        this.errorForm.set('No se detectaron cambios para guardar.');
        return;
      }
      peticion = this.recursosService.actualizarRecurso(
        recursoActual.id,
        payload,
      );
    }

    peticion.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (recurso) => {
        this.guardandoForm.set(false);
        this.modoForm.set('cerrado');
        this.recursoEnEdicion.set(null);
        this.exito.set(
          recursoActual === null
            ? 'Recurso agregado correctamente.'
            : 'Recurso actualizado correctamente.',
        );
        this.cargarRecursos();
      },
      error: (error: unknown) => {
        this.guardandoForm.set(false);
        this.manejarError(error, 'form');
      },
    });
  }

  // ===== Estado y principal =====

  solicitarCambioEstado(recurso: RecursoProducto): void {
    if (this.procesandoEstado()) {
      return;
    }
    this.confirmacion.set({ recurso, habilitar: !recurso.estado });
  }

  cancelarCambioEstado(): void {
    this.confirmacion.set(null);
  }

  confirmarCambioEstado(): void {
    const pendiente = this.confirmacion();
    this.confirmacion.set(null);
    if (pendiente === null) {
      return;
    }

    const { recurso, habilitar } = pendiente;
    this.procesandoEstado.set(true);
    this.error.set(null);
    this.exito.set(null);

    this.recursosService
      .cambiarEstadoRecurso(recurso.id, habilitar)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.procesandoEstado.set(false);
          this.exito.set(
            `Se ${habilitar ? 'habilitó' : 'deshabilitó'} el recurso.`,
          );
          this.cargarRecursos();
        },
        error: (error: unknown) => {
          this.procesandoEstado.set(false);
          this.manejarError(error, 'lista');
        },
      });
  }

  marcarPrincipal(recurso: RecursoProducto): void {
    if (this.procesandoPrincipal() || recurso.es_principal) {
      return;
    }
    this.procesandoPrincipal.set(true);
    this.error.set(null);
    this.exito.set(null);

    this.recursosService
      .marcarPrincipal(recurso.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.procesandoPrincipal.set(false);
          this.exito.set('Recurso marcado como principal.');
          this.cargarRecursos();
        },
        error: (error: unknown) => {
          this.procesandoPrincipal.set(false);
          this.manejarError(error, 'lista');
        },
      });
  }

  // ===== Preview de imágenes =====

  esImagen(tipo: string, url: string): boolean {
    const tipoNormalizado = tipo.trim().toLowerCase();
    if (
      tipoNormalizado === 'imagen' ||
      tipoNormalizado === 'image' ||
      tipoNormalizado === 'foto' ||
      tipoNormalizado === 'photo'
    ) {
      return true;
    }
    return /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?.*)?$/i.test(url.trim());
  }

  mostrarImagen(recurso: RecursoProducto): boolean {
    return (
      this.esImagen(recurso.tipo, recurso.url) &&
      !this.imagenesRotas().has(recurso.id)
    );
  }

  marcarImagenRota(recursoId: number): void {
    this.imagenesRotas.update((actual) => {
      const siguiente = new Set(actual);
      siguiente.add(recursoId);
      return siguiente;
    });
  }

  /** Preview en vivo del formulario (si la URL parece imagen y carga). */
  mostrarPreviewForm(): boolean {
    const url = this.form.controls.url.value.trim();
    const tipo = this.form.controls.tipo.value;
    return (
      url.length > 0 &&
      !this.previewFormRota() &&
      this.esImagen(tipo, url)
    );
  }

  cerrar(): void {
    this.cerrado.emit();
  }

  // ===== Errores =====

  private manejarError(error: unknown, destino: 'lista' | 'form'): void {
    const traducido = traducirErrorCatalogo(error);
    if (traducido.sesionExpirada) {
      this.authService.cerrarSesion();
      void this.router.navigateByUrl('/auth/personal/login');
      return;
    }
    if (destino === 'form') {
      this.errorForm.set(traducido.mensaje);
      return;
    }
    this.error.set(traducido.mensaje);
  }
}
