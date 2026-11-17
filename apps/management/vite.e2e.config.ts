import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
 plugins:[react()],
 build:{outDir:'dist-e2e',emptyOutDir:true,
  rollupOptions:{input:fileURLToPath(new URL('./e2e/cash.html',import.meta.url))}}
});
