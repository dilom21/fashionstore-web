import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { CarritoService } from '../../../carrito/services/carrito.service';
import { TenantApiService } from '../../../saas/services/tenant-api.service';
import { SAAS_MODE } from '../../../../core/config/app-mode';
import { Navbar } from './navbar';

@Component({ selector: 'app-catalogo-stub', template: '' })
class CatalogoStub {}

describe('Navbar', () => {
  let fixture: ComponentFixture<Navbar>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Navbar],
      providers: [
        provideRouter([
          { path: 'catalogo', component: CatalogoStub },
          { path: 'carritos', component: CatalogoStub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(Navbar);
    fixture.detectChanges();
  });

  it('el enlace "Catálogo" navega con RouterLink a /catalogo', async () => {
    const enlaces = Array.from(
      fixture.nativeElement.querySelectorAll('a.nav__link'),
    ) as HTMLAnchorElement[];
    const catalogo = enlaces.find(
      (a) => a.textContent?.trim() === 'Catálogo',
    );

    expect(catalogo).toBeTruthy();
    expect(catalogo!.getAttribute('href')).toBe('/catalogo');

    catalogo!.click();
    await fixture.whenStable();

    expect(router.url).toBe('/catalogo');
  });

  it('la bolsa lleva a "Tus carritos" (CU15) y sin sesión no muestra badge', () => {
    const bolsa = fixture.nativeElement.querySelector(
      'a[aria-label="Ver mis carritos"]',
    ) as HTMLAnchorElement;

    expect(bolsa).toBeTruthy();
    expect(bolsa.getAttribute('href')).toBe('/carritos');
    // Sin cliente autenticado no se muestra el contador de carritos.
    expect(fixture.nativeElement.querySelector('.nav__cart-badge')).toBeNull();
  });

  it('el buscador navega a /catalogo?buscar= sin usar productos mock', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.query.set('polo');
    fixture.componentInstance.searchOpen.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.search__list')).toBeNull();

    const boton = fixture.nativeElement.querySelector(
      '.search__go',
    ) as HTMLButtonElement;
    boton.click();

    expect(navigate).toHaveBeenCalledWith(['/catalogo'], {
      queryParams: { buscar: 'polo' },
    });
  });

  it('la marca visible es FashionStore y no la tienda heredada', () => {
    const marca = fixture.nativeElement.querySelector(
      '.nav__brand-name',
    ) as HTMLElement;

    expect(marca).toBeTruthy();
    expect((marca.textContent ?? '').replace(/\s+/g, '')).toBe('FASHIONSTORE');

    const enlace = fixture.nativeElement.querySelector(
      'a.nav__brand',
    ) as HTMLAnchorElement;
    expect(enlace.getAttribute('aria-label')).toBe('FashionStore — ir al inicio');
    expect(enlace.getAttribute('href')).toBe('/');

    expect(fixture.nativeElement.textContent).not.toContain('VANTER');
  });
});

/**
 * Segundo parcial: el navbar debe reconocer la sesión de CLIENTE confirmada por
 * el mecanismo SaaS (`GET /auth/tenant/me`) sin mezclarla con la sesión del
 * personal ni disparar consultas de carrito.
 */
