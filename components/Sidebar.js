'use client';

import Link from 'next/link';
import BrandMark from './BrandMark';

export default function Sidebar({ activeMenu = 'cadastros', setActiveMenu, isOpen, onClose }) {
  const menus = [
    { id: 'cadastros', label: 'Cadastros', icon: 'fa-solid fa-layer-group' },
    { id: 'reservas', label: 'Reservas e Agenda', icon: 'fa-solid fa-calendar-check' },
    { id: 'contratos', label: 'Contratos', icon: 'fa-solid fa-file-signature' },
    { id: 'fotos', label: 'Galeria de Fotos', icon: 'fa-solid fa-images' },
    { id: 'financeiro', label: 'Financeiro', icon: 'fa-solid fa-sack-dollar' },
  ];

  function handleSelect(id) {
    if (setActiveMenu) setActiveMenu(id);
    if (onClose) onClose();
  }

  return (
    <>
      {isOpen && <div className="sidebar-backdrop d-lg-none" onClick={onClose}></div>}

      <aside className={`sidebar-vivence shadow ${isOpen ? 'open' : ''}`}>
        <div>
          <div className="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom border-secondary">
            <div className="d-flex align-items-center gap-2">
              <BrandMark size={24} className="text-vivence-primary" />
              <div>
                <h2 className="fs-5 fw-bold m-0 text-vivence-light">Espaço Vivence</h2>
                <small className="text-vivence-muted d-block" style={{ fontSize: '0.7rem', letterSpacing: '1px' }}>
                  ADMINISTRAÇÃO
                </small>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm text-vivence-light d-lg-none"
              onClick={onClose}
              aria-label="Fechar menu"
            >
              <i className="fa-solid fa-xmark fs-5"></i>
            </button>
          </div>

          <nav>
            {menus.map((item) => {
              const isActive = activeMenu === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`sidebar-link ${isActive ? 'sidebar-link-active' : ''}`}
                >
                  <i className={`${item.icon} fa-fw`}></i>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-3 border-top border-secondary">
          <Link href="/" className="sidebar-link m-0">
            <i className="fa-solid fa-arrow-up-right-from-square fa-fw"></i>
            <span>Ver Portal Público</span>
          </Link>
        </div>
      </aside>
    </>
  );
}