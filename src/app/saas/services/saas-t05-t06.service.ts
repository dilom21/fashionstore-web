import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import {
  PublicBranch,
  PublicListResponse,
  PublicProduct,
  TenantGeneratedReport,
  TenantDynamicReport,
  TenantMLReport,
  TenantPromotion,
  TenantReportSummary,
  TenantSeason,
} from '../models/t05-t06.models';

@Injectable({ providedIn: 'root' })
export class SaasT05T06Service {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl.replace(/\/+$/, '');

  publicCatalog(slug: string, text = '') {
    let params = new HttpParams().set('limit', 100);
    if (text.trim()) params = params.set('texto', text.trim());
    return this.http.get<PublicListResponse<PublicProduct>>(
      `${this.api}/tenant/public/${encodeURIComponent(slug)}/catalogo`,
      { params },
    );
  }

  publicBranches(slug: string) {
    return this.http.get<PublicListResponse<PublicBranch>>(
      `${this.api}/tenant/public/${encodeURIComponent(slug)}/sucursales`,
    );
  }

  seasons() {
    return this.http.get<TenantSeason[]>(`${this.api}/tenant/merchandising/temporadas`);
  }

  createSeason(body: Omit<TenantSeason, 'id' | 'estado'>) {
    return this.http.post<TenantSeason>(`${this.api}/tenant/merchandising/temporadas`, body);
  }

  promotions() {
    return this.http.get<TenantPromotion[]>(`${this.api}/tenant/merchandising/promociones`);
  }

  createPromotion(body: Omit<TenantPromotion, 'id' | 'estado'>) {
    return this.http.post<TenantPromotion>(`${this.api}/tenant/merchandising/promociones`, body);
  }

  reportSummary(filters: { fecha_desde?: string; fecha_hasta?: string; sucursal_id?: number }) {
    let params = new HttpParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params = params.set(key, value);
    });
    return this.http.get<TenantReportSummary>(`${this.api}/tenant/reportes/resumen`, { params });
  }

  generatedReport(filters: { fecha_desde?: string; fecha_hasta?: string; sucursal_id?: number }) {
    return this.http.post<TenantGeneratedReport>(`${this.api}/tenant/reportes/generativo`, filters);
  }

  dynamicReport(body: { tipo?: string; pregunta?: string; fecha_desde?: string; fecha_hasta?: string; sucursal_id?: number }) {
    return this.http.post<TenantDynamicReport>(`${this.api}/tenant/reportes/consulta`, body);
  }

  mlReport() {
    return this.http.get<TenantMLReport>(`${this.api}/tenant/reportes/analitica/ml`);
  }

  exportReport(tipo: string, formato: 'xlsx' | 'pdf', filters: { fecha_desde?: string; fecha_hasta?: string; sucursal_id?: number } = {}) {
    let params = new HttpParams().set('formato', formato);
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    });
    return this.http.get(`${this.api}/tenant/reportes/exportar/${encodeURIComponent(tipo)}`, {
      params, observe: 'response', responseType: 'blob',
    });
  }

  recommendations(body: { consulta: string; presupuesto_max?: number }) {
    return this.http.post(`${this.api}/tenant/asistencia-inteligente/recomendaciones`, body);
  }

  fittingConfigurations(productId: number, variantId?: number) {
    const params = variantId ? new HttpParams().set('variante_id', variantId) : undefined;
    return this.http.get(`${this.api}/tenant/vestidor-virtual/productos/${productId}/configuraciones`, { params });
  }
}
