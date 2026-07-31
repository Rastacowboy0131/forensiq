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
  var statbar = document.getElementById("statbar");
  var breakdownEl = document.getElementById("breakdown");
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

  function addStat(k, v) {
    var d = document.createElement("div");
    d.className = "stat";
    var ke = document.createElement("div"); ke.className = "k"; ke.textContent = k;
    var ve = document.createElement("div"); ve.className = "v"; ve.textContent = v;
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

  function renderResult(data) {
    verdictEl.className = "panel verdict-panel tier-" + data.tier;
    verdictLine.textContent = "VERDICT: " + data.tier +
      (data.score != null ? " · " + data.score + "/100" : "") +
      " - " + data.total_flags + " FLAG" + (data.total_flags === 1 ? "" : "S");
    var name = data.name ? data.name + " " : "";
    verdictSub.textContent = name + data.address + " on " + data.chain +
      (data.hard_flags && data.hard_flags.length ? " · HARD FLAGS FORCE AVOID" : "");
    summaryEl.textContent = data.summary || "";

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
      show(statbar);
    } else {
      hide(statbar);
    }

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
    show(result);
  }

  function addLi(ul, text, cls) {
    var li = document.createElement("li");
    li.className = cls;
    li.textContent = text;
    ul.appendChild(li);
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
    hide(errBox); hide(result);
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
})();
