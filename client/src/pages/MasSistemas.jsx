import { useEffect } from 'react';
import usePageTitle from '../hooks/usePageTitle';
import ScrollProgress from '../components/landing/ScrollProgress';
import Header from '../components/landing/Header';
import Footer from '../components/landing/Footer';
import Reveal from '../components/landing/Reveal';
import Icon from '../components/landing/Icon';
import './Landing.css';
import './MasSistemas.css';

// Familia de sistemas de MiGuatemala (la empresa que creó EduGuat).
const sistemas = [
  {
    icono: 'cap',
    nombre: 'EduGuat',
    actual: true,
    desc: 'Gestión escolar para colegios, academias e institutos: alumnos, pagos, asistencias, notas y multi-sede.',
  },
  {
    icono: 'heart',
    nombre: 'GymGuat',
    desc: 'Control de gimnasios y centros fitness: membresías, control de acceso y pagos recurrentes.',
  },
  {
    icono: 'receipt',
    nombre: 'InventyGuat',
    desc: 'Inventario + punto de venta + facturación electrónica (FEL) compatible con la SAT para comercios.',
  },
  {
    icono: 'grid',
    nombre: 'GorrasPolis GT',
    desc: 'Plataforma de e-commerce para montar y administrar tiendas en línea.',
  },
  {
    icono: 'building',
    nombre: 'InmueblesGT',
    desc: 'Gestión inmobiliaria: catálogo de propiedades y seguimiento de ventas y alquileres.',
  },
  {
    icono: 'sparkles',
    nombre: 'Software a la medida',
    desc: '¿No encuentras tu sistema? Desarrollamos soluciones a la medida de tu negocio.',
  },
];

const ventajas = [
  { icono: 'cloud', t: 'En la nube', d: 'Accede desde cualquier dispositivo, con respaldos automáticos.' },
  { icono: 'shield', t: 'Datos seguros', d: 'Información protegida y aislada por cada negocio.' },
  { icono: 'whatsapp', t: 'Soporte local', d: 'Atención en español, por WhatsApp y correo, desde Guatemala.' },
  { icono: 'receipt', t: 'Compatible con SAT', d: 'Facturación electrónica (FEL) donde tu negocio lo necesite.' },
];

const MasSistemas = () => {
  usePageTitle('Más sistemas — MiGuatemala');

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
              <Icon name="sparkles" size={16} /> Familia MiGuatemala
            </span>
            <h1 className="lp-interna__titulo">EduGuat es parte de algo más grande</h1>
            <p className="lp-interna__sub">
              EduGuat nació en <strong>MiGuatemala</strong>, una empresa guatemalteca de tecnología
              que crea sistemas para impulsar a los emprendedores del país. Si EduGuat resolvió tu
              colegio, descubre lo que MiGuatemala puede hacer por tus otros negocios.
            </p>
          </Reveal>

          <Reveal className="ms-marca">
            <div className="ms-marca__logo"><Icon name="sparkles" size={30} /></div>
            <div>
              <h2 className="ms-marca__nombre">MiGuatemala</h2>
              <p className="ms-marca__lema">«Tecnología guatemalteca que impulsa tu negocio»</p>
            </div>
            <a className="lp-btn-acceder ms-marca__cta" href="https://www.miguatemala.com" target="_blank" rel="noopener noreferrer">
              Visitar miguatemala.com <Icon name="arrow" size={18} />
            </a>
          </Reveal>

          <Reveal as="h2" className="ms-titulo-seccion">Nuestros sistemas</Reveal>
          <div className="ms-grid">
            {sistemas.map((s, i) => (
              <Reveal as="article" delay={i * 80} key={s.nombre}
                className={`ms-card ${s.actual ? 'ms-card--actual' : ''}`}>
                {s.actual && <span className="ms-card__badge">Estás aquí</span>}
                <span className="ms-card__icono"><Icon name={s.icono} size={28} /></span>
                <h3 className="ms-card__nombre">{s.nombre}</h3>
                <p className="ms-card__desc">{s.desc}</p>
              </Reveal>
            ))}
          </div>

          <Reveal as="h2" className="ms-titulo-seccion">Por qué elegir MiGuatemala</Reveal>
          <div className="ms-ventajas">
            {ventajas.map((v, i) => (
              <Reveal as="div" delay={i * 70} key={v.t} className="ms-ventaja">
                <span className="ms-ventaja__icono"><Icon name={v.icono} size={22} /></span>
                <div>
                  <strong>{v.t}</strong>
                  <p>{v.d}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal className="lp-cta-banner">
            <div>
              <h2>¿Tienes otro negocio que digitalizar?</h2>
              <p>Conoce todos los sistemas de MiGuatemala o cuéntanos tu idea para un desarrollo a la medida.</p>
            </div>
            <a className="lp-btn-acceder" href="https://www.miguatemala.com" target="_blank" rel="noopener noreferrer">
              Ir a MiGuatemala <Icon name="arrow" size={18} />
            </a>
          </Reveal>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default MasSistemas;
