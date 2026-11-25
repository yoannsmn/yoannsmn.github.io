/* ==========================================================================
   Éditeur visuel (v3) : sections composées d'éléments.
   Survol → cadres et barres d'outils · clic sur un texte → écriture directe
   ========================================================================== */
(() => {
  'use strict';
  const M = window.Modele, ED = window.ED, h = ED.h, $ = ED.$, $$ = ED.$$;
  const st = { pageId: null, sel: null, tab: 'contenu', device: 'desktop', editing: null, clip: null, synced: false };
  let win = null, fdoc = null, hist = [], hpos = -1, histTimer, draftTimer, editTimer, panelTimer;
  window.Editeur = { data: null, frameReady, get device() { return st.device; } };

  /* ==========================================================================
     Données, historique, rendu
     ========================================================================== */
  const page = () => ED.data.pages.find(p => p.id === st.pageId) || ED.data.pages.find(p => p.accueil) || ED.data.pages[0];
  const secById = id => {
    for (const p of ED.data.pages) { const i = M.arr(p.sections).findIndex(x => x.id === id); if (i > -1) return { page: p, sec: p.sections[i], list: p.sections, index: i }; }
    return null;
  };
  const blocById = id => {
    for (const p of ED.data.pages) for (const s of M.arr(p.sections)) {
      const i = M.arr(s.blocs).findIndex(b => b.id === id);
      if (i > -1) return { page: p, sec: s, bloc: s.blocs[i], index: i, path: 'blocs.' + i };
    }
    return null;
  };
  const blocName = b => (M.BLOCS[b.k] || {}).nom || 'Élément';
  function setData(d) { ED.data = M.normalize(d); window.Editeur.data = ED.data; }
  function changed(o = {}) {
    ED.dirty = true;
    if (o.render !== false) scheduleRender();
    clearTimeout(histTimer); histTimer = setTimeout(pushHistory, 350);
    clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 500);
    updateState();
  }
  let raf;
  function scheduleRender() { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderFrame); }
  function renderFrame() {
    cancelAnimationFrame(raf);
    if (!win || !win.SITE) return;
    const y = win.scrollY;
    const sid = ov.hSec && ov.hSec.dataset.sid, bid = ov.hBloc && ov.hBloc.dataset.bid;
    win.SITE.render(ED.data, st.pageId);
    fixImages();
    win.scrollTo(0, y);
    // Garde les barres d'outils sur l'élément survolé, même après un changement
    ov.hSec = sid ? fdoc.querySelector(`[data-sid="${sid}"]`) : null;
    ov.hBloc = bid ? fdoc.querySelector(`[data-bid="${bid}"]`) : null;
    ov.hEl = null;
    const under = st.mx != null ? fdoc.elementFromPoint(st.mx, st.my) : null;
    if (under && !under.closest('#edo') && !ov.dragging) ov.track(under); else ov.draw();
  }
  // Les photos qui viennent d'être envoyées ne sont pas encore en ligne : on les affiche depuis la mémoire
  function fixImages() {
    if (!fdoc) return;
    $$('img', fdoc).forEach(img => {
      const p = img.getAttribute('src');
      if (!p || /^(https?:|blob:|data:)/.test(p)) return;
      if (ED.blobs.has(p)) { img.src = ED.blobs.get(p); return; }
      if (!ED.gh) return;
      const fb = () => { img.onerror = null; img.src = ED.rawUrl(p); };
      if (img.complete && !img.naturalWidth && img.currentSrc) fb(); else img.onerror = fb;
    });
    $$('[style*="url("]', fdoc).forEach(el => {
      const css = el.getAttribute('style');
      const out = css.replace(/url\((['"]?)([^'")]+)\1\)/g, (m, q, p) => ED.blobs.has(p) ? `url("${ED.blobs.get(p)}")` : m);
      if (out !== css) el.setAttribute('style', out);
    });
  }
  function pushHistory() {
    const j = JSON.stringify(ED.data);
    if (hist[hpos] === j) return;
    hist = hist.slice(0, hpos + 1); hist.push(j);
    if (hist.length > 80) hist.shift();
    hpos = hist.length - 1;
    updateState();
  }
  function restore() {
    setData(JSON.parse(hist[hpos]));
    ED.dirty = true;
    if (!ED.data.pages.some(p => p.id === st.pageId)) return loadPage(page().id);
    renderFrame();
    if (st.sel && !selTarget()) closePanel(); else buildPanel();
    fillPageSelect(); saveDraft(); updateState();
  }
  function undo() { flushEdit(); clearTimeout(histTimer); pushHistory(); if (hpos > 0) { hpos--; restore(); } }
  function redo() { if (hpos < hist.length - 1) { hpos++; restore(); } }
  function saveDraft() {
    if (st.draftPending) return; // tant que tu n'as pas choisi quoi faire de tes anciennes modifications, on n'y touche pas
    ED.ls.set(ED.KEYS.DRAFT, JSON.stringify({ savedAt: Date.now(), baseSha: ED.baseSha, data: ED.data }));
  }
  function updateState() {
    const pub = $('#btn-publish');
    if (!pub) return;
    pub.textContent = ED.gh ? (ED.dirty ? 'Publier •' : 'Publier') : 'Télécharger';
    pub.disabled = ED.uploading > 0;
    pub.classList.toggle('has-changes', !!ED.dirty);
    $('#btn-undo').disabled = hpos <= 0;
    $('#btn-redo').disabled = hpos >= hist.length - 1;
    const s = $('#status');
    s.textContent = ED.uploading ? 'Envoi en cours…' : ED.dirty ? 'Non publié' : 'À jour';
    s.className = 'status ' + (ED.uploading ? 'busy' : ED.dirty ? 'warn' : 'ok');
  }
  ED.onState = updateState;

  /* ---------- Bibliothèque : tout fichier envoyé y est rangé ---------- */
  const isImg = p => /\.(jpe?g|png|webp|gif|svg|avif)$/i.test(p);
  function addToLib(src, nom, raw) {
    const list = raw ? ED.data.documents : ED.data.bibliotheque;
    if (list.some(x => x.src === src)) return false;
    const parts = src.split('/'), dossier = parts.length > 2 && !['bibliotheque', 'documents', 'images'].includes(parts[parts.length - 2]) ? parts[parts.length - 2] + ' · ' : '';
    list.unshift({ src, nom: nom ? nom.replace(/\.[^.]+$/, '') : dossier + parts[parts.length - 1].replace(/\.[^.]+$/, '') });
    return true;
  }
  ED.onUploaded = (path, nom, raw) => { if (ED.data) { addToLib(path, nom, raw); changed({ render: false }); } };
  async function syncRepo() {
    if (st.synced || !ED.gh) return;
    st.synced = true;
    try {
      let n = 0;
      (await ED.ghTree()).forEach(e => {
        if (e.type !== 'blob') return;
        if (/^images\//.test(e.path) && isImg(e.path) && addToLib(e.path)) n++;
        if (/^documents\//.test(e.path) && addToLib(e.path, null, true)) n++;
      });
      if (n) changed({ render: false });
    } catch (e) { st.synced = false; }
  }
  function usedPaths() {
    const set = new Set();
    const walk = o => { if (!o || typeof o !== 'object') return; Object.values(o).forEach(v => { if (typeof v === 'string') set.add(v); else walk(v); }); };
    walk(ED.data.pages); walk(ED.data.site);
    return set;
  }

  /* ==========================================================================
     Cadre (le vrai site, en mode édition)
     ========================================================================== */
  function loadPage(id) {
    flushEdit();
    st.pageId = id; st.sel = null; closePanel();
    win = null; fdoc = null;
    const sel = $('#pageSel'); if (sel) sel.value = id;
    $('#frame').src = `index.html?p=${encodeURIComponent(id)}&edit=1`;
    const a = $('#btn-live'); if (a) a.href = M.pageUrl(page());
  }
  function frameReady(w) {
    win = w; fdoc = w.document;
    const l = fdoc.createElement('link');
    l.rel = 'stylesheet'; l.href = 'assets/css/edit.css?v=4';
    fdoc.head.appendChild(l);
    fixImages();
    ov.install();
    bindFrame();
  }

  /* ---------- Superposition d'édition ---------- */
  const RT = [['bold', '<b>B</b>', 'Gras'], ['italic', '<i>I</i>', 'Italique'], ['underline', '<u>U</u>', 'Souligné'], ['strikeThrough', '<s>S</s>', 'Barré'],
    ['h2', 'T1', 'Titre'], ['h3', 'T2', 'Sous-titre'], ['p', '¶', 'Paragraphe'], ['insertUnorderedList', '• Liste', 'Liste à puces'], ['insertOrderedList', '1. Liste', 'Liste numérotée'],
    ['link', '🔗 Lien', 'Lien vers un site ou une page'], ['doc', '📎 Document', 'Lien vers un document (CV, PDF…)'], ['unlink', '⛓︎', 'Retirer le lien'], ['removeFormat', '⌫', 'Effacer la mise en forme']];
  const MOB = () => st.device === 'mobile';
  const isFree = sec => sec && sec.layout === 'libre' && !(MOB() && sec.c.mobile !== 'compo');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isNumv = v => v !== undefined && v !== null && v !== '' && !isNaN(+v);
  const HANDLES = [['bw', '↔', 'Tirer pour changer la largeur de l’élément'], ['iw', '⇲', 'Tirer pour agrandir ou réduire l’image'], ['ih', '↕', 'Tirer pour changer la hauteur de l’image (recadrage)'],
    ['gh', '↕', 'Tirer pour changer la hauteur des images'], ['pt', '⇕', 'Tirer pour l’espace au-dessus de la section'], ['pb', '⇕', 'Tirer pour l’espace en dessous de la section'],
    ['sw', '↔', 'Tirer pour la largeur du contenu de la section'], ['col', '⇔', 'Tirer pour la largeur des colonnes'], ['ch', '↕', 'Tirer pour la hauteur de la couverture']];
  const ov = {
    root: null, hSec: null, hBloc: null, hEl: null, hIt: null, moveKind: null, dragging: false, H: {},
    install() {
      const root = fdoc.createElement('div');
      root.id = 'edo';
      root.innerHTML = `
        <div class="edo-hbox"></div><div class="edo-sbox"></div><div class="edo-bbox"></div><div class="edo-bsel"></div><div class="edo-elbox"></div><div class="edo-itbox"></div>
        <div class="edo-bar"><span class="edo-name"></span>
          <button data-a="s-edit" title="Mise en page et liste des éléments">✎<span class="lbl"> Section</span></button>
          <button data-a="s-style" title="Style de la section : fond, marges, bordure…"><span class="lbl">Style</span><span class="ico">◐</span></button>
          <button data-a="s-drag" class="edo-grab" title="Glisser pour déplacer la section">⠿</button>
          <button data-a="s-up" title="Monter la section">↑</button><button data-a="s-down" title="Descendre la section">↓</button>
          <button data-a="s-dup" title="Dupliquer la section">⧉</button><button data-a="s-del" class="danger" title="Supprimer la section">🗑</button></div>
        <div class="edo-bbar"><span class="edo-bname" title="Attrape ici pour déplacer l’élément"></span>
          <button data-a="b-edit" title="Réglages de cet élément">✎</button>
          <button data-a="b-up" title="Monter">↑</button><button data-a="b-down" title="Descendre">↓</button>
          <button data-a="b-front" class="only-free" title="Premier plan">⬆</button><button data-a="b-back" class="only-free" title="Arrière-plan">⬇</button>
          <button data-a="b-dup" title="Dupliquer">⧉</button><button data-a="b-del" class="danger" title="Supprimer l’élément">🗑</button></div>
        <div class="edo-grip" title="Attrape et glisse pour déplacer l’élément (même vers une autre section ou colonne)">⠿</div>
        <div class="edo-itbar"><button data-a="it-drag" class="edo-grab" title="Glisser pour déplacer">⠿</button><button data-a="it-up" title="Avant">↑</button><button data-a="it-down" title="Après">↓</button><button data-a="it-dup" title="Dupliquer">⧉</button><button data-a="it-del" class="danger" title="Supprimer">🗑</button></div>
        <button class="edo-badd" data-a="b-add" title="Ajouter un élément ici">+</button>
        <button class="edo-add edo-add-top" data-a="s-add-before">+ Section</button>
        <button class="edo-add edo-add-bot" data-a="s-add-after">+ Section</button>
        <button class="edo-pen" title="Écrire">✎</button>
        <div class="edo-img"><button data-a="img-replace">Remplacer</button><button data-a="img-crop">Rogner</button><button data-a="img-cap" title="Ajouter ou retirer la légende">Légende</button><button data-a="img-settings">✎</button><button data-a="img-drag" class="edo-grab" title="Glisser pour réorganiser">⠿</button><button data-a="img-del" class="danger" title="Retirer l’image">✕</button></div>
        <div class="edo-rs" title="Tirer pour agrandir ou réduire">⇲</div>
        <div class="edo-move" title="Glisser pour déplacer">✥</div>
        <div class="edo-rsw" title="Tirer pour changer la largeur">⇲</div>
        ${HANDLES.map(([k, i, t]) => `<div class="edo-h edo-h-${k}" data-h="${k}" title="${t}">${i}</div>`).join('')}
        <div class="edo-drop"></div><div class="edo-ghost"></div><div class="edo-tip"></div>
        <div class="edo-rt">${RT.map(([c, l, t]) => `<button data-cmd="${c}" title="${t}">${l}</button>`).join('')}<label class="edo-color" title="Couleur du texte sélectionné">A<input type="color" value="#8a9bff"></label></div>`;
      fdoc.body.appendChild(root);
      this.root = root;
      ['hbox', 'sbox', 'bbox', 'bsel', 'elbox', 'itbox', 'bar', 'bbar', 'grip', 'itbar', 'badd', 'pen', 'img', 'rs', 'move', 'rsw', 'drop', 'ghost', 'tip', 'rt'].forEach(k => { this[k] = root.querySelector('.edo-' + k); });
      root.querySelectorAll('.edo-h').forEach(x => { this.H[x.dataset.h] = x; });
      this.addT = root.querySelector('.edo-add-top'); this.addB = root.querySelector('.edo-add-bot');
      this.name = root.querySelector('.edo-name'); this.bname = root.querySelector('.edo-bname');
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-a]');
        if (b) { e.preventDefault(); e.stopPropagation(); barAction(b.dataset.a); }
      });
      root.addEventListener('pointerdown', e => {
        const b = e.target.closest('[data-a="s-drag"],[data-a="img-drag"],[data-a="it-drag"]');
        if (b) { e.preventDefault(); ({ 's-drag': dragSection, 'img-drag': dragImage, 'it-drag': dragItem })[b.dataset.a](e); return; }
        if (e.target.closest('.edo-grip, .edo-bname')) { e.preventDefault(); dragBloc(e); return; }
        const hd = e.target.closest('.edo-h');
        if (hd) { e.preventDefault(); resizeHandle(hd.dataset.h, e); return; }
        if (e.target.closest('.edo-rs')) { e.preventDefault(); resizeImage(e); }
        if (e.target.closest('.edo-move')) { e.preventDefault(); this.moveKind === 'cov' ? moveCover(e) : moveFree(e); }
        if (e.target.closest('.edo-rsw')) { e.preventDefault(); resizeFree(e); }
      });
      this.pen.addEventListener('click', e => { e.preventDefault(); const el = this.hEl; if (el && el.matches('[data-e]')) { startEdit(el); placeCaretEnd(el); } });
      let savedRange = null;
      const saveSel = () => { const s = win.getSelection(); if (s.rangeCount) savedRange = s.getRangeAt(0).cloneRange(); };
      const restoreSel = () => { if (!savedRange || !st.editing) return; st.editing.el.focus(); const s = win.getSelection(); s.removeAllRanges(); s.addRange(savedRange); };
      this.rt.addEventListener('mousedown', e => {
        saveSel();
        const b = e.target.closest('[data-cmd]');
        if (!b) return;
        e.preventDefault();
        const c = b.dataset.cmd;
        if (c === 'link') {
          const url = win.prompt('Adresse du lien :\n• un site : https://…\n• un e-mail : mailto:ton@email.com\n• une page du site : index.html?p=contact', 'https://');
          if (url && url !== 'https://') fdoc.execCommand('createLink', false, url.trim());
        } else if (c === 'doc') {
          openLibrary({ tab: 'documents', pick: true, onPick: src => {
            restoreSel();
            fdoc.execCommand('createLink', false, src);
            const s = win.getSelection();
            const a = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('a');
            if (a) { a.setAttribute('target', '_blank'); a.setAttribute('download', ''); }
            onEditInput();
          } });
          return;
        } else if (['h2', 'h3', 'p'].includes(c)) fdoc.execCommand('formatBlock', false, c);
        else fdoc.execCommand(c, false, null);
        onEditInput();
      });
      const color = this.rt.querySelector('input[type=color]');
      color.addEventListener('input', () => { restoreSel(); fdoc.execCommand('foreColor', false, color.value); onEditInput(); });
      win.addEventListener('scroll', () => this.draw(), { passive: true });
      win.addEventListener('resize', () => this.draw());
    },
    show(el, on) { if (el) el.classList.toggle('on', !!on); },
    box(el, r, pad = 0) {
      Object.assign(el.style, { left: r.left + win.scrollX - pad + 'px', top: r.top + win.scrollY - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    },
    at(el, x, y) { el.style.left = x + win.scrollX + 'px'; el.style.top = y + win.scrollY + 'px'; },
    track(t) {
      if (!t || !t.closest || this.dragging || t.closest('#edo')) return;
      this.hSec = t.closest('[data-sid]');
      this.hBloc = t.closest('[data-bid]');
      this.hEl = t.closest('[data-e]') || t.closest('[data-img]');
      this.hIt = t.closest('[data-it]');
      this.draw();
    },
    draw() {
      if (!this.root || !win) return;
      const vw = win.innerWidth, vh = win.innerHeight, drag = this.dragging;
      const sel = st.sel;
      const selSec = sel ? fdoc.querySelector(`[data-sid="${sel.sid}"]`) : null;
      const selBloc = sel && sel.bid ? fdoc.querySelector(`[data-bid="${sel.bid}"]`) : null;
      const sec = drag ? null : (this.hSec && this.hSec.isConnected ? this.hSec : selSec);
      this.show(this.hbox, sec && sec !== selSec); if (sec && sec !== selSec) this.box(this.hbox, sec.getBoundingClientRect());
      this.show(this.sbox, selSec && !selBloc); if (selSec && !selBloc) this.box(this.sbox, selSec.getBoundingClientRect());
      this.show(this.bsel, selBloc); if (selBloc) this.box(this.bsel, selBloc.getBoundingClientRect(), 4);
      this.show(this.bar, sec); this.show(this.addT, sec); this.show(this.addB, sec);
      if (sec) {
        const r = sec.getBoundingClientRect(), info = secById(sec.dataset.sid);
        this.name.textContent = info ? M.nomSection(info.sec) : '';
        this.bar.classList.toggle('compact', vw < 640);
        const bw = this.bar.offsetWidth || 420;
        this.at(this.bar, Math.max(6, Math.min(r.right - bw - 8, vw - bw - 8)), Math.max(r.top + 8, 8));
        this.at(this.addT, r.left + r.width / 2, r.top);
        this.at(this.addB, r.left + r.width / 2, r.bottom);
      }
      // Élément (bloc) survolé
      const bl = drag ? null : (this.hBloc && this.hBloc.isConnected ? this.hBloc : selBloc);
      const info = bl && blocById(bl.dataset.bid);
      const free = info && isFree(info.sec);
      this.show(this.bbox, bl && bl !== selBloc); if (bl && bl !== selBloc) this.box(this.bbox, bl.getBoundingClientRect(), 4);
      this.show(this.bbar, bl); this.show(this.badd, bl && !free);
      this.bname.classList.toggle('edo-grab', !free);
      if (bl && info) {
        const r = bl.getBoundingClientRect();
        this.bname.textContent = (free ? '' : '⠿ ') + blocName(info.bloc);
        $$('.only-free', this.bbar).forEach(b => { b.style.display = free ? '' : 'none'; });
        let bx = Math.max(4, Math.min(r.left - 4, vw - (this.bbar.offsetWidth || 260) - 4)), by = Math.max(r.top - 34, 4);
        if (sec) { // évite de recouvrir la barre de la section
          const sb = this.bar.getBoundingClientRect(), bw2 = this.bbar.offsetWidth || 260;
          if (by < sb.bottom + 2 && by + 30 > sb.top && bx < sb.right && bx + bw2 > sb.left) by = sb.bottom + 4;
        }
        this.at(this.bbar, bx, by);
        this.at(this.badd, r.left + r.width / 2, r.bottom + 4);
      }
      // Ligne, pastille, bouton d'une liste
      const it = drag ? null : (this.hIt && this.hIt.isConnected ? this.hIt : null);
      this.show(this.itbar, it); this.show(this.itbox, it);
      if (it) {
        const r = it.getBoundingClientRect(), w = this.itbar.offsetWidth || 140;
        this.box(this.itbox, r, 3);
        let ix = clamp(r.right - w + 3, 2, vw - w - 2), iy = Math.max(r.top - 29, 2);
        const bb = bl ? this.bbar.getBoundingClientRect() : null;
        if (bb && iy < bb.bottom + 2 && iy + 26 > bb.top && ix < bb.right + 2 && ix + w > bb.left) { iy = r.bottom + 5; ix = clamp(r.left, 2, vw - w - 2); }
        this.at(this.itbar, ix, iy);
      }
      // Texte ou image survolé
      const el = drag ? null : this.hEl;
      const isI = el && el.matches('[data-img]'), isT = el && el.matches('[data-e]');
      const editingEl = st.editing && st.editing.el === el;
      this.show(this.elbox, el && !editingEl && !it); if (el) this.box(this.elbox, el.getBoundingClientRect(), 2);
      this.show(this.pen, isT && !editingEl);
      if (isT) { const r = el.getBoundingClientRect(); this.at(this.pen, Math.min(r.right + 2, vw - 18), r.top - 2); }
      this.show(this.img, isI && !free);
      let rsOn = false;
      if (isI && !free) {
        const r = el.getBoundingClientRect(), path = el.dataset.img, inArr = /images\.\d+$/.test(path);
        this.img.querySelector('[data-a="img-drag"]').style.display = inArr ? '' : 'none';
        this.img.querySelector('[data-a="img-cap"]').style.display = /^blocs\.\d+\.c\.(img|images\.\d+)$/.test(path) ? '' : 'none';
        this.at(this.img, Math.max(8, r.right - 8), Math.max(r.top + 8, 40));
        if (inArr && el.closest('.gal-puzzle, .gal-grille')) { rsOn = true; this.at(this.rs, r.right - 34, r.bottom - 34); }
      }
      this.show(this.rs, rsOn);
      // Poignées : composition libre ou texte de couverture
      let moveOn = false, wOn = false;
      if (free && bl && !drag) {
        const r = bl.getBoundingClientRect();
        moveOn = wOn = true; this.moveKind = 'free';
        this.at(this.move, Math.max(2, r.left - 34), r.top + 4); this.at(this.rsw, Math.min(r.right - 30, vw - 34), Math.min(r.bottom - 30, vh - 34));
      } else if (sec && !drag) {
        const cov = sec.querySelector('[data-drag="cov"]');
        if (cov) { const r = cov.getBoundingClientRect(); moveOn = true; this.moveKind = 'cov'; this.at(this.move, Math.max(2, r.left - 38), r.top - 4); }
      }
      this.show(this.move, moveOn); this.show(this.rsw, wOn);
      // Poignée ⠿ à gauche de l'élément + poignées de taille
      const H = this.H, put = (k, x, y) => { this.show(H[k], true); this.at(H[k], clamp(x, 2, vw - 24), clamp(y, 2, Math.max(2, vh - 24))); };
      Object.values(H).forEach(x => this.show(x, false));
      this.show(this.grip, false);
      if (!drag && bl && info && !free) {
        const r = bl.getBoundingClientRect();
        this.show(this.grip, true); this.at(this.grip, Math.max(2, r.left - 28), r.top + Math.min(r.height / 2, 26) - 13);
        const k = info.bloc.k;
        if (k === 'image') {
          const m = bl.querySelector('.img-box .gi-media');
          if (m) { const ir = m.getBoundingClientRect(); put('iw', ir.right - 26, ir.bottom - 26); put('ih', ir.left + ir.width / 2 - 11, ir.bottom - 12); }
        } else {
          put('bw', r.right - 11, (Math.max(r.top, 0) + Math.min(r.bottom, vh)) / 2 - 11);
          if (k === 'galerie' && ['puzzle', 'rangees', 'bande'].includes(info.bloc.c.disposition)) put('gh', r.left + r.width / 2 - 11, r.bottom - 12);
        }
      }
      if (!drag && sec) {
        const r = sec.getBoundingClientRect();
        put('pt', r.left + r.width * 0.25, r.top + 4); put('pb', r.left + r.width * 0.25, r.bottom - 26);
        const lay = sec.querySelector(':scope > .sec-in > *');
        if (lay && !MOB() && !sec.classList.contains('w-pleine')) { const lr = lay.getBoundingClientRect(); if (lr.right < vw - 28) put('sw', lr.right + 10, Math.min(lr.bottom, vh) - 34); }
        const row = sec.querySelector('.deux-row'), cols = sec.querySelector('.cols');
        const pair = row ? [row.children[0], row.children[1]] : cols ? [cols.children[0], cols.children[1]] : null;
        if (pair && pair[0] && pair[1]) {
          const a = pair[0].getBoundingClientRect(), b = pair[1].getBoundingClientRect();
          if (b.left > a.right - 2) put('col', (a.right + b.left) / 2 - 11, Math.max(a.top, 40) + Math.min(a.height, 160) / 2 - 11);
        }
        const cov = sec.querySelector('.cov');
        if (cov) { const cr = cov.getBoundingClientRect(); put('ch', cr.left + cr.width * 0.72, cr.bottom - 26); }
      }
      const ed = st.editing;
      this.show(this.rt, ed && ed.kind === 'rich');
      if (ed && ed.kind === 'rich') { const r = ed.el.getBoundingClientRect(); this.at(this.rt, Math.max(6, Math.min(r.left, vw - (this.rt.offsetWidth || 600) - 6)), Math.max(r.top - 46, 4)); }
      // Une poignée ne doit jamais cacher un bouton d'une barre d'outils
      const bars = [this.bar, this.bbar, this.itbar, this.img, this.rt, this.badd, this.addT, this.addB].filter(x => x.classList.contains('on')).map(x => x.getBoundingClientRect());
      [...Object.values(H), this.grip].forEach(x => {
        if (!x.classList.contains('on')) return;
        const r = x.getBoundingClientRect();
        if (bars.some(b => r.left < b.right + 2 && r.right > b.left - 2 && r.top < b.bottom + 2 && r.bottom > b.top - 2)) this.show(x, false);
      });
    }
  };

  /* ---------- Événements dans le cadre ---------- */
  function bindFrame() {
    const d = fdoc;
    d.addEventListener('mousemove', e => { st.mx = e.clientX; st.my = e.clientY; ov.track(e.target); }, { passive: true });
    d.addEventListener('mouseleave', () => { st.mx = null; ov.hSec = ov.hBloc = ov.hEl = ov.hIt = null; ov.draw(); });
    d.addEventListener('mousedown', e => {
      const txt = e.target.closest('[data-e]');
      if (!txt || e.target.closest('#edo')) return;
      if (st.editing && st.editing.el === txt) return;
      startEdit(txt);
    }, true);
    d.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('#edo')) return;
      const act = t.closest('[data-act]');
      if (!act && t.closest('.filtres button, .sl-btn, .sl-dots button')) return;
      if (t.closest('a, button, form, label')) e.preventDefault();
      e.stopPropagation();
      ov.track(t);
      if (act) { doAct(act.dataset.act, act); return; }
      const zone = t.closest('[data-zone]');
      if (zone && !t.closest('[data-sid]')) { openSite(zone.dataset.zone === 'pied' ? 'pied' : 'menu'); return; }
      const sec = t.closest('[data-sid]');
      if (!sec) return;
      const img = t.closest('[data-img]'), bl = t.closest('[data-bid]'), txt = t.closest('[data-e]');
      if (img && !txt) { selectImg(img); return; }
      if (bl) { if (!st.sel || st.sel.bid !== bl.dataset.bid || st.sel.kind !== 'bloc') selectBloc(bl.dataset.bid, null, !!txt); return; }
      select(sec.dataset.sid);
    }, true);
    d.addEventListener('dblclick', e => {
      const img = e.target.closest('[data-img]');
      if (img && !e.target.closest('[data-e]')) { e.preventDefault(); replaceImage(img.closest('[data-sid]').dataset.sid, img.dataset.img); }
    }, true);
    d.addEventListener('submit', e => e.preventDefault(), true);
    d.addEventListener('keydown', keys);
    d.addEventListener('paste', e => {
      if (!st.editing) return;
      e.preventDefault();
      fdoc.execCommand('insertText', false, (e.clipboardData || win.clipboardData).getData('text/plain'));
    });
  }
  function keys(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); flushEdit(); ED.publish(); }
    else if (e.key === 'Escape' && !st.editing && !$('.modal-back')) closePanel();
  }

  /* ---------- Écriture directe ---------- */
  function startEdit(el) {
    flushEdit();
    const secEl = el.closest('[data-sid]');
    if (!secEl) return;
    const kind = el.dataset.k;
    if (kind === 'rich') el.contentEditable = 'true';
    else { try { el.contentEditable = 'plaintext-only'; } catch (e) { el.contentEditable = 'true'; } if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'; }
    if (kind === 'rich' && !el.innerHTML.trim()) el.innerHTML = '<p><br></p>';
    st.editing = { el, sid: secEl.dataset.sid, path: el.dataset.e, kind };
    el.classList.add('is-editing');
    el.addEventListener('input', onEditInput);
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onEditKey);
    ov.draw();
  }
  function placeCaretEnd(el) {
    el.focus();
    const r = fdoc.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = win.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function commitEdit() {
    const ed = st.editing;
    if (!ed) return;
    const r = secById(ed.sid);
    if (!r) return;
    const v = ed.kind === 'rich' ? M.sanitize(ed.el.innerHTML) : ed.el.innerText.replace(/\s*\n\s*/g, ' ').trim();
    if ((M.get(r.sec, ed.path) ?? '') !== v) { M.set(r.sec, ed.path, v); changed({ render: false }); }
  }
  function onEditInput() { clearTimeout(editTimer); editTimer = setTimeout(commitEdit, 250); ov.draw(); }
  function onEditKey(e) { if (e.key === 'Escape' || (e.key === 'Enter' && st.editing && st.editing.kind === 'text')) { e.preventDefault(); st.editing.el.blur(); } }
  function onBlur() { setTimeout(() => { if (st.editing && fdoc && fdoc.activeElement !== st.editing.el && !$('.modal-back')) flushEdit(); }, 0); }
  function flushEdit() {
    const ed = st.editing;
    if (!ed) return;
    clearTimeout(editTimer);
    commitEdit();
    ed.el.removeAttribute('contenteditable');
    ed.el.classList.remove('is-editing');
    ed.el.removeEventListener('input', onEditInput);
    ed.el.removeEventListener('blur', onBlur);
    ed.el.removeEventListener('keydown', onEditKey);
    st.editing = null;
    if (ov.root) ov.draw();
  }

  /* ==========================================================================
     Actions sur les sections et les éléments
     ========================================================================== */
  const reId = s => { const c = M.clone(s); c.id = M.uid('s'); c.blocs = M.arr(c.blocs).map(b => Object.assign(b, { id: M.uid('b') })); return c; };
  function barAction(a) {
    const secEl = ov.hSec || (st.sel && fdoc.querySelector(`[data-sid="${st.sel.sid}"]`));
    const info = secEl && secById(secEl.dataset.sid);
    if (a.startsWith('img-')) {
      const el = ov.hEl && ov.hEl.matches('[data-img]') ? ov.hEl : null;
      if (!el) return;
      const sid = el.closest('[data-sid]').dataset.sid, path = el.dataset.img;
      if (a === 'img-replace') replaceImage(sid, path);
      if (a === 'img-crop') { const o = imgObj(secById(sid).sec, path); if (o.src) openCrop(o.src, p => { o.src = p; changed(); }); else replaceImage(sid, path); }
      if (a === 'img-settings') selectImg(el);
      if (a === 'img-del') removeImage(sid, path);
      if (a === 'img-cap') toggleCaption(sid, path);
      return;
    }
    if (a.startsWith('it-')) { itemAction(a); return; }
    if (a.startsWith('b-')) {
      const blEl = ov.hBloc || (st.sel && st.sel.bid && fdoc.querySelector(`[data-bid="${st.sel.bid}"]`));
      const bi = blEl && blocById(blEl.dataset.bid);
      if (!bi) return;
      const list = bi.sec.blocs, i = bi.index;
      if (a === 'b-edit') selectBloc(bi.bloc.id, 'contenu');
      if (a === 'b-up' && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; changed(); }
      if (a === 'b-down' && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; changed(); }
      if (a === 'b-dup') { const c = M.clone(bi.bloc); c.id = M.uid('b'); if (c.pos) { c.pos.x = Math.min(90, c.pos.x + 3); c.pos.y = Math.min(90, c.pos.y + 3); } list.splice(i + 1, 0, c); changed(); selectBloc(c.id); }
      if (a === 'b-del' && confirm(`Supprimer l’élément « ${blocName(bi.bloc)} » ?\n(Tu pourras annuler avec ↶)`)) { list.splice(i, 1); if (st.sel && st.sel.bid === bi.bloc.id) select(bi.sec.id); ov.hBloc = null; changed(); }
      if (a === 'b-add') openAddBloc(bi.sec.id, i + 1, bi.bloc.col);
      if (a === 'b-front') { bi.bloc.pos.z = Math.max(...list.map(x => +(x.pos || {}).z || 1)) + 1; changed(); }
      if (a === 'b-back') { list.forEach(x => { if (x.pos) x.pos.z = (+x.pos.z || 1) + 1; }); bi.bloc.pos.z = 1; changed(); }
      return;
    }
    if (!info) return;
    const list = info.list, i = info.index;
    if (a === 's-edit') select(info.sec.id, 'contenu');
    if (a === 's-style') select(info.sec.id, 'style');
    if (a === 's-up' && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; changed(); }
    if (a === 's-down' && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; changed(); }
    if (a === 's-dup') { const c = reId(info.sec); list.splice(i + 1, 0, c); changed(); select(c.id); }
    if (a === 's-del' && confirm(`Supprimer la section « ${M.nomSection(info.sec)} » et ses éléments ?\n(Tu pourras annuler avec ↶)`)) {
      list.splice(i, 1); if (st.sel && st.sel.sid === info.sec.id) closePanel(); ov.hSec = null; changed();
    }
    if (a === 's-add-before') openAdd(i);
    if (a === 's-add-after') openAdd(i + 1);
  }
  function doAct(act, el) {
    const secEl = el && el.closest && el.closest('[data-sid]');
    const blEl = el && el.closest && el.closest('[data-bid]');
    const sid = secEl ? secEl.dataset.sid : (st.sel && st.sel.sid);
    if (act === 'add-images' && blEl) addImages(blEl.dataset.bid);
    else if (act === 'edit-bloc' && blEl) selectBloc(blEl.dataset.bid, 'contenu');
    else if (act === 'add-bloc' && sid) openAddBloc(sid, null, el.dataset ? el.dataset.col : null);
    else if (act === 'add-first') openAdd(0);
    else if (act === 'site-reseaux') openSite('reseaux');
    else if (act === 'pages-projets') openPages('projets');
    else if (act === 'replay') replay();
    else if (act === 'library') openLibrary({});
    else if (act === 'add-item' && el) addListItem(el);
    else if (act === 'genres') openGenres();
  }

  /* ---------- Lignes, pastilles, mots-clés, boutons : ajouter, déplacer, supprimer ---------- */
  function newItem(kind, list) {
    if (kind === 'pastille') return 'Nouvelle pastille';
    if (kind === 'tags') return 'Mot-clé';
    if (kind === 'liste') return { date: '', titre: 'Nouvelle ligne', sousTitre: '', html: '', logo: { src: '' }, lien: '' };
    if (kind === 'credits') return { fonction: 'Fonction', noms: 'Prénom NOM' };
    if (kind === 'boutons') { const last = list[list.length - 1] || {}; return { texte: 'Bouton', type: 'lien', cible: '', style: last.style || 'plein' }; }
    return { label: 'Intitulé', valeur: 'Valeur' };
  }
  function focusText(sid, prefix) {
    const t = fdoc.querySelector(`[data-sid="${sid}"] [data-e^="${prefix}"]`);
    if (!t) return;
    startEdit(t);
    t.focus();
    const r = fdoc.createRange(); r.selectNodeContents(t);
    const s = win.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function addListItem(el) {
    const secEl = el.closest('[data-sid]'), r = secEl && secById(secEl.dataset.sid);
    if (!r) return;
    const lp = el.dataset.list, b = r.sec.blocs[+lp.split('.')[1]];
    let list = M.get(r.sec, lp);
    if (!Array.isArray(list)) { list = []; M.set(r.sec, lp, list); }
    list.push(newItem(b.k, list));
    changed(); renderFrame();
    focusText(r.sec.id, `${lp}.${list.length - 1}` + ({ liste: '.titre', infos: '.label', credits: '.fonction', boutons: '.texte' }[b.k] || ''));
    if (b.k === 'boutons') { selectBloc(b.id, 'contenu', true); ED.toast('Choisis où mène ce bouton dans le panneau de droite.'); }
  }
  function itemCtx(el) {
    el = el || ov.hIt;
    if (!el || !el.isConnected) return null;
    const r = secById(el.closest('[data-sid]').dataset.sid), m = el.dataset.it.match(/^(.*)\.(\d+)$/);
    return r && m ? { el, sec: r.sec, lp: m[1], i: +m[2], list: M.get(r.sec, m[1]) } : null;
  }
  function itemAction(a) {
    const c = itemCtx(); if (!c || !Array.isArray(c.list)) return;
    const { list, i } = c;
    if (a === 'it-up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
    else if (a === 'it-down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
    else if (a === 'it-dup') list.splice(i + 1, 0, M.clone(list[i]));
    else if (a === 'it-del') { list.splice(i, 1); ED.toast('Supprimé. ↶ pour annuler.'); }
    else return;
    ov.hIt = null; changed();
  }
  function dragItem() {
    const c = itemCtx(); if (!c) return;
    const re = new RegExp('^' + c.lp.replace(/\./g, '\\.') + '\\.\\d+$');
    const sibs = $$(`[data-sid="${c.sec.id}"] [data-it]`, fdoc).filter(x => re.test(x.dataset.it));
    let to = c.i;
    startDrag('⠿');
    dragLoop(ev => {
      ov.at(ov.ghost, ev.clientX, ev.clientY);
      sibs.forEach(x => x.classList.remove('edo-target'));
      let best = null, bd = 1e12;
      sibs.forEach((x, k) => { const b = x.getBoundingClientRect(); const dx = ev.clientX - (b.left + b.width / 2), dy = ev.clientY - (b.top + b.height / 2); if (dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = k; } });
      if (best !== null) { to = best; sibs[best].classList.add('edo-target'); }
    }, () => { if (to !== c.i) { const [x] = c.list.splice(c.i, 1); c.list.splice(to, 0, x); changed(); } });
  }
  function toggleCaption(sid, path) {
    const r = secById(sid); if (!r) return;
    const m = path.match(/^(blocs\.\d+)\.c\.img$/);
    const o = m ? M.get(r.sec, m[1]).c : imgObj(r.sec, path);
    const on = !!(o.legende || o.legendeOn);
    if (on) { o.legende = ''; o.legendeOn = false; changed(); ED.toast('Légende retirée.'); return; }
    o.legendeOn = true; changed(); renderFrame();
    focusText(sid, m ? m[1] + '.c.legende' : path + '.legende');
  }

  /* ---------- Glisser-déposer ---------- */
  function startDrag(label) {
    ov.dragging = true;
    ov.ghost.textContent = label;
    ov.show(ov.ghost, !!label); ov.draw();
    fdoc.documentElement.classList.add('ed-dragging');
  }
  function endDrag() {
    ov.dragging = false;
    ['ghost', 'drop', 'tip'].forEach(k => ov.show(ov[k], false));
    fdoc.documentElement.classList.remove('ed-dragging');
    $$('.edo-target', fdoc).forEach(x => x.classList.remove('edo-target'));
    ov.draw();
  }
  function dragLoop(move, up) {
    let last = null;
    const tick = setInterval(() => {
      if (!last) return;
      if (last.clientY < 70) { win.scrollBy(0, -18); move(last); } else if (last.clientY > win.innerHeight - 70) { win.scrollBy(0, 18); move(last); }
    }, 40);
    const mv = ev => { last = ev; move(ev); };
    fdoc.addEventListener('pointermove', mv);
    fdoc.addEventListener('pointerup', () => { clearInterval(tick); fdoc.removeEventListener('pointermove', mv); endDrag(); up(); }, { once: true });
  }
  const line = (x, y, w) => { ov.show(ov.drop, true); Object.assign(ov.drop.style, { left: x + win.scrollX + 'px', top: y + win.scrollY - 2 + 'px', width: w + 'px' }); };
  function dragSection() {
    const sec = ov.hSec; if (!sec) return;
    const info = secById(sec.dataset.sid), pg = info.page, from = info.index;
    const secs = $$('[data-sid]', fdoc);
    let to = from;
    startDrag('⠿ ' + M.nomSection(info.sec));
    dragLoop(ev => {
      to = secs.length;
      for (let i = 0; i < secs.length; i++) { const r = secs[i].getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { to = i; break; } }
      const y = to < secs.length ? secs[to].getBoundingClientRect().top : secs[secs.length - 1].getBoundingClientRect().bottom;
      line(12, y, win.innerWidth - 24);
      ov.at(ov.ghost, ev.clientX, ev.clientY);
    }, () => {
      const target = to > from ? to - 1 : to;
      if (target !== from) { const [s] = pg.sections.splice(from, 1); pg.sections.splice(target, 0, s); changed(); select(s.id); }
    });
  }
  // Où déposer un élément : avant/après un autre, dans une colonne vide, au bout d'une section, ou à un endroit précis (composition libre)
  function findDrop(x, y, exEl, exBloc) {
    const el = fdoc.elementFromPoint(x, y);
    if (!el || el.closest('#edo')) return null;
    const tb = el.closest('[data-bid]');
    const ti = tb && tb !== exEl && !(exEl && exEl.contains(tb)) && blocById(tb.dataset.bid);
    if (ti && !isFree(ti.sec)) {
      const r = tb.getBoundingClientRect(), after = y > r.top + r.height / 2;
      line(r.left, after ? r.bottom + 2 : r.top - 2, r.width);
      return { sec: ti.sec, index: ti.index + (after ? 1 : 0), col: ti.bloc.col };
    }
    const colEl = el.closest('[data-dropcol]'), secEl = el.closest('[data-sid]');
    const ts = secEl && secById(secEl.dataset.sid);
    if (!ts) { ov.show(ov.drop, false); return null; }
    if (isFree(ts.sec)) {
      const lib = secEl.querySelector('.libre'); if (!lib) return null;
      const lr = lib.getBoundingClientRect();
      line(x - 50, y, 100);
      return { sec: ts.sec, index: ts.sec.blocs.length, libre: { x: clamp(Math.round((x - lr.left) / lr.width * 100), 0, 90), y: clamp(Math.round((y - lr.top) / lr.height * 100), 0, 95) } };
    }
    const col = colEl ? colEl.dataset.dropcol : undefined;
    const sameCol = ts.sec.blocs.filter(b => col === undefined || ts.sec.layout !== 'deux' || (b.col || 'g') === col);
    const lastB = sameCol.filter(b => b !== exBloc).pop();
    const r = (colEl || secEl).getBoundingClientRect();
    line(r.left + 8, Math.min(r.bottom - 6, win.innerHeight - 4), r.width - 16);
    return { sec: ts.sec, index: lastB ? ts.sec.blocs.indexOf(lastB) + 1 : ts.sec.blocs.length, col };
  }
  function findSecDrop(y) {
    const secs = $$('[data-sid]', fdoc), pg = page();
    let to = secs.length;
    for (let i = 0; i < secs.length; i++) { const r = secs[i].getBoundingClientRect(); if (y < r.top + r.height / 2) { to = i; break; } }
    const ly = secs.length ? (to < secs.length ? secs[to].getBoundingClientRect().top : secs[secs.length - 1].getBoundingClientRect().bottom) : 80;
    line(12, ly, win.innerWidth - 24);
    return { index: Math.min(to, pg.sections.length) };
  }
  const topZ = sec => Math.max(1, ...sec.blocs.map(x => +(x.pos || {}).z || 1)) + 1;
  function placeBloc(b, target) {
    if (target.libre) { b.pos = Object.assign({ w: 40 }, b.pos || {}, { x: target.libre.x, y: target.libre.y, z: topZ(target.sec) }); delete b.col; }
    else if (target.sec.layout === 'deux') b.col = target.col || b.col || 'g';
    else delete b.col;
  }
  // Déplace un élément : dans sa section, vers une autre section ou une autre colonne
  function dragBloc() {
    const blEl = ov.hBloc; if (!blEl) return;
    const src = blocById(blEl.dataset.bid);
    if (!src || isFree(src.sec)) return;
    let target = null;
    startDrag('⠿ ' + blocName(src.bloc));
    blEl.style.opacity = '.35';
    dragLoop(ev => {
      ov.at(ov.ghost, ev.clientX, ev.clientY);
      target = findDrop(ev.clientX, ev.clientY, blEl, src.bloc);
    }, () => {
      blEl.style.opacity = '';
      if (!target) return;
      const b = src.bloc;
      let idx = target.index;
      if (target.sec === src.sec && src.index < idx) idx--;
      src.sec.blocs.splice(src.index, 1);
      placeBloc(b, target);
      target.sec.blocs.splice(clamp(idx, 0, target.sec.blocs.length), 0, b);
      changed(); selectBloc(b.id);
    });
  }
  function insertBloc(k, target) {
    const nb = M.bloc(k);
    if (target.sec.layout === 'libre' && !target.libre) target.libre = { x: 30, y: 30 };
    placeBloc(nb, target);
    if (target.libre && k === 'boutons') nb.pos.w = 24;
    target.sec.blocs.splice(clamp(target.index, 0, target.sec.blocs.length), 0, nb);
    changed(); renderFrame(); selectBloc(nb.id, 'contenu');
    if (k === 'galerie') addImages(nb.id);
    return nb;
  }

  /* ---------- Poignées de taille (sur la page) ---------- */
  function resizeHandle(kind, e) {
    const mob = MOB(), x0 = e.clientX, y0 = e.clientY;
    const secEl = ov.hSec, blEl = ov.hBloc;
    const si = secEl && secById(secEl.dataset.sid), bi = blEl && blocById(blEl.dataset.bid);
    let val = null, show = null, obj = null, key = '';
    const tip = (t, ev) => { ov.tip.textContent = t; ov.show(ov.tip, true); ov.at(ov.tip, ev.clientX + 14, ev.clientY + 14); };
    const centered = el => !!el.closest('.al-center') || el.classList.contains('alm-center');
    if (kind === 'bw' && bi) {
      const pr = blEl.parentElement.getBoundingClientRect(), w0 = blEl.getBoundingClientRect().width, f = centered(blEl) ? 2 : 1;
      obj = bi.bloc; key = mob ? 's.largeurM' : 's.largeur';
      show = ev => { val = clamp(Math.round((w0 + (ev.clientX - x0) * f) / pr.width * 100), 10, 100); blEl.style.width = val + '%'; blEl.style.maxWidth = '100%'; if (f === 2) blEl.style.marginLeft = blEl.style.marginRight = 'auto'; tip(val >= 100 ? 'Toute la largeur' : `Largeur ${val} %`, ev); };
    } else if (kind === 'iw' && bi) {
      const box = blEl.querySelector('.img-box'), pr = blEl.getBoundingClientRect(), w0 = box.getBoundingClientRect().width, f = centered(blEl) ? 2 : 1;
      obj = bi.bloc; key = mob ? 'c.largeurM' : 'c.largeur';
      show = ev => { val = clamp(Math.round((w0 + (ev.clientX - x0) * f) / pr.width * 100), 8, 100); box.style.width = val + '%'; if (f === 2) box.style.marginLeft = box.style.marginRight = 'auto'; tip(`Largeur de l’image ${val} %`, ev); };
    } else if (kind === 'ih' && bi) {
      const media = blEl.querySelector('.img-box .gi-media'), h0 = media.getBoundingClientRect().height;
      obj = bi.bloc; key = mob ? 'c.hauteurM' : 'c.hauteur';
      show = ev => { val = clamp(Math.round(h0 + ev.clientY - y0), 60, 2400); media.style.height = val + 'px'; media.style.aspectRatio = 'auto'; const im = media.querySelector('img'); if (im) im.style.height = '100%'; tip(`Hauteur de l’image ${val} px`, ev); };
    } else if (kind === 'gh' && bi) {
      const c = bi.bloc.c, gal = blEl.querySelector('.gal'), band = c.disposition === 'bande', first = gal && gal.querySelector('.gi');
      if (!gal || !first) return;
      const v0 = c.disposition === 'puzzle' ? parseFloat(win.getComputedStyle(gal).gridAutoRows) || 220 : first.getBoundingClientRect().height, H0 = gal.getBoundingClientRect().height || 1;
      obj = bi.bloc; key = 'c.' + (band ? 'hauteurBande' : 'hauteurRang') + (mob ? 'M' : '');
      show = ev => { val = clamp(Math.round(v0 * (H0 + ev.clientY - y0) / H0), 60, 1400); gal.style.setProperty(band ? (mob ? '--band-m' : '--band') : (mob ? '--row-m' : '--row'), val + 'px'); tip(`Hauteur des images ${val} px`, ev); };
    } else if ((kind === 'pt' || kind === 'pb') && si) {
      const cs = win.getComputedStyle(secEl), v0 = parseFloat(kind === 'pt' ? cs.paddingTop : cs.paddingBottom) || 0;
      obj = si.sec; key = 's.' + kind + (mob ? 'M' : '');
      show = ev => { val = clamp(Math.round(v0 + ev.clientY - y0), 0, 400); secEl.style[kind === 'pt' ? 'paddingTop' : 'paddingBottom'] = val + 'px'; tip(`Espace ${kind === 'pt' ? 'au-dessus' : 'en dessous'} : ${val} px`, ev); };
    } else if (kind === 'sw' && si) {
      const inner = secEl.querySelector(':scope > .sec-in'), lay = inner.firstElementChild, w0 = lay.getBoundingClientRect().width, pad = parseFloat(win.getComputedStyle(inner).paddingLeft) || 0;
      obj = si.sec; key = 's.largeurPx';
      show = ev => { val = clamp(Math.round(w0 + (ev.clientX - x0) * 2 + pad * 2), 280, 2600); inner.style.maxWidth = val + 'px'; tip(`Largeur du contenu ${val} px`, ev); };
    } else if (kind === 'col' && si) {
      const cont = secEl.querySelector('.deux-row') || secEl.querySelector('.cols'), holder = secEl.querySelector('.deux') || cont;
      const cr = cont.getBoundingClientRect(), right = cont.classList.contains('img-droite'), isCols = cont.classList.contains('cols');
      obj = si.sec; key = mob ? 'c.proportionM' : 'c.proportion';
      show = ev => { let pct = (ev.clientX - cr.left) / cr.width * 100; if (right) pct = 100 - pct; val = clamp(Math.round(pct), 20, 80); holder.style.setProperty(mob ? '--propm' : '--prop', val + '%'); tip(`${isCols ? 'Image' : 'Colonne de gauche'} : ${val} %`, ev); };
    } else if (kind === 'ch' && si) {
      const cov = secEl.querySelector('.cov'), h0 = cov.getBoundingClientRect().height;
      obj = si.sec; key = mob ? 'c.hauteurM' : 'c.hauteur';
      show = ev => { val = clamp(Math.round((h0 + ev.clientY - y0) / win.innerHeight * 100), 20, 100); cov.style.setProperty(mob ? '--cov-hm' : '--cov-h', val); tip(`Hauteur : ${val} % de l’écran`, ev); };
    }
    if (!show) return;
    startDrag('');
    dragLoop(show, () => {
      if (val === null) return;
      M.set(obj, key, kind === 'bw' && val >= 100 ? (mob ? 100 : '') : val);
      changed(); refreshPanelSoon();
    });
  }

  /* ---------- Images ---------- */
  function imgObj(sec, path) {
    let o = M.get(sec, path);
    if (typeof o === 'string' || o == null) { o = { src: o || '' }; M.set(sec, path, o); }
    return o;
  }
  function replaceImage(sid, path) {
    const r = secById(sid); if (!r) return;
    openLibrary({ pick: true, onPick: src => { const o = imgObj(r.sec, path); o.src = src; changed(); if (st.sel && st.sel.path === path) buildPanel(); } });
  }
  function removeImage(sid, path) {
    const r = secById(sid); if (!r) return;
    const m = path.match(/^(.*images)\.(\d+)$/);
    if (m) M.get(r.sec, m[1]).splice(+m[2], 1);
    else imgObj(r.sec, path).src = '';
    if (st.sel && st.sel.path === path) select(sid);
    ov.hEl = null; changed();
  }
  function addImages(bid) {
    const bi = blocById(bid); if (!bi) return;
    const list = bi.bloc.c.images = M.arr(bi.bloc.c.images);
    openLibrary({ pick: true, multi: true, onPick: srcs => { M.arr(srcs).forEach(src => list.push({ src })); changed(); if (st.sel) buildPanel(); } });
  }
  function dragImage() {
    const el = ov.hEl; if (!el) return;
    const sid = el.closest('[data-sid]').dataset.sid, m = el.dataset.img.match(/^(.*images)\.(\d+)$/);
    if (!m) return;
    const r = secById(sid), arrPath = m[1], from = +m[2];
    const sibs = $$(`[data-sid="${sid}"] [data-img^="${arrPath}."]`, fdoc);
    let to = from;
    startDrag('⠿ Image ' + (from + 1));
    dragLoop(ev => {
      ov.at(ov.ghost, ev.clientX, ev.clientY);
      sibs.forEach(s => s.classList.remove('edo-target'));
      let best = null, bd = 1e9;
      sibs.forEach((s, i) => { const b = s.getBoundingClientRect(); const dx = ev.clientX - (b.left + b.width / 2), dy = ev.clientY - (b.top + b.height / 2); if (dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = i; } });
      if (best !== null) { to = best; sibs[best].classList.add('edo-target'); }
    }, () => { if (to !== from) { const list = M.get(r.sec, arrPath); const [x] = list.splice(from, 1); list.splice(to, 0, x); changed(); } });
  }
  function resizeImage(e) {
    const el = ov.hEl; if (!el) return;
    const sid = el.closest('[data-sid]').dataset.sid, it = imgObj(secById(sid).sec, el.dataset.img);
    const gal = el.closest('.gal'), puzzle = gal.classList.contains('gal-puzzle'), cs = win.getComputedStyle(gal);
    const cols = cs.gridTemplateColumns.split(' ').length, gap = parseFloat(cs.columnGap) || 0;
    const colW = (gal.getBoundingClientRect().width - gap * (cols - 1)) / cols, rowH = puzzle ? (parseFloat(cs.gridAutoRows) || 220) : colW;
    const w0 = Math.min(+it.w || 1, cols), h0 = +it.h || 1, x0 = e.clientX, y0 = e.clientY;
    let w = w0, hh = h0;
    startDrag('');
    dragLoop(ev => {
      w = Math.max(1, Math.min(cols, Math.round(w0 + (ev.clientX - x0) / (colW + gap))));
      hh = puzzle ? Math.max(1, Math.min(4, Math.round(h0 + (ev.clientY - y0) / (rowH + gap)))) : 1;
      el.style.setProperty('--w', w); el.style.setProperty('--h', hh);
      ov.tip.textContent = puzzle ? `${w} × ${hh}` : `${w} colonne${w > 1 ? 's' : ''}`; ov.show(ov.tip, true); ov.at(ov.tip, ev.clientX + 14, ev.clientY + 14);
    }, () => { if (w !== w0 || hh !== h0) { it.w = w; it.h = hh; changed(); } });
  }
  function moveCover(e) {
    const sec = ov.hSec; if (!sec) return;
    const r = secById(sec.dataset.sid), box = sec.querySelector('[data-drag="cov"]'), cr = sec.querySelector('.cov').getBoundingClientRect();
    const base = r.sec.c.pos = r.sec.c.pos || { x: 50, y: 50 };
    const pos = MOB() ? (r.sec.c.posM = r.sec.c.posM || {}) : base, x0 = e.clientX, y0 = e.clientY;
    const br = box.getBoundingClientRect(), px = (br.left + br.width / 2 - cr.left) / cr.width * 100, py = (br.top + br.height / 2 - cr.top) / cr.height * 100;
    let nx = px, ny = py;
    startDrag('');
    dragLoop(ev => {
      nx = Math.round(Math.max(5, Math.min(95, px + (ev.clientX - x0) / cr.width * 100)));
      ny = Math.round(Math.max(8, Math.min(92, py + (ev.clientY - y0) / cr.height * 100)));
      box.style.left = nx + '%'; box.style.top = ny + '%';
      ov.tip.textContent = `X ${nx} % · Y ${ny} %`; ov.show(ov.tip, true); ov.at(ov.tip, ev.clientX + 14, ev.clientY + 14);
    }, () => { pos.x = nx; pos.y = ny; changed(); if (st.sel && st.sel.sid === r.sec.id) refreshPanelSoon(); });
  }
  function freeCtx() {
    const el = ov.hBloc; if (!el) return null;
    const bi = blocById(el.dataset.bid);
    if (!bi || !isFree(bi.sec)) return null;
    const b = bi.bloc, P = MOB() ? (b.posM = b.posM || {}) : b.pos;
    const g = k => isNumv(P[k]) ? +P[k] : +b.pos[k] || (k === 'w' ? 30 : 0);
    return { el, bi, b, P, x: g('x'), y: g('y'), w: g('w'), box: el.closest('.libre').getBoundingClientRect() };
  }
  function moveFree(e) {
    const c = freeCtx(); if (!c) return;
    const x0 = e.clientX, y0 = e.clientY, px = c.x, py = c.y;
    let nx = px, ny = py;
    startDrag('');
    dragLoop(ev => {
      nx = Math.round(Math.max(0, Math.min(Math.max(0, 100 - c.w), px + (ev.clientX - x0) / c.box.width * 100)) * 2) / 2;
      ny = Math.round(Math.max(0, Math.min(98, py + (ev.clientY - y0) / c.box.height * 100)) * 2) / 2;
      c.el.style.left = nx + '%'; c.el.style.top = ny + '%';
      ov.tip.textContent = `X ${nx} % · Y ${ny} %`; ov.show(ov.tip, true); ov.at(ov.tip, ev.clientX + 14, ev.clientY + 14);
    }, () => { c.P.x = nx; c.P.y = ny; changed(); refreshPanelSoon(); });
  }
  function resizeFree(e) {
    const c = freeCtx(); if (!c) return;
    const x0 = e.clientX, w0 = c.w;
    let w = w0;
    startDrag('');
    dragLoop(ev => {
      w = Math.round(Math.max(5, Math.min(100 - c.x, w0 + (ev.clientX - x0) / c.box.width * 100)));
      c.el.style.width = w + '%';
      ov.tip.textContent = `Largeur ${w} %`; ov.show(ov.tip, true); ov.at(ov.tip, ev.clientX + 14, ev.clientY + 14);
    }, () => { c.P.w = w; changed(); refreshPanelSoon(); });
  }
  function replay() {
    if (!st.sel || !fdoc) return;
    const el = st.sel.bid ? fdoc.querySelector(`[data-bid="${st.sel.bid}"]`) : st.sel.path ? fdoc.querySelector(`[data-sid="${st.sel.sid}"] [data-img="${st.sel.path}"]`) : fdoc.querySelector(`[data-sid="${st.sel.sid}"]`);
    if (!el) return;
    const targets = [...(el.matches('.anim') ? [el] : []), ...el.querySelectorAll('.anim')];
    if (!targets.length) { ED.toast('Choisis d’abord une animation d’entrée.'); return; }
    targets.forEach(t => { t.classList.remove('replay'); void t.offsetWidth; t.classList.add('replay'); });
  }

  /* ==========================================================================
     Sélection et panneau de réglages
     ========================================================================== */
  function selTarget() {
    const s = st.sel; if (!s) return null;
    if (s.bid) return blocById(s.bid);
    return secById(s.sid);
  }
  function select(sid, tab) {
    flushEdit();
    const prev = st.sel && st.sel.kind;
    st.sel = { sid, kind: 'section' };
    st.tab = tab || (prev === 'section' ? st.tab : 'contenu');
    buildPanel(); ov.draw();
  }
  function selectBloc(bid, tab, keepEdit) {
    if (!keepEdit) flushEdit();
    const bi = blocById(bid); if (!bi) return;
    const prev = st.sel && st.sel.kind;
    st.sel = { sid: bi.sec.id, bid, kind: 'bloc' };
    st.tab = tab || (prev === 'bloc' ? st.tab : 'contenu');
    buildPanel(); if (ov.root) ov.draw();
  }
  function selectImg(el) {
    flushEdit();
    const prev = st.sel && st.sel.kind;
    const blEl = el.closest('[data-bid]');
    st.sel = { sid: el.closest('[data-sid]').dataset.sid, bid: blEl ? blEl.dataset.bid : null, path: el.dataset.img, kind: 'image' };
    if (prev !== 'image') st.tab = 'image';
    buildPanel(); ov.draw();
  }
  function closePanel() { st.sel = null; const P = $('#panel'); if (P) { P.hidden = true; document.body.classList.remove('has-panel'); } if (ov.root) ov.draw(); }
  function refreshPanelSoon() { clearTimeout(panelTimer); panelTimer = setTimeout(buildPanel, 30); }

  function buildPanel() {
    const P = $('#panel'), sel = st.sel;
    if (!P) return;
    if (!sel) return closePanel();
    const r = secById(sel.sid);
    if (!r) return closePanel();
    const body0 = P.querySelector('.pn-body'), scroll = body0 ? body0.scrollTop : 0;
    let tabs, title, body = [], crumbs = null;
    const ctx = { r, sec: r.sec, page: r.page, rerender: refreshPanelSoon };
    if (sel.kind === 'image') {
      const o = imgObj(r.sec, sel.path), cover = sel.path === 'c.media';
      const bi = sel.bid && blocById(sel.bid);
      const disp = bi && bi.bloc.k === 'galerie' ? bi.bloc.c.disposition : '';
      const inArr = /images\.\d+$/.test(sel.path), logo = /\.logo$/.test(sel.path);
      tabs = cover ? [['image', 'Image']] : [['image', 'Image'], ['effets', 'Effets'], ['anim', 'Animation']];
      title = cover ? 'Image de couverture' : logo ? 'Logo' : 'Image';
      crumbs = bi ? h('button', { class: 'pn-back', onclick: () => selectBloc(bi.bloc.id) }, '← ' + blocName(bi.bloc)) : h('button', { class: 'pn-back', onclick: () => select(sel.sid) }, '← Section');
      if (st.tab === 'image') body = fields(o, imageFields(cover, disp, inArr, logo, /^blocs\.\d+\.c\.img$/.test(sel.path)), ctx);
      if (st.tab === 'effets') body = fields(o, EFFETS, ctx);
      if (st.tab === 'anim') body = fields(o, animFields('anim'), ctx);
      if (inArr) body.push(h('button', { class: 'btn danger-btn wide', onclick: () => removeImage(sel.sid, sel.path) }, 'Retirer cette image de la galerie'));
    } else if (sel.kind === 'bloc') {
      const bi = blocById(sel.bid);
      if (!bi) return select(sel.sid);
      const b = bi.bloc, txt = TEXT_KINDS.includes(b.k);
      tabs = [['contenu', 'Contenu'], ['style', 'Style'], ...(txt ? [['texte', 'Texte']] : []), ['anim', 'Animation']];
      title = blocName(b);
      crumbs = h('button', { class: 'pn-back', onclick: () => select(sel.sid) }, '← Section ' + M.nomSection(r.sec));
      ctx.bloc = b; ctx.bi = bi;
      if (st.tab === 'contenu') body = [...fields(b, placeFields(r.sec), ctx), ...fields(b, BLOC_CONTENT[b.k] || [], ctx)];
      if (st.tab === 'style') body = [styleTools(b, 'bloc'), ...fields(b, BLOC_STYLE, ctx)];
      if (st.tab === 'texte') body = fields(b, [...typo('t', 'Texte de cet élément'), ...LIENS], ctx);
      if (st.tab === 'anim') body = fields(b, animFields('a'), ctx);
    } else {
      tabs = [['contenu', 'Contenu'], ['style', 'Style'], ['texte', 'Texte'], ['anim', 'Animation']];
      title = 'Section ' + M.nomSection(r.sec);
      if (st.tab === 'contenu') body = [...fields(r.sec, LAYOUT_FIELDS[r.sec.layout] || [], ctx), elementsList(r.sec)];
      if (st.tab === 'style') body = [styleTools(r.sec, 'section'), ...fields(r.sec, STYLE, ctx)];
      if (st.tab === 'texte') body = [h('p', { class: 'pn-note' }, 'Ces réglages s’appliquent à toute la section. Pour un seul élément, clique dessus puis onglet « Texte ».'), ...fields(r.sec, [...typo('s.tt', 'Titres'), ...typo('s.t', 'Paragraphes'), ...LIENS.map(f => Object.assign({}, f, { k: 's.' + f.k }))], ctx)];
      if (st.tab === 'anim') body = fields(r.sec, [...animFields('a'), { t: 'select', k: 'a.cible', l: 'Appliquer à', options: [['section', 'Toute la section d’un coup'], ['elements', 'Chaque élément, l’un après l’autre']] }], ctx);
    }
    if (!tabs.find(t => t[0] === st.tab)) { st.tab = tabs[0][0]; return buildPanel(); }
    P.replaceChildren(...[
      h('div', { class: 'pn-head' }, h('div', {}, crumbs, h('strong', {}, title)), h('button', { class: 'pn-x', title: 'Fermer', onclick: closePanel }, '×')),
      h('div', { class: 'pn-tabs' }, tabs.map(([k, l]) => h('button', { class: st.tab === k ? 'on' : '', onclick: () => { st.tab = k; buildPanel(); } }, l))),
      MOB() ? h('div', { class: 'pn-mob' }, h('b', {}, '📱 Version téléphone. '), 'Les réglages marqués 📱 (tailles, espacements, positions, colonnes) ne changent que sur téléphone. Textes, images, couleurs et polices restent communs.') : null,
      h('div', { class: 'pn-body' }, body.filter(Boolean))].filter(Boolean));
    P.hidden = false;
    document.body.classList.add('has-panel');
    P.querySelector('.pn-body').scrollTop = scroll;
  }
  function styleTools(obj, kind) {
    return h('div', { class: 'pn-tools' },
      h('button', { class: 'btn small ghost', onclick: () => { st.clip = { kind, s: M.clone(obj.s || {}) }; ED.toast('Style copié. Sélectionne un autre élément ou section → Style → Coller.'); } }, 'Copier le style'),
      h('button', { class: 'btn small ghost', disabled: !st.clip, onclick: () => { obj.s = M.clone(st.clip.s); changed(); buildPanel(); } }, 'Coller'),
      h('button', { class: 'btn small ghost', onclick: () => { if (confirm('Réinitialiser le style ?')) { obj.s = kind === 'section' ? Object.assign({}, (M.TYPES[obj.type] || {}).s || {}) : {}; changed(); buildPanel(); } } }, 'Réinitialiser'));
  }
  function elementsList(sec) {
    const list = sec.blocs;
    const rowName = b => {
      const c = b.c;
      const t = c.texte || (c.html ? c.html.replace(/<[^>]+>/g, ' ').trim() : '') || (c.lignes ? c.lignes.map(x => x.label || x.fonction).join(', ') : '') || (c.items ? c.items.map(x => x.titre).join(', ') : '');
      return t ? ' — ' + t.slice(0, 40) : '';
    };
    const mv = (i, d) => { const j = i + d; if (j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; changed(); refreshPanelSoon(); };
    return h('div', { class: 'f' }, h('h4', { class: 'pn-h' }, 'Éléments de la section'),
      h('p', { class: 'help' }, 'Clique sur ✎ pour régler un élément (contenu, style, texte, animation). Tu peux aussi les glisser directement sur la page avec ⠿.'),
      h('div', { class: 'el-list' }, list.map((b, i) => h('div', { class: 'el-row' },
        h('button', { class: 'el-name', onclick: () => selectBloc(b.id) }, h('b', {}, blocName(b)), h('span', {}, rowName(b))),
        sec.layout === 'deux' ? (() => { const s = h('select', { class: 'el-col', title: 'Colonne', onchange: e => { b.col = e.target.value; changed(); } }, [['g', 'Gauche'], ['d', 'Droite'], ['plein', 'Pleine largeur']].map(([v, l]) => h('option', { value: v }, l))); s.value = b.col || 'g'; return s; })() : null,
        h('button', { class: 'sm', title: 'Monter', onclick: () => mv(i, -1) }, '↑'), h('button', { class: 'sm', title: 'Descendre', onclick: () => mv(i, 1) }, '↓'),
        h('button', { class: 'sm', title: 'Régler', onclick: () => selectBloc(b.id) }, '✎'),
        h('button', { class: 'sm danger', title: 'Supprimer', onclick: () => { if (confirm(`Supprimer « ${blocName(b)} » ?`)) { list.splice(i, 1); changed(); refreshPanelSoon(); } } }, '🗑')))),
      h('button', { class: 'btn primary small', style: 'margin-top:10px', onclick: () => openAddBloc(sec.id, null) }, '+ Ajouter un élément'));
  }

  /* ---------- Définitions des réglages ---------- */
  const RATIOS = [['auto', 'Format d’origine'], ['16/9', '16:9'], ['2.39/1', '2.39:1 (cinémascope)'], ['3/2', '3:2'], ['4/3', '4:3'], ['1/1', 'Carré'], ['4/5', 'Portrait 4:5'], ['3/4', 'Portrait 3:4'], ['9/16', 'Vertical 9:16']];
  const NOTE_TXT = { t: 'note', l: 'Le texte se modifie directement sur la page : clique dedans et écris. Sélectionne des mots pour les mettre en gras, en lien, en couleur, ou relier un document (📎).' };
  const TEXT_KINDS = ['pastille', 'surtitre', 'titre', 'soustitre', 'texte', 'tags', 'boutons', 'document', 'infos', 'credits', 'liste', 'coordonnees', 'formulaire', 'reseaux', 'fichiers', 'projets'];
  const placeFields = sec => sec.layout === 'deux'
    ? [{ k: 'col', l: 'Colonne', t: 'seg', options: [['g', 'Gauche'], ['d', 'Droite'], ['plein', 'Pleine largeur']] }]
    : sec.layout === 'libre' ? [{ t: 'heading', l: 'Position (composition libre)' }, { k: 'pos.x', m: 'posM.x', l: 'Position X', t: 'range', min: 0, max: 98, step: 0.5, unit: '%' }, { k: 'pos.y', m: 'posM.y', l: 'Position Y', t: 'range', min: 0, max: 98, step: 0.5, unit: '%' },
      { k: 'pos.w', m: 'posM.w', l: 'Largeur', t: 'range', min: 5, max: 100, unit: '%' }, { k: 'pos.z', l: 'Ordre des couches', t: 'range', min: 1, max: 30 }] : [];
  const LAYOUT_FIELDS = {
    couverture: [
      { t: 'heading', l: 'Image ou vidéo de fond' },
      { k: 'c.media.type', t: 'seg', options: [['image', 'Image'], ['video', 'Vidéo']], rerender: true },
      { k: 'c.media.src', l: 'Image (aussi utilisée sur téléphone)', t: 'image' },
      { k: 'c.media.video', l: 'Lien de la vidéo (YouTube, Vimeo ou .mp4)', t: 'video', if: o => o.c.media && o.c.media.type === 'video', help: 'En boucle, sans son. Sur téléphone, l’image s’affiche à la place.' },
      { k: 'c.hauteur', m: 'c.hauteurM', l: 'Hauteur', t: 'range', min: 25, max: 100, unit: '% écran' },
      { t: 'note', l: 'Astuce : tire la poignée ↕ en bas de la couverture pour régler sa hauteur.' },
      { t: 'heading', l: 'Superposition' },
      { k: 'c.superposition.couleur', l: 'Couleur', t: 'color' },
      { k: 'c.superposition.opacite', l: 'Intensité', t: 'range', min: 0, max: 90, unit: '%' },
      { k: 'c.superposition.degrade', l: 'En dégradé vers le bas', t: 'check' },
      { t: 'heading', l: 'Bloc de texte par-dessus' },
      { t: 'note', l: 'Attrape la poignée ✥ à gauche du texte pour le déplacer sur l’image.' },
      { k: 'c.pos.x', m: 'c.posM.x', l: 'Position X', t: 'range', min: 5, max: 95, unit: '%' },
      { k: 'c.pos.y', m: 'c.posM.y', l: 'Position Y', t: 'range', min: 8, max: 92, unit: '%' },
      { k: 'c.alignTexte', m: 'c.alignTexteM', l: 'Alignement', t: 'seg', options: [['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']] },
      { k: 'c.largeurTexte', m: 'c.largeurTexteM', l: 'Largeur maximale', t: 'range', min: 240, max: 1400, step: 10, unit: 'px' }],
    colonnes: [{ k: 'c.img.src', l: 'Image', t: 'image' }, { k: 'c.imageCote', l: 'Image à', t: 'seg', options: [['gauche', 'Gauche'], ['droite', 'Droite']] },
      { k: 'c.proportion', m: 'c.proportionM', l: 'Largeur de l’image', t: 'range', min: 20, max: 80, unit: '%' }, { k: 'c.img.ratio', l: 'Format de l’image', t: 'select', options: RATIOS }, { k: 'c.empileM', l: '📱 Sur téléphone, les colonnes sont', t: 'seg', options: [['', 'Réglage du site'], ['non', 'Côte à côte'], ['oui', 'Empilées']] }],
    deux: [{ k: 'c.proportion', m: 'c.proportionM', l: 'Largeur de la colonne de gauche', t: 'range', min: 20, max: 80, unit: '%' }, { k: 'c.empileM', l: '📱 Sur téléphone, les colonnes sont', t: 'seg', options: [['', 'Réglage du site'], ['non', 'Côte à côte'], ['oui', 'Empilées']] },
      { t: 'note', l: 'Tire la poignée ⇔ entre les deux colonnes pour changer leur largeur. Glisse un élément d’une colonne à l’autre avec ⠿.' }],
    libre: [{ k: 'c.hauteur', m: 'c.hauteurM', l: 'Hauteur de la zone', t: 'range', min: 150, max: 1600, step: 10, unit: 'px' },
      { k: 'c.mobile', l: '📱 Sur téléphone', t: 'seg', options: [['empile', 'Éléments empilés'], ['compo', 'Composition comme sur ordi']], rerender: true },
      { t: 'note', l: '✥ déplace un élément, ⇲ change sa largeur, ⬆/⬇ le passe devant ou derrière. En mode 📱 « composition », tu peux placer les éléments autrement que sur ordinateur.' }],
    pile: [{ k: 's.encadre', l: 'Encadré avec bordure d’accent', t: 'check' }]
  };
  const BLOC_CONTENT = {
    pastille: [NOTE_TXT, { t: 'note', l: 'Plusieurs pastilles sur la même ligne : clique sur le petit « + » à droite des pastilles. Survole une pastille pour la déplacer (⠿), la dupliquer ou la supprimer.' }],
    surtitre: [NOTE_TXT], soustitre: [NOTE_TXT], texte: [NOTE_TXT],
    titre: [NOTE_TXT, { k: 'c.taille', l: 'Taille du titre', t: 'select', options: M.TAILLES_TITRE }, { k: 'c.niveau', l: 'Importance (pour Google)', t: 'seg', options: [['h1', 'H1'], ['h2', 'H2'], ['h3', 'H3']] },
      { k: 'c.lettres', l: 'Les lettres apparaissent une à une', t: 'check' }],
    tags: [{ t: 'note', l: 'Clique sur un mot-clé pour l’écrire, « + Mot-clé » pour en ajouter.' }, { k: 'c.tags', l: 'Mots-clés (séparés par des virgules)', t: 'tags' }],
    boutons: [{ k: 'c.boutons', l: 'Boutons', t: 'buttons' }],
    document: [{ k: 'c.src', l: 'Document', t: 'doc' }, { k: 'c.texte', l: 'Texte du bouton', t: 'text' }, { k: 'c.style', l: 'Style', t: 'select', options: [['contour', 'Contour'], ['plein', 'Plein'], ['accent', 'Couleur d’accent'], ['texte', 'Texte souligné']] }],
    fichiers: [{ k: 'c.fichiers', l: 'Fichiers', t: 'files' }],
    image: [{ k: 'c.img.src', l: 'Image', t: 'image' }, { k: 'c.img.ratio', l: 'Format', t: 'select', options: RATIOS },
      { k: 'c.largeur', m: 'c.largeurM', l: 'Largeur de l’image', t: 'range', min: 8, max: 100, unit: '%', auto: 100 },
      { k: 'c.hauteur', m: 'c.hauteurM', l: 'Hauteur (recadre l’image)', t: 'range', min: 60, max: 1600, step: 10, unit: 'px', auto: 0 },
      { t: 'note', l: 'Sur la page : ⇲ (coin) pour agrandir ou réduire, ↕ (en bas) pour la hauteur.' },
      { k: 'c.legendeOn', l: 'Afficher une légende', t: 'check', after: o => { if (!o.c.legendeOn) o.c.legende = ''; } },
      { k: 'c.legende', l: 'Légende', t: 'text', if: o => o.c.legendeOn || o.c.legende },
      { t: 'note', l: 'Clique sur l’image dans la page pour le cadrage, les filtres, la bordure, le texte par-dessus…' }],
    galerie: [
      { k: 'c.disposition', l: 'Disposition', t: 'layouts', rerender: true },
      { k: 'c.colonnes', m: 'c.colonnesM', l: 'Colonnes', lm: 'Colonnes sur téléphone', t: 'range', min: 1, max: 6, if: o => ['puzzle', 'grille', 'mosaique'].includes(o.c.disposition) },
      { k: 'c.colonnesM', l: '📱 Colonnes sur téléphone', t: 'range', min: 1, max: 3, if: o => !MOB() && ['puzzle', 'grille', 'mosaique'].includes(o.c.disposition) },
      { k: 'c.hauteurRang', m: 'c.hauteurRangM', l: 'Hauteur d’une rangée', t: 'range', min: 60, max: 900, step: 10, unit: 'px', if: o => ['puzzle', 'rangees'].includes(o.c.disposition) },
      { k: 'c.remplirDerniere', l: 'La dernière rangée remplit aussi toute la largeur', t: 'check', if: o => o.c.disposition === 'rangees' },
      { k: 'c.hauteurBande', m: 'c.hauteurBandeM', l: 'Hauteur de la bande', t: 'range', min: 100, max: 1200, step: 10, unit: 'px', if: o => o.c.disposition === 'bande' },
      { k: 'c.ratio', l: 'Format des images', t: 'select', options: RATIOS, if: o => ['grille', 'diaporama'].includes(o.c.disposition) },
      { k: 'c.format', l: 'Format des images', t: 'select', options: RATIOS, if: o => ['rangees', 'pile', 'duo', 'bande', 'mosaique'].includes(o.c.disposition), help: 'Chaque image peut aussi avoir son propre format : clique dessus → « Format de cette image ».' },
      { k: 'c.ordre', l: 'Ordre des photos', t: 'seg', options: [['lignes', 'Par ligne (gauche → droite)'], ['colonnes', 'Par colonne (haut → bas)']], if: o => o.c.disposition === 'mosaique' },
      { k: 'c.defilementAuto', l: 'Défilement automatique', t: 'check', if: o => o.c.disposition === 'diaporama' },
      { k: 'c.espacement', m: 'c.espacementM', l: 'Espacement', t: 'range', min: 0, max: 60, unit: 'px' },
      { k: 's.pleine', l: 'Prendre toute la largeur de l’écran', t: 'check' },
      { k: 'c.survol', l: 'Effet au survol des images', t: 'select', options: M.HOVERS },
      { t: 'note', l: 'Puzzle et grille : tire la poignée ⇲ dans le coin d’une image pour l’agrandir. ⠿ pour changer l’ordre.', if: o => ['puzzle', 'grille'].includes(o.c.disposition) },
      { t: 'note', l: 'Rangées, puzzle et bande : tire la poignée ↕ sous la galerie pour la hauteur des images.', if: o => ['rangees', 'puzzle', 'bande'].includes(o.c.disposition) },
      { k: 'c.images', l: 'Images', t: 'gallery' }],
    video: [{ k: 'c.url', l: 'Lien de la vidéo (YouTube, Vimeo ou .mp4)', t: 'video' }, { k: 'c.poster', l: 'Image d’aperçu (optionnel)', t: 'image' }, { k: 'c.ratio', l: 'Format', t: 'select', options: RATIOS.slice(1) },
      { k: 'c.legendeOn', l: 'Afficher une légende', t: 'check', after: o => { if (!o.c.legendeOn) o.c.legende = ''; } }, { k: 'c.legende', l: 'Légende', t: 'text', if: o => o.c.legendeOn || o.c.legende }],
    spotify: [{ k: 'c.liens', l: 'Liens Spotify (un par ligne)', t: 'lines', help: 'Dans Spotify : ⋯ → Partager → Copier le lien (titre, album, playlist, artiste, podcast).' },
      { k: 'c.taille', l: 'Taille du lecteur', t: 'seg', options: [['compact', 'Compact'], ['grand', 'Grand']] }, { k: 'c.colonnes', l: 'Lecteurs par ligne', t: 'range', min: 1, max: 3 }],
    infos: [NOTE_TXT, { t: 'note', l: '« + Ajouter une ligne » sous la liste, sur la page.' }, { k: 'c.lignes', l: 'Lignes', t: 'pairs', a: ['label', 'Intitulé'], b: ['valeur', 'Valeur'] }, { k: 'c.colonnes', l: 'Colonnes', t: 'seg', options: [[1, '1'], [2, '2']] }],
    credits: [NOTE_TXT, { t: 'note', l: '« + Ajouter une personne » sous la liste, sur la page.' }, { k: 'c.lignes', l: 'Personnes', t: 'pairs', a: ['fonction', 'Fonction'], b: ['noms', 'Noms (séparés par « - »)'], area: true }],
    liste: [{ t: 'note', l: 'Ajoute une ligne directement sur la page avec « + Ajouter une ligne ». Survole une ligne pour la déplacer (⠿), la dupliquer ou la supprimer. Clique sur « + Logo » pour ajouter un logo.' }, { k: 'c.items', l: 'Lignes du parcours', t: 'liste' }, { k: 'c.logos', l: 'Couleur des logos', t: 'seg', options: [['nb', 'Noir & blanc'], ['blanc', 'Blanc'], ['noir', 'Noir'], ['couleur', 'Couleur']] },
      { k: 'c.tailleLogo', l: 'Taille des logos', t: 'range', min: 24, max: 140, unit: 'px' }],
    reseaux: [{ k: 'c.style', l: 'Affichage', t: 'seg', options: [['icones', 'Icônes'], ['icones-texte', 'Icône + nom'], ['texte', 'Texte']] }, { k: 'c.taille', l: 'Taille des icônes', t: 'range', min: 14, max: 40, unit: 'px' },
      { t: 'action', l: 'Modifier la liste de mes réseaux', act: 'site-reseaux' }],
    coordonnees: [{ k: 'c.email', l: 'E-mail', t: 'text' }, { k: 'c.telephone', l: 'Téléphone', t: 'text' }, { k: 'c.lieu', l: 'Ville / zone', t: 'text' }],
    formulaire: [{ k: 'c.email', l: 'E-mail qui reçoit les messages', t: 'text' }, { k: 'c.formspree', l: 'Adresse Formspree (optionnel)', t: 'text', help: 'Sans adresse, le formulaire ouvre la messagerie du visiteur. Avec un compte gratuit formspree.io, tu reçois les messages par e-mail.' }],
    projets: [
      { k: 'c.filtres', l: 'Afficher les filtres par typologie', t: 'check', rerender: true },
      { k: 'c.tousLabel', l: 'Texte du premier filtre', t: 'text', if: o => o.c.filtres !== false },
      { t: 'action', l: 'Typologies : ajouter, renommer, ordre…', act: 'genres' },
      { k: 'c.genre', l: 'N’afficher qu’une seule typologie', t: 'genre' },
      { k: 'c.afficherGenre', l: 'Afficher la typologie sous chaque projet', t: 'check' },
      { k: 'c.afficherRoles', l: 'Afficher mes rôles sous chaque projet', t: 'check' },
      { k: 'c.colonnes', m: 'c.colonnesM', l: 'Projets par ligne', t: 'range', min: 1, max: 4 },
      { k: 'c.colonnesM', l: '📱 Projets par ligne (téléphone)', t: 'range', min: 1, max: 3, if: () => !MOB() },
      { k: 'c.ratio', l: 'Format des vignettes', t: 'select', options: RATIOS.slice(1) },
      { t: 'heading', l: 'Animations des vignettes' },
      { k: 'c.animEntree', l: 'Animation d’apparition', t: 'select', options: M.ANIMS },
      { k: 'c.animDuree', l: 'Durée', t: 'range', min: 0.2, max: 3, step: 0.1, unit: 's', auto: 0.9 },
      { k: 'c.animEcart', l: 'Décalage entre deux projets', t: 'range', min: 0, max: 0.6, step: 0.02, unit: 's', auto: 0.12 },
      { t: 'action', l: '▶ Rejouer les animations', act: 'replay' },
      { t: 'heading', l: 'Au survol d’une vignette' },
      { k: 'c.animSurvol', l: 'Animation du texte au survol', t: 'select', options: M.ANIMS, rerender: true, help: 'Le titre du projet apparaît sur l’image avec cette animation (même liste que les animations d’apparition).' },
      { k: 'c.survolTexte', l: 'Texte affiché', t: 'select', options: [['titre-cta', 'Titre + « Voir le projet »'], ['titre', 'Titre seul'], ['titre-roles', 'Titre + mes rôles'], ['titre-genre', 'Titre + typologie'], ['cta', '« Voir le projet » seul']], if: o => o.c.animSurvol },
      { k: 'c.survolVoile', l: 'Assombrir l’image', t: 'range', min: 0, max: 90, unit: '%', auto: 45, if: o => o.c.animSurvol },
      { k: 'c.survolDuree', l: 'Durée', t: 'range', min: 0.2, max: 2, step: 0.1, unit: 's', auto: 0.6, if: o => o.c.animSurvol },
      { k: 'c.animation', l: 'Effet sur l’image au survol', t: 'select', options: M.PROJ_ANIMS },
      { t: 'note', l: 'Survole une vignette sur la page pour voir le résultat. Chaque projet peut avoir sa propre animation : ☰ Pages → Projets.' },
      { t: 'action', l: 'Modifier mes projets (typologies, rôles, vignette…)', act: 'pages-projets' }],
    espace: [{ k: 'c.hauteur', l: 'Hauteur', t: 'range', min: 0, max: 400, step: 5, unit: 'px' }, { k: 'c.ligne', l: 'Afficher une ligne', t: 'check', rerender: true },
      { k: 'c.couleurLigne', l: 'Couleur de la ligne', t: 'color', if: o => o.c.ligne }, { k: 'c.epaisseur', l: 'Épaisseur', t: 'range', min: 1, max: 10, unit: 'px', if: o => o.c.ligne },
      { k: 'c.largeurLigne', l: 'Largeur', t: 'range', min: 5, max: 100, unit: '%', if: o => o.c.ligne }]
  };
  const STYLE = [
    { t: 'heading', l: 'Mise en page' },
    { k: 's.largeur', l: 'Largeur du contenu', t: 'seg', options: [['pleine', 'Pleine'], ['large', 'Large'], ['normale', 'Normale'], ['etroite', 'Étroite']], after: o => { o.s.largeurPx = ''; } },
    { k: 's.largeurPx', l: 'Largeur sur mesure', t: 'range', min: 280, max: 2600, step: 10, unit: 'px', auto: 0, help: 'Ou tire la poignée ↔ à droite du contenu, sur la page.' },
    { k: 's.paddingBox', m: 's.paddingBoxM', l: 'Marge intérieure de l’encadré', t: 'range', min: 0, max: 120, unit: 'px', if: o => o.s.encadre },
    { k: 's.align', m: 's.alignM', l: 'Alignement', t: 'seg', options: [['', 'Auto'], ['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']] },
    { k: 's.pt', m: 's.ptM', l: 'Marge au-dessus', t: 'range', min: 0, max: 260, step: 2, unit: 'px', auto: 48 },
    { k: 's.pb', m: 's.pbM', l: 'Marge en dessous', t: 'range', min: 0, max: 260, step: 2, unit: 'px', auto: 48 },
    { t: 'note', l: 'Sur la page : tire les poignées ⇕ en haut et en bas à gauche de la section.' },
    { k: 's.hauteurMin', m: 's.hauteurMinM', l: 'Hauteur minimale', t: 'range', min: 0, max: 100, unit: '% écran', rerender: true },
    { k: 's.alignV', l: 'Position du contenu', t: 'seg', options: [['haut', 'Haut'], ['centre', 'Centre'], ['bas', 'Bas']], if: o => +o.s.hauteurMin },
    { t: 'heading', l: 'Fond' },
    { k: 's.fond', l: 'Couleur de fond', t: 'color' },
    { k: 's.degrade.actif', l: 'Fond en dégradé', t: 'check', rerender: true },
    { k: 's.degrade.c1', l: 'Couleur 1', t: 'color', if: o => o.s.degrade && o.s.degrade.actif },
    { k: 's.degrade.c2', l: 'Couleur 2', t: 'color', if: o => o.s.degrade && o.s.degrade.actif },
    { k: 's.degrade.angle', l: 'Direction', t: 'range', min: 0, max: 360, step: 5, unit: '°', if: o => o.s.degrade && o.s.degrade.actif },
    { k: 's.fondImage', l: 'Image de fond', t: 'image', rerender: true },
    { k: 's.fondFit', l: 'Ajustement', t: 'seg', options: [['cover', 'Remplir'], ['contain', 'Contenir']], if: o => o.s.fondImage },
    { k: 's.fondX', l: 'Position X', t: 'range', min: 0, max: 100, unit: '%', if: o => o.s.fondImage },
    { k: 's.fondY', l: 'Position Y', t: 'range', min: 0, max: 100, unit: '%', if: o => o.s.fondImage },
    { k: 's.fondFixe', l: 'Effet parallaxe', t: 'check', if: o => o.s.fondImage },
    { k: 's.superposition.couleur', l: 'Superposition : couleur', t: 'color' },
    { k: 's.superposition.opacite', l: 'Superposition : intensité', t: 'range', min: 0, max: 95, unit: '%' },
    { t: 'heading', l: 'Couleur, bordure, ombre' },
    { k: 's.couleur', l: 'Couleur du texte', t: 'color' },
    { k: 's.bordure.largeur', l: 'Bordure : épaisseur', t: 'range', min: 0, max: 16, unit: 'px' },
    { k: 's.bordure.couleur', l: 'Bordure : couleur', t: 'color' },
    { k: 's.bordure.style', l: 'Bordure : style', t: 'seg', options: [['solid', 'Pleine'], ['dashed', 'Tirets'], ['dotted', 'Points']] },
    { k: 's.bordure.rayon', l: 'Coins arrondis', t: 'range', min: 0, max: 80, unit: 'px' },
    { k: 's.ombre', l: 'Ombre', t: 'select', options: [['', 'Aucune'], ['douce', 'Douce'], ['forte', 'Forte'], ['lueur', 'Lueur colorée']] },
    { t: 'heading', l: 'Position' },
    { k: 's.decalX', m: 's.decalXM', l: 'Décalage horizontal (X)', t: 'range', min: -400, max: 400, unit: 'px' },
    { k: 's.decalY', m: 's.decalYM', l: 'Décalage vertical (Y)', t: 'range', min: -400, max: 400, unit: 'px' },
    { k: 's.calque', l: 'Ordre des couches', t: 'range', min: 0, max: 20 },
    { t: 'heading', l: '📱 Téléphone' },
    { k: 's.ptM', l: 'Marge au-dessus (téléphone)', t: 'range', min: 0, max: 200, step: 2, unit: 'px', auto: 34, if: () => !MOB() },
    { k: 's.pbM', l: 'Marge en dessous (téléphone)', t: 'range', min: 0, max: 200, step: 2, unit: 'px', auto: 34, if: () => !MOB() },
    { k: 's.masquerMobile', l: 'Masquer sur téléphone', t: 'check' },
    { k: 's.masquerOrdi', l: 'Masquer sur ordinateur', t: 'check' }];
  const BLOC_STYLE = [
    { t: 'heading', l: 'Placement' },
    { k: 's.largeur', m: 's.largeurM', l: 'Largeur de l’élément', t: 'range', min: 10, max: 100, unit: '%', auto: 100, help: 'Ou tire la poignée ↔ à droite de l’élément, sur la page.' },
    { k: 's.pleine', l: 'Prendre toute la largeur de l’écran', t: 'check' },
    { k: 's.align', m: 's.alignM', l: 'Alignement', t: 'seg', options: [['', 'Auto'], ['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']] },
    { k: 's.mt', m: 's.mtM', l: 'Espace au-dessus', t: 'range', min: 0, max: 200, unit: 'px', auto: 14 },
    { k: 's.mb', m: 's.mbM', l: 'Espace en dessous', t: 'range', min: 0, max: 200, unit: 'px', auto: 0 },
    { k: 's.largeurMax', m: 's.largeurMaxM', l: 'Largeur maximale', t: 'range', min: 80, max: 1600, step: 10, unit: 'px', auto: 0 },
    { k: 's.decalX', m: 's.decalXM', l: 'Décalage horizontal (X)', t: 'range', min: -400, max: 400, unit: 'px' },
    { k: 's.decalY', m: 's.decalYM', l: 'Décalage vertical (Y)', t: 'range', min: -400, max: 400, unit: 'px' },
    { k: 's.calque', l: 'Ordre des couches', t: 'range', min: 0, max: 20 },
    { t: 'heading', l: 'Fond et cadre' },
    { k: 's.fond', l: 'Couleur de fond', t: 'color' },
    { k: 's.degrade.actif', l: 'Fond en dégradé', t: 'check', rerender: true },
    { k: 's.degrade.c1', l: 'Couleur 1', t: 'color', if: o => o.s.degrade && o.s.degrade.actif },
    { k: 's.degrade.c2', l: 'Couleur 2', t: 'color', if: o => o.s.degrade && o.s.degrade.actif },
    { k: 's.degrade.angle', l: 'Direction', t: 'range', min: 0, max: 360, step: 5, unit: '°', if: o => o.s.degrade && o.s.degrade.actif },
    { k: 's.padding', m: 's.paddingM', l: 'Marge intérieure', t: 'range', min: 0, max: 120, unit: 'px' },
    { k: 's.encadre', l: 'Encadré avec bordure d’accent', t: 'check' },
    { k: 's.bordure.largeur', l: 'Bordure : épaisseur', t: 'range', min: 0, max: 16, unit: 'px' },
    { k: 's.bordure.couleur', l: 'Bordure : couleur', t: 'color' },
    { k: 's.bordure.rayon', l: 'Coins arrondis', t: 'range', min: 0, max: 80, unit: 'px' },
    { k: 's.ombre', l: 'Ombre', t: 'select', options: [['', 'Aucune'], ['douce', 'Douce'], ['forte', 'Forte'], ['lueur', 'Lueur colorée']] },
    { k: 's.couleur', l: 'Couleur du texte', t: 'color' },
    { t: 'heading', l: '📱 Téléphone' },
    { k: 's.mtM', l: 'Espace au-dessus (téléphone)', t: 'range', min: 0, max: 160, unit: 'px', auto: 12, if: () => !MOB() },
    { k: 's.masquerMobile', l: 'Masquer sur téléphone', t: 'check' },
    { k: 's.masquerOrdi', l: 'Masquer sur ordinateur', t: 'check' }];
  const typo = (base, l) => [
    { t: 'heading', l },
    { k: base + '.police', l: 'Police', t: 'font' },
    { k: base + '.taille', m: base + '.tailleM', l: 'Taille', t: 'range', min: 8, max: 160, unit: 'px', auto: 0 },
    { k: base + '.tailleM', l: '📱 Taille (téléphone)', t: 'range', min: 8, max: 100, unit: 'px', auto: 0, if: () => !MOB() },
    { k: base + '.graisse', l: 'Épaisseur', t: 'select', options: [['', 'Auto'], ['300', 'Fine'], ['400', 'Normale'], ['500', 'Moyenne'], ['600', 'Semi-grasse'], ['700', 'Grasse'], ['800', 'Très grasse']] },
    { k: base + '.majuscules', l: 'Majuscules', t: 'seg', options: [['', 'Auto'], ['oui', 'MAJUSCULES'], ['non', 'Normal']] },
    { k: base + '.italique', l: 'Italique', t: 'check' },
    { k: base + '.souligne', l: 'Souligné', t: 'check' },
    { k: base + '.interligne', m: base + '.interligneM', l: 'Interligne', t: 'range', min: 0.8, max: 3, step: 0.05, auto: 0 },
    { k: base + '.interlettrage', m: base + '.interlettrageM', l: 'Interlettrage', t: 'range', min: -0.1, max: 0.8, step: 0.01, unit: 'em', auto: 0 },
    { k: base + '.couleur', l: 'Couleur', t: 'color' },
    { k: base + '.degrade.actif', l: 'Couleur en dégradé', t: 'check', rerender: true },
    { k: base + '.degrade.c1', l: 'Dégradé : couleur 1', t: 'color', if: o => (M.get(o, base + '.degrade') || {}).actif },
    { k: base + '.degrade.c2', l: 'Dégradé : couleur 2', t: 'color', if: o => (M.get(o, base + '.degrade') || {}).actif },
    { k: base + '.degrade.angle', l: 'Dégradé : direction', t: 'range', min: 0, max: 360, step: 5, unit: '°', if: o => (M.get(o, base + '.degrade') || {}).actif },
    { k: base + '.fond', l: 'Arrière-plan du texte', t: 'color' },
    { k: base + '.ombre', l: 'Ombre', t: 'select', options: [['', 'Aucune'], ['douce', 'Douce'], ['forte', 'Forte'], ['neon', 'Néon'], ['contour', 'Contour']] },
    { k: base + '.largeurMax', l: 'Largeur maximale du texte', t: 'range', min: 120, max: 1600, step: 10, unit: 'px', auto: 0 }];
  const LIENS = [{ t: 'heading', l: 'Liens' }, { k: 's.lien.couleur', l: 'Couleur des liens', t: 'color' },
    { k: 's.lien.survol', l: 'Effet au survol des liens', t: 'select', options: [['', 'Par défaut'], ['souligne', 'Soulignement animé'], ['couleur', 'Changement de couleur'], ['surligne', 'Surlignage'], ['aucun', 'Aucun']] }];
  LIENS.forEach(f => { if (f.k) f.k = f.k.replace(/^s\./, 's.'); });
  const animFields = base => [
    { k: base + '.type', l: 'Animation d’entrée', t: 'select', options: M.ANIMS, rerender: true },
    { k: base + '.duree', l: 'Durée', t: 'range', min: 0.2, max: 3, step: 0.1, unit: 's', auto: 0.9, if: o => (M.get(o, base) || {}).type },
    { k: base + '.delai', l: 'Délai avant de commencer', t: 'range', min: 0, max: 3, step: 0.1, unit: 's', if: o => (M.get(o, base) || {}).type },
    { t: 'action', l: '▶ Rejouer l’animation', act: 'replay', if: o => (M.get(o, base) || {}).type }];
  const imageFields = (cover, disp, inArr, logo, blocImg) => [
    { k: 'src', l: 'Image', t: 'image' },
    ...(cover ? [] : [{ k: 'alt', l: 'Description (pour Google et l’accessibilité)', t: 'text' }]),
    ...(cover || logo ? [] : [{ k: 'ratio', l: 'Format de cette image', t: 'select', options: [['', 'Comme la galerie'], ...RATIOS], if: () => inArr && disp !== 'puzzle' },
      { k: 'legendeOn', l: 'Afficher une légende', t: 'check', if: () => inArr, after: o => { if (!o.legendeOn) o.legende = ''; } },
      { k: 'legende', l: 'Légende', t: 'text', if: o => inArr && (o.legendeOn || o.legende) },
      { t: 'note', l: 'Légende : bouton « Légende » sur l’image, ou onglet Contenu de l’élément.', if: () => blocImg },
      { k: 'fit', l: 'Ajustement', t: 'seg', options: [['cover', 'Remplir le cadre'], ['contain', 'Image entière']] }]),
    ...(logo ? [] : [{ k: 'posX', l: 'Cadrage horizontal (X)', t: 'range', min: 0, max: 100, unit: '%', auto: 50 }, { k: 'posY', l: 'Cadrage vertical (Y)', t: 'range', min: 0, max: 100, unit: '%', auto: 50 }]),
    ...(cover || logo ? [] : [{ k: 'zoom', l: 'Zoom', t: 'range', min: 100, max: 250, step: 5, unit: '%', auto: 100 }]),
    ...(inArr && ['puzzle', 'grille'].includes(disp) ? [{ k: 'w', l: 'Largeur (en colonnes)', t: 'range', min: 1, max: 6, auto: 1 }] : []),
    ...(inArr && disp === 'puzzle' ? [{ k: 'h', l: 'Hauteur (en rangées)', t: 'range', min: 1, max: 4, auto: 1 }] : []),
    ...(cover || logo ? [] : [{ k: 'lien', l: 'Lien au clic (optionnel)', t: 'text', help: 'Ex. https://… ou projet.html?id=freres. Sans lien, l’image s’agrandit au clic.' }])];
  const EFFETS = [
    { k: 'filtre', l: 'Filtre', t: 'select', options: M.FILTRES },
    { k: 'survol', l: 'Effet au survol', t: 'select', options: M.HOVERS },
    { t: 'heading', l: 'Superposition' },
    { k: 'superposition.couleur', l: 'Couleur', t: 'color' },
    { k: 'superposition.opacite', l: 'Intensité', t: 'range', min: 0, max: 95, unit: '%' },
    { k: 'superposition.degrade', l: 'En dégradé', t: 'check' },
    { t: 'heading', l: 'Bordure' },
    { k: 'bordure.largeur', l: 'Épaisseur', t: 'range', min: 0, max: 20, unit: 'px' },
    { k: 'bordure.couleur', l: 'Couleur', t: 'color' },
    { k: 'bordure.rayon', l: 'Coins arrondis', t: 'range', min: 0, max: 200, unit: 'px' },
    { k: 'fond', l: 'Arrière-plan (mode « image entière »)', t: 'color' },
    { t: 'heading', l: 'Texte par-dessus l’image' },
    { k: 'texteActif', l: 'Ajouter un texte sur l’image', t: 'check', rerender: true, after: o => { if (o.texteActif && !o.texte) o.texte = '<h2>Titre</h2><p>Texte sur l’image</p>'; if (!o.texteActif) o.texte = ''; } },
    { k: 'texteZone', l: 'Position du texte', t: 'zone9', if: o => o.texteActif || o.texte },
    { t: 'note', l: 'Le texte se modifie directement sur l’image : clique dedans.', if: o => o.texteActif || o.texte }];

  /* ---------- Fabrique de champs ---------- */
  function fields(obj, defs, ctx) { return defs.map(d => field(obj, d, ctx)).filter(Boolean); }
  const moveIn = (list, i, d) => { const j = i + d; if (j < 0 || j >= list.length) return false; [list[i], list[j]] = [list[j], list[i]]; return true; };
  const thumb = src => { const img = h('img', { alt: '', loading: 'lazy' }); if (src) { img.src = ED.src(src); img.onerror = () => { img.onerror = null; img.src = ED.rawUrl(src); }; } return img; };
  function field(obj, def, ctx) {
    if (def.if && !def.if(obj, ctx)) return null;
    // En mode 📱 : ce réglage ne change que la version téléphone
    if (def.m && MOB()) {
      def = Object.assign({}, def, { k: def.m, l: '📱 ' + (def.lm || def.l), deskK: def.k, after: null });
      if (def.t === 'seg' || def.t === 'select') def.options = def.options[0][0] === '' ? [['', '= Ordi'], ...def.options.slice(1)] : [['', '= Ordi'], ...def.options];
    }
    const has = x => x !== undefined && x !== null && x !== '';
    const get = () => M.get(obj, def.k);
    const set = (v, noRerender) => { M.set(obj, def.k, v); if (def.after) def.after(obj, v, ctx); changed(); if (def.rerender && !noRerender) ctx.rerender(); };
    const mobDiff = def.m && !MOB() && has(M.get(obj, def.m)) ? h('span', { class: 'f-mob', title: 'Une valeur différente est réglée pour le téléphone (bouton 📱 Mobile en haut)' }, '📱 autre réglage sur téléphone') : null;
    const wrap = (...kids) => h('div', { class: 'f f-' + def.t + (def.deskK ? ' f-m' : '') }, def.l ? h('label', { class: 'f-l' }, def.l, mobDiff) : null, ...kids, def.help ? h('p', { class: 'help' }, def.help) : null);
    const v = get();
    switch (def.t) {
      case 'heading': return h('h4', { class: 'pn-h' }, def.l);
      case 'note': return h('p', { class: 'pn-note' }, def.l);
      case 'action': return h('button', { class: 'btn ghost wide pn-act', onclick: () => doAct(def.act) }, def.l);
      case 'text': return wrap(h('input', { type: 'text', value: v ?? '', placeholder: def.ph || '', oninput: e => set(e.target.value) }));
      case 'tags': return wrap(h('input', { type: 'text', value: M.arr(v).join(', '), oninput: e => set(e.target.value.split(',').map(x => x.trim()).filter(Boolean)) }));
      case 'lines': return wrap(h('textarea', { rows: 4, value: M.arr(v).join('\n'), oninput: e => set(e.target.value.split('\n').map(x => x.trim()).filter(Boolean)) }));
      case 'video': {
        const stt = h('div', { class: 'vid-st' });
        const upd = () => { const x = M.video(get()); stt.textContent = !get() ? '' : x ? `✓ ${{ youtube: 'YouTube', vimeo: 'Vimeo', file: 'Fichier vidéo' }[x.type]} reconnu` : '⚠ Lien non reconnu'; stt.className = 'vid-st ' + (x ? 'ok' : 'warn'); };
        upd();
        return wrap(h('input', { type: 'url', inputmode: 'url', value: v || '', placeholder: 'https://www.youtube.com/watch?v=…', oninput: e => { set(e.target.value.trim()); upd(); } }), stt);
      }
      case 'select': { const s = h('select', { onchange: e => set(e.target.value) }, def.options.map(([val, l]) => h('option', { value: val }, l))); s.value = v ?? def.options[0][0]; return wrap(s); }
      case 'font': { const s = h('select', { onchange: e => set(e.target.value) }, h('option', { value: '' }, 'Police du site'), Object.keys(M.FONTS).map(f => h('option', { value: f }, f))); s.value = v || ''; return wrap(s); }
      case 'seg': return wrap(h('div', { class: 'seg' }, def.options.map(([val, l]) => h('button', { type: 'button', class: String(v ?? def.options[0][0]) === String(val) ? 'on' : '', onclick: e => { set(val); $$('button', e.target.parentNode).forEach(b => b.classList.toggle('on', b === e.target)); } }, l))));
      case 'check': return h('label', { class: 'f f-check' }, h('input', { type: 'checkbox', checked: !!v, onchange: e => set(e.target.checked) }), h('span', { class: 'sw' }), h('span', {}, def.l));
      case 'color': {
        const txt = h('input', { type: 'text', class: 'hex', value: v || '', placeholder: 'Aucune', oninput: e => { const x = e.target.value.trim(); if (!x || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(x) || /^rgba?\(/.test(x)) { set(x); if (/^#[0-9a-f]{6}$/i.test(x)) pick.value = x; } } });
        const pick = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v || '') ? v : '#ffffff', oninput: e => { set(e.target.value); txt.value = e.target.value; } });
        return wrap(h('div', { class: 'row' }, pick, txt, h('button', { type: 'button', class: 'sm', title: 'Aucune couleur', onclick: () => { set(''); txt.value = ''; } }, '×')));
      }
      case 'range': {
        const unset = !has(v);
        const fb = def.deskK ? M.get(obj, def.deskK) : undefined;
        const unsetLabel = def.deskK ? '= ordi' : (def.auto !== undefined ? 'Auto' : '—');
        const rest = has(fb) && !isNaN(+fb) ? +fb : (def.auto || def.min);
        const out = h('output', {}, unset ? unsetLabel : `${v}${def.unit ? ' ' + def.unit : ''}`);
        const r = h('input', { type: 'range', min: def.min, max: def.max, step: def.step || 1, value: unset ? rest : v,
          oninput: e => { const x = +e.target.value; set(x, true); out.textContent = `${x}${def.unit ? ' ' + def.unit : ''}`; }, onchange: () => { if (def.rerender) ctx.rerender(); } });
        return wrap(h('div', { class: 'row' }, r, out, h('button', { type: 'button', class: 'sm', title: def.deskK ? 'Comme sur ordinateur' : 'Valeur par défaut', onclick: () => { set(''); out.textContent = unsetLabel; r.value = rest; } }, '↺')));
      }
      case 'image': {
        const box = h('div', { class: 'thumb' + (v ? '' : ' empty') }, thumb(v), h('span', {}, 'Aucune image'));
        const apply = p => { set(p); ctx.rerender(); };
        return wrap(box, h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn small primary', onclick: () => openLibrary({ pick: true, onPick: apply }) }, v ? 'Changer' : 'Choisir dans la bibliothèque'),
          v ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => openCrop(v, apply) }, 'Rogner') : null,
          v ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => apply('') }, 'Retirer') : null));
      }
      case 'doc': {
        const name = v ? String(v).split('/').pop() : 'Aucun document';
        return wrap(h('div', { class: 'doc-pick' }, h('span', { class: 'dl-ext' }, v ? M.ext(v).toUpperCase() : '—'), h('span', { class: 'doc-name' }, name)),
          h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn small primary', onclick: () => openLibrary({ tab: 'documents', pick: true, onPick: p => { set(p); ctx.rerender(); } }) }, v ? 'Changer' : 'Choisir un document'),
            v ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { set(''); ctx.rerender(); } }, 'Retirer') : null));
      }
      case 'layouts': {
        const Lg = { rangees: '<rect x="2" y="3" width="17" height="11" rx="2"/><rect x="21" y="3" width="23" height="11" rx="2"/><rect x="2" y="16" width="26" height="11" rx="2"/><rect x="30" y="16" width="14" height="11" rx="2"/>', puzzle: '<rect x="2" y="2" width="26" height="26" rx="2"/><rect x="31" y="2" width="13" height="12" rx="2"/><rect x="31" y="16" width="13" height="12" rx="2"/>', grille: '<rect x="2" y="2" width="12" height="12" rx="2"/><rect x="17" y="2" width="12" height="12" rx="2"/><rect x="32" y="2" width="12" height="12" rx="2"/><rect x="2" y="16" width="12" height="12" rx="2"/><rect x="17" y="16" width="12" height="12" rx="2"/><rect x="32" y="16" width="12" height="12" rx="2"/>', mosaique: '<rect x="2" y="2" width="12" height="16" rx="2"/><rect x="17" y="2" width="12" height="9" rx="2"/><rect x="32" y="2" width="12" height="13" rx="2"/><rect x="2" y="21" width="12" height="7" rx="2"/><rect x="17" y="14" width="12" height="14" rx="2"/><rect x="32" y="18" width="12" height="10" rx="2"/>', bande: '<rect x="-6" y="5" width="16" height="20" rx="2"/><rect x="13" y="5" width="20" height="20" rx="2"/><rect x="36" y="5" width="16" height="20" rx="2"/>', diaporama: '<rect x="6" y="3" width="34" height="20" rx="2"/><circle cx="19" cy="27" r="1.4"/><circle cx="23" cy="27" r="1.4"/><circle cx="27" cy="27" r="1.4"/>', pile: '<rect x="4" y="2" width="38" height="12" rx="2"/><rect x="4" y="16" width="38" height="12" rx="2"/>', duo: '<rect x="2" y="4" width="20" height="22" rx="2"/><rect x="24" y="4" width="20" height="22" rx="2"/>' };
        return wrap(h('div', { class: 'layouts' }, M.DISPOSITIONS.map(([k, l]) => h('button', { type: 'button', class: v === k ? 'on' : '', title: l, onclick: () => set(k), html: `<svg viewBox="0 0 46 30">${Lg[k]}</svg><span>${l.split(' (')[0]}</span>` }))));
      }
      case 'zone9': return wrap(h('div', { class: 'zone9' }, ['haut-gauche', 'haut', 'haut-droite', 'gauche', 'centre', 'droite', 'bas-gauche', 'bas', 'bas-droite'].map(z => h('button', { type: 'button', title: z, class: (v || 'centre') === z ? 'on' : '', onclick: () => set(z, false) }))));
      case 'genre': { const s = h('select', { onchange: e => set(e.target.value) }, h('option', { value: '' }, 'Toutes les typologies'), M.genres(ED.data).map(x => h('option', { value: x }, x))); s.value = v || ''; return wrap(s); }
      case 'genres': {
        const found = M.genres(ED.data), order = [...M.arr(v).filter(x => found.includes(x)), ...found.filter(x => !M.arr(v).includes(x))];
        const mv = (i, d) => { if (moveIn(order, i, d)) { set(order.slice()); ctx.rerender(); } };
        return wrap(h('div', { class: 'mini-list' }, order.length ? order.map((x, i) => h('div', { class: 'ml-row' }, h('span', {}, x), h('span', {}, h('button', { class: 'sm', onclick: () => mv(i, -1) }, '↑'), h('button', { class: 'sm', onclick: () => mv(i, 1) }, '↓')))) : h('p', { class: 'help' }, 'Indique un genre sur tes projets (bouton ci-dessous).')));
      }
      case 'pairs': return wrap(pairsEditor(obj, def, set));
      case 'buttons': return wrap(buttonsEditor(M.arr(get()), list => set(list)));
      case 'files': return wrap(filesEditor(obj, def, set));
      case 'gallery': return wrap(galleryEditor(obj, def, ctx));
      case 'liste': return wrap(listeEditor(obj, def, set, ctx));
      default: return null;
    }
  }
  const tools = (list, i, save, draw) => h('div', { class: 'pair-tools' },
    h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, -1)) { save(); draw(); } } }, '↑'), h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, 1)) { save(); draw(); } } }, '↓'),
    h('button', { class: 'sm danger', onclick: () => { list.splice(i, 1); save(); draw(); } }, '✕'));
  function pairsEditor(obj, def, set) {
    const list = M.arr(M.get(obj, def.k)).slice(), box = h('div', { class: 'pairs' });
    const save = () => set(list.map(x => Object.assign({}, x)), true);
    const draw = () => box.replaceChildren(...list.map((it, i) => h('div', { class: 'pair' },
      h('input', { type: 'text', value: it[def.a[0]] || '', placeholder: def.a[1], oninput: e => { it[def.a[0]] = e.target.value; save(); } }),
      h(def.area ? 'textarea' : 'input', { type: 'text', rows: 2, value: it[def.b[0]] || '', placeholder: def.b[1], oninput: e => { it[def.b[0]] = e.target.value; save(); } }),
      tools(list, i, save, draw))),
      h('button', { type: 'button', class: 'btn small ghost', onclick: () => { list.push({ [def.a[0]]: '', [def.b[0]]: '' }); save(); draw(); } }, '+ Ajouter une ligne'));
    draw();
    return box;
  }
  function listeEditor(obj, def, set, ctx) {
    const list = M.arr(M.get(obj, def.k)), box = h('div', { class: 'pairs' });
    const save = () => set(list, true);
    const draw = () => box.replaceChildren(...list.map((it, i) => {
      it.logo = M.img(it.logo);
      const lg = h('button', { class: 'logo-pick', title: 'Logo (école, structure…)', onclick: () => openLibrary({ pick: true, onPick: src => { it.logo.src = src; save(); draw(); } }) }, it.logo.src ? thumb(it.logo.src) : h('span', {}, '+ Logo'));
      return h('div', { class: 'pair liste-row' },
        h('div', { class: 'liste-top' }, lg, h('div', { class: 'liste-f' },
          h('input', { type: 'text', value: it.date || '', placeholder: 'Date (ex. 2022 — 2024)', oninput: e => { it.date = e.target.value; save(); } }),
          h('input', { type: 'text', value: it.titre || '', placeholder: 'Intitulé (diplôme, poste, projet)', oninput: e => { it.titre = e.target.value; save(); } }))),
        h('input', { type: 'text', value: it.sousTitre || '', placeholder: 'École, structure, lieu…', oninput: e => { it.sousTitre = e.target.value; save(); } }),
        h('input', { type: 'text', value: it.lien || '', placeholder: 'Lien (optionnel) https://…', oninput: e => { it.lien = e.target.value; save(); } }),
        h('div', { class: 'row end' }, it.logo.src ? h('button', { class: 'sm', onclick: () => { it.logo.src = ''; save(); draw(); } }, 'Retirer le logo') : null, tools(list, i, save, draw)));
    }), h('button', { type: 'button', class: 'btn small ghost', onclick: () => { list.push({ date: '', titre: 'Nouvelle ligne', sousTitre: '', html: '', logo: { src: '' }, lien: '' }); save(); draw(); } }, '+ Ajouter une ligne'));
    if (!M.get(obj, def.k)) M.set(obj, def.k, list);
    draw();
    return box;
  }
  function buttonsEditor(list, save) {
    const box = h('div', { class: 'btn-list' }), pages = ED.data.pages;
    const draw = () => box.replaceChildren(...list.map((b, i) => {
      const cible = (() => {
        if (b.type === 'page') { const s = h('select', { onchange: e => { b.cible = e.target.value; save(list); } }, pages.map(p => h('option', { value: p.id }, (p.type === 'projet' ? 'Projet : ' : '') + p.titre))); s.value = b.cible || ''; return s; }
        if (b.type === 'fichier') return h('div', { class: 'row' }, h('span', { class: 'help', style: 'flex:1;word-break:break-all' }, b.cible ? b.cible.split('/').pop() : 'Aucun document'), h('button', { class: 'btn small', onclick: () => openLibrary({ tab: 'documents', pick: true, onPick: p => { b.cible = p; save(list); draw(); } }) }, 'Choisir un document'));
        return h('input', { type: 'text', value: b.cible || '', placeholder: { lien: 'https://…', email: 'ton@email.com', tel: '06 12 34 56 78' }[b.type || 'lien'], oninput: e => { b.cible = e.target.value; save(list); } });
      })();
      const sel = (opts, val, on) => { const s = h('select', { onchange: e => on(e.target.value) }, opts.map(([k, l]) => h('option', { value: k }, l))); s.value = val; return s; };
      return h('div', { class: 'btn-card' },
        h('input', { type: 'text', value: b.texte || '', placeholder: 'Texte du bouton', oninput: e => { b.texte = e.target.value; save(list); } }),
        sel([['lien', 'Lien vers un site'], ['page', 'Page de mon site'], ['email', 'Envoyer un e-mail'], ['tel', 'Appeler'], ['fichier', 'Télécharger un document']], b.type || 'lien', x => { b.type = x; b.cible = ''; save(list); draw(); }),
        cible,
        h('div', { class: 'row' }, sel([['plein', 'Plein'], ['contour', 'Contour'], ['accent', 'Couleur d’accent'], ['texte', 'Texte souligné']], b.style || 'plein', x => { b.style = x; save(list); }),
          sel([['', 'Taille normale'], ['petit', 'Petit'], ['grand', 'Grand']], b.taille || '', x => { b.taille = x; save(list); })),
        h('div', { class: 'row end' }, h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, -1)) { save(list); draw(); } } }, '↑'), h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, 1)) { save(list); draw(); } } }, '↓'), h('button', { class: 'sm danger', onclick: () => { list.splice(i, 1); save(list); draw(); } }, '✕ Supprimer')));
    }), h('button', { type: 'button', class: 'btn small ghost', onclick: () => { list.push({ texte: 'Me contacter', type: 'page', cible: (pages.find(p => p.id === 'contact') || pages[0]).id, style: 'plein' }); save(list); draw(); } }, '+ Ajouter un bouton'));
    draw();
    return box;
  }
  function filesEditor(obj, def, set) {
    const list = M.arr(M.get(obj, def.k)), box = h('div', { class: 'pairs' });
    const save = () => set(list, true);
    const draw = () => box.replaceChildren(...list.map((f, i) => h('div', { class: 'pair' },
      h('input', { type: 'text', value: f.nom || '', placeholder: 'Nom affiché (ex. Mon CV)', oninput: e => { f.nom = e.target.value; save(); } }),
      h('span', { class: 'help', style: 'word-break:break-all' }, (M.ext(f.src).toUpperCase() || '?') + ' · ' + String(f.src || '').split('/').pop()),
      tools(list, i, save, draw))),
      h('button', { type: 'button', class: 'btn small', onclick: () => openLibrary({ tab: 'documents', pick: true, multi: true, onPick: srcs => { M.arr(srcs).forEach(src => { const d = ED.data.documents.find(x => x.src === src); list.push({ nom: d ? d.nom : src.split('/').pop(), src }); }); save(); draw(); } }) }, '+ Ajouter depuis mes documents'));
    draw();
    return box;
  }
  function galleryEditor(obj, def, ctx) {
    if (!M.get(obj, def.k)) M.set(obj, def.k, []);
    const list = M.get(obj, def.k), box = h('div', { class: 'gal-ed' });
    const path = i => `${ctx.bi.path}.${def.k}.${i}`;
    const draw = () => box.replaceChildren(...list.map((it, i) => h('div', { class: 'ge-it' },
      h('button', { class: 'ge-img', title: 'Réglages de cette image', onclick: () => { st.sel = { sid: ctx.sec.id, bid: ctx.bloc.id, path: path(i), kind: 'image' }; st.tab = 'image'; buildPanel(); ov.draw(); } }, thumb(typeof it === 'string' ? it : it.src), h('b', {}, i + 1)),
      h('div', { class: 'ge-tools' }, h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, -1)) { changed(); draw(); } } }, '←'), h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, 1)) { changed(); draw(); } } }, '→'), h('button', { class: 'sm danger', onclick: () => { list.splice(i, 1); changed(); draw(); } }, '✕')))),
      h('button', { class: 'ge-add', onclick: () => addImages(ctx.bloc.id) }, h('b', {}, '+'), 'Ajouter depuis la bibliothèque'));
    draw();
    return box;
  }

  /* ==========================================================================
     Fenêtres
     ========================================================================== */
  function modal(title, content, cls = '', opts = {}) {
    const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape' && !opts.locked) close(); };
    const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back && !opts.locked) close(); } },
      h('div', { class: 'modal ' + cls, role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'modal-head' }, h('strong', {}, title), opts.locked ? null : h('button', { class: 'pn-x', onclick: close, title: 'Fermer' }, '×')),
        h('div', { class: 'modal-body' }, content)));
    document.body.append(back);
    document.addEventListener('keydown', esc);
    return { close, body: back.querySelector('.modal-body'), el: back };
  }
  const VIGN = {
    couverture: '<rect x="2" y="2" width="116" height="68" rx="5" fill="#2e3566"/><rect x="34" y="27" width="52" height="7" rx="2" fill="#fff"/><rect x="42" y="38" width="36" height="3" rx="1.5" fill="#b9c0ff"/>',
    entete: '<rect x="50" y="12" width="20" height="6" rx="3" fill="#fff"/><rect x="24" y="25" width="72" height="12" rx="2" fill="#e8e8f0"/><rect x="38" y="44" width="44" height="4" rx="2" fill="#777"/>',
    texte: '<rect x="14" y="12" width="56" height="7" rx="2" fill="#e8e8f0"/><rect x="14" y="26" width="92" height="3" fill="#777"/><rect x="14" y="33" width="88" height="3" fill="#777"/><rect x="14" y="40" width="92" height="3" fill="#777"/><rect x="14" y="47" width="60" height="3" fill="#777"/>',
    encadre: '<rect x="10" y="8" width="100" height="56" rx="3" fill="#232845" stroke="#444"/><rect x="10" y="8" width="3" height="56" fill="#8a9bff"/><rect x="22" y="26" width="56" height="6" rx="2" fill="#e8e8f0"/><rect x="22" y="38" width="76" height="3" fill="#777"/>',
    colonnes: '<rect x="8" y="10" width="48" height="52" rx="3" fill="#3b4270"/><rect x="64" y="18" width="40" height="6" rx="2" fill="#e8e8f0"/><rect x="64" y="30" width="46" height="3" fill="#777"/><rect x="64" y="37" width="42" height="3" fill="#777"/>',
    deux: '<rect x="8" y="12" width="50" height="5" fill="#e8e8f0"/><rect x="8" y="24" width="50" height="3" fill="#777"/><rect x="8" y="31" width="46" height="3" fill="#777"/><g fill="#555"><rect x="66" y="12" width="46" height="1"/><rect x="66" y="24" width="46" height="1"/><rect x="66" y="36" width="46" height="1"/></g>',
    image: '<rect x="8" y="6" width="104" height="60" rx="3" fill="#3b4270"/><path d="M20 56l22-22 16 16 10-10 26 16z" fill="#5d6aa8"/>',
    galerie: '<rect x="6" y="6" width="54" height="60" rx="3" fill="#3b4270"/><rect x="64" y="6" width="50" height="28" rx="3" fill="#4a548c"/><rect x="64" y="38" width="23" height="28" rx="3" fill="#5d6aa8"/><rect x="91" y="38" width="23" height="28" rx="3" fill="#3b4270"/>',
    video: '<rect x="8" y="6" width="104" height="60" rx="3" fill="#2a2a2a"/><circle cx="60" cy="36" r="13" fill="none" stroke="#fff"/><path d="M56 30l10 6-10 6z" fill="#fff"/>',
    projets: '<rect x="8" y="6" width="50" height="28" rx="2" fill="#3b4270"/><rect x="62" y="6" width="50" height="28" rx="2" fill="#4a548c"/><rect x="8" y="38" width="30" height="3" fill="#e8e8f0"/><rect x="62" y="38" width="30" height="3" fill="#e8e8f0"/><rect x="34" y="54" width="14" height="6" rx="3" fill="#fff"/><rect x="52" y="54" width="14" height="6" rx="3" fill="none" stroke="#888"/>',
    fiche: '<rect x="8" y="12" width="56" height="5" fill="#e8e8f0"/><rect x="8" y="24" width="56" height="3" fill="#777"/><rect x="8" y="31" width="52" height="3" fill="#777"/><g fill="#555"><rect x="74" y="12" width="38" height="1"/><rect x="74" y="22" width="38" height="1"/><rect x="74" y="32" width="38" height="1"/></g>',
    infos: '<g fill="#555"><rect x="10" y="14" width="100" height="1"/><rect x="10" y="30" width="100" height="1"/><rect x="10" y="46" width="100" height="1"/></g><g fill="#ddd"><rect x="10" y="20" width="22" height="3"/><rect x="10" y="36" width="18" height="3"/></g><g fill="#888"><rect x="88" y="20" width="22" height="3"/><rect x="92" y="36" width="18" height="3"/></g>',
    credits: '<g fill="#ddd"><rect x="10" y="12" width="30" height="3"/><rect x="10" y="30" width="24" height="3"/><rect x="10" y="48" width="34" height="3"/></g><g fill="#888"><rect x="10" y="19" width="96" height="2"/><rect x="10" y="37" width="80" height="2"/><rect x="10" y="55" width="90" height="2"/></g>',
    parcours2: '<rect x="8" y="8" width="30" height="5" fill="#e8e8f0"/><rect x="64" y="8" width="34" height="5" fill="#e8e8f0"/><g fill="#5d6aa8"><rect x="64" y="20" width="10" height="10" rx="2"/><rect x="64" y="36" width="10" height="10" rx="2"/></g><g fill="#888"><rect x="8" y="22" width="44" height="3"/><rect x="8" y="30" width="36" height="2"/><rect x="8" y="40" width="44" height="3"/><rect x="8" y="48" width="30" height="2"/><rect x="78" y="22" width="32" height="3"/><rect x="78" y="38" width="28" height="3"/></g>',
    liste: '<g fill="#888"><rect x="8" y="14" width="16" height="3"/><rect x="8" y="38" width="16" height="3"/></g><rect x="30" y="8" width="16" height="16" rx="3" fill="#5d6aa8"/><rect x="30" y="32" width="16" height="16" rx="3" fill="#5d6aa8"/><g fill="#ddd"><rect x="52" y="10" width="40" height="4"/><rect x="52" y="34" width="34" height="4"/></g><g fill="#777"><rect x="52" y="18" width="30" height="2"/><rect x="52" y="42" width="26" height="2"/></g>',
    tags: '<g fill="none" stroke="#888"><rect x="10" y="26" width="30" height="12" rx="6"/><rect x="44" y="26" width="36" height="12" rx="6"/><rect x="84" y="26" width="26" height="12" rx="6"/></g>',
    contact: '<rect x="10" y="12" width="40" height="7" rx="2" fill="#e8e8f0"/><rect x="10" y="28" width="46" height="4" fill="#fff"/><g fill="#555"><rect x="66" y="18" width="46" height="1"/><rect x="66" y="30" width="46" height="1"/><rect x="66" y="48" width="46" height="1"/></g>',
    reseaux: '<g fill="none" stroke="#bbb"><circle cx="38" cy="36" r="9"/><circle cx="60" cy="36" r="9"/><circle cx="82" cy="36" r="9"/></g>',
    boutons: '<rect x="20" y="28" width="38" height="14" fill="#fff"/><rect x="62" y="28" width="38" height="14" fill="none" stroke="#fff"/>',
    document: '<rect x="30" y="26" width="60" height="18" fill="none" stroke="#fff"/><path d="M38 30h6l3 3v7h-9z" fill="none" stroke="#fff"/><rect x="52" y="33" width="30" height="3" fill="#fff"/>',
    fichiers: '<g fill="none" stroke="#555"><rect x="10" y="12" width="100" height="16"/><rect x="10" y="34" width="100" height="16"/></g><rect x="14" y="16" width="14" height="8" rx="2" fill="#8a9bff"/><rect x="14" y="38" width="14" height="8" rx="2" fill="#8a9bff"/>',
    spotify: '<rect x="8" y="16" width="104" height="40" rx="8" fill="#1d1d1d"/><rect x="14" y="22" width="28" height="28" rx="3" fill="#3b4270"/><rect x="48" y="26" width="40" height="4" fill="#fff"/><circle cx="100" cy="42" r="6" fill="#1ed760"/>',
    espace: '<rect x="10" y="35" width="100" height="1.5" fill="#888"/>',
    libre: '<rect x="10" y="10" width="56" height="42" rx="3" fill="#3b4270"/><rect x="50" y="30" width="56" height="30" rx="3" fill="#232845" stroke="#8a9bff"/><rect x="58" y="38" width="30" height="5" fill="#fff"/>'
  };
  const BICO = { pastille: '◉', surtitre: 'ᵃ', titre: 'T', soustitre: 't', texte: '¶', tags: '#', image: '▣', galerie: '▦', video: '▶', spotify: '♫', infos: '☰', credits: '👥', liste: '🎓', boutons: '⬭', document: '📎', fichiers: '⬇', reseaux: '◎', coordonnees: '@', formulaire: '✉', projets: '▤', espace: '↕' };
  function openAdd(index) {
    const m = modal('Ajouter une section', h('div', { class: 'add-grid' }, M.GROUPES.map(g => h('div', { class: 'add-group' },
      h('h4', {}, g),
      h('div', { class: 'add-cards' }, Object.entries(M.TYPES).filter(([, t]) => t.groupe === g).map(([k, t]) =>
        h('button', { class: 'add-card', onclick: () => { m.close(); insertSection(k, index); } },
          h('span', { class: 'add-vign', html: `<svg viewBox="0 0 120 72">${VIGN[k] || ''}</svg>` }), h('strong', {}, t.nom), h('small', {}, t.desc))))))), 'wide');
  }
  function insertSection(type, index) {
    const s = M.section(type), p = page();
    p.sections.splice(Math.max(0, Math.min(index, p.sections.length)), 0, s);
    changed(); renderFrame(); select(s.id);
    const el = fdoc && fdoc.getElementById(s.id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ED.toast(`Section « ${M.TYPES[type].nom} » ajoutée. Survole ses éléments pour les modifier, déplacer ou supprimer.`);
  }
  function openAddBloc(sid, index, col) {
    const r = secById(sid); if (!r) return;
    const m = modal('Ajouter un élément', h('div', {},
      h('p', { class: 'help', style: 'margin-top:0' }, `Dans la section « ${M.nomSection(r.sec)} ».`),
      M.BLOC_GROUPES.map(g => h('div', { class: 'add-group' }, h('h4', {}, g),
        h('div', { class: 'bloc-cards' }, Object.entries(M.BLOCS).filter(([, b]) => b.g === g).map(([k, b]) =>
          h('button', { class: 'bloc-card', onclick: () => {
            m.close();
            const nb = M.bloc(k);
            if (r.sec.layout === 'deux') nb.col = col || 'g';
            if (r.sec.layout === 'libre') nb.pos = { x: 30, y: 30, w: k === 'boutons' ? 24 : 40, z: Math.max(1, ...r.sec.blocs.map(x => +(x.pos || {}).z || 1)) + 1 };
            const at = index == null ? (col ? (() => { const same = r.sec.blocs.filter(x => (x.col || 'g') === col); return same.length ? r.sec.blocs.indexOf(same[same.length - 1]) + 1 : r.sec.blocs.length; })() : r.sec.blocs.length) : index;
            r.sec.blocs.splice(at, 0, nb);
            changed(); renderFrame(); selectBloc(nb.id, 'contenu');
            if (k === 'galerie') addImages(nb.id);
          } }, h('span', { class: 'bc-ico' }, BICO[k] || '•'), h('span', {}, b.nom))))))), 'mid');
  }

  /* ---------- Bibliothèque de photos et de documents ---------- */
  function openLibrary(opt = {}) {
    syncRepo().then(() => { if (box.isConnected) draw(); });
    let tab = opt.tab || 'photos', filtre = 'toutes', q = '';
    const picked = new Set();
    const box = h('div', { class: 'lib-wrap' });
    const m = modal(opt.pick ? (tab === 'documents' ? 'Choisis un document' : opt.multi ? 'Choisis des photos' : 'Choisis une photo') : 'Bibliothèque', box, 'wide');
    const upload = async files => {
      if (!ED.requireConnection()) return;
      const imgs = tab === 'photos';
      const added = [];
      for (let n = 0; n < files.length; n++) {
        const p = await ED.upload(files[n], 'bibliotheque', { raw: !imgs, max: 2400, label: files.length > 1 ? `${n + 1}/${files.length}` : '' });
        if (p) { added.push(p); if (opt.pick && opt.multi) picked.add(p); draw(); }
      }
      if (opt.pick && !opt.multi && added.length === 1) { m.close(); opt.onPick(added[0]); }
    };
    m.el.addEventListener('dragover', e => { e.preventDefault(); box.classList.add('drag'); });
    m.el.addEventListener('dragleave', () => box.classList.remove('drag'));
    m.el.addEventListener('drop', e => { e.preventDefault(); box.classList.remove('drag'); const f = [...(e.dataTransfer.files || [])]; if (f.length) upload(f); });
    function draw() {
      const used = usedPaths();
      const isPhotos = tab === 'photos';
      let items = isPhotos ? ED.data.bibliotheque : ED.data.documents;
      if (isPhotos) usedPaths().forEach(p => { if (/^images\//.test(p) && isImg(p) && !items.some(x => x.src === p)) items.push({ src: p, nom: p.split('/').pop().replace(/\.[^.]+$/, '') }); });
      items = items.filter(x => (!q || (x.nom + ' ' + x.src).toLowerCase().includes(q)) && (filtre === 'toutes' || (filtre === 'utilisees') === used.has(x.src)));
      const top = h('div', { class: 'lib-top' },
        opt.pick ? null : h('div', { class: 'seg' }, [['photos', 'Photos'], ['documents', 'Documents']].map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; draw(); } }, l))),
        h('button', { class: 'btn primary small', onclick: async () => upload(await ED.pickFiles(isPhotos ? 'image/*' : '*/*', true)) }, isPhotos ? '+ Envoyer des photos' : '+ Envoyer des documents'),
        h('input', { type: 'search', class: 'lib-search', placeholder: 'Rechercher…', value: q, oninput: e => { q = e.target.value.toLowerCase(); clearTimeout(box._t); box._t = setTimeout(draw, 150); } }),
        h('div', { class: 'seg' }, [['toutes', 'Toutes'], ['utilisees', 'Sur le site'], ['libres', 'Pas encore utilisées']].map(([k, l]) => h('button', { class: filtre === k ? 'on' : '', onclick: () => { filtre = k; draw(); } }, l))));
      const hint = h('p', { class: 'help' }, isPhotos
        ? 'Glisse des photos ici pour les ajouter. Elles sont allégées automatiquement. « Rogner » crée une copie recadrée, l’original est gardé.'
        : 'CV, dossier de presse, PDF… tout type de fichier (25 Mo maximum).');
      const grid = isPhotos
        ? h('div', { class: 'lib' }, items.map(x => h('div', { class: 'lib-it' + (picked.has(x.src) ? ' picked' : '') },
          h('button', { class: 'lib-img', title: x.src, onclick: () => {
            if (!opt.pick) return;
            if (opt.multi) { picked.has(x.src) ? picked.delete(x.src) : picked.add(x.src); draw(); } else { m.close(); opt.onPick(x.src); }
          } }, thumb(x.src), used.has(x.src) ? h('span', { class: 'lib-used' }, 'Sur le site') : null, opt.multi ? h('span', { class: 'lib-check' }, picked.has(x.src) ? '✓' : '') : null),
          h('div', { class: 'lib-meta' }, h('span', { class: 'lib-name' }, x.nom || x.src.split('/').pop()),
            h('span', {}, h('button', { class: 'sm', title: 'Rogner (crée une copie)', onclick: () => openCrop(x.src, p => { if (opt.pick && !opt.multi) { m.close(); opt.onPick(p); } else { if (opt.multi) picked.add(p); draw(); } }) }, '✂'),
              opt.pick ? null : h('button', { class: 'sm danger', title: 'Retirer de la bibliothèque', onclick: () => { if (used.has(x.src) && !confirm('Cette photo est utilisée sur ton site. La retirer quand même de la bibliothèque ? (Elle restera sur le site.)')) return; const i = ED.data.bibliotheque.findIndex(y => y.src === x.src); if (i > -1) ED.data.bibliotheque.splice(i, 1); changed({ render: false }); draw(); } }, '✕'))))))
        : h('div', { class: 'docs' }, items.map(x => h('div', { class: 'doc-row' + (picked.has(x.src) ? ' picked' : '') },
          h('span', { class: 'dl-ext' }, M.ext(x.src).toUpperCase().slice(0, 4) || '?'),
          h('input', { type: 'text', value: x.nom || '', title: 'Nom affiché', oninput: e => { x.nom = e.target.value; changed({ render: false }); } }),
          used.has(x.src) ? h('span', { class: 'lib-used static' }, 'Sur le site') : null,
          h('a', { class: 'sm', href: ED.src(x.src), target: '_blank', rel: 'noopener', title: 'Ouvrir' }, '↗'),
          opt.pick ? h('button', { class: 'btn small', onclick: () => { if (opt.multi) { picked.has(x.src) ? picked.delete(x.src) : picked.add(x.src); draw(); } else { m.close(); opt.onPick(x.src); } } }, picked.has(x.src) ? '✓ Choisi' : 'Choisir')
            : h('button', { class: 'sm danger', title: 'Retirer de la liste', onclick: () => { const i = ED.data.documents.indexOf(x); if (i > -1) ED.data.documents.splice(i, 1); changed({ render: false }); draw(); } }, '✕'))));
      const foot = opt.pick && opt.multi ? h('div', { class: 'lib-foot' }, h('button', { class: 'btn primary', disabled: !picked.size, onclick: () => { m.close(); opt.onPick([...picked]); } }, `Ajouter la sélection (${picked.size})`)) : null;
      box.replaceChildren(...[top, hint, items.length ? grid : h('p', { class: 'lib-empty' }, isPhotos ? 'Aucune photo pour l’instant : clique sur « + Envoyer des photos » ou glisse-les ici.' : 'Aucun document pour l’instant : clique sur « + Envoyer des documents ».'), foot].filter(Boolean));
    }
    draw();
  }

  /* ---------- Rogner une image ---------- */
  async function openCrop(src, onDone) {
    if (!ED.requireConnection()) return;
    let url;
    try { url = await ED.loadBlobUrl(src); } catch (e) { ED.toast('Impossible de charger cette image pour la rogner.', 'err'); return; }
    const RATIO = [['', 'Libre'], ['16/9', '16:9'], ['3/2', '3:2'], ['4/3', '4:3'], ['1/1', 'Carré'], ['4/5', '4:5'], ['9/16', '9:16'], ['2.39/1', '2.39:1']];
    let ratio = 0;
    const img = h('img', { alt: '', draggable: 'false' });
    const rect = h('div', { class: 'crop-rect' }, ...['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(k => h('span', { class: 'crop-h h-' + k, 'data-h': k })));
    const stage = h('div', { class: 'crop-stage' }, img, rect);
    const info = h('span', { class: 'help' });
    const seg = h('div', { class: 'seg' }, RATIO.map(([k, l], i) => h('button', { class: i ? '' : 'on', onclick: e => { ratio = k ? k.split('/').reduce((a, b) => a / b) : 0; $$('button', seg).forEach(b => b.classList.toggle('on', b === e.target)); fitRatio(); } }, l)));
    const ok = h('button', { class: 'btn primary', onclick: apply }, 'Rogner et enregistrer');
    const m = modal('Rogner l’image', h('div', { class: 'crop' }, h('div', { class: 'row' }, h('span', { class: 'f-l', style: 'margin:0' }, 'Format :'), seg), stage,
      h('div', { class: 'row end' }, info, h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Annuler'), ok)), 'wide');
    let W = 0, H = 0, r = { x: 0, y: 0, w: 0, h: 0 };
    const paint = () => { Object.assign(rect.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); const k = img.naturalWidth / W; info.textContent = `${Math.round(r.w * k)} × ${Math.round(r.h * k)} px`; };
    function fitRatio() {
      if (!ratio) { paint(); return; }
      let w = r.w, hh = w / ratio;
      if (hh > H) { hh = H; w = hh * ratio; }
      if (w > W) { w = W; hh = w / ratio; }
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      r = { w, h: hh, x: Math.max(0, Math.min(W - w, cx - w / 2)), y: Math.max(0, Math.min(H - hh, cy - hh / 2)) };
      paint();
    }
    img.onload = () => { W = img.clientWidth; H = img.clientHeight; r = { x: W * 0.05, y: H * 0.05, w: W * 0.9, h: H * 0.9 }; paint(); };
    img.src = url;
    rect.addEventListener('pointerdown', e => {
      e.preventDefault();
      const hd = e.target.dataset.h, x0 = e.clientX, y0 = e.clientY, s = Object.assign({}, r);
      const move = ev => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!hd) { r.x = Math.max(0, Math.min(W - s.w, s.x + dx)); r.y = Math.max(0, Math.min(H - s.h, s.y + dy)); return paint(); }
        let { x, y, w, h: hh } = s;
        if (hd.includes('e')) w = Math.max(30, Math.min(W - x, s.w + dx));
        if (hd.includes('s')) hh = Math.max(30, Math.min(H - y, s.h + dy));
        if (hd.includes('w')) { const nx = Math.max(0, Math.min(s.x + s.w - 30, s.x + dx)); w = s.w + (s.x - nx); x = nx; }
        if (hd.includes('n')) { const ny = Math.max(0, Math.min(s.y + s.h - 30, s.y + dy)); hh = s.h + (s.y - ny); y = ny; }
        if (ratio) {
          if (hd === 'n' || hd === 's') w = hh * ratio; else hh = w / ratio;
          if (x + w > W) { w = W - x; hh = w / ratio; }
          if (y + hh > H) { hh = H - y; w = hh * ratio; }
          if (hd.includes('n')) y = s.y + s.h - hh;
          if (hd.includes('w')) x = s.x + s.w - w;
        }
        r = { x, y, w, h: hh };
        paint();
      };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    });
    async function apply() {
      ok.disabled = true; ok.textContent = 'Enregistrement…';
      try {
        const k = img.naturalWidth / W;
        let sw = Math.round(r.w * k), sh = Math.round(r.h * k);
        const scale = Math.min(1, 2600 / Math.max(sw, sh));
        const c = document.createElement('canvas'); c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
        const g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
        g.drawImage(img, Math.round(r.x * k), Math.round(r.y * k), sw, sh, 0, 0, c.width, c.height);
        let blob = await new Promise(res => c.toBlob(res, 'image/webp', 0.85)), ext = 'webp';
        if (!blob || blob.type !== 'image/webp') { blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.86)); ext = 'jpg'; }
        const base = M.slugify(String(src).split('/').pop().replace(/\.[^.]+$/, '')).slice(0, 36) || 'image';
        const path = `images/bibliotheque/${base}-rognee-${Date.now().toString(36).slice(-5)}.${ext}`;
        const t = ED.toast('Envoi de l’image rognée…', 'busy', 0);
        ED.uploading++; updateState();
        try { await ED.uploadBlob(blob, path); } finally { ED.uploading--; updateState(); }
        ED.blobs.set(path, URL.createObjectURL(blob));
        const orig = ED.data.bibliotheque.find(x => x.src === src);
        addToLib(path, (orig ? orig.nom : base) + ' (rognée)');
        t.done('Image rognée ✓ (l’original est conservé)');
        m.close();
        onDone(path);
      } catch (e) { ED.toast('Échec : ' + (e.status !== undefined ? ED.ghError(e) : e.message), 'err'); ok.disabled = false; ok.textContent = 'Rogner et enregistrer'; }
    }
  }

  /* ---------- Pages et projets ---------- */
  function uniquePageId(base, except) {
    base = M.slugify(base) || 'page';
    let id = base, n = 2;
    while (ED.data.pages.some(p => p !== except && p.id === id)) id = `${base}-${n++}`;
    return id;
  }
  const sw = (label, val, onChange, cls = '') => h('label', { class: 'f-check ' + cls }, h('input', { type: 'checkbox', checked: !!val, onchange: e => onChange(e.target.checked) }), h('span', { class: 'sw' }), h('span', {}, label));
  /* ---------- Typologies de projets (filtres) ---------- */
  function setProjGenres(p, list) { p.carte.genres = [...new Set(list)]; p.carte.genre = p.carte.genres[0] || ''; }
  function addGenre(name) {
    const g = String(name || '').trim();
    if (!g) return '';
    const G = ED.data.site.genres, same = G.find(x => x.toLowerCase() === g.toLowerCase());
    if (same) return same;
    G.push(g); return g;
  }
  function genreChips(p, after) {
    const box = h('div', { class: 'g-chips' });
    const draw = () => box.replaceChildren(...M.genres(ED.data).map(g => h('button', { type: 'button', class: M.projGenres(p).includes(g) ? 'on' : '', onclick: () => {
      const gs = M.projGenres(p); setProjGenres(p, gs.includes(g) ? gs.filter(x => x !== g) : [...gs, g]); changed(); draw();
    } }, g)), h('button', { type: 'button', class: 'g-add', title: 'Créer une nouvelle typologie', onclick: () => {
      const g = addGenre(prompt('Nom de la nouvelle typologie (ex. Documentaire) :') || ''); if (!g) return;
      setProjGenres(p, [...M.projGenres(p), g]); changed(); draw(); if (after) after();
    } }, '+ Nouvelle'));
    draw();
    return box;
  }
  function openGenres(after) {
    const box = h('div', { class: 'genres-ed' });
    const m = modal('Typologies de projets', box, 'mid');
    const G = ED.data.site.genres, projs = () => ED.data.pages.filter(p => p.type === 'projet');
    const count = g => projs().filter(p => M.projGenres(p).includes(g)).length;
    const done = () => { changed(); draw(); if (after) after(); };
    const rename = (old, nv) => {
      nv = nv.trim();
      if (!nv || nv === old) return true;
      if (G.some(x => x !== old && x.toLowerCase() === nv.toLowerCase())) { ED.toast('Cette typologie existe déjà.', 'err'); return false; }
      G[G.indexOf(old)] = nv;
      projs().forEach(p => setProjGenres(p, M.projGenres(p).map(x => x === old ? nv : x)));
      ED.data.pages.forEach(pg => pg.sections.forEach(x => x.blocs.forEach(b => { if (b.k === 'projets' && b.c.genre === old) b.c.genre = nv; })));
      return true;
    };
    const input = h('input', { type: 'text', placeholder: 'Nouvelle typologie (ex. Documentaire, Pub, Fiction…)', onkeydown: e => { if (e.key === 'Enter') add(); } });
    const add = () => { const g = addGenre(input.value); if (!g) return; input.value = ''; done(); ED.toast(`Typologie « ${g} » ajoutée. Coche-la sur tes projets ci-dessous.`, 'ok'); };
    function draw() {
      box.replaceChildren(
        h('p', { class: 'help', style: 'margin-top:0' }, 'Les typologies sont les filtres sous la grande image de ta page d’accueil, dans cet ordre. Ajoutes-en autant que tu veux. Un projet peut en avoir plusieurs. Une typologie sans projet publié n’apparaît pas sur le site.'),
        h('div', { class: 'g-list' }, G.length ? G.map((g, i) => h('div', { class: 'g-row' },
          h('input', { type: 'text', value: g, title: 'Renommer', onchange: e => { if (!rename(g, e.target.value)) e.target.value = g; done(); } }),
          h('span', { class: 'g-count' }, `${count(g)} projet${count(g) > 1 ? 's' : ''}`),
          h('button', { class: 'sm', title: 'Monter', onclick: () => { if (moveIn(G, i, -1)) done(); } }, '↑'),
          h('button', { class: 'sm', title: 'Descendre', onclick: () => { if (moveIn(G, i, 1)) done(); } }, '↓'),
          h('button', { class: 'sm danger', title: 'Supprimer', onclick: () => {
            if (!confirm(`Supprimer la typologie « ${g} » ?\nTes projets ne sont pas supprimés, ils perdent juste cette typologie.`)) return;
            G.splice(i, 1); projs().forEach(p => setProjGenres(p, M.projGenres(p).filter(x => x !== g))); done();
          } }, '🗑'))) : h('p', { class: 'help' }, 'Aucune typologie pour l’instant.')),
        h('div', { class: 'row add-row' }, input, h('button', { class: 'btn primary small', onclick: add }, '+ Ajouter')),
        h('h4', { class: 'pn-h' }, 'Typologies de chaque projet'),
        h('div', { class: 'g-proj' }, projs().map(p => h('div', { class: 'g-prow' }, h('b', {}, p.titre), genreChips(p, draw)))));
    }
    draw();
    return m;
  }
  function openPages(focus) {
    const content = h('div', { class: 'pages-ed' });
    const m = modal('Pages et projets', content, 'wide');
    const reload = () => { fillPageSelect(); changed(); };
    const draw = () => {
      const pages = ED.data.pages.filter(p => p.type !== 'projet'), projs = ED.data.pages.filter(p => p.type === 'projet');
      const mv = (p, d, list) => { const i = list.indexOf(p), j = i + d; if (j < 0 || j >= list.length) return; const all = ED.data.pages, a = all.indexOf(list[i]), b = all.indexOf(list[j]); [all[a], all[b]] = [all[b], all[a]]; reload(); draw(); };
      const del = p => {
        if (p.accueil) { ED.toast('C’est ta page d’accueil : choisis d’abord une autre page d’accueil.', 'err'); return; }
        if (!confirm(`Supprimer « ${p.titre} » et tout son contenu ?\n(Tu pourras annuler avec ↶)`)) return;
        ED.data.pages.splice(ED.data.pages.indexOf(p), 1);
        if (st.pageId === p.id) loadPage(page().id);
        reload(); draw();
      };
      const dup = p => { const c = M.clone(p); c.id = uniquePageId(p.id + '-copie'); c.titre += ' (copie)'; c.accueil = false; c.sections = c.sections.map(reId); ED.data.pages.splice(ED.data.pages.indexOf(p) + 1, 0, c); reload(); draw(); };
      const settings = p => h('details', { class: 'pg-more' }, h('summary', {}, 'Réglages de la page'),
        h('div', { class: 'pg-grid' },
          h('label', {}, h('span', {}, 'Adresse (dans le lien)'), h('input', { type: 'text', value: p.id, onchange: e => {
            const old = p.id, nid = uniquePageId(e.target.value, p);
            ED.data.pages.forEach(x => x.sections.forEach(s => s.blocs.forEach(b => M.arr(b.c.boutons).forEach(bt => { if (bt.type === 'page' && bt.cible === old) bt.cible = nid; }))));
            p.id = nid; e.target.value = nid; if (st.pageId === old) st.pageId = nid; reload();
          } }), h('small', {}, M.pageUrl(p))),
          h('label', {}, h('span', {}, 'Titre pour Google (optionnel)'), h('input', { type: 'text', value: p.seoTitre || '', oninput: e => { p.seoTitre = e.target.value; changed({ render: false }); } })),
          h('label', {}, h('span', {}, 'Description pour Google (optionnel)'), h('textarea', { rows: 2, value: p.seoDescription || '', oninput: e => { p.seoDescription = e.target.value; changed({ render: false }); } })),
          sw('Masquer le menu sur cette page', p.masquerMenu, v => { p.masquerMenu = v; reload(); }),
          sw('Masquer le pied de page sur cette page', p.masquerPied, v => { p.masquerPied = v; reload(); }),
          p.type === 'projet' ? sw('Afficher « Projet suivant » en bas', p.navigation !== false, v => { p.navigation = v; reload(); }) : null));
      const pageRow = p => h('div', { class: 'pg-row' + (p.id === st.pageId ? ' current' : '') },
        h('div', { class: 'pg-main' },
          h('div', { class: 'pg-arrows' }, h('button', { class: 'sm', onclick: () => mv(p, -1, pages) }, '↑'), h('button', { class: 'sm', onclick: () => mv(p, 1, pages) }, '↓')),
          h('input', { type: 'text', class: 'pg-name', value: p.titre, oninput: e => { p.titre = e.target.value; fillPageSelect(); changed(); } }),
          sw('Menu', p.menu, v => { p.menu = v; reload(); }, 'small'), sw('Publiée', !p.masquer, v => { p.masquer = !v; reload(); }, 'small'),
          h('label', { class: 'radio small' }, h('input', { type: 'radio', name: 'accueil', checked: !!p.accueil, onchange: () => { ED.data.pages.forEach(x => { x.accueil = x === p; }); reload(); draw(); } }), ' Accueil'),
          h('button', { class: 'btn small', onclick: () => { m.close(); loadPage(p.id); } }, 'Modifier'),
          h('button', { class: 'sm', title: 'Dupliquer', onclick: () => dup(p) }, '⧉'), h('button', { class: 'sm danger', title: 'Supprimer', onclick: () => del(p) }, '🗑')),
        settings(p));
      const projRow = p => {
        const k = p.carte;
        const setThumb = src => { k.vignette = src; changed(); draw(); };
        return h('div', { class: 'pg-row proj' + (p.id === st.pageId ? ' current' : '') },
          h('div', { class: 'pj-grid' },
            h('button', { class: 'pj-thumb', title: 'Changer la vignette', onclick: () => openLibrary({ pick: true, onPick: setThumb }) }, k.vignette ? thumb(k.vignette) : h('span', {}, '+ Vignette')),
            h('div', { class: 'pj-fields' },
              h('div', { class: 'row' }, h('div', { class: 'pg-arrows' }, h('button', { class: 'sm', onclick: () => mv(p, -1, projs) }, '↑'), h('button', { class: 'sm', onclick: () => mv(p, 1, projs) }, '↓')),
                h('input', { type: 'text', class: 'pg-name', value: p.titre, oninput: e => { p.titre = e.target.value; fillPageSelect(); changed(); } })),
              h('div', { class: 'pj-genres' }, h('span', {}, 'Typologies (une ou plusieurs, servent aux filtres)'), genreChips(p, draw)),
              h('label', { class: 'pj-roles' }, h('span', {}, 'Mes rôles (séparés par des virgules)'), h('input', { type: 'text', value: M.arr(k.roles).join(', '), placeholder: 'Producteur, Réalisateur…', oninput: e => { k.roles = e.target.value.split(',').map(x => x.trim()).filter(Boolean); changed(); } })),
              h('div', { class: 'row' },
                (() => { const s = h('select', { title: 'Animation du texte au survol', onchange: e => { k.animSurvol = e.target.value; changed(); } }, h('option', { value: '' }, 'Survol (texte) : comme la grille'), M.ANIMS.slice(1).map(([a, l]) => h('option', { value: a }, 'Survol : ' + l))); s.value = k.animSurvol || ''; return s; })(),
                (() => { const s = h('select', { title: 'Effet sur l’image au survol', onchange: e => { k.animation = e.target.value; changed(); } }, h('option', { value: '' }, 'Effet image : comme la grille'), M.PROJ_ANIMS.map(([a, l]) => h('option', { value: a }, 'Effet : ' + l))); s.value = k.animation || ''; return s; })()),
              h('div', { class: 'row' },
                sw('Publié', !p.masquer, v => { p.masquer = !v; reload(); }, 'small'),
                h('button', { class: 'btn small', onclick: () => { m.close(); loadPage(p.id); } }, 'Modifier la page'),
                h('button', { class: 'sm', title: 'Dupliquer', onclick: () => dup(p) }, '⧉'), h('button', { class: 'sm danger', title: 'Supprimer', onclick: () => del(p) }, '🗑')))),
          settings(p));
      };
      const tplSel = h('select', {}, Object.entries(M.MODELES_PAGE).filter(([k]) => k !== 'projet').map(([k, t]) => h('option', { value: k }, t.nom)));
      content.replaceChildren(
        h('section', { class: 'pg-sec' }, h('h3', {}, 'Pages du menu'), h('p', { class: 'help' }, 'Renomme, réordonne, retire du menu, publie ou non, choisis la page d’accueil.'),
          ...pages.map(pageRow),
          h('div', { class: 'row add-row' }, tplSel, h('button', { class: 'btn primary small', onclick: () => {
            const nom = prompt('Nom de la nouvelle page :', 'Nouvelle page'); if (!nom) return;
            const p = { id: uniquePageId(nom), titre: nom, menu: true, sections: M.MODELES_PAGE[tplSel.value].sections() };
            const t = p.sections[0] && p.sections[0].blocs.find(b => b.k === 'titre'); if (t) t.c.texte = nom;
            ED.data.pages.splice(ED.data.pages.filter(x => x.type !== 'projet').length, 0, p);
            reload(); m.close(); loadPage(p.id); ED.toast(`Page « ${nom} » créée.`, 'ok');
          } }, '+ Nouvelle page'))),
        h('section', { class: 'pg-sec', id: 'pg-projets' }, h('h3', {}, 'Projets'), h('p', { class: 'help' }, 'Chaque projet a sa page. Ses typologies créent les filtres de la page d’accueil. '), h('button', { class: 'btn small ghost', onclick: () => openGenres(draw) }, 'Gérer les typologies (ajouter, renommer, ordre…)'),
          ...projs.map(projRow),
          h('div', { class: 'row add-row' }, h('button', { class: 'btn primary small', onclick: () => {
            const nom = prompt('Titre du nouveau projet :', 'NOUVEAU PROJET'); if (!nom) return;
            const p = { id: uniquePageId(nom), titre: nom, type: 'projet', menu: false, navigation: true, carte: { vignette: '', genre: '', roles: [], animation: '' }, sections: M.MODELES_PAGE.projet.sections() };
            const t = p.sections[0].blocs.find(b => b.k === 'titre'); if (t) t.c.texte = nom;
            ED.data.pages.push(p); reload(); m.close(); loadPage(p.id); ED.toast(`Projet « ${nom} » créé. Ajoute son genre et tes rôles dans « Pages ».`, 'ok', 6000);
          } }, '+ Nouveau projet'))));
      if (focus === 'projets') setTimeout(() => { const el = content.querySelector('#pg-projets'); if (el) el.scrollIntoView(); }, 30);
    };
    draw();
  }

  function openSite(tab = 'general') {
    const s = ED.data.site, body = h('div', {});
    const ctx = { page: page(), rerender: () => draw() };
    const TABS = [['general', 'Général'], ['design', 'Couleurs & polices'], ['menu', 'Menu'], ['pied', 'Pied de page'], ['reseaux', 'Réseaux sociaux'], ['mobile', '📱 Téléphone']];
    const m = modal('Réglages du site', h('div', { class: 'site-ed' }, h('div', { class: 'pn-tabs' }), body), 'mid');
    const tabsEl = m.body.querySelector('.pn-tabs');
    const DEF = {
      general: [{ k: 'nom', l: 'Ton nom (logo en haut, pied de page)', t: 'text' }, { k: 'titreOnglet', l: 'Titre dans l’onglet du navigateur', t: 'text' }, { k: 'descriptionGoogle', l: 'Description pour Google', t: 'text' }],
      design: [{ k: 'theme.fond', l: 'Couleur de fond', t: 'color' }, { k: 'theme.texte', l: 'Couleur du texte', t: 'color' }, { k: 'theme.texteDoux', l: 'Couleur du texte secondaire', t: 'color' }, { k: 'theme.accent', l: 'Couleur d’accent', t: 'color' },
        { k: 'theme.police', l: 'Police du texte', t: 'font' }, { k: 'theme.policeTitres', l: 'Police des titres', t: 'font' }, { k: 'theme.grain', l: 'Effet grain de pellicule', t: 'check' }],
      menu: [{ k: 'entete.disposition', l: 'Disposition', t: 'seg', options: [['centre', 'Centré'], ['gauche', 'Nom à gauche, menu à droite']] }, { k: 'entete.majuscules', l: 'Liens du menu en majuscules', t: 'check' }, { k: 'entete.masquerAuDefilement', l: 'Cacher le menu quand on descend', t: 'check' },
        { t: 'pages', l: 'Ajouter, renommer ou retirer des pages du menu' }],
      pied: [{ k: 'pied.afficher', l: 'Afficher le pied de page', t: 'check' }, { k: 'pied.texte', l: 'Texte après « © année + ton nom »', t: 'text', help: 'Exemple : © 2026 Yoann SIMONNEAU · Tous droits réservés' },
        { k: 'pied.reseaux', l: 'Afficher mes réseaux sociaux', t: 'check' }, { k: 'pied.reseauxStyle', l: 'Réseaux en bas de page', t: 'seg', options: [['icones', 'Icônes'], ['icones-texte', 'Icône + nom'], ['texte', 'Texte']] }],
      mobile: [{ t: 'note', l: 'Réglages de base de la version téléphone. Pour changer un élément précis seulement sur téléphone : bouton 📱 Mobile en haut, puis règle l’élément.' },
        { k: 'mobile.colonnes', l: 'Les sections en deux colonnes, sur téléphone', t: 'seg', options: [['cote', 'Côte à côte (comme l’ordinateur)'], ['empile', 'Empilées']] },
        { k: 'mobile.echelle', l: 'Taille des textes sur téléphone', t: 'range', min: 70, max: 115, unit: '%', auto: 90, help: 'Plus petit = plus de contenu visible d’un coup, comme sur ordinateur.' }],
      reseaux: [{ t: 'note', l: 'Les icônes (Instagram, YouTube, Vimeo, LinkedIn, TikTok, Facebook, X, Spotify, Behance, IMDb, SoundCloud…) se choisissent toutes seules d’après le lien.' },
        { k: 'reseaux', l: 'Réseaux sociaux', t: 'pairs', a: ['nom', 'Nom (Instagram…)'], b: ['url', 'Lien https://…'] }]
    };
    function draw() {
      tabsEl.replaceChildren(...TABS.map(([k, l]) => h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; draw(); } }, l)));
      body.replaceChildren(...DEF[tab].map(d => d.t === 'pages' ? h('button', { class: 'btn ghost wide', style: 'margin-top:14px', onclick: () => { m.close(); openPages(); } }, d.l) : field(s, d, ctx)).filter(Boolean));
      if (tab === 'reseaux') body.append(h('div', { class: 'soc-preview', html: M.arr(s.reseaux).filter(r => r.url).map(r => `<span title="${M.esc(r.nom)}">${M.icon(M.socialKind(r.url, r.nom), 22)}</span>`).join('') }));
    }
    draw();
  }

  function menu() {
    const close = () => back.remove();
    const item = (l, fn, cls = '') => h('button', { class: cls, onclick: () => { close(); fn(); } }, l);
    const imp = h('input', { type: 'file', accept: '.js,.json', hidden: true, onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      try { setData(ED.parseContenu(await f.text())); changed(); fillPageSelect(); loadPage(page().id); ED.toast('Sauvegarde importée. Publie pour la mettre en ligne.', 'ok'); } catch (err) { ED.toast(err.message, 'err'); }
    } });
    const back = h('div', { class: 'menu-back', onclick: e => { if (e.target === back) close(); } }, h('div', { class: 'menu' },
      h('p', { class: 'menu-info' }, ED.gh ? `Connecté à ${ED.gh.owner}/${ED.gh.repo}` : 'Mode hors ligne'),
      item('🖼 Bibliothèque (photos et documents)', () => openLibrary({})),
      item('⚙ Réglages du site', () => openSite()),
      item('Voir le site en ligne ↗', () => window.open(M.pageUrl(page()), '_blank')),
      item('Raccourcis et aide', help),
      ED.gh ? item('🕘 Historique des publications (restaurer)', openHistory) : null,
      ED.ls.get(SECOURS) ? item('🛟 Récupérer les modifications mises de côté', restoreSecours) : null,
      item('Télécharger une sauvegarde', ED.download),
      item('Importer une sauvegarde…', () => imp.click()),
      ED.gh ? item('Revenir à la version en ligne', () => { if (confirm('Revenir à la version publiée ?\nTes modifications non publiées seront mises de côté (menu ⋯ → 🛟 pour les récupérer).')) { keepSecours(); ED.ls.del(ED.KEYS.DRAFT); location.reload(); } }, 'danger') : null,
      ED.gh ? item('Se déconnecter', () => { const c = JSON.parse(ED.ls.get(ED.KEYS.CFG) || '{}'); delete c.token; ED.ls.set(ED.KEYS.CFG, JSON.stringify(c)); location.reload(); })
        : item('Se connecter à GitHub', () => ED.showConnect(startEditor)),
      imp));
    document.body.append(back);
  }
  function help() {
    modal('Comment modifier ton site', h('div', { class: 'help-txt', html: `
      <ol>
        <li><b>Une section</b> (grand cadre en pointillés) contient des <b>éléments</b> : titre, pastilles, paragraphe, image, infos, crédits, boutons…</li>
        <li><b>Déplacer un élément</b> : attrape la poignée <b>⠿</b> à sa gauche (ou son nom dans la barre jaune) et glisse-le où tu veux, même dans une autre section ou une autre colonne.</li>
        <li><b>Ajouter un élément</b> : bouton <b>＋ Ajouter</b> en haut à gauche, puis glisse l’élément dans la page (ou clique dessus). Ou le rond jaune <b>+</b> sous un élément.</li>
        <li><b>Barre jaune</b> d’un élément : <b>✎</b> ses réglages (Contenu, Style, Texte, Animation) · <b>↑ ↓</b> · <b>⧉</b> dupliquer · <b>🗑</b> supprimer.</li>
        <li><b>Changer une taille sur la page</b> : <b>↔</b> à droite d’un élément (largeur), <b>⇲</b> et <b>↕</b> sur une image, <b>⇕</b> en haut/bas à gauche d’une section (espace), <b>⇔</b> entre deux colonnes, <b>↔</b> à droite du contenu (largeur de la section).</li>
        <li><b>Lignes, pastilles, mots-clés, boutons</b> : « + » pour en ajouter ; survole-en un pour le déplacer (⠿), le dupliquer ou le supprimer.</li>
        <li><b>Clique dans un texte</b> pour l’écrire. Sélectionne des mots pour gras, italique, lien, couleur, liste, ou <b>📎 Document</b> pour faire un lien vers ton CV.</li>
        <li><b>Clique sur une image</b> pour ses réglages. Double-clic ou <b>Remplacer</b> : choisir dans ta bibliothèque. <b>Rogner</b> : recadrer.</li>
        <li><b>La barre blanche de la section</b> (en haut à droite) : réglages de toute la section, déplacer, dupliquer, supprimer. <b>+ Section</b> en haut ou en bas pour en ajouter une.</li>
        <li><b>🖼 Bibliothèque</b> : envoie toutes tes photos et documents une fois, puis choisis-les partout.</li>
        <li><b>📱 Mobile</b> : en mode téléphone, les tailles, espacements, positions et colonnes que tu changes ne s’appliquent qu’au téléphone.</li>
        <li><b>Aperçu</b> : ton site avec les modifications. <b>Publier</b> : en ligne en 1 à 2 minutes. Tes modifications non publiées restent gardées sur cet appareil.</li>
        <li><b>Menu ⋯ → 🕘 Historique</b> : rouvrir n’importe quelle version déjà publiée.</li>
      </ol>
      <p><b>Raccourcis :</b> Ctrl/Cmd + Z annuler · Ctrl/Cmd + Maj + Z rétablir · Ctrl/Cmd + S publier · Échap fermer le panneau.</p>` }), 'mid');
  }

  /* ---------- Sécurité : rien ne se perd ---------- */
  const SECOURS = 'portfolio-brouillon-secours';
  function keepSecours(data) {
    try { ED.ls.set(SECOURS, JSON.stringify({ savedAt: Date.now(), data: data || ED.data })); } catch (e) { /* stockage plein */ }
  }
  function restoreSecours() {
    let x = null;
    try { x = JSON.parse(ED.ls.get(SECOURS) || 'null'); } catch (e) { /* rien */ }
    if (!x || !x.data) { ED.toast('Rien à récupérer.'); return; }
    const when = new Date(x.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    if (!confirm(`Récupérer les modifications mises de côté le ${when} ?\nElles remplaceront ce que tu vois (↶ pour annuler).`)) return;
    keepSecours(M.clone(ED.data));
    setData(x.data); pushHistory(); ED.dirty = true; saveDraft(); updateState(); fillPageSelect(); loadPage(page().id);
    ED.toast('Modifications récupérées. Clique « Publier » pour les mettre en ligne.', 'ok', 6000);
  }
  async function openHistory() {
    if (!ED.requireConnection()) return;
    const box = h('div', { class: 'hist' }, h('p', { class: 'help' }, 'Chargement de l’historique…'));
    const m = modal('Historique des publications', box, 'mid');
    try {
      const list = await ED.ghReq(`/commits?path=${encodeURIComponent(ED.CONTENT_PATH)}&sha=${encodeURIComponent(ED.gh.branch)}&per_page=40`);
      const open = async c => {
        const t = ED.toast('Chargement de cette version…', 'busy', 0);
        try {
          const f = await ED.ghReq(`/contents/${ED.CONTENT_PATH}?ref=${encodeURIComponent(c.sha)}`);
          keepSecours(M.clone(ED.data));
          setData(ED.parseContenu(ED.b64ToText(f.content))); pushHistory(); ED.dirty = true; saveDraft(); updateState(); fillPageSelect(); loadPage(page().id);
          m.close();
          t.done('Version chargée dans l’éditeur (rien n’est encore en ligne). Vérifie, puis « Publier » pour la remettre en ligne. ↶ pour annuler.');
        } catch (e) { t.fail('Impossible de charger cette version : ' + ED.ghError(e)); }
      };
      box.replaceChildren(
        h('p', { class: 'help', style: 'margin-top:0' }, 'Chaque fois que tu publies, GitHub garde une copie. « Ouvrir » charge une ancienne version dans l’éditeur sans la mettre en ligne. Ce que tu avais à l’écran est mis de côté (menu ⋯ → 🛟).'),
        h('div', { class: 'hist-list' }, M.arr(list).map((c, i) => {
          const d = new Date(c.commit.committer.date || c.commit.author.date);
          return h('div', { class: 'hist-row' },
            h('div', {}, h('b', {}, d.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })), h('span', {}, c.commit.message.split('\n')[0])),
            i === 0 ? h('span', { class: 'lib-used static' }, 'En ligne') : null,
            h('button', { class: 'btn small', onclick: () => open(c) }, 'Ouvrir'));
        })));
    } catch (e) { box.replaceChildren(h('p', {}, 'Impossible de charger l’historique : ' + ED.ghError(e))); }
  }

  /* ---------- Tiroir : glisser un nouvel élément ou une section dans la page ---------- */
  function toggleDrawer(force) {
    const D = $('#drawer'); if (!D) return;
    const on = force !== undefined ? force : D.hidden;
    D.hidden = !on;
    $('#btn-add').classList.toggle('on', on);
    if (on) drawDrawer();
    setTimeout(() => ov.draw(), 50);
  }
  function drawDrawer(tab) {
    const D = $('#drawer');
    tab = tab || D.dataset.tab || 'elements';
    D.dataset.tab = tab;
    const item = (kind, k, ico, nom) => {
      const el = h('div', { class: 'pal-it', title: 'Glisse dans la page, ou clique pour ajouter', tabindex: 0 }, h('span', { class: 'bc-ico' }, ico), h('span', {}, nom));
      el.addEventListener('pointerdown', e => paletteDrag(e, kind, k, nom));
      el.addEventListener('keydown', e => { if (e.key === 'Enter') clickInsert(kind, k); });
      return el;
    };
    D.replaceChildren(
      h('div', { class: 'dr-head' }, h('div', { class: 'seg' }, [['elements', 'Éléments'], ['sections', 'Sections']].map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => drawDrawer(k) }, l))),
        h('button', { class: 'pn-x', title: 'Fermer', onclick: () => toggleDrawer(false) }, '×')),
      h('p', { class: 'dr-help' }, tab === 'elements' ? 'Glisse un élément dans la page, à l’endroit voulu (même dans une colonne). Ou clique : il s’ajoute après l’élément sélectionné.' : 'Glisse une section entre deux sections. Ou clique : elle s’ajoute après la section sélectionnée.'),
      h('div', { class: 'dr-body' }, tab === 'elements'
        ? M.BLOC_GROUPES.map(g => h('div', { class: 'dr-group' }, h('h4', {}, g), Object.entries(M.BLOCS).filter(([, b]) => b.g === g).map(([k, b]) => item('bloc', k, BICO[k] || '•', b.nom))))
        : M.GROUPES.map(g => h('div', { class: 'dr-group' }, h('h4', {}, g), Object.entries(M.TYPES).filter(([, t]) => t.groupe === g).map(([k, t]) => item('section', k, '▭', t.nom))))));
  }
  function clickInsert(kind, k) {
    const pg = page();
    if (kind === 'section') {
      const i = st.sel ? pg.sections.findIndex(x => x.id === st.sel.sid) : -1;
      insertSection(k, i > -1 ? i + 1 : pg.sections.length);
      return;
    }
    if (st.sel && st.sel.bid) {
      const bi = blocById(st.sel.bid);
      if (bi) { insertBloc(k, { sec: bi.sec, index: bi.index + 1, col: bi.bloc.col }); return; }
    }
    if (st.sel) { const r = secById(st.sel.sid); if (r) { insertBloc(k, { sec: r.sec, index: r.sec.blocs.length }); return; } }
    if (pg.sections.length) { const sec = pg.sections[pg.sections.length - 1]; insertBloc(k, { sec, index: sec.blocs.length }); ED.toast('Ajouté à la fin de la page. La prochaine fois, glisse-le directement où tu veux.'); return; }
    insertSection('texte', 0);
  }
  function paletteDrag(e, kind, k, nom) {
    if (e.button !== 0) return;
    e.preventDefault();
    const item = e.currentTarget, frame = $('#frame'), x0 = e.clientX, y0 = e.clientY;
    let moved = false, target = null, last = null;
    const ghost = h('div', { class: 'pal-ghost' }, (kind === 'section' ? '▭ ' : '＋ ') + nom);
    try { item.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
    const inFrame = ev => { const fr = frame.getBoundingClientRect(); return { fr, x: ev.clientX - fr.left, y: ev.clientY - fr.top }; };
    const mv = ev => {
      last = ev;
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!moved) { moved = true; document.body.append(ghost); if (fdoc) startDrag(''); }
      Object.assign(ghost.style, { left: ev.clientX + 14 + 'px', top: ev.clientY + 10 + 'px' });
      if (!fdoc) return;
      const { fr, x, y } = inFrame(ev);
      if (x < 0 || y < 0 || x > fr.width || y > fr.height) { target = null; ov.show(ov.drop, false); ghost.classList.remove('ok'); return; }
      target = kind === 'section' ? findSecDrop(y) : findDrop(x, y, null, null);
      ghost.classList.toggle('ok', !!target);
    };
    const tick = setInterval(() => {
      if (!last || !moved || !win) return;
      const { fr, x, y } = inFrame(last);
      if (x < 0 || x > fr.width) return;
      if (y > -20 && y < 60) { win.scrollBy(0, -20); mv(last); } else if (y > fr.height - 60 && y < fr.height + 20) { win.scrollBy(0, 20); mv(last); }
    }, 40);
    const up = () => {
      clearInterval(tick);
      ['pointermove', 'pointerup', 'pointercancel'].forEach((t, i) => item.removeEventListener(t, i ? up : mv));
      ghost.remove();
      if (!moved) { clickInsert(kind, k); return; }
      if (fdoc) endDrag();
      if (!target) return;
      if (kind === 'section') insertSection(k, target.index); else insertBloc(k, target);
    };
    item.addEventListener('pointermove', mv);
    item.addEventListener('pointerup', up);
    item.addEventListener('pointercancel', up);
  }

  /* ==========================================================================
     Interface principale
     ========================================================================== */
  function fillPageSelect() {
    const s = $('#pageSel'); if (!s) return;
    const pg = ED.data.pages.filter(p => p.type !== 'projet'), pj = ED.data.pages.filter(p => p.type === 'projet');
    s.replaceChildren(h('optgroup', { label: 'Pages' }, pg.map(p => h('option', { value: p.id }, (p.accueil ? '🏠 ' : '') + p.titre))),
      pj.length ? h('optgroup', { label: 'Projets' }, pj.map(p => h('option', { value: p.id }, p.titre))) : null);
    s.value = st.pageId;
  }
  function setDevice(d) {
    st.device = d;
    $('#frameWrap').className = 'frame-wrap ' + d;
    document.body.classList.toggle('dev-mobile', d === 'mobile');
    $$('.dev button').forEach(b => b.classList.toggle('on', b.dataset.d === d));
    if (win && win.SITE && win.SITE.fit) win.SITE.fit();
    setTimeout(() => { if (win && win.SITE && win.SITE.fit) win.SITE.fit(); ov.draw(); }, 400);
    if (st.sel) buildPanel();
    if (d === 'mobile' && !ED.ls.get('portfolio-astuce-mobile')) { ED.ls.set('portfolio-astuce-mobile', '1'); ED.toast('📱 Version téléphone : les tailles, espacements et positions que tu changes maintenant ne s’appliquent qu’au téléphone.', 'ok', 7000); }
    setTimeout(() => ov.draw(), 350);
  }
  function preview() {
    flushEdit();
    if (!ED.ls.set(ED.KEYS.PREVIEW_DATA, JSON.stringify(ED.data))) { ED.toast('Aperçu impossible : stockage du navigateur indisponible.', 'err'); return; }
    ED.ls.set(ED.KEYS.PREVIEW_FLAG, '1');
    const url = M.pageUrl(page());
    window.open(url + (url.includes('?') ? '&' : '?') + 'apercu=1', 'apercu-portfolio');
  }
  function startEditor(content) {
    setData(content);
    ED.dirty = !content || content.version !== 3;
    hist = []; hpos = -1; pushHistory();
    let draft = null;
    try { draft = JSON.parse(ED.ls.get(ED.KEYS.DRAFT) || 'null'); } catch (e) { /* rien */ }
    $('#app').replaceChildren(
      h('header', { class: 'top' },
        h('div', { class: 'top-l' },
          h('div', { class: 'brand' }, h('strong', {}, 'Éditeur'), h('span', { id: 'status', class: 'status' })),
          h('select', { id: 'pageSel', title: 'Page à modifier', onchange: e => loadPage(e.target.value) }),
          h('button', { id: 'btn-add', class: 'btn ghost', title: 'Glisser de nouveaux éléments ou sections dans la page', onclick: () => toggleDrawer() }, '＋ Ajouter'),
          h('button', { class: 'btn ghost', onclick: () => openPages() }, '☰ Pages'),
          h('button', { class: 'btn ghost', onclick: () => openLibrary({}) }, '🖼 Bibliothèque')),
        h('div', { class: 'top-m' },
          h('div', { class: 'dev seg' }, h('button', { 'data-d': 'desktop', class: 'on', title: 'Ordinateur', onclick: () => setDevice('desktop') }, '🖥', h('span', {}, ' Ordinateur')), h('button', { 'data-d': 'mobile', title: 'Téléphone', onclick: () => setDevice('mobile') }, '📱', h('span', {}, ' Mobile'))),
          h('button', { id: 'btn-undo', class: 'btn ghost icon', title: 'Annuler (Ctrl+Z)', onclick: undo }, '↶'),
          h('button', { id: 'btn-redo', class: 'btn ghost icon', title: 'Rétablir (Ctrl+Maj+Z)', onclick: redo }, '↷')),
        h('div', { class: 'top-r' },
          h('button', { class: 'btn ghost', title: 'Réglages du site : couleurs, polices, menu, pied de page, réseaux, téléphone', onclick: () => openSite() }, '⚙ Réglages'),
          h('a', { id: 'btn-live', class: 'btn ghost', href: 'index.html', target: '_blank', rel: 'noopener', title: 'Ton site en ligne (version publiée)' }, 'Voir le site ↗'),
          h('button', { class: 'btn ghost', onclick: preview, title: 'Ton site avec les modifications non publiées' }, 'Aperçu'),
          h('button', { id: 'btn-publish', class: 'btn primary', onclick: () => { flushEdit(); ED.publish(); } }, 'Publier'),
          h('button', { class: 'btn ghost icon', title: 'Plus', onclick: menu }, '⋯'))),
      h('div', { id: 'notice' }),
      h('div', { class: 'main' },
        h('aside', { id: 'drawer', class: 'drawer', hidden: true }),
        h('div', { class: 'stage' }, h('div', { id: 'frameWrap', class: 'frame-wrap desktop' }, h('iframe', { id: 'frame', title: 'Ton site en mode édition' }))),
        h('aside', { id: 'panel', class: 'panel', hidden: true })));
    if (!ED.gh) $('#notice').append(h('div', { class: 'notice' }, h('b', {}, 'Mode hors ligne. '), 'Tu peux tout modifier et prévisualiser. Pour envoyer des photos et publier, connecte-toi (menu ⋯).'));
    // Modifications non publiées trouvées sur cet appareil : on les reprend automatiquement
    let pendingModal = null;
    if (draft && draft.data && JSON.stringify(M.normalize(M.clone(draft.data))) !== JSON.stringify(ED.data)) {
      const when = new Date(draft.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      const online = M.clone(ED.data);
      const sameBase = !ED.gh || !draft.baseSha || !ED.baseSha || draft.baseSha === ED.baseSha;
      const takeDraft = () => { setData(draft.data); hist = []; hpos = -1; pushHistory(); ED.dirty = true; updateState(); };
      const takeOnline = () => { keepSecours(draft.data); setData(online); hist = []; hpos = -1; pushHistory(); ED.dirty = false; st.draftPending = false; ED.ls.del(ED.KEYS.DRAFT); updateState(); fillPageSelect(); loadPage(page().id); };
      if (sameBase) {
        takeDraft();
        const n = h('div', { class: 'notice ok' }, h('span', {}, `✓ Tes modifications non publiées du ${when} ont été reprises. Clique « Publier » quand tu veux les mettre en ligne.`),
          h('button', { class: 'btn small ghost', onclick: () => { if (confirm('Afficher la version en ligne à la place ?\nTes modifications seront mises de côté (menu ⋯ → 🛟 pour les récupérer).')) { takeOnline(); n.remove(); } } }, 'Voir plutôt la version en ligne'),
          h('button', { class: 'btn small ghost', onclick: () => n.remove() }, 'OK'));
        $('#notice').append(n);
      } else {
        st.draftPending = true;
        pendingModal = () => {
          const m = modal('Deux versions de ton site', h('div', {},
            h('p', {}, `Cet appareil garde des modifications non publiées du ${when}. Mais ton site a été publié depuis (sur un autre appareil ou directement sur GitHub).`),
            h('p', { class: 'help' }, 'Choisis la version à ouvrir. L’autre est mise de côté, rien n’est supprimé (menu ⋯ → 🛟 Récupérer, ou 🕘 Historique).'),
            h('div', { class: 'row end' },
              h('button', { class: 'btn ghost', onclick: () => { m.close(); takeOnline(); } }, 'Ouvrir la version en ligne'),
              h('button', { class: 'btn primary', onclick: () => { m.close(); keepSecours(online); takeDraft(); st.draftPending = false; saveDraft(); fillPageSelect(); loadPage(page().id); } }, 'Reprendre mes modifications'))), 'mid', { locked: true });
        };
      }
    }
    document.addEventListener('keydown', keys);
    st.pageId = page().id;
    fillPageSelect();
    loadPage(st.pageId);
    updateState();
    if (ED.gh) setTimeout(syncRepo, 1500);
    if (pendingModal) setTimeout(pendingModal, 300);
    else if (!ED.ls.get('portfolio-ed-aide-v4')) { ED.ls.set('portfolio-ed-aide-v4', '1'); setTimeout(help, 600); }
  }
  ED.startEditor = startEditor;

  (async () => {
    let saved = {};
    try { saved = JSON.parse(ED.ls.get(ED.KEYS.CFG) || '{}'); } catch (e) { /* rien */ }
    if (saved.token && saved.owner && saved.repo) {
      $('#app').replaceChildren(h('p', { class: 'loading' }, 'Connexion à GitHub…'));
      try { startEditor(await ED.connect(saved)); return; }
      catch (e) { ED.gh = null; ED.showConnect(startEditor, 'Reconnexion impossible : ' + (e.status !== undefined ? ED.ghError(e) : e.message)); return; }
    }
    ED.showConnect(startEditor);
  })();
})();
