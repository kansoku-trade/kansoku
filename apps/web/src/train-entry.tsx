import { createRoot } from 'react-dom/client';
import { TrainerLauncher } from './features/training/TrainerLauncher';
import { trackAppOpened } from './lib/analytics';
import './styles.css';

trackAppOpened('trainer');
createRoot(document.getElementById('root')!).render(<TrainerLauncher />);
