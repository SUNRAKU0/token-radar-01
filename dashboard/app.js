// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, the filters, the per-protocol
// detail view and the live-token view. No network: every byte it shows is
// in data.js. The page re-derives each row's implied value and farm plan
// from the snapshot figures, so the page and board.json are the same
// arithmetic, checked in the detail view.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;

  var state = { q: '', category: 'all', segment: 'all', chain: 'all', tab: 'pre', sort: 'implied', dir: -1, selected: null };
  var model = DATA.model;

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // The model, as lib/radar.ts computes it: category multiple from the
  // snapshot's live-token ratios, growth clamped and weighted, maturity
  // saturating with age, breadth from the chain count.
  function impliedOf(row) {
    var growth = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, model.growth_floor, model.growth_cap);
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? DATA.median_age_days : row.age_days;
    var maturity = model.maturity_floor + model.maturity_range * (1 - Math.exp(-Math.max(age, 0) / model.maturity_scale_days));
    var extra = Math.min(Math.max((row.chains || []).length - 1, 0), model.breadth_max_chains);
    var breadth = 1 + model.breadth_per_chain * extra;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * breadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan, the same derivation main.ts writes to board.json:
  // category, chains, TVL and age decide the action, the capital, the hold
  // and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 500;
    if (p.tvl_usd >= 1e9) return 300;
    if (p.tvl_usd >= 1e8) return 150;
    return 75;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and leave the deposit earning.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0 || c.indexOf('swap') >= 0) return 'Add $' + capital + " of liquidity to " + name + "'s deepest pool on " + chain + ' and hold the LP position.';
    if (c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('farm') >= 0) return 'Deposit $' + capital + " into " + name + "'s highest-yield vault on " + chain + ' and leave it compounding.';
    if (c.indexOf('bridge') >= 0 || c.indexOf('cross chain') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' with ' + name + ', then put the bridged funds to work in one app there.';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + " worth of the chain's native asset through " + name + ' and hold the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Post $' + capital + ' of USDC as collateral on ' + name + ', open a small hedged position, and close it the same week.';
    if (c.indexOf('prediction') >= 0) return 'Fund ' + capital + ' and take one small position on a ' + name + ' market that settles within the month.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' curator vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or hold $' + capital + ' of the stable asset ' + name + ' issues on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Buy $' + capital + ' of ' + name + "'s tokenised yield asset on " + chain + ' and hold it through one distribution.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('chain') >= 0 && c.indexOf('cross') < 0) return 'Use ' + name + ' every week: send a transaction, try its main app, and hold a small balance on the chain.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Spend $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipts.';
    if (c.indexOf('privacy') >= 0) return 'Run $' + capital + " through " + name + "'s private flow on " + chain + ' once a week.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and use its main feature once a week.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page for a points program.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    return [
      { text: 'Open a fresh wallet for this farm and move in only the funds you plan to use; write the seed phrase on paper and keep it offline.', cost: 'about $2 of gas to fund it', time: '10 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about $' + (capital >= 300 ? 10 : 5) + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one real action a week, such as a deposit, a swap, a borrow, a vote or a claim, so the wallet shows a pattern and not a single deposit.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Leave the position untouched for at least ' + hold + ' days; snapshots usually reward wallets that were active across several weeks, not one afternoon.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Check the protocol's own points or rewards page once a week and record what it shows; claim only through links the protocol itself publishes.", cost: 'free to check, and never pay anyone to claim for you', time: '10 minutes a week' },
      { text: 'Keep a farm log with the wallet, the dates and every transaction hash, and decide your exit before the token launches: unstake, claim, then sell a little at a time.', cost: 'nothing but the log', time: '5 minutes a week' }
    ].map(stepText);
  }

  function segmentLabel(s) {
    if (s === 'watchlist') return 'Watchlist';
    if (s === 'above-floor') return 'Above floor';
    return 'Early';
  }

  // ---- state from the hash, so a view can be linked and screenshotted
  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('segment')) state.segment = params.get('segment');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.segment !== 'all') params.set('segment', state.segment);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  // ---- filtering and sorting
  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.segment !== 'all' && r.segment !== state.segment) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  // ---- static facts
  function fillFacts() {
    document.getElementById('meta-snapshot').textContent = 'Snapshot ' + DATA.as_of;
    document.getElementById('meta-model').textContent = 'Model ' + DATA.model_version;
    document.getElementById('headline').textContent = DATA.watchlist_size + ' watchlist protocols, ' + DATA.board_size + ' ranked by implied value';
    document.getElementById('fact-watchlist').textContent = DATA.watchlist_size + ' / ' + DATA.watchlist_size;
    document.getElementById('fact-board').textContent = String(DATA.board_size);
    document.getElementById('fact-early').textContent = String(DATA.early_size);
    document.getElementById('fact-live').textContent = String(DATA.live_size);
    document.getElementById('global-multiple').textContent = 'Global fallback multiple (thin categories): ' + DATA.global_multiple + '. Median pre-token age used for unknown listing dates: ' + DATA.median_age_days + ' days.';
    var body = document.getElementById('multiples-body');
    Object.keys(DATA.category_multiples).sort().forEach(function (c) {
      body.appendChild(el('tr', null,
        el('td', { text: c }),
        el('td', { class: 'num', text: String(DATA.category_multiples[c]) })
      ));
    });
  }

  function fillFilters() {
    var catSel = document.getElementById('category');
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    cats.forEach(function (c) {
      catSel.appendChild(el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }));
    });
    var chainSel = document.getElementById('chain');
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    chains.forEach(function (c) {
      chainSel.appendChild(el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }));
    });
    document.getElementById('q').value = state.q;
    document.getElementById('segment').value = state.segment;
  }

  // ---- tables
  function renderBoard() {
    var list = sortedRows(filteredRows());
    var tbody = document.getElementById('board-body');
    tbody.textContent = '';
    document.getElementById('board-empty').hidden = list.length !== 0;
    document.getElementById('count').textContent = list.length + ' rows shown';
    var max = 1;
    DATA.rows.forEach(function (r) { if (r.implied_value_usd > max) max = r.implied_value_usd; });
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'seg ' + r.segment, text: segmentLabel(r.segment) }))
      );
      tbody.appendChild(tr);
    });
  }

  function renderLive() {
    var tbody = document.getElementById('live-body');
    tbody.textContent = '';
    DATA.live.forEach(function (r) {
      var ratio = r.mcap_usd !== null && r.tvl_usd > 0 ? (r.mcap_usd / r.tvl_usd).toFixed(2) : 'n/a';
      tbody.appendChild(el('tr', null,
        el('td', null, el('span', { class: 'seg', text: 'already trades' })),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: ratio })
      ));
    });
    document.getElementById('count').textContent = DATA.live.length + ' live-token protocols';
  }

  // ---- detail dialog
  var dialog = document.getElementById('detail');
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); renderBoard(); });
  document.getElementById('detail-close').addEventListener('click', function () { dialog.close(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var recomputed = impliedOf(row);
    document.getElementById('detail-kicker').textContent = 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + segmentLabel(row.segment);
    document.getElementById('detail-title').textContent = row.name;
    document.getElementById('detail-sub').textContent = (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') + ' · records no token';
    var eq = document.getElementById('detail-equation');
    eq.textContent = '';
    [
      ['TVL', fmtUsd(row.tvl_usd)],
      ['Seven-day growth', fmtPct(row.change_7d)],
      ['Age with no token', fmtAge(row.age_days)],
      ['Category multiple', String(row.category_multiple)],
      ['Growth multiplier', String(row.growth_multiplier)],
      ['Maturity multiplier', String(row.maturity_multiplier)],
      ['Breadth multiplier', String(row.breadth_multiplier)],
      ['Implied value', fmtUsd(row.implied_value_usd)]
    ].forEach(function (pair) {
      eq.appendChild(el('div', null, el('span', { text: pair[0] }), el('b', { class: 'num', text: pair[1] })));
    });
    document.getElementById('detail-check').textContent = 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.';
    var steps = document.getElementById('detail-steps');
    steps.textContent = '';
    farmSteps(row).forEach(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      steps.appendChild(el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail })));
    });
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    renderBoard();
  }

  // ---- wiring
  function render() {
    var pre = state.tab === 'pre';
    document.getElementById('tab-pre').setAttribute('aria-selected', pre ? 'true' : 'false');
    document.getElementById('tab-live').setAttribute('aria-selected', pre ? 'false' : 'true');
    document.getElementById('board-panel').hidden = !pre;
    document.getElementById('live-panel').hidden = pre;
    if (pre) renderBoard(); else renderLive();
  }

  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; writeHash(); renderBoard(); });
  document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; writeHash(); renderBoard(); });
  document.getElementById('segment').addEventListener('change', function (e) { state.segment = e.target.value; writeHash(); renderBoard(); });
  document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); renderBoard(); });
  document.getElementById('tab-pre').addEventListener('click', function () { state.tab = 'pre'; writeHash(); render(); });
  document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; writeHash(); render(); });
  document.getElementById('clear-filters').addEventListener('click', function () {
    state.q = ''; state.category = 'all'; state.segment = 'all'; state.chain = 'all';
    document.getElementById('q').value = '';
    document.getElementById('category').value = 'all';
    document.getElementById('segment').value = 'all';
    document.getElementById('chain').value = 'all';
    writeHash(); renderBoard();
  });
  Array.prototype.forEach.call(document.querySelectorAll('#board-table thead th button'), function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-sort');
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
      renderBoard();
    });
  });

  readHash();
  fillFacts();
  fillFilters();
  render();
  if (state.selected) openDetail(state.selected);
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
