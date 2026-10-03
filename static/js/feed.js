// static/js/feed.js
// -------------------
// Calls our own Flask API (/api/browse) and renders the feed + tile
// panel, with accessibility as a first-class concern:
//
// - Each slide's image alt text comes straight from build_alt_text()
//   on the server (title + cataloged description + date), not a
//   generic label — see app.py.
// - The feed container is keyboard-navigable: PageDown/PageUp/Arrow
//   Down/Arrow Up move between slides even without a mouse or touch.
// - A visually-hidden aria-live region announces "now viewing" text
//   for the slide currently in view, mirroring what a sighted user
//   sees when a new slide scrolls into place.
// - The collection panel is a proper focus-trapped dialog on mobile:
//   opening it moves focus in, Escape and the scrim close it, and
//   focus returns to the toggle button that opened it.
(function () {
  const feed = document.getElementById('feed');
  const announcer = document.getElementById('slideAnnouncer');
  const tilesContainer = document.getElementById('collectionTiles');
  const panel = document.getElementById('collectionPanel');
  const panelToggle = document.getElementById('panelToggle');
  const panelClose = document.getElementById('panelClose');
  const panelScrim = document.getElementById('panelScrim');
  const backToTop = document.getElementById('backToTop'); 

  let state = { activeSet: feed.dataset.defaultSet, resumptionToken: null, done: false, loading: false, items: [] };
  let lastAnnouncedIdx = -1;

  const ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  const ICON_SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';
  const ICON_EXTERNAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>';
  const ICON_ZOOM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // ---- Collection tiles -------------------------------------------------
  function renderTiles() {
    tilesContainer.querySelectorAll('.tile').forEach(function (btn) {
      const isActive = btn.dataset.set === state.activeSet;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.onclick = function () {
        if (btn.dataset.set === state.activeSet) { closePanel(); return; }
        state.activeSet = btn.dataset.set;
        renderTiles();
        loadCollection(state.activeSet);
        closePanel();
      };
    });
  }

  // ---- Panel: focus-trapped dialog on mobile, always-visible on desktop -
  function getFocusableInPanel() {
    return Array.from(panel.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])'));
  }

  function openPanel() {
    panel.classList.add('open');
    panel.removeAttribute('aria-hidden');
    panelScrim.hidden = false;
    requestAnimationFrame(function () { panelScrim.classList.add('visible'); });
    panelToggle.setAttribute('aria-expanded', 'true');
    const focusables = getFocusableInPanel();
    if (focusables.length) focusables[0].focus();
    document.addEventListener('keydown', onPanelKeydown);
  }

  function closePanel() {
    if (window.matchMedia('(min-width: 900px)').matches) return; // panel always visible on desktop
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    panelScrim.classList.remove('visible');
    panelScrim.hidden = true;
    panelToggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onPanelKeydown);
    panelToggle.focus();
  }
backToTop.addEventListener('click', function () {
  // Scroll the feed container back to the first slide.
  feed.scrollTo({ top: 0, behavior: 'smooth' });
  // Optionally re-announce the first slide for screen reader users.
  announceSlide(0);
});

