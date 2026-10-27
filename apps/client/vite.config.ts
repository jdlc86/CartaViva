import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>({
 plugins:[react()],
 // Deterministic non-secret installation code for browser acceptance only.
 // Production builds remain fail-closed until their audited code is supplied.
 ...(mode==='test'?{define:{'import.meta.env.VITE_SABORA_RESTAURANT_CODE':JSON.stringify('SABORA')}}:{})
}));
