export type M3CatalogCategory=Readonly<{id:string;name:string;sortOrder:number;mandatory:boolean;hidden:boolean;revision:number}>;
export type M3Allergen=Readonly<{id:number;name:string}>;
export type M3CatalogItem=Readonly<{id:string;categoryId:string|null;draft:Readonly<Record<string,unknown>>;
 draftRevision:number;publishedRevision:number|null;publishedSnapshot:Readonly<Record<string,unknown>>|null;
 publishedAt:string|null;withdrawn:boolean;soldOut:boolean}>;
export type M3ManagementCatalog=Readonly<{version:2;scope:'administrative';categories:readonly M3CatalogCategory[];
 items:readonly M3CatalogItem[];allergenTaxonomyVersion:1;allergens:readonly M3Allergen[];
 permissions:Readonly<{manage:boolean}>}>;
export type M3CatalogGateway=Readonly<{
 readManagementCatalog(request?:Readonly<{signal?:AbortSignal}>):Promise<unknown>;
 manageCatalog(request:Readonly<{requestId:string;operation:string;payload:Readonly<Record<string,unknown>>;signal?:AbortSignal}>):Promise<unknown>;
}>;
export function validateM3ManagementCatalog(payload:unknown):M3ManagementCatalog;
export function loadM3ManagementCatalog(gateway:M3CatalogGateway,options?:Readonly<{signal?:AbortSignal}>):Promise<M3ManagementCatalog>;
export function catalogDraftFromForm(input:Readonly<Record<string,unknown>>):Readonly<Record<string,unknown>>;
