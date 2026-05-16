import logo from '../../assets/eduguat-logo-blanco-transparente.png';
import './Footer.css';

const Footer = () => {
  const anio = new Date().getFullYear();

  const scrollA = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <footer className="lp-footer">
      <div className="lp-footer__inner">
        <div className="lp-footer__columna">
          <img src={logo} alt="EduGuat" className="lp-footer__logo-img" />
          <p className="lp-footer__descripcion">
            Sistema de gestión de información educativa diseñado para transformar la administración
            de instituciones en Guatemala.
          </p>
        </div>

        <div className="lp-footer__columna">
          <h4 className="lp-footer__titulo">Enlaces rápidos</h4>
          <ul className="lp-footer__lista">
            <li><button onClick={() => scrollA('features')}>Características</button></li>
            <li><button onClick={() => scrollA('benefits')}>Beneficios</button></li>
            <li><button onClick={() => scrollA('contact')}>Contacto</button></li>
          </ul>
        </div>

        <div className="lp-footer__columna">
          <h4 className="lp-footer__titulo">Contacto</h4>
          <ul className="lp-footer__lista">
            <li>
              <a href="mailto:ronycastillo54341561q@gmail.com">✉️ ronycastillo54341561q@gmail.com</a>
            </li>
            <li>
              <a href="https://www.linkedin.com" target="_blank" rel="noopener noreferrer">💼 LinkedIn</a>
            </li>
            <li>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer">🐙 GitHub</a>
            </li>
          </ul>
        </div>
      </div>

      <div className="lp-footer__bottom">
        <span>© {anio} EDUGUAT. Todos los derechos reservados.</span>
        <span className="lp-footer__bottom-derecha">Hecho con ♥ en Guatemala</span>
      </div>
    </footer>
  );
};

export default Footer;
