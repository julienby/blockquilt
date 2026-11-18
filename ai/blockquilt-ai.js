// Relais IA de blockquilt (Node 22, aucune dépendance) : l'éditeur appelle l'application, l'application appelle un modèle
// par une API compatible OpenAI (OpenRouter, OpenAI, Mistral, Anthropic, Ollama…). Aucune clé ne va au navigateur.
// Chaque application installe le sien et le protège comme ses autres routes (session, droits) : le relais ne connaît personne.
//
// Contrat HTTP (à réécrire tel quel ailleurs, en PHP par exemple) — c'est l'`aiUrl` de l'éditeur :
//   GET  → { uses: [{ id, label, scopes }] }   les usages proposés (boutons de la feuille IA)
//   POST → champs (multipart, urlencoded ou JSON) : scope (document | block), use (facultatif), instruction,
//          text (document complet), block (Markdown du bloc si scope=block),
//          blocks (scope=document, facultatif : liste JSON de textes, [0] = frontmatter ou "", [n] = Markdown du bloc n)
//        → 200 { markdown } (bloc, document sans `blocks`, usage `output: 'document'`)
//          · 200 { operations } (document avec `blocks` : texte « @@ remplacer | avant | après | supprimer n », « @@ rien » ou vide = rien à changer)
//          · 400 { error } (demande invalide) · 413 { error } (texte trop long, limits.maxChars)
//          · 413 { error } (demande de plus de maxBytes octets)
//          · 429 { error } (limite de jetons du jour atteinte) · 502 { error } (modèle indisponible) · 504 { error } (modèle trop lent)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const FORMAT = fs.readFileSync(path.join(__dirname, '..', 'FORMAT.md'), 'utf8');

// Format des opérations, lu par Blocks.parseOps dans l'éditeur.
const OPERATIONS = `Le document est donné en blocs numérotés : [0] est le frontmatter, [1], [2]… les blocs.
Réponds uniquement par des opérations, sans explication ni bloc de code autour. Une opération commence par une ligne « @@ <verbe> <numéro> », suivie de son texte Markdown. Ce texte va jusqu'à l'opération suivante ou jusqu'à la fin de la réponse. Exemple :

@@ remplacer 3
Nouveau texte du bloc 3.

@@ après 5
## Nouveau titre

Un paragraphe ajouté.

@@ avant 1
Texte ajouté au tout début.

@@ supprimer 4

Règles :
- Verbes : remplacer, avant, après, supprimer. « supprimer » n'a pas de texte ; les autres en ont un, qui peut contenir plusieurs blocs.
- Les numéros sont ceux du document reçu, même après d'autres opérations.
- Un seul « remplacer » ou « supprimer » par bloc.
- Bloc 0 : seulement « remplacer 0 » (frontmatter complet, entre deux lignes ---) ou « après 0 » (ajout en tête du document).
- N'écris que les blocs qui changent ; ne recopie jamais un bloc inchangé.
- Pas de ligne « @@ » seule, ni au milieu ni à la fin.
- S'il n'y a rien à changer, réponds exactement « @@ rien », et rien d'autre.`;

/**
 * baseUrl : « https://openrouter.ai/api/v1 » ; apiKey ; model : modèle par défaut ;
 * uses : [{ id, label, instruction, model?, scopes?, params?, output? }] ; output : 'operations' (défaut) ou 'document'
 *   (réponse = document entier, pour un usage qui restructure tout) ; ne joue que sur le document, quand `blocks` est envoyé ; headers : en-têtes en plus (OpenRouter : HTTP-Referer, X-Title) ;
 * params : champs en plus de la requête au modèle, pour tous les usages (ceux d'un usage passent devant), par exemple
 *   OpenRouter `{ reasoning: { effort: 'low' } }` : un modèle qui « réfléchit » peut épuiser max_tokens avant de répondre ;
 * maxTokens : longueur maximale de la réponse (un document entier : 16 000 par défaut) ;
 * timeout : attente maximale du modèle en ms (120 000 par défaut ; au-delà, 504) ; maxBytes : taille maximale de la demande reçue (2 Mo ; au-delà, 413) ;
 * fallback({ scope, instruction, text, block, blocks, use, output }) : réponse sans clé (démo, essais), Markdown ou opérations ;
 * limits : { maxChars, perUserDay, globalDay } (absent ou 0 = pas de limite). maxChars : texte (ou blocs) + bloc + consigne envoyés.
 *   perUserDay, globalDay : jetons du jour (usage.total_tokens du modèle), par personne et pour tout le site ;
 *   compteurs en mémoire, remis à zéro à minuit (heure du serveur) et au redémarrage ;
 * userOf(req) : la personne qui demande (clé du compteur), le jeton Bearer par défaut ; null = seul le plafond global compte ;
 * now() : l'heure (essais).
 */
