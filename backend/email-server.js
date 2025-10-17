import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

const app = express();
const PORT = 3001;
const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

// Función para crear un borrador en Outlook usando PowerShell
const createOutlookDraft = async (to, subject, body) => {
  try {
    // Script PowerShell para crear borrador
    const psScript = `
      Add-Type -AssemblyName "Microsoft.Office.Interop.Outlook"
      $outlook = New-Object -ComObject Outlook.Application
      $draft = $outlook.CreateItem(0)  # 0 = olMailItem
      $draft.To = "${to.replace(/"/g, '\\"')}"
      $draft.Subject = "${subject.replace(/"/g, '\\"')}"
      $draft.HTMLBody = @"
${body.replace(/"/g, '\\"')}
"@
      $draft.Save()
      Write-Output "Success"
    `;

    // Escribir el script en un archivo temporal
    const scriptPath = path.join(__dirname, `temp_${uuidv4()}.ps1`);
    const fs = await import('fs').then(m => m.promises);
    await fs.writeFile(scriptPath, psScript);

    // Ejecutar PowerShell
    const { stdout, stderr } = await execPromise(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
      { encoding: 'utf-8', timeout: 10000 }
    );

    // Limpiar archivo temporal
    await fs.unlink(scriptPath).catch(() => {});

    if (stdout.includes('Success')) {
      console.log(`✓ Borrador creado para: ${to}`);
      return { success: true, message: 'Borrador creado exitosamente' };
    } else {
      throw new Error('PowerShell no retornó confirmación');
    }

  } catch (error) {
    console.error(`❌ Error creando borrador para ${to}:`, error.message);
    throw error;
  }
};

// Endpoint para crear un borrador individual
app.post('/api/draft-email', async (req, res) => {
  try {
    const { to, subject, body } = req.body;

    // Validar campos requeridos
    if (!to || !subject || !body) {
      return res.status(400).json({
        error: 'Faltan campos requeridos: to, subject, body'
      });
    }

    console.log(`📧 Creando borrador para: ${to}`);

    const result = await createOutlookDraft(to, subject, body);

    res.json({
      success: true,
      message: 'Borrador creado exitosamente en Outlook',
      to: to
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: 'Error al crear borrador',
      details: error.message
    });
  }
});

// Endpoint para crear múltiples borradores en lote
app.post('/api/draft-emails-batch', async (req, res) => {
  try {
    const { emails } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Se requiere array de emails' });
    }

    console.log(`📧 Creando ${emails.length} borradores...`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Crear borradores secuencialmente (más estable)
    for (const email of emails) {
      try {
        const { to, subject, body } = email;

        if (!to || !subject || !body) {
          results.push({ to, status: 'error', message: 'Campos faltantes' });
          errorCount++;
          continue;
        }

        await createOutlookDraft(to, subject, body);
        results.push({ to, status: 'success' });
        successCount++;

        // Pequeña pausa entre emails para estabilidad
        await new Promise(resolve => setTimeout(resolve, 500));

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
      message: `${successCount} borradores creados, ${errorCount} errores`,
      successCount: successCount,
      errorCount: errorCount,
      totalCount: emails.length,
      details: results
    });

  } catch (error) {
    console.error('Error en endpoint:', error);
    res.status(500).json({
      error: 'Error al procesar lote',
      details: error.message
    });
  }
});

// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    server: 'Email server corriendo',
    method: 'PowerShell + Outlook COM'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`📧 Servidor de emails corriendo en http://localhost:${PORT}`);
  console.log('📌 Método: PowerShell + Outlook COM Interop');
  console.log('Endpoints disponibles:');
  console.log('  POST /api/draft-email - Crear un borrador');
  console.log('  POST /api/draft-emails-batch - Crear múltiples borradores');
  console.log('  GET /api/health - Verificar estado');
  console.log('\n✓ Integración con Outlook lista');
});
