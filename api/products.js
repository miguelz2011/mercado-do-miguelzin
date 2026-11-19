import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const TABLE_NAME = 'produtos';

function sendJson(response, status, payload) {
  response.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  return response.send(JSON.stringify(payload));
}

function loadRootEnvFile() {
  // O .env fica na raiz do repositório e é incluído somente na função da API.
  // Variáveis já definidas no ambiente têm prioridade sobre o arquivo.
  const envPath = path.join(process.cwd(), '.env');

  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) process.env[key] = value;
  }
}

function getSupabase() {
  loadRootEnvFile();

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey || url.includes('SEU-PROJETO') || serviceRoleKey === 'SUA_CHAVE_SERVICE_ROLE') {
    const error = new Error('Banco de dados não configurado. Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env da raiz do projeto.');
    error.statusCode = 503;
    throw error;
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    if (request.body && typeof request.body === 'object') {
      resolve(request.body);
      return;
    }

    let raw = '';
    request.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Corpo da requisição muito grande.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('JSON inválido no corpo da requisição.'));
      }
    });
    request.on('error', reject);
  });
}

function validateProduct(body) {
  const nome = typeof body.nome === 'string' ? body.nome.trim() : '';
  const preco = Number(body.preco);
  const estoque = Number(body.estoque);
  const validade = typeof body.validade === 'string' ? body.validade : '';

  if (!nome || nome.length > 120) {
    return { error: 'O nome é obrigatório e deve ter no máximo 120 caracteres.' };
  }
  if (!Number.isFinite(preco) || preco < 0 || preco > 99999999) {
    return { error: 'Informe um preço válido e maior ou igual a zero.' };
  }
  if (!Number.isInteger(estoque) || estoque < 0 || estoque > 2147483647) {
    return { error: 'O estoque deve ser um número inteiro maior ou igual a zero.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validade)) {
    return { error: 'Informe uma data de validade válida.' };
  }
  const parsedDate = new Date(`${validade}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== validade) {
    return { error: 'A data de validade informada não existe.' };
  }

  return { data: { nome, preco: Number(preco.toFixed(2)), estoque, validade } };
}

function getId(request) {
  const id = request.query?.id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

export default async function handler(request, response) {
  try {
    const supabase = getSupabase();

    if (request.method === 'GET') {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('id, nome, preco, estoque, validade, created_at')
        .order('created_at', { ascending: false });

      if (error) return sendJson(response, 500, { error: 'Erro ao buscar produtos no banco de dados.' });
      return sendJson(response, 200, data || []);
    }

    if (request.method === 'POST') {
      const body = await readBody(request);
      const validation = validateProduct(body);
      if (validation.error) return sendJson(response, 400, { error: validation.error });

      const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert(validation.data)
        .select('id, nome, preco, estoque, validade, created_at')
        .single();

      if (error) return sendJson(response, 500, { error: 'Não foi possível cadastrar o produto no banco de dados.' });
      return sendJson(response, 201, data);
    }

    if (request.method === 'PATCH') {
      const id = getId(request);
      if (!id) return sendJson(response, 400, { error: 'Informe o ID do produto que será atualizado.' });

      const body = await readBody(request);
      const validation = validateProduct(body);
      if (validation.error) return sendJson(response, 400, { error: validation.error });

      const { data, error } = await supabase
        .from(TABLE_NAME)
        .update(validation.data)
        .eq('id', id)
        .select('id, nome, preco, estoque, validade, created_at')
        .maybeSingle();

      if (error) return sendJson(response, 500, { error: 'Não foi possível atualizar o produto no banco de dados.' });
      if (!data) return sendJson(response, 404, { error: 'Produto não encontrado.' });
      return sendJson(response, 200, data);
    }

    if (request.method === 'DELETE') {
      const id = getId(request);
      if (!id) return sendJson(response, 400, { error: 'Informe o ID do produto que será excluído.' });

      const { data, error } = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();

      if (error) return sendJson(response, 500, { error: 'Não foi possível excluir o produto do banco de dados.' });
      if (!data) return sendJson(response, 404, { error: 'Produto não encontrado.' });
      return sendJson(response, 200, { message: 'Produto excluído com sucesso.' });
    }

    response.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return sendJson(response, 405, { error: 'Método não permitido.' });
  } catch (error) {
    const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
    return sendJson(response, status, {
      error: status === 503 ? error.message : 'Erro interno no servidor.'
    });
  }
}
