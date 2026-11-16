import { supabase } from '../../config/supabase.js';

export async function initFinanceModule() {
  console.log('Módulo Financeiro ativado.');
  await loadPayments();
}

// Função para listar todos os pagamentos e status
async function loadPayments() {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        reservations (
          total_amount,
          status,
          clients (name, phone)
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log('Pagamentos carregados:', data);
    return data;
  } catch (error) {
    console.error('Erro ao carregar pagamentos:', error.message);
  }
}

// Função para registrar manualmente um pagamento (ex: PIX fora da plataforma ou Dinheiro)
export async function registerManualPayment(reservationId, amount, paymentMethod) {
  try {
    const { data, error } = await supabase
      .from('payments')
      .insert([{
        reservation_id: reservationId,
        amount: amount,
        payment_method: paymentMethod,
        status: 'aprovado'
      }]);

    if (error) throw error;

    // Atualiza o status da reserva para pagamento confirmado
    const { error: updateError } = await supabase
      .from('reservations')
      .update({ status: 'pagamento_confirmado' })
      .eq('id', reservationId);

    if (updateError) throw updateError;

    alert('Pagamento registrado e reserva atualizada com sucesso!');
    loadPayments();
  } catch (error) {
    console.error('Erro ao registrar pagamento:', error.message);
    alert('Erro ao registrar o pagamento.');
  }
}