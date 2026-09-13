import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { Subject, of } from 'rxjs';

import { Producto } from '../../../administracion/catalogo/models/producto.model';
import { ProductosService } from '../../../administracion/catalogo/services/productos.service';
import { CatalogoFiltros } from '../../models/catalogo-filtros.model';
import { CatalogoService } from '../../services/catalogo.service';
import { CatalogoPage } from './catalogo-page';

const CONTROLES_DEPENDIENTES = [
  'categoria_id',
  'talla_id',
  'color_id',
  'temporada_id',
  'coleccion_id',
  'sucursal_id',
] as const;

const FILTROS: CatalogoFiltros = {
  categorias: [
    { id: 3, nombre: 'Polos' },
    { id: 1, nombre: 'Camisas' },
  ],
  tallas: [{ id: 1, nombre: 'M' }],
  colores: [{ id: 2, nombre: 'Azul' }],
  temporadas: [{ id: 4, nombre: 'Verano' }],
  colecciones: [{ id: 5, nombre: 'Básicos', temporada_id: 4 }],
  sucursales: [{ id: 6, nombre: 'Centro', ciudad: 'Santa Cruz' }],
};

function configurar(opciones: {
  plataforma?: 'browser' | 'server';
  queryParams?: Record<string, string>;
}) {
  const filtros$ = new Subject<CatalogoFiltros>();
  const listar = vi.fn(() => of([] as Producto[]));
  const obtenerFiltros = vi.fn(() => filtros$);
  const activatedRoute = {
    snapshot: {
      queryParamMap: convertToParamMap(opciones.queryParams ?? {}),
    },
  } as unknown as ActivatedRoute;

  TestBed.configureTestingModule({
    imports: [CatalogoPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ProductosService,
        useValue: { listarProductosPublicos: listar },
      },
      { provide: CatalogoService, useValue: { obtenerFiltros } },
      { provide: ActivatedRoute, useValue: activatedRoute },
      { provide: PLATFORM_ID, useValue: opciones.plataforma ?? 'browser' },
    ],
  });

  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  const fixture: ComponentFixture<CatalogoPage> =
    TestBed.createComponent(CatalogoPage);

  return {
    fixture,
    navigate,
    listar,
    obtenerFiltros,
    filtros$,
    page: fixture.componentInstance,
  };
}

describe('CatalogoPage (CU09)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('inicia los seis selects deshabilitados mientras carga GET /catalogo/filtros', () => {
    const { fixture, page, filtros$ } = configurar({});
    fixture.detectChanges();

    expect(page.cargandoFiltros()).toBe(true);
    for (const nombre of CONTROLES_DEPENDIENTES) {
      expect(page.filtrosForm.controls[nombre].disabled).toBe(true);
    }

    filtros$.next(FILTROS);
    fixture.destroy();
  });

  it('habilita los seis selects al completar la carga de filtros', () => {
    const { fixture, page, filtros$ } = configurar({});
    fixture.detectChanges();
    filtros$.next(FILTROS);

    expect(page.cargandoFiltros()).toBe(false);
    expect(page.filtros()).toEqual(FILTROS);
    for (const nombre of CONTROLES_DEPENDIENTES) {
      expect(page.filtrosForm.controls[nombre].disabled).toBe(false);
    }

    fixture.destroy();
  });

  it('vuelve a habilitar los selects si GET /catalogo/filtros falla', () => {
    const { fixture, page, filtros$ } = configurar({});
    fixture.detectChanges();
    filtros$.error(new Error('fallo de red'));

    expect(page.cargandoFiltros()).toBe(false);
    expect(page.errorFiltros()).not.toBeNull();
    for (const nombre of CONTROLES_DEPENDIENTES) {
      expect(page.filtrosForm.controls[nombre].disabled).toBe(false);
    }

    fixture.destroy();
  });

  it('cambia el estado con emitEvent:false y no dispara consultas extra', () => {
    const { fixture, page, filtros$, listar } = configurar({});
    fixture.detectChanges();
    const llamadasIniciales = listar.mock.calls.length;

    let emisiones = 0;
    const sub = page.filtrosForm.valueChanges.subscribe(() => (emisiones += 1));

    filtros$.next(FILTROS);

    expect(emisiones).toBe(0);
    expect(listar.mock.calls.length).toBe(llamadasIniciales);

    sub.unsubscribe();
    fixture.destroy();
  });

  it('conserva la selección con getRawValue aunque los controles estén disabled', () => {
    const { fixture, page, filtros$ } = configurar({
      queryParams: { categoria_id: '3' },
    });
    fixture.detectChanges();

    expect(page.filtrosForm.getRawValue().categoria_id).toBe(3);

    filtros$.next(FILTROS);
    expect(page.filtrosForm.getRawValue().categoria_id).toBe(3);

    fixture.destroy();
  });

  it('no navega en SSR (sincronizarUrl no llama router.navigate)', () => {
    const { fixture, navigate, filtros$ } = configurar({
      plataforma: 'server',
    });
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();

    filtros$.next(FILTROS);
    fixture.destroy();
  });

  it('sincroniza los query params en el navegador', () => {
    const { fixture, navigate } = configurar({
      plataforma: 'browser',
      queryParams: { buscar: 'Polo' },
    });
    fixture.detectChanges();

    expect(navigate).toHaveBeenCalledTimes(1);
    const [, extras] = navigate.mock.calls[0] as [
      unknown[],
      { queryParams: Record<string, unknown> },
    ];
    expect(extras.queryParams['buscar']).toBe('Polo');

    fixture.destroy();
  });

  it('lee buscar desde ActivatedRoute.snapshot en SSR (/catalogo?buscar=Polo)', () => {
    const { fixture, page, listar, navigate } = configurar({
      plataforma: 'server',
      queryParams: { buscar: 'Polo' },
    });
    fixture.detectChanges();

    expect(page.filtrosForm.controls['buscar'].value).toBe('Polo');
    expect(listar).toHaveBeenCalledWith(
      expect.objectContaining({ buscar: 'Polo' }),
    );
    expect(navigate).not.toHaveBeenCalled();

    fixture.destroy();
  });

  it('mantiene funcionando la carga de filtros existente (selección y consulta)', () => {
    const { fixture, page, filtros$, listar } = configurar({});
    fixture.detectChanges();
    filtros$.next(FILTROS);

    vi.useFakeTimers();
    page.filtrosForm.controls['categoria_id'].setValue(3);
    page.aplicarFiltros();
    vi.advanceTimersByTime(400);
    vi.useRealTimers();

    expect(listar).toHaveBeenLastCalledWith(
      expect.objectContaining({ categoria_id: 3 }),
    );

    fixture.destroy();
  });
});
