/* ==========================================================================
   xo-earn.js  -  Ultimate XO: more ways to earn coins + developer account.
   Put it next to xo-shop.js and load it right AFTER it on every page:

     <script src="xo-shop.js" data-mode="game"></script>
     <script src="xo-earn.js"></script>

   It does not touch xo-shop.js. It only uses window.XOShop and window.XOAuth.
   Its data lives in xo_stats.earn, so it is cloud-saved with the rest.
   ========================================================================== */
(function () {
  'use strict';
  if (window.XOEarn || !window.XOShop) return;
  var Shop = window.XOShop;

  /* ------------------------------------------------------------------ *
   *  SETTINGS - change numbers here
   * ------------------------------------------------------------------ */
  var AI_WIN   = { 'beginner': 15, 'professional': 25, 'top-player': 40, 'legend': 70, 'omar-mode': 150 };
  var LEAGUE_WIN = 30, ONLINE_WIN = 30;
  var DRAW = 5, LOSS = 2;                 // consolation for ai / league / online
  var PLAYED = 5, PLAYED_CAP = 8;         // local / mystery / nomad (per day, so it can't be farmed)
  var STREAK_EVERY = 3, STREAK_BONUS = 25; // every 3 wins in a row
  var PROMOTION = 150;                    // league promotion (was 50)
  var LOGIN = [25, 35, 50, 70, 90, 120, 200]; // daily login, 7-day cycle
  var QUESTS = [
    { id: 'p3',  t: 'Play 3 matches',          r: 30,  f: function (q) { return q.p; },          n: 3 },
    { id: 'w2',  t: 'Win 2 matches',           r: 50,  f: function (q) { return q.w; },          n: 2 },
    { id: 'w5',  t: 'Win 5 matches',           r: 100, f: function (q) { return q.w; },          n: 5 },
    { id: 'm3',  t: 'Play 3 different modes',  r: 40,  f: function (q) { return q.m.length; },   n: 3 }
  ];
  var MILESTONES = [[10, 100], [25, 200], [50, 400], [100, 800], [250, 2000]]; // total wins -> coins

  // Shop prices (450 to 2999). This overrides the prices written in xo-shop.js, so you only edit prices here.
  var PRICES = {
    // COMMON
    mint: 450, crimson: 450, snow: 450, gold: 499, violet: 499, ocean: 499,
    // RARE
    xocyan: 599, flies: 599, snowfall: 599, rain: 650, ember: 650, xofire: 699, toxic: 699, rose: 750, moon: 799, day: 850,
    // EPIC
    aurora: 999, lava: 1099, synthp: 1199, synthc: 1299, reef: 1399, portalv: 1499, portalg: 1599,
    // LEGENDARY
    jelly: 1799, galaxy: 1999, portalr: 2199, chroma: 2499,
    // MYTHIC
    prism: 2999
  };

  // Developer account: create these usernames in the game (Sign up). Everything is free for them.
  // Use a long password and sign up FIRST, before anyone else takes the name.
  var DEV_USERNAMES = ['omar_dev'];
  var DEV_UIDS = [];                      // optional extra safety: paste your Firebase uid here
  var DEV_COINS = 1000000;

  Shop.catalog.forEach(function (c) { if (PRICES[c.id]) c.price = PRICES[c.id]; });
  Shop.catalog.sort(function (a, b) { return a.price - b.price; });

  /* ------------------------------------------------------------------ *
   *  helpers + storage (xo_stats.earn)
   * ------------------------------------------------------------------ */
  var LS = window.localStorage, SHOP_MODE = !!document.querySelector('script[data-mode="shop"]');
  function readStats() { try { var o = JSON.parse(LS.getItem('xo_stats') || '{}'); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; } }
  function writeStats(st) {
    try { LS.setItem('xo_stats', JSON.stringify(st)); } catch (e) {}
    try { var h = LS.getItem('xo_hint'); if (h && h !== 'guest') LS.setItem('xo_dirty', '1'); } catch (e) {}
  }
  function dayKey(off) { var d = new Date(Date.now() + (off || 0) * 864e5); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function load() {
    var e = readStats().earn || {};
    e.l = e.l || { d: '', s: 0 }; e.ws = e.ws | 0; e.ml = Array.isArray(e.ml) ? e.ml : [];
    var q = e.q || {};
    if (q.d !== dayKey()) q = { d: dayKey(), p: 0, w: 0, m: [], done: {}, pc: 0 };
    q.m = q.m || []; q.done = q.done || {}; e.q = q; return e;
  }
  function save(e) { var st = readStats(); st.earn = e; writeStats(st); }
  function fmt(n) { try { return Number(n).toLocaleString('en-US'); } catch (x) { return String(n); } }

  var delay = 0, delayT = 0;
  function give(n, text) {           // add coins + toast, toasts are staggered
    Shop.addCoins(n);
    Shop.toast({ coin: true, amt: '+' + n, text: text, delay: delay });
    delay += 700; clearTimeout(delayT); delayT = setTimeout(function () { delay = 0; }, 800);
  }

  /* ------------------------------------------------------------------ *
   *  developer
   * ------------------------------------------------------------------ */
  function isDev() {
    try {
      var p = JSON.parse(LS.getItem('xo_profile') || '{}'), u = String(p.u || '').toLowerCase();
      if (u && DEV_USERNAMES.indexOf(u) > -1) return true;
      var pl = JSON.parse(LS.getItem('xo_player') || '{}');
      return !!(pl.id && DEV_UIDS.indexOf(pl.id) > -1);
    } catch (e) { return false; }
  }
  function topUp() { if (isDev() && Shop.coins() < DEV_COINS / 2) Shop.addCoins(DEV_COINS - Shop.coins()); }
  function setOwned(all) {
    var st = readStats(), s = st.shop || { c: 0, o: [], e: null };
    s.o = all ? Shop.catalog.map(function (c) { return c.id; }) : []; if (!all) s.e = null;
    st.shop = s; writeStats(st); Shop.refresh();
  }

  /* ------------------------------------------------------------------ *
   *  rewards
   * ------------------------------------------------------------------ */
  var pendingWin = 20;
  try {   // xo-shop reads rewards.win when it pays a win: make it depend on the mode / difficulty
    Object.defineProperty(Shop.rewards, 'win', { get: function () { return pendingWin; }, set: function (v) { pendingWin = v; }, configurable: true, enumerable: true });
  } catch (e) {}
  Shop.rewards.promotion = PROMOTION;

  function earnsMode(m) { m = String(m || ''); return m === 'ai' || m === 'league' || m.indexOf('online-') === 0; }
  function winFor(m) {
    if (m === 'ai') { var d = new URLSearchParams(location.search).get('diff') || 'beginner'; return AI_WIN[d] || AI_WIN.beginner; }
    return m === 'league' ? LEAGUE_WIN : ONLINE_WIN;
  }

  function after(mode, result) {
    var e = load(), q = e.q, earn = earnsMode(mode);
    // consolation + small reward for two-player modes
    if (result === 'draw' && earn) give(DRAW, 'Draw');
    else if (result === 'loss' && earn) give(LOSS, 'Good game');
    else if (result === 'played' && q.pc < PLAYED_CAP) { q.pc++; give(PLAYED, 'Match played'); }
    // win streak
    if (result === 'win') {
      e.ws++;
      if (e.ws % STREAK_EVERY === 0) give(STREAK_BONUS, e.ws + ' wins in a row');
    } else if (result === 'loss') e.ws = 0;
    // daily quests
    q.p++; if (result === 'win') q.w++;
    if (q.m.indexOf(mode) < 0) q.m.push(mode);
    QUESTS.forEach(function (Q) {
      if (!q.done[Q.id] && Q.f(q) >= Q.n) { q.done[Q.id] = 1; give(Q.r, 'Quest: ' + Q.t); }
    });
    // lifetime wins
    if (result === 'win') {
      var w = readStats().w || 0;
      MILESTONES.forEach(function (M) { if (w >= M[0] && e.ml.indexOf(M[0]) < 0) { e.ml.push(M[0]); give(M[1], M[0] + ' total wins!'); } });
    }
    save(e);
  }

  function hook() {
    var A = window.XOAuth;
    if (!A || A.__xoEarnHooked || typeof A.recordGame !== 'function') return;
    var prev = A.recordGame;
    A.recordGame = function (mode, result) {
      pendingWin = winFor(mode);                       // BEFORE xo-shop pays the win
      var r = prev.apply(this, arguments);
      try { after(mode, result); } catch (x) {}
      return r;
    };
    A.__xoEarnHooked = true;
  }

  /* ------------------------------------------------------------------ *
   *  UI (menu page only): Daily button, Daily window, Dev panel
   * ------------------------------------------------------------------ */
  function mk(tag, cls, html) { var el = document.createElement(tag); if (cls) el.className = cls; if (html != null) el.innerHTML = html; return el; }
  var cssDone = false;
  function css() {
    if (cssDone) return; cssDone = true;
    var s = mk('style');
    s.textContent =
      '.xe-btn{position:fixed;top:20px;z-index:200;width:42px;height:42px;padding:0;display:grid;place-items:center;border-radius:50%;border:2px solid var(--c);background:rgba(255,255,255,.04);color:var(--c);font:900 11px/1 "Segoe UI",sans-serif;letter-spacing:.5px;cursor:pointer;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:.3s;box-shadow:0 0 16px rgba(255,255,255,.08)}' +
      '.xe-btn.big{font-size:19px}' +
      '.xe-btn:hover,.xe-btn:focus-visible{background:var(--c);color:#000;box-shadow:0 0 26px var(--c);transform:scale(1.08);outline:none}' +
      '.xe-btn.dot::after{content:"";position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:#ff0055;box-shadow:0 0 10px #ff0055;animation:xePulse 1.4s infinite}' +
      '@keyframes xePulse{50%{transform:scale(1.35)}}' +
      '.xe-modal{position:fixed;inset:0;z-index:99991;display:none;overflow-y:auto;background:rgba(2,2,8,.9);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);font-family:"Segoe UI",system-ui,sans-serif;color:#fff}' +
      '.xe-modal.open{display:block}' +
      '.xe-sheet{max-width:520px;margin:0 auto;padding:22px 16px 40px}' +
      '.xe-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}' +
      '.xe-top h2{margin:0;font-size:20px;font-weight:900;letter-spacing:2px;text-transform:uppercase;text-shadow:0 0 14px var(--c)}' +
      '.xe-x{width:40px;height:40px;border-radius:50%;border:2px solid rgba(255,255,255,.25);background:transparent;color:#fff;font-size:17px;cursor:pointer}' +
      '.xe-h{margin:20px 0 8px;font-size:11px;font-weight:800;letter-spacing:2px;opacity:.55;text-transform:uppercase}' +
      '.xe-days{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}' +
      '.xe-day{padding:8px 2px;border-radius:12px;border:1px solid rgba(255,255,255,.12);text-align:center;font-size:11px;font-weight:800;opacity:.7}' +
      '.xe-day b{display:block;font-size:14px;color:#ffcc00;margin-top:3px}' +
      '.xe-day.past{opacity:.35}.xe-day.now{opacity:1;border-color:#ffcc00;box-shadow:0 0 14px rgba(255,204,0,.4)}' +
      '.xe-claim{width:100%;margin-top:12px;padding:13px;border-radius:50px;border:2px solid #ffcc00;background:#ffcc00;color:#000;font:900 14px/1 "Segoe UI",sans-serif;letter-spacing:1px;text-transform:uppercase;cursor:pointer;box-shadow:0 0 22px rgba(255,204,0,.5)}' +
      '.xe-claim:disabled{background:transparent;color:rgba(255,255,255,.5);border-color:rgba(255,255,255,.2);box-shadow:none;cursor:default}' +
      '.xe-q{padding:11px 12px;margin-bottom:8px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03)}' +
      '.xe-q.ok{border-color:#00ff66}' +
      '.xe-qr{display:flex;justify-content:space-between;gap:8px;font-size:14px;font-weight:700}' +
      '.xe-qr span{color:#ffcc00;white-space:nowrap}.xe-q.ok .xe-qr span{color:#00ff66}' +
      '.xe-bar{height:5px;margin-top:8px;border-radius:5px;background:rgba(255,255,255,.1);overflow:hidden}' +
      '.xe-bar i{display:block;height:100%;background:linear-gradient(90deg,#00f3ff,#00ff66)}' +
      '.xe-info{font-size:12px;line-height:1.7;opacity:.6;margin-top:16px}' +
      '.xe-dv{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
      '.xe-dv button{padding:12px 6px;border-radius:12px;border:1px solid #ff0055;background:rgba(255,0,85,.08);color:#fff;font:800 12px/1.2 "Segoe UI",sans-serif;cursor:pointer}' +
      '.xe-dv button:hover{background:#ff0055}';
    document.head.appendChild(s);
  }

  var dailyEl, devEl, dailyBtn;
  function nextStreak(e) { return e.l.d === dayKey(-1) ? e.l.s + 1 : (e.l.d === dayKey() ? e.l.s : 1); }
  function canClaim(e) { return e.l.d !== dayKey(); }

  function renderDaily() {
    var e = load(), st = nextStreak(e), idx = (st - 1) % 7, claim = canClaim(e), h = '';
    h += '<div class="xe-top"><h2>Daily rewards</h2><button class="xe-x" type="button" aria-label="Close">&#10005;</button></div>';
    h += '<div class="xe-h">Login streak: day ' + st + '</div><div class="xe-days">';
    LOGIN.forEach(function (c, i) { h += '<div class="xe-day ' + (i < idx || (i === idx && !claim) ? 'past' : '') + (i === idx ? ' now' : '') + '">D' + (i + 1) + '<b>' + c + '</b></div>'; });
    h += '</div><button class="xe-claim" type="button" ' + (claim ? '' : 'disabled') + '>' + (claim ? 'Claim +' + LOGIN[idx] + ' coins' : 'Come back tomorrow') + '</button>';
    h += '<div class="xe-h">Today\'s quests</div>';
    QUESTS.forEach(function (Q) {
      var v = Math.min(Q.n, Q.f(e.q)), ok = !!e.q.done[Q.id];
      h += '<div class="xe-q ' + (ok ? 'ok' : '') + '"><div class="xe-qr"><div>' + Q.t + '</div><span>' + (ok ? 'DONE' : '+' + Q.r) + '</span></div><div class="xe-bar"><i style="width:' + (v / Q.n * 100) + '%"></i></div></div>';
    });
    dailyEl.firstChild.innerHTML = h;
    if (dailyBtn) dailyBtn.classList.toggle('dot', claim);
  }
  function openDaily() {
    css();
    if (!dailyEl) {
      dailyEl = mk('div', 'xe-modal', '<div class="xe-sheet"></div>'); dailyEl.style.setProperty('--c', '#00ff66');
      dailyEl.addEventListener('click', function (ev) {
        if (ev.target === dailyEl || ev.target.closest('.xe-x')) { dailyEl.classList.remove('open'); return; }
        var b = ev.target.closest('.xe-claim');
        if (b && !b.disabled) {
          var e = load(); if (!canClaim(e)) return;
          var s = nextStreak(e); e.l = { d: dayKey(), s: s }; save(e);
          give(LOGIN[(s - 1) % 7], 'Day ' + s + ' login'); renderDaily();
        }
      });
      document.body.appendChild(dailyEl);
    }
    renderDaily(); dailyEl.classList.add('open');
  }

  function openDev() {
    css();
    if (!devEl) {
      devEl = mk('div', 'xe-modal', '<div class="xe-sheet"></div>'); devEl.style.setProperty('--c', '#ff0055');
      devEl.firstChild.innerHTML =
        '<div class="xe-top"><h2>Developer</h2><button class="xe-x" type="button" aria-label="Close">&#10005;</button></div>' +
        '<div class="xe-dv">' +
        '<button data-a="coins">+100,000 coins</button><button data-a="all">Unlock all projectors</button>' +
        '<button data-a="none">Lock all projectors</button><button data-a="zero">Set coins to 0</button>' +
        '<button data-a="win">Test win toast</button><button data-a="promo">Test promotion toast</button>' +
        '<button data-a="day">Reset daily + quests</button><button data-a="ms">Reset milestones + streak</button></div>' +
        '<div class="xe-info">Developer account: coins are topped up to ' + fmt(DEV_COINS) + ' automatically, so every purchase is free. ' +
        'Everything you do here is saved to your account like normal progress.</div>';
      devEl.addEventListener('click', function (ev) {
        if (ev.target === devEl || ev.target.closest('.xe-x')) { devEl.classList.remove('open'); return; }
        var b = ev.target.closest('button[data-a]'); if (!b) return;
        var a = b.getAttribute('data-a'), e;
        if (a === 'coins') Shop.addCoins(100000);
        else if (a === 'all') setOwned(true);
        else if (a === 'none') setOwned(false);
        else if (a === 'zero') Shop.addCoins(-Shop.coins());
        else if (a === 'win') Shop.win();
        else if (a === 'promo') Shop.promotion();
        else if (a === 'day') { e = load(); e.q = { d: dayKey(), p: 0, w: 0, m: [], done: {}, pc: 0 }; e.l = { d: '', s: 0 }; save(e); if (dailyBtn) dailyBtn.classList.add('dot'); }
        else if (a === 'ms') { e = load(); e.ml = []; e.ws = 0; save(e); }
        Shop.toast({ text: b.textContent });
      });
      document.body.appendChild(devEl);
    }
    devEl.classList.add('open');
  }

  var devBtn;
  function mountUi() {
    if (dailyBtn || !document.body) return; css();
    dailyBtn = mk('button', 'xe-btn big', '&#127873;'); dailyBtn.type = 'button'; dailyBtn.title = 'Daily rewards';
    dailyBtn.setAttribute('aria-label', 'Daily rewards'); dailyBtn.style.cssText = 'left:124px;--c:#00ff66'; dailyBtn.onclick = openDaily;
    document.body.appendChild(dailyBtn);
    dailyBtn.classList.toggle('dot', canClaim(load()));
  }
  function syncDevBtn() {
    var on = isDev();
    if (on && !devBtn) {
      devBtn = mk('button', 'xe-btn', 'DEV'); devBtn.type = 'button'; devBtn.title = 'Developer tools';
      devBtn.style.cssText = 'left:176px;--c:#ff0055'; devBtn.onclick = openDev; document.body.appendChild(devBtn);
    } else if (!on && devBtn) { devBtn.remove(); devBtn = null; }
    if (on) topUp();
  }

  // the shop window says "+20 coins": make its note show the real numbers
  function fixNote() {
    var n = document.querySelector('.xs-note'); if (n && n.parentNode) n.parentNode.removeChild(n);
  }

  /* ------------------------------------------------------------------ *
   *  start-up
   * ------------------------------------------------------------------ */
  window.XOEarn = { isDev: isDev, openDaily: openDaily, state: load };

  function boot() {
    hook();
    syncDevBtnSafe();
    if (SHOP_MODE) {
      mountUi();
      try { new MutationObserver(fixNote).observe(document.body, { childList: true }); } catch (e) {}
      [1500, 4000].forEach(function (t) { setTimeout(syncDevBtn, t); });   // the profile arrives from the cloud a moment after load
      window.addEventListener('pageshow', syncDevBtn); window.addEventListener('focus', syncDevBtn);
    } else {
      topUp(); [1500, 4000].forEach(function (t) { setTimeout(topUp, t); });
    }
  }
  function syncDevBtnSafe() { if (SHOP_MODE) syncDevBtn(); }
  hook();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.addEventListener('load', hook);
})();
