import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Producto } from '../../administracion/catalogo/models/producto.model';
import { CatalogoPublicoStore } from './catalogo-publico.store';

const PRODUCTOS: Producto[] = [
  {
    id: 1,
    nombre: 'Polo Premium Piqué',
    descripcion: null,
    precio: 149.9,
    estado: true,
    categoria_id: 3,
    categoria: { id: 3, nombre: 'Polos' },
    imagen_principal_url: 'https://cdn.example.com/polo.jpg',
  },
  {
    id: 2,
    nombre: 'Camisa Oxford',
    descripcion: null,
    precio: 189,
    estado: true,
    categoria_id: 1,
    categoria: { id: 1, nombre: 'Camisas' },
    imagen_principal_url: null,
  },
];

describe('CatalogoPublicoStore', () => {
  let store: CatalogoPublicoStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(CatalogoPublicoStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('comparte una única petición GET /productos entre suscriptores', () => {
    let primero: Producto[] | undefined;
    let segundo: Producto[] | undefined;

    store.listarProductos().subscribe((productos) => (primero = productos));
    store.listarProductos().subscribe((productos) => (segundo = productos));

    const peticiones = http.match((req) => req.url.endsWith('/productos'));
    expect(peticiones.length).toBe(1);

    peticiones[0].flush(PRODUCTOS);

    expect(primero?.length).toBe(2);
    expect(segundo?.length).toBe(2);
  });

  it('no realiza GET /productos/{id} al listar el catálogo', () => {
    store.listarProductos().subscribe();

    const peticiones = http.match(() => true);
    const detalle = peticiones.filter((peticion) =>
      /\/productos\/\d+$/.test(peticion.request.url),
    );
    expect(detalle.length).toBe(0);

    peticiones.forEach((peticion) => peticion.flush(PRODUCTOS));
  });
});
