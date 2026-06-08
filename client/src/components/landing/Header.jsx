import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from '../../assets/eduguat-logo.png';
import './Header.css';

const Header = () => {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollA = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setMenuAbierto(false);
  };

  const irAlSistema = () => {
    setMenuAbierto(false);
    navigate('/acceder');
  };

  return (
    <header className={`lp-header ${scrolled ? 'lp-header--scrolled' : ''}`}>
      <div className="lp-header__inner">
        <div className="lp-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <img src={logo} alt="EduGuat" className="lp-logo__img" />
          <span className="lp-logo__sub">Sistema de Gestión Educativa</span>
        </div>

        <nav className={`lp-nav ${menuAbierto ? 'lp-nav--abierto' : ''}`}>
          <button className="lp-nav__link" onClick={() => scrollA('features')}>Características</button>
          <button className="lp-nav__link" onClick={() => scrollA('showcase')}>Módulos</button>
          <button className="lp-nav__link" onClick={() => scrollA('como-funciona')}>Cómo funciona</button>
          <button className="lp-nav__link" onClick={() => scrollA('benefits')}>Beneficios</button>
          <button className="lp-nav__link" onClick={() => scrollA('contact')}>Contacto</button>
          <button className="lp-nav__cta lp-nav__cta--ghost" onClick={() => scrollA('contact')}>Solicitar Demo</button>
          <button className="lp-btn-acceder lp-nav__acceder" onClick={irAlSistema}>Acceder al sistema →</button>
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
