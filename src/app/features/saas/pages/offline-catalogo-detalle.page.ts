import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OfflineCatalogoReaderService } from '../offline/offline-catalogo-reader.service';
import { OfflineSnapshot } from '../offline/offline.models';

@Component({ standalone: true, imports: [DecimalPipe, RouterLink], templateUrl: './offline-catalogo-detalle.page.html', styleUrl: './saas-pages.css' })
export class OfflineCatalogoDetallePage implements OnInit {
  private readonly route = inject(ActivatedRoute); private readonly reader = inject(OfflineCatalogoReaderService);
  readonly data = signal<Awaited<ReturnType<OfflineCatalogoReaderService['detalle']>> | null>(null); readonly snapshot = signal<OfflineSnapshot | undefined>(undefined); readonly error = signal<string | null>(null);
  async ngOnInit(): Promise<void> { const id = Number(this.route.snapshot.paramMap.get('id')); try { const value = await this.reader.detalle(id); this.data.set(value); this.snapshot.set(value.snapshot); if (!value.producto) this.error.set('Producto no disponible en esta descarga.'); } catch (e) { this.error.set(e instanceof Error ? e.message : 'No se pudo leer el detalle local.'); } }
  stock(varianteId: number): number | null { const rows = this.data()?.disponibilidad.filter(d => d.variante_id === varianteId) ?? []; return rows.length ? rows.reduce((sum, row) => sum + Math.max(0, row.stock_disponible_conocido), 0) : null; }
  fecha(): string { const value = this.snapshot()?.download_completed_at; return value ? new Date(value).toLocaleString() : 'No disponible'; }
}
