import { Component, input } from '@angular/core';

import { IconoAdmin } from '../../models/admin-nav-item';

/**
 * Icono lineal reutilizable del panel administrativo.
 *
 * Centraliza los SVG (mismos trazos que el resto de la app) para que la
 * sidebar, las páginas y las tarjetas no dupliquen markup.
 */
@Component({
  selector: 'app-admin-icon',
  imports: [],
  styleUrl: './admin-icon.css',
  templateUrl: './admin-icon.html',
})
export class AdminIcon {
  readonly icono = input<IconoAdmin>('tool');
}
