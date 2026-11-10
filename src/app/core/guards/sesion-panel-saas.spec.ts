import { UrlTree } from '@angular/router';

import { decidirAccesoPanelEmpresarial } from './sesion-panel-saas';

/** Router mínimo: devuelve un UrlTree inspeccionable con la ruta pedida. */
function routerMock(): { parseUrl: (url: string) => UrlTree } {
  return {
    parseUrl: (url: string) => ({ toString: () => url }) as unknown as UrlTree,
  };
}

function apiMock(rol: 'ADMINISTRADOR' | 'ENCARGADO_SUCURSAL' | 'CAJERO'): any {
  return {
    identidad: () => ({ contexto: 'personal', rol }),
    esAdministrador: () => rol === 'ADMINISTRADOR',
    esEncargadoSucursal: () => rol === 'ENCARGADO_SUCURSAL',
    esCajero: () => rol === 'CAJERO',
    tieneToken: () => true,
    restaurarSesion: () => undefined,
  };
}

function ruta(resultado: unknown): string {
  return (resultado as UrlTree).toString();
}

describe('decidirAccesoPanelEmpresarial (roles SaaS CU12/CU13)', () => {
  it('ADMINISTRADOR accede a cualquier pantalla del panel', () => {
    expect(
      decidirAccesoPanelEmpresarial(
        apiMock('ADMINISTRADOR'),
        routerMock() as any,
        '/admin/usuarios',
      ),
    ).toBe(true);
  });

  it('ENCARGADO_SUCURSAL accede a CU08, CU12 y CU13 adaptados', () => {
    for (const url of [
      '/admin/inventario/consultar',
      '/admin/reservas',
      '/admin/reservas/15',
      '/personal/reservas/atencion',
      '/personal/reservas/atencion/15',
      '/personal/ventas/presencial',
    ]) {
      expect(
        decidirAccesoPanelEmpresarial(apiMock('ENCARGADO_SUCURSAL'), routerMock() as any, url),
      ).toBe(true);
    }
  });

  it('ENCARGADO_SUCURSAL no accede a módulos no adaptados', () => {
    const resultado = decidirAccesoPanelEmpresarial(
      apiMock('ENCARGADO_SUCURSAL'),
      routerMock() as any,
      '/admin/usuarios',
    );
    expect(ruta(resultado)).toBe('/saas/sesion');
  });

  it('CAJERO accede solo a las operativas CU12 atención y CU13', () => {
    expect(
      decidirAccesoPanelEmpresarial(
        apiMock('CAJERO'),
        routerMock() as any,
        '/personal/reservas/atencion',
      ),
    ).toBe(true);
    expect(
      decidirAccesoPanelEmpresarial(
        apiMock('CAJERO'),
        routerMock() as any,
        '/personal/ventas/presencial',
      ),
    ).toBe(true);
    expect(
      ruta(
        decidirAccesoPanelEmpresarial(
          apiMock('CAJERO'),
          routerMock() as any,
          '/admin/reservas',
        ),
      ),
    ).toBe('/saas/sesion');
  });
});
