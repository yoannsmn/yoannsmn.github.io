/* ==========================================================================
   Éditeur du portfolio (admin.html)
   Modifie data/contenu.js et envoie les images directement sur GitHub.
   ========================================================================== */
(() => {
  'use strict';

  const DRAFT_KEY = 'portfolio-brouillon';
  const PREVIEW_DATA = 'portfolio-apercu-data';
  const PREVIEW_FLAG = 'portfolio-apercu';
  const CFG_KEY = 'portfolio-github';
  const TAB_KEY = 'portfolio-onglet';
  const CONTENT_PATH = 'data/contenu.js';

  const $ = (s, el = document) => el.querySelector(s);
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del: k => { try { localStorage.removeItem(k); } catch (e) { /* rien */ } }
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

  /* ---------- Fabrique d'éléments ---------- */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (['value', 'checked', 'hidden', 'open', 'multiple', 'disabled'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
    return el;
  }
  const sm = (label, title, fn, cls = '') => h('button', { type: 'button', class: 'sm ' + cls, title, 'aria-label': title, onclick: fn }, label);

  /* ---------- Messages ---------- */
  function toast(msg, type = '', ms = 3500) {
    const el = h('div', { class: 'toast ' + type, role: 'status' }, msg);
    $('#toasts').append(el);
    const kill = d => setTimeout(() => el.remove(), d);
    if (ms) kill(ms);
    return {
      set: m => { el.textContent = m; },
      done: m => { el.className = 'toast ok'; el.textContent = m; kill(3000); },
      fail: m => { el.className = 'toast err'; el.textContent = m; kill(8000); },
      close: () => el.remove()
    };
  }

  /* ---------- Vidéos (même détection que le site) ---------- */
  function videoInfo(url) {
    if (!url) return null;
    let m = String(url).match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return { type: 'youtube', id: m[1] };
    m = String(url).match(/vimeo\.com\/(?:.*\/)?(\d{6,})/);
    if (m) return { type: 'vimeo', id: m[1] };
    if (/\.(mp4|webm|mov)(\?|#|$)/i.test(url)) return { type: 'file' };
    return null;
  }

  /* ==========================================================================
     Description des champs modifiables
     t = type de champ · k = clé dans contenu.js · l = libellé affiché
     ========================================================================== */
  const ANIMS = [
    ['', 'Comme le réglage général'],
    ['cinema', 'Cinéma — bandes noires'],
    ['zoom', 'Zoom lumineux'],
    ['fondu', 'Fondu + « Voir le projet »'],
    ['balayage', 'Balayage de lumière'],
    ['glitch', 'Glitch'],
    ['aucune', 'Aucune animation']
  ];
  const FORMAT_HELP = 'Ligne vide = nouveau paragraphe · **gras** · *italique* · [texte du lien](https://…)';

  const SITE_FIELDS = [
    { k: 'nom', l: 'Ton nom (en haut de toutes les pages)', t: 'text' },
    { k: 'accueil', l: "Page d'accueil", t: 'object', fields: [
      { k: 'titre', l: "Grand titre sur l'image", t: 'text' },
      { k: 'preambule', l: 'Préambule', t: 'textarea', rows: 3 },
      { k: 'image', l: "Image d'accueil", t: 'image', folder: 'accueil', max: 2400 },
      { k: 'video', l: "Vidéo d'arrière-plan (optionnel)", t: 'video', help: "YouTube ou Vimeo : elle tourne en boucle, sans son, par-dessus l'image. Sur téléphone, seule l'image s'affiche (chargement plus rapide)." },
      { k: 'hauteur', l: "Hauteur de l'image d'accueil (% de l'écran)", t: 'range', min: 40, max: 100, step: 5 }
    ] },
    { k: 'titreFilms', l: 'Titre au-dessus de la liste des films', t: 'text' },
    { k: 'animationSurvol', l: 'Animation au survol des projets', t: 'select', options: ANIMS.slice(1), help: 'Sur téléphone, l’animation se joue quand le projet passe au milieu de l’écran. Chaque projet peut aussi avoir sa propre animation (onglet Films).' },
    { k: 'formatVignettes', l: 'Format des vignettes', t: 'select', options: [['16/9', '16:9 (classique)'], ['2.39/1', '2.39:1 (cinémascope)'], ['2/1', '2:1'], ['4/3', '4:3'], ['1/1', 'Carré'], ['4/5', 'Portrait 4:5']] },
    { k: 'colonnes', l: 'Projets par ligne sur ordinateur', t: 'select', options: [['1', '1'], ['2', '2'], ['3', '3']], help: 'Sur téléphone : toujours 1 par ligne.' },
    { k: 'couleurAccent', l: "Couleur d'accent", t: 'color' },
    { k: 'grain', l: 'Effet grain de pellicule', t: 'checkbox' },
    { k: 'menu', l: 'Noms des onglets du menu', t: 'object', fields: [
      { k: 'films', l: 'Films', t: 'text' }, { k: 'photos', l: 'Photos', t: 'text' },
      { k: 'apropos', l: 'À propos', t: 'text' }, { k: 'contact', l: 'Contact', t: 'text' }
    ] },
    { k: 'titreOnglet', l: "Titre dans l'onglet du navigateur", t: 'text' },
    { k: 'descriptionGoogle', l: 'Description pour Google', t: 'textarea', rows: 2 },
    { k: 'piedDePage', l: 'Texte du pied de page', t: 'text' }
  ];

  const FILM_FIELDS = [
    { group: 'Présentation' },
    { k: 'titre', l: 'Titre', t: 'text', after: (o, old, val, ctx) => {
      // L'adresse suit le titre seulement pour un projet tout neuf (pour ne pas casser un lien déjà partagé).
      if (!o.id || (/^nouveau-projet/.test(o.id) && o.id.startsWith(slugify(old)))) { o.id = uniqueId(slugify(val), o); if (ctx.inputs.id) ctx.inputs.id.value = o.id; }
    } },
    { k: 'sousTitre', l: 'Sous-titre', t: 'text' },
    { k: 'categorie', l: 'Catégorie (pastille)', t: 'text', ph: 'Court-métrage, Clip, Mini-série…' },
    { k: 'roles', l: 'Mes rôles (séparés par des virgules)', t: 'tags', ph: 'Producteur, Directeur de production', help: 'Affichés sous la vignette et dans « Mon travail ».' },
    { k: 'vignette', l: 'Vignette (image dans la liste des films)', t: 'image', max: 1400 },
    { k: 'animation', l: 'Animation au survol', t: 'select', options: ANIMS },
    { group: 'Vidéo' },
    { k: 'video', l: 'Lien de la vidéo', t: 'video', help: 'Colle le lien YouTube ou Vimeo : la vidéo se lit directement sur la page du projet.' },
    { group: 'Textes' },
    { k: 'textes', l: 'Textes pour raconter le projet', t: 'list', item: 'Texte', titleKey: 'titre', blank: { titre: '', sousTitre: '', texte: '' }, fields: [
      { k: 'titre', l: 'Titre', t: 'text' },
      { k: 'sousTitre', l: 'Sous-titre', t: 'text' },
      { k: 'texte', l: 'Texte', t: 'textarea', rows: 6, help: FORMAT_HELP }
    ] },
    { k: 'monTravail', l: 'Mon travail sur le projet', t: 'object', fields: [
      { k: 'titre', l: 'Titre', t: 'text' },
      { k: 'texte', l: 'Ce que j’ai fait', t: 'textarea', rows: 5, help: 'Laisse vide pour masquer ce bloc. ' + FORMAT_HELP }
    ] },
    { group: 'Détails & crédits' },
    { k: 'details', l: 'Détails (durée, format, année…)', t: 'pairs', a: ['label', 'Intitulé'], b: ['valeur', 'Valeur'], blank: { label: '', valeur: '' } },
    { k: 'credits', l: 'Crédits', t: 'pairs', a: ['fonction', 'Fonction'], b: ['noms', 'Noms (séparés par « - »)'], blank: { fonction: '', noms: '' }, area: true },
    { group: 'Photos' },
    { k: 'photosGrandFormat', l: 'Photos grand format (pleine largeur)', t: 'images', max: 2200 },
    { k: 'photosCollage', l: 'Photos petit format (collage)', t: 'images', max: 1400 },
    { group: 'Réglages' },
    { k: 'id', l: 'Adresse de la page', t: 'slug', help: 'Utilisée dans le lien : projet.html?id=… (se remplit toute seule).' },
    { k: 'masquer', l: 'Masquer ce projet sur le site', t: 'checkbox' }
  ];
  const NEW_FILM = {
    id: '', titre: 'NOUVEAU PROJET', sousTitre: '', categorie: '', roles: [], vignette: '', animation: '', video: '',
    photosGrandFormat: [], photosCollage: [], textes: [{ titre: '', sousTitre: '', texte: '' }],
    details: [{ label: 'Durée', valeur: '' }, { label: 'Format', valeur: '' }],
    credits: [{ fonction: 'Réalisation', noms: '' }, { fonction: 'Production', noms: '' }],
    monTravail: { titre: 'Mon travail sur le projet', texte: '' }, masquer: false
  };

  const PHOTOS_FIELDS = [
    { k: 'titre', l: 'Titre de la page', t: 'text' },
    { k: 'intro', l: "Texte d'introduction (optionnel)", t: 'textarea', rows: 3, help: FORMAT_HELP },
    { k: 'series', l: 'Séries (chaque série = un onglet sur la page Photos)', t: 'list', item: 'Série', titleKey: 'titre', folder: 'photos', blank: { titre: 'Nouvelle série', description: '', photos: [] }, fields: [
      { k: 'titre', l: "Nom de la série (nom de l'onglet)", t: 'text' },
      { k: 'description', l: 'Description (optionnel)', t: 'text' },
      { k: 'photos', l: 'Photos', t: 'images', caption: true, folder: 'photos', max: 2200 }
    ] }
  ];
  const APROPOS_FIELDS = [
    { k: 'titre', l: 'Titre', t: 'text' },
    { k: 'sousTitre', l: 'Sous-titre', t: 'text' },
    { k: 'portrait', l: 'Portrait', t: 'image', folder: 'apropos', max: 1400 },
    { k: 'texte', l: 'Présentation', t: 'textarea', rows: 8, help: FORMAT_HELP },
    { k: 'competences', l: 'Compétences (séparées par des virgules)', t: 'text' },
    { k: 'parcours', l: 'Parcours', t: 'list', item: 'Étape', titleKey: 'intitule', blank: { periode: '', intitule: '', texte: '' }, fields: [
      { k: 'periode', l: 'Période', t: 'text', ph: '2024 — 2025' },
      { k: 'intitule', l: 'Intitulé', t: 'text' },
      { k: 'texte', l: 'Description', t: 'textarea', rows: 2 }
    ] },
    { k: 'cv', l: 'CV en PDF (optionnel)', t: 'file', folder: 'documents', accept: 'application/pdf' }
  ];
  const CONTACT_FIELDS = [
    { k: 'titre', l: 'Titre', t: 'text' },
    { k: 'texte', l: "Texte d'accroche", t: 'textarea', rows: 3, help: FORMAT_HELP },
    { k: 'email', l: 'E-mail', t: 'text', ph: 'ton.email@exemple.com' },
    { k: 'telephone', l: 'Téléphone (optionnel)', t: 'text' },
    { k: 'lieu', l: 'Ville / zone (optionnel)', t: 'text' },
    { k: 'reseaux', l: 'Réseaux sociaux (aussi affichés en pied de page)', t: 'pairs', a: ['nom', 'Nom (Instagram…)'], b: ['url', 'Lien https://…'], blank: { nom: '', url: '' } },
    { k: 'formulaire', l: 'Afficher un formulaire de contact', t: 'checkbox' },
    { k: 'formspree', l: 'Adresse Formspree (optionnel)', t: 'text', ph: 'https://formspree.io/f/xxxxxxx', help: 'Sans adresse : le formulaire ouvre la messagerie du visiteur. Avec un compte gratuit sur formspree.io, tu reçois les messages directement par e-mail.' }
  ];

  const TABS = [
    { id: 'films', label: 'Films' },
    { id: 'site', label: 'Accueil & réglages', fields: SITE_FIELDS },
    { id: 'photos', label: 'Photos', fields: PHOTOS_FIELDS },
    { id: 'apropos', label: 'À propos', fields: APROPOS_FIELDS },
    { id: 'contact', label: 'Contact', fields: CONTACT_FIELDS },
    { id: 'aide', label: 'Aide' }
  ];

  /* ==========================================================================
     État
     ========================================================================== */
  let data = null;          // contenu en cours d'édition
  let gh = null;            // { owner, repo, branch, token } si connecté
  let baseSha = null;       // version de contenu.js chargée depuis GitHub
  let dirty = false;
  let uploading = 0;
  let currentTab = ls.get(TAB_KEY) || 'films';
  const blobs = new Map();  // chemin → aperçu local (images tout juste envoyées)
  const openCards = new WeakSet();

  function normalize(d) {
    d = d || {};
    d.site = d.site || {}; d.site.accueil = d.site.accueil || {}; d.site.menu = d.site.menu || {};
    d.films = Array.isArray(d.films) ? d.films : [];
    d.photos = d.photos || {}; d.photos.series = Array.isArray(d.photos.series) ? d.photos.series : [];
    d.apropos = d.apropos || {}; d.apropos.parcours = Array.isArray(d.apropos.parcours) ? d.apropos.parcours : [];
    d.contact = d.contact || {}; d.contact.reseaux = Array.isArray(d.contact.reseaux) ? d.contact.reseaux : [];
    return d;
  }

  /* ---------- Sauvegarde automatique (sur cet appareil) ---------- */
  let draftTimer;
  function changed() {
    dirty = true;
    updateState();
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraft, 400);
  }
  function saveDraft() {
    if (!data) return;
    ls.set(DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), baseSha, data }));
  }

  /* ---------- Encodage ---------- */
  function textToB64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64ToText(b64) {
    const bin = atob(String(b64).replace(/\s/g, ''));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }
  const blobToB64 = blob => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });

  const HEADER = '/* ==========================================================\n   CONTENU DU SITE\n   Le plus simple : le modifier via la page admin.html de ton site.\n   Tu peux aussi le modifier ici directement : garde bien les\n   guillemets " " et les virgules entre les éléments.\n   ========================================================== */\n';
  const serialize = d => HEADER + 'window.CONTENU = ' + JSON.stringify(d, null, 2) + ';\n';
  function parseContenu(text) {
    const i = text.indexOf('window.CONTENU');
    const a = text.indexOf('{', i < 0 ? 0 : i), b = text.lastIndexOf('}');
    try { return JSON.parse(text.slice(a, b + 1)); } catch (e) {
      try { const w = {}; new Function('window', text)(w); if (w.CONTENU) return w.CONTENU; } catch (e2) { /* plus bas */ }
      throw new Error('Le fichier data/contenu.js contient une erreur (guillemet ou virgule manquant ?).');
    }
  }

  /* ==========================================================================
     GitHub
     ========================================================================== */
  async function ghReq(path, opts = {}) {
    let r;
    try {
      r = await fetch(`https://api.github.com/repos/${encodeURIComponent(gh.owner)}/${encodeURIComponent(gh.repo)}${path}`, {
        ...opts,
        headers: {
          Authorization: `Bearer ${gh.token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(opts.body ? { 'Content-Type': 'application/json' } : {})
        }
      });
    } catch (e) { const err = new Error('réseau'); err.status = 0; throw err; }
    if (!r.ok) {
      let msg = r.statusText;
      try { msg = (await r.json()).message || msg; } catch (e) { /* rien */ }
      const err = new Error(msg); err.status = r.status; throw err;
    }
    return r.status === 204 ? null : r.json();
  }
  const encPath = p => p.split('/').map(encodeURIComponent).join('/');
  function ghError(e) {
    switch (e.status) {
      case 0: return 'pas de connexion internet ?';
      case 401: return 'jeton invalide ou expiré. Crée-en un nouveau.';
      case 403: return 'accès refusé : le jeton doit avoir la permission « Contents : Read and write » sur ce dépôt.';
      case 404: return 'dépôt ou fichier introuvable. Vérifie le nom du dépôt et que le jeton a bien accès à ce dépôt.';
      case 409: return 'conflit de version. Recharge la page et réessaie.';
      case 413: return 'fichier trop lourd.';
      default: return e.message || 'erreur inconnue';
    }
  }
  async function connect(cfg) {
    gh = { owner: cfg.owner.trim(), repo: cfg.repo.trim(), token: cfg.token.trim(), branch: (cfg.branch || '').trim() };
    const repo = await ghReq('');
    if (repo.permissions && repo.permissions.push === false) { const e = new Error(); e.status = 403; throw e; }
    gh.branch = gh.branch || repo.default_branch || 'main';
    const file = await ghReq(`/contents/${CONTENT_PATH}?ref=${encodeURIComponent(gh.branch)}`);
    baseSha = file.sha;
    return parseContenu(b64ToText(file.content));
  }

  /* ---------- Images ---------- */
  async function prepareImage(file, max) {
    if (/gif|svg/.test(file.type)) return { blob: file, ext: file.type.includes('svg') ? 'svg' : 'gif' };
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale), hh = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = hh;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.fillStyle = '#000'; g.fillRect(0, 0, w, hh);
      g.drawImage(img, 0, 0, w, hh);
      const toBlob = (type, q) => new Promise(r => c.toBlob(r, type, q));
      let blob = await toBlob('image/webp', 0.82), ext = 'webp';
      if (!blob || blob.type !== 'image/webp') { blob = await toBlob('image/jpeg', 0.84); ext = 'jpg'; }
      if (scale === 1 && /jpe?g|webp/.test(file.type) && file.size <= blob.size) return { blob: file, ext: file.type.includes('webp') ? 'webp' : 'jpg' };
      return { blob, ext };
    } catch (e) {
      throw new Error('format d’image non lisible par ce navigateur (essaie en JPEG)');
    } finally { URL.revokeObjectURL(url); }
  }
  function requireConnection() {
    if (gh) return true;
    toast('Connecte-toi à GitHub pour envoyer des fichiers (menu ⋯ → Se connecter).', 'err', 5000);
    return false;
  }
  async function uploadFile(file, folder, { max = 2000, label = '', raw = false } = {}) {
    if (!requireConnection()) return null;
    if (!raw && !file.type.startsWith('image/')) { toast(`« ${file.name} » n'est pas une image.`, 'err'); return null; }
    uploading++; updateState();
    const t = toast(`Envoi ${label} : ${file.name}…`, 'busy', 0);
    try {
      const { blob, ext } = raw ? { blob: file, ext: (file.name.split('.').pop() || 'bin').toLowerCase() } : await prepareImage(file, max);
      if (blob.size > 25 * 1024 * 1024) throw Object.assign(new Error(), { status: 413 });
      const base = slugify(file.name.replace(/\.[^.]+$/, '')).slice(0, 40) || 'fichier';
      const path = `images/${folder}/${base}-${Date.now().toString(36).slice(-5)}.${ext}`.replace('images/documents/', 'documents/');
      await ghReq(`/contents/${encPath(path)}`, { method: 'PUT', body: JSON.stringify({ message: `Ajout : ${path}`, content: await blobToB64(blob), branch: gh.branch }) });
      if (!raw) blobs.set(path, URL.createObjectURL(blob));
      t.done(`Envoyé ✓ (${Math.max(1, Math.round(blob.size / 1024))} Ko)`);
      return path;
    } catch (e) {
      t.fail(`Échec de l'envoi de ${file.name} : ` + (e.status !== undefined ? ghError(e) : e.message));
      return null;
    } finally { uploading--; updateState(); }
  }
  function setPreview(img, p) {
    if (!p) { img.removeAttribute('src'); img.hidden = true; return; }
    img.hidden = false;
    img.onerror = () => {
      img.onerror = null;
      if (gh && !/^https?:/.test(p)) img.src = `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${gh.branch}/${encPath(p)}`;
    };
    img.src = blobs.get(p) || p;
  }
  function dropZone(el, onFiles) {
    el.addEventListener('dragover', e => { e.preventDefault(); el.classList.add('drag'); });
    el.addEventListener('dragleave', () => el.classList.remove('drag'));
    el.addEventListener('drop', e => {
      e.preventDefault(); el.classList.remove('drag');
      const files = [...(e.dataTransfer.files || [])];
      if (files.length) onFiles(files);
    });
  }
  const folderFor = (f, ctx) => ctx.film ? `films/${ctx.film.id || slugify(ctx.film.titre) || 'projet'}` : (f.folder || ctx.folder || 'divers');

  /* ==========================================================================
     Champs de formulaire
     ========================================================================== */
  function autoGrow(ta) {
    const fit = () => { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + 2) + 'px'; };
    ta.addEventListener('input', fit);
    requestAnimationFrame(fit);
  }

  function field(obj, f, ctx) {
    if (f.group) return h('h3', { class: 'grp' }, f.group);
    const set = val => {
      const old = obj[f.k];
      obj[f.k] = val;
      if (f.after) f.after(obj, old, val, ctx);
      changed();
      if (ctx.refresh) ctx.refresh();
    };
    let body;
    switch (f.t) {
      case 'text': case 'slug': {
        const inp = h('input', { type: 'text', value: obj[f.k] ?? '', placeholder: f.ph || '', oninput: e => set(f.t === 'slug' ? slugify(e.target.value) : e.target.value) });
        if (f.t === 'slug') inp.addEventListener('blur', () => { inp.value = obj[f.k] || ''; });
        ctx.inputs && (ctx.inputs[f.k] = inp);
        body = inp; break;
      }
      case 'textarea': {
        const ta = h('textarea', { rows: f.rows || 4, value: obj[f.k] ?? '', placeholder: f.ph || '', oninput: e => set(e.target.value) });
        autoGrow(ta); body = ta; break;
      }
      case 'tags':
        body = h('input', { type: 'text', value: (Array.isArray(obj[f.k]) ? obj[f.k] : []).join(', '), placeholder: f.ph || '',
          oninput: e => set(e.target.value.split(',').map(s => s.trim()).filter(Boolean)) });
        break;
      case 'select': {
        const sel = h('select', { onchange: e => set(e.target.value) }, f.options.map(([v, l]) => h('option', { value: v }, l)));
        sel.value = obj[f.k] ?? f.options[0][0];
        body = sel; break;
      }
      case 'checkbox':
        return h('label', { class: 'f f-check' }, h('input', { type: 'checkbox', checked: !!obj[f.k], onchange: e => set(e.target.checked) }), h('span', { class: 'sw' }), h('span', {}, f.l));
      case 'color':
        body = h('div', { class: 'row' },
          h('input', { type: 'color', value: obj[f.k] || '#8a9bff', oninput: e => { set(e.target.value); e.target.nextSibling.textContent = e.target.value; } }),
          h('code', {}, obj[f.k] || '#8a9bff'));
        break;
      case 'range': {
        const out = h('output', {}, (obj[f.k] || 75) + ' %');
        body = h('div', { class: 'row' }, h('input', { type: 'range', min: f.min, max: f.max, step: f.step, value: obj[f.k] || 75,
          oninput: e => { set(String(e.target.value)); out.textContent = e.target.value + ' %'; } }), out);
        break;
      }
      case 'video': body = videoField(obj, f, set); break;
      case 'image': body = imageField(obj, f, ctx, set); break;
      case 'images': body = imagesField(obj, f, ctx); break;
      case 'file': body = fileField(obj, f, ctx, set); break;
      case 'pairs': body = pairsField(obj, f); break;
      case 'list': body = listField(obj, f, ctx); break;
      case 'object': {
        obj[f.k] = obj[f.k] || {};
        return h('fieldset', { class: 'f f-object' }, h('legend', {}, f.l), f.fields.map(sf => field(obj[f.k], sf, ctx)));
      }
      default: body = h('em', {}, 'Champ inconnu');
    }
    return h('div', { class: 'f f-' + f.t }, h('label', { class: 'f-l' }, f.l), body, f.help ? h('p', { class: 'f-help' }, f.help) : null);
  }

  function videoField(obj, f, set) {
    const st = h('div', { class: 'vid-st' });
    const upd = () => {
      st.replaceChildren();
      const url = obj[f.k];
      if (!url) return;
      const v = videoInfo(url);
      if (!v) { st.append(h('span', { class: 'warn' }, '⚠ Lien non reconnu : utilise un lien YouTube, Vimeo ou un fichier .mp4')); return; }
      if (v.type === 'youtube') st.append(h('img', { src: `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`, alt: '', onerror: e => e.target.remove() }));
      st.append(h('span', { class: 'ok' }, `✓ ${v.type === 'youtube' ? 'Vidéo YouTube' : v.type === 'vimeo' ? 'Vidéo Vimeo' : 'Fichier vidéo'} reconnue`));
    };
    upd();
    return [h('input', { type: 'url', inputmode: 'url', value: obj[f.k] || '', placeholder: 'https://www.youtube.com/watch?v=…', oninput: e => { set(e.target.value.trim()); upd(); } }), st];
  }

  function imageField(obj, f, ctx, set) {
    const img = h('img', { alt: '' });
    const box = h('div', { class: 'img-box' }, img, h('span', { class: 'img-ph' }, 'Aucune image — clique ou glisse une image ici'));
    const path = h('input', { type: 'text', value: obj[f.k] || '', placeholder: 'images/…', oninput: e => { set(e.target.value.trim()); upd(); } });
    const fileIn = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: e => { const fl = e.target.files[0]; e.target.value = ''; if (fl) go(fl); } });
    const pick = h('button', { type: 'button', class: 'btn', onclick: () => requireConnection() && fileIn.click() });
    const rm = h('button', { type: 'button', class: 'btn ghost', onclick: () => { set(''); path.value = ''; upd(); } }, 'Retirer');
    async function go(file) {
      const p = await uploadFile(file, folderFor(f, ctx), { max: f.max });
      if (p) { set(p); path.value = p; upd(); }
    }
    function upd() {
      setPreview(img, obj[f.k]);
      box.classList.toggle('empty', !obj[f.k]);
      pick.textContent = obj[f.k] ? 'Remplacer' : 'Choisir une image';
      rm.hidden = !obj[f.k];
    }
    box.addEventListener('click', () => requireConnection() && fileIn.click());
    dropZone(box, files => go(files[0]));
    upd();
    return [box, h('div', { class: 'row' }, pick, rm, fileIn), h('details', { class: 'adv' }, h('summary', {}, 'Chemin du fichier (avancé)'), path)];
  }

  function imagesField(obj, f, ctx) {
    obj[f.k] = Array.isArray(obj[f.k]) ? obj[f.k] : [];
    const list = obj[f.k];
    const grid = h('div', { class: 'imgs' });
    const fileIn = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: e => { const fl = [...e.target.files]; e.target.value = ''; addFiles(fl); } });
    async function addFiles(files) {
      for (let n = 0; n < files.length; n++) {
        const p = await uploadFile(files[n], folderFor(f, ctx), { max: f.max, label: files.length > 1 ? `${n + 1}/${files.length}` : '' });
        if (p) { list.push(f.caption ? { src: p, legende: '' } : p); changed(); draw(); ctx.refresh && ctx.refresh(); }
      }
    }
    const mv = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; changed(); draw(); };
    function draw() {
      grid.replaceChildren(...list.map((it, i) => {
        const src = typeof it === 'string' ? it : (it && it.src) || '';
        const im = h('img', { alt: '', loading: 'lazy' });
        setPreview(im, src);
        return h('div', { class: 'imgs-item' },
          h('div', { class: 'imgs-thumb' }, im, h('span', { class: 'imgs-n' }, i + 1)),
          h('div', { class: 'imgs-tools' },
            sm('←', 'Déplacer avant', () => mv(i, -1)), sm('→', 'Déplacer après', () => mv(i, 1)),
            sm('✕', 'Retirer cette image', () => { list.splice(i, 1); changed(); draw(); }, 'danger')),
          f.caption ? h('input', { type: 'text', class: 'imgs-cap', placeholder: 'Légende (optionnel)', value: it.legende || '', oninput: e => { it.legende = e.target.value; changed(); } }) : null);
      }), h('button', { type: 'button', class: 'imgs-add', onclick: () => requireConnection() && fileIn.click() }, h('b', {}, '+'), 'Ajouter des images'));
    }
    draw();
    dropZone(grid, files => requireConnection() && addFiles(files));
    const pathIn = h('input', { type: 'text', placeholder: 'images/mon-dossier/photo.jpg' });
    return [grid, fileIn,
      h('p', { class: 'f-help' }, 'Tu peux en sélectionner plusieurs d’un coup. Elles sont automatiquement allégées avant l’envoi.'),
      h('details', { class: 'adv' }, h('summary', {}, 'Ajouter par chemin (avancé)'), h('div', { class: 'row' }, pathIn,
        h('button', { type: 'button', class: 'btn ghost', onclick: () => { const p = pathIn.value.trim(); if (!p) return; list.push(f.caption ? { src: p, legende: '' } : p); pathIn.value = ''; changed(); draw(); } }, 'Ajouter')))];
  }

  function fileField(obj, f, ctx, set) {
    const name = h('span', { class: 'file-name' });
    const fileIn = h('input', { type: 'file', accept: f.accept || '*/*', hidden: true, onchange: async e => {
      const fl = e.target.files[0]; e.target.value = '';
      if (!fl) return;
      const p = await uploadFile(fl, f.folder, { raw: true });
      if (p) { set(p); upd(); }
    } });
    const rm = h('button', { type: 'button', class: 'btn ghost', onclick: () => { set(''); upd(); } }, 'Retirer');
    const upd = () => { name.textContent = obj[f.k] || 'Aucun fichier'; rm.hidden = !obj[f.k]; };
    upd();
    return h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn', onclick: () => requireConnection() && fileIn.click() }, 'Choisir un fichier'), rm, name, fileIn);
  }

  function pairsField(obj, f) {
    obj[f.k] = Array.isArray(obj[f.k]) ? obj[f.k] : [];
    const list = obj[f.k];
    const box = h('div', { class: 'pairs' });
    const mv = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; changed(); draw(); };
    function draw() {
      box.replaceChildren(...list.map((it, i) => {
        const b = h(f.area ? 'textarea' : 'input', { type: 'text', rows: 1, value: it[f.b[0]] || '', placeholder: f.b[1], oninput: e => { it[f.b[0]] = e.target.value; changed(); } });
        if (f.area) autoGrow(b);
        return h('div', { class: 'pair' },
          h('input', { type: 'text', class: 'pair-a', value: it[f.a[0]] || '', placeholder: f.a[1], oninput: e => { it[f.a[0]] = e.target.value; changed(); } }),
          b,
          h('div', { class: 'pair-tools' },
            sm('↑', 'Monter', () => mv(i, -1)), sm('↓', 'Descendre', () => mv(i, 1)),
            sm('✕', 'Supprimer la ligne', () => { list.splice(i, 1); changed(); draw(); }, 'danger')));
      }), h('button', { type: 'button', class: 'btn ghost small', onclick: () => { list.push(clone(f.blank)); changed(); draw(); const ins = box.querySelectorAll('.pair-a'); ins[ins.length - 1]?.focus(); } }, '+ Ajouter une ligne'));
    }
    draw();
    return box;
  }

  function listField(obj, f, ctx) {
    obj[f.k] = Array.isArray(obj[f.k]) ? obj[f.k] : [];
    const list = obj[f.k];
    const box = h('div', { class: 'list' });
    const mv = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; changed(); draw(); };
    function draw() {
      box.replaceChildren(...list.map((it, i) => {
        const name = () => `${f.item} ${i + 1}${f.titleKey && it[f.titleKey] ? ' — ' + it[f.titleKey] : ''}`;
        const title = h('span', { class: 'li-title' }, name());
        const sub = { ...ctx, folder: f.folder || ctx.folder, inputs: {}, refresh() { title.textContent = name(); if (ctx.refresh) ctx.refresh(); } };
        return h('div', { class: 'li' },
          h('div', { class: 'li-head' }, title, h('div', { class: 'li-tools' },
            sm('↑', 'Monter', () => mv(i, -1)), sm('↓', 'Descendre', () => mv(i, 1)),
            sm('✕', 'Supprimer', () => { if (confirm(`Supprimer « ${name()} » ?`)) { list.splice(i, 1); changed(); draw(); } }, 'danger'))),
          f.fields.map(sf => field(it, sf, sub)));
      }), h('button', { type: 'button', class: 'btn ghost small', onclick: () => { list.push(clone(f.blank)); changed(); draw(); } }, `+ Ajouter : ${f.item.toLowerCase()}`));
    }
    draw();
    return box;
  }

  /* ==========================================================================
     Onglet Films
     ========================================================================== */
  const rolesLine = film => [film.categorie, ...(film.roles || [])].filter(Boolean).join(' - ') || 'Aucun rôle indiqué';

  function renderFilms(panel) {
    const films = data.films;
    panel.append(h('div', { class: 'intro' },
      h('p', {}, 'Touche un projet pour le modifier. L’ordre ici est l’ordre d’affichage sur le site.'),
      h('button', { type: 'button', class: 'btn primary', onclick: () => {
        const f = clone(NEW_FILM); f.id = uniqueId(slugify(f.titre));
        films.unshift(f); openCards.add(f); changed(); renderPanel();
        toast('Nouveau projet ajouté en haut de la liste.');
      } }, '+ Nouveau projet')));
    films.forEach((film, i) => panel.append(filmCard(film, i, films)));
  }

  function filmCard(film, i, films) {
    const thumb = h('img', { class: 'fc-thumb', alt: '' });
    setPreview(thumb, film.vignette);
    const title = h('strong', {}, film.titre || 'Sans titre');
    const sub = h('span', { class: 'fc-sub' }, rolesLine(film));
    const badge = h('span', { class: 'badge', hidden: !film.masquer }, 'Masqué');
    const det = h('details', { class: 'fc', open: openCards.has(film) },
      h('summary', {}, h('div', { class: 'fc-thumbwrap' }, thumb), h('div', { class: 'fc-head' }, title, sub), badge, h('span', { class: 'fc-chev', 'aria-hidden': 'true' }, '›')));
    const ctx = {
      film, inputs: {},
      refresh() { title.textContent = film.titre || 'Sans titre'; sub.textContent = rolesLine(film); setPreview(thumb, film.vignette); badge.hidden = !film.masquer; }
    };
    const move = d => { const j = i + d; if (j < 0 || j >= films.length) return; [films[i], films[j]] = [films[j], films[i]]; changed(); renderPanel(); };
    let built = false;
    const build = () => {
      if (built) return;
      built = true;
      det.append(h('div', { class: 'fc-body' },
        h('div', { class: 'fc-tools' },
          sm('↑ Monter', 'Monter', () => move(-1)), sm('↓ Descendre', 'Descendre', () => move(1)),
          sm('👁 Aperçu', 'Aperçu de la page', () => preview('projet.html?id=' + encodeURIComponent(film.id))),
          sm('Dupliquer', 'Dupliquer', () => { const c = clone(film); c.titre += ' (copie)'; c.id = uniqueId(slugify(c.titre)); films.splice(i + 1, 0, c); openCards.add(c); changed(); renderPanel(); }),
          sm('Supprimer', 'Supprimer', () => { if (confirm(`Supprimer le projet « ${film.titre} » ?`)) { films.splice(i, 1); changed(); renderPanel(); } }, 'danger')),
        FILM_FIELDS.map(f => field(film, f, ctx))));
    };
    if (det.open) build();
    det.addEventListener('toggle', () => { if (det.open) { openCards.add(film); build(); } else openCards.delete(film); });
    return det;
  }
  function uniqueId(base, except) {
    base = base || 'projet';
    let id = base, n = 2;
    while (data.films.some(f => f !== except && f.id === id)) id = `${base}-${n++}`;
    return id;
  }
  function fixIds() {
    data.films.forEach(f => { f.id = uniqueId(f.id || slugify(f.titre), f); });
  }

  /* ==========================================================================
     Onglet Aide
     ========================================================================== */
  function renderHelp(panel) {
    const li = (...t) => h('li', {}, ...t);
    panel.append(h('div', { class: 'help' },
      h('h2', {}, 'Comment ça marche'),
      h('ol', {},
        li('Modifie ce que tu veux dans les onglets. Tout est enregistré automatiquement ', h('b', {}, 'sur cet appareil'), ' (rien n’est perdu si tu fermes la page).'),
        li('Clique sur ', h('b', {}, 'Aperçu'), ' pour voir le résultat avant de le mettre en ligne.'),
        li('Clique sur ', h('b', {}, 'Publier'), ' : ton site est mis à jour pour tout le monde en 1 à 2 minutes.')),
      h('h2', {}, 'Images'),
      h('ul', {},
        li('Les images sont envoyées sur GitHub dès que tu les choisis, et automatiquement allégées (pas besoin de les redimensionner avant).'),
        li('Vignettes : idéalement au format horizontal 16:9. Photos grand format : horizontales. Collage : tous formats.'),
        li('Retirer une image du site ne la supprime pas de GitHub (sans conséquence).')),
      h('h2', {}, 'Mise en forme des textes'),
      h('ul', {},
        li('Une ligne vide = un nouveau paragraphe.'),
        li(h('code', {}, '**mots en gras**'), ' · ', h('code', {}, '*mots en italique*'), ' · ', h('code', {}, '[texte du lien](https://…)'))),
      h('h2', {}, 'Vidéos'),
      h('p', {}, 'Colle simplement le lien YouTube (ou Vimeo) de la vidéo. Sur la page, un bouton lecture s’affiche ; le lecteur ne se charge qu’au clic, ce qui garde le site rapide.'),
      h('h2', {}, 'Sécurité'),
      h('p', {}, 'Ton jeton GitHub n’est enregistré que dans ce navigateur. Ne le partage jamais. Sur un ordinateur qui n’est pas le tien, décoche « Se souvenir » ou utilise ⋯ → Se déconnecter.')));
  }

  /* ==========================================================================
     Interface
     ========================================================================== */
  function renderPanel() {
    const panel = $('#panel');
    const y = scrollY;
    panel.replaceChildren();
    const tab = TABS.find(t => t.id === currentTab) || TABS[0];
    if (tab.id === 'films') renderFilms(panel);
    else if (tab.id === 'aide') renderHelp(panel);
    else {
      data[tab.id] = data[tab.id] || {};
      const ctx = { inputs: {} };
      panel.append(h('div', { class: 'card-plain' }, tab.fields.map(f => field(data[tab.id], f, ctx))));
    }
    $$tabs();
    scrollTo(0, y);
  }
  function $$tabs() {
    document.querySelectorAll('.tabs button').forEach(b => {
      const on = b.dataset.tab === currentTab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on);
    });
  }
  function updateState() {
    const pub = $('#btn-publish');
    if (!pub) return;
    pub.classList.toggle('has-changes', dirty);
    pub.textContent = gh ? (dirty ? 'Publier •' : 'Publier') : 'Télécharger';
    pub.disabled = uploading > 0;
    $('#status').textContent = uploading ? 'Envoi en cours…' : dirty ? 'Modifications non publiées (sauvegardées sur cet appareil)' : 'Tout est publié';
    $('#status').className = 'status ' + (uploading ? 'busy' : dirty ? 'warn' : 'ok');
  }

  function preview(url = 'index.html') {
    clearTimeout(draftTimer); saveDraft();
    if (!ls.set(PREVIEW_DATA, JSON.stringify(data))) { toast("Aperçu impossible : stockage du navigateur indisponible.", 'err'); return; }
    ls.set(PREVIEW_FLAG, '1');
    window.open(url + (url.includes('?') ? '&' : '?') + 'apercu=1', 'apercu-portfolio');
  }

  function download() {
    const blob = new Blob([serialize(data)], { type: 'text/javascript' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'contenu.js' });
    document.body.append(a); a.click(); a.remove();
    toast('Fichier contenu.js téléchargé. Remplace data/contenu.js sur GitHub par ce fichier.', 'ok', 7000);
  }

  let publishing = false;
  async function publish() {
    if (!gh) return download();
    if (uploading) { toast('Attends la fin de l’envoi des images…'); return; }
    if (publishing) return;
    publishing = true;
    fixIds();
    const t = toast('Publication…', 'busy', 0);
    $('#btn-publish').disabled = true;
    try {
      const cur = await ghReq(`/contents/${CONTENT_PATH}?ref=${encodeURIComponent(gh.branch)}`);
      if (baseSha && cur.sha !== baseSha && !confirm('Le contenu a été modifié ailleurs (sur GitHub ou un autre appareil) depuis l’ouverture de l’éditeur.\n\nPublier quand même et remplacer cette version ?')) { t.close(); return; }
      const res = await ghReq(`/contents/${CONTENT_PATH}`, { method: 'PUT', body: JSON.stringify({
        message: 'Mise à jour du contenu (éditeur)', content: textToB64(serialize(data)), sha: cur.sha, branch: gh.branch }) });
      baseSha = res.content.sha;
      dirty = false;
      ls.del(DRAFT_KEY); ls.del(PREVIEW_FLAG); ls.del(PREVIEW_DATA);
      t.done('Publié ✓ Ton site sera à jour d’ici 1 à 2 minutes.');
    } catch (e) {
      t.fail('Échec de la publication : ' + ghError(e));
    } finally { publishing = false; updateState(); }
  }

  function menu() {
    const close = () => m.remove();
    const item = (label, fn, cls = '') => h('button', { type: 'button', class: cls, onclick: () => { close(); fn(); } }, label);
    const imp = h('input', { type: 'file', accept: '.js,.json', hidden: true, onchange: async e => {
      const fl = e.target.files[0]; if (!fl) return;
      try { data = normalize(parseContenu(await fl.text())); changed(); renderPanel(); toast('Sauvegarde importée. Publie pour la mettre en ligne.', 'ok'); }
      catch (err) { toast(err.message, 'err'); }
    } });
    const m = h('div', { class: 'menu-back', onclick: e => { if (e.target === m) close(); } },
      h('div', { class: 'menu' },
        gh ? h('p', { class: 'menu-info' }, `Connecté à ${gh.owner}/${gh.repo} (${gh.branch})`) : h('p', { class: 'menu-info' }, 'Mode hors ligne'),
        h('a', { href: 'index.html', target: '_blank', rel: 'noopener', class: 'menu-link' }, 'Voir le site en ligne ↗'),
        item('Télécharger une sauvegarde (contenu.js)', download),
        item('Importer une sauvegarde…', () => imp.click()),
        gh ? item('Annuler les modifications non publiées', async () => {
          if (!confirm('Revenir à la version publiée ? Tes modifications non publiées seront perdues.')) return;
          ls.del(DRAFT_KEY); location.reload();
        }, 'danger') : null,
        gh ? item('Se déconnecter', () => { const c = JSON.parse(ls.get(CFG_KEY) || '{}'); delete c.token; ls.set(CFG_KEY, JSON.stringify(c)); location.reload(); })
          : item('Se connecter à GitHub', () => { showConnect(); }),
        item('Fermer', () => {}), imp));
    document.body.append(m);
  }

  function startEditor(content) {
    data = normalize(clone(content));
    dirty = false;
    // Brouillon non publié ?
    let draft = null;
    try { draft = JSON.parse(ls.get(DRAFT_KEY) || 'null'); } catch (e) { /* ignoré */ }
    const app = $('#app');
    app.replaceChildren(h('div', { class: 'bar' },
      h('header', { class: 'top' },
        h('div', { class: 'brand' }, h('strong', {}, 'Éditeur'), h('span', { id: 'status', class: 'status' })),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn ghost', onclick: () => preview() }, 'Aperçu'),
          h('button', { type: 'button', id: 'btn-publish', class: 'btn primary', onclick: publish }, 'Publier'),
          h('button', { type: 'button', class: 'btn ghost icon', 'aria-label': 'Menu', onclick: menu }, '⋯'))),
      h('nav', { class: 'tabs', role: 'tablist' }, TABS.map(t => h('button', { type: 'button', role: 'tab', 'data-tab': t.id, onclick: () => { currentTab = t.id; ls.set(TAB_KEY, t.id); renderPanel(); scrollTo(0, 0); } }, t.label)))),
      h('div', { id: 'notice' }),
      h('main', { id: 'panel', class: 'panel' }));
    if (!gh) $('#notice').append(h('div', { class: 'notice' },
      h('p', {}, h('b', {}, 'Mode hors ligne. '), 'Tu peux tout modifier et prévisualiser. Pour mettre en ligne : connecte-toi à GitHub (menu ⋯), ou télécharge le fichier et remplace data/contenu.js sur GitHub.')));
    if (draft && draft.data && JSON.stringify(draft.data) !== JSON.stringify(data)) {
      const when = new Date(draft.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      const n = h('div', { class: 'notice warn' },
        h('p', {}, `Tu as des modifications non publiées enregistrées sur cet appareil (${when}).`),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn primary', onclick: () => { data = normalize(draft.data); n.remove(); changed(); renderPanel(); } }, 'Les reprendre'),
          h('button', { type: 'button', class: 'btn ghost', onclick: () => { ls.del(DRAFT_KEY); n.remove(); } }, 'Les ignorer')));
      $('#notice').append(n);
    }
    renderPanel();
    updateState();
  }

  /* ---------- Écran de connexion ---------- */
  function guessRepo() {
    const host = location.hostname.toLowerCase();
    if (/\.github\.io$/.test(host)) {
      const owner = host.split('.')[0];
      const seg = location.pathname.split('/').filter(Boolean)[0];
      return { owner, repo: seg && !/\.html?$/.test(seg) ? seg : host };
    }
    return { owner: '', repo: '' };
  }
  function showConnect(errorMsg) {
    const saved = JSON.parse(ls.get(CFG_KEY) || '{}');
    const g = guessRepo();
    const owner = h('input', { type: 'text', value: saved.owner || g.owner, placeholder: 'ton-pseudo', autocomplete: 'username', autocapitalize: 'off', spellcheck: 'false' });
    const repo = h('input', { type: 'text', value: saved.repo || g.repo, placeholder: 'ton-pseudo.github.io', autocapitalize: 'off', spellcheck: 'false' });
    const token = h('input', { type: 'password', value: '', placeholder: 'github_pat_…', autocomplete: 'off', spellcheck: 'false' });
    const remember = h('input', { type: 'checkbox', checked: true });
    const err = h('p', { class: 'err-msg', role: 'alert' }, errorMsg || '');
    const go = h('button', { type: 'submit', class: 'btn primary wide' }, 'Se connecter');
    const form = h('form', { class: 'login', onsubmit: async e => {
      e.preventDefault();
      err.textContent = '';
      if (!owner.value.trim() || !repo.value.trim() || !token.value.trim()) { err.textContent = 'Remplis les trois champs.'; return; }
      go.disabled = true; go.textContent = 'Connexion…';
      try {
        const content = await connect({ owner: owner.value, repo: repo.value, token: token.value });
        ls.set(CFG_KEY, JSON.stringify(remember.checked ? gh : { owner: gh.owner, repo: gh.repo, branch: gh.branch }));
        startEditor(content);
        toast('Connecté ✓', 'ok');
      } catch (ex) {
        gh = null;
        err.textContent = 'Connexion impossible : ' + (ex.status !== undefined ? ghError(ex) : ex.message);
        go.disabled = false; go.textContent = 'Se connecter';
      }
    } },
      h('h1', {}, 'Éditeur du portfolio'),
      h('p', { class: 'lead' }, 'Connecte-toi une fois avec ton jeton GitHub : tu pourras ensuite modifier textes, photos, vidéos et animations, puis publier en un clic.'),
      h('label', {}, h('span', {}, 'Nom d’utilisateur GitHub'), owner),
      h('label', {}, h('span', {}, 'Nom du dépôt'), repo),
      h('label', {}, h('span', {}, 'Jeton d’accès'), token),
      h('label', { class: 'f-check' }, remember, h('span', { class: 'sw' }), h('span', {}, 'Se souvenir sur cet appareil')),
      err, go,
      h('details', { class: 'adv' }, h('summary', {}, 'Comment obtenir un jeton ?'),
        h('ol', {},
          h('li', {}, 'Ouvre ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'github.com/settings/personal-access-tokens/new'), ' (connecté à ton compte).'),
          h('li', {}, 'Nom : « Portfolio ». Expiration : la durée que tu veux (tu en recréeras un ensuite).'),
          h('li', {}, 'Repository access : « Only select repositories » → choisis le dépôt de ton site.'),
          h('li', {}, 'Permissions → Repository permissions → Contents : « Read and write ».'),
          h('li', {}, 'Clique « Generate token », copie-le et colle-le ici.'))),
      h('button', { type: 'button', class: 'btn ghost wide', onclick: () => { gh = null; startEditor(window.CONTENU || {}); } }, 'Continuer hors ligne'));
    $('#app').replaceChildren(form);
  }

  /* ---------- Démarrage ---------- */
  addEventListener('beforeunload', e => { if (uploading || publishing) { e.preventDefault(); e.returnValue = ''; } });
  addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && data) { e.preventDefault(); publish(); } });

  (async () => {
    const saved = JSON.parse(ls.get(CFG_KEY) || '{}');
    if (saved.token && saved.owner && saved.repo) {
      $('#app').replaceChildren(h('p', { class: 'loading' }, 'Connexion à GitHub…'));
      try { startEditor(await connect(saved)); return; }
      catch (e) { gh = null; showConnect('Reconnexion impossible : ' + (e.status !== undefined ? ghError(e) : e.message)); return; }
    }
    showConnect();
  })();
})();
