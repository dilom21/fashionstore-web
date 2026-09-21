import { inject, Injectable } from '@angular/core';
import { Observable, catchError, map, merge, of, shareReplay, startWith } from 'rxjs';

import {
  Producto,
  ProductoDetalle,
  RecursoProductoDetalle,
} from '../../administracion/catalogo/models/producto.model';
import { ProductosService } from '../../administracion/catalogo/services/productos.service';

/** Imágenes reales disponibles de un producto. */
export interface ImagenesProducto {
  /**
   * `Producto.imagen_principal_url` del backend.
   *
   * OJO: el backend solo lo llena cuando existe un recurso GENERAL
   * (`color_id is None`) marcado `es_principal` y activo; si las imágenes
   * reales son por color, viene `null`. Por eso no es la única fuente.
   */
  principal: string | null;
  /** Recurso general (sin color) marcado principal, o el primero sin color. */
  generica: string | null;
  /** Recursos por color (clave: nombre del color normalizado). */
  porColor: ReadonlyMap<string, string>;
  /** Primer recurso de imagen real de cualquier color (último recurso). */
  cualquiera: string | null;
}

/** Línea a la que se le resolverá la imagen (clave local arbitraria). */
export interface LineaImagen {
  /** Identificador local de la línea (p. ej. `detalle_venta_id`). */
  clave: number;
  producto_id: number;
  color_nombre: string;
}

/**
 * Resolución de la imagen REAL de una prenda para CU25.
 *
 * El contrato de CU25 no devuelve imágenes (solo `producto_id`), así que la
 * fuente real es el catálogo existente:
 * `GET /productos/{producto_id}` -> `ProductoDetalle.recursos[]` (recursos
 * reales de `recurso_producto`, con o sin color) y, como respaldo,
 * `Producto.imagen_principal_url`.
 *
 * Nota real del backend: `imagen_principal_url` solo se llena cuando existe un
 * recurso GENERAL (`color_id is None`) marcado `es_principal` y activo, por lo
 * que las imágenes por color de `recursos[]` son imprescindibles.
 *
 * Reglas para no provocar N+1:
 * - cada `producto_id` se consulta UNA sola vez (cache en memoria + petición en
 *   vuelo compartida con `shareReplay`);
 * - varias líneas del mismo producto reutilizan la misma imagen;
 * - las peticiones se hacen una vez al cargar la lista, nunca desde la
 *   plantilla ni desde getters;
 * - si el producto no tiene imagen se devuelve `null` y la vista muestra un
 *   placeholder (sin imágenes inventadas ni URLs construidas a mano).
 */
@Injectable({ providedIn: 'root' })
export class ProductoImagenService {
  private readonly productos = inject(ProductosService);
  private readonly cache = new Map<number, Observable<ImagenesProducto>>();

