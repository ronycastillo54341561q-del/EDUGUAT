import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import usePageTitle from '../hooks/usePageTitle';
import Loader from '../components/landing/Loader';
import ScrollProgress from '../components/landing/ScrollProgress';
import Header from '../components/landing/Header';
import Hero from '../components/landing/Hero';
import Features from '../components/landing/Features';
import Showcase from '../components/landing/Showcase';
import Galeria from '../components/landing/Galeria';
import ComoFunciona from '../components/landing/ComoFunciona';
import Benefits from '../components/landing/Benefits';
import FAQ from '../components/landing/FAQ';
import Contact from '../components/landing/Contact';
import Footer from '../components/landing/Footer';
import './Landing.css';

const Landing = () => {
  usePageTitle('');
  const { hash } = useLocation();

  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.documentElement.style.scrollBehavior = '';
    };
  }, []);

  // Si se llega con hash (p. ej. /#features desde otra página), posicionar.
  useEffect(() => {
    if (!hash) return;
    const id = hash.replace('#', '');
    const t = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
    return () => clearTimeout(t);
  }, [hash]);

  return (
    <div className="lp-page">
      <Loader />
      <ScrollProgress />
      <Header />
      <main>
        <Hero />
        <Features />
        <Showcase />
        <Galeria />
        <ComoFunciona />
        <Benefits />
        <FAQ />
        <Contact />
      </main>
      <Footer />
    </div>
  );
};

export default Landing;
