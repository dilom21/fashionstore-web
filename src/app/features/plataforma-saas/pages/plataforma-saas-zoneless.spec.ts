import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { PlataformaDashboardPage } from './dashboard.page';
import { EmpresasPage } from './empresas.page';
import { PlanesPage } from './planes.page';
import { SuscripcionesPage } from './suscripciones.page';
import { NuevaEmpresaPage } from './nueva-empresa.page';
import { PrimerAdministradorPage } from './primer-administrador.page';
import { PlataformaLoginPage } from './login.page';
import type { Empresa, Plan, Suscripcion } from '../services/plataforma-saas.service';

const EMPRESA: Empresa = {
  id: 8, razon_social: 'Empresa Demo SRL', nombre_comercial: 'Tienda Demo',
  slug: 'tienda-demo', nit: '123', estado: true,
};
const PLAN: Plan = {
  id: 3, codigo: 'PRO', nombre: 'Plan Profesional',
  max_sucursales_activas: 5, estado: true,
  permite_productos: true, permite_ventas: true, permite_reservas: true,
  permite_offline: false, permite_reportes_convencionales: true,
  permite_reportes_ia: false,
};
const HISTORIAL: Suscripcion = {
  id: 44, empresa_id: 8, plan_saas_id: 3,
  fecha_inicio: '2026-11-01', fecha_vencimiento: '2027-11-01', estado: 'ACTIVA',
};

