// ╔═══════════════════════════════════════════════════════════════════════╗
// ║  googleDrive.js                                                       ║
// ║                                                                       ║
// ║  Cliente para subir archivos a Google Drive usando OAuth 2.0 con      ║
// ║  refresh token.                                                       ║
// ║                                                                       ║
// ║  ¿Cómo funciona OAuth con refresh token?                              ║
// ║   1) En OAuth Playground autorizaste UNA SOLA VEZ a tu cliente OAuth  ║
// ║      a acceder a tu Drive.                                            ║
// ║   2) Google te entregó un "refresh_token" que NO expira (a menos      ║
// ║      que lo revoques o pasen 6 meses sin uso si la app está en        ║
// ║      modo "Testing").                                                 ║
// ║   3) Cada vez que necesitamos hacer una petición, el refresh_token    ║
// ║      se cambia por un "access_token" (que sí expira en 1 hora).       ║
// ║   4) Con ese access_token, googleapis hace la llamada.                ║
// ║                                                                       ║
// ║  Diferencia con Service Account:                                      ║
// ║   - Acá los archivos van a TU Drive personal (tu cuota, ~15 GB).      ║
// ║   - Con SA irían al Drive "del bot", compartido con vos.              ║
// ║   - Para uso unipersonal, OAuth es más simple y los archivos quedan   ║
// ║     en tu cuenta directamente.                                        ║
// ║                                                                       ║
// ║  Configuración requerida en .env:                                     ║
// ║   GOOGLE_CLIENT_ID                                                    ║
// ║   GOOGLE_CLIENT_SECRET                                                ║
// ║   GOOGLE_REFRESH_TOKEN                                                ║
// ║   GOOGLE_DRIVE_FOLDER_ID                                              ║
// ╚═══════════════════════════════════════════════════════════════════════╝

const fs = require('fs');
const { google } = require('googleapis');

// Cliente cacheado — se inicializa una sola vez al primer uso.
// El OAuth2Client maneja la rotación del access_token internamente:
// cuando el access_token actual expira, usa el refresh_token para
// pedir uno nuevo a Google sin que tengamos que hacer nada.
let driveClient   = null;
let oauth2Client  = null;

/**
 * Indica si Drive está configurado.  Lo usa el runner para decidir si
 * intenta subir o salta silenciosamente cuando todavía no setearon
 * credenciales.  Verificamos las 4 variables que necesita OAuth2.
 */
const isConfigured = () => {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN &&
    process.env.GOOGLE_DRIVE_FOLDER_ID &&
    // Defensa contra el placeholder que dejamos en .env hasta que el
    // admin reemplace el valor real.
    !process.env.GOOGLE_DRIVE_FOLDER_ID.startsWith('REEMPLAZAR')
  );
};

// Para subir recibos PDF se usa una carpeta separada (GOOGLE_DRIVE_RECIBOS_FOLDER_ID).
// Si no está configurada, la función `subirRecibo` falla con un mensaje claro.
const isRecibosConfigured = () => {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN &&
    process.env.GOOGLE_DRIVE_RECIBOS_FOLDER_ID &&
    !process.env.GOOGLE_DRIVE_RECIBOS_FOLDER_ID.startsWith('REEMPLAZAR')
  );
};

/**
 * Inicializa (o devuelve) el cliente de Drive.  Lanza un error claro
 * si falta alguna variable — el runner lo captura y marca
 * drive_status='error' con el mensaje en error_msg.
 */
const initDrive = () => {
  if (driveClient) return driveClient;

  const {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN,
  } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error(
      'Faltan credenciales OAuth en .env ' +
      '(GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN).'
    );
  }

  // Construye el cliente OAuth2.  El tercer parámetro (redirect URI)
  // tiene que coincidir con uno de los autorizados en tu OAuth client
  // de Google Cloud — para refresh tokens obtenidos vía OAuth Playground
  // se usa la URL del Playground.  No se "usa" realmente acá (no hay
  // redirección), solo tiene que existir para que el SDK no se queje.
  oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );

  // El SDK usa el refresh_token para conseguir access_tokens nuevos
  // automáticamente cuando el actual expira.  No tenemos que llamar
  // a refresh manualmente.
  oauth2Client.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN,
  });

  driveClient = google.drive({ version: 'v3', auth: oauth2Client });
  return driveClient;
};

