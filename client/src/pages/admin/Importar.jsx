import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import Sidebar from '../../components/Sidebar';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import './admin.css';
import './Importar.css';

/* =========================================================================
 * IMPORTAR DATOS — multi-tipo
 *
 * El módulo soporta varias plantillas:
 *   - alumnos
 *   - asistencia (semanal)
 *   - notas TAC
 *   - notas Diplomado
 *   - mecanografía
 *   - pagos (recibos de colegiatura)
 *   - recibos diplomados
 *
 * Cada tipo declara sus columnas, una validación local (espejo del backend)
 * y un endpoint POST.  Las que no son alumnos requieren un AÑO global, y
 * cada fila debe identificar un alumno existente por id, clave o
 * codigo_estudiante.
 * ========================================================================= */

const CODIGO_REGEX = /^[A-Z][0-9]{3}[A-Z]{3}$/;
const FECHA_REGEX  = /^\d{4}-\d{2}-\d{2}$/;
const DIAS_VALIDOS = new Set([
  'lunes','martes','miercoles','miércoles','jueves','viernes','sabado','sábado','domingo'
]);

const MESES_NOMBRES = ['enero','febrero','marzo','abril','mayo','junio',
                       'julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MES_LABEL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MES_ABREV = ['ENE','FEB','MAR','ABR','MAY','JUN',
                   'JUL','AGO','SEP','OCT','NOV','DIC'];
const MES_ALIAS = {
  enero: 1, ene: 1, '1': 1, '01': 1,
  febrero: 2, feb: 2, '2': 2, '02': 2,
  marzo: 3, mar: 3, '3': 3, '03': 3,
  abril: 4, abr: 4, '4': 4, '04': 4,
  mayo: 5, may: 5, '5': 5, '05': 5,
  junio: 6, jun: 6, '6': 6, '06': 6,
  julio: 7, jul: 7, '7': 7, '07': 7,
  agosto: 8, ago: 8, '8': 8, '08': 8,
  septiembre: 9, sep: 9, sept: 9, '9': 9, '09': 9,
  octubre: 10, oct: 10, '10': 10,
  noviembre: 11, nov: 11, '11': 11,
  diciembre: 12, dic: 12, '12': 12,
};

const ASIST_VALIDOS = new Set(['X','E','P','F','R']);
const ASIST_ALIAS = {
  x: 'X', a: 'X', asistio: 'X', asistió: 'X', presente: 'X',
  e: 'E', enfermo: 'E', enferma: 'E',
  p: 'P', permiso: 'P',
  f: 'F', falta: 'F', falto: 'F', faltó: 'F', ausente: 'F',
  r: 'R', recupero: 'R', recuperó: 'R', recuperado: 'R',
};

// El parser de XLSX puede entregar fechas como número serial Excel u objeto Date.
// Las convertimos a YYYY-MM-DD si vienen así; cualquier otra cosa se devuelve trim.
const cellToString = (v) => {
  if (v === undefined || v === null) return '';
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
};

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

// =============================================================================
// DEFINICIÓN DE LOS TIPOS DE IMPORTACIÓN
// =============================================================================
//
// Cada entrada describe:
//   - label/icon mostrados al usuario
//   - endpoint del backend
//   - cols: definición de las columnas (key, header, req, hint)
//   - sheet: nombre de la hoja en la plantilla
//   - filename: nombre del archivo descargado
//   - example: una fila ejemplo
//   - needsYear: si requiere seleccionar un año global (default false)
//   - validate(row): devuelve { clean, errors:[{field,msg}] }

const COL_ID = {
  key: 'identificador',
  header: 'identificador',
  req: true,
  hint: 'ID, clave o código del alumno (A000AAA). El sistema busca al alumno con cualquiera de esos.',
};

