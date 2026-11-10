import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ProductoPublico } from '../../../features/catalogo/models/catalogo-publico.model';
import { ProductCard } from './product-card';

const PRODUCTO: ProductoPublico = {
  id: 7,
  nombre: 'Polo Premium Piqué',
  descripcion: 'Polo de algodón',
  categoria: { id: 3, nombre: 'Polos' },
  imagen_principal_url: 'https://cdn.example.com/polo.jpg',
  precio: 149.9,
  precio_definitivo: 149.9,
  precio_calculo_pendiente: false,
};

describe('ProductCard', () => {
  let fixture: ComponentFixture<ProductCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductCard],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductCard);
    fixture.componentRef.setInput('producto', PRODUCTO);
    fixture.detectChanges();
  });

  it('usa la imagen_principal_url real del producto', () => {
    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe(PRODUCTO.imagen_principal_url);
  });

  it('navega al detalle público mediante RouterLink', () => {
    const enlaces = Array.from(
      fixture.nativeElement.querySelectorAll('a'),
    ) as HTMLAnchorElement[];
    const hrefs = enlaces.map((enlace) => enlace.getAttribute('href'));
    expect(hrefs).toContain('/catalogo/productos/7');
  });

  it('muestra categoría, nombre y precio reales del backend', () => {
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Polos');
    expect(texto).toContain('Polo Premium Piqué');
    expect(texto).toContain('149.90');
  });

  it('emite el producto en "+ Agregar" sin crear carrito', () => {
    const emitidos: ProductoPublico[] = [];
    fixture.componentInstance.agregar.subscribe((producto) =>
      emitidos.push(producto),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    const boton = fixture.nativeElement.querySelector(
      '.pcard__add',
    ) as HTMLButtonElement;
    boton.click();
    fixture.detectChanges();

    expect(emitidos).toEqual([PRODUCTO]);
    expect(setItem).not.toHaveBeenCalled();
  });
});
