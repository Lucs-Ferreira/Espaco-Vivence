'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '../config/supabase';
import Modal from './Modal';
import {
  checkReservationAvailability,
  createReservationRequest,
  getMonitorDailyRate,
} from '../modules/reservations/reservation';

function getLocalDateValue() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDateForBrazil(dateValue) {
  const [year, month, day] = dateValue.split('-');
  return `${day}/${month}/${year}`;
}

function parseBrazilianDate(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year)
    || date.getMonth() !== Number(month) - 1
    || date.getDate() !== Number(day)
  ) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

const rentalCartStorageKey = 'espaco-vivence-rental-cart';
const rentalCartTtlMs = 7 * 24 * 60 * 60 * 1000;

function getRentalCartExpiration() {
  return Date.now() + rentalCartTtlMs;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function getMissingRequiredColumn(error) {
  const errorText = [error?.message, error?.details].filter(Boolean).join('\n');
  const match = /null value in column "([^"]+)" of relation "([^"]+)"/i.exec(errorText);
  return match ? { column: match[1], table: match[2] } : null;
}

function addErrorReference(message, error) {
  const reference = error?.code || (error?.status > 0 ? `HTTP ${error.status}` : '');
  return reference ? `${message} (código ${reference})` : message;
}

function getReservationErrorMessage(error, action) {
  const code = error?.code;
  const message = typeof error?.message === 'string' ? error.message.trim() : '';

  if (code === 'PGRST202') {
    return addErrorReference(
      'A função de reserva está desatualizada no Supabase. Execute novamente sql/reservation-request.sql.',
      error,
    );
  }

  if (code === '23502') {
    const missingColumn = getMissingRequiredColumn(error);
    if (missingColumn?.table === 'clients' && missingColumn.column === 'document') {
      return addErrorReference(
        'O Supabase ainda está rejeitando o CPF/CNPJ como vazio. Atualize a migração sql/reservation-request.sql.',
        error,
      );
    }
    if (missingColumn) {
      return addErrorReference(
        `O banco informou que falta preencher "${missingColumn.column}" na tabela "${missingColumn.table}".`,
        error,
      );
    }
    return addErrorReference('O banco rejeitou um campo obrigatório. Confira os dados informados.', error);
  }

  if (code === '23505') {
    const constraint = /unique constraint "([^"]+)"/i.exec(message)?.[1];
    if (constraint && /document|cpf/i.test(constraint)) {
      return addErrorReference(
        'O Supabase ainda está tratando o CPF/CNPJ como único. Atualize a migração sql/reservation-request.sql.',
        error,
      );
    }
    return addErrorReference(
      'O banco encontrou um cadastro duplicado. Atualize a migração sql/reservation-request.sql e tente novamente.',
      error,
    );
  }

  if (['22023', 'P0001'].includes(code) && message) {
    return addErrorReference(message, error);
  }

  if (code === '42501' || error?.status === 403) {
    return addErrorReference(
      'O Supabase bloqueou a operação por uma regra de acesso. Confira as permissões do projeto.',
      error,
    );
  }

  if (error?.status === 401) {
    return addErrorReference('A autorização expirou. Atualize a página e tente novamente.', error);
  }

  if (code === '23503') {
    return addErrorReference(
      'Um espaço ou brinquedo do carrinho não está mais disponível. Atualize o catálogo e confira a disponibilidade.',
      error,
    );
  }

  if (['22P02', '23514'].includes(code)) {
    return addErrorReference(
      'Algum dado está em formato inválido. Confira CPF/CNPJ, telefone, datas, horário e endereço.',
      error,
    );
  }

  if (
    error?.name === 'AbortError'
    || error?.status === 0
    || /failed to fetch|network|load failed|timed out|timeout/i.test(message)
  ) {
    return action === 'enviar a solicitação'
      ? 'A conexão caiu durante o envio e não foi possível confirmar o resultado. Confira com a equipe antes de tentar novamente para evitar uma solicitação duplicada.'
      : 'A conexão caiu durante a verificação. Confira a internet e tente novamente.';
  }

  return addErrorReference(
    `Não foi possível ${action}. Confira sua conexão e os dados informados; tente novamente.`,
    error,
  );
}

