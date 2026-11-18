/* ==========================================================================
   Éditeur visuel : on modifie le portfolio directement sur la page.
   Survol → crayon · clic sur un texte → écriture directe · « + » → ajouter une section
   ========================================================================== */
(() => {
  'use strict';
  const M = window.Modele, ED = window.ED, h = ED.h, $ = ED.$, $$ = ED.$$;
  const st = { pageId: null, sel: null, tab: 'contenu', device: 'desktop', editing: null, clip: null };
  let win = null, fdoc = null, hist = [], hpos = -1, histTimer, draftTimer, editTimer, panelTimer;
  window.Editeur = { data: null, frameReady };

  /* ==========================================================================
     Données, historique, rendu
     ========================================================================== */
  const page = () => ED.data.pages.find(p => p.id === st.pageId) || ED.data.pages.find(p => p.accueil) || ED.data.pages[0];
  const secById = id => {
    for (const p of ED.data.pages) { const i = M.arr(p.sections).findIndex(x => x.id === id); if (i > -1) return { page: p, sec: p.sections[i], list: p.sections, index: i }; }
    return null;
  };
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
    if (!win || !win.SITE) return;
    const y = win.scrollY;
    win.SITE.render(ED.data, st.pageId);
    win.scrollTo(0, y);
    ov.draw();
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
    if (st.sel && !secById(st.sel.sid)) closePanel(); else buildPanel();
    saveDraft(); updateState();
  }
  function undo() { flushEdit(); clearTimeout(histTimer); pushHistory(); if (hpos > 0) { hpos--; restore(); } }
  function redo() { if (hpos < hist.length - 1) { hpos++; restore(); } }
  function saveDraft() { ED.ls.set(ED.KEYS.DRAFT, JSON.stringify({ savedAt: Date.now(), baseSha: ED.baseSha, data: ED.data })); }
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

  /* ==========================================================================
     Cadre (le vrai site, en mode édition)
     ========================================================================== */
  function loadPage(id) {
    flushEdit();
    st.pageId = id; st.sel = null; closePanel();
    win = null; fdoc = null;
    const sel = $('#pageSel'); if (sel) sel.value = id;
    $('#frame').src = `index.html?p=${encodeURIComponent(id)}&edit=1`;
    const p = page(), a = $('#btn-live');
    if (a) a.href = M.pageUrl(p);
  }
  function frameReady(w, pid) {
    win = w; fdoc = w.document;
    const l = fdoc.createElement('link');
    l.rel = 'stylesheet'; l.href = 'assets/css/edit.css';
    fdoc.head.appendChild(l);
    ov.install();
    bindFrame();
  }

  /* ---------- Superposition d'édition (dans le cadre) ---------- */
  const RT = [['bold', '<b>B</b>', 'Gras'], ['italic', '<i>I</i>', 'Italique'], ['underline', '<u>U</u>', 'Souligné'], ['strikeThrough', '<s>S</s>', 'Barré'],
    ['h2', 'T1', 'Titre'], ['h3', 'T2', 'Sous-titre'], ['p', '¶', 'Paragraphe'], ['insertUnorderedList', '• Liste', 'Liste à puces'], ['insertOrderedList', '1. Liste', 'Liste numérotée'],
    ['link', '🔗 Lien', 'Ajouter un lien'], ['unlink', '⛓︎', 'Retirer le lien'], ['removeFormat', '⌫', 'Effacer la mise en forme']];
  const ov = {
    root: null, hSec: null, hEl: null, hItem: null, moveKind: null, dragging: false,
    install() {
      const d = fdoc;
      const root = d.createElement('div');
      root.id = 'edo';
      root.innerHTML = `
        <div class="edo-hbox"></div><div class="edo-sbox"></div><div class="edo-elbox"></div>
        <div class="edo-bar"><span class="edo-name"></span>
          <button data-a="edit" title="Modifier le contenu de la section">✎ Modifier</button>
          <button data-a="style" title="Couleurs, fond, marges…">Style</button>
          <button data-a="drag" class="edo-grab" title="Glisser pour déplacer la section">⠿</button>
          <button data-a="up" title="Monter">↑</button><button data-a="down" title="Descendre">↓</button>
          <button data-a="dup" title="Dupliquer">⧉</button><button data-a="del" class="danger" title="Supprimer la section">🗑</button></div>
        <button class="edo-add edo-add-top" data-a="add-before">+ Ajouter une section</button>
        <button class="edo-add edo-add-bot" data-a="add-after">+ Ajouter une section</button>
        <button class="edo-pen" title="Modifier">✎</button>
        <div class="edo-img"><button data-a="img-replace">Remplacer</button><button data-a="img-settings">✎ Réglages</button><button data-a="img-drag" class="edo-grab" title="Glisser pour réorganiser">⠿</button><button data-a="img-del" class="danger" title="Retirer l’image">✕</button></div>
        <div class="edo-rs" title="Tirer pour agrandir ou réduire">⇲</div>
        <div class="edo-move" title="Glisser pour déplacer">✥</div>
        <div class="edo-item"><button data-a="it-replace">Remplacer</button><button data-a="it-front" title="Premier plan">⬆ Avant</button><button data-a="it-back" title="Arrière-plan">⬇ Arrière</button><button data-a="it-settings">✎ Réglages</button><button data-a="it-del" class="danger">✕</button></div>
        <div class="edo-rsw" title="Tirer pour changer la largeur">⇲</div>
        <div class="edo-drop"></div><div class="edo-ghost"></div><div class="edo-tip"></div>
        <div class="edo-rt">${RT.map(([c, l, t]) => `<button data-cmd="${c}" title="${t}">${l}</button>`).join('')}<label class="edo-color" title="Couleur du texte sélectionné">A<input type="color" value="#8a9bff"></label></div>`;
      d.body.appendChild(root);
      this.root = root;
      const q = s => root.querySelector(s);
      Object.assign(this, { hbox: q('.edo-hbox'), sbox: q('.edo-sbox'), elbox: q('.edo-elbox'), bar: q('.edo-bar'), name: q('.edo-name'), addT: q('.edo-add-top'), addB: q('.edo-add-bot'),
        pen: q('.edo-pen'), img: q('.edo-img'), rs: q('.edo-rs'), move: q('.edo-move'), item: q('.edo-item'), rsw: q('.edo-rsw'), drop: q('.edo-drop'), ghost: q('.edo-ghost'), tip: q('.edo-tip'), rt: q('.edo-rt') });
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-a]');
        if (b) { e.preventDefault(); e.stopPropagation(); barAction(b.dataset.a); }
      });
      root.addEventListener('pointerdown', e => {
        const b = e.target.closest('[data-a="drag"],[data-a="img-drag"]');
        if (b) { e.preventDefault(); b.dataset.a === 'drag' ? dragSection(e) : dragImage(e); }
        if (e.target.closest('.edo-rs')) { e.preventDefault(); resizeImage(e); }
        if (e.target.closest('.edo-move')) { e.preventDefault(); this.moveKind === 'cov' ? moveCover(e) : moveItem(e); }
        if (e.target.closest('.edo-rsw')) { e.preventDefault(); resizeItem(e); }
      });
      this.pen.addEventListener('click', e => {
        e.preventDefault();
        const el = this.hEl;
        if (!el) return;
        if (el.matches('[data-e]')) { startEdit(el); placeCaretEnd(el); }
        else if (el.matches('[data-img]')) selectEl(el);
      });
      // Barre de mise en forme du texte
      let savedRange = null;
      this.rt.addEventListener('mousedown', e => {
        const sel = win.getSelection();
        if (sel.rangeCount) savedRange = sel.getRangeAt(0).cloneRange();
        const b = e.target.closest('[data-cmd]');
        if (!b) return;
        e.preventDefault();
        const c = b.dataset.cmd;
        if (c === 'link') {
          const url = win.prompt('Adresse du lien :\n• un site : https://…\n• un e-mail : mailto:ton@email.com\n• une page du site : index.html?p=contact', 'https://');
          if (url && url !== 'https://') fdoc.execCommand('createLink', false, url.trim());
        } else if (['h2', 'h3', 'p'].includes(c)) fdoc.execCommand('formatBlock', false, c);
        else fdoc.execCommand(c, false, null);
        onEditInput();
      });
      const color = this.rt.querySelector('input[type=color]');
      color.addEventListener('input', () => {
        if (!st.editing) return;
        st.editing.el.focus();
        if (savedRange) { const s = win.getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
        fdoc.execCommand('foreColor', false, color.value);
        onEditInput();
      });
      win.addEventListener('scroll', () => this.draw(), { passive: true });
      win.addEventListener('resize', () => this.draw());
    },
    show(el, on) { if (el) el.classList.toggle('on', !!on); },
    box(el, r, pad = 0) {
      const sx = win.scrollX, sy = win.scrollY;
      Object.assign(el.style, { left: r.left + sx - pad + 'px', top: r.top + sy - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    },
    at(el, x, y) { el.style.left = x + win.scrollX + 'px'; el.style.top = y + win.scrollY + 'px'; },
    track(t) {
      if (!t || !t.closest || this.dragging) return;
      if (t.closest('#edo')) return;
      this.hSec = t.closest('[data-sid]');
      this.hItem = t.closest('[data-item]');
      const img = t.closest('[data-img]'), txt = t.closest('[data-e]');
      this.hEl = this.hItem ? (txt && this.hItem.contains(txt) ? txt : null) : (txt || img);
      this.draw();
    },
    draw() {
      if (!this.root || !win) return;
      const vw = win.innerWidth;
      const selEl = st.sel ? fdoc.querySelector(`[data-sid="${st.sel.sid}"]`) : null;
      const sec = this.dragging ? null : (this.hSec && this.hSec.isConnected ? this.hSec : selEl);
      this.show(this.hbox, sec && sec !== selEl); if (sec && sec !== selEl) this.box(this.hbox, sec.getBoundingClientRect());
      this.show(this.sbox, selEl); if (selEl) this.box(this.sbox, selEl.getBoundingClientRect());
      // Barre de section + boutons « ajouter »
      this.show(this.bar, sec); this.show(this.addT, sec); this.show(this.addB, sec);
      if (sec) {
        const r = sec.getBoundingClientRect(), info = secById(sec.dataset.sid);
        this.name.textContent = info ? M.TYPES[info.sec.type].nom : '';
        const bw = this.bar.offsetWidth || 420;
        this.at(this.bar, Math.max(6, Math.min(r.right - bw - 8, vw - bw - 8)), Math.max(r.top + 8, 64));
        this.at(this.addT, r.left + r.width / 2, r.top);
        this.at(this.addB, r.left + r.width / 2, r.bottom);
      }
      // Élément survolé
      const el = this.dragging ? null : this.hEl;
      const isImg = el && el.matches('[data-img]'), isTxt = el && el.matches('[data-e]');
      this.show(this.elbox, el && !(st.editing && st.editing.el === el));
      if (el) this.box(this.elbox, el.getBoundingClientRect(), 3);
      this.show(this.pen, isTxt && !(st.editing && st.editing.el === el));
      if (isTxt) { const r = el.getBoundingClientRect(); this.at(this.pen, Math.min(r.right + 2, vw - 18), r.top - 2); }
      this.show(this.img, isImg && !this.hItem);
      let rsOn = false;
      if (isImg && !this.hItem) {
        const r = el.getBoundingClientRect(), path = el.dataset.img;
        const inArr = /\.\d+$/.test(path);
        this.img.querySelector('[data-a="img-drag"]').style.display = inArr ? '' : 'none';
        this.img.querySelector('[data-a="img-del"]').style.display = inArr || path !== 'c.media' ? '' : 'none';
        this.at(this.img, Math.max(8, r.right - 8), Math.max(r.top + 8, 64));
        const gal = el.closest('.gal-puzzle, .gal-grille');
        if (gal && inArr) { rsOn = true; this.at(this.rs, r.right - 34, r.bottom - 34); }
      }
      this.show(this.rs, rsOn);
      // Composition libre ou texte de couverture : poignée de déplacement
      let moveOn = false, itOn = false;
      if (this.hItem && !this.dragging) {
        const r = this.hItem.getBoundingClientRect();
        moveOn = true; itOn = true; this.moveKind = 'item';
        this.at(this.move, r.left - 4, r.top - 4);
        const info = this.hSec && secById(this.hSec.dataset.sid);
        const it = info && M.arr(info.sec.c.items)[+this.hItem.dataset.item];
        this.item.querySelector('[data-a="it-replace"]').style.display = it && it.k === 'image' ? '' : 'none';
        this.at(this.item, Math.max(8, r.right - (this.item.offsetWidth || 300)), Math.max(r.top - 40, 64));
        this.at(this.rsw, r.right - 30, r.bottom - 30);
      } else if (sec && !this.dragging) {
        const cov = sec.querySelector('[data-drag="cov"]');
        if (cov) { const r = cov.getBoundingClientRect(); moveOn = true; this.moveKind = 'cov'; this.at(this.move, r.left - 36, r.top - 4); }
      }
      this.show(this.move, moveOn); this.show(this.item, itOn); this.show(this.rsw, itOn);
      // Barre de texte enrichi
      const ed = st.editing;
      this.show(this.rt, ed && ed.kind === 'rich');
      if (ed && ed.kind === 'rich') { const r = ed.el.getBoundingClientRect(); this.at(this.rt, Math.max(6, Math.min(r.left, vw - (this.rt.offsetWidth || 520) - 6)), Math.max(r.top - 46, 60)); }
    }
  };

  /* ---------- Événements dans le cadre ---------- */
  function bindFrame() {
    const d = fdoc;
    d.addEventListener('mousemove', e => ov.track(e.target), { passive: true });
    d.addEventListener('mouseleave', () => { ov.hSec = null; ov.hEl = null; ov.hItem = null; ov.draw(); });
    d.addEventListener('mousedown', e => {
      const txt = e.target.closest('[data-e]');
      if (!txt || e.target.closest('#edo')) return;
      if (st.editing && st.editing.el === txt) return;
      startEdit(txt);
    }, true);
    d.addEventListener('click', e => {
      const t = e.target;
      if (t.closest('#edo')) return;
      if (t.closest('.filtres button, .sl-btn, .sl-dots button')) return;
      if (t.closest('a, button, form, label')) e.preventDefault();
      if (st.editing && st.editing.el.contains(t)) {
        e.stopPropagation();
        const sec0 = t.closest('[data-sid]');
        if (sec0 && !t.closest('[data-item]') && (!st.sel || st.sel.sid !== sec0.dataset.sid)) select(sec0.dataset.sid, null, 'section', 'contenu', true);
        if (sec0 && t.closest('[data-item]')) { const it = t.closest('[data-item]'); if (!st.sel || st.sel.path !== 'c.items.' + it.dataset.item) select(sec0.dataset.sid, 'c.items.' + it.dataset.item, 'item', null, true); }
        return;
      }
      e.stopPropagation();
      if (e.pointerType === 'touch' || (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents)) ov.track(t);
      const act = t.closest('[data-act]');
      if (act) { doAct(act.dataset.act, act.closest('[data-sid]')); return; }
      const zone = t.closest('[data-zone]');
      if (zone && !t.closest('[data-sid]')) { openSite(zone.dataset.zone === 'pied' ? 'pied' : 'menu'); return; }
      const sec = t.closest('[data-sid]');
      if (!sec) return;
      const item = t.closest('[data-item]'), img = t.closest('[data-img]'), txt = t.closest('[data-e]');
      if (txt) { if (!st.sel || st.sel.sid !== sec.dataset.sid || st.sel.kind !== 'section') select(sec.dataset.sid, null, 'section', 'contenu', true); return; }
      if (item) { select(sec.dataset.sid, 'c.items.' + item.dataset.item, 'item'); return; }
      if (img) { selectEl(img); return; }
      select(sec.dataset.sid);
    }, true);
    d.addEventListener('dblclick', e => {
      const img = e.target.closest('[data-img]');
      if (img && !e.target.closest('[data-e]')) { e.preventDefault(); replaceImage(img.closest('[data-sid]').dataset.sid, img.dataset.img); }
    }, true);
    d.addEventListener('submit', e => e.preventDefault(), true);
    d.addEventListener('keydown', keys);
    d.addEventListener('paste', e => {
      if (!st.editing || st.editing.kind !== 'rich') return;
      e.preventDefault();
      const text = (e.clipboardData || win.clipboardData).getData('text/plain');
      fdoc.execCommand('insertText', false, text);
    });
  }
  function keys(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); flushEdit(); ED.publish(); }
    else if (e.key === 'Escape' && !st.editing) closePanel();
  }

  /* ---------- Écriture directe dans le texte ---------- */
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
  function onEditKey(e) {
    if (e.key === 'Escape' || (e.key === 'Enter' && st.editing && st.editing.kind === 'text')) { e.preventDefault(); st.editing.el.blur(); }
  }
  function onBlur() { setTimeout(() => { if (st.editing && fdoc.activeElement !== st.editing.el) flushEdit(); }, 0); }
  function flushEdit() {
    const ed = st.editing;
    if (!ed) return;
    clearTimeout(editTimer);
    commitEdit();
    ed.el.contentEditable = 'false';
    ed.el.removeAttribute('contenteditable');
    ed.el.classList.remove('is-editing');
    ed.el.removeEventListener('input', onEditInput);
    ed.el.removeEventListener('blur', onBlur);
    ed.el.removeEventListener('keydown', onEditKey);
    st.editing = null;
    ov.draw();
  }

  /* ---------- Actions de la barre de section ---------- */
  function barAction(a) {
    const sec = ov.hSec || (st.sel && fdoc.querySelector(`[data-sid="${st.sel.sid}"]`));
    const sid = sec && sec.dataset.sid;
    const info = sid && secById(sid);
    if (a.startsWith('it-')) return itemAction(a);
    if (a.startsWith('img-')) {
      const el = ov.hEl && ov.hEl.matches('[data-img]') ? ov.hEl : null;
      if (!el) return;
      const sid2 = el.closest('[data-sid]').dataset.sid, path = el.dataset.img;
      if (a === 'img-replace') replaceImage(sid2, path);
      if (a === 'img-settings') selectEl(el);
      if (a === 'img-del') removeImage(sid2, path);
      return;
    }
    if (!info) return;
    const list = info.list, i = info.index;
    if (a === 'edit') select(sid, null, 'section', 'contenu');
    if (a === 'style') select(sid, null, 'section', 'style');
    if (a === 'up' && i > 0) { [list[i - 1], list[i]] = [list[i], list[i - 1]]; changed(); }
    if (a === 'down' && i < list.length - 1) { [list[i + 1], list[i]] = [list[i], list[i + 1]]; changed(); }
    if (a === 'dup') { const c = cloneSection(info.sec); list.splice(i + 1, 0, c); changed(); select(c.id); }
    if (a === 'del' && confirm(`Supprimer la section « ${M.TYPES[info.sec.type].nom} » ?\n(Tu pourras annuler avec ↶)`)) {
      list.splice(i, 1);
      if (st.sel && st.sel.sid === sid) closePanel();
      ov.hSec = null; changed();
    }
    if (a === 'add-before') openAdd(i);
    if (a === 'add-after') openAdd(i + 1);
  }
  function cloneSection(s) {
    const c = M.clone(s);
    c.id = M.uid('s');
    M.arr(c.c && c.c.items).forEach(it => { it.id = M.uid('i'); });
    return c;
  }
  function doAct(act, secEl) {
    const sid = secEl && secEl.dataset.sid;
    if (act === 'add-images' && sid) addImages(sid);
    else if (act === 'edit' && sid) select(sid, null, 'section', 'contenu');
    else if (act === 'add-first') openAdd(0);
    else if (act === 'site-reseaux') openSite('reseaux');
    else if (act === 'pages-projets') openPages('projets');
    else if (act === 'replay') replay();
    else if (act.startsWith('libre-add-') && st.sel) addFreeItem(act.slice(10));
  }

  /* ---------- Glisser-déposer des sections ---------- */
  function startDrag(e, label) {
    ov.dragging = true;
    ov.ghost.textContent = label;
    ov.show(ov.ghost, true); ov.draw();
    fdoc.documentElement.classList.add('ed-dragging');
  }
  function endDrag() {
    ov.dragging = false;
    ['ghost', 'drop', 'tip'].forEach(k => ov.show(ov[k], false));
    fdoc.documentElement.classList.remove('ed-dragging');
    $$('.edo-target', fdoc).forEach(x => x.classList.remove('edo-target'));
  }
  const autoScroll = y => { if (y < 70) win.scrollBy(0, -16); else if (y > win.innerHeight - 70) win.scrollBy(0, 16); };
  // Fait défiler la page tant que le pointeur reste près du bord, même immobile
  function edgeScroller(move) {
    let last = null;
    const t = setInterval(() => { if (last && (last.clientY < 70 || last.clientY > win.innerHeight - 70)) move(last); }, 40);
    return { track: ev => { last = ev; }, stop: () => clearInterval(t) };
  }
  function dragSection(e) {
    const sec = ov.hSec; if (!sec) return;
    const info = secById(sec.dataset.sid), pg = info.page, from = info.index;
    const secs = $$('[data-sid]', fdoc);
    let to = from;
    startDrag(e, '⠿ ' + M.TYPES[info.sec.type].nom);
    let move = ev => {
      autoScroll(ev.clientY);
      to = secs.length;
      for (let i = 0; i < secs.length; i++) { const r = secs[i].getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { to = i; break; } }
      const y = to < secs.length ? secs[to].getBoundingClientRect().top : secs[secs.length - 1].getBoundingClientRect().bottom;
      ov.show(ov.drop, true);
      Object.assign(ov.drop.style, { left: win.scrollX + 12 + 'px', top: y + win.scrollY - 2 + 'px', width: win.innerWidth - 24 + 'px' });
      ov.at(ov.ghost, ev.clientX, ev.clientY);
    };
    const edge = edgeScroller(move);
    const mv0 = move;
    move = ev => { edge.track(ev); mv0(ev); };
    const up = () => {
      edge.stop();
      fdoc.removeEventListener('pointermove', move);
      endDrag();
      const target = to > from ? to - 1 : to;
      if (target !== from) { const [s] = pg.sections.splice(from, 1); pg.sections.splice(target, 0, s); changed(); select(s.id); }
    };
    fdoc.addEventListener('pointermove', move);
    fdoc.addEventListener('pointerup', up, { once: true });
  }

  /* ---------- Images : remplacer, retirer, réorganiser, agrandir ---------- */
  function imgObj(sec, path) {
    let o = M.get(sec, path);
    if (typeof o === 'string' || o == null) { o = { src: o || '' }; M.set(sec, path, o); }
    return o;
  }
  async function replaceImage(sid, path) {
    const r = secById(sid); if (!r) return;
    const apply = src => { const o = imgObj(r.sec, path); o.src = src; changed(); if (st.sel && st.sel.path === path) buildPanel(); };
    if (!ED.gh) return openLibrary(apply);
    const files = await ED.pickFiles('image/*');
    if (!files.length) return;
    const src = await ED.upload(files[0], folderOf(r.page), { max: path === 'c.media' ? 2600 : 2200 });
    if (src) apply(src);
  }
  function removeImage(sid, path) {
    const r = secById(sid); if (!r) return;
    const m = path.match(/^(.*)\.(\d+)$/);
    if (m) { M.get(r.sec, m[1]).splice(+m[2], 1); }
    else { const o = imgObj(r.sec, path); o.src = ''; }
    if (st.sel && st.sel.path === path) select(sid);
    ov.hEl = null; changed();
  }
  async function addImages(sid) {
    const r = secById(sid); if (!r) return;
    r.sec.c.images = M.arr(r.sec.c.images);
    if (!ED.gh) return openLibrary(src => { r.sec.c.images.push({ src }); changed(); buildPanel(); });
    const files = await ED.pickFiles('image/*', true);
    for (let n = 0; n < files.length; n++) {
      const src = await ED.upload(files[n], folderOf(r.page), { max: 2200, label: files.length > 1 ? `${n + 1}/${files.length}` : '' });
      if (src) { r.sec.c.images.push({ src }); changed(); if (st.sel && st.sel.sid === sid) buildPanel(); }
    }
  }
  const folderOf = p => p.type === 'projet' ? 'films/' + p.id : (p.id === 'photos' ? 'photos' : 'pages/' + p.id);
  function dragImage(e) {
    const el = ov.hEl; if (!el) return;
    const sid = el.closest('[data-sid]').dataset.sid, m = el.dataset.img.match(/^(.*)\.(\d+)$/);
    if (!m) return;
    const r = secById(sid), arrPath = m[1], from = +m[2];
    const sibs = $$(`[data-sid="${sid}"] [data-img^="${arrPath}."]`, fdoc);
    let to = from;
    startDrag(e, '⠿ Image ' + (from + 1));
    const move = ev => {
      autoScroll(ev.clientY);
      ov.at(ov.ghost, ev.clientX, ev.clientY);
      sibs.forEach(s => s.classList.remove('edo-target'));
      let best = null, bd = 1e9;
      sibs.forEach((s, i) => { const b = s.getBoundingClientRect(); const dx = ev.clientX - (b.left + b.width / 2), dy = ev.clientY - (b.top + b.height / 2); const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = i; } });
      if (best !== null) { to = best; sibs[best].classList.add('edo-target'); }
    };
    const up = () => {
      fdoc.removeEventListener('pointermove', move);
      endDrag();
      if (to !== from) { const list = M.get(r.sec, arrPath); const [x] = list.splice(from, 1); list.splice(to, 0, x); changed(); }
    };
    fdoc.addEventListener('pointermove', move);
    fdoc.addEventListener('pointerup', up, { once: true });
  }
  function resizeImage(e) {
    const el = ov.hEl; if (!el) return;
    const sid = el.closest('[data-sid]').dataset.sid, r = secById(sid), it = imgObj(r.sec, el.dataset.img);
    const gal = el.closest('.gal'), puzzle = gal.classList.contains('gal-puzzle');
    const cs = win.getComputedStyle(gal);
    const cols = cs.gridTemplateColumns.split(' ').length, gap = parseFloat(cs.columnGap) || 0;
    const gr = gal.getBoundingClientRect(), colW = (gr.width - gap * (cols - 1)) / cols;
    const rowH = puzzle ? (parseFloat(cs.gridAutoRows) || 220) : colW;
    const w0 = Math.min(+it.w || 1, cols), h0 = +it.h || 1, x0 = e.clientX, y0 = e.clientY;
    let w = w0, hh = h0;
    startDrag(e, '');
    ov.show(ov.ghost, false);
    const move = ev => {
      w = Math.max(1, Math.min(cols, Math.round(w0 + (ev.clientX - x0) / (colW + gap))));
      hh = puzzle ? Math.max(1, Math.min(4, Math.round(h0 + (ev.clientY - y0) / (rowH + gap)))) : 1;
      el.style.setProperty('--w', w); el.style.setProperty('--h', hh);
      ov.tip.textContent = puzzle ? `${w} × ${hh}` : `${w} colonne${w > 1 ? 's' : ''}`;
      ov.show(ov.tip, true); ov.at(ov.tip, ev.clientX + 14, ev.clientY + 14);
    };
    const up = () => {
      fdoc.removeEventListener('pointermove', move);
      endDrag();
      if (w !== w0 || hh !== h0) { it.w = w; it.h = hh; changed(); }
    };
    fdoc.addEventListener('pointermove', move);
    fdoc.addEventListener('pointerup', up, { once: true });
  }

  /* ---------- Texte de couverture et composition libre : déplacer ---------- */
  function moveCover(e) {
    const sec = ov.hSec; if (!sec) return;
    const r = secById(sec.dataset.sid), box = sec.querySelector('[data-drag="cov"]'), cov = sec.querySelector('.cov');
    const cr = cov.getBoundingClientRect(), pos = r.sec.c.pos = r.sec.c.pos || { x: 50, y: 50 };
    const x0 = e.clientX, y0 = e.clientY, px = +pos.x, py = +pos.y;
    startDrag(e, ''); ov.show(ov.ghost, false);
    let nx = px, ny = py;
    const move = ev => {
      nx = Math.round(Math.max(5, Math.min(95, px + (ev.clientX - x0) / cr.width * 100)));
      ny = Math.round(Math.max(8, Math.min(92, py + (ev.clientY - y0) / cr.height * 100)));
      box.style.left = nx + '%'; box.style.top = ny + '%';
      ov.tip.textContent = `X ${nx} % · Y ${ny} %`; ov.show(ov.tip, true); ov.at(ov.tip, ev.clientX + 14, ev.clientY + 14);
    };
    const up = () => { fdoc.removeEventListener('pointermove', move); endDrag(); pos.x = nx; pos.y = ny; changed(); if (st.sel && st.sel.sid === r.sec.id) buildPanel(); };
    fdoc.addEventListener('pointermove', move);
    fdoc.addEventListener('pointerup', up, { once: true });
  }
  function itemCtx() {
    const el = ov.hItem; if (!el) return null;
    const sec = el.closest('[data-sid]'), r = secById(sec.dataset.sid), i = +el.dataset.item;
    return { el, r, i, it: r.sec.c.items[i], box: el.closest('.libre').getBoundingClientRect() };
  }
  function moveItem(e) {
    const c = itemCtx(); if (!c) return;
    const x0 = e.clientX, y0 = e.clientY, px = +c.it.x || 0, py = +c.it.y || 0;
    let nx = px, ny = py;
    startDrag(e, ''); ov.show(ov.ghost, false);
    const move = ev => {
      nx = Math.round(Math.max(0, Math.min(98, px + (ev.clientX - x0) / c.box.width * 100)) * 2) / 2;
      ny = Math.round(Math.max(0, Math.min(98, py + (ev.clientY - y0) / c.box.height * 100)) * 2) / 2;
      c.el.style.left = nx + '%'; c.el.style.top = ny + '%';
      ov.tip.textContent = `X ${nx} % · Y ${ny} %`; ov.show(ov.tip, true); ov.at(ov.tip, ev.clientX + 14, ev.clientY + 14);
    };
    const up = () => { fdoc.removeEventListener('pointermove', move); endDrag(); c.it.x = nx; c.it.y = ny; changed(); refreshPanelSoon(); };
    fdoc.addEventListener('pointermove', move);
    fdoc.addEventListener('pointerup', up, { once: true });
  }
  function resizeItem(e) {
    const c = itemCtx(); if (!c) return;
    const x0 = e.clientX, w0 = +c.it.w || 30;
    let w = w0;
    startDrag(e, ''); ov.show(ov.ghost, false);
    const move = ev => {
      w = Math.round(Math.max(5, Math.min(100, w0 + (ev.clientX - x0) / c.box.width * 100)));
      c.el.style.width = w + '%';
      ov.tip.textContent = `Largeur ${w} %`; ov.show(ov.tip, true); ov.at(ov.tip, ev.clientX + 14, ev.clientY + 14);
    };
    const up = () => { fdoc.removeEventListener('pointermove', move); endDrag(); c.it.w = w; changed(); refreshPanelSoon(); };
    fdoc.addEventListener('pointermove', move);
    fdoc.addEventListener('pointerup', up, { once: true });
  }
  function itemAction(a) {
    const c = itemCtx(); if (!c) return;
    const items = c.r.sec.c.items, zs = items.map(x => +x.z || 1);
    if (a === 'it-front') { c.it.z = Math.max(...zs) + 1; changed(); }
    if (a === 'it-back') { items.forEach(x => { x.z = (+x.z || 1) + 1; }); c.it.z = 1; changed(); }
    if (a === 'it-settings') select(c.r.sec.id, 'c.items.' + c.i, 'item');
    if (a === 'it-replace') replaceImage(c.r.sec.id, 'c.items.' + c.i);
    if (a === 'it-del' && confirm('Supprimer cet élément ?')) { items.splice(c.i, 1); ov.hItem = null; if (st.sel && st.sel.kind === 'item') select(c.r.sec.id); changed(); }
  }
  function addFreeItem(kind) {
    const r = secById(st.sel.sid); if (!r) return;
    const items = r.sec.c.items = M.arr(r.sec.c.items);
    const z = Math.max(0, ...items.map(x => +x.z || 1)) + 1;
    const it = { id: M.uid('i'), k: kind, x: 30, y: 30, w: kind === 'bouton' ? 20 : 36, z };
    if (kind === 'texte') it.html = '<h2>Nouveau texte</h2><p>Clique pour écrire.</p>';
    if (kind === 'bouton') it.bouton = { texte: 'Bouton', type: 'page', cible: 'contact', style: 'plein' };
    if (kind === 'image') it.src = '';
    items.push(it); changed();
    select(r.sec.id, 'c.items.' + (items.length - 1), 'item');
    if (kind === 'image') replaceImage(r.sec.id, 'c.items.' + (items.length - 1));
  }
  function replay() {
    if (!st.sel || !fdoc) return;
    const el = fdoc.querySelector(`[data-sid="${st.sel.sid}"]`);
    if (!el) return;
    const targets = [...(el.matches('.anim') ? [el] : []), ...el.querySelectorAll('.anim')];
    if (!targets.length) { ED.toast('Choisis d’abord une animation d’entrée.'); return; }
    targets.forEach(t => { t.classList.remove('replay'); void t.offsetWidth; t.classList.add('replay'); });
  }

  /* ==========================================================================
     Sélection et panneau de réglages
     ========================================================================== */
  function select(sid, path = null, kind = 'section', tab, keepEdit) {
    if (!keepEdit) flushEdit();
    const prevKind = st.sel && st.sel.kind;
    st.sel = { sid, path, kind };
    if (tab) st.tab = tab;
    else if (prevKind !== kind) st.tab = { section: 'contenu', image: 'image', item: 'element' }[kind];
    buildPanel();
    if (ov.root) ov.draw();
  }
  function selectEl(el) { select(el.closest('[data-sid]').dataset.sid, el.dataset.img, 'image'); }
  function closePanel() { st.sel = null; const P = $('#panel'); if (P) { P.hidden = true; document.body.classList.remove('has-panel'); } if (ov.root) ov.draw(); }
  function refreshPanelSoon() { clearTimeout(panelTimer); panelTimer = setTimeout(buildPanel, 30); }

  function buildPanel() {
    const P = $('#panel'), sel = st.sel;
    if (!P) return;
    if (!sel) return closePanel();
    const r = secById(sel.sid);
    if (!r) return closePanel();
    const scroll = P.querySelector('.pn-body') ? P.querySelector('.pn-body').scrollTop : 0;
    let tabs, title, body = [];
    const ctx = { r, sec: r.sec, page: r.page, rerender: refreshPanelSoon };
    if (sel.kind === 'image') {
      const o = imgObj(r.sec, sel.path);
      const cover = sel.path === 'c.media';
      const disp = r.sec.type === 'galerie' ? r.sec.c.disposition : '';
      tabs = cover ? [['image', 'Image']] : [['image', 'Image'], ['effets', 'Effets'], ['anim', 'Animation']];
      title = cover ? 'Image de couverture' : 'Image';
      if (st.tab === 'image') body = fields(o, imageFields(cover, disp, /\.\d+$/.test(sel.path)), ctx);
      if (st.tab === 'effets') body = fields(o, EFFETS, ctx);
      if (st.tab === 'anim') body = fields(o, animFields('anim'), ctx);
      if (!cover && /\.\d+$/.test(sel.path)) body.push(h('button', { class: 'btn danger-btn wide', onclick: () => removeImage(sel.sid, sel.path) }, 'Retirer cette image'));
    } else if (sel.kind === 'item') {
      const it = M.get(r.sec, sel.path);
      if (!it) return select(sel.sid);
      tabs = [['element', 'Élément'], ...(it.k === 'image' ? [['image', 'Image'], ['effets', 'Effets']] : []), ['anim', 'Animation']];
      title = { texte: 'Texte libre', image: 'Image libre', bouton: 'Bouton libre' }[it.k] || 'Élément';
      if (st.tab === 'element') body = fields(it, itemFields(it), ctx);
      if (st.tab === 'image') body = fields(it, imageFields(false, '', false), ctx);
      if (st.tab === 'effets') body = fields(it, EFFETS, ctx);
      if (st.tab === 'anim') body = fields(it, animFields('anim'), ctx);
    } else {
      tabs = [['contenu', 'Contenu'], ['style', 'Style'], ['texte', 'Texte'], ['anim', 'Animation']];
      title = M.TYPES[r.sec.type].nom;
      if (st.tab === 'contenu') body = fields(r.sec, CONTENT[r.sec.type] || [], ctx);
      if (st.tab === 'style') body = [styleTools(r.sec), ...fields(r.sec, STYLE, ctx)];
      if (st.tab === 'texte') body = fields(r.sec, TEXTE, ctx);
      if (st.tab === 'anim') body = fields(r.sec, [...animFields('a'), { t: 'select', k: 'a.cible', l: 'Appliquer à', options: [['section', 'Toute la section d’un coup'], ['elements', 'Chaque élément, l’un après l’autre']] }], ctx);
    }
    if (!tabs.find(t => t[0] === st.tab)) { st.tab = tabs[0][0]; return buildPanel(); }
    const crumbs = sel.kind !== 'section' ? h('button', { class: 'pn-back', onclick: () => select(sel.sid) }, '← Section ' + M.TYPES[r.sec.type].nom) : null;
    P.replaceChildren(
      h('div', { class: 'pn-head' }, h('div', {}, crumbs, h('strong', {}, title)), h('button', { class: 'pn-x', title: 'Fermer', onclick: closePanel }, '×')),
      h('div', { class: 'pn-tabs' }, tabs.map(([k, l]) => h('button', { class: st.tab === k ? 'on' : '', onclick: () => { st.tab = k; buildPanel(); } }, l))),
      h('div', { class: 'pn-body' }, body.filter(Boolean)));
    P.hidden = false;
    document.body.classList.add('has-panel');
    P.querySelector('.pn-body').scrollTop = scroll;
  }
  function styleTools(sec) {
    return h('div', { class: 'pn-tools' },
      h('button', { class: 'btn small ghost', onclick: () => { st.clip = M.clone(sec.s); ED.toast('Style copié. Ouvre une autre section → Style → Coller.'); } }, 'Copier le style'),
      h('button', { class: 'btn small ghost', disabled: !st.clip, onclick: () => { sec.s = Object.assign({}, M.clone(st.clip)); changed(); buildPanel(); } }, 'Coller'),
      h('button', { class: 'btn small ghost', onclick: () => { if (confirm('Réinitialiser le style de cette section ?')) { sec.s = Object.assign({}, M.TYPES[sec.type].s); changed(); buildPanel(); } } }, 'Réinitialiser'));
  }

  /* ---------- Définition des réglages ---------- */
  const RATIOS = [['auto', 'Format d’origine'], ['16/9', '16:9'], ['2.39/1', '2.39:1 (cinémascope)'], ['3/2', '3:2'], ['4/3', '4:3'], ['1/1', 'Carré'], ['4/5', 'Portrait 4:5'], ['3/4', 'Portrait 3:4'], ['9/16', 'Vertical 9:16']];
  const TXT_NOTE = { t: 'note', l: 'Les textes se modifient directement sur la page : clique dedans et écris. Sélectionne des mots pour les mettre en gras, en lien, en couleur…' };
  const BTNS = { k: 'c.boutons', l: 'Boutons d’action', t: 'buttons' };
  const textFields = [TXT_NOTE, { k: 'c.surtitre', l: 'Surtitre (petit texte au-dessus)', t: 'text' }, { k: 'c.titre', l: 'Titre', t: 'text' }, { k: 'c.sousTitre', l: 'Sous-titre', t: 'text' }, { k: 'c.tags', l: 'Mots-clés (séparés par des virgules)', t: 'tags' }, BTNS];
  const CONTENT = {
    couverture: [
      { t: 'heading', l: 'Image ou vidéo de fond' },
      { k: 'c.media.type', t: 'seg', options: [['image', 'Image'], ['video', 'Vidéo']], rerender: true },
      { k: 'c.media.src', l: 'Image (aussi utilisée sur téléphone)', t: 'image', max: 2600 },
      { k: 'c.media.video', l: 'Lien de la vidéo (YouTube, Vimeo ou .mp4)', t: 'video', if: o => o.c.media && o.c.media.type === 'video', help: 'Elle tourne en boucle, sans son. Sur téléphone, l’image s’affiche à la place : le site reste rapide.' },
      { k: 'c.hauteur', l: 'Hauteur', t: 'range', min: 25, max: 100, unit: '% écran' },
      { t: 'heading', l: 'Superposition (assombrit l’image)' },
      { k: 'c.superposition.couleur', l: 'Couleur', t: 'color' },
      { k: 'c.superposition.opacite', l: 'Intensité', t: 'range', min: 0, max: 90, unit: '%' },
      { k: 'c.superposition.degrade', l: 'En dégradé vers le bas', t: 'check' },
      { t: 'heading', l: 'Texte par-dessus' },
      { t: 'note', l: 'Astuce : attrape la poignée ✥ à gauche du texte pour le déplacer directement sur l’image.' },
      { k: 'c.pos.x', l: 'Position horizontale (X)', t: 'range', min: 5, max: 95, unit: '%' },
      { k: 'c.pos.y', l: 'Position verticale (Y)', t: 'range', min: 8, max: 92, unit: '%' },
      { k: 'c.alignTexte', l: 'Alignement', t: 'seg', options: [['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']] },
      { k: 'c.largeurTexte', l: 'Largeur maximale du texte', t: 'range', min: 240, max: 1400, step: 10, unit: 'px' },
      { k: 'c.animTitre', l: 'Animation du titre', t: 'select', options: [['lettres', 'Les lettres apparaissent une à une'], ['', 'Aucune (utilise l’onglet Animation)']] },
      BTNS],
    entete: [TXT_NOTE, { k: 'c.pastille', l: 'Pastille (ex. Court-métrage)', t: 'text' }, { k: 'c.titre', l: 'Titre', t: 'text' }, { k: 'c.sousTitre', l: 'Sous-titre', t: 'text' }],
    texte: textFields, encadre: textFields,
    colonnes: [{ k: 'c.img.src', l: 'Image', t: 'image' }, { k: 'c.imageCote', l: 'Image à', t: 'seg', options: [['gauche', 'Gauche'], ['droite', 'Droite']] },
      { k: 'c.proportion', l: 'Largeur de l’image', t: 'range', min: 25, max: 75, unit: '%' }, { k: 'c.img.ratio', l: 'Format de l’image', t: 'select', options: RATIOS }, ...textFields],
    image: [{ k: 'c.img.src', l: 'Image', t: 'image' }, { k: 'c.img.ratio', l: 'Format', t: 'select', options: RATIOS }, { k: 'c.legende', l: 'Légende', t: 'text' },
      { t: 'note', l: 'Clique sur l’image dans la page pour le cadrage, les filtres, la bordure, le texte par-dessus…' }],
    galerie: [
      { k: 'c.disposition', l: 'Disposition', t: 'layouts', rerender: true },
      { k: 'c.colonnes', l: 'Colonnes sur ordinateur', t: 'range', min: 1, max: 6, if: o => ['puzzle', 'grille', 'mosaique'].includes(o.c.disposition) },
      { k: 'c.colonnesM', l: 'Colonnes sur téléphone', t: 'range', min: 1, max: 3, if: o => ['puzzle', 'grille', 'mosaique'].includes(o.c.disposition) },
      { k: 'c.hauteurRang', l: 'Hauteur d’une rangée', t: 'range', min: 100, max: 520, step: 10, unit: 'px', if: o => o.c.disposition === 'puzzle' },
      { k: 'c.hauteurBande', l: 'Hauteur de la bande', t: 'range', min: 200, max: 820, step: 10, unit: 'px', if: o => o.c.disposition === 'bande' },
      { k: 'c.ratio', l: 'Format des images', t: 'select', options: RATIOS, if: o => ['grille', 'diaporama'].includes(o.c.disposition) },
      { k: 'c.defilementAuto', l: 'Défilement automatique', t: 'check', if: o => o.c.disposition === 'diaporama' },
      { k: 'c.espacement', l: 'Espacement entre les images', t: 'range', min: 0, max: 60, unit: 'px' },
      { k: 'c.survol', l: 'Effet au survol des images', t: 'select', options: M.HOVERS },
      { t: 'note', l: 'Puzzle et grille : tire la poignée ⇲ dans le coin d’une image pour l’agrandir. Glisse ⠿ pour changer l’ordre.', if: o => ['puzzle', 'grille'].includes(o.c.disposition) },
      { k: 'c.images', l: 'Images', t: 'gallery' }],
    video: [{ k: 'c.url', l: 'Lien de la vidéo (YouTube, Vimeo ou .mp4)', t: 'video' }, { k: 'c.poster', l: 'Image d’aperçu (optionnel)', t: 'image' }, { k: 'c.ratio', l: 'Format', t: 'select', options: RATIOS.slice(1) }, { k: 'c.legende', l: 'Légende', t: 'text' }],
    projets: [
      { k: 'c.titre', l: 'Titre au-dessus des projets', t: 'text' },
      { k: 'c.filtres', l: 'Afficher les filtres par genre', t: 'check', rerender: true },
      { k: 'c.tousLabel', l: 'Texte du premier filtre', t: 'text', if: o => o.c.filtres !== false },
      { k: 'c.ordreGenres', l: 'Ordre des filtres', t: 'genres', if: o => o.c.filtres !== false },
      { k: 'c.genre', l: 'N’afficher qu’un seul genre', t: 'genre' },
      { k: 'c.afficherGenre', l: 'Afficher le genre sous chaque projet', t: 'check' },
      { k: 'c.afficherRoles', l: 'Afficher mes rôles sous chaque projet', t: 'check' },
      { k: 'c.colonnes', l: 'Projets par ligne (ordinateur)', t: 'range', min: 1, max: 4 },
      { k: 'c.colonnesM', l: 'Projets par ligne (téléphone)', t: 'range', min: 1, max: 2 },
      { k: 'c.ratio', l: 'Format des vignettes', t: 'select', options: RATIOS.slice(1) },
      { k: 'c.animation', l: 'Animation au survol', t: 'select', options: M.PROJ_ANIMS },
      { t: 'action', l: 'Modifier mes projets (genre, rôles, vignette…)', act: 'pages-projets' }],
    fiche: [TXT_NOTE, { k: 'c.infos', l: 'Détails (durée, format, année…)', t: 'pairs', a: ['label', 'Intitulé'], b: ['valeur', 'Valeur'] },
      { k: 'c.credits', l: 'Crédits', t: 'pairs', a: ['fonction', 'Fonction'], b: ['noms', 'Noms (séparés par « - »)'], area: true }],
    infos: [{ k: 'c.titre', l: 'Titre (optionnel)', t: 'text' }, { k: 'c.lignes', l: 'Lignes', t: 'pairs', a: ['label', 'Intitulé'], b: ['valeur', 'Valeur'] }, { k: 'c.colonnes', l: 'Colonnes', t: 'seg', options: [[1, '1'], [2, '2']] }],
    credits: [{ k: 'c.titre', l: 'Titre (optionnel)', t: 'text' }, { k: 'c.lignes', l: 'Personnes', t: 'pairs', a: ['fonction', 'Fonction'], b: ['noms', 'Noms (séparés par « - »)'], area: true }],
    liste: [TXT_NOTE, { k: 'c.titre', l: 'Titre (optionnel)', t: 'text' }, { k: 'c.items', l: 'Éléments', t: 'items', sub: [['date', 'Date'], ['titre', 'Intitulé']], blank: { date: '', titre: 'Nouvel élément', html: '<p>Description</p>' } }],
    tags: [{ k: 'c.titre', l: 'Titre (optionnel)', t: 'text' }, { k: 'c.tags', l: 'Mots-clés (séparés par des virgules)', t: 'tags' }],
    contact: [TXT_NOTE, { k: 'c.email', l: 'E-mail', t: 'text' }, { k: 'c.telephone', l: 'Téléphone', t: 'text' }, { k: 'c.lieu', l: 'Ville / zone', t: 'text' },
      { k: 'c.reseaux', l: 'Afficher mes réseaux sociaux', t: 'check' }, { t: 'action', l: 'Modifier mes réseaux sociaux', act: 'site-reseaux' },
      { k: 'c.formulaire', l: 'Afficher un formulaire de contact', t: 'check', rerender: true },
      { k: 'c.formspree', l: 'Adresse Formspree (optionnel)', t: 'text', if: o => o.c.formulaire, help: 'Sans adresse, le formulaire ouvre la messagerie du visiteur. Avec un compte gratuit formspree.io, tu reçois les messages par e-mail.' }],
    reseaux: [{ k: 'c.titre', l: 'Titre (optionnel)', t: 'text' }, { t: 'action', l: 'Modifier mes réseaux sociaux', act: 'site-reseaux' }],
    boutons: [BTNS],
    fichiers: [{ k: 'c.titre', l: 'Titre (optionnel)', t: 'text' }, { k: 'c.fichiers', l: 'Fichiers à télécharger', t: 'files' }],
    spotify: [{ k: 'c.titre', l: 'Titre (optionnel)', t: 'text' },
      { k: 'c.liens', l: 'Liens Spotify (un par ligne)', t: 'lines', help: 'Dans Spotify : ⋯ (ou clic droit) → Partager → Copier le lien. Titre, album, playlist, artiste ou podcast. Le lecteur affiche la pochette, le titre, l’artiste et un extrait.' },
      { k: 'c.taille', l: 'Taille du lecteur', t: 'seg', options: [['compact', 'Compact'], ['grand', 'Grand']] },
      { k: 'c.colonnes', l: 'Lecteurs par ligne', t: 'range', min: 1, max: 3 }],
    espace: [{ k: 'c.hauteur', l: 'Hauteur', t: 'range', min: 0, max: 400, step: 5, unit: 'px' }, { k: 'c.ligne', l: 'Afficher une ligne', t: 'check', rerender: true },
      { k: 'c.couleurLigne', l: 'Couleur de la ligne', t: 'color', if: o => o.c.ligne }, { k: 'c.epaisseur', l: 'Épaisseur', t: 'range', min: 1, max: 10, unit: 'px', if: o => o.c.ligne },
      { k: 'c.largeurLigne', l: 'Largeur', t: 'range', min: 5, max: 100, unit: '%', if: o => o.c.ligne }],
    libre: [{ k: 'c.hauteur', l: 'Hauteur de la zone (ordinateur)', t: 'range', min: 200, max: 1600, step: 10, unit: 'px' },
      { t: 'action', l: '+ Ajouter un texte', act: 'libre-add-texte' }, { t: 'action', l: '+ Ajouter une image', act: 'libre-add-image' }, { t: 'action', l: '+ Ajouter un bouton', act: 'libre-add-bouton' },
      { t: 'note', l: 'Sur la page : ✥ pour déplacer un élément, ⇲ pour sa largeur, ⬆/⬇ pour le passer devant ou derrière. Sur téléphone, les éléments s’empilent de haut en bas.' }]
  };
  const STYLE = [
    { t: 'heading', l: 'Mise en page' },
    { k: 's.largeur', l: 'Largeur du contenu', t: 'seg', options: [['pleine', 'Pleine'], ['large', 'Large'], ['normale', 'Normale'], ['etroite', 'Étroite']] },
    { k: 's.align', l: 'Alignement', t: 'seg', options: [['', 'Auto'], ['left', 'Gauche'], ['center', 'Centre'], ['right', 'Droite']] },
    { k: 's.pt', l: 'Marge au-dessus', t: 'range', min: 0, max: 260, step: 2, unit: 'px', auto: 48 },
    { k: 's.pb', l: 'Marge en dessous', t: 'range', min: 0, max: 260, step: 2, unit: 'px', auto: 48 },
    { k: 's.hauteurMin', l: 'Hauteur minimale', t: 'range', min: 0, max: 100, unit: '% écran', rerender: true },
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
    { k: 's.fondFixe', l: 'Effet parallaxe (image fixe au défilement)', t: 'check', if: o => o.s.fondImage },
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
    { k: 's.decalX', l: 'Décalage horizontal (X)', t: 'range', min: -400, max: 400, unit: 'px' },
    { k: 's.decalY', l: 'Décalage vertical (Y)', t: 'range', min: -400, max: 400, unit: 'px' },
    { k: 's.calque', l: 'Ordre des couches (passe devant les autres)', t: 'range', min: 0, max: 20 },
    { t: 'heading', l: '📱 Téléphone' },
    { k: 's.ptM', l: 'Marge au-dessus (téléphone)', t: 'range', min: 0, max: 200, step: 2, unit: 'px', auto: 34 },
    { k: 's.pbM', l: 'Marge en dessous (téléphone)', t: 'range', min: 0, max: 200, step: 2, unit: 'px', auto: 34 },
    { k: 's.masquerMobile', l: 'Masquer sur téléphone', t: 'check' },
    { k: 's.masquerOrdi', l: 'Masquer sur ordinateur', t: 'check' }
  ];
  const typo = (base, l) => [
    { t: 'heading', l },
    { k: base + '.police', l: 'Police', t: 'font' },
    { k: base + '.taille', l: 'Taille (ordinateur)', t: 'range', min: 8, max: 160, unit: 'px', auto: 0 },
    { k: base + '.tailleM', l: 'Taille (téléphone)', t: 'range', min: 8, max: 100, unit: 'px', auto: 0 },
    { k: base + '.graisse', l: 'Épaisseur', t: 'select', options: [['', 'Auto'], ['300', 'Fine'], ['400', 'Normale'], ['500', 'Moyenne'], ['600', 'Semi-grasse'], ['700', 'Grasse'], ['800', 'Très grasse']] },
    { k: base + '.majuscules', l: 'Majuscules', t: 'seg', options: [['', 'Auto'], ['oui', 'MAJUSCULES'], ['non', 'Normal']] },
    { k: base + '.italique', l: 'Italique', t: 'check' },
    { k: base + '.souligne', l: 'Souligné', t: 'check' },
    { k: base + '.interligne', l: 'Interligne', t: 'range', min: 0.8, max: 3, step: 0.05, auto: 0 },
    { k: base + '.interlettrage', l: 'Interlettrage', t: 'range', min: -0.1, max: 0.8, step: 0.01, unit: 'em', auto: 0 },
    { k: base + '.couleur', l: 'Couleur', t: 'color' },
    { k: base + '.degrade.actif', l: 'Couleur en dégradé', t: 'check', rerender: true },
    { k: base + '.degrade.c1', l: 'Dégradé : couleur 1', t: 'color', if: o => (M.get(o, base + '.degrade') || {}).actif },
    { k: base + '.degrade.c2', l: 'Dégradé : couleur 2', t: 'color', if: o => (M.get(o, base + '.degrade') || {}).actif },
    { k: base + '.degrade.angle', l: 'Dégradé : direction', t: 'range', min: 0, max: 360, step: 5, unit: '°', if: o => (M.get(o, base + '.degrade') || {}).actif },
    { k: base + '.fond', l: 'Arrière-plan du texte', t: 'color' },
    { k: base + '.ombre', l: 'Ombre', t: 'select', options: [['', 'Aucune'], ['douce', 'Douce'], ['forte', 'Forte'], ['neon', 'Néon'], ['contour', 'Contour']] },
    { k: base + '.largeurMax', l: 'Largeur maximale', t: 'range', min: 120, max: 1600, step: 10, unit: 'px', auto: 0 }
  ];
  const TEXTE = [...typo('s.tt', 'Titres'), ...typo('s.t', 'Paragraphes'),
    { t: 'heading', l: 'Liens' },
    { k: 's.lien.couleur', l: 'Couleur des liens', t: 'color' },
    { k: 's.lien.survol', l: 'Effet au survol des liens', t: 'select', options: [['', 'Par défaut'], ['souligne', 'Soulignement animé'], ['couleur', 'Changement de couleur'], ['surligne', 'Surlignage'], ['aucun', 'Aucun']] }];
  const animFields = base => [
    { k: base + '.type', l: 'Animation d’entrée', t: 'select', options: M.ANIMS, rerender: true },
    { k: base + '.duree', l: 'Durée', t: 'range', min: 0.2, max: 3, step: 0.1, unit: 's', auto: 0.9, if: o => (M.get(o, base) || {}).type },
    { k: base + '.delai', l: 'Délai avant de commencer', t: 'range', min: 0, max: 3, step: 0.1, unit: 's', if: o => (M.get(o, base) || {}).type },
    { t: 'action', l: '▶ Rejouer l’animation', act: 'replay', if: o => (M.get(o, base) || {}).type }];
  const imageFields = (cover, disp, inArr) => [
    { k: 'src', l: 'Image', t: 'image', max: cover ? 2600 : 2200 },
    ...(cover ? [] : [{ k: 'alt', l: 'Description (pour Google et l’accessibilité)', t: 'text' }, { k: 'legende', l: 'Légende', t: 'text' },
      { k: 'fit', l: 'Ajustement', t: 'seg', options: [['cover', 'Remplir le cadre'], ['contain', 'Image entière']] }]),
    { k: 'posX', l: 'Cadrage horizontal (X)', t: 'range', min: 0, max: 100, unit: '%', auto: 50 },
    { k: 'posY', l: 'Cadrage vertical (Y)', t: 'range', min: 0, max: 100, unit: '%', auto: 50 },
    ...(cover ? [] : [{ k: 'zoom', l: 'Zoom', t: 'range', min: 100, max: 250, step: 5, unit: '%', auto: 100 }]),
    ...(inArr && ['puzzle', 'grille'].includes(disp) ? [{ k: 'w', l: 'Largeur (en colonnes)', t: 'range', min: 1, max: 6, auto: 1 }] : []),
    ...(inArr && disp === 'puzzle' ? [{ k: 'h', l: 'Hauteur (en rangées)', t: 'range', min: 1, max: 4, auto: 1 }] : []),
    ...(cover ? [] : [{ k: 'lien', l: 'Lien au clic (optionnel)', t: 'text', help: 'Ex. https://… ou projet.html?id=freres. Sans lien, l’image s’agrandit au clic.' }])];
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
    { k: 'fond', l: 'Arrière-plan (visible en mode « image entière »)', t: 'color' },
    { t: 'heading', l: 'Texte par-dessus l’image' },
    { k: 'texteActif', l: 'Ajouter un texte sur l’image', t: 'check', rerender: true, after: o => { if (o.texteActif && !o.texte) o.texte = '<h2>Titre</h2><p>Texte sur l’image</p>'; if (!o.texteActif) o.texte = ''; } },
    { k: 'texteZone', l: 'Position du texte', t: 'zone9', if: o => o.texteActif || o.texte },
    { t: 'note', l: 'Le texte se modifie directement sur l’image : clique dedans.', if: o => o.texteActif || o.texte }];
  const itemFields = it => [
    { k: 'x', l: 'Position X', t: 'range', min: 0, max: 98, step: 0.5, unit: '%' },
    { k: 'y', l: 'Position Y', t: 'range', min: 0, max: 98, step: 0.5, unit: '%' },
    { k: 'w', l: 'Largeur', t: 'range', min: 5, max: 100, unit: '%' },
    { k: 'z', l: 'Ordre des couches', t: 'range', min: 1, max: 30 },
    ...(it.k === 'bouton' ? [{ k: 'bouton', t: 'button1' }] : []),
    ...(it.k === 'texte' ? [TXT_NOTE] : [])];

  /* ---------- Fabrique de champs ---------- */
  function fields(obj, defs, ctx) { return defs.map(d => field(obj, d, ctx)).filter(Boolean); }
  function field(obj, def, ctx) {
    if (def.if && !def.if(obj, ctx)) return null;
    const get = () => M.get(obj, def.k);
    const set = (v, noRerender) => {
      M.set(obj, def.k, v);
      if (def.after) def.after(obj, v, ctx);
      changed();
      if (def.rerender && !noRerender) ctx.rerender();
    };
    const wrap = (...kids) => h('div', { class: 'f f-' + def.t }, def.l ? h('label', { class: 'f-l' }, def.l) : null, ...kids, def.help ? h('p', { class: 'help' }, def.help) : null);
    const v = get();
    switch (def.t) {
      case 'heading': return h('h4', { class: 'pn-h' }, def.l);
      case 'note': return h('p', { class: 'pn-note' }, def.l);
      case 'action': return h('button', { class: 'btn ghost wide pn-act', onclick: () => doAct(def.act) }, def.l);
      case 'text': return wrap(h('input', { type: 'text', value: v ?? '', placeholder: def.ph || '', oninput: e => set(e.target.value) }));
      case 'tags': return wrap(h('input', { type: 'text', value: M.arr(v).join(', '), oninput: e => set(e.target.value.split(',').map(x => x.trim()).filter(Boolean)) }));
      case 'lines': {
        const ta = h('textarea', { rows: 4, value: M.arr(v).join('\n'), oninput: e => set(e.target.value.split('\n').map(x => x.trim()).filter(Boolean)) });
        return wrap(ta);
      }
      case 'video': {
        const stt = h('div', { class: 'vid-st' });
        const upd = () => { const x = M.video(get()); stt.textContent = !get() ? '' : x ? `✓ ${{ youtube: 'YouTube', vimeo: 'Vimeo', file: 'Fichier vidéo' }[x.type]} reconnu` : '⚠ Lien non reconnu'; stt.className = 'vid-st ' + (x ? 'ok' : 'warn'); };
        upd();
        return wrap(h('input', { type: 'url', inputmode: 'url', value: v || '', placeholder: 'https://www.youtube.com/watch?v=…', oninput: e => { set(e.target.value.trim()); upd(); } }), stt);
      }
      case 'select': {
        const s = h('select', { onchange: e => set(e.target.value) }, def.options.map(([val, l]) => h('option', { value: val }, l)));
        s.value = v ?? def.options[0][0];
        return wrap(s);
      }
      case 'font': {
        const s = h('select', { onchange: e => set(e.target.value) }, h('option', { value: '' }, 'Police du site'), Object.keys(M.FONTS).map(f => h('option', { value: f }, f)));
        s.value = v || '';
        return wrap(s);
      }
      case 'seg': return wrap(h('div', { class: 'seg' }, def.options.map(([val, l]) => h('button', { type: 'button', class: String(v ?? def.options[0][0]) === String(val) ? 'on' : '', onclick: e => { set(val); $$('button', e.target.parentNode).forEach(b => b.classList.toggle('on', b === e.target)); } }, l))));
      case 'check': return h('label', { class: 'f f-check' }, h('input', { type: 'checkbox', checked: !!v, onchange: e => set(e.target.checked) }), h('span', { class: 'sw' }), h('span', {}, def.l));
      case 'color': {
        const txt = h('input', { type: 'text', class: 'hex', value: v || '', placeholder: 'Aucune', oninput: e => { const x = e.target.value.trim(); if (!x || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(x) || /^rgba?\(/.test(x)) { set(x); if (/^#[0-9a-f]{6}$/i.test(x)) pick.value = x; } } });
        const pick = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v || '') ? v : '#ffffff', oninput: e => { set(e.target.value); txt.value = e.target.value; } });
        return wrap(h('div', { class: 'row' }, pick, txt, h('button', { type: 'button', class: 'sm', title: 'Aucune couleur', onclick: () => { set(''); txt.value = ''; } }, '×')));
      }
      case 'range': {
        const unset = v === undefined || v === null || v === '';
        const out = h('output', {}, unset ? (def.auto !== undefined ? 'Auto' : '—') : `${v}${def.unit ? ' ' + def.unit : ''}`);
        const r = h('input', { type: 'range', min: def.min, max: def.max, step: def.step || 1, value: unset ? (def.auto || def.min) : v,
          oninput: e => { const x = +e.target.value; set(x, true); out.textContent = `${x}${def.unit ? ' ' + def.unit : ''}`; },
          onchange: () => { if (def.rerender) ctx.rerender(); } });
        return wrap(h('div', { class: 'row' }, r, out, h('button', { type: 'button', class: 'sm', title: 'Revenir à la valeur par défaut', onclick: () => { set(''); out.textContent = def.auto !== undefined ? 'Auto' : '—'; r.value = def.auto || def.min; } }, '↺')));
      }
      case 'image': {
        const img = h('img', { alt: '' });
        const box = h('div', { class: 'thumb' + (v ? '' : ' empty') }, img, h('span', {}, 'Aucune image'));
        if (v) { img.src = ED.src(v); img.onerror = () => { img.onerror = null; img.src = ED.rawUrl(v); }; }
        const apply = p => { set(p); ctx.rerender(); };
        return wrap(box, h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn small', onclick: async () => {
            if (!ED.gh) return openLibrary(apply);
            const f = await ED.pickFiles('image/*'); if (!f.length) return;
            const p = await ED.upload(f[0], folderOf(ctx.page), { max: def.max || 2200 }); if (p) apply(p);
          } }, v ? 'Remplacer' : 'Envoyer une image'),
          h('button', { type: 'button', class: 'btn small ghost', onclick: () => openLibrary(apply) }, 'Bibliothèque'),
          v ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => apply('') }, 'Retirer') : null));
      }
      case 'layouts': {
        const L = { puzzle: '<rect x="2" y="2" width="26" height="26" rx="2"/><rect x="31" y="2" width="13" height="12" rx="2"/><rect x="31" y="16" width="13" height="12" rx="2"/>', grille: '<rect x="2" y="2" width="12" height="12" rx="2"/><rect x="17" y="2" width="12" height="12" rx="2"/><rect x="32" y="2" width="12" height="12" rx="2"/><rect x="2" y="16" width="12" height="12" rx="2"/><rect x="17" y="16" width="12" height="12" rx="2"/><rect x="32" y="16" width="12" height="12" rx="2"/>', mosaique: '<rect x="2" y="2" width="12" height="16" rx="2"/><rect x="17" y="2" width="12" height="9" rx="2"/><rect x="32" y="2" width="12" height="13" rx="2"/><rect x="2" y="21" width="12" height="7" rx="2"/><rect x="17" y="14" width="12" height="14" rx="2"/><rect x="32" y="18" width="12" height="10" rx="2"/>', bande: '<rect x="-6" y="5" width="16" height="20" rx="2"/><rect x="13" y="5" width="20" height="20" rx="2"/><rect x="36" y="5" width="16" height="20" rx="2"/>', diaporama: '<rect x="6" y="3" width="34" height="20" rx="2"/><circle cx="19" cy="27" r="1.4"/><circle cx="23" cy="27" r="1.4"/><circle cx="27" cy="27" r="1.4"/>', pile: '<rect x="4" y="2" width="38" height="12" rx="2"/><rect x="4" y="16" width="38" height="12" rx="2"/>', duo: '<rect x="2" y="4" width="20" height="22" rx="2"/><rect x="24" y="4" width="20" height="22" rx="2"/>' };
        return wrap(h('div', { class: 'layouts' }, M.DISPOSITIONS.map(([k, l]) => h('button', { type: 'button', class: v === k ? 'on' : '', title: l, onclick: () => set(k), html: `<svg viewBox="0 0 46 30">${L[k]}</svg><span>${l.split(' (')[0]}</span>` }))));
      }
      case 'zone9': {
        const Z = ['haut-gauche', 'haut', 'haut-droite', 'gauche', 'centre', 'droite', 'bas-gauche', 'bas', 'bas-droite'];
        return wrap(h('div', { class: 'zone9' }, Z.map(z => h('button', { type: 'button', title: z, class: (v || 'centre') === z ? 'on' : '', onclick: () => set(z, false) }))));
      }
      case 'genre': {
        const g = M.genres(ED.data);
        const s = h('select', { onchange: e => set(e.target.value) }, h('option', { value: '' }, 'Tous les genres'), g.map(x => h('option', { value: x }, x)));
        s.value = v || '';
        return wrap(s);
      }
      case 'genres': {
        const found = M.genres(ED.data);
        const order = [...M.arr(v).filter(x => found.includes(x)), ...found.filter(x => !M.arr(v).includes(x))];
        const mv = (i, d) => { const j = i + d; if (j < 0 || j >= order.length) return; [order[i], order[j]] = [order[j], order[i]]; set(order.slice()); ctx.rerender(); };
        return wrap(h('div', { class: 'mini-list' }, order.length ? order.map((x, i) => h('div', { class: 'ml-row' }, h('span', {}, x), h('span', {}, h('button', { class: 'sm', onclick: () => mv(i, -1) }, '↑'), h('button', { class: 'sm', onclick: () => mv(i, 1) }, '↓')))) : h('p', { class: 'help' }, 'Indique un genre sur tes projets (bouton ci-dessous).')));
      }
      case 'pairs': return wrap(pairsEditor(obj, def, set));
      case 'items': return wrap(itemsEditor(obj, def, set, ctx));
      case 'buttons': return wrap(buttonsEditor(M.arr(get()), list => set(list), ctx));
      case 'button1': return wrap(buttonsEditor([get() || {}], list => set(list[0] || { texte: 'Bouton' }), ctx, true));
      case 'files': return wrap(filesEditor(obj, def, set, ctx));
      case 'gallery': return wrap(galleryEditor(obj, def, ctx));
      default: return null;
    }
  }
  const moveIn = (list, i, d) => { const j = i + d; if (j < 0 || j >= list.length) return false; [list[i], list[j]] = [list[j], list[i]]; return true; };
  function pairsEditor(obj, def, set) {
    const list = M.arr(M.get(obj, def.k)).slice();
    const box = h('div', { class: 'pairs' });
    const save = () => set(list.map(x => Object.assign({}, x)), true);
    const draw = () => box.replaceChildren(...list.map((it, i) => h('div', { class: 'pair' },
      h('input', { type: 'text', value: it[def.a[0]] || '', placeholder: def.a[1], oninput: e => { it[def.a[0]] = e.target.value; save(); } }),
      h(def.area ? 'textarea' : 'input', { type: 'text', rows: 2, value: it[def.b[0]] || '', placeholder: def.b[1], oninput: e => { it[def.b[0]] = e.target.value; save(); } }),
      h('div', { class: 'pair-tools' }, h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, -1)) { save(); draw(); } } }, '↑'), h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, 1)) { save(); draw(); } } }, '↓'), h('button', { class: 'sm danger', onclick: () => { list.splice(i, 1); save(); draw(); } }, '✕')))),
      h('button', { type: 'button', class: 'btn small ghost', onclick: () => { list.push({ [def.a[0]]: '', [def.b[0]]: '' }); save(); draw(); } }, '+ Ajouter une ligne'));
    draw();
    return box;
  }
  function itemsEditor(obj, def, set) {
    const list = M.arr(M.get(obj, def.k));
    const box = h('div', { class: 'pairs' });
    const draw = () => box.replaceChildren(...list.map((it, i) => h('div', { class: 'pair' },
      ...def.sub.map(([k, l]) => h('input', { type: 'text', value: it[k] || '', placeholder: l, oninput: e => { it[k] = e.target.value; set(list, true); } })),
      h('div', { class: 'pair-tools' }, h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, -1)) { set(list, true); draw(); } } }, '↑'), h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, 1)) { set(list, true); draw(); } } }, '↓'), h('button', { class: 'sm danger', onclick: () => { list.splice(i, 1); set(list, true); draw(); } }, '✕')))),
      h('button', { type: 'button', class: 'btn small ghost', onclick: () => { list.push(M.clone(def.blank)); set(list, true); draw(); } }, '+ Ajouter'));
    draw();
    return box;
  }
  function buttonsEditor(list, save, ctx, single) {
    const box = h('div', { class: 'btn-list' });
    const pages = ED.data.pages;
    const draw = () => box.replaceChildren(...list.map((b, i) => {
      const cible = (() => {
        if (b.type === 'page') { const s = h('select', { onchange: e => { b.cible = e.target.value; save(list); } }, pages.map(p => h('option', { value: p.id }, (p.type === 'projet' ? 'Projet : ' : '') + p.titre))); s.value = b.cible || ''; return s; }
        if (b.type === 'fichier') return h('div', { class: 'row' }, h('span', { class: 'help', style: 'flex:1;word-break:break-all' }, b.cible ? b.cible.split('/').pop() : 'Aucun fichier'), h('button', { class: 'btn small', onclick: async () => { const f = await ED.pickFiles('*/*'); if (!f.length) return; const p = await ED.upload(f[0], 'documents', { raw: true }); if (p) { b.cible = p; save(list); draw(); } } }, 'Envoyer un fichier'));
        return h('input', { type: 'text', value: b.cible || '', placeholder: { lien: 'https://…', email: 'ton@email.com', tel: '06 12 34 56 78' }[b.type || 'lien'], oninput: e => { b.cible = e.target.value; save(list); } });
      })();
      const typeSel = h('select', { onchange: e => { b.type = e.target.value; b.cible = ''; save(list); draw(); } }, [['lien', 'Lien vers un site'], ['page', 'Page de mon site'], ['email', 'Envoyer un e-mail'], ['tel', 'Appeler'], ['fichier', 'Télécharger un fichier']].map(([k, l]) => h('option', { value: k }, l)));
      typeSel.value = b.type || 'lien';
      const styleSel = h('select', { onchange: e => { b.style = e.target.value; save(list); } }, [['plein', 'Plein'], ['contour', 'Contour'], ['accent', 'Couleur d’accent'], ['texte', 'Texte souligné']].map(([k, l]) => h('option', { value: k }, l)));
      styleSel.value = b.style || 'plein';
      const sizeSel = h('select', { onchange: e => { b.taille = e.target.value; save(list); } }, [['', 'Taille normale'], ['petit', 'Petit'], ['grand', 'Grand']].map(([k, l]) => h('option', { value: k }, l)));
      sizeSel.value = b.taille || '';
      return h('div', { class: 'btn-card' },
        h('input', { type: 'text', value: b.texte || '', placeholder: 'Texte du bouton', oninput: e => { b.texte = e.target.value; save(list); } }),
        typeSel, cible, h('div', { class: 'row' }, styleSel, sizeSel),
        b.type === 'lien' || !b.type ? h('label', { class: 'f-check small' }, h('input', { type: 'checkbox', checked: !!b.onglet, onchange: e => { b.onglet = e.target.checked; save(list); } }), h('span', { class: 'sw' }), h('span', {}, 'Ouvrir dans un nouvel onglet')) : null,
        single ? null : h('div', { class: 'row end' }, h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, -1)) { save(list); draw(); } } }, '↑'), h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, 1)) { save(list); draw(); } } }, '↓'), h('button', { class: 'sm danger', onclick: () => { list.splice(i, 1); save(list); draw(); } }, '✕ Supprimer')));
    }), single ? null : h('button', { type: 'button', class: 'btn small ghost', onclick: () => { list.push({ texte: 'Me contacter', type: 'page', cible: (pages.find(p => p.id === 'contact') || pages[0]).id, style: 'plein' }); save(list); draw(); } }, '+ Ajouter un bouton'));
    draw();
    return box;
  }
  function filesEditor(obj, def, set) {
    const list = M.arr(M.get(obj, def.k));
    const box = h('div', { class: 'pairs' });
    const draw = () => box.replaceChildren(...list.map((f, i) => h('div', { class: 'pair' },
      h('input', { type: 'text', value: f.nom || '', placeholder: 'Nom affiché (ex. Mon CV)', oninput: e => { f.nom = e.target.value; set(list, true); } }),
      h('span', { class: 'help', style: 'word-break:break-all' }, (M.ext(f.src).toUpperCase() || '?') + ' · ' + String(f.src || '').split('/').pop()),
      h('div', { class: 'pair-tools' }, h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, -1)) { set(list, true); draw(); } } }, '↑'), h('button', { class: 'sm', onclick: () => { if (moveIn(list, i, 1)) { set(list, true); draw(); } } }, '↓'), h('button', { class: 'sm danger', onclick: () => { list.splice(i, 1); set(list, true); draw(); } }, '✕')))),
      h('button', { type: 'button', class: 'btn small', onclick: async () => {
        const fs = await ED.pickFiles('*/*', true);
        for (const f of fs) { const p = await ED.upload(f, 'documents', { raw: true }); if (p) { list.push({ nom: f.name.replace(/\.[^.]+$/, ''), src: p }); set(list, true); draw(); } }
      } }, '+ Envoyer des fichiers (PDF, images, tout type)'));
    draw();
    return box;
  }
  function galleryEditor(obj, def, ctx) {
    const list = M.arr(M.get(obj, def.k));
    const box = h('div', { class: 'gal-ed' });
    const draw = () => box.replaceChildren(...list.map((it, i) => {
      const src = typeof it === 'string' ? it : it.src;
      const img = h('img', { alt: '', loading: 'lazy' });
      img.src = ED.src(src); img.onerror = () => { img.onerror = null; img.src = ED.rawUrl(src); };
      return h('div', { class: 'ge-it' }, h('button', { class: 'ge-img', title: 'Réglages de cette image', onclick: () => select(ctx.sec.id, `${def.k}.${i}`, 'image') }, img, h('b', {}, i + 1)),
        h('div', { class: 'ge-tools' }, h('button', { class: 'sm', title: 'Avant', onclick: () => { if (moveIn(list, i, -1)) { changed(); draw(); } } }, '←'), h('button', { class: 'sm', title: 'Après', onclick: () => { if (moveIn(list, i, 1)) { changed(); draw(); } } }, '→'), h('button', { class: 'sm danger', title: 'Retirer', onclick: () => { list.splice(i, 1); changed(); draw(); } }, '✕')));
    }), h('button', { class: 'ge-add', onclick: () => addImages(ctx.sec.id) }, h('b', {}, '+'), 'Ajouter des images'),
    h('button', { class: 'ge-add', onclick: () => openLibrary(src => { list.push({ src }); M.set(obj, def.k, list); changed(); draw(); }) }, h('b', {}, '▦'), 'Bibliothèque'));
    if (!M.get(obj, def.k)) M.set(obj, def.k, list);
    draw();
    return box;
  }

  /* ==========================================================================
     Fenêtres : ajouter une section, pages, réglages du site, bibliothèque
     ========================================================================== */
  function modal(title, content, cls = '') {
    const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
    const esc = e => { if (e.key === 'Escape') close(); };
    const back = h('div', { class: 'modal-back', onclick: e => { if (e.target === back) close(); } },
      h('div', { class: 'modal ' + cls, role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'modal-head' }, h('strong', {}, title), h('button', { class: 'pn-x', onclick: close, title: 'Fermer' }, '×')),
        h('div', { class: 'modal-body' }, content)));
    document.body.append(back);
    document.addEventListener('keydown', esc);
    return { close, body: back.querySelector('.modal-body') };
  }
  const VIGN = {
    couverture: '<rect x="2" y="2" width="116" height="68" rx="5" fill="#2e3566"/><rect x="34" y="27" width="52" height="7" rx="2" fill="#fff"/><rect x="42" y="38" width="36" height="3" rx="1.5" fill="#b9c0ff"/><rect x="46" y="44" width="28" height="3" rx="1.5" fill="#b9c0ff"/>',
    entete: '<rect x="50" y="12" width="20" height="6" rx="3" fill="#fff"/><rect x="24" y="25" width="72" height="12" rx="2" fill="#e8e8f0"/><rect x="38" y="44" width="44" height="4" rx="2" fill="#777"/>',
    texte: '<rect x="14" y="12" width="56" height="7" rx="2" fill="#e8e8f0"/><rect x="14" y="26" width="92" height="3" rx="1.5" fill="#777"/><rect x="14" y="33" width="88" height="3" rx="1.5" fill="#777"/><rect x="14" y="40" width="92" height="3" rx="1.5" fill="#777"/><rect x="14" y="47" width="60" height="3" rx="1.5" fill="#777"/>',
    encadre: '<rect x="10" y="8" width="100" height="56" rx="3" fill="#232845" stroke="#444"/><rect x="10" y="8" width="3" height="56" fill="#8a9bff"/><rect x="22" y="18" width="20" height="3" fill="#8a9bff"/><rect x="22" y="26" width="56" height="6" rx="2" fill="#e8e8f0"/><rect x="22" y="38" width="76" height="3" fill="#777"/><rect x="22" y="45" width="66" height="3" fill="#777"/>',
    colonnes: '<rect x="8" y="10" width="48" height="52" rx="3" fill="#3b4270"/><rect x="64" y="18" width="40" height="6" rx="2" fill="#e8e8f0"/><rect x="64" y="30" width="46" height="3" fill="#777"/><rect x="64" y="37" width="42" height="3" fill="#777"/><rect x="64" y="44" width="46" height="3" fill="#777"/>',
    image: '<rect x="8" y="6" width="104" height="60" rx="3" fill="#3b4270"/><path d="M20 56l22-22 16 16 10-10 26 16z" fill="#5d6aa8"/>',
    galerie: '<rect x="6" y="6" width="54" height="60" rx="3" fill="#3b4270"/><rect x="64" y="6" width="50" height="28" rx="3" fill="#4a548c"/><rect x="64" y="38" width="23" height="28" rx="3" fill="#5d6aa8"/><rect x="91" y="38" width="23" height="28" rx="3" fill="#3b4270"/>',
    video: '<rect x="8" y="6" width="104" height="60" rx="3" fill="#2a2a2a"/><circle cx="60" cy="36" r="13" fill="none" stroke="#fff"/><path d="M56 30l10 6-10 6z" fill="#fff"/>',
    projets: '<rect x="8" y="6" width="50" height="28" rx="2" fill="#3b4270"/><rect x="62" y="6" width="50" height="28" rx="2" fill="#4a548c"/><rect x="8" y="38" width="30" height="3" fill="#e8e8f0"/><rect x="8" y="44" width="20" height="2" fill="#8a9bff"/><rect x="62" y="38" width="30" height="3" fill="#e8e8f0"/><rect x="62" y="44" width="20" height="2" fill="#8a9bff"/><rect x="34" y="54" width="14" height="6" rx="3" fill="#fff"/><rect x="52" y="54" width="14" height="6" rx="3" fill="none" stroke="#888"/><rect x="70" y="54" width="14" height="6" rx="3" fill="none" stroke="#888"/>',
    fiche: '<rect x="8" y="12" width="56" height="5" fill="#e8e8f0"/><rect x="8" y="24" width="56" height="3" fill="#777"/><rect x="8" y="31" width="52" height="3" fill="#777"/><rect x="8" y="38" width="56" height="3" fill="#777"/><g fill="#555"><rect x="74" y="12" width="38" height="1"/><rect x="74" y="22" width="38" height="1"/><rect x="74" y="32" width="38" height="1"/><rect x="74" y="42" width="38" height="1"/></g><g fill="#ccc"><rect x="74" y="16" width="12" height="2"/><rect x="74" y="26" width="16" height="2"/><rect x="74" y="36" width="10" height="2"/></g>',
    infos: '<g fill="#555"><rect x="10" y="14" width="100" height="1"/><rect x="10" y="30" width="100" height="1"/><rect x="10" y="46" width="100" height="1"/><rect x="10" y="62" width="100" height="1"/></g><g fill="#ddd"><rect x="10" y="20" width="22" height="3"/><rect x="10" y="36" width="18" height="3"/><rect x="10" y="52" width="26" height="3"/></g><g fill="#888"><rect x="88" y="20" width="22" height="3"/><rect x="92" y="36" width="18" height="3"/><rect x="84" y="52" width="26" height="3"/></g>',
    credits: '<g fill="#ddd"><rect x="10" y="12" width="30" height="3"/><rect x="10" y="30" width="24" height="3"/><rect x="10" y="48" width="34" height="3"/></g><g fill="#888"><rect x="10" y="19" width="96" height="2"/><rect x="10" y="37" width="80" height="2"/><rect x="10" y="55" width="90" height="2"/></g>',
    liste: '<g fill="#888"><rect x="10" y="14" width="18" height="3"/><rect x="10" y="34" width="18" height="3"/><rect x="10" y="54" width="18" height="3"/></g><g fill="#ddd"><rect x="38" y="13" width="40" height="4"/><rect x="38" y="33" width="34" height="4"/><rect x="38" y="53" width="44" height="4"/></g>',
    tags: '<g fill="none" stroke="#888"><rect x="10" y="26" width="30" height="12" rx="6"/><rect x="44" y="26" width="36" height="12" rx="6"/><rect x="84" y="26" width="26" height="12" rx="6"/><rect x="24" y="42" width="34" height="12" rx="6"/><rect x="62" y="42" width="30" height="12" rx="6"/></g>',
    contact: '<rect x="10" y="12" width="40" height="7" rx="2" fill="#e8e8f0"/><rect x="10" y="28" width="46" height="4" fill="#fff"/><rect x="10" y="36" width="30" height="3" fill="#777"/><g fill="#555"><rect x="66" y="18" width="46" height="1"/><rect x="66" y="30" width="46" height="1"/><rect x="66" y="48" width="46" height="1"/></g><rect x="66" y="54" width="22" height="8" fill="none" stroke="#ccc"/>',
    reseaux: '<g fill="none" stroke="#bbb"><rect x="10" y="28" width="30" height="14" rx="7"/><rect x="45" y="28" width="30" height="14" rx="7"/><rect x="80" y="28" width="30" height="14" rx="7"/></g>',
    boutons: '<rect x="20" y="28" width="38" height="14" fill="#fff"/><rect x="62" y="28" width="38" height="14" fill="none" stroke="#fff"/>',
    fichiers: '<g fill="none" stroke="#555"><rect x="10" y="12" width="100" height="16"/><rect x="10" y="34" width="100" height="16"/></g><rect x="14" y="16" width="14" height="8" rx="2" fill="#8a9bff"/><rect x="14" y="38" width="14" height="8" rx="2" fill="#8a9bff"/><rect x="34" y="19" width="40" height="3" fill="#ddd"/><rect x="34" y="41" width="30" height="3" fill="#ddd"/>',
    spotify: '<rect x="8" y="16" width="104" height="40" rx="8" fill="#1d1d1d"/><rect x="14" y="22" width="28" height="28" rx="3" fill="#3b4270"/><rect x="48" y="26" width="40" height="4" fill="#fff"/><rect x="48" y="34" width="26" height="3" fill="#999"/><circle cx="100" cy="42" r="6" fill="#1ed760"/>',
    espace: '<rect x="10" y="35" width="100" height="1.5" fill="#888"/><path d="M60 14v14M60 44v14" stroke="#555" stroke-dasharray="2 2"/>',
    libre: '<rect x="10" y="10" width="56" height="42" rx="3" fill="#3b4270"/><rect x="50" y="30" width="56" height="30" rx="3" fill="#232845" stroke="#8a9bff"/><rect x="58" y="38" width="30" height="5" fill="#fff"/><rect x="58" y="47" width="40" height="3" fill="#aaa"/>'
  };
  function openAdd(index) {
    const m = modal('Ajouter une section', h('div', { class: 'add-grid' }, M.GROUPES.map(g => h('div', { class: 'add-group' },
      h('h4', {}, g),
      h('div', { class: 'add-cards' }, Object.entries(M.TYPES).filter(([, t]) => t.groupe === g).map(([k, t]) =>
        h('button', { class: 'add-card', onclick: () => { m.close(); insertSection(k, index); } },
          h('span', { class: 'add-vign', html: `<svg viewBox="0 0 120 72">${VIGN[k] || ''}</svg>` }), h('strong', {}, t.nom), h('small', {}, t.desc))))))), 'wide');
  }
  function insertSection(type, index) {
    const s = M.section(type);
    const p = page();
    p.sections.splice(Math.max(0, Math.min(index, p.sections.length)), 0, s);
    changed();
    renderFrame();
    select(s.id);
    const el = fdoc && fdoc.getElementById(s.id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    ED.toast(`Section « ${M.TYPES[type].nom} » ajoutée. Clique sur ses textes pour les modifier.`);
  }

  function uniquePageId(base, except) {
    base = M.slugify(base) || 'page';
    let id = base, n = 2;
    while (ED.data.pages.some(p => p !== except && p.id === id)) id = `${base}-${n++}`;
    return id;
  }
  function openPages(focus) {
    const content = h('div', { class: 'pages-ed' });
    const m = modal('Pages et projets', content, 'wide');
    const reload = () => { fillPageSelect(); changed(); };
    const draw = () => {
      const pages = ED.data.pages.filter(p => p.type !== 'projet'), projs = ED.data.pages.filter(p => p.type === 'projet');
      const mv = (p, d, list) => {
        const i = list.indexOf(p), j = i + d; if (j < 0 || j >= list.length) return;
        const all = ED.data.pages, a = all.indexOf(list[i]), b = all.indexOf(list[j]);
        [all[a], all[b]] = [all[b], all[a]]; reload(); draw();
      };
      const del = p => {
        if (p.accueil) { ED.toast('C’est ta page d’accueil : choisis d’abord une autre page d’accueil.', 'err'); return; }
        if (!confirm(`Supprimer « ${p.titre} » et tout son contenu ?\n(Tu pourras annuler avec ↶)`)) return;
        ED.data.pages.splice(ED.data.pages.indexOf(p), 1);
        if (st.pageId === p.id) loadPage(page().id);
        reload(); draw();
      };
      const dup = p => { const c = M.clone(p); c.id = uniquePageId(p.id + '-copie'); c.titre += ' (copie)'; c.accueil = false; c.sections.forEach(s => { s.id = M.uid('s'); }); ED.data.pages.splice(ED.data.pages.indexOf(p) + 1, 0, c); reload(); draw(); };
      const settings = p => h('details', { class: 'pg-more' }, h('summary', {}, 'Réglages de la page'),
        h('div', { class: 'pg-grid' },
          h('label', {}, h('span', {}, 'Adresse (dans le lien)'), h('input', { type: 'text', value: p.id, onchange: e => {
            const old = p.id, nid = uniquePageId(e.target.value, p);
            ED.data.pages.forEach(x => x.sections.forEach(s => [M.arr(s.c.boutons), M.arr(s.c.items).map(it => it.bouton).filter(Boolean)].flat().forEach(b => { if (b.type === 'page' && b.cible === old) b.cible = nid; })));
            p.id = nid; e.target.value = nid; if (st.pageId === old) st.pageId = nid; reload();
          } }), h('small', {}, p.accueil ? 'index.html' : M.pageUrl(p))),
          h('label', {}, h('span', {}, 'Titre pour Google (optionnel)'), h('input', { type: 'text', value: p.seoTitre || '', oninput: e => { p.seoTitre = e.target.value; changed({ render: false }); } })),
          h('label', {}, h('span', {}, 'Description pour Google (optionnel)'), h('textarea', { rows: 2, value: p.seoDescription || '', oninput: e => { p.seoDescription = e.target.value; changed({ render: false }); } })),
          sw('Masquer le menu sur cette page', p.masquerMenu, v => { p.masquerMenu = v; reload(); }),
          sw('Masquer le pied de page sur cette page', p.masquerPied, v => { p.masquerPied = v; reload(); }),
          p.type === 'projet' ? sw('Afficher « Projet suivant » en bas', p.navigation !== false, v => { p.navigation = v; reload(); }) : null));
      const pageRow = p => h('div', { class: 'pg-row' + (p.id === st.pageId ? ' current' : '') },
        h('div', { class: 'pg-main' },
          h('div', { class: 'pg-arrows' }, h('button', { class: 'sm', onclick: () => mv(p, -1, pages) }, '↑'), h('button', { class: 'sm', onclick: () => mv(p, 1, pages) }, '↓')),
          h('input', { type: 'text', class: 'pg-name', value: p.titre, title: 'Nom de la page (dans le menu)', oninput: e => { p.titre = e.target.value; fillPageSelect(); changed(); } }),
          sw('Menu', p.menu, v => { p.menu = v; reload(); }, 'small'),
          sw('Publiée', !p.masquer, v => { p.masquer = !v; reload(); }, 'small'),
          h('label', { class: 'radio small', title: 'Page d’accueil' }, h('input', { type: 'radio', name: 'accueil', checked: !!p.accueil, onchange: () => { ED.data.pages.forEach(x => { x.accueil = x === p; }); reload(); draw(); } }), ' Accueil'),
          h('button', { class: 'btn small', onclick: () => { m.close(); loadPage(p.id); } }, 'Modifier'),
          h('button', { class: 'sm', title: 'Dupliquer', onclick: () => dup(p) }, '⧉'),
          h('button', { class: 'sm danger', title: 'Supprimer', onclick: () => del(p) }, '🗑')),
        settings(p));
      const genres = M.genres(ED.data);
      const projRow = p => {
        const k = p.carte;
        const thumb = h('img', { alt: '' });
        if (k.vignette) { thumb.src = ED.src(k.vignette); thumb.onerror = () => { thumb.onerror = null; thumb.src = ED.rawUrl(k.vignette); }; }
        const setThumb = src => { k.vignette = src; changed(); draw(); };
        return h('div', { class: 'pg-row proj' + (p.id === st.pageId ? ' current' : '') },
          h('div', { class: 'pj-grid' },
            h('button', { class: 'pj-thumb', title: 'Changer la vignette', onclick: async () => { if (!ED.gh) return openLibrary(setThumb); const f = await ED.pickFiles('image/*'); if (!f.length) return; const s = await ED.upload(f[0], 'films/' + p.id, { max: 1400 }); if (s) setThumb(s); } }, k.vignette ? thumb : h('span', {}, '+ Vignette')),
            h('div', { class: 'pj-fields' },
              h('div', { class: 'row' }, h('div', { class: 'pg-arrows' }, h('button', { class: 'sm', onclick: () => mv(p, -1, projs) }, '↑'), h('button', { class: 'sm', onclick: () => mv(p, 1, projs) }, '↓')),
                h('input', { type: 'text', class: 'pg-name', value: p.titre, placeholder: 'Titre du projet', oninput: e => { p.titre = e.target.value; fillPageSelect(); changed(); } })),
              h('div', { class: 'pj-two' },
                h('label', {}, h('span', {}, 'Genre (sert aux filtres)'), h('input', { type: 'text', list: 'genres-list', value: k.genre || '', placeholder: 'Court-métrage, Clip…', onchange: e => { k.genre = e.target.value.trim(); changed(); draw(); } })),
                h('label', {}, h('span', {}, 'Mes rôles (séparés par des virgules)'), h('input', { type: 'text', value: M.arr(k.roles).join(', '), placeholder: 'Producteur, Réalisateur…', oninput: e => { k.roles = e.target.value.split(',').map(x => x.trim()).filter(Boolean); changed(); } }))),
              h('div', { class: 'row' },
                (() => { const s = h('select', { title: 'Animation au survol', onchange: e => { k.animation = e.target.value; changed(); } }, h('option', { value: '' }, 'Animation : comme la grille'), M.PROJ_ANIMS.map(([a, l]) => h('option', { value: a }, l))); s.value = k.animation || ''; return s; })(),
                sw('Publié', !p.masquer, v => { p.masquer = !v; reload(); }, 'small'),
                h('button', { class: 'btn small', onclick: () => { m.close(); loadPage(p.id); } }, 'Modifier la page'),
                h('button', { class: 'sm', title: 'Dupliquer', onclick: () => dup(p) }, '⧉'),
                h('button', { class: 'sm danger', title: 'Supprimer', onclick: () => del(p) }, '🗑')))),
          settings(p));
      };
      const tplSel = h('select', {}, Object.entries(M.MODELES_PAGE).filter(([k]) => k !== 'projet').map(([k, t]) => h('option', { value: k }, t.nom)));
      content.replaceChildren(
        h('datalist', { id: 'genres-list' }, genres.map(g => h('option', { value: g }))),
        h('section', { class: 'pg-sec' + (focus === 'projets' ? ' later' : '') },
          h('h3', {}, 'Pages du menu'), h('p', { class: 'help' }, 'Renomme, réordonne, retire du menu, publie ou non, choisis la page d’accueil.'),
          ...pages.map(pageRow),
          h('div', { class: 'row add-row' }, tplSel, h('button', { class: 'btn primary small', onclick: () => {
            const nom = prompt('Nom de la nouvelle page :', 'Nouvelle page'); if (!nom) return;
            const p = { id: uniquePageId(nom), titre: nom, menu: true, sections: M.MODELES_PAGE[tplSel.value].sections() };
            if (p.sections[0] && p.sections[0].type === 'entete') p.sections[0].c.titre = nom;
            if (p.sections[0] && p.sections[0].type === 'contact') p.sections[0].c.titre = nom;
            ED.data.pages.splice(ED.data.pages.filter(x => x.type !== 'projet').length, 0, p);
            reload(); m.close(); loadPage(p.id); ED.toast(`Page « ${nom} » créée.`, 'ok');
          } }, '+ Nouvelle page'))),
        h('section', { class: 'pg-sec', id: 'pg-projets' },
          h('h3', {}, 'Projets'), h('p', { class: 'help' }, 'Chaque projet a sa page. Le genre crée automatiquement les filtres de la page d’accueil.'),
          ...projs.map(projRow),
          h('div', { class: 'row add-row' }, h('button', { class: 'btn primary small', onclick: () => {
            const nom = prompt('Titre du nouveau projet :', 'NOUVEAU PROJET'); if (!nom) return;
            const p = { id: uniquePageId(nom), titre: nom, type: 'projet', menu: false, navigation: true, carte: { vignette: '', genre: '', roles: [], animation: '' }, sections: M.MODELES_PAGE.projet.sections() };
            p.sections[0].c.titre = nom;
            ED.data.pages.push(p); reload(); m.close(); loadPage(p.id); ED.toast(`Projet « ${nom} » créé. Ajoute son genre et tes rôles dans « Pages ».`, 'ok', 6000);
          } }, '+ Nouveau projet'))));
      if (focus === 'projets') setTimeout(() => { const el = content.querySelector('#pg-projets'); if (el) el.scrollIntoView(); }, 30);
    };
    draw();
  }
  function sw(label, val, onChange, cls = '') {
    return h('label', { class: 'f-check ' + cls }, h('input', { type: 'checkbox', checked: !!val, onchange: e => onChange(e.target.checked) }), h('span', { class: 'sw' }), h('span', {}, label));
  }

  function openSite(tab = 'general') {
    const s = ED.data.site;
    const ctx = { page: page(), rerender: () => draw() };
    const TABS = [['general', 'Général'], ['design', 'Couleurs & polices'], ['menu', 'Menu'], ['pied', 'Pied de page'], ['reseaux', 'Réseaux sociaux']];
    const body = h('div', {});
    const m = modal('Réglages du site', h('div', { class: 'site-ed' }, h('div', { class: 'pn-tabs' }), body), 'mid');
    const tabsEl = m.body.querySelector('.pn-tabs');
    const DEF = {
      general: [{ k: 'nom', l: 'Ton nom (logo en haut, pied de page)', t: 'text' }, { k: 'titreOnglet', l: 'Titre dans l’onglet du navigateur', t: 'text' }, { k: 'descriptionGoogle', l: 'Description pour Google', t: 'text' }],
      design: [{ k: 'theme.fond', l: 'Couleur de fond', t: 'color' }, { k: 'theme.texte', l: 'Couleur du texte', t: 'color' }, { k: 'theme.texteDoux', l: 'Couleur du texte secondaire', t: 'color' }, { k: 'theme.accent', l: 'Couleur d’accent', t: 'color' },
        { k: 'theme.police', l: 'Police du texte', t: 'font' }, { k: 'theme.policeTitres', l: 'Police des titres', t: 'font' }, { k: 'theme.grain', l: 'Effet grain de pellicule', t: 'check' }],
      menu: [{ k: 'entete.disposition', l: 'Disposition', t: 'seg', options: [['centre', 'Centré'], ['gauche', 'Nom à gauche, menu à droite']] }, { k: 'entete.majuscules', l: 'Liens du menu en majuscules', t: 'check' }, { k: 'entete.masquerAuDefilement', l: 'Cacher le menu quand on descend', t: 'check' },
        { t: 'action', l: 'Ajouter, renommer ou retirer des pages du menu', act: 'pages' }],
      pied: [{ k: 'pied.afficher', l: 'Afficher le pied de page', t: 'check' }, { k: 'pied.texte', l: 'Texte après « © année + ton nom »', t: 'text', help: 'Exemple affiché : © 2026 Yoann SIMONNEAU · Tous droits réservés' }, { k: 'pied.reseaux', l: 'Afficher mes réseaux sociaux', t: 'check' }],
      reseaux: [{ k: 'reseaux', l: 'Réseaux sociaux (affichés dans Contact et en bas de page)', t: 'pairs', a: ['nom', 'Nom (Instagram…)'], b: ['url', 'Lien https://…'] }]
    };
    function draw() {
      tabsEl.replaceChildren(...TABS.map(([k, l]) => h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; draw(); } }, l)));
      body.replaceChildren(...DEF[tab].map(d => d.act === 'pages' ? h('button', { class: 'btn ghost wide', onclick: () => { m.close(); openPages(); } }, d.l) : field(s, d, ctx)).filter(Boolean));
    }
    draw();
  }

  function collectImages() {
    const set = new Set(ED.uploaded);
    const walk = o => {
      if (!o || typeof o !== 'object') return;
      Object.entries(o).forEach(([k, v]) => {
        if (typeof v === 'string' && /^images\/.+\.(jpe?g|png|webp|gif|svg|avif)$/i.test(v)) set.add(v);
        else if (typeof v === 'object') walk(v);
      });
    };
    walk(ED.data);
    return [...set];
  }
  function openLibrary(onPick) {
    const grid = h('div', { class: 'lib' });
    const m = modal('Bibliothèque d’images', h('div', {},
      h('div', { class: 'row', style: 'margin-bottom:14px' }, h('button', { class: 'btn primary small', onclick: async () => {
        if (!ED.requireConnection()) return;
        const f = await ED.pickFiles('image/*', true);
        for (const x of f) { const p = await ED.upload(x, folderOf(page()), { max: 2200 }); if (p) draw(); }
      } }, '+ Envoyer depuis mon appareil'), h('span', { class: 'help' }, 'Clique sur une image pour la choisir.')), grid), 'wide');
    const draw = () => grid.replaceChildren(...collectImages().map(p => {
      const img = h('img', { alt: '', loading: 'lazy' });
      img.src = ED.src(p); img.onerror = () => { img.onerror = null; img.src = ED.rawUrl(p); };
      return h('button', { class: 'lib-it', title: p, onclick: () => { m.close(); onPick(p); } }, img);
    }));
    draw();
  }

  function menu() {
    const close = () => back.remove();
    const item = (l, fn, cls = '') => h('button', { class: cls, onclick: () => { close(); fn(); } }, l);
    const imp = h('input', { type: 'file', accept: '.js,.json', hidden: true, onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      try { setData(ED.parseContenu(await f.text())); changed(); loadPage(page().id); ED.toast('Sauvegarde importée. Publie pour la mettre en ligne.', 'ok'); } catch (err) { ED.toast(err.message, 'err'); }
    } });
    const back = h('div', { class: 'menu-back', onclick: e => { if (e.target === back) close(); } }, h('div', { class: 'menu' },
      h('p', { class: 'menu-info' }, ED.gh ? `Connecté à ${ED.gh.owner}/${ED.gh.repo}` : 'Mode hors ligne'),
      item('⚙ Réglages du site', () => openSite()),
      item('Voir le site en ligne ↗', () => window.open(M.pageUrl(page()), '_blank')),
      item('Raccourcis et aide', help),
      item('Télécharger une sauvegarde', ED.download),
      item('Importer une sauvegarde…', () => imp.click()),
      ED.gh ? item('Annuler toutes les modifications non publiées', () => { if (confirm('Revenir à la version publiée ? Les modifications non publiées seront perdues.')) { ED.ls.del(ED.KEYS.DRAFT); location.reload(); } }, 'danger') : null,
      ED.gh ? item('Se déconnecter', () => { const c = JSON.parse(ED.ls.get(ED.KEYS.CFG) || '{}'); delete c.token; ED.ls.set(ED.KEYS.CFG, JSON.stringify(c)); location.reload(); })
        : item('Se connecter à GitHub', () => ED.showConnect(c => startEditor(c))),
      imp));
    document.body.append(back);
  }
  function help() {
    modal('Comment modifier ton site', h('div', { class: 'help-txt', html: `
      <ol>
        <li><b>Survole</b> une partie du site : un cadre et une barre d’outils apparaissent.</li>
        <li><b>Clique dans un texte</b> pour l’écrire directement. Sélectionne des mots pour les mettre en gras, en italique, en lien, en couleur ou en liste.</li>
        <li><b>Clique sur une image</b> pour ses réglages (cadrage, zoom, filtre, bordure, texte par-dessus, animation). Double-clic : la remplacer.</li>
        <li><b>✎ Modifier</b> ouvre le contenu de la section, <b>Style</b> le fond, les marges, la bordure, la position.</li>
        <li><b>+ Ajouter une section</b> (en haut ou en bas d’une section) : texte, images, vidéo, projets, crédits, contact, Spotify, téléchargements…</li>
        <li><b>⠿</b> : attrape-le et glisse pour déplacer une section ou une image. <b>⇲</b> : tire pour agrandir une image du puzzle.</li>
        <li><b>🖥 / 📱</b> : vois le rendu sur ordinateur ou téléphone.</li>
        <li><b>Aperçu</b> ouvre ton site avec les modifications. <b>Publier</b> les met en ligne (1 à 2 minutes).</li>
      </ol>
      <p><b>Raccourcis :</b> Ctrl/Cmd + Z annuler · Ctrl/Cmd + Maj + Z rétablir · Ctrl/Cmd + S publier · Échap fermer le panneau.</p>
      <p>Tout est sauvegardé automatiquement sur cet appareil tant que tu n’as pas publié.</p>` }), 'mid');
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
    $$('.dev button').forEach(b => b.classList.toggle('on', b.dataset.d === d));
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
    ED.dirty = false;
    hist = []; hpos = -1; pushHistory();
    let draft = null;
    try { draft = JSON.parse(ED.ls.get(ED.KEYS.DRAFT) || 'null'); } catch (e) { /* rien */ }
    const app = $('#app');
    app.replaceChildren(
      h('header', { class: 'top' },
        h('div', { class: 'top-l' },
          h('div', { class: 'brand' }, h('strong', {}, 'Éditeur'), h('span', { id: 'status', class: 'status' })),
          h('select', { id: 'pageSel', title: 'Page à modifier', onchange: e => loadPage(e.target.value) }),
          h('button', { class: 'btn ghost', onclick: () => openPages() }, '☰ Pages')),
        h('div', { class: 'top-m' },
          h('div', { class: 'dev seg' }, h('button', { 'data-d': 'desktop', class: 'on', title: 'Ordinateur', onclick: () => setDevice('desktop') }, '🖥', h('span', {}, ' Ordinateur')), h('button', { 'data-d': 'mobile', title: 'Téléphone', onclick: () => setDevice('mobile') }, '📱', h('span', {}, ' Mobile'))),
          h('button', { id: 'btn-undo', class: 'btn ghost icon', title: 'Annuler (Ctrl+Z)', onclick: undo }, '↶'),
          h('button', { id: 'btn-redo', class: 'btn ghost icon', title: 'Rétablir (Ctrl+Maj+Z)', onclick: redo }, '↷')),
        h('div', { class: 'top-r' },
          h('button', { class: 'btn ghost', onclick: () => openSite() }, '⚙ Réglages du site'),
          h('a', { id: 'btn-live', class: 'btn ghost', href: 'index.html', target: '_blank', rel: 'noopener', title: 'Ouvrir ton site en ligne (version publiée)' }, 'Voir le site ↗'),
          h('button', { class: 'btn ghost', onclick: preview, title: 'Voir le site avec tes modifications non publiées' }, 'Aperçu'),
          h('button', { id: 'btn-publish', class: 'btn primary', onclick: () => { flushEdit(); ED.publish(); } }, 'Publier'),
          h('button', { class: 'btn ghost icon', title: 'Plus', onclick: menu }, '⋯'))),
      h('div', { id: 'notice' }),
      h('div', { class: 'main' },
        h('div', { class: 'stage' }, h('div', { id: 'frameWrap', class: 'frame-wrap desktop' }, h('iframe', { id: 'frame', title: 'Ton site en mode édition' }))),
        h('aside', { id: 'panel', class: 'panel', hidden: true })));
    if (!ED.gh) $('#notice').append(h('div', { class: 'notice' }, h('b', {}, 'Mode hors ligne. '), 'Tu peux tout modifier et prévisualiser. Pour envoyer des images et publier, connecte-toi (menu ⋯).'));
    if (draft && draft.data && JSON.stringify(M.normalize(draft.data)) !== JSON.stringify(ED.data)) {
      const when = new Date(draft.savedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
      const n = h('div', { class: 'notice warn' }, h('span', {}, `Tu as des modifications non publiées enregistrées sur cet appareil (${when}).`),
        h('button', { class: 'btn small primary', onclick: () => { setData(draft.data); pushHistory(); n.remove(); ED.dirty = true; updateState(); fillPageSelect(); loadPage(page().id); } }, 'Les reprendre'),
        h('button', { class: 'btn small ghost', onclick: () => { ED.ls.del(ED.KEYS.DRAFT); n.remove(); } }, 'Les ignorer'));
      $('#notice').append(n);
    }
    document.addEventListener('keydown', keys);
    st.pageId = page().id;
    fillPageSelect();
    loadPage(st.pageId);
    updateState();
    if (!ED.ls.get('portfolio-ed-aide')) { ED.ls.set('portfolio-ed-aide', '1'); setTimeout(help, 600); }
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
