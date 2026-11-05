import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import {
  TenantProducto,
  TenantProveedorCreado,
} from '../../../models/tenant.models';
import { SaasNuevoProveedorPanel } from './nuevo-proveedor';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_PRODUCTOS = `${API}/tenant/catalogo/productos?limit=100&offset=0`;
const URL_CREAR = `${API}/tenant/proveedores`;

const PRODUCTO: TenantProducto = {
  id: 5,
  nombre: 'Polera oversize',
  descripcion: null,
  precio: '120.00',
  categoria_id: 1,
  categoria_nombre: 'Poleras',
};

const CREADO: TenantProveedorCreado = {
  id: 12,
  razon_social: 'Textiles Andinos',
  nit: '123456',
  correo: 'compras@ejemplo.invalid',
  telefono: null,
  direccion: null,
  estado: true,
  total_productos: 1,
};

function eventoCheck(): Event {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = true;
  return { target: input } as unknown as Event;
}

describe('SaasNuevoProveedorPanel', () => {
  let fixture: ComponentFixture<SaasNuevoProveedorPanel>;
  let componente: SaasNuevoProveedorPanel;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaasNuevoProveedorPanel],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(SaasNuevoProveedorPanel);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  function cargarProductos(): void {
    http.expectOne(URL_PRODUCTOS).flush([PRODUCTO]);
    fixture.detectChanges();
  }

  it('carga los productos de la empresa al abrirse', () => {
    cargarProductos();
    expect(componente.productos().length).toBe(1);
    expect(componente.cargandoProductos()).toBe(false);
  });

  it('envía sólo los campos no vacíos y los productos marcados', () => {
    cargarProductos();
    componente.form.patchValue({
      razon_social: '  Textiles Andinos  ',
      nit: '  123456  ',
      correo: '  ',
      telefono: '',
      direccion: '',
    });
    componente.alternarProducto(5, eventoCheck());

    let creado: TenantProveedorCreado | undefined;
    componente.creado.subscribe((valor) => (creado = valor));

    componente.guardar();

    const peticion = http.expectOne(URL_CREAR);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({
      razon_social: 'Textiles Andinos',
      nit: '123456',
      producto_ids: [5],
    });
    peticion.flush(CREADO);
    fixture.detectChanges();

    expect(creado).toEqual(CREADO);
    expect(componente.guardando()).toBe(false);
  });

  it('no envía con razón social vacía', () => {
    cargarProductos();
    componente.form.patchValue({ razon_social: '   ' });
    componente.guardar();
    http.expectNone(URL_CREAR);
    expect(componente.form.controls.razon_social.touched).toBe(true);
  });

  it('un 409 se clasifica como conflicto y conserva los datos', () => {
    cargarProductos();
    componente.form.patchValue({ razon_social: 'Duplicado', nit: '1' });
    componente.guardar();

    http.expectOne(URL_CREAR).flush(
      { detail: 'Conflicto al guardar el proveedor' },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(componente.tipoError()).toBe('conflicto');
    expect(componente.form.controls.razon_social.value).toBe('Duplicado');
  });

  it('un 403 del catálogo sólo bloquea la asociación de productos', () => {
    http.expectOne(URL_PRODUCTOS).flush(
      { detail: 'Permiso empresarial insuficiente' },
      { status: 403, statusText: 'Forbidden' },
    );
    fixture.detectChanges();

    expect(componente.productosSinPermiso()).toBe(true);
    expect(componente.productos().length).toBe(0);
    expect(componente.form.controls.razon_social.enabled).toBe(true);
  });

  it('un error 422 se clasifica como validación', () => {
    cargarProductos();
    componente.form.patchValue({ razon_social: 'Proveedor' });
    componente.guardar();
    http.expectOne(URL_CREAR).flush(
      { detail: [{ loc: ['body', 'razon_social'], msg: 'invalido' }] },
      { status: 422, statusText: 'Unprocessable' },
    );
    fixture.detectChanges();
    expect(componente.tipoError()).toBe('validacion');
  });
});
