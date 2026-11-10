import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OfflineCatalogoItem, OfflineCatalogoReaderService } from '../offline/offline-catalogo-reader.service';
import { OfflineSnapshot } from '../offline/offline.models';

@Component({ standalone: true, imports: [RouterLink], templateUrl: './offline-catalogo.page.html', styleUrl: './saas-pages.css' })
export class OfflineCatalogoPage implements OnInit {
  private readonly reader = inject(OfflineCatalogoReaderService);
  readonly items = signal<OfflineCatalogoItem[]>([]); readonly snapshot = signal<OfflineSnapshot | undefined>(undefined); readonly error = signal<string | null>(null); readonly buscar = signal(''); readonly conStock = signal(false); readonly cargando = signal(true);
  async ngOnInit(): Promise<void> { await this.cargar(); }
  async cargar(): Promise<void> { this.cargando.set(true); this.error.set(null); try { const data = await this.reader.leer({ buscar: this.buscar(), conStock: this.conStock() }); this.snapshot.set(data.snapshot); this.items.set(data.productos); if (!data.snapshot) this.error.set('No hay una descarga local autorizada. Conéctate y prepara el uso sin conexión desde CU17.'); } catch (e) { this.error.set(e instanceof Error ? e.message : 'No se pudo leer la copia local.'); } finally { this.cargando.set(false); } }
  actualizarTexto(event: Event): void { this.buscar.set((event.target as HTMLInputElement).value); void this.cargar(); }
  actualizarStock(event: Event): void { this.conStock.set((event.target as HTMLInputElement).checked); void this.cargar(); }
  fecha(): string { const value = this.snapshot()?.download_completed_at; return value ? new Date(value).toLocaleString() : 'No disponible'; }
}
