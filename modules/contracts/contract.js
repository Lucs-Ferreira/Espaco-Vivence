import { supabase } from '../../config/supabase.js';

export async function initContractsModule() {
  console.log('Módulo de Contratos ativado.');
  await loadContracts();
}

// Função para listar os contratos gerados
async function loadContracts() {
  try {
    const { data, error } = await supabase
      .from('contracts')
      .select(`
        *,
        reservations (
          total_amount,
          clients (name, document)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log('Contratos carregados:', data);
    return data;
  } catch (error) {
    console.error('Erro ao carregar contratos:', error.message);
  }
}

// Função para gerar o contrato vinculado a uma reserva
export async function generateContract(reservationId, modelId) {
  try {
    // 1. Buscar dados da reserva e do cliente para preencher o contrato
    const { data: reservation, error: resError } = await supabase
      .from('reservations')
      .select(`
        *,
        clients (*),
        spaces (name, address)
      `)
      .eq('id', reservationId)
      .single();

    if (resError) throw resError;

    // 2. Inserir o registro do contrato gerado
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert([{
        reservation_id: reservationId,
        status: 'pendente_assinatura',
        content_snapshot: `Contrato de Locação referente à reserva ${reservation.id} para o cliente ${reservation.clients.name}. Valor total: R$ ${reservation.total_amount}`
      }])
      .select()
      .single();

    if (contractError) throw contractError;

    alert('Contrato gerado com sucesso! Pronto para envio.');
    return contract;
  } catch (error) {
    console.error('Erro ao gerar contrato:', error.message);
    alert('Erro ao gerar o contrato.');
  }
}