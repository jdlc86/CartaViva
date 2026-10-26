import {test,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const catalog=[
 {id:'11111111-1111-4111-8111-111111111111',name:'Arroz meloso',category:'Primeros',priceCents:1290,available:true,allergens:['Apio']},
 {id:'22222222-2222-4222-8222-222222222222',name:'Berenjena asada',category:'Especiales',priceCents:980,available:true,allergens:['Sésamo']},
 {id:'33333333-3333-4333-8333-333333333333',name:'Tarta de limón',category:'Postres',priceCents:650,available:false,allergens:['Gluten','Huevo']},
 {id:'44444444-4444-4444-8444-444444444444',name:'Agua mineral',category:'Bebidas',priceCents:180,available:true,allergens:[]}
];

test.beforeEach(async({page})=>{
 await page.route('**/api/v1/catalog',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)}));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Nuestra carta'})).toBeVisible();
 await expect(page.getByTestId('product-card')).toHaveCount(4);
});

test('premium client flow keeps dynamic catalog, favorites and selection without privileged calls',async({page},testInfo)=>{
 const apiRequests:string[]=[];
 page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))apiRequests.push(new URL(request.url()).pathname);});
 await expect(page.getByRole('button',{name:'Especiales'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath(`client-home-${testInfo.project.name}.png`),fullPage:true});
 await page.getByRole('button',{name:'Buscar',exact:true}).click();
 const search=page.getByRole('searchbox',{name:'Buscar platos o alérgenos'});
 await expect(search).toBeFocused();
 await search.fill('sesamo');
 await expect(page.getByTestId('product-card')).toHaveCount(1);
 await search.press('Escape');
 await expect(page.getByRole('button',{name:'Buscar',exact:true})).toBeVisible();

 const card=page.getByTestId('product-card').filter({hasText:'Berenjena asada'});
 await card.getByRole('button',{name:/Añadir$/}).click();
 await card.getByRole('button',{name:/Añadir una unidad/}).click();
 await card.getByRole('button',{name:/Añadir a favoritos/}).click();
 await expect(page.getByText('2 platos')).toBeVisible();
 await page.reload();
 await expect(page.getByText('2 platos')).toBeVisible();
 await page.getByRole('button',{name:'Favoritos',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Favoritos'})).toBeVisible();
 await expect(page.getByTestId('product-card')).toHaveCount(1);

 await page.getByRole('button',{name:'QR',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'QR de mesa'})).toContainText('no habilitará el pedido');
 await page.screenshot({path:testInfo.outputPath(`client-qr-${testInfo.project.name}.png`),fullPage:true});
 expect([...new Set(apiRequests)]).toEqual(['/api/v1/catalog']);
});

test('client has no serious accessibility violations in the populated home',async({page},testInfo)=>{
 const result=await new AxeBuilder({page}).analyze();
 await testInfo.attach('axe-report',{body:Buffer.from(JSON.stringify(result,null,2)),contentType:'application/json'});
 const violations=result.violations.filter(item=>item.impact==='serious'||item.impact==='critical');
 expect(violations,violations.map(item=>`${item.id}: ${item.help}`).join('\n')).toEqual([]);
 await page.getByRole('button',{name:'QR',exact:true}).click();
 await page.waitForTimeout(250);
 const dialog=page.getByRole('dialog',{name:'QR de mesa'});
 await expect(dialog.getByRole('button',{name:'Cerrar'})).toBeFocused();
 await page.keyboard.press('Shift+Tab');
 await expect(dialog.getByRole('button',{name:'Cerrar'})).toBeFocused();
 const dialogResult=await new AxeBuilder({page}).include('[role="dialog"]').analyze();
 const dialogViolations=dialogResult.violations.filter(item=>item.impact==='serious'||item.impact==='critical');
 expect(dialogViolations,dialogViolations.map(item=>`${item.id}: ${item.help}`).join('\n')).toEqual([]);
});

test('manifest is installable and the shell remains available offline without caching API data',async({page,context})=>{
 const session=await context.newCDPSession(page);
 const {installabilityErrors}=await session.send('Page.getInstallabilityErrors');
 expect(installabilityErrors).toEqual([]);
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
 await page.unroute('**/api/v1/catalog');
 await context.setOffline(true);
 await page.reload();
 await expect(page.getByRole('heading',{name:'Nuestra carta'})).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('No se ha podido cargar la carta');
});

test('approved responsive widths and long English labels do not overflow the page',async({page})=>{
 await page.getByRole('button',{name:'EN',exact:true}).click();
 for(const width of [320,360,390,430,768,1024,1280,1440]){
  await page.setViewportSize({width,height:900});
  await expect(page.getByRole('heading',{name:'Our menu'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),`horizontal overflow at ${width}px`).toBe(true);
 }
});

test('sold-out products remain visible and cannot be added',async({page})=>{
 await page.getByRole('button',{name:'Postres'}).click();
 const soldOut=page.getByTestId('product-card').filter({hasText:'Tarta de limón'});
 await expect(soldOut).toContainText('Agotado');
 await expect(soldOut.getByRole('button',{name:'No disponible'})).toBeDisabled();
});

test('reduced motion removes nonessential transitions and animations',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 const values=await page.getByTestId('product-card').first().evaluate(element=>{
  const card=getComputedStyle(element);
  const spinner=document.querySelector('.loading-state > span');
  return {transition:card.transitionDuration,animation:spinner?getComputedStyle(spinner).animationName:'none'};
 });
 expect(values.transition).toBe('0s');
 expect(values.animation).toBe('none');
});

test('basket changes propagate between open tabs without API polling',async({page,context})=>{
 const other=await context.newPage();
 await other.route('**/api/v1/catalog',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(catalog)}));
 await other.goto('/');
 await expect(other.getByTestId('product-card')).toHaveCount(4);
 const card=page.getByTestId('product-card').filter({hasText:'Arroz meloso'});
 await card.getByRole('button',{name:/Añadir$/}).click();
 await expect(other.getByText('1 platos')).toBeVisible();
 await other.getByRole('button',{name:/Cesta: 1/}).click();
 await expect(other.getByRole('dialog',{name:'Tu selección'})).toContainText('Arroz meloso');
 await other.getByRole('button',{name:/Quitar una unidad de Arroz meloso/}).click();
 await expect(page.getByText('1 platos')).toHaveCount(0);
 await other.close();
});
