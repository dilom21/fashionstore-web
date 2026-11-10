import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { AuthService } from '../../../autenticacion-seguridad/auth/services/auth.service';
import { CarritoService } from '../../../carrito/services/carrito.service';
import { SucursalCompraService } from '../../../carrito/services/sucursal-compra.service';
import { TenantApiService } from '../../../saas/services/tenant-api.service';
import { ToastService } from '../../../../core/services/toast.service';
import { SAAS_MODE } from '../../../../core/config/app-mode';
import { CatalogoFiltros } from '../../models/catalogo-filtros.model';
import { ProductoPublicoDetalle } from '../../models/catalogo-publico.model';
import { CatalogoService } from '../../services/catalogo.service';
import { ProductoDetallePage } from './producto-detalle-page';

const DETALLE: ProductoPublicoDetalle = {
  id: 1,
  nombre: 'Polo Premium',
  descripcion: null,
  categoria: { id: 3, nombre: 'Polos' },
  imagen_principal_url: null,
  precio: 149.9,
  precio_definitivo: 149.9,
  precio_calculo_pendiente: false,
  variantes: [
    {
      id: 11,
      sku: 'POL-M',
      estado: true,
      talla: { id: 3, nombre: 'M' },
      color: { id: 1, nombre: 'Negro' },
    },
  ],
  recursos: [],
  disponibilidad: [
    {
      variante_id: 11,
      sucursal_id: 1,
      sucursal: 'Sucursal Centro',
      sku: 'POL-M',
      talla: 'M',
      color: 'Negro',
      temporada: 'PV26',
      stock_disponible: 5,
    },
    {
      variante_id: 11,
      sucursal_id: 2,
      sucursal: 'Sucursal Ventura',
      sku: 'POL-M',
      talla: 'M',
      color: 'Negro',
      temporada: 'PV26',
      stock_disponible: 0,
    },
  ],
};

function filtros(temporadas = [{ id: 4, nombre: 'PV26' }]): CatalogoFiltros {
  return {
    categorias: [],
    tallas: [{ id: 3, nombre: 'M' }],
    colores: [{ id: 1, nombre: 'Negro' }],
    temporadas,
    colecciones: [],
    sucursales: [
      { id: 1, nombre: 'Sucursal Centro' },
      { id: 2, nombre: 'Sucursal Ventura' },
    ],
  };
}

interface Opciones {
  empresaSlug?: string;
  filtros?: CatalogoFiltros;
}

function setup(opciones: Opciones = {}) {
  const identidad = signal<any>({
    usuario_id: 21,
    empresa_id: 3,
    empresa_slug: opciones.empresaSlug ?? 'vanter-men',
    empresa_nombre: 'Vanter Men',
    rol: 'CLIENTE',
    contexto: 'cliente',
    plan_codigo: 'PRO',
    permite_reportes_ia: false,
  });

  const catalogo = {
    obtenerProductoDetalle: vi.fn(() => of(DETALLE)),
    obtenerFiltros: vi.fn(() => of(opciones.filtros ?? filtros())),
    obtenerDisponibilidad: vi.fn(() => of([])),
  };
  const carrito = {
    agregarItem: vi.fn(() => of(undefined)),
    refrescarContador: vi.fn(),
    cerrarSesionCliente: vi.fn(),
  };
  const tenant = {
    identidad,
    contexto: () => identidad()?.contexto ?? null,
    autenticado: () => identidad() !== null,
    tieneToken: () => true,
    cerrarSesion: vi.fn(),
  };
  const sucursalCompra = {
    sucursalId: signal<number | null>(1),
    sucursalNombre: signal<string | null>('Sucursal Centro'),
    seleccionar: vi.fn(),
    limpiar: vi.fn(),
  };
  const toast = { mostrar: vi.fn() };
  const auth = { esCliente: () => false, cerrarSesion: vi.fn() };

  TestBed.configureTestingModule({
    imports: [ProductoDetallePage],
    providers: [
      provideRouter([]),
      { provide: SAAS_MODE, useValue: true },
      { provide: CatalogoService, useValue: catalogo },
      { provide: CarritoService, useValue: carrito },
      { provide: TenantApiService, useValue: tenant },
      { provide: SucursalCompraService, useValue: sucursalCompra },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: auth },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ producto_id: '1' }),
            queryParamMap: convertToParamMap({}),
          },
        },
      },
    ],
  });

  const fixture: ComponentFixture<ProductoDetallePage> =
    TestBed.createComponent(ProductoDetallePage);
  const page = fixture.componentInstance;
  // ngOnInit sin renderizar toda la plantilla (evita montar Navbar/otros).
  page.ngOnInit();

  return { fixture, page, carrito, toast, sucursalCompra, catalogo };
}

/** Selecciona la única variante disponible (talla 3, color 1). */
function elegirVariante(page: ProductoDetallePage): void {
  page.seleccionarTalla(3);
  page.seleccionarColor(1);
}

describe('ProductoDetallePage — carrito SaaS (saasMode=true)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('deriva sucursales y temporadas SOLO desde la disponibilidad real', () => {
    const { page } = setup();
    elegirVariante(page);

    expect(page.varianteElegida()?.id).toBe(11);
    // La sucursal 2 tiene stock 0: no se ofrece.
    expect(page.sucursalesDisponibles().map((s) => s.id)).toEqual([1]);
    expect(page.temporadasDisponibles()).toEqual(['PV26']);
  });

  it('resuelve temporada_id y agrega con el payload variante + temporada', () => {
    const { page, carrito } = setup();
    elegirVariante(page);
    page.temporadaElegida.set('PV26');

    expect(page.resolucionTemporada().id).toBe(4);
    expect(page.filaSeleccionada()?.stock_disponible).toBe(5);
    expect(page.puedeAgregar()).toBe(true);

    page.agregarAlCarrito();

    expect(carrito.agregarItem).toHaveBeenCalledWith({
      modo: 'variante',
      sucursal_id: 1,
      variante_producto_id: 11,
      temporada_id: 4,
      cantidad: 1,
    });
  });

  it('no agrega si la temporada es ambigua y muestra el aviso', () => {
    const { page, carrito } = setup({
      filtros: filtros([
        { id: 4, nombre: 'PV26' },
        { id: 99, nombre: 'pv26' },
      ]),
    });
    elegirVariante(page);
    page.temporadaElegida.set('PV26');

    expect(page.resolucionTemporada().id).toBeNull();
    expect(page.puedeAgregar()).toBe(false);
    expect(page.mensajeSeleccion()?.tipo).toBe('error');

    page.agregarAlCarrito();
    expect(carrito.agregarItem).not.toHaveBeenCalled();
  });

  it('no agrega silenciosamente con la sesión de otra empresa', () => {
    const { page, carrito, toast } = setup({ empresaSlug: 'otra-empresa' });
    elegirVariante(page);
    page.temporadaElegida.set('PV26');

    expect(page.empresaCoincide()).toBe(false);
    expect(page.mensajeEmpresa()).toBeTruthy();

    page.agregarAlCarrito();
    expect(carrito.agregarItem).not.toHaveBeenCalled();
    expect(toast.mostrar).toHaveBeenCalled();
  });
});
