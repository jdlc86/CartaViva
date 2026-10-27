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
 await page.route('**/api/v1/customer/session',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'unauthorized'})}));
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
 await expect(page.getByRole('dialog',{name:'QR de mesa'})).toContainText('comprobará identidad');
 await page.screenshot({path:testInfo.outputPath(`client-qr-${testInfo.project.name}.png`),fullPage:true});
 expect([...new Set(apiRequests)].sort()).toEqual(['/api/v1/catalog','/api/v1/customer/session']);
});

test('identity registration uses same-origin HttpOnly session contract without exposing credentials',async({page})=>{
 const bodies:unknown[]=[];
 await page.route('**/api/v1/customer/register',async route=>{
  bodies.push(route.request().postDataJSON());
  await route.fulfill({status:201,contentType:'application/json',headers:{
   'Set-Cookie':'__Secure-sabora_customer=server-only; Path=/api/v1/customer; HttpOnly; Secure; SameSite=Strict'
  },body:JSON.stringify({publicId:'SB-23456789ABCD',alias:'Marina',company:'Sabora QA'})});
 });
 await page.getByRole('button',{name:'Ajustes',exact:true}).click();
 await page.getByLabel('Alias o apodo').fill('Marina');
 await page.getByLabel('Empresa (opcional)').fill('Sabora QA');
 await page.getByRole('button',{name:'Crear identidad segura'}).click();
 await expect(page.getByRole('status')).toContainText('SB-23456789ABCD');
 await expect(page.getByText(/Sesión segura activa/)).toBeVisible();
 expect(bodies).toEqual([{alias:'Marina',company:'Sabora QA'}]);
 expect(await page.evaluate(()=>Object.keys(localStorage).every(key=>!key.toLowerCase().includes('token')))).toBe(true);
});

test('QR V1 deep link is scrubbed before one authenticated visit authorization',async({page})=>{
 const tableId='ca710000-0000-4000-8000-000000000001';
 const token='A'.repeat(43);
 const requests:Array<{url:string;body:unknown}>=[];
 await page.route('**/api/v1/customer/session',route=>route.fulfill({status:200,
  contentType:'application/json',body:JSON.stringify({authenticated:true,
   publicId:'SB-23456789ABCD',alias:'Marina',company:null})}));
 await page.route('**/api/v1/customer/visits',route=>{
  requests.push({url:route.request().url(),body:route.request().postDataJSON()});
  return route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({
   tableId,visitId:'10000000-0000-4000-8000-000000000007',
   basketId:'10000000-0000-4000-8000-000000000008',expiresAt:'2026-10-27T23:00:00.000Z'
  })});
 });
 await page.route('**/api/v1/customer/logout',route=>route.fulfill({status:200,
  contentType:'application/json',body:JSON.stringify({revoked:true})}));
 await page.goto(`/qr/v1/SABORA/${tableId}#${token}`);
 const dialog=page.getByRole('dialog',{name:'QR de mesa'});
 await expect(dialog).toContainText('Mesa verificada');
 expect(new URL(page.url()).pathname).toBe('/');
 expect(new URL(page.url()).hash).toBe('');
 expect(requests).toEqual([{url:'http://127.0.0.1:4179/api/v1/customer/visits',
  body:{tableId,qrToken:token}}]);
 expect(requests[0].url).not.toContain(token);
 expect(await page.evaluate(secret=>({local:Object.values(localStorage).some(value=>value.includes(secret)),
  session:Object.values(sessionStorage).some(value=>value.includes(secret))}),token)).toEqual({local:false,session:false});
 await dialog.getByRole('button',{name:'Cerrar'}).click();
 await page.getByRole('button',{name:'Ajustes',exact:true}).click();
 await page.getByRole('button',{name:'Cerrar sesión'}).click();
 await expect(page.getByRole('status')).toContainText('Sesión cerrada');
 await page.getByRole('button',{name:'QR',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'QR de mesa'})).not.toContainText('Mesa verificada');
 expect(requests).toHaveLength(1);
});

test('QR V1 from another installation is scrubbed and never reaches the visit API',async({page})=>{
 const calls:string[]=[];
 page.on('request',request=>{if(new URL(request.url()).pathname==='/api/v1/customer/visits')calls.push(request.url());});
 const tableId='ca710000-0000-4000-8000-000000000001';
 await page.goto(`/qr/v1/OTHER/${tableId}#${'A'.repeat(43)}`);
 const dialog=page.getByRole('dialog',{name:'QR de mesa'});
 await expect(dialog.getByRole('alert')).toContainText('otra instalación');
 expect(new URL(page.url()).pathname).toBe('/');
 expect(new URL(page.url()).hash).toBe('');
 expect(calls).toEqual([]);
});

