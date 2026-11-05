import { SAAS_NAV_GRUPOS, filtrarNavSaas } from './saas-nav.config';

describe('navegación SaaS por contexto', () => {
  it('muestra solo la superficie de compras al cliente', () => {
    const grupos = filtrarNavSaas(SAAS_NAV_GRUPOS, () => true, 'cliente');
    expect(grupos.map((grupo) => grupo.id)).toEqual(['operacion']);
    expect(grupos[0].items.map((item) => item.id)).toEqual(['cliente']);
  });

  it('no muestra el canal cliente al personal', () => {
    const grupos = filtrarNavSaas(SAAS_NAV_GRUPOS, () => true, 'personal');
    expect(grupos.flatMap((grupo) => grupo.items).some((item) => item.id === 'cliente')).toBe(false);
    expect(grupos.flatMap((grupo) => grupo.items).some((item) => item.id === 'inicio')).toBe(true);
  });
});
