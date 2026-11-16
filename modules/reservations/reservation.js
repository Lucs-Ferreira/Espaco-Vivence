import { supabase } from '../../config/supabase.js';

export async function initReservationsModule() {
  console.log('Módulo de Reservas ativado.');
  await loadReservations();
}

// Função para listar todas as reservas e solicitações
async function loadReservations() {
  try {
    const { data, error } = await supabase
      .from('reservations')
      .select(`
        *,
        clients (name, phone, email),
        spaces (name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    console.log('Reservas carregadas:', data);
    return data;
  } catch (error) {
    console.error('Erro ao carregar reservas:', error.message);
  }
}

// Função para o cliente solicitar uma nova reserva pelo Portal
export async function createReservationRequest(reservationData, selectedToys = []) {
  try {
    // 1. Inserir a reserva principal com status inicial
    const { data: reservation, error: resError } = await supabase
      .from('reservations')
      .insert([{
        ...reservationData,
        status: 'solicitacao_recebida'
      }])
      .select()
      .single();

    if (resError) throw resError;

    // 2. Se houver brinquedos selecionados, salvá-los na tabela de itens da reserva
    if (selectedToys.length > 0 && reservation) {
      const toyItems = selectedToys.map(item => ({
        reservation_id: reservation.id,
        toy_id: item.toy_id,
        quantity: item.quantity,
        unit_price: item.unit_price
      }));

      const { error: toysError } = await supabase
        .from('reservation_toys')
        .insert(toyItems);

      if (toysError) throw toysError;
    }

    alert('Solicitação de reserva enviada com sucesso! Aguarde a análise.');
    return reservation;
  } catch (error) {
    console.error('Erro ao solicitar reserva:', error.message);
    alert('Erro ao enviar a solicitação. Tente novamente.');
  }
}

// Função para o proprietário aprovar a solicitação
export async function approveReservation(reservationId) {
  try {
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'aguardando_pagamento' })
      .eq('id', reservationId);

    if (error) throw error;

    alert('Solicitação aprovada! O cliente já pode realizar o pagamento.');
    loadReservations();
  } catch (error) {
    console.error('Erro ao aprovar reserva:', error.message);
    alert('Erro ao aprovar a solicitação.');
  }
}