import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Stripe } from '@stripe/stripe-js';

import {
  STRIPE_PUBLISHABLE_KEY,
  StripeClientService,
} from './stripe-client.service';

const { loadStripeMock } = vi.hoisted(() => ({ loadStripeMock: vi.fn() }));

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: loadStripeMock,
}));

const STRIPE_FAKE = { id: 'stripe-fake' } as unknown as Stripe;

function configurar(platformId: string, key: string): StripeClientService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platformId },
      { provide: STRIPE_PUBLISHABLE_KEY, useValue: key },
    ],
  });
  return TestBed.inject(StripeClientService);
}

describe('StripeClientService (CU22)', () => {
  beforeEach(() => {
    loadStripeMock.mockReset();
  });

  it('sin publishable key rechaza y NO carga Stripe.js', async () => {
    const service = configurar('browser', '');

    expect(service.claveConfigurada).toBe(false);
    await expect(service.cargarStripe()).rejects.toThrow();
    expect(loadStripeMock).not.toHaveBeenCalled();
  });

  it('en servidor (SSR) rechaza aunque haya key', async () => {
    const service = configurar('server', 'pk_test_real');

    await expect(service.cargarStripe()).rejects.toThrow();
    expect(loadStripeMock).not.toHaveBeenCalled();
  });

  it('en navegador carga Stripe.js una sola vez (singleton)', async () => {
    loadStripeMock.mockResolvedValue(STRIPE_FAKE);
    const service = configurar('browser', 'pk_test_real');

    expect(service.claveConfigurada).toBe(true);
    const primera = service.cargarStripe();
    const segunda = service.cargarStripe();

    expect(primera).toBe(segunda);
    await expect(primera).resolves.toBe(STRIPE_FAKE);
    expect(loadStripeMock).toHaveBeenCalledTimes(1);
    expect(loadStripeMock).toHaveBeenCalledWith('pk_test_real');
  });

  it('si loadStripe devuelve null, rechaza', async () => {
    loadStripeMock.mockResolvedValue(null);
    const service = configurar('browser', 'pk_test_real');

    await expect(service.cargarStripe()).rejects.toThrow();
  });

  it('si loadStripe falla, permite reintentar', async () => {
    loadStripeMock.mockRejectedValueOnce(new Error('network'));
    loadStripeMock.mockResolvedValueOnce(STRIPE_FAKE);
    const service = configurar('browser', 'pk_test_real');

    await expect(service.cargarStripe()).rejects.toThrow();
    await expect(service.cargarStripe()).resolves.toBe(STRIPE_FAKE);
    expect(loadStripeMock).toHaveBeenCalledTimes(2);
  });
});
