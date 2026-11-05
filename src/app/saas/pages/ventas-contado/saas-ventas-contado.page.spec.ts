import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import 'fake-indexeddb/auto';

import { environment } from '../../../../environments/environment';
import {
  TenantInventario,
  TenantMe,
  TenantSucursal,
  VentaContadoRespuesta,
} from '../../models/tenant.models';
import { SaasOfflineQueueService } from '../../offline/offline-queue.service';
import { resetearIndexedDb } from '../../offline/offline-test.utils';
import { SaasPermissionsService } from '../../services/saas-permissions.service';
import { SaasSessionService } from '../../services/saas-session.service';
import { SaasVentasContadoPage } from './saas-ventas-contado.page';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_SUCURSALES = `${API}/tenant/empresa/sucursales`;
const URL_VENTAS = `${API}/tenant/comercial/ventas`;
const URL_CONTADO = `${API}/tenant/ventas/contado`;
const URL_INVENTARIO = `${API}/tenant/inventario`;

const SUCURSAL: TenantSucursal = {
  id: 4,
  ciudad_id: 1,
  nombre: 'Sucursal Centro',
  direccion: 'Av. Arce 123',
  telefono: null,
  estado: true,
};

const INVENTARIO: TenantInventario = {
  id: 101,
  sucursal_id: 4,
  sucursal_nombre: 'Sucursal Centro',
  variante_producto_id: 9,
  producto_id: 3,
  producto_nombre: 'Polera oversize',
  sku: 'POL-M-BLA',
  talla_id: 4,
  talla: 'M',
  color_id: 7,
  color: 'Blanco',
  temporada_id: 2,
  temporada_nombre: 'Verano 2026',
  stock_actual: 7,
  stock_reservado: 2,
  stock_disponible: 5,
};

const RESPUESTA: VentaContadoRespuesta = {
  venta_id: 55,
  pago_id: 66,
  estado: 'COMPLETADA',
  canal: 'PRESENCIAL',
  metodo_pago: 'EFECTIVO',
  total: 240,
  moneda: 'BOB',
  operacion_id: '6f1c2b7e-3a4d-4f5e-9a0b-1c2d3e4f5a6b',
  idempotente: false,
  lineas: [
    {
      inventario_id: 101,
      cantidad: 2,
      precio_unitario: 120,
      subtotal: 240,
    },
  ],
  stock: [{ inventario_id: 101, stock_actual: 8, stock_reservado: 0 }],
};

