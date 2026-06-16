import { useNavigate } from 'react-router-dom';
import logo from '../../assets/eduguat-logo-blanco-transparente.png';
import Icon from './Icon';
import './Footer.css';

const Footer = () => {
  const anio = new Date().getFullYear();
  const navigate = useNavigate();

  return (
    <footer className="lp-footer">
      <div className="lp-footer__inner">
        <div className="lp-footer__columna">
          <img src={logo} alt="EduGuat" className="lp-footer__logo-img" />
          <p className="lp-footer__descripcion">
            Sistema de gestión de información educativa diseñado para transformar la administración
            de instituciones en Guatemala.
          </p>
          <a
            className="lp-footer__sello"
            href="https://www.miguatemala.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="sparkles" size={16} />
            Un producto de MiGuatemala
          </a>
        </div>

        <div className="lp-footer__columna">
          <h4 className="lp-footer__titulo">Navegación</h4>
          <ul className="lp-footer__lista">
            <li><button onClick={() => navigate('/')}>Inicio</button></li>
            <li><button onClick={() => navigate('/preguntas-frecuentes')}>Preguntas frecuentes</button></li>
            <li><button onClick={() => navigate('/mas-sistemas')}>Más sistemas</button></li>
            <li><button onClick={() => navigate('/contacto')}>Contacto</button></li>
          </ul>
        </div>

        <div className="lp-footer__columna">
          <h4 className="lp-footer__titulo">Contacto</h4>
          <ul className="lp-footer__lista">
            <li>
              <a href="mailto:info@miguatemala.com">
                <Icon name="mail" size={16} /> info@miguatemala.com
              </a>
            </li>
            <li>
              <a href="https://wa.me/50254341561" target="_blank" rel="noopener noreferrer">
                <Icon name="whatsapp" size={16} /> +502 5434 1561
              </a>
            </li>
            <li>
              <a href="https://www.miguatemala.com" target="_blank" rel="noopener noreferrer">
                <Icon name="globe" size={16} /> miguatemala.com
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="lp-footer__bottom">
        <span>© {anio} EduGuat · MiGuatemala. Todos los derechos reservados.</span>
        <span className="lp-footer__bottom-derecha">
          Hecho con <Icon name="heart" size={14} className="lp-footer__corazon" /> en Guatemala
        </span>
      </div>
    </footer>
  );
};

export default Footer;
