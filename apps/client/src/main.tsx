import React from 'react';
import {createRoot} from 'react-dom/client';
import {SaboraClientApp} from './App';
import {registerClientServiceWorker} from './pwa';
import {consumeInitialTableQr} from './table-qr';
import './style.css';

const root=document.getElementById('root');
if(!root)throw Error('missing_client_root');
const initialTableQr=consumeInitialTableQr();
// Keep the old H6 production QR flow intact while B3 remains NO-GO.
 // The new warning is enabled only by the disposable PG17 acceptance harness.
const b3VerifiedTest=import.meta.env.MODE==='test'&&
 import.meta.env.VITE_SABORA_ENABLE_B3_TABLE_CHANGE==='isolated_pg17';
createRoot(root).render(<React.StrictMode><SaboraClientApp
 initialTableQr={initialTableQr} enableTableChangeFlow={b3VerifiedTest}/></React.StrictMode>);
registerClientServiceWorker();
