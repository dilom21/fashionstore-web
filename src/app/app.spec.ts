import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { App } from './app';
import { AuthService } from './features/autenticacion-seguridad/auth/services/auth.service';
import { TenantApiService } from './features/saas/services/tenant-api.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('debería crear el componente raíz', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});

/**
 * Segundo parcial: al recargar la aplicación deben restaurarse AMBAS sesiones.
 * La empresarial se confirma con GET /auth/tenant/me dentro del servicio, así
 * que aquí solo se comprueba que la restauración se dispara una vez y que un
 * fallo (backend caído / 5xx) no rompe el arranque ni declara sesión.
 */
describe('App — restauración de sesiones', () => {
  function configurar(auth: any, api: any): void {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: TenantApiService, useValue: api },
      ],
    });
  }

  it('restaura la sesión legacy y la empresarial una sola vez', () => {
    const auth = { restaurarSesion: vi.fn(() => of(false)) };
    const api = { restaurarSesion: vi.fn(() => of(null)) };

    configurar(auth, api);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    expect(auth.restaurarSesion).toHaveBeenCalledTimes(1);
    expect(api.restaurarSesion).toHaveBeenCalledTimes(1);
  });

  it('un fallo de restauración no impide renderizar la aplicación', () => {
    const auth = {
      restaurarSesion: vi.fn(() =>
        throwError(() => new Error('backend caído')),
      ),
    };
    const api = {
      restaurarSesion: vi.fn(() =>
        throwError(() => new Error('backend caído')),
      ),
    };

    configurar(auth, api);
    const fixture = TestBed.createComponent(App);
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(api.restaurarSesion).toHaveBeenCalledTimes(1);
  });
});