function createAi({ baseUrl, apiKey, model, uses = [], headers = {}, params = {}, fallback = null, maxTokens = 16000,
  timeout = 120000, maxBytes = 2 * 1024 * 1024, limits = {}, userOf = (req) => /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1] || null, now = () => new Date() }) {
  const byId = new Map(uses.map((u) => [u.id, u]));
  const spent = { day: '', global: 0, users: new Map() };
  const today = () => {
    const day = now().toDateString();
    if (spent.day !== day) Object.assign(spent, { day, global: 0, users: new Map() });
  };

  const prompt = ({ scope, instruction, text, block, blocks, use, output }) => {
    const ops = output === 'operations';
    const doc = ops ? 'Document :\n\n' + blocks.map((b, n) => `[${n}]\n${b || (n ? '' : '(pas de frontmatter)')}`).join('\n\n') + '\n\n'
      : scope === 'block' ? `Document complet, pour le contexte :\n\n${text}\n\n---\n\nBloc à modifier :\n\n${block}\n\n`
        : `Document :\n\n${text}\n\n`;
    return {
      system: 'Tu modifies un contenu au format blockquilt. '
        + (ops ? OPERATIONS : 'Réponds uniquement avec le Markdown demandé, sans explication ni bloc de code autour.')
        + (use?.instruction ? `\n\nTâche : ${use.instruction}` : '') + '\n\n' + FORMAT,
      user: doc + (instruction ? `Consigne : ${instruction}\n\n` : '')
        + (ops ? 'Réponds par des opérations, ou par « @@ rien ».' : scope === 'block' ? 'Réponds avec le ou les blocs qui remplacent ce bloc.' : 'Réponds avec le document complet, frontmatter compris.'),
    };
  };

  /**
   * Demande (et personne qui demande, ou null) → { markdown } ou { operations } (texte, « @@ rien » ou vide = rien à changer).
   * Erreur avec .status (400, 413, 429, 502 ou 504).
   */
  const complete = async (req, who = null) => {
    const scope = req.scope === 'block' ? 'block' : 'document';
    const use = req.use ? byId.get(req.use) : null;
    const fail = (status, message) => Object.assign(new Error(message), { status });
    if (req.use && !use) throw fail(400, `Usage inconnu : ${req.use}`);
    if (use?.scopes && !use.scopes.includes(scope)) throw fail(400, `« ${use.label} » ne s’applique pas à ce choix`);
    if (!use && !String(req.instruction || '').trim()) throw fail(400, 'Consigne vide');
    if (scope === 'block' && !String(req.block || '').trim()) throw fail(400, 'Bloc vide');
    let blocks = null;
    if (scope === 'document' && req.blocks !== undefined && req.blocks !== '') {
      try { blocks = typeof req.blocks === 'string' ? JSON.parse(req.blocks) : req.blocks; } catch { blocks = null; }
      if (!Array.isArray(blocks) || !blocks.length || !blocks.every((b) => typeof b === 'string')) throw fail(400, 'blocks : liste JSON de textes attendue');
    }
    const output = blocks && use?.output !== 'document' ? 'operations' : 'document';
    const ask = { scope, use, output, blocks, instruction: String(req.instruction || '').trim(), text: String(req.text || ''), block: String(req.block || '') };
    const size = (output === 'operations' ? blocks.join('').length : ask.text.length) + ask.block.length + ask.instruction.length;
    if (limits.maxChars && size > limits.maxChars) throw fail(413, `Texte trop long pour l’IA : ${size} caractères envoyés, ${limits.maxChars} au plus.`);
    const answer = (out) => ({ [output === 'operations' ? 'operations' : 'markdown']: out });
    if (!apiKey) {
      if (fallback) return answer(await fallback({ ...ask, use: use?.id || null }));
      throw fail(502, 'IA non configurée (clé absente)');
    }
    today();
    if (limits.globalDay && spent.global >= limits.globalDay) throw fail(429, 'La limite IA du jour du site est atteinte. Réessayer demain.');
    if (limits.perUserDay && who !== null && (spent.users.get(who) || 0) >= limits.perUserDay) throw fail(429, `Votre limite IA du jour est atteinte (${limits.perUserDay} jetons). Réessayer demain.`);
    const { system, user } = prompt(ask);
    let r;
    try {
      r = await fetch(baseUrl.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey, ...headers },
        body: JSON.stringify({ model: use?.model || model, max_tokens: maxTokens, ...params, ...use?.params, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error) {
      if (error.name === 'TimeoutError') throw fail(504, `Modèle trop lent : pas de réponse en ${timeout / 1000} s. Réessayer.`);
      throw fail(502, 'Modèle injoignable : ' + error.message);
    }
    const j = await r.json().catch(() => ({}));
    // Jetons comptés dès la réponse, même si elle est refusée plus bas : le fournisseur les a facturés.
    const tokens = j.usage?.total_tokens || 0;
    spent.global += tokens;
    if (who !== null) spent.users.set(who, (spent.users.get(who) || 0) + tokens);
    if (!r.ok) throw fail(502, j.error?.message || `Modèle indisponible (${r.status})`);
    const choice = j.choices?.[0];
    // Réponse coupée par la limite de longueur : jamais renvoyée (on pourrait l'appliquer et perdre la fin du texte).
    if (choice?.finish_reason === 'length') {
      throw fail(502, choice.message?.content ? 'Réponse coupée : le modèle a atteint sa longueur maximale. Réessayer, ou choisir un modèle plus court à répondre.'
        : 'Le modèle a épuisé sa longueur maximale à réfléchir, sans répondre. Réessayer, ou régler sa réflexion (params) ou son modèle.');
    }
    // Un modèle entoure parfois sa réponse d'un bloc de code : on l'enlève.
    const out = String(choice?.message?.content ?? '').trim().replace(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/, '$1').replace(/\r\n/g, '\n').trim();
    // Opérations : une réponse vide veut dire « rien à changer ».
    if (!out && output !== 'operations') throw fail(502, 'Réponse vide du modèle');
    return answer(out ? out + '\n' : '');
  };

  const read = async (req) => {
    // Corps arrêté dès qu'il dépasse maxBytes (413) : jamais chargé en entier en mémoire.
    const parts = [];
    let size = 0;
    for await (const p of req) {
      size += p.length;
      if (size > maxBytes) throw Object.assign(new Error(`Demande trop grosse : ${Math.round(maxBytes / 1024 / 1024)} Mo au plus.`), { status: 413 });
      parts.push(p);
    }
    const body = Buffer.concat(parts);
    const type = req.headers['content-type'] || '';
    if (type.includes('application/json')) return JSON.parse(body.toString('utf8') || '{}');
    const data = await new Request('http://local/', { method: 'POST', headers: req.headers, body }).formData();
    // Un formulaire multipart envoie les fins de ligne en \r\n : on les remet en \n.
    return Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v).replace(/\r\n/g, '\n')]));
  };

  /** Route HTTP prête à monter : app.all('/api/ai', ai.handler). */
  const handler = async (req, res) => {
    const json = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    if (req.method === 'GET') return json(200, { uses: uses.map(({ id, label, scopes }) => ({ id, label, scopes: scopes || ['document', 'block'] })) });
    if (req.method !== 'POST') return json(405, { error: 'GET ou POST' });
    try {
      json(200, await complete(await read(req), userOf(req)));
    } catch (error) {
      json(error.status || 400, { error: error.message });
    }
  };

  return { complete, handler, prompt };
}

module.exports = { createAi };
