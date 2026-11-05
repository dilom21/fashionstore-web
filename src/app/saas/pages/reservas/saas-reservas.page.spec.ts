import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import 'fake-indexeddb/auto';

import { environment } from '../../../../environments/environment';
import { ReservaComercial, TenantMe } from '../../models/tenant.models';
import { SaasOfflineQueueService } from '../../offline/offline-queue.service';
import { resetearIndexedDb } from '../../offline/offline-test.utils';
import { SaasSessionService } from '../../services/saas-session.service';
import { SaasReservasPage } from './saas-reservas.page';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_LISTADO = `${API}/tenant/comercial/reservas`;
const URL_CANCELAR = `${API}/tenant/reservas/12/cancelar`;
const URL_FINALIZAR = `${API}/tenant/reservas/12/finalizar-sin-compra`;

const RESERVA: ReservaComercial = { id: 12, estado: 'PENDIENTE' };

describe('SaasReservasPage', () => {
  let fixture: ComponentFixture<SaasReservasPage>;
  let componente: SaasReservasPage;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    fixture = TestBed.createComponent(SaasReservasPage);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    http
      .expectOne((peticion) => peticion.url === URL_LISTADO)
      .flush([RESERVA]);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  it('muestra el id y el estado publicados por el backend', () => {
    expect(componente.reservas().length).toBe(1);
    expect(componente.hayPaginaSiguiente()).toBe(false);

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('12');
    expect(texto).toContain('PENDIENTE');
  });

  it('un 403 del listado se muestra como estado informativo con reintento', () => {
    componente.recargar();

    http
      .expectOne((solicitud) => solicitud.url === URL_LISTADO)
      .flush(
        { detail: 'Operacion no autorizada' },
        { status: 403, statusText: 'Forbidden' },
      );
    fixture.detectChanges();

    expect(componente.sinPermiso()).toBe(true);
    expect(componente.errorListado()).toBeNull();

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('solo expone el listado de reservas');
    expect(fixture.nativeElement.querySelector('[role="status"]')).not.toBeNull();
  });

  it('cancelar envía un cuerpo vacío cuando no hay observación', () => {
    componente.abrirAccion('cancelar', RESERVA);
    fixture.detectChanges();

    componente.confirmarAccion();

    const peticion = http.expectOne(
      (solicitud) => solicitud.url === URL_CANCELAR,
    );
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({});

    peticion.flush({ reserva_id: 12, estado: 'CANCELADA' });

    http
      .expectOne((solicitud) => solicitud.url === URL_LISTADO)
      .flush([{ ...RESERVA, estado: 'CANCELADA' }]);
    fixture.detectChanges();

    expect(componente.accion()).toBeNull();
    expect(componente.mensajeExito()).toContain('Reserva #12 cancelada');
    expect(fixture.nativeElement.textContent).toContain(
      'Reserva #12 cancelada (estado CANCELADA)',
    );
  });

  it('finalizar sin compra envía la observación escrita', () => {
    componente.abrirAccion('finalizar-sin-compra', RESERVA);
    componente.formObservacion.controls.observacion.setValue('No compró');
    componente.confirmarAccion();

    const peticion = http.expectOne(
      (solicitud) => solicitud.url === URL_FINALIZAR,
    );
    expect(peticion.request.method).toBe('PATCH');
    expect(peticion.request.body).toEqual({ observacion: 'No compró' });

    peticion.flush({ reserva_id: 12, estado: 'ATENDIDA' });
    http.expectOne((solicitud) => solicitud.url === URL_LISTADO).flush([]);
    fixture.detectChanges();

    expect(componente.mensajeExito()).toContain(
      'finalizada sin compra (estado ATENDIDA)',
    );
  });

  it('un 403 de la acción se explica sin cerrar el diálogo', () => {
    componente.abrirAccion('cancelar', RESERVA);
    componente.confirmarAccion();

    http
      .expectOne((solicitud) => solicitud.url === URL_CANCELAR)
      .flush(
        { detail: 'Operación no autorizada' },
        { status: 403, statusText: 'Forbidden' },
      );
    fixture.detectChanges();

    http.expectNone(URL_LISTADO);
    expect(componente.accion()).not.toBeNull();
    expect(componente.tipoErrorAccion()).toBe('permiso');
    expect(fixture.nativeElement.textContent).toContain(
      'Tu rol no puede ejecutar esta acción',
    );
  });

  it('habilita Siguiente solo con una página completa', () => {
    const paginaCompleta: ReservaComercial[] = Array.from(
      { length: 50 },
      (_, indice) => ({ id: indice + 1, estado: 'PENDIENTE' }),
    );

    componente.recargar();
    http
      .expectOne((solicitud) => solicitud.url === URL_LISTADO)
      .flush(paginaCompleta);
    fixture.detectChanges();

    expect(componente.hayPaginaSiguiente()).toBe(true);

    componente.paginaSiguiente();
    const peticion = http.expectOne(
      (solicitud) => solicitud.url === URL_LISTADO,
    );
    expect(peticion.request.params.get('offset')).toBe('50');
    peticion.flush([]);
    fixture.detectChanges();

    expect(componente.pagina()).toBe(1);
    expect(componente.hayPaginaSiguiente()).toBe(false);
  });
});

describe('SaasReservasPage — operación offline', () => {
  let fixture: ComponentFixture<SaasReservasPage>;
  let componente: SaasReservasPage;
  let http: HttpTestingController;
  let queue: SaasOfflineQueueService;

  const IDENTIDAD: TenantMe = {
    usuario_id: 10,
    empresa_id: 1,
    empresa_slug: 'empresa-a',
    empresa_nombre: 'Empresa A',
    rol: 'ADMINISTRADOR',
    contexto: 'personal',
    plan_codigo: 'PRO',
    permite_reportes_ia: true,
  };

  beforeEach(() => {
    resetearIndexedDb();
    const identidad = signal<TenantMe | null>(IDENTIDAD);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SaasSessionService,
          useValue: {
            sesion: identidad.asReadonly(),
            contexto: computed(() => identidad()?.contexto ?? null),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(SaasReservasPage);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    queue = TestBed.inject(SaasOfflineQueueService);

    http
      .expectOne((peticion) => peticion.url === URL_LISTADO)
      .flush([RESERVA]);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  it('sin conexión guarda la cancelación en la cola y no hace PATCH', async () => {
    componente.abrirAccion('cancelar', RESERVA);
    componente.formObservacion.controls.observacion.setValue(
      'Cliente no llegó',
    );
    window.dispatchEvent(new Event('offline'));
    componente.confirmarAccion();

    for (
      let intento = 0;
      intento < 100 &&
      (queue.operaciones().length === 0 ||
        componente.avisoOffline() === null);
      intento += 1
    ) {
      await new Promise((resolver) => setTimeout(resolver, 5));
    }

    http.expectNone(URL_CANCELAR);
    expect(queue.operaciones()).toHaveLength(1);
    const operacion = queue.operaciones()[0];
    expect(operacion.tipo).toBe('RESERVA_CANCELAR');
    expect(operacion.payload).toEqual({
      reserva_id: 12,
      observacion: 'Cliente no llegó',
    });
    expect(componente.avisoOffline()).toContain(
      'quedó guardada en este dispositivo',
    );
    expect(componente.accion()).toBeNull();
  });
});
