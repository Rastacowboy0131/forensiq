(function () {
  "use strict";
  var form = document.getElementById("scan-form");
  var btn = document.getElementById("scan-btn");
  var loading = document.getElementById("loading");
  var errBox = document.getElementById("error");
  var result = document.getElementById("result");
  var verdictEl = document.getElementById("verdict");
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

  function renderResult(data) {
    verdictEl.className = "tier-" + data.tier;
    verdictEl.innerHTML = "";
    verdictEl.appendChild(document.createTextNode("VERDICT: " + data.tier));
    var small = document.createElement("small");
    var name = data.name ? data.name + " " : "";
    small.textContent = name + data.address + " on " + data.chain + " (" +
      data.total_flags + " flag" + (data.total_flags === 1 ? "" : "s") +
      (data.hard_flags && data.hard_flags.length ? ", hard flags force AVOID" : "") + ")";
    verdictEl.appendChild(small);
    if (data.summary) {
      var sum = document.createElement("p");
      sum.className = "summary";
      sum.textContent = data.summary;
      verdictEl.appendChild(sum);
    }

    sectionsEl.innerHTML = "";
    ORDER.forEach(function (key) {
      var s = (data.sections || {})[key];
      if (!s) return;
      var div = document.createElement("div");
      div.className = "section";
      var h = document.createElement("h3");
      h.textContent = "== " + key + " ==";
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

  function ago(ts) {
    var s = Math.floor(Date.now() / 1000 - ts);
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  function loadHistory() {
    fetch("/api/history").then(function (r) { return r.json(); }).then(function (items) {
      historyEl.innerHTML = "";
      (items || []).forEach(function (it) {
        var li = document.createElement("li");
        var addr = document.createElement("span");
        addr.className = "addr";
        addr.textContent = (it.name ? it.name + " " : "") + it.address + " [" + it.chain + "]";
        var tier = document.createElement("span");
        tier.className = "tier tier-" + it.tier;
        tier.textContent = it.tier;
        var when = document.createElement("span");
        when.className = "when";
        when.textContent = ago(it.ts);
        li.appendChild(addr); li.appendChild(tier); li.appendChild(when);
        li.addEventListener("click", function () {
          document.getElementById("address").value = it.address;
          document.getElementById("chain").value = it.chain;
          form.dispatchEvent(new Event("submit"));
        });
        historyEl.appendChild(li);
      });
    }).catch(function () {});
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    hide(errBox); hide(result);
    var body = {
      address: document.getElementById("address").value.trim(),
      chain: document.getElementById("chain").value,
      github: document.getElementById("github").value.trim(),
      site: document.getElementById("site").value.trim(),
      twitter: document.getElementById("twitter").value.trim()
    };
    if (!body.address) return;
    btn.disabled = true;
    show(loading);
    startDots();
    fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (res) {
      if (!res.ok) throw new Error(res.j.error || "scan failed");
      renderResult(res.j);
      loadHistory();
    }).catch(function (err) {
      errBox.textContent = err.message || "scan failed";
      show(errBox);
    }).finally(function () {
      btn.disabled = false;
      hide(loading);
      stopDots();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });

  loadHistory();
})();