describe('Plataforma SaaS — detección de cambios zoneless tras HTTP asíncrono', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    TestBed.resetTestingModule();
  });

  it('dashboard reemplaza Cargando por los conteos reales de las respuestas HTTP', async () => {
    const fixture = TestBed.createComponent(PlataformaDashboardPage);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Cargando métricas globales');
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/plataforma/empresas').flush([EMPRESA, { ...EMPRESA, id: 9, estado: false }]);
    http.expectOne('/api/plataforma/planes').flush([PLAN, { ...PLAN, id: 4, estado: false }]);

    // Sin fixture.detectChanges() manual después de los HTTP.
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Cargando métricas globales');
    expect(text).toContain('Empresas registradas');
    expect(text).toContain('Empresas activas');
    expect(text).toContain('Planes disponibles');
    expect(fixture.componentInstance.empresasTotal()).toBe(2);
    expect(fixture.componentInstance.empresasActivas()).toBe(1);
    expect(fixture.componentInstance.planesActivos()).toBe(1);
    fixture.destroy();
  });

  it('dashboard sale del loading y muestra error si falla una API', async () => {
    const fixture = TestBed.createComponent(PlataformaDashboardPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/plataforma/empresas').flush('Error', { status: 503, statusText: 'Service Unavailable' });
    http.expectOne('/api/plataforma/planes');
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No fue posible cargar las métricas');
    expect(fixture.nativeElement.textContent).not.toContain('Cargando métricas globales');
    fixture.destroy();
  });

  it('empresas muestra registros y estados sin segunda detección manual', async () => {
    const fixture = TestBed.createComponent(EmpresasPage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/plataforma/empresas').flush([EMPRESA]);
    await fixture.whenStable();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Tienda Demo');
    expect(text).toContain('Activa');
    expect(text).not.toContain('Cargando empresas');
    fixture.destroy();
  });

  it('empresas recarga la vista tras cambiar estado de una empresa', async () => {
    const fixture = TestBed.createComponent(EmpresasPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/plataforma/empresas').flush([EMPRESA]);
    await fixture.whenStable();

    const button = fixture.nativeElement.querySelector('tbody button') as HTMLButtonElement;
    button.click();
    const patch = http.expectOne('/api/plataforma/empresas/8/estado');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ estado: false });
    patch.flush({});
    http.expectOne('/api/plataforma/empresas').flush([{ ...EMPRESA, estado: false }]);

    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Suspendida');
    expect(fixture.nativeElement.textContent).toContain('Activar');
    fixture.destroy();
  });

  it('empresas distingue listado vacío y fallo HTTP', async () => {
    const fixture = TestBed.createComponent(EmpresasPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/plataforma/empresas').flush([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No hay empresas registradas');
    fixture.componentInstance.load();
    http.expectOne('/api/plataforma/empresas').flush('Error', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No fue posible cargar las empresas');
    fixture.destroy();
  });

  it('planes refleja GET de dos planes y sus estados; también carga vacía', async () => {
    const fixture = TestBed.createComponent(PlanesPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/plataforma/planes').flush([PLAN, { ...PLAN, id: 4, nombre: 'Básico', estado: false }]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Plan Profesional');
    expect(fixture.nativeElement.textContent).toContain('Básico');
    expect(fixture.nativeElement.textContent).not.toContain('Cargando planes SaaS');
    fixture.componentInstance.load();
    http.expectOne('/api/plataforma/planes').flush([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No hay planes SaaS disponibles');
    fixture.destroy();
  });

  it('planes muestra error HTTP sin una pantalla de carga indefinida', async () => {
    const fixture = TestBed.createComponent(PlanesPage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/plataforma/planes')
      .flush('Error', { status: 503, statusText: 'Service Unavailable' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No fue posible cargar los planes SaaS');
    expect(fixture.nativeElement.textContent).not.toContain('Cargando planes SaaS');
    fixture.destroy();
  });

  it('suscripciones carga selector e historial y responde al cambio de empresa', async () => {
    const fixture = TestBed.createComponent(SuscripcionesPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/plataforma/empresas').flush([EMPRESA]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Tienda Demo');
    fixture.componentInstance.select(8);
    http.expectOne('/api/plataforma/empresas/8/suscripciones').flush([HISTORIAL]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('#44');
    expect(fixture.nativeElement.textContent).toContain('ACTIVA');
    expect(fixture.nativeElement.textContent).not.toContain('Cargando suscripciones');
    fixture.destroy();
  });

  it('suscripciones ignora respuestas tardías de una empresa ya deseleccionada', async () => {
    const fixture = TestBed.createComponent(SuscripcionesPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/plataforma/empresas').flush([EMPRESA]);
    fixture.componentInstance.select(8);
    const old = http.expectOne('/api/plataforma/empresas/8/suscripciones');
    fixture.componentInstance.select(0);
    old.flush([HISTORIAL]);
    await fixture.whenStable();
    expect(fixture.componentInstance.items()).toEqual([]);
    expect(fixture.nativeElement.textContent).not.toContain('#44');
    fixture.destroy();
  });

  it('suscripciones comunica fallo del historial y permite reintentar', async () => {
    const fixture = TestBed.createComponent(SuscripcionesPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/plataforma/empresas').flush([EMPRESA]);
    fixture.componentInstance.select(8);
    http.expectOne('/api/plataforma/empresas/8/suscripciones')
      .flush('Error', { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No fue posible cargar el historial');
    fixture.componentInstance.select(8);
    http.expectOne('/api/plataforma/empresas/8/suscripciones').flush([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('No hay historial para esta empresa');
    fixture.destroy();
  });

  it('formulario de nueva empresa muestra planes activos llegados por HTTP', async () => {
    const fixture = TestBed.createComponent(NuevaEmpresaPage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/plataforma/planes')
      .flush([PLAN, { ...PLAN, id: 9, nombre: 'Retirado', estado: false }]);
    await fixture.whenStable();
    const selector = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    expect(selector.textContent).toContain('Plan Profesional');
    expect(selector.textContent).not.toContain('Retirado');
    fixture.destroy();
  });

  it('formulario de administrador inicial resuelve empresa o muestra error terminal', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { paramMap: convertToParamMap({ id: '8' }) } },
    });
    const fixture = TestBed.createComponent(PrimerAdministradorPage);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectOne('/api/plataforma/empresas').flush([EMPRESA]);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Tienda Demo');
    expect(fixture.nativeElement.textContent).not.toContain('Cargando empresa');
    fixture.destroy();
  });

  it('login muestra error reactivo tras rechazo HTTP sin recarga de página', async () => {
    const fixture = TestBed.createComponent(PlataformaLoginPage);
    fixture.detectChanges();
    fixture.componentInstance.form.setValue({ usuario: 'admin@example.org', password: 'password123' });
    fixture.componentInstance.submit();
    TestBed.inject(HttpTestingController).expectOne('/api/plataforma/auth/login')
      .flush('Error', { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Usuario o contraseña inválidos');
    expect(fixture.nativeElement.textContent).not.toContain('Verificando…');
    fixture.destroy();
  });
});
