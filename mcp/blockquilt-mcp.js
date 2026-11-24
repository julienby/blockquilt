#!/usr/bin/env node
// Serveur MCP générique de blockquilt (Node 22, aucune dépendance).
// Il ne stocke rien et ne connaît pas les utilisateurs : il appelle le contrat HTTP de l'application
// (GET /contents, GET et PUT /contents/{id} — voir README « Contenus d'une application ») avec le jeton reçu.
//
// En local (Claude Code…), transport stdio :
//   BQ_URL=https://exemple.org/ BQ_TOKEN=<jeton> node mcp/blockquilt-mcp.js
// En ligne, transport HTTP : l'application monte `httpHandler` (voir dev/server.js, /mcp) ; le jeton arrive dans
// l'en-tête Authorization du client MCP et repart tel quel vers l'application.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Blocks = require('../blockquilt.js');

const FORMAT = fs.readFileSync(path.join(__dirname, '..', 'FORMAT.md'), 'utf8');
const VERSION = '0.1.0';
const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

const TOOLS = [
  { name: 'get_format', description: 'Le format blockquilt (Markdown par blocs) : à lire avant d’écrire un contenu.', inputSchema: { type: 'object', properties: {} } },
  { name: 'list_contents', description: 'Les contenus que ce jeton peut voir : identifiant, titre, dernière modification.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'read_content',
    description: 'Lire un contenu : sa version, son frontmatter et ses blocs numérotés, chacun avec son empreinte. Numéro et empreinte servent à edit_block.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'edit_block',
    description: 'Modifier un bloc désigné par son numéro et son empreinte (lus avec read_content) : le remplacer, insérer avant ou après, ou le retirer. Refusé si le bloc a changé depuis la lecture ou si le Markdown ne respecte pas le format.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        block: { type: 'integer', minimum: 1, description: 'Numéro du bloc (depuis 1)' },
        hash: { type: 'string', description: 'Empreinte du bloc, lue avec read_content' },
        mode: { type: 'string', enum: ['replace', 'before', 'after', 'remove'], default: 'replace' },
        markdown: { type: 'string', description: 'Le ou les blocs (vide pour remove)' },
      },
      required: ['id', 'block', 'hash'],
    },
  },
  {
    name: 'write_content',
    description: 'Écrire dans un contenu : replace (tout remplacer ; version obligatoire, lue avec read_content), prepend (au début, sous le frontmatter) ou append (à la fin). Refusé si le Markdown ne respecte pas le format.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        mode: { type: 'string', enum: ['replace', 'prepend', 'append'] },
        markdown: { type: 'string' },
        version: { type: 'string', description: 'Version lue avec read_content (obligatoire pour replace)' },
      },
      required: ['id', 'mode', 'markdown'],
    },
  },
  { name: 'lint', description: 'Contrôler un Markdown avant de l’écrire : la liste des problèmes, vide si l’éditeur le relit sans perte.', inputSchema: { type: 'object', properties: { markdown: { type: 'string' } }, required: ['markdown'] } },
];

class ToolError extends Error {}

/**
 * Le serveur MCP, indépendant du transport.
 * base : adresse de l'application (« https://exemple.org/app/ » → https://exemple.org/app/contents…).
 * → handle(message, { token, via }) : réponse JSON-RPC, ou null pour une notification.
 */
