import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TenantMe } from '../models/tenant.models';
import { SaasSessionService } from '../services/saas-session.service';
import { OperacionOffline, ResumenSincronizacion } from './offline.models';
import { SaasOfflineQueueService } from './offline-queue.service';
import { SaasOfflineSyncService } from './offline-sync.service';
import { SaasOfflinePanel } from './saas-offline-panel';
import { SaasConnectivityService } from './saas-connectivity.service';

const PENDIENTE: OperacionOffline = {
  operacion_id: '6f1c2b7e-3a4d-4f5e-9a0b-1c2d3e4f5a6b',
  tipo: 'VENTA_CONTADO',
  estado: 'PENDIENTE',
  empresa_id: 1,
  usuario_id: 10,
  empresa_slug: 'empresa-a',
  creada_en: '2026-10-31T10:00:00.000Z',
  actualizada_en: '2026-10-31T10:00:00.000Z',
  intentos: 0,
  proximo_intento_en: null,
  payload: {
    sucursal_id: 4,
    metodo_pago: 'EFECTIVO',
    lineas: [{ inventario_id: 101, cantidad: 1 }],
  },
  resultado: null,
  conflicto: null,
  ultimo_error: null,
};

const CONFLICTO: OperacionOffline = {
  ...PENDIENTE,
  operacion_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  tipo: 'RESERVA_CANCELAR',
  estado: 'CONFLICTO',
  payload: { reserva_id: 12 },
  conflicto: { codigo: 409, detalle: 'Conflicto de stock en el servidor' },
  ultimo_error: 'Conflicto de stock en el servidor',
};

const RESUMEN: ResumenSincronizacion = {
  ejecutada: true,
  confirmadas: 1,
  conflictos: 0,
  errores: 0,
  reintentables: 0,
  omitidas: 0,
  motivo: 'ok',
};

describe('SaasOfflinePanel', () => {
  let fixture: ComponentFixture<SaasOfflinePanel>;
  let enLinea: WritableSignal<boolean>;
  let identidad: WritableSignal<TenantMe | null>;
  let sincronizar: ReturnType<typeof vi.fn>;
  let cargar: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    enLinea = signal(false);
    identidad = signal<TenantMe | null>(null);
    sincronizar = vi.fn().mockResolvedValue(RESUMEN);
    cargar = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SaasOfflineQueueService,
          useValue: {
            operaciones: signal([PENDIENTE, CONFLICTO]).asReadonly(),
            cargando: signal(false).asReadonly(),
            cargar,
            descartar: vi.fn(),
          },
        },
        {
          provide: SaasOfflineSyncService,
          useValue: {
            sincronizando: signal(false).asReadonly(),
            sincronizar,
            reintentarUna: vi.fn(),
          },
        },
        {
          provide: SaasConnectivityService,
          useValue: { enLinea: enLinea.asReadonly() },
        },
        {
          provide: SaasSessionService,
          useValue: { sesion: identidad.asReadonly() },
        },
      ],
    });

    fixture = TestBed.createComponent(SaasOfflinePanel);
    fixture.detectChanges();
  });

  it('muestra el estado sin conexión, el contador y deshabilita sincronizar', () => {
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Sin conexión');
    expect(texto).toContain('1 pendiente(s)');
    expect(texto).toContain('1 en conflicto');

    const boton = fixture.nativeElement.querySelector(
      '.offline__boton',
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(cargar).toHaveBeenCalled();
  });

  it('muestra el conflicto con su detalle y acciones explícitas', () => {
    const texto = fixture.nativeElement.textContent as string;
    expect(texto).toContain('Operaciones en conflicto');
    expect(texto).toContain('Conflicto de stock en el servidor');
    expect(texto).toContain('HTTP 409');
    expect(texto).toContain('Descartar');
    expect(texto).toContain('Reintentar');
  });

  it('sincroniza manualmente cuando hay conexión', async () => {
    enLinea.set(true);
    identidad.set({
      usuario_id: 10,
      empresa_id: 1,
      empresa_slug: 'empresa-a',
      empresa_nombre: 'Empresa A',
      rol: 'ADMINISTRADOR',
      contexto: 'personal',
      plan_codigo: 'PRO',
      permite_reportes_ia: true,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    sincronizar.mockClear();
    const boton = fixture.nativeElement.querySelector(
      '.offline__boton',
    ) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);

    boton.click();
    await fixture.whenStable();

    expect(sincronizar).toHaveBeenCalledWith({ forzar: true });
  });

  it('drena automáticamente al recuperar conexión con sesión activa', async () => {
    expect(sincronizar).not.toHaveBeenCalled();

    identidad.set({
      usuario_id: 10,
      empresa_id: 1,
      empresa_slug: 'empresa-a',
      empresa_nombre: 'Empresa A',
      rol: 'ADMINISTRADOR',
      contexto: 'personal',
      plan_codigo: 'PRO',
      permite_reportes_ia: true,
    });
    enLinea.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(sincronizar).toHaveBeenCalled();
  });
});
