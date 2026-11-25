import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/base.css';
import './styles/home.css';
import './styles/room.css';
import './styles/avalon.css';
import './styles/citadels.css';
import './styles/glassworks.css';
import './styles/party.css';
import './styles/street-stall.css';
import './styles/ninja-night.css';
import './styles/grey-tide.css';
import './styles/citadels-pig.css';
import './styles/seven-sins.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
