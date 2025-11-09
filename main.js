// Імпорт необхідних модулів
import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { Command } from 'commander';
import superagent from 'superagent';

// Параметри командного рядка 
const program = new Command();
program
  .requiredOption('-h, --host <host>', 'Server host')
  .requiredOption('-p, --port <port>', 'Server port')
  .requiredOption('-c, --cache <dir>', 'Cache directory');
program.parse(process.argv);

const { host, port, cache } = program.opts();

// Перевірка/створення папки кешу
async function ensureCacheDir() {
  try {
    await fs.mkdir(cache, { recursive: true });
    console.log(` Папку кешу створено або вона вже існує: ${cache}`);
  } catch (err) {
    console.error(' Не вдалося створити папку кешу', err);
    process.exit(1);
  }
}

// Функція для шляху до файлу 
function getFilePath(code) {
  return path.join(cache, `${code}.jpg`);
}

// Основний сервер 
async function startServer() {
  await ensureCacheDir();

  const server = http.createServer(async (req, res) => {
    const method = req.method;
    const url = new URL(req.url, `http://${host}:${port}`);
    const code = url.pathname.slice(1);

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Не вказано код статусу! Спробуйте /200 або /404');
    }

    const filePath = getFilePath(code);

    try {
      //  GET 
      if (method === 'GET') {
        // спроба прочитати з кешу
        try {
          const cached = await fs.readFile(filePath);
          console.log(` Відправлено з кешу: ${filePath}`);
          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          return res.end(cached);
        } catch (err) {
          if (err.code !== 'ENOENT') throw err;
        }

        // якщо файлу немає — завантажити з http.cat
        try {
          console.log(` Завантаження зображення з https://http.cat/${code}`);
          const response = await superagent
            .get(`https://http.cat/${code}`)
            .buffer(true)
            .parse((r, fn) => {
              const chunks = [];
              r.on('data', c => chunks.push(c));
              r.on('end', () => fn(null, Buffer.concat(chunks)));
            });

          const image = response.body;
          await fs.writeFile(filePath, image);
          console.log(` Збережено у кеш: ${filePath}`);
          res.writeHead(200, { 'Content-Type': 'image/jpeg' });
          return res.end(image);
        } catch {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Зображення не знайдено на http.cat');
        }
      }

      // PUT 
      else if (method === 'PUT') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        await fs.writeFile(filePath, body);
        console.log(` Додано файл у кеш: ${filePath}`);
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
