import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PlataformaSaasService } from '../services/plataforma-saas.service';
@Component({standalone:true,imports:[CommonModule,ReactiveFormsModule],templateUrl:'./login.page.html',styleUrl:'./plataforma.css'})
export class PlataformaLoginPage {
  private fb=inject(FormBuilder); private api=inject(PlataformaSaasService); private router=inject(Router);
  loading=false; error='';
  form=this.fb.nonNullable.group({usuario:['',[Validators.required,Validators.email]],password:['',[Validators.required,Validators.minLength(8)]]});
  submit(){
    if(this.form.invalid){this.form.markAllAsTouched();return;}
    this.loading=true; this.error=''; const {usuario,password}=this.form.getRawValue();
    this.api.login(usuario,password).subscribe({next:()=>this.router.navigateByUrl('/plataforma'),error:e=>{
      this.loading=false; this.error=e.status===429?'Demasiados intentos. Intenta nuevamente más tarde.':e.status===503?'El acceso de plataforma no está habilitado en este entorno.':'Usuario o contraseña inválidos.';
    }});
  }
}
