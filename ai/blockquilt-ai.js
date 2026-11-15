// Relais IA de blockquilt (Node 22, aucune dépendance) : l'éditeur appelle l'application, l'application appelle un modèle
// par une API compatible OpenAI (OpenRouter, OpenAI, Mistral, Anthropic, Ollama…). Aucune clé ne va au navigateur.
// Chaque application installe le sien et le protège comme ses autres routes (session, droits) : le relais ne connaît personne.
//
// Contrat HTTP (à réécrire tel quel ailleurs, en PHP par exemple) — c'est l'`aiUrl` de l'éditeur :
//   GET  → { uses: [{ id, label, scopes }] }   les usages proposés (boutons de la feuille IA)
//   POST → champs (multipart, urlencoded ou JSON) : scope (document | block), use (facultatif), instruction,
//          text (document complet), block (Markdown du bloc si scope=block)
//        → 200 { markdown } · 400 { error } (demande invalide) · 502 { error } (modèle indisponible)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const FORMAT = fs.readFileSync(path.join(__dirname, '..', 'FORMAT.md'), 'utf8');

/**
 * baseUrl : « https://openrouter.ai/api/v1 » ; apiKey ; model : modèle par défaut ;
 * uses : [{ id, label, instruction, model?, scopes?, params? }] ; headers : en-têtes en plus (OpenRouter : HTTP-Referer, X-Title) ;
 * params : champs en plus de la requête au modèle, pour tous les usages (ceux d'un usage passent devant), par exemple
 *   OpenRouter `{ reasoning: { effort: 'low' } }` : un modèle qui « réfléchit » peut épuiser max_tokens avant de répondre ;
 * maxTokens : longueur maximale de la réponse (un document entier : 16 000 par défaut) ;
 * fallback({ scope, instruction, text, block, use }) : réponse sans clé (démo, essais).
 */
function createAi({ baseUrl, apiKey, model, uses = [], headers = {}, params = {}, fallback = null, maxTokens = 16000 }) {
  const byId = new Map(uses.map((u) => [u.id, u]));

  const prompt = ({ scope, instruction, text, block, use }) => ({
    system: 'Tu modifies un contenu au format blockquilt. Réponds uniquement avec le Markdown demandé, sans explication ni bloc de code autour.'
      + (use?.instruction ? `\n\nTâche : ${use.instruction}` : '') + '\n\n' + FORMAT,
    user: (scope === 'block'
      ? `Document complet, pour le contexte :\n\n${text}\n\n---\n\nBloc à modifier :\n\n${block}\n\n`
      : `Document :\n\n${text}\n\n`)
      + (instruction ? `Consigne : ${instruction}\n\n` : '')
      + (scope === 'block' ? 'Réponds avec le ou les blocs qui remplacent ce bloc.' : 'Réponds avec le document complet, frontmatter compris.'),
  });

  /** Demande → Markdown proposé. Erreur avec .status (400 ou 502). */
  const complete = async (req) => {
    const scope = req.scope === 'block' ? 'block' : 'document';
    const use = req.use ? byId.get(req.use) : null;
    const fail = (status, message) => Object.assign(new Error(message), { status });
    if (req.use && !use) throw fail(400, `Usage inconnu : ${req.use}`);
    if (use?.scopes && !use.scopes.includes(scope)) throw fail(400, `« ${use.label} » ne s’applique pas à ce choix`);
    if (!use && !String(req.instruction || '').trim()) throw fail(400, 'Consigne vide');
    if (scope === 'block' && !String(req.block || '').trim()) throw fail(400, 'Bloc vide');
    const ask = { scope, use, instruction: String(req.instruction || '').trim(), text: String(req.text || ''), block: String(req.block || '') };
    if (!apiKey) {
      if (fallback) return fallback({ ...ask, use: use?.id || null });
      throw fail(502, 'IA non configurée (clé absente)');
    }
    const { system, user } = prompt(ask);
    let r;
    try {
      r = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey, ...headers },
        body: JSON.stringify({ model: use?.model || model, max_tokens: maxTokens, ...params, ...use?.params, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      });
    } catch (error) {
      throw fail(502, 'Modèle injoignable : ' + error.message);
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(502, j.error?.message || `Modèle indisponible (${r.status})`);
    const choice = j.choices?.[0];
    // Réponse coupée par la limite de longueur : jamais renvoyée (on pourrait l'appliquer et perdre la fin du texte).
    if (choice?.finish_reason === 'length') {
      throw fail(502, choice.message?.content ? 'Réponse coupée : le modèle a atteint sa longueur maximale. Réessayer, ou choisir un modèle plus court à répondre.'
        : 'Le modèle a épuisé sa longueur maximale à réfléchir, sans répondre. Réessayer, ou régler sa réflexion (params) ou son modèle.');
    }
    const out = String(choice?.message?.content ?? '').trim();
    if (!out) throw fail(502, 'Réponse vide du modèle');
    // Un modèle entoure parfois sa réponse d'un bloc de code : on l'enlève.
    return out.replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/, '$1').replace(/\r\n/g, '\n') + '\n';
  };

  const read = async (req) => {
    const type = req.headers['content-type'] || '';
    if (type.includes('application/json')) { const parts = []; for await (const p of req) parts.push(p); return JSON.parse(Buffer.concat(parts).toString('utf8') || '{}'); }
    const data = await new Request('http://local/', { method: 'POST', headers: req.headers, body: req, duplex: 'half' }).formData();
    // Un formulaire multipart envoie les fins de ligne en \r\n : on les remet en \n.
    return Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v).replace(/\r\n/g, '\n')]));
  };

  /** Route HTTP prête à monter : app.all('/api/ai', ai.handler). */
  const handler = async (req, res) => {
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (req.method === 'GET') return json(200, { uses: uses.map(({ id, label, scopes }) => ({ id, label, scopes: scopes || ['document', 'block'] })) });
    if (req.method !== 'POST') return json(405, { error: 'GET ou POST' });
    try {
      json(200, { markdown: await complete(await read(req)) });
    } catch (error) {
      json(error.status || 400, { error: error.message });
    }
  };

  return { complete, handler, prompt };
}

module.exports = { createAi };
