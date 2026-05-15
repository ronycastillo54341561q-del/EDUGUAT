import { useEffect } from 'react';
import Header from '../components/landing/Header';
import Hero from '../components/landing/Hero';
import Features from '../components/landing/Features';
import Benefits from '../components/landing/Benefits';
import Contact from '../components/landing/Contact';
import Footer from '../components/landing/Footer';
import './Landing.css';

const Landing = () => {
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
        <Benefits />
        <Contact />
      </main>
      <Footer />
    </div>
  );
};

export default Landing;
