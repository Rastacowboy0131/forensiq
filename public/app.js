(function () {
  "use strict";
  var form = document.getElementById("scan-form");
  var btn = document.getElementById("scan-btn");
  var loading = document.getElementById("loading");
  var errBox = document.getElementById("error");
  var result = document.getElementById("result");
  var verdictEl = document.getElementById("verdict");
  var verdictLine = document.getElementById("verdict-line");
  var verdictSub = document.getElementById("verdict-sub");
  var summaryEl = document.getElementById("summary");
  var confFill = document.getElementById("conf-fill");
  var confNum = document.getElementById("conf-num");
  var statbar = document.getElementById("statbar");
  var breakdownEl = document.getElementById("breakdown");
  var chartWrap = document.getElementById("chart-wrap");
  var honeypotEl = document.getElementById("honeypot");
  var sectionsEl = document.getElementById("sections");
  var historyEl = document.getElementById("history");
  var dotsEl = document.getElementById("dots");
  var dotsTimer = null;
  var ORDER = ["CHART", "CONTRACT/HOLDERS", "GITHUB", "SITE", "SOCIALS"];

  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  function startDots() {
    var n = 0;
    dotsTimer = setInterval(function () {
      n = (n + 1) % 4;
      dotsEl.textContent = new Array(n + 1).join(".");
    }, 500);
  }
  function stopDots() { clearInterval(dotsTimer); dotsEl.textContent = ""; }

  function fmtUsd(v) {
    v = parseFloat(v);
    if (isNaN(v)) return "?";
    if (v >= 1e6) return "$" + (v / 1e6).toFixed(2) + "M";
    if (v >= 1e3) return "$" + (v / 1e3).toFixed(1) + "K";
    return "$" + v.toFixed(0);
  }

  function addStat(k, v, cls) {
    var d = document.createElement("div");
    d.className = "stat";
    var ke = document.createElement("div"); ke.className = "k"; ke.textContent = k;
    var ve = document.createElement("div"); ve.className = "v" + (cls ? " " + cls : "");
    ve.textContent = v;
    d.appendChild(ke); d.appendChild(ve);
    statbar.appendChild(d);
  }

  function addBreakdownItem(kind, icon, text, sec) {
    var d = document.createElement("div");
    d.className = "item " + kind + "-item";
    var i = document.createElement("span"); i.className = "icon"; i.textContent = icon;
    var body = document.createElement("div");
    body.appendChild(document.createTextNode(text));
    var s = document.createElement("span"); s.className = "sec"; s.textContent = sec;
    body.appendChild(s);
    d.appendChild(i); d.appendChild(body);
    breakdownEl.appendChild(d);
  }

  function renderChart(m) {
    chartWrap.innerHTML = "";
    if (m && m.pair_addr) {
      var f = document.createElement("iframe");
      f.src = "https://dexscreener.com/robinhood/" + m.pair_addr +
        "?embed=1&theme=dark&trades=0&info=0";
      f.loading = "lazy";
      chartWrap.appendChild(f);
    } else {
      var p = document.createElement("p");
      p.className = "dim";
      p.textContent = "no pair data for chart";
      chartWrap.appendChild(p);
    }
  }

  function renderHoneypot(data) {
    honeypotEl.innerHTML = "";
    var s = (data.sections || {})["CONTRACT/HOLDERS"] || {};
    var hard = s.hard_flags || [];
    var flags = s.flags || [];
    var findings = s.findings || [];

    var box = document.createElement("div");
    var main = document.createElement("div");
    main.className = "hp-main";
    var sub = document.createElement("div");
    sub.className = "hp-sub";
    if (hard.length) {
      box.className = "hp-status bad";
      main.textContent = "CONTRACT CHECK: FAILED";
      sub.textContent = hard[0];
    } else if (flags.length) {
      box.className = "hp-status warn";
      main.textContent = "CONTRACT CHECK: WARNINGS";
      sub.textContent = flags[0];
    } else {
      box.className = "hp-status";
      main.textContent = "CONTRACT CHECK: PASSED";
      sub.textContent = "no honeypot or contract red flags detected";
    }
    var wrap = document.createElement("div");
    wrap.appendChild(main); wrap.appendChild(sub);
    box.appendChild(wrap);
    honeypotEl.appendChild(box);

    var ul = document.createElement("ul");
    findings.slice(0, 6).forEach(function (f) {
      var li = document.createElement("li");
      li.textContent = f;
      ul.appendChild(li);
    });
    honeypotEl.appendChild(ul);
  }

  function renderResult(data) {
    result.classList.remove("pre-scan");
    verdictEl.className = "panel verdict-panel tier-" + data.tier;
    verdictLine.textContent = "VERDICT: " + data.tier +
      " - " + data.total_flags + " FLAG" + (data.total_flags === 1 ? "" : "S");
    var name = data.name ? data.name + " " : "";
    verdictSub.textContent = name + data.address + " on " + data.chain +
      (data.hard_flags && data.hard_flags.length ? " · HARD FLAGS FORCE AVOID" : "");
    summaryEl.textContent = data.summary || "";

    var score = data.score != null ? data.score : 0;
    confFill.style.width = "0";
    confNum.textContent = score + "/100";
    setTimeout(function () { confFill.style.width = score + "%"; }, 50);

    // Stat bar.
    statbar.innerHTML = "";
    var m = data.market || {};
    if (m.mcap || m.liq) {
      addStat("Market Cap", fmtUsd(m.mcap));
      addStat("Liquidity", fmtUsd(m.liq));
      addStat("Vol 24h", fmtUsd(m.vol24));
      addStat("Txns 24h", (m.buys24 || 0) + "/" + (m.sells24 || 0));
      if (m.age_days != null) {
        addStat("Age", m.age_days >= 2 ? Math.round(m.age_days) + " days"
          : (m.age_days * 24).toFixed(1) + " hrs");
      }
      addStat("Risk Score", (100 - score) + "/100",
        score >= 60 ? "risk-low" : (score >= 35 ? "risk-mid" : "risk-high"));
      show(statbar);
    } else {
      hide(statbar);
    }

    renderChart(m);
    renderHoneypot(data);

    // Plain-english breakdown: hard flags, flags, then goods, tagged by section.
    breakdownEl.innerHTML = "";
    ORDER.forEach(function (key) {
      var s = (data.sections || {})[key];
      if (!s) return;
      (s.hard_flags || []).forEach(function (f) { addBreakdownItem("hard", "✖", f, key); });
    });
    ORDER.forEach(function (key) {
      var s = (data.sections || {})[key];
      if (!s) return;
      (s.flags || []).forEach(function (f) { addBreakdownItem("flag", "⚠", f, key); });
    });
    ORDER.forEach(function (key) {
      var s = (data.sections || {})[key];
      if (!s) return;
      (s.good || []).forEach(function (f) { addBreakdownItem("good", "✔", f, key); });
    });
    if (!breakdownEl.children.length) {
      addBreakdownItem("good", "·", "no notable signals either way", "");
    }

    // Full scan log.
    sectionsEl.innerHTML = "";
    ORDER.forEach(function (key) {
      var s = (data.sections || {})[key];
      if (!s) return;
      var div = document.createElement("div");
      div.className = "section";
      var h = document.createElement("h3");
      h.textContent = key;
      div.appendChild(h);
      var ul = document.createElement("ul");
      (s.hard_flags || []).forEach(function (f) { addLi(ul, f, "hard"); });
      (s.flags || []).forEach(function (f) { addLi(ul, f, "flag"); });
      (s.good || []).forEach(function (f) { addLi(ul, f, "good"); });
      (s.findings || []).forEach(function (f) { addLi(ul, f, "finding"); });
      if (!ul.children.length) addLi(ul, "nothing found", "finding");
      div.appendChild(ul);
      sectionsEl.appendChild(div);
    });
    if (data.cached) {
      var note = document.createElement("p");
      note.className = "cached-note";
      note.textContent = "cached result (scans cache for 10 minutes)";
      sectionsEl.appendChild(note);
    }
    if (data.permalink || data.id) {
      var pl = document.createElement("p");
      pl.className = "cached-note";
      var a = document.createElement("a");
      a.className = "permalink";
      a.href = data.permalink || ("/r/" + data.id);
      a.textContent = "permalink to this report";
      pl.appendChild(a);
      sectionsEl.appendChild(pl);
    }
    show(result);
  }

  function addLi(ul, text, cls) {
    var li = document.createElement("li");
    li.className = cls;
    li.textContent = text;
    ul.appendChild(li);
  }

  var SECTION_DESCS = {
    "CHART": "market data: mcap, liquidity, volume, txns, pair age, wash-trade heuristics",
    "CONTRACT/HOLDERS": "honeypot check, taxes, ownership, mint authority, holder concentration, sniper clusters",
    "GITHUB": "repo discovery, commit history forensics, backdating and burst-commit detection",
    "SITE": "website substance, SPA and template detection, dead-link checks",
    "SOCIALS": "twitter presence, account age, engagement quality"
  };

  function skelBars(el, n) {
    for (var i = 0; i < n; i++) {
      var b = document.createElement("div");
      b.className = "skel-bar";
      b.style.width = (50 + ((i * 17) % 40)) + "%";
      el.appendChild(b);
    }
  }

  function renderSkeleton(scanning) {
    result.classList.add("pre-scan");
    verdictEl.className = "panel verdict-panel pre";
    verdictLine.textContent = scanning ? "VERDICT: SCANNING..." : "VERDICT: AWAITING SCAN";
    verdictSub.textContent = scanning
      ? "running full forensic scan, sections below fill in when it completes"
      : "paste a contract address above to run a full forensic scan";
    summaryEl.textContent = "";
    confFill.style.width = "0";
    confNum.textContent = "--/100";

    statbar.innerHTML = "";
    ["Market Cap", "Liquidity", "Vol 24h", "Txns 24h", "Age", "Risk Score"]
      .forEach(function (k) { addStat(k, "--"); });
    show(statbar);

    chartWrap.innerHTML = "";
    var cp = document.createElement("p");
    cp.className = "dim";
    cp.textContent = "price chart loads after scan";
    chartWrap.appendChild(cp);

    honeypotEl.innerHTML = "";
    var box = document.createElement("div");
    box.className = "hp-status pending";
    var wrap = document.createElement("div");
    var main = document.createElement("div");
    main.className = "hp-main";
    main.textContent = scanning ? "CONTRACT CHECK: RUNNING" : "CONTRACT CHECK: PENDING";
    var sub = document.createElement("div");
    sub.className = "hp-sub";
    sub.textContent = "honeypot, buy/sell taxes, ownership, holder concentration";
    wrap.appendChild(main); wrap.appendChild(sub);
    box.appendChild(wrap);
    honeypotEl.appendChild(box);

    breakdownEl.innerHTML = "";
    skelBars(breakdownEl, 5);

    sectionsEl.innerHTML = "";
    ORDER.forEach(function (key) {
      var div = document.createElement("div");
      div.className = "section";
      var h = document.createElement("h3");
      h.textContent = key;
      div.appendChild(h);
      var ul = document.createElement("ul");
      addLi(ul, SECTION_DESCS[key] || "awaiting scan", "finding");
      div.appendChild(ul);
      sectionsEl.appendChild(div);
    });
    show(result);
  }

  function loadHistory() {
    fetch("/api/history").then(function (r) { return r.json(); }).then(function (items) {
      historyEl.innerHTML = "";
      (items || []).slice(0, 15).forEach(function (it) {
        var li = document.createElement("li");
        var tier = document.createElement("span");
        tier.className = "h-tier t-" + it.tier;
        tier.textContent = it.tier + (it.score != null ? " " + it.score : "");
        var nm = document.createElement("span");
        nm.className = "h-name";
        nm.textContent = it.name || "";
        var addr = document.createElement("span");
        addr.className = "h-addr";
        addr.textContent = it.address;
        li.appendChild(tier); li.appendChild(nm); li.appendChild(addr);
        li.addEventListener("click", function () {
          if (it.id) { window.location.href = "/r/" + it.id; return; }
          document.getElementById("address").value = it.address;
          form.dispatchEvent(new Event("submit"));
        });
        historyEl.appendChild(li);
      });
    }).catch(function () {});
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var address = document.getElementById("address").value.trim();
    if (!address) return;
    var payload = {
      address: address,
      chain: document.getElementById("chain").value,
      github: document.getElementById("github").value.trim() || undefined,
      site: document.getElementById("site").value.trim() || undefined,
      twitter: document.getElementById("twitter").value.trim() || undefined
    };
    hide(errBox);
    renderSkeleton(true);
    show(loading); startDots();
    btn.disabled = true;

    fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, body: j }; });
    }).then(function (res) {
      if (!res.ok) throw new Error(res.body.error || "scan failed");
      renderResult(res.body);
      loadHistory();
    }).catch(function (err) {
      errBox.textContent = err.message || "scan failed";
      show(errBox);
    }).finally(function () {
      hide(loading); stopDots();
      btn.disabled = false;
    });
  });

  loadHistory();

  // Permalink route: /r/<id> loads a stored report.
  var m = window.location.pathname.match(/^\/r\/([a-f0-9]{12})$/);
  if (!m) renderSkeleton(false);
  if (m) {
    show(loading); startDots();
    fetch("/api/report/" + m[1]).then(function (r) {
      if (!r.ok) throw new Error("report not found");
      return r.json();
    }).then(function (data) {
      renderResult(data);
      if (data.address) document.getElementById("address").value = data.address;
    }).catch(function (err) {
      errBox.textContent = err.message;
      show(errBox);
    }).finally(function () {
      hide(loading); stopDots();
    });
  }
})();
