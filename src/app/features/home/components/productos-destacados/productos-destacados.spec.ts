import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Producto } from '../../../administracion/catalogo/models/producto.model';
import { CatalogoPublicoStore } from '../../../catalogo/services/catalogo-publico.store';
import { ProductosDestacados } from './productos-destacados';

const crearProducto = (id: number): Producto => ({
  id,
  nombre: `Producto ${id}`,
  descripcion: null,
  precio: 100 + id,
  estado: true,
  categoria_id: 1,
  categoria: { id: 1, nombre: 'Camisas' },
  imagen_principal_url: `https://cdn.example.com/${id}.jpg`,
});

const PRODUCTOS = Array.from({ length: 9 }, (_, indice) =>
  crearProducto(indice + 1),
);

describe('ProductosDestacados', () => {
  let fixture: ComponentFixture<ProductosDestacados>;
  let listarProductos: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    listarProductos = vi.fn().mockReturnValue(of(PRODUCTOS));
    await TestBed.configureTestingModule({
      imports: [ProductosDestacados],
      providers: [
        provideRouter([]),
        { provide: CatalogoPublicoStore, useValue: { listarProductos } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductosDestacados);
    fixture.detectChanges();
  });

  it('consume productos públicos reales y limita el carrusel a 6', () => {
    const tarjetas = fixture.nativeElement.querySelectorAll(
      'app-product-card',
    );
    expect(listarProductos).toHaveBeenCalledTimes(1);
    expect(tarjetas.length).toBe(6);
    expect(fixture.nativeElement.textContent).toContain('Producto 1');
    expect(fixture.nativeElement.textContent).not.toContain('Producto 9');
  });

  it('emite el producto elegido en "+ Agregar" (punto de integración CU15)', () => {
    const emitidos: Producto[] = [];
    fixture.componentInstance.agregar.subscribe((producto) =>
      emitidos.push(producto),
    );

    const boton = fixture.nativeElement.querySelector(
      'app-product-card .pcard__add',
    ) as HTMLButtonElement;
    boton.click();
    fixture.detectChanges();

    expect(emitidos.length).toBe(1);
    expect(emitidos[0].id).toBe(1);
  });
});
