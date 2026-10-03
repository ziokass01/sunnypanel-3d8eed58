import { createRoot } from 'react-dom/client';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import './index.css';
// Register before loading App so a stale chunk cannot leave an empty page.
window.addEventListener('vite:preloadError',event=>{
 const root=document.getElementById('root');
 if(root&&!root.dataset.ready){event.preventDefault();window.dispatchEvent(new CustomEvent('sunny:boot-error',{detail:'ASSET_LOAD'}));}
});
import('./App.tsx').then(({default:App})=>{
 const root=document.getElementById('root');
 if(!root)throw Error('ROOT_MISSING');
 createRoot(root).render(<AppErrorBoundary><App/></AppErrorBoundary>);
}).catch(error=>window.dispatchEvent(new CustomEvent('sunny:boot-error',{detail:error?.message==='APP_CONFIG'?'APP_CONFIG':'APP_LOAD'})));
