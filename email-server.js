import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear carpeta de borradores si no existe
const DRAFTS_FOLDER = path.join(__dirname, '..', 'outlook-drafts');
if (!fs.existsSync(DRAFTS_FOLDER)) {
  fs.mkdirSync(DRAFTS_FOLDER, { recursive: true });
  console.log(`📁 Carpeta de borradores creada en: ${DRAFTS_FOLDER}`);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

// Función para convertir adjunto base64 a objeto
const processAttachments = (attachments = []) => {
  return attachments.map(att => ({
    filename: att.filename,
    content: Buffer.from(att.content, 'base64')
  }));
};

// Función para crear archivo .eml
const createEmlFile = (emailData) => {
  const { to, subject, body, attachments = [] } = emailData;
  const email = process.env.OUTLOOK_EMAIL || 'no-reply@example.com';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uniqueId = uuidv4().slice(0, 8);
  const filename = `${timestamp}_${subject.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}_${uniqueId}.eml`;
  
  // Crear contenido EML
  let emlContent = '';
  emlContent += `From: ${email}\r\n`;
  emlContent += `To: ${to}\r\n`;
  emlContent += `Subject: ${subject}\r\n`;
  emlContent += `Date: ${new Date().toUTCString()}\r\n`;
  emlContent += `MIME-Version: 1.0\r\n`;
  
  if (attachments && attachments.length > 0) {
    const boundary = `----Boundary_${uuidv4()}`;
    emlContent += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n`;
    emlContent += `\r\n`;
    emlContent += `--${boundary}\r\n`;
    emlContent += `Content-Type: text/html; charset="utf-8"\r\n`;
    emlContent += `Content-Transfer-Encoding: 8bit\r\n`;
    emlContent += `\r\n`;
    emlContent += `${body}\r\n`;
    
    // Añadir adjuntos
    attachments.forEach(att => {
      emlContent += `\r\n--${boundary}\r\n`;
      emlContent += `Content-Type: application/octet-stream; name="${att.filename}"\r\n`;
      emlContent += `Content-Transfer-Encoding: base64\r\n`;
      emlContent += `Content-Disposition: attachment; filename="${att.filename}"\r\n`;
      emlContent += `\r\n`;
      emlContent += `${att.content.toString('base64')}\r\n`;
    });
    
    emlContent += `\r\n--${boundary}--\r\n`;
  } else {
    emlContent += `Content-Type: text/html; charset="utf-8"\r\n`;
    emlContent += `Content-Transfer-Encoding: 8bit\r\n`;
    emlContent += `\r\n`;
    emlContent += `${body}\r\n`;
  }
  
  return { filename, emlContent, filepath: path.join(DRAFTS_FOLDER, filename) };
};

// Endpoint para crear borrador local
app.post('/api/draft-email', async (req, res) => {
  try {
    const { to, subject, body, attachments = [] } = req.body;

    // Validar campos requeridos
    if (!to || !subject || !body) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: to, subject, body' 
      });
    }

    // Procesar adjuntos
    const processedAttachments = attachments.map(att => ({
      filename: att.filename,
      content: att.content // ya está en base64
    }));

    // Crear archivo EML
    const { filename, emlContent, filepath } = createEmlFile({
      to,
      subject,
      body,
      attachments: processedAttachments
    });

    // Guardar archivo
    fs.writeFileSync(filepath, emlContent);

    res.json({ 
      success: true, 
      message: 'Borrador guardado exitosamente',
      filename: filename,
      path: filepath,
      folder: DRAFTS_FOLDER
    });

  } catch (error) {
    console.error('Error al crear borrador:', error);
    res.status(500).json({ 
      error: 'Error al crear borrador',
      details: error.message 
    });
  }
});

// Endpoint para crear múltiples borradores
app.post('/api/draft-emails-batch', async (req, res) => {
  try {
    const { emails } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Se requiere array de emails' });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const email of emails) {
      try {
        const { to, subject, body, attachments = [] } = email;

        if (!to || !subject || !body) {
          results.push({ to, status: 'error', message: 'Campos faltantes' });
          errorCount++;
          continue;
        }

        // Procesar adjuntos
        const processedAttachments = attachments.map(att => ({
          filename: att.filename,
          content: att.content
        }));

        // Crear archivo EML
        const { filename, emlContent, filepath } = createEmlFile({
          to,
          subject,
          body,
          attachments: processedAttachments
        });

        // Guardar archivo
        fs.writeFileSync(filepath, emlContent);

        results.push({ to, status: 'success', filename: filename });
        successCount++;

      } catch (error) {
        results.push({ 
          to: email.to, 
          status: 'error', 
          message: error.message 
        });
        errorCount++;
      }
    }

    res.json({ 
      success: true,
      message: `${successCount} borradores guardados, ${errorCount} errores`,
      details: results,
      folder: DRAFTS_FOLDER
    });

  } catch (error) {
    console.error('Error al crear borradores en lote:', error);
    res.status(500).json({ 
      error: 'Error al procesar lote',
      details: error.message 
    });
  }
});

// Endpoint para listar borradores guardados
app.get('/api/drafts', (req, res) => {
  try {
    const files = fs.readdirSync(DRAFTS_FOLDER);
    const drafts = files
      .filter(f => f.endsWith('.eml'))
      .map(f => ({
        filename: f,
        path: path.join(DRAFTS_FOLDER, f),
        created: fs.statSync(path.join(DRAFTS_FOLDER, f)).birthtime
      }))
      .sort((a, b) => new Date(b.created) - new Date(a.created));

    res.json({ 
      success: true,
      count: drafts.length,
      drafts: drafts,
      folder: DRAFTS_FOLDER
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para eliminar un borrador
app.delete('/api/drafts/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(DRAFTS_FOLDER, filename);

    // Validar que el archivo existe y está en la carpeta correcta
    if (!fs.existsSync(filepath) || !filepath.startsWith(DRAFTS_FOLDER)) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    fs.unlinkSync(filepath);
    res.json({ success: true, message: 'Borrador eliminado' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    server: 'Email server corriendo',
    draftsFolder: DRAFTS_FOLDER,
    draftsCount: fs.readdirSync(DRAFTS_FOLDER).filter(f => f.endsWith('.eml')).length
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`📧 Servidor de emails corriendo en http://localhost:${PORT}`);
  console.log(`📁 Carpeta de borradores: ${DRAFTS_FOLDER}`);
  console.log('Endpoints disponibles:');
  console.log('  POST /api/draft-email - Crear un borrador');
  console.log('  POST /api/draft-emails-batch - Crear múltiples borradores');
  console.log('  GET /api/drafts - Listar borradores');
  console.log('  DELETE /api/drafts/:filename - Eliminar un borrador');
  console.log('  GET /api/health - Verificar estado');
});