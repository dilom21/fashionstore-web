import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { environment } from '../../../../environments/environment';
import {
  DevolucionCreada,
  DevolucionDetalle,
  DevolucionProcesada,
  DevolucionResumen,
  EstadoDevolucion,
  ReembolsoTenant,
  VentaLineasTenant,
} from '../../models/tenant.models';
import { SaasSessionService } from '../../services/saas-session.service';
import { SaasDevolucionesPage } from './saas-devoluciones.page';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/tenant/devoluciones`;

const RESUMEN: DevolucionResumen = {
  id: 15,
  venta_id: 55,
  fecha_hora: '2026-10-30T16:40:00Z',
  estado: 'SOLICITADA',
  motivo: 'Talla incorrecta',
  observacion: null,
  sucursal_id: 4,
  sucursal_nombre: 'Sucursal Centro',
  venta_total: 240,
  unidades: 2,
  monto_estimado: 240,
};

const REEMBOLSO: ReembolsoTenant = {
  reembolso_id: 8,
  estado: 'NO_DISPONIBLE',
  monto: 240,
  moneda: 'BOB',
  medio: 'NO_DISPONIBLE',
  ejecutado: false,
  referencia: null,
  fecha_creacion: '2026-10-30T17:00:00Z',
  fecha_ejecucion: null,
};

/** Detalle con el estado y el reembolso indicados. */
function detalleCon(
  estado: EstadoDevolucion,
  reembolso: ReembolsoTenant | null = null,
): DevolucionDetalle {
  return {
    ...RESUMEN,
    estado,
    items: [
      {
        detalle_devolucion_id: 41,
        detalle_venta_id: 71,
        cantidad: 2,
        motivo: 'Talla incorrecta',
        reponer: true,
        inventario_id: 101,
        precio_unitario: 120,
        sku: 'POL-M-BLA',
        subtotal: 240,
      },
    ],
    reembolso,
  };
}

const PROCESADA: DevolucionProcesada = {  idempotente: false,
  devolucion_id: 15,
  venta_id: 55,
  estado: 'COMPLETADA',
  unidades: 2,
  unidades_repuestas: 2,
  stock: [{ inventario_id: 101, stock_actual: 10, stock_reservado: 0 }],
  reembolso: {
    reembolso_id: 8,
    estado: 'NO_DISPONIBLE',
    ejecutado: false,
    medio: 'NO_DISPONIBLE',
    monto: 240,
    moneda: 'BOB',
  },
  operacion_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
};

const LINEAS_VENTA: VentaLineasTenant = {
  venta_id: 55,
  sucursal_id: 4,
  estado: 'COMPLETADA',
  total: 240,
  lineas: [
    {
      detalle_venta_id: 71,
      inventario_id: 101,
      variante_producto_id: 9,
      sku: 'POL-M-BLA',
      producto_nombre: 'Polera oversize',
      talla: 'M',
      color: 'Blanco',
      cantidad: 2,
      precio_unitario: 120,
      cantidad_devuelta: 0,
      cantidad_disponible_devolver: 2,
    },
  ],
};

const DEVOLUCION_CREADA: DevolucionCreada = {
  idempotente: false,
  devolucion_id: 16,
  venta_id: 55,
  estado: 'SOLICITADA',
  motivo: 'Talla incorrecta',
  unidades: 2,
  monto_estimado: 240,
  moneda: 'BOB',
  items: [
    {
      detalle_venta_id: 71,
      inventario_id: 101,
      cantidad: 2,
      reponer: true,
      precio_unitario: 120,
    },
  ],
  reembolso: {
    estado: 'PENDIENTE',
    ejecutado: false,
    medio: 'NO_DISPONIBLE',
    monto: 240,
  },
  stock_modificado: false,
  operacion_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
};

describe('SaasDevolucionesPage', () => {
  const rol = signal<string | null>('ADMINISTRADOR');
  let fixture: ComponentFixture<SaasDevolucionesPage>;
  let componente: SaasDevolucionesPage;
  let http: HttpTestingController;

  beforeEach(() => {
    rol.set('ADMINISTRADOR');

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SaasSessionService, useValue: { rol } },
      ],
    });

    fixture = TestBed.createComponent(SaasDevolucionesPage);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    http.expectOne((peticion) => peticion.url === BASE).flush([RESUMEN]);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  /** Carga el detalle de la devolución y responde la petición GET. */
  function cargarDetalle(detalle: DevolucionDetalle): void {
    componente.verDetalle({ ...RESUMEN, estado: detalle.estado });
    http
      .expectOne((peticion) => peticion.url === `${BASE}/${detalle.id}`)
      .flush(detalle);
    fixture.detectChanges();
  }

  it('muestra venta, estado, unidades y monto estimado', () => {
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('55');
    expect(texto).toContain('Solicitada');
    expect(texto).toContain('Talla incorrecta');
    expect(texto).toContain('240.00');
  });

  it('el detalle muestra ítems y el reembolso no disponible', () => {
    cargarDetalle(detalleCon('COMPLETADA', REEMBOLSO));

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('POL-M-BLA');
    expect(texto).toContain('Sí');
    expect(texto).toContain('NO_DISPONIBLE');
    expect(texto).toContain('false');
    expect(texto).toContain(
      'Reembolso no ejecutado por el sistema (informativo)',
    );
  });

  it('aprobar hace POST sin cuerpo y refresca detalle y listado', () => {
    cargarDetalle(detalleCon('SOLICITADA'));

    componente.abrirConfirmacion('aprobar');
    componente.confirmarAccion();

    const peticion = http.expectOne(
      (solicitud) => solicitud.url === `${BASE}/15/aprobar`,
    );
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toBeNull();
    peticion.flush({
      idempotente: false,
      devolucion_id: 15,
      estado: 'APROBADA',
    });

    http
      .expectOne((solicitud) => solicitud.url === `${BASE}/15`)
      .flush(detalleCon('APROBADA'));
    http
      .expectOne((solicitud) => solicitud.url === BASE)
      .flush([{ ...RESUMEN, estado: 'APROBADA' }]);
    fixture.detectChanges();

    expect(componente.confirmacion()).toBeNull();
    expect(componente.mensajeExito()).toContain(
      'Devolución #15 aprobada (estado APROBADA)',
    );
  });

  it('procesar conserva el UUID ante 409 y lo rota al completar', () => {
    cargarDetalle(detalleCon('APROBADA'));
    const operacionInicial = componente.operacionProceso();

    componente.procesar();

    let peticion = http.expectOne(
      (solicitud) => solicitud.url === `${BASE}/15/procesar`,
    );
    expect(peticion.request.body).toEqual({
      operacion_id: operacionInicial,
    });
    peticion.flush(
      { detail: 'Conflicto en la devolucion' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(componente.operacionProceso()).toBe(operacionInicial);
    expect(componente.tipoErrorProceso()).toBe('conflicto');
    expect(fixture.nativeElement.textContent).toContain(
      'Conflicto en la devolución',
    );

    componente.procesar();

    peticion = http.expectOne(
      (solicitud) => solicitud.url === `${BASE}/15/procesar`,
    );
    expect(peticion.request.body).toEqual({
      operacion_id: operacionInicial,
    });
    peticion.flush(PROCESADA, { status: 200, statusText: 'OK' });

    http
      .expectOne((solicitud) => solicitud.url === `${BASE}/15`)
      .flush(detalleCon('COMPLETADA', REEMBOLSO));
    http
      .expectOne((solicitud) => solicitud.url === BASE)
      .flush([{ ...RESUMEN, estado: 'COMPLETADA' }]);
    fixture.detectChanges();

    expect(componente.operacionProceso()).not.toBe(operacionInicial);
    expect(componente.resultadoProceso()?.unidades_repuestas).toBe(2);
    expect(fixture.nativeElement.textContent).toContain(
      '2 unidades repuestas',
    );
    expect(fixture.nativeElement.textContent).toContain('Stock resultante');

    componente.cerrarResultadoProceso();
    fixture.detectChanges();
  });

  it('una devolución COMPLETADA no ofrece Procesar', () => {
    cargarDetalle(detalleCon('COMPLETADA', REEMBOLSO));

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('solo lectura');
    expect(texto).not.toContain('Procesar devolución');
  });

  it('un 403 del listado se muestra como estado informativo', () => {
    componente.recargar();

    http
      .expectOne((solicitud) => solicitud.url === BASE)
      .flush(
        { detail: 'Se requiere personal autorizado' },
        { status: 403, statusText: 'Forbidden' },
      );
    fixture.detectChanges();

    expect(componente.sinPermiso()).toBe(true);
    expect(componente.errorListado()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'solo expone las devoluciones',
    );
  });

  it('crea una devolución con detalle_venta_id real y rota la operación', () => {
    componente.abrirAlta();
    componente.formDevolucion.controls.venta_id.setValue(55);
    componente.cargarLineasVenta();

    http
      .expectOne((solicitud) => solicitud.url === `${BASE}/ventas/55/lineas`)
      .flush(LINEAS_VENTA);
    fixture.detectChanges();

    expect(componente.numeroItems()).toBe(1);
    componente.itemsDevolucion.at(0).controls.cantidad.setValue(2);
    componente.itemsDevolucion.at(0).controls.motivo.setValue('Queda grande');
    componente.formDevolucion.controls.motivo.setValue('Talla incorrecta');

    const operacion = componente.operacionDevolucion();
    componente.enviarDevolucion();

    const peticion = http.expectOne(
      (solicitud) => solicitud.url === BASE && solicitud.method === 'POST',
    );
    expect(peticion.request.body).toEqual({
      venta_id: 55,
      motivo: 'Talla incorrecta',
      operacion_id: operacion,
      items: [
        {
          detalle_venta_id: 71,
          cantidad: 2,
          reponer: true,
          motivo: 'Queda grande',
        },
      ],
    });
    peticion.flush(DEVOLUCION_CREADA, {
      status: 201,
      statusText: 'Created',
    });

    http
      .expectOne(
        (solicitud) => solicitud.url === BASE && solicitud.method === 'GET',
      )
      .flush([{ ...RESUMEN, id: 16 }]);
    fixture.detectChanges();

    expect(componente.resultadoCreacion()?.devolucion_id).toBe(16);
    expect(componente.operacionDevolucion()).not.toBe(operacion);
    expect(componente.mensajeExito()).toContain('Devolución #16 creada');
    expect(fixture.nativeElement.textContent).toContain('Reembolso declarado');
  });

  it('muestra el 404 de la venta como «no existe en tu empresa»', () => {
    componente.abrirAlta();
    componente.formDevolucion.controls.venta_id.setValue(99);
    componente.cargarLineasVenta();

    http
      .expectOne((solicitud) => solicitud.url === `${BASE}/ventas/99/lineas`)
      .flush(
        { detail: 'Recurso no encontrado' },
        { status: 404, statusText: 'Not Found' },
      );
    fixture.detectChanges();

    expect(componente.tipoErrorLineas()).toBe('no-existe');
    expect(fixture.nativeElement.textContent).toContain(
      'Esa venta no existe en tu empresa',
    );
    expect(componente.numeroItems()).toBe(0);
  });

  it('no envía cantidades que superan lo disponible', () => {
    componente.abrirAlta();
    componente.formDevolucion.controls.venta_id.setValue(55);
    componente.cargarLineasVenta();
    http
      .expectOne((solicitud) => solicitud.url === `${BASE}/ventas/55/lineas`)
      .flush(LINEAS_VENTA);
    componente.formDevolucion.controls.motivo.setValue('Talla incorrecta');
    componente.itemsDevolucion.at(0).controls.cantidad.setValue(3);

    componente.enviarDevolucion();
    fixture.detectChanges();

    http.expectNone(
      (solicitud) => solicitud.url === BASE && solicitud.method === 'POST',
    );
    expect(componente.erroresItems()['0']?.cantidad).toContain(
      'entre 1 y 2',
    );
  });
});
