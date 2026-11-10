import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { OfflineCatalogoReaderService } from '../offline/offline-catalogo-reader.service';
import { OfflineDisponibilidad, OfflineProducto, OfflineSucursal, OfflineVariante } from '../offline/offline.models';

@Component({ selector: 'app-offline-catalogo-detalle', imports: [RouterLink], templateUrl: './offline-catalogo-detalle.page.html', styleUrl: './offline-pages.css' })
export class OfflineCatalogoDetallePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly reader = inject(OfflineCatalogoReaderService);
  readonly producto = signal<OfflineProducto | undefined>(undefined);
  readonly variantes = signal<OfflineVariante[]>([]);
  readonly disponibilidad = signal<OfflineDisponibilidad[]>([]);
  readonly sucursales = signal<OfflineSucursal[]>([]);
  readonly error = signal<string | null>(null);
  ngOnInit(): void { void this.cargar(); }
  private async cargar(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(id) || id < 1) { this.error.set('Producto local inválido.'); return; }
    try { const data = await this.reader.detalle(id); this.producto.set(data.producto); this.variantes.set(data.variantes); this.disponibilidad.set(data.disponibilidad); this.sucursales.set(data.sucursales); if (!data.producto) this.error.set('El producto no existe en esta copia local.'); } catch (error) { this.error.set(error instanceof Error ? error.message : 'No se pudo leer el producto.'); }
  }
  stock(varianteId: number): number | null { const rows = this.disponibilidad().filter((row) => row.variante_id === varianteId); return rows.length ? rows.reduce((sum, row) => sum + row.stock_disponible_conocido, 0) : null; }
}
