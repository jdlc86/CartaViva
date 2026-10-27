import React from 'react';
import {createRoot} from 'react-dom/client';
import {SaboraClientApp} from './App';
import {registerClientServiceWorker} from './pwa';
import {consumeInitialTableQr} from './table-qr';
import './style.css';

const root=document.getElementById('root');
if(!root)throw Error('missing_client_root');
const initialTableQr=consumeInitialTableQr();
createRoot(root).render(<React.StrictMode><SaboraClientApp initialTableQr={initialTableQr}/></React.StrictMode>);
registerClientServiceWorker();
