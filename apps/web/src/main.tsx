import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { trackAppOpened } from './lib/analytics';
import { persistOptions, queryClient } from './lib/queryClient';
import { installRouter } from './lib/router';
import './styles.css';

installRouter();
// At module scope rather than in an effect: this counts page loads, and React would double-fire
// it in development's strict mode.
trackAppOpened('main');
createRoot(document.getElementById('root')!).render(
  <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
    <App />
  </PersistQueryClientProvider>,
);