describe('SaasVentasContadoPage', () => {
  let fixture: ComponentFixture<SaasVentasContadoPage>;
  let componente: SaasVentasContadoPage;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: SaasPermissionsService,
          useValue: { puede: () => true },
        },
      ],
    });

    fixture = TestBed.createComponent(SaasVentasContadoPage);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    http.expectOne((peticion) => peticion.url === URL_SUCURSALES).flush([SUCURSAL]);
    http
      .expectOne((peticion) => peticion.url === URL_INVENTARIO)
      .flush([INVENTARIO]);
    http.expectOne((peticion) => peticion.url === URL_VENTAS).flush([]);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  /** Completa la única línea con un inventario y una cantidad válidos. */
  function completarLinea(): void {
    const linea = componente.lineas.at(0);
    linea.controls.inventario_id.setValue(101);
    linea.controls.cantidad.setValue(2);
    fixture.detectChanges();
  }

  it('preselecciona la primera sucursal activa y muestra una línea', () => {
    expect(componente.form.controls.sucursal_id.value).toBe(4);
    expect(componente.numeroLineas()).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(1);
    expect(componente.puedeQuitarLinea()).toBe(false);
  });

  it('agrega y quita líneas respetando el mínimo de una', () => {
    componente.agregarLinea();
    fixture.detectChanges();
    expect(componente.numeroLineas()).toBe(2);
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);

    componente.quitarLinea(0);
    fixture.detectChanges();
    expect(componente.numeroLineas()).toBe(1);

    componente.quitarLinea(0);
    expect(componente.numeroLineas()).toBe(1);
  });

  it('no envía la venta si una línea está incompleta', () => {
    componente.enviar();
    fixture.detectChanges();

    http.expectNone(URL_CONTADO);
    expect(componente.mensajeValidacion()).not.toBeNull();
    expect(componente.erroresLineas()['0']?.inventario_id).toContain(
      'identificador de inventario',
    );
  });

  it('envía el cuerpo exacto y rota el operacion_id tras el 201', () => {
    completarLinea();
    const operacionInicial = componente.operacionId();

    componente.enviar();

    const peticion = http.expectOne(
      (solicitud) => solicitud.url === URL_CONTADO,
    );
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      sucursal_id: 4,
      operacion_id: operacionInicial,
      metodo_pago: 'EFECTIVO',
      lineas: [{ inventario_id: 101, cantidad: 2 }],
    });

    peticion.flush(RESPUESTA, { status: 201, statusText: 'Created' });
    fixture.detectChanges();

    expect(componente.resultado()?.venta_id).toBe(55);
    expect(componente.operacionId()).not.toBe(operacionInicial);
    expect(componente.lineas.at(0).controls.inventario_id.value).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Venta #55 registrada');

    http
      .expectOne((solicitud) => solicitud.url === URL_VENTAS)
      .flush([{ id: 55, estado: 'COMPLETADA' }]);
    http
      .expectOne((solicitud) => solicitud.url === URL_INVENTARIO)
      .flush([INVENTARIO]);
  });

  it('marca un replay idempotente como venta ya registrada', () => {
    completarLinea();
    componente.enviar();

    http
      .expectOne((solicitud) => solicitud.url === URL_CONTADO)
      .flush(
        { ...RESPUESTA, idempotente: true },
        { status: 200, statusText: 'OK' },
      );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Venta ya registrada (reintento idempotente)',
    );
    http.expectOne((solicitud) => solicitud.url === URL_VENTAS).flush([]);
    http
      .expectOne((solicitud) => solicitud.url === URL_INVENTARIO)
      .flush([INVENTARIO]);
  });

  it('ante conflicto de stock conserva líneas y operacion_id', () => {
    completarLinea();
    const operacionInicial = componente.operacionId();
    componente.enviar();

    http.expectOne((solicitud) => solicitud.url === URL_CONTADO).flush(
      { detail: 'Conflicto en la venta' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(componente.tipoError()).toBe('stock');
    expect(componente.lineas.at(0).controls.inventario_id.value).toBe(101);
    expect(componente.operacionId()).toBe(operacionInicial);
  });

  it('explica el 409 de operacion_id reutilizado e invita a una venta nueva', () => {
    completarLinea();
    componente.enviar();

    http.expectOne((solicitud) => solicitud.url === URL_CONTADO).flush(
      { detail: 'operacion_id reutilizado con una carga distinta' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(componente.tipoError()).toBe('operacion');
    expect(fixture.nativeElement.textContent).toContain(
      'inicia una venta nueva',
    );
  });

  it('explica el 503 de módulo deshabilitado y el 403 de inventario ajeno', () => {
    completarLinea();
    componente.enviar();
    http.expectOne((solicitud) => solicitud.url === URL_CONTADO).flush(
      { detail: 'Ventas SaaS aun no habilitadas' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    fixture.detectChanges();
    expect(componente.tipoError()).toBe('deshabilitado');
    expect(fixture.nativeElement.textContent).toContain(
      'todavía no está habilitado',
    );

    componente.enviar();
    http.expectOne((solicitud) => solicitud.url === URL_CONTADO).flush(
      { detail: 'Operacion no autorizada' },
      { status: 403, statusText: 'Forbidden' },
    );
    fixture.detectChanges();
    expect(componente.tipoError()).toBe('inventario');
    expect(fixture.nativeElement.textContent).toContain(
      'solo acepta inventario de la sucursal',
    );
  });

  it('limita la cantidad máxima al stock disponible de la fila', () => {
    completarLinea();

    expect(componente.maximoCantidad(0)).toBe(5);
    expect(componente.maximoCantidad(1)).toBe(1000);
  });

  it('valida la cantidad contra el stock disponible antes de enviar', () => {
    completarLinea();
    componente.lineas.at(0).controls.cantidad.setValue(6);

    componente.enviar();
    fixture.detectChanges();

    http.expectNone(URL_CONTADO);
    expect(componente.erroresLineas()['0']?.cantidad).toContain(
      'stock disponible (5)',
    );
    expect(componente.mensajeValidacion()).toContain('stock disponible');
  });

  it('al cambiar de sucursal recarga inventario y limpia selecciones incompatibles', () => {
    completarLinea();

    componente.form.controls.sucursal_id.setValue(5);
    const peticion = http.expectOne(
      (solicitud) => solicitud.url === URL_INVENTARIO,
    );
    expect(peticion.request.params.get('sucursal_id')).toBe('5');
    expect(peticion.request.params.get('limit')).toBe('200');
    peticion.flush([{ ...INVENTARIO, id: 202, sucursal_id: 5 }]);
    fixture.detectChanges();

    expect(componente.lineas.at(0).controls.inventario_id.value).toBeNull();
    // La cantidad escrita se conserva: la persona solo reelige el inventario.
    expect(componente.lineas.at(0).controls.cantidad.value).toBe(2);
  });

  it('muestra un aviso si el inventario responde 403 sin romper la pantalla', () => {
    componente.form.controls.sucursal_id.setValue(5);
    http
      .expectOne((solicitud) => solicitud.url === URL_INVENTARIO)
      .flush(
        { detail: 'Operacion no autorizada' },
        { status: 403, statusText: 'Forbidden' },
      );
    fixture.detectChanges();

    expect(componente.inventarioSinPermiso()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('VENTAS/CONSULTAR');
  });
});

describe('SaasVentasContadoPage — operación offline', () => {
  let fixture: ComponentFixture<SaasVentasContadoPage>;
  let componente: SaasVentasContadoPage;
  let http: HttpTestingController;
  let queue: SaasOfflineQueueService;

  const IDENTIDAD: TenantMe = {
    usuario_id: 10,
    empresa_id: 1,
    empresa_slug: 'empresa-a',
    empresa_nombre: 'Empresa A',
    rol: 'CAJERO',
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
          provide: SaasPermissionsService,
          useValue: { puede: () => true },
        },
        {
          provide: SaasSessionService,
          useValue: {
            sesion: identidad.asReadonly(),
            contexto: computed(() => identidad()?.contexto ?? null),
          },
        },
      ],
    });

    fixture = TestBed.createComponent(SaasVentasContadoPage);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    queue = TestBed.inject(SaasOfflineQueueService);

    http.expectOne((peticion) => peticion.url === URL_SUCURSALES).flush([SUCURSAL]);
    http
      .expectOne((peticion) => peticion.url === URL_INVENTARIO)
      .flush([INVENTARIO]);
    http.expectOne((peticion) => peticion.url === URL_VENTAS).flush([]);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  it('sin conexión guarda la venta en IndexedDB con su UUID y no hace POST', async () => {
    const linea = componente.lineas.at(0);
    linea.controls.inventario_id.setValue(101);
    linea.controls.cantidad.setValue(2);
    const operacionInicial = componente.operacionId();

    window.dispatchEvent(new Event('offline'));
    componente.enviar();

    for (
      let intento = 0;
      intento < 100 &&
      (queue.operaciones().length === 0 ||
        componente.avisoOffline() === null);
      intento += 1
    ) {
      await new Promise((resolver) => setTimeout(resolver, 5));
    }

    http.expectNone((peticion) => peticion.url === URL_CONTADO);
    expect(queue.operaciones()).toHaveLength(1);
    expect(queue.operaciones()[0].operacion_id).toBe(operacionInicial);
    expect(queue.operaciones()[0].tipo).toBe('VENTA_CONTADO');
    expect(queue.operaciones()[0].empresa_id).toBe(1);
    expect(componente.avisoOffline()).toContain(
      'guardada en este dispositivo',
    );
  });

  it('una caída de red durante el POST conserva la venta en la cola', async () => {
    const linea = componente.lineas.at(0);
    linea.controls.inventario_id.setValue(101);
    linea.controls.cantidad.setValue(1);
    const operacionInicial = componente.operacionId();

    componente.enviar();
    let peticion: ReturnType<typeof http.expectOne> | null = null;
    for (let intento = 0; intento < 100 && peticion === null; intento += 1) {
      const coincidencias = http.match(
        (solicitud) => solicitud.url === URL_CONTADO,
      );
      if (coincidencias.length > 0) {
        peticion = coincidencias[0];
      } else {
        await new Promise((resolver) => setTimeout(resolver, 5));
      }
    }
    expect(peticion).not.toBeNull();
    peticion?.error(new ProgressEvent('error'));

    for (
      let intento = 0;
      intento < 100 &&
      (queue.operaciones().length === 0 ||
        componente.avisoOffline() === null);
      intento += 1
    ) {
      await new Promise((resolver) => setTimeout(resolver, 5));
    }

    expect(queue.operaciones()).toHaveLength(1);
    expect(queue.operaciones()[0].operacion_id).toBe(operacionInicial);
    expect(componente.avisoOffline()).not.toBeNull();
    expect(componente.error()).toBeNull();
  });
});
