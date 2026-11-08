import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Marca de la PLATAFORMA SaaS (FashionStore), reutilizable en las pantallas
 * compartidas del portal empresarial.
 *
 * No representa a ninguna empresa cliente: el nombre y el identificador de la
 * empresa autenticada los muestra cada pantalla con los datos de
 * GET /auth/tenant/me. Aquí solo vive la identidad de la plataforma.
 *
 * Es un componente puramente presentacional (sin servicios ni peticiones) y
 * hereda el tamaño de fuente del contenedor, de modo que puede usarse tanto en
 * la cabecera del login del personal como en los paneles `/saas/*`.
 */
@Component({
  selector: 'app-saas-brand',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './saas-brand.css',
  templateUrl: './saas-brand.html',
})
export class SaasBrand {
  /** Etiqueta opcional bajo el nombre (p. ej. "Portal empresarial"). */
  readonly etiqueta = input('');
}
