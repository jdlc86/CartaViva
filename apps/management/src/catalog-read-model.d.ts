export type CatalogCategory = 'Bebidas' | 'Primeros' | 'Segundos' | 'Postres';
export type CatalogCategoryFilter = 'Todos' | CatalogCategory;

export type AdminPublishedCatalogItem = Readonly<{
  id: string;
  name: string;
  category: CatalogCategory;
  priceCents: number;
  available: boolean;
  allergens: readonly string[];
}>;

export type AdminPublishedCatalog = Readonly<{
  version: 1;
  scope: 'published';
  items: readonly AdminPublishedCatalogItem[];
}>;

export type AdminPublishedCatalogRequest = Readonly<{
  signal?: AbortSignal;
}>;

export type AdminCatalogGateway = Readonly<{
  listPublished(request: AdminPublishedCatalogRequest): Promise<unknown>;
}>;

export const CATALOG_CATEGORIES: readonly CatalogCategoryFilter[];
export function validateAdminPublishedCatalog(payload: unknown): AdminPublishedCatalog;
export function loadAdminPublishedCatalog(
  gateway: AdminCatalogGateway,
  request?: AdminPublishedCatalogRequest,
): Promise<AdminPublishedCatalog>;
export function searchAdminPublishedCatalog(
  items: readonly AdminPublishedCatalogItem[],
  filters?: Readonly<{category?: CatalogCategoryFilter; query?: string}>,
): readonly AdminPublishedCatalogItem[];
export function formatCatalogPrice(priceCents: number): string;
