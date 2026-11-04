// 로컬 개발용 서버 (Vercel 배포에는 사용되지 않음): npm run dev
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from './api/compare.js';

// .env.local 이 있으면 읽기
try {
  const env = await readFile(new URL('./.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const PORT = process.env.PORT || 3000;
http
  .createServer(async (req, res) => {
    if (req.url.startsWith('/api/compare')) return handler(req, res);
    if (req.url === '/' || req.url.startsWith('/?')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(await readFile(new URL('./index.html', import.meta.url)));
    }
    res.statusCode = 404;
    res.end('Not found');
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));
