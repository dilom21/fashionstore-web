import { CurrencyPipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';

import { PublicBranch, PublicCompany, PublicProduct } from '../../models/t05-t06.models';
import { SaasT05T06Service } from '../../services/saas-t05-t06.service';

@Component({
  selector: 'app-saas-storefront-page',
  imports: [CurrencyPipe, ReactiveFormsModule],
  templateUrl: './saas-storefront.page.html',
  styleUrl: './saas-storefront.page.css',
})
export class SaasStorefrontPage {
  private readonly api = inject(SaasT05T06Service);
  private readonly destroyRef = inject(DestroyRef);
  readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('empresaSlug') ?? '';
  readonly search = new FormControl('', { nonNullable: true });
  readonly company = signal<PublicCompany | null>(null);
  readonly products = signal<PublicProduct[]>([]);
  readonly branches = signal<PublicBranch[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      catalog: this.api.publicCatalog(this.slug, this.search.value),
      branches: this.api.publicBranches(this.slug),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ catalog, branches }) => {
          this.company.set(catalog.empresa);
          this.products.set(catalog.items);
          this.branches.set(branches.items);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('No fue posible cargar esta tienda. Verifique el enlace e intente nuevamente.');
          this.loading.set(false);
        },
      });
  }
}
