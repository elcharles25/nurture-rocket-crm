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

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

const createOutlookDraft = async (to, subject, body, attachments = []) => {
  try {
    const fs = await import('fs').then(m => m.promises);
    const tempDir = path.join(__dirname, 'temp');
    
    await fs.mkdir(tempDir, { recursive: true }).catch(() => {});

    const attachmentPaths = [];

    console.log(`Processing ${attachments.length} attachments...`);

    for (const attachment of attachments) {
      const tempFilePath = path.join(tempDir, attachment.filename);
      const buffer = Buffer.from(attachment.content, 'base64');
      await fs.writeFile(tempFilePath, buffer);
      attachmentPaths.push(tempFilePath);
      console.log(`Attachment saved: ${attachment.filename}`);
    }

    const bodyFilePath = path.join(tempDir, `body_${uuidv4()}.html`);
    await fs.writeFile(bodyFilePath, body, 'utf8');
    
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
    await fs.writeFile(scriptPath, psScript, 'utf8');

    console.log('Executing PowerShell...');

    const { stdout, stderr } = await execPromise(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`,
      { encoding: 'utf8', timeout: 30000 }
    );

    console.log(`Output: ${stdout}`);
    if (stderr) console.log(`Stderr: ${stderr}`);

    await fs.unlink(scriptPath).catch(() => {});
    await fs.unlink(bodyFilePath).catch(() => {});
    for (const filePath of attachmentPaths) {
      await fs.unlink(filePath).catch(() => {});
    }

    if (stdout.includes('Success')) {
      console.log(`Draft created for: ${to}`);
      return { success: true };
    } else {
      throw new Error(`PowerShell: ${stdout}`);
    }

  } catch (error) {
    console.error(`Error for ${to}: ${error.message}`);
    throw error;
  }
};

app.post('/api/draft-email', async (req, res) => {
  try {
    const { to, subject, body, attachments = [], pdfPath, fileName } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({
        error: 'Missing required fields: to, subject, body'
      });
    }

    console.log(`Creating draft for: ${to}`);

    let finalAttachments = attachments;
    if (pdfPath) {
      try {
        const fs = await import('fs').then(m => m.promises);
        const absolutePath = pdfPath.startsWith('Webinars') 
          ? path.join(__dirname, '..', pdfPath)
          : pdfPath;

        const pdfBuffer = await fs.readFile(absolutePath);
        const pdfBase64 = pdfBuffer.toString('base64');
        
        const attachmentFileName = fileName || pdfPath.split('\\').pop() || 'attachment.pdf';
        
        finalAttachments = [{
          filename: attachmentFileName,
          content: pdfBase64
        }];
        
        console.log(`PDF read: ${attachmentFileName}`);
      } catch (error) {
        return res.status(500).json({
          error: 'Error reading PDF file',
          details: error.message
        });
      }
    }

    const result = await createOutlookDraft(to, subject, body, finalAttachments);

    res.json({
      success: true,
      message: 'Draft created in Outlook',
      to: to
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      error: 'Error creating draft',
      details: error.message
    });
  }
});

app.post('/api/draft-emails-batch', async (req, res) => {
  try {
    const { emails } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'Email array required' });
    }

    console.log(`Creating ${emails.length} drafts...`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const email of emails) {
      try {
        const { to, subject, body, pdfPath, fileName, attachments = [] } = email;

        if (!to || !subject || !body) {
          results.push({ to, status: 'error', message: 'Missing fields' });
          errorCount++;
          continue;
        }

        let finalAttachments = attachments;
        if (pdfPath) {
          try {
            const fs = await import('fs').then(m => m.promises);
            const absolutePath = pdfPath.startsWith('Webinars') 
              ? path.join(__dirname, '..', pdfPath)
              : pdfPath;

            console.log(`Reading PDF from: ${absolutePath}`);

            const pdfBuffer = await fs.readFile(absolutePath);
            const pdfBase64 = pdfBuffer.toString('base64');
            
            const attachmentFileName = fileName || pdfPath.split('\\').pop() || 'attachment.pdf';
            
            finalAttachments = [{
              filename: attachmentFileName,
              content: pdfBase64
            }];
            
            console.log(`PDF read: ${attachmentFileName} (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
          } catch (error) {
            console.error(`Error reading PDF ${pdfPath}:`, error.message);
            results.push({
              to: to,
              status: 'error',
              message: `Could not read file: ${error.message}`
            });
            errorCount++;
            continue;
          }
        }

        await createOutlookDraft(to, subject, body, finalAttachments);
        results.push({ to, status: 'success' });
        successCount++;

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
      message: `${successCount} drafts created, ${errorCount} errors`,
      successCount: successCount,
      errorCount: errorCount,
      totalCount: emails.length,
      details: results
    });

  } catch (error) {
    console.error('Error in batch:', error);
    res.status(500).json({
      error: 'Error processing batch',
      details: error.message
    });
  }
});

app.get('/api/webinars/list-pdfs', async (req, res) => {
  try {
    const fs = await import('fs').then(m => m.promises);
    const webinarsDir = path.join(__dirname, '..', 'Webinars');

    try {
      await fs.mkdir(webinarsDir, { recursive: true });
    } catch (e) {
      console.warn('Webinars folder exists');
    }

    const files = await fs.readdir(webinarsDir);
    const pdfs = files.filter(f => f.toLowerCase().endsWith('.pdf'));

    console.log(`Webinars folder: ${webinarsDir}`);
    console.log(`PDFs found: ${pdfs.length}`);

    res.json({
      success: true,
      pdfs: pdfs,
      folder: webinarsDir
    });
  } catch (error) {
    console.error('Error listing PDFs:', error);
    res.status(500).json({
      error: 'Error listing PDFs',
      details: error.message
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    server: 'Email server running',
    method: 'PowerShell + Outlook COM'
  });
});

app.listen(PORT, () => {
  console.log(`Email server running on http://localhost:${PORT}`);
  console.log('Endpoints available:');
  console.log('  POST /api/draft-email - Create one draft');
  console.log('  POST /api/draft-emails-batch - Create multiple drafts');
  console.log('  GET /api/webinars/list-pdfs - List available PDFs');
  console.log('  GET /api/health - Health check');
});
