import {expect,test} from '@playwright/test';
import {createServer,type Server} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

let server:Server;
const root=resolve(fileURLToPath(new URL('../dist-e2e/',import.meta.url)));
test.beforeAll(async()=>{
 server=createServer(async(request,response)=>{
  try{
   const url=new URL(request.url??'/','http://127.0.0.1:4180');
   const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'e2e/cash.html';
   const target=resolve(root,relative);
   if(!target.startsWith(root+sep)){response.writeHead(403);response.end();return;}
   const body=await readFile(target);
   const type=extname(target)==='.html'?'text/html; charset=utf-8':
    extname(target)==='.js'?'text/javascript; charset=utf-8':
    extname(target)==='.css'?'text/css; charset=utf-8':'application/octet-stream';
   response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});response.end(body);
  }catch{response.writeHead(404);response.end();}
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(4180,'127.0.0.1',resolve);});
});
test.afterAll(async()=>{
 server.closeAllConnections();
 await new Promise<void>(resolve=>server.close(()=>resolve()));
});

test('la PWA de gestión verifica externo y cierra cuenta/mesa sin inventar dinero',async({page})=>{
 await page.goto('/e2e/cash.html');
 await expect(page.getByRole('heading',{name:'Consumo y cierre operativo'})).toBeVisible();
 await expect(page.getByText('Consumo bruto',{exact:true})).toBeVisible();
 await expect(page.getByText('Cancelaciones',{exact:true})).toBeVisible();
 await expect(page.getByText('Stripe acreditado neto',{exact:true})).toBeVisible();
 await expect(page.getByText('EXTERNO PENDIENTE',{exact:true})).toBeVisible();
 await expect(page.getByText(/cobro en efectivo/i)).toHaveCount(0);

 const verify=page.getByRole('button',{name:'Verificar y liberar operativamente'});
 await expect(verify).toBeDisabled();
 await page.getByLabel(/He comprobado físicamente/).check();
 await expect(verify).toBeEnabled();
 await verify.click();
 await expect(page.getByText(/Verificación externa registrada/)).toBeVisible();
 await expect(page.getByRole('list',{name:'Liquidaciones de Marina'}).getByText('EXTERNO VERIFICADO',{exact:true})).toBeVisible();
 await expect(page.getByRole('list',{name:'Liquidaciones de Lucía'}).getByText('STRIPE · DEVOLUCIÓN PARCIAL',{exact:true})).toBeVisible();
 await expect(page.getByRole('list',{name:'Liquidaciones de Lucía'}).getByText('EXTERNO VERIFICADO',{exact:true})).toBeVisible();

 const lucia=page.getByRole('listitem').filter({hasText:'Lucía'});
 const closeAccount=lucia.getByRole('button',{name:'Cerrar cuenta operativamente'});
 await expect(closeAccount).toBeDisabled();
 await lucia.getByLabel(/He comprobado el estado del canal/).check();
 await closeAccount.click();
 await expect(page.getByText(/Cuenta cerrada operativamente/)).toBeVisible();

 const closeTable=page.getByRole('button',{name:'Cerrar mesa operativamente'});
 await expect(closeTable).toBeDisabled();
 await page.getByLabel(/todas las cuentas de esta sesión/).check();
 await closeTable.click();
 await expect(page.getByText(/Mesa cerrada operativamente/)).toBeVisible();
 const calls=await page.evaluate(()=>(window as unknown as {__economicCalls:Record<string,number>}).__economicCalls);
 expect(calls).toEqual({verify:1,closeAccount:1,closeTable:1});
});
