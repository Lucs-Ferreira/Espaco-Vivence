'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../config/supabase';

const statusLabels = {
  solicitacao_recebida: 'Solicitação recebida',
  aguardando_pagamento: 'Aguardando pagamento',
  pagamento_confirmado: 'Pagamento confirmado',
  aprovado: 'Aprovada',
  pendente_assinatura: 'Pendente assinatura',
  cancelada: 'Cancelada',
};

const statusClasses = {
  solicitacao_recebida: 'badge-vivence-neutral',
  aguardando_pagamento: 'badge-vivence-neutral',
  pagamento_confirmado: 'badge-vivence-success',
  aprovado: 'badge-vivence-success',
  pendente_assinatura: 'badge-vivence-neutral',
  cancelada: 'badge-vivence-error',
};

const filters = [
  { value: 'todas', label: 'Todas' },
  { value: 'solicitacao_recebida', label: 'Solicitações' },
  { value: 'aguardando_pagamento', label: 'Aguardando pagamento' },
  { value: 'pagamento_confirmado', label: 'Confirmadas' },
];

const inactiveReservationStatuses = new Set([
  'cancelada',
  'cancelado',
  'rejeitada',
  'rejeitado',
]);

function getLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseReservationDate(value) {
  if (typeof value !== 'string') return null;

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  const brazilianMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  const match = isoMatch
    ? [isoMatch[0], isoMatch[1], isoMatch[2], isoMatch[3]]
    : brazilianMatch
      ? [brazilianMatch[0], brazilianMatch[3], brazilianMatch[2], brazilianMatch[1]]
      : null;

  if (!match) return null;

  const [, yearValue, monthValue, dayValue] = match;
  const year = Number(yearValue);
  const month = Number(monthValue);
  const day = Number(dayValue);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }

  return {
    key: `${yearValue}-${monthValue}-${dayValue}`,
    date,
  };
}

function formatDate(dateValue) {
  const parsedDate = parseReservationDate(dateValue);
  return parsedDate ? parsedDate.date.toLocaleDateString('pt-BR') : 'Data não informada';
}

function formatReservationDate(reservation) {
  const start = parseReservationDate(reservation.start_date);
  const end = parseReservationDate(reservation.end_date);
  if (!start) return 'Data não informada';
  if (!end || end.key === start.key) {
    return formatDate(start.key);
  }
  return `${formatDate(start.key)} a ${formatDate(end.key)}`;
}

function getReservationToySummary(reservation) {
  return (reservation.reservation_toys || [])
    .map((item) => `${item.toys?.name || 'Brinquedo'} × ${item.quantity}`)
    .join(', ') || 'Nenhum brinquedo';
}

function getReservationTime(reservation) {
  if (!reservation.start_time) return 'Horário não informado';
  const start = reservation.start_time.slice(0, 5);
  const end = reservation.end_time ? reservation.end_time.slice(0, 5) : null;
  return end ? `${start} às ${end}` : start;
}

function getReservationStatus(reservation) {
  return statusLabels[reservation.status] || reservation.status || 'Sem status';
}

