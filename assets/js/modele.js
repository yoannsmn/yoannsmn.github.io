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

  /* ---------- Types de sections ---------- */
  const T = (nom, groupe, desc, c, s) => ({ nom, groupe, desc, c, s: s || {} });
  M.TYPES = {
    couverture: T('Couverture', 'Titres & couvertures', 'Grande image ou vidéo avec texte par-dessus',
      () => ({ media: { type: 'image', src: '', video: '' }, titre: 'Titre', html: '<p>Ton texte par-dessus l’image</p>', hauteur: 70, pos: { x: 50, y: 50 }, alignTexte: 'center', largeurTexte: 680, superposition: { couleur: '#000000', opacite: 35, degrade: true }, animTitre: 'lettres', boutons: [] }),
      { largeur: 'pleine', pt: 0, pb: 0 }),
    entete: T('En-tête de page', 'Titres & couvertures', 'Pastille, grand titre et sous-titre',
      () => ({ pastille: '', titre: 'Titre de la page', sousTitre: '' }), { align: 'center', pt: 36, pb: 24 }),
    texte: T('Texte', 'Texte', 'Titre, sous-titre, paragraphe, mots-clés',
      () => ({ surtitre: '', titre: 'Titre', sousTitre: '', html: '<p>Écris ton texte ici.</p>', tags: [] })),
    encadre: T('Encadré « Mon rôle »', 'Texte', 'Bloc mis en avant avec bordure d’accent',
      () => ({ surtitre: 'Mon rôle', titre: 'Mon travail sur le projet', sousTitre: '', html: '<p>Ce que j’ai fait sur ce projet.</p>', tags: [] })),
    colonnes: T('Texte + image', 'Texte', 'Une image à côté d’un texte',
      () => ({ img: { src: '' }, imageCote: 'gauche', proportion: 45, surtitre: '', titre: 'Titre', sousTitre: '', html: '<p>Ton texte à côté de l’image.</p>', tags: [], boutons: [] })),
    image: T('Image', 'Images & vidéos', 'Une seule image, pleine largeur ou centrée',
      () => ({ img: { src: '' }, legende: '' })),
    galerie: T('Galerie', 'Images & vidéos', 'Puzzle, grille, mosaïque, bande, diaporama…',
      () => ({ titre: '', sousTitre: '', disposition: 'puzzle', colonnes: 3, colonnesM: 2, espacement: 12, ratio: '4/3', hauteurRang: 220, hauteurBande: 440, defilementAuto: false, images: [] })),
    video: T('Vidéo', 'Images & vidéos', 'YouTube, Vimeo ou fichier vidéo',
      () => ({ url: '', poster: '', ratio: '16/9', legende: '' })),
    projets: T('Grille de projets', 'Projets', 'Tes projets avec genre, rôles et filtres',
      () => ({ titre: 'Projets', filtres: true, tousLabel: 'Tous', ordreGenres: [], genre: '', colonnes: 2, colonnesM: 1, ratio: '16/9', animation: 'cinema', afficherGenre: true, afficherRoles: true })),
    fiche: T('Fiche projet', 'Projets', 'Texte à gauche, infos et crédits à droite',
      () => ({ html: '<h2>Titre</h2><p>Raconte le projet.</p>', infos: [{ label: 'Durée', valeur: '' }, { label: 'Format', valeur: '' }], credits: [{ fonction: 'Réalisation', noms: '' }] })),
    infos: T('Infos en lignes', 'Listes', 'Intitulé et valeur, séparés par des lignes',
      () => ({ titre: '', lignes: [{ label: 'Durée', valeur: '18 min' }, { label: 'Format', valeur: '2.35:1' }], colonnes: 1 })),
    credits: T('Générique / crédits', 'Listes', 'Fonctions et noms des personnes du projet',
      () => ({ titre: 'Crédits', lignes: [{ fonction: 'Réalisation', noms: 'Prénom NOM' }, { fonction: 'Production', noms: 'Prénom NOM' }] })),
    liste: T('Parcours / liste datée', 'Listes', 'Dates, intitulés et descriptions',
      () => ({ titre: 'Parcours', items: [{ date: '2025', titre: 'Intitulé', html: '<p>Description</p>' }] })),
    tags: T('Mots-clés', 'Listes', 'Compétences ou thèmes en pastilles',
      () => ({ titre: '', tags: ['Production', 'Réalisation', 'Montage'] })),
    contact: T('Contact', 'Contact & actions', 'E-mail, téléphone, réseaux sociaux, formulaire',
      () => ({ titre: 'Contact', html: '<p>Un projet, une collaboration ? Écris-moi.</p>', email: '', telephone: '', lieu: '', reseaux: true, formulaire: true, formspree: '' })),
    reseaux: T('Réseaux sociaux', 'Contact & actions', 'Boutons vers tes réseaux',
      () => ({ titre: '' })),
    boutons: T('Boutons d’action', 'Contact & actions', 'Me contacter, voir un projet, lien…',
      () => ({ boutons: [{ texte: 'Me contacter', type: 'page', cible: 'contact', style: 'plein', onglet: false }] }), { align: 'center' }),
    fichiers: T('Téléchargements', 'Contact & actions', 'CV, dossier de presse, PDF, tout fichier',
      () => ({ titre: 'Téléchargements', fichiers: [] })),
    spotify: T('Spotify', 'Son & intégration', 'Titres, albums, playlists avec extrait',
      () => ({ titre: '', liens: [], taille: 'compact', colonnes: 1 })),
    espace: T('Espace / ligne', 'Structure', 'Espace vide ou ligne de séparation',
      () => ({ hauteur: 60, ligne: false, couleurLigne: '', epaisseur: 1, largeurLigne: 100 }), { pt: 0, pb: 0 }),
    libre: T('Composition libre', 'Structure', 'Place images, textes et boutons où tu veux',
      () => ({ hauteur: 560, items: [
        { id: M.uid('i'), k: 'image', x: 6, y: 8, w: 48, z: 1, src: '' },
        { id: M.uid('i'), k: 'texte', x: 46, y: 34, w: 44, z: 2, html: '<h2>Titre par-dessus</h2><p>Déplace-moi où tu veux.</p>' }
      ] }))
  };
  M.GROUPES = ['Titres & couvertures', 'Texte', 'Images & vidéos', 'Projets', 'Listes', 'Contact & actions', 'Son & intégration', 'Structure'];
  M.DISPOSITIONS = [['puzzle', 'Puzzle (tailles libres)'], ['grille', 'Grille régulière'], ['mosaique', 'Mosaïque (formats d’origine)'], ['bande', 'Bande horizontale'], ['diaporama', 'Diaporama'], ['pile', 'Pleine largeur, empilées'], ['duo', 'Duo côte à côte']];

  M.section = (type, c, s, a) => {
    const def = M.TYPES[type];
    return { id: M.uid('s'), type, c: Object.assign(def ? def.c() : {}, c || {}), s: Object.assign({}, def ? def.s : {}, s || {}), a: Object.assign({ type: '', duree: 0.9, delai: 0, cible: 'section' }, a || {}) };
  };
  M.img = src => (typeof src === 'string' ? { src } : Object.assign({}, src || {}));

  /* ---------- Site par défaut ---------- */
  M.defaultSite = nom => ({
    nom: nom || 'Mon portfolio', titreOnglet: '', descriptionGoogle: '',
    theme: { fond: '#000000', texte: '#f3f3f3', texteDoux: '#9a9a9a', accent: '#8a9bff', police: 'Figtree', policeTitres: 'Figtree', grain: true },
    entete: { disposition: 'centre', masquerAuDefilement: true, majuscules: true },
    pied: { afficher: true, texte: 'Tous droits réservés', reseaux: true },
    reseaux: []
  });

  /* ---------- Modèles de pages ---------- */
  M.MODELES_PAGE = {
    vide: { nom: 'Page vide', sections: () => [M.section('entete', { titre: 'Nouvelle page' })] },
    texte: { nom: 'Page texte', sections: () => [M.section('entete', { titre: 'Nouvelle page' }), M.section('texte', {}), M.section('boutons', {})] },
    galerie: { nom: 'Galerie photos', sections: () => [M.section('entete', { titre: 'Galerie' }), M.section('galerie', { disposition: 'puzzle' })] },
    contact: { nom: 'Contact', sections: () => [M.section('contact', {}), M.section('reseaux', {})] },
    projet: { nom: 'Projet (film)', sections: () => [
      M.section('entete', { pastille: 'Court-métrage', titre: 'TITRE DU PROJET', sousTitre: 'Sous-titre' }),
      M.section('video', {}), M.section('fiche', {}),
      M.section('encadre', {}), M.section('galerie', { disposition: 'puzzle' })
    ] }
  };

  /* ---------- Conversion de l'ancien contenu (v1) ---------- */
  M.migrate = v1 => {
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
      M.section('couverture', {
        media: { type: a.video ? 'video' : 'image', src: a.image || '', video: a.video || '' },
        titre: a.titre || s.nom || '', html: a.preambule ? `<p><em>${M.esc(a.preambule)}</em></p>` : '',
        hauteur: +a.hauteur || 75
      }),
      M.section('projets', { titre: s.titreFilms ?? 'Films', colonnes: +s.colonnes || 2, ratio: s.formatVignettes || '16/9', animation: s.animationSurvol || 'cinema' })
    ] });

    const series = M.arr(ph.series).filter(x => x && M.arr(x.photos).length);
    pages.push({ id: 'photos', titre: menu.photos || 'Photos', menu: true, sections: [
      M.section('entete', { titre: ph.titre || 'Photos' }),
      ...(ph.intro ? [M.section('texte', { titre: '', html: M.rich(ph.intro) }, { align: 'center' })] : []),
      ...series.map(se => M.section('galerie', {
        titre: se.titre || '', sousTitre: se.description || '', disposition: 'mosaique', colonnes: 3,
        images: M.arr(se.photos).map(p => typeof p === 'string' ? { src: p } : { src: p.src, legende: p.legende || '' })
      }))
    ] });

    const skills = String(ap.competences || '').split(/,|\n/).map(x => x.trim()).filter(Boolean);
    pages.push({ id: 'a-propos', titre: menu.apropos || 'À propos', menu: true, sections: [
      M.section('colonnes', { img: { src: ap.portrait || '' }, titre: ap.titre || 'À propos', sousTitre: ap.sousTitre || '', html: M.rich(ap.texte), tags: skills,
        boutons: ap.cv ? [{ texte: 'Télécharger mon CV', type: 'fichier', cible: ap.cv, style: 'contour', onglet: true }] : [] }),
      ...(M.arr(ap.parcours).length ? [M.section('liste', { titre: 'Parcours', items: M.arr(ap.parcours).map(p => ({ date: p.periode || '', titre: p.intitule || '', html: M.rich(p.texte) })) })] : [])
    ] });

    pages.push({ id: 'contact', titre: menu.contact || 'Contact', menu: true, sections: [
      M.section('contact', { titre: ct.titre || 'Contact', html: M.rich(ct.texte), email: ct.email || '', telephone: ct.telephone || '', lieu: ct.lieu || '', reseaux: true, formulaire: ct.formulaire !== false, formspree: ct.formspree || '' })
    ] });

    const used = new Set(pages.map(p => p.id));
    films.forEach(f => {
      let id = f.id || M.slugify(f.titre) || 'projet';
      while (used.has(id)) id += '-2';
      used.add(id);
      const big = M.arr(f.photosGrandFormat).map(x => typeof x === 'string' ? x : x.src).filter(Boolean);
      const collage = M.arr(f.photosCollage).map(x => typeof x === 'string' ? x : x.src).filter(Boolean);
      const v = f.video && M.video(f.video);
      const sections = [M.section('entete', { pastille: f.categorie || '', titre: f.titre || '', sousTitre: f.sousTitre || '' })];
      if (v) sections.push(M.section('video', { url: f.video, poster: f.vignette || '' }, { largeur: 'large' }));
      else if (big.length) sections.push(M.section('image', { img: { src: big.shift() } }, { largeur: 'large' }));
      const html = M.arr(f.textes).filter(t => t && (t.titre || t.sousTitre || t.texte)).map(t =>
        (t.titre ? `<h2>${M.esc(t.titre)}</h2>` : '') + (t.sousTitre ? `<h3>${M.esc(t.sousTitre)}</h3>` : '') + M.rich(t.texte)).join('');
      sections.push(M.section('fiche', {
        html,
        infos: M.arr(f.details).filter(d => d && d.label).map(d => ({ label: d.label, valeur: d.valeur || '' })),
        credits: M.arr(f.credits).filter(c => c && (c.fonction || c.noms)).map(c => ({ fonction: c.fonction || '', noms: c.noms || '' }))
      }));
      const w = f.monTravail || {};
      if ((w.texte || '').trim()) sections.push(M.section('encadre', { surtitre: 'Mon rôle', titre: w.titre || 'Mon travail sur le projet', html: M.rich(w.texte), tags: M.arr(f.roles) }));
      if (big.length) sections.push(M.section('galerie', { disposition: 'pile', images: big.map(M.img) }, { largeur: 'large' }));
      if (collage.length) sections.push(M.section('galerie', { disposition: 'mosaique', colonnes: Math.min(3, collage.length), images: collage.map(M.img) }));
      pages.push({ id, titre: f.titre || 'Projet', type: 'projet', menu: false, masquer: !!f.masquer, navigation: true,
        carte: { vignette: f.vignette || '', genre: f.categorie || '', roles: M.arr(f.roles), animation: f.animation || '', sousTitre: f.sousTitre || '' },
        sections });
    });
    return { version: 2, site, pages };
  };

  /* ---------- Normalisation (remplit ce qui manque) ---------- */
  M.normalize = d => {
    if (!d || !d.version) d = M.migrate(d || {});
    const def = M.defaultSite();
    d.site = Object.assign({}, def, d.site || {});
    ['theme', 'entete', 'pied'].forEach(k => { d.site[k] = Object.assign({}, def[k], d.site[k] || {}); });
    d.site.reseaux = M.arr(d.site.reseaux);
    d.pages = M.arr(d.pages);
    if (!d.pages.length) d.pages.push({ id: 'accueil', titre: 'Accueil', menu: true, accueil: true, sections: [] });
    if (!d.pages.some(p => p.accueil)) (d.pages.find(p => p.type !== 'projet') || d.pages[0]).accueil = true;
    d.pages.forEach(p => {
      p.sections = M.arr(p.sections).filter(x => x && M.TYPES[x.type]);
      p.sections.forEach(x => { x.id = x.id || M.uid('s'); x.c = x.c || {}; x.s = x.s || {}; x.a = Object.assign({ type: '', duree: 0.9, delai: 0, cible: 'section' }, x.a || {}); });
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
