import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import {
  TenantProveedorCreado,
  TenantProveedorCrear,
} from '../models/tenant.models';
import { SaasProveedoresService } from './saas-proveedores.service';

const API = environment.apiUrl.replace(/\/+$/, '');
const BASE = `${API}/tenant/proveedores`;

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

describe('SaasProveedoresService', () => {
  let servicio: SaasProveedoresService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    servicio = TestBed.inject(SaasProveedoresService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('crea con POST /tenant/proveedores y sin empresa_id', () => {
    const dto: TenantProveedorCrear = {
      razon_social: 'Textiles Andinos',
      nit: '123456',
      producto_ids: [5],
    };

    let respuesta: TenantProveedorCreado | undefined;
    servicio.crear(dto).subscribe((valor) => (respuesta = valor));

    const peticion = http.expectOne(BASE);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual(dto);
    expect(peticion.request.body.empresa_id).toBeUndefined();
    peticion.flush(CREADO);

    expect(respuesta).toEqual(CREADO);
  });

  it('reemplaza productos con PUT exacto', () => {
    let total: number | undefined;
    servicio
      .reemplazarProductos(12, [5, 8])
      .subscribe((valor) => (total = valor.total_productos));

    const peticion = http.expectOne(`${BASE}/12/productos`);
    expect(peticion.request.method).toBe('PUT');
    expect(peticion.request.body).toEqual({ producto_ids: [5, 8] });
    peticion.flush({ proveedor_id: 12, total_productos: 2 });

    expect(total).toBe(2);
  });
});
