import { Injectable, inject } from '@angular/core';

import {
  OFFLINE_IDENTITY_STORAGE_KEY,
  TenantApiService,
  TenantIdentidad,
} from '../services/tenant-api.service';

interface CachedIdentity {
  identity: TenantIdentidad;
  verified_at: string;
  expires_at: string;
}

/**
 * Identidad histórica para acceso EXCLUSIVAMENTE local durante la misma sesión
 * del navegador. No aporta headers, no valida backend y no sobrevive al cierre
 * de sesión/sessionStorage.
 */
@Injectable({ providedIn: 'root' })
export class OfflineIdentityService {
  private readonly api = inject(TenantApiService);
  private readonly ttlMs = 24 * 60 * 60 * 1000;

  identityForLocal(): TenantIdentidad | null {
    const live = this.api.identidad();
    if (live) {
      this.remember(live);
      return live;
    }
    if (typeof sessionStorage === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(OFFLINE_IDENTITY_STORAGE_KEY);
      if (!raw) return null;
      const cached = JSON.parse(raw) as CachedIdentity;
      if (
        !cached?.identity ||
        !Number.isInteger(cached.identity.empresa_id) ||
        !Number.isInteger(cached.identity.usuario_id) ||
        Date.parse(cached.expires_at) <= Date.now()
      ) {
        sessionStorage.removeItem(OFFLINE_IDENTITY_STORAGE_KEY);
        return null;
      }
      return cached.identity;
    } catch {
      sessionStorage.removeItem(OFFLINE_IDENTITY_STORAGE_KEY);
      return null;
    }
  }

  remember(identity: TenantIdentidad): void {
    if (typeof sessionStorage === 'undefined') return;
    const now = new Date();
    const cached: CachedIdentity = {
      identity,
      verified_at: now.toISOString(),
      expires_at: new Date(now.getTime() + this.ttlMs).toISOString(),
    };
    sessionStorage.setItem(
      OFFLINE_IDENTITY_STORAGE_KEY,
      JSON.stringify(cached),
    );
  }
}
