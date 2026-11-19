/* ==========================================================================
   Modèle du portfolio : types de sections, styles, animations, polices,
   et conversion automatique de l'ancien format de contenu (sans perte).
   Utilisé à la fois par le site (site.js) et par l'éditeur (admin.html).
   ========================================================================== */
(function (root) {
  'use strict';
  const M = {};

  /* ---------- Utilitaires ---------- */
  M.uid = (p = 's') => p + Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-3);
  M.esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  M.slugify = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  M.clone = o => JSON.parse(JSON.stringify(o));
  M.arr = v => Array.isArray(v) ? v : (v ? [v] : []);
  M.get = (obj, path) => String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  M.set = (obj, path, val) => {
    const ks = String(path).split('.');
    let o = obj;
    ks.slice(0, -1).forEach((k, i) => { if (o[k] == null) o[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; o = o[k]; });
    o[ks[ks.length - 1]] = val;
  };
  M.rgba = (hex, op) => {
    const h = String(hex || '#000000').replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h.slice(0, 6), 16) || 0;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(100, +op || 0)) / 100})`;
  };

  // Ancien format de texte (**gras**, *italique*, [lien](url), lignes vides) → HTML
  M.rich = text => {
    const t = String(text ?? '').trim();
    if (!t) return '';
    const inline = s => s
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^\s)]+|[\w\-./#?=&;%]+)\)/g, '<a href="$2">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
    return t.split(/\n\s*\n/).map(p => `<p>${inline(M.esc(p)).replace(/\n/g, '<br>')}</p>`).join('');
  };

  // Nettoyage du HTML saisi dans l'éditeur (balises et attributs autorisés uniquement)
  const OK_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'A', 'UL', 'OL', 'LI', 'H2', 'H3', 'H4', 'SPAN', 'BLOCKQUOTE', 'MARK', 'SMALL']);
  M.sanitize = html => {
    if (typeof document === 'undefined') return String(html || '');
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html || '');
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 8) { n.remove(); return; }
        if (n.nodeType !== 1) return;
        walk(n);
        let tag = n.tagName;
        if (tag === 'DIV') { const p = document.createElement('p'); p.append(...n.childNodes); n.replaceWith(p); return; }
        if (tag === 'FONT') {
          const sp = document.createElement('span');
          if (n.getAttribute('color')) sp.style.color = n.getAttribute('color');
          sp.append(...n.childNodes); n.replaceWith(sp); return;
        }
        if (tag === 'H1') { const h2 = document.createElement('h2'); h2.append(...n.childNodes); n.replaceWith(h2); return; }
        if (!OK_TAGS.has(tag)) { n.replaceWith(...n.childNodes); return; }
        [...n.attributes].forEach(a => {
          const name = a.name.toLowerCase();
          if (tag === 'A' && (name === 'href' || name === 'target' || name === 'download')) {
            if (name === 'href' && /^\s*(javascript|data|vbscript):/i.test(a.value)) n.removeAttribute(a.name);
            return;
          }
          if (name === 'style') {
            const keep = [];
            ['color', 'background-color', 'font-size', 'text-align'].forEach(p => { const v = n.style.getPropertyValue(p); if (v) keep.push(`${p}:${v}`); });
            if (keep.length) n.setAttribute('style', keep.join(';')); else n.removeAttribute('style');
            return;
          }
          n.removeAttribute(a.name);
        });
        if (tag === 'SPAN' && !n.attributes.length) n.replaceWith(...n.childNodes);
      });
    };
    walk(tpl.content);
    return tpl.innerHTML.replace(/<p><br><\/p>$/,'').trim();
  };

  /* ---------- Médias ---------- */
  M.video = url => {
    if (!url) return null;
    url = String(url).trim();
    let m = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return { type: 'youtube', id: m[1] };
    m = url.match(/vimeo\.com\/(?:.*\/)?(\d{6,})/);
    if (m) return { type: 'vimeo', id: m[1] };
    if (/\.(mp4|webm|mov)(\?|#|$)/i.test(url)) return { type: 'file', src: url };
    return null;
  };
  M.spotify = url => {
    const m = String(url || '').match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]{10,})/);
    return m ? { type: m[1], id: m[2] } : null;
  };
  M.ext = p => (String(p || '').split('?')[0].split('.').pop() || '').toLowerCase();

  /* ---------- Polices (Google Fonts) ---------- */
  M.FONTS = {
    'Figtree': 'ital,wght@0,400;0,500;0,600;0,700;1,400;1,600',
    'Inter': 'ital,wght@0,400;0,500;0,600;0,700;1,400',
    'Montserrat': 'ital,wght@0,400;0,500;0,600;0,700;1,400',
    'Poppins': 'ital,wght@0,400;0,500;0,600;0,700;1,400',
    'Space Grotesk': 'wght@400;500;600;700',
    'Syne': 'wght@400;500;600;700',
    'Archivo': 'ital,wght@0,400;0,500;0,600;0,700;1,400',
    'Oswald': 'wght@400;500;600;700',
    'Bebas Neue': '',
    'Anton': '',
    'Unbounded': 'wght@400;500;600;700',
    'Playfair Display': 'ital,wght@0,400;0,600;0,700;1,400',
    'Cormorant Garamond': 'ital,wght@0,400;0,500;0,600;0,700;1,400',
    'DM Serif Display': 'ital@0;1',
    'Libre Baskerville': 'ital,wght@0,400;0,700;1,400',
    'EB Garamond': 'ital,wght@0,400;0,500;0,600;0,700;1,400',
    'JetBrains Mono': 'ital,wght@0,400;0,700;1,400',
    'Courier Prime': 'ital,wght@0,400;0,700;1,400'
  };
  M.fontsUrl = list => {
    const fams = [...new Set(list.filter(f => f && Object.prototype.hasOwnProperty.call(M.FONTS, f)))];
    if (!fams.length) return '';
    return 'https://fonts.googleapis.com/css2?' + fams.map(f => 'family=' + f.replace(/ /g, '+') + (M.FONTS[f] ? ':' + M.FONTS[f] : '')).join('&') + '&display=swap';
  };

  /* ---------- Animations ---------- */
  M.ANIMS = [
    ['', 'Aucune'],
    ['fade-in', 'Fade in (fondu)'], ['fade-up', 'Fade up'], ['fade-down', 'Fade down'], ['fade-right', 'Fade right'], ['fade-left', 'Fade left'],
    ['fade-up-right', 'Fade up right'], ['fade-up-left', 'Fade up left'], ['fade-down-right', 'Fade down right'], ['fade-down-left', 'Fade down left'],
    ['zoom-in', 'Zoom in'], ['zoom-in-down', 'Zoom in down'], ['zoom-in-right', 'Zoom in right'], ['zoom-in-left', 'Zoom in left'],
    ['zoom-out', 'Zoom out'], ['zoom-out-down', 'Zoom out down'], ['zoom-out-right', 'Zoom out right'], ['zoom-out-left', 'Zoom out left'],
    ['slide-up', 'Slide up'], ['slide-down', 'Slide down'], ['slide-right', 'Slide right'], ['slide-left', 'Slide left'],
    ['focus-in', 'Focus in (mise au point)'], ['light-in', 'Light in (entrée lumineuse)'], ['puff-in', 'Puff in center'],
    ['tracking-expand', 'Text tracking in expand'], ['tracking-contract', 'Text tracking in contract']
  ];
  M.HOVERS = [['', 'Aucun'], ['zoom', 'Zoom'], ['assombrir', 'Assombrir'], ['eclaircir', 'Éclaircir'], ['nb', 'Noir & blanc → couleur'], ['flou', 'Flou → net'], ['elever', 'Élévation']];
  M.PROJ_ANIMS = [['cinema', 'Cinéma (bandes noires)'], ['zoom', 'Zoom lumineux'], ['fondu', 'Fondu + « Voir le projet »'], ['balayage', 'Balayage de lumière'], ['glitch', 'Glitch'], ['aucune', 'Aucune']];
  M.FILTRES = [['', 'Aucun'], ['nb', 'Noir & blanc'], ['sepia', 'Sépia'], ['contraste', 'Contrasté'], ['sature', 'Saturé'], ['vintage', 'Vintage'], ['froid', 'Froid'], ['chaud', 'Chaud']];
  M.SHADOWS = { douce: '0 2px 12px rgba(0,0,0,.45)', forte: '0 4px 24px rgba(0,0,0,.85)', neon: '0 0 12px currentColor', contour: '0 0 1px #000,0 0 2px #000' };
  M.BOX_SHADOWS = { douce: '0 10px 30px rgba(0,0,0,.35)', forte: '0 24px 60px rgba(0,0,0,.65)', lueur: '0 0 40px rgba(138,155,255,.35)' };

  /* ==========================================================================
     Éléments (blocs) : ce qu'on met DANS une section
     ========================================================================== */
  M.BLOCS = {
    pastille: { nom: 'Pastille', g: 'Texte', c: () => ({ texte: 'Court-métrage' }) },
    surtitre: { nom: 'Surtitre', g: 'Texte', c: () => ({ texte: 'Surtitre' }) },
    titre: { nom: 'Titre', g: 'Texte', c: () => ({ texte: 'Titre', niveau: 'h2', taille: 'bloc', lettres: false }) },
    soustitre: { nom: 'Sous-titre', g: 'Texte', c: () => ({ texte: 'Sous-titre' }) },
    texte: { nom: 'Paragraphe', g: 'Texte', c: () => ({ html: '<p>Écris ton texte ici.</p>' }) },
    tags: { nom: 'Mots-clés', g: 'Texte', c: () => ({ tags: ['Production', 'Réalisation'] }) },
    image: { nom: 'Image', g: 'Médias', c: () => ({ img: { src: '' }, legende: '' }) },
    galerie: { nom: 'Galerie', g: 'Médias', c: () => ({ disposition: 'puzzle', colonnes: 3, colonnesM: 2, espacement: 12, ratio: '4/3', hauteurRang: 220, hauteurBande: 440, defilementAuto: false, survol: '', images: [] }) },
    video: { nom: 'Vidéo', g: 'Médias', c: () => ({ url: '', poster: '', ratio: '16/9', legende: '' }) },
    spotify: { nom: 'Spotify', g: 'Médias', c: () => ({ liens: [], taille: 'compact', colonnes: 1 }) },
    infos: { nom: 'Infos en lignes', g: 'Listes', c: () => ({ lignes: [{ label: 'Durée', valeur: '18 min' }, { label: 'Format', valeur: '2.35:1' }], colonnes: 1 }) },
    credits: { nom: 'Crédits', g: 'Listes', c: () => ({ lignes: [{ fonction: 'Réalisation', noms: 'Prénom NOM' }] }) },
    liste: { nom: 'Parcours / formations', g: 'Listes', c: () => ({ items: [{ date: '2024', titre: 'Intitulé', sousTitre: 'École ou structure', html: '', logo: { src: '' }, lien: '' }], logos: 'nb', tailleLogo: 56 }) },
    boutons: { nom: 'Boutons', g: 'Actions', c: () => ({ boutons: [{ texte: 'Me contacter', type: 'page', cible: 'contact', style: 'plein' }] }) },
    document: { nom: 'Lien vers un document (CV…)', g: 'Actions', c: () => ({ texte: 'Télécharger mon CV', src: '', style: 'contour' }) },
    fichiers: { nom: 'Liste de téléchargements', g: 'Actions', c: () => ({ fichiers: [] }) },
    reseaux: { nom: 'Réseaux sociaux', g: 'Actions', c: () => ({ style: 'icones', taille: 22 }) },
    coordonnees: { nom: 'Coordonnées', g: 'Actions', c: () => ({ email: '', telephone: '', lieu: '' }) },
    formulaire: { nom: 'Formulaire de contact', g: 'Actions', c: () => ({ formspree: '', email: '' }) },
    projets: { nom: 'Grille de projets', g: 'Projets', c: () => ({ filtres: true, tousLabel: 'Tous', ordreGenres: [], genre: '', colonnes: 2, colonnesM: 1, ratio: '16/9', animation: 'cinema', afficherGenre: true, afficherRoles: true, animEntree: 'fade-up', animDuree: 0.9, animEcart: 0.12 }) },
    espace: { nom: 'Espace / ligne', g: 'Structure', c: () => ({ hauteur: 40, ligne: false, couleurLigne: '', epaisseur: 1, largeurLigne: 100 }) }
  };
  M.BLOC_GROUPES = ['Texte', 'Médias', 'Listes', 'Actions', 'Projets', 'Structure'];
  M.TAILLES_TITRE = [['cov', 'Très grand (couverture)'], ['page', 'Grand titre de page'], ['section', 'Titre de section'], ['bloc', 'Titre moyen'], ['texte', 'Petit titre'], ['petit', 'Très petit']];
  M.bloc = (k, c, extra) => {
    const def = M.BLOCS[k];
    return Object.assign({ id: M.uid('b'), k, c: Object.assign(def ? def.c() : {}, c || {}), s: {}, t: {}, a: { type: '' } }, extra || {});
  };
  const B = (k, c, extra) => M.bloc(k, c, extra);

  /* ---------- Modèles de sections (une mise en page + des éléments) ---------- */
  M.LAYOUTS = ['pile', 'colonnes', 'deux', 'couverture', 'libre'];
  const S = (nom, groupe, desc, layout, blocs, c, s) => ({ nom, groupe, desc, layout, blocs, c: c || (() => ({})), s: s || {} });
  M.TYPES = {
    couverture: S('Couverture', 'Titres & couvertures', 'Grande image ou vidéo avec texte par-dessus', 'couverture',
      () => [B('titre', { texte: 'Titre', niveau: 'h1', taille: 'cov', lettres: true }), B('texte', { html: '<p><em>Ton texte par-dessus l’image</em></p>' })],
      () => ({ media: { type: 'image', src: '', video: '' }, hauteur: 70, pos: { x: 50, y: 50 }, alignTexte: 'center', largeurTexte: 680, superposition: { couleur: '#000000', opacite: 35, degrade: true } }),
      { largeur: 'pleine', pt: 0, pb: 0 }),
    entete: S('En-tête de page', 'Titres & couvertures', 'Pastille, grand titre et sous-titre', 'pile',
      () => [B('pastille'), B('titre', { texte: 'Titre de la page', niveau: 'h1', taille: 'page' }), B('soustitre')], null, { align: 'center', pt: 36, pb: 24 }),
    texte: S('Texte', 'Texte', 'Titre et paragraphe', 'pile', () => [B('titre', { taille: 'texte' }), B('texte')]),
    encadre: S('Encadré « Mon rôle »', 'Texte', 'Bloc mis en avant avec bordure d’accent', 'pile',
      () => [B('surtitre', { texte: 'Mon rôle' }), B('titre', { texte: 'Mon travail sur le projet', taille: 'texte' }), B('texte', { html: '<p>Ce que j’ai fait sur ce projet.</p>' }), B('tags', { tags: [] })], null, { encadre: true }),
    colonnes: S('Texte + image', 'Texte', 'Une image à côté d’éléments', 'colonnes',
      () => [B('titre', { taille: 'texte' }), B('texte', { html: '<p>Ton texte à côté de l’image.</p>' })], () => ({ img: { src: '' }, imageCote: 'gauche', proportion: 45 })),
    deux: S('Deux colonnes', 'Texte', 'Des éléments à gauche et à droite', 'deux',
      () => [B('texte', {}, { col: 'g' }), B('infos', {}, { col: 'd' })], () => ({ proportion: 57 })),
    image: S('Image', 'Images & vidéos', 'Une seule image', 'pile', () => [B('image')]),
    galerie: S('Galerie', 'Images & vidéos', 'Puzzle, grille, mosaïque, bande, diaporama…', 'pile', () => [B('galerie')]),
    video: S('Vidéo', 'Images & vidéos', 'YouTube, Vimeo ou fichier vidéo', 'pile', () => [B('video')]),
    projets: S('Grille de projets', 'Projets', 'Tes projets avec genre, rôles et filtres', 'pile',
      () => [B('titre', { texte: 'Projets', taille: 'section' }, { s: { align: 'center' } }), B('projets')]),
    fiche: S('Fiche projet', 'Projets', 'Description à gauche, infos et crédits à droite', 'deux',
      () => [B('texte', { html: '<h2>Titre</h2><p>Raconte le projet.</p>' }, { col: 'g' }), B('infos', { lignes: [{ label: 'Durée', valeur: '' }, { label: 'Format', valeur: '' }] }, { col: 'd' }), B('credits', {}, { col: 'd' })],
      () => ({ proportion: 57 })),
    infos: S('Infos en lignes', 'Listes', 'Intitulé et valeur, séparés par des lignes', 'pile', () => [B('infos')]),
    credits: S('Générique / crédits', 'Listes', 'Fonctions et noms des personnes', 'pile', () => [B('titre', { texte: 'Crédits', taille: 'bloc' }), B('credits')]),
    liste: S('Parcours / formations', 'Listes', 'Dates, intitulés, logos (écoles, structures)', 'pile', () => [B('titre', { texte: 'Formations', taille: 'bloc' }), B('liste')]),
    tags: S('Mots-clés', 'Listes', 'Compétences en pastilles', 'pile', () => [B('tags')]),
    contact: S('Contact', 'Contact & actions', 'Coordonnées, réseaux, formulaire', 'deux',
      () => [B('titre', { texte: 'Contact', niveau: 'h1', taille: 'section' }, { col: 'plein', s: { align: 'center' } }), B('texte', { html: '<p>Un projet, une collaboration ? Écris-moi.</p>' }, { col: 'g' }),
        B('coordonnees', {}, { col: 'g' }), B('reseaux', {}, { col: 'g' }), B('formulaire', {}, { col: 'd' })], () => ({ proportion: 50 })),
    reseaux: S('Réseaux sociaux', 'Contact & actions', 'Icônes vers tes réseaux', 'pile', () => [B('reseaux')], null, { align: 'center' }),
    boutons: S('Boutons d’action', 'Contact & actions', 'Me contacter, voir un projet, lien…', 'pile', () => [B('boutons')], null, { align: 'center' }),
    document: S('Document / CV', 'Contact & actions', 'Un bouton qui télécharge ton CV ou un PDF', 'pile', () => [B('document')], null, { align: 'center' }),
    fichiers: S('Téléchargements', 'Contact & actions', 'Plusieurs fichiers à télécharger', 'pile', () => [B('titre', { texte: 'Téléchargements', taille: 'bloc' }), B('fichiers')]),
    spotify: S('Spotify', 'Son & intégration', 'Titres, albums, playlists avec extrait', 'pile', () => [B('spotify')]),
    espace: S('Espace / ligne', 'Structure', 'Espace vide ou ligne de séparation', 'pile', () => [B('espace')], null, { pt: 0, pb: 0 }),
    libre: S('Composition libre', 'Structure', 'Place images, textes et boutons où tu veux', 'libre',
      () => [B('image', {}, { pos: { x: 6, y: 8, w: 48, z: 1 } }), B('texte', { html: '<h2>Titre par-dessus</h2><p>Déplace-moi où tu veux.</p>' }, { pos: { x: 46, y: 34, w: 44, z: 2 } })],
      () => ({ hauteur: 560 }))
  };
  M.GROUPES = ['Titres & couvertures', 'Texte', 'Images & vidéos', 'Projets', 'Listes', 'Contact & actions', 'Son & intégration', 'Structure'];
  M.DISPOSITIONS = [['puzzle', 'Puzzle (tailles libres)'], ['grille', 'Grille régulière'], ['mosaique', 'Mosaïque (formats d’origine)'], ['bande', 'Bande horizontale'], ['diaporama', 'Diaporama'], ['pile', 'Pleine largeur, empilées'], ['duo', 'Duo côte à côte']];

  M.section = (type, extra) => {
    const T = M.TYPES[type] || M.TYPES.texte;
    return Object.assign({ id: M.uid('s'), type, layout: T.layout, c: T.c(), blocs: T.blocs(), s: Object.assign({}, T.s), a: { type: '', duree: 0.9, delai: 0, cible: 'section' } }, extra || {});
  };
  M.img = src => (typeof src === 'string' ? { src } : Object.assign({}, src || {}));
  M.nomSection = sec => (M.TYPES[sec.type] || {}).nom || 'Section';

  /* ---------- Réseaux sociaux : icônes monochromes ---------- */
  const st = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const box = `<rect x="2.6" y="2.6" width="18.8" height="18.8" rx="4.5" ${st}/>`;
  const txtI = (t, size, y = 16.4) => `<text x="12" y="${y}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${size}" fill="currentColor">${t}</text>`;
  M.SOCIAL = {
    instagram: { nom: 'Instagram', svg: `${box}<circle cx="12" cy="12" r="4.3" ${st}/><circle cx="17.2" cy="6.8" r="1.15" fill="currentColor"/>` },
    youtube: { nom: 'YouTube', svg: `<path fill-rule="evenodd" fill="currentColor" d="M6.2 5h11.6A4.2 4.2 0 0 1 22 9.2v5.6a4.2 4.2 0 0 1-4.2 4.2H6.2A4.2 4.2 0 0 1 2 14.8V9.2A4.2 4.2 0 0 1 6.2 5zM10 8.8v6.4l5.6-3.2z"/>` },
    vimeo: { nom: 'Vimeo', svg: `${box}<path d="M6.5 9.6c1.2-1 2.3-2 3-1.1.7.9 1 4.7 1.9 5.5 1 .9 2.8-1.9 3.6-3.5 1-2-.2-3.1-1.6-2.2 1-3.4 5.4-3.2 4.9.4-.5 3.3-4.8 8.1-6.8 8.1-1.9 0-2.6-4.9-3.4-6.8" ${st}/>` },
    linkedin: { nom: 'LinkedIn', svg: `${box}${txtI('in', 10.5)}` },
    facebook: { nom: 'Facebook', svg: `${box}${txtI('f', 13, 17.4)}` },
    x: { nom: 'X', svg: `<path d="M5 4.5l14 15M19 4.5L5 19.5" ${st} stroke-width="2"/>` },
    tiktok: { nom: 'TikTok', svg: `<path d="M13.6 3.5v11.2a3.6 3.6 0 1 1-3.6-3.6M13.6 3.5c.4 2.6 2.3 4.5 5 4.7" ${st} stroke-width="2"/>` },
    spotify: { nom: 'Spotify', svg: `<circle cx="12" cy="12" r="9.4" ${st}/><path d="M7 9.4c3.6-1 7.3-.7 10.3.9M7.6 12.6c2.9-.8 6-.5 8.5.8M8.3 15.6c2.2-.5 4.4-.3 6.4.7" ${st} stroke-width="1.6"/>` },
    behance: { nom: 'Behance', svg: `${box}${txtI('Bē', 9.5)}` },
    imdb: { nom: 'IMDb', svg: `<rect x="1.8" y="6" width="20.4" height="12" rx="2.5" ${st}/>${txtI('IMDb', 7, 14.6)}` },
    soundcloud: { nom: 'SoundCloud', svg: `<path d="M9 17h9a3.4 3.4 0 0 0 .3-6.8 5 5 0 0 0-9.3-1.4M3.5 13.5v3.5M6.2 11.5V17" ${st}/>` },
    pinterest: { nom: 'Pinterest', svg: `<circle cx="12" cy="12" r="9.4" ${st}/>${txtI('P', 11, 16.2)}` },
    threads: { nom: 'Threads', svg: `<circle cx="12" cy="12" r="9.4" ${st}/>${txtI('@', 11.5, 16)}` },
    bluesky: { nom: 'Bluesky', svg: `<path d="M12 11.3C10.5 8.3 7 5.2 5 5.2c-1.6 0-1.5 2.5-1 4.4.6 2.3 3 2.8 5.1 2.5-3 .8-3.6 3-1.6 4.6 2.3 1.8 4-1.6 4.5-3.6.5 2 2.2 5.4 4.5 3.6 2-1.6 1.4-3.8-1.6-4.6 2.1.3 4.5-.2 5.1-2.5.5-1.9.6-4.4-1-4.4-2 0-5.5 3.1-7 6.1z" ${st} stroke-width="1.6"/>` },
    email: { nom: 'E-mail', svg: `<rect x="3" y="5.5" width="18" height="13" rx="2" ${st}/><path d="M3.6 7.2 12 13l8.4-5.8" ${st}/>` },
    web: { nom: 'Site web', svg: `<circle cx="12" cy="12" r="9.2" ${st}/><path d="M3 12h18M12 2.8c2.5 2.6 3.7 5.7 3.7 9.2s-1.2 6.6-3.7 9.2c-2.5-2.6-3.7-5.7-3.7-9.2S9.5 5.4 12 2.8z" ${st} stroke-width="1.5"/>` },
    document: { nom: 'Document', svg: `<path d="M6.5 2.8h7.3l4.7 4.7v13.7H6.5z" ${st}/><path d="M13.6 2.8v4.9h4.9M9 12.5h6M9 16h6" ${st}/>` }
  };
  M.socialKind = (url, nom) => {
    const u = String(url || '').toLowerCase(), n = String(nom || '').toLowerCase();
    const tests = [['instagram', /instagram/], ['youtube', /youtube|youtu\.be/], ['vimeo', /vimeo/], ['linkedin', /linkedin/], ['facebook', /facebook|fb\.com/], ['tiktok', /tiktok/],
      ['x', /(^|\/\/|\.)(x|twitter)\.com|twitter|^x$/], ['spotify', /spotify/], ['behance', /behance/], ['imdb', /imdb/], ['soundcloud', /soundcloud/], ['pinterest', /pinterest/], ['threads', /threads/], ['bluesky', /bsky|bluesky/], ['email', /^mailto:|e-?mail/]];
    for (const [k, re] of tests) if (re.test(u) || re.test(n)) return k;
    return 'web';
  };
  M.icon = (kind, size = 22) => `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${(M.SOCIAL[kind] || M.SOCIAL.web).svg}</svg>`;

  /* ---------- Site par défaut ---------- */
  M.defaultSite = nom => ({
    nom: nom || 'Mon portfolio', titreOnglet: '', descriptionGoogle: '',
    theme: { fond: '#000000', texte: '#f3f3f3', texteDoux: '#9a9a9a', accent: '#8a9bff', police: 'Figtree', policeTitres: 'Figtree', grain: true },
    entete: { disposition: 'centre', masquerAuDefilement: true, majuscules: true },
    pied: { afficher: true, texte: 'Tous droits réservés', reseaux: true, reseauxStyle: 'icones' },
    reseaux: []
  });

  /* ---------- Modèles de pages ---------- */
  M.MODELES_PAGE = {
    vide: { nom: 'Page vide', sections: () => [M.section('entete')] },
    texte: { nom: 'Page texte', sections: () => [M.section('entete'), M.section('texte'), M.section('boutons')] },
    galerie: { nom: 'Galerie photos', sections: () => [M.section('entete'), M.section('galerie')] },
    parcours: { nom: 'Parcours / CV', sections: () => [M.section('entete'), M.section('liste'), M.section('document')] },
    contact: { nom: 'Contact', sections: () => [M.section('contact')] },
    projet: { nom: 'Projet (film)', sections: () => [M.section('entete'), M.section('video'), M.section('fiche'), M.section('encadre'), M.section('galerie')] }
  };

  /* ---------- Conversion v1 → v2 (format intermédiaire) ---------- */
  const sec2 = (type, c, s) => ({ id: M.uid('s'), type, c: c || {}, s: Object.assign({}, { couverture: { largeur: 'pleine', pt: 0, pb: 0 }, entete: { align: 'center', pt: 36, pb: 24 }, boutons: { align: 'center' }, espace: { pt: 0, pb: 0 } }[type] || {}, s || {}), a: { type: '', duree: 0.9, delai: 0, cible: 'section' } });
  M.migrate = v1 => { // ancien format (v1) → format intermédiaire (v2)
    const o = v1 || {}, s = o.site || {}, a = s.accueil || {}, menu = s.menu || {};
    const ct = o.contact || {}, ph = o.photos || {}, ap = o.apropos || {};
    const site = M.defaultSite(s.nom);
    site.titreOnglet = s.titreOnglet || '';
    site.descriptionGoogle = s.descriptionGoogle || '';
    site.theme.accent = s.couleurAccent || site.theme.accent;
    site.theme.grain = s.grain !== false;
    site.pied.texte = s.piedDePage || site.pied.texte;
    site.reseaux = M.arr(ct.reseaux).filter(r => r && r.url && r.nom).map(r => ({ nom: r.nom, url: r.url }));
    const pages = [];
    const films = M.arr(o.films).filter(Boolean);

    pages.push({ id: 'films', titre: menu.films || 'Films', menu: true, accueil: true, sections: [
      sec2('couverture', {
        media: { type: a.video ? 'video' : 'image', src: a.image || '', video: a.video || '' },
        titre: a.titre || s.nom || '', html: a.preambule ? `<p><em>${M.esc(a.preambule)}</em></p>` : '',
        hauteur: +a.hauteur || 75
      }),
      sec2('projets', { titre: s.titreFilms ?? 'Films', colonnes: +s.colonnes || 2, ratio: s.formatVignettes || '16/9', animation: s.animationSurvol || 'cinema' })
    ] });

    const series = M.arr(ph.series).filter(x => x && M.arr(x.photos).length);
    pages.push({ id: 'photos', titre: menu.photos || 'Photos', menu: true, sections: [
      sec2('entete', { titre: ph.titre || 'Photos' }),
      ...(ph.intro ? [sec2('texte', { titre: '', html: M.rich(ph.intro) }, { align: 'center' })] : []),
      ...series.map(se => sec2('galerie', {
        titre: se.titre || '', sousTitre: se.description || '', disposition: 'mosaique', colonnes: 3,
        images: M.arr(se.photos).map(p => typeof p === 'string' ? { src: p } : { src: p.src, legende: p.legende || '' })
      }))
    ] });

    const skills = String(ap.competences || '').split(/,|\n/).map(x => x.trim()).filter(Boolean);
    pages.push({ id: 'a-propos', titre: menu.apropos || 'À propos', menu: true, sections: [
      sec2('colonnes', { img: { src: ap.portrait || '' }, titre: ap.titre || 'À propos', sousTitre: ap.sousTitre || '', html: M.rich(ap.texte), tags: skills,
        boutons: ap.cv ? [{ texte: 'Télécharger mon CV', type: 'fichier', cible: ap.cv, style: 'contour', onglet: true }] : [] }),
      ...(M.arr(ap.parcours).length ? [sec2('liste', { titre: 'Parcours', items: M.arr(ap.parcours).map(p => ({ date: p.periode || '', titre: p.intitule || '', html: M.rich(p.texte) })) })] : [])
    ] });

    pages.push({ id: 'contact', titre: menu.contact || 'Contact', menu: true, sections: [
      sec2('contact', { titre: ct.titre || 'Contact', html: M.rich(ct.texte), email: ct.email || '', telephone: ct.telephone || '', lieu: ct.lieu || '', reseaux: true, formulaire: ct.formulaire !== false, formspree: ct.formspree || '' })
    ] });

    const used = new Set(pages.map(p => p.id));
    films.forEach(f => {
      let id = f.id || M.slugify(f.titre) || 'projet';
      while (used.has(id)) id += '-2';
      used.add(id);
      const big = M.arr(f.photosGrandFormat).map(x => typeof x === 'string' ? x : x.src).filter(Boolean);
      const collage = M.arr(f.photosCollage).map(x => typeof x === 'string' ? x : x.src).filter(Boolean);
      const v = f.video && M.video(f.video);
      const sections = [sec2('entete', { pastille: f.categorie || '', titre: f.titre || '', sousTitre: f.sousTitre || '' })];
      if (v) sections.push(sec2('video', { url: f.video, poster: f.vignette || '' }, { largeur: 'large' }));
      else if (big.length) sections.push(sec2('image', { img: { src: big.shift() } }, { largeur: 'large' }));
      const html = M.arr(f.textes).filter(t => t && (t.titre || t.sousTitre || t.texte)).map(t =>
        (t.titre ? `<h2>${M.esc(t.titre)}</h2>` : '') + (t.sousTitre ? `<h3>${M.esc(t.sousTitre)}</h3>` : '') + M.rich(t.texte)).join('');
      sections.push(sec2('fiche', {
        html,
        infos: M.arr(f.details).filter(d => d && d.label).map(d => ({ label: d.label, valeur: d.valeur || '' })),
        credits: M.arr(f.credits).filter(c => c && (c.fonction || c.noms)).map(c => ({ fonction: c.fonction || '', noms: c.noms || '' }))
      }));
      const w = f.monTravail || {};
      if ((w.texte || '').trim()) sections.push(sec2('encadre', { surtitre: 'Mon rôle', titre: w.titre || 'Mon travail sur le projet', html: M.rich(w.texte), tags: M.arr(f.roles) }));
      if (big.length) sections.push(sec2('galerie', { disposition: 'pile', images: big.map(M.img) }, { largeur: 'large' }));
      if (collage.length) sections.push(sec2('galerie', { disposition: 'mosaique', colonnes: Math.min(3, collage.length), images: collage.map(M.img) }));
      pages.push({ id, titre: f.titre || 'Projet', type: 'projet', menu: false, masquer: !!f.masquer, navigation: true,
        carte: { vignette: f.vignette || '', genre: f.categorie || '', roles: M.arr(f.roles), animation: f.animation || '', sousTitre: f.sousTitre || '' },
        sections });
    });
    return { version: 2, site, pages };
  };

  /* ---------- Normalisation (remplit ce qui manque) ---------- */


  /* ---------- Conversion v2 → v3 (sections faites d’éléments) ---------- */
  const has = v => Array.isArray(v) ? v.length > 0 : !!String(v ?? '').replace(/<[^>]+>/g, '').trim();
  const ttl = (texte, taille, extra) => has(texte) ? [B('titre', { texte, niveau: taille === 'page' || taille === 'cov' ? 'h1' : 'h2', taille }, extra)] : [];
  const textBlocs = (c, taille) => [
    ...(has(c.surtitre) ? [B('surtitre', { texte: c.surtitre })] : []),
    ...ttl(c.titre, taille),
    ...(has(c.sousTitre) ? [B('soustitre', { texte: c.sousTitre })] : []),
    ...(has(c.html) ? [B('texte', { html: c.html })] : []),
    ...(has(c.tags) ? [B('tags', { tags: c.tags })] : []),
    ...(has(c.boutons) ? [B('boutons', { boutons: c.boutons })] : [])];
  const UP = {
    couverture: c => ({ layout: 'couverture', c: { media: c.media || { type: 'image', src: '' }, hauteur: c.hauteur || 70, pos: c.pos || { x: 50, y: 50 }, alignTexte: c.alignTexte || 'center', largeurTexte: c.largeurTexte || 680, superposition: c.superposition || { couleur: '#000000', opacite: 35, degrade: true } },
      blocs: [...ttl(c.titre, 'cov').map(b => Object.assign(b, { c: Object.assign(b.c, { lettres: c.animTitre !== '' && c.animTitre !== undefined ? c.animTitre === 'lettres' : true }) })), ...(has(c.html) ? [B('texte', { html: c.html })] : []), ...(has(c.boutons) ? [B('boutons', { boutons: c.boutons })] : [])] }),
    entete: c => ({ blocs: [...(has(c.pastille) ? [B('pastille', { texte: c.pastille })] : []), ...ttl(c.titre || ' ', 'page'), ...(has(c.sousTitre) ? [B('soustitre', { texte: c.sousTitre })] : [])] }),
    texte: c => ({ blocs: textBlocs(c, 'texte') }),
    encadre: (c, s) => { s.encadre = true; return { blocs: textBlocs(c, 'texte') }; },
    colonnes: c => ({ layout: 'colonnes', c: { img: M.img(c.img), imageCote: c.imageCote || 'gauche', proportion: c.proportion || 45 }, blocs: textBlocs(c, 'texte') }),
    image: c => ({ blocs: [B('image', { img: M.img(c.img), legende: c.legende || '' })] }),
    galerie: c => { const { titre, sousTitre, ...rest } = c; return { blocs: [...ttl(titre, 'bloc'), ...(has(sousTitre) ? [B('soustitre', { texte: sousTitre })] : []), B('galerie', Object.assign(rest, { images: M.arr(rest.images).map(M.img) }))] }; },
    video: c => ({ blocs: [B('video', c)] }),
    projets: c => { const { titre, ...rest } = c; return { blocs: [...ttl(titre, 'section', { s: { align: 'center' } }), B('projets', rest)] }; },
    fiche: c => ({ layout: 'deux', c: { proportion: 57 }, blocs: [B('texte', { html: c.html || '' }, { col: 'g' }), ...(has(c.infos) ? [B('infos', { lignes: c.infos })] : []).map(b => Object.assign(b, { col: 'd' })), ...(has(c.credits) ? [B('credits', { lignes: c.credits }, { col: 'd' })] : [])] }),
    infos: c => ({ blocs: [...ttl(c.titre, 'bloc'), B('infos', { lignes: M.arr(c.lignes), colonnes: c.colonnes || 1 })] }),
    credits: c => ({ blocs: [...ttl(c.titre, 'bloc'), B('credits', { lignes: M.arr(c.lignes) })] }),
    liste: c => ({ blocs: [...ttl(c.titre, 'bloc'), B('liste', { items: M.arr(c.items).map(it => Object.assign({ sousTitre: '', logo: { src: '' }, lien: '' }, it)) })] }),
    tags: c => ({ blocs: [...ttl(c.titre, 'bloc'), B('tags', { tags: M.arr(c.tags) })] }),
    contact: c => ({ layout: 'deux', c: { proportion: 50 }, blocs: [
      ...ttl(c.titre, 'section', { col: 'plein', s: { align: 'center' } }), ...(has(c.html) ? [B('texte', { html: c.html }, { col: 'g' })] : []),
      B('coordonnees', { email: c.email || '', telephone: c.telephone || '', lieu: c.lieu || '' }, { col: 'g' }),
      ...(c.reseaux !== false ? [B('reseaux', { style: 'icones-texte' }, { col: 'g' })] : []),
      ...(c.formulaire ? [B('formulaire', { formspree: c.formspree || '', email: c.email || '' }, { col: 'd' })] : [])] }),
    reseaux: c => ({ blocs: [...ttl(c.titre, 'bloc'), B('reseaux')] }),
    boutons: c => ({ blocs: [B('boutons', { boutons: M.arr(c.boutons) })] }),
    fichiers: c => ({ blocs: [...ttl(c.titre, 'bloc'), B('fichiers', { fichiers: M.arr(c.fichiers) })] }),
    spotify: c => ({ blocs: [...ttl(c.titre, 'bloc'), B('spotify', { liens: M.arr(c.liens), taille: c.taille || 'compact', colonnes: c.colonnes || 1 })] }),
    espace: c => ({ blocs: [B('espace', c)] }),
    libre: c => ({ layout: 'libre', c: { hauteur: c.hauteur || 560 }, blocs: M.arr(c.items).map(it => {
      const pos = { x: +it.x || 0, y: +it.y || 0, w: +it.w || 30, z: +it.z || 1 };
      const a = it.anim && it.anim.type ? it.anim : { type: '' };
      if (it.k === 'image') { const { id, k, x, y, w, z, anim, ...img } = it; return B('image', { img }, { pos, a }); }
      if (it.k === 'bouton') return B('boutons', { boutons: [it.bouton || { texte: 'Bouton' }] }, { pos, a });
      return B('texte', { html: it.html || '' }, { pos, a });
    }) })
  };
  M.upgrade3 = v2 => {
    const d = v2;
    d.pages = M.arr(d.pages).map(p => Object.assign(p, { sections: M.arr(p.sections).map(x => {
      if (!x || x.layout) return x;
      const f = UP[x.type];
      if (!f) return null;
      const s = Object.assign({}, x.s || {});
      const r = f(x.c || {}, s);
      return { id: x.id || M.uid('s'), type: x.type, layout: r.layout || 'pile', c: r.c || {}, blocs: r.blocs, s, a: x.a || { type: '' } };
    }).filter(Boolean) }));
    if (d.site && d.site.pied && !d.site.pied.reseauxStyle) d.site.pied.reseauxStyle = 'texte';
    d.version = 3;
    return d;
  };

  /* ---------- Normalisation (remplit ce qui manque) ---------- */
  M.normalize = d => {
    if (!d || !d.version) d = M.migrate(d || {});
    if (d.version === 2) d = M.upgrade3(d);
    d.version = 3;
    const def = M.defaultSite();
    d.site = Object.assign({}, def, d.site || {});
    ['theme', 'entete', 'pied'].forEach(k => { d.site[k] = Object.assign({}, def[k], d.site[k] || {}); });
    d.site.reseaux = M.arr(d.site.reseaux);
    d.bibliotheque = M.arr(d.bibliotheque).filter(x => x && x.src);
    d.documents = M.arr(d.documents).filter(x => x && x.src);
    d.pages = M.arr(d.pages);
    if (!d.pages.length) d.pages.push({ id: 'accueil', titre: 'Accueil', menu: true, accueil: true, sections: [] });
    if (!d.pages.some(p => p.accueil)) (d.pages.find(p => p.type !== 'projet') || d.pages[0]).accueil = true;
    d.pages.forEach(p => {
      p.sections = M.arr(p.sections).filter(x => x && M.LAYOUTS.includes(x.layout));
      p.sections.forEach(x => {
        x.id = x.id || M.uid('s'); x.c = x.c || {}; x.s = x.s || {};
        x.a = Object.assign({ type: '', duree: 0.9, delai: 0, cible: 'section' }, x.a || {});
        x.blocs = M.arr(x.blocs).filter(b => b && M.BLOCS[b.k]).map(b => {
          b.id = b.id || M.uid('b');
          b.c = Object.assign(M.BLOCS[b.k].c(), b.c || {});
          b.s = b.s || {}; b.t = b.t || {}; b.a = Object.assign({ type: '' }, b.a || {});
          if (x.layout === 'deux' && !b.col) b.col = 'g';
          if (x.layout === 'libre') b.pos = Object.assign({ x: 10, y: 10, w: 40, z: 1 }, b.pos || {});
          return b;
        });
      });
      if (p.type === 'projet') p.carte = Object.assign({ vignette: '', genre: '', roles: [], animation: '', sousTitre: '' }, p.carte || {});
    });
    return d;
  };

  /* ---------- Adresses des pages ---------- */
  const FICHIERS = { photos: 'photos.html', 'a-propos': 'a-propos.html', contact: 'contact.html' };
  M.pageUrl = p => {
    if (!p) return 'index.html';
    if (p.accueil) return 'index.html';
    if (p.type === 'projet') return 'projet.html?id=' + encodeURIComponent(p.id);
    return FICHIERS[p.id] || 'index.html?p=' + encodeURIComponent(p.id);
  };
  M.genres = d => {
    const g = [];
    M.arr(d.pages).forEach(p => { if (p.type === 'projet' && !p.masquer && p.carte && p.carte.genre && !g.includes(p.carte.genre)) g.push(p.carte.genre); });
    return g;
  };

  root.Modele = M;
})(typeof window !== 'undefined' ? window : globalThis);
