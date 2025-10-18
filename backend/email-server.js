import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IMPORTANTE: Cargar .env ANTES de hacer nada
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

console.log('=== DEBUG ===');
console.log('Buscando .env en:', envPath);
console.log('¿Existe .env?', fs.existsSync(envPath));
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY exists:', !!process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  console.error('Asegúrate de que el archivo .env existe en:', envPath);
  process.exit(1);
}

// AHORA crear el cliente de Supabase
console.log('Creando cliente Supabase con URL:', process.env.SUPABASE_URL);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('✓ Cliente Supabase creado exitosamente\n');

const app = express();
const PORT = 3001;
const execPromise = promisify(exec);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

const createOutlookDraft = async (to, subject, body, attachments = []) => {
  try {
    const fs_promises = await import('fs').then(m => m.promises);
    const tempDir = path.join(__dirname, 'temp');
    
    await fs_promises.mkdir(tempDir, { recursive: true }).catch(() => {});

    const attachmentPaths = [];

    console.log(`📎 Procesando ${attachments.length} adjuntos...`);

    for (const attachment of attachments) {
      const tempFilePath = path.join(tempDir, attachment.filename);
      const buffer = Buffer.from(attachment.content, 'base64');
      await fs_promises.writeFile(tempFilePath, buffer);
      attachmentPaths.push(tempFilePath);
      console.log(`📄 Adjunto guardado: ${attachment.filename}`);
    }

    const bodyFilePath = path.join(tempDir, `body_${uuidv4()}.html`);
    await fs_promises.writeFile(bodyFilePath, body, 'utf8');
    
    const escapedTo = to.replace(/'/g, "''");
    const escapedSubject = subject.replace(/'/g, "''");
    const escapedBodyPath = bodyFilePath.replace(/\\/g, '\\\\');

    let attachmentLines = '';
    if (attachmentPaths.length > 0) {
      attachmentLines = attachmentPaths
        .map(filePath => {
          const escaped = filePath.replace(/\\/g, '\\\\');
          return `$draft.Attachments.Add('${escaped}') | Out-Null`;
        })
        .join('\n');
    }

    const psScript = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName Microsoft.Office.Interop.Outlook
$outlook = New-Object -ComObject Outlook.Application
$draft = $outlook.CreateItem(0)
$draft.To = '${escapedTo}'
$draft.Subject = '${escapedSubject}'
$draft.HTMLBody = [System.IO.File]::ReadAllText('${escapedBodyPath}', [System.Text.Encoding]::UTF8)
${attachmentLines}
$draft.Save()
Write-Host "Success"`;

    const scriptPath = path.join(__dirname, `temp_${uuidv4()}.ps1`);
    await fs_promises.writeFile(scriptPath, psScript, 'utf8');

    console.log('🔧 Ejecutando PowerShell...');

    const { stdout, stderr } = await execPromise(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
      { encoding: 'utf8', timeout: 30000 }
    );

    console.log(`Salida: ${stdout}`);
    if (stderr) console.log(`Stderr: ${stderr}`);

    await fs_promises.unlink(scriptPath).catch(() => {});
    await fs_promises.unlink(bodyFilePath).catch(() => {});
    for (const filePath of attachmentPaths) {
      await fs_promises.unlink(filePath).catch(() => {});
    }

    if (stdout.includes('Success')) {
      console.log(`✅ Borrador creado para: ${to}`);
      return { success: true };
    } else {
      throw new Error(`PowerShell error: ${stdout}`);
    }

  } catch (error) {
    console.error(`❌ Error para ${to}: ${error.message}`);
    throw error;
  }
};

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    server: 'Email server running',
    method: 'PowerShell + Outlook COM'
  });
});




// Endpoint principal: crear borrador basado en campaignId y emailNumber
app.post('/api/draft-email', async (req, res) => {
  console.log('\n📨 === NUEVA PETICIÓN /api/draft-email ===');
  
  try {
    const { to, subject, body } = req.body;
    
    console.log('📋 Datos recibidos:', { to, subject: subject?.substring(0, 50) });

    if (!to || !subject || !body) {
      console.error('❌ Faltan parámetros: to, subject o body');
      return res.status(400).json({ error: 'Missing to, subject or body' });
    }

    console.log(`📝 Creando borrador para: ${to}`);
    const result = await createOutlookDraft(to, subject, body, []);

    console.log('✅ Borrador creado exitosamente');
    res.json({
      success: true,
      message: 'Draft created in Outlook',
      to: to
    });

  } catch (error) {
    console.error('💥 Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});




// Endpoint batch (opcional)
app.post('/api/draft-emails-batch', async (req, res) => {
  try {
    const { emails } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Email array required' });
    }

    console.log(`📨 Creando ${emails.length} borradores...`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const email of emails) {
      try {
        const { to, subject, body, attachments = [] } = email;

        if (!to || !subject || !body) {
          results.push({ to, status: 'error', message: 'Missing fields' });
          errorCount++;
          continue;
        }

        await createOutlookDraft(to, subject, body, attachments);
        results.push({ to, status: 'success' });
        successCount++;

        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        results.push({
          to: email.to,
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
        errorCount++;
      }
    }

    res.json({
      success: true,
      message: `${successCount} borradores creados, ${errorCount} errores`,
      successCount: successCount,
      errorCount: errorCount,
      totalCount: emails.length,
      details: results
    });

  } catch (error) {
    console.error('Error en batch:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.get('/api/webinars/list-pdfs', async (req, res) => {
  try {
    const fs_promises = await import('fs').then(m => m.promises);
    const webinarsDir = path.join(__dirname, '..', 'Webinars');

    console.log('Buscando PDFs en:', webinarsDir);

    try {
      await fs_promises.mkdir(webinarsDir, { recursive: true });
    } catch (e) {
      console.warn('Carpeta Webinars existe o no se pudo crear');
    }

    const files = await fs_promises.readdir(webinarsDir);
    const pdfs = files.filter(f => f.toLowerCase().endsWith('.pdf'));

    console.log(`PDFs encontrados: ${pdfs.length}`);

    res.json({
      success: true,
      pdfs: pdfs,
      folder: webinarsDir
    });
  } catch (error) {
    console.error('Error listing PDFs:', error);
    res.status(500).json({
      error: 'Error listing PDFs',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n✅ Servidor de email ejecutándose en http://localhost:${PORT}`);
  console.log('\nEndpoints disponibles:');
  console.log('  POST /api/draft-email - Crear un borrador');
  console.log('  POST /api/draft-emails-batch - Crear múltiples borradores');
  console.log('  GET /api/health - Health check\n');
});
