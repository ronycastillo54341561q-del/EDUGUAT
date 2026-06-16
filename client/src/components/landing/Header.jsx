import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import logo from '../../assets/eduguat-logo.png';
import Icon from './Icon';
import './Header.css';

const Header = () => {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const enLanding = pathname === '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Link a una sección: si estamos en el landing hace scroll suave; si no,
  // navega a "/" con el hash para que el landing se posicione al cargar.
  const irSeccion = (id) => {
    setMenuAbierto(false);
    if (enLanding) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      navigate(`/#${id}`);
    }
  };

  const irPagina = (ruta) => {
    setMenuAbierto(false);
    navigate(ruta);
  };

  return (
    <header className={`lp-header ${scrolled ? 'lp-header--scrolled' : ''}`}>
      <div className="lp-header__inner">
        <div className="lp-logo" onClick={() => irPagina('/')}>
          <img src={logo} alt="EduGuat" className="lp-logo__img" />
          <span className="lp-logo__sub">Sistema de Gestión Educativa</span>
        </div>

        <nav className={`lp-nav ${menuAbierto ? 'lp-nav--abierto' : ''}`}>
          <button className="lp-nav__link" onClick={() => irSeccion('features')}>Características</button>
          <button className="lp-nav__link" onClick={() => irSeccion('showcase')}>Módulos</button>
          <button className="lp-nav__link" onClick={() => irPagina('/preguntas-frecuentes')}>Preguntas</button>
          <button className="lp-nav__link" onClick={() => irPagina('/mas-sistemas')}>Más sistemas</button>
          <button className="lp-nav__link" onClick={() => irPagina('/contacto')}>Contacto</button>
          <button className="lp-nav__cta lp-nav__cta--ghost" onClick={() => irPagina('/contacto')}>Solicitar Demo</button>
          <button className="lp-btn-acceder lp-nav__acceder" onClick={() => irPagina('/acceder')}>
            Acceder al sistema <Icon name="arrow" size={18} />
          </button>
        </nav>

        <button
          className={`lp-hamburguesa ${menuAbierto ? 'lp-hamburguesa--abierto' : ''}`}
          onClick={() => setMenuAbierto(!menuAbierto)}
          aria-label="Abrir menú"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
      </div>
    </header>
  );
};

export default Header;
