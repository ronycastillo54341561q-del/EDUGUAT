const db = require('../config/db');
const { log } = require('../utils/bitacora');

const SCOPES = new Set(['global','diplomado','horario','laboratorio','dia','alumno']);

const fmt = (r) => ({
  ...r,
  multiplicador: r.multiplicador != null ? parseFloat(r.multiplicador) : 1,
});

// GET /config-pagos?anio=2026
const listar = async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  try {
    const [rows] = await db.query(
      `SELECT id, anio, scope_tipo, scope_valor, mes_inicio, mes_fin,
              multiplicador, descripcion, created_at
         FROM config_pagos WHERE anio = ? ORDER BY scope_tipo, scope_valor, mes_inicio`,
      [anio]
    );
    res.json(rows.map(fmt));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al listar configuración' });
  }
};

// POST /config-pagos
const crear = async (req, res) => {
  const { anio, scope_tipo, scope_valor, mes_inicio, mes_fin, multiplicador, descripcion } = req.body;
  if (!anio || !scope_tipo || !mes_inicio || !mes_fin)
    return res.status(400).json({ message: 'anio, scope_tipo, mes_inicio y mes_fin son requeridos' });
  if (!SCOPES.has(scope_tipo))
    return res.status(400).json({ message: 'scope_tipo inválido' });
  if (scope_tipo !== 'global' && !scope_valor)
    return res.status(400).json({ message: 'scope_valor requerido para este scope' });
  const mi = parseInt(mes_inicio), mf = parseInt(mes_fin);
  if (mi < 1 || mi > 12 || mf < 1 || mf > 12 || mi > mf)
    return res.status(400).json({ message: 'Rango de meses inválido' });
  const mult = parseFloat(multiplicador);
  if (!(mult > 0) || mult > 5)
    return res.status(400).json({ message: 'Multiplicador debe ser > 0 y <= 5' });

  try {
    const [r] = await db.query(
      `INSERT INTO config_pagos (anio, scope_tipo, scope_valor, mes_inicio, mes_fin, multiplicador, descripcion)
       VALUES (?,?,?,?,?,?,?)`,
      [anio, scope_tipo, scope_tipo === 'global' ? null : String(scope_valor),
       mi, mf, mult, descripcion || null]
    );
    log(req, 'crear', 'ConfigPagos',
      `Regla ${anio} ${scope_tipo}${scope_valor ? '='+scope_valor : ''} meses ${mi}-${mf} x${mult}`);
    const [[row]] = await db.query('SELECT * FROM config_pagos WHERE id=?', [r.insertId]);
    res.json(fmt(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear regla' });
  }
};

// PUT /config-pagos/:id
const actualizar = async (req, res) => {
  const { id } = req.params;
  const { scope_tipo, scope_valor, mes_inicio, mes_fin, multiplicador, descripcion } = req.body;
  if (!SCOPES.has(scope_tipo))
    return res.status(400).json({ message: 'scope_tipo inválido' });
  const mi = parseInt(mes_inicio), mf = parseInt(mes_fin);
  if (mi < 1 || mi > 12 || mf < 1 || mf > 12 || mi > mf)
    return res.status(400).json({ message: 'Rango de meses inválido' });
  const mult = parseFloat(multiplicador);
  if (!(mult > 0) || mult > 5)
    return res.status(400).json({ message: 'Multiplicador inválido' });
  try {
    await db.query(
      `UPDATE config_pagos SET scope_tipo=?, scope_valor=?, mes_inicio=?, mes_fin=?,
              multiplicador=?, descripcion=? WHERE id=?`,
      [scope_tipo, scope_tipo === 'global' ? null : String(scope_valor),
       mi, mf, mult, descripcion || null, id]
    );
    log(req, 'editar', 'ConfigPagos', `Regla ID ${id} actualizada`);
    const [[row]] = await db.query('SELECT * FROM config_pagos WHERE id=?', [id]);
    res.json(fmt(row));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar regla' });
  }
};

// DELETE /config-pagos/:id
const eliminar = async (req, res) => {
  try {
    await db.query('DELETE FROM config_pagos WHERE id=?', [req.params.id]);
    log(req, 'eliminar', 'ConfigPagos', `Regla ID ${req.params.id} eliminada`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar regla' });
  }
};

module.exports = { listar, crear, actualizar, eliminar };