feed.addEventListener('scroll', function () {
  backToTop.classList.toggle('visible', feed.scrollTop > feed.clientHeight / 2);
}, { passive: true });
  function onPanelKeydown(e) {
    if (e.key === 'Escape') { closePanel(); return; }
    if (e.key !== 'Tab') return;
    const focusables = getFocusableInPanel();
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  panelToggle.addEventListener('click', function () {
    panel.classList.contains('open') ? closePanel() : openPanel();
  });
  panelClose.addEventListener('click', closePanel);
  panelScrim.addEventListener('click', closePanel);

  // On desktop the panel is permanently visible and not a modal, so it
  // should never carry aria-hidden or trap focus.
  function syncPanelForViewport() {
    if (window.matchMedia('(min-width: 900px)').matches) {
      panel.removeAttribute('aria-hidden');
      panelScrim.classList.remove('visible');
      panelScrim.hidden = true;
    } else if (!panel.classList.contains('open')) {
      panel.setAttribute('aria-hidden', 'true');
    }
  }
  syncPanelForViewport();
  window.addEventListener('resize', syncPanelForViewport);

  // ---- Empty / error states --------------------------------------------
  function renderEmpty(setName) {
    feed.innerHTML = '<div class="empty-state" role="status">' + ICON_INFO +
      '<h1 style="font-family:var(--font-display);font-weight:800;font-size:1.4rem;">No images found in ' +
      escapeHtml(setName) + '</h1>' +
      '<p>Try a different collection from the panel.</p></div>';
  }

  function renderError(msg) {
    feed.innerHTML = '<div class="empty-state" role="alert">' + ICON_INFO +
      '<h1 style="font-family:var(--font-display);font-weight:800;font-size:1.4rem;">Something went wrong</h1>' +
      '<p>' + escapeHtml(msg || "Couldn't reach the archive service. Please try again.") + '</p></div>';
  }

  function skeletonSlides(n) {
    return Array.from({ length: n }).map(function () {
      return '<div class="slide skeleton-slide" aria-hidden="true"><div class="skeleton-box"></div></div>';
    }).join('');
  }

  // ---- Slide markup -------------------------------------------------
  function slideHTML(item, idx, total) {
    const isFirst = idx === 0;
    const loadingAttr = isFirst ? 'eager' : 'lazy';
    const priorityAttr = isFirst ? 'fetchpriority="high"' : 'fetchpriority="low"';
    // alt_text is built server-side from the item's real cataloged
    // title + description + date (see build_alt_text() in app.py) —
    // this is what a screen reader announces for the image itself.
    const altText = escapeHtml(item.alt_text || item.title);

    const viewerUrl = escapeHtml(item.viewer_url || '');
    const thumbUrl = escapeHtml(item.thumb_url || '');
    const blurUrl = escapeHtml(item.blur_url || '');
    const fullUrl = escapeHtml(item.full_url || '');
    const titleHtml = viewerUrl
      ? '<a class="title-link" href="' + viewerUrl +
        '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(item.title) + '</a>'
      : escapeHtml(item.title);

    return '<article class="slide" data-idx="' + idx + '" role="group" aria-roledescription="slide" aria-label="Image ' + (idx + 1) + ' of ' + total + '">' +
      '<img class="slide-media-bg" src="' + blurUrl + '" alt="" role="presentation" loading="' + loadingAttr + '">' +
      '<img class="slide-media" src="' + thumbUrl + '" alt="' + altText + '" loading="' + loadingAttr + '" decoding="async" ' + priorityAttr + ' ' +
      'onerror="this.style.display=\'none\'; this.nextElementSibling.nextElementSibling.style.display=\'flex\';">' +
      '<div class="slide-overlay" aria-hidden="true"></div>' +
      '<div class="img-fallback" style="display:none;" role="img" aria-label="' + altText + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>' +
      '<div class="slide-counter" aria-hidden="true">' + (idx + 1) + ' / ' + total + '</div>' +
      '<div class="rail" aria-hidden="true">' + Array.from({ length: Math.min(total, 20) }).map(function (_, i) {
        return '<div class="rail-dot ' + (i === idx % 20 ? 'active' : '') + '"></div>';
      }).join('') + '</div>' +
      '<div class="slide-info">' +
      '<div class="slide-meta">' +
      (item.date ? '<span class="chip">' + escapeHtml(item.date) + '</span>' : '') +
      '</div>' +
      '<h2 class="slide-title">' + titleHtml + '</h2>' +
      (item.description ? '<p class="slide-abstract">' + escapeHtml(item.description) + '</p>' : '') +
      '</div>' +
      '<div class="slide-actions">' +
      '<a class="action-btn" href="' + fullUrl + '" target="_blank" rel="noopener noreferrer" aria-label="View full-resolution image: ' + altText + '">' + ICON_ZOOM + '</a>' +
      '<button type="button" class="action-btn" data-action="share" data-url="' + viewerUrl + '" aria-label="Copy link to this item">' + ICON_SHARE + '</button>' +
      '<a class="action-btn" href="' + viewerUrl + '" target="_blank" rel="noopener noreferrer" aria-label="Open full catalog record for: ' + altText + '">' + ICON_EXTERNAL + '</a>' +
      '</div>' +
      '</article>';
  }

  // ---- Data loading -------------------------------------------------
  async function callBrowseApi(setSpec, resumptionToken) {
    const params = new URLSearchParams();
    if (setSpec) params.set('set', setSpec);
    if (resumptionToken) params.set('resumptionToken', resumptionToken);
    const res = await fetch('/api/browse?' + params.toString());
    const data = await res.json().catch(function () { return null; });
    if (!res.ok) throw new Error((data && data.error) || 'Request failed (' + res.status + ')');
    return data;
  }

  async function loadCollection(setSpec) {
    state = { activeSet: setSpec, resumptionToken: null, done: false, loading: true, items: [] };
    lastAnnouncedIdx = -1;
    feed.innerHTML = skeletonSlides(3);
    announcer.textContent = 'Loading ' + collectionNameFor(setSpec) + '\u2026';
    try {
      const data = await callBrowseApi(setSpec, null);
      state.items = data.items;
      state.resumptionToken = data.resumptionToken;
      state.done = data.done;
      state.loading = false;
      if (state.items.length === 0) { renderEmpty(setSpec); return; }
      renderFeed();
    } catch (e) {
      state.loading = false;
      renderError(e.message);
    }
  }

  function collectionNameFor(spec) {
    const tile = tilesContainer.querySelector('[data-set="' + spec + '"] .tile-name');
    return tile ? tile.textContent : spec;
  }

  function renderFeed() {
    feed.innerHTML = state.items.map(function (item, i) { return slideHTML(item, i, state.items.length); }).join('');
    attachObserver();
    attachSlideAnnouncer();
    attachShareHandlers();
    feed.scrollTo(0, 0);
    announceSlide(0);
  }

  function attachShareHandlers() {
    feed.querySelectorAll('[data-action="share"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const url = btn.dataset.url;
        if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
        btn.innerHTML = ICON_CHECK;
        btn.setAttribute('aria-label', 'Link copied to clipboard');
        setTimeout(function () {
          btn.innerHTML = ICON_SHARE;
          btn.setAttribute('aria-label', 'Copy link to this item');
        }, 1400);
      });
    });
  }

  // ---- Live-region announcements as slides come into view ---------------
  function announceSlide(idx) {
    if (idx === lastAnnouncedIdx) return;
    lastAnnouncedIdx = idx;
    const item = state.items[idx];
    if (!item) return;
    announcer.textContent = 'Now viewing image ' + (idx + 1) + ' of ' + state.items.length + ': ' + (item.title || 'Untitled');
  }

  let announceObserver = null;
  function attachSlideAnnouncer() {
    if (announceObserver) announceObserver.disconnect();
    announceObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
          announceSlide(Number(entry.target.dataset.idx));
        }
      });
    }, { root: feed, threshold: [0.6] });
    feed.querySelectorAll('.slide[data-idx]').forEach(function (el) { announceObserver.observe(el); });
  }

  // ---- Keyboard navigation of the feed -----------------------------------
  feed.addEventListener('keydown', function (e) {
    const slides = Array.from(feed.querySelectorAll('.slide[data-idx]'));
    if (!slides.length) return;
    const currentIdx = Math.max(0, Math.min(lastAnnouncedIdx, slides.length - 1));
    let targetIdx = null;

    if (e.key === 'ArrowDown' || e.key === 'PageDown') targetIdx = currentIdx + 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') targetIdx = currentIdx - 1;
    else if (e.key === 'Home') targetIdx = 0;
    else if (e.key === 'End') targetIdx = slides.length - 1;
    else return;

    e.preventDefault();
    targetIdx = Math.max(0, Math.min(targetIdx, slides.length - 1));
    slides[targetIdx].scrollIntoView({ block: 'start', behavior: 'smooth' });
  });

  // ---- Infinite scroll -----------------------------------------------
  let sentinelObserver = null;
  function attachObserver() {
    if (sentinelObserver) sentinelObserver.disconnect();
    const slides = feed.querySelectorAll('.slide');
    const last = slides[slides.length - 3] || slides[slides.length - 1];
    if (!last) return;
    sentinelObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !state.loading && !state.done) loadMore();
      });
    }, { root: feed, threshold: 0.5 });
    sentinelObserver.observe(last);
  }

  async function loadMore() {
    state.loading = true;
    const loader = document.createElement('div');
    loader.className = 'loader-more';
    loader.setAttribute('role', 'status');
    loader.innerHTML = '<div class="spinner" aria-label="Loading more images"></div>';
    feed.appendChild(loader);
    try {
      const data = await callBrowseApi(state.activeSet, state.resumptionToken);
      const startIdx = state.items.length;
      state.items = state.items.concat(data.items);
      state.resumptionToken = data.resumptionToken;
      state.done = data.done;
      loader.remove();
      if (data.items.length) {
        const html = data.items.map(function (item, i) { return slideHTML(item, startIdx + i, state.items.length); }).join('');
        feed.insertAdjacentHTML('beforeend', html);
        attachObserver();
        attachSlideAnnouncer();
        attachShareHandlers();
      }
    } catch (e) {
      loader.remove();
    }
    state.loading = false;
  }

  renderTiles();
  loadCollection(state.activeSet);
})();