import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormGroup } from '@angular/forms';

import { CatalogoFiltros } from '../../models/catalogo-filtros.model';
import { FiltrosCatalogo } from './filtros-catalogo';

const SELECTS_DEPENDIENTES = [
  'fc-categoria',
  'fc-talla',
  'fc-color',
  'fc-temporada',
  'fc-coleccion',
  'fc-sucursal',
];

const FILTROS: CatalogoFiltros = {
  categorias: [{ id: 3, nombre: 'Polos' }],
  tallas: [{ id: 1, nombre: 'M' }],
  colores: [{ id: 2, nombre: 'Azul' }],
  temporadas: [{ id: 4, nombre: 'Verano' }],
  colecciones: [{ id: 5, nombre: 'Básicos', temporada_id: 4 }],
  sucursales: [{ id: 6, nombre: 'Centro', ciudad: 'Santa Cruz' }],
};

function crearForm(disabled: boolean): FormGroup {
  return new FormGroup({
    buscar: new FormControl('', { nonNullable: true }),
    categoria_id: new FormControl<number | null>({ value: null, disabled }),
    talla_id: new FormControl<number | null>({ value: null, disabled }),
    color_id: new FormControl<number | null>({ value: null, disabled }),
    temporada_id: new FormControl<number | null>({ value: null, disabled }),
    coleccion_id: new FormControl<number | null>({ value: null, disabled }),
    sucursal_id: new FormControl<number | null>({ value: null, disabled }),
    con_stock: new FormControl(false, { nonNullable: true }),
  });
}

describe('FiltrosCatalogo (CU09)', () => {
  let fixture: ComponentFixture<FiltrosCatalogo>;

  function render(form: FormGroup, cargandoFiltros = false): void {
    fixture = TestBed.createComponent(FiltrosCatalogo);
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('filtros', FILTROS);
    fixture.componentRef.setInput('cargandoFiltros', cargandoFiltros);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FiltrosCatalogo],
    }).compileComponents();
  });

  afterEach(() => TestBed.resetTestingModule());

  it('no deshabilita los selects por el template ([disabled] eliminado)', () => {
    render(crearForm(false), true);

    for (const id of SELECTS_DEPENDIENTES) {
      const select = fixture.nativeElement.querySelector(
        `#${id}`,
      ) as HTMLSelectElement;
      expect(select.disabled).toBe(false);
    }
  });

  it('refleja el estado disabled/enabled de los FormControl (Reactive Forms)', () => {
    const form = crearForm(true);
    render(form);

    const select = fixture.nativeElement.querySelector(
      '#fc-categoria',
    ) as HTMLSelectElement;
    expect(select.disabled).toBe(true);

    (form.controls['categoria_id'] as FormControl).enable();
    fixture.detectChanges();
    expect(select.disabled).toBe(false);

    (form.controls['categoria_id'] as FormControl).disable();
    fixture.detectChanges();
    expect(select.disabled).toBe(true);
  });

  it('renderiza las opciones reales de GET /catalogo/filtros', () => {
    render(crearForm(false));

    const select = fixture.nativeElement.querySelector(
      '#fc-categoria',
    ) as HTMLSelectElement;
    const opciones = Array.from(select.options).map((opcion) =>
      opcion.textContent?.trim(),
    );

    expect(opciones).toContain('Todas las categorías');
    expect(opciones).toContain('Polos');
  });
});
