import fs from 'fs/promises';
import path from 'path';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.json({ ok: true });
    if (req.method !== 'POST') return res.json({ ok: false, error: 'Only POST supported' });

    const body = req.body || {};
    const record = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      name: body.name || '',
      email: body.email || '',
      subject: body.subject || '',
      message: body.message || ''
    };

    const dataDir = path.resolve(process.cwd(), 'data');
    await fs.mkdir(dataDir, { recursive: true });
    const file = path.join(dataDir, 'support-requests.json');

    let arr = [];
    try {
      const existing = await fs.readFile(file, 'utf8').catch(() => '');
      if (existing) arr = JSON.parse(existing || '[]');
    } catch (e) {
      arr = [];
    }
    arr.push(record);
    await fs.writeFile(file, JSON.stringify(arr, null, 2), 'utf8');

    console.log('Support request received', { email: record.email, subject: record.subject });
    return res.json({ ok: true });
  } catch (e) {
    console.error('support handler error', e);
    return res.json({ ok: false, error: String(e) });
  }
}
