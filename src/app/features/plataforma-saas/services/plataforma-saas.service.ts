import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface Empresa { id:number; razon_social:string; nombre_comercial:string; slug:string; nit?:string; estado:boolean; }
export interface Plan { id:number; codigo:string; nombre:string; descripcion?:string; max_sucursales_activas:number; estado:boolean; permite_productos:boolean; permite_ventas:boolean; permite_reservas:boolean; permite_offline:boolean; permite_reportes_convencionales:boolean; permite_reportes_ia:boolean; }
export interface Suscripcion { id:number; empresa_id:number; plan_saas_id:number; fecha_inicio:string; fecha_vencimiento:string; estado:string; observacion?:string; }

@Injectable({providedIn:'root'})
export class PlataformaSaasService {
  private http=inject(HttpClient); private base=environment.apiUrl+'/saas/superadmin';
  private options={withCredentials:true};
  private csrf(): string | null { if(typeof document==='undefined') return null; return document.cookie.split('; ').find(x=>x.startsWith('fashionstore_platform_csrf='))?.split('=')[1] ?? null; }
  private writeOptions(){ const token=this.csrf(); return token ? {withCredentials:true, headers:{'X-CSRF-Token':decodeURIComponent(token)}} : this.options; }
  /** No existe aún un contrato de login web en el backend publicado. */
  login(_correo: string, _password: string) {
    return throwError(() => new Error('La autenticación web de plataforma no está habilitada.'));
  }
  sesionWebDisponible(): boolean { return false; }
  logout(){return of(null);}
  empresas():Observable<Empresa[]>{return this.http.get<Empresa[]>(this.base+'/empresas',this.options);}
  planes():Observable<Plan[]>{return this.http.get<Plan[]>(this.base+'/planes',this.options);}
  crearEmpresa(data:unknown){return this.http.post(this.base+'/empresas',data,this.writeOptions());}
  cambiarEmpresa(id:number,estado:boolean){return this.http.patch(this.base+`/empresas/${id}/estado`,{estado},this.writeOptions());}
  crearPlan(data:unknown){return this.http.post(this.base+'/planes',data,this.writeOptions());}
  cambiarPlan(id:number,estado:boolean){return this.http.patch(this.base+`/planes/${id}/estado`,{estado},this.writeOptions());}
  suscripciones(id:number){return this.http.get<Suscripcion[]>(this.base+`/empresas/${id}/suscripciones`,this.options);}
  asignarSuscripcion(id:number,data:unknown){return this.http.post(this.base+`/empresas/${id}/suscripciones`,data,this.writeOptions());}
  crearAdministrador(id:number,data:unknown){return this.http.post(this.base+`/empresas/${id}/administrador-inicial`,data,this.writeOptions());}
}
