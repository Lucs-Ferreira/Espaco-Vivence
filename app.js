import { supabase } from './config/supabase.js';
import { initSpacesModule } from './modules/spaces/space.js';
import { initToysModule } from './modules/toys/toy.js';
import { initReservationsModule } from './modules/reservations/reservation.js';
import { initFinanceModule } from './modules/finance/finance.js';
import { initContractsModule } from './modules/contracts/contract.js';
import { initClientPortal } from './modules/portal/client-portal.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Sistema de Gestão de Locações iniciado.');

  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session && window.location.pathname.includes('/admin')) {
    window.location.href = '/login';
    return;
  }

  const currentModule = document.body.dataset.module;

  switch (currentModule) {
    case 'spaces':
      initSpacesModule();
      break;
    case 'toys':
      initToysModule();
      break;
    case 'reservations':
      initReservationsModule();
      break;
    case 'finance':
      initFinanceModule();
      break;
    case 'contracts':
      initContractsModule();
      break;
    case 'portal':
      initClientPortal();
      break;
    default:
      console.log('Página padrão carregada.');
  }
});