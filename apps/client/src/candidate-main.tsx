import React from 'react';
import {createRoot} from 'react-dom/client';
import {SaboraClientApp} from './App';
import {consumeInitialTableQr} from './table-qr';
import './style.css';

// Explicit, non-production entry used only by the isolated H3/H4 acceptance.
// It deliberately omits payment fields because this candidate does not mount
// H6 or a provider. The normal PWA entry continues to use the H6 contract.
const root=document.getElementById('root');
if(!root)throw Error('missing_client_root');
createRoot(root).render(<React.StrictMode><SaboraClientApp
  initialTableQr={consumeInitialTableQr()} flowContract="h3-candidate"/>
</React.StrictMode>);