/**
 * Sube un archivo local a la carpeta configurada.
 *
 * @param {string} filepath  ruta absoluta al archivo (ej: el .sql.gz)
 * @param {string} filename  nombre que se mostrará en Drive
 * @returns {{ fileId: string, webViewLink: string }}
 */
const subirArchivo = async (filepath, filename) => {
  const drive    = initDrive();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId || folderId.startsWith('REEMPLAZAR')) {
    throw new Error(
      'GOOGLE_DRIVE_FOLDER_ID no está configurado en .env. ' +
      'Pegá el ID de la carpeta de Drive (lo sacás de la URL).'
    );
  }
  if (!fs.existsSync(filepath)) {
    throw new Error(`Archivo no existe: ${filepath}`);
  }

  // Metadata del archivo en Drive.  `parents` define en qué carpeta
  // se crea — sin esto iría al raíz "Mi unidad".
  const fileMetadata = {
    name:    filename,
    parents: [folderId],
  };

  // El cuerpo del archivo se manda como stream — eficiente porque no
  // carga el archivo entero en memoria (importante para backups grandes).
  const media = {
    mimeType: 'application/gzip',
    body:     fs.createReadStream(filepath),
  };

  // `fields` le dice a Drive qué propiedades queremos en la respuesta.
  // Sin esto recibiríamos solo `id, name, mimeType` (los default).
  const r = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, webViewLink',
  });

  return {
    fileId:      r.data.id,
    webViewLink: r.data.webViewLink,
  };
};

/**
 * Borra un archivo de Drive por ID.  No la usamos en Fase 2 (porque el
 * "eliminar" del panel preserva la copia de Drive a propósito), pero la
 * dejamos lista por si querés un botón "Eliminar también de Drive" más
 * adelante.
 */
const eliminarArchivo = async (fileId) => {
  const drive = initDrive();
  await drive.files.delete({ fileId });
};

/**
 * Sube un PDF (en base64) a la carpeta de recibos.  Se usa cuando el
 * admin registra un pago de colegiatura para que el comprobante quede
 * archivado en Drive.
 *
 * @param {string} pdfBase64  Contenido del PDF codificado en base64
 * @param {string} filename   Nombre que se mostrará en Drive
 * @returns {{ fileId: string, webViewLink: string }}
 */
const subirRecibo = async (pdfBase64, filename) => {
  const drive    = initDrive();
  const folderId = process.env.GOOGLE_DRIVE_RECIBOS_FOLDER_ID;

  if (!folderId || folderId.startsWith('REEMPLAZAR')) {
    throw new Error(
      'GOOGLE_DRIVE_RECIBOS_FOLDER_ID no está configurado en .env. ' +
      'Pegá el ID de la carpeta de Drive donde se guardarán los recibos.'
    );
  }
  if (!pdfBase64 || typeof pdfBase64 !== 'string') {
    throw new Error('PDF base64 inválido');
  }

  const buffer = Buffer.from(pdfBase64, 'base64');
  const { Readable } = require('stream');

  const fileMetadata = {
    name:    filename,
    parents: [folderId],
  };

  const media = {
    mimeType: 'application/pdf',
    body:     Readable.from(buffer),
  };

  const r = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: 'id, webViewLink',
  });

  return {
    fileId:      r.data.id,
    webViewLink: r.data.webViewLink,
  };
};

module.exports = {
  isConfigured,
  isRecibosConfigured,
  subirArchivo,
  subirRecibo,
  eliminarArchivo,
};
