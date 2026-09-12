import { DecimalPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';

import { AuthService } from '../../../../autenticacion-seguridad/auth/services/auth.service';
import { Producto } from '../../models/producto.model';
import { RecursoProducto } from '../../models/recurso-producto.model';
import { Variante } from '../../models/variante.model';
import { RecursosProductoService } from '../../services/recursos-producto.service';
import { VariantesService } from '../../services/variantes.service';
import { traducirErrorCatalogo } from '../../utils/http-error.util';

/**
 * Diálogo de consulta (Ver) de un producto (CU07).
 *
 * Muestra los datos del producto y, de forma de solo lectura, sus variantes y
 * recursos/imágenes. La edición de variantes y recursos se realiza desde los
 * diálogos específicos del listado.
 */
@Component({
  selector: 'app-producto-detalle-dialog',
  imports: [DecimalPipe],
  styleUrl: './producto-detalle-dialog.css',
  templateUrl: './producto-detalle-dialog.html',
})
export class ProductoDetalleDialog {
  readonly producto = input.required<Producto>();

  readonly cerrado = output<void>();

  private readonly variantesService = inject(VariantesService);
  private readonly recursosService = inject(RecursosProductoService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly variantes = signal<Variante[]>([]);
  readonly recursos = signal<RecursoProducto[]>([]);
  readonly cargando = signal(false);
  readonly error = signal<string | null>(null);
  readonly imagenesRotas = signal<ReadonlySet<number>>(new Set());

  ngOnInit(): void {
    this.cargarRelaciones();
  }

  private cargarRelaciones(): void {
    this.cargando.set(true);
    this.error.set(null);
    forkJoin({
      variantes: this.variantesService.listarVariantes(this.producto().id),
      recursos: this.recursosService.listarRecursos(this.producto().id),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ variantes, recursos }) => {
          this.cargando.set(false);
          this.variantes.set(variantes);
          this.recursos.set(recursos);
        },
        error: (error: unknown) => {
          this.cargando.set(false);
          const traducido = traducirErrorCatalogo(error);
          if (traducido.sesionExpirada) {
            this.authService.cerrarSesion();
            void this.router.navigateByUrl('/auth/personal/login');
            return;
          }
          this.error.set(traducido.mensaje);
        },
      });
  }

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

  cerrar(): void {
    this.cerrado.emit();
  }
}
