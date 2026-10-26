import React from 'react';
import {createRoot} from 'react-dom/client';
import {SaboraClientApp} from './App';
import {registerClientServiceWorker} from './pwa';
import './style.css';

const root=document.getElementById('root');
if(!root)throw Error('missing_client_root');
createRoot(root).render(<React.StrictMode><SaboraClientApp/></React.StrictMode>);
registerClientServiceWorker();
