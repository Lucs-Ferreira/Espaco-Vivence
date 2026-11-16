import { supabase } from '../../config/supabase.js';

export async function initToysModule() {
  console.log('Módulo de Brinquedos ativado.');
  await loadToys();
}

// Função para listar os brinquedos cadastrados e suas categorias
async function loadToys() {
  try {
    const { data, error } = await supabase
      .from('toys')
      .select(`
        *,
        toy_categories (name)
      `)
      .order('name', { ascending: true });

    if (error) throw error;

    console.log('Brinquedos carregados:', data);
    return data;
  } catch (error) {
    console.error('Erro ao carregar brinquedos:', error.message);
  }
}

// Função para cadastrar um novo brinquedo
export async function createToy(toyData) {
  try {
    const { data, error } = await supabase
      .from('toys')
      .insert([toyData]);

    if (error) throw error;

    alert('Brinquedo cadastrado com sucesso!');
    loadToys();
  } catch (error) {
    console.error('Erro ao cadastrar brinquedo:', error.message);
    alert('Erro ao salvar o brinquedo.');
  }
}