import { useState } from 'react';
import Icon from './Icon';
import './Contact.css';

const tipos = ['Solicitar demo', 'Hacer consulta', 'Información de precios'];

const Contact = () => {
  const [form, setForm] = useState({
    nombre: '',
    email: '',
    telefono: '',
    institucion: '',
    tipo: tipos[0],
    mensaje: '',
  });
  const [errores, setErrores] = useState({});
  const [enviado, setEnviado] = useState(false);

  const validar = () => {
    const e = {};
    if (!form.nombre.trim()) e.nombre = 'El nombre es requerido';
    if (!form.email.trim()) {
      e.email = 'El email es requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'El email no es válido';
    }
    return e;
  };

  const onChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (errores[e.target.name]) {
      setErrores({ ...errores, [e.target.name]: undefined });
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const e2 = validar();
    if (Object.keys(e2).length) {
      setErrores(e2);
      return;
    }
    // Sin backend de correo: abrimos el cliente de email del usuario con todo
    // prellenado hacia el correo corporativo info@miguatemala.com.
    const asunto = `EduGuat — ${form.tipo}${form.institucion ? ' · ' + form.institucion : ''}`;
    const cuerpo = [
      `Nombre: ${form.nombre}`,
      `Email: ${form.email}`,
      `Teléfono: ${form.telefono || '—'}`,
      `Institución: ${form.institucion || '—'}`,
      `Tipo de solicitud: ${form.tipo}`,
      '',
      'Mensaje:',
      form.mensaje || '—',
    ].join('\n');
    window.location.href =
      `mailto:info@miguatemala.com?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;

    setEnviado(true);
    setForm({ nombre: '', email: '', telefono: '', institucion: '', tipo: tipos[0], mensaje: '' });
    setTimeout(() => setEnviado(false), 6000);
  };

  return (
    <section id="contact" className="lp-contact">
      <div className="lp-contact__inner">
        <div className="lp-section__header">
          <span className="lp-section__pill">Contacto</span>
          <h2 className="lp-section__titulo">Hablemos sobre tu institución</h2>
          <p className="lp-section__descripcion">
            Estamos listos para mostrarte cómo EDUGUAT puede transformar tu administración educativa.
          </p>
        </div>

        <div className="lp-contact__grid">
          <aside className="lp-contact__info">
            <div className="lp-info__item">
              <span className="lp-info__icono"><Icon name="mail" size={22} /></span>
              <div>
                <div className="lp-info__label">Email</div>
                <a href="mailto:info@miguatemala.com" className="lp-info__valor">
                  info@miguatemala.com
                </a>
              </div>
            </div>
            <div className="lp-info__item">
              <span className="lp-info__icono"><Icon name="whatsapp" size={22} /></span>
              <div>
                <div className="lp-info__label">WhatsApp</div>
                <a href="https://wa.me/50254341561" target="_blank" rel="noopener noreferrer" className="lp-info__valor">
                  +502 5434 1561
                </a>
              </div>
            </div>
            <div className="lp-info__item">
              <span className="lp-info__icono"><Icon name="pin" size={22} /></span>
              <div>
                <div className="lp-info__label">Ubicación</div>
                <div className="lp-info__valor">Quetzaltenango, Guatemala</div>
              </div>
            </div>
            <div className="lp-info__item">
              <span className="lp-info__icono"><Icon name="clock" size={22} /></span>
              <div>
                <div className="lp-info__label">Disponibilidad</div>
                <div className="lp-info__valor">Lunes a Viernes, 9:00 AM - 6:00 PM</div>
              </div>
            </div>

            <div className="lp-info__nota">
              <strong>¿Listo para empezar?</strong>
              <p>Completa el formulario y un asesor se pondrá en contacto contigo en menos de 24 horas hábiles.</p>
            </div>
          </aside>

          <form className="lp-contact__form" onSubmit={onSubmit} noValidate>
            {enviado && (
              <div className="lp-form__confirmacion" role="status">
                <Icon name="tick" size={18} strokeWidth={2.6} /> ¡Mensaje enviado! Te contactaremos pronto.
              </div>
            )}

            <div className="lp-form__campo">
              <label htmlFor="nombre">Nombre completo *</label>
              <input
                id="nombre"
                name="nombre"
                type="text"
                value={form.nombre}
                onChange={onChange}
                className={errores.nombre ? 'lp-form__input--error' : ''}
                placeholder="Tu nombre"
              />
              {errores.nombre && <span className="lp-form__error">{errores.nombre}</span>}
            </div>

            <div className="lp-form__campo">
              <label htmlFor="email">Email *</label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={onChange}
                className={errores.email ? 'lp-form__input--error' : ''}
                placeholder="tu@email.com"
              />
              {errores.email && <span className="lp-form__error">{errores.email}</span>}
            </div>

            <div className="lp-form__fila">
              <div className="lp-form__campo">
                <label htmlFor="telefono">Teléfono</label>
                <input
                  id="telefono"
                  name="telefono"
                  type="tel"
                  value={form.telefono}
                  onChange={onChange}
                  placeholder="+502 ..."
                />
              </div>
              <div className="lp-form__campo">
                <label htmlFor="institucion">Institución Educativa</label>
                <input
                  id="institucion"
                  name="institucion"
                  type="text"
                  value={form.institucion}
                  onChange={onChange}
                  placeholder="Nombre del centro educativo"
                />
              </div>
            </div>

            <div className="lp-form__campo">
              <label htmlFor="tipo">Tipo de solicitud</label>
              <select id="tipo" name="tipo" value={form.tipo} onChange={onChange}>
                {tipos.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="lp-form__campo">
              <label htmlFor="mensaje">Mensaje</label>
              <textarea
                id="mensaje"
                name="mensaje"
                rows="4"
                value={form.mensaje}
                onChange={onChange}
                placeholder="Cuéntanos sobre tu institución..."
              />
            </div>

            <button type="submit" className="lp-form__submit">Enviar mensaje</button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default Contact;