export default function ClientPortalPage({ cartOnly = false }) {
  const router = useRouter();
  const [spaces, setSpaces] = useState([]);
  const [toys, setToys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [currentYear, setCurrentYear] = useState('');
  const [todayDate, setTodayDate] = useState('');
  const [reservationFormOpen, setReservationFormOpen] = useState(false);
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const [includeToysInSpace, setIncludeToysInSpace] = useState(false);
  const [cartLoaded, setCartLoaded] = useState(false);
  const [cartExpiresAt, setCartExpiresAt] = useState(null);
  const [cartError, setCartError] = useState('');
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [selectedToyQuantities, setSelectedToyQuantities] = useState({});
  const [monitorDailyRate, setMonitorDailyRate] = useState(null);
  const [monitorRequired, setMonitorRequired] = useState(false);
  const [reservationForm, setReservationForm] = useState({
    client_name: '',
    client_email: '',
    client_phone: '',
    client_document: '',
    delivery_street: '',
    delivery_number: '',
    delivery_complement: '',
    delivery_neighborhood: '',
    delivery_city: '',
    delivery_state: '',
    delivery_postal_code: '',
    start_date: '',
    end_date: '',
    start_time: '',
    notes: '',
  });
  const [availability, setAvailability] = useState(null);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [submittingReservation, setSubmittingReservation] = useState(false);
  const [reservationConflict, setReservationConflict] = useState(null);
  const [reservationSubmission, setReservationSubmission] = useState(null);
  const [reservationModalOpen, setReservationModalOpen] = useState(false);
  const [cartConfirmationMessage, setCartConfirmationMessage] = useState('');
  const [catalogError, setCatalogError] = useState('');

  // Guarda qual foto está selecionada em cada card (pelo ID do item)
  const [selectedSpacePhoto, setSelectedSpacePhoto] = useState({});
  const [selectedToyPhoto, setSelectedToyPhoto] = useState({});

  useEffect(() => {
    document.body.dataset.module = 'portal';
    const dateTimer = setTimeout(() => {
      const today = getLocalDateValue();
      setTodayDate(today);
      setCurrentYear(String(new Date().getFullYear()));
      setReservationForm((current) => ({
        ...current,
        start_date: current.start_date || formatDateForBrazil(today),
        end_date: current.end_date || formatDateForBrazil(today),
      }));
    }, 0);

    async function fetchData() {
      try {
        const { data: spacesData, error: spacesError } = await supabase
          .from('spaces')
          .select('*')
          .eq('status', 'ativo');
        if (spacesError) throw spacesError;

        const { data: toysData, error: toysError } = await supabase
          .from('toys')
          .select('*')
          .eq('status', 'disponivel');
        if (toysError) throw toysError;

        const monitorRate = await getMonitorDailyRate();
        setSpaces(spacesData || []);
        setToys(toysData || []);
        setMonitorDailyRate(monitorRate);
      } catch (error) {
        console.error('Erro ao carregar dados do portal:', error);
        setCatalogError(
          'Não foi possível carregar o catálogo e os valores dos serviços. Confira as permissões e execute a migração de reservas no Supabase.',
        );
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    return () => clearTimeout(dateTimer);
  }, []);

  useEffect(() => {
    if (cartOnly) return undefined;

    const confirmationTimer = setTimeout(() => {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.get('solicitacao') !== 'enviada') return;

      setReservationModalOpen(true);
      router.replace('/', { scroll: false });
    }, 0);

    return () => clearTimeout(confirmationTimer);
  }, [cartOnly, router]);

  useEffect(() => {
    const restoreTimer = setTimeout(() => {
      try {
        const savedCart = localStorage.getItem(rentalCartStorageKey);
        if (savedCart) {
          const parsedCart = JSON.parse(savedCart);
          const isValid =
            parsedCart
            && Number.isFinite(parsedCart.expiresAt)
            && parsedCart.expiresAt > Date.now()
            && (typeof parsedCart.spaceId === 'string' || parsedCart.spaceId === null)
            && parsedCart.toyQuantities
            && typeof parsedCart.toyQuantities === 'object'
            && !Array.isArray(parsedCart.toyQuantities);

          if (isValid) {
            const toyQuantities = Object.fromEntries(
              Object.entries(parsedCart.toyQuantities)
                .filter(([, quantity]) => Number.isInteger(quantity) && quantity > 0),
            );
            setSelectedSpaceId(parsedCart.spaceId || '');
            setSelectedToyQuantities(toyQuantities);
            setIncludeToysInSpace(Boolean(parsedCart.includeToysInSpace));
            setMonitorRequired(Boolean(parsedCart.monitorRequired));
            setCartExpiresAt(parsedCart.expiresAt);
            setReservationForm((current) => ({
              ...current,
              start_date: parseBrazilianDate(parsedCart.startDate)
                ? parsedCart.startDate
                : current.start_date,
              end_date: parseBrazilianDate(parsedCart.endDate)
                ? parsedCart.endDate
                : current.end_date,
              start_time: /^\d{2}:\d{2}$/.test(parsedCart.startTime)
                ? parsedCart.startTime
                : current.start_time,
            }));
          } else {
            localStorage.removeItem(rentalCartStorageKey);
            setCartError('O carrinho salvo expirou ou estava inválido; comece uma nova seleção.');
          }
        }
      } catch (error) {
        console.warn('Não foi possível restaurar o carrinho salvo:', error?.name);
        setCartError('Não foi possível carregar o carrinho salvo neste navegador.');
      } finally {
        setCartLoaded(true);
        if (cartOnly) setReservationFormOpen(true);
      }
    }, 0);

    return () => clearTimeout(restoreTimer);
  }, [cartOnly]);

  useEffect(() => {
    if (!cartLoaded) return;

    const hasItems =
      Boolean(selectedSpaceId)
      || Object.values(selectedToyQuantities).some((quantity) => quantity > 0);

    try {
      if (!hasItems) {
        localStorage.removeItem(rentalCartStorageKey);
        return;
      }

      localStorage.setItem(rentalCartStorageKey, JSON.stringify({
        expiresAt: cartExpiresAt,
        spaceId: selectedSpaceId || null,
        toyQuantities: selectedToyQuantities,
        includeToysInSpace,
        monitorRequired,
        startDate: reservationForm.start_date,
        endDate: reservationForm.end_date,
        startTime: reservationForm.start_time,
      }));
    } catch (error) {
      console.warn('Não foi possível salvar o carrinho neste navegador:', error?.name);
      setTimeout(() => setCartError('Não foi possível salvar o carrinho neste navegador.'), 0);
    }
  }, [
    cartLoaded,
    cartExpiresAt,
    selectedSpaceId,
    selectedToyQuantities,
    includeToysInSpace,
    monitorRequired,
    reservationForm.start_date,
    reservationForm.end_date,
    reservationForm.start_time,
  ]);

  useEffect(() => {
    if (!reservationFormOpen) return;
    const startDate = parseBrazilianDate(reservationForm.start_date);
    const endDate = parseBrazilianDate(reservationForm.end_date);
    if (!startDate || !endDate || endDate < startDate || (todayDate && startDate < todayDate)) return;

    const selectedToys =
      selectedSpaceId && !includeToysInSpace
        ? []
        : Object.entries(selectedToyQuantities)
          .filter(([, quantity]) => quantity > 0)
          .map(([toyId, quantity]) => ({ toy_id: toyId, quantity }));

    if (!selectedSpaceId && selectedToys.length === 0) {
      return;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      setCheckingAvailability(true);
      setAvailabilityError('');

      try {
        const result = await checkReservationAvailability({
          spaceId: selectedSpaceId,
          startDate,
          endDate,
          selectedToys,
        });

        if (active) setAvailability(result);
      } catch (error) {
        console.error('Erro ao verificar disponibilidade:', error);
        if (active) {
          setAvailability(null);
          setAvailabilityError(getReservationErrorMessage(error, 'verificar a disponibilidade'));
        }
      } finally {
        if (active) setCheckingAvailability(false);
      }
    }, 350);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [
    reservationFormOpen,
    reservationForm.start_date,
    reservationForm.end_date,
    todayDate,
    selectedSpaceId,
    selectedToyQuantities,
    includeToysInSpace,
  ]);

  useEffect(() => {
    if (!availabilityError) return;
    const errorAlert = document.getElementById('reservation-form-error');
    if (!errorAlert) return;

    const behavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? 'auto'
      : 'smooth';
    errorAlert.scrollIntoView({ behavior, block: 'center' });
  }, [availabilityError]);

  useEffect(() => {
    if (reservationFormOpen) {
      document.getElementById('reservation-request-form')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }
  }, [reservationFormOpen]);

  function touchCart() {
    setCartExpiresAt(getRentalCartExpiration());
    setCartError('');
  }

  function openReservationForm(spaceId = '', toyId = '') {
    if (!cartLoaded) return;

    const addedItemName = spaceId
      ? spaces.find((space) => space.id === spaceId)?.name || 'Espaço'
      : toys.find((toy) => toy.id === toyId)?.name || 'Brinquedo';

    if (spaceId) {
      setSelectedSpaceId(spaceId);
      setIncludeToysInSpace(Object.values(selectedToyQuantities).some((quantity) => quantity > 0));
    }
    if (toyId) {
      setSelectedToyQuantities((current) => ({
        ...current,
        [toyId]: (current[toyId] || 0) + 1,
      }));
      if (selectedSpaceId) setIncludeToysInSpace(true);
    }
    touchCart();
    setAvailability(null);
    setCheckingAvailability(false);
    setAvailabilityError('');
    if (cartOnly) setReservationFormOpen(true);
    else setCartConfirmationMessage(`${addedItemName} foi adicionado ao carrinho.`);
    setCheckoutStarted(false);
  }

  function updateReservationField(event) {
    const { name, value } = event.target;
    setAvailabilityError('');
    const isDateField = name === 'start_date' || name === 'end_date';
    const isScheduleField = isDateField || name === 'start_time';
    let updatedValue = value;
    if (isDateField) updatedValue = value ? formatDateForBrazil(value) : '';
    setReservationForm((current) => ({ ...current, [name]: updatedValue }));
    if (isDateField) {
      setAvailability(null);
      setCheckingAvailability(false);
    }
    if (isScheduleField) {
      touchCart();
    }
  }

  function updateToyQuantity(toyId, quantity) {
    setSelectedToyQuantities((current) => {
      const next = { ...current };
      if (quantity > 0) next[toyId] = quantity;
      else delete next[toyId];
      return next;
    });
    if (quantity > 0 && selectedSpaceId) setIncludeToysInSpace(true);
    touchCart();
    setAvailability(null);
    setCheckingAvailability(false);
  }

  function toggleSpaceToys(event) {
    const includeToys = event.target.checked;
    setIncludeToysInSpace(includeToys);
    if (!includeToys) setSelectedToyQuantities({});
    touchCart();
    setAvailability(null);
    setCheckingAvailability(false);
  }

  function removeSpaceFromCart() {
    setSelectedSpaceId('');
    setIncludeToysInSpace(false);
    touchCart();
    setAvailability(null);
    setCheckingAvailability(false);
  }

  function clearCart() {
    setSelectedSpaceId('');
    setSelectedToyQuantities({});
    setIncludeToysInSpace(false);
    setMonitorRequired(false);
    setCartExpiresAt(null);
    setAvailability(null);
    setAvailabilityError('');
    setCheckoutStarted(false);
    setReservationFormOpen(false);
    setReservationForm((current) => ({ ...current, start_time: '' }));
    try {
      localStorage.removeItem(rentalCartStorageKey);
      setCartError('');
    } catch (error) {
      console.warn('Não foi possível limpar o carrinho salvo:', error?.name);
      setCartError('Não foi possível limpar o carrinho neste navegador.');
    }
  }

  function continueToCheckout() {
    setAvailabilityError('');
    const startDate = parseBrazilianDate(reservationForm.start_date);
    const endDate = parseBrazilianDate(reservationForm.end_date);
    const selectedToys = Object.entries(selectedToyQuantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([toyId, quantity]) => ({ toy_id: toyId, quantity }));

    if (!selectedSpaceId && selectedToys.length === 0) {
      setAvailabilityError('Adicione um espaço ou pelo menos um brinquedo ao carrinho.');
      return;
    }
    if (!startDate || !endDate) {
      setAvailabilityError('Selecione as datas inicial e final.');
      return;
    }
    if (startDate < todayDate) {
      setAvailabilityError('A data inicial não pode estar no passado.');
      return;
    }
    if (endDate < startDate) {
      setAvailabilityError('A data final deve ser igual ou posterior à inicial.');
      return;
    }
    if (!reservationForm.start_time) {
      setAvailabilityError('Informe o horário do evento.');
      return;
    }
    setAvailabilityError('');
    setCheckoutStarted(true);
  }

  async function submitReservationWithAction(existingAction, submission) {
    setAvailabilityError('');
    setSubmittingReservation(true);

    try {
      const result = await createReservationRequest(
        submission.reservationData,
        submission.selectedToys,
        existingAction,
      );

      if (result?.status === 'pending_existing') {
        setReservationSubmission(submission);
        setReservationConflict({ type: 'pending' });
        return;
      }

      if (result?.status === 'approved_existing') {
        setReservationSubmission(submission);
        setReservationConflict({ type: 'approved' });
        return;
      }

      if (result?.status !== 'created' || !result.reservation_id) {
        throw new Error('O Supabase retornou uma resposta inválida ao enviar a solicitação.');
      }

      setReservationConflict(null);
      setReservationSubmission(null);
      clearCart();
      const today = formatDateForBrazil(getLocalDateValue());
      setReservationForm({
        client_name: '',
        client_email: '',
        client_phone: '',
        client_document: '',
        delivery_street: '',
        delivery_number: '',
        delivery_complement: '',
        delivery_neighborhood: '',
        delivery_city: '',
        delivery_state: '',
        delivery_postal_code: '',
        start_date: today,
        end_date: today,
        start_time: '',
        notes: '',
      });
      router.replace('/?solicitacao=enviada', { scroll: false });
    } catch (error) {
      const missingColumn = getMissingRequiredColumn(error);
      console.warn('Solicitação de reserva não enviada:', {
        code: error?.code,
        message: error?.message,
        requiredColumn: missingColumn?.column,
        requiredTable: missingColumn?.table,
      });
      setAvailabilityError(getReservationErrorMessage(error, 'enviar a solicitação'));
    } finally {
      setSubmittingReservation(false);
    }
  }

  async function confirmReservationConflict() {
    if (!reservationConflict || !reservationSubmission || submittingReservation) return;

    const existingAction = reservationConflict.type === 'pending'
      ? 'delete_pending_and_submit'
      : 'allow_new';
    const submission = reservationSubmission;
    setReservationConflict(null);
    await submitReservationWithAction(existingAction, submission);
  }

  function dismissReservationConflict() {
    setReservationConflict(null);
    setReservationSubmission(null);
  }

  async function submitReservation(event) {
    event.preventDefault();
    if (!checkoutStarted) {
      continueToCheckout();
      return;
    }

    setAvailabilityError('');

    const selectedToys = Object.entries(selectedToyQuantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([toyId, quantity]) => ({ toy_id: toyId, quantity }));
    const toysForReservation =
      selectedSpaceId && !includeToysInSpace ? [] : selectedToys;
    const startDate = parseBrazilianDate(reservationForm.start_date);
    const endDate = parseBrazilianDate(reservationForm.end_date);
    const clientDocument = reservationForm.client_document.replace(/\D/g, '');

    if (!selectedSpaceId && toysForReservation.length === 0) {
      setAvailabilityError('Adicione um espaço ou pelo menos um brinquedo ao carrinho.');
      return;
    }
    if (!startDate || !endDate || startDate < todayDate || endDate < startDate) {
      setAvailabilityError('Confira as datas selecionadas.');
      return;
    }
    if (!reservationForm.start_time) {
      setAvailabilityError('Informe o horário do evento.');
      return;
    }
    if (![11, 14].includes(clientDocument.length)) {
      setAvailabilityError('Informe um CPF com 11 dígitos ou um CNPJ com 14 dígitos.');
      return;
    }
    await submitReservationWithAction('check', {
      reservationData: {
        ...reservationForm,
        client_document: clientDocument,
        space_id: selectedSpaceId || null,
        start_date: startDate,
        end_date: endDate,
        delivery_address: [
          `${reservationForm.delivery_street.trim()}, ${reservationForm.delivery_number.trim()}`,
          reservationForm.delivery_complement.trim(),
          reservationForm.delivery_neighborhood.trim(),
          `${reservationForm.delivery_city.trim()} - ${reservationForm.delivery_state.trim()}`,
          `CEP ${reservationForm.delivery_postal_code.trim()}`,
        ].filter(Boolean).join(', '),
        monitor_required: monitorRequired,
      },
      selectedToys: toysForReservation,
    });
  }

  const cartItemCount =
    (selectedSpaceId ? 1 : 0)
    + Object.values(selectedToyQuantities).reduce((total, quantity) => total + quantity, 0);
  const selectedSpace = spaces.find((space) => space.id === selectedSpaceId);
  const selectedToys = Object.entries(selectedToyQuantities)
    .filter(([, quantity]) => quantity > 0)
    .map(([toyId, quantity]) => ({
      toy: toys.find((item) => item.id === toyId),
      quantity,
    }));
  const startDate = parseBrazilianDate(reservationForm.start_date);
  const endDate = parseBrazilianDate(reservationForm.end_date);
  const rentalDays = startDate && endDate && endDate >= startDate
    ? Math.floor((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1
    : 0;
  const spaceSubtotal = selectedSpace ? Number(selectedSpace.daily_rate) * rentalDays : 0;
  const toysSubtotal = selectedToys.reduce(
    (total, item) => total + Number(item.toy?.daily_rate || 0) * item.quantity * rentalDays,
    0,
  );
  const monitorSubtotal = monitorRequired ? Number(monitorDailyRate || 0) * rentalDays : 0;
  const rentalTotal = spaceSubtotal + toysSubtotal + monitorSubtotal;

  return (
    <div className="min-vh-100 d-flex flex-column bg-vivence-app">
      {/* Barra de Navegação Responsiva */}
      <nav className="navbar navbar-expand-lg bg-vivence-card border-bottom sticky-top shadow-sm py-3">
        <div className="container">
          <Link className="navbar-brand fw-bold fs-4 text-vivence-primary d-flex align-items-center gap-2" href="/">
            <i className="fa-solid fa-leaf"></i>
            Espaço Vivence
          </Link>

          <button
            className="btn btn-vivence-outline d-lg-none"
            type="button"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            aria-label="Menu"
          >
            <i className={`fa-solid ${mobileNavOpen ? 'fa-xmark' : 'fa-bars'}`}></i>
          </button>

          <div className={`collapse navbar-collapse ${mobileNavOpen ? 'show mt-3 mt-lg-0' : ''}`}>
            <ul className="navbar-nav ms-auto align-items-lg-center gap-2">
              <li className="nav-item">
                <a className="nav-link text-vivence-dark fw-semibold" href={cartOnly ? '/#espacos' : '#espacos'}>
                  <i className="fa-solid fa-champagne-glasses me-1 text-vivence-primary"></i> Espaços
                </a>
              </li>
              <li className="nav-item">
                <a className="nav-link text-vivence-dark fw-semibold" href={cartOnly ? '/#brinquedos' : '#brinquedos'}>
                  <i className="fa-solid fa-puzzle-piece me-1 text-vivence-brown"></i> Brinquedos
                </a>
              </li>
              <li className="nav-item">
                <Link className="btn btn-vivence-outline btn-sm w-100" href="/carrinho">
                  <i className="fa-solid fa-cart-shopping me-1"></i>
                  Carrinho ({cartItemCount})
                </Link>
              </li>
              <li className="nav-item">
                <Link className="btn btn-vivence-outline btn-sm w-100" href="/admin">
                  <i className="fa-solid fa-lock me-1"></i> Área Admin
                </Link>
              </li>
              <li className="nav-item">
                <a
                  href="https://wa.me/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-vivence-primary btn-sm text-decoration-none d-inline-flex align-items-center justify-content-center gap-2 w-100"
                >
                  <i className="fa-brands fa-whatsapp fs-6"></i> WhatsApp
                </a>
              </li>
            </ul>
          </div>
        </div>
      </nav>

      {!cartOnly && <section className="hero-vivence text-center">
        <div className="container py-4">
          <span className="badge bg-vivence-primary rounded-pill px-3 py-2 mb-3">
            <i className="fa-solid fa-star me-1"></i> Eventos & Festas Infantis
          </span>
          <h1 className="display-5 fw-bold mb-3 text-vivence-light">
            O espaço ideal e a diversão completa para a sua festa
          </h1>
          <p className="lead text-vivence-muted mb-4 mx-auto" style={{ maxWidth: '680px' }}>
            Consulte nossos ambientes exclusivos e monte seu pacote de brinquedos com reserva online rápida e segura.
          </p>
          <div className="d-flex flex-wrap justify-content-center gap-3">
            <a href="#espacos" className="btn-vivence-primary text-decoration-none">
              <i className="fa-solid fa-calendar-plus me-2"></i> Ver Catálogo Disponível
            </a>
          </div>
        </div>
      </section>}

      {reservationFormOpen && (
        <section id="reservation-request-form" className="container pt-4" aria-labelledby="reservation-form-title">
          <div className="card-vivence p-4 p-md-5 reservation-form-panel">
            <div className="d-flex justify-content-between align-items-start gap-3 mb-4">
              <div>
                <h2 id="reservation-form-title" className="h3 fw-bold text-vivence-dark mb-1">
                  Carrinho de aluguel
                </h2>
              </div>
              {cartOnly ? (
                <Link className="btn btn-vivence-outline" href="/" aria-label="Voltar ao catálogo">
                  Voltar ao catálogo
                </Link>
              ) : (
                <button
                  type="button"
                  className="btn btn-vivence-outline"
                  onClick={() => {
                    setReservationFormOpen(false);
                    setCheckingAvailability(false);
                  }}
                  aria-label="Fechar formulário"
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>

            {cartError && <div className="alert alert-warning" role="status">{cartError}</div>}
            {availabilityError && (
              <div
                id="reservation-form-error"
                className="alert alert-danger d-flex align-items-start gap-2"
                role="alert"
                tabIndex={-1}
              >
                <i className="fa-solid fa-triangle-exclamation mt-1" aria-hidden="true"></i>
                <span>{availabilityError}</span>
              </div>
            )}
            {!checkoutStarted && cartItemCount > 0 && (
              <div className="alert alert-light border mb-4" aria-live="polite">
                <h3 className="h5 fw-bold text-vivence-dark">Resumo de valores</h3>
                {loading ? (
                  <p className="small text-vivence-body mb-0">Carregando os valores do catálogo...</p>
                ) : rentalDays > 0 ? (
                  <>
                    <p className="small text-vivence-body mb-2">
                      Período de {rentalDays} {rentalDays === 1 ? 'diária' : 'diárias'}.
                    </p>
                    {selectedSpace && (
                      <div className="d-flex justify-content-between gap-3 small">
                        <span>{selectedSpace.name}</span>
                        <span>{formatCurrency(spaceSubtotal)}</span>
                      </div>
                    )}
                    {selectedToys.map(({ toy, quantity }, index) => (
                      <div
                        key={toy?.id || `toy-${index}`}
                        className="d-flex justify-content-between gap-3 small"
                      >
                        <span>{toy?.name || 'Brinquedo'} × {quantity}</span>
                        <span>{formatCurrency(Number(toy?.daily_rate || 0) * quantity * rentalDays)}</span>
                      </div>
                    ))}
                    {monitorRequired && (
                      <div className="d-flex justify-content-between gap-3 small">
                        <span>Monitor</span>
                        <span>{formatCurrency(monitorSubtotal)}</span>
                      </div>
                    )}
                    <div className="d-flex justify-content-between gap-3 border-top mt-2 pt-2 fw-bold">
                      <span>Total estimado</span>
                      <span>{formatCurrency(rentalTotal)}</span>
                    </div>
                  </>
                ) : (
                  <p className="small text-vivence-body mb-0">
                    Informe um período válido para calcular o total.
                  </p>
                )}
                <p className="small text-vivence-body mt-2 mb-0">
                  O valor é estimado com as diárias cadastradas e será confirmado pela equipe.
                </p>
              </div>
            )}

            <form onSubmit={submitReservation}>
              <div className="row g-3">
                {!checkoutStarted && (
                  <>
                    {selectedSpaceId ? (
                      <div className="col-12">
                        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 p-3 rounded-3 bg-vivence-app">
                          <div>
                            <strong className="d-block text-vivence-dark">
                              {spaces.find((space) => space.id === selectedSpaceId)?.name || 'Espaço selecionado'}
                            </strong>
                            <span className="small text-vivence-body">
                              Aluguel do espaço
                            </span>
                          </div>
                          <button
                            type="button"
                            className="btn btn-vivence-outline btn-sm"
                            onClick={removeSpaceFromCart}
                          >
                            Remover espaço
                          </button>
                        </div>
                        <div className="form-check mt-3">
                          <input
                            id="reservation-include-toys"
                            type="checkbox"
                            className="form-check-input"
                            checked={includeToysInSpace}
                            onChange={toggleSpaceToys}
                          />
                          <label className="form-check-label fw-semibold" htmlFor="reservation-include-toys">
                            Adicionar aluguel de brinquedos ao espaço
                          </label>
                        </div>
                      </div>
                    ) : (
                      <div className="col-12">
                        <p className="text-vivence-body mb-0">
                          {cartItemCount > 0
                            ? 'Aluguel somente de brinquedos; não é necessário escolher um espaço.'
                            : 'Adicione brinquedos ou escolha um espaço no catálogo para começar.'}
                        </p>
                      </div>
                    )}

                    {!selectedSpaceId && selectedToys.length > 0 && (
                      <div className="col-12">
                        <p className="small text-vivence-body mb-0">Brinquedos no carrinho:</p>
                        {selectedToys.map(({ toy, quantity }, index) => (
                          <div key={toy?.id || `toy-${index}`} className="small text-vivence-dark">
                            {toy?.name || 'Brinquedo'} × {quantity}
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="col-12 col-md-4">
                      <label htmlFor="reservation-start-date" className="form-label fw-semibold">
                        Data inicial
                      </label>
                      <input
                        id="reservation-start-date"
                        name="start_date"
                        type="date"
                        className="form-control input-vivence"
                        value={parseBrazilianDate(reservationForm.start_date) || ''}
                        min={todayDate || undefined}
                        onChange={updateReservationField}
                        required
                      />
                    </div>
                    <div className="col-12 col-md-4">
                      <label htmlFor="reservation-end-date" className="form-label fw-semibold">
                        Data final
                      </label>
                      <input
                        id="reservation-end-date"
                        name="end_date"
                        type="date"
                        className="form-control input-vivence"
                        value={parseBrazilianDate(reservationForm.end_date) || ''}
                        min={todayDate || undefined}
                        onChange={updateReservationField}
                        required
                      />
                    </div>
                    <div className="col-12 col-md-4">
                      <label htmlFor="reservation-event-time" className="form-label fw-semibold">
                        Horário do evento
                      </label>
                      <input
                        id="reservation-event-time"
                        name="start_time"
                        type="time"
                        className="form-control input-vivence"
                        value={reservationForm.start_time}
                        onChange={updateReservationField}
                        required
                      />
                    </div>
                  </>
                )}

                {checkoutStarted && (
                  <div className="col-12">
                    <div className="p-3 rounded-3 bg-vivence-app">
                      <strong className="d-block text-vivence-dark mb-2">Resumo do aluguel</strong>
                      <div className="small text-vivence-body">
                        <div>{selectedSpaceId
                          ? spaces.find((space) => space.id === selectedSpaceId)?.name || 'Espaço selecionado'
                          : 'Aluguel somente de brinquedos'}</div>
                        {Object.entries(selectedToyQuantities)
                          .filter(([, quantity]) => quantity > 0)
                          .map(([toyId, quantity]) => (
                            <div key={toyId}>
                              {toys.find((toy) => toy.id === toyId)?.name || 'Brinquedo'} × {quantity}
                            </div>
                          ))}
                        <div>Período: {reservationForm.start_date} a {reservationForm.end_date}</div>
                        <div>Horário do evento: {reservationForm.start_time}</div>
                        <div>Monitor: {monitorRequired
                          ? `Solicitado (R$ ${monitorDailyRate?.toFixed(2)} por diária)`
                          : 'Não solicitado'}</div>
                        {rentalDays > 0 && (
                          <div className="fw-semibold mt-1">
                            Total estimado: {formatCurrency(rentalTotal)}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn btn-vivence-outline btn-sm mt-3"
                        onClick={() => setCheckoutStarted(false)}
                      >
                        Voltar ao carrinho
                      </button>
                    </div>
                  </div>
                )}

                {checkoutStarted && (
                  <>
                <div className="col-12 col-md-4">
                  <label htmlFor="reservation-client-name" className="form-label fw-semibold">Nome</label>
                  <input
                    id="reservation-client-name"
                    name="client_name"
                    type="text"
                    maxLength="120"
                    className="form-control input-vivence"
                    value={reservationForm.client_name}
                    onChange={updateReservationField}
                    required
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="reservation-client-email" className="form-label fw-semibold">E-mail</label>
                  <input
                    id="reservation-client-email"
                    name="client_email"
                    type="email"
                    maxLength="254"
                    className="form-control input-vivence"
                    value={reservationForm.client_email}
                    onChange={updateReservationField}
                    required
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="reservation-client-phone" className="form-label fw-semibold">Telefone</label>
                  <input
                    id="reservation-client-phone"
                    name="client_phone"
                    type="tel"
                    maxLength="30"
                    className="form-control input-vivence"
                    value={reservationForm.client_phone}
                    onChange={updateReservationField}
                    required
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="reservation-client-document" className="form-label fw-semibold">
                    CPF ou CNPJ
                  </label>
                  <input
                    id="reservation-client-document"
                    name="client_document"
                    type="text"
                    inputMode="numeric"
                    maxLength="18"
                    className="form-control input-vivence"
                    value={reservationForm.client_document}
                    onChange={updateReservationField}
                    required
                  />
                </div>

                <div className="col-12">
                  <h3 className="h5 fw-bold text-vivence-dark mb-1">Endereço para o aluguel</h3>
                  <p className="small text-vivence-body mb-2">
                    Informe o endereço de entrega ou realização do evento.
                  </p>
                </div>
                <div className="col-12 col-md-6">
                  <label htmlFor="reservation-delivery-street" className="form-label fw-semibold">Rua</label>
                  <input
                    id="reservation-delivery-street"
                    name="delivery_street"
                    type="text"
                    maxLength="160"
                    className="form-control input-vivence"
                    value={reservationForm.delivery_street}
                    onChange={updateReservationField}
                    required
                  />
                </div>
                <div className="col-6 col-md-2">
                  <label htmlFor="reservation-delivery-number" className="form-label fw-semibold">Número</label>
                  <input
                    id="reservation-delivery-number"
                    name="delivery_number"
                    type="text"
                    maxLength="20"
                    className="form-control input-vivence"
                    value={reservationForm.delivery_number}
                    onChange={updateReservationField}
                    required
                  />
                </div>
                <div className="col-6 col-md-4">
                  <label htmlFor="reservation-delivery-complement" className="form-label fw-semibold">
                    Complemento
                  </label>
                  <input
                    id="reservation-delivery-complement"
                    name="delivery_complement"
                    type="text"
                    maxLength="80"
                    className="form-control input-vivence"
                    value={reservationForm.delivery_complement}
                    onChange={updateReservationField}
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="reservation-delivery-neighborhood" className="form-label fw-semibold">
                    Bairro
                  </label>
                  <input
                    id="reservation-delivery-neighborhood"
                    name="delivery_neighborhood"
                    type="text"
                    maxLength="100"
                    className="form-control input-vivence"
                    value={reservationForm.delivery_neighborhood}
                    onChange={updateReservationField}
                    required
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label htmlFor="reservation-delivery-city" className="form-label fw-semibold">Cidade</label>
                  <input
                    id="reservation-delivery-city"
                    name="delivery_city"
                    type="text"
                    maxLength="100"
                    className="form-control input-vivence"
                    value={reservationForm.delivery_city}
                    onChange={updateReservationField}
                    required
                  />
                </div>
                <div className="col-6 col-md-2">
                  <label htmlFor="reservation-delivery-state" className="form-label fw-semibold">UF</label>
                  <input
                    id="reservation-delivery-state"
                    name="delivery_state"
                    type="text"
                    maxLength="2"
                    className="form-control input-vivence"
                    value={reservationForm.delivery_state}
                    onChange={updateReservationField}
                    required
                  />
                </div>
                <div className="col-6 col-md-2">
                  <label htmlFor="reservation-delivery-postal-code" className="form-label fw-semibold">CEP</label>
                  <input
                    id="reservation-delivery-postal-code"
                    name="delivery_postal_code"
                    type="text"
                    maxLength="12"
                    className="form-control input-vivence"
                    value={reservationForm.delivery_postal_code}
                    onChange={updateReservationField}
                    required
                  />
                </div>
                  </>
                )}

                {!checkoutStarted && selectedSpaceId && includeToysInSpace && (
                  <div className="col-12">
                    <h3 className="h5 fw-bold text-vivence-dark mb-2">Brinquedos</h3>
                    {toys.length === 0 ? (
                      <p className="text-vivence-body">Não há brinquedos disponíveis para seleção.</p>
                    ) : (
                      <div className="row g-2">
                        {toys.map((toy) => {
                          const quantity = selectedToyQuantities[toy.id] || 0;
                          const availabilityForToy = availability?.toys?.find(
                            (item) => item.toy_id === toy.id,
                          );

                          return (
                            <div key={toy.id} className="col-12 col-md-6">
                              <div className="reservation-toy-option">
                                <label className="d-flex align-items-center gap-2 flex-grow-1">
                                  <input
                                    type="checkbox"
                                    checked={quantity > 0}
                                    onChange={(event) =>
                                      updateToyQuantity(toy.id, event.target.checked ? 1 : 0)
                                    }
                                  />
                                  <span>
                                    <strong className="d-block text-vivence-dark">{toy.name}</strong>
                                    <small className="text-vivence-body">R$ {toy.daily_rate} por diária</small>
                                    {availabilityForToy && (
                                      <small className="d-block text-vivence-body">
                                        Disponíveis no período: {availabilityForToy.available_quantity}
                                      </small>
                                    )}
                                  </span>
                                </label>
                                {quantity > 0 && (
                                  <input
                                    type="number"
                                    min="1"
                                    max={
                                      availabilityForToy
                                        ? Math.max(availabilityForToy.available_quantity, 1)
                                        : toy.total_quantity
                                    }
                                    value={quantity}
                                    onChange={(event) =>
                                      updateToyQuantity(toy.id, Number(event.target.value))
                                    }
                                    className="form-control input-vivence reservation-toy-quantity"
                                    aria-label={`Quantidade de ${toy.name}`}
                                  />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {!checkoutStarted && cartItemCount > 0 && (
                  <div className="col-12">
                    <div className="form-check">
                      <input
                        id="reservation-monitor-required"
                        type="checkbox"
                        className="form-check-input"
                        checked={monitorRequired}
                        onChange={(event) => {
                          setMonitorRequired(event.target.checked);
                          touchCart();
                        }}
                      />
                      <label className="form-check-label fw-semibold" htmlFor="reservation-monitor-required">
                        Incluir monitor
                        {monitorDailyRate !== null && (
                          <span className="text-vivence-body fw-normal">
                            {' '}(R$ {monitorDailyRate.toFixed(2)} por diária)
                          </span>
                        )}
                      </label>
                    </div>
                  </div>
                )}

                {checkoutStarted && (
                  <div className="col-12">
                    <label htmlFor="reservation-notes" className="form-label fw-semibold">
                      Observações
                    </label>
                    <textarea
                      id="reservation-notes"
                      name="notes"
                      maxLength="1000"
                      rows="3"
                      className="form-control input-vivence"
                      value={reservationForm.notes}
                      onChange={updateReservationField}
                    />
                  </div>
                )}

                <div className="col-12">
                  <div className="reservation-availability" aria-live="polite">
                    {checkingAvailability ? (
                      <span className="text-vivence-body">
                        <i className="fa-solid fa-spinner fa-spin me-2"></i>
                        Verificando disponibilidade...
                      </span>
                    ) : availability ? (
                      <>
                        {selectedSpaceId && (
                          <p className={`mb-2 fw-semibold ${
                            availability.space_available ? 'text-success' : 'text-danger'
                          }`}>
                            <i className={`fa-solid ${
                              availability.space_available ? 'fa-circle-check' : 'fa-circle-xmark'
                            } me-2`}></i>
                            {availability.space_available
                              ? 'Espaço disponível neste período.'
                              : 'Este espaço já está reservado ou indisponível neste período.'}
                          </p>
                        )}
                        {!selectedSpaceId && (
                          <p className="mb-2 fw-semibold text-vivence-body">
                            Solicitação somente de brinquedos, sem aluguel de espaço.
                          </p>
                        )}
                        {availability.toys?.map((item) => {
                          const toy = toys.find((candidate) => candidate.id === item.toy_id);
                          return (
                            <p
                              key={item.toy_id}
                              className={`small mb-1 ${item.available ? 'text-success' : 'text-danger'}`}
                            >
                              {toy?.name || 'Brinquedo'}: {item.available_quantity} disponível(is); pedido: {item.requested_quantity}.
                            </p>
                          );
                        })}
                      </>
                    ) : (
                      <span className="text-vivence-body">
                        {!parseBrazilianDate(reservationForm.start_date)
                          || !parseBrazilianDate(reservationForm.end_date)
                          ? 'Selecione as datas inicial e final.'
                          : !selectedSpaceId && Object.keys(selectedToyQuantities).length === 0
                            ? 'Adicione um espaço ou pelo menos um brinquedo ao carrinho.'
                            : 'A disponibilidade será verificada para o período escolhido.'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="col-12 d-flex flex-wrap justify-content-end gap-2">
                  {!checkoutStarted ? (
                    <>
                      {cartOnly ? (
                        <Link className="btn btn-vivence-outline" href="/">
                          Voltar ao catálogo
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-vivence-outline"
                          onClick={() => {
                            setReservationFormOpen(false);
                            setCheckingAvailability(false);
                          }}
                        >
                          Fechar
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-vivence-outline"
                        onClick={clearCart}
                        disabled={cartItemCount === 0}
                      >
                        Limpar carrinho
                      </button>
                      <button
                        type="button"
                        className="btn-vivence-primary"
                        onClick={continueToCheckout}
                        disabled={
                          cartItemCount === 0
                          || checkingAvailability
                          || monitorDailyRate === null
                        }
                      >
                        Continuar para preencher os dados
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn btn-vivence-outline"
                        onClick={() => setCheckoutStarted(false)}
                      >
                        Voltar ao carrinho
                      </button>
                      <button
                        type="submit"
                        className="btn-vivence-primary"
                        disabled={
                          submittingReservation
                          || checkingAvailability
                          || monitorDailyRate === null
                        }
                      >
                        {submittingReservation ? 'Enviando...' : 'Confirmar solicitação'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </form>
          </div>
        </section>
      )}

      {/* Catálogo Principal */}
      {!cartOnly && <main className="container py-5 flex-grow-1">
        {catalogError && <div className="alert alert-danger" role="alert">{catalogError}</div>}
        {loading ? (
          <div className="text-center py-5">
            <i className="fa-solid fa-circle-notch fa-spin fs-1 text-vivence-primary mb-3"></i>
            <p className="text-vivence-body fw-medium">Carregando catálogo disponível...</p>
          </div>
        ) : (
          <>
            {/* Seção de Espaços */}
            <section id="espacos" className="mb-5 pb-3">
              <div className="d-flex align-items-center justify-content-between mb-4 border-bottom pb-2">
                <div>
                  <small className="text-vivence-primary fw-bold text-uppercase">Ambientes Exclusivos</small>
                  <h2 className="fw-bold text-vivence-dark m-0">
                    <i className="fa-solid fa-building-wheat me-2 text-vivence-primary"></i>
                    Espaços para Eventos
                  </h2>
                </div>
              </div>

              {spaces.length === 0 ? (
                <div className="card-vivence p-5 text-center text-vivence-body">
                  <i className="fa-solid fa-calendar-xmark fs-2 mb-2 text-vivence-muted d-block"></i>
                  Nenhum espaço disponível para locação no momento.
                </div>
              ) : (
                <div className="row g-4">
                  {spaces.map((space) => {
                    const photos = space.photos || [];
                    const currentPhoto = selectedSpacePhoto[space.id] || photos[0];

                    return (
                      <div key={space.id} className="col-12 col-md-6 col-lg-4">
                        <div className="card-vivence card-vivence-hover h-100 d-flex flex-column justify-content-between overflow-hidden">
                          <div>
                            {currentPhoto ? (
                              <div className="photo-cover-box">
                                <img src={currentPhoto} alt={space.name} className="photo-cover-img" />
                              </div>
                            ) : (
                              <div className="photo-cover-box d-flex flex-column align-items-center justify-content-center text-vivence-body">
                                <i className="fa-solid fa-camera-retro fs-1 mb-2 text-vivence-muted"></i>
                                <span className="small">Sem fotos cadastradas</span>
                              </div>
                            )}

                            <div className="p-4">
                              {photos.length > 1 && (
                                <div className="photo-thumb-strip mb-3">
                                  {photos.map((url, idx) => (
                                    <img
                                      key={idx}
                                      src={url}
                                      alt={`${space.name} foto ${idx + 1}`}
                                      onClick={() =>
                                        setSelectedSpacePhoto((prev) => ({ ...prev, [space.id]: url }))
                                      }
                                      className={`photo-thumb-item ${
                                        currentPhoto === url ? 'photo-thumb-active' : ''
                                      }`}
                                    />
                                  ))}
                                </div>
                              )}
                              <h5 className="fw-bold text-vivence-dark mb-2">{space.name}</h5>
                              <p className="text-vivence-body small mb-0">
                                {space.description || 'Ambiente amplo e preparado para receber seu evento.'}
                              </p>
                            </div>
                          </div>
                          <div className="px-4 pb-4 pt-3 border-top d-flex align-items-center justify-content-between">
                            <div>
                              <small className="text-vivence-body d-block">Diária a partir de</small>
                              <span className="fs-5 fw-bold text-vivence-primary">R$ {space.daily_rate}</span>
                            </div>
                            <button
                              type="button"
                              className="btn-vivence-primary btn-sm"
                              disabled={!cartLoaded}
                              onClick={() => openReservationForm(space.id)}
                            >
                              <i className="fa-solid fa-cart-plus me-1"></i> Adicionar espaço
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Seção de Brinquedos */}
            <section id="brinquedos">
              <div className="d-flex align-items-center justify-content-between mb-4 border-bottom pb-2">
                <div>
                  <small className="text-vivence-brown fw-bold text-uppercase">Catálogo Infantil</small>
                  <h2 className="fw-bold text-vivence-dark m-0">
                    <i className="fa-solid fa-shapes me-2 text-vivence-brown"></i>
                    Brinquedos e Equipamentos
                  </h2>
                </div>
              </div>

              {toys.length === 0 ? (
                <div className="card-vivence p-5 text-center text-vivence-body">
                  <i className="fa-solid fa-box-open fs-2 mb-2 text-vivence-muted d-block"></i>
                  Nenhum brinquedo disponível no catálogo no momento.
                </div>
              ) : (
                <div className="row g-4">
                  {toys.map((toy) => {
                    const photos = toy.photos || [];
                    const currentPhoto = selectedToyPhoto[toy.id] || photos[0];

                    return (
                      <div key={toy.id} className="col-12 col-md-6 col-lg-4">
                        <div className="card-vivence card-vivence-hover h-100 d-flex flex-column justify-content-between overflow-hidden">
                          <div>
                            {currentPhoto ? (
                              <div className="photo-cover-box">
                                <img src={currentPhoto} alt={toy.name} className="photo-cover-img" />
                              </div>
                            ) : (
                              <div className="photo-cover-box d-flex flex-column align-items-center justify-content-center text-vivence-body">
                                <i className="fa-solid fa-puzzle-piece fs-1 mb-2 text-vivence-muted"></i>
                                <span className="small">Sem fotos cadastradas</span>
                              </div>
                            )}

                            <div className="p-4">
                              {photos.length > 1 && (
                                <div className="photo-thumb-strip mb-3">
                                  {photos.map((url, idx) => (
                                    <img
                                      key={idx}
                                      src={url}
                                      alt={`${toy.name} foto ${idx + 1}`}
                                      onClick={() =>
                                        setSelectedToyPhoto((prev) => ({ ...prev, [toy.id]: url }))
                                      }
                                      className={`photo-thumb-item ${
                                        currentPhoto === url ? 'photo-thumb-active' : ''
                                      }`}
                                    />
                                  ))}
                                </div>
                              )}
                              <div className="d-flex justify-content-between align-items-start mb-2">
                                <h5 className="fw-bold text-vivence-dark m-0">{toy.name}</h5>
                                <span className="badge badge-vivence-neutral rounded-pill">
                                  Disp: {toy.total_quantity}
                                </span>
                              </div>
                              <p className="text-vivence-body small mb-0">
                                {toy.description || 'Equipamento higienizado e seguro para festas infantis.'}
                              </p>
                            </div>
                          </div>
                          <div className="px-4 pb-4 pt-3 border-top d-flex align-items-center justify-content-between">
                            <div>
                              <small className="text-vivence-body d-block">Valor da diária</small>
                              <span className="fs-5 fw-bold text-vivence-primary">R$ {toy.daily_rate}</span>
                            </div>
                            <button
                              type="button"
                              className="btn-vivence-brown btn-sm"
                              disabled={!cartLoaded}
                              onClick={() => openReservationForm('', toy.id)}
                            >
                              <i className="fa-solid fa-cart-plus me-1"></i> Adicionar ao carrinho
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>}

      {/* Rodapé */}
      {!cartOnly && <footer className="bg-vivence-dark py-4 text-center mt-auto">
        <div className="container">
          <p className="fw-semibold mb-1 text-vivence-light">
            <i className="fa-solid fa-leaf me-2 text-vivence-primary"></i>
            Espaço Vivence — Locação de Espaços e Brinquedos
          </p>
          <small className="text-vivence-muted">
            © {currentYear} Todos os direitos reservados.
          </small>
        </div>
      </footer>}

      <Modal
        isOpen={Boolean(cartConfirmationMessage)}
        title="Adicionado ao carrinho"
        message={cartConfirmationMessage}
        onClose={() => setCartConfirmationMessage('')}
        closeText="Continuar na página"
        secondaryText="Ir para o carrinho"
        onSecondary={() => {
          setCartConfirmationMessage('');
          router.push('/carrinho');
        }}
      />

      {reservationConflict?.type === 'pending' && (
        <Modal
          isOpen
          type="confirm"
          title="Solicitação pendente encontrada"
          message="Há solicitações ainda não aprovadas associadas a este CPF. Se continuar, elas serão excluídas e esta nova solicitação será enviada."
          onClose={dismissReservationConflict}
          onConfirm={confirmReservationConflict}
          confirmText="Excluir e enviar nova"
          confirmIcon="fa-trash-can"
        />
      )}

      {reservationConflict?.type === 'approved' && (
        <Modal
          isOpen
          type="success"
          title="Solicitação anterior aprovada"
          message="Já existe uma solicitação aprovada associada a este CPF. Deseja enviar uma nova solicitação?"
          onClose={dismissReservationConflict}
          closeText="Voltar"
          secondaryText="Enviar nova solicitação"
          onSecondary={confirmReservationConflict}
        />
      )}

      {reservationModalOpen && !cartOnly && (
        <div className="modal-backdrop-vivence" role="presentation">
          <section
            className="card-vivence reservation-success-modal p-4 p-md-5 text-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reservation-success-title"
          >
            <div className="mb-3 text-vivence-primary" aria-hidden="true">
              <i className="fa-solid fa-circle-check fs-1"></i>
            </div>
            <h2 id="reservation-success-title" className="h3 fw-bold text-vivence-dark">
              Solicitação enviada!
            </h2>
            <p className="text-vivence-body mb-4">
              Recebemos sua solicitação. A equipe entrará em contato para confirmar os detalhes.
            </p>
            <button
              type="button"
              className="btn-vivence-primary"
              onClick={() => setReservationModalOpen(false)}
              autoFocus
            >
              Voltar ao início
            </button>
          </section>
        </div>
      )}
    </div>
  );
}