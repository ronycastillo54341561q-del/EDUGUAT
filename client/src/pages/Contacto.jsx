import { useEffect } from 'react';
import usePageTitle from '../hooks/usePageTitle';
import ScrollProgress from '../components/landing/ScrollProgress';
import Header from '../components/landing/Header';
import Footer from '../components/landing/Footer';
import Contact from '../components/landing/Contact';
import Reveal from '../components/landing/Reveal';
import Icon from '../components/landing/Icon';
import './Landing.css';

const canales = [
  {
    icono: 'whatsapp',
    titulo: 'WhatsApp',
    texto: 'Respuesta rápida en horario laboral',
    valor: '+502 5434 1561',
    href: 'https://wa.me/50254341561',
  },
  {
    icono: 'mail',
    titulo: 'Correo',
    texto: 'Escríbenos cuando quieras',
    valor: 'info@miguatemala.com',
    href: 'mailto:info@miguatemala.com',
  },
  {
    icono: 'globe',
    titulo: 'Sitio',
    texto: 'Conoce todos nuestros sistemas',
    valor: 'miguatemala.com',
    href: 'https://www.miguatemala.com',
  },
];

const Contacto = () => {
  usePageTitle('Contacto');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="lp-page">
      <ScrollProgress />
      <Header />
      <main>
        <div className="lp-interna">
          <Reveal className="lp-interna__hero">
            <span className="lp-interna__migaja">
              <Icon name="phone" size={16} /> Hablemos
            </span>
            <h1 className="lp-interna__titulo">Contáctanos</h1>
            <p className="lp-interna__sub">
              ¿Listo para transformar la administración de tu institución? Elige tu canal favorito o
              déjanos tus datos y un asesor te contacta en menos de 24 horas hábiles.
            </p>
          </Reveal>

          <div className="lp-canales">
            {canales.map((c, i) => (
              <Reveal as="a" delay={i * 90} key={c.titulo}
                className="lp-canal" href={c.href} target="_blank" rel="noopener noreferrer">
                <span className="lp-canal__icono"><Icon name={c.icono} size={26} /></span>
                <span className="lp-canal__titulo">{c.titulo}</span>
                <span className="lp-canal__texto">{c.texto}</span>
                <span className="lp-canal__valor">{c.valor}</span>
              </Reveal>
            ))}
          </div>
        </div>

        <Contact />
      </main>
      <Footer />
    </div>
  );
};

export default Contacto;
