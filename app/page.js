'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../config/supabase';

export default function ClientPortalPage() {
  const [spaces, setSpaces] = useState([]);
  const [toys, setToys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [currentYear, setCurrentYear] = useState('');

  // Guarda qual foto está selecionada em cada card (pelo ID do item)
  const [selectedSpacePhoto, setSelectedSpacePhoto] = useState({});
  const [selectedToyPhoto, setSelectedToyPhoto] = useState({});

  useEffect(() => {
    document.body.dataset.module = 'portal';
    setCurrentYear(String(new Date().getFullYear()));

    async function fetchData() {
      try {
        const { data: spacesData } = await supabase.from('spaces').select('*').eq('status', 'ativo');
        const { data: toysData } = await supabase.from('toys').select('*').eq('status', 'disponivel');
        setSpaces(spacesData || []);
        setToys(toysData || []);
      } catch (error) {
        console.error('Erro ao carregar dados do portal:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  return (
    <div className="min-vh-100 d-flex flex-column bg-vivence-app">
      {/* Barra de Navegação Responsiva */}
      <nav className="navbar navbar-expand-lg bg-vivence-card border-bottom sticky-top shadow-sm py-3">
        <div className="container">
          <a className="navbar-brand fw-bold fs-4 text-vivence-primary d-flex align-items-center gap-2" href="/">
            <i className="fa-solid fa-leaf"></i>
            Espaço Vivence
          </a>

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
                <a className="nav-link text-vivence-dark fw-semibold" href="#espacos">
                  <i className="fa-solid fa-champagne-glasses me-1 text-vivence-primary"></i> Espaços
                </a>
              </li>
              <li className="nav-item">
                <a className="nav-link text-vivence-dark fw-semibold" href="#brinquedos">
                  <i className="fa-solid fa-puzzle-piece me-1 text-vivence-brown"></i> Brinquedos
                </a>
              </li>
              <li className="nav-item">
                <a className="btn btn-vivence-outline btn-sm w-100" href="/admin">
                  <i className="fa-solid fa-lock me-1"></i> Área Admin
                </a>
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

      {/* Banner Principal (Hero) */}
      <section className="hero-vivence text-center">
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
      </section>

      {/* Catálogo Principal */}
      <main className="container py-5 flex-grow-1">
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
                            <button type="button" className="btn-vivence-primary btn-sm">
                              <i className="fa-solid fa-paper-plane me-1"></i> Solicitar
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
                            <button type="button" className="btn-vivence-brown btn-sm">
                              <i className="fa-solid fa-cart-plus me-1"></i> Adicionar
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
      </main>

      {/* Rodapé */}
      <footer className="bg-vivence-dark py-4 text-center mt-auto">
        <div className="container">
          <p className="fw-semibold mb-1 text-vivence-light">
            <i className="fa-solid fa-leaf me-2 text-vivence-primary"></i>
            Espaço Vivence — Locação de Espaços e Brinquedos
          </p>
          <small className="text-vivence-muted">
            © {currentYear} Todos os direitos reservados.
          </small>
        </div>
      </footer>
    </div>
  );
}