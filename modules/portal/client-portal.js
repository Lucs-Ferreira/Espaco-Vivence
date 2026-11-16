import { supabase } from '../../config/supabase.js';

export async function initClientPortal() {
    console.log('Portal do Cliente ativado.');
    await loadCatalogForClient();
}

// Função para carregar espaços e brinquedos disponíveis para o cliente visualizar
async function loadCatalogForClient() {
    try {
        // 1. Buscar espaços ativos
        const { data: spaces, error: spaceError } = await supabase
            .from('spaces')
            .select('*')
            .eq('status', 'ativo');

        if (spaceError) throw spaceError;

        // 2. Buscar brinquedos disponíveis
        const { data: toys, error: toyError } = await supabase
            .from('toys')
            .select('*')
            .eq('status', 'disponivel');

        if (toyError) throw toyError;

        console.log('Catálogo carregado para o cliente:', { spaces, toys });
        return { spaces, toys };
    } catch (error) {
        console.error('Erro ao carregar o catálogo:', error.message);
    }
}