import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, 'data');
const projectsDir = join(dataDir, 'projects');
const uploadsDir = join(root, 'uploads');
const frontendPath = join(root, '..', 'frontend', 'index.html');
const port = Number(process.env.PORT || 8787);
const maxUploadBytes = 500 * 1024 * 1024;

await Promise.all([mkdir(projectsDir, { recursive: true }), mkdir(uploadsDir, { recursive: true })]);

const sendHtml = (res, html) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(html); };
const send = (res, status, body, headers = {}) => {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(payload);
};
const cors = (res) => {
  res.setHeader('access-control-allow-origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type,x-file-name');
};
const projectPath = (id) => join(projectsDir, `${id}.json`);
const readProject = async (id) => JSON.parse(await readFile(projectPath(id), 'utf8'));
const writeProject = async (project) => writeFile(projectPath(project.id), JSON.stringify(project, null, 2));
const safeName = (name) => basename(String(name || 'upload.bin')).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'upload.bin';
const readJson = async (req) => {
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 2_000_000) throw new Error('JSON payload too large'); }
  return raw ? JSON.parse(raw) : {};
};
const route = (url) => new URL(url, 'http://localhost').pathname.split('/').filter(Boolean);

async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) { return sendHtml(res, await readFile(frontendPath, 'utf8')); }
  const parts = route(req.url);
  try {
    if (req.method === 'GET' && parts[0] === 'api' && parts[1] === 'health') return send(res, 200, { ok: true, service: 'atelier-api', time: new Date().toISOString() });

    if (req.method === 'POST' && parts.join('/') === 'api/projects') {
      const input = await readJson(req);
      const project = { id: randomUUID(), name: input.name || 'Новый проект', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), state: input.state || {}, files: [] };
      await writeProject(project);
      return send(res, 201, project);
    }

    if (parts[0] === 'api' && parts[1] === 'projects' && parts[2]) {
      const id = parts[2];
      let project;
      try { project = await readProject(id); } catch { return send(res, 404, { error: 'PROJECT_NOT_FOUND' }); }

      if (req.method === 'GET' && parts.length === 3) return send(res, 200, project);
      if (req.method === 'PUT' && parts.length === 3) {
        const input = await readJson(req);
        project.name = input.name ?? project.name;
        project.state = input.state ?? project.state;
        project.updatedAt = new Date().toISOString();
        await writeProject(project);
        return send(res, 200, project);
      }
      if (req.method === 'POST' && parts[3] === 'files') {
        const name = safeName(req.headers['x-file-name']);
        const target = join(uploadsDir, `${id}-${Date.now()}-${name}`);
        let bytes = 0;
        req.on('data', (chunk) => { bytes += chunk.length; if (bytes > maxUploadBytes) req.destroy(new Error('UPLOAD_TOO_LARGE')); });
        await pipeline(req, createWriteStream(target));
        const file = { id: randomUUID(), name, path: target, size: bytes, type: req.headers['content-type'] || 'application/octet-stream', addedAt: new Date().toISOString() };
        project.files.push(file); project.updatedAt = new Date().toISOString(); await writeProject(project);
        return send(res, 201, { file, projectId: id });
      }
    }
    return send(res, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    console.error(error);
    return send(res, error.message === 'UPLOAD_TOO_LARGE' ? 413 : 400, { error: error.message || 'BAD_REQUEST' });
  }
}

createServer(handler).listen(port, () => console.log(`Atelier API listening on http://localhost:${port}`));