test('in-app QR camera decodes locally and stops its media tracks after authorization',async({page})=>{
 const tableId='ca710000-0000-4000-8000-000000000001';
 const token='A'.repeat(43);
 const payload=`http://127.0.0.1:4179/qr/v1/SABORA/${tableId}#${token}`;
 await page.addInitScript(({payload})=>{
  const stream=new MediaStream();
  Object.defineProperty(stream,'getTracks',{value:()=>[{stop:()=>Reflect.set(window,'__qrTrackStopped',true)}]});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>stream}});
  Object.defineProperty(HTMLMediaElement.prototype,'readyState',{configurable:true,get:()=>HTMLMediaElement.HAVE_ENOUGH_DATA});
  Object.defineProperty(HTMLMediaElement.prototype,'play',{configurable:true,value:async()=>{}});
  Reflect.set(window,'BarcodeDetector',class{async detect(){return [{rawValue:payload}];}});
 },{payload});
 await page.route('**/api/v1/customer/session',route=>route.fulfill({status:200,
  contentType:'application/json',body:JSON.stringify({authenticated:true,
   publicId:'SB-23456789ABCD',alias:'Marina',company:null})}));
 await page.route('**/api/v1/customer/visits',route=>route.fulfill({status:201,
  contentType:'application/json',body:JSON.stringify({tableId,
   visitId:'10000000-0000-4000-8000-000000000007',
   basketId:'10000000-0000-4000-8000-000000000008',expiresAt:'2026-10-27T23:00:00.000Z'})}));
 await page.reload();
 await page.getByRole('button',{name:'QR',exact:true}).click();
 await page.getByRole('button',{name:'Escanear QR'}).click();
 await expect(page.getByRole('dialog',{name:'QR de mesa'})).toContainText('Mesa verificada');
 expect(await page.evaluate(()=>Reflect.get(window,'__qrTrackStopped'))).toBe(true);
});

test('closing the QR scanner stops media and ignores a late detector result',async({page})=>{
 const calls:string[]=[];
 page.on('request',request=>{if(new URL(request.url()).pathname==='/api/v1/customer/visits')calls.push(request.url());});
 await page.addInitScript(()=>{
  const stream=new MediaStream();
  Object.defineProperty(stream,'getTracks',{value:()=>[{stop:()=>Reflect.set(window,'__qrTrackStopped',true)}]});
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>stream}});
  Object.defineProperty(HTMLMediaElement.prototype,'readyState',{configurable:true,get:()=>HTMLMediaElement.HAVE_ENOUGH_DATA});
  Object.defineProperty(HTMLMediaElement.prototype,'play',{configurable:true,value:async()=>{}});
  Reflect.set(window,'BarcodeDetector',class{async detect(){return new Promise(resolve=>{
   Reflect.set(window,'__resolveQrDetector',()=>resolve([{rawValue:`${location.origin}/qr/v1/SABORA/ca710000-0000-4000-8000-000000000001#${'A'.repeat(43)}`}]))
  });}});
 });
 await page.reload();
 await page.getByRole('button',{name:'QR',exact:true}).click();
 await page.getByRole('button',{name:'Escanear QR'}).click();
 await expect(page.getByRole('status')).toContainText('Apunta al QR');
 await page.getByRole('button',{name:'Cerrar'}).click();
 await expect.poll(()=>page.evaluate(()=>Reflect.get(window,'__qrTrackStopped'))).toBe(true);
 await page.evaluate(()=>{const resolve=Reflect.get(window,'__resolveQrDetector');if(typeof resolve==='function')resolve();});
 await page.waitForTimeout(100);
 expect(calls).toEqual([]);
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
 await expect(dialog.getByRole('button',{name:'Escanear QR'})).toBeFocused();
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
 await other.getByRole('dialog',{name:'Tu selección'}).getByRole('button',{name:/Quitar una unidad de Arroz meloso/}).click();
 await expect(page.getByText('1 platos')).toHaveCount(0);
 await other.close();
});

test('H3 selection review resolves mixed catalog incidents before allowing QR information',async({page})=>{
 const id='11111111-1111-4111-8111-111111111111';
 const sold='22222222-2222-4222-8222-222222222222';
 const removed='33333333-3333-4333-8333-333333333333';
 await page.evaluate(({id,sold,removed})=>localStorage.setItem('sabora.client.selection.v1',JSON.stringify([
  {itemId:id,name:'Arroz meloso',priceCents:100,quantity:2},
  {itemId:sold,name:'Berenjena asada',priceCents:980,quantity:1},
  {itemId:removed,name:'Tarta de limón',priceCents:650,quantity:1}
 ])),{id,sold,removed});
 await page.route('**/api/v1/catalog',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
  catalog[0],{...catalog[1],available:false},catalog[3]
 ])}));
 await page.reload();
 await page.getByRole('button',{name:/Cesta: 4/}).click();
 const dialog=page.getByRole('dialog',{name:'Tu selección'});
 await expect(dialog).toContainText('3 plato(s) requieren una decisión');
 await expect(dialog.getByRole('button',{name:'Pedir en mesa'})).toBeDisabled();
 await dialog.getByRole('button',{name:'Aceptar nuevo precio'}).click();
 await expect(dialog).toContainText('2 plato(s) requieren una decisión');
 await dialog.getByRole('button',{name:'Retirar de la cesta'}).first().click();
 await dialog.getByRole('button',{name:'Retirar de la cesta'}).click();
 await expect(dialog.getByRole('button',{name:'Pedir en mesa'})).toBeEnabled();
 await dialog.getByRole('button',{name:'Pedir en mesa'}).click();
 await expect(page.getByRole('dialog',{name:'QR de mesa'})).toContainText('comprobará identidad');
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sabora.client.selection.v1')||'[]'));
 expect(saved).toEqual([{itemId:id,name:'Arroz meloso',priceCents:1290,quantity:2}]);
});
