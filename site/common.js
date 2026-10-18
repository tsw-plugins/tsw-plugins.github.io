"use strict";
// Shared by the session list and the session page: where the master is,
// fetching from it, escaping text.

// The master's address. `?master=https://…` overrides it (kept for the
// visit in sessionStorage), e.g. a self-hosted master or a local test.
const DEFAULT_MASTER = "https://tsw-coop-master.minopia.de";

function masterUrl() {
  const given = new URLSearchParams(location.search).get("master");
  try {
    if (given) sessionStorage.setItem("master", given);
    return (given || sessionStorage.getItem("master") || DEFAULT_MASTER).replace(/\/+$/, "");
  } catch (_) {
    return (given || DEFAULT_MASTER).replace(/\/+$/, "");
  }
}

/// GET a JSON document from the master; throws with a readable message.
async function fromMaster(path) {
  const url = masterUrl() + path;
  let res;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (e) {
    throw new Error(`the session list (${masterUrl()}) cannot be reached`);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `the session list answered ${res.status}`);
  }
  return body;
}

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/// `/RhineRuhr/Map/RhineRuhr_P` → `RhineRuhr`.
function routeName(route) {
  return (route || "").split("/").filter(Boolean)[0] || route || "?";
}

/// A link that keeps the `?master=` override.
function pageLink(page, params) {
  const q = new URLSearchParams(params);
  const given = new URLSearchParams(location.search).get("master");
  if (given) q.set("master", given);
  return `${page}?${q}`;
}

/// `k7q4zm`, `K7Q-4ZM`, `k7q 4zm` → `K7Q-4ZM` (O→0, I/L→1 as the master does).
function normaliseCode(text) {
  const raw = String(text || "").toUpperCase().replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0").replace(/[IL]/g, "1");
  return raw.length === 6 ? `${raw.slice(0, 3)}-${raw.slice(3)}` : null;
}

/// The header's "go to a session by its code" box.
function codeForm() {
  const form = document.getElementById("codeForm");
  if (!form) return;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = normaliseCode(document.getElementById("codeInput").value);
    if (!code) {
      document.getElementById("codeInput").setCustomValidity("6 characters, like K7Q-4ZM");
      document.getElementById("codeInput").reportValidity();
      return;
    }
    location.href = pageLink("session.html", { code });
  });
  document.getElementById("codeInput").addEventListener("input", (e) => e.target.setCustomValidity(""));
}