function createMcp({ base }) {
  const root = base.endsWith('/') ? base : base + '/';
  const api = async (ctx, p, init = {}) => {
    const r = await fetch(new URL(p, root), { ...init, signal: AbortSignal.timeout(30000), headers: { ...(ctx.token ? { Authorization: 'Bearer ' + ctx.token } : {}), ...init.headers } });
    if (r.status === 401) throw new ToolError('Jeton refusé par l’application');
    if (r.status === 403) throw new ToolError('Pas d’accès à ce contenu avec ce jeton');
    if (r.status === 404) throw new ToolError('Contenu introuvable');
    return r;
  };
  const enc = (id) => {
    if (typeof id !== 'string' || !/^[\w-]{1,64}$/.test(id)) throw new ToolError('Identifiant de contenu invalide');
    return encodeURIComponent(id);
  };
  const read = async (ctx, id) => {
    const r = await api(ctx, 'contents/' + enc(id), { headers: { Accept: 'text/markdown' } });
    if (!r.ok) throw new ToolError(`Lecture impossible (${r.status})`);
    return { markdown: await r.text(), version: r.headers.get('etag') };
  };
  const write = async (ctx, id, markdown, version) => {
    const r = await api(ctx, 'contents/' + enc(id), { method: 'PUT', headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'If-Match': version, ...(ctx.via ? { 'X-Via': ctx.via } : {}) }, body: markdown });
    if (r.status === 412) throw new ToolError('Le contenu a changé depuis la lecture : relire avec read_content, puis recommencer');
    if (!r.ok) throw new ToolError(`Écriture refusée (${r.status}) : ${(await r.text()).trim()}`);
    return r.headers.get('etag');
  };
  const checked = (markdown) => {
    if (typeof markdown !== 'string') throw new ToolError('markdown attendu');
    const problems = Blocks.lint(markdown);
    if (problems.length) throw new ToolError('Markdown refusé, rien n’est écrit :\n' + problems.map((p) => `- ligne ${p.line} : ${p.message}`).join('\n') + '\nVoir get_format.');
    return markdown;
  };
  // Le contenu tel qu'une IA le lit : version, frontmatter, puis « [n · empreinte · type] » au-dessus de chaque bloc.
  const show = (id, { markdown, version }) => {
    const { meta, blocks } = Blocks.address(markdown);
    const head = Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n');
    return [`contenu ${id} · version ${version} · ${blocks.length} blocs`, head ? `frontmatter :\n${head}` : 'pas de frontmatter',
      ...blocks.map((b) => `[${b.n} · ${b.hash} · ${b.type}]\n${b.text}`)].join('\n\n');
  };

  const tools = {
    get_format: async () => FORMAT,
    lint: async (ctx, { markdown }) => {
      const problems = Blocks.lint(String(markdown ?? ''));
      return problems.length ? problems.map((p) => `ligne ${p.line} : ${p.message}`).join('\n') : 'Aucun problème : l’éditeur relit ce texte sans perte.';
    },
    list_contents: async (ctx) => {
      const r = await api(ctx, 'contents', { headers: { Accept: 'application/json' } });
      const list = await r.json();
      return list.length ? list.map((c) => `${c.id} — ${c.title} (modifié le ${c.updatedAt}${c.updatedBy ? ' par ' + c.updatedBy : ''})`).join('\n') : 'Aucun contenu accessible avec ce jeton.';
    },
    read_content: async (ctx, { id }) => show(id, await read(ctx, id)),
    edit_block: async (ctx, { id, block, hash, mode = 'replace', markdown = '' }) => {
      if (!['replace', 'before', 'after', 'remove'].includes(mode)) throw new ToolError('mode : replace, before, after ou remove');
      if (mode !== 'remove') checked(markdown);
      const cur = await read(ctx, id);
      const r = Blocks.changeBlock(cur.markdown, { n: Number(block), hash: String(hash), mode, markdown });
      if (r.error) throw new ToolError(r.error.message + (r.error.code === 'stale' ? ' (read_content donne les empreintes à jour)' : ''));
      const version = await write(ctx, id, r.markdown, cur.version);
      return `Écrit. ${show(id, { markdown: r.markdown, version })}`;
    },
    write_content: async (ctx, { id, mode, markdown, version }) => {
      if (!['replace', 'prepend', 'append'].includes(mode)) throw new ToolError('mode : replace, prepend ou append');
      checked(markdown);
      if (mode === 'replace' && !version) throw new ToolError('replace demande la version lue avec read_content (pour ne rien écraser)');
      const cur = await read(ctx, id);
      if (version && version !== cur.version) throw new ToolError('Le contenu a changé depuis la lecture : relire avec read_content, puis recommencer');
      const next = Blocks.combine(cur.markdown, markdown, mode);
      const v = await write(ctx, id, next, cur.version);
      return `Écrit (${mode}). Nouvelle version ${v}, ${Blocks.address(next).blocks.length} blocs.`;
    },
  };

  const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  return async function handle(msg, ctx = {}) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return fail(msg?.id ?? null, -32600, 'Requête JSON-RPC invalide');
    const notification = msg.id === undefined;
    const { method, params = {} } = msg;
    if (notification) return null;
    switch (method) {
      case 'initialize':
        if (params.clientInfo?.name && !ctx.via) ctx.via = String(params.clientInfo.name);
        return reply(msg.id, {
          protocolVersion: PROTOCOLS.includes(params.protocolVersion) ? params.protocolVersion : PROTOCOLS[0],
          capabilities: { tools: {} },
          serverInfo: { name: 'blockquilt', version: VERSION },
          instructions: 'Contenus en Markdown par blocs. Lire get_format avant d’écrire ; read_content donne les numéros et empreintes des blocs pour edit_block ; tout Markdown est contrôlé avant écriture et rien n’est écrasé si le contenu a changé.',
        });
      case 'ping': return reply(msg.id, {});
      case 'tools/list': return reply(msg.id, { tools: TOOLS });
      case 'tools/call': {
        const tool = tools[params.name];
        if (!tool) return fail(msg.id, -32602, `Outil inconnu : ${params.name}`);
        try {
          return reply(msg.id, { content: [{ type: 'text', text: await tool(ctx, params.arguments || {}) }] });
        } catch (error) {
          if (!(error instanceof ToolError)) console.error(error);
          return reply(msg.id, { content: [{ type: 'text', text: error instanceof ToolError ? error.message : 'Erreur : ' + error.message }], isError: true });
        }
      }
      default: return fail(msg.id, -32601, `Méthode inconnue : ${method}`);
    }
  };
}

