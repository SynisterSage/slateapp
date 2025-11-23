import { createClient } from '@supabase/supabase-js';

// Render a resume HTML to PDF using Puppeteer and upload to storage.
export default async function handler(req, res) {
  try {
    try { const dot = await import('dotenv'); dot.config && dot.config({ path: process.cwd() + '/.env.local' }); } catch (e) {}

    const body = req.method === 'POST' ? (await parseJsonBody(req)) : req.query || (req.url ? (await import('url')).parse(req.url, true).query : {});
    const id = body && (body.id || body.resumeId);
    if (!id) return res.status(400).json({ error: 'Missing id' });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE;
    if (!supabaseUrl || !serviceRole) return res.status(500).json({ error: 'Server missing Supabase config' });

    const serverClient = createClient(supabaseUrl, serviceRole);

    // Fetch the resume row
    const { data: rowData, error: rowErr } = await serverClient.from('resumes').select('*').eq('id', id).single();
    if (rowErr) return res.status(500).json({ error: rowErr.message || String(rowErr), details: rowErr });
    const row = rowData && rowData.data ? rowData.data : rowData;

    // Create simple HTML from resume data. This can be replaced with a more complete template.
    const html = renderResumeHtml(row || {});

    // Attempt to import puppeteer and render PDF
    let puppeteer;
    try {
      puppeteer = await import('puppeteer');
    } catch (e) {
      console.error('puppeteer import failed', e);
      return res.status(500).json({ error: 'Server missing puppeteer. Run `npm install puppeteer`' });
    }

    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    // Upload PDF to storage. Bucket is configurable and will fall back to common buckets if missing.
    const preferredBucket = process.env.GENERATED_PDF_BUCKET || 'resumes-generated';
    const filePath = `${id}/generated_${Date.now()}.pdf`;
    let bucket = preferredBucket;
    let uploadData = null;
    let uploadErr = null;

    try {
      const up = await serverClient.storage.from(bucket).upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
      uploadData = up.data; uploadErr = up.error;
    } catch (e) {
      uploadErr = e;
    }

    // If the preferred bucket doesn't exist or upload failed, try fallback buckets
    if (uploadErr) {
      console.warn(`Initial upload to bucket '${bucket}' failed:`, uploadErr);
      const fallbackBuckets = ['resumes', 'resume', 'resumes-private'];
      let success = false;
      for (const b of fallbackBuckets) {
        try {
          const up = await serverClient.storage.from(b).upload(filePath, pdfBuffer, { contentType: 'application/pdf', upsert: true });
          if (!up.error) {
            bucket = b;
            uploadData = up.data;
            uploadErr = null;
            success = true;
            break;
          }
        } catch (e) {
          // ignore and continue
        }
      }
      if (!success) {
        console.error('upload error', uploadErr);
        return res.status(500).json({ error: uploadErr.message || String(uploadErr), details: uploadErr });
      }
    }

    // Create signed URL
    const { data: signed, error: signedErr } = await serverClient.storage.from(bucket).createSignedUrl(filePath, 60 * 60);
    if (signedErr) {
      console.error('signed url error', signedErr);
      return res.status(500).json({ error: signedErr.message || String(signedErr), details: signedErr });
    }

    // Persist generated_pdf_path on the resume row
    const upsertRow = { id, data: { ...(row || {}), generated_pdf_path: `${bucket}/${filePath}`, generated_at: new Date().toISOString() } };
    const { data: finalRow, error: finalErr } = await serverClient.from('resumes').upsert(upsertRow).select().single();
    if (finalErr) {
      console.error('final upsert error', finalErr);
      return res.status(500).json({ error: finalErr.message || String(finalErr), details: finalErr });
    }

    return res.status(200).json({ url: signed.signedUrl, row: finalRow });
  } catch (err) {
    console.error('renderPdf handler error', err);
    return res.status(500).json({ error: String(err) });
  }
}

async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  try { return JSON.parse(buf.toString()); } catch (e) { return null; }
}

function renderResumeHtml(data) {
  const p = data.personalInfo || {};
  const skills = (data.skills || []).map(s => s.name || s).join(', ');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(data.title || 'Resume')}</title><style>body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111}h1{font-size:28px;margin-bottom:4px}h2{font-size:12px;margin-bottom:6px;color:#666;text-transform:uppercase;border-bottom:1px solid #eee;padding-bottom:6px}section{margin-bottom:14px}.skills{margin-top:6px}</style></head><body><header><h1>${escapeHtml(p.fullName || '')}</h1><div>${escapeHtml(p.email || '')} • ${escapeHtml(p.phone || '')} • ${escapeHtml(p.location || '')}</div></header><main>${p.summary?`<section><h2>Summary</h2><p>${escapeHtml(p.summary)}</p></section>`:''}${data.experience && data.experience.length?`<section><h2>Experience</h2>${data.experience.map(e=>`<div><strong>${escapeHtml(e.role||'')}</strong> — ${escapeHtml(e.company||'')}<div>${(e.bullets||[]).map(b=>`<div>${escapeHtml(b)}</div>`).join('')}</div></div>`).join('')}</section>`:''}${skills?`<section><h2>Skills</h2><div class="skills">${escapeHtml(skills)}</div></section>`:''}</main></body></html>`;
}

function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
