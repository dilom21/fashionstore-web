import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { environment } from '../../../../environments/environment';
import {
  TenantProducto,
  TenantProveedor,
  TenantProveedorCreado,
} from '../../models/tenant.models';
import { SaasSessionService } from '../../services/saas-session.service';
import { SaasProveedoresPage } from './saas-proveedores.page';

const API = environment.apiUrl.replace(/\/+$/, '');
const URL_PROVEEDORES = `${API}/tenant/catalogo/proveedores`;
const URL_CREAR = `${API}/tenant/proveedores`;
const URL_PRODUCTOS = `${API}/tenant/catalogo/productos`;

const PROVEEDOR_A: TenantProveedor = {
  id: 3,
  razon_social: 'Textiles Andinos',
  estado: true,
};

const PROVEEDOR_B: TenantProveedor = {
  id: 8,
  razon_social: 'Confecciones Sur',
  estado: false,
};

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
  razon_social: 'Nuevo Proveedor',
  nit: '123456',
  correo: 'compras@ejemplo.invalid',
  telefono: null,
  direccion: null,
  estado: true,
  total_productos: 1,
};

/** Cuerpo de error con `detail` string (o lista en 422). */
function cuerpoError(estado: number, detalle: string): object {
  if (estado === 422) {
    return {
      detail: [
        {
          type: 'value_error',
          loc: ['body', 'razon_social'],
          msg: detalle,
        },
      ],
    };
  }
  return { detail: detalle };
}

function eventoSelect(valor: string): Event {
  const select = document.createElement('select');
  const opcion = document.createElement('option');
  opcion.value = valor;
  select.appendChild(opcion);
  select.value = valor;
  return { target: select } as unknown as Event;
}

function eventoCheck(): Event {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = true;
  return { target: input } as unknown as Event;
}