export default function ReservationsAgenda() {
  const today = new Date();
  const [reservations, setReservations] = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [statusFilter, setStatusFilter] = useState('todas');
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(getLocalDateString(today));
  const [selectedMonth, setSelectedMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );

  useEffect(() => {
    let active = true;

    async function fetchReservations() {
      setLoading(true);
      setErrorMessage('');

      try {
        const { data, error } = await supabase
          .from('reservations')
          .select('*, clients(name, phone, email), spaces(name), reservation_toys(quantity, toys(name))')
          .order('start_date', { ascending: true });

        if (error) throw error;
        if (active) setReservations(data || []);
      } catch (error) {
        console.error('Erro ao carregar reservas:', error);
        if (active) {
          setErrorMessage(
            'Não foi possível carregar as reservas. Confira se o SQL da agenda foi aplicado e se a sessão tem permissão de administrador.',
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    fetchReservations();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  function loadReservations() {
    setReloadKey((current) => current + 1);
  }

  const reservationsByDate = useMemo(() => {
    const groups = {};
    const monthStart = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1);
    const monthEnd = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);

    reservations.forEach((reservation) => {
      if (inactiveReservationStatuses.has(String(reservation.status || '').toLowerCase())) return;

      const start = parseReservationDate(reservation.start_date);
      const end = parseReservationDate(reservation.end_date) || start;
      if (!start || !end || end.date < start.date) return;

      const current = new Date(Math.max(start.date.getTime(), monthStart.getTime()));
      const lastDay = Math.min(end.date.getTime(), monthEnd.getTime());
      if (current.getTime() > lastDay) return;

      while (current.getTime() <= lastDay) {
        const date = getLocalDateString(current);
        groups[date] = groups[date] || [];
        groups[date].push(reservation);
        current.setDate(current.getDate() + 1);
      }
    });

    return groups;
  }, [reservations, selectedMonth]);

  const visibleReservations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR');

    return reservations.filter((reservation) => {
      const matchesStatus = statusFilter === 'todas' || reservation.status === statusFilter;
      const matchesSearch =
        !query ||
        [
          reservation.clients?.name,
          reservation.clients?.phone,
          reservation.clients?.email,
          reservation.spaces?.name,
          reservation.status,
          reservation.delivery_address,
          ...((reservation.reservation_toys || []).map((item) => item.toys?.name)),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase('pt-BR').includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [reservations, search, statusFilter]);

  const calendarDays = useMemo(() => {
    const offset = new Date(
      selectedMonth.getFullYear(),
      selectedMonth.getMonth(),
      1,
    ).getDay();
    const daysInMonth = new Date(
      selectedMonth.getFullYear(),
      selectedMonth.getMonth() + 1,
      0,
    ).getDate();

    return [
      ...Array(offset).fill(null),
      ...Array.from({ length: daysInMonth }, (_, index) => {
        const day = new Date(
          selectedMonth.getFullYear(),
          selectedMonth.getMonth(),
          index + 1,
        );
        return { day: index + 1, date: getLocalDateString(day) };
      }),
    ];
  }, [selectedMonth]);

  const monthLabel = selectedMonth.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });

  const selectedDayReservations = reservationsByDate[selectedDate] || [];
  const pendingCount = reservations.filter(
    (reservation) => reservation.status === 'solicitacao_recebida',
  ).length;
  const monthStart = getLocalDateString(
    new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), 1),
  );
  const monthEnd = getLocalDateString(
    new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0),
  );
  const monthCount = reservations.filter((reservation) => {
    if (inactiveReservationStatuses.has(String(reservation.status || '').toLowerCase())) return false;
    const start = parseReservationDate(reservation.start_date)?.key;
    const end = parseReservationDate(reservation.end_date)?.key || start;
    return Boolean(start && end && start <= monthEnd && end >= monthStart);
  }).length;
  const todayDate = getLocalDateString(today);

  function changeMonth(amount) {
    const nextMonth = new Date(
      selectedMonth.getFullYear(),
      selectedMonth.getMonth() + amount,
      1,
    );
    setSelectedMonth(nextMonth);
    setSelectedDate(getLocalDateString(nextMonth));
  }

  async function approveReservation(reservation) {
    setUpdatingId(reservation.id);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const { data, error } = await supabase
        .from('reservations')
        .update({ status: 'aguardando_pagamento' })
        .eq('id', reservation.id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('A reserva não foi atualizada. Verifique a permissão de administrador.');

      setReservations((current) =>
        current.map((item) =>
          item.id === reservation.id
            ? { ...item, status: 'aguardando_pagamento' }
            : item,
        ),
      );
      setSuccessMessage('Solicitação aprovada. A reserva está aguardando pagamento.');
    } catch (error) {
      console.error('Erro ao aprovar solicitação:', error);
      setErrorMessage('Não foi possível aprovar a solicitação. Confira a permissão no Supabase.');
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section aria-labelledby="reservations-title">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
        <div>
          <h2 id="reservations-title" className="h4 fw-bold text-vivence-dark mb-1">
            Reservas e Agenda
          </h2>
          <p className="text-vivence-body mb-0">
            Acompanhe solicitações de espaços, brinquedos e serviços por data.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-vivence-outline"
          onClick={loadReservations}
          disabled={loading}
        >
          <i className={`fa-solid ${loading ? 'fa-spinner fa-spin' : 'fa-rotate'} me-2`}></i>
          Atualizar
        </button>
      </div>

      {errorMessage && (
        <div className="alert alert-danger" role="alert">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="alert alert-success" role="status">
          {successMessage}
        </div>
      )}

      <div className="row g-3 mb-4">
        <div className="col-12 col-md-6">
          <div className="card-vivence p-3 d-flex align-items-center gap-3 h-100">
            <div className="rounded-3 p-3 bg-vivence-brown">
              <i className="fa-solid fa-inbox fs-5"></i>
            </div>
            <div>
              <small className="text-vivence-body d-block">Solicitações pendentes</small>
              <strong className="fs-4 text-vivence-dark">{pendingCount}</strong>
            </div>
          </div>
        </div>
        <div className="col-12 col-md-6">
          <div className="card-vivence p-3 d-flex align-items-center gap-3 h-100">
            <div className="rounded-3 p-3 bg-vivence-primary">
              <i className="fa-solid fa-calendar-days fs-5"></i>
            </div>
            <div>
              <small className="text-vivence-body d-block">Reservas neste mês</small>
              <strong className="fs-4 text-vivence-dark">{monthCount}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-xl-7">
          <div className="card-vivence p-3 p-md-4 h-100">
            <div className="reservation-calendar-header mb-3">
              <div>
                <span className="reservation-calendar-eyebrow">Agenda mensal</span>
                <h3 className="reservation-calendar-month text-capitalize fw-bold mb-0">{monthLabel}</h3>
              </div>
              <div className="reservation-calendar-navigation">
              <button
                type="button"
                className="reservation-calendar-nav"
                onClick={() => changeMonth(-1)}
                aria-label="Mês anterior"
              >
                <i className="fa-solid fa-chevron-left"></i>
              </button>
              <button
                type="button"
                className="reservation-calendar-nav"
                onClick={() => changeMonth(1)}
                aria-label="Próximo mês"
              >
                <i className="fa-solid fa-chevron-right"></i>
              </button>
              </div>
            </div>

            <div className="reservation-calendar-grid" role="grid" aria-label={`Agenda de ${monthLabel}`}>
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, index) => (
                <div key={`${day}-${index}`} className="reservation-calendar-weekday" role="columnheader">
                  {day}
                </div>
              ))}
              {calendarDays.map((calendarDay, index) => {
                if (!calendarDay) {
                  return (
                    <span
                      key={`empty-${index}`}
                      className="reservation-calendar-empty"
                      aria-hidden="true"
                    ></span>
                  );
                }

                const dayReservations = reservationsByDate[calendarDay.date] || [];
                const isSelected = selectedDate === calendarDay.date;
                const isToday = todayDate === calendarDay.date;
                return (
                  <button
                    key={calendarDay.date}
                    type="button"
                    className={`reservation-calendar-day ${
                      dayReservations.length > 0 ? 'has-reservation' : ''
                    } ${isSelected ? 'selected' : ''} ${isToday ? 'is-today' : ''}`}
                    onClick={() => setSelectedDate(calendarDay.date)}
                    aria-label={`${calendarDay.day} de ${monthLabel}, ${
                      dayReservations.length === 1
                        ? '1 reserva'
                        : `${dayReservations.length} reservas`
                    }${isToday ? ', hoje' : ''}`}
                    aria-pressed={isSelected}
                  >
                    <span className="reservation-calendar-day-number">{calendarDay.day}</span>
                    {dayReservations.length > 0 && (
                      <span className="reservation-calendar-count" aria-hidden="true">
                        {dayReservations.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="reservation-calendar-legend-label small text-vivence-body mt-3">
              <span className="reservation-calendar-legend-mark has-reservation" aria-hidden="true"></span>
              <span>Dias com reserva</span>
              <span className="reservation-calendar-legend-mark is-today" aria-hidden="true"></span>
              <span>Hoje</span>
            </div>

            <div className="mt-4">
              <h4 className="h6 fw-bold text-vivence-dark mb-3">
                Agenda de {formatDate(selectedDate)}
              </h4>
              {loading ? (
                <p className="text-vivence-body mb-0">Carregando agenda...</p>
              ) : selectedDayReservations.length === 0 ? (
                <p className="text-vivence-body mb-0">Nenhuma reserva nesta data.</p>
              ) : (
                <div className="d-grid gap-2">
                  {selectedDayReservations.map((reservation) => (
                    <div key={reservation.id} className="reservation-agenda-item">
                      <strong className="text-vivence-dark">
                        {getReservationTime(reservation)}
                      </strong>
                      <span>{reservation.clients?.name || 'Cliente sem nome'}</span>
                      <small className="text-vivence-body">
                        Data: {formatReservationDate(reservation)}
                      </small>
                      <small className="text-vivence-body">
                        {reservation.spaces?.name || 'Locação somente de brinquedos'}
                      </small>
                      {reservation.reservation_toys?.length > 0 && (
                        <small className="text-vivence-body">
                          Brinquedos: {getReservationToySummary(reservation)}
                        </small>
                      )}
                      <small className="text-vivence-body">
                        Monitor: {reservation.monitor_required
                          ? `Solicitado (R$ ${Number(reservation.monitor_daily_rate || 0).toFixed(2)}/dia)`
                          : 'Não solicitado'}
                      </small>
                      {reservation.delivery_address && (
                        <small className="text-vivence-body">Endereço: {reservation.delivery_address}</small>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-5">
          <div className="card-vivence p-3 p-md-4 h-100">
            <h3 className="h5 fw-bold text-vivence-dark mb-3">Resumo do período</h3>
            <p className="text-vivence-body">
              {loading
                ? 'Carregando reservas...'
                : `${monthCount} reserva(s) com data informada em ${monthLabel}.`}
            </p>
            <div className="d-flex align-items-center gap-2 text-vivence-body small">
              <i className="fa-solid fa-circle-info text-vivence-primary"></i>
              Reservas sem data inicial aparecem na lista, mas não no calendário.
            </div>
          </div>
        </div>
      </div>

      <div className="card-vivence p-3 p-md-4">
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
          <h3 className="h5 fw-bold text-vivence-dark mb-0">Solicitações e reservas</h3>
          <span className="small text-vivence-body">
            {visibleReservations.length} registro(s)
          </span>
        </div>

        <div className="row g-2 mb-3">
          <div className="col-12 col-lg-5">
            <label htmlFor="reservation-search" className="visually-hidden">
              Buscar reservas
            </label>
            <div className="input-group">
              <span className="input-group-text bg-vivence-subtle border-0">
                <i className="fa-solid fa-magnifying-glass"></i>
              </span>
              <input
                id="reservation-search"
                type="search"
                className="form-control input-vivence"
                placeholder="Buscar cliente, espaço, brinquedo ou endereço"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          <div className="col-12 col-lg-7 d-flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.value}
                type="button"
                className={`btn btn-sm ${
                  statusFilter === filter.value
                    ? 'btn-vivence-primary'
                    : 'btn-vivence-outline bg-vivence-card'
                }`}
                onClick={() => setStatusFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-4 text-vivence-body">
            <i className="fa-solid fa-spinner fa-spin me-2"></i>
            Carregando reservas...
          </div>
        ) : visibleReservations.length === 0 ? (
          <div className="text-center py-5 text-vivence-body">
            <i className="fa-regular fa-calendar-xmark fs-1 mb-2 d-block text-vivence-muted"></i>
            {reservations.length === 0
              ? 'Nenhuma reserva encontrada.'
              : 'Nenhuma reserva corresponde à busca.'}
          </div>
        ) : (
          <div className="table-responsive reservation-table-responsive">
            <table className="table align-middle mb-0 reservation-table">
              <thead>
                <tr>
                  <th scope="col">Data e horário</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Locação</th>
                  <th scope="col">Resumo do pedido</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-end">Ação</th>
                </tr>
              </thead>
              <tbody>
                {visibleReservations.map((reservation) => (
                  <tr key={reservation.id}>
                    <td
                      className="reservation-table-cell-date"
                      data-label="Data e horário"
                    >
                      <strong className="d-block text-vivence-dark">
                        {formatReservationDate(reservation)}
                      </strong>
                      <small className="text-vivence-body">
                        {getReservationTime(reservation)}
                      </small>
                    </td>
                    <td
                      className="reservation-table-cell-client"
                      data-label="Cliente"
                    >
                      <strong className="d-block text-vivence-dark">
                        {reservation.clients?.name || 'Cliente sem nome'}
                      </strong>
                      {reservation.clients?.phone && (
                        <small className="text-vivence-body">
                          {reservation.clients.phone}
                        </small>
                      )}
                    </td>
                    <td
                      className="reservation-table-cell-location"
                      data-label="Locação"
                    >
                      {reservation.spaces?.name || 'Somente brinquedos'}
                    </td>
                    <td
                      className="reservation-table-cell-summary"
                      data-label="Resumo do pedido"
                    >
                      <div className="reservation-table-summary small text-vivence-body">
                        <div>Data: {formatReservationDate(reservation)}</div>
                        <div>Brinquedos: {getReservationToySummary(reservation)}</div>
                        <div>
                          Monitor: {reservation.monitor_required
                            ? `Solicitado (R$ ${Number(reservation.monitor_daily_rate || 0).toFixed(2)}/dia)`
                            : 'Não solicitado'}
                        </div>
                        {reservation.delivery_address && <div>{reservation.delivery_address}</div>}
                      </div>
                    </td>
                    <td
                      className="reservation-table-cell-status"
                      data-label="Status"
                    >
                      <span className={`badge rounded-pill ${statusClasses[reservation.status] || 'badge-vivence-neutral'}`}>
                        {getReservationStatus(reservation)}
                      </span>
                    </td>
                    <td
                      className="reservation-table-cell-action text-end"
                      data-label="Ação"
                    >
                      {reservation.status === 'solicitacao_recebida' ? (
                        <button
                          type="button"
                          className="btn btn-vivence-primary btn-sm"
                          onClick={() => approveReservation(reservation)}
                          disabled={updatingId === reservation.id}
                        >
                          {updatingId === reservation.id ? (
                            <i className="fa-solid fa-spinner fa-spin"></i>
                          ) : (
                            <>
                              <i className="fa-solid fa-check me-1"></i>
                              Aprovar
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-vivence-body small">Sem ações</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