const MAX_BYTES = 2 * 1024 * 1024;

/** Transport HTTP (MCP « streamable HTTP », réponses JSON, sans session) : POST du message, jeton dans Authorization. */
function httpHandler({ base, via = 'MCP' }) {
  const handle = createMcp({ base });
  return async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST', 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('POST seulement\n'); }
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
    if (!token) { res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8', 'WWW-Authenticate': 'Bearer' }); return res.end('Jeton attendu : Authorization: Bearer <jeton>\n'); }
    let msg;
    // Corps arrêté dès qu'il dépasse 2 Mo (413) : jamais chargé en entier en mémoire.
    const parts = [];
    let size = 0;
    for await (const p of req) {
      size += p.length;
      if (size > MAX_BYTES) { res.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' }); return res.end('Demande trop grosse : 2 Mo au plus.\n'); }
      parts.push(p);
    }
    try { msg = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalide' } }));
    }
    const ctx = { token, via };
    const out = Array.isArray(msg) ? (await Promise.all(msg.map((m) => handle(m, ctx)))).filter(Boolean) : await handle(msg, ctx);
    if (!out || (Array.isArray(out) && !out.length)) { res.writeHead(202); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(out));
  };
}

/** Transport stdio : un message JSON par ligne. */
function stdio({ base, token }) {
  const handle = createMcp({ base });
  const ctx = { token };
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalide' } }) + '\n'); continue; }
      const out = await handle(msg, ctx);
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    }
  });
}

module.exports = { createMcp, httpHandler, TOOLS };

if (require.main === module) {
  if (!process.env.BQ_URL) { console.error('BQ_URL (adresse de l’application) et BQ_TOKEN (jeton) attendus'); process.exit(1); }
  stdio({ base: process.env.BQ_URL, token: process.env.BQ_TOKEN });
}
