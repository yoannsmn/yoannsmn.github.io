/* ==========================================================================
   Portfolio : moteur d'affichage (version 2, sections)
   Le contenu est dans data/contenu.js. On le modifie avec l'éditeur visuel (admin.html).
   ========================================================================== */
(() => {
  'use strict';
  const M = window.Modele;
  const params = new URLSearchParams(location.search);
  const PREVIEW_DATA = 'portfolio-apercu-data', PREVIEW_FLAG = 'portfolio-apercu';
  let ED_PARENT = null;
  try { if (params.has('edit') && window.parent !== window && window.parent.Editeur) ED_PARENT = window.parent.Editeur; } catch (e) { /* autre origine */ }
  const EDIT = !!ED_PARENT;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = M.esc, arr = M.arr;
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* rien */ } },
    del: k => { try { localStorage.removeItem(k); } catch (e) { /* rien */ } }
  };

  /* ---------- Attributs d'édition (uniquement dans l'éditeur) ---------- */
  const ED = (path, kind, ph) => EDIT ? ` data-e="${path}" data-k="${kind}"${ph ? ` data-ph="${esc(ph)}"` : ''}` : '';
  const txt = (tag, cls, val, path, ph, extra = '') => (!EDIT && !String(val ?? '').trim()) ? '' :
    `<${tag} class="${cls}"${ED(path, 'text', ph)}${extra}>${esc(val || '')}</${tag}>`;
  const rich = (cls, html, path, ph) => (!EDIT && !String(html || '').replace(/<[^>]+>/g, '').trim()) ? '' :
    `<div class="rich ${cls}"${ED(path, 'rich', ph)}>${html || ''}</div>`;
  const animAttr = (a, extraDelay = 0) => {
    if (!a || !a.type) return '';
    return ` data-anim="${esc(a.type)}" style="--ad:${+a.duree || 0.9}s;--adl:${(+a.delai || 0) + extraDelay}s"`;
  };
  const animCls = a => (a && a.type ? ' anim' : '');

  /* ---------- Styles de texte (variables CSS) ---------- */
  function typo(t, p) {
    if (!t) return [];
    const v = [];
    if (t.police) v.push(`--${p}-f:'${t.police}'`);
    if (+t.taille) v.push(`--${p}-s:${+t.taille}px`);
    if (+t.tailleM) v.push(`--${p}-sm:${+t.tailleM}px`);
    if (t.graisse) v.push(`--${p}-w:${t.graisse}`);
    if (t.italique) v.push(`--${p}-i:italic`);
    if (t.souligne) v.push(`--${p}-u:underline`);
    if (t.majuscules === true || t.majuscules === 'oui') v.push(`--${p}-tr:uppercase`);
    if (t.majuscules === 'non') v.push(`--${p}-tr:none`);
    if (+t.interligne) v.push(`--${p}-lh:${+t.interligne}`);
    if (t.interlettrage !== undefined && t.interlettrage !== '' && t.interlettrage !== null) v.push(`--${p}-ls:${+t.interlettrage}em`);
    if (t.couleur) v.push(`--${p}-c:${t.couleur}`);
    if (t.degrade && t.degrade.actif) v.push(`--${p}-g:linear-gradient(${+t.degrade.angle || 90}deg,${t.degrade.c1 || '#ffffff'},${t.degrade.c2 || '#8a9bff'})`);
    if (t.fond) v.push(`--${p}-bg:${t.fond}`);
    if (t.ombre && M.SHADOWS[t.ombre]) v.push(`--${p}-sh:${M.SHADOWS[t.ombre]}`);
    if (+t.largeurMax) v.push(`--${p}-mw:${+t.largeurMax}px`);
    return v;
  }
  function sectionParts(sec) {
    const s = sec.s || {};
    const cls = ['sec', 'sec-' + sec.type, 'w-' + (s.largeur || 'normale')];
    const st = [], inner = [];
    const num = v => v !== undefined && v !== null && v !== '' && !isNaN(+v);
    if (num(s.pt)) st.push(`--pt:${+s.pt}px`);
    if (num(s.pb)) st.push(`--pb:${+s.pb}px`);
    if (num(s.ptM)) st.push(`--ptm:${+s.ptM}px`);
    if (num(s.pbM)) st.push(`--pbm:${+s.pbM}px`);
    if (+s.hauteurMin) { st.push(`min-height:${+s.hauteurMin}vh`); cls.push('v-' + (s.alignV || 'centre')); }
    if (s.fond) st.push(`background-color:${s.fond}`);
    const layers = [];
    const ov = s.superposition || {};
    if (+ov.opacite) layers.push(`linear-gradient(${M.rgba(ov.couleur, ov.opacite)},${M.rgba(ov.couleur, ov.opacite)})`);
    if (s.degrade && s.degrade.actif) layers.push(`linear-gradient(${+s.degrade.angle || 180}deg,${s.degrade.c1 || '#000'},${s.degrade.c2 || '#222'})`);
    if (s.fondImage) layers.push(`url('${esc(s.fondImage)}')`);
    if (layers.length) {
      st.push(`background-image:${layers.join(',')}`);
      if (s.fondImage) {
        st.push(`background-size:${layers.length > 1 ? 'cover,'.repeat(layers.length - 1) : ''}${s.fondFit || 'cover'}`);
        st.push(`background-position:${num(s.fondX) ? s.fondX : 50}% ${num(s.fondY) ? s.fondY : 50}%`);
        st.push('background-repeat:no-repeat');
        if (s.fondFixe) cls.push('bg-fixe');
      }
    }
    const b = s.bordure || {};
    if (+b.largeur) st.push(`border:${+b.largeur}px ${b.style || 'solid'} ${b.couleur || 'rgba(255,255,255,.2)'}`);
    if (+b.rayon) st.push(`border-radius:${+b.rayon}px`, 'overflow:hidden');
    if (s.ombre && M.BOX_SHADOWS[s.ombre]) st.push(`box-shadow:${M.BOX_SHADOWS[s.ombre]}`);
    if (num(s.calque) && +s.calque) st.push(`position:relative;z-index:${+s.calque}`);
    if (s.masquerMobile) cls.push('hide-m');
    if (s.masquerOrdi) cls.push('hide-d');
    if (s.t && s.t.degrade && s.t.degrade.actif) cls.push('has-t-g');
    if (s.tt && s.tt.degrade && s.tt.degrade.actif) cls.push('has-tt-g');
    if (s.t && s.t.fond) cls.push('has-t-bg');
    if (s.tt && s.tt.fond) cls.push('has-tt-bg');
    if (s.lien && s.lien.survol) cls.push('lk-' + s.lien.survol);
    if (s.align) inner.push(`text-align:${s.align}`), cls.push('al-' + s.align);
    if (s.couleur) inner.push(`--s-c:${s.couleur};color:${s.couleur}`);
    if (+s.decalX || +s.decalY) inner.push(`transform:translate(${+s.decalX || 0}px,${+s.decalY || 0}px)`);
    if (s.lien && s.lien.couleur) inner.push(`--lk-c:${s.lien.couleur}`);
    inner.push(...typo(s.t, 't'), ...typo(s.tt, 'tt'));
    return { cls: cls.join(' '), style: st.join(';'), inner: inner.join(';') };
  }

  /* ---------- Images ---------- */
  function figure(it, path, o = {}) {
    it = typeof it === 'string' ? { src: it } : (it || {});
    const src = it.src || '';
    const fst = [], mst = [], ist = [];
    const w = Math.max(1, Math.min(+it.w || 1, o.cols || 6)), hgt = Math.max(1, Math.min(+it.h || 1, 6));
    if (w > 1) fst.push(`--w:${w}`);
    if (hgt > 1) fst.push(`--h:${hgt}`, `--hm:${Math.min(hgt, 2)}`);
    fst.push(`--wm:${Math.min(w, o.colsM || 2)}`);
    const b = it.bordure || {};
    if (+b.largeur) mst.push(`border:${+b.largeur}px solid ${b.couleur || '#ffffff'}`);
    if (+b.rayon) mst.push(`border-radius:${+b.rayon}px`);
    if (o.ratio && o.ratio !== 'auto') mst.push(`aspect-ratio:${o.ratio}`);
    if (it.fond) mst.push(`background:${it.fond}`);
    ist.push(`object-fit:${it.fit || 'cover'}`, `object-position:${it.posX ?? 50}% ${it.posY ?? 50}%`);
    if (+it.zoom && +it.zoom !== 100) ist.push(`--z:${+it.zoom / 100}`);
    const ov = it.superposition || {};
    const ovHtml = +ov.opacite ? `<span class="gi-ov" style="background:${ov.degrade
      ? `linear-gradient(${+ov.angle || 180}deg,${M.rgba(ov.couleur, 0)},${M.rgba(ov.couleur, ov.opacite)})`
      : M.rgba(ov.couleur, ov.opacite)}"></span>` : '';
    const textOver = (it.texte || (EDIT && it.texteActif)) ? `<div class="gi-txt z-${it.texteZone || 'centre'}">${rich('', it.texte || '', path + '.texte', 'Texte sur l’image')}</div>` : '';
    const lb = !EDIT && o.lb !== false && !it.lien && src;
    const media = src
      ? `<img src="${esc(src)}" alt="${esc(it.alt || it.legende || '')}" loading="${o.eager ? 'eager' : 'lazy'}" decoding="async" style="${ist.join(';')}"${lb ? ' data-lb' : ''}${it.legende ? ` data-caption="${esc(it.legende)}"` : ''}>`
      : `<div class="gi-empty">${EDIT ? 'Clique pour choisir une image' : ''}</div>`;
    let inner = `<div class="gi-media" style="${mst.join(';')}">${media}${ovHtml}${textOver}</div>`;
    if (it.lien && !EDIT) inner = `<a href="${esc(it.lien)}"${/^https?:/.test(it.lien) ? ' target="_blank" rel="noopener"' : ''}>${inner}</a>`;
    const cap = o.caption !== false ? txt('figcaption', 'gi-cap', it.legende, path + '.legende', 'Légende') : '';
    const showCap = (EDIT && o.captionEdit) || it.legende ? cap : '';
    const sty = [...fst];
    let dataAnim = '';
    if (it.anim && it.anim.type) { dataAnim = ` data-anim="${esc(it.anim.type)}"`; sty.push(`--ad:${+it.anim.duree || 0.9}s`, `--adl:${+it.anim.delai || 0}s`); }
    const hov = it.survol || o.hover;
    return `<figure class="gi${hov ? ' hov-' + esc(hov) : ''}${it.filtre ? ' flt-' + esc(it.filtre) : ''}${dataAnim ? ' anim' : ''}${o.cls ? ' ' + o.cls : ''}"${EDIT ? ` data-img="${path}"` : ''}${dataAnim}${sty.length ? ` style="${sty.join(';')}"` : ''}>${inner}${showCap}</figure>`;
  }

  /* ---------- Liens et boutons ---------- */
  function linkOf(b, d) {
    const t = b.type || 'lien', cible = b.cible || '';
    if (t === 'page') { const p = d.pages.find(x => x.id === cible); return { href: M.pageUrl(p), attrs: '' }; }
    if (t === 'email') return { href: 'mailto:' + cible, attrs: '' };
    if (t === 'tel') return { href: 'tel:' + String(cible).replace(/[^\d+]/g, ''), attrs: '' };
    if (t === 'fichier') return { href: cible, attrs: ' download target="_blank" rel="noopener"' };
    const ext = /^https?:/.test(cible);
    return { href: cible || '#', attrs: (b.onglet || ext) ? ' target="_blank" rel="noopener"' : '' };
  }
  function buttons(list, path, d) {
    list = arr(list);
    if (!list.length) return '';
    return `<div class="btns">${list.map((b, i) => {
      const l = linkOf(b, d);
      return `<a class="btn btn-${esc(b.style || 'plein')}${b.taille ? ' btn-' + esc(b.taille) : ''}" href="${esc(l.href)}"${l.attrs}${ED(path + '.' + i + '.texte', 'text', 'Bouton')}>${esc(b.texte || '')}</a>`;
    }).join('')}</div>`;
  }
  const chips = (list, cls = 'chips') => arr(list).filter(Boolean).length ? `<ul class="${cls}">${arr(list).filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const socials = d => arr(d.site.reseaux).filter(r => r && r.url && r.nom);

  /* ==========================================================================
     Rendu des sections
     ========================================================================== */
  const R = {};

  R.couverture = (sec, d) => {
    const c = sec.c, m = c.media || {}, ov = c.superposition || {}, pos = c.pos || { x: 50, y: 50 };
    const op = +ov.opacite || 0;
    const ovCss = ov.degrade
      ? `linear-gradient(180deg,${M.rgba(ov.couleur, op * 0.7)},${M.rgba(ov.couleur, op)} 55%,${M.rgba(ov.couleur, Math.min(100, op * 2.4))})`
      : M.rgba(ov.couleur, op);
    const title = c.titre || '';
    const letters = !EDIT && c.animTitre === 'lettres' && !reduceMotion
      ? `<h1 class="t-ttl cov-title lettres" aria-label="${esc(title)}">${[...title].map((ch, i) => `<span style="--l:${i}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')}</h1>`
      : txt('h1', 't-ttl cov-title', title, 'c.titre', 'Titre');
    const vid = m.type === 'video' && m.video ? ` data-bgvideo="${esc(m.video)}"` : '';
    return `<div class="cov" style="--cov-h:${Math.min(100, Math.max(25, +c.hauteur || 70))}">
      <div class="cov-media"${vid}${EDIT ? ' data-img="c.media"' : ''}>${m.src ? `<img src="${esc(m.src)}" alt="" fetchpriority="high" decoding="async" style="object-position:${m.posX ?? 50}% ${m.posY ?? 50}%">` : (EDIT ? '<div class="gi-empty">Clique pour choisir l’image de couverture</div>' : '')}
        ${EDIT && vid ? '<span class="ed-badge">Vidéo d’arrière-plan : visible sur le site</span>' : ''}</div>
      <div class="cov-ov" style="background:${ovCss}"></div>
      <div class="cov-box${c.animTitre === 'lettres' && !EDIT ? ' cov-intro' : ''}" style="left:${+pos.x}%;top:${+pos.y}%;text-align:${esc(c.alignTexte || 'center')};max-width:min(${+c.largeurTexte || 680}px,92%)"${EDIT ? ' data-drag="cov"' : ''}>
        ${letters}
        ${rich('cov-txt', c.html, 'c.html', 'Texte par-dessus l’image')}
        ${buttons(c.boutons, 'c.boutons', d)}
      </div>
      ${!EDIT ? '<a href="#main-2" class="cov-scroll" aria-label="Descendre"><span></span></a>' : ''}
    </div>`;
  };

  R.entete = sec => {
    const c = sec.c;
    return `<header class="p-head">
      ${c.pastille || EDIT ? `<span class="pill"${ED('c.pastille', 'text', 'Pastille')}>${esc(c.pastille || '')}</span>` : ''}
      ${txt('h1', 't-ttl p-title', c.titre, 'c.titre', 'Titre')}
      ${txt('p', 'p-sub', c.sousTitre, 'c.sousTitre', 'Sous-titre')}
    </header>`;
  };

  const textBlock = c => `
    ${txt('span', 'eyebrow', c.surtitre, 'c.surtitre', 'Surtitre')}
    ${txt('h2', 't-ttl tx-title', c.titre, 'c.titre', 'Titre')}
    ${txt('h3', 'tx-sub', c.sousTitre, 'c.sousTitre', 'Sous-titre')}
    ${rich('t-body', c.html, 'c.html', 'Écris ton texte ici')}
    ${chips(c.tags)}`;
  R.texte = (sec, d) => `<div class="tx">${textBlock(sec.c)}${buttons(sec.c.boutons, 'c.boutons', d)}</div>`;
  R.encadre = (sec, d) => `<div class="tx box-accent">${textBlock(sec.c)}${buttons(sec.c.boutons, 'c.boutons', d)}</div>`;

  R.colonnes = (sec, d) => {
    const c = sec.c;
    return `<div class="cols${c.imageCote === 'droite' ? ' img-droite' : ''}" style="--prop:${Math.min(75, Math.max(25, +c.proportion || 45))}%">
      ${figure(M.img(c.img), 'c.img', { cls: 'cols-img', ratio: c.img && c.img.ratio, caption: false })}
      <div class="tx">${textBlock(c)}${buttons(c.boutons, 'c.boutons', d)}</div>
    </div>`;
  };

  R.image = sec => {
    const c = sec.c;
    return figure(M.img(c.img), 'c.img', { cls: 'one', ratio: c.img && c.img.ratio }) + txt('p', 'one-cap', c.legende, 'c.legende', 'Légende');
  };

  R.galerie = sec => {
    const c = sec.c, imgs = arr(c.images), disp = c.disposition || 'puzzle';
    const cols = Math.max(1, Math.min(6, +c.colonnes || 3)), colsM = Math.max(1, Math.min(3, +c.colonnesM || 2));
    const head = (c.titre || c.sousTitre || EDIT) ? `<div class="gal-head">${txt('h2', 't-ttl gal-title', c.titre, 'c.titre', 'Titre de la galerie (optionnel)')}${txt('p', 'gal-sub', c.sousTitre, 'c.sousTitre', 'Description (optionnel)')}</div>` : '';
    if (!imgs.length) return head + (EDIT ? '<div class="ed-empty" data-act="add-images">+ Ajouter des images à cette galerie</div>' : '');
    const vars = `--cols:${cols};--cols-m:${colsM};--gap:${+c.espacement >= 0 ? +c.espacement : 12}px;--ratio:${c.ratio && c.ratio !== 'auto' ? c.ratio : '4/3'};--row:${+c.hauteurRang || 220}px;--band:${+c.hauteurBande || 440}px`;
    const o = i => ({ cols, colsM, ratio: disp === 'grille' ? (c.ratio || '4/3') : null, hover: c.survol, eager: i < 2, captionEdit: disp !== 'puzzle' });
    if (disp === 'diaporama') {
      return head + `<div class="slider" style="${vars}" data-auto="${c.defilementAuto ? 1 : 0}">
        <div class="sl-track">${imgs.map((it, i) => `<div class="sl-slide">${figure(it, 'c.images.' + i, { ratio: c.ratio && c.ratio !== 'auto' ? c.ratio : '16/9', eager: i === 0 })}</div>`).join('')}</div>
        ${imgs.length > 1 ? `<button class="sl-btn sl-prev" type="button" aria-label="Image précédente">‹</button><button class="sl-btn sl-next" type="button" aria-label="Image suivante">›</button>
        <div class="sl-dots">${imgs.map((_, i) => `<button type="button" aria-label="Image ${i + 1}"${i ? '' : ' class="on"'}></button>`).join('')}</div>` : ''}
      </div>`;
    }
    return head + `<div class="gal gal-${disp}" style="${vars}">${imgs.map((it, i) => figure(it, 'c.images.' + i, o(i))).join('')}</div>`;
  };

  R.video = sec => {
    const c = sec.c, v = M.video(c.url);
    if (!v) return EDIT ? '<div class="ed-empty" data-act="edit">+ Colle un lien YouTube ou Vimeo dans les réglages de la section</div>' : '';
    let player;
    if (v.type === 'file') player = `<video src="${esc(v.src)}" controls playsinline preload="none"${c.poster ? ` poster="${esc(c.poster)}"` : ''}></video>`;
    else {
      const src = v.type === 'youtube' ? `https://www.youtube-nocookie.com/embed/${v.id}?rel=0&modestbranding=1&playsinline=1&autoplay=1` : `https://player.vimeo.com/video/${v.id}?title=0&byline=0&portrait=0&dnt=1&autoplay=1`;
      const img = c.poster || (v.type === 'youtube' ? `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg` : '');
      player = `<button class="vfacade" type="button" data-embed="${esc(src)}" aria-label="Lire la vidéo">${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async"${v.type === 'youtube' && !c.poster ? ` data-yt="${v.id}"` : ''}>` : ''}<span class="vplay" aria-hidden="true"></span></button>`;
    }
    return `<div class="p-video" style="aspect-ratio:${esc(c.ratio || '16/9')}">${player}</div>${txt('p', 'one-cap', c.legende, 'c.legende', 'Légende')}`;
  };

  function card(p, i, c) {
    const k = p.carte || {};
    const anim = k.animation || c.animation || 'cinema';
    const img = k.vignette || '';
    const bg = img ? ` style="background-image:url('${esc(img)}')"` : '';
    const roles = arr(k.roles).filter(Boolean);
    const meta = [];
    if (c.afficherGenre !== false && k.genre) meta.push(`<span class="card-genre">${esc(k.genre)}</span>`);
    if (c.afficherRoles !== false && roles.length) meta.push(`<span class="card-roles">${roles.map(esc).join(' - ')}</span>`);
    return `<a class="card anim-${esc(anim)} reveal" data-genre="${esc(k.genre || '')}" data-pid="${esc(p.id)}" style="--d:${(i % 3) * 90}ms" href="${M.pageUrl(p)}">
      <div class="thumb">
        ${img ? `<img src="${esc(img)}" alt="${esc(p.titre)}" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async">` : '<div class="thumb-empty">Vignette à ajouter</div>'}
        ${anim === 'glitch' ? `<span class="fx fx-g fx-g1"${bg}></span><span class="fx fx-g fx-g2"${bg}></span>` : ''}
        <span class="fx fx-sweep"></span>
        <span class="thumb-cta">Voir le projet</span>
      </div>
      <h3 class="card-title"><span>${esc(p.titre)}</span></h3>
      ${meta.length ? `<p class="card-meta">${meta.join('<span class="card-sep" aria-hidden="true">·</span>')}</p>` : ''}
    </a>`;
  }
  R.projets = (sec, d) => {
    const c = sec.c;
    const all = d.pages.filter(p => p.type === 'projet' && !p.masquer);
    const list = c.genre ? all.filter(p => (p.carte || {}).genre === c.genre) : all;
    const found = M.genres(d);
    const order = arr(c.ordreGenres).filter(g => found.includes(g));
    const genres = [...order, ...found.filter(g => !order.includes(g))];
    const filters = c.filtres !== false && !c.genre && genres.length > 1
      ? `<div class="filtres" role="tablist" aria-label="Filtrer par genre">
          <button type="button" role="tab" class="on" aria-selected="true" data-g="">${esc(c.tousLabel || 'Tous')}</button>
          ${genres.map(g => `<button type="button" role="tab" aria-selected="false" data-g="${esc(g)}">${esc(g)}</button>`).join('')}
        </div>` : '';
    return `${txt('h2', 't-ttl sec-title', c.titre, 'c.titre', 'Titre (optionnel)')}${filters}
      <div class="grid pgrid" style="--cols:${Math.max(1, Math.min(4, +c.colonnes || 2))};--cols-m:${Math.max(1, Math.min(2, +c.colonnesM || 1))};--ratio:${esc(c.ratio || '16/9')}">
        ${list.map((p, i) => card(p, i, c)).join('') || '<p class="empty">Aucun projet pour le moment.</p>'}
      </div>`;
  };

  function dlInfos(list, path) {
    return arr(list).map((x, i) => (!EDIT && !x.valeur) ? '' :
      `<div><dt${ED(`${path}.${i}.label`, 'text', 'Intitulé')}>${esc(x.label)}</dt><dd${ED(`${path}.${i}.valeur`, 'text', 'Valeur')}>${esc(x.valeur)}</dd></div>`).join('');
  }
  function dlCredits(list, path) {
    return arr(list).filter(x => EDIT || x.fonction || x.noms).map((x, i) => {
      const names = String(x.noms || '').split(/\s+-\s+|\n/).map(n => n.trim()).filter(Boolean);
      const long = String(x.noms || '').length > 38 || names.length > 2;
      const dd = EDIT ? esc(x.noms || '') : names.map(n => `<span>${esc(n)}</span>`).join('<i> - </i>');
      return `<div class="cr${long ? ' cr-long' : ''}"><dt${ED(`${path}.${i}.fonction`, 'text', 'Fonction')}>${esc(x.fonction)}</dt><dd${ED(`${path}.${i}.noms`, 'text', 'Noms (séparés par « - »)')}>${dd}</dd></div>`;
    }).join('');
  }
  R.fiche = sec => {
    const c = sec.c;
    const infos = dlInfos(c.infos, 'c.infos'), cr = dlCredits(c.credits, 'c.credits');
    return `<div class="fiche">
      <div class="fiche-l">${rich('t-body', c.html, 'c.html', 'Raconte le projet')}</div>
      ${(infos || cr || EDIT) ? `<aside class="fiche-r">${infos ? `<dl class="p-details">${infos}</dl>` : ''}${cr ? `<dl class="p-credits">${cr}</dl>` : ''}</aside>` : ''}
    </div>`;
  };
  R.infos = sec => {
    const c = sec.c;
    return `${txt('h2', 't-ttl sec-title small', c.titre, 'c.titre', 'Titre (optionnel)')}<dl class="p-details infos cols-${+c.colonnes === 2 ? 2 : 1}">${dlInfos(c.lignes, 'c.lignes')}</dl>`;
  };
  R.credits = sec => `${txt('h2', 't-ttl sec-title small', sec.c.titre, 'c.titre', 'Titre (optionnel)')}<dl class="p-credits standalone">${dlCredits(sec.c.lignes, 'c.lignes')}</dl>`;
  R.liste = sec => {
    const c = sec.c;
    return `${txt('h2', 't-ttl sec-title small', c.titre, 'c.titre', 'Titre (optionnel)')}<div class="timeline">${arr(c.items).map((it, i) =>
      `<div class="tl"><div class="tl-when"${ED(`c.items.${i}.date`, 'text', 'Date')}>${esc(it.date)}</div><div>${txt('h3', 'tl-ttl', it.titre, `c.items.${i}.titre`, 'Intitulé')}${rich('t-body', it.html, `c.items.${i}.html`, 'Description')}</div></div>`).join('')}</div>`;
  };
  R.tags = sec => `${txt('h2', 't-ttl sec-title small', sec.c.titre, 'c.titre', 'Titre (optionnel)')}${chips(sec.c.tags, 'chips big')}${EDIT && !arr(sec.c.tags).length ? '<div class="ed-empty" data-act="edit">+ Ajoute des mots-clés dans les réglages</div>' : ''}`;

  R.contact = (sec, d) => {
    const c = sec.c, soc = c.reseaux !== false ? socials(d) : [];
    return `${txt('h1', 't-ttl page-title', c.titre, 'c.titre', 'Titre')}
      <div class="contact-grid${c.formulaire ? '' : ' single'}">
        <div class="contact-info">
          ${rich('t-body', c.html, 'c.html', 'Texte d’accroche')}
          ${c.email ? `<a class="big-link" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : (EDIT ? '<p class="ed-hint">Ajoute ton e-mail dans les réglages de la section (crayon)</p>' : '')}
          ${c.telephone ? `<a class="contact-line" href="tel:${esc(String(c.telephone).replace(/[^\d+]/g, ''))}">${esc(c.telephone)}</a>` : ''}
          ${c.lieu ? `<p class="contact-line muted">${esc(c.lieu)}</p>` : ''}
          ${soc.length ? `<ul class="socials">${soc.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.nom)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul>` : ''}
        </div>
        ${c.formulaire ? `<form class="form" data-formspree="${esc(c.formspree || '')}" data-email="${esc(c.email || '')}" novalidate>
          <label><span>Nom</span><input name="nom" autocomplete="name" required></label>
          <label><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label>
          <label><span>Sujet</span><input name="sujet"></label>
          <label><span>Message</span><textarea name="message" rows="6" required></textarea></label>
          <button class="btn btn-contour" type="submit">Envoyer</button>
          <p class="form-msg" role="status"></p>
        </form>` : ''}
      </div>`;
  };
  R.reseaux = (sec, d) => {
    const soc = socials(d);
    return `${txt('h2', 't-ttl sec-title small', sec.c.titre, 'c.titre', 'Titre (optionnel)')}${soc.length ? `<ul class="socials big">${soc.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.nom)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul>` : (EDIT ? '<div class="ed-empty" data-act="site-reseaux">+ Ajoute tes réseaux dans Réglages du site → Réseaux sociaux</div>' : '')}`;
  };
  R.boutons = (sec, d) => buttons(sec.c.boutons, 'c.boutons', d) || (EDIT ? '<div class="ed-empty" data-act="edit">+ Ajoute un bouton dans les réglages</div>' : '');
  R.fichiers = sec => {
    const c = sec.c, f = arr(c.fichiers).filter(x => x && x.src);
    return `${txt('h2', 't-ttl sec-title small', c.titre, 'c.titre', 'Titre (optionnel)')}${f.length ? `<div class="dls">${f.map(x => `<a class="dl" href="${esc(x.src)}" download target="_blank" rel="noopener"><span class="dl-ext">${esc(M.ext(x.src).toUpperCase().slice(0, 4) || 'FICHIER')}</span><span class="dl-name">${esc(x.nom || x.src.split('/').pop())}</span><span class="dl-ico" aria-hidden="true">↓</span></a>`).join('')}</div>` : (EDIT ? '<div class="ed-empty" data-act="edit">+ Ajoute des fichiers (CV, PDF…) dans les réglages</div>' : '')}`;
  };
  R.spotify = sec => {
    const c = sec.c, list = arr(c.liens).map(M.spotify).filter(Boolean);
    const hgt = c.taille === 'grand' ? 352 : 152;
    return `${txt('h2', 't-ttl sec-title small', c.titre, 'c.titre', 'Titre (optionnel)')}${list.length ? `<div class="spot" style="--cols:${Math.max(1, Math.min(3, +c.colonnes || 1))}">${list.map(s => `<iframe src="https://open.spotify.com/embed/${s.type}/${s.id}?utm_source=generator&amp;theme=0" height="${hgt}" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="Lecteur Spotify"></iframe>`).join('')}</div>` : (EDIT ? '<div class="ed-empty" data-act="edit">+ Colle un lien Spotify (titre, album, playlist) dans les réglages</div>' : '')}`;
  };
  R.espace = sec => {
    const c = sec.c;
    return `<div class="spacer" style="height:${Math.max(0, +c.hauteur || 0)}px">${c.ligne ? `<hr style="border-top:${+c.epaisseur || 1}px solid ${esc(c.couleurLigne || 'rgba(255,255,255,.15)')};width:${+c.largeurLigne || 100}%">` : ''}</div>`;
  };
  R.libre = (sec, d) => {
    const c = sec.c, items = arr(c.items);
    const order = items.map((it, i) => ({ it, i })).sort((a, b) => (+a.it.y || 0) - (+b.it.y || 0));
    return `<div class="libre" style="--lh:${Math.max(200, +c.hauteur || 560)}px">${order.map(({ it, i }) => {
      let inner = '';
      if (it.k === 'image') inner = figure(Object.assign({}, it, { w: 1, h: 1 }), `c.items.${i}`, { caption: false });
      else if (it.k === 'bouton') inner = buttons([it.bouton || { texte: 'Bouton' }], `c.items.${i}.bouton`, d).replace(`c.items.${i}.bouton.0.texte`, `c.items.${i}.bouton.texte`);
      else inner = rich('t-body', it.html, `c.items.${i}.html`, 'Texte libre');
      return `<div class="fr-it fr-${esc(it.k)}${animCls(it.anim)}" style="left:${+it.x || 0}%;top:${+it.y || 0}%;width:${+it.w || 30}%;z-index:${+it.z || 1}"${EDIT ? ` data-item="${i}"` : ''}${it.anim && it.anim.type ? ` data-anim="${esc(it.anim.type)}"` : ''}>${inner}</div>`;
    }).join('')}${EDIT && !items.length ? '<div class="ed-empty" data-act="edit">+ Ajoute des éléments dans les réglages</div>' : ''}</div>`;
  };

  /* ---------- Page entière ---------- */
  function header(d, page) {
    const s = d.site, e = s.entete || {};
    const items = d.pages.filter(p => p.menu && !p.masquer && p.type !== 'projet');
    const active = p => p === page || (page.type === 'projet' && p.accueil);
    return `<header class="hdr hdr-${esc(e.disposition || 'centre')}${e.majuscules === false ? ' hdr-min' : ''}" id="hdr"${EDIT ? ' data-zone="entete"' : ''}>
      <a class="hdr-name" href="index.html">${esc(s.nom)}</a>
      <nav class="hdr-nav" aria-label="Menu principal">${items.map(p => `<a href="${M.pageUrl(p)}"${active(p) ? ' class="is-active" aria-current="page"' : ''}>${esc(p.titre)}</a>`).join('')}</nav>
    </header>`;
  }
  function footer(d) {
    const s = d.site, f = s.pied || {};
    if (f.afficher === false) return EDIT ? '<footer class="ftr ftr-off" data-zone="pied">Pied de page masqué (Réglages du site)</footer>' : '';
    const soc = f.reseaux !== false ? socials(d) : [];
    return `<footer class="ftr"${EDIT ? ' data-zone="pied"' : ''}>
      ${soc.length ? `<ul class="ftr-soc">${soc.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.nom)}</a></li>`).join('')}</ul>` : ''}
      <div class="ftr-copy">© ${new Date().getFullYear()} ${esc(s.nom)}${f.texte ? ' · ' + esc(f.texte) : ''}</div>
    </footer>`;
  }
  function projectNav(d, page) {
    const list = d.pages.filter(p => p.type === 'projet' && !p.masquer);
    const i = list.indexOf(page);
    const next = list.length > 1 ? list[(i + 1) % list.length] : null;
    const home = d.pages.find(p => p.accueil);
    const k = next && next.carte || {};
    return `<nav class="wrap p-nav" aria-label="Navigation entre projets">
      <a class="p-nav-back" href="${M.pageUrl(home)}#projets"><span aria-hidden="true">←</span> Retour à l’accueil</a>
      ${next && next !== page ? `<a class="p-nav-next" href="${M.pageUrl(next)}">${k.vignette ? `<img src="${esc(k.vignette)}" alt="" loading="lazy">` : ''}<span class="p-nav-label">Projet suivant</span><strong>${esc(next.titre)} <span aria-hidden="true">→</span></strong></a>` : ''}
    </nav>`;
  }
  function renderSection(sec, d, page, i) {
    const fn = R[sec.type];
    if (!fn) return '';
    const p = sectionParts(sec);
    const a = sec.a || {};
    const stagger = a.type && a.cible === 'elements';
    let innerAnim = '';
    let innerStyle = p.inner;
    if (a.type && !stagger) {
      innerAnim = ` data-anim="${esc(a.type)}"`;
      innerStyle += `;--ad:${+a.duree || 0.9}s;--adl:${+a.delai || 0}s`;
    }
    const body = fn(sec, d, page, i);
    return `<section class="${p.cls}" id="${esc(sec.id)}"${sec.type === 'projets' ? ' data-projets' : ''}${EDIT ? ` data-sid="${esc(sec.id)}"` : ''} style="${p.style}">
      <div class="sec-in${a.type && !stagger ? ' anim' : ''}"${innerAnim}${stagger ? ` data-stagger="${esc(a.type)}" data-sd="${+a.duree || 0.9}" data-sdl="${+a.delai || 0}"` : ''} style="${innerStyle}">${body}</div>
    </section>`;
  }
  function renderPage(d, page) {
    const secs = arr(page.sections);
    return (page.masquerMenu ? '' : header(d, page)) +
      `<main id="main" class="page-${esc(page.id)}">${secs.map((s, i) => renderSection(s, d, page, i)).join('')}
      ${EDIT && !secs.length ? '<div class="ed-empty big" data-act="add-first">+ Ajouter une première section</div>' : ''}
      ${page.type === 'projet' && page.navigation !== false ? projectNav(d, page) : ''}<span id="main-2"></span></main>` +
      (page.masquerPied ? '' : footer(d));
  }
  function notFound(d) {
    return header(d, {}) + `<main id="main"><section class="sec w-normale"><div class="sec-in notfound"><h1 class="t-ttl page-title">Oups</h1><p>Cette page n’existe pas.</p><a class="btn btn-contour" href="index.html">Retour à l’accueil</a></div></section></main>` + footer(d);
  }

  /* ---------- Thème ---------- */
  function applyTheme(d) {
    const t = d.site.theme || {};
    const r = document.documentElement.style;
    r.setProperty('--bg', t.fond || '#000');
    r.setProperty('--fg', t.texte || '#f3f3f3');
    r.setProperty('--muted', t.texteDoux || '#9a9a9a');
    r.setProperty('--accent', t.accent || '#8a9bff');
    r.setProperty('--font', `'${t.police || 'Figtree'}', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`);
    r.setProperty('--font-titres', `'${t.policeTitres || t.police || 'Figtree'}', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif`);
    document.body.classList.toggle('grain-on', t.grain !== false);
    const fonts = [t.police, t.policeTitres];
    d.pages.forEach(p => arr(p.sections).forEach(s => { if (s.s && s.s.t) fonts.push(s.s.t.police); if (s.s && s.s.tt) fonts.push(s.s.tt.police); }));
    const url = M.fontsUrl(fonts);
    let link = document.getElementById('gfonts');
    if (url && (!link || link.getAttribute('href') !== url)) {
      if (!link) { link = document.createElement('link'); link.id = 'gfonts'; link.rel = 'stylesheet'; document.head.appendChild(link); }
      link.href = url;
    }
  }

  /* ==========================================================================
     Comportements (animations, visionneuse, diaporamas, filtres…)
     ========================================================================== */
  let io = null;
  function animations() {
    $$('[data-stagger]').forEach(box => {
      const type = box.dataset.stagger, dur = +box.dataset.sd || 0.9, del = +box.dataset.sdl || 0;
      let kids = [...box.children];
      if (kids.length === 1 && kids[0].children.length > 1) kids = [...kids[0].children];
      kids.forEach((k, i) => { k.classList.add('anim'); k.dataset.anim = type; k.style.setProperty('--ad', dur + 's'); k.style.setProperty('--adl', (del + i * 0.12).toFixed(2) + 's'); });
    });
    const els = $$('.anim, .reveal');
    if (EDIT || reduceMotion || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    if (io) io.disconnect();
    io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    els.forEach(e => io.observe(e));
  }
  function touchHover() {
    if (EDIT || !window.matchMedia('(hover: none)').matches || !('IntersectionObserver' in window)) return;
    const o = new IntersectionObserver(en => en.forEach(x => x.target.classList.toggle('is-hover', x.isIntersecting)), { rootMargin: '-40% 0px -40% 0px' });
    $$('.card').forEach(c => o.observe(c));
  }
  function sliders() {
    $$('.slider').forEach(sl => {
      const track = $('.sl-track', sl), n = track.children.length, dots = $$('.sl-dots button', sl);
      let i = 0, timer;
      const go = k => { i = (k + n) % n; track.style.transform = `translateX(-${i * 100}%)`; dots.forEach((d, j) => d.classList.toggle('on', j === i)); };
      const p = $('.sl-prev', sl), nx = $('.sl-next', sl);
      if (p) p.onclick = () => go(i - 1);
      if (nx) nx.onclick = () => go(i + 1);
      dots.forEach((d, j) => { d.onclick = () => go(j); });
      let x0 = null;
      sl.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
      sl.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); x0 = null; });
      if (sl.dataset.auto === '1' && !EDIT && n > 1) {
        const start = () => { clearInterval(timer); timer = setInterval(() => go(i + 1), 4500); };
        sl.addEventListener('mouseenter', () => clearInterval(timer));
        sl.addEventListener('mouseleave', start);
        start();
      }
    });
  }
  function videos() {
    $$('img[data-yt]').forEach(img => {
      const hq = `https://i.ytimg.com/vi/${img.dataset.yt}/hqdefault.jpg`;
      const chk = () => { if (img.naturalWidth && img.naturalWidth <= 120 && img.src !== hq) img.src = hq; };
      img.complete ? chk() : img.addEventListener('load', chk);
      img.addEventListener('error', () => { if (img.src !== hq) img.src = hq; }, { once: true });
    });
    if (EDIT) return;
    $$('.vfacade').forEach(b => b.addEventListener('click', () => {
      const f = document.createElement('iframe');
      f.src = b.dataset.embed;
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.title = 'Lecteur vidéo';
      b.replaceWith(f);
    }, { once: true }));
    // Vidéo d'arrière-plan de couverture : chargée après la page, jamais sur téléphone
    $$('[data-bgvideo]').forEach(box => {
      const v = M.video(box.dataset.bgvideo);
      const small = window.matchMedia('(max-width: 760px)').matches;
      const saveData = navigator.connection && navigator.connection.saveData;
      if (!v || ((small || saveData || reduceMotion) && box.querySelector('img'))) return;
      const start = () => {
        let el;
        if (v.type === 'file') { el = document.createElement('video'); Object.assign(el, { src: v.src, autoplay: true, muted: true, loop: true, playsInline: true }); }
        else {
          el = document.createElement('iframe');
          el.src = v.type === 'youtube'
            ? `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&mute=1&loop=1&playlist=${v.id}&controls=0&disablekb=1&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3`
            : `https://player.vimeo.com/video/${v.id}?background=1&autoplay=1&loop=1&muted=1&dnt=1`;
          el.allow = 'autoplay; fullscreen';
          el.tabIndex = -1;
          el.setAttribute('aria-hidden', 'true');
        }
        el.className = 'bg-video';
        box.appendChild(el);
        el.addEventListener(v.type === 'file' ? 'playing' : 'load', () => setTimeout(() => el.classList.add('on'), v.type === 'file' ? 0 : 1400), { once: true });
      };
      if (document.readyState === 'complete') setTimeout(start, 200); else addEventListener('load', () => setTimeout(start, 200), { once: true });
    });
  }
  function filters() {
    $$('[data-projets]').forEach(sec => {
      const btns = $$('.filtres button', sec);
      if (!btns.length) return;
      const apply = (g, animate) => {
        btns.forEach(b => { const on = b.dataset.g === g; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        $$('.card', sec).forEach((c, k) => {
          const show = !g || c.dataset.genre === g;
          c.hidden = !show;
          if (show && animate && !reduceMotion) { c.classList.remove('in'); c.style.setProperty('--d', (k % 3) * 70 + 'ms'); requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('in'))); }
        });
        if (!EDIT) history.replaceState(null, '', g ? '#genre-' + M.slugify(g) : location.pathname + location.search);
      };
      btns.forEach(b => b.addEventListener('click', () => apply(b.dataset.g, true)));
      const h = decodeURIComponent(location.hash || '');
      if (h.startsWith('#genre-')) { const b = btns.find(x => M.slugify(x.dataset.g) === h.slice(7)); if (b) apply(b.dataset.g, false); }
    });
  }
  function forms() {
    if (EDIT) return;
    $$('form.form').forEach(form => form.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = $('.form-msg', form), data = Object.fromEntries(new FormData(form));
      if (!data.nom || !data.email || !data.message) { msg.textContent = 'Merci de remplir ton nom, ton e-mail et ton message.'; return; }
      const fs = form.dataset.formspree, email = form.dataset.email;
      if (fs) {
        msg.textContent = 'Envoi…';
        try {
          const r = await fetch(fs, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
          if (!r.ok) throw new Error();
          form.reset(); msg.textContent = 'Merci ! Ton message a bien été envoyé.';
        } catch (err) { msg.textContent = 'L’envoi a échoué. Tu peux écrire directement à ' + (email || 'l’adresse indiquée') + '.'; }
      } else {
        location.href = `mailto:${email}?subject=${encodeURIComponent(data.sujet || 'Contact depuis le portfolio')}&body=${encodeURIComponent(`${data.message}\n\n— ${data.nom} (${data.email})`)}`;
        msg.textContent = 'Ta messagerie va s’ouvrir avec le message pré-rempli.';
      }
    }));
  }
  let once = false;
  function globalBehaviours() {
    if (once) return;
    once = true;
    // En-tête qui se cache en descendant
    let last = 0;
    addEventListener('scroll', () => {
      const h = $('#hdr'); if (!h) return;
      const y = scrollY, d = window.__data;
      h.classList.toggle('scrolled', y > 10);
      h.classList.toggle('hide', !EDIT && d && d.site.entete.masquerAuDefilement !== false && y > last && y > 300);
      last = y;
    }, { passive: true });
    if (EDIT) return;
    // Visionneuse
    let box, list = [], cur = 0;
    const show = i => {
      cur = (i + list.length) % list.length;
      const el = list[cur], im = $('figure img', box);
      im.classList.remove('on'); im.onload = () => im.classList.add('on');
      im.src = el.currentSrc || el.src; im.alt = el.alt;
      $('figcaption', box).textContent = el.dataset.caption || '';
      $('.lb-count', box).textContent = list.length > 1 ? `${cur + 1} / ${list.length}` : '';
      box.classList.toggle('single', list.length < 2);
    };
    const close = () => { box.classList.remove('open'); document.documentElement.style.overflow = ''; };
    document.addEventListener('click', e => {
      const el = e.target.closest('img[data-lb]');
      if (!el) return;
      if (!box) {
        box = document.createElement('div');
        box.className = 'lb';
        box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
        box.innerHTML = '<button class="lb-close" aria-label="Fermer">×</button><button class="lb-prev" aria-label="Précédente">‹</button><figure><img alt=""><figcaption></figcaption></figure><button class="lb-next" aria-label="Suivante">›</button><div class="lb-count"></div>';
        document.body.appendChild(box);
        box.addEventListener('click', ev => { if (ev.target === box || ev.target.tagName === 'FIGURE') close(); });
        $('.lb-close', box).onclick = close;
        $('.lb-prev', box).onclick = () => show(cur - 1);
        $('.lb-next', box).onclick = () => show(cur + 1);
        let x0 = null;
        box.addEventListener('touchstart', ev => { x0 = ev.touches[0].clientX; }, { passive: true });
        box.addEventListener('touchend', ev => { if (x0 === null) return; const dx = ev.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1)); x0 = null; });
      }
      list = $$('img[data-lb]').filter(i => !i.closest('[hidden]') && !i.closest('.sl-slide:not(:first-child)'));
      if (!list.includes(el)) list.push(el);
      show(list.indexOf(el));
      box.classList.add('open');
      document.documentElement.style.overflow = 'hidden';
    });
    document.addEventListener('keydown', e => {
      if (!box || !box.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') show(cur + 1);
      if (e.key === 'ArrowLeft') show(cur - 1);
    });
    // Transitions entre pages
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || /^(mailto|tel):/.test(a.href)) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      e.preventDefault();
      document.body.classList.add('leaving');
      setTimeout(() => { location.href = url.href; }, reduceMotion ? 0 : 260);
    });
    addEventListener('pageshow', e => { if (e.persisted) document.body.classList.remove('leaving'); });
  }

  /* ---------- Rendu complet ---------- */
  function findPage(d, id) {
    const legacy = { apropos: 'a-propos', films: null };
    if (id && legacy[id] !== undefined) id = legacy[id] || null;
    if (!id) return d.pages.find(p => p.accueil) || d.pages[0];
    return d.pages.find(p => p.id === id && (EDIT || !p.masquer || p.type === 'projet'));
  }
  function render(d, pageId) {
    d = M.normalize(d);
    window.__data = d;
    applyTheme(d);
    const page = findPage(d, pageId);
    const app = $('#app');
    if (!page) { app.innerHTML = notFound(d); document.title = 'Page introuvable — ' + d.site.nom; }
    else {
      app.innerHTML = renderPage(d, page);
      document.title = page.seoTitre || (page.accueil ? (d.site.titreOnglet || d.site.nom) : `${page.titre} — ${d.site.nom}`);
      const meta = $('meta[name="description"]');
      if (meta && (page.seoDescription || d.site.descriptionGoogle)) meta.setAttribute('content', page.seoDescription || d.site.descriptionGoogle);
    }
    document.documentElement.classList.toggle('is-edit', EDIT);
    animations(); touchHover(); sliders(); videos(); filters(); forms(); globalBehaviours();
    return page;
  }

  function loadContent() {
    if (params.has('apercu')) ls.set(PREVIEW_FLAG, '1');
    if (ls.get(PREVIEW_FLAG) === '1') {
      const draft = ls.get(PREVIEW_DATA);
      if (draft) { try { return Promise.resolve({ data: JSON.parse(draft), preview: true }); } catch (e) { /* ignoré */ } }
    }
    if (window.CONTENU) return Promise.resolve({ data: window.CONTENU });
    return new Promise((resolve, reject) => {
      let s = document.getElementById('contenu');
      if (!s) {
        s = document.createElement('script');
        s.src = 'data/contenu.js' + (location.protocol.startsWith('http') ? '?v=' + Math.floor(Date.now() / 60000) : '');
        document.head.appendChild(s);
      }
      s.addEventListener('load', () => window.CONTENU ? resolve({ data: window.CONTENU }) : reject(new Error('Contenu vide')));
      s.addEventListener('error', () => reject(new Error('data/contenu.js introuvable')));
      setTimeout(() => window.CONTENU ? resolve({ data: window.CONTENU }) : reject(new Error('Le contenu met trop de temps à charger. Actualise la page.')), 15000);
    });
  }
  function previewBanner() {
    const b = document.createElement('div');
    b.className = 'preview-bar';
    b.innerHTML = '<span>Aperçu de tes modifications <strong>non publiées</strong></span><button type="button">Quitter l’aperçu</button>';
    $('button', b).onclick = () => { ls.del(PREVIEW_FLAG); location.href = location.pathname + location.search.replace(/[?&]apercu[^&]*/, '').replace(/^&/, '?'); };
    document.body.appendChild(b);
  }

  const pageId = params.get('p') || params.get('id') || (document.body.dataset.page !== 'films' ? document.body.dataset.page : '') || '';
  window.SITE = { render, renderSection: (sec, d, page) => renderSection(sec, M.normalize(d), page, 0), isEdit: EDIT };

  if (EDIT) {
    render(ED_PARENT.data, pageId);
    document.body.classList.add('ready');
    ED_PARENT.frameReady(window, pageId);
  } else {
    loadContent().then(({ data, preview }) => {
      render(data, pageId);
      if (preview) previewBanner();
      if (location.hash && !location.hash.startsWith('#genre-')) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 50); }
      requestAnimationFrame(() => document.body.classList.add('ready'));
    }).catch(err => {
      $('#app').innerHTML = `<div class="notfound" style="padding:80px 20px;text-align:center"><h1>Contenu introuvable</h1><p>${esc(err.message)}</p></div>`;
      document.body.classList.add('ready');
    });
  }
})();