describe('SaasProveedoresPage', () => {
  const rol = signal<string | null>('ADMINISTRADOR');
  let fixture: ComponentFixture<SaasProveedoresPage>;
  let componente: SaasProveedoresPage;
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

    fixture = TestBed.createComponent(SaasProveedoresPage);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Responde el listado del catálogo de proveedores. */
  function cargarListado(proveedores: TenantProveedor[] = [PROVEEDOR_A]): void {
    http
      .expectOne((peticion) => peticion.url === URL_PROVEEDORES)
      .flush(proveedores);
    fixture.detectChanges();
  }

  /** Abre el alta y responde el catálogo de productos. */
  function abrirAltaConProductos(
    productos: TenantProducto[] = [PRODUCTO],
  ): void {
    componente.abrirAlta();
    http
      .expectOne((peticion) => peticion.url === URL_PRODUCTOS)
      .flush(productos);
    fixture.detectChanges();
  }

  /** Abre la asociación de un proveedor y responde el catálogo. */
  function abrirAsociacionConProductos(
    productos: TenantProducto[] = [PRODUCTO],
  ): void {
    componente.abrirAsociacion(PROVEEDOR_A);
    http
      .expectOne((peticion) => peticion.url === URL_PRODUCTOS)
      .flush(productos);
    fixture.detectChanges();
  }

  // ================================ Listado ==============================

  it('lista los proveedores del catálogo con su estado', () => {
    cargarListado([PROVEEDOR_A, PROVEEDOR_B]);

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Textiles Andinos');
    expect(texto).toContain('Confecciones Sur');
    expect(texto).toContain('Activo');
    expect(texto).toContain('Inactivo');
    expect(texto).toContain('Productos asociados');
    // El listado del contrato no publica el total: se muestra «—».
    expect(texto).toContain('—');
    expect(componente.totalFiltrado()).toBe(2);
  });

  it('muestra el estado vacío honesto cuando la empresa no tiene proveedores', () => {
    cargarListado([]);

    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('No hay proveedores registrados en esta empresa.');
    expect(texto).toContain('Nuevo proveedor');
  });

  it('filtra y pagina en cliente sin inventar query params del endpoint', () => {
    const muchos: TenantProveedor[] = Array.from(
      { length: 25 },
      (_, indice) => ({
        id: indice + 1,
        razon_social: `Proveedor ${String(indice + 1).padStart(2, '0')}`,
        estado: true,
      }),
    );
    cargarListado(muchos);

    expect(componente.totalPaginas()).toBe(2);
    expect(componente.visibles().length).toBe(20);

    componente.cambiarLimite(eventoSelect('10'));
    expect(componente.limite()).toBe(10);
    expect(componente.totalPaginas()).toBe(3);
    expect(componente.visibles().length).toBe(10);

    componente.paginaSiguiente();
    expect(componente.pagina()).toBe(1);
    expect(componente.visibles()[0].razon_social).toBe('Proveedor 11');

    componente.aplicarBusqueda('  proveedor 25  ');
    expect(componente.totalFiltrado()).toBe(1);
    expect(componente.pagina()).toBe(0);
    expect(componente.filtroTexto()).toBe('proveedor 25');

    componente.aplicarBusqueda('sin coincidencias');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain(
      'No se encontraron proveedores para «sin coincidencias».',
    );

    // Filtro y paginación son locales: no hay ninguna petición nueva.
    http.expectNone((peticion) => peticion.url.startsWith(API));
  });

  it('un 403 del listado se muestra como falta de COMPRAS/CONSULTAR', () => {
    http
      .expectOne((peticion) => peticion.url === URL_PROVEEDORES)
      .flush(
        { detail: 'Permiso insuficiente' },
        { status: 403, statusText: 'Forbidden' },
      );
    fixture.detectChanges();

    expect(componente.sinPermiso()).toBe(true);
    expect(componente.errorListado()).toBeNull();
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('COMPRAS/CONSULTAR');
    expect(texto).not.toContain('Permiso insuficiente');
  });

  it('un 503 del listado se traduce con el servicio de errores', () => {
    http
      .expectOne((peticion) => peticion.url === URL_PROVEEDORES)
      .flush(
        { detail: 'Catálogo apagado' },
        { status: 503, statusText: 'Service Unavailable' },
      );
    fixture.detectChanges();

    expect(componente.tipoErrorListado()).toBe('deshabilitado');
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain(
      'Módulo no habilitado en esta versión o ruta no migrada.',
    );
    expect(texto).not.toContain('Catálogo apagado');
  });

  // ================================= Alta ================================

  it('crea un proveedor con los campos no vacíos y los productos marcados', () => {
    cargarListado([]);
    abrirAltaConProductos();

    componente.formAlta.patchValue({
      razon_social: '  Nuevo Proveedor  ',
      nit: '  123456  ',
      correo: '  compras@ejemplo.invalid  ',
      telefono: '  70000000  ',
      direccion: '  Calle 1  ',
    });
    componente.alternarProductoAlta(5, eventoCheck());

    componente.guardarProveedor();

    const peticion = http.expectOne(
      (solicitud) =>
        solicitud.url === URL_CREAR && solicitud.method === 'POST',
    );
    expect(peticion.request.body).toEqual({
      razon_social: 'Nuevo Proveedor',
      nit: '123456',
      correo: 'compras@ejemplo.invalid',
      telefono: '70000000',
      direccion: 'Calle 1',
      producto_ids: [5],
    });
    peticion.flush(CREADO, { status: 201, statusText: 'Created' });
    fixture.detectChanges();

    expect(componente.altaAbierta()).toBe(false);
    expect(componente.proveedores().map((item) => item.id)).toContain(12);
    expect(componente.totalProductosDe(12)).toBe(1);
    expect(componente.mensajeExito()).toContain(
      'Proveedor «Nuevo Proveedor» creado (#12)',
    );
    // El alta se refleja en sitio: no se recarga el listado.
    http.expectNone(
      (solicitud) =>
        solicitud.url === URL_PROVEEDORES && solicitud.method === 'GET',
    );
  });

  it('no envía el alta sin razón social', () => {
    cargarListado([]);
    abrirAltaConProductos();

    componente.formAlta.patchValue({ razon_social: '   ' });
    componente.guardarProveedor();
    fixture.detectChanges();

    http.expectNone((solicitud) => solicitud.url === URL_CREAR);
    expect(componente.formAlta.controls.razon_social.touched).toBe(true);
    expect(componente.mensajeCampoAlta('razon_social')).toBe(
      'La razón social es obligatoria.',
    );
  });

  it('valida el correo con el criterio del backend antes de enviar', () => {
    cargarListado([]);
    abrirAltaConProductos();

    componente.formAlta.patchValue({
      razon_social: 'Proveedor',
      correo: 'sin-arroba.invalid',
    });
    componente.guardarProveedor();

    http.expectNone((solicitud) => solicitud.url === URL_CREAR);
    expect(componente.formAlta.controls.correo.hasError('correoInvalido')).toBe(
      true,
    );
  });

  const CASOS_ALTA: ReadonlyArray<{
    estado: number;
    tipo: string;
    titulo: string;
  }> = [
    {
      estado: 403,
      tipo: 'permiso',
      titulo: 'Tu rol no puede dar de alta proveedores.',
    },
    {
      estado: 409,
      tipo: 'conflicto',
      titulo: 'Ya existe un proveedor con ese NIT en la empresa.',
    },
    {
      estado: 422,
      tipo: 'validacion',
      titulo: 'El backend rechazó los datos enviados.',
    },
    {
      estado: 503,
      tipo: 'deshabilitado',
      titulo: 'El módulo de compras SaaS no está habilitado.',
    },
  ];

  for (const caso of CASOS_ALTA) {
    it(`el alta mapea el error ${caso.estado} como ${caso.tipo}`, () => {
      cargarListado([]);
      abrirAltaConProductos();

      componente.formAlta.patchValue({ razon_social: 'Proveedor' });
      componente.guardarProveedor();

      http
        .expectOne((solicitud) => solicitud.url === URL_CREAR)
        .flush(cuerpoError(caso.estado, 'Fallo del backend'), {
          status: caso.estado,
          statusText: 'Error',
        });
      fixture.detectChanges();

      expect(componente.tipoErrorAlta()).toBe(caso.tipo);
      expect(componente.errorAlta()?.estado).toBe(caso.estado);
      const texto = fixture.nativeElement.textContent as string;
      expect(texto).toContain(caso.titulo);
      expect(texto).toContain(componente.errorAlta()?.mensaje ?? '');
      // Los datos escritos se conservan para reintentar.
      expect(componente.formAlta.controls.razon_social.value).toBe(
        'Proveedor',
      );
      expect(componente.altaAbierta()).toBe(true);
    });
  }

  // ============================ Asociaciones =============================

  it('reemplaza productos y actualiza la fila en sitio', () => {
    cargarListado([PROVEEDOR_A]);
    abrirAsociacionConProductos();
    expect(componente.proveedorAsociando()?.id).toBe(3);

    componente.alternarProducto(5, eventoCheck());
    componente.guardarAsociacion();

    const peticion = http.expectOne(
      (solicitud) =>
        solicitud.url === `${URL_CREAR}/3/productos` &&
        solicitud.method === 'PUT',
    );
    expect(peticion.request.body).toEqual({ producto_ids: [5] });
    peticion.flush({ proveedor_id: 3, total_productos: 1 });
    fixture.detectChanges();

    expect(componente.totalProductosDe(3)).toBe(1);
    expect(componente.proveedorAsociando()).toBeNull();
    expect(componente.mensajeExito()).toContain(
      'Asociaciones del proveedor «Textiles Andinos» actualizadas: 1 producto(s).',
    );
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('1');
    // La fila se actualiza en sitio: no se recarga el listado.
    http.expectNone(
      (solicitud) =>
        solicitud.url === URL_PROVEEDORES && solicitud.method === 'GET',
    );
  });

  const CASOS_ASOCIACION: ReadonlyArray<{
    estado: number;
    tipo: string;
    titulo: string;
  }> = [
    {
      estado: 403,
      tipo: 'permiso',
      titulo: 'Tu rol no puede reemplazar las asociaciones del proveedor.',
    },
    {
      estado: 409,
      tipo: 'conflicto',
      titulo: 'Conflicto al reemplazar las asociaciones del proveedor.',
    },
    {
      estado: 422,
      tipo: 'validacion',
      titulo: 'El backend rechazó los productos enviados.',
    },
    {
      estado: 503,
      tipo: 'deshabilitado',
      titulo: 'El módulo de compras SaaS no está habilitado.',
    },
  ];

  for (const caso of CASOS_ASOCIACION) {
    it(`la asociación mapea el error ${caso.estado} como ${caso.tipo}`, () => {
      cargarListado([PROVEEDOR_A]);
      abrirAsociacionConProductos();
      componente.alternarProducto(5, eventoCheck());

      componente.guardarAsociacion();
      http
        .expectOne((solicitud) => solicitud.url === `${URL_CREAR}/3/productos`)
        .flush(cuerpoError(caso.estado, 'Fallo del backend'), {
          status: caso.estado,
          statusText: 'Error',
        });
      fixture.detectChanges();

      expect(componente.tipoErrorAsociacion()).toBe(caso.tipo);
      expect(componente.errorAsociacion()?.estado).toBe(caso.estado);
      const texto = fixture.nativeElement.textContent as string;
      expect(texto).toContain(caso.titulo);
      expect(texto).toContain(componente.errorAsociacion()?.mensaje ?? '');
      expect(componente.proveedorAsociando()?.id).toBe(3);
      expect(componente.estaSeleccionado(5)).toBe(true);
    });
  }

  // ========================= Catálogo de productos =======================

  it('un 403 del catálogo solo bloquea la asociación, no el alta', () => {
    cargarListado([PROVEEDOR_A]);
    componente.abrirAlta();
    http
      .expectOne((peticion) => peticion.url === URL_PRODUCTOS)
      .flush(
        { detail: 'Permiso insuficiente' },
        { status: 403, statusText: 'Forbidden' },
      );
    fixture.detectChanges();

    expect(componente.productosSinPermiso()).toBe(true);
    expect(componente.altaAbierta()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'el proveedor se creará sin productos asociados',
    );
  });
});
