import { inject, Injectable } from '@angular/core';
import { catchError, Observable, shareReplay, throwError } from 'rxjs';

import {
  ProductoPublico,
  PublicoListarFiltros,
} from '../models/catalogo-publico.model';
import { CatalogoService } from './catalogo.service';

/**
 * Caché compartida de la carga pública del catálogo (CU09).
 *
 * Reutiliza `CatalogoService` para obtener el listado público una sola vez y
 * compartir el resultado entre las secciones de la landing (productos
 * destacados, nuevos ingresos, etc.). No crea un cliente HTTP propio ni
 * duplica el contrato público.
 *
 * No pertenece a CU15: aquí no se gestiona carrito, cantidades ni compras.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoPublicoStore {
  private readonly catalogoService = inject(CatalogoService);
  private readonly peticiones = new Map<string, Observable<ProductoPublico[]>>();

  /**
   * Productos públicos. La primera llamada para unos filtros crea la petición;
   * las siguientes suscripciones la comparten.
   */
  listarProductos(
    filtros: PublicoListarFiltros = {},
  ): Observable<ProductoPublico[]> {
    const clave = JSON.stringify(filtros);
    const existente = this.peticiones.get(clave);
    if (existente) {
      return existente;
    }

    const peticion$ = this.catalogoService.listarProductos(filtros).pipe(
      shareReplay({ bufferSize: 1, refCount: false }),
      catchError((error: unknown) => {
        // Un error no se cachea: el siguiente intento vuelve a consultar.
        this.peticiones.delete(clave);
        return throwError(() => error);
      }),
    );

    this.peticiones.set(clave, peticion$);
    return peticion$;
  }

  /** Invalida la caché para forzar una nueva consulta al backend. */
  invalidar(): void {
    this.peticiones.clear();
  }
}
