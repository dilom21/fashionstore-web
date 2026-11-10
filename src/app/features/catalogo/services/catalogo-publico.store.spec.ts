import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { ProductoPublico } from '../models/catalogo-publico.model';
import { CatalogoService } from './catalogo.service';
import { CatalogoPublicoStore } from './catalogo-publico.store';

const PRODUCTOS: ProductoPublico[] = [
  {
    id: 1,
    nombre: 'Polo Premium Piqué',
    descripcion: null,
    categoria: { id: 3, nombre: 'Polos' },
    imagen_principal_url: 'https://cdn.example.com/polo.jpg',
    precio: 149.9,
    precio_definitivo: 149.9,
    precio_calculo_pendiente: false,
  },
  {
    id: 2,
    nombre: 'Camisa Oxford',
    descripcion: null,
    categoria: { id: 1, nombre: 'Camisas' },
    imagen_principal_url: null,
    precio: 189,
    precio_definitivo: 189,
    precio_calculo_pendiente: false,
  },
];

describe('CatalogoPublicoStore', () => {
  let store: CatalogoPublicoStore;
  let listarProductos: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listarProductos = vi.fn(() => of(PRODUCTOS));

    TestBed.configureTestingModule({
      providers: [{ provide: CatalogoService, useValue: { listarProductos } }],
    });
    store = TestBed.inject(CatalogoPublicoStore);
  });

  it('comparte una única llamada al listado público entre suscriptores', () => {
    let primero: ProductoPublico[] | undefined;
    let segundo: ProductoPublico[] | undefined;

    store.listarProductos().subscribe((productos) => (primero = productos));
    store.listarProductos().subscribe((productos) => (segundo = productos));

    expect(listarProductos).toHaveBeenCalledTimes(1);
    expect(primero?.length).toBe(2);
    expect(segundo?.length).toBe(2);
  });

  it('no cachea el error: un reintento vuelve a consultar el backend', () => {
    listarProductos.mockReturnValueOnce(
      throwError(() => new Error('fallo de red')),
    );

    let errorRecibido = false;
    store.listarProductos().subscribe({
      error: () => (errorRecibido = true),
    });
    expect(errorRecibido).toBe(true);

    // Segunda llamada: el error anterior no debe quedar cacheado.
    store.listarProductos().subscribe();
    expect(listarProductos).toHaveBeenCalledTimes(2);
  });

  it('invalida la caché explícitamente', () => {
    store.listarProductos().subscribe();
    store.listarProductos().subscribe();
    expect(listarProductos).toHaveBeenCalledTimes(1);

    store.invalidar();
    store.listarProductos().subscribe();
    expect(listarProductos).toHaveBeenCalledTimes(2);
  });
});
