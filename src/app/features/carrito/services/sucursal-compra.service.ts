import { isPlatformBrowser } from '@angular/common';
import { computed, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

/** Clave de sessionStorage donde se conserva la sucursal de compra. */
const CLAVE_SUCURSAL = 'vanter_sucursal_compra';

interface SucursalGuardada {
  id: number;
  nombre: string;
}

/**
 * Contexto de compra del cliente: la sucursal elegida (CU15).
 *
 * - Solo guarda la sucursal seleccionada; NO crea carrito ni llama al backend.
 * - Se conserva entre catálogo y detalle de producto mientras el cliente navega.
 * - Cambiar de sucursal NO elimina el carrito anterior: el backend permite un
 *   carrito activo por cliente + sucursal.
 */
@Injectable({ providedIn: 'root' })
export class SucursalCompraService {
  private readonly platformId = inject(PLATFORM_ID);

  private readonly _sucursalId = signal<number | null>(null);
  private readonly _sucursalNombre = signal<string | null>(null);

  readonly sucursalId = this._sucursalId.asReadonly();
  readonly sucursalNombre = this._sucursalNombre.asReadonly();
  readonly comprando = computed(() => this._sucursalId() !== null);

  constructor() {
    this.restaurar();
  }

  /** Establece la sucursal de compra (contexto). */
  seleccionar(id: number, nombre: string): void {
    this._sucursalId.set(id);
    this._sucursalNombre.set(nombre);
    this.persistir();
  }

  /** Quita el contexto de compra (no afecta a carritos ya creados). */
  limpiar(): void {
    this._sucursalId.set(null);
    this._sucursalNombre.set(null);
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      sessionStorage.removeItem(CLAVE_SUCURSAL);
    } catch {
      // Almacenamiento no disponible: el contexto queda solo en memoria.
    }
  }

  private restaurar(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    try {
      const crudo = sessionStorage.getItem(CLAVE_SUCURSAL);
      if (crudo === null) {
        return;
      }
      const dato = JSON.parse(crudo) as SucursalGuardada;
      if (
        typeof dato?.id === 'number' &&
        Number.isInteger(dato.id) &&
        typeof dato?.nombre === 'string'
      ) {
        this._sucursalId.set(dato.id);
        this._sucursalNombre.set(dato.nombre);
      }
    } catch {
      // Dato corrupto: se ignora y el cliente vuelve a elegir sucursal.
    }
  }

  private persistir(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }
    const id = this._sucursalId();
    const nombre = this._sucursalNombre();
    if (id === null || nombre === null) {
      return;
    }
    try {
      sessionStorage.setItem(
        CLAVE_SUCURSAL,
        JSON.stringify({ id, nombre } satisfies SucursalGuardada),
      );
    } catch {
      // Almacenamiento no disponible: el contexto queda solo en memoria.
    }
  }
}
