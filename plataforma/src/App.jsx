import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, getToken, setToken, setOnUnauthorized } from './api'

const slugify = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)

const fecha = (s) => (s ? new Date(String(s).replace(' ', 'T')).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const TIPO_LABEL = { academia: 'Academia', institucion: 'Institución' }

export default function App() {
  const [logueado, setLogueado] = useState(!!getToken())
  useEffect(() => setOnUnauthorized(() => setLogueado(false)), [])
  return logueado
    ? <Panel onSalir={() => setLogueado(false)} />
    : <Login onEntrar={() => setLogueado(true)} />
}

// ── Login ───────────────────────────────────────────────────────────────

function Login({ onEntrar }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const enviar = async (e) => {
    e.preventDefault()
    setError(''); setCargando(true)
    try {
      const { token } = await api('/login', { method: 'POST', body: { email, password } })
      setToken(token)
      onEntrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={enviar}>
        <div className="brand">Edu<b>Guat</b> <span>Plataforma</span></div>
        <p className="muted">Gestión de academias e instituciones</p>
        <label>Correo
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label>Contraseña
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="alert">{error}</div>}
        <button className="btn btn--primary" disabled={cargando}>{cargando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}

// ── Panel ───────────────────────────────────────────────────────────────

function Panel({ onSalir }) {
  const [sedes, setSedes] = useState([])
  const [catalogo, setCatalogo] = useState({ catalogo: [], institucionDefault: [] })
  const [error, setError] = useState('')
  const [estado, setEstado] = useState('todas')
  const [tipo, setTipo] = useState('todos')
  const [q, setQ] = useState('')
  const [modal, setModal] = useState(null) // {tipo:'nueva'|'editar'|'admins'|'credenciales', sede?, datos?}

  const cargar = useCallback(async () => {
    try {
      setSedes(await api('/sedes'))
      setError('')
    } catch (err) { setError(err.message) }
  }, [])

  useEffect(() => {
    cargar()
    api('/modulos').then(setCatalogo).catch(() => {})
  }, [cargar])

  const salir = async () => {
    try { await api('/logout', { method: 'POST' }) } catch { /* sesión ya cerrada */ }
    setToken(null)
    onSalir()
  }

  const toggle = async (s) => {
    const accion = s.activo ? 'desactivar' : 'activar'
    const aviso = s.activo ? '\n\nSus usuarios no podrán iniciar sesión hasta que la actives de nuevo. Sus datos no se borran.' : ''
    if (!window.confirm(`¿Seguro que quieres ${accion} "${s.nombre}"?${aviso}`)) return
    try {
      await api(`/sedes/${s.id}/activo`, { method: 'PATCH', body: { activo: !s.activo } })
      cargar()
    } catch (err) { window.alert(err.message) }
  }

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return sedes.filter(s =>
      (estado === 'todas' || (estado === 'activas' ? s.activo : !s.activo)) &&
      (tipo === 'todos' || s.tipo === tipo) &&
      (!t || s.nombre.toLowerCase().includes(t) || s.id.includes(t) || (s.email_admin || '').includes(t)))
  }, [sedes, estado, tipo, q])

  const n = {
    activas: sedes.filter(s => s.activo).length,
    inactivas: sedes.filter(s => !s.activo).length,
    academias: sedes.filter(s => s.tipo === 'academia').length,
    instituciones: sedes.filter(s => s.tipo === 'institucion').length,
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">Edu<b>Guat</b> <span>Plataforma</span></div>
        <button className="btn btn--ghost" onClick={salir}>Cerrar sesión</button>
      </header>

      <main className="wrap">
        <div className="head">
          <div>
            <h1>Academias e instituciones</h1>
            <p className="muted">Clientes que trabajan con EduGuat.</p>
          </div>
          <button className="btn btn--primary" onClick={() => setModal({ tipo: 'nueva' })}>+ Nueva</button>
        </div>

        <div className="stats">
          <Stat label="Activas" valor={n.activas} />
          <Stat label="Inactivas" valor={n.inactivas} />
          <Stat label="Academias" valor={n.academias} />
          <Stat label="Instituciones" valor={n.instituciones} />
        </div>

        <div className="filtros">
          <div className="seg">
            {['todas', 'activas', 'inactivas'].map(v =>
              <button key={v} className={estado === v ? 'on' : ''} onClick={() => setEstado(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
          </div>
          <div className="seg">
            {[['todos', 'Todos'], ['academia', 'Academias'], ['institucion', 'Instituciones']].map(([v, l]) =>
              <button key={v} className={tipo === v ? 'on' : ''} onClick={() => setTipo(v)}>{l}</button>)}
          </div>
          <input className="buscar" placeholder="Buscar por nombre, ID o correo" value={q} onChange={e => setQ(e.target.value)} />
        </div>

        {error && <div className="alert">{error}</div>}

        <div className="tabla">
          <div className="fila fila--head">
            <span>Nombre</span><span>Tipo</span><span>Estado</span><span>Admin</span><span>Alta</span><span />
          </div>
          {visibles.map(s => (
            <div className={`fila ${s.activo ? '' : 'fila--off'}`} key={s.id}>
              <span><b>{s.nombre}</b><small>{s.id}</small></span>
              <span><i className={`chip chip--${s.tipo}`}>{TIPO_LABEL[s.tipo]}</i></span>
              <span><i className={`dot ${s.activo ? 'dot--on' : ''}`} />{s.activo ? 'Activa' : 'Inactiva'}</span>
              <span className="trunc">{s.email_admin || '—'}</span>
              <span>{fecha(s.created_at)}</span>
              <span className="acciones">
                <button className="btn btn--sm" onClick={() => setModal({ tipo: 'admins', sede: s })}>Usuarios</button>
                <button className="btn btn--sm" onClick={() => setModal({ tipo: 'editar', sede: s })}>Editar</button>
                <button className={`btn btn--sm ${s.activo ? 'btn--warn' : 'btn--ok'}`} onClick={() => toggle(s)}>
                  {s.activo ? 'Desactivar' : 'Activar'}
                </button>
              </span>
            </div>
          ))}
          {!visibles.length && <div className="vacio">No hay resultados.</div>}
        </div>
      </main>

      {modal?.tipo === 'nueva' && (
        <NuevaSede catalogo={catalogo} onCerrar={() => setModal(null)}
          onCreada={(datos) => { cargar(); setModal({ tipo: 'credenciales', datos }) }} />
      )}
      {modal?.tipo === 'editar' && (
        <EditarSede sede={modal.sede} catalogo={catalogo} onCerrar={() => setModal(null)}
          onGuardada={() => { cargar(); setModal(null) }} />
      )}
      {modal?.tipo === 'admins' && <Admins sede={modal.sede} onCerrar={() => setModal(null)} />}
      {modal?.tipo === 'credenciales' && <Credenciales datos={modal.datos} onCerrar={() => setModal(null)} />}
    </div>
  )
}

const Stat = ({ label, valor }) => <div className="stat"><b>{valor}</b><span>{label}</span></div>

function Modal({ titulo, onCerrar, children }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onCerrar])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" role="dialog" aria-label={titulo}>
        <div className="modal__head"><h2>{titulo}</h2><button className="x" onClick={onCerrar} aria-label="Cerrar">×</button></div>
        {children}
      </div>
    </div>
  )
}

// Selector de módulos.  `null` = todos los módulos (comportamiento de las academias actuales).
function Modulos({ catalogo, valor, onChange }) {
  const todos = valor === null
  const set = new Set(valor || [])
  const alternar = (id) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange([...next])
  }
  return (
    <fieldset className="modulos">
      <legend>Módulos</legend>
      <label className="check check--todos">
        <input type="checkbox" checked={todos} onChange={e => onChange(e.target.checked ? null : catalogo.map(m => m.id))} />
        Todos los módulos
      </label>
      {!todos && (
        <div className="modulos__grid">
          {catalogo.map(m => (
            <label className="check" key={m.id}>
              <input type="checkbox" checked={set.has(m.id)} onChange={() => alternar(m.id)} /> {m.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )
}

function NuevaSede({ catalogo, onCerrar, onCreada }) {
  const [f, setF] = useState({ tipo: 'academia', nombre: '', id: '', info: '', email_admin: '', admin_password: '' })
  const [idManual, setIdManual] = useState(false)
  const [modulos, setModulos] = useState(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const id = idManual ? f.id : slugify(f.nombre)

  const cambiarTipo = (tipo) => {
    setF({ ...f, tipo })
    setModulos(tipo === 'institucion' ? catalogo.institucionDefault : null)
  }

  const enviar = async (e) => {
    e.preventDefault()
    if (!window.confirm(`Se creará la ${TIPO_LABEL[f.tipo].toLowerCase()} "${f.nombre}" con su propia base de datos "${id}". ¿Continuar?`)) return
    setError(''); setGuardando(true)
    try {
      const datos = await api('/sedes', { method: 'POST', body: { ...f, id, modulos } })
      onCreada(datos)
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal titulo="Nueva academia o institución" onCerrar={onCerrar}>
      <form className="form" onSubmit={enviar}>
        <div className="seg seg--full">
          <button type="button" className={f.tipo === 'academia' ? 'on' : ''} onClick={() => cambiarTipo('academia')}>Academia</button>
          <button type="button" className={f.tipo === 'institucion' ? 'on' : ''} onClick={() => cambiarTipo('institucion')}>Institución</button>
        </div>
        <label>Nombre
          <input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Ej. Sistec Quetzaltenango" required autoFocus />
        </label>
        <label>ID interno (nombre de la base de datos)
          <input value={id} onChange={e => { setIdManual(true); setF({ ...f, id: e.target.value }) }} pattern="[a-z][a-z0-9_]{2,59}" required />
          <small className="muted">No se puede cambiar después. Minúsculas, números y guion bajo.</small>
        </label>
        <label>Descripción (opcional)
          <input value={f.info} onChange={e => setF({ ...f, info: e.target.value })} />
        </label>
        <div className="row2">
          <label>Correo del administrador
            <input type="email" value={f.email_admin} onChange={e => setF({ ...f, email_admin: e.target.value })} required />
          </label>
          <label>Contraseña inicial
            <input value={f.admin_password} onChange={e => setF({ ...f, admin_password: e.target.value })} placeholder="Vacío = se genera una" minLength={8} />
          </label>
        </div>
        <Modulos catalogo={catalogo.catalogo} valor={modulos} onChange={setModulos} />
        {error && <div className="alert">{error}</div>}
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn--primary" disabled={guardando}>{guardando ? 'Creando… (puede tardar)' : 'Crear'}</button>
        </div>
      </form>
    </Modal>
  )
}

function EditarSede({ sede, catalogo, onCerrar, onGuardada }) {
  const [nombre, setNombre] = useState(sede.nombre)
  const [info, setInfo] = useState(sede.info || '')
  const [modulos, setModulos] = useState(sede.modulos)
  const [error, setError] = useState('')

  const enviar = async (e) => {
    e.preventDefault()
    try {
      await api(`/sedes/${sede.id}`, { method: 'PUT', body: { nombre, info, modulos } })
      onGuardada()
    } catch (err) { setError(err.message) }
  }

  return (
    <Modal titulo={`Editar · ${sede.nombre}`} onCerrar={onCerrar}>
      <form className="form" onSubmit={enviar}>
        <label>Nombre<input value={nombre} onChange={e => setNombre(e.target.value)} required /></label>
        <label>Descripción<input value={info} onChange={e => setInfo(e.target.value)} /></label>
        <Modulos catalogo={catalogo.catalogo} valor={modulos} onChange={setModulos} />
        <small className="muted">Los cambios de módulos se ven cuando sus usuarios vuelven a iniciar sesión.</small>
        {error && <div className="alert">{error}</div>}
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onCerrar}>Cancelar</button>
          <button className="btn btn--primary">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}

function Admins({ sede, onCerrar }) {
  const [admins, setAdmins] = useState(null)
  const [error, setError] = useState('')
  const [nueva, setNueva] = useState(null) // { email, password }

  useEffect(() => {
    api(`/sedes/${sede.id}/admins`).then(setAdmins).catch(err => setError(err.message))
  }, [sede.id])

  const restablecer = async (a) => {
    if (!window.confirm(`¿Generar una contraseña nueva para ${a.email}? La actual dejará de funcionar y se cerrará su sesión.`)) return
    try {
      const { password } = await api(`/sedes/${sede.id}/admins/${a.id}/password`, { method: 'POST' })
      setNueva({ email: a.email, password })
    } catch (err) { setError(err.message) }
  }

  return (
    <Modal titulo={`Administradores · ${sede.nombre}`} onCerrar={onCerrar}>
      {error && <div className="alert">{error}</div>}
      {!admins && !error && <p className="muted">Cargando…</p>}
      {admins && !admins.length && <p className="muted">Esta sede no tiene administradores.</p>}
      {admins?.map(a => (
        <div className="admin" key={a.id}>
          <div><b>{a.nombre}</b><small>{a.email}{a.activo ? '' : ' · inactivo'}</small></div>
          <button className="btn btn--sm" onClick={() => restablecer(a)}>Restablecer contraseña</button>
        </div>
      ))}
      {nueva && <Clave email={nueva.email} password={nueva.password} />}
    </Modal>
  )
}

function Clave({ email, password }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    await navigator.clipboard.writeText(`Usuario: ${email}\nContraseña: ${password}`)
    setCopiado(true)
  }
  return (
    <div className="clave">
      <p>Comparte estas credenciales. <b>La contraseña no se volverá a mostrar.</b></p>
      <div className="clave__box"><span>Usuario</span><code>{email}</code><span>Contraseña</span><code>{password}</code></div>
      <button className="btn btn--sm" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar'}</button>
    </div>
  )
}

function Credenciales({ datos, onCerrar }) {
  return (
    <Modal titulo={`${TIPO_LABEL[datos.tipo]} creada`} onCerrar={onCerrar}>
      <p><b>{datos.nombre}</b> ya está activa y aparece en el selector de sedes de EduGuat.</p>
      <Clave email={datos.email_admin} password={datos.password} />
      <div className="modal__foot"><button className="btn btn--primary" onClick={onCerrar}>Listo</button></div>
    </Modal>
  )
}
