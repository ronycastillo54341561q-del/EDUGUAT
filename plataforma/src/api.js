const KEY = 'plataforma_token'

export const getToken = () => localStorage.getItem(KEY)
export const setToken = (t) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY))

// Avisa a la app cuando la sesión deja de ser válida.
let onUnauthorized = () => {}
export const setOnUnauthorized = (fn) => { onUnauthorized = fn }

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/plataforma${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && path !== '/login') {
    setToken(null)
    onUnauthorized()
  }
  if (!res.ok) throw new Error(data.message || `Error ${res.status}`)
  return data
}

// Descarga un archivo autenticado (el token va en el header, no en la URL).
export async function descargar(path, nombre) {
  const res = await fetch(`/api/plataforma${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    if (res.status === 401) { setToken(null); onUnauthorized() }
    throw new Error(data.message || `Error ${res.status}`)
  }
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre })
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
