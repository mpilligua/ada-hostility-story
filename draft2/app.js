(function () {
  const D = window.DATA;
  if (!D) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NS = 'http://www.w3.org/2000/svg';
  const last = (a) => a[a.length - 1];

  const PE = D.pair_example, sum = (a) => a.reduce((x, y) => x + y, 0);
    D.derived = {
    tri_ratio: D.triangles.observed / D.triangles.null_mean,
    tri_ratio_clean: D.triangles.clean_observed / D.triangles.clean_null_mean,
    dist_end: last(D.prox_lines.distant).rate,
    close_end: last(D.prox_lines.close).rate,
    pair_total: PE.seq_ab.length + PE.seq_ba.length,
    pair_share_a: sum(PE.seq_ab) / PE.seq_ab.length,
    pair_share_b: sum(PE.seq_ba) / PE.seq_ba.length,
    pair_ratio_a: sum(PE.seq_ab) / PE.seq_ab.length / PE.base_a,
    in_tri_share: D.nested.in_tri / D.nested.pairs,
    in_tri_null_share: D.nested.in_tri_null / D.nested.pairs,
    persist_conf: D.persistence.table.conflict.conflict / (D.persistence.table.conflict.conflict + D.persistence.table.conflict['no conflict']),
    persist_calm_to_conf: D.persistence.table['no conflict'].conflict / (D.persistence.table['no conflict'].conflict + D.persistence.table['no conflict']['no conflict']),
    persist_conf_n: D.persistence.table.conflict.conflict + D.persistence.table.conflict['no conflict'],
    persist_conf_k: D.persistence.table.conflict.conflict,
    persist_calm_n: D.persistence.table['no conflict'].conflict + D.persistence.table['no conflict']['no conflict'],
    persist_calm_k: D.persistence.table['no conflict'].conflict,
    pmm_ratio: D.balance.nulls.shuffle.mean[1] / D.balance.observed[1],
    pmm_z_strict: (D.balance.observed[1] - D.balance.nulls.C10.mean[1]) / D.balance.nulls.C10.sd[1],
    mmm_ratio: D.balance.observed[3] / D.balance.nulls.shuffle.mean[3],
    attack_conf: D.words.labels_conflict.attack, attack_calm: D.words.labels_calm.attack,
    auc_all: D.forecast.rows.find((r) => r.name === 'Everything').auc,
    auc_node: D.forecast.rows.find((r) => r.name === 'Sender and target').auc,
    auc_tri: D.forecast.rows.find((r) => r.name === 'Triads').auc,
    topic_top: D.topics.rows[0].n, topic_second: D.topics.rows[1].n,
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

  // ---------- reveal, progress, chapter dots ----------
  const reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    reveals.forEach((r) => io.observe(r));
  } else {
    reveals.forEach((r) => r.classList.add('in'));
  }

  const bar = document.querySelector('.progress-bar');
  const nav = document.querySelector('.chapters');
  function onScroll() {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? window.scrollY / h : 0})`;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  if (nav && 'IntersectionObserver' in window) {
    const links = [...nav.querySelectorAll('a')];
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    links.forEach((a) => { const t = document.querySelector(a.getAttribute('href')); if (t) io.observe(t); });
  }

  // ---------- hero: the real feud network ----------
  (function hero() {
    const cv = document.getElementById('net');
    const ctx = cv.getContext('2d');
    const N = D.hero.nodes, E = D.hero.edges;
    const rand = rng(7);
    const phase = N.map(() => ({ a: rand() * 6.283, b: rand() * 6.283, r: 3 + rand() * 7 }));
    const hot = E.filter((e) => e[2] === 1);
    const pulses = [];
    let W = 0, H = 0, pts = [], mouse = null, running = true, raf = 0;

    function layout() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = cv.clientWidth; H = cv.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const wide = W > 860;
      const x0 = wide ? W * 0.38 : W * 0.04, x1 = W * 0.97;
      const y0 = H * (wide ? 0.1 : 0.06), y1 = H * (wide ? 0.9 : 0.94);
      pts = N.map((n) => ({ x: x0 + n.x * (x1 - x0), y: y0 + n.y * (y1 - y0), d: n.d, id: n.id }));
    }
    function position(i, t) {
      const p = pts[i], ph = phase[i];
      if (reduce) return [p.x, p.y];
      return [p.x + Math.cos(t * 0.00035 + ph.a) * ph.r, p.y + Math.sin(t * 0.00042 + ph.b) * ph.r];
    }
    function frame(t) {
      ctx.clearRect(0, 0, W, H);
      const P = pts.map((_, i) => position(i, t || 0));
      ctx.lineWidth = 0.7;
      ctx.strokeStyle = 'rgba(138,152,178,0.16)';
      ctx.beginPath();
      for (const [a, b, h] of E) { if (h) continue; ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,84,40,0.22)';
      ctx.beginPath();
      for (const [a, b, h] of E) { if (!h) continue; ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); }
      ctx.stroke();

      for (let i = 0; i < P.length; i++) {
        const r = 1.3 + Math.sqrt(pts[i].d) * 0.42;
        ctx.fillStyle = 'rgba(228,233,242,0.85)';
        ctx.beginPath(); ctx.arc(P[i][0], P[i][1], r, 0, 6.283); ctx.fill();
      }

      if (!reduce) {
        if (Math.random() < 0.3 && pulses.length < 46 && hot.length) {
          const e = hot[Math.floor(Math.random() * hot.length)];
          pulses.push({ e, t: 0, dir: Math.random() < 0.5, sp: 0.006 + Math.random() * 0.01 });
        }
        for (let k = pulses.length - 1; k >= 0; k--) {
          const p = pulses[k];
          p.t += p.sp;
          if (p.t >= 1) { pulses.splice(k, 1); continue; }
          const A = P[p.dir ? p.e[0] : p.e[1]], B = P[p.dir ? p.e[1] : p.e[0]];
          const x = A[0] + (B[0] - A[0]) * p.t, y = A[1] + (B[1] - A[1]) * p.t;
          const g = ctx.createRadialGradient(x, y, 0, x, y, 7);
          g.addColorStop(0, 'rgba(255,140,90,1)'); g.addColorStop(0.35, 'rgba(255,84,40,0.7)'); g.addColorStop(1, 'rgba(255,84,40,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 7, 0, 6.283); ctx.fill();
        }
      }

      if (mouse) {
        let best = -1, bd = 900;
        P.forEach((q, i) => { const dd = (q[0] - mouse[0]) ** 2 + (q[1] - mouse[1]) ** 2; if (dd < bd) { bd = dd; best = i; } });
        if (best >= 0) {
          const q = P[best];
          ctx.strokeStyle = 'rgba(255,122,85,0.85)'; ctx.lineWidth = 1.2;
          ctx.beginPath();
          let enemies = 0;
          for (const [a, b] of E) if (a === best || b === best) { enemies++; ctx.moveTo(P[a][0], P[a][1]); ctx.lineTo(P[b][0], P[b][1]); }
          ctx.stroke();
          ctx.fillStyle = '#ff7a55'; ctx.beginPath(); ctx.arc(q[0], q[1], 4.5, 0, 6.283); ctx.fill();
          const label = 'r/' + pts[best].id;
          ctx.font = '600 14px "IBM Plex Sans", sans-serif';
          const w = ctx.measureText(label).width;
          const lx = Math.min(q[0] + 12, W - w - 16), ly = q[1] - 14;
          ctx.fillStyle = 'rgba(12,16,24,0.85)'; ctx.fillRect(lx - 6, ly - 15, w + 12, 36);
          ctx.fillStyle = '#ffffff'; ctx.fillText(label, lx, ly);
          ctx.font = '400 11px "IBM Plex Sans", sans-serif'; ctx.fillStyle = '#8a93a6';
          ctx.fillText(pts[best].d + ' hostile pairs in total', lx, ly + 15);
        }
      }
      if (!reduce && running) raf = requestAnimationFrame(frame);
    }
    layout();
    frame(0);
    window.addEventListener('resize', () => { layout(); if (reduce) frame(0); });
    cv.addEventListener('mousemove', (e) => { const r = cv.getBoundingClientRect(); mouse = [e.clientX - r.left, e.clientY - r.top]; if (reduce) frame(0); });
    cv.addEventListener('mouseleave', () => { mouse = null; if (reduce) frame(0); });
    if ('IntersectionObserver' in window && !reduce) {
      new IntersectionObserver((entries) => {
        const vis = entries[0].isIntersecting;
        if (vis && !running) { running = true; raf = requestAnimationFrame(frame); }
        if (!vis) { running = false; cancelAnimationFrame(raf); }
      }).observe(cv);
    }
  })();

  // ---------- intro: longest feuds ----------
  (function feuds() {
    const ol = document.getElementById('feuds');
    const max = Math.max(...D.top_feuds.map((f) => f.n));
    D.top_feuds.forEach((f, i) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="names"><span class="fill" style="transition-delay:${i * 70}ms"></span>r/${f.a}<i>&rarr;</i>r/${f.b}</span><span class="n">${f.n}</span>`;
      ol.appendChild(li);
    });
    onView(ol, () => {
      ol.querySelectorAll('.fill').forEach((el, i) => { el.style.width = (D.top_feuds[i].n / max) * 100 + '%'; });
    }, 0.2);
  })();

  // ---------- real posts ----------
  // Each subreddit keeps its own colour wherever its posts appear.
  const SUB_TONE = { mensrights: 1, againstmensrights: 2, shiteuropeanssay: 3, shitamericanssay: 4, todayilearned: 1, hillaryclinton: 1, the_donald: 3 };
  const tone = (name) => `var(--s${SUB_TONE[name] || 1})`;
  const el_ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function avatar(name, big) {
    const a = el_('span', big ? 'sub-av big' : 'sub-av', name.replace(/_/g, '')[0].toUpperCase());
    a.style.background = tone(name);
    a.setAttribute('aria-hidden', 'true');
    return a;
  }
  function postCard(q) {
    const card = el_('a', 'post');
    card.href = q.url; card.target = '_blank'; card.rel = 'noopener';
    card.style.setProperty('--c', tone(q.source));
    const head = el_('span', 'post-head');
    const who = el_('span', 'post-who');
    const to = el_('span', 'post-to');
    to.append(el_('span', 'post-arrow', '→ '), document.createTextNode(`r/${q.target}`));
    who.append(el_('span', 'post-from', `r/${q.source}`), to);
    const open = el_('span', 'post-open', '↗');
    open.title = 'Open on Reddit';
    head.append(avatar(q.source), who, open);
    card.setAttribute('aria-label', `r/${q.source} to r/${q.target}, ${niceDate(q.date)}: ${q.title} (opens Reddit)`);
    card.append(head, el_('span', 'post-title', q.title), el_('span', 'post-date', niceDate(q.date)));
    return card;
  }
  function slideIn(items, step) {
    items.forEach((it, i) => {
      if (reduce) { it.classList.add('in'); return; }
      it.style.transitionDelay = `${(i % 4) * (step || 120)}ms`;
      onView(it, () => it.classList.add('in'), 0.25);
    });
  }
  function postGrid(el, quotes) {
    const cards = quotes.map(postCard);
    cards.forEach((c) => el.appendChild(c));
    slideIn(cards, 140);
  }

  // r/bitcoin and r/buttcoin: the posts laid out as an exchange, in date order, one side each.
  (function exchange() {
    const el = document.getElementById('pair-quotes');
    const P = D.pair_example, A = P.a, B = P.b;
    const head = el_('div', 'ex-head');
    [[A, B, P.seq_ab], [B, A, P.seq_ba]].forEach(([me, other, seq], i) => {
      const side = el_('div', `ex-side ${i ? 'right' : 'left'}`);
      const txtBox = el_('div', 'ex-who');
      txtBox.append(el_('span', 'ex-name', `r/${me}`), el_('span', 'ex-count', `${seq.length} links to r/${other}, ${sum(seq)} negative`));
      side.append(avatar(me, true), txtBox);
      head.appendChild(side);
    });
    const body = el_('div', 'ex-body');
    const rows = [...P.quotes].sort((x, y) => x.date.localeCompare(y.date)).map((q) => {
      const row = el_('div', `ex-row ${q.source === A ? 'from-a' : 'from-b'}`);
      row.append(postCard(q), el_('span', 'ex-dot'), el_('span', 'ex-date', niceDate(q.date)));
      row.querySelector('.ex-dot').style.background = tone(q.source);
      body.appendChild(row);
      return row;
    });
    el.append(head, body);
    slideIn(rows, 0);
    onView(body, () => body.classList.add('in'), 0.1);
  })();
  postGrid(document.getElementById('tri-example'), D.triangle_example.quotes);

  // ---------- the example pair: every link in both directions, in time order ----------
  mount('hook-fig', (el, W) => {
    const P = D.pair_example, size = W < 500 ? 10 : 12, gap = 3, step = size + gap;
    const cols = Math.max(10, Math.floor(W / step));
    const rowsOf = (n) => Math.ceil(n / cols);
    const blocks = [
      { seq: P.seq_ab, label: `r/${P.a} to r/${P.b}`, usual: P.base_a },
      { seq: P.seq_ba, label: `r/${P.b} to r/${P.a}`, usual: P.base_b },
    ];
    let y = 0; const lay = [];
    blocks.forEach((bk) => { lay.push({ ...bk, y0: y + 22 }); y += 22 + rowsOf(bk.seq.length) * step + 46; });
    const H = y;
    const svg = svgIn(el, W, H);
    const cells = [];
    lay.forEach((bk) => {
      const k = bk.seq.reduce((x, v) => x + v, 0);
      txt(svg, 0, bk.y0 - 8, bk.label, 't-strong', { 'font-size': 14 });
      bk.seq.forEach((v, i) => {
        const c = s('rect', { x: (i % cols) * step, y: bk.y0 + Math.floor(i / cols) * step, width: size, height: size, rx: 2, class: 'f-neutral pop' }, svg);
        c.style.transform = 'scale(0)';
        cells.push({ c, hot: v === 1 });
      });
      const yb = bk.y0 + rowsOf(bk.seq.length) * step + 16;
      txt(svg, 0, yb, `${bk.seq.length} links, ${k} negative. If it behaved as usual: about ${Math.round(bk.seq.length * bk.usual)} negative.`, 't-muted', { 'font-size': 13 });
    });
    function final() { cells.forEach(({ c, hot }) => { c.style.transform = 'scale(1)'; if (hot) c.setAttribute('class', 'f-hot pop'); }); }
    function play() {
      if (reduce) { final(); return; }
      cells.forEach(({ c }, i) => setTimeout(() => { c.style.transform = 'scale(1)'; }, i * 8));
      const t0 = cells.length * 8 + 250;
      cells.filter((x) => x.hot).forEach(({ c }, i) => setTimeout(() => c.setAttribute('class', 'f-hot pop'), t0 + i * 90));
    }
    return { play, final };
  });

  // ---------- chapter 1: observed vs chance, with/without hubs ----------
  let ch1Set = 'all';
  const ch1 = mount('bars', (el, W) => {
    const H = 370, l = 8, r = 8, t = 40, b = 96;
    const svg = svgIn(el, W, H);
    const n = D.bins_all.length, gw = (W - l - r) / n;
    const bw = Math.min(62, gw * 0.3), ymax = 1, ph = H - t - b, base = t + ph;
    const names = W < 560 ? [['few', 'links back'], ['some', 'links back'], ['many', 'links back']] : [['Few links back'], ['Some links back'], ['Many links back']];
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
          const up = bn.z >= 1.96, down = bn.z <= -1.96;
          groups[i].verdict.textContent = up ? 'above chance' : down ? 'below chance' : 'not different from chance';
          groups[i].verdict.setAttribute('class', up ? 't-hot' : down ? 't-calm' : 't-muted');
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
    el.textContent = `${fmt.int(kk)} of the ${fmt.int(P.n_draws)} shuffles (${fmt.pct0(P.p)}) gave an effect at least as strong as the real one. With ${P.pairs} pairs, we cannot tell it apart from chance.`;
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
    const stepT = (xmax - xmin) > 3 ? 1 : 0.2;
    for (let v = Math.ceil(xmin / stepT) * stepT; v <= xmax; v += stepT) ticks.push(Math.round(v * 10) / 10);
    ticks.forEach((v) => {
      s('line', { x1: x(v), x2: x(v), y1: base, y2: base + 5, class: 's-rule' }, svg);
      txt(svg, x(v), base + 20, v === 0 ? '0' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(1), 't-muted', { 'text-anchor': 'middle', 'font-size': 11 });
    });
    s('line', { x1: x(0), x2: x(0), y1: t - 6, y2: base, class: 's-rule', 'stroke-dasharray': '3 4' }, svg);
    const bars = counts.map((c, i) => s('rect', { x: x(lo + i * width) + 0.5, width: Math.max(1, x(lo + (i + 1) * width) - x(lo + i * width) - 1), y: base, height: 0, class: 'f-neutral' }, svg));
    s('line', { x1: l, x2: W - r, y1: base, y2: base, class: 's-rule' }, svg);
    const mean = nul.reduce((a, v) => a + v, 0) / nul.length;
    const far = Math.abs(x(mean) - x(obs)) > 150;
    txt(svg, far ? x(mean) : x(mean) + 40, t - 18, `${fmt.int(P.n_draws)} shuffles`, 't-muted', { 'text-anchor': far ? 'middle' : 'start', 'font-size': 11.5 });
    const obsG = s('g', { opacity: 0 }, svg);
    obsG.style.transition = 'opacity .6s';
    s('line', { x1: x(obs), x2: x(obs), y1: t - 26, y2: base, class: 's-hot', 'stroke-width': 3 }, obsG);
    s('circle', { cx: x(obs), cy: base, r: 6, class: 'f-hot' }, obsG);
    const left = obs < mean;
    txt(obsG, x(obs) + (left ? -8 : 8), t - 16, `real data: ${fmt.coef(obs)}`, 't-hot', { 'font-size': 13, 'text-anchor': left ? 'end' : 'start' });
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
    [0, 25, 50, 75, 100].filter((v) => v <= xmax).forEach((v) => {
      s('line', { x1: x(v), x2: x(v), y1: base, y2: base + 5, class: 's-rule' }, svg);
      txt(svg, x(v), base + 20, fmt.int(v), 't-muted', { 'text-anchor': 'middle', 'font-size': 11 });
    });
    const rand = rng(11);
    const dotsG = s('g', { opacity: 0 }, svg);
    T.null.forEach((v) => s('circle', { cx: x(v), cy: t + 8 + rand() * (base - t - 16), r: 2.4, class: 'f-neutral', opacity: 0.6 }, dotsG));
    txt(svg, x(T.null_mean), t - 14, '500 random networks', 't-muted', { 'text-anchor': 'middle', 'font-size': 11.5 });
    const mk = s('g', { opacity: 0 }, svg);
    const ring = s('circle', { cx: x(T.null_mean), cy: (t + base) / 2, r: 9, class: 'f-hot' }, mk);
    const lbl = txt(svg, x(T.observed), t - 14, 'the real network', 't-hot', { 'text-anchor': 'end', 'font-size': 12.5, opacity: 0 });
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

  mount('nested-fig', (el, W) => {
    const N = D.nested, wide = W >= 560;
    const R = wide ? 150 : Math.min(130, W / 2 - 10);
    const rIn = R * Math.sqrt(N.in_tri / N.pairs), rNull = R * Math.sqrt(N.in_tri_null / N.pairs);
    const cx = wide ? R + 10 : W / 2, base = 2 * R + 14;
    const H = wide ? base + 10 : base + 100;
    const svg = svgIn(el, W, H);
    const outer = s('circle', { cx, cy: base - R, r: R, class: 'f-neutral', opacity: 0.28 }, svg);
    const inner = s('circle', { cx, cy: base - rIn, r: rIn, class: 'f-hot', opacity: 0.9 }, svg);
    const ghost = s('circle', { cx, cy: base - rNull, r: rNull, fill: 'none', class: 's-ink', 'stroke-width': 1.5, 'stroke-dasharray': '5 4', opacity: 0 }, svg);
    ghost.style.transition = 'opacity .6s';
    const pct = (n) => fmt.pct0(n / N.pairs);
    const items = [
      [base - 2 * R + 8, 't-strong', `All pairs in conflict: ${fmt.int(N.pairs)}`],
      [base - 2 * rIn + 18, 't-hot', `In at least one triangle: ${fmt.int(N.in_tri)} (${pct(N.in_tri)})`],
      [base - 2 * rNull + 4, 't-muted', `Expected with random networks: ${fmt.int(N.in_tri_null)} (${pct(N.in_tri_null)})`],
    ];
    if (items[2][0] - items[1][0] < 22) items[2][0] = items[1][0] + 22;
    const labels = s('g', { opacity: 0 }, svg);
    labels.style.transition = 'opacity .6s';
    items.forEach(([yy, cls, str], i) => {
      if (wide) {
        const x0 = cx + Math.sqrt(Math.max(0, [R, rIn, rNull][i] ** 2 - (yy - (base - [R, rIn, rNull][i])) ** 2));
        s('line', { x1: x0 + 4, x2: 2 * R + 40, y1: yy, y2: yy, class: 's-ink', 'stroke-width': 0.8 }, labels);
        txt(labels, 2 * R + 48, yy + 4, str, cls, { 'font-size': 14 });
      } else {
        txt(labels, 0, base + 30 + i * 24, str, cls, { 'font-size': 13.5 });
      }
    });
    function setR(p) { outer.setAttribute('r', R * p); outer.setAttribute('cy', base - R * p); inner.setAttribute('r', rIn * p); inner.setAttribute('cy', base - rIn * p); }
    setR(0);
    return {
      play: () => tween(1200, setR, () => { ghost.setAttribute('opacity', 1); labels.setAttribute('opacity', 1); }),
      final: () => { setR(1); ghost.setAttribute('opacity', 1); labels.setAttribute('opacity', 1); },
    };
  });

  mount('net-examples', (el, W) => {
    const title = document.createElement('p'); title.className = 'fig-title'; title.textContent = 'A pair in conflict that is alone, and a typical triangle. Arrows go from the community in conflict to its target. Both are real.';
    el.appendChild(title);
    const H = 370;
    const svg = svgIn(el, W, H);
    const defs = s('defs', {}, svg);
    [['ah-n', 's-neutral'], ['ah-h', 's-hot']].forEach(([id, cls]) => {
      const m = s('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      s('path', { d: 'M0,1 L9,5 L0,9 z', class: cls.replace('s-', 'f-') }, m);
    });
    const X = D.examples_net, T = D.triangle_example;
    const pos = {};
    pos[X.isolated[0]] = [W * 0.22, 62]; pos[X.isolated[1]] = [W * 0.78, 62];
    const q = [[W / 2, 226], [W * 0.18, 318], [W * 0.82, 318]];
    T.nodes.forEach((n, i) => { pos[n] = q[i]; });
    txt(svg, W / 2, 18, 'a pair that is alone', 't-muted', { 'text-anchor': 'middle', 'font-size': 11.5 });
    txt(svg, W / 2, 184, 'a triangle: two attackers and a shared target', 't-hot', { 'text-anchor': 'middle', 'font-size': 11.5 });
    const all = [];
    function arrow(a, b, cls, mk, bend) {
      const [x1, y1] = pos[a], [x2, y2] = pos[b];
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
      const sx = x1 + ux * 15, sy = y1 + uy * 15, ex = x2 - ux * 15, ey = y2 - uy * 15;
      const mx = (sx + ex) / 2 - uy * bend, my = (sy + ey) / 2 + ux * bend;
      const p = s('path', { d: `M${sx},${sy} Q${mx},${my} ${ex},${ey}`, fill: 'none', class: cls, 'stroke-width': 2.5, 'marker-end': `url(#${mk})` }, svg);
      all.push(p);
    }
    X.iso_dirs.forEach(([a, b]) => arrow(a, b, 's-neutral', 'ah-n', X.iso_dirs.length > 1 ? 16 : 0));
    T.dirs.forEach(([a, b]) => arrow(a, b, 's-hot', 'ah-h', 0));
    Object.entries(pos).forEach(([name, p]) => {
      s('circle', { cx: p[0], cy: p[1], r: 11, class: 'f-ink' }, svg);
      const dy = p[1] === q[0][1] ? -20 : 32;
      txt(svg, p[0], p[1] + dy, 'r/' + name, 't-strong', { 'text-anchor': 'middle', 'font-size': 11 });
    });
    all.forEach((e) => { const len = e.getTotalLength ? e.getTotalLength() : 300; e.style.strokeDasharray = len; e.style.strokeDashoffset = len; e._len = len; });
    return {
      play: () => all.forEach((e, i) => tween(700, (p) => { e.style.strokeDashoffset = e._len * (1 - p); }, null, i * 260)),
      final: () => all.forEach((e) => { e.style.strokeDashoffset = 0; e.style.strokeDasharray = 'none'; }),
    };
  });

  mount('clique-prox', (el, W) => {
    const title = document.createElement('p'); title.className = 'fig-title'; title.textContent = 'Average closeness of the two communities, for pairs that are alone and pairs inside a triangle.';
    el.appendChild(title);
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
    [['Closeness goes from 0 to 1.'], [`${fmt.int(C.n_isolated)} and ${fmt.int(C.n_clique)} pairs.`]].forEach(([line], j) => {
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
    const H = 190, x0 = 18, x1 = W - 18, y = 104, T = D.timeline_example;
    const L = { first: T.attack.source, second: T.attack.target, t1: T.attack.date, t2: T.answer.date, days: T.days };
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
    const lA = txt(svg, x0, 28, '', 't-strong', { 'font-size': W < 520 ? 11.5 : 13 });
    [[`r/${L.first} attacks r/${L.second}`], [niceDate(L.t1)]].forEach(([line], j) => { const ts = s('tspan', { x: x0, dy: j ? 17 : 0, class: j ? 't-muted' : '' }, lA); ts.textContent = line; });
    const endDot = s('circle', { cx: x1, cy: y, r: 8, class: 'f-hot pop' }, svg);
    endDot.style.transform = 'scale(0)';
    const lB = txt(svg, x1, y + 48, '', 't-strong', { 'font-size': 13, 'text-anchor': 'end', opacity: 0 });
    [[`r/${L.second} answers`], [niceDate(L.t2)]].forEach(([line], j) => { const ts = s('tspan', { x: x1, dy: j ? 17 : 0, class: j ? 't-muted' : '' }, lB); ts.textContent = line; });
    const runner = s('circle', { cx: x0, cy: y, r: 5, class: 'f-hot' }, svg);
    const counter = txt(svg, W / 2, y - 22, '0 days', 't-display t-strong', { 'text-anchor': 'middle', 'font-size': 26, 'font-weight': 700 });
    function at(p) {
      const xx = x0 + (x1 - x0) * p;
      prog.setAttribute('x2', xx); runner.setAttribute('cx', xx);
      counter.textContent = `${Math.round(L.days * p)} days`;
    }
    function final() { at(1); endDot.style.transform = 'scale(1)'; lB.setAttribute('opacity', 1); }
    const qs = document.createElement('div'); qs.className = 'posts two';
    el.appendChild(qs);
    postGrid(qs, [T.attack, T.answer]);
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
    const title = document.createElement('p'); title.className = 'fig-title'; title.textContent = 'Share of negative links in the first and second half of each conflict.';
    el.appendChild(title);
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

  // =====================================================================
  // New sections of the full project page
  // =====================================================================
  const pct = fmt.pct0;

  // ---------- the definition, interactive ----------
  (function definition() {
    const box = document.getElementById('def-explorer');
    if (!box) return;
    const input = document.getElementById('def-n');
    const out = document.getElementById('def-sentence');
    const G = D.definition.grid;
    function draw() {
      const n = Number(input.value), g = G[n];
      box.innerHTML = '';
      const W = Math.max(260, box.clientWidth), cols = n + 1;
      const size = Math.max(6, Math.min(26, Math.floor((W - 2) / cols) - 3)), step = size + 3;
      const perRow = Math.max(1, Math.floor(W / step)), rows = Math.ceil(cols / perRow);
      const H = rows * step + 26;
      const svg = svgIn(box, W, H);
      g.cls.forEach((c, k) => {
        const x = (k % perRow) * step, y = Math.floor(k / perRow) * step;
        const r = s('rect', { x, y, width: size, height: size, rx: 3, class: c === 'c' ? 'f-hot' : c === 'n' ? 'f-calm' : 'f-neutral' }, svg);
        if (c === 'u') r.setAttribute('opacity', 0.45);
        const t = s('title', {}, r); t.textContent = `${k} negative of ${n}: plausible share ${pct(g.low[k])} to ${pct(g.high[k])}`;
      });
      txt(svg, 0, rows * step + 16, '0 negative links', 't-muted', { 'font-size': 11 });
      txt(svg, Math.min(W, perRow * step) - 2, rows * step + 16, `${n} negative links`, 't-muted', { 'font-size': 11, 'text-anchor': 'end' });
      const firstC = g.cls.indexOf('c'), lastN = g.cls.lastIndexOf('n');
      const parts = [`With ${n} link${n > 1 ? 's' : ''} from A to B,`];
      if (lastN >= 0) parts.push(lastN === 0 ? 'the pair is calm only if none of them is negative,' : `the pair is calm with at most ${lastN} negative,`);
      if (firstC >= 0) parts.push(`${lastN >= 0 ? 'and ' : ''}a conflict with at least ${firstC} negative (${pct(firstC / n)} of the links).`);
      else parts.push(`${lastN >= 0 ? 'but ' : ''}it can never be a conflict: there is not enough evidence.`);
      if (lastN < 0 && firstC < 0) parts.splice(1, 2, 'we cannot say anything yet: every pair is undetermined.');
      out.textContent = parts.join(' ');
    }
    input.addEventListener('input', draw);
    window.addEventListener('resize', draw);
    draw();
  })();

  // ---------- topics ----------
  mount('topics-fig', (el, W) => {
    const R = D.topics.rows, narrow = W < 620;
    const lw = narrow ? 0 : 230, rowH = narrow ? 74 : 62, H = R.length * rowH + 8;
    const svg = svgIn(el, W, H), max = R[0].n, bw = W - lw - 110;
    const bars = R.map((r, i) => {
      const y = i * rowH + 4;
      txt(svg, 0, y + 15, r.name, 't-strong', { 'font-size': 14 });
      txt(svg, 0, y + 33 + (narrow ? 28 : 0), r.words.join(' · '), 't-muted', { 'font-size': 12 });
      const bx = narrow ? 0 : lw, by = narrow ? y + 22 : y + 2;
      s('rect', { x: bx, y: by, width: bw, height: 18, rx: 3, class: 'f-neutral', opacity: 0.18 }, svg);
      const rc = s('rect', { x: bx, y: by, width: 0, height: 18, rx: 3, class: 'f-hot' }, svg);
      const t = txt(svg, bx + 6, by + 14, '', 't-strong', { 'font-size': 12.5 });
      return { rc, t, v: r.n, bx };
    });
    function draw(p) { bars.forEach((b) => { const w = (b.v / max) * bw * p; b.rc.setAttribute('width', w); b.t.setAttribute('x', b.bx + w + 8); b.t.textContent = p > 0.05 ? `${Math.round(b.v * p)} conflicts` : ''; }); }
    draw(0);
    return { play: () => tween(1200, draw), final: () => draw(1) };
  });

  // ---------- words of conflict vs calm negativity ----------
  mount('words-fig', (el, W) => {
    const A = D.words.conflict.slice(0, 14), B = D.words.calm.slice(0, 14);
    const narrow = W < 620, colW = narrow ? W : (W - 40) / 2, rowH = 24;
    const H = narrow ? (A.length + B.length) * rowH + 90 : A.length * rowH + 50;
    const svg = svgIn(el, W, H);
    const max = Math.max(...A.map((x) => x[1]), ...B.map((x) => x[1]));
    const items = [];
    [[A, 0, 0, 'f-hot', 't-hot', 'In conflicts'], [B, narrow ? 0 : colW + 40, narrow ? A.length * rowH + 50 : 0, 'f-calm', 't-calm', 'Between calm pairs']].forEach(([L, x0, y0, fc, tc, title]) => {
      txt(svg, x0, y0 + 16, title, tc, { 'font-size': 14 });
      L.forEach(([w, z], i) => {
        const y = y0 + 34 + i * rowH;
        txt(svg, x0 + 92, y + 12, w, 't-strong', { 'font-size': 13, 'text-anchor': 'end' });
        const rc = s('rect', { x: x0 + 100, y: y + 2, width: 0, height: 14, rx: 2, class: fc }, svg);
        items.push({ rc, w: (z / max) * (colW - 110) });
      });
    });
    function draw(p) { items.forEach((it, i) => it.rc.setAttribute('width', it.w * ease(Math.max(0, Math.min(1, p * 1.6 - (i % 14) * 0.04))))); }
    draw(0);
    return { play: () => tween(1300, draw), final: () => draw(1) };
  });

  // ---------- structural balance: the four triangles ----------
  let nullKey = 'shuffle';
  const NULL_STEPS = [['shuffle', 'Shuffle the labels'], ['C0.3', 'Keep who attacks: loose'], ['C1', 'Keep who attacks: medium'], ['C10', 'Keep who attacks: strict']];
  const balanceChart = mount('triads', (el, W) => {
    const B = D.balance, narrow = W < 640;
    const cols = narrow ? 2 : 4, cw = W / cols, ch = narrow ? 270 : 250, H = Math.ceil(4 / cols) * ch;
    const svg = svgIn(el, W, H);
    const names = ['All friends', 'Friend of a friend is an enemy', 'Enemy of my enemy is a friend', 'Three enemies'];
    const verdictTheory = ['balanced', 'unbalanced', 'balanced (strict theory)', 'unbalanced (strict), allowed (weak)'];
    const signs = [[1, 1, 1], [1, 1, -1], [1, -1, -1], [-1, -1, -1]];
    const cells = signs.map((sg, k) => {
      const cx = (k % cols) * cw + cw / 2, top = Math.floor(k / cols) * ch;
      const r = 30, p = [[cx, top + 18], [cx - r * 1.1, top + 18 + r * 1.6], [cx + r * 1.1, top + 18 + r * 1.6]];
      [[0, 1], [1, 2], [0, 2]].forEach(([a, b], e) => s('line', { x1: p[a][0], y1: p[a][1], x2: p[b][0], y2: p[b][1], class: sg[e] > 0 ? 's-calm' : 's-hot', 'stroke-width': 3, 'stroke-dasharray': sg[e] > 0 ? '' : '5 4' }, svg));
      p.forEach((q) => s('circle', { cx: q[0], cy: q[1], r: 6, class: 'f-ink' }, svg));
      txt(svg, cx, top + 106, names[k], 't-strong', { 'font-size': narrow ? 11.5 : 12.5, 'text-anchor': 'middle' });
      txt(svg, cx, top + 122, verdictTheory[k], 't-muted', { 'font-size': 11, 'text-anchor': 'middle' });
      const bw = Math.min(46, cw * 0.22), base = top + ch - 34, hmax = 70;
      const ro = s('rect', { x: cx - bw - 3, y: base, width: bw, height: 0, rx: 3, class: 'f-ink' }, svg);
      const re = s('rect', { x: cx + 3, y: base, width: bw, height: 0, rx: 3, class: 'f-neutral' }, svg);
      const to = txt(svg, cx - bw / 2 - 3, base, '', 't-strong', { 'font-size': 11.5, 'text-anchor': 'middle' });
      const te = txt(svg, cx + bw / 2 + 3, base, '', 't-muted', { 'font-size': 11.5, 'text-anchor': 'middle' });
      const verdict = txt(svg, cx, base + 20, '', '', { 'font-size': 12, 'text-anchor': 'middle' });
      return { ro, re, to, te, verdict, base, hmax };
    });
    function draw(p) {
      const N = B.nulls[nullKey];
      cells.forEach((c, k) => {
        const o = B.observed[k], e = N.mean[k], m = Math.max(o, e, 1);
        const sc = (v) => Math.sqrt(v / Math.max(...B.observed, ...N.mean)) * c.hmax * p;
        c.ro.setAttribute('y', c.base - sc(o)); c.ro.setAttribute('height', sc(o));
        c.re.setAttribute('y', c.base - sc(e)); c.re.setAttribute('height', sc(e));
        c.to.setAttribute('y', c.base - sc(o) - 6); c.to.textContent = p > 0.5 ? fmt.int(o) : '';
        c.te.setAttribute('y', c.base - sc(e) - 6); c.te.textContent = p > 0.5 ? fmt.int(e) : '';
        const z = (o - e) / Math.max(N.sd[k], 0.5);
        const ratio = o / Math.max(e, 0.5);
        c.verdict.textContent = p < 1 ? '' : Math.abs(z) < 2 ? 'as expected' : (ratio > 1 && ratio < 1.15) ? 'slightly more than expected' : ratio > 1 ? `${ratio.toFixed(1)}× more than expected` : `${(1 / ratio).toFixed(1)}× fewer than expected`;
        c.verdict.setAttribute('class', Math.abs(z) < 2 ? 't-muted' : ratio > 1 ? 't-strong' : 't-hot');
      });
    }
    draw(0);
    return { play: () => tween(1000, draw), final: () => draw(1), update: () => draw(1) };
  });
  (function nullButtons() {
    const wrap = document.getElementById('null-toggle');
    if (!wrap) return;
    NULL_STEPS.forEach(([k, label]) => {
      const b = document.createElement('button');
      b.setAttribute('role', 'tab'); b.dataset.k = k; b.textContent = label; b.setAttribute('aria-selected', String(k === nullKey));
      b.addEventListener('click', () => {
        nullKey = k;
        wrap.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
        const auc = D.balance.nulls[k].auc;
        document.getElementById('null-note').textContent = k === 'shuffle'
          ? 'The conflict labels are shuffled between pairs. This keeps the number of conflicts, but not who sends them.'
          : `Each pair is a conflict with a probability that depends on how much its sender attacks and how much its target is attacked (logistic model, AUC ${auc.toFixed(3)}).`;
        if (balanceChart && balanceChart.inst) { balanceChart.played = true; balanceChart.inst.update(); }
      });
      wrap.appendChild(b);
    });
  })();

  // ---------- forecast ----------
  mount('auc-fig', (el, W) => {
    const R = D.forecast.rows, narrow = W < 620, lw = narrow ? 0 : 220, rowH = narrow ? 50 : 40;
    const H = R.length * rowH + 40, svg = svgIn(el, W, H);
    const x0 = lw, x1 = W - 50, x = (v) => x0 + ((v - 0.5) / 0.5) * (x1 - x0);
    [0.5, 0.6, 0.7, 0.8, 0.9, 1].forEach((v) => {
      s('line', { x1: x(v), x2: x(v), y1: 0, y2: H - 26, class: 's-rule', 'stroke-dasharray': v === 0.5 ? '' : '2 4' }, svg);
      txt(svg, x(v), H - 8, v === 0.5 ? '0.5 (chance)' : v.toFixed(1), 't-muted', { 'font-size': 11, 'text-anchor': v === 0.5 ? 'start' : 'middle' });
    });
    const items = R.map((r, i) => {
      const y = i * rowH + (narrow ? 18 : 8);
      txt(svg, narrow ? 0 : 0, narrow ? y - 4 : y + 15, r.name, 't-strong', { 'font-size': 13 });
      const by = narrow ? y + 2 : y + 2;
      const rc = s('rect', { x: x(0.5), y: by, width: 0, height: 18, rx: 3, class: r.name === 'Everything' ? 'f-hot' : 'f-neutral' }, svg);
      const ci = s('line', { x1: x(r.lo), x2: x(r.hi), y1: by + 9, y2: by + 9, class: 's-ink', 'stroke-width': 1.5, opacity: 0 }, svg);
      const t = txt(svg, 0, by + 14, '', r.name === 'Everything' ? 't-hot' : 't-strong', { 'font-size': 12.5 });
      return { rc, ci, t, v: r.auc, hi: r.hi };
    });
    function draw(p) { items.forEach((it) => { const w = (x(0.5 + (it.v - 0.5) * p) - x(0.5)); it.rc.setAttribute('width', w); it.t.setAttribute('x', Math.max(x(0.5) + w, p >= 1 ? x(it.hi) : 0) + 8); it.t.textContent = p > 0.1 ? (0.5 + (it.v - 0.5) * p).toFixed(2) : ''; it.ci.setAttribute('opacity', p >= 1 ? 1 : 0); }); }
    draw(0);
    return { play: () => tween(1200, draw, () => draw(1)), final: () => draw(1) };
  });

  mount('coef-fig', (el, W) => {
    const C = D.forecast.coef, narrow = W < 620, lw = narrow ? 170 : 230, rowH = 24, H = C.length * rowH + 34;
    const svg = svgIn(el, W, H), max = Math.max(...C.map((c) => Math.abs(c[1])));
    const mid = lw + (W - lw) / 2, half = (W - lw) / 2 - 40, x = (v) => mid + (v / max) * half;
    s('line', { x1: mid, x2: mid, y1: 0, y2: H - 24, class: 's-ink' }, svg);
    txt(svg, mid - 6, H - 6, '← less likely', 't-calm', { 'font-size': 11.5, 'text-anchor': 'end' });
    txt(svg, mid + 6, H - 6, 'more likely →', 't-hot', { 'font-size': 11.5 });
    const items = C.map(([name, v], i) => {
      const y = i * rowH + 4;
      txt(svg, lw - 10, y + 13, name, 't-strong', { 'font-size': 12, 'text-anchor': 'end' });
      const rc = s('rect', { x: mid, y: y + 2, width: 0, height: 15, rx: 2, class: v > 0 ? 'f-hot' : 'f-calm' }, svg);
      return { rc, v };
    });
    function draw(p) { items.forEach(({ rc, v }) => { const w = Math.abs(x(v * p) - mid); rc.setAttribute('x', v > 0 ? mid : mid - w); rc.setAttribute('width', w); }); }
    draw(0);
    return { play: () => tween(1100, draw), final: () => draw(1) };
  });

  (function topPredicted() {
    const ol = document.getElementById('top-new');
    if (!ol) return;
    D.forecast.top_new.slice(0, 10).forEach((r) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="tp-pair">r/${r.a} <i>&rarr;</i> r/${r.b}</span><span class="tp-p">${Math.round(r.p * 100)}%</span><span class="tp-y ${r.y ? 'yes' : 'no'}">${r.y ? 'became a conflict' : 'stayed calm'}</span>`;
      ol.appendChild(li);
    });
  })();

  // ---------- persistence ----------
  mount('persist-fig', (el, W) => {
    const T = D.persistence.table, narrow = W < 560;
    const rows = [['Conflicts before 2016', T.conflict.conflict, T.conflict['no conflict'], 'still a conflict', 'became calm'],
                  ['Calm pairs before 2016', T['no conflict'].conflict, T['no conflict']['no conflict'], 'became a conflict', 'still calm']];
    const H = 190, svg = svgIn(el, W, H), bw = W;
    const items = rows.map(([label, c, n, lc, ln], i) => {
      const y = i * 90 + 22, tot = c + n;
      txt(svg, 0, y - 6, `${label} (${tot})`, 't-strong', { 'font-size': 13.5 });
      const rc = s('rect', { x: 0, y, width: 0, height: 30, rx: 3, class: 'f-hot' }, svg);
      const rn = s('rect', { x: 0, y, width: 0, height: 30, rx: 3, class: 'f-calm' }, svg);
      const t1 = txt(svg, 0, y + 50, '', 't-hot', { 'font-size': 12.5 });
      const t2 = txt(svg, bw, y + 50, '', 't-calm', { 'font-size': 12.5, 'text-anchor': 'end' });
      return { rc, rn, t1, t2, c, n, tot, lc, ln, y };
    });
    function draw(p) {
      items.forEach((it) => {
        const wc = (it.c / it.tot) * bw * p, wn = (it.n / it.tot) * bw * p;
        it.rc.setAttribute('width', Math.max(0, wc - 2)); it.rn.setAttribute('x', wc); it.rn.setAttribute('width', wn);
        it.t1.textContent = p >= 1 ? `${it.c} ${it.lc}` : ''; it.t2.textContent = p >= 1 ? `${it.n} ${it.ln}` : '';
      });
    }
    draw(0);
    return { play: () => tween(1100, draw, () => draw(1)), final: () => draw(1) };
  });

  // ---------- what did not work: first contact event study ----------
  mount('event-fig', (el, W) => {
    const E = D.event, H = 280, l = 40, r = 120, t = 20, b = 40;
    const svg = svgIn(el, W, H);
    const A = E['conflict|first link|attacker|links sent'], Cm = E['calm|first link|attacker|links sent'];
    const n = A.mean.length, K = (n - 1) / 2;
    const all = [...A.lo, ...A.hi, ...Cm.lo, ...Cm.hi], ymin = Math.min(0, ...all), ymax = Math.max(...all);
    const x = (i) => l + (i / (n - 1)) * (W - l - r), y = (v) => t + (1 - (v - ymin) / (ymax - ymin)) * (H - t - b);
    s('line', { x1: x(K), x2: x(K), y1: t, y2: H - b, class: 's-ink', 'stroke-dasharray': '3 4' }, svg);
    txt(svg, x(K) + 4, t + 10, 'first link', 't-muted', { 'font-size': 11 });
    s('line', { x1: l, x2: W - r, y1: y(0), y2: y(0), class: 's-rule' }, svg);
    [-12, -6, 0, 6, 12].forEach((m) => txt(svg, x(m + K), H - b + 18, m === 0 ? '0' : `${m > 0 ? '+' : ''}${m} months`, 't-muted', { 'font-size': 11, 'text-anchor': 'middle' }));
    txt(svg, l - 6, y(0) + 4, '0', 't-muted', { 'font-size': 11, 'text-anchor': 'end' });
    const lines = [[A, 'hot', 'conflicts'], [Cm, 'calm', 'calm pairs']].map(([S, c, label]) => {
      const band = S.lo.map((v, i) => `${x(i)},${y(v)}`).concat(S.hi.map((v, i) => `${x(i)},${y(v)}`).reverse()).join(' ');
      s('polygon', { points: band, class: `f-${c}`, opacity: 0.12 }, svg);
      const pl = s('polyline', { points: S.mean.map((v, i) => `${x(i)},${y(v)}`).join(' '), fill: 'none', class: `s-${c}`, 'stroke-width': 3 }, svg);
      txt(svg, W - r + 8, y(last(S.mean)) + 4, `${label}: ×${Math.exp(last(S.mean)).toFixed(1)}`, `t-${c}`, { 'font-size': 12.5 });
      return pl;
    });
    lines.forEach((pl) => { const L = pl.getTotalLength ? pl.getTotalLength() : 1000; pl.style.strokeDasharray = L; pl.style.strokeDashoffset = L; pl._L = L; });
    return { play: () => lines.forEach((pl) => tween(1400, (p) => { pl.style.strokeDashoffset = pl._L * (1 - p); })), final: () => lines.forEach((pl) => { pl.style.strokeDashoffset = 0; }) };
  });
})();
