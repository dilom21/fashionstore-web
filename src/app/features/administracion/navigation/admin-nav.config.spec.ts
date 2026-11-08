import { ADMIN_NAV_ITEMS, aplanarDestinos, filtrarItemsNav } from './admin-nav.config';

/**
 * El panel administrativo conserva la configuración y el orden del primer
 * parcial. La única incorporación es la opción TEMPORAL `CU4-CU5`, declarada
 * como opción independiente inmediatamente debajo de Reportes.
 */
describe('ADMIN_NAV_ITEMS (panel administrativo original)', () => {
  const ids = ADMIN_NAV_ITEMS.map((item) => item.id);

  it('conserva los módulos originales en su orden', () => {
    expect(ids).toEqual([
      'inicio',
      'seguridad',
      'catalogo',
      'inventario',
      'reservas',
      'ventas',
      'compras',
      'reportes',
      'cu4-cu5',
    ]);

    const etiquetas = ADMIN_NAV_ITEMS.map((item) => item.label);
    expect(etiquetas).toEqual([
      'Inicio',
      'Seguridad',
      'Catálogo',
      'Inventario',
      'Reservas',
      'Ventas y Pagos',
      'Compras y Proveedores',
      'Reportes',
      'CU4-CU5',
    ]);
  });

  it('CU4-CU5 aparece inmediatamente debajo de Reportes', () => {
    const indiceReportes = ids.indexOf('reportes');
    const indiceCu4Cu5 = ids.indexOf('cu4-cu5');

    expect(indiceCu4Cu5).toBe(indiceReportes + 1);
  });

  it('CU4-CU5 es una opción independiente (no está dentro del grupo Reportes)', () => {
    const reportes = ADMIN_NAV_ITEMS.find((item) => item.id === 'reportes');
    const cu4Cu5 = ADMIN_NAV_ITEMS.find((item) => item.id === 'cu4-cu5');

    expect(reportes?.route).toBe('/admin/reportes');
    expect(reportes?.children).toBeUndefined();
    expect(cu4Cu5?.children).toBeUndefined();
  });

  it('CU4-CU5 se llama exactamente así y lleva a la pantalla SaaS existente', () => {
    const cu4Cu5 = ADMIN_NAV_ITEMS.find((item) => item.id === 'cu4-cu5');

    expect(cu4Cu5?.label).toBe('CU4-CU5');
    expect(cu4Cu5?.route).toBe('/saas/empresa');
    expect(cu4Cu5?.icon).toBe('estado');
    expect(cu4Cu5?.permiso).toBe('SAAS:CU4_CU5');
    expect(cu4Cu5?.descripcion).toBeTruthy();
  });

  it('la pantalla CU4-CU5 no duplica los casos de uso del panel', () => {
    const rutas = aplanarDestinos(ADMIN_NAV_ITEMS).map((item) => item.route);

    expect(rutas).toContain('/saas/empresa');
    // Aparece una sola vez en toda la navegación.
    expect(rutas.filter((ruta) => ruta === '/saas/empresa')).toHaveLength(1);
  });

  it('el filtrado por rol conserva la opción temporal como hoja', () => {
    const soloCu4Cu5 = filtrarItemsNav(
      ADMIN_NAV_ITEMS,
      (item) => item.route === '/saas/empresa',
    );

    expect(soloCu4Cu5.map((item) => item.id)).toEqual(['cu4-cu5']);
  });
});
