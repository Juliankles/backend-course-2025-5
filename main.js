// Імпорт потрібних модулів 
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';

// Налаштування CLI аргументів 
const program = new Command();
program
  .requiredOption('-h, --host <host>', 'Server host')
  .requiredOption('-p, --port <port>', 'Server port')
  .requiredOption('-c, --cache <dir>', 'Cache directory');
program.parse(process.argv);

const { host, port, cache } = program.opts();

// Перевірка і створення директорії кешу 
async function ensureCacheDir() {
  try {
    await fs.mkdir(cache, { recursive: true });
    console.log(` Папку кешу створено або вона вже існує: ${cache}`);
  } catch (err) {
    console.error(' Не вдалося створити папку кешу', err);
    process.exit(1);
  }
}

// Допоміжна функція для отримання шляху файлу
function getFilePath(code) {
  return path.join(cache, `${code}.jpg`);
}

// Головний HTTP-сервер 
async function startServer() {
  await ensureCacheDir();

  const server = http.createServer(async (req, res) => {
    const method = req.method;
    const url = new URL(req.url, `http://${host}:${port}`);
    const code = url.pathname.slice(1); // наприклад /200 → "200"

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Не вказано код! Наприклад /200 або /404');
    }

    const filePath = getFilePath(code);

    try {
      // GET 
      if (method === 'GET') {
        try {
          const file = await fs.readFile(filePath);
          console.log(` Відправлено з кешу: ${filePath}`);
          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          return res.end(file);
        } catch (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('Файл не знайдено у кеші');
          } else throw err;
        }
      }

      // PUT 
      else if (method === 'PUT') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        await fs.writeFile(filePath, body);
        console.log(`Додано файл у кеш: ${filePath}`);
        res.writeHead(201, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Файл збережено у кеші');
      }

      // DELETE 
      else if (method === 'DELETE') {
        try {
          await fs.unlink(filePath);
          console.log(` Видалено файл з кешу: ${filePath}`);
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Файл видалено');
        } catch (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Файл не знайдено');
          } else throw err;
        }
      }

      // Інші методи 
      else {
        res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Метод не підтримується');
      }
    } catch (err) {
      console.error(' Помилка сервера:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Внутрішня помилка сервера');
    }
  });

  server.listen(port, host, () => {
    console.log(` Сервер запущено на http://${host}:${port}/`);
  });
}

startServer();
