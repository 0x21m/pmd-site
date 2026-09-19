(() => {
  const root = document.documentElement;
  if (!root.classList.contains('motion')) return;
  if (!(window.gsap && window.ScrollTrigger && window.ScrollSmoother && window.SplitText)) {
    root.classList.remove('motion');
    return;
  }
  window.__motionReady = true;
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);
  // A phone browser's bar sliding away changes the height mid-scroll; the sections keep the height they were built
  // with (--screen-h) and must not be rebuilt under the visitor's finger.
  ScrollTrigger.config({ ignoreMobileResize: true });

  // GSAP's own ticker caps at 240fps and times frames with Date.now() (1ms steps), so it drops frames
  // on 240Hz+ screens. Push its schedule out of reach and tick it once per real display frame instead.
  // The frame interval is kept from the display's own timestamps, for the 3D quality guard.
  gsap.ticker.fps(0.001);
  const frame = { last: performance.now(), ms: 16.7 };
  const everyFrame = now => {
    frame.ms = now - frame.last;
    frame.last = now;
    gsap.ticker.tick();
    requestAnimationFrame(everyFrame);
  };
  requestAnimationFrame(everyFrame);

  // One hue per integration category (a station of the 3D glass), all in the brand's blue–teal–violet family.
  const HUES = ['#2646c8', '#6d4ae6', '#1f9d8b', '#b8457d', '#2f8fd8', '#4b55d6', '#17a3a0', '#9448c9', '#2a8fc0'];
  // styles.css's layout queries: a frame (one screen per section, stacked) and the narrow composition.
  const FIT = '(orientation: landscape) and (min-width: 900px) and (min-height: 540px), (orientation: portrait) and (min-height: 540px)';
  const NARROW = '(orientation: portrait), (max-width: 899px), (max-height: 539px)';
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  // Split after the webfont so line breaks are final; never wait more than 1.2s for it.
  Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1200))]).then(() => {
    const mm = gsap.matchMedia();
    // Rebuilt whenever the pointer, the frame or the composition changes (a phone turning on its side, say).
    mm.add({ full: '(hover: hover) and (pointer: fine)', fit: FIT, narrow: NARROW, any: 'all' }, ({ conditions }) => setup(conditions.full, conditions.fit));
    mm.add('(hover: hover) and (pointer: fine) and (orientation: landscape) and (min-width: 900px) and (min-height: 540px)', cardParallax);
  });

  function setup(full, fit) {
    const off = [];
    const on = (el, type, fn, opts) => {
      el.addEventListener(type, fn, opts);
      off.push(() => el.removeEventListener(type, fn, opts));
    };

    const smoother = full
      // Focus scrolling is handled by anchors(), which knows about the stacked sections.
      ? ScrollSmoother.create({ wrapper: '#smooth-wrapper', content: '#smooth-content', smooth: 1.2, smoothTouch: false, onFocusIn: () => false })
      : null;

    // Shared with the 3D world: how far each section has receded under the sheet rising over it (by id).
    // Stacking needs a frame: on the flowing fallback (a phone on its side) sections just scroll.
    const stage = { recede: {} };
    const restoreIndustries = industriesScene(on, stage);
    const restoreHeader = headerBehaviour(on, stage, fit);
    heroIntro(full, on);
    if (fit) stackScene(stage);
    const restoreWorld = worldScene(full, on, stage, fit);
    reveals(on);
    wordmarkScene();
    anchors(smoother, on);
    navSpy();
    // A pinned section keeps the height it had at the last refresh (ScrollTrigger writes it inline): refresh when
    // an FAQ answer opens or closes, and when the webfont arrives after the 1.2 s this setup waited for it.
    let soon;
    on($('.faq-list'), 'toggle', () => { clearTimeout(soon); soon = setTimeout(() => ScrollTrigger.refresh(), 600); }, true);
    if (document.fonts.status !== 'loaded') document.fonts.ready.then(() => ScrollTrigger.refresh());
    if (full) {
      cardTilt(on);
      magnetic(on);
    }

    return () => {
      off.forEach(fn => fn());
      smoother?.kill();
      restoreHeader();
      restoreIndustries();
      restoreWorld();
    };
  }

  // The section scrolls normally; a click moves the scene in place. Text, glow colour and glow position
  // live on one paused timeline (one unit per sector), and a click tweens its playhead to the chosen sector,
  // passing through every sector in between so each colour change is seen.
  // A glyph of our own for each category: the real brands would need their own files and permission to use.
  const GLYPHS = [
    'M3 8h18M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 14h4',
    'M21 12a8 8 0 0 1-8 8H4l2.5-3A8 8 0 1 1 21 12z',
    'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5',
    'M4 7h16M4 12h16M4 17h16M8 4v16',
    'M4 8h16l-1.5 11H5.5zM9 8V6a3 3 0 0 1 6 0v2',
    'M3 8h11v9H3zM14 11h4l3 3v3h-7zM7 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM18 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
    'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4',
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 8h4M19 6v4',
    'M5 19V11M10 19V5M15 19v-6M20 19V9',
  ];

  // The categories orbiting the glass, on three rings cut in half by the section's base (a test behind ?orbita).
  // Each category keeps its place in the list and in the tab order; only its look and position change. Its arm turns
  // around the centre on that bottom edge, where the glass rises, and its chip turns the other way, so the icon and
  // the name stay upright. Half of every orbit is below the edge, where the section's own overflow hides it: the
  // categories sail out of the screen and back in. The name shows on the active one, on hover and on focus.
  function orbitScene(section, items, buttons, hues) {
    const list = $('.industry-list', section);
    // ring: share of the outer radius, seconds per turn, direction. The gaps are wider than a chip, so passes do not
    // overlap; the rings turn at different speeds and sides, so the nine never line up for long.
    const rings = [[.56, 26, 1], [.78, 34, -1], [1, 42, 1]];
    rings.forEach(() => {
      const ring = document.createElement('div');
      ring.className = 'anel';
      ring.setAttribute('aria-hidden', 'true');
      list.prepend(ring);
    });
    const ringEls = $$('.anel', list);
    // The outer ring reaches as far as the section leaves it: never wider than half the column, never taller than the
    // room under the heading.
    let outer = 0;
    const place = () => {
      const r = list.getBoundingClientRect();
      // The wider the rings, the less of them is on screen and the fewer chips are in sight at once: on a phone
      // they stay inside the column, wide enough to keep two or three chips up at any moment.
      outer = Math.min(r.width * (matchMedia(NARROW).matches ? .62 : .46), r.height * .96);
      list.dataset.outer = outer;  // read by the world: the glass rises from the centre, sized by the inner ring
      ringEls.forEach((el, k) => { el.style.width = el.style.height = 2 * outer * rings[k][0] + 'px'; });
      items.forEach((li, i) => li.style.setProperty('--r', outer * rings[i % 3][0] + 'px'));
    };
    items.forEach((li, i) => {
      // Three per ring, 120° apart; each ring starts 40° further round, so chips of neighbouring rings never meet.
      const [, dur, turn] = rings[i % 3], a = (Math.floor(i / 3) * 120 + (i % 3) * 40) % 360;
      li.style.setProperty('--dur', dur + 's');
      li.style.setProperty('--a', a + 'deg');
      li.style.setProperty('--turn', turn);
      li.style.setProperty('--hue', hues[i]);
      const b = buttons[i];
      b.setAttribute('aria-label', items[i].dataset.nome || b.textContent);
      b.style.setProperty('--dur', dur + 's');
      b.style.setProperty('--a', a + 'deg');
      b.style.setProperty('--turn', turn);
      b.replaceChildren();
      const tile = document.createElement('span');
      tile.className = 'tile';
      tile.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${GLYPHS[i % GLYPHS.length]}"/></svg>`;
      const nome = document.createElement('span');
      nome.className = 'nome';
      nome.textContent = items[i].dataset.nome;
      b.append(tile, nome);
    });
    place();
    addEventListener('resize', place);
    ScrollTrigger.addEventListener('refresh', place);
  }

  function industriesScene(on, stage) {
    const section = $('.industries');
    const items = $$('.industry-list li', section);
    const labels = items.map(li => li.textContent);
    const count = $('.industry-count span', section);
    const glow = $('.industries-glow', section);
    const featured = $('.is-featured', section);
    const hues = HUES;
    // Where the CSS glow (the fallback) sits for each category, alternating around the list.
    const spots = hues.map((_, i) => [i % 2 ? 72 : 28, 28 + (i * 37) % 48]);
    const DIM = 'rgba(255,255,255,0.46)';
    const last = items.length - 1;
    let current = -1;

    const mark = i => {
      if (i === current) return;
      current = i;
      items.forEach((li, k) => li.classList.toggle('is-active', k === i));
      buttons.forEach((b, k) => (k === i ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
      count.textContent = String(i + 1).padStart(2, '0');
    };

    featured?.classList.remove('is-featured');
    const buttons = items.map(li => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'industry-btn';
      b.textContent = li.textContent;
      li.dataset.nome = li.textContent;
      li.replaceChildren(b);
      return b;
    });
    const orbit = new URLSearchParams(location.search).has('orbita');
    if (orbit) {
      root.classList.add('orbit-on');
      orbitScene(section, items, buttons, hues);
    }
    // With the rings at the base, the light radiates from that same point, in the active category's colour.
    const spotAt = i => (orbit ? ['50%', '100%'] : [spots[i][0] + '%', spots[i][1] + '%']);

    if (!orbit) {
      gsap.set(items, { color: DIM, scale: 1 });
      gsap.set(items[0], { color: '#fff', scale: 1.06 });
    }
    gsap.set(glow, { '--c': hues[0], '--x': spotAt(0)[0], '--y': spotAt(0)[1] });

    // A luminous marker under the active sector, driven by the same playhead as the text and glow,
    // so it travels through every sector in between. Slots are measured from layout (offsets ignore the
    // items' own scale transforms) and re-measured on resize.
    const marker = document.createElement('span');
    marker.className = 'industry-marker';
    marker.setAttribute('aria-hidden', 'true');
    $('.wrap', section).append(marker);  // inside the wrap, so it recedes with the list when the next sheet rises
    const ease = gsap.parseEase('sine.inOut');
    let slots = [];
    const placeMarker = () => {
      if (!slots.length) return;
      const t = gsap.utils.clamp(0, last, tl.time()), a = Math.floor(t), b = Math.min(last, a + 1), f = ease(t - a);
      const lerp = (p, q) => p + (q - p) * f;
      const w = lerp(slots[a].w, slots[b].w);
      gsap.set(marker, { x: lerp(slots[a].x, slots[b].x) - w * .03, y: lerp(slots[a].y, slots[b].y), width: w * 1.06, '--mc': gsap.utils.interpolate(hues[a], hues[b], f) });
    };
    const measure = () => {
      slots = items.map((li, i) => {
        const w = buttons[i].offsetWidth;
        return { x: li.offsetLeft + (li.offsetWidth - w) / 2, y: li.offsetTop + li.offsetHeight - 2, w };
      });
      placeMarker();
    };

    const tl = gsap.timeline({
      paused: true,
      defaults: { duration: 1, ease: 'sine.inOut' },
      onUpdate: () => { mark(Math.round(gsap.utils.clamp(0, last, tl.time()))); placeMarker(); },
    });
    for (let i = 1; i <= last; i++) {
      if (!orbit) {
        tl.to(items[i - 1], { color: DIM, scale: 1 }, i - 1)
          .to(items[i], { color: '#fff', scale: 1.06 }, i - 1);
      }
      tl.to(glow, { '--c': hues[i], '--x': spotAt(i)[0], '--y': spotAt(i)[1] }, i - 1);
    }
    mark(0);
    measure();
    on(window, 'resize', measure);
    stage.sector = () => gsap.utils.clamp(0, last, tl.time());  // the 3D stations ride the same playhead

    let trip;
    buttons.forEach((b, i) => on(b, 'click', () => {
      trip?.kill();
      trip = tl.tweenTo(i, { duration: Math.max(.8, Math.abs(i - tl.time()) * .7), ease: 'sine.inOut' });
    }));

    return () => {
      trip?.kill();
      items.forEach((li, i) => { li.textContent = labels[i]; li.classList.remove('is-active'); li.removeAttribute('style'); });
      featured?.classList.add('is-featured');
      marker.remove();
      $$('.anel', section).forEach(el => el.remove());
      root.classList.remove('orbit-on');
    };
  }

  // The header. Stacked (one screen per section): it is at the top of every section once landed, and dissolves during
  // each transition — out over the first 30% of the sheet's rise, back over the last 25% (--hx, styles.css). Focus
  // inside it brings it back at once, as do the mouse near the top and the open menu. Flowing page: it slides away
  // on the way down and back on the way up.
  function headerBehaviour(on, stage, fit) {
    const header = $('.site-header');
    const menu = $('#site-menu');
    ScrollTrigger.create({ start: 80, end: 'max', onToggle: self => header.classList.toggle('is-pill', self.isActive) });

    if (!fit) {
      let hidden = false;
      const show = visible => {
        if (hidden === !visible) return;
        hidden = !visible;
        gsap.to(header, { yPercent: visible ? 0 : -150, duration: .5, ease: 'power3.out', overwrite: 'auto' });
      };
      ScrollTrigger.create({
        start: 80, end: 'max',
        onUpdate: self => show(!(self.direction === 1 && self.scroll() > innerHeight * .6 && !menu.matches(':popover-open'))),
      });
      on(header, 'focusin', () => show(true));
      on(window, 'pointermove', e => { if (e.pointerType === 'mouse' && e.clientY < 90) show(true); });
      return () => {};
    }

    gsap.set(header, { yPercent: 0 });
    const melt = $('#liquid feDisplacementMap');
    const shape = gsap.parseEase('sine.inOut'), clamp = gsap.utils.clamp(0, 1);
    const held = { v: 0, on: false };
    const hold = (keep, now) => {
      if (keep === held.on && !now) return;
      held.on = keep;
      gsap.to(held, { v: keep ? 1 : 0, duration: now ? 0 : keep ? .3 : .6, ease: 'power2.out', overwrite: true });
    };
    const busy = () => header.contains(document.activeElement) || menu.matches(':popover-open');
    let last = -1;
    const tick = () => {
      let hx = 0;
      for (const st of stage.stack || []) {
        const p = st.progress;
        if (p > 0 && p < 1) hx = Math.max(hx, shape(clamp(p / .3)) * (1 - shape(clamp((p - .75) / .25))));
      }
      hx = Math.round(hx * (1 - held.v) * 1000) / 1000;
      if (hx === last) return;
      last = hx;
      header.style.setProperty('--hx', hx);
      header.classList.toggle('is-melting', hx > .005);
      header.classList.toggle('is-gone', hx > .6);
      melt?.setAttribute('scale', (hx * 16).toFixed(1));
    };
    gsap.ticker.add(tick);
    on(header, 'focusin', () => hold(true, true));
    on(header, 'focusout', e => { if (!header.contains(e.relatedTarget) && !menu.matches(':popover-open')) hold(false); });
    on(menu, 'toggle', e => (e.newState === 'open' ? hold(true, true) : busy() || hold(false)));
    on(window, 'pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      if (e.clientY < 90) hold(true);
      else if (e.clientY > 160 && !busy()) hold(false);
    });
    return () => {
      gsap.ticker.remove(tick);
      header.style.removeProperty('--hx');
      header.classList.remove('is-melting', 'is-gone');
    };
  }

  // Every section rises over the one before it, like a sheet laid on top: the one below is pinned where it ends
  // (no pin spacing, so the next keeps its place in the flow and slides over it), recedes and dims. With motion on,
  // every sheet is at least a screen tall (styles.css), so once risen it covers the screen, and the section below,
  // left shifted by its released pin, stays out of sight behind it — never hidden, so it stays in the tab order.
  function stackScene(stage) {
    const layers = $$('main section, .site-footer');
    stage.stack = [];  // each transition's ScrollTrigger, for the header
    layers.slice(0, -1).forEach((under, i) => {
      const sheet = layers[i + 1], hero = under.matches('.hero');
      stage.recede[under.id] = 0;
      const tl = gsap.timeline({
        defaults: { ease: 'none', duration: 1 },
        scrollTrigger: { trigger: under, start: 'clamp(bottom bottom)', end: 'bottom top', pin: true, pinSpacing: false, scrub: true },
      })
        .to(hero ? $('.hero-grid', under) : $(':scope > .wrap', under), { scale: .9, opacity: .5, transformOrigin: '50% 70%' }, 0)
        .to(under, { '--dim': .55 }, 0)
        .to(stage.recede, { [under.id]: 1 }, 0)
        .fromTo(sheet, { '--lift': 0 }, { '--lift': 1, duration: .15 }, 0)
        .fromTo(sheet, { '--sheet-r': '28px' }, { '--sheet-r': '0px', duration: .15 }, .85);
      if (hero) tl.to($('.hero-glow', under), { scale: .92 }, 0);
      stage.stack.push(tl.scrollTrigger);
    });
  }

  function heroIntro(full, on) {
    const hero = $('.hero');
    const glow = $('.hero-glow', hero);
    const glowInner = $('.hero-glow-inner', hero);
    const header = $('.site-header');
    const badge = $('.badge', hero);
    const h1 = $('h1', hero);
    const lead = $('.lead', hero);
    const cta = $('.cta-row', hero);
    const camadas = $('.camadas', hero);
    const micro = $('.micro', hero);

    const title = SplitText.create(h1, { type: 'words,chars' });
    const leadSplit = SplitText.create(lead, { type: 'lines', mask: 'lines', aria: 'none' });  // lines keep whole words: readable as is
    const caret = document.createElement('span');
    caret.className = 'caret';
    caret.setAttribute('aria-hidden', 'true');
    h1.append(caret);

    const placeCaret = (char, before) => {
      const r = char.getBoundingClientRect();
      const box = h1.getBoundingClientRect();
      gsap.set(caret, { x: (before ? r.left : r.right) - box.left + 2, y: r.top - box.top + r.height * .14, height: r.height * .74 });
    };

    const breathe = gsap.to(glowInner, { scale: 1.06, duration: 4.5, ease: 'sine.inOut', yoyo: true, repeat: -1, paused: true });
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    tl.from(glowInner, { scale: .5, autoAlpha: 0, duration: 2, ease: 'power2.out' }, 0)
      .fromTo(header, { autoAlpha: 0, y: -24 }, { autoAlpha: 1, y: 0, duration: .9 }, .3)
      .fromTo(badge, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: .7 }, .5)
      .call(() => placeCaret(title.chars[0], true), [], .8)
      .set(caret, { autoAlpha: 1 }, .8);

    // Typing: irregular gaps and a beat after punctuation, so it reads as a person, not a loop.
    let t = 1.05;
    title.chars.forEach(char => {
      t += gsap.utils.random(.04, .09);
      tl.set(char, { autoAlpha: 1 }, t).call(placeCaret, [char], t);
      if (/[,.]/.test(char.textContent)) t += .32;
    });

    // Then, in order: the lead rises under the title line by line, the three layers one by one, the buttons, the
    // microcopy. Everything waits unseen (opacity, never visibility) until its turn. The layers animate by their
    // terms (dt, dd): on a phone the rows are display: contents, and have no box of their own to fade.
    tl.addLabel('typed', t)
      .call(() => caret.classList.add('is-blinking'), [], 'typed')
      .from(leadSplit.lines, { yPercent: 100, duration: .9, stagger: .1 }, 'typed-=.2');
    $$(':scope > div', camadas).forEach((row, i) =>
      tl.fromTo(row.children, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .7 }, `typed+=${.5 + i * .12}`));
    tl.fromTo([...cta.children], { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: .8, stagger: .12 }, 'typed+=1.1')
      .fromTo(micro, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: .7 }, 'typed+=1.45')
      .call(() => leadSplit.revert(), [], 'typed+=1.4')
      .call(() => { window.__heroIntroDone = true; }, [], 'typed+=2.2')  // read by check_motion.py: every block in place
      .call(() => breathe.play(), [], 2)
      // Caret stops blinking within 5s (WCAG 2.2.2).
      .call(() => caret.classList.remove('is-blinking'), [], 'typed+=4')
      .to(caret, { autoAlpha: 0, duration: .4 }, 'typed+=4');

    gsap.set(title.chars, { autoAlpha: 0 });
    // Shown (CSS keeps them hidden until the script runs); what waits for its turn is at opacity 0 already.
    gsap.set([h1, lead, camadas, cta, micro], { visibility: 'inherit' });

    ScrollTrigger.create({
      trigger: hero,
      start: 'top top',
      end: 'bottom top',
      onLeave: () => breathe.pause(),
      onEnterBack: () => tl.progress() > .5 && breathe.play(),
    });

    if (full) {
      const gx = gsap.quickTo(glow, 'x', { duration: 1.4, ease: 'power3.out' });
      const gy = gsap.quickTo(glow, 'y', { duration: 1.4, ease: 'power3.out' });
      on(hero, 'pointermove', e => {
        const r = hero.getBoundingClientRect();
        gx(((e.clientX - r.left) / r.width - .5) * 70);
        gy(((e.clientY - r.top) / r.height - .5) * 36);
      });
      on(hero, 'pointerleave', () => { gx(0); gy(0); });
    }
  }

  // Reveals fade with opacity, never visibility: hidden content would drop out of the tab order
  // and the accessibility tree until scrolled to, and keyboard users could never scroll to it.
  function reveals(on) {
    $$('main section:not(.hero) h2, .site-footer h2').forEach(h => {
      const split = SplitText.create(h, { type: 'words', mask: 'words', wordsClass: 'w' });
      gsap.from(split.words, { yPercent: 115, duration: 1.1, ease: 'power4.out', stagger: .07, scrollTrigger: { trigger: h, start: 'top 88%' } });
    });

    $$('.about-copy p, main .section-head p, .produto-copy > p').forEach(p => SplitText.create(p, {
      type: 'lines',
      mask: 'lines',
      aria: 'none',  // a paragraph can't be named by aria-label; its lines stay readable as they are
      autoSplit: true,
      onSplit: self => gsap.from(self.lines, { yPercent: 105, duration: 1, ease: 'power3.out', stagger: .08, scrollTrigger: { trigger: p, start: 'top 90%' } }),
    }));

    // The dependencies draw in one by one; the line joining the steps draws down (across, on a phone).
    gsap.fromTo('.hoje i', { '--draw': 0 }, { '--draw': 1, duration: .9, ease: 'power3.inOut', stagger: .1, scrollTrigger: { trigger: '.compare', start: 'top 85%' } });
    gsap.fromTo('.passos', { '--draw': 0 }, { '--draw': 1, duration: 1.4, ease: 'power3.inOut', scrollTrigger: { trigger: '.passos', start: 'top 88%' } });

    // The calculator's result counts up the first time it comes into view; typing takes over at once.
    const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
    const counting = [];
    ScrollTrigger.create({
      trigger: '.calc-out', start: 'top 92%', once: true,
      onEnter: () => $$('.calc-out dd').forEach(dd => {
        const n = +dd.textContent.replace(/\D/g, '');
        if (!n) return;
        const o = { v: 0 };
        counting.push(gsap.to(o, { v: n, duration: 1.6, ease: 'power2.out', onUpdate: () => { dd.textContent = brl.format(Math.round(o.v)); } }));
      }),
    });
    on($('#calc'), 'input', () => counting.forEach(t => t.kill()));

    const cards = $$('.card');
    gsap.set(cards, { transformOrigin: '50% 100%' });  // perspective comes from the shared grid
    gsap.from(cards, {
      y: 90, rotationX: -30, opacity: 0, duration: 1.2, ease: 'power3.out',
      stagger: {
        each: .12,
        onComplete() {
          const card = this.targets()[0];
          gsap.set(card, { transformOrigin: '50% 50%' });
          card.dataset.ready = '';
        },
      },
      scrollTrigger: { trigger: '.cards', start: 'top 85%' },
    });
    gsap.fromTo(cards, { '--ignite': 0 }, {
      '--ignite': 1, duration: 1.6, delay: .35, ease: 'power2.out', stagger: .12,
      scrollTrigger: { trigger: '.cards', start: 'top 85%' },
    });

    gsap.from('.faq-list details', { y: 26, opacity: 0, duration: .8, ease: 'power3.out', stagger: .08, scrollTrigger: { trigger: '.faq-list', start: 'top 85%' } });
    gsap.from(['.footer-cta .cta-row', ...$$('.footer-cols > div'), '.assinatura', '.footer-bar'], {
      y: 30, opacity: 0, duration: .9, ease: 'power3.out', stagger: .08,
      scrollTrigger: { trigger: '.site-footer', start: 'top 80%' },
    });
  }


  function wordmarkScene() {
    const mark = $('.wordmark');
    const split = SplitText.create($('.wordmark-text', mark), { type: 'chars', aria: 'hidden' });
    gsap.timeline({ scrollTrigger: { trigger: '.site-footer', start: 'top 75%', end: 'bottom bottom', scrub: 1 } })
      .from(split.chars, { yPercent: 105, ease: 'power2.out', stagger: .06 }, 0)
      .from($('svg', mark), { rotation: -90, scale: .3, transformOrigin: '50% 50%', ease: 'power2.out' }, 0)
      .fromTo(mark, { '--glow': .15 }, { '--glow': 1, ease: 'none' }, 0);
  }

  // Stacked sections are pinned or left shifted by their released pins, so on-screen boxes lie about where things
  // are. Links and focus go by the page's own flow instead: a pinned section's slot is held by its pin-spacer.
  function anchors(smoother, on) {
    const slotOf = el => el.closest('main section, .site-footer') || el;
    const flowTop = el => {
      const section = slotOf(el), slot = section.parentElement.matches('.pin-spacer') ? section.parentElement : section;
      let y = 0;
      for (let e = el; e && e !== section; e = e.offsetParent) y += e.offsetTop;
      for (let e = slot; e; e = e.offsetParent) y += e.offsetTop;
      return y;
    };
    // A smooth scroll tweens the smoother's own position. Its built-in smooth path stalls after a jump that did not
    // move the page: ScrollSmoother 3.15 keeps a proxy flag set until the next real scroll, and the next smooth
    // scroll is then cancelled back to where it started. So jumps that would not move are skipped as well.
    const go = (y, smooth) => {
      if (!smoother) return window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'instant' });
      y = gsap.utils.clamp(0, ScrollTrigger.maxScroll(window), y);
      if (smooth) gsap.to(smoother, { scrollTop: y, duration: 1.2, ease: 'power3.inOut', overwrite: 'auto' });
      else if (Math.abs(smoother.scrollTop() - y) > .5) smoother.scrollTo(y, false);
    };

    // A link also moves focus to its section, so the next Tab continues from there.
    on(document, 'click', e => {
      const id = e.target.closest('a[href^="#"]')?.getAttribute('href');
      if (!id || id === '#') return;
      const target = $(id);
      if (!target) return;
      e.preventDefault();
      go(target.matches('.hero') ? 0 : flowTop(target), true);
      target.hasAttribute('tabindex') || target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });

    // Keyboard focus off screen, or under a sheet (a section already scrolled past), brings its section back:
    // centred on the element, but never past the screen where the next sheet starts rising over it. Mouse focus
    // never scrolls, and neither does a section focused by a link (its smooth scroll is already on the way).
    // With the smoother, the browser has just scrolled the wrapper natively to show the element; that is undone
    // first (ScrollSmoother does the same), or the element would look visible here and vanish right after.
    const content = $('#smooth-content'), wrapper = $('#smooth-wrapper');
    on(document, 'focusin', e => {
      const el = e.target;
      if (!content.contains(el) || el.matches('main, main section, .site-footer') || !el.matches(':focus-visible')) return;
      if (smoother) wrapper.scrollTop = 0;
      const r = el.getBoundingClientRect();
      if (r.top >= 90 && r.bottom <= innerHeight - 20 && el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))) return;
      const section = slotOf(el), top = flowTop(section);
      go(gsap.utils.clamp(top, top + Math.max(0, section.offsetHeight - innerHeight), flowTop(el) + el.offsetHeight / 2 - innerHeight / 2), false);
    });
  }

  function cardTilt(on) {
    // The shared vanishing point follows the mouse across the grid, so the cards' layers shift like a camera.
    const grid = $('.cards');
    gsap.set(grid, { '--po-x': .5, '--po-y': .5 });
    const ox = gsap.quickTo(grid, '--po-x', { duration: .8, ease: 'power3.out' });
    const oy = gsap.quickTo(grid, '--po-y', { duration: .8, ease: 'power3.out' });
    on(grid, 'pointermove', e => {
      const r = grid.getBoundingClientRect();
      ox(.5 + ((e.clientX - r.left) / r.width - .5) * .8);
      oy(.5 + ((e.clientY - r.top) / r.height - .5) * .8);
    });
    on(grid, 'pointerleave', () => { ox(.5); oy(.5); });

    $$('.card').forEach(card => {
      const rx = gsap.quickTo(card, 'rotationX', { duration: .6, ease: 'power3.out' });
      const ry = gsap.quickTo(card, 'rotationY', { duration: .6, ease: 'power3.out' });
      on(card, 'pointermove', e => {
        if (!('ready' in card.dataset)) return;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        rx((.5 - py) * 10);
        ry((px - .5) * 14);
        card.style.setProperty('--mx', px * 100 + '%');
        card.style.setProperty('--my', py * 100 + '%');
      });
      on(card, 'pointerleave', () => { rx(0); ry(0); });
    });
  }

  function magnetic(on) {
    $$('.btn:not(.calc .btn)').forEach(btn => {  // the calculator's button stays put, next to its fields
      const mx = gsap.quickTo(btn, 'x', { duration: .5, ease: 'power3.out' });
      const my = gsap.quickTo(btn, 'y', { duration: .5, ease: 'power3.out' });
      on(btn, 'pointermove', e => {
        const r = btn.getBoundingClientRect();
        mx((e.clientX - r.left - r.width / 2) * .35);
        my((e.clientY - r.top - r.height / 2) * .45);
      });
      on(btn, 'pointerleave', () => { mx(0); my(0); });
    });
  }

  // The Three.js world (mundo.js). One canvas, drawn inside whichever window is on screen — the hero, the problem
  // (the sheet the glass lands on) or the sectors — and moved between them, so it stacks with its section like
  // everything else on the page. It is
  // fetched without blocking while the CSS glow (the fallback, underneath) shows, and fades in over it after its
  // first frame. Never fetched with reduced motion (this file stops before), without WebGL 2, or where WebGL
  // would run in software.
  function worldScene(full, on, stage, fit) {
    const hero = $('.hero');
    const grid = $('.hero-grid', hero);
    // The white sheet that rises over the hero (stacked layouts only; a test, 2026-09-19). The world draws it lit from
    // below by the hero's own light, in the same place — its light version, intense at the bottom, reflecting softly
    // up the whole sheet — so the light stays put as the sheet sweeps up over it. Only the glass travels: onto the
    // sheet, landing large right of its title on wide screens, in its top right corner on phones.
    const sheet = fit ? $('#problema') : null;
    const sectors = $('.industries');
    const glow = $('.hero-glow', hero);
    const glowInner = $('.hero-glow-inner', hero);
    const params = new URLSearchParams(location.search);
    const canvas = document.createElement('canvas');
    canvas.id = 'world';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: full, stencil: false, powerPreference: 'high-performance', failIfMajorPerformanceCaveat: true });
    if (!gl) return () => {};
    hero.append(canvas);

    let world = null, stopped = false, last = null;
    const look = { halo: 1.2 };
    const appear = { v: 0 };
    const tilt = { x: 0, y: 0 };  // -1..1 across the hero
    const debug = { t: null, shift: 0, hide: false };
    canvas.__world = {  // read by check_motion.py; JS properties, not DOM writes
      debug, look,
      get ready() { return !!world; },
      get frames() { return world ? world.frames : 0; },
      get level() { return world ? world.level : -1; },
      get last() { return last; },
      lose: () => world?.lose(),
      tune: values => world?.tune(values),
    };

    // Where the mark sits (the person's choice in the composition study, 2026-09-18): centred in the band under
    // the hero text, rising out of the brightest light, which is what the glass refracts. Measured from layout
    // (transforms do not change offsets), within the first screen, so a tall hero never crops it.
    // In the sectors, it stands in the free band left of the list on wide screens, and above the heading (a band
    // CSS reserves under 961px) on narrow ones. Never behind text: the halo keeps out of the text's rows too.
    const inBox = (el, box) => {
      let x = 0, y = 0;
      for (let e = el; e && e !== box; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight };
    };
    const narrow = matchMedia(NARROW);
    const layers = $$('main section, .site-footer'), next = el => layers[layers.indexOf(el) + 1];
    let spot = {}, station = {}, dock = null;
    const measure = () => {
      const W = hero.offsetWidth, H = Math.min(hero.offsetHeight, innerHeight);
      const bottom = el => { const b = inBox(el, hero); return b.y + b.h; };
      const below = Math.max(bottom($('.lead', hero)), bottom($('.hero-side', hero)));
      // A phone on its side has no room under the text: then there is no glass, rather than a crushed one.
      const grid = inBox($('.hero-grid', hero), hero);
      spot = { x: W / 2, y: below + (H - below) * .5, size: Math.max(0, Math.min((H - below) * .8, W * (narrow.matches ? .5 : .2))), top: below,
               origin: [grid.x + grid.w * .5, grid.y + grid.h * .7] };

      const wrap = inBox($(':scope > .wrap', sectors), sectors);
      const head = inBox($('.section-head', sectors), sectors);
      const origin = [wrap.x + wrap.w * .5, wrap.y + wrap.h * .7];  // where the list recedes to (stackScene)
      if (root.classList.contains('orbit-on')) {
        // The rings are cut in half by the section's base: their centre is on that edge, and the glass rises there.
        const ring = inBox($('.industry-list', sectors), sectors);
        const outer = +$('.industry-list', sectors).dataset.outer || ring.w * .46;
        station = { x: ring.x + ring.w / 2, y: ring.y + ring.h, size: outer * .56 * 1.1, band: [-1e5, 1e5], origin };
      } else if (narrow.matches) {
        const top = parseFloat(getComputedStyle(root).fontSize) * 5.5;  // below the header
        station = { x: sectors.offsetWidth / 2, y: (top + head.y) / 2, size: Math.max(0, Math.min((head.y - top) * .85, sectors.offsetWidth * .4)), band: [-1e5, head.y], origin };
      } else {
        const glass = inBox($('.integ-glass', sectors), sectors);  // the empty left column of the stage
        station = { x: glass.x + glass.w / 2, y: glass.y + glass.h / 2, size: Math.min(glass.w * .75, glass.h * .8), band: [head.y + head.h, 1e5], origin };
      }

      // Where the glass lands on the sheet. Wide screens: large, in the free column right of the title and its
      // description. Phones: the top right corner, flush with the column's right edge — in the band between the
      // header's pill and the title, or, where that band is too thin (small phones), beside the title's first line.
      // first: the title's row, where the flight's lane ends until the glass is clear of the text (open.from, x);
      // then the lane opens down by open.depth.
      if (sheet) {
        const rem = parseFloat(getComputedStyle(root).fontSize), header = $('.site-header'), h2 = $('h2', sheet);
        const bar = inBox($('.wrap', header), header), col = inBox($(':scope > .wrap', sheet), sheet), title = inBox(h2, sheet);
        const top = bar.y + bar.h - .5 * rem, first = title.y - .3 * rem, right = col.x + col.w;  // the glyphs rise a little above the title's box
        // The title's first line, from its word masks (never moved by the reveal), in layout px.
        const hb = h2.getBoundingClientRect(), k = h2.offsetWidth / hb.width, masks = $$('.w-mask', h2);
        const boxes = masks.length ? masks.map(m => m.getBoundingClientRect()) : (() => { const r = document.createRange(); r.selectNodeContents(h2); return [...r.getClientRects()]; })();
        const line = boxes.filter(b => b.width > 1 && b.top < Math.min(...boxes.map(q => q.top)) + 4);
        const end = title.x + (Math.max(...line.map(b => b.right)) - hb.left) * k, lineH = Math.max(...line.map(b => b.height)) * k;
        const above = Math.min(4.5 * rem, (first - top) * .8), beside = Math.min(4.5 * rem, lineH, right - end - .75 * rem);
        const origin = [col.x + col.w * .5, col.y + col.h * .7], free = $('.about-glass', sheet);
        if (free.offsetWidth) {
          const box = inBox(free, sheet), copy = inBox($('.about-copy', sheet), sheet);
          dock = { x: box.x + box.w / 2, y: box.y + box.h / 2, size: Math.min(box.w * .8, box.h * .9), first, big: true,
                   open: { from: Math.max(title.x + title.w, copy.x + copy.w) + rem, depth: box.y + box.h - first }, origin };
        } else dock = above >= beside
          ? { x: right - above / 2, y: Math.max((top + first) / 2, top + above / 2 - .25 * rem), size: above, first, origin }
          : { x: right - beside / 2, y: first + lineH / 2, size: beside, first, open: { from: end + .5 * rem, depth: lineH }, origin };
      }
    };

    // A window's rows on screen, down to the sheet rising over it (plus its rounded corners, flat once it lands),
    // window-relative.
    const rows = (el, next) => {
      const r = el.getBoundingClientRect(), corner = parseFloat(next.style.getPropertyValue('--sheet-r') || 28);
      const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, next.getBoundingClientRect().top + corner, innerHeight);
      return bottom > top ? { width: el.offsetWidth, height: el.offsetHeight, clipTop: top - r.top, clipBottom: bottom - r.top } : null;
    };
    // Receding under the next sheet: towards the point the section's text recedes to (and tipping back, below).
    const recede = (p, [ox, oy], k) => [ox + (p.x - ox) * k, oy + (p.y - oy) * k];

    // The glass's idle sway: wide when large (the hero, the sheet on wide screens), gentle when small.
    const sway = (t, big) => [Math.sin(t * .27) * (big ? .12 : .1), Math.sin(t * .35) * (big ? .32 : .22), Math.sin(t * .21) * (big ? .05 : .04)];
    const glowNow = () => [gsap.getProperty(glow, 'x'), gsap.getProperty(glow, 'y') + debug.shift, gsap.getProperty(glow, 'scaleX'), gsap.getProperty(glowInner, 'scaleX')];
    // The sheet's light, over white: as the edge comes in it is the hero's glow at full strength (no seam in the
    // light); as the sheet rises it turns into the sheet's own wide, soft light at its base, at LIGHT. Nothing behind
    // the glass on the sheet: no halo there. While its edge is on screen the sheet is drawn at full resolution (sharp).
    const LIGHT = .44;
    const lerp = gsap.utils.interpolate, glide = gsap.parseEase('power2.inOut'), settle = gsap.parseEase('sine.inOut');

    // While the sheet rises, the hero's text and its shade (a CSS layer) stop at its edge: the sheet itself is
    // transparent (the world draws it), so nothing of the hero may show through it.
    let cutting = false;
    const cut = edge => {
      if (edge === undefined) {
        if (!cutting) return;
        cutting = false;
        hero.style.removeProperty('--paper-cut');
        grid.style.clipPath = '';
        return;
      }
      cutting = true;
      const r = hero.getBoundingClientRect(), g = grid.getBoundingClientRect();
      hero.style.setProperty('--paper-cut', Math.max(0, r.bottom - edge) + 'px');
      // In the grid's own units: it is scaled as it recedes.
      grid.style.clipPath = `inset(-10rem -10rem ${Math.max(0, grid.offsetHeight - (edge - g.top) * grid.offsetHeight / g.height)}px -10rem)`;
    };

    const heroView = time => {
      const t = debug.t ?? time, a = appear.v;
      let w, pt = Infinity;
      if (sheet) {
        // The whole hero is the window until the sheet has landed, and the sheet is drawn in it.
        const r = hero.getBoundingClientRect(), s = sheet.getBoundingClientRect();
        const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, innerHeight);
        if (s.top <= .5 || bottom <= top) {
          cut();
          return null;
        }
        pt = s.top - r.top;
        w = { width: hero.offsetWidth, height: hero.offsetHeight, clipTop: top - r.top, clipBottom: bottom - r.top };
        if (pt < w.height - .5) cut(s.top);
        else cut();
      } else if (!(w = rows(hero, next(hero)))) return null;

      const view = {
        ...w, host: hero, region: 0, halo: look.halo * a, glow: glowNow(), glowAlpha: gsap.getProperty(glowInner, 'opacity'),
      };
      const [sx, sy, sz] = sway(t, true);
      if (!sheet) {
        const r = stage.recede.top ?? 0, k = 1 - .12 * r;  // a touch deeper than the text (.9)
        const [x, y] = recede(spot, spot.origin, k);
        return {
          ...view, haloBand: [spot.origin[1] + (spot.top - spot.origin[1]) * k, 1e5],
          mark: { x, y: y + 40 * (1 - a), size: spot.size * k * (.7 + .3 * a), hidden: debug.hide,
                  rx: sx - tilt.y * .3 + r * .5, ry: sy + tilt.x * .5 - (1 - a) * 1.4, rz: sz },
        };
      }

      // The flight. p: how far the sheet has risen. The glass heads for its corner of the sheet, flipping over once, but
      // only through rows free of text — under the hero's text while that shows, above the sheet's first row — so it
      // shrinks to pass. The light stays where it is.
      const p = gsap.utils.clamp(0, 1, 1 - pt / w.height), f = glide(p);
      // Down beside the text only once clear of it (eased over one glass width, so nothing jumps).
      const x = lerp(spot.x, dock.x, f), want = lerp(spot.size * (.7 + .3 * a), dock.size, f);
      const open = dock.open ? dock.open.depth * gsap.utils.clamp(0, 1, (x - want / 2 - dock.open.from) / want) : 0;
      const lane = [Math.min(spot.top, pt), pt + dock.first + open];
      const size = Math.min(want, (lane[1] - lane[0]) * .92);
      const y = gsap.utils.clamp(lane[0] + size / 2, lane[1] - size / 2, lerp(spot.y + 40 * (1 - a), pt + dock.y, f));
      const [dx, dy, dz] = sway(t, !!dock.big), m = settle(gsap.utils.clamp(0, 1, p / .6));
      return {
        ...view, haloBand: [spot.top, 1e5], sharp: pt < w.height,
        paper: { top: pt, radius: parseFloat(sheet.style.getPropertyValue('--sheet-r') || 28), dim: +gsap.getProperty(hero, '--dim') || 0, halo: 0,
                 light: [LIGHT, m] },
        mark: {
          x, y, size, hidden: debug.hide,
          rx: lerp(sx - tilt.y * .3, dx, f), ry: lerp(sy + tilt.x * .5 - (1 - a) * 1.4, dy, f) + Math.PI * f, rz: lerp(sz, dz, f),
        },
      };
    };

    // The sheet, once landed: white, lit from below, the glass in its place. When the next section rises over
    // it, the glass recedes with the sheet's text and the light as the hero's does (to .92).
    const sheetView = time => {
      if (!sheet) return null;
      const w = rows(sheet, next(sheet));
      if (!w) return null;
      const t = debug.t ?? time, r = stage.recede[sheet.id] ?? 0, k = 1 - .1 * r;
      const [x, y] = recede(dock, dock.origin, k), [dx, dy, dz] = sway(t, !!dock.big), [gx, gy, gs, gi] = glowNow();
      return {
        ...w, host: sheet, region: 0, halo: 0, haloBand: [-1e5, 1e5], glow: [gx, gy, gs * (1 - .08 * r), gi], glowAlpha: gsap.getProperty(glowInner, 'opacity'),
        paper: { top: -1e5, radius: 0, dim: 0, halo: 0, light: [LIGHT, 1] },
        mark: { x, y, size: dock.size * k, hidden: debug.hide, rx: dx + r * .5, ry: dy, rz: dz },
      };
    };

    // The sectors window. The world was stopped on the way here, so there is no continuity to keep: the glass
    // arrives with a short turn. Station, light and colour all come from the sectors timeline's playhead.
    const arrive = { v: 0 };
    ScrollTrigger.create({
      trigger: sectors, start: 'top bottom', end: 'bottom top',
      onEnter: () => gsap.fromTo(arrive, { v: 0 }, { v: 1, duration: 1.6, ease: 'power3.out', overwrite: true }),
      onEnterBack: () => gsap.fromTo(arrive, { v: 0 }, { v: 1, duration: 1.6, ease: 'power3.out', overwrite: true }),
    });
    const sectorsView = time => {
      const w = rows(sectors, next(sectors));
      if (!w) return null;
      const t = debug.t ?? time, s = stage.sector(), i = Math.floor(s), a = arrive.v, r = stage.recede[sectors.id] ?? 0, k = 1 - .1 * r;
      const color = gsap.utils.splitColor(gsap.utils.interpolate(HUES[i], HUES[Math.min(HUES.length - 1, i + 1)], (1 - Math.cos(Math.PI * (s - i))) / 2));
      const [x, y] = recede(station, station.origin, k);
      return {
        ...w, host: sectors, region: 1, halo: look.halo * .8 * a, haloBand: station.band, station: s,
        // The light pools around the glass and stops short of the text (C-7 measures it).
        spot: [x / w.width, y / w.height],
        spotSize: root.classList.contains('orbit-on') ? [.85, .62] : narrow.matches ? [.62, .3] : [.3, .4],
        spotColor: color.slice(0, 3).map(c => c / 255),
        mark: {
          x, y, size: station.size * k * (.8 + .2 * a), hidden: debug.hide,
          rx: Math.sin(t * .27) * .08 + r * .5, ry: Math.sin(t * .35) * .14 - (1 - a) * 1.6, rz: Math.sin(t * .21) * .04,
        },
      };
    };

    // The guard: over the first 2 s of drawing, if frames arrive slower than the screen's own rhythm, drop one
    // resolution level and measure again. It never limits the frame rate.
    const pre = [], samples = [];
    let baseline = 16.7, guardFrom = Infinity;
    const median = list => [...list].sort((p, q) => p - q)[list.length >> 1];
    const watch = time => {
      samples.push(frame.ms);
      if (time < guardFrom || samples.length < 60) return;
      const slow = median(samples.slice(10)) > Math.max(baseline * 1.3, 4.5);
      samples.length = 0;
      if (slow && world.level < 2) { world.setLevel(world.level + 1); guardFrom = time + 2; }
      else guardFrom = Infinity;
    };

    const tick = time => {
      if (stopped) return;
      if (!world) { if (pre.length < 240) pre.push(frame.ms); return; }
      const v = heroView(time) || sheetView(time) || sectorsView(time);
      const hidden = v ? '' : 'hidden';
      if (canvas.style.visibility !== hidden) canvas.style.visibility = hidden;
      if (!v) return;
      if (canvas.parentNode !== v.host) v.host.append(canvas);  // above the section's CSS glow, below its content
      world.render(v);
      last = v;
      if (guardFrom !== Infinity) watch(time);
    };
    gsap.ticker.add(tick);

    if (full) {
      const tx = gsap.quickTo(tilt, 'x', { duration: 1, ease: 'power3.out' });
      const ty = gsap.quickTo(tilt, 'y', { duration: 1, ease: 'power3.out' });
      on(hero, 'pointermove', e => {
        const r = hero.getBoundingClientRect();
        tx(((e.clientX - r.left) / r.width - .5) * 2);
        ty(((e.clientY - r.top) / r.height - .5) * 2);
      });
      on(hero, 'pointerleave', () => { tx(0); ty(0); });
    }
    on(window, 'resize', measure);
    ScrollTrigger.addEventListener('refresh', measure);
    // Context lost: the canvas goes, and the CSS glow underneath is simply there again.
    on(canvas, 'webglcontextlost', e => {
      e.preventDefault();
      stopped = true;
      world = null;
      root.classList.remove('world-on');
      canvas.remove();
      cut();
    });

    import('./mundo.js')
      .then(m => m.createWorld(canvas, gl, { fine: full, startLevel: full ? 0 : 1, hues: HUES }))
      .then(w => {
        if (stopped) return w.dispose();
        world = w;
        if (pre.length > 20) baseline = median(pre);
        measure();
        tick(gsap.ticker.time);
        root.classList.add('world-on');
        gsap.to(appear, { v: 1, duration: 2.4, ease: 'expo.out' });
        guardFrom = gsap.ticker.time + 2;
        if (params.has('dev')) devPanel(w, look);
      })
      // Offline, opened from file://, or a failed compile: the CSS glow stays, and the world stays off.
      .catch(() => {
        if (stopped) return;
        stopped = true;
        world?.dispose();
        world = null;
        root.classList.remove('world-on');
        canvas.remove();
        cut();
      });

    return () => {
      stopped = true;
      gsap.ticker.remove(tick);
      ScrollTrigger.removeEventListener('refresh', measure);
      world?.dispose();
      canvas.remove();
      root.classList.remove('world-on');
      cut();
    };
  }

  // ?dev: a lil-gui panel to tune the glass and the light on the real page, then copy the values into mundo.js.
  function devPanel(world, look) {
    Promise.all([import('https://cdn.jsdelivr.net/npm/lil-gui@0.21.0/+esm'), import('./mundo.js')]).then(([lil, { GLASS }]) => {
      const gui = new lil.GUI({ title: 'Solvane · mundo' });
      const glass = { ...GLASS };
      const set = () => world.tune(glass);
      const g = gui.addFolder('Vidro');
      g.add(glass, 'thickness', 0, 3).onChange(set);
      g.add(glass, 'ior', 1, 2.33).onChange(set);
      g.add(glass, 'roughness', 0, 1).onChange(set);
      g.add(glass, 'dispersion', 0, 3).onChange(set);
      g.add(glass, 'attenuationDistance', .1, 6).onChange(set);
      g.addColor(glass, 'attenuationColor').onChange(set);
      g.add(glass, 'envMapIntensity', 0, 3).onChange(set);
      g.add(glass, 'clearcoat', 0, 1).onChange(set);
      gui.addFolder('Luz').add(look, 'halo', 0, 1.5);
      gui.add({ copiar: () => console.info(JSON.stringify({ GLASS: glass, look })) }, 'copiar').name('Copiar valores (console)');
    });
  }

  // Header links follow the section in view: its link carries aria-current. Sections without a link (the hero,
  // the problem, the footer) leave none marked.
  function navSpy() {
    const links = $$('.nav-list a[href^="#"]');
    const set = id => links.forEach(a => (a.getAttribute('href') === `#${id}` ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    $$('main section, .site-footer').forEach(section => ScrollTrigger.create({
      trigger: section, start: 'top center', end: 'bottom center',
      onToggle: self => { if (self.isActive) set(section.id); },
    }));
  }


  function cardParallax() {
    gsap.fromTo('.card:nth-child(even)', { yPercent: 8 }, {
      yPercent: -8, ease: 'none',
      scrollTrigger: { trigger: '.cards', start: 'top bottom', end: 'bottom top', scrub: true },
    });
  }
})();
