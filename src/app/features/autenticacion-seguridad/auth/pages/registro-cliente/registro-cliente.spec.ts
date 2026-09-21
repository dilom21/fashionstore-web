import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../services/auth.service';
import { RegistroCliente } from './registro-cliente';

describe('RegistroCliente', () => {
  it('habilita el botón cuando un campo común completa el formulario al final', async () => {
    await TestBed.configureTestingModule({
      imports: [RegistroCliente],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: {} },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(RegistroCliente);
    const componente = fixture.componentInstance;

    componente.form.patchValue({
      nombre: 'Harold',
      apellido: '',
      correo: 'harold@gmail.com',
      ci: '12458975',
      telefono: '56894256',
      sexo: 'MASCULINO',
      fecha_nacimiento: '2003-03-25',
      password: 'Segura123!',
      password_confirmacion: 'Segura123!',
    });

    expect(componente.puedeEnviar()).toBe(false);

    // Antes de la corrección, `form.valid` cambiaba pero el computed conservaba
    // el valor anterior porque el apellido no participaba como señal.
    componente.form.controls.apellido.setValue('Amador');
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement;
    expect(componente.form.valid).toBe(true);
    expect(componente.puedeEnviar()).toBe(true);
    expect(boton.disabled).toBe(false);
  });
});
