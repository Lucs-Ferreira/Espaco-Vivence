'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../../config/supabase';
import Sidebar from '../../components/Sidebar';
import Modal from '../../components/Modal';
import ReservationsAgenda from '../../components/ReservationsAgenda';
import { getMonitorDailyRate } from '../../modules/reservations/reservation';

function getAdminSaveErrorMessage(error, resourceName) {
  const permissionDenied = error?.code === '42501' || error?.status === 403;
  if (permissionDenied) {
    return 'O Supabase recusou a alteração pelas regras de acesso. Atualize uma vez sql/admin-access.sql; depois, qualquer conta autenticada poderá administrar.';
  }
  return `Não foi possível salvar ${resourceName}. Confira os dados e tente novamente.`;
}

export default function AdminPage() {
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [activeMenu, setActiveMenu] = useState('cadastros');
  const [activeTab, setActiveTab] = useState('spaces');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [monitorDailyRate, setMonitorDailyRate] = useState('');
  const [savingMonitorRate, setSavingMonitorRate] = useState(false);

  const [spaces, setSpaces] = useState([]);
  const [toys, setToys] = useState([]);

  // Estados do formulário de Espaço (Criação e Edição)
  const [editingSpaceId, setEditingSpaceId] = useState(null);
  const [spaceName, setSpaceName] = useState('');
  const [spaceDesc, setSpaceDesc] = useState('');
  const [spaceRate, setSpaceRate] = useState('');
  const [spaceExistingPhotos, setSpaceExistingPhotos] = useState([]);
  const [spaceFiles, setSpaceFiles] = useState([]);

  // Estados do formulário de Brinquedo (Criação e Edição)
  const [editingToyId, setEditingToyId] = useState(null);
  const [toyName, setToyName] = useState('');
  const [toyDesc, setToyDesc] = useState('');
  const [toyRate, setToyRate] = useState('');
  const [toyQty, setToyQty] = useState('1');
  const [toyExistingPhotos, setToyExistingPhotos] = useState([]);
  const [toyFiles, setToyFiles] = useState([]);

  // Estado do Modal (Avisos e Confirmação de Exclusão)
  const [modalConfig, setModalConfig] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'success',
    onConfirm: null,
  });

  useEffect(() => {
    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setIsAdmin(Boolean(nextSession));
      setAuthLoading(false);
      setAuthError('');
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthError('Não foi possível verificar a sessão. Atualize a página e tente novamente.');
        setSession(null);
      } else {
        setSession(data.session);
      }
      setIsAdmin(Boolean(data.session));
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.body.dataset.module = 'admin';
  }, []);

  useEffect(() => {
    if (isAdmin === true) fetchData();
  }, [isAdmin]);

  async function fetchData() {
    try {
      const { data: spacesData, error: spacesError } = await supabase
        .from('spaces')
        .select('*')
        .order('name');
      if (spacesError) throw spacesError;

      const { data: toysData, error: toysError } = await supabase
        .from('toys')
        .select('*')
        .order('name');
      if (toysError) throw toysError;

      const monitorRate = await getMonitorDailyRate();
      setSpaces(spacesData || []);
      setToys(toysData || []);
      setMonitorDailyRate(String(monitorRate));
    } catch (err) {
      console.error('Erro ao buscar dados:', err);
      setAuthError('Não foi possível carregar os dados administrativos. Verifique as permissões no Supabase.');
    }
  }

  async function handleSignIn(event) {
    event.preventDefault();
    setSigningIn(true);
    setAuthError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      if (error) throw error;
      setLoginPassword('');
    } catch (error) {
      console.error('Erro ao entrar na administração:', error);
      setAuthError('Não foi possível entrar. Confira o e-mail e a senha da conta.');
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error) {
      console.error('Erro ao sair da administração:', error);
      setAuthError('Não foi possível encerrar a sessão. Tente novamente.');
    }
  }

  // Upload de múltiplas imagens para o Supabase Storage
  async function uploadMultipleImages(files, folder) {
    const uploadedUrls = [];

    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('vivence-media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('vivence-media')
        .getPublicUrl(fileName);

      if (publicUrlData?.publicUrl) {
        uploadedUrls.push(publicUrlData.publicUrl);
      }
    }

    return uploadedUrls;
  }

  // --- FUNÇÕES DE ESPAÇOS ---
  function handleSelectSpaceFiles(e) {
    const selected = Array.from(e.target.files || []);
    setSpaceFiles((prev) => [...prev, ...selected]);
  }

  function handleRemoveSpaceNewFile(index) {
    setSpaceFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleRemoveSpaceExistingPhoto(index) {
    setSpaceExistingPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function startEditSpace(space) {
    setEditingSpaceId(space.id);
    setSpaceName(space.name || '');
    setSpaceDesc(space.description || '');
    setSpaceRate(space.daily_rate || '');
    setSpaceExistingPhotos(space.photos || []);
    setSpaceFiles([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditSpace() {
    setEditingSpaceId(null);
    setSpaceName('');
    setSpaceDesc('');
    setSpaceRate('');
    setSpaceExistingPhotos([]);
    setSpaceFiles([]);
  }

  async function handleSaveSpace(e) {
    e.preventDefault();
    setUploading(true);

    try {
      let newPhotoUrls = [];
      if (spaceFiles.length > 0) {
        newPhotoUrls = await uploadMultipleImages(spaceFiles, 'spaces');
      }

      const finalPhotos = [...spaceExistingPhotos, ...newPhotoUrls];

      if (editingSpaceId) {
        const { error } = await supabase
          .from('spaces')
          .update({
            name: spaceName,
            description: spaceDesc,
            daily_rate: parseFloat(spaceRate),
            photos: finalPhotos,
          })
          .eq('id', editingSpaceId);

        if (error) throw error;

        setModalConfig({
          isOpen: true,
          title: 'Espaço Atualizado!',
          message: 'As alterações do espaço foram salvas com sucesso.',
          type: 'success',
          onConfirm: null,
        });
      } else {
        const { error } = await supabase.from('spaces').insert([
          {
            name: spaceName,
            description: spaceDesc,
            daily_rate: parseFloat(spaceRate),
            photos: finalPhotos,
            status: 'ativo',
          },
        ]);

        if (error) throw error;

        setModalConfig({
          isOpen: true,
          title: 'Espaço Cadastrado!',
          message: 'O novo espaço e suas fotos foram salvos no catálogo.',
          type: 'success',
          onConfirm: null,
        });
      }

      cancelEditSpace();
      fetchData();
    } catch (err) {
      console.error('Erro ao salvar espaço:', err);
      setModalConfig({
        isOpen: true,
        title: 'Erro ao Salvar',
        message: getAdminSaveErrorMessage(err, 'o espaço'),
        type: 'error',
        onConfirm: null,
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleToggleSpaceStatus(space) {
    const newStatus = space.status === 'ativo' ? 'inativo' : 'ativo';
    const { error } = await supabase
      .from('spaces')
      .update({ status: newStatus })
      .eq('id', space.id);

    if (error) {
      setModalConfig({
        isOpen: true,
        title: 'Erro',
        message: 'Não foi possível alterar o status do espaço.',
        type: 'error',
        onConfirm: null,
      });
    } else {
      fetchData();
    }
  }

  function confirmDeleteSpace(space) {
    setModalConfig({
      isOpen: true,
      title: 'Excluir Espaço?',
      message: `Tem certeza que deseja excluir permanentemente o espaço "${space.name}"? Esta ação não pode ser desfeita.`,
      type: 'confirm',
      onConfirm: () => executeDeleteSpace(space.id),
    });
  }

  async function executeDeleteSpace(id) {
    const { error } = await supabase.from('spaces').delete().eq('id', id);
    if (error) {
      setModalConfig({
        isOpen: true,
        title: 'Erro ao Excluir',
        message: 'Não foi possível excluir o espaço. Verifique se não há reservas vinculadas a ele.',
        type: 'error',
        onConfirm: null,
      });
    } else {
      if (editingSpaceId === id) cancelEditSpace();
      setModalConfig({
        isOpen: true,
        title: 'Excluído!',
        message: 'O espaço foi removido com sucesso.',
        type: 'success',
        onConfirm: null,
      });
      fetchData();
    }
  }

  // --- FUNÇÕES DE BRINQUEDOS ---
  function handleSelectToyFiles(e) {
    const selected = Array.from(e.target.files || []);
    setToyFiles((prev) => [...prev, ...selected]);
  }

  function handleRemoveToyNewFile(index) {
    setToyFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleRemoveToyExistingPhoto(index) {
    setToyExistingPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function startEditToy(toy) {
    setEditingToyId(toy.id);
    setToyName(toy.name || '');
    setToyDesc(toy.description || '');
    setToyRate(toy.daily_rate || '');
    setToyQty(String(toy.total_quantity || '1'));
    setToyExistingPhotos(toy.photos || []);
    setToyFiles([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function cancelEditToy() {
    setEditingToyId(null);
    setToyName('');
    setToyDesc('');
    setToyRate('');
    setToyQty('1');
    setToyExistingPhotos([]);
    setToyFiles([]);
  }

  async function handleSaveToy(e) {
    e.preventDefault();
    setUploading(true);

    try {
      let newPhotoUrls = [];
      if (toyFiles.length > 0) {
        newPhotoUrls = await uploadMultipleImages(toyFiles, 'toys');
      }

      const finalPhotos = [...toyExistingPhotos, ...newPhotoUrls];

      if (editingToyId) {
        const { error } = await supabase
          .from('toys')
          .update({
            name: toyName,
            description: toyDesc,
            daily_rate: parseFloat(toyRate),
            total_quantity: parseInt(toyQty, 10),
            photos: finalPhotos,
          })
          .eq('id', editingToyId);

        if (error) throw error;

        setModalConfig({
          isOpen: true,
          title: 'Brinquedo Atualizado!',
          message: 'Os dados do brinquedo foram atualizados com sucesso.',
          type: 'success',
          onConfirm: null,
        });
      } else {
        const { error } = await supabase.from('toys').insert([
          {
            name: toyName,
            description: toyDesc,
            daily_rate: parseFloat(toyRate),
            total_quantity: parseInt(toyQty, 10),
            photos: finalPhotos,
            status: 'disponivel',
          },
        ]);

        if (error) throw error;

        setModalConfig({
          isOpen: true,
          title: 'Brinquedo Cadastrado!',
          message: 'O brinquedo e suas fotos foram adicionados ao estoque.',
          type: 'success',
          onConfirm: null,
        });
      }

      cancelEditToy();
      fetchData();
    } catch (err) {
      console.error('Erro ao salvar brinquedo:', err);
      setModalConfig({
        isOpen: true,
        title: 'Erro ao Salvar',
        message: getAdminSaveErrorMessage(err, 'o brinquedo'),
        type: 'error',
        onConfirm: null,
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveMonitorRate(event) {
    event.preventDefault();
    const rate = Number(monitorDailyRate);

    if (!Number.isFinite(rate) || rate < 0) {
      setModalConfig({
        isOpen: true,
        title: 'Valor inválido',
        message: 'Informe um valor válido, igual ou maior que zero.',
        type: 'error',
        onConfirm: null,
      });
      return;
    }

    setSavingMonitorRate(true);
    try {
      const { data, error } = await supabase
        .from('rental_settings')
        .update({
          monitor_daily_rate: rate,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Configuração do monitor não encontrada.');

      setModalConfig({
        isOpen: true,
        title: 'Valor atualizado',
        message: 'O valor da diária do monitor foi salvo.',
        type: 'success',
        onConfirm: null,
      });
    } catch (error) {
      console.error('Erro ao salvar o valor do monitor:', error);
      setModalConfig({
        isOpen: true,
        title: 'Erro ao salvar',
        message: 'Não foi possível salvar. Confira se a migração de reservas foi aplicada e tente novamente.',
        type: 'error',
        onConfirm: null,
      });
    } finally {
      setSavingMonitorRate(false);
    }
  }

  async function handleToggleToyStatus(toy) {
    const newStatus = toy.status === 'disponivel' ? 'indisponivel' : 'disponivel';
    const { error } = await supabase
      .from('toys')
      .update({ status: newStatus })
      .eq('id', toy.id);

    if (error) {
      setModalConfig({
        isOpen: true,
        title: 'Erro',
        message: 'Não foi possível alterar o status do brinquedo.',
        type: 'error',
        onConfirm: null,
      });
    } else {
      fetchData();
    }
  }

  function confirmDeleteToy(toy) {
    setModalConfig({
      isOpen: true,
      title: 'Excluir Brinquedo?',
      message: `Tem certeza que deseja excluir permanentemente o brinquedo "${toy.name}"? Esta ação não pode ser desfeita.`,
      type: 'confirm',
      onConfirm: () => executeDeleteToy(toy.id),
    });
  }

  async function executeDeleteToy(id) {
    const { error } = await supabase.from('toys').delete().eq('id', id);
    if (error) {
      setModalConfig({
        isOpen: true,
        title: 'Erro ao Excluir',
        message: 'Não foi possível excluir o brinquedo. Verifique se não há locações vinculadas.',
        type: 'error',
        onConfirm: null,
      });
    } else {
      if (editingToyId === id) cancelEditToy();
      setModalConfig({
        isOpen: true,
        title: 'Excluído!',
        message: 'O brinquedo foi removido do estoque.',
        type: 'success',
        onConfirm: null,
      });
      fetchData();
    }
  }

  if (authLoading) {
    return (
      <main className="min-vh-100 d-flex align-items-center justify-content-center bg-vivence-app p-3">
        <div className="card-vivence p-5 text-center text-vivence-body">
          <i className="fa-solid fa-spinner fa-spin me-2"></i>
          Verificando acesso...
        </div>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="min-vh-100 d-flex align-items-center justify-content-center bg-vivence-app p-3">
        <section className="card-vivence p-4 p-md-5 w-100" style={{ maxWidth: '440px' }}>
          <div className="text-center mb-4">
            <i className="fa-solid fa-leaf fs-1 text-vivence-primary mb-3"></i>
            <h1 className="h3 fw-bold text-vivence-dark">Espaço Vivence</h1>
            <p className="text-vivence-body mb-0">Entre para acessar a administração.</p>
          </div>
          {authError && <div className="alert alert-danger" role="alert">{authError}</div>}
          <form onSubmit={handleSignIn}>
            <div className="mb-3">
              <label htmlFor="admin-login-email" className="form-label fw-semibold">
                Usuário (e-mail)
              </label>
              <input
                id="admin-login-email"
                type="email"
                autoComplete="username"
                className="form-control input-vivence"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                required
              />
            </div>
            <div className="mb-4">
              <label htmlFor="admin-login-password" className="form-label fw-semibold">
                Senha
              </label>
              <input
                id="admin-login-password"
                type="password"
                autoComplete="current-password"
                className="form-control input-vivence"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-vivence-primary w-100" disabled={signingIn}>
              {signingIn ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (isAdmin === null) {
    return (
      <main className="min-vh-100 d-flex align-items-center justify-content-center bg-vivence-app p-3">
        <div className="card-vivence p-5 text-center text-vivence-body">
          <i className="fa-solid fa-spinner fa-spin me-2"></i>
          Confirmando permissão administrativa...
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-vh-100 d-flex align-items-center justify-content-center bg-vivence-app p-3">
        <section className="card-vivence p-4 p-md-5 w-100 text-center" style={{ maxWidth: '520px' }}>
          <i className="fa-solid fa-user-shield fs-1 text-vivence-brown mb-3"></i>
          <h1 className="h3 fw-bold text-vivence-dark">Acesso não autorizado</h1>
          <p className="text-vivence-body">
            Esta conta ainda não foi liberada para administrar o sistema.
          </p>
          {authError && <div className="alert alert-danger" role="alert">{authError}</div>}
          <button type="button" className="btn btn-vivence-outline" onClick={handleSignOut}>
            Sair da conta
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="admin-wrapper bg-vivence-app">
      <Sidebar
        activeMenu={activeMenu}
        setActiveMenu={setActiveMenu}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-grow-1 d-flex flex-column min-w-0">
        {/* Topo Responsivo */}
        <header className="bg-vivence-card border-bottom px-3 px-md-4 py-3 d-flex justify-content-between align-items-center sticky-top shadow-sm">
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className="btn btn-vivence-outline d-lg-none"
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir Menu"
            >
              <i className="fa-solid fa-bars"></i>
            </button>
            <div>
              <h1 className="fs-5 fw-bold m-0 text-vivence-dark text-capitalize">
                <i className="fa-solid fa-sliders me-2 text-vivence-primary"></i>
                {activeMenu === 'reservas' ? 'Reservas e Agenda' : activeMenu}
              </h1>
            </div>
          </div>

          <div className="d-flex align-items-center gap-2">
            <span className="small text-vivence-body d-none d-md-inline">
              {session.user.email}
            </span>
            <Link href="/" className="btn btn-vivence-outline btn-sm d-flex align-items-center gap-2">
              <i className="fa-solid fa-store"></i>
              <span className="d-none d-sm-inline">Portal</span>
            </Link>
            <button
              type="button"
              className="btn btn-vivence-outline btn-sm"
              onClick={handleSignOut}
              aria-label="Sair da administração"
              title="Sair"
            >
              <i className="fa-solid fa-right-from-bracket"></i>
            </button>
          </div>
        </header>

        {/* Conteúdo Principal */}
        <main className="container-fluid p-3 p-md-4">
          {authError && <div className="alert alert-danger" role="alert">{authError}</div>}
          {/* Resumo Rápido */}
          {activeMenu === 'cadastros' && (
            <div className="row g-3 mb-4">
              <div className="col-6 col-md-3">
                <div className="card-vivence p-3 d-flex align-items-center gap-3">
                  <div className="rounded-3 p-3 bg-vivence-primary d-flex align-items-center justify-content-center">
                    <i className="fa-solid fa-champagne-glasses fs-5"></i>
                  </div>
                  <div>
                    <small className="text-vivence-body d-block">Espaços</small>
                    <span className="fs-4 fw-bold text-vivence-dark">{spaces.length}</span>
                  </div>
                </div>
              </div>
              <div className="col-6 col-md-3">
                <div className="card-vivence p-3 d-flex align-items-center gap-3">
                  <div className="rounded-3 p-3 bg-vivence-brown d-flex align-items-center justify-content-center">
                    <i className="fa-solid fa-puzzle-piece fs-5"></i>
                  </div>
                  <div>
                    <small className="text-vivence-body d-block">Brinquedos</small>
                    <span className="fs-4 fw-bold text-vivence-dark">{toys.length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeMenu === 'cadastros' && (
            <>
              {/* Abas Espaços / Brinquedos */}
              <div className="d-flex flex-wrap gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => setActiveTab('spaces')}
                  className={`btn ${
                    activeTab === 'spaces' ? 'btn-vivence-primary' : 'btn-vivence-outline bg-vivence-card'
                  }`}
                >
                  <i className="fa-solid fa-building me-2"></i>
                  Espaços ({spaces.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('toys')}
                  className={`btn ${
                    activeTab === 'toys' ? 'btn-vivence-brown' : 'btn-vivence-outline bg-vivence-card'
                  }`}
                >
                  <i className="fa-solid fa-puzzle-piece me-2"></i>
                  Brinquedos ({toys.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('services')}
                  className={`btn ${
                    activeTab === 'services' ? 'btn-vivence-primary' : 'btn-vivence-outline bg-vivence-card'
                  }`}
                >
                  <i className="fa-solid fa-user-tie me-2"></i>
                  Serviços
                </button>
              </div>

              {/* ABA ESPAÇOS */}
              {activeTab === 'spaces' && (
                <div className="row g-4">
                  <div className="col-12 col-lg-5">
                    <div className="card-vivence p-4">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h5 className="fw-bold text-vivence-dark m-0">
                          <i
                            className={`fa-solid ${
                              editingSpaceId ? 'fa-pen-to-square' : 'fa-plus-circle'
                            } text-vivence-primary me-2`}
                          ></i>
                          {editingSpaceId ? 'Editar Espaço' : 'Novo Espaço'}
                        </h5>
                        {editingSpaceId && (
                          <button
                            type="button"
                            onClick={cancelEditSpace}
                            className="btn btn-vivence-outline btn-sm"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>

                      <form onSubmit={handleSaveSpace}>
                        <div className="mb-3">
                          <label className="form-label small fw-bold text-vivence-body">Nome do Espaço</label>
                          <input
                            type="text"
                            value={spaceName}
                            onChange={(e) => setSpaceName(e.target.value)}
                            placeholder="Ex: Salão Vivence Imperial"
                            className="form-control input-vivence"
                            required
                          />
                        </div>
                        <div className="mb-3">
                          <label className="form-label small fw-bold text-vivence-body">Descrição e Estrutura</label>
                          <textarea
                            value={spaceDesc}
                            onChange={(e) => setSpaceDesc(e.target.value)}
                            placeholder="Descreva churrasqueira, piscina, capacidade..."
                            className="form-control input-vivence"
                            rows="3"
                          />
                        </div>
                        <div className="mb-3">
                          <label className="form-label small fw-bold text-vivence-body">Valor da Diária (R$)</label>
                          <div className="input-group">
                            <span className="input-group-text bg-vivence-subtle border-0 fw-bold text-vivence-dark">R$</span>
                            <input
                              type="number"
                              step="0.01"
                              value={spaceRate}
                              onChange={(e) => setSpaceRate(e.target.value)}
                              placeholder="0,00"
                              className="form-control input-vivence"
                              required
                            />
                          </div>
                        </div>

                        {/* Fotos Atuais e Novas Fotos do Espaço */}
                        <div className="mb-4">
                          <label className="form-label small fw-bold text-vivence-body">
                            <i className="fa-solid fa-camera me-1 text-vivence-primary"></i>
                            Fotos do Espaço
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleSelectSpaceFiles}
                            className="form-control input-vivence"
                          />

                          {(spaceExistingPhotos.length > 0 || spaceFiles.length > 0) && (
                            <div className="photo-thumb-strip mt-2">
                              {spaceExistingPhotos.map((url, idx) => (
                                <div key={`exist-${idx}`} className="photo-preview-wrapper">
                                  <img src={url} alt="Salva" className="photo-thumb-item" />
                                  <button
                                    type="button"
                                    className="photo-remove-btn"
                                    onClick={() => handleRemoveSpaceExistingPhoto(idx)}
                                    title="Remover esta foto"
                                  >
                                    <i className="fa-solid fa-xmark"></i>
                                  </button>
                                </div>
                              ))}
                              {spaceFiles.map((file, idx) => (
                                <div key={`new-${idx}`} className="photo-preview-wrapper">
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt="Nova"
                                    className="photo-thumb-item"
                                  />
                                  <button
                                    type="button"
                                    className="photo-remove-btn"
                                    onClick={() => handleRemoveSpaceNewFile(idx)}
                                    title="Remover nova foto"
                                  >
                                    <i className="fa-solid fa-xmark"></i>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <button type="submit" className="btn-vivence-primary w-100" disabled={uploading}>
                          {uploading ? (
                            <>
                              <i className="fa-solid fa-spinner fa-spin me-2"></i>
                              Salvando...
                            </>
                          ) : (
                            <>
                              <i className="fa-solid fa-floppy-disk me-2"></i>
                              {editingSpaceId ? 'Salvar Alterações' : 'Salvar Espaço'}
                            </>
                          )}
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="col-12 col-lg-7">
                    <div className="card-vivence p-4">
                      <h5 className="fw-bold text-vivence-dark mb-3">
                        <i className="fa-solid fa-list-check text-vivence-primary me-2"></i>
                        Espaços Cadastrados
                      </h5>
                      {spaces.length === 0 ? (
                        <div className="text-center py-5 text-vivence-body">
                          <i className="fa-solid fa-folder-open fs-1 mb-2 d-block text-vivence-muted"></i>
                          Nenhum espaço cadastrado até o momento.
                        </div>
                      ) : (
                        <div className="row g-3">
                          {spaces.map((s) => {
                            const isActive = s.status === 'ativo';
                            return (
                              <div key={s.id} className="col-12 col-md-6">
                                <div className="p-3 rounded-3 border h-100 d-flex flex-column justify-content-between bg-vivence-app">
                                  <div>
                                    {s.photos && s.photos.length > 0 && (
                                      <div className="mb-2">
                                        <img
                                          src={s.photos[0]}
                                          alt={s.name}
                                          className="w-100 rounded-3"
                                          style={{ height: '130px', objectFit: 'cover' }}
                                        />
                                        {s.photos.length > 1 && (
                                          <div className="photo-thumb-strip">
                                            {s.photos.map((url, i) => (
                                              <img key={i} src={url} alt="Miniatura" className="photo-thumb-item" />
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div className="d-flex justify-content-between align-items-start mb-1">
                                      <h6 className="fw-bold text-vivence-dark m-0">{s.name}</h6>
                                      <span
                                        className={`badge rounded-pill ${
                                          isActive ? 'badge-vivence-success' : 'badge-vivence-error'
                                        }`}
                                      >
                                        {isActive ? 'Ativo' : 'Inativo'}
                                      </span>
                                    </div>
                                    <p className="small text-vivence-body mb-2">
                                      {s.description || 'Sem descrição cadastrada.'}
                                    </p>
                                  </div>

                                  <div>
                                    <div className="pt-2 border-top d-flex justify-content-between align-items-center mb-3">
                                      <span className="small text-vivence-body">Diária</span>
                                      <span className="fw-bold text-vivence-primary">R$ {s.daily_rate}</span>
                                    </div>

                                    {/* Botões de Ação: Editar, Ativar/Desativar e Excluir */}
                                    <div className="d-flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => startEditSpace(s)}
                                        className="btn btn-vivence-outline btn-sm flex-grow-1"
                                        title="Editar"
                                      >
                                        <i className="fa-solid fa-pen me-1"></i> Editar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleSpaceStatus(s)}
                                        className="btn btn-vivence-outline btn-sm"
                                        title={isActive ? 'Desativar no Portal' : 'Ativar no Portal'}
                                      >
                                        <i className={`fa-solid ${isActive ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => confirmDeleteSpace(s)}
                                        className="btn btn-sm btn-vivence-error px-2"
                                        title="Excluir Permanentemente"
                                      >
                                        <i className="fa-solid fa-trash"></i>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ABA BRINQUEDOS */}
              {activeTab === 'toys' && (
                <div className="row g-4">
                  <div className="col-12 col-lg-5">
                    <div className="card-vivence p-4">
                      <div className="d-flex justify-content-between align-items-center mb-3">
                        <h5 className="fw-bold text-vivence-dark m-0">
                          <i
                            className={`fa-solid ${
                              editingToyId ? 'fa-pen-to-square' : 'fa-plus-circle'
                            } text-vivence-brown me-2`}
                          ></i>
                          {editingToyId ? 'Editar Brinquedo' : 'Novo Brinquedo'}
                        </h5>
                        {editingToyId && (
                          <button
                            type="button"
                            onClick={cancelEditToy}
                            className="btn btn-vivence-outline btn-sm"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>

                      <form onSubmit={handleSaveToy}>
                        <div className="mb-3">
                          <label className="form-label small fw-bold text-vivence-body">Nome do Brinquedo</label>
                          <input
                            type="text"
                            value={toyName}
                            onChange={(e) => setToyName(e.target.value)}
                            placeholder="Ex: Cama Elástica 4m"
                            className="form-control input-vivence"
                            required
                          />
                        </div>
                        <div className="mb-3">
                          <label className="form-label small fw-bold text-vivence-body">Descrição / Segurança</label>
                          <textarea
                            value={toyDesc}
                            onChange={(e) => setToyDesc(e.target.value)}
                            placeholder="Dimensões, faixa etária recomendada..."
                            className="form-control input-vivence"
                            rows="3"
                          />
                        </div>
                        <div className="row g-2 mb-3">
                          <div className="col-7">
                            <label className="form-label small fw-bold text-vivence-body">Diária (R$)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={toyRate}
                              onChange={(e) => setToyRate(e.target.value)}
                              placeholder="0,00"
                              className="form-control input-vivence"
                              required
                            />
                          </div>
                          <div className="col-5">
                            <label className="form-label small fw-bold text-vivence-body">Qtd. Estoque</label>
                            <input
                              type="number"
                              min="1"
                              value={toyQty}
                              onChange={(e) => setToyQty(e.target.value)}
                              className="form-control input-vivence"
                              required
                            />
                          </div>
                        </div>

                        {/* Fotos Atuais e Novas Fotos do Brinquedo */}
                        <div className="mb-4">
                          <label className="form-label small fw-bold text-vivence-body">
                            <i className="fa-solid fa-camera me-1 text-vivence-brown"></i>
                            Fotos do Brinquedo
                          </label>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleSelectToyFiles}
                            className="form-control input-vivence"
                          />
                          {(toyExistingPhotos.length > 0 || toyFiles.length > 0) && (
                            <div className="photo-thumb-strip mt-2">
                              {toyExistingPhotos.map((url, idx) => (
                                <div key={`exist-toy-${idx}`} className="photo-preview-wrapper">
                                  <img src={url} alt="Salva" className="photo-thumb-item" />
                                  <button
                                    type="button"
                                    className="photo-remove-btn"
                                    onClick={() => handleRemoveToyExistingPhoto(idx)}
                                    title="Remover esta foto"
                                  >
                                    <i className="fa-solid fa-xmark"></i>
                                  </button>
                                </div>
                              ))}
                              {toyFiles.map((file, idx) => (
                                <div key={`new-toy-${idx}`} className="photo-preview-wrapper">
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt="Nova"
                                    className="photo-thumb-item"
                                  />
                                  <button
                                    type="button"
                                    className="photo-remove-btn"
                                    onClick={() => handleRemoveToyNewFile(idx)}
                                    title="Remover nova foto"
                                  >
                                    <i className="fa-solid fa-xmark"></i>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <button type="submit" className="btn-vivence-brown w-100" disabled={uploading}>
                          {uploading ? (
                            <>
                              <i className="fa-solid fa-spinner fa-spin me-2"></i>
                              Salvando...
                            </>
                          ) : (
                            <>
                              <i className="fa-solid fa-floppy-disk me-2"></i>
                              {editingToyId ? 'Salvar Alterações' : 'Salvar Brinquedo'}
                            </>
                          )}
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="col-12 col-lg-7">
                    <div className="card-vivence p-4">
                      <h5 className="fw-bold text-vivence-dark mb-3">
                        <i className="fa-solid fa-boxes-stacked text-vivence-brown me-2"></i>
                        Estoque de Brinquedos
                      </h5>
                      {toys.length === 0 ? (
                        <div className="text-center py-5 text-vivence-body">
                          <i className="fa-solid fa-box-open fs-1 mb-2 d-block text-vivence-muted"></i>
                          Nenhum brinquedo cadastrado até o momento.
                        </div>
                      ) : (
                        <div className="row g-3">
                          {toys.map((t) => {
                            const isAvailable = t.status === 'disponivel';
                            return (
                              <div key={t.id} className="col-12 col-md-6">
                                <div className="p-3 rounded-3 border h-100 d-flex flex-column justify-content-between bg-vivence-app">
                                  <div>
                                    {t.photos && t.photos.length > 0 && (
                                      <div className="mb-2">
                                        <img
                                          src={t.photos[0]}
                                          alt={t.name}
                                          className="w-100 rounded-3"
                                          style={{ height: '130px', objectFit: 'cover' }}
                                        />
                                        {t.photos.length > 1 && (
                                          <div className="photo-thumb-strip">
                                            {t.photos.map((url, i) => (
                                              <img key={i} src={url} alt="Miniatura" className="photo-thumb-item" />
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                    <div className="d-flex justify-content-between align-items-start mb-1">
                                      <h6 className="fw-bold text-vivence-dark m-0">{t.name}</h6>
                                      <span
                                        className={`badge rounded-pill ${
                                          isAvailable ? 'badge-vivence-success' : 'badge-vivence-error'
                                        }`}
                                      >
                                        {isAvailable ? `Ativo (${t.total_quantity})` : 'Inativo'}
                                      </span>
                                    </div>
                                    <p className="small text-vivence-body mb-2">
                                      {t.description || 'Sem descrição cadastrada.'}
                                    </p>
                                  </div>

                                  <div>
                                    <div className="pt-2 border-top d-flex justify-content-between align-items-center mb-3">
                                      <span className="small text-vivence-body">Diária</span>
                                      <span className="fw-bold text-vivence-primary">R$ {t.daily_rate}</span>
                                    </div>

                                    {/* Botões de Ação: Editar, Ativar/Desativar e Excluir */}
                                    <div className="d-flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => startEditToy(t)}
                                        className="btn btn-vivence-outline btn-sm flex-grow-1"
                                        title="Editar"
                                      >
                                        <i className="fa-solid fa-pen me-1"></i> Editar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleToggleToyStatus(t)}
                                        className="btn btn-vivence-outline btn-sm"
                                        title={isAvailable ? 'Desativar no Portal' : 'Ativar no Portal'}
                                      >
                                        <i className={`fa-solid ${isAvailable ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => confirmDeleteToy(t)}
                                        className="btn btn-sm btn-vivence-error px-2"
                                        title="Excluir Permanentemente"
                                      >
                                        <i className="fa-solid fa-trash"></i>
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'services' && (
                <div className="row g-4">
                  <div className="col-12 col-lg-6">
                    <div className="card-vivence p-4">
                      <h5 className="fw-bold text-vivence-dark mb-2">
                        <i className="fa-solid fa-user-tie text-vivence-primary me-2"></i>
                        Serviço de monitor
                      </h5>
                      <p className="text-vivence-body">
                        Cadastre o valor cobrado por diária. O cliente poderá solicitar um monitor junto com o espaço,
                        os brinquedos ou ambos.
                      </p>
                      <form onSubmit={handleSaveMonitorRate}>
                        <label htmlFor="monitor-daily-rate" className="form-label small fw-bold text-vivence-body">
                          Valor da diária (R$)
                        </label>
                        <div className="input-group mb-3">
                          <span className="input-group-text bg-vivence-subtle border-0 fw-bold text-vivence-dark">
                            R$
                          </span>
                          <input
                            id="monitor-daily-rate"
                            type="number"
                            min="0"
                            step="0.01"
                            value={monitorDailyRate}
                            onChange={(event) => setMonitorDailyRate(event.target.value)}
                            className="form-control input-vivence"
                            required
                          />
                        </div>
                        <button
                          type="submit"
                          className="btn-vivence-primary"
                          disabled={savingMonitorRate}
                        >
                          {savingMonitorRate ? 'Salvando...' : 'Salvar valor'}
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeMenu === 'reservas' && <ReservationsAgenda />}

          {activeMenu !== 'cadastros' && activeMenu !== 'reservas' && (
            <div className="card-vivence p-5 text-center">
              <i className="fa-solid fa-gears fs-1 text-vivence-primary mb-3 d-block"></i>
              <h4 className="fw-bold text-vivence-dark text-capitalize">Módulo de {activeMenu}</h4>
              <p className="text-vivence-body mb-0">
                Selecione uma opção ou continue configurando os itens deste módulo.
              </p>
            </div>
          )}
        </main>
      </div>

      <Modal
        isOpen={modalConfig.isOpen}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        onConfirm={modalConfig.onConfirm}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false, onConfirm: null })}
      />
    </div>
  );
}