import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { environment } from '../../../../environments/environment';
import {
  EstadoOrdenCompra,
  OrdenCompraCreada,
  OrdenCompraDetalle,
  OrdenCompraResumen,
  RecepcionResultado,
  TenantProveedor,
  TenantSucursal,
  TenantTemporada,
  TenantVarianteEmpresa,
} from '../../models/tenant.models';
import { SaasSessionService } from '../../services/saas-session.service';
import { SaasComprasPage } from './saas-compras.page';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/tenant/ordenes-compra`;
const URL_CATALOGO = `${API}/tenant/catalogo`;
const URL_SUCURSALES = `${API}/tenant/empresa/sucursales`;

const PROVEEDOR: TenantProveedor = {
  id: 3,
  razon_social: 'Textiles Andinos S.R.L.',
  estado: true,
};

const TEMPORADA: TenantTemporada = {
  id: 2,
  nombre: 'Verano 2026',
  fecha_inicio: '2026-01-01',
  fecha_fin: '2026-03-31',
  estado: true,
};

const VARIANTE: TenantVarianteEmpresa = {
  id: 9,
  producto_id: 5,
  producto_nombre: 'Polera oversize',
  sku: 'POL-M-BLA',
  talla: 'M',
  color: 'Blanco',
};

const SUCURSAL_EMPRESA: TenantSucursal = {
  id: 4,
  ciudad_id: 1,
  nombre: 'Sucursal Centro',
  direccion: 'Av. Arce 123',
  telefono: null,
  estado: true,
};

const ORDEN_CREADA: OrdenCompraCreada = {
  orden_compra_id: 7,
  estado: 'BORRADOR',
  proveedor_id: 3,
  sucursal_id: 4,
  total_lineas: 1,
  lineas: [
    {
      variante_producto_id: 9,
      temporada_id: 2,
      cantidad: 10,
      costo_unitario: 45.5,
    },
  ],
  stock_modificado: false,
};

const ORDEN_BORRADOR: OrdenCompraResumen = {
  id: 7,
  proveedor_id: 3,
  proveedor_razon_social: 'Textiles Andinos S.R.L.',
  sucursal_id: 4,
  sucursal_nombre: 'Sucursal Centro',
  estado: 'BORRADOR',
  fecha_orden: '2026-10-30T10:15:00Z',
  fecha_estimada: null,
  fecha_recepcion: null,
  total_lineas: 2,
};

/** Detalle con el estado pedido y las pendientes indicadas. */
function detalleCon(
  estado: EstadoOrdenCompra,
  pendientes: [number, number] = [6, 5],
): OrdenCompraDetalle {
  return {
    ...ORDEN_BORRADOR,
    estado,
    lineas: [
      {
        id: 21,
        variante_producto_id: 9,
        sku: 'POL-M-BLA',
        temporada_id: 2,
        temporada_nombre: 'Verano 2026',
        cantidad: 10,
        costo_unitario: 45.5,
        cantidad_recibida: 10 - pendientes[0],
        cantidad_pendiente: pendientes[0],
      },
      {
        id: 22,
        variante_producto_id: 10,
        sku: 'POL-L-NEG',
        temporada_id: 2,
        temporada_nombre: 'Verano 2026',
        cantidad: 5,
        costo_unitario: 48,
        cantidad_recibida: 5 - pendientes[1],
        cantidad_pendiente: pendientes[1],
      },
    ],
  };
}

const RESULTADO_RECEPCION: RecepcionResultado = {
  idempotente: false,
  recepcion_id: 31,
  orden_compra_id: 7,
  estado_orden: 'PARCIAL',
  unidades_recibidas: 3,
  stock: [{ inventario_id: 101, stock_actual: 13, stock_reservado: 0 }],
  operacion_id: '2b8f4c1a-9d3e-4a7b-8c6d-5e4f3a2b1c0d',
};

describe('SaasComprasPage', () => {
  const rol = signal<string | null>('ADMINISTRADOR');
  let fixture: ComponentFixture<SaasComprasPage>;
  let componente: SaasComprasPage;
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

    fixture = TestBed.createComponent(SaasComprasPage);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    http.expectOne((peticion) => peticion.url === BASE).flush([ORDEN_BORRADOR]);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  /** Carga el detalle de una orden y responde la petición GET. */
  function cargarDetalle(detalle: OrdenCompraDetalle): void {
    componente.verDetalle({ ...ORDEN_BORRADOR, estado: detalle.estado });
    http
      .expectOne((peticion) => peticion.url === `${BASE}/${detalle.id}`)
      .flush(detalle);
    fixture.detectChanges();
  }

  it('muestra proveedor, sucursal y estado de la orden', () => {
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Textiles Andinos S.R.L.');
    expect(texto).toContain('Sucursal Centro');
    expect(texto).toContain('Borrador');
  });

  it('el filtro por estado agrega el query param exacto', () => {
    const select = document.createElement('select');
    const opcion = document.createElement('option');
    opcion.value = 'ENVIADA';
    select.appendChild(opcion);
    select.value = 'ENVIADA';

    componente.cambiarFiltro({ target: select } as unknown as Event);

    const peticion = http.expectOne((solicitud) => solicitud.url === BASE);
    expect(peticion.request.params.get('estado')).toBe('ENVIADA');
    expect(peticion.request.params.get('limit')).toBe('50');
    expect(peticion.request.params.get('offset')).toBe('0');
    peticion.flush([]);
    fixture.detectChanges();

    expect(componente.filtroEstado()).toBe('ENVIADA');
    expect(componente.pagina()).toBe(0);
  });

  it('seleccionar una fila carga el detalle con sus líneas', () => {
    cargarDetalle(detalleCon('BORRADOR'));

    const texto = fixture.nativeElement.textContent as string;
    expect(componente.detalle()?.id).toBe(7);
    expect(texto).toContain('POL-M-BLA');
    expect(texto).toContain('Verano 2026');
    expect(texto).toContain('Líneas de la orden');
  });

  it('enviar hace POST sin cuerpo y refresca detalle y listado', () => {
    cargarDetalle(detalleCon('BORRADOR'));

    componente.enviarOrden();

    const peticion = http.expectOne(
      (solicitud) => solicitud.url === `${BASE}/7/enviar`,
    );
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toBeNull();
    peticion.flush({
      idempotente: false,
      orden_compra_id: 7,
      estado: 'ENVIADA',
    });

    http
      .expectOne((solicitud) => solicitud.url === `${BASE}/7`)
      .flush(detalleCon('ENVIADA'));
    http
      .expectOne((solicitud) => solicitud.url === BASE)
      .flush([{ ...ORDEN_BORRADOR, estado: 'ENVIADA' }]);
    fixture.detectChanges();

    expect(componente.mensajeExito()).toContain('Orden de compra #7 enviada');
    expect(componente.detalle()?.estado).toBe('ENVIADA');
  });

  it('la recepción envía solo líneas > 0, conserva el UUID ante 409 y lo rota al éxito', () => {
    cargarDetalle(detalleCon('ENVIADA', [6, 5]));

    componente.abrirRecepcion();
    fixture.detectChanges();
    componente.lineasRecepcion.at(0)?.setValue(3);
    componente.lineasRecepcion.at(1)?.setValue(0);

    const operacionInicial = componente.operacionRecepcion();
    componente.recepcionar();

    let peticion = http.expectOne(
      (solicitud) => solicitud.url === `${BASE}/7/recepciones`,
    );
    expect(peticion.request.body).toEqual({
      operacion_id: operacionInicial,
      lineas: [{ detalle_orden_compra_id: 21, cantidad: 3 }],
    });
    peticion.flush(
      { detail: 'Conflicto en la orden de compra' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(componente.operacionRecepcion()).toBe(operacionInicial);
    expect(componente.lineasRecepcion.at(0)?.value).toBe(3);
    expect(componente.tipoErrorRecepcion()).toBe('conflicto');
    expect(fixture.nativeElement.textContent).toContain(
      'Conflicto en la orden de compra',
    );

    componente.recepcionar();

    peticion = http.expectOne(
      (solicitud) => solicitud.url === `${BASE}/7/recepciones`,
    );
    expect(peticion.request.body).toEqual({
      operacion_id: operacionInicial,
      lineas: [{ detalle_orden_compra_id: 21, cantidad: 3 }],
    });
    peticion.flush(RESULTADO_RECEPCION, {
      status: 201,
      statusText: 'Created',
    });

    http
      .expectOne((solicitud) => solicitud.url === `${BASE}/7`)
      .flush(detalleCon('PARCIAL', [3, 5]));
    http
      .expectOne((solicitud) => solicitud.url === BASE)
      .flush([{ ...ORDEN_BORRADOR, estado: 'PARCIAL' }]);
    fixture.detectChanges();

    expect(componente.operacionRecepcion()).not.toBe(operacionInicial);
    expect(componente.resultadoRecepcion()?.unidades_recibidas).toBe(3);
    expect(fixture.nativeElement.textContent).toContain(
      'Recepción #31 registrada: 3 unidades recibidas',
    );

    componente.cerrarResultadoRecepcion();
    fixture.detectChanges();
  });

  it('una orden RECIBIDA no ofrece acciones de escritura', () => {
    cargarDetalle(detalleCon('RECIBIDA', [0, 0]));

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('solo lectura');
    expect(texto).not.toContain('Recibir mercadería');
    expect(texto).not.toContain('Enviar');
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
      'solo expone las órdenes de compra',
    );
  });

  /** Abre el alta y responde los cuatro catálogos que la alimentan. */
  function abrirAltaConCatalogos(
    proveedores: TenantProveedor[] = [PROVEEDOR],
  ): void {
    componente.abrirAlta();
    http
      .expectOne((solicitud) => solicitud.url === `${URL_CATALOGO}/proveedores`)
      .flush(proveedores);
    http
      .expectOne((solicitud) => solicitud.url === `${URL_CATALOGO}/temporadas`)
      .flush([TEMPORADA]);
    http
      .expectOne((solicitud) => solicitud.url === `${URL_CATALOGO}/variantes`)
      .flush([VARIANTE]);
    http
      .expectOne((solicitud) => solicitud.url === URL_SUCURSALES)
      .flush([SUCURSAL_EMPRESA]);
    fixture.detectChanges();
  }

  it('crea una orden con proveedor, sucursal y una línea validada', () => {
    abrirAltaConCatalogos();

    componente.formOrden.controls.proveedor_id.setValue(3);
    componente.formOrden.controls.sucursal_id.setValue(4);
    const linea = componente.lineasOrden.at(0);
    linea.controls.variante_producto_id.setValue(9);
    linea.controls.temporada_id.setValue(2);
    linea.controls.cantidad.setValue(10);
    linea.controls.costo_unitario.setValue('45,50');

    componente.enviarOrdenCompra();

    const peticion = http.expectOne(
      (solicitud) => solicitud.url === BASE && solicitud.method === 'POST',
    );
    expect(peticion.request.body).toEqual({
      proveedor_id: 3,
      sucursal_id: 4,
      lineas: [
        {
          variante_producto_id: 9,
          temporada_id: 2,
          cantidad: 10,
          costo_unitario: 45.5,
        },
      ],
    });
    peticion.flush(ORDEN_CREADA, { status: 201, statusText: 'Created' });

    http
      .expectOne(
        (solicitud) => solicitud.url === BASE && solicitud.method === 'GET',
      )
      .flush([ORDEN_BORRADOR]);
    fixture.detectChanges();

    expect(componente.mensajeExito()).toContain('Orden de compra #7 creada');
    expect(componente.altaAbierta()).toBe(false);
  });

  it('bloquea el alta con el mensaje honesto cuando no hay proveedores', () => {
    abrirAltaConCatalogos([]);

    expect(componente.puedeGuardarOrden()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain(
      'La empresa no tiene proveedores registrados. Puedes crear el primero desde esta pantalla antes de comprar',
    );
    expect(componente.proveedores().length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Nuevo proveedor');
  });

  it('integra el proveedor creado en el selector de la orden', () => {
    abrirAltaConCatalogos([]);
    componente.abrirNuevoProveedor();
    expect(componente.mostrarNuevoProveedor()).toBe(true);

    componente.alCrearProveedor({
      id: 12,
      razon_social: 'Textiles Andinos',
      nit: '123456',
      correo: null,
      telefono: null,
      direccion: null,
      estado: true,
      total_productos: 1,
    });
    fixture.detectChanges();

    expect(componente.mostrarNuevoProveedor()).toBe(false);
    expect(componente.proveedores().map((p) => p.id)).toEqual([12]);
    expect(componente.formOrden.controls.proveedor_id.value).toBe(12);
    expect(componente.formOrden.controls.proveedor_id.enabled).toBe(true);
  });

  it('deshabilita el control de proveedor cuando el catálogo llega vacío', () => {
    abrirAltaConCatalogos([]);

    const control = componente.formOrden.controls.proveedor_id;
    expect(control.disabled).toBe(true);

    const select = fixture.nativeElement.querySelector(
      '#orden-proveedor',
    ) as HTMLSelectElement;
    expect(select.disabled).toBe(true);
    // Solo el placeholder: no hay proveedores que elegir.
    expect(select.querySelectorAll('option').length).toBe(1);
  });

  it('habilita el control de proveedor cuando el catálogo trae datos', () => {
    abrirAltaConCatalogos();

    const control = componente.formOrden.controls.proveedor_id;
    expect(control.disabled).toBe(false);

    const select = fixture.nativeElement.querySelector(
      '#orden-proveedor',
    ) as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    expect(select.querySelectorAll('option').length).toBe(2);
  });

  it('deshabilita el proveedor mientras los catálogos están cargando', () => {
    componente.abrirAlta();

    expect(componente.formOrden.controls.proveedor_id.disabled).toBe(true);

    http
      .expectOne((solicitud) => solicitud.url === `${URL_CATALOGO}/proveedores`)
      .flush([PROVEEDOR]);
    http
      .expectOne((solicitud) => solicitud.url === `${URL_CATALOGO}/temporadas`)
      .flush([TEMPORADA]);
    http
      .expectOne((solicitud) => solicitud.url === `${URL_CATALOGO}/variantes`)
      .flush([VARIANTE]);
    http
      .expectOne((solicitud) => solicitud.url === URL_SUCURSALES)
      .flush([SUCURSAL_EMPRESA]);
    fixture.detectChanges();

    expect(componente.formOrden.controls.proveedor_id.disabled).toBe(false);
  });

  it('no envía la orden si una línea está incompleta', () => {
    abrirAltaConCatalogos();

    componente.formOrden.controls.proveedor_id.setValue(3);
    componente.formOrden.controls.sucursal_id.setValue(4);
    componente.enviarOrdenCompra();
    fixture.detectChanges();

    http.expectNone(
      (solicitud) => solicitud.url === BASE && solicitud.method === 'POST',
    );
    expect(componente.erroresLineasOrden()['0']?.variante_producto_id).toBe(
      'Selecciona la variante de la línea.',
    );
  });
});
