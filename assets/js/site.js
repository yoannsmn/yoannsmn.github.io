/* ==========================================================================
   Portfolio — moteur d'affichage
   Tu n'as normalement PAS besoin de modifier ce fichier :
   tout le contenu se trouve dans data/contenu.js (modifiable via admin.html).
   ========================================================================== */
(() => {
  'use strict';

  const PAGE = document.body.dataset.page || 'films';
  const params = new URLSearchParams(location.search);
  const DRAFT_KEY = 'portfolio-apercu-data';
  const PREVIEW_FLAG = 'portfolio-apercu';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Petits utilitaires ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arr = v => Array.isArray(v) ? v : (v ? [v] : []);
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* stockage indisponible */ } },
    del: k => { try { localStorage.removeItem(k); } catch (e) { /* idem */ } }
  };
  const imgSrc = p => typeof p === 'string' ? p : (p && p.src) || '';

  // Mise en forme légère : paragraphes, **gras**, *italique*, [lien](https://…)
  function inline(s) {
    return s
      .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^\s)]+|[\w\-./#?=&;%]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
  }
  function rich(text) {
    const t = String(text ?? '').trim();
    if (!t) return '';
    return t.split(/\n\s*\n/).map(p => `<p>${inline(esc(p)).replace(/\n/g, '<br>')}</p>`).join('');
  }

  /* ---------- Vidéos (YouTube, Vimeo, fichier mp4) ---------- */
  function videoInfo(url) {
    if (!url) return null;
    url = String(url).trim();
    let m = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return { type: 'youtube', id: m[1] };
    m = url.match(/vimeo\.com\/(?:.*\/)?(\d{6,})/);
    if (m) return { type: 'vimeo', id: m[1] };
    if (/\.(mp4|webm|mov)(\?|#|$)/i.test(url)) return { type: 'file', src: url };
    return null;
  }
  function videoUrl(v, background) {
    if (v.type === 'youtube') {
      return `https://www.youtube-nocookie.com/embed/${v.id}?` + (background
        ? `autoplay=1&mute=1&loop=1&playlist=${v.id}&controls=0&disablekb=1&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3`
        : 'rel=0&modestbranding=1&playsinline=1&autoplay=1');
    }
    return `https://player.vimeo.com/video/${v.id}?` + (background ? 'background=1&autoplay=1&loop=1&muted=1&dnt=1' : 'title=0&byline=0&portrait=0&dnt=1&autoplay=1');
  }
  // Vidéo d'arrière-plan (accueil)
  function videoBackground(v) {
    if (v.type === 'file') return `<video class="bg-video" src="${esc(v.src)}" autoplay muted loop playsinline></video>`;
    return `<iframe class="bg-video" src="${videoUrl(v, true)}" allow="autoplay; fullscreen; picture-in-picture" tabindex="-1" aria-hidden="true" title="Vidéo d'arrière-plan"></iframe>`;
  }
  // Lecteur de projet : on n'affiche qu'une image + bouton lecture.
  // Le lecteur YouTube/Vimeo (lourd) ne se charge qu'au clic → page beaucoup plus rapide.
  function videoPlayer(v, poster, title) {
    if (v.type === 'file') return `<video src="${esc(v.src)}" controls playsinline preload="none"${poster ? ` poster="${esc(poster)}"` : ''}></video>`;
    const img = v.type === 'youtube' ? `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg` : poster;
    return `<button class="vfacade" type="button" data-embed="${esc(videoUrl(v, false))}" aria-label="Lire la vidéo ${esc(title)}">
      ${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async"${v.type === 'youtube' ? ` data-yt="${v.id}"` : ''}>` : ''}
      <span class="vplay" aria-hidden="true"></span>
    </button>`;
  }
  function bindVideos() {
    // Miniature YouTube : repli sur une taille plus petite si la HD n'existe pas
    $$('img[data-yt]').forEach(img => {
      const hq = `https://i.ytimg.com/vi/${img.dataset.yt}/hqdefault.jpg`;
      const chk = () => { if (img.naturalWidth && img.naturalWidth <= 120 && img.src !== hq) img.src = hq; };
      img.complete ? chk() : img.addEventListener('load', chk);
      img.addEventListener('error', () => { if (img.src !== hq) img.src = hq; }, { once: true });
    });
    $$('.vfacade').forEach(b => b.addEventListener('click', () => {
      const f = document.createElement('iframe');
      f.src = b.dataset.embed;
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      f.allowFullscreen = true;
      f.title = 'Lecteur vidéo';
      b.replaceWith(f);
    }, { once: true }));
  }
  // La vidéo d'accueil se charge APRÈS la page, et pas sur téléphone (l'image suffit) → affichage immédiat.
  function heroVideo(a) {
    const v = videoInfo(a.video);
    if (!v) return;
    const small = window.matchMedia('(max-width: 760px)').matches;
    const saveData = navigator.connection && navigator.connection.saveData;
    if (a.image && (small || saveData || reduceMotion)) return;
    const start = () => {
      const media = $('.hero-media');
      if (!media) return;
      media.insertAdjacentHTML('beforeend', videoBackground(v));
      const el = media.lastElementChild;
      el.addEventListener(v.type === 'file' ? 'playing' : 'load', () => setTimeout(() => el.classList.add('on'), v.type === 'file' ? 0 : 1400), { once: true });
    };
    if (document.readyState === 'complete') setTimeout(start, 200);
    else addEventListener('load', () => setTimeout(start, 200), { once: true });
  }

  /* ---------- Chargement du contenu ---------- */
  function loadContent() {
    if (params.has('apercu')) ls.set(PREVIEW_FLAG, '1');
    if (ls.get(PREVIEW_FLAG) === '1') {
      const draft = ls.get(DRAFT_KEY);
      if (draft) { try { return Promise.resolve({ data: JSON.parse(draft), preview: true }); } catch (e) { /* brouillon illisible */ } }
    }
    if (window.CONTENU) return Promise.resolve({ data: window.CONTENU });
    return new Promise((resolve, reject) => {
      // Le fichier de contenu est déjà en cours de téléchargement (lancé dans le <head>, en parallèle de ce script).
      let s = document.getElementById('contenu');
      if (!s) {
        s = document.createElement('script');
        // Anti-cache : une modification publiée est visible en moins d'une minute.
        s.src = 'data/contenu.js' + (location.protocol.startsWith('http') ? '?v=' + Math.floor(Date.now() / 60000) : '');
        document.head.appendChild(s);
      }
      s.addEventListener('load', () => window.CONTENU ? resolve({ data: window.CONTENU }) : reject(new Error('Contenu vide')));
      s.addEventListener('error', () => reject(new Error('data/contenu.js introuvable')));
      setTimeout(() => window.CONTENU ? resolve({ data: window.CONTENU }) : reject(new Error('Le contenu met trop de temps à charger. Actualise la page.')), 15000);
    });
  }

  /* ---------- Gabarit commun : en-tête, pied de page ---------- */
  function header(d) {
    const m = d.site.menu || {};
    const items = [
      ['films', 'index.html', m.films || 'Films'],
      ['photos', 'photos.html', m.photos || 'Photos'],
      ['apropos', 'a-propos.html', m.apropos || 'À propos'],
      ['contact', 'contact.html', m.contact || 'Contact']
    ];
    const active = k => PAGE === k || (PAGE === 'projet' && k === 'films');
    return `<header class="hdr" id="hdr">
      <a class="hdr-name" href="index.html">${esc(d.site.nom)}</a>
      <nav class="hdr-nav" aria-label="Menu principal">
        ${items.map(([k, h, l]) => `<a href="${h}"${active(k) ? ' class="is-active" aria-current="page"' : ''}>${esc(l)}</a>`).join('')}
      </nav>
    </header>`;
  }
  function footer(d) {
    const c = d.contact || {};
    const soc = arr(c.reseaux).filter(r => r.url && r.nom);
    return `<footer class="ftr">
      <div class="ftr-name">${esc(d.site.nom)}</div>
      ${soc.length ? `<ul class="ftr-soc">${soc.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.nom)}</a></li>`).join('')}</ul>` : ''}
      <div class="ftr-copy">© ${new Date().getFullYear()} ${esc(d.site.nom)}${d.site.piedDePage ? ' · ' + esc(d.site.piedDePage) : ''}</div>
    </footer>`;
  }

  /* ---------- Page FILMS (accueil) ---------- */
  const visibleFilms = d => arr(d.films).filter(f => f && !f.masquer);
  const filmRoles = f => [f.categorie, ...arr(f.roles)].filter(Boolean);

  function card(f, i, s) {
    const anim = f.animation || s.animationSurvol || 'zoom';
    const img = imgSrc(f.vignette);
    const bg = img ? ` style="background-image:url('${esc(img)}')"` : '';
    return `<a class="card anim-${esc(anim)} reveal" style="--d:${(i % 3) * 90}ms" href="projet.html?id=${encodeURIComponent(f.id)}">
      <div class="thumb">
        ${img ? `<img src="${esc(img)}" alt="${esc(f.titre)}" loading="${i < 2 ? 'eager' : 'lazy'}" decoding="async">` : '<div class="thumb-empty">Vignette à ajouter</div>'}
        ${anim === 'glitch' ? `<span class="fx fx-g fx-g1"${bg}></span><span class="fx fx-g fx-g2"${bg}></span>` : ''}
        <span class="fx fx-sweep"></span>
        <span class="thumb-cta">Voir le projet</span>
      </div>
      <h3 class="card-title"><span>${esc(f.titre)}</span></h3>
      <p class="card-roles">${filmRoles(f).map(esc).join(' - ')}</p>
    </a>`;
  }

  function pageFilms(d) {
    const s = d.site, a = s.accueil || {};
    const title = a.titre || s.nom || '';
    const letters = [...title].map((c, i) => `<span style="--l:${i}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`).join('');
    const films = visibleFilms(d);
    document.title = s.titreOnglet || s.nom;
    return `
      <section class="hero" style="--hero-h:${Math.min(100, Math.max(30, parseInt(a.hauteur, 10) || 75))}">
        <div class="hero-media">
          ${a.image ? `<img src="${esc(a.image)}" alt="" fetchpriority="high" decoding="async">` : ''}
        </div>
        <div class="hero-text">
          <h1 class="hero-title" aria-label="${esc(title)}">${letters}</h1>
          ${a.preambule ? `<p class="hero-pre">${esc(a.preambule)}</p>` : ''}
        </div>
        <a href="#films" class="hero-scroll" aria-label="Descendre vers les films"><span></span></a>
      </section>
      <section class="wrap films" id="films">
        ${s.titreFilms ? `<h2 class="section-title reveal">${esc(s.titreFilms)}</h2>` : ''}
        <div class="grid" style="--cols:${parseInt(s.colonnes, 10) || 2};--ratio:${esc(s.formatVignettes || '16/9')}">
          ${films.map((f, i) => card(f, i, s)).join('') || '<p class="empty">Aucun projet pour le moment.</p>'}
        </div>
      </section>`;
  }

  /* ---------- Page PROJET ---------- */
  function credits(list) {
    return arr(list).filter(c => c && (c.fonction || c.noms)).map(c => {
      const names = String(c.noms || '').split(/\s+-\s+|\n/).map(n => n.trim()).filter(Boolean);
      const long = String(c.noms || '').length > 38 || names.length > 2;
      return `<div class="cr${long ? ' cr-long' : ''}"><dt>${esc(c.fonction)}</dt><dd>${names.map(n => `<span>${esc(n)}</span>`).join('<i> - </i>')}</dd></div>`;
    }).join('');
  }

  function pageProjet(d) {
    const all = arr(d.films);
    const films = visibleFilms(d);
    const id = params.get('id');
    const f = all.find(x => x.id === id);
    if (!f) return pageNotFound(d, 'Ce projet est introuvable.');
    const idx = films.indexOf(f);
    const next = films.length > 1 ? films[(idx + 1) % films.length] : null;
    const v = videoInfo(f.video);
    const big = arr(f.photosGrandFormat).map(imgSrc).filter(Boolean);
    const collage = arr(f.photosCollage).map(imgSrc).filter(Boolean);
    const topImage = !v && big.length ? big.shift() : null;
    const roles = arr(f.roles).filter(Boolean);
    const details = arr(f.details).filter(x => x && x.label && x.valeur);
    const cr = credits(f.credits);
    const textes = arr(f.textes).filter(t => t && (t.titre || t.sousTitre || t.texte));
    const work = f.monTravail || {};
    document.title = `${f.titre} — ${d.site.nom}`;

    return `
    <article class="projet">
      <div class="wrap">
        <a class="back reveal" href="index.html#films"><span aria-hidden="true">←</span> Retour à l'accueil</a>
        <header class="p-head reveal">
          ${f.categorie ? `<span class="pill">${esc(f.categorie)}</span>` : ''}
          <h1 class="p-title">${esc(f.titre)}</h1>
          ${f.sousTitre ? `<p class="p-sub">${esc(f.sousTitre)}</p>` : ''}
        </header>
      </div>

      ${v ? `<div class="wrap wide"><div class="p-video reveal">${videoPlayer(v, imgSrc(f.vignette), f.titre)}</div></div>` : ''}
      ${topImage ? `<div class="wrap wide"><figure class="p-big reveal"><img src="${esc(topImage)}" alt="${esc(f.titre)}" data-lb></figure></div>` : ''}

      ${(textes.length || details.length || cr) ? `
      <section class="wrap p-body">
        <div class="p-texts">
          ${textes.map(t => `<div class="p-text reveal">
            ${t.titre ? `<h2>${esc(t.titre)}</h2>` : ''}
            ${t.sousTitre ? `<h3>${esc(t.sousTitre)}</h3>` : ''}
            <div class="rich">${rich(t.texte)}</div>
          </div>`).join('')}
        </div>
        ${(details.length || cr) ? `<aside class="p-side reveal">
          ${details.length ? `<dl class="p-details">${details.map(x => `<div><dt>${esc(x.label)}</dt><dd>${esc(x.valeur)}</dd></div>`).join('')}</dl>` : ''}
          ${cr ? `<dl class="p-credits">${cr}</dl>` : ''}
        </aside>` : ''}
      </section>` : ''}

      ${(work.texte || roles.length) && (work.texte || '').trim() ? `
      <section class="wrap">
        <div class="p-work reveal">
          <span class="eyebrow">Mon rôle</span>
          <h2>${esc(work.titre || 'Mon travail sur le projet')}</h2>
          ${roles.length ? `<ul class="chips">${roles.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
          <div class="rich">${rich(work.texte)}</div>
        </div>
      </section>` : ''}

      ${big.length ? `<div class="wrap wide p-bigs">${big.map(src => `<figure class="p-big reveal"><img src="${esc(src)}" alt="" loading="lazy" decoding="async" data-lb></figure>`).join('')}</div>` : ''}

      ${collage.length ? `<section class="wrap"><div class="collage" style="--c:${Math.min(3, collage.length)}">${collage.map((src, i) => `<figure class="reveal" style="--d:${(i % 3) * 80}ms"><img src="${esc(src)}" alt="" loading="lazy" decoding="async" data-lb></figure>`).join('')}</div></section>` : ''}

      <nav class="wrap p-nav" aria-label="Navigation entre projets">
        <a class="p-nav-back" href="index.html#films"><span aria-hidden="true">←</span> Retour à l'accueil</a>
        ${next && next !== f ? `<a class="p-nav-next" href="projet.html?id=${encodeURIComponent(next.id)}">
          ${imgSrc(next.vignette) ? `<img src="${esc(imgSrc(next.vignette))}" alt="" loading="lazy">` : ''}
          <span class="p-nav-label">Projet suivant</span>
          <strong>${esc(next.titre)} <span aria-hidden="true">→</span></strong>
        </a>` : ''}
      </nav>
    </article>`;
  }

  /* ---------- Page PHOTOS ---------- */
  function pagePhotos(d) {
    const p = d.photos || {};
    const series = arr(p.series).filter(s => s && arr(s.photos).length);
    document.title = `${p.titre || 'Photos'} — ${d.site.nom}`;
    const items = series.flatMap((s, si) => arr(s.photos).map(ph => ({ ...(typeof ph === 'string' ? { src: ph } : ph), si })));
    return `
      <section class="wrap page-head">
        <h1 class="page-title reveal">${esc(p.titre || 'Photos')}</h1>
        ${p.intro ? `<div class="rich page-intro reveal">${rich(p.intro)}</div>` : ''}
      </section>
      ${series.length > 1 ? `<div class="wrap"><div class="tabs reveal" role="tablist">
        <button role="tab" class="is-active" data-s="all" aria-selected="true">Tout</button>
        ${series.map((s, i) => `<button role="tab" data-s="${i}" aria-selected="false">${esc(s.titre)}</button>`).join('')}
      </div></div>` : ''}
      <div class="wrap"><p class="serie-desc" id="serie-desc"></p></div>
      <section class="wrap">
        <div class="masonry" id="gal">
          ${items.map((it, i) => `<figure class="reveal" data-si="${it.si}" style="--d:${(i % 3) * 70}ms">
            <img src="${esc(it.src)}" alt="${esc(it.legende || '')}" loading="lazy" decoding="async" data-lb data-caption="${esc(it.legende || '')}">
            ${it.legende ? `<figcaption>${esc(it.legende)}</figcaption>` : ''}
          </figure>`).join('') || '<p class="empty">Aucune photo pour le moment.</p>'}
        </div>
      </section>`;
  }
  function bindPhotos(d) {
    const series = arr((d.photos || {}).series).filter(s => s && arr(s.photos).length);
    const desc = $('#serie-desc');
    $$('.tabs button').forEach(b => b.addEventListener('click', () => {
      $$('.tabs button').forEach(x => { x.classList.toggle('is-active', x === b); x.setAttribute('aria-selected', x === b); });
      const s = b.dataset.s;
      if (desc) desc.textContent = s === 'all' ? '' : (series[s].description || '');
      $$('#gal figure').forEach(fig => {
        const show = s === 'all' || fig.dataset.si === s;
        fig.hidden = !show;
        if (show) { fig.classList.remove('in'); requestAnimationFrame(() => requestAnimationFrame(() => fig.classList.add('in'))); }
      });
    }));
  }

  /* ---------- Page À PROPOS ---------- */
  function pageAPropos(d) {
    const a = d.apropos || {};
    document.title = `${a.titre || 'À propos'} — ${d.site.nom}`;
    const skills = String(a.competences || '').split(/,|\n/).map(x => x.trim()).filter(Boolean);
    const parcours = arr(a.parcours).filter(p => p && (p.intitule || p.texte));
    return `
      <section class="wrap about">
        <div class="about-grid">
          ${a.portrait ? `<figure class="about-portrait reveal"><img src="${esc(a.portrait)}" alt="${esc(d.site.nom)}"></figure>` : ''}
          <div class="about-text reveal">
            <h1 class="page-title left">${esc(a.titre || 'À propos')}</h1>
            ${a.sousTitre ? `<p class="about-sub">${esc(a.sousTitre)}</p>` : ''}
            <div class="rich">${rich(a.texte)}</div>
            ${skills.length ? `<ul class="chips">${skills.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
            ${a.cv ? `<a class="btn" href="${esc(a.cv)}" target="_blank" rel="noopener">Télécharger mon CV</a>` : ''}
          </div>
        </div>
        ${parcours.length ? `<div class="timeline">
          <h2 class="section-title small reveal">Parcours</h2>
          ${parcours.map(p => `<div class="tl reveal"><div class="tl-when">${esc(p.periode)}</div><div><h3>${esc(p.intitule)}</h3><div class="rich">${rich(p.texte)}</div></div></div>`).join('')}
        </div>` : ''}
      </section>`;
  }

  /* ---------- Page CONTACT ---------- */
  function pageContact(d) {
    const c = d.contact || {};
    document.title = `${c.titre || 'Contact'} — ${d.site.nom}`;
    const soc = arr(c.reseaux).filter(r => r && r.url && r.nom);
    return `
      <section class="wrap contact">
        <h1 class="page-title reveal">${esc(c.titre || 'Contact')}</h1>
        <div class="contact-grid${c.formulaire ? '' : ' single'}">
          <div class="contact-info reveal">
            <div class="rich">${rich(c.texte)}</div>
            ${c.email ? `<a class="big-link" href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}
            ${c.telephone ? `<a class="contact-line" href="tel:${esc(String(c.telephone).replace(/[^\d+]/g, ''))}">${esc(c.telephone)}</a>` : ''}
            ${c.lieu ? `<p class="contact-line muted">${esc(c.lieu)}</p>` : ''}
            ${soc.length ? `<ul class="socials">${soc.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.nom)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul>` : ''}
          </div>
          ${c.formulaire ? `<form class="form reveal" id="contact-form" novalidate>
            <label><span>Nom</span><input name="nom" autocomplete="name" required></label>
            <label><span>E-mail</span><input name="email" type="email" autocomplete="email" required></label>
            <label><span>Sujet</span><input name="sujet"></label>
            <label><span>Message</span><textarea name="message" rows="6" required></textarea></label>
            <button class="btn" type="submit">Envoyer</button>
            <p class="form-msg" id="form-msg" role="status"></p>
          </form>` : ''}
        </div>
      </section>`;
  }
  function bindContact(d) {
    const form = $('#contact-form');
    if (!form) return;
    const c = d.contact || {};
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const msg = $('#form-msg');
      const data = Object.fromEntries(new FormData(form));
      if (!data.nom || !data.email || !data.message) { msg.textContent = 'Merci de remplir ton nom, ton e-mail et ton message.'; return; }
      if (c.formspree) {
        msg.textContent = 'Envoi…';
        try {
          const r = await fetch(c.formspree, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(data) });
          if (!r.ok) throw new Error();
          form.reset(); msg.textContent = 'Merci ! Ton message a bien été envoyé.';
        } catch (err) { msg.textContent = "L'envoi a échoué. Tu peux écrire directement à " + (c.email || "l'adresse indiquée") + '.'; }
      } else {
        const body = `${data.message}\n\n— ${data.nom} (${data.email})`;
        location.href = `mailto:${c.email || ''}?subject=${encodeURIComponent(data.sujet || 'Contact depuis le portfolio')}&body=${encodeURIComponent(body)}`;
        msg.textContent = 'Ta messagerie va s’ouvrir avec le message pré-rempli.';
      }
    });
  }

  /* ---------- 404 ---------- */
  function pageNotFound(d, text) {
    document.title = `Page introuvable — ${d.site.nom}`;
    return `<section class="wrap notfound"><h1 class="page-title">Oups</h1><p>${esc(text || "Cette page n'existe pas.")}</p><a class="btn" href="index.html">Retour à l'accueil</a></section>`;
  }

  /* ---------- Visionneuse (lightbox) ---------- */
  function lightbox() {
    const imgs = () => $$('img[data-lb]').filter(i => !i.closest('[hidden]'));
    let list = [], cur = 0, box;
    function build() {
      box = document.createElement('div');
      box.className = 'lb';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.innerHTML = `<button class="lb-close" aria-label="Fermer">×</button>
        <button class="lb-prev" aria-label="Précédente">‹</button>
        <figure><img alt=""><figcaption></figcaption></figure>
        <button class="lb-next" aria-label="Suivante">›</button>
        <div class="lb-count"></div>`;
      document.body.appendChild(box);
      box.addEventListener('click', e => { if (e.target === box || e.target.tagName === 'FIGURE') close(); });
      $('.lb-close', box).onclick = close;
      $('.lb-prev', box).onclick = () => show(cur - 1);
      $('.lb-next', box).onclick = () => show(cur + 1);
      let x0 = null;
      box.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
      box.addEventListener('touchend', e => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 50) show(cur + (dx < 0 ? 1 : -1));
        x0 = null;
      });
    }
    function show(i) {
      cur = (i + list.length) % list.length;
      const el = list[cur];
      const im = $('figure img', box);
      im.classList.remove('on');
      im.onload = () => im.classList.add('on');
      im.src = el.currentSrc || el.src;
      im.alt = el.alt;
      $('figcaption', box).textContent = el.dataset.caption || '';
      $('.lb-count', box).textContent = list.length > 1 ? `${cur + 1} / ${list.length}` : '';
      box.classList.toggle('single', list.length < 2);
    }
    function open(el) {
      if (!box) build();
      list = imgs(); show(list.indexOf(el));
      box.classList.add('open');
      document.documentElement.style.overflow = 'hidden';
    }
    function close() { box.classList.remove('open'); document.documentElement.style.overflow = ''; }
    document.addEventListener('click', e => {
      const el = e.target.closest('img[data-lb]');
      if (el) open(el);
    });
    document.addEventListener('keydown', e => {
      if (!box || !box.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') show(cur + 1);
      if (e.key === 'ArrowLeft') show(cur - 1);
    });
  }

  /* ---------- Animations ---------- */
  function revealOnScroll() {
    const els = $$('.reveal');
    if (reduceMotion || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
    const io = new IntersectionObserver(entries => entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(e => io.observe(e));
  }
  // Sur téléphone (pas de survol) : l'animation se joue quand la vignette passe au centre de l'écran.
  function touchHover() {
    if (!window.matchMedia('(hover: none)').matches || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => entries.forEach(en => en.target.classList.toggle('is-hover', en.isIntersecting)),
      { rootMargin: '-40% 0px -40% 0px' });
    $$('.card').forEach(c => io.observe(c));
  }
  function stickyHeader() {
    const h = $('#hdr');
    if (!h) return;
    let last = 0;
    addEventListener('scroll', () => {
      const y = scrollY;
      h.classList.toggle('scrolled', y > 10);
      h.classList.toggle('hide', y > last && y > 300);
      last = y;
    }, { passive: true });
  }
  function pageTransitions() {
    document.addEventListener('click', e => {
      const a = e.target.closest('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || /^(mailto|tel):/.test(a.href)) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      e.preventDefault();
      document.body.classList.add('leaving');
      setTimeout(() => { location.href = url.href; }, reduceMotion ? 0 : 280);
    });
    addEventListener('pageshow', e => { if (e.persisted) document.body.classList.remove('leaving'); });
  }

  function previewBanner() {
    const b = document.createElement('div');
    b.className = 'preview-bar';
    b.innerHTML = `<span>Aperçu de tes modifications <strong>non publiées</strong></span><button type="button">Quitter l'aperçu</button>`;
    $('button', b).onclick = () => { ls.del(PREVIEW_FLAG); location.href = location.pathname + location.search.replace(/[?&]apercu[^&]*/, '').replace(/^&/, '?'); };
    document.body.appendChild(b);
  }

  /* ---------- Démarrage ---------- */
  function applyTheme(s) {
    const r = document.documentElement.style;
    if (s.couleurAccent) r.setProperty('--accent', s.couleurAccent);
    document.body.classList.toggle('grain-on', s.grain !== false);
    const meta = $('meta[name="description"]');
    if (meta && s.descriptionGoogle) meta.setAttribute('content', s.descriptionGoogle);
  }

  const app = $('#app');
  loadContent().then(({ data, preview }) => {
    data.site = data.site || {};
    applyTheme(data.site);
    const pages = { films: pageFilms, projet: pageProjet, photos: pagePhotos, apropos: pageAPropos, contact: pageContact };
    const body = (pages[PAGE] || (dd => pageNotFound(dd)))(data);
    app.innerHTML = header(data) + `<main id="main">${body}</main>` + footer(data);
    if (PAGE === 'films') heroVideo(data.site.accueil || {});
    if (PAGE === 'projet') bindVideos();
    if (PAGE === 'photos') bindPhotos(data);
    if (PAGE === 'contact') bindContact(data);
    if (preview) previewBanner();
    revealOnScroll(); touchHover(); stickyHeader(); lightbox(); pageTransitions();
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) setTimeout(() => t.scrollIntoView(), 50); }
    requestAnimationFrame(() => document.body.classList.add('ready'));
  }).catch(err => {
    app.innerHTML = `<div class="wrap notfound"><h1 class="page-title">Contenu introuvable</h1><p>${esc(err.message)}</p></div>`;
    document.body.classList.add('ready');
  });
})();
