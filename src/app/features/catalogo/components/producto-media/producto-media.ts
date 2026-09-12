import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked,
} from '@angular/core';

/**
 * Imagen de producto con fallback accesible.
 *
 * Muestra la imagen cuando existe una URL válida y no falla la carga; en caso
 * contrario presenta un placeholder tipográfico de la marca. El estado de
 * "imagen rota" se reinicia automáticamente cuando cambia la URL.
 */
@Component({
  selector: 'app-producto-media',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './producto-media.css',
  templateUrl: './producto-media.html',
})
export class ProductoMedia {
  readonly url = input<string | null | undefined>(null);
  readonly alt = input<string>('');
  readonly nombre = input<string>('');
  readonly prioridad = input<'lazy' | 'eager'>('lazy');

  private readonly rota = signal(false);

  readonly mostrarImagen = computed(() => {
    const valor = this.url()?.trim();
    return Boolean(valor) && !this.rota();
  });

  readonly inicial = computed(() => {
    const nombre = this.nombre().trim();
    return nombre.length > 0 ? nombre.charAt(0).toUpperCase() : 'V';
  });

  constructor() {
    effect(() => {
      // Depende de la URL para limpiar el estado de imagen rota al cambiarla.
      this.url();
      untracked(() => this.rota.set(false));
    });
  }

  marcarRota(): void {
    this.rota.set(true);
  }
}
