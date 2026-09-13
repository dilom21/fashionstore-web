import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProductoMedia } from './producto-media';

describe('ProductoMedia', () => {
  let fixture: ComponentFixture<ProductoMedia>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductoMedia],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductoMedia);
  });

  it('muestra el fallback VANTER cuando no hay URL', () => {
    fixture.componentRef.setInput('url', null);
    fixture.componentRef.setInput('nombre', 'Polo');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.media__ph')).toBeTruthy();
  });

  it('muestra el fallback cuando la imagen falla al cargar', () => {
    fixture.componentRef.setInput('url', 'https://cdn.example.com/roto.jpg');
    fixture.componentRef.setInput('nombre', 'Polo');
    fixture.detectChanges();

    const img = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(img).toBeTruthy();

    img.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('.media__ph')).toBeTruthy();
  });
});
