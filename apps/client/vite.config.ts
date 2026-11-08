import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const testTarget=process.env.GITHUB_ACTIONS==='true'&&
 /^http:\/\/127\.0\.0\.1:[0-9]{1,5}$/.test(process.env.SABORA_CI_COMMS_API??'')?
 process.env.SABORA_CI_COMMS_API:null;
export default defineConfig(({mode})=>({
 ...(mode==='test'&&testTarget?{server:{proxy:{'/api':testTarget}}}:{}),
 plugins:[react()],
 // Deterministic non-secret installation code for browser acceptance only.
 // Production builds remain fail-closed until their audited code is supplied.
 ...(mode==='test'?{define:{'import.meta.env.VITE_SABORA_RESTAURANT_CODE':JSON.stringify('SABORA')}}:{})
}));
