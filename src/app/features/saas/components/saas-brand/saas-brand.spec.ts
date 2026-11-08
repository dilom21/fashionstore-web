import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaasBrand } from './saas-brand';

/**
 * Marca de la PLATAFORMA SaaS: FashionStore. No debe representar a ninguna
 * empresa cliente concreta; el nombre de la empresa autenticada lo muestra cada
 * pantalla con el contexto tenant.
 */
describe('SaasBrand', () => {
  let fixture: ComponentFixture<SaasBrand>;

  async function render(etiqueta?: string): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [SaasBrand],
    }).compileComponents();

    fixture = TestBed.createComponent(SaasBrand);
    if (etiqueta !== undefined) {
      fixture.componentRef.setInput('etiqueta', etiqueta);
    }
    fixture.detectChanges();

    return fixture.nativeElement as HTMLElement;
  }

  function texto(host: HTMLElement): string {
    return (host.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  it('muestra FashionStore como nombre de la plataforma', async () => {
    const host = await render();

    expect(host.querySelector('.saas-brand__name')?.textContent).toBe(
      'FashionStore',
    );
  });

  it('no usa la marca de una empresa cliente', async () => {
    const host = await render();

    expect(texto(host).toLowerCase()).not.toContain('vanter');
  });

  it('omite la etiqueta cuando no se indica', async () => {
    const host = await render();

    expect(host.querySelector('.saas-brand__tag')).toBeNull();
  });

  it('muestra la etiqueta opcional bajo el nombre', async () => {
    const host = await render('Portal empresarial');

    expect(host.querySelector('.saas-brand__tag')?.textContent).toContain(
      'Portal empresarial',
    );
    expect(texto(host)).toContain('FashionStore');
  });

  it('mantiene el isotipo fuera del árbol de accesibilidad', async () => {
    const host = await render();
    const marca = host.querySelector('.saas-brand__mark');

    expect(marca?.getAttribute('aria-hidden')).toBe('true');
  });
});
