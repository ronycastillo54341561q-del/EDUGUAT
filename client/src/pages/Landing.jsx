import { useEffect } from 'react';
import usePageTitle from '../hooks/usePageTitle';
import Header from '../components/landing/Header';
import Hero from '../components/landing/Hero';
import Features from '../components/landing/Features';
import Showcase from '../components/landing/Showcase';
import ComoFunciona from '../components/landing/ComoFunciona';
import Benefits from '../components/landing/Benefits';
import Contact from '../components/landing/Contact';
import Footer from '../components/landing/Footer';
import './Landing.css';

const Landing = () => {
  usePageTitle('');

  useEffect(() => {
    document.documentElement.style.scrollBehavior = 'smooth';
    return () => {
      document.documentElement.style.scrollBehavior = '';
    };
  }, []);

  return (
    <div className="lp-page">
      <Header />
      <main>
        <Hero />
        <Features />
        <Showcase />
        <ComoFunciona />
        <Benefits />
        <Contact />
      </main>
      <Footer />
    </div>
  );
};

export default Landing;
