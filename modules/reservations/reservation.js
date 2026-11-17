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

export async function checkReservationAvailability({
  spaceId,
  startDate,
  endDate,
  selectedToys,
}) {
  const { data, error } = await supabase.rpc('check_reservation_availability', {
    p_space_id: spaceId || null,
    p_start_date: startDate,
    p_end_date: endDate,
    p_toys: selectedToys.map(({ toy_id, quantity }) => ({ toy_id, quantity })),
  });

  if (error) throw error;
  return data;
}

export async function getMonitorDailyRate() {
  const { data, error } = await supabase
    .from('rental_settings')
    .select('monitor_daily_rate')
    .eq('id', 1)
    .single();

  if (error) throw error;
  const rate = Number(data.monitor_daily_rate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error('O valor cadastrado para a diária do monitor é inválido.');
  }
  return rate;
}

export async function createReservationRequest(reservationData, selectedToys = []) {
  const { data, error } = await supabase.rpc('submit_reservation_request', {
    p_client_name: reservationData.client_name,
    p_client_email: reservationData.client_email,
    p_client_phone: reservationData.client_phone,
    p_client_document: reservationData.client_document,
    p_space_id: reservationData.space_id,
    p_start_date: reservationData.start_date,
    p_end_date: reservationData.end_date,
    p_start_time: reservationData.start_time,
    p_notes: reservationData.notes || null,
    p_toys: selectedToys.map(({ toy_id, quantity }) => ({ toy_id, quantity })),
    p_delivery_address: reservationData.delivery_address,
    p_monitor_required: reservationData.monitor_required,
  });

  if (error) throw error;
  return data;
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