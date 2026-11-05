import { PermisoAsignado } from '../../models/tenant.models';
import {
  agruparPorFuncion,
  clavePermiso,
  esRolAdministrador,
} from './matriz-permisos.util';

function permiso(
  funcion: string,
  accion: string,
  permitido = true,
  origen: 'EXCEPCION' | 'DEFAULT' = 'DEFAULT',
): PermisoAsignado {
  return { funcion, accion, permitido, origen };
}

describe('agruparPorFuncion', () => {
  it('agrupa los permisos por función', () => {
    const grupos = agruparPorFuncion([
      permiso('VENTAS', 'REGISTRAR'),
      permiso('VENTAS', 'CONSULTAR'),
      permiso('PERSONAL', 'ADMINISTRAR'),
    ]);

    expect(grupos.map((grupo) => grupo.funcion)).toEqual([
      'PERSONAL',
      'VENTAS',
    ]);
    expect(grupos[1].permisos.map((item) => item.accion)).toEqual([
      'CONSULTAR',
      'REGISTRAR',
    ]);
  });

  it('ordena funciones y acciones alfabéticamente', () => {
    const grupos = agruparPorFuncion([
      permiso('VENTAS', 'REGISTRAR'),
      permiso('CATALOGO', 'ADMINISTRAR'),
      permiso('CATALOGO', 'CONSULTAR'),
      permiso('DEVOLUCIONES', 'GESTIONAR'),
    ]);

    expect(grupos.map((grupo) => grupo.funcion)).toEqual([
      'CATALOGO',
      'DEVOLUCIONES',
      'VENTAS',
    ]);
    expect(grupos[0].permisos.map((item) => item.accion)).toEqual([
      'ADMINISTRAR',
      'CONSULTAR',
    ]);
  });

  it('normaliza función y acción sin depender del formato del backend', () => {
    const grupos = agruparPorFuncion([
      permiso(' ventas ', ' registrar '),
      permiso('VENTAS', 'REGISTRAR'),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].funcion).toBe('VENTAS');
    expect(grupos[0].permisos).toHaveLength(2);
    expect(grupos[0].permisos[0].accion).toBe('REGISTRAR');
  });

  it('descarta filas sin función', () => {
    const grupos = agruparPorFuncion([
      permiso('   ', 'CONSULTAR'),
      permiso('VENTAS', 'REGISTRAR'),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].funcion).toBe('VENTAS');
  });

  it('conserva permitido y origen de cada permiso', () => {
    const grupos = agruparPorFuncion([
      permiso('PERSONAL', 'CONSULTAR', false, 'EXCEPCION'),
    ]);

    expect(grupos[0].permisos[0]).toEqual({
      funcion: 'PERSONAL',
      accion: 'CONSULTAR',
      permitido: false,
      origen: 'EXCEPCION',
    });
  });

  it('no muta el arreglo recibido', () => {
    const original = [
      permiso('ventas', 'registrar'),
      permiso('CATALOGO', 'CONSULTAR'),
    ];
    const copia = JSON.parse(JSON.stringify(original)) as PermisoAsignado[];

    agruparPorFuncion(original);

    expect(original).toEqual(copia);
  });

  it('devuelve una lista vacía sin permisos', () => {
    expect(agruparPorFuncion([])).toEqual([]);
  });
});

describe('clavePermiso', () => {
  it('normaliza función y acción para comparar filas editables', () => {
    expect(clavePermiso('ventas', ' registrar ')).toBe('VENTAS|REGISTRAR');
    expect(clavePermiso('VENTAS', 'REGISTRAR')).toBe(
      clavePermiso(' ventas ', 'registrar'),
    );
  });
});

describe('esRolAdministrador', () => {
  it('reconoce el rol sin distinguir mayúsculas ni espacios', () => {
    expect(esRolAdministrador('ADMINISTRADOR')).toBe(true);
    expect(esRolAdministrador(' administrador ')).toBe(true);
    expect(esRolAdministrador('CAJERO')).toBe(false);
    expect(esRolAdministrador(null)).toBe(false);
  });
});
