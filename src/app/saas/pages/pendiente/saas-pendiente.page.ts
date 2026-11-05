import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

/**
 * Placeholder honesto para las secciones SaaS que se implementarán después.
 *
 * Recibe el título y la descripción por `route.data` y NO simula datos ni
 * llamadas: solo comunica el estado real del módulo.
 */
@Component({
  selector: 'app-saas-pendiente-page',
  imports: [RouterLink],
  styleUrl: './saas-pendiente.page.css',
  templateUrl: './saas-pendiente.page.html',
})
export class SaasPendientePage {
  private readonly route = inject(ActivatedRoute);

  readonly titulo = computed(
    () => leerTexto(this.route.snapshot.data['titulo']) ?? 'Módulo en construcción',
  );

  readonly descripcion = computed(
    () =>
      leerTexto(this.route.snapshot.data['descripcion']) ??
      'Esta sección todavía no tiene su endpoint de empresa en el backend.',
  );
}

/** Lee un texto de `route.data` sin asumir su tipo. */
function leerTexto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim().length > 0
    ? valor.trim()
    : null;
}
