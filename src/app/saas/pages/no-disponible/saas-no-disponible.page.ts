import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Pantalla para funcionalidades que el modo SaaS todavía no expone.
 *
 * Se usa tanto para rutas no migradas como destino informativo cuando una
 * petición legacy se bloquea en el cliente (el interceptor lanza
 * `SaasRutaLegacyBloqueadaError`).
 */
@Component({
  selector: 'app-saas-no-disponible-page',
  imports: [RouterLink],
  styleUrl: './saas-no-disponible.page.css',
  templateUrl: './saas-no-disponible.page.html',
})
export class SaasNoDisponiblePage {}
