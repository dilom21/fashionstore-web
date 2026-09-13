import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { Navbar } from './navbar';

@Component({ selector: 'app-catalogo-stub', template: '' })
class CatalogoStub {}

describe('Navbar', () => {
  let fixture: ComponentFixture<Navbar>;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Navbar],
      providers: [
        provideRouter([{ path: 'catalogo', component: CatalogoStub }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(Navbar);
    fixture.detectChanges();
  });

  it('el enlace "Catálogo" navega con RouterLink a /catalogo', async () => {
    const enlaces = Array.from(
      fixture.nativeElement.querySelectorAll('a.nav__link'),
    ) as HTMLAnchorElement[];
    const catalogo = enlaces.find(
      (a) => a.textContent?.trim() === 'Catálogo',
    );

    expect(catalogo).toBeTruthy();
    expect(catalogo!.getAttribute('href')).toBe('/catalogo');

    catalogo!.click();
    await fixture.whenStable();

    expect(router.url).toBe('/catalogo');
  });

  it('la bolsa lleva al catálogo público y no promete un carrito inexistente', () => {
    const bolsa = fixture.nativeElement.querySelector(
      'a[aria-label="Explorar catálogo de compras"]',
    ) as HTMLAnchorElement;

    expect(bolsa).toBeTruthy();
    expect(bolsa.getAttribute('href')).toBe('/catalogo');
    expect(fixture.nativeElement.querySelector('.nav__cart-badge')).toBeNull();
  });

  it('el buscador navega a /catalogo?buscar= sin usar productos mock', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture.componentInstance.query.set('polo');
    fixture.componentInstance.searchOpen.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.search__list')).toBeNull();

    const boton = fixture.nativeElement.querySelector(
      '.search__go',
    ) as HTMLButtonElement;
    boton.click();

    expect(navigate).toHaveBeenCalledWith(['/catalogo'], {
      queryParams: { buscar: 'polo' },
    });
  });
});