describe('Navbar — sesión de cliente SaaS', () => {
  function authMock(opciones: {
    cliente?: boolean;
    personal?: boolean;
  }): any {
    const usuario = opciones.cliente
      ? {
          id: 21,
          correo: 'cliente@vanter.test',
          rol: 'CLIENTE',
          contexto: 'cliente' as const,
          cliente_id: 5,
          nombre: 'Juan',
          apellido: 'Pérez',
        }
      : opciones.personal
        ? {
            id: 12,
            correo: 'cajero@vanter.test',
            rol: 'CAJERO',
            contexto: 'personal' as const,
            empleado_id: 7,
            nombre: 'Harold',
            apellido: 'Amador',
            sucursal_id: 2,
          }
        : null;

    return {
      usuarioActual: () => usuario,
      autenticado: () => usuario !== null,
      contexto: () => usuario?.contexto ?? null,
      esCliente: () => usuario?.contexto === 'cliente',
      esPersonal: () => usuario?.contexto === 'personal',
      loginCliente: vi.fn(),
      cerrarSesion: vi.fn(),
      restaurarSesion: vi.fn(() => of(null)),
    };
  }

  /** GET /auth/tenant/me no devuelve nombre/apellido para contexto cliente. */
  function tenantMock(contexto: 'cliente' | 'personal' | null): any {
    return {
      contexto: () => contexto,
      autenticado: () => contexto !== null,
      identidad: () =>
        contexto === null
          ? null
          : {
              usuario_id: 21,
              empresa_id: 3,
              empresa_slug: 'vanter-men',
              empresa_nombre: 'Vanter Men',
              rol: contexto === 'cliente' ? 'CLIENTE' : 'CAJERO',
              contexto,
              plan_codigo: 'PRO',
              permite_reportes_ia: false,
              correo: null,
              empleado_id: null,
              nombre: null,
              apellido: null,
              sucursal_id: null,
            },
      cerrarSesion: vi.fn(),
      tieneToken: () => contexto !== null,
      restaurarSesion: vi.fn(() => of(null)),
    };
  }

  function carritoMock(): any {
    return {
      totalCarritosActivos: vi.fn(() => 0),
      refrescarContador: vi.fn(),
      limpiar: vi.fn(),
    };
  }

  let fixture: ComponentFixture<Navbar>;
  let navbar: Navbar;
  let router: Router;
  let auth: any;
  let api: any;
  let carrito: any;

  async function setup(opciones: {
    auth: any;
    api: any;
    saasMode?: boolean;
  }): Promise<void> {
    auth = opciones.auth;
    api = opciones.api;
    carrito = carritoMock();

    await TestBed.configureTestingModule({
      imports: [Navbar],
      providers: [
        provideRouter([
          { path: 'catalogo', component: CatalogoStub },
          { path: 'carritos', component: CatalogoStub },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SAAS_MODE, useValue: opciones.saasMode ?? true },
        { provide: AuthService, useValue: auth },
        { provide: TenantApiService, useValue: api },
        { provide: CarritoService, useValue: carrito },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture = TestBed.createComponent(Navbar);
    navbar = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('muestra el estado de sesión iniciada sin inventar el nombre del cliente', async () => {
    await setup({ auth: authMock({}), api: tenantMock('cliente') });

    const texto = fixture.nativeElement.querySelector(
      '.nav__account-text',
    ) as HTMLElement;

    expect(texto).toBeTruthy();
    expect(texto.textContent?.trim()).toBe('Mi cuenta');
    expect(navbar.cuentaTexto()).toBe('Mi cuenta');
    expect(fixture.nativeElement.textContent).not.toContain('null');
  });

  /** Abre el menú de cuenta y devuelve sus ítems. */
  function abrirMenu(): HTMLElement[] {
    const boton = fixture.nativeElement.querySelector(
      '.nav__account',
    ) as HTMLButtonElement;
    boton.click();
    fixture.detectChanges();
    return Array.from(
      fixture.nativeElement.querySelectorAll('.nav__account-item'),
    ) as HTMLElement[];
  }

  it('el menú de cliente SaaS ofrece "Mis reservas", "Mis compras" y "Cerrar sesión"', async () => {
    await setup({ auth: authMock({}), api: tenantMock('cliente') });

    const items = abrirMenu();

    expect(items.some((i) => i.textContent?.includes('Cerrar sesión'))).toBe(
      true,
    );
    const reservas = items.find((i) =>
      i.textContent?.includes('Mis reservas'),
    ) as HTMLAnchorElement | undefined;
    expect(reservas).toBeTruthy();
    expect(reservas?.getAttribute('href')).toBe('/reservas');

    // CU24 ya está adaptado: el cliente SaaS consulta su historial tenant.
    const compras = items.find((i) =>
      i.textContent?.includes('Mis compras'),
    ) as HTMLAnchorElement | undefined;
    expect(compras).toBeTruthy();
    expect(compras?.getAttribute('href')).toBe('/ventas/historial');
  });

  it('en modo legacy conserva "Mis reservas" y "Mis compras" del cliente', async () => {
    await setup({
      auth: authMock({ cliente: true }),
      api: tenantMock(null),
      saasMode: false,
    });

    const items = abrirMenu();

    const reservas = items.find((i) =>
      i.textContent?.includes('Mis reservas'),
    ) as HTMLAnchorElement | undefined;
    const compras = items.find((i) =>
      i.textContent?.includes('Mis compras'),
    ) as HTMLAnchorElement | undefined;

    expect(reservas?.getAttribute('href')).toBe('/reservas');
    expect(compras?.getAttribute('href')).toBe('/ventas/historial');
  });

  it('el personal no ve rutas de cliente en el menú', async () => {
    await setup({
      auth: authMock({ personal: true }),
      api: tenantMock(null),
      saasMode: true,
    });

    const items = abrirMenu();

    expect(items.some((i) => i.textContent?.includes('Mis reservas'))).toBe(
      false,
    );
    expect(items.some((i) => i.textContent?.includes('Mis compras'))).toBe(
      false,
    );
  });

  it('cerrar sesión cierra solo la sesión empresarial y nunca la de personal', async () => {
    // Caso sensible: la pestaña tiene sesión de personal legacy Y de cliente SaaS.
    await setup({
      auth: authMock({ personal: true }),
      api: tenantMock('cliente'),
    });

    navbar.cerrarSesion();

    expect(api.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(auth.cerrarSesion).not.toHaveBeenCalled();
    expect(carrito.limpiar).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('cerrar sesión de un cliente SaaS sin sesión legacy no toca la sesión legacy', async () => {
    await setup({ auth: authMock({}), api: tenantMock('cliente') });

    navbar.cerrarSesion();

    expect(api.cerrarSesion).toHaveBeenCalledTimes(1);
    expect(auth.cerrarSesion).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('una sesión de cliente SaaS refresca el contador del carrito una sola vez', async () => {
    await setup({ auth: authMock({}), api: tenantMock('cliente') });

    expect(carrito.refrescarContador).toHaveBeenCalledTimes(1);
    // El doble devuelve 0 carritos activos: no se muestra badge.
    expect(fixture.nativeElement.querySelector('.nav__cart-badge')).toBeNull();
  });

  it('una sesión empresarial de personal no se presenta como sesión de cliente', async () => {
    await setup({ auth: authMock({}), api: tenantMock('personal') });

    expect(navbar.sesionVisible()).toBe(false);
    // Sin sesión de cliente se mantiene el enlace de visitante del primer parcial.
    const texto = fixture.nativeElement.querySelector(
      '.nav__account-text',
    ) as HTMLElement;
    expect(texto.textContent?.trim()).toBe('Identifícate');
  });
});
