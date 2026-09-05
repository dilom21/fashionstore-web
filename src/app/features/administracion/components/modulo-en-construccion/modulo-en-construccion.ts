import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { IconoAdmin } from '../../models/admin-nav-item';
import { AdminIcon } from '../admin-icon/admin-icon';

/**
 * Pantalla temporal para módulos con navegación preparada pero sin
 * funcionalidad implementada aún ("Módulo en construcción").
 *
 * Recibe por metadatos de ruta (data) el título, la descripción y el icono
 * del módulo, por lo que una sola página sirve para todas las rutas futuras.
 */
@Component({
  selector: 'app-modulo-en-construccion',
  imports: [RouterLink, AdminIcon],
  styleUrl: './modulo-en-construccion.css',
  templateUrl: './modulo-en-construccion.html',
})
export class ModuloEnConstruccion {
  private readonly route = inject(ActivatedRoute);

  readonly titulo = signal('Módulo');
  readonly descripcion = signal('');
  readonly icono = signal<IconoAdmin>('tool');
  readonly modulo = signal('');

  constructor() {
    const datos = this.route.snapshot.data;
    this.titulo.set(typeof datos['titulo'] === 'string' ? datos['titulo'] : 'Módulo');
    this.descripcion.set(
      typeof datos['descripcion'] === 'string' ? datos['descripcion'] : '',
    );
    this.modulo.set(
      typeof datos['modulo'] === 'string' ? datos['modulo'] : '',
    );
    this.icono.set(
      typeof datos['icono'] === 'string'
        ? (datos['icono'] as IconoAdmin)
        : 'tool',
    );
  }
}
