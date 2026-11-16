import { supabase } from '../../config/supabase.js';

export async function initSpacesModule() {
  console.log('Módulo de Espaços ativado.');
  await loadSpaces();
}

// Função para listar os espaços cadastrados
async function loadSpaces() {
  try {
    const { data, error } = await supabase
      .from('spaces')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;

    console.log('Espaços carregados:', data);
    return data;
  } catch (error) {
    console.error('Erro ao carregar espaços:', error.message);
  }
}

// Função para cadastrar um novo espaço
export async function createSpace(spaceData) {
  try {
    const { data, error } = await supabase
      .from('spaces')
      .insert([spaceData]);

    if (error) throw error;

    alert('Espaço cadastrado com sucesso!');
    loadSpaces();
  } catch (error) {
    console.error('Erro ao cadastrar espaço:', error.message);
    alert('Erro ao salvar o espaço.');
  }
}