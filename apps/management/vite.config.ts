import {defineConfig,type Plugin} from 'vite';
import react from '@vitejs/plugin-react';

// Use a dedicated origin for customer and staff whenever possible. For
// same-origin testing/hosting, staff MUST be confined to /gestion/.
const base=process.env.SABORA_MANAGEMENT_BASE_PATH??'/';
if(!/^\/(?:[a-z0-9-]+\/)*$/.test(base)||
 (base!=='/'&&base!=='/gestion/'))
 throw Error('invalid_management_pwa_base_path');
function manifestPlugin():Plugin{
 const manifest=JSON.stringify({
  id:base+'sabora-management-app',name:'Sabora — Gestión',
  short_name:'Sabora Gestión',description:'Cocina, sala y administración Sabora',
  lang:'es',start_url:base,scope:base,display:'standalone',
  background_color:'#F8F7F4',theme_color:'#146B57',
  icons:[
   {src:base+'sabora-logo.svg',sizes:'any',type:'image/svg+xml',purpose:'any'}
  ]
 },null,2);
 return {name:'sabora-management-manifest',
  configureServer(server){
   server.middlewares.use((request,response,next)=>{
    if((request.url??'').split('?')[0]!==base+'manifest.webmanifest')
     return next();
    response.setHeader('Content-Type','application/manifest+json; charset=utf-8');
    response.setHeader('Cache-Control','no-store');
    response.end(manifest);
   });
  },
  generateBundle(){
   this.emitFile({type:'asset',fileName:'manifest.webmanifest',source:manifest});
  }
 };
}
export default defineConfig({base,plugins:[react(),manifestPlugin()]});