// Helper: normaliza nombre para comparar acentos/mayúsculas
const normNombreFront = (s) =>
  String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const TIPOS = {

  // ─────────────────────────────────────────────────────────────
  alumnos: {
    label: 'Alumnos',
    icon: '👨‍🎓',
    endpoint: '/importacion/alumnos',
    sheet: 'alumnos',
    filename: 'plantilla_importar_alumnos.xlsx',
    needsYear: false,
    descripcion: 'Crea alumnos completos con clave, usuario, contraseña y 12 mensualidades.',
    cols: [
      { key: 'nombre',            header: 'nombre',            req: true,  hint: 'Texto. Ej.: Juan Carlos' },
      { key: 'apellido',          header: 'apellido',          req: true,  hint: 'Texto. Ej.: López Ramírez' },
      { key: 'codigo_estudiante', header: 'codigo_estudiante', req: false, hint: 'Formato A000AAA (1 letra + 3 dígitos + 3 letras). Opcional.' },
      { key: 'fecha_inicio',      header: 'fecha_inicio',      req: false, hint: 'YYYY-MM-DD. Ej.: 2026-02-15' },
      { key: 'fecha_nacimiento',  header: 'fecha_nacimiento',  req: false, hint: 'YYYY-MM-DD' },
      { key: 'encargado',         header: 'encargado',         req: false, hint: 'Nombre del encargado' },
      { key: 'telefono',          header: 'telefono',          req: false, hint: 'Solo números' },
      { key: 'diplomado',         header: 'diplomado',         req: false, hint: 'Nombre exacto del diplomado del catálogo' },
      { key: 'tac',               header: 'tac',               req: false, hint: 'Código TAC' },
      { key: 'asesor',            header: 'asesor',            req: false, hint: 'Nombre del asesor' },
      { key: 'direccion',         header: 'direccion',         req: false, hint: 'Texto libre' },
      { key: 'establecimiento',   header: 'establecimiento',   req: false, hint: 'Nombre del establecimiento' },
      { key: 'observaciones',     header: 'observaciones',     req: false, hint: 'Texto libre' },
      { key: 'dia_clases1',       header: 'dia_clases1',       req: true,  hint: 'lunes, martes, miércoles, jueves, viernes, sábado o domingo' },
      { key: 'dia_clases2',       header: 'dia_clases2',       req: false, hint: 'Igual que dia_clases1, opcional' },
      { key: 'horario',           header: 'horario',           req: true,  hint: 'Ej.: 10:00 a 11:30' },
      { key: 'laboratorio',       header: 'laboratorio',       req: false, hint: 'Nombre del laboratorio' },
      { key: 'estado',            header: 'estado',            req: false, hint: 'activo o retirado (default: activo)' },
      { key: 'cuota_mensual',     header: 'cuota_mensual',     req: true,  hint: 'Número en quetzales. Ej.: 250' },
    ],
    example: {
      nombre: 'Ana Lucía', apellido: 'Pérez Méndez', codigo_estudiante: 'A123XYZ',
      fecha_inicio: '2026-02-15', fecha_nacimiento: '2008-09-03',
      encargado: 'Marta Méndez', telefono: '55512345',
      diplomado: 'Operador Windows', tac: '01', asesor: 'Lic. Roberto Soto',
      direccion: '5a calle 3-22 zona 1', establecimiento: 'Colegio San Pablo',
      observaciones: '', dia_clases1: 'lunes', dia_clases2: 'miércoles',
      horario: '10:00 a 11:30', laboratorio: 'Lab 1', estado: 'activo', cuota_mensual: 250,
    },
    validate: (row, getCell) => {
      const errors = [];
      const clean = {};
      for (const col of TIPOS.alumnos.cols) clean[col.key] = getCell(col.key);
      if (clean.codigo_estudiante) clean.codigo_estudiante = clean.codigo_estudiante.toUpperCase();
      if (!clean.estado) clean.estado = 'activo';

      if (!clean.nombre)       errors.push({ field: 'nombre',       msg: 'obligatorio' });
      if (!clean.apellido)     errors.push({ field: 'apellido',     msg: 'obligatorio' });
      if (!clean.dia_clases1)  errors.push({ field: 'dia_clases1',  msg: 'obligatorio' });
      if (!clean.horario)      errors.push({ field: 'horario',      msg: 'obligatorio' });
      if (clean.codigo_estudiante && !CODIGO_REGEX.test(clean.codigo_estudiante))
        errors.push({ field: 'codigo_estudiante', msg: 'formato A000AAA' });
      if (clean.fecha_inicio && !FECHA_REGEX.test(clean.fecha_inicio))
        errors.push({ field: 'fecha_inicio', msg: 'usar YYYY-MM-DD' });
      if (clean.fecha_nacimiento && !FECHA_REGEX.test(clean.fecha_nacimiento))
        errors.push({ field: 'fecha_nacimiento', msg: 'usar YYYY-MM-DD' });
      if (clean.dia_clases1 && !DIAS_VALIDOS.has(clean.dia_clases1.toLowerCase()))
        errors.push({ field: 'dia_clases1', msg: 'día no válido' });
      if (clean.dia_clases2 && !DIAS_VALIDOS.has(clean.dia_clases2.toLowerCase()))
        errors.push({ field: 'dia_clases2', msg: 'día no válido' });
      if (clean.estado && !['activo','retirado'].includes(clean.estado.toLowerCase()))
        errors.push({ field: 'estado', msg: 'usar activo o retirado' });
      const cuota = num(clean.cuota_mensual);
      if (!Number.isFinite(cuota) || cuota < 0)
        errors.push({ field: 'cuota_mensual', msg: 'número ≥ 0' });
      return { clean, errors };
    },
    resultadoColumnas: [
      { key: 'estado',     header: 'Estado' },
      { key: 'nombreFull', header: 'Alumno' },
      { key: 'clave',      header: 'Clave' },
      { key: 'usuario',    header: 'Usuario' },
      { key: 'password',   header: 'Contraseña' },
      { key: 'error',      header: 'Detalle' },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  asistencia: {
    label: 'Asistencia',
    icon: '📋',
    endpoint: '/importacion/asistencia',
    sheet: 'asistencia',
    filename: 'plantilla_importar_asistencia.xlsx',
    needsYear: true,
    wide: true,
    descripcion:
      'Una fila por alumno con sus 60 celdas semanales (12 meses × 5 semanas). ' +
      'Identificación por CLAVE + APELLIDOS Y NOMBRE. Estados: X (asistió), E (enfermo), ' +
      'P (permiso), F (falta), R (recuperó). Celdas vacías = sin cambio; "-" borra la celda.',
    // 62 columnas: clave, alumno y 60 celdas semanales
    cols: (() => {
      const c = [
        { key: 'clave',  header: 'clave',  req: true,  hint: 'Clave del alumno (debe existir)' },
        { key: 'nombre', header: 'alumno', req: true,  hint: 'Apellidos y nombre del alumno' },
      ];
      for (let m = 1; m <= 12; m++) {
        for (let s = 1; s <= 5; s++) {
          c.push({
            key:    `m${m}_s${s}`,
            header: `${MES_ABREV[m - 1]}-S${s}`,
            req:    false,
            hint:   'X, E, P, F, R o - (vacío)',
            mes:    m,
            semana: s,
          });
        }
      }
      return c;
    })(),
    example: {
      clave: '2025-001',
      nombre: 'Castillo Lopez Rony Alexander',
      m1_s1: 'X', m1_s2: 'X', m1_s3: 'X', m1_s4: 'R', m1_s5: '-',
      m2_s1: 'X', m2_s2: 'X', m2_s3: 'P', m2_s4: 'R', m2_s5: 'F',
      m3_s1: '-', m3_s2: 'X', m3_s3: 'X', m3_s4: 'X', m3_s5: 'X',
      m4_s1: '-', m4_s2: 'X', m4_s3: 'R', m4_s4: 'X', m4_s5: 'X',
    },
    validate: (row, getCell) => {
      const errors = [];
      const clean = {
        clave:  getCell('clave'),
        nombre: getCell('nombre'),
      };
      if (!clean.clave)  errors.push({ field: 'clave',  msg: 'obligatoria' });
      if (!clean.nombre) errors.push({ field: 'nombre', msg: 'obligatorio' });
      let alguna = false;
      for (let m = 1; m <= 12; m++) {
        for (let s = 1; s <= 5; s++) {
          const k = `m${m}_s${s}`;
          const v = String(getCell(k) || '').trim();
          clean[k] = v;
          if (!v) continue;
          if (v === '-') { alguna = true; continue; }
          const upper = v.toUpperCase();
          if (!ASIST_VALIDOS.has(upper) && !ASIST_ALIAS[v.toLowerCase()]) {
            errors.push({ field: k, msg: 'usar X, E, P, F, R o -' });
          } else {
            alguna = true;
          }
        }
      }
      // Eliminado: antes exigíamos al menos una celda con valor. Ahora se
      // permite importar filas vacías; el server las acepta y se cuentan
      // como "alumno encontrado, sin celdas para actualizar".
      void alguna;
      return { clean, errors };
    },
  },

  // ─────────────────────────────────────────────────────────────
  notasTac: {
    label: 'Notas TAC',
    icon: '📝',
    endpoint: '/importacion/notas-tac',
    sheet: 'notas_tac',
    filename: 'plantilla_importar_notas_tac.xlsx',
    needsYear: true,
    dynamic: true,   // las columnas se construyen leyendo /importacion/tacs
    descripcion: 'Importa las 4 notas por cada TAC de la academia (ej: tac01_nota1..nota4, tac02_nota1..nota4). La identificación es por CLAVE + NOMBRE COMPLETO. Las celdas vacías se ignoran (sin nota).',
    colsFijas: [
      { key: 'clave',  header: 'clave',  req: true, hint: 'Clave generada al alumno' },
      { key: 'nombre', header: 'nombre', req: true, hint: 'Nombre completo del alumno (Nombre Apellido). Debe coincidir con el del sistema.' },
    ],
    cols: [
      { key: 'clave',  header: 'clave',  req: true, hint: 'Clave generada al alumno' },
      { key: 'nombre', header: 'nombre', req: true, hint: 'Nombre completo del alumno (Nombre Apellido). Debe coincidir con el del sistema.' },
    ],
    example: { clave: '2025-001', nombre: 'Ana Lucía Pérez Méndez' },
    validate: (row, getCell) => {
      const tipo = TIPOS.notasTac;
      const errors = [];
      const clean = {};
      for (const col of tipo.cols) clean[col.key] = getCell(col.key);
      if (!clean.clave)  errors.push({ field: 'clave',  msg: 'obligatoria' });
      if (!clean.nombre) errors.push({ field: 'nombre', msg: 'obligatorio' });
      for (const col of tipo.cols) {
        if (col.key === 'clave' || col.key === 'nombre') continue;
        const v = clean[col.key];
        if (v === '' || v === undefined || v === null) continue;
        const n = num(v);
        if (!Number.isFinite(n) || n < 0 || n > 100)
          errors.push({ field: col.key, msg: '0-100' });
      }
      // Filas sin notas se aceptan: si el alumno existe, el server las
      // cuenta como "alumno encontrado, sin celdas para actualizar".
      return { clean, errors };
    },
  },

  // ─────────────────────────────────────────────────────────────
  notasDiplomado: {
    label: 'Notas Diplomado',
    icon: '🎓',
    endpoint: '/importacion/notas-diplomados',
    sheet: 'notas_diplomado',
    filename: 'plantilla_importar_notas_diplomado.xlsx',
    needsYear: true,
    dynamic: true,   // las columnas se construyen leyendo /importacion/diplomados-programas
    descripcion: 'Importa las notas por programa de cada diplomado de la academia. La identificación es por CLAVE + NOMBRE COMPLETO. Hay una columna por cada programa activo (Windows, Word, Scratch, Python, Photoshop, …).',
    // cols se completa en runtime; estos son sólo los fijos.
    colsFijas: [
      { key: 'clave',  header: 'clave',  req: true, hint: 'Clave del alumno (debe existir)' },
      { key: 'nombre', header: 'nombre', req: true, hint: 'Nombre completo del alumno (Nombre Apellido)' },
    ],
    cols: [
      { key: 'clave',  header: 'clave',  req: true, hint: 'Clave del alumno (debe existir)' },
      { key: 'nombre', header: 'nombre', req: true, hint: 'Nombre completo del alumno (Nombre Apellido)' },
    ],
    example: { clave: '2025-001', nombre: 'Ana Lucía Pérez Méndez' },
    validate: (row, getCell) => {
      // En modo dinámico, validamos clave+nombre y cada celda numérica.
      const tipo = TIPOS.notasDiplomado;
      const errors = [];
      const clean = {};
      for (const col of tipo.cols) clean[col.key] = getCell(col.key);
      if (!clean.clave)  errors.push({ field: 'clave',  msg: 'obligatoria' });
      if (!clean.nombre) errors.push({ field: 'nombre', msg: 'obligatorio' });
      for (const col of tipo.cols) {
        if (col.key === 'clave' || col.key === 'nombre') continue;
        const v = clean[col.key];
        if (v === '' || v === undefined || v === null) continue;
        const n = num(v);
        if (!Number.isFinite(n) || n < 0 || n > 100)
          errors.push({ field: col.key, msg: '0-100' });
      }
      // Filas sin notas se aceptan; el server las cuenta como
      // "alumno encontrado, sin celdas para actualizar".
      return { clean, errors };
    },
  },

  // ─────────────────────────────────────────────────────────────
  mecanografia: {
    label: 'Mecanografía',
    icon: '⌨️',
    endpoint: '/importacion/mecanografia',
    sheet: 'mecanografia',
    filename: 'plantilla_importar_mecanografia.xlsx',
    needsYear: true,
    descripcion:
      'Importa lecciones (l1..l20) y examen final de mecanografía por año. ' +
      'Identificación por CLAVE + APELLIDOS Y NOMBRE. Celdas vacías se ignoran; ' +
      'si la fila no trae notas igual cuenta como exitosa (alumno encontrado).',
    cols: [
      { key: 'clave',  header: 'clave',  req: true, hint: 'Clave del alumno (debe existir)' },
      { key: 'nombre', header: 'alumno', req: true, hint: 'Apellidos y nombre del alumno' },
      ...Array.from({ length: 20 }, (_, i) => ({
        key: `l${i + 1}`, header: `l${i + 1}`, req: false, hint: '0-100',
      })),
      { key: 'examen', header: 'examen', req: false, hint: '0-100' },
    ],
    example: (() => {
      const ex = {
        clave: '2025-001',
        nombre: 'Castillo Lopez Rony Alexander',
      };
      for (let i = 1; i <= 20; i++) ex[`l${i}`] = i <= 5 ? 90 : '';
      ex.examen = '';
      return ex;
    })(),
    validate: (row, getCell) => {
      const errors = [];
      const clean = {
        clave:  getCell('clave'),
        nombre: getCell('nombre'),
      };
      if (!clean.clave)  errors.push({ field: 'clave',  msg: 'obligatoria' });
      if (!clean.nombre) errors.push({ field: 'nombre', msg: 'obligatorio' });
      // Filas sin notas se aceptan; el server las cuenta como
      // "alumno encontrado, sin celdas para actualizar".
      const keys = [...Array.from({ length: 20 }, (_, i) => `l${i + 1}`), 'examen'];
      for (const k of keys) {
        const v = getCell(k);
        clean[k] = v;
        if (v === '') continue;
        const n = num(v);
        if (!Number.isFinite(n) || n < 0 || n > 100) errors.push({ field: k, msg: '0-100' });
      }
      return { clean, errors };
    },
  },

  // ─────────────────────────────────────────────────────────────
  pagos: {
    label: 'Pagos colegiatura',
    icon: '💰',
    endpoint: '/importacion/pagos',
    sheet: 'pagos',
    filename: 'plantilla_importar_pagos.xlsx',
    needsYear: true,
    descripcion:
      'Una fila por recibo. Los datos se importan tal cual aparezcan en cada columna ' +
      '(no se busca al alumno en el sistema). Todos los campos son obligatorios excepto ' +
      'observaciones.',
    cols: [
      { key: 'no_recibo',     header: 'no_recibo',     req: true,  hint: 'Número del recibo (texto/numérico)' },
      { key: 'alumno',        header: 'alumno',        req: true,  hint: 'Nombre tal como debe aparecer en el recibo (texto libre — no se valida contra la lista de alumnos).' },
      { key: 'descripcion',   header: 'descripcion',   req: true,  hint: 'Texto libre (ej. "Marzo 2026", "Inscripción", etc.)' },
      { key: 'fecha',         header: 'fecha',         req: true,  hint: 'YYYY-MM-DD' },
      { key: 'total',         header: 'total',         req: true,  hint: 'Total cobrado en quetzales (puede ser 0).' },
      { key: 'observaciones', header: 'observaciones', req: false, hint: 'Texto libre, opcional' },
    ],
    example: {
      no_recibo: '1585', alumno: 'Castillo Lopez Rony Alexander',
      descripcion: 'Marzo 2026', fecha: '2026-03-05', total: 250, observaciones: '',
    },
    validate: (row, getCell) => {
      const errors = [];
      const clean = {
        no_recibo:     getCell('no_recibo'),
        alumno:        getCell('alumno'),
        descripcion:   getCell('descripcion'),
        fecha:         getCell('fecha'),
        total:         getCell('total'),
        observaciones: getCell('observaciones'),
      };
      if (!clean.no_recibo)   errors.push({ field: 'no_recibo',   msg: 'obligatorio' });
      if (!clean.alumno)      errors.push({ field: 'alumno',      msg: 'obligatorio' });
      if (!clean.descripcion) errors.push({ field: 'descripcion', msg: 'obligatorio' });
      if (!clean.fecha)       errors.push({ field: 'fecha',       msg: 'obligatorio' });
      else if (!FECHA_REGEX.test(clean.fecha))
                              errors.push({ field: 'fecha',       msg: 'YYYY-MM-DD' });
      if (clean.total === '' || clean.total == null) {
        errors.push({ field: 'total', msg: 'obligatorio' });
      } else {
        const total = num(clean.total);
        if (!Number.isFinite(total) || total < 0) {
          errors.push({ field: 'total', msg: 'número ≥ 0' });
        }
      }
      return { clean, errors };
    },
  },

  // ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────
  pagosMensualidades: {
    label: 'Pagos mensualidades',
    icon: '🗓️',
    endpoint: '/importacion/pagos-mensualidades',
    sheet: 'pagos_mensualidades',
    filename: 'plantilla_importar_pagos_mensualidades.xlsx',
    needsYear: true,
    descripcion:
      'Una fila por alumno con el número de recibo de cada mes. Identificación por ' +
      'CLAVE + APELLIDOS Y NOMBRE (cualquier orden — si la clave no matchea se busca ' +
      'al alumno por nombre completo). Las celdas vacías = sin pago. Se permite que un ' +
      'alumno no tenga ningún pago (toda la fila vacía). El monto cobrado es la cuota ' +
      'mensual del alumno y la fecha del recibo es el día 1 del mes correspondiente.',
    cols: (() => {
      const c = [
        { key: 'clave',  header: 'clave',  req: true, hint: 'Clave del alumno (debe existir)' },
        { key: 'nombre', header: 'alumno', req: true, hint: 'Apellidos y nombre del alumno' },
      ];
      for (let i = 0; i < 12; i++) {
        c.push({
          key:    MESES_NOMBRES[i],
          header: MES_LABEL[i],
          req:    false,
          hint:   'Número de recibo (vacío = sin pago)',
          mes:    i + 1,
        });
      }
      return c;
    })(),
    example: {
      clave: '2025-001', nombre: 'Castillo Lopez Rony Alexander',
      enero:    1585, febrero: 1586, marzo:      1987, abril:     1989,
      mayo:     1990, junio:   1991, julio:      1992, agosto:    1993,
      septiembre: '', octubre: '',   noviembre:  '',   diciembre: '',
    },
    validate: (row, getCell) => {
      const errors = [];
      const clean = {
        clave:  getCell('clave'),
        nombre: getCell('nombre'),
      };
      if (!clean.clave)  errors.push({ field: 'clave',  msg: 'obligatoria' });
      if (!clean.nombre) errors.push({ field: 'nombre', msg: 'obligatorio' });
      // Las celdas mensuales son todas opcionales: un alumno puede no
      // tener pagos y aún así importarse para registrar que existe en
      // ese año.  Solo validamos formato si traen valor.
      for (const mes of MESES_NOMBRES) {
        const v = String(getCell(mes) || '').trim();
        clean[mes] = v;
        if (!v) continue;
        if (!/^[A-Za-z0-9-]+$/.test(v)) {
          errors.push({ field: mes, msg: 'sólo letras, números y guiones' });
        }
      }
      return { clean, errors };
    },
  },

  recibosDiplomados: {
    label: 'Recibos diplomados',
    icon: '🧾',
    endpoint: '/importacion/recibos-diplomados',
    sheet: 'recibos_diplomados',
    filename: 'plantilla_importar_recibos_diplomados.xlsx',
    needsYear: true,
    descripcion:
      'Una fila por recibo de diplomado (matrícula, módulo, examen, etc.). Identificación ' +
      'SÓLO por nombre del alumno (debe coincidir con uno existente).',
    cols: [
      { key: 'no_recibo',     header: 'no_recibo',     req: false, hint: 'Opcional. Si se omite, se asigna correlativo automático.' },
      { key: 'alumno',        header: 'alumno',        req: true,  hint: 'Apellidos y nombre del alumno (cualquier orden). Si no coincide con un alumno (ej. "anulado") se guarda el recibo sin alumno asociado.' },
      { key: 'descripcion',   header: 'descripcion',   req: false, hint: 'Descripción del cobro (matrícula, módulo, etc.)' },
      { key: 'fecha',         header: 'fecha',         req: false, hint: 'YYYY-MM-DD' },
      { key: 'total',         header: 'total',         req: false, hint: 'Número en quetzales. Vacío = 0.' },
      { key: 'diplomado',     header: 'diplomado',     req: false, hint: 'Nombre del diplomado (texto libre, opcional)' },
      { key: 'observaciones', header: 'observaciones', req: false, hint: 'Texto libre' },
    ],
    example: {
      no_recibo: '', alumno: 'Castillo Lopez Rony Alexander',
      descripcion: 'Inscripción 2025', fecha: '2025-02-01', total: 500,
      diplomado: 'Operador Windows', observaciones: '',
    },
    validate: (row, getCell) => {
      const errors = [];
      const clean = {
        no_recibo:     getCell('no_recibo'),
        alumno:        getCell('alumno'),
        descripcion:   getCell('descripcion'),
        fecha:         getCell('fecha'),
        total:         getCell('total'),
        diplomado:     getCell('diplomado'),
        observaciones: getCell('observaciones'),
      };
      if (!clean.alumno) errors.push({ field: 'alumno', msg: 'obligatorio' });
      // Total opcional: vacío = 0; si viene, debe ser número >= 0.
      if (clean.total !== '' && clean.total != null) {
        const total = num(clean.total);
        if (!Number.isFinite(total) || total < 0) {
          errors.push({ field: 'total', msg: 'número ≥ 0 (vacío = 0)' });
        }
      }
      if (clean.fecha && !FECHA_REGEX.test(clean.fecha))
        errors.push({ field: 'fecha', msg: 'YYYY-MM-DD' });
      return { clean, errors };
    },
  },
};

const ORDEN_TIPOS = [
  'alumnos', 'asistencia', 'notasTac', 'notasDiplomado',
  'mecanografia', 'pagos', 'pagosMensualidades', 'recibosDiplomados',
];

// =============================================================================
// HELPERS
// =============================================================================

// Plantilla por defecto: una sola fila de encabezados + fila de ejemplo.
const descargarPlantillaSimple = (tipo) => {
  const headers = tipo.cols.map(c => c.header);
  const ejemplo = tipo.example || {};
  // El ejemplo viene indexado por `key`; los headers pueden diferir, así que
  // resolvemos cada celda por la `key` correspondiente.
  const aoa = [headers, tipo.cols.map(c => ejemplo[c.key] ?? '')];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = tipo.cols.map(c => ({ wch: Math.max(c.header.length + 2, 12) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tipo.sheet);
  XLSX.writeFile(wb, tipo.filename);
};

// Plantilla de asistencia (formato ancho con banner de mes y 5 sub-cols S1..S5).
const descargarPlantillaAsistencia = (tipo) => {
  // Fila 1: banner de mes (cada mes ocupa visualmente 5 columnas merged)
  const row1 = ['clave', 'alumno'];
  for (const m of MES_LABEL) row1.push(m, '', '', '', '');
  // Fila 2: sub-encabezados de semana
  const row2 = ['', ''];
  for (let m = 0; m < 12; m++) row2.push('S1', 'S2', 'S3', 'S4', 'S5');
  // Fila 3: ejemplo
  const ej = tipo.example || {};
  const row3 = [ej.clave || '', ej.nombre || ''];
  for (let m = 1; m <= 12; m++) {
    for (let s = 1; s <= 5; s++) {
      row3.push(ej[`m${m}_s${s}`] ?? '');
    }
  }
  const ws = XLSX.utils.aoa_to_sheet([row1, row2, row3]);
  // Merge de los 12 banners (5 columnas cada uno) en la fila 0
  ws['!merges'] = [];
  for (let m = 0; m < 12; m++) {
    const c = 2 + m * 5;
    ws['!merges'].push({ s: { r: 0, c }, e: { r: 0, c: c + 4 } });
  }
  const cols = [{ wch: 10 }, { wch: 32 }];
  for (let i = 0; i < 60; i++) cols.push({ wch: 4 });
  ws['!cols'] = cols;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tipo.sheet);
  XLSX.writeFile(wb, tipo.filename);
};

// Plantilla de pagos (una fila de encabezados con los 12 meses + ejemplo).
const descargarPlantillaPagos = (tipo) => {
  const headers = ['clave', 'alumno', ...MES_LABEL];
  const ej = tipo.example || {};
  const ejemplo = [ej.clave || '', ej.nombre || '',
    ...MESES_NOMBRES.map(m => ej[m] ?? '')];
  const ws = XLSX.utils.aoa_to_sheet([headers, ejemplo]);
  const cols = [{ wch: 10 }, { wch: 32 }, ...MES_LABEL.map(() => ({ wch: 11 }))];
  ws['!cols'] = cols;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tipo.sheet);
  XLSX.writeFile(wb, tipo.filename);
};

const descargarPlantilla = (tipoKey) => {
  const tipo = TIPOS[tipoKey];
  if (tipoKey === 'asistencia') return descargarPlantillaAsistencia(tipo);
  return descargarPlantillaSimple(tipo);
};

// ── Parsers para los formatos anchos (asistencia y pagos) ───────────────────
// Devuelven el mismo tipo de objeto que `sheet_to_json`: cada fila ya viene
// normalizada con las claves esperadas por `tipo.validate`.

const parseSheetAsistencia = (ws) => {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  if (aoa.length < 3) {
    throw new Error('La plantilla de asistencia debe tener 2 filas de encabezado y al menos 1 fila de datos.');
  }
  // Filas 0 y 1 son encabezados (banner mes + sub-encabezados S1..S5).
  // A partir de la fila 2 vienen los datos.
  const filas = [];
  for (let i = 2; i < aoa.length; i++) {
    const r = aoa[i] || [];
    // Saltar filas totalmente vacías
    if (r.every(c => String(c ?? '').trim() === '')) continue;
    const obj = {
      clave:  cellToString(r[0]),
      nombre: cellToString(r[1]),
    };
    let idx = 2;
    for (let m = 1; m <= 12; m++) {
      for (let s = 1; s <= 5; s++) {
        obj[`m${m}_s${s}`] = cellToString(r[idx++]);
      }
    }
    filas.push(obj);
  }
  return filas;
};

const parseSheetPagos = (ws) => {
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  if (aoa.length < 2) {
    throw new Error('La plantilla de pagos debe tener encabezados y al menos 1 fila de datos.');
  }
  // Fila 0 = encabezados; datos a partir de la fila 1.
  const filas = [];
  for (let i = 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    if (r.every(c => String(c ?? '').trim() === '')) continue;
    const obj = {
      clave:  cellToString(r[0]),
      nombre: cellToString(r[1]),
    };
    for (let m = 0; m < 12; m++) {
      obj[MESES_NOMBRES[m]] = cellToString(r[2 + m]);
    }
    filas.push(obj);
  }
  return filas;
};

// =============================================================================
// COMPONENTE
// =============================================================================

const Importar = () => {
  const { usuario, sede } = useAuth();
  const puedeImportar = usuario?.rol === 'admin';
  const inputRef = useRef(null);

  const [tipoKey, setTipoKey] = useState('alumnos');
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);   // [{ clean, errors, ok }]
  const [importing, setImporting] = useState(false);
  const [resultados, setResultados] = useState(null);
  // Programas activos (para construir las columnas dinámicas de notas diplomado)
  const [programas, setProgramas] = useState([]);  // [{nombre, diplomado_nombre, ...}]

  const tipo = TIPOS[tipoKey];

  // Cargar programas activos cuando se entra al tipo Notas Diplomado
  useEffect(() => {
    if (!puedeImportar) return;
    if (tipoKey !== 'notasDiplomado') return;
    let cancel = false;
    (async () => {
      try {
        const { data } = await API.get('/importacion/diplomados-programas');
        if (cancel) return;
        const arr = Array.isArray(data) ? data : [];
        setProgramas(arr);
        const dinTipo = TIPOS.notasDiplomado;
        // El backend ya devuelve los exámenes ordenados por d.id (orden de
        // creación = Operador → Programador → Diseño) y luego por e.orden
        // dentro de cada diplomado.  Excluye automáticamente "Examen Final".
        //
        // Convención de encabezados (compat con plantillas existentes):
        //   - La PRIMERA aparición de un nombre se queda sin sufijo
        //     (ej. "Parcial" = el del primer diplomado en orden).
        //   - Las apariciones siguientes se cualifican entre paréntesis
        //     (ej. "Parcial (Programador)", "Parcial (Diseño Gráfico)").
        //
        // Cada columna lleva el `diplomado` al que pertenece; el servidor
        // solo importa la celda cuando el diplomado del alumno coincide
        // con el de la columna (evita que un Parcial termine en 2 diplomados).
        const usados = new Map();
        const colsProg = arr.map(p => {
          const base = String(p.nombre || '').trim();
          const n = (usados.get(base) || 0) + 1;
          usados.set(base, n);
          const header = n === 1 ? base : `${base} (${p.diplomado_nombre})`;
          return {
            key: header,
            header,
            req: false,
            hint: `${p.diplomado_nombre} — 0-100`,
            diplomado: p.diplomado_nombre,
            programaReal: base,
          };
        });
        dinTipo.cols = [...dinTipo.colsFijas, ...colsProg];
        const ej = { clave: '2025-001', nombre: 'Ana Lucía Pérez Méndez' };
        if (colsProg[0]) ej[colsProg[0].header] = 90;
        dinTipo.example = ej;
        setRows([]);
      } catch (err) {
        console.error('No se pudieron cargar programas de diplomados', err);
      }
    })();
    return () => { cancel = true; };
  }, [tipoKey, puedeImportar]);

  // Cargar TACs cuando se entra al tipo Notas TAC
  useEffect(() => {
    if (!puedeImportar) return;
    if (tipoKey !== 'notasTac') return;
    let cancel = false;
    (async () => {
      try {
        const { data } = await API.get('/importacion/tacs');
        if (cancel) return;
        const tacs = Array.isArray(data) ? data : [];
        const dinTipo = TIPOS.notasTac;
        // 4 columnas por TAC (tac{T}_nota1..nota4)
        const colsDin = [];
        for (const t of tacs) {
          for (let i = 1; i <= 4; i++) {
            const header = `tac${t}_nota${i}`;
            colsDin.push({
              key: header,
              header,
              req: false,
              hint: `Nota ${i} del TAC ${t} — 0-100`,
              tac: t,
              notaIdx: i,
            });
          }
        }
        dinTipo.cols = [...dinTipo.colsFijas, ...colsDin];
        const ej = { clave: '2025-001', nombre: 'Ana Lucía Pérez Méndez' };
        if (colsDin[0]) ej[colsDin[0].header] = 85;
        if (colsDin[1]) ej[colsDin[1].header] = 90;
        dinTipo.example = ej;
        setRows([]);
      } catch (err) {
        console.error('No se pudieron cargar los TACs', err);
      }
    })();
    return () => { cancel = true; };
  }, [tipoKey, puedeImportar]);

  const stats = useMemo(() => {
    const total = rows.length;
    const okN = rows.filter(r => r.ok).length;
    return { total, ok: okN, bad: total - okN };
  }, [rows]);

  const cambiarTipo = (k) => {
    if (k === tipoKey) return;
    if (rows.length || resultados) {
      if (!confirm('Cambiar de tipo descartará los datos actuales. ¿Continuar?')) return;
    }
    setTipoKey(k);
    setRows([]);
    setFileName('');
    setResultados(null);
  };

  const procesarArchivo = (file) => {
    setResultados(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) {
          alert('El Excel no contiene hojas');
          return;
        }

        // El formato ancho (asistencia) usa parser dedicado; el resto usa
        // sheet_to_json estándar con la primera fila como encabezado.
        let json;
        if (tipoKey === 'asistencia') {
          json = parseSheetAsistencia(ws);
        } else {
          json = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        }

        if (json.length === 0) {
          setRows([]);
          alert('La hoja está vacía. Asegúrate de tener al menos una fila debajo de los encabezados.');
          return;
        }

        // En formatos no-anchos validamos los encabezados obligatorios; en los
        // anchos confiamos en la posición de columna (el parser ya arroja
        // un error si la estructura es inválida).
        if (!tipo.wide) {
          const primer = json[0] || {};
          const faltantes = tipo.cols.filter(c => c.req).map(c => c.header)
            .filter(h => !(h in primer));
          if (faltantes.length) {
            alert(
              'Faltan encabezados obligatorios en la primera fila del Excel:\n  ' +
              faltantes.join(', ') +
              '\n\nDescarga la plantilla y úsala como base.'
            );
            setRows([]);
            return;
          }
        }

        // Mapa de key interna → header del Excel.  Permite que
        // `getCell('nombre')` lea la columna real del Excel (que puede
        // tener un header distinto, ej. 'alumno').
        const headerByKey = new Map(tipo.cols.map(c => [c.key, c.header]));
        const validadas = json.map(row => {
          const getCell = (k) => {
            // 1) Probar por la key directa (cuando key === header).
            if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
              return cellToString(row[k]);
            }
            // 2) Probar por el header asociado a esa key.
            const h = headerByKey.get(k);
            if (h !== undefined && row[h] !== undefined) return cellToString(row[h]);
            return '';
          };
          const { clean, errors } = tipo.validate(row, getCell);
          return { clean, errors, ok: errors.length === 0 };
        });
        setRows(validadas);
      } catch (e) {
        console.error(e);
        alert(e.message || 'No se pudo leer el archivo. Asegúrate de que sea un .xlsx válido.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const onSelect = (e) => {
    const f = e.target.files?.[0];
    if (f) procesarArchivo(f);
    e.target.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) procesarArchivo(f);
  };

  const limpiar = () => {
    setRows([]);
    setFileName('');
    setResultados(null);
  };

  const importar = async () => {
    const validas = rows.filter(r => r.ok).map(r => r.clean);
    if (validas.length === 0) {
      alert('No hay filas válidas para importar.');
      return;
    }
    if (tipo.needsYear && (!anio || anio < 2000 || anio > 2100)) {
      alert('Selecciona un año válido entre 2000 y 2100.');
      return;
    }
    if (stats.bad > 0) {
      const ok = confirm(
        `Hay ${stats.bad} fila(s) con error que serán omitidas.\n\n` +
        `Se importarán ${validas.length} fila(s)${tipo.needsYear ? ` para el año ${anio}` : ''}.\n¿Continuar?`
      );
      if (!ok) return;
    } else if (!confirm(`Se importarán ${validas.length} fila(s)${tipo.needsYear ? ` para el año ${anio}` : ''}. ¿Continuar?`)) {
      return;
    }

    setImporting(true);
    try {
      const payload = { rows: validas };
      if (tipo.needsYear) payload.anio = anio;
      // En notasDiplomado, mapeamos cada header (cualificado con el nombre
      // del diplomado cuando el examen se repite) a { materia, diplomadoNombre }
      // para que el server pueda resolver a qué diplomado pertenece cada celda
      // y descartar las que no coincidan con el diplomado del alumno.
      if (tipoKey === 'notasDiplomado') {
        payload.headerMap = {};
        for (const c of tipo.cols) {
          if (c.programaReal) {
            payload.headerMap[c.header] = {
              materia: c.programaReal,
              diplomadoNombre: c.diplomado || null,
            };
          }
        }
      }
      const { data } = await API.post(tipo.endpoint, payload);
      setResultados(data);
    } catch (err) {
      alert(err.response?.data?.message || 'Error al importar');
    } finally {
      setImporting(false);
    }
  };

  // Mapa de field→errores para resaltar celdas en rojo
  const errorMap = (errs) => {
    const m = new Map();
    for (const e of errs) m.set(e.field, [...(m.get(e.field) || []), e.msg]);
    return m;
  };

  if (!puedeImportar) {
    return (
      <div className="admin-layout">
        <Sidebar />
        <div className="admin-content">
          <h1>📥 Importar Datos</h1>
          <div className="imp-banner">
            Esta sección sólo está disponible para usuarios con rol Administrador.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <Sidebar />
      <div className="admin-content">
        <h1>📥 Importar Datos desde Excel</h1>
        <p className="subtitle">
          Selecciona qué deseas importar.  Sigue los pasos: descarga la plantilla,
          llénala, súbela y revisa la previsualización antes de confirmar.
        </p>

        {/* Selector de tipo */}
        <div className="imp-tipo-tabs">
          {ORDEN_TIPOS.map(k => (
            <button
              key={k}
              className={`imp-tipo-tab${k === tipoKey ? ' activo' : ''}`}
              onClick={() => cambiarTipo(k)}
              type="button"
              title={TIPOS[k].descripcion}
            >
              <span style={{ marginRight: 6 }}>{TIPOS[k].icon}</span>
              {TIPOS[k].label}
            </button>
          ))}
        </div>

        <div className="imp-banner">
          ⚠️ La importación se ejecuta sobre la sede actual: <strong>{sede?.nombre}</strong>.
          {tipo.needsYear && (
            <> Las filas se asociarán al año seleccionado y los alumnos deben existir
              previamente (búsqueda por id, clave o código de estudiante).</>
          )}
        </div>

        <div className="imp-wrap">

          {/* Paso 1 — Instrucciones */}
          <div className="imp-card">
            <h2><span className="imp-step">1</span>{tipo.icon} {tipo.label}</h2>
            <p className="imp-sub">{tipo.descripcion}</p>
            <p className="imp-sub">
              El archivo debe ser <strong>.xlsx</strong> con una sola hoja.{' '}
              {tipoKey === 'asistencia' ? (
                <>
                  La <strong>fila 1</strong> tiene el banner de cada mes (Enero..Diciembre)
                  y la <strong>fila 2</strong> los sub-encabezados S1..S5 de cada mes.
                  Los datos empiezan en la <strong>fila 3</strong>.  Hay <strong>62 columnas</strong>
                  {' '}(clave, alumno y 60 celdas semanales).
                </>
              ) : (
                <>
                  La <strong>primera fila</strong> tiene los encabezados (en este orden y con estos
                  nombres exactos), y a partir de la <strong>fila 2</strong> va una línea por registro.{' '}
                  El Excel debe tener <strong>{tipo.cols.length} columnas</strong>.
                </>
              )}
              {' '}Las marcadas con <span className="imp-req">*</span> son obligatorias.
            </p>

            <div className="imp-cols">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>Encabezado</th>
                    <th>Formato esperado</th>
                  </tr>
                </thead>
                <tbody>
                  {tipoKey === 'asistencia' ? (
                    <>
                      <tr>
                        <td>1</td>
                        <td><span className="imp-tag">clave</span><span className="imp-req">*</span></td>
                        <td>Clave del alumno (debe existir)</td>
                      </tr>
                      <tr>
                        <td>2</td>
                        <td><span className="imp-tag">alumno</span><span className="imp-req">*</span></td>
                        <td>Apellidos y nombre (cualquier orden)</td>
                      </tr>
                      <tr>
                        <td>3-7</td>
                        <td><span className="imp-tag">Enero</span> · S1, S2, S3, S4, S5</td>
                        <td>Asistencia semanal de Enero — X, E, P, F, R o - (vacío)</td>
                      </tr>
                      <tr>
                        <td>8-62</td>
                        <td>… mismo patrón para Febrero, Marzo, … Diciembre</td>
                        <td>5 columnas por mes (semanas 1 a 5) — total 60 celdas</td>
                      </tr>
                    </>
                  ) : (
                    tipo.cols.map((c, i) => (
                      <tr key={c.key}>
                        <td>{i + 1}</td>
                        <td>
                          <span className="imp-tag">{c.header}</span>
                          {c.req && <span className="imp-req">*</span>}
                        </td>
                        <td>{c.hint}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paso 2 — Plantilla + año */}
          <div className="imp-card">
            <h2><span className="imp-step">2</span>Descarga la plantilla</h2>
            <p className="imp-sub">
              La plantilla incluye los encabezados correctos y una fila de ejemplo.  Borra
              la fila de ejemplo y agrega tus datos antes de subir el archivo.
            </p>

            {tipo.needsYear && (
              <div style={{ marginBottom: '0.85rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, marginRight: 8 }}>
                  Año al que corresponden los datos:
                </label>
                <input
                  type="number"
                  value={anio}
                  min={2000}
                  max={2100}
                  onChange={(e) => setAnio(parseInt(e.target.value, 10) || new Date().getFullYear())}
                  style={{
                    padding: '0.4rem 0.6rem', border: '1.5px solid #c5cae9',
                    borderRadius: 8, width: 110, fontSize: '0.9rem',
                  }}
                />
                <span style={{ marginLeft: 8, color: '#666', fontSize: '0.78rem' }}>
                  (todas las filas se importarán para este año)
                </span>
              </div>
            )}

            <div className="imp-actions">
              <button className="btn-primary" onClick={() => descargarPlantilla(tipoKey)}>
                📄 Descargar {tipo.filename}
              </button>
            </div>
          </div>

          {/* Paso 3 — Upload */}
          <div className="imp-card">
            <h2><span className="imp-step">3</span>Sube tu archivo</h2>
            <p className="imp-sub">
              Arrastra el .xlsx aquí o haz clic para seleccionarlo.  El archivo se procesa
              en tu navegador, todavía no se envía al servidor.
            </p>
            <div
              className={`imp-drop${drag ? ' drag' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={onSelect}
              />
              {fileName
                ? <strong>📎 {fileName}</strong>
                : <span>Arrastra el .xlsx aquí o haz clic para elegir</span>}
              <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 8 }}>
                Sólo se lee la primera hoja
              </div>
            </div>
          </div>

          {/* Paso 4 — Preview */}
          {rows.length > 0 && !resultados && (
            <div className="imp-card">
              <h2><span className="imp-step">4</span>Previsualiza y corrige</h2>
              <p className="imp-sub">
                Revisa los datos antes de confirmar.  Las filas en rojo tienen errores y
                serán <strong>omitidas</strong> al importar.  Si algo no se ve bien, corrige el Excel
                y súbelo de nuevo.
              </p>

              <div className="imp-summary">
                <span className="imp-pill">Total filas: {stats.total}</span>
                <span className="imp-pill ok">Listas para importar: {stats.ok}</span>
                {stats.bad > 0 && <span className="imp-pill bad">Con errores: {stats.bad}</span>}
                {tipo.needsYear && <span className="imp-pill warn">Año: {anio}</span>}
              </div>

              <div className="imp-preview">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      {tipo.cols.map(c => (
                        <th key={c.key}>{c.header}{c.req && <span className="imp-req">*</span>}</th>
                      ))}
                      <th>Errores</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const em = errorMap(r.errors);
                      return (
                        <tr key={i} className={r.ok ? '' : 'bad'}>
                          <td className="idx">{i + 1}</td>
                          {tipo.cols.map(c => {
                            const bad = em.has(c.key);
                            const v = r.clean[c.key];
                            return (
                              <td
                                key={c.key}
                                style={bad ? { background: '#ffcdd2', color: '#c62828', fontWeight: 600 } : undefined}
                                title={bad ? em.get(c.key).join(', ') : ''}
                              >
                                {v === '' || v === undefined || v === null ? '—' : String(v)}
                              </td>
                            );
                          })}
                          <td className="errcell">
                            {r.errors.length === 0
                              ? '✓'
                              : r.errors.map(e => `${e.field}: ${e.msg}`).join('\n')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="imp-actions" style={{ marginTop: '1rem' }}>
                <button className="btn-cancel" onClick={limpiar}>Cancelar</button>
                <button
                  className="btn-primary"
                  disabled={importing || stats.ok === 0}
                  onClick={importar}
                >
                  {importing ? 'Importando…' : `✓ Confirmar e importar ${stats.ok} fila(s)`}
                </button>
              </div>
            </div>
          )}

          {/* Paso 5 — Resultados */}
          {resultados && (
            <div className="imp-card">
              <h2><span className="imp-step">5</span>Resultado de la importación</h2>
              <div className="imp-summary">
                <span className="imp-pill">Total: {resultados.total}</span>
                <span className="imp-pill ok">
                  {tipoKey === 'alumnos' ? 'Creados' : 'Importados'}: {resultados.creados}
                </span>
                {resultados.fallidos > 0 && (
                  <span className="imp-pill bad">Fallidos: {resultados.fallidos}</span>
                )}
                {resultados.anio && <span className="imp-pill warn">Año: {resultados.anio}</span>}
              </div>

              <div className="imp-results">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Estado</th>
                      <th>Alumno</th>
                      <th>Clave</th>
                      <th>Código</th>
                      {tipoKey === 'alumnos' && (<>
                        <th>Usuario</th>
                        <th>Contraseña</th>
                      </>)}
                      <th>Detalle / Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultados.resultados.map(r => (
                      <tr key={r.row} className={r.ok ? 'ok' : 'bad'}>
                        <td>{r.row}</td>
                        <td>{r.ok ? '✓ ok' : '✗ error'}</td>
                        <td>
                          {r.ok
                            ? (r.nombre || `${r.nombre || ''} ${r.apellido || ''}`.trim() || '—')
                            : '—'}
                        </td>
                        <td><code>{r.clave || '—'}</code></td>
                        <td>{r.codigo_estudiante || '—'}</td>
                        {tipoKey === 'alumnos' && (<>
                          <td>{r.usuario || '—'}</td>
                          <td>{r.password || '—'}</td>
                        </>)}
                        <td>{r.error || r.detalle || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="imp-actions" style={{ marginTop: '1rem' }}>
                <button className="btn-cancel" onClick={limpiar}>Importar otro archivo</button>
              </div>
              {tipoKey === 'alumnos' && (
                <p style={{ fontSize: '0.78rem', color: '#888', marginTop: 8 }}>
                  Anota o exporta las contraseñas antes de salir: el sistema no las vuelve a mostrar.
                </p>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default Importar;
