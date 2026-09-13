import { inject, Injectable } from '@angular/core';
import { catchError, Observable, shareReplay, throwError } from 'rxjs';

import {
  Producto,
  ProductoListarFiltros,
} from '../../administracion/catalogo/models/producto.model';
import { ProductosService } from '../../administracion/catalogo/services/productos.service';

/**
 * Caché compartida de la carga pública del catálogo (CU09).
 *
 * Reutiliza `ProductosService` (CU07) para obtener GET /productos una sola vez
 * y comparte el resultado entre las secciones de la landing (productos
 * destacados, nuevos ingresos, etc.). No crea un cliente HTTP propio ni
 * duplica el contrato público.
 *
 * No pertenece a CU15: aquí no se gestiona carrito, cantidades ni compras.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoPublicoStore {
  private readonly productosService = inject(ProductosService);
  private readonly peticiones = new Map<string, Observable<Producto[]>>();

  /**
   * Productos públicos (GET /productos). La primera llamada para unos filtros
   * crea la petición; las siguientes suscripciones la comparten.
   */
  listarProductos(filtros: ProductoListarFiltros = {}): Observable<Producto[]> {
    const clave = JSON.stringify(filtros);
    const existente = this.peticiones.get(clave);
    if (existente) {
      return existente;
    }

    const peticion$ = this.productosService.listarProductosPublicos(filtros).pipe(
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