  /** Imágenes del producto, cacheando la petición por `producto_id`. */
  imagenesProducto(productoId: number): Observable<ImagenesProducto> {
    const id = Number(productoId);
    const vacio: ImagenesProducto = {
      principal: null,
      generica: null,
      porColor: new Map(),
      cualquiera: null,
    };

    if (!Number.isInteger(id) || id <= 0) {
      return of(vacio);
    }

    let peticion = this.cache.get(id);
    if (peticion === undefined) {
      peticion = this.productos.obtenerProductoPublico(id).pipe(
        map((producto) => this.extraer(producto)),
        catchError(() => of(vacio)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.cache.set(id, peticion);
    }
    return peticion;
  }

  /**
   * Resuelve las imágenes de varias líneas emitiendo el mapa completo
   * `clave -> url|null` cada vez que un producto termina de resolverse.
   */
  imagenesDeLineas(
    lineas: ReadonlyArray<LineaImagen>,
  ): Observable<Record<number, string | null>> {
    const porProducto = new Map<number, LineaImagen[]>();
    for (const linea of lineas) {
      const grupo = porProducto.get(linea.producto_id);
      if (grupo === undefined) {
        porProducto.set(linea.producto_id, [linea]);
      } else {
        grupo.push(linea);
      }
    }

    if (porProducto.size === 0) {
      return of({});
    }

    const resueltas = new Map<number, ImagenesProducto>();
    const emisiones = [...porProducto.keys()].map((productoId) =>
      this.imagenesProducto(productoId).pipe(
        map((imagenes) => {
          resueltas.set(productoId, imagenes);
          return this.componer(porProducto, resueltas);
        }),
      ),
    );

    return merge(...emisiones).pipe(startWith({}));
  }

  /**
   * URL para un color concreto.
   *
   * Orden real de resolución:
   *   1. recurso de imagen del color de la variante (si existe);
   *   2. `imagen_principal_url` del backend;
   *   3. recurso general del producto, o cualquier recurso de imagen real;
   *   4. `null` -> la vista muestra el placeholder.
   */
  urlPara(
    imagenes: ImagenesProducto | null,
    colorNombre: string | null,
  ): string | null {
    if (imagenes === null) {
      return null;
    }
    const color = normalizarColor(colorNombre);
    if (color) {
      const url = imagenes.porColor.get(color);
      if (url) {
        return url;
      }
    }
    return imagenes.principal ?? imagenes.generica ?? imagenes.cualquiera;
  }

  private componer(
    porProducto: ReadonlyMap<number, LineaImagen[]>,
    resueltas: ReadonlyMap<number, ImagenesProducto>,
  ): Record<number, string | null> {
    const mapa: Record<number, string | null> = {};
    for (const [productoId, imagenes] of resueltas) {
      for (const linea of porProducto.get(productoId) ?? []) {
        mapa[linea.clave] = this.urlPara(imagenes, linea.color_nombre);
      }
    }
    return mapa;
  }

  /**
   * Extrae las imágenes reales del producto.
   *
   * `ProductoDetalle.recursos[]` es la fuente fiable (incluye recursos de color
   * y generales). `imagen_principal_url` se usa como respaldo, porque el
   * backend solo lo llena cuando hay un recurso general principal activo.
   */
  private extraer(producto: Producto | ProductoDetalle): ImagenesProducto {
    const recursos: ReadonlyArray<RecursoProductoDetalle> =
      'recursos' in producto ? (producto.recursos ?? []) : [];
    const clasificados = this.clasificar(recursos);

    return {
      principal: this.url(producto.imagen_principal_url),
      generica: clasificados.generica,
      porColor: clasificados.porColor,
      cualquiera: clasificados.cualquiera,
    };
  }

  /**
   * Clasifica los recursos REALES del producto.
   *
   * Se prefieren recursos de tipo imagen, pero cualquier recurso con URL sirve
   * como último respaldo: si el producto tiene imágenes reales, se muestran.
   */
  private clasificar(recursos: ReadonlyArray<RecursoProductoDetalle>): {
    porColor: ReadonlyMap<string, string>;
    generica: string | null;
    cualquiera: string | null;
  } {
    const colorImagen = new Map<string, string>();
    const colorOtros = new Map<string, string>();
    let generalImagen: string | null = null;
    let generalImagenPrincipal: string | null = null;
    let generalOtros: string | null = null;
    let cualquieraImagen: string | null = null;
    let cualquieraOtros: string | null = null;

    for (const recurso of recursos) {
      const url = this.url(recurso.url);
      if (url === null) {
        continue;
      }

      const esImagen = this.esImagen(recurso);
      const color = normalizarColor(recurso.color?.nombre ?? null);

      if (esImagen && cualquieraImagen === null) {
        cualquieraImagen = url;
      }
      if (cualquieraOtros === null) {
        cualquieraOtros = url;
      }

      if (color === null) {
        if (esImagen && recurso.es_principal && generalImagenPrincipal === null) {
          generalImagenPrincipal = url;
        } else if (esImagen && generalImagen === null) {
          generalImagen = url;
        } else if (generalOtros === null) {
          generalOtros = url;
        }
        continue;
      }

      if (esImagen && !colorImagen.has(color)) {
        colorImagen.set(color, url);
      } else if (!colorOtros.has(color)) {
        colorOtros.set(color, url);
      }
    }

    const porColor = new Map<string, string>(colorImagen);
    for (const [color, url] of colorOtros) {
      if (!porColor.has(color)) {
        porColor.set(color, url);
      }
    }

    return {
      porColor,
      generica:
        generalImagenPrincipal ??
        generalImagen ??
        generalOtros ??
        cualquieraImagen ??
        cualquieraOtros,
      cualquiera: cualquieraImagen ?? cualquieraOtros,
    };
  }

  /** ¿El recurso es una imagen? (`tipo` real del catálogo). */
  private esImagen(recurso: RecursoProductoDetalle): boolean {
    return (recurso.tipo ?? '').toUpperCase().includes('IMAGEN');
  }

  /** URL limpia, o `null` si el recurso no trae una. */
  private url(valor: string | null | undefined): string | null {
    const texto = (valor ?? '').trim();
    return texto.length > 0 ? texto : null;
  }
}

/**
 * Normaliza el nombre de un color para comparar catálogo vs. venta
 * (minúsculas, sin acentos y sin espacios redundantes).
 */
function normalizarColor(valor: string | null | undefined): string | null {
  const texto = (valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
  return texto.length > 0 ? texto : null;
}
