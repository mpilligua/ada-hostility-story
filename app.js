(function () {
  const D = window.DATA;
  if (!D) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const last = (a) => a[a.length - 1];

  D.derived = {
    tri_ratio: D.triangles.observed / D.triangles.null_mean,
    tri_ratio_clean: D.triangles.clean_observed / D.triangles.clean_null_mean,
    dist_end: last(D.prox_lines.distant).rate,
    close_end: last(D.prox_lines.close).rate,
  };

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const niceDate = (s) => { const [y, m, d] = s.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
  const fmt = {
    int: (x) => Math.round(x).toLocaleString('en-US'),
    pct0: (x) => Math.round(x * 100) + '%',
    pct1: (x) => (x * 100).toFixed(1) + '%',
    x1: (x) => x.toFixed(1) + '×',
    d2: (x) => x.toFixed(2),
    coef: (x) => (x < 0 ? '−' : '') + Math.abs(x).toFixed(2),
    p: (x) => (x < 0.001 ? '< 0.001' : x.toFixed(2)),
    str: (x) => String(x),
  };
  const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), D);

  document.querySelectorAll('[data-k]').forEach((el) => {
    const v = get(el.dataset.k);
    if (v != null) el.textContent = fmt[el.dataset.f || 'int'](v);
  });

  // ---------- small helpers ----------
  function s(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, str, cls, attrs) {
    const a = Object.assign({}, attrs || {});
    const style = [];
    if (a['font-size'] != null) { style.push(`font-size:${a['font-size']}px`); delete a['font-size']; }
    if (a['font-weight'] != null) { style.push(`font-weight:${a['font-weight']}`); delete a['font-weight']; }
    const t = s('text', Object.assign({ x, y, class: cls || '' }, a), parent);
    if (style.length) t.setAttribute('style', style.join(';'));
    t.textContent = str;
    return t;
  }
  function svgIn(el, W, H) {
    return s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img' }, el);
  }
  const ease = (p) => 1 - Math.pow(1 - p, 3);
  function tween(dur, fn, done, delay) {
    if (reduce) { fn(1); if (done) done(); return; }
    const start = performance.now() + (delay || 0);
    function step(now) {
      if (now < start) { requestAnimationFrame(step); return; }
      const p = Math.min(1, (now - start) / dur);
      fn(ease(p));
      if (p < 1) requestAnimationFrame(step); else if (done) done();
    }
    requestAnimationFrame(step);
  }
  function onView(el, cb, threshold) {
    if (!('IntersectionObserver' in window)) { cb(); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { io.disconnect(); cb(); } });
    }, { threshold: threshold == null ? 0.3 : threshold });
    io.observe(el);
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function dashDraw(path, len, delay, dur) {
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    tween(dur || 1200, (p) => { path.style.strokeDashoffset = len * (1 - p); }, null, delay);
  }

  // Each chart is rebuilt at the container's real pixel width, so labels stay legible on phones.
  const resizers = [];
  function mount(id, build) {
    const el = document.getElementById(id);
    if (!el) return null;
    const holder = { inst: null, played: false };
    let lastW = 0;
    function render(force) {
      const cs = getComputedStyle(el);
      const inner = (el.clientWidth || 600) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const W = Math.round(Math.max(260, Math.min(1000, inner)));
      if (!force && holder.inst && Math.abs(W - lastW) < 24) return;
      lastW = W;
      el.innerHTML = '';
      holder.inst = build(el, W);
      if (holder.played && holder.inst.final) holder.inst.final();
    }
    render(true);
    onView(el, () => { holder.played = true; if (holder.inst.play) holder.inst.play(); });
    resizers.push(() => render(false));
    return holder;
  }
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => resizers.forEach((r) => r()), 180); });

  // ---------- figure 1: sample of the hostile network ----------
  (function network() {
    const cv = document.getElementById('net');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const N = D.hero.nodes, E = D.hero.edges;
    let W = 0, H = 0, pts = [], mouse = null, col = {};

    function layout() {
      const cs = getComputedStyle(document.documentElement);
      ['ink', 'ink-2', 'hot', 'neutral', 'paper', 'rule', 'muted'].forEach((k) => { col[k] = cs.getPropertyValue('--' + k).trim(); });
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pad = 14;
      pts = N.map((n) => ({ x: pad + n.x * (W - 2 * pad), y: pad + n.y * (H - 2 * pad), d: n.d, id: n.id }));
      draw();
    }
    function strokeEdges(filter, color, alpha, width) {
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath();
      E.forEach((e) => { if (filter(e)) { ctx.moveTo(pts[e[0]].x, pts[e[0]].y); ctx.lineTo(pts[e[1]].x, pts[e[1]].y); } });
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      let best = -1;
      if (mouse) {
        let bd = 30 * 30;
        pts.forEach((p, i) => { const dd = (p.x - mouse[0]) ** 2 + (p.y - mouse[1]) ** 2; if (dd < bd) { bd = dd; best = i; } });
      }
      const dim = best >= 0 ? 0.35 : 1;
      strokeEdges((e) => !e[2], col.neutral, 0.55 * dim, 0.8);
      strokeEdges((e) => e[2], col.hot, 0.3 * dim, 0.8);
      ctx.fillStyle = col.ink;
      ctx.globalAlpha = best >= 0 ? 0.4 : 0.9;
      pts.forEach((p) => { ctx.beginPath(); ctx.arc(p.x, p.y, 1.4 + Math.sqrt(p.d) * 0.4, 0, 6.283); ctx.fill(); });
      ctx.globalAlpha = 1;
      if (best < 0) return;

      const near = new Set([best]);
      strokeEdges((e) => { const hit = e[0] === best || e[1] === best; if (hit) { near.add(e[0]); near.add(e[1]); } return hit; }, col.ink, 0.8, 1);
      ctx.fillStyle = col.ink;
      near.forEach((i) => { const p = pts[i]; ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 + Math.sqrt(p.d) * 0.4, 0, 6.283); ctx.fill(); });
      const q = pts[best];
      ctx.fillStyle = col.hot; ctx.beginPath(); ctx.arc(q.x, q.y, 4.5, 0, 6.283); ctx.fill();

      const l1 = 'r/' + q.id, l2 = q.d + ' hostile pairs in the full network';
      ctx.font = '600 14px "IBM Plex Sans", sans-serif';
      const w1 = ctx.measureText(l1).width;
      ctx.font = '400 12.5px "IBM Plex Sans", sans-serif';
      const w = Math.max(w1, ctx.measureText(l2).width);
      const lx = Math.max(4, Math.min(q.x + 12, W - w - 18)), ly = q.y > 60 ? q.y - 50 : q.y + 14;
      ctx.fillStyle = col.paper; ctx.strokeStyle = col.rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.rect(lx, ly, w + 14, 40); ctx.fill(); ctx.stroke();
      ctx.fillStyle = col['ink-2']; ctx.fillText(l2, lx + 7, ly + 32);
      ctx.font = '600 14px "IBM Plex Sans", sans-serif';
      ctx.fillStyle = col.ink; ctx.fillText(l1, lx + 7, ly + 16);
    }
    layout();
    window.addEventListener('resize', layout);
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    const move = (e) => { const r = cv.getBoundingClientRect(); mouse = [e.clientX - r.left, e.clientY - r.top]; draw(); };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerdown', move);
    cv.addEventListener('pointerleave', () => { mouse = null; draw(); });
  })();

  // ---------- intro: longest feuds ----------
  (function feuds() {
    const ol = document.getElementById('feuds');
    const max = Math.max(...D.top_feuds.map((f) => f.n));
    D.top_feuds.forEach((f, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="names"><span class="fill"></span>r/${f.a}<i>&harr;</i>r/${f.b}</span><span class="n">${f.n}</span>`;
      ol.appendChild(li);
    });
    onView(ol, () => {
      ol.querySelectorAll('.fill').forEach((el, i) => { el.style.width = (D.top_feuds[i].n / max) * 100 + '%'; });
    }, 0.2);
  })();

  // ---------- hook: one attack, six replies ----------
  mount('hook-fig', (el, W) => {
    const H = 330 + 34, ex = D.example;
    const svg = svgIn(el, W, H);
    const defs = s('defs', {}, svg);
    const mk = s('marker', { id: 'arrow-hot', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
    s('path', { d: 'M0,0 L10,5 L0,10 z', class: 'f-hot' }, mk);

    const inset = Math.min(70, W * 0.17);
    const A = [inset, 150], B = [W - inset, 150], cTop = [W / 2, 88], cBot = [W / 2, 332];
    const attack = s('path', { d: `M${A[0] + 24},${A[1] - 4} Q${cTop[0]},${cTop[1]} ${B[0] - 26},${B[1] - 4}`, fill: 'none', class: 's-hot', 'stroke-width': 2.5, 'marker-end': 'url(#arrow-hot)' }, svg);
    const attackLbl = txt(svg, W / 2, 104, 'the attack', 't-hot', { 'text-anchor': 'middle' });
    const P0 = [B[0] - 12, A[1] + 26], P1 = [A[0] + 12, A[1] + 26];
    s('path', { d: `M${P0[0]},${P0[1]} Q${cBot[0]},${cBot[1]} ${P1[0]},${P1[1]}`, fill: 'none', class: 's-neutral', 'stroke-width': 1.5, 'stroke-dasharray': '3 6' }, svg);
    const backLbl = txt(svg, W / 2, H - 4, `${ex.n_back} links back`, 't-muted', { 'text-anchor': 'middle', 'font-size': W < 420 ? 10.5 : 12 });

    [[A, 'r/' + ex.a], [B, 'r/' + ex.b]].forEach(([p, name]) => {
      s('circle', { cx: p[0], cy: p[1], r: 20, class: 'f-ink' }, svg);
      const anchor = p === A ? 'start' : 'end';
      txt(svg, p === A ? Math.max(0, p[0] - 40) : Math.min(W, p[0] + 40), 70, name, 't-strong', { 'text-anchor': anchor });
      s('line', { x1: p[0], x2: p[0], y1: 80, y2: p[1] - 24, class: 's-rule' }, svg);
    });

    const quad = (t) => [(1 - t) ** 2 * P0[0] + 2 * (1 - t) * t * cBot[0] + t * t * P1[0], (1 - t) ** 2 * P0[1] + 2 * (1 - t) * t * cBot[1] + t * t * P1[1]];
    const dots = [];
    for (let i = 0; i < ex.n_back; i++) {
      const [x, y] = quad(0.2 + (0.6 * i) / (ex.n_back - 1));
      const c = s('circle', { cx: x, cy: y, r: 9, class: 'pop f-card s-neutral', 'stroke-width': 2 }, svg);
      c.style.transform = 'scale(0)';
      dots.push(c);
    }
    const big = txt(svg, W / 2, 186, `${ex.neg_back} of ${ex.n_back}`, 't-hot t-display', { 'text-anchor': 'middle', 'font-size': 34, 'font-weight': 600, opacity: 0 });
    const small1 = txt(svg, W / 2, 206, 'were hostile', 't-strong', { 'text-anchor': 'middle', opacity: 0 });
    const small2 = s('g', {}, svg);
    [attackLbl, backLbl].forEach((t) => t.setAttribute('opacity', 0));

    const len = attack.getTotalLength();
    attack.style.strokeDasharray = len; attack.style.strokeDashoffset = len;

    function final() {
      attack.style.strokeDashoffset = 0;
      [attackLbl, backLbl, big, small1, small2].forEach((t) => t.setAttribute('opacity', 1));
      dots.forEach((d, i) => { d.style.transform = 'scale(1)'; if (i < ex.neg_back) d.setAttribute('class', 'pop f-hot'); });
    }
    function play() {
      if (reduce) { final(); return; }
      tween(1100, (p) => { attack.style.strokeDashoffset = len * (1 - p); }, () => attackLbl.setAttribute('opacity', 1));
      setTimeout(() => backLbl.setAttribute('opacity', 1), 1200);
      dots.forEach((d, i) => setTimeout(() => { d.style.transform = 'scale(1)'; }, 1400 + i * 230));
      const t2 = 1400 + ex.n_back * 230 + 300;
      dots.forEach((d, i) => { if (i < ex.neg_back) setTimeout(() => d.setAttribute('class', 'pop f-hot'), t2 + i * 180); });
      setTimeout(() => [big, small1, small2].forEach((t) => t.setAttribute('opacity', 1)), t2 + ex.neg_back * 180 + 200);
    }
    return { play, final };
  });

  // ---------- chapter 1: observed vs chance, with/without hubs ----------
  let ch1Set = 'all';
  const ch1 = mount('bars', (el, W) => {
    const H = 370, l = 8, r = 8, t = 40, b = 96;
    const svg = svgIn(el, W, H);
    const n = D.bins_all.length, gw = (W - l - r) / n;
    const bw = Math.min(62, gw * 0.3), ymax = 0.8, ph = H - t - b, base = t + ph;
    const names = W < 560 ? [['little', 'contact'], ['some', 'contact'], ['a lot of', 'contact']] : [['A little contact'], ['Some contact'], ['A lot of contact']];
    s('line', { x1: l, x2: W - r, y1: base, y2: base, class: 's-rule' }, svg);
    const groups = [];
    for (let i = 0; i < n; i++) {
      const cx = l + gw * (i + 0.5);
      const ro = s('rect', { x: cx - bw - 4, width: bw, y: base, height: 0, rx: 3, class: 'f-hot' }, svg);
      const re = s('rect', { x: cx + 4, width: bw, y: base, height: 0, rx: 3, class: 'f-neutral' }, svg);
      const to = txt(svg, cx - bw / 2 - 4, base, '', 't-hot', { 'text-anchor': 'middle', 'font-size': 14 });
      const te = txt(svg, cx + bw / 2 + 4, base, '', 't-muted', { 'text-anchor': 'middle', 'font-size': 13 });
      const nm = txt(svg, cx, base + 24, '', 't-strong', { 'text-anchor': 'middle' });
      (names[i] || ['']).forEach((line, k) => { const ts = s('tspan', { x: cx, dy: k ? 15 : 0 }, nm); ts.textContent = line; });
      const verdict = txt(svg, cx, base + (names[i] && names[i].length > 1 ? 66 : 50), '', '', { 'text-anchor': 'middle', 'font-size': 11.5 });
      groups.push({ ro, re, to, te, verdict });
    }
    const shown = D.bins_all.map(() => ({ o: 0, e: 0 }));
    function draw(vals, verdictToo) {
      vals.forEach((v, i) => {
        const g = groups[i];
        const ho = (v.o / ymax) * ph, he = (v.e / ymax) * ph;
        g.ro.setAttribute('y', base - ho); g.ro.setAttribute('height', ho);
        g.re.setAttribute('y', base - he); g.re.setAttribute('height', he);
        g.to.setAttribute('y', base - ho - 8); g.to.textContent = v.o > 0.005 ? fmt.pct0(v.o) : '';
        g.te.setAttribute('y', base - he - 8); g.te.textContent = v.e > 0.005 ? fmt.pct0(v.e) : '';
      });
      if (verdictToo) {
        const bins = ch1Set === 'all' ? D.bins_all : D.bins_clean;
        bins.forEach((bn, i) => {
          const clear = bn.z >= 1.96;
          groups[i].verdict.textContent = clear ? 'above chance' : 'not different from chance';
          groups[i].verdict.setAttribute('class', clear ? 't-hot' : 't-muted');
        });
      }
    }
    function target() { return (ch1Set === 'all' ? D.bins_all : D.bins_clean).map((bn) => ({ o: bn.observed, e: bn.expected })); }
    function animateTo(to, dur) {
      const from = shown.map((x) => ({ ...x }));
      tween(dur, (p) => {
        to.forEach((v, i) => { shown[i].o = from[i].o + (v.o - from[i].o) * p; shown[i].e = from[i].e + (v.e - from[i].e) * p; });
        draw(shown, false);
      }, () => draw(shown, true));
    }
    return {
      play: () => animateTo(target(), 1100),
      final: () => { target().forEach((v, i) => { shown[i] = { ...v }; }); draw(shown, true); },
      update: () => animateTo(target(), 700),
    };
  });
  document.querySelectorAll('#ch1-fig .toggle button').forEach((btn) => {
    btn.addEventListener('click', () => {
      ch1Set = btn.dataset.set;
      document.querySelectorAll('#ch1-fig .toggle button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
      if (ch1 && ch1.inst) { ch1.played = true; ch1.inst.update(); }
    });
  });

  // ---------- chapter 2: scrollytelling lines ----------
  let ch2Step = 0;
  const ch2 = mount('lines', (el, W) => {
    const narrow = W < 600;
    const H = narrow ? 340 : 420, l = 44, r = 112, t = 20, b = 56;
    const svg = svgIn(el, W, H);
    const k = D.prox_lines.distant.length, ymax = 0.85;
    const xs = Array.from({ length: k }, (_, i) => l + (i * (W - l - r)) / (k - 1));
    const y = (v) => t + (1 - v / ymax) * (H - t - b);
    [0, 0.25, 0.5, 0.75].forEach((g) => {
      s('line', { x1: l, x2: W - r + 20, y1: y(g), y2: y(g), class: 's-rule', 'stroke-dasharray': g ? '2 4' : '' }, svg);
      txt(svg, l - 8, y(g) + 4, fmt.pct0(g), 't-muted', { 'text-anchor': 'end', 'font-size': 11 });
    });
    const xl = [['little', 'contact'], ['some', 'contact'], ['frequent', 'contact'], ['constant', 'contact']];
    xs.forEach((x, i) => {
      const tt = txt(svg, x, H - b + 22, '', 't-muted', { 'text-anchor': 'middle', 'font-size': 11.5 });
      xl[i].forEach((line, j) => { const ts = s('tspan', { x, dy: j ? 14 : 0 }, tt); ts.textContent = line; });
    });

    const series = [['close', 's-calm', 'f-calm', 't-calm'], ['average', 's-neutral', 'f-neutral', 't-muted'], ['distant', 's-hot', 'f-hot', 't-hot']];
    const lines = series.map(([key, sc, fc, tc]) => {
      const vals = D.prox_lines[key].map((d) => d.rate);
      const pts = vals.map((v, i) => [xs[i], y(v)]);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const total = last(cum);
      const pl = s('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', class: sc + ' draw', 'stroke-width': 3.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
      pl.style.strokeDasharray = total; pl.style.strokeDashoffset = total;
      const dots = pts.map((p) => { const c = s('circle', { cx: p[0], cy: p[1], r: 5.5, class: fc + ' pop' }, svg); c.style.opacity = 0; return c; });
      const lbl = txt(svg, last(pts)[0] + 12, last(pts)[1] + 4, `${fmt.pct0(last(vals))} ${key}`, tc, { 'font-size': 13, opacity: 0 });
      lbl.style.transition = 'opacity .5s';
      return { pl, dots, cum, total, lbl, pts };
    });
    const first = Math.min(...series.map(([key]) => D.prox_lines[key][0].rate));
    const ann1 = txt(svg, xs[0] + 4, Math.min(y(first) + 24, y(0) - 6), `all three near ${fmt.pct0(D.prox_lines.average[0].rate)}`, 't-strong halo', { 'font-size': 12, opacity: 0 });
    ann1.style.transition = 'opacity .5s';
    const dEnd = last(lines[2].pts), cEnd = last(lines[0].pts);
    const bx = dEnd[0] - 18;
    const ann3 = s('g', { opacity: 0 }, svg);
    ann3.style.transition = 'opacity .6s';
    s('line', { x1: bx, x2: bx, y1: dEnd[1] + 8, y2: cEnd[1] - 8, class: 's-ink', 'stroke-width': 1.2 }, ann3);
    s('line', { x1: bx - 4, x2: bx + 4, y1: dEnd[1] + 8, y2: dEnd[1] + 8, class: 's-ink' }, ann3);
    s('line', { x1: bx - 4, x2: bx + 4, y1: cEnd[1] - 8, y2: cEnd[1] - 8, class: 's-ink' }, ann3);
    const gap = Math.round((D.derived.dist_end - D.derived.close_end) * 100);
    txt(ann3, bx - 8, (dEnd[1] + cEnd[1]) / 2 + 4, `${gap} points apart`, 't-strong halo', { 'text-anchor': 'end', 'font-size': 12.5 });

    function setStep(st) {
      const idx = st - 1;
      lines.forEach((ln) => {
        const shownLen = idx <= 0 ? 0 : ln.cum[Math.min(idx, ln.cum.length - 1)];
        ln.pl.style.strokeDashoffset = ln.total - shownLen;
        ln.dots.forEach((d, i) => { d.style.opacity = i <= idx ? 1 : 0; });
        ln.lbl.setAttribute('opacity', st >= 3 ? 1 : 0);
      });
      ann1.setAttribute('opacity', st >= 1 ? 1 : 0);
      ann3.setAttribute('opacity', st >= 3 ? 1 : 0);
    }
    setStep(ch2Step);
    return { setStep, final: () => setStep(ch2Step) };
  });
  (function steps() {
    const els = document.querySelectorAll('.step');
    function activate(st) {
      ch2Step = st;
      els.forEach((e) => e.classList.toggle('active', Number(e.dataset.step) === st));
      if (ch2 && ch2.inst) ch2.inst.setStep(st);
    }
    if (!('IntersectionObserver' in window) || reduce) {
      if (!('IntersectionObserver' in window)) { activate(3); return; }
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) activate(Number(e.target.dataset.step)); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    els.forEach((e) => io.observe(e));
  })();

  // ---------- chapter 2b: permutation test ----------
  (function permSentence() {
    const P = D.permutation, kk = Math.round(P.p * (P.n_draws + 1)) - 1;
    const el = document.getElementById('perm-sentence');
    const lead = kk <= 0
      ? `None of the ${fmt.int(P.n_draws)} shuffles gave an effect as strong as the real one.`
      : `Only ${kk} of the ${fmt.int(P.n_draws)} shuffles gave an effect as strong as the real one.`;
    el.textContent = `${lead} The result is also the same with and without hubs, so this is the finding we trust the most.`;
  })();
  mount('perm', (el, W) => {
    const H = 240, l = 16, r = 16, t = 56, b = 40;
    const svg = svgIn(el, W, H);
    const P = D.permutation, nul = P.null, obs = P.observed;
    const lo = Math.min(...nul), hi = Math.max(...nul);
    const xmin = Math.min(obs, lo) - 0.12, xmax = hi + 0.12;
    const x = (v) => l + ((v - xmin) / (xmax - xmin)) * (W - l - r);
    const nb = 42, width = (hi - lo) / nb, counts = new Array(nb).fill(0);
    nul.forEach((v) => { counts[Math.min(nb - 1, Math.floor((v - lo) / width))]++; });
    const cmax = Math.max(...counts), base = H - b, ph = base - t;
    const ticks = [];
    for (let v = Math.ceil(xmin * 5) / 5; v <= xmax; v += 0.2) ticks.push(Math.round(v * 10) / 10);
    ticks.forEach((v) => {
      s('line', { x1: x(v), x2: x(v), y1: base, y2: base + 5, class: 's-rule' }, svg);
      txt(svg, x(v), base + 20, v === 0 ? '0' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(1), 't-muted', { 'text-anchor': 'middle', 'font-size': 11 });
    });
    s('line', { x1: x(0), x2: x(0), y1: t - 6, y2: base, class: 's-rule', 'stroke-dasharray': '3 4' }, svg);
    const bars = counts.map((c, i) => s('rect', { x: x(lo + i * width) + 0.5, width: Math.max(1, x(lo + (i + 1) * width) - x(lo + i * width) - 1), y: base, height: 0, class: 'f-neutral' }, svg));
    s('line', { x1: l, x2: W - r, y1: base, y2: base, class: 's-rule' }, svg);
    const mean = nul.reduce((a, v) => a + v, 0) / nul.length;
    txt(svg, x(mean), t - 18, `${fmt.int(P.n_draws)} shuffles`, 't-muted', { 'text-anchor': 'middle', 'font-size': 11.5 });
    const obsG = s('g', { opacity: 0 }, svg);
    obsG.style.transition = 'opacity .6s';
    s('line', { x1: x(obs), x2: x(obs), y1: t - 26, y2: base, class: 's-hot', 'stroke-width': 3 }, obsG);
    s('circle', { cx: x(obs), cy: base, r: 6, class: 'f-hot' }, obsG);
    txt(obsG, x(obs) + 8, t - 16, `real data: ${fmt.coef(obs)}`, 't-hot', { 'font-size': 13 });
    function draw(p) {
      counts.forEach((c, i) => {
        const local = Math.max(0, Math.min(1, p * 1.6 - (i / nb) * 0.6));
        const h = (c / cmax) * ph * ease(local);
        bars[i].setAttribute('y', base - h); bars[i].setAttribute('height', h);
      });
    }
    return {
      play: () => tween(1300, draw, () => obsG.setAttribute('opacity', 1)),
      final: () => { draw(1); obsG.setAttribute('opacity', 1); },
    };
  });

  // ---------- chapter 3: triangles ----------
  onView(document.getElementById('tri-fig'), () => {
    document.querySelectorAll('[data-count]').forEach((el) => {
      const v = get(el.dataset.count);
      tween(1600, (p) => { el.textContent = fmt.int(v * p); });
    });
  });
  mount('tri-strip', (el, W) => {
    const H = 136, l = 14, r = 14, t = 42, b = 34;
    const svg = svgIn(el, W, H);
    const T = D.triangles, xmax = T.observed * 1.07;
    const x = (v) => l + (v / xmax) * (W - l - r);
    const base = H - b;
    s('line', { x1: l, x2: W - r, y1: base, y2: base, class: 's-rule' }, svg);
    [0, 2500, 5000, 7500, 10000].filter((v) => v <= xmax).forEach((v) => {
      s('line', { x1: x(v), x2: x(v), y1: base, y2: base + 5, class: 's-rule' }, svg);
      txt(svg, x(v), base + 20, fmt.int(v), 't-muted', { 'text-anchor': 'middle', 'font-size': 11 });
    });
    const rand = rng(11);
    const dotsG = s('g', { opacity: 0 }, svg);
    T.null.forEach((v) => s('circle', { cx: x(v), cy: t + 8 + rand() * (base - t - 16), r: 2.4, class: 'f-neutral', opacity: 0.6 }, dotsG));
    txt(svg, x(T.null_mean), t - 14, `random networks (about ${fmt.int(T.null_mean)})`, 't-muted', { 'text-anchor': 'middle', 'font-size': 11.5 });
    const mk = s('g', { opacity: 0 }, svg);
    const ring = s('circle', { cx: x(T.null_mean), cy: (t + base) / 2, r: 9, class: 'f-hot' }, mk);
    const lbl = txt(svg, x(T.observed), t - 14, `real network: ${fmt.int(T.observed)}`, 't-hot', { 'text-anchor': 'end', 'font-size': 12.5, opacity: 0 });
    function final() { dotsG.setAttribute('opacity', 1); mk.setAttribute('opacity', 1); ring.setAttribute('cx', x(T.observed)); lbl.setAttribute('opacity', 1); }
    function play() {
      if (reduce) { final(); return; }
      tween(600, (p) => dotsG.setAttribute('opacity', p));
      setTimeout(() => {
        mk.setAttribute('opacity', 1);
        tween(1300, (p) => ring.setAttribute('cx', x(T.null_mean + (T.observed - T.null_mean) * p)), () => lbl.setAttribute('opacity', 1));
      }, 650);
    }
    return { play, final };
  });

  mount('net-examples', (el, W) => {
    const H = 360;
    const svg = svgIn(el, W, H);
    const [i1, i2] = D.examples_net.isolated, tri = D.examples_net.triangle;
    txt(svg, W / 2, 18, 'a pair that is alone', 't-muted', { 'text-anchor': 'middle', 'font-size': 11.5 });
    const p1 = [W * 0.25, 62], p2 = [W * 0.75, 62];
    const e1 = s('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], class: 's-neutral', 'stroke-width': 3 }, svg);
    txt(svg, W / 2, 178, 'a triangle', 't-hot', { 'text-anchor': 'middle', 'font-size': 11.5 });
    const q = [[W / 2, 216], [W * 0.22, 306], [W * 0.78, 306]];
    const triEdges = [[0, 1], [1, 2], [2, 0]].map(([a, b2]) => s('line', { x1: q[a][0], y1: q[a][1], x2: q[b2][0], y2: q[b2][1], class: 's-hot', 'stroke-width': 3 }, svg));
    [[p1, i1, 30], [p2, i2, 30], [q[0], tri[0], -20], [q[1], tri[1], 30], [q[2], tri[2], 30]].forEach(([p, name, dy]) => {
      s('circle', { cx: p[0], cy: p[1], r: 11, class: 'f-ink' }, svg);
      txt(svg, p[0], p[1] + dy, 'r/' + name, 't-strong', { 'text-anchor': 'middle', 'font-size': 11 });
    });
    const all = [e1, ...triEdges];
    all.forEach((e) => { const len = Math.hypot(e.x2.baseVal.value - e.x1.baseVal.value, e.y2.baseVal.value - e.y1.baseVal.value); e.style.strokeDasharray = len; e.style.strokeDashoffset = len; e._len = len; });
    return {
      play: () => all.forEach((e, i) => tween(700, (p) => { e.style.strokeDashoffset = e._len * (1 - p); }, null, i * 260)),
      final: () => all.forEach((e) => { e.style.strokeDashoffset = 0; }),
    };
  });

  mount('clique-prox', (el, W) => {
    const H = 250, C = D.clique_prox, vmax = 0.7, bw = W - 64;
    const svg = svgIn(el, W, H);
    const rows = [['Pairs that are alone', C.isolated, 'f-calm', 't-calm', 40], ['Pairs inside a triangle', C.clique, 'f-hot', 't-hot', 120]];
    const bars = rows.map(([label, v, fc, tc, yy]) => {
      txt(svg, 0, yy, label, 't-strong', { 'font-size': 12.5 });
      s('rect', { x: 0, y: yy + 10, width: bw, height: 30, rx: 4, class: 'f-neutral', opacity: 0.18 }, svg);
      const rc = s('rect', { x: 0, y: yy + 10, width: 0, height: 30, rx: 4, class: fc }, svg);
      const vt = txt(svg, 8, yy + 30, '', tc, { 'font-size': 14 });
      return { rc, vt, v };
    });
    const note = txt(svg, 0, 212, '', 't-muted', { 'font-size': 11 });
    [['Closeness goes from 0 to 1.'], [`Without hubs: ${fmt.d2(C.isolated_clean)} and ${fmt.d2(C.clique_clean)}.`]].forEach(([line], j) => {
      const ts = s('tspan', { x: 0, dy: j ? 15 : 0 }, note); ts.textContent = line;
    });
    function draw(p) {
      bars.forEach(({ rc, vt, v }) => {
        const w = (v / vmax) * bw * p;
        rc.setAttribute('width', w);
        vt.setAttribute('x', w + 8);
        vt.textContent = fmt.d2(v * p);
      });
    }
    draw(0);
    return { play: () => tween(1200, draw), final: () => draw(1) };
  });

  // ---------- chapter 4: time ----------
  mount('timeline-fig', (el, W) => {
    const H = 190, x0 = 18, x1 = W - 18, y = 104, L = D.lag_example;
    const svg = svgIn(el, W, H);
    s('line', { x1: x0, x2: x1, y1: y, y2: y, class: 's-rule', 'stroke-width': 2 }, svg);
    const t1 = new Date(L.t1), t2 = new Date(L.t2);
    const xd = (d) => x0 + ((d - t1) / (t2 - t1)) * (x1 - x0);
    const d = new Date(t1.getFullYear(), t1.getMonth() + 1, 1);
    while (d < t2) {
      const xx = xd(d);
      s('line', { x1: xx, x2: xx, y1: y - 5, y2: y + 5, class: 's-rule' }, svg);
      if (W > 560) txt(svg, xx, y + 22, MONTHS[d.getMonth()], 't-muted', { 'text-anchor': 'middle', 'font-size': 10.5 });
      d.setMonth(d.getMonth() + 1);
    }
    const prog = s('line', { x1: x0, x2: x0, y1: y, y2: y, class: 's-hot', 'stroke-width': 3 }, svg);
    s('circle', { cx: x0, cy: y, r: 8, class: 'f-hot' }, svg);
    const lA = txt(svg, x0, 28, '', 't-strong', { 'font-size': 13 });
    [[`r/${L.first} attacks r/${L.second}`], [niceDate(L.t1)]].forEach(([line], j) => { const ts = s('tspan', { x: x0, dy: j ? 17 : 0, class: j ? 't-muted' : '' }, lA); ts.textContent = line; });
    const endDot = s('circle', { cx: x1, cy: y, r: 8, class: 'f-hot pop' }, svg);
    endDot.style.transform = 'scale(0)';
    const lB = txt(svg, x1, y + 48, '', 't-strong', { 'font-size': 13, 'text-anchor': 'end', opacity: 0 });
    [[`r/${L.second} answers`], [niceDate(L.t2)]].forEach(([line], j) => { const ts = s('tspan', { x: x1, dy: j ? 17 : 0, class: j ? 't-muted' : '' }, lB); ts.textContent = line; });
    const runner = s('circle', { cx: x0, cy: y, r: 5, class: 'f-hot' }, svg);
    const counter = txt(svg, W / 2, y - 22, '0 days', 't-display t-strong', { 'text-anchor': 'middle', 'font-size': 20, 'font-weight': 600 });
    function at(p) {
      const xx = x0 + (x1 - x0) * p;
      prog.setAttribute('x2', xx); runner.setAttribute('cx', xx);
      counter.textContent = `${Math.round(L.days * p)} days`;
    }
    function final() { at(1); endDot.style.transform = 'scale(1)'; lB.setAttribute('opacity', 1); }
    return { play: () => tween(2600, at, () => { endDot.style.transform = 'scale(1)'; lB.setAttribute('opacity', 1); }), final };
  });

  mount('lags', (el, W) => {
    const H = 330, l = 6, r = 6, t = 62, b = 54;
    const svg = svgIn(el, W, H);
    const B = D.lags.buckets, n = B.length, gw = (W - l - r) / n, bw = gw * 0.7;
    const max = Math.max(...B.map((x) => x.n)), base = H - b, ph = base - t;
    s('line', { x1: l, x2: W - r, y1: base, y2: base, class: 's-rule' }, svg);
    let cum = 0, medIdx = 0;
    B.forEach((bk, i) => { cum += bk.n; if (cum - bk.n < D.lags.n / 2 && cum >= D.lags.n / 2) medIdx = i; });
    const rects = B.map((bk, i) => {
      const cx = l + gw * (i + 0.5);
      const rc = s('rect', { x: cx - bw / 2, width: bw, y: base, height: 0, rx: 3, class: i < 2 ? 'f-hot' : 'f-neutral' }, svg);
      const ct = txt(svg, cx, base, '', i < 2 ? 't-hot' : 't-strong', { 'text-anchor': 'middle', 'font-size': 12 });
      const parts = bk.label.split(' '), unit = parts.pop();
      const lt = txt(svg, cx, base + 20, '', 't-muted', { 'text-anchor': 'middle', 'font-size': 11 });
      [parts.join(' '), unit].forEach((line, j) => { const ts = s('tspan', { x: cx, dy: j ? 14 : 0 }, lt); ts.textContent = line; });
      return { rc, ct, v: bk.n, cx };
    });
    const hFirst = Math.max(B[0].n, B[1].n) / max * ph;
    const yb = base - hFirst - 34;
    const brk = s('g', { opacity: 0 }, svg);
    brk.style.transition = 'opacity .6s';
    const bx0 = rects[0].cx - bw / 2, bx1 = rects[1].cx + bw / 2;
    s('path', { d: `M${bx0},${yb + 6} V${yb} H${bx1} V${yb + 6}`, fill: 'none', class: 's-hot', 'stroke-width': 1.5 }, brk);
    txt(brk, bx0, yb - 8, `within a month: ${fmt.pct0(D.lags.within30)}`, 't-hot', { 'font-size': 12 });
    const med = rects[medIdx];
    const yMed = base - (med.v / max) * ph - 30;
    const medG = s('g', { opacity: 0 }, svg);
    medG.style.transition = 'opacity .6s';
    txt(medG, med.cx, yMed - 12, `median: ${fmt.int(D.lags.median)} days`, 't-strong', { 'text-anchor': 'middle', 'font-size': 12 });
    s('line', { x1: med.cx, x2: med.cx, y1: yMed - 6, y2: yMed + 6, class: 's-ink' }, medG);
    function draw(p) {
      rects.forEach(({ rc, ct, v }, i) => {
        const local = Math.max(0, Math.min(1, p * 1.5 - i * 0.07));
        const h = (v / max) * ph * ease(local);
        rc.setAttribute('y', base - h); rc.setAttribute('height', h);
        ct.setAttribute('y', base - h - 8); ct.textContent = local > 0.05 ? fmt.int(v * ease(local)) : '';
      });
    }
    return {
      play: () => tween(1300, draw, () => { brk.setAttribute('opacity', 1); medG.setAttribute('opacity', 1); }),
      final: () => { draw(1); brk.setAttribute('opacity', 1); medG.setAttribute('opacity', 1); },
    };
  });

  mount('esc-fig', (el, W) => {
    const H = 250, E2 = D.escalation, t = 30, b = 54, ymax = 0.5;
    const svg = svgIn(el, W, H);
    const y = (v) => t + (1 - v / ymax) * (H - t - b);
    const xa = W * 0.22, xb = W * 0.78;
    [0, 0.25, 0.5].forEach((g) => {
      s('line', { x1: 30, x2: W - 10, y1: y(g), y2: y(g), class: 's-rule', 'stroke-dasharray': g ? '2 4' : '' }, svg);
      txt(svg, 24, y(g) + 4, fmt.pct0(g), 't-muted', { 'text-anchor': 'end', 'font-size': 11 });
    });
    const ln = s('line', { x1: xa, y1: y(E2.first), x2: xa, y2: y(E2.first), class: 's-ink', 'stroke-width': 3 }, svg);
    s('circle', { cx: xa, cy: y(E2.first), r: 7, class: 'f-ink' }, svg);
    const cb = s('circle', { cx: xb, cy: y(E2.second), r: 7, class: 'f-ink pop' }, svg);
    cb.style.transform = 'scale(0)';
    txt(svg, xa, y(E2.first) - 16, fmt.pct1(E2.first), 't-strong', { 'text-anchor': 'middle', 'font-size': 14 });
    const tb = txt(svg, xb, y(E2.second) - 16, fmt.pct1(E2.second), 't-strong', { 'text-anchor': 'middle', 'font-size': 14, opacity: 0 });
    txt(svg, xa, H - b + 24, 'first half', 't-muted', { 'text-anchor': 'middle' });
    txt(svg, xb, H - b + 24, 'second half', 't-muted', { 'text-anchor': 'middle' });
    txt(svg, W / 2, H - 6, `${fmt.int(E2.n)} pairs, p = ${fmt.p(E2.p)}`, 't-muted', { 'text-anchor': 'middle', 'font-size': 11 });
    function at(p) { ln.setAttribute('x2', xa + (xb - xa) * p); ln.setAttribute('y2', y(E2.first + (E2.second - E2.first) * p)); }
    function final() { at(1); cb.style.transform = 'scale(1)'; tb.setAttribute('opacity', 1); }
    return { play: () => tween(1100, at, final), final };
  });
})();
