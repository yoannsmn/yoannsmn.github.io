/* ==========================================================================
   Portfolio : moteur d'affichage (version 3, sections et éléments)
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

  /* ---------- Ordinateur ou téléphone : choisi selon l'appareil, pas la largeur de la fenêtre ----------
     Quand la fenêtre rétrécit, la mise en page ne se réorganise pas : elle se réduit proportionnellement. */
  const PHONE_W = 390, DESK_W = 1200;
  let MODE = null, lastW = 0;
  function viewMode() {
    const v = params.get('vue');
    if (v === 'mobile' || v === 'ordi') return v === 'mobile' ? 'm' : 'd';
    if (EDIT) return ED_PARENT.device ? (ED_PARENT.device === 'mobile' ? 'm' : 'd') : (innerWidth <= 600 ? 'm' : 'd');
    if (MODE) return MODE; // l'appareil ne change pas : on décide une fois pour toutes
    const coarse = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0, small = Math.min(screen.width || innerWidth, screen.height || innerHeight) <= 600;
    return (MODE = coarse && small ? 'm' : 'd');
  }
  function fit() {
    const root = document.documentElement, mode = viewMode();
    root.classList.toggle('vm', mode === 'm');
    root.classList.toggle('vd', mode !== 'm');
    let z = 1;
    if (!EDIT && 'zoom' in root.style) {
      if (mode === 'm') z = Math.min(1.3, innerWidth / PHONE_W);
      else if (innerWidth < DESK_W) z = innerWidth / DESK_W;
    }
    if (Math.abs(z - 1) < 0.01) z = 1;
    root.style.zoom = z === 1 ? '' : z.toFixed(4);
    root.style.setProperty('--vw1', (innerWidth / z / 100).toFixed(3) + 'px');
    // Sur téléphone, le clavier ou la barre d'adresse changent la hauteur : on ne recalcule que si la largeur change (rotation)
    if (mode !== 'm' || innerWidth !== lastW || !root.style.getPropertyValue('--vh1')) root.style.setProperty('--vh1', (innerHeight / z / 100).toFixed(3) + 'px');
    lastW = innerWidth;
  }
  fit();
  let fitTimer;
  addEventListener('resize', () => { clearTimeout(fitTimer); fitTimer = setTimeout(fit, 60); });
  addEventListener('load', () => { fit(); if (typeof galleries === 'function') galleries(); });
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
  const IT = path => EDIT ? ` data-it="${path}"` : '';
  const addItem = (path, label, cls = '') => EDIT ? `<button type="button" class="ed-additem${cls ? ' ' + cls : ''}" data-act="add-item" data-list="${path}" title="Ajouter">${label}</button>` : '';
  const isNum = v => v !== undefined && v !== null && v !== '' && !isNaN(+v);

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
    if (+t.interligneM) v.push(`--${p}-lhm:${+t.interligneM}`);
    if (isNum(t.interlettrageM)) v.push(`--${p}-lsm:${+t.interlettrageM}em`);
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
    if (+s.hauteurMin) { st.push(`--hmin:calc(${+s.hauteurMin} * var(--vh1, 1vh))`); cls.push('has-hmin'); }
    if (+s.hauteurMinM) { st.push(`--hminm:calc(${+s.hauteurMinM} * var(--vh1, 1vh))`); cls.push('has-hminm'); }
    if (+s.hauteurMin || +s.hauteurMinM) cls.push('v-' + (s.alignV || 'centre'));
    if (+s.largeurPx) st.push(`--maxw:${+s.largeurPx}px`);
    if (num(s.paddingBox)) st.push(`--boxp:${+s.paddingBox}px`);
    if (num(s.paddingBoxM)) st.push(`--boxpm:${+s.paddingBoxM}px`);
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
    if (s.alignM) cls.push('alm-' + s.alignM);
    if (s.couleur) inner.push(`--s-c:${s.couleur};color:${s.couleur}`);
    if (+s.decalX || +s.decalY) { inner.push(`--dx:${+s.decalX || 0}px;--dy:${+s.decalY || 0}px`); cls.push('has-dec'); }
    if (num(s.decalXM) || num(s.decalYM)) { inner.push(`--dxm:${+s.decalXM || 0}px;--dym:${+s.decalYM || 0}px`); cls.push('has-decm'); }
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
    const rat = it.ratio && it.ratio !== 'auto' ? it.ratio : o.ratio;
    if (rat && rat !== 'auto' && !o.noRatio) mst.push(`aspect-ratio:${rat}`);
    if (o.rangees && rat && rat !== 'auto') { const n = String(rat).split('/').reduce((a, b) => +a / +b); if (n > 0) fst.push(`--r:${n.toFixed(4)}`); }
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
    const showCap = it.legende || (EDIT && it.legendeOn) ? cap : '';
    const sty = [...fst];
    let dataAnim = '';
    if (it.anim && it.anim.type) { dataAnim = ` data-anim="${esc(it.anim.type)}"`; sty.push(`--ad:${+it.anim.duree || 0.9}s`, `--adl:${+it.anim.delai || 0}s`); }
    const hov = it.survol || o.hover;
    return `<figure class="gi${o.rangees && !(rat && rat !== 'auto') ? ' r-auto' : ''}${hov ? ' hov-' + esc(hov) : ''}${it.filtre ? ' flt-' + esc(it.filtre) : ''}${dataAnim ? ' anim' : ''}${o.cls ? ' ' + o.cls : ''}"${EDIT ? ` data-img="${path}"` : ''}${dataAnim}${sty.length ? ` style="${sty.join(';')}"` : ''}>${inner}${showCap}</figure>`;
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
      return `<a class="btn btn-${esc(b.style || 'plein')}${b.taille ? ' btn-' + esc(b.taille) : ''}" href="${esc(l.href)}"${l.attrs}${ED(path + '.' + i + '.texte', 'text', 'Bouton')}${IT(path + '.' + i)}>${esc(b.texte || '')}</a>`;
    }).join('')}${addItem(path, '+ Bouton', 'add-pill')}</div>`;
  }
  const chips = (list, cls = 'chips') => arr(list).filter(Boolean).length ? `<ul class="${cls}">${arr(list).filter(Boolean).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  const socials = d => arr(d.site.reseaux).filter(r => r && r.url && r.nom);

  /* ==========================================================================
     Rendu des éléments (ce qu'il y a DANS une section)
     ========================================================================== */
  const BR = {};
  const empty = (msg, act = 'edit-bloc', extra = '') => EDIT ? `<div class="ed-empty small" data-act="${act}"${extra}>${msg}</div>` : '';
  const socialList = (d, style, size, cls = '') => {
    const soc = socials(d);
    if (!soc.length) return '';
    style = style || 'icones';
    return `<ul class="soc soc-${esc(style)} ${cls}">${soc.map(r => {
      const k = M.socialKind(r.url, r.nom);
      return `<li><a href="${esc(r.url)}" target="_blank" rel="noopener" aria-label="${esc(r.nom)}" title="${esc(r.nom)}">${style === 'texte' ? '' : M.icon(k, size)}${style === 'icones' ? '' : `<span>${esc(r.nom)}</span>`}</a></li>`;
    }).join('')}</ul>`;
  };

  BR.pastille = (b, p) => {
    const list = arr(b.c.textes).map(t => String(t ?? ''));
    if (!EDIT && !list.some(t => t.trim())) return '';
    return `<div class="pills">${list.map((t, i) => (!EDIT && !t.trim()) ? '' : `<span class="pill"${ED(`${p}.c.textes.${i}`, 'text', 'Pastille')}${IT(`${p}.c.textes.${i}`)}>${esc(t)}</span>`).join('')}${addItem(p + '.c.textes', '+', 'add-pill')}</div>`;
  };
  BR.surtitre = (b, p) => txt('span', 'eyebrow', b.c.texte, p + '.c.texte', 'Surtitre');
  BR.soustitre = (b, p) => txt('p', 'p-sub', b.c.texte, p + '.c.texte', 'Sous-titre');
  BR.titre = (b, p) => {
    const c = b.c, tag = /^h[1-4]$/.test(c.niveau) ? c.niveau : 'h2', cls = `t-ttl ttl-${esc(c.taille || 'bloc')}`;
    if (!EDIT && c.lettres && !reduceMotion && c.texte) return `<${tag} class="${cls} lettres" aria-label="${esc(c.texte)}">${[...c.texte].map((ch, i) => `<span style="--l:${i}">${ch === ' ' ? '&nbsp;' : esc(ch)}</span>`).join('')}</${tag}>`;
    return txt(tag, cls, c.texte, p + '.c.texte', 'Titre');
  };
  BR.texte = (b, p) => rich('t-body', b.c.html, p + '.c.html', 'Écris ton texte ici');
  BR.tags = (b, p) => {
    if (!EDIT) return chips(b.c.tags);
    return `<ul class="chips">${arr(b.c.tags).map((x, i) => `<li${ED(`${p}.c.tags.${i}`, 'text', 'Mot-clé')}${IT(`${p}.c.tags.${i}`)}>${esc(x)}</li>`).join('')}${`<li class="ed-li">${addItem(p + '.c.tags', '+ Mot-clé', 'add-pill')}</li>`}</ul>`;
  };
  BR.boutons = (b, p, sec, d) => buttons(b.c.boutons, p + '.c.boutons', d) || empty('+ Ajoute un bouton (réglages de l’élément)');
  BR.document = (b, p) => {
    const c = b.c;
    if (!c.src && !EDIT) return '';
    return `<div class="btns"><a class="btn btn-${esc(c.style || 'contour')} btn-doc" href="${esc(c.src || '#')}" download target="_blank" rel="noopener">${M.icon('document', 17)}<span${ED(p + '.c.texte', 'text', 'Texte du bouton')}>${esc(c.texte)}</span></a></div>${EDIT && !c.src ? '<p class="ed-hint">Choisis le document dans les réglages de l’élément</p>' : ''}`;
  };
  BR.image = (b, p) => {
    const c = b.c, img = M.img(c.img);
    const w = +c.largeur > 0 && +c.largeur < 100 ? +c.largeur : 0, hh = +c.hauteur || 0, wm = +c.largeurM || 0, hm = +c.hauteurM || 0;
    const vars = [w ? `--iw:${w}%` : '', hh ? `--ih:${hh}px` : '', wm ? `--iwm:${wm}%` : '', hm ? `--ihm:${hm}px` : ''].filter(Boolean).join(';');
    const cap = c.legende || (EDIT && c.legendeOn) ? txt('p', 'one-cap', c.legende, p + '.c.legende', 'Légende') : '';
    return `<div class="img-box${hh ? ' has-h' : ''}${hm ? ' has-hm' : ''}"${vars ? ` style="${vars}"` : ''}>${figure(img, p + '.c.img', { cls: 'one', ratio: hh ? null : img.ratio, caption: false })}${cap}</div>`;
  };
  BR.galerie = (b, p) => {
    const c = b.c, imgs = arr(c.images), disp = c.disposition || 'puzzle';
    const cols = Math.max(1, Math.min(6, +c.colonnes || 3)), colsM = Math.max(1, Math.min(3, +c.colonnesM || 2));
    if (!imgs.length) return empty('+ Ajouter des images à cette galerie', 'add-images');
    const vars = `--cols:${cols};--cols-m:${colsM};--gap:${+c.espacement >= 0 ? +c.espacement : 12}px;--ratio:${c.ratio && c.ratio !== 'auto' ? c.ratio : '4/3'};--row:${+c.hauteurRang || 220}px;--band:${+c.hauteurBande || 440}px`;
    const P = i => `${p}.c.images.${i}`;
    if (disp === 'diaporama') {
      return `<div class="slider" style="${vars}" data-auto="${c.defilementAuto ? 1 : 0}">
        <div class="sl-track">${imgs.map((it, i) => `<div class="sl-slide">${figure(it, P(i), { ratio: c.ratio && c.ratio !== 'auto' ? c.ratio : '16/9', eager: i === 0, hover: c.survol })}</div>`).join('')}</div>
        ${imgs.length > 1 ? `<button class="sl-btn sl-prev" type="button" aria-label="Image précédente">‹</button><button class="sl-btn sl-next" type="button" aria-label="Image suivante">›</button>
        <div class="sl-dots">${imgs.map((_, i) => `<button type="button" aria-label="Image ${i + 1}"${i ? '' : ' class="on"'}></button>`).join('')}</div>` : ''}
      </div>`;
    }
    const ordre = disp === 'mosaique' && c.ordre === 'colonnes' ? ' ordre-col' : '';
    const vm = [isNum(c.espacementM) ? `--gap-m:${+c.espacementM}px` : '', +c.hauteurRangM ? `--row-m:${+c.hauteurRangM}px` : '', +c.hauteurBandeM ? `--band-m:${+c.hauteurBandeM}px` : ''].filter(Boolean).join(';');
    const gr = c.format && c.format !== 'auto' ? c.format : null;
    const ratioOf = disp === 'grille' ? (c.ratio || '4/3') : ['rangees', 'pile', 'duo', 'bande', 'mosaique'].includes(disp) ? gr : null;
    const full = disp === 'rangees' && c.remplirDerniere ? ' r-full' : '';
    return `<div class="gal gal-${esc(disp)}${ordre}${full}" style="${vars}${vm ? ';' + vm : ''}">${imgs.map((it, i) => figure(it, P(i), { cols, colsM, ratio: ratioOf, rangees: disp === 'rangees', noRatio: disp === 'puzzle', hover: c.survol, eager: i < 2 })).join('')}</div>`;
  };
  BR.video = (b, p) => {
    const c = b.c, v = M.video(c.url);
    if (!v) return empty('+ Colle un lien YouTube ou Vimeo (réglages de l’élément)');
    let player;
    if (v.type === 'file') player = `<video src="${esc(v.src)}" controls playsinline preload="none"${c.poster ? ` poster="${esc(c.poster)}"` : ''}></video>`;
    else {
      const src = v.type === 'youtube' ? `https://www.youtube-nocookie.com/embed/${v.id}?rel=0&modestbranding=1&playsinline=1&autoplay=1` : `https://player.vimeo.com/video/${v.id}?title=0&byline=0&portrait=0&dnt=1&autoplay=1`;
      const img = c.poster || (v.type === 'youtube' ? `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg` : '');
      player = `<button class="vfacade" type="button" data-embed="${esc(src)}" aria-label="Lire la vidéo">${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async"${v.type === 'youtube' && !c.poster ? ` data-yt="${v.id}"` : ''}>` : ''}<span class="vplay" aria-hidden="true"></span></button>`;
    }
    return `<div class="p-video" style="aspect-ratio:${esc(c.ratio || '16/9')}">${player}</div>${c.legende || (EDIT && c.legendeOn) ? txt('p', 'one-cap', c.legende, p + '.c.legende', 'Légende') : ''}`;
  };
  BR.spotify = b => {
    const c = b.c, list = arr(c.liens).map(M.spotify).filter(Boolean), hgt = c.taille === 'grand' ? 352 : 152;
    return list.length ? `<div class="spot" style="--cols:${Math.max(1, Math.min(3, +c.colonnes || 1))}">${list.map(s => `<iframe src="https://open.spotify.com/embed/${s.type}/${s.id}?utm_source=generator&amp;theme=0" height="${hgt}" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" title="Lecteur Spotify"></iframe>`).join('')}</div>`
      : empty('+ Colle un lien Spotify (réglages de l’élément)');
  };
  BR.fichiers = b => {
    const f = arr(b.c.fichiers).filter(x => x && x.src);
    return f.length ? `<div class="dls">${f.map(x => `<a class="dl" href="${esc(x.src)}" download target="_blank" rel="noopener"><span class="dl-ext">${esc(M.ext(x.src).toUpperCase().slice(0, 4) || 'FICHIER')}</span><span class="dl-name">${esc(x.nom || x.src.split('/').pop())}</span><span class="dl-ico" aria-hidden="true">↓</span></a>`).join('')}</div>`
      : empty('+ Ajoute des fichiers (réglages de l’élément)');
  };
  BR.reseaux = (b, p, sec, d) => socialList(d, b.c.style, +b.c.taille || 22) || empty('+ Ajoute tes réseaux : Réglages du site → Réseaux sociaux', 'site-reseaux');
  BR.coordonnees = b => {
    const c = b.c;
    if (!c.email && !c.telephone && !c.lieu) return empty('+ Ajoute ton e-mail, téléphone, ville (réglages de l’élément)');
    return `${c.email ? `<a class="big-link" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}
      ${c.telephone ? `<a class="contact-line" href="tel:${esc(String(c.telephone).replace(/[^\d+]/g, ''))}">${esc(c.telephone)}</a>` : ''}
      ${c.lieu ? `<p class="contact-line muted">${esc(c.lieu)}</p>` : ''}`;
  };
  BR.formulaire = (b, p, sec) => {
    const c = b.c;
    const mail = c.email || (arr(sec.blocs).find(x => x.k === 'coordonnees' && x.c.email) || { c: {} }).c.email || '';
    return `<form class="form" data-formspree="${esc(c.formspree || '')}" data-email="${esc(mail)}" novalidate>
      <label><span>Nom</span><input name="nom" autocomplete="name" required></label>
      <label><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label>
      <label><span>Sujet</span><input name="sujet"></label>
      <label><span>Message</span><textarea name="message" rows="6" required></textarea></label>
      <button class="btn btn-contour" type="submit">Envoyer</button>
      <p class="form-msg" role="status"></p>
    </form>`;
  };
  BR.infos = (b, p) => `<dl class="p-details infos cols-${+b.c.colonnes === 2 ? 2 : 1}">${dlInfos(b.c.lignes, p + '.c.lignes')}</dl>${addItem(p + '.c.lignes', '+ Ajouter une ligne')}`;
  BR.credits = (b, p) => `<dl class="p-credits">${dlCredits(b.c.lignes, p + '.c.lignes')}</dl>${addItem(p + '.c.lignes', '+ Ajouter une personne')}`;
  BR.liste = (b, p) => {
    const c = b.c, items = arr(c.items);
    const anyLogo = EDIT || items.some(it => it.logo && it.logo.src);
    return `<div class="timeline logos-${esc(c.logos || 'nb')}${anyLogo ? ' has-logos' : ''}" style="--logo:${Math.max(24, Math.min(140, +c.tailleLogo || 56))}px">${items.map((it, i) => {
      const q = `${p}.c.items.${i}`, lg = it.logo && it.logo.src;
      const logo = !anyLogo ? '' : lg ? `<figure class="tl-logo"${EDIT ? ` data-img="${q}.logo"` : ''}><img src="${esc(lg)}" alt="${esc(it.sousTitre || it.titre || '')}" loading="lazy" decoding="async"></figure>`
        : EDIT ? `<figure class="tl-logo tl-logo-vide" data-img="${q}.logo"><span>+ Logo</span></figure>` : '<span class="tl-logo"></span>';
      const t = txt('h3', 'tl-ttl', it.titre, q + '.titre', 'Intitulé');
      return `<div class="tl"${IT(q)}><div class="tl-when"${ED(q + '.date', 'text', 'Date')}>${esc(it.date)}</div>${logo}<div class="tl-body">${it.lien && !EDIT ? `<a class="tl-link" href="${esc(it.lien)}" target="_blank" rel="noopener">${t}</a>` : t}${txt('p', 'tl-sub', it.sousTitre, q + '.sousTitre', 'École, structure, lieu…')}${rich('t-body', it.html, q + '.html', 'Description (optionnel)')}</div></div>`;
    }).join('')}</div>${addItem(p + '.c.items', '+ Ajouter une ligne')}`;
  };
  BR.espace = b => {
    const c = b.c;
    return `<div class="spacer" style="height:${Math.max(0, +c.hauteur || 0)}px">${c.ligne ? `<hr style="border-top:${+c.epaisseur || 1}px solid ${esc(c.couleurLigne || 'rgba(255,255,255,.15)')};width:${+c.largeurLigne || 100}%">` : ''}</div>`;
  };

  function card(p, i, c) {
    const k = p.carte || {};
    const anim = k.animation || c.animation || 'cinema';
    const img = k.vignette || '';
    const bg = img ? ` style="background-image:url('${esc(img)}')"` : '';
    const roles = arr(k.roles).filter(Boolean);
    const meta = [];
    const gs = M.projGenres(p);
    if (c.afficherGenre !== false && gs.length) meta.push(`<span class="card-genre">${gs.map(esc).join(' · ')}</span>`);
    if (c.afficherRoles !== false && roles.length) meta.push(`<span class="card-roles">${roles.map(esc).join(' - ')}</span>`);
    const entree = c.animEntree === undefined ? 'fade-up' : c.animEntree;
    const hv = k.animSurvol || c.animSurvol || '', ht = c.survolTexte || 'titre-cta';
    const hovHtml = !hv ? '' : `<span class="thumb-hov" style="--hv:${M.rgba('#000000', isNum(c.survolVoile) ? +c.survolVoile : 45)}"><span class="th-in" data-anim="${esc(hv)}" style="--ad:${+c.survolDuree || 0.6}s">${ht !== 'cta' ? `<span class="th-t">${esc(p.titre)}</span>` : ''}${ht === 'titre-roles' && roles.length ? `<span class="th-r">${roles.map(esc).join(' - ')}</span>` : ''}${ht === 'titre-genre' && gs.length ? `<span class="th-r">${gs.map(esc).join(' · ')}</span>` : ''}${ht === 'titre-cta' || ht === 'cta' ? '<span class="th-c">Voir le projet</span>' : ''}</span></span>`;
    const ent = entree ? ` anim" data-anim="${esc(entree)}" style="--ad:${+c.animDuree || 0.9}s;--adl:${((i % 6) * (+c.animEcart >= 0 ? +c.animEcart : 0.12)).toFixed(2)}s` : ` reveal" style="--d:${(i % 3) * 90}ms`;
    return `<a class="card anim-${esc(anim)}${hv ? ' has-hov' : ''}${ent}" data-genres="${esc(gs.join('|'))}" data-pid="${esc(p.id)}" href="${M.pageUrl(p)}">
      <div class="thumb">
        ${img ? `<img src="${esc(img)}" alt="${esc(p.titre)}" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async">` : '<div class="thumb-empty">Vignette à ajouter</div>'}
        ${anim === 'glitch' ? `<span class="fx fx-g fx-g1"${bg}></span><span class="fx fx-g fx-g2"${bg}></span>` : ''}
        <span class="fx fx-sweep"></span>
        <span class="thumb-cta">Voir le projet</span>${hovHtml}
      </div>
      <h3 class="card-title"><span>${esc(p.titre)}</span></h3>
      ${meta.length ? `<p class="card-meta">${meta.join('<span class="card-sep" aria-hidden="true">·</span>')}</p>` : ''}
    </a>`;
  }
  BR.projets = (b, p, sec, d) => {
    const c = b.c;
    const all = d.pages.filter(x => x.type === 'projet' && !x.masquer);
    const list = c.genre ? all.filter(x => M.projGenres(x).includes(c.genre)) : all;
    const used = M.genres(d, true), genres = M.genres(d, !EDIT);
    const filters = c.filtres !== false && !c.genre && (genres.length > 1 || EDIT)
      ? `<div class="filtres" role="tablist" aria-label="Filtrer par typologie"><button type="button" role="tab" class="on" aria-selected="true" data-g="">${esc(c.tousLabel || 'Tous')}</button>${genres.map(g => `<button type="button" role="tab" aria-selected="false" data-g="${esc(g)}"${EDIT && !used.includes(g) ? ' class="g-vide" title="Aucun projet publié dans cette typologie"' : ''}>${esc(g)}</button>`).join('')}${EDIT ? '<button type="button" class="ed-addg" data-act="genres" title="Ajouter, renommer, supprimer des typologies">+ Typologie</button>' : ''}</div>` : '';
    return `<div class="pj" data-projets data-ecart="${+c.animEcart >= 0 ? +c.animEcart : 0.12}">${filters}
      <div class="grid pgrid" style="--cols:${Math.max(1, Math.min(4, +c.colonnes || 2))};--cols-m:${Math.max(1, Math.min(2, +c.colonnesM || 1))};--ratio:${esc(c.ratio || '16/9')}">
        ${list.map((x, i) => card(x, i, c)).join('') || '<p class="empty">Aucun projet pour le moment.</p>'}
      </div></div>`;
  };

  function dlInfos(list, path) {
    return arr(list).map((x, i) => (!EDIT && !x.valeur) ? '' :
      `<div${IT(`${path}.${i}`)}><dt${ED(`${path}.${i}.label`, 'text', 'Intitulé')}>${esc(x.label)}</dt><dd${ED(`${path}.${i}.valeur`, 'text', 'Valeur')}>${esc(x.valeur)}</dd></div>`).join('');
  }
  function dlCredits(list, path) {
    return arr(list).map((x, i) => {
      if (!EDIT && !x.fonction && !x.noms) return '';
      const names = String(x.noms || '').split(/\s+-\s+|\n/).map(n => n.trim()).filter(Boolean);
      const long = String(x.noms || '').length > 38 || names.length > 2;
      const dd = EDIT ? esc(x.noms || '') : names.map(n => `<span>${esc(n)}</span>`).join('<i> - </i>');
      return `<div class="cr${long ? ' cr-long' : ''}"${IT(`${path}.${i}`)}><dt${ED(`${path}.${i}.fonction`, 'text', 'Fonction')}>${esc(x.fonction)}</dt><dd${ED(`${path}.${i}.noms`, 'text', 'Noms (séparés par « - »)')}>${dd}</dd></div>`;
    }).join('');
  }

  /* ---------- Style d'un élément ---------- */
  function blocParts(b, layout) {
    const s = b.s || {}, cls = ['bl', 'bl-' + b.k], st = [];
    const num = isNum;
    if (num(s.mt)) st.push(`--mt:${+s.mt}px`);
    if (num(s.mb)) st.push(`--mb:${+s.mb}px`);
    if (num(s.mtM)) st.push(`--mtm:${+s.mtM}px`);
    if (num(s.mbM)) st.push(`--mbm:${+s.mbM}px`);
    if (s.align) { st.push(`text-align:${s.align}`); cls.push('al-' + s.align); }
    if (s.alignM) cls.push('alm-' + s.alignM);
    if (+s.largeur > 0 && +s.largeur < 100) { st.push(`--bw:${+s.largeur}%`); cls.push('bl-w'); }
    if (+s.largeurM > 0) { st.push(`--bwm:${+s.largeurM}%`); cls.push('bl-wm'); }
    if (+s.largeurMax) { st.push(`--bmw:${+s.largeurMax}px`); cls.push('bl-mw'); }
    if (+s.largeurMaxM) { st.push(`--bmwm:${+s.largeurMaxM}px`); cls.push('bl-mwm'); }
    if (s.pleine) cls.push('bl-full');
    if (s.fond) st.push(`background-color:${s.fond}`);
    if (s.degrade && s.degrade.actif) st.push(`background-image:linear-gradient(${+s.degrade.angle || 180}deg,${s.degrade.c1 || '#000'},${s.degrade.c2 || '#222'})`);
    if (num(s.padding)) { st.push(`--bp:${+s.padding}px`); cls.push('bl-p'); }
    if (num(s.paddingM)) { st.push(`--bpm:${+s.paddingM}px`); cls.push('bl-pm'); }
    const bo = s.bordure || {};
    if (+bo.largeur) st.push(`border:${+bo.largeur}px ${bo.style || 'solid'} ${bo.couleur || 'rgba(255,255,255,.2)'}`);
    if (+bo.rayon) st.push(`border-radius:${+bo.rayon}px`);
    if (s.ombre && M.BOX_SHADOWS[s.ombre]) st.push(`box-shadow:${M.BOX_SHADOWS[s.ombre]}`);
    if (s.couleur) st.push(`--s-c:${s.couleur};color:${s.couleur}`);
    if (+s.decalX || +s.decalY) { st.push(`--dx:${+s.decalX || 0}px;--dy:${+s.decalY || 0}px`); cls.push('has-dec'); }
    if (num(s.decalXM) || num(s.decalYM)) { st.push(`--dxm:${+s.decalXM || 0}px;--dym:${+s.decalYM || 0}px`); cls.push('has-decm'); }
    if (num(s.calque) && +s.calque) st.push(`position:relative;z-index:${+s.calque}`);
    if (s.masquerMobile) cls.push('hide-m');
    if (s.masquerOrdi) cls.push('hide-d');
    if (s.encadre) cls.push('box-accent');
    const t = b.t || {};
    st.push(...typo(t, 't'), ...typo(t, 'tt'));
    if (t.degrade && t.degrade.actif) cls.push('has-t-g', 'has-tt-g');
    if (t.fond) cls.push(b.k === 'titre' ? 'has-tt-bg' : 'has-t-bg');
    if (s.lien && s.lien.couleur) st.push(`--lk-c:${s.lien.couleur}`);
    if (s.lien && s.lien.survol) cls.push('lk-' + s.lien.survol);
    let anim = '';
    if (b.a && b.a.type) { cls.push('anim'); anim = ` data-anim="${esc(b.a.type)}"`; st.push(`--ad:${+b.a.duree || 0.9}s`, `--adl:${+b.a.delai || 0}s`); }
    if (layout === 'libre') {
      const ps = b.pos || {}, pm = b.posM || {};
      cls.push('fr-it');
      st.push(`--fx:${+ps.x || 0}%`, `--fy:${+ps.y || 0}%`, `--fw:${+ps.w || 30}%`, `--fz:${+ps.z || 1}`);
      if (num(pm.x)) st.push(`--fxm:${+pm.x}%`);
      if (num(pm.y)) st.push(`--fym:${+pm.y}%`);
      if (num(pm.w)) st.push(`--fwm:${+pm.w}%`);
    }
    return { cls: cls.join(' '), style: st.join(';'), anim };
  }
  function renderBloc(b, i, sec, d, page) {
    const fn = BR[b.k];
    if (!fn) return '';
    const inner = fn(b, 'blocs.' + i, sec, d, page);
    if (!inner && !EDIT) return '';
    const bp = blocParts(b, sec.layout);
    return `<div class="${bp.cls}"${EDIT ? ` data-bid="${esc(b.id)}"` : ''}${bp.anim} style="${bp.style}">${inner}</div>`;
  }
  const stackOf = (sec, d, page, idx) => idx.map(i => renderBloc(sec.blocs[i], i, sec, d, page)).join('');
  const allIdx = sec => sec.blocs.map((_, i) => i);
  const emptyHint = sec => EDIT && !sec.blocs.length ? '<div class="ed-empty" data-act="add-bloc">+ Ajouter un élément dans cette section</div>' : '';

  /* ---------- Mises en page des sections ---------- */
  const L = {};
  L.pile = (sec, d, page) => `<div class="stack${sec.s.encadre ? ' box-accent' : ''}">${stackOf(sec, d, page, allIdx(sec))}${emptyHint(sec)}</div>`;
  const mobCols = (sec, d) => sec.c.empileM === 'oui' ? 'm-empile' : sec.c.empileM === 'non' ? 'm-cote' : ((d.site.mobile || {}).colonnes === 'empile' ? 'm-empile' : 'm-cote');
  const propM = c => +c.proportionM ? `;--propm:${Math.min(80, Math.max(20, +c.proportionM))}%` : '';
  L.colonnes = (sec, d, page) => {
    const c = sec.c;
    return `<div class="cols ${mobCols(sec, d)}${c.imageCote === 'droite' ? ' img-droite' : ''}" style="--prop:${Math.min(75, Math.max(25, +c.proportion || 45))}%${propM(c)}">
      ${figure(M.img(c.img), 'c.img', { cls: 'cols-img', ratio: c.img && c.img.ratio, caption: false })}
      <div class="stack${sec.s.encadre ? ' box-accent' : ''}">${stackOf(sec, d, page, allIdx(sec))}${emptyHint(sec)}</div>
    </div>`;
  };
  L.deux = (sec, d, page) => {
    const segs = [];
    let cur = null;
    sec.blocs.forEach((b, i) => {
      if (b.col === 'plein') { segs.push({ full: true, items: [i] }); cur = null; return; }
      if (!cur) { cur = { full: false, g: [], d: [] }; segs.push(cur); }
      (b.col === 'd' ? cur.d : cur.g).push(i);
    });
    if (EDIT && !segs.some(s => !s.full)) segs.push({ full: false, g: [], d: [] });
    const col = (idx, side) => `<div class="stack deux-${side}"${EDIT ? ` data-dropcol="${side}"` : ''}>${stackOf(sec, d, page, idx)}${EDIT && !idx.length ? `<div class="ed-empty small" data-act="add-bloc" data-col="${side}">+ Ajouter un élément dans cette colonne</div>` : ''}</div>`;
    return `<div class="deux ${mobCols(sec, d)}" style="--prop:${Math.min(75, Math.max(25, +sec.c.proportion || 57))}%${propM(sec.c)}">${segs.map(s => s.full
      ? `<div class="stack deux-full">${stackOf(sec, d, page, s.items)}</div>`
      : `<div class="deux-row">${col(s.g, 'g')}${col(s.d, 'd')}</div>`).join('')}</div>`;
  };
  L.couverture = (sec, d, page) => {
    const c = sec.c, m = c.media || {}, ov = c.superposition || {}, pos = c.pos || { x: 50, y: 50 };
    const op = +ov.opacite || 0;
    const ovCss = ov.degrade ? `linear-gradient(180deg,${M.rgba(ov.couleur, op * 0.7)},${M.rgba(ov.couleur, op)} 55%,${M.rgba(ov.couleur, Math.min(100, op * 2.4))})` : M.rgba(ov.couleur, op);
    const vid = m.type === 'video' && m.video ? ` data-bgvideo="${esc(m.video)}"` : '';
    const intro = !EDIT && sec.blocs.some(b => b.k === 'titre' && b.c.lettres);
    const pm = c.posM || {}, cm = [];
    if (+c.hauteurM) cm.push(`--cov-hm:${Math.min(100, Math.max(20, +c.hauteurM))}`);
    if (isNum(pm.x)) cm.push(`--cxm:${+pm.x}%`);
    if (isNum(pm.y)) cm.push(`--cym:${+pm.y}%`);
    if (c.alignTexteM) cm.push(`--ctam:${c.alignTexteM}`);
    if (+c.largeurTexteM) cm.push(`--cwm:${+c.largeurTexteM}px`);
    return `<div class="cov" style="--cov-h:${Math.min(100, Math.max(25, +c.hauteur || 70))}${cm.length ? ';' + cm.join(';') : ''}">
      <div class="cov-media"${vid}${EDIT ? ' data-img="c.media"' : ''}>${m.src ? `<img src="${esc(m.src)}" alt="" fetchpriority="high" decoding="async" style="object-position:${m.posX ?? 50}% ${m.posY ?? 50}%">` : (EDIT ? '<div class="gi-empty">Clique pour choisir l’image de couverture</div>' : '')}
        ${EDIT && vid ? '<span class="ed-badge">Vidéo d’arrière-plan : visible sur le site</span>' : ''}</div>
      <div class="cov-ov" style="background:${ovCss}"></div>
      <div class="cov-box${intro ? ' cov-intro' : ''} cta-${esc(c.alignTexte || 'center')}${c.alignTexteM ? ' ctam-' + esc(c.alignTexteM) : ''}" style="--cx:${+pos.x}%;--cy:${+pos.y}%;--cw:${+c.largeurTexte || 680}px"${EDIT ? ' data-drag="cov"' : ''}>
        <div class="stack">${stackOf(sec, d, page, allIdx(sec))}${emptyHint(sec)}</div>
      </div>
      ${!EDIT ? '<a href="#main-2" class="cov-scroll" aria-label="Descendre"><span></span></a>' : ''}
    </div>`;
  };
  L.libre = (sec, d, page) => {
    const order = allIdx(sec).sort((a, b) => (+(sec.blocs[a].pos || {}).y || 0) - (+(sec.blocs[b].pos || {}).y || 0));
    return `<div class="libre ${sec.c.mobile === 'compo' ? 'm-compo' : 'm-empile'}" style="--lh:${Math.max(200, +sec.c.hauteur || 560)}px${+sec.c.hauteurM ? `;--lhm:${Math.max(150, +sec.c.hauteurM)}px` : ''}">${stackOf(sec, d, page, order)}${emptyHint(sec)}</div>`;
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
    return `<footer class="ftr"${EDIT ? ' data-zone="pied"' : ''}>
      ${f.reseaux !== false ? socialList(d, f.reseauxStyle || 'icones', 18, 'ftr-soc') : ''}
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
      <a class="p-nav-back" href="${M.pageUrl(home)}"><span aria-hidden="true">←</span> Retour à l’accueil</a>
      ${next && next !== page ? `<a class="p-nav-next" href="${M.pageUrl(next)}">${k.vignette ? `<img src="${esc(k.vignette)}" alt="" loading="lazy">` : ''}<span class="p-nav-label">Projet suivant</span><strong>${esc(next.titre)} <span aria-hidden="true">→</span></strong></a>` : ''}
    </nav>`;
  }
  function renderSection(sec, d, page) {
    const fn = L[sec.layout];
    if (!fn) return '';
    const p = sectionParts(sec);
    const a = sec.a || {};
    const stagger = a.type && a.cible === 'elements';
    let innerStyle = p.inner, innerAnim = '';
    if (a.type && !stagger) { innerAnim = ` data-anim="${esc(a.type)}"`; innerStyle += `;--ad:${+a.duree || 0.9}s;--adl:${+a.delai || 0}s`; }
    return `<section class="${p.cls} lay-${esc(sec.layout)}" id="${esc(sec.id)}"${EDIT ? ` data-sid="${esc(sec.id)}"` : ''} style="${p.style}">
      <div class="sec-in${a.type && !stagger ? ' anim' : ''}"${innerAnim}${stagger ? ` data-stagger="${esc(a.type)}" data-sd="${+a.duree || 0.9}" data-sdl="${+a.delai || 0}"` : ''} style="${innerStyle}">${fn(sec, d, page)}</div>
    </section>`;
  }
  function renderPage(d, page) {
    const secs = arr(page.sections);
    return (page.masquerMenu ? '' : header(d, page)) +
      `<main id="main" class="page-${esc(page.id)}">${secs.map(s => renderSection(s, d, page)).join('')}
      ${EDIT && !secs.length ? '<div class="ed-empty big" data-act="add-first">+ Ajouter une première section</div>' : ''}
      ${page.type === 'projet' && page.navigation !== false ? projectNav(d, page) : ''}<span id="main-2"></span></main>` +
      (page.masquerPied ? '' : footer(d));
  }
  function notFound(d) {
    return header(d, {}) + `<main id="main"><section class="sec w-normale"><div class="sec-in notfound"><h1 class="t-ttl ttl-page">Oups</h1><p>Cette page n’existe pas.</p><a class="btn btn-contour" href="index.html">Retour à l’accueil</a></div></section></main>` + footer(d);
  }

  /* ---------- Thème ---------- */
  function applyTheme(d) {
    const t = d.site.theme || {};
    const r = document.documentElement.style;
    r.setProperty('--bg', t.fond || '#000');
    r.setProperty('--fg', t.texte || '#f3f3f3');
    r.setProperty('--muted', t.texteDoux || '#9a9a9a');
    r.setProperty('--accent', t.accent || '#8a9bff');
    const mob = d.site.mobile || {};
    r.setProperty('--ms', Math.max(0.6, Math.min(1.2, (+mob.echelle || 90) / 100)));
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
      let kids = [...box.querySelectorAll('.bl')];
      if (!kids.length) kids = [...box.children];
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
      const small = document.documentElement.classList.contains('vm');
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
      const btns = $$('.filtres button[data-g]', sec);
      if (!btns.length) return;
      const apply = (g, animate) => {
        btns.forEach(b => { const on = b.dataset.g === g; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
        let vis = 0;
        const ecart = +sec.dataset.ecart || 0;
        $$('.card', sec).forEach(c => {
          const show = !g || (c.dataset.genres || '').split('|').includes(g);
          c.hidden = !show;
          if (show && animate && !reduceMotion) {
            c.classList.remove('in');
            c.style.setProperty('--d', (vis % 3) * 70 + 'ms');
            c.style.setProperty('--adl', ((vis % 6) * ecart).toFixed(2) + 's');
            requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('in')));
          }
          if (show) vis++;
        });
        if (!EDIT) history.replaceState(null, '', g ? '#genre-' + M.slugify(g) : location.pathname + location.search);
      };
      btns.forEach(b => b.addEventListener('click', () => apply(b.dataset.g, true)));
      const h = decodeURIComponent(location.hash || '');
      if (h.startsWith('#genre-')) { const b = btns.find(x => M.slugify(x.dataset.g) === h.slice(7)); if (b) apply(b.dataset.g, false); }
    });
  }
  // Mosaïque dans l'ordre des lignes (gauche → droite) et rangées qui remplissent toute la largeur
  function galleries() {
    $$('.gal-mosaique:not(.ordre-col)').forEach(g => {
      const gap = parseFloat(getComputedStyle(g).columnGap) || 0;
      const fit = f => { f.style.gridRowEnd = 'span ' + Math.max(1, Math.ceil((f.getBoundingClientRect().height + gap) / 2)); };
      $$(':scope > .gi', g).forEach(f => {
        fit(f);
        const img = f.querySelector('img');
        if (img && !img.complete) img.addEventListener('load', () => fit(f), { once: true });
      });
    });
    $$('.gal-rangees .gi.r-auto').forEach(f => {
      const img = f.querySelector('img');
      if (!img) return;
      const set = () => { if (img.naturalWidth && img.naturalHeight) f.style.setProperty('--r', (img.naturalWidth / img.naturalHeight).toFixed(4)); };
      img.complete ? set() : img.addEventListener('load', set, { once: true });
    });
  }
  let galTimer;
  addEventListener('resize', () => { clearTimeout(galTimer); galTimer = setTimeout(galleries, 150); });
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
    animations(); touchHover(); sliders(); videos(); filters(); forms(); galleries(); globalBehaviours();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(galleries);
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
  window.SITE = { render, isEdit: EDIT, fit: () => { fit(); galleries(); } };

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
