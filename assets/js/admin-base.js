/* ==========================================================================
   Éditeur — socle : outils, connexion GitHub, envoi de fichiers, publication
   ========================================================================== */
(() => {
  'use strict';
  const M = window.Modele;
  const ED = window.ED = {};
  ED.KEYS = { DRAFT: 'portfolio-brouillon-v2', PREVIEW_DATA: 'portfolio-apercu-data', PREVIEW_FLAG: 'portfolio-apercu', CFG: 'portfolio-github' };
  ED.CONTENT_PATH = 'data/contenu.js';
  ED.gh = null; ED.baseSha = null; ED.uploading = 0; ED.blobs = new Map(); ED.uploaded = [];

  ED.$ = (s, el = document) => el.querySelector(s);
  ED.$$ = (s, el = document) => [...el.querySelectorAll(s)];
  ED.ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del: k => { try { localStorage.removeItem(k); } catch (e) { /* rien */ } }
  };
  ED.h = function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (['value', 'checked', 'hidden', 'open', 'multiple', 'disabled', 'selected'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  };
  const h = ED.h;
  ED.toast = (msg, type = '', ms = 3500) => {
    const el = h('div', { class: 'toast ' + type, role: 'status' }, msg);
    ED.$('#toasts').append(el);
    const kill = d => setTimeout(() => el.remove(), d);
    if (ms) kill(ms);
    return { set: m => { el.textContent = m; }, done: m => { el.className = 'toast ok'; el.textContent = m; kill(3000); }, fail: m => { el.className = 'toast err'; el.textContent = m; kill(8000); }, close: () => el.remove() };
  };

  /* ---------- Encodage ---------- */
  ED.textToB64 = text => {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  ED.b64ToText = b64 => new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, '')), c => c.charCodeAt(0)));
  ED.blobToB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  const HEADER = '/* ==========================================================\n   CONTENU DU SITE (version 3)\n   À modifier avec l’éditeur visuel : admin.html\n   ========================================================== */\n';
  ED.serialize = d => HEADER + 'window.CONTENU = ' + JSON.stringify(d, null, 1) + ';\n';
  ED.parseContenu = text => {
    const i = text.indexOf('window.CONTENU');
    const a = text.indexOf('{', i < 0 ? 0 : i), b = text.lastIndexOf('}');
    try { return JSON.parse(text.slice(a, b + 1)); } catch (e) {
      try { const w = {}; new Function('window', text)(w); if (w.CONTENU) return w.CONTENU; } catch (e2) { /* plus bas */ }
      throw new Error('Le fichier data/contenu.js contient une erreur.');
    }
  };

  /* ---------- GitHub ---------- */
  ED.cleanToken = t => String(t || '').replace(/[\s​-‍﻿]+/g, '');
  ED.tokenProblem = t => {
    if (!t) return 'Colle ton jeton dans le champ « Jeton d’accès ».';
    if (/^github_pat_/.test(t)) {
      if (t.length < 80) return `Le jeton semble incomplet : ${t.length} caractères au lieu d’environ 93. Recopie-le en entier avec l’icône de copie de GitHub.`;
      if (!/^github_pat_[A-Za-z0-9_]+$/.test(t)) return 'Le jeton contient un caractère inattendu. Recopie-le avec l’icône de copie de GitHub.';
      return '';
    }
    if (/^gh[pousr]_[A-Za-z0-9]{30,}$/.test(t)) return '';
    return 'Ce que tu as collé n’est pas un jeton GitHub : un jeton commence par « github_pat_ » et fait environ 93 caractères. Ce n’est PAS ton mot de passe GitHub.';
  };
  ED.ghReq = async (path, opts = {}) => {
    const g = ED.gh;
    let r;
    try {
      r = await fetch(`https://api.github.com/repos/${encodeURIComponent(g.owner)}/${encodeURIComponent(g.repo)}${path}`, {
        ...opts, headers: { Authorization: `Bearer ${g.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) }
      });
    } catch (e) { const err = new Error('réseau'); err.status = 0; throw err; }
    if (!r.ok) { let msg = r.statusText; try { msg = (await r.json()).message || msg; } catch (e) { /* rien */ } const err = new Error(msg); err.status = r.status; throw err; }
    return r.status === 204 ? null : r.json();
  };
  ED.encPath = p => p.split('/').map(encodeURIComponent).join('/');
  ED.ghError = e => ({
    0: 'pas de connexion internet ?', 401: 'jeton invalide ou expiré. Crée-en un nouveau.',
    403: 'accès refusé : le jeton doit avoir « Contents : Read and write » sur ce dépôt.',
    404: 'dépôt ou fichier introuvable. Vérifie le nom du dépôt.', 409: 'conflit de version. Recharge la page et réessaie.', 413: 'fichier trop lourd (25 Mo maximum).'
  }[e.status] || e.message || 'erreur inconnue');
  ED.connect = async cfg => {
    ED.gh = { owner: cfg.owner.trim(), repo: cfg.repo.trim(), token: ED.cleanToken(cfg.token), branch: (cfg.branch || '').trim() };
    const repo = await ED.ghReq('');
    if (repo.permissions && repo.permissions.push === false) { const e = new Error(); e.status = 403; throw e; }
    ED.gh.branch = ED.gh.branch || repo.default_branch || 'main';
    const file = await ED.ghReq(`/contents/${ED.CONTENT_PATH}?ref=${encodeURIComponent(ED.gh.branch)}`);
    ED.baseSha = file.sha;
    return ED.parseContenu(ED.b64ToText(file.content));
  };

  /* ---------- Envoi de fichiers ---------- */
  async function prepareImage(file, max) {
    if (/gif|svg/.test(file.type)) return { blob: file, ext: file.type.includes('svg') ? 'svg' : 'gif' };
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), hh = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas'); c.width = w; c.height = hh;
      const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, w, hh);
      const toBlob = (type, q) => new Promise(r => c.toBlob(r, type, q));
      let blob = await toBlob('image/webp', 0.82), ext = 'webp';
      if (!blob || blob.type !== 'image/webp') { blob = await toBlob('image/jpeg', 0.84); ext = 'jpg'; }
      if (scale === 1 && /jpe?g|webp/.test(file.type) && file.size <= blob.size) return { blob: file, ext: file.type.includes('webp') ? 'webp' : 'jpg' };
      return { blob, ext };
    } catch (e) { throw new Error('format d’image non lisible par ce navigateur (essaie en JPEG)'); } finally { URL.revokeObjectURL(url); }
  }
  ED.requireConnection = () => {
    if (ED.gh) return true;
    ED.toast('Connecte-toi à GitHub pour envoyer des fichiers (menu ⋯ → Se connecter).', 'err', 5000);
    return false;
  };
  ED.upload = async (file, folder, { max = 2200, raw = false, label = '', dir = '', maxMo = 25 } = {}) => {
    if (!ED.requireConnection()) return null;
    if (!raw && !file.type.startsWith('image/')) { ED.toast(`« ${file.name} » n’est pas une image.`, 'err'); return null; }
    if (dir === 'videos' && !/^video\//.test(file.type) && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) { ED.toast(`« ${file.name} » n’est pas une vidéo (.mp4 conseillé).`, 'err'); return null; }
    ED.uploading++; ED.onState && ED.onState();
    const t = ED.toast(`Envoi ${label} : ${file.name}…`, 'busy', 0);
    try {
      const { blob, ext } = raw ? { blob: file, ext: M.ext(file.name) || 'bin' } : await prepareImage(file, max);
      if (blob.size > maxMo * 1024 * 1024) throw new Error(`fichier trop lourd (${Math.round(blob.size / 1048576)} Mo, ${maxMo} Mo maximum).${dir === 'videos' ? ' Pour une vidéo longue, mets-la sur YouTube ou Vimeo et colle le lien.' : ''}`);
      const base = M.slugify(file.name.replace(/\.[^.]+$/, '')).slice(0, 40) || 'fichier';
      const path = `${dir || (raw ? 'documents' : 'images/' + folder)}/${base}-${Date.now().toString(36).slice(-5)}.${ext.toLowerCase()}`;
      await ED.uploadBlob(blob, path);
      if (!raw) { ED.blobs.set(path, URL.createObjectURL(blob)); ED.uploaded.unshift(path); }
      if (dir === 'videos') ED.blobs.set(path, URL.createObjectURL(blob)); // visible tout de suite dans l'éditeur, avant la mise en ligne
      if (ED.onUploaded) ED.onUploaded(path, file.name, raw);
      t.done(`Envoyé ✓ (${Math.max(1, Math.round(blob.size / 1024))} Ko)`);
      return path;
    } catch (e) { t.fail(`Échec de l’envoi de ${file.name} : ` + (e.status !== undefined ? ED.ghError(e) : e.message)); return null; }
    finally { ED.uploading--; ED.onState && ED.onState(); }
  };
  ED.uploadBlob = async (blob, path) => ED.ghReq(`/contents/${ED.encPath(path)}`, { method: 'PUT', body: JSON.stringify({ message: `Ajout : ${path}`, content: await ED.blobToB64(blob), branch: ED.gh.branch }) });
  // Fichier brut depuis GitHub (marche même avant la mise en ligne)
  ED.ghRaw = async path => {
    const g = ED.gh;
    const r = await fetch(`https://api.github.com/repos/${encodeURIComponent(g.owner)}/${encodeURIComponent(g.repo)}/contents/${ED.encPath(path)}?ref=${encodeURIComponent(g.branch)}`,
      { headers: { Authorization: `Bearer ${g.token}`, Accept: 'application/vnd.github.raw', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!r.ok) throw Object.assign(new Error(r.statusText), { status: r.status });
    return r.blob();
  };
  ED.ghTree = async () => (await ED.ghReq(`/git/trees/${encodeURIComponent(ED.gh.branch)}?recursive=1`)).tree || [];
  // Charge une image en local pour pouvoir la recadrer
  ED.loadBlobUrl = async src => {
    if (ED.blobs.has(src)) return ED.blobs.get(src);
    try { const r = await fetch(src, { cache: 'no-store' }); if (r.ok && (r.headers.get('content-type') || '').startsWith('image')) return URL.createObjectURL(await r.blob()); } catch (e) { /* suite */ }
    if (ED.gh && !/^https?:/.test(src)) return URL.createObjectURL(await ED.ghRaw(src));
    throw new Error('image introuvable');
  };
  ED.src = p => {
    if (!p) return '';
    if (ED.blobs.has(p)) return ED.blobs.get(p);
    return p;
  };
  ED.rawUrl = p => ED.gh && !/^https?:|^blob:/.test(p) ? `https://raw.githubusercontent.com/${ED.gh.owner}/${ED.gh.repo}/${ED.gh.branch}/${ED.encPath(p)}` : p;
  ED.pickFiles = (accept, multiple) => new Promise(res => {
    const inp = h('input', { type: 'file', accept, multiple: !!multiple, style: 'display:none' });
    inp.addEventListener('change', () => { res([...inp.files]); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });

  /* ---------- Publication ---------- */
  let publishing = false;
  ED.publish = async () => {
    if (!ED.gh) return ED.download();
    if (ED.uploading) { ED.toast('Attends la fin de l’envoi des fichiers…'); return; }
    if (publishing) return;
    publishing = true;
    const t = ED.toast('Publication…', 'busy', 0);
    try {
      const cur = await ED.ghReq(`/contents/${ED.CONTENT_PATH}?ref=${encodeURIComponent(ED.gh.branch)}`);
      if (ED.baseSha && cur.sha !== ED.baseSha && !confirm('Le contenu a été modifié ailleurs depuis l’ouverture de l’éditeur (sur GitHub ou un autre appareil).\n\nPublier quand même et remplacer cette version ?')) { t.close(); return; }
      const res = await ED.ghReq(`/contents/${ED.CONTENT_PATH}`, { method: 'PUT', body: JSON.stringify({ message: 'Mise à jour du contenu (éditeur visuel)', content: ED.textToB64(ED.serialize(ED.data)), sha: cur.sha, branch: ED.gh.branch }) });
      ED.baseSha = res.content.sha;
      ED.dirty = false;
      ED.ls.del(ED.KEYS.DRAFT); ED.ls.del(ED.KEYS.PREVIEW_FLAG); ED.ls.del(ED.KEYS.PREVIEW_DATA);
      t.done('Publié ✓ Ton site sera à jour d’ici 1 à 2 minutes.');
    } catch (e) { t.fail('Échec de la publication : ' + ED.ghError(e)); }
    finally { publishing = false; ED.onState && ED.onState(); }
  };
  ED.download = () => {
    const a = h('a', { href: URL.createObjectURL(new Blob([ED.serialize(ED.data)], { type: 'text/javascript' })), download: 'contenu.js' });
    document.body.append(a); a.click(); a.remove();
    ED.toast('Sauvegarde contenu.js téléchargée.', 'ok', 5000);
  };
  addEventListener('beforeunload', e => { if (ED.uploading || publishing) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Écran de connexion ---------- */
  ED.guessRepo = () => {
    const host = location.hostname.toLowerCase();
    if (/\.github\.io$/.test(host)) { const owner = host.split('.')[0]; const seg = location.pathname.split('/').filter(Boolean)[0]; return { owner, repo: seg && !/\.html?$/.test(seg) ? seg : host }; }
    return { owner: '', repo: '' };
  };
  ED.showConnect = (onDone, errorMsg) => {
    let saved = {};
    try { saved = JSON.parse(ED.ls.get(ED.KEYS.CFG) || '{}'); } catch (e) { /* rien */ }
    const g = ED.guessRepo();
    const owner = h('input', { type: 'text', value: saved.owner || g.owner, placeholder: 'ton-pseudo', autocapitalize: 'off', spellcheck: 'false' });
    const repo = h('input', { type: 'text', value: saved.repo || g.repo, placeholder: 'ton-pseudo.github.io', autocapitalize: 'off', spellcheck: 'false' });
    const token = h('input', { type: 'password', value: '', style: 'flex:1;min-width:0', placeholder: 'github_pat_…', autocomplete: 'new-password', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false' });
    const info = h('p', { class: 'help' }, 'Commence par github_pat_ · environ 93 caractères');
    const showBtn = h('button', { type: 'button', class: 'btn ghost small', onclick: () => { const hid = token.type === 'password'; token.type = hid ? 'text' : 'password'; showBtn.textContent = hid ? 'Masquer' : 'Afficher'; } }, 'Afficher');
    token.addEventListener('input', () => { const t = ED.cleanToken(token.value); info.textContent = t ? `${t.length} caractères · commence par « ${t.slice(0, 11)} »` : 'Commence par github_pat_ · environ 93 caractères'; });
    const remember = h('input', { type: 'checkbox', checked: true });
    const err = h('p', { class: 'err-msg', role: 'alert' }, errorMsg || '');
    const go = h('button', { type: 'submit', class: 'btn primary wide' }, 'Se connecter');
    const form = h('form', { class: 'login', onsubmit: async e => {
      e.preventDefault(); err.textContent = '';
      if (!owner.value.trim() || !repo.value.trim()) { err.textContent = 'Remplis ton nom d’utilisateur et le nom du dépôt.'; return; }
      const pb = ED.tokenProblem(ED.cleanToken(token.value));
      if (pb) { err.textContent = pb; return; }
      go.disabled = true; go.textContent = 'Connexion…';
      try {
        const content = await ED.connect({ owner: owner.value, repo: repo.value, token: token.value });
        ED.ls.set(ED.KEYS.CFG, JSON.stringify(remember.checked ? ED.gh : { owner: ED.gh.owner, repo: ED.gh.repo, branch: ED.gh.branch }));
        onDone(content);
      } catch (ex) {
        ED.gh = null;
        err.textContent = ex.status === 401 ? 'GitHub refuse ce jeton : il a été mal copié, supprimé ou a expiré. Crée-en un nouveau et colle-le avec l’icône de copie.' : 'Connexion impossible : ' + (ex.status !== undefined ? ED.ghError(ex) : ex.message);
        go.disabled = false; go.textContent = 'Se connecter';
      }
    } },
      h('h1', {}, 'Éditeur du portfolio'),
      h('p', { class: 'lead' }, 'Connecte-toi avec ton jeton GitHub, puis modifie ton site directement sur la page.'),
      h('label', {}, h('span', {}, 'Nom d’utilisateur GitHub'), owner),
      h('label', {}, h('span', {}, 'Nom du dépôt'), repo),
      h('label', {}, h('span', {}, 'Jeton d’accès'), h('div', { style: 'display:flex;gap:8px;align-items:center' }, token, showBtn), info),
      h('label', { class: 'f-check' }, remember, h('span', { class: 'sw' }), h('span', {}, 'Se souvenir sur cet appareil')),
      err, go,
      h('details', { class: 'adv' }, h('summary', {}, 'Comment obtenir un jeton ?'), h('ol', {},
        h('li', {}, 'Ouvre ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'github.com/settings/personal-access-tokens/new'), '.'),
        h('li', {}, 'Repository access : « Only select repositories » → ton dépôt.'),
        h('li', {}, 'Permissions : Contents → « Read and write ».'),
        h('li', {}, '« Generate token », puis copie-le avec l’icône de copie.'))),
      h('button', { type: 'button', class: 'btn ghost wide', onclick: () => { ED.gh = null; onDone(window.CONTENU || {}); } }, 'Continuer hors ligne'));
    ED.$('#app').replaceChildren(form);
  };
})();
