import { createRoot } from 'react-dom/client';

function TrainerRoot() {
  return <div className="trainer-placeholder">盲盘训练窗口已就绪，训练局界面尚未接入。</div>;
}

createRoot(document.getElementById('root')!).render(<TrainerRoot />);
