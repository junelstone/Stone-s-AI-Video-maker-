"use strict";
/* Admin page: the platform owner manages customer accounts (tenants), activation keys,
   subscriptions, manual payments, users and passwords, and sees a business dashboard. */

const C = Object.assign({ unit:{one:"Shop",many:"Shops"}, roles:{owner:"Owner",manager:"Manager",staff:"Staff"}, tiers:{basic:"Basic",pro:"Pro",business:"Business"}, defaultTier:"pro", payMethods:["Mobile money","Cash","Bank transfer","Card","Free / gift"], phoneHint:"+…" }, window.ADMIN_CONFIG || {});

/* ---------- small helpers ---------- */
const $ = (s, el=document) => el.querySelector(s);
const h = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let LANG = (() => { try { return localStorage.getItem("admin-lang") || ((navigator.language||"").startsWith("fr") ? "fr" : "en"); } catch(e){ return "en"; } })();
// Optional French: define window.ADMIN_FR = { "English text": "Texte français", ... } in admin-fr.js
function t(s, vars){ let o = (LANG === "fr" && window.ADMIN_FR && ADMIN_FR[s]) || s; if (vars) o = o.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? ""); return o; }
function setLang(l){ LANG = l; try { localStorage.setItem("admin-lang", l); } catch(e){} document.documentElement.lang = l; }
const locale = () => LANG === "fr" ? "fr-FR" : undefined;
const langSwitch = () => window.ADMIN_FR ? `<div class="lang"><button type="button" data-lang="en" class="${LANG==="en"?"on":""}">EN</button><button type="button" data-lang="fr" class="${LANG==="fr"?"on":""}">FR</button></div>` : "";
const num = (v, d=2) => { const n = Number(v); return isFinite(n) ? n.toLocaleString(locale(),{maximumFractionDigits:d}) : "–"; };
const dt = iso => iso ? new Date(iso).toLocaleString(locale(),{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}) : "–";
const dOnly = iso => iso ? new Date(iso.length===10 ? iso+"T12:00:00" : iso).toLocaleDateString(locale(),{day:"2-digit",month:"short",year:"numeric"}) : "–";
const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; };
const daysLeft = iso => Math.ceil((new Date(iso) - Date.now())/86400000);
const errMsg = e => (e && (e.message || e.error_description)) || String(e);
const waLink = (phone, text) => `https://wa.me/${String(phone||"").replace(/[^0-9]/g,"")}?text=${encodeURIComponent(text)}`;
let toastT;
function toast(msg){ let el = $(".toast"); if (!el){ el = document.createElement("div"); el.className = "toast"; el.setAttribute("role","status"); document.body.appendChild(el); } el.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 4000); }
function modal(html){ $("#overlay").innerHTML = `<div class="modal-bg" data-close="1"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`; const f = $("#overlay input,#overlay select"); if (f) f.focus(); }
function closeModal(){ $("#overlay").innerHTML = ""; }
async function copyText(x){ try { await navigator.clipboard.writeText(x); toast(t("Copied")); } catch(e){ toast(t("Select the text and copy it by hand.")); } }
let xlsxP;
const loadXlsx = () => window.XLSX ? Promise.resolve(window.XLSX) : (xlsxP = xlsxP || new Promise((ok, ko) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"; s.onload = () => ok(window.XLSX); s.onerror = () => { xlsxP = null; ko(new Error(t("Could not load the Excel tool."))); }; document.head.appendChild(s); }));

const configured = C.supabaseUrl && C.supabaseKey && !/YOUR_/.test(C.supabaseUrl + C.supabaseKey);
const sb = configured && window.supabase ? window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth:{ persistSession:true, autoRefreshToken:true } }) : null;

/* ---------- state & domain ---------- */
const AD = { session:null, rows:[], stats:{}, payments:[], settings:{}, q:"", filter:"all", open:null, members:{}, view:"list" };
const U1 = () => t(C.unit.one), UN = () => t(C.unit.many);
const PLAN = () => ({ trial:t("Free trial"), monthly:t("Monthly"), yearly:t("Yearly"), custom:t("Custom") });
const TIERS = () => Object.fromEntries(Object.entries(C.tiers).map(([k,v]) => [k, t(v)]));
const ROLES = () => Object.fromEntries(Object.entries(C.roles).map(([k,v]) => [k, t(v)]));
const tiers = () => AD.settings.tiers || {};
const tierOf = s => s.tier || C.defaultTier;
const tierPrice = (s, k) => (tiers()[tierOf(s)] || {})[k] || 0;
const money = v => `${num(v)} ${h(AD.settings.currency||"")}`;
const appUrl = () => C.appUrl || (location.origin + location.pathname.replace(/[^/]*$/, ""));
const brand = () => AD.settings.brand || C.appName || "";
function statusOf(s){
  if (s.status === "suspended") return ["suspended", t("Suspended"), "bad"];
  const d = daysLeft(s.expires_at);
  if (d <= 0) return ["expired", t("Expired"), "bad"];
  if (s.plan === "trial") return ["trial", t("Trial · {n} d", {n:d}), "info"];
  if (d <= 7) return ["soon", t("Ends in {n} d", {n:d}), "warn"];
  return ["active", t("Active"), "ok"];
}

/* ---------- boot & routing ---------- */
const logo = big => C.logo ? `<img class="app-logo" src="${h(C.logo)}" width="${big?56:36}" height="${big?56:36}" alt="">` : "";
function frame(inner){ return `<div class="auth-wrap"><div class="auth"><div class="row" style="justify-content:space-between"><div class="logo row">${logo(true)}<div><b>${t("Admin console")}</b><span>${h(C.appName||"")}</span></div></div>${langSwitch()}</div>${inner}</div></div>`; }
async function boot(){
  setLang(LANG);
  if (!sb){ $("#app").innerHTML = frame(`<div class="card"><h2>${t("Setup needed")}</h2><p>${t("Add the Supabase address and publishable key in admin-config.js.")}</p></div>`); return; }
  const { data } = await sb.auth.getSession(); AD.session = data.session;
  sb.auth.onAuthStateChange((ev, s) => { const ch = (s&&s.user.id) !== (AD.session&&AD.session.user.id); AD.session = s; if (ch) route(); });
  route();
}
async function route(){
  if (!AD.session){ $("#app").innerHTML = frame(`<form class="card" data-form="login"><h2>${t("Sign in")}</h2>
    <label>${t("Email")}<input id="lgEmail" type="email" required autocomplete="email"></label><label>${t("Password")}<input id="lgPass" type="password" required autocomplete="current-password"></label>
    <p class="err" id="lgErr"></p><button class="btn primary bigbtn" type="submit">${t("Sign in")}</button>
    <p class="small muted">${t("First time? Create your account in the app with the same email, then come back here.")} <a href="${h(appUrl())}">${t("Open the app")}</a></p></form>`); return; }
  const { data:isAdmin } = await sb.rpc("is_platform_admin");
  if (!isAdmin){ $("#app").innerHTML = frame(`<div class="card"><h2>${t("Not an admin account")}</h2><p>${t("Signed in as {e}.", {e:h(AD.session.user.email)})}</p>
    <p>${t("This account is not the platform owner. Sign out, then sign in with the owner account.")}</p>
    <div class="row"><button class="btn primary" data-act="signout">${t("Sign out")}</button><a class="btn" href="${h(appUrl())}">${t("Back to the app")}</a></div>
    <p class="small muted">${t("Setting up the platform for the first time? Only the very first account can claim it.")} <button class="btn sm" data-act="claim">${t("Claim platform owner")}</button></p></div>`); return; }
  await loadAll(); render();
}
async function loadAll(){
  const [s, st, p, ps] = await Promise.all([
    sb.from("tenants").select("*").order("created_at",{ascending:false}),
    sb.rpc("admin_tenant_stats"),
    sb.from("payments").select("*").order("paid_at",{ascending:false}).limit(2000),
    sb.from("platform_settings").select("*").eq("id",1).maybeSingle()
  ]);
  if (s.error) toast(errMsg(s.error));
  AD.rows = s.data||[]; AD.stats = Object.fromEntries((st.data||[]).map(r => [r.tenant_id, r])); AD.payments = p.data||[]; AD.settings = ps.data||{};
}
async function loadMembers(id){
  const { data, error } = await sb.rpc("admin_tenant_users", { p_tenant:id });
  AD.members[id] = error ? [] : (data||[]); if (error) toast(errMsg(error));
  if (AD.open === id) render();
}

/* ---------- main view ---------- */
function render(){
  const month = new Date(); month.setDate(1); month.setHours(0,0,0,0);
  const monthPays = AD.payments.filter(p => new Date(p.paid_at) >= month);
  const cnt = k => AD.rows.filter(s => statusOf(s)[0]===k).length, q = AD.q.toLowerCase();
  const rows = AD.rows.filter(s => (AD.filter==="all" || statusOf(s)[0]===AD.filter) && (!q || [s.name,s.owner_name,s.phone,s.email,s.city,s.license_key].join(" ").toLowerCase().includes(q)));
  $("#app").innerHTML = `<div class="page">
  <div class="topbar"><div class="logo row">${logo()}<div><h1>${t("Admin console")}</h1><span class="small muted">${h(AD.session.user.email)}</span></div></div>
    <div class="row">${langSwitch()}<a class="btn" href="${h(appUrl())}" target="_blank" rel="noopener">${t("Open the app")}</a><button class="btn" data-act="credits">${t("Add credits")}</button><button class="btn" data-act="settings">${t("Platform settings")}</button><button class="btn primary" data-act="newrow">${t("New {u}", {u:U1().toLowerCase()})}</button><button class="btn" data-act="signout">${t("Sign out")}</button></div></div>
  <div class="grid g4">
    <div class="card stat"><span class="k">${t("Paying")}</span><span class="v">${cnt("active")+cnt("soon")}</span><span class="s">${t("{n} on trial", {n:cnt("trial")})}</span></div>
    <div class="card stat"><span class="k">${t("Ending within 7 days")}</span><span class="v">${cnt("soon")}</span><span class="s">${t("remind them to renew")}</span></div>
    <div class="card stat"><span class="k">${t("Expired or suspended")}</span><span class="v">${cnt("expired")+cnt("suspended")}</span></div>
    <div class="card stat"><span class="k">${t("Received this month")}</span><span class="v">${money(monthPays.reduce((a,p)=>a+Number(p.amount||0),0))}</span><span class="s">${t("{n} payments", {n:monthPays.length})}</span></div>
  </div>
  <div class="row" style="justify-content:space-between"><div class="seg"><button data-act="view" data-v="list" class="${AD.view==="list"?"on":""}">${UN()}</button><button data-act="view" data-v="business" class="${AD.view==="business"?"on":""}">${t("Business dashboard")}</button></div>
    <button class="btn sm" data-act="export">${t("Export to Excel")}</button></div>
  ${AD.view === "business" ? businessView() : `${renewalsCard()}
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <div class="seg">${[["all",t("All")],["active",t("Active")],["trial",t("Trial")],["soon",t("Ending soon")],["expired",t("Expired")],["suspended",t("Suspended")]].map(([k,v])=>`<button data-act="filter" data-f="${k}" class="${AD.filter===k?"on":""}">${v}</button>`).join("")}</div>
      <input id="adQ" placeholder="${t("Search name, owner, phone, key")}" value="${h(AD.q)}" style="max-width:280px">
    </div>
    ${rows.length ? `<div class="tw"><table><thead><tr><th>${U1()}</th><th>${t("Owner")}</th><th>${t("Plan")}</th><th>${t("Valid until")}</th><th>${t("Status")}</th><th class="r">${t("Users")}</th><th>${t("Last sign-in")}</th><th></th></tr></thead><tbody>
    ${rows.map(s => { const st = statusOf(s), x = AD.stats[s.id]||{}; return `<tr><td><b>${h(s.name)}</b><br><span class="small muted">${h([s.city,s.country].filter(Boolean).join(", "))}</span></td><td>${h(s.owner_name)}<br><span class="small muted mono">${h(s.phone)}</span></td><td><b>${TIERS()[tierOf(s)]||h(s.tier)}</b><br><span class="small muted">${PLAN()[s.plan]||h(s.plan)}</span></td><td class="num">${dOnly(s.expires_at)}</td><td><span class="pill ${st[2]}">${st[1]}</span>${s.activated_at?"":` <span class="pill">${t("key not used yet")}</span>`}</td><td class="r num">${x.members??0}</td><td class="small">${x.last_activity?dt(x.last_activity):"–"}</td><td class="r"><button class="btn sm" data-act="open" data-id="${s.id}">${t("Manage")}</button></td></tr>`; }).join("")}
    </tbody></table></div>` : `<div class="empty"><p>${AD.rows.length ? t("Nothing matches.") : t("Nothing yet. Create the first one and send the owner their activation key.")}</p></div>`}
  </div>`}</div>
  ${AD.open ? drawer() : ""}`;
}

/* Trial or subscription ending within 7 days, or ended in the last 60 days. */
function renewalsCard(){
  const due = AD.rows.filter(s => { const d = daysLeft(s.expires_at); return s.status === "active" && d <= 7 && d > -60; }).sort((a,b) => a.expires_at.localeCompare(b.expires_at));
  if (!due.length) return "";
  return `<div class="card"><div class="card-h"><h2>${t("Renewals to chase")}</h2><p>${due.length}</p></div>
    <div class="tw"><table><tbody>${due.map(s => { const d = daysLeft(s.expires_at); return `<tr><td><b>${h(s.name)}</b><br><span class="small muted mono">${h(s.phone||"")}</span></td><td>${PLAN()[s.plan]||h(s.plan)}</td><td><span class="pill ${d<=0?"bad":"warn"}">${d<=0 ? t("ended {d}", {d:dOnly(s.expires_at)}) : t("in {n} d", {n:d})}</span></td>
      <td class="r"><div class="row end">${s.phone?`<a class="btn sm wa" target="_blank" rel="noopener" href="${h(waLink(s.phone, renewMsg(s)))}">${t("Remind on WhatsApp")}</a>`:""}<button class="btn sm" data-act="copyrenew" data-id="${s.id}">${t("Copy message")}</button><button class="btn sm" data-act="open" data-id="${s.id}">${t("Manage")}</button></div></td></tr>`; }).join("")}
    </tbody></table></div></div>`;
}
function renewMsg(s){
  const d = daysLeft(s.expires_at), p = AD.settings, cur = p.currency || "", o = s.owner_name||"";
  const prices = tierPrice(s,"monthly") ? `${TIERS()[tierOf(s)]} · ` + t("Monthly: {m} {c} · Yearly: {y} {c}", { m:num(tierPrice(s,"monthly")), y:num(tierPrice(s,"yearly")), c:cur }) : "";
  const head = d <= 0 ? t("Hello {o}, your {b} subscription for {n} ended on {d}. Your data is safe but you can no longer add new entries.", { o, b:brand(), n:s.name, d:dOnly(s.expires_at) })
    : s.plan === "trial" ? t("Hello {o}, your free trial of {b} for {n} ends on {d}.", { o, b:brand(), n:s.name, d:dOnly(s.expires_at) })
    : t("Hello {o}, your {b} subscription for {n} ends on {d}.", { o, b:brand(), n:s.name, d:dOnly(s.expires_at) });
  return [head, t("To renew, pay by mobile money and send us the transaction ID. We extend your access the same day."), prices, p.support_phone ? `${t("Phone")}: ${p.support_phone}` : ""].filter(Boolean).join("\n\n");
}
function welcomeMsg(s){
  return t("Hello {o}, welcome to {b}!\n\n1. Open {url}\n2. Create an account with your email and confirm it\n3. Enter your activation key: {k}\n\nYour access is valid until {d}.", { o:s.owner_name||"", b:brand(), url:appUrl(), k:s.license_key, d:dOnly(s.expires_at) });
}

/* ---------- business dashboard ---------- */
const monthKey = d => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const monthName = k => { const [y,m] = k.split("-").map(Number); return new Date(y, m-1, 1).toLocaleDateString(locale(), { month:"short", year:"2-digit" }); };
const monthlyValue = s => (s.status !== "active" || new Date(s.expires_at) <= new Date() || s.plan === "trial") ? 0 : s.plan === "yearly" ? tierPrice(s,"yearly")/12 : tierPrice(s,"monthly");
function businessView(){
  const now = new Date(), months = [];
  for (let i = 11; i >= 0; i--) months.push(monthKey(new Date(now.getFullYear(), now.getMonth()-i, 1)));
  const by = Object.fromEntries(months.map(k => [k, { rev:0, pays:0, added:0, lost:0 }]));
  AD.payments.forEach(p => { const k = monthKey(p.paid_at); if (by[k]){ by[k].rev += Number(p.amount||0); by[k].pays++; } });
  AD.rows.forEach(s => { const k = monthKey(s.created_at); if (by[k]) by[k].added++; const e = new Date(s.expires_at); if (e < now){ const ke = monthKey(e); if (by[ke]) by[ke].lost++; } });
  const paying = AD.rows.filter(s => monthlyValue(s) > 0), mrr = paying.reduce((a,s) => a + monthlyValue(s), 0);
  const yearK = String(now.getFullYear()), yearPays = AD.payments.filter(p => String(p.paid_at).startsWith(yearK));
  const everPaid = new Set(AD.payments.map(p => p.tenant_id)), started = AD.rows.filter(s => s.activated_at);
  const conv = started.length ? Math.round(100 * started.filter(s => everPaid.has(s.id)).length / started.length) : 0;
  const max = Math.max(1, ...months.map(k => by[k].rev));
  const totals = {}; AD.payments.forEach(p => totals[p.tenant_id] = (totals[p.tenant_id]||0) + Number(p.amount||0));
  const top = Object.entries(totals).sort((a,b) => b[1]-a[1]).slice(0,5).map(([id, v]) => [AD.rows.find(s => s.id === id), v]).filter(x => x[0]);
  return `<div class="grid g4">
    <div class="card stat"><span class="k">${t("Monthly recurring revenue")}</span><span class="v">${money(Math.round(mrr))}</span><span class="s">${t("{n} paying", {n:paying.length})}</span></div>
    <div class="card stat"><span class="k">${t("Received in {y}", {y:yearK})}</span><span class="v">${money(yearPays.reduce((a,p) => a + Number(p.amount||0), 0))}</span><span class="s">${t("{n} payments", {n:yearPays.length})}</span></div>
    <div class="card stat"><span class="k">${t("Average per paying customer")}</span><span class="v">${money(paying.length ? Math.round(mrr/paying.length) : 0)}</span><span class="s">${t("per month")}</span></div>
    <div class="card stat"><span class="k">${t("Trial to paid")}</span><span class="v">${conv}%</span><span class="s">${t("of activated accounts paid at least once")}</span></div>
  </div>
  <div class="card"><div class="card-h"><h2>${t("Money received per month")}</h2></div>
    <div class="mbars">${months.map(k => `<div class="mbar" title="${h(monthName(k))}: ${h(money(by[k].rev))}"><span class="bv small num">${by[k].rev ? num(Math.round(by[k].rev/1000)) + "k" : ""}</span><span class="bf" style="height:${Math.round(100*by[k].rev/max)}%"></span><span class="bl small muted">${h(monthName(k))}</span></div>`).join("")}</div></div>
  <div class="grid g2">
    <div class="card"><div class="card-h"><h2>${t("Month by month")}</h2></div><div class="tw"><table><thead><tr><th>${t("Month")}</th><th class="r">${t("Received")}</th><th class="r">${t("Payments")}</th><th class="r">${t("New")}</th><th class="r">${t("Ended, not renewed")}</th></tr></thead><tbody>
      ${months.slice().reverse().map(k => `<tr><td>${h(monthName(k))}</td><td class="r num">${money(by[k].rev)}</td><td class="r num">${by[k].pays}</td><td class="r num">${by[k].added}</td><td class="r num">${by[k].lost || "–"}</td></tr>`).join("")}</tbody></table></div></div>
    <div class="col">
      <div class="card"><div class="card-h"><h2>${t("By plan size")}</h2></div><div class="tw"><table><thead><tr><th>${t("Plan size")}</th><th class="r">${t("Paying")}</th><th class="r">${t("Per month")}</th></tr></thead><tbody>
        ${Object.entries(TIERS()).map(([k,n]) => { const ss = paying.filter(s => tierOf(s) === k); return `<tr><td>${n}</td><td class="r num">${ss.length}</td><td class="r num">${money(Math.round(ss.reduce((a,s) => a + monthlyValue(s), 0)))}</td></tr>`; }).join("")}</tbody></table></div></div>
      <div class="card"><div class="card-h"><h2>${t("Best customers")}</h2></div>${top.length ? `<div class="tw"><table><tbody>${top.map(([s,v]) => `<tr><td><b>${h(s.name)}</b><br><span class="small muted">${h(s.owner_name||"")}</span></td><td class="r num">${money(v)}</td><td class="r"><button class="btn sm" data-act="open" data-id="${s.id}">${t("Manage")}</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">${t("No payments yet.")}</p>`}</div>
    </div>
  </div>
  <p class="small muted">${t("Monthly recurring revenue counts active paying accounts: monthly plans at their monthly price, yearly plans at a twelfth of the yearly price. Trials are not counted.")}</p>`;
}
async function exportExcel(){
  const X = await loadXlsx(), wb = X.utils.book_new(), name = id => (AD.rows.find(s => s.id === id) || {}).name || "";
  const sh = (head, rows) => { const ws = X.utils.aoa_to_sheet([head].concat(rows)); ws["!cols"] = head.map(() => ({ wch:20 })); return ws; };
  X.utils.book_append_sheet(wb, sh([U1(), t("Owner"), t("Phone"), t("Email"), t("City"), t("Plan size"), t("Plan"), t("Status"), t("Valid until"), t("Created"), t("Activated"), t("Total paid"), t("Activation key")],
    AD.rows.map(s => [s.name, s.owner_name, s.phone, s.email, s.city, TIERS()[tierOf(s)], PLAN()[s.plan]||s.plan, statusOf(s)[1], dOnly(s.expires_at), dOnly(s.created_at), s.activated_at ? dOnly(s.activated_at) : "", AD.payments.filter(p => p.tenant_id === s.id).reduce((a,p) => a + Number(p.amount||0), 0), s.license_key])), UN().slice(0,31));
  X.utils.book_append_sheet(wb, sh([t("Date"), U1(), t("Amount"), t("Method"), t("Period"), t("Valid until"), t("Note")],
    AD.payments.map(p => [dOnly(p.paid_at), name(p.tenant_id), Number(p.amount||0), p.method, p.period, p.new_expires_at ? dOnly(p.new_expires_at) : "", p.note])), t("Payments").slice(0,31));
  X.writeFile(wb, `admin-${new Date().toISOString().slice(0,10)}.xlsx`);
}

/* ---------- one account: drawer ---------- */
function drawer(){
  const s = AD.rows.find(x => x.id === AD.open); if (!s) return "";
  const st = statusOf(s), pays = AD.payments.filter(p => p.tenant_id === s.id);
  const base = new Date(Math.max(Date.now(), new Date(s.expires_at)));
  const plus = m => { const d = new Date(base); d.setMonth(d.getMonth()+m); return dayKey(d); };
  const plusDays = n => { const d = new Date(base); d.setDate(d.getDate()+n); return dayKey(d); };
  return `<div class="drawer-bg" data-act="close"></div><aside class="drawer" role="dialog" aria-modal="true">
    <div class="card-h"><h2>${h(s.name)}</h2><button class="btn sm" data-act="close">${t("Close")}</button></div>
    <div class="row"><span class="pill ${st[2]}">${st[1]}</span><span class="small muted">${t("Valid until {d}", {d:dOnly(s.expires_at)})} · ${TIERS()[tierOf(s)]} · ${PLAN()[s.plan]}</span></div>
    <div class="card"><div class="card-h"><h3>${t("Activation key")}</h3></div>
      <span class="keycode">${h(s.license_key)}</span>
      <div class="row"><button class="btn sm" data-act="copykey" data-id="${s.id}">${t("Copy key")}</button><button class="btn sm" data-act="copymsg" data-id="${s.id}">${t("Copy welcome message")}</button>
      ${s.phone?`<a class="btn sm wa" target="_blank" rel="noopener" href="${h(waLink(s.phone, welcomeMsg(s)))}">${t("Send on WhatsApp")}</a>`:""}
      <button class="btn sm danger" data-act="regen" data-id="${s.id}">${t("New key")}</button></div>
      <p class="small muted">${s.activated_at ? t("Activated on {d}. A key creates one owner account only.", {d:dOnly(s.activated_at)}) : t("Not activated yet.")}</p>
    </div>
    ${usersCard(s)}
    <form class="card" data-form="extend" data-id="${s.id}"><div class="card-h"><h3>${t("Record a payment and extend")}</h3></div>
      <div class="row"><button type="button" class="btn sm" data-act="preset" data-until="${plusDays(7)}" data-amount="${AD.settings.weekly_price||""}" data-plan="custom">+1 ${t("week")}</button><button type="button" class="btn sm" data-act="preset" data-until="${plus(1)}" data-amount="${tierPrice(s,"monthly")||""}" data-plan="monthly">+1 ${t("month")}</button><button type="button" class="btn sm" data-act="preset" data-until="${plus(3)}" data-amount="${tierPrice(s,"monthly")*3||""}" data-plan="monthly">+3 ${t("months")}</button><button type="button" class="btn sm" data-act="preset" data-until="${plus(12)}" data-amount="${tierPrice(s,"yearly")||""}" data-plan="yearly">+1 ${t("year")}</button></div>
      <div class="fields">
        <label>${t("Valid until")}<input id="exUntil" type="date" value="${plus(1)}" required></label>
        <label>${t("Plan")}<select id="exPlan">${Object.entries(PLAN()).map(([k,v])=>`<option value="${k}" ${k===(s.plan==="trial"?"monthly":s.plan)?"selected":""}>${v}</option>`).join("")}</select></label>
        <label>${t("Amount received")}<input id="exAmount" type="number" min="0" step="any" value="${tierPrice(s,"monthly")||""}"></label>
        <label>${t("Method")}<select id="exMethod">${C.payMethods.map(m=>`<option>${h(t(m))}</option>`).join("")}</select></label>
        <label>${t("Reference / note")}<input id="exNote" placeholder="${t("e.g. transaction ID")}"></label>
      </div>
      <div class="row end"><button class="btn primary" type="submit">${t("Save payment")}</button></div></form>
    <form class="card" data-form="edit" data-id="${s.id}"><div class="card-h"><h3>${t("Details")}</h3></div>
      <div class="fields">${detailFields(s)}</div>
      <label>${t("Private notes")}<textarea id="fNotes" rows="2">${h(s.notes)}</textarea></label>
      <div class="row" style="justify-content:space-between"><button type="button" class="btn ${s.status==="active"?"danger":""}" data-act="suspend" data-id="${s.id}">${s.status==="active"?t("Suspend"):t("Reactivate")}</button><button class="btn primary" type="submit">${t("Save details")}</button></div></form>
    <div class="card"><div class="card-h"><h3>${t("Payments")}</h3></div>${pays.length ? `<div class="tw"><table><thead><tr><th>${t("Date")}</th><th class="r">${t("Amount")}</th><th>${t("Method")}</th><th>${t("Valid until")}</th></tr></thead><tbody>${pays.map(p=>`<tr><td>${dOnly(p.paid_at)}</td><td class="r num">${money(p.amount)}</td><td>${h(p.method)}${p.note?`<br><span class="small muted">${h(p.note)}</span>`:""}</td><td>${dOnly(p.new_expires_at)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted small">${t("No payments yet.")}</p>`}</div>
  </aside>`;
}
function detailFields(s){
  s = s || { currency:AD.settings.currency||"", tier:C.defaultTier };
  return `<label>${t("Name")}<input id="fName" value="${h(s.name)}" required></label>
    <label>${t("Owner name")}<input id="fOwner" value="${h(s.owner_name)}"></label>
    <label>${t("Phone / WhatsApp")}<input id="fPhone" value="${h(s.phone)}" placeholder="${h(C.phoneHint)}"></label>
    <label>${t("Email")}<input id="fEmail" type="email" value="${h(s.email)}"></label>
    <label>${t("City")}<input id="fCity" value="${h(s.city)}"></label>
    <label>${t("Country")}<input id="fCountry" value="${h(s.country)}"></label>
    <label>${t("Currency")}<input id="fCur" value="${h(s.currency)}"></label>
    <label>${t("Plan size")}<select id="fTier">${Object.entries(TIERS()).map(([k,v]) => `<option value="${k}" ${k===tierOf(s)?"selected":""}>${v} · ${num((tiers()[k]||{}).monthly||0)} ${h(AD.settings.currency||"")}/${t("month")}</option>`).join("")}</select></label>`;
}
const detailRow = () => ({ name:v("fName"), owner_name:v("fOwner"), phone:v("fPhone"), email:v("fEmail"), city:v("fCity"), country:v("fCountry"), currency:v("fCur"), tier:v("fTier") });

/* ---------- users & passwords ---------- */
function usersCard(s){
  const mem = AD.members[s.id], R = ROLES();
  const list = !mem ? `<p class="muted small">${t("Loading…")}</p>` : !mem.length ? `<p class="muted small">${t("Nobody has activated this account yet.")}</p>`
    : `<div class="tw"><table><tbody>${mem.map(m => `<tr><td><b>${h(m.display_name)}</b> <span class="pill">${R[m.role]||h(m.role)}</span>${m.active?"":` <span class="pill bad">${t("disabled")}</span>`}${m.confirmed===false?` <span class="pill warn">${t("email not confirmed")}</span>`:""}
        <br><span class="small mono">${h(m.email)}</span>${m.last_sign_in?`<br><span class="small muted">${t("Last sign-in")}: ${dt(m.last_sign_in)}</span>`:""}
        <div class="row" style="margin-top:6px;gap:6px"><button class="btn sm" data-act="upass" data-t="${s.id}" data-uid="${m.user_id}">${t("New password")}</button><button class="btn sm" data-act="uemail" data-t="${s.id}" data-uid="${m.user_id}">${t("Change email")}</button><button class="btn sm" data-act="uedit" data-t="${s.id}" data-uid="${m.user_id}">${t("Edit")}</button></div></td></tr>`).join("")}</tbody></table></div>`;
  return `<div class="card"><div class="card-h"><h3>${t("Users and passwords")}</h3></div>${list}
    <div class="row"><button class="btn sm primary" data-act="uadd" data-t="${s.id}">${t("Add a person")}</button></div>
    <p class="small muted">${t("Accounts you create or change here work at once, without a confirmation email.")}</p></div>`;
}
const genPass = () => { const a = "abcdefghjkmnpqrstuvwxyz23456789", b = new Uint32Array(8); crypto.getRandomValues(b); return [...b].map(n => a[n % a.length]).join(""); };
const passField = id => `<label>${t("Password")}<span class="row" style="flex-wrap:nowrap"><input id="${id}" type="text" minlength="6" required autocomplete="off" value="${genPass()}" style="flex:1"><button type="button" class="btn sm" data-act="genpass" data-for="${id}">${t("Generate")}</button></span></label>`;
const phoneField = id => `<label>${t("Phone / WhatsApp")} <span class="muted small">(${t("optional, to send the login")})</span><input id="${id}" placeholder="${h(C.phoneHint)}"></label>`;
const memberOf = (tid, uid) => (AD.members[tid]||[]).find(m => m.user_id === uid);
function loginDone(s, email, pass, phone){
  const msg = t("Your {b} login for {n}:\n\nWebsite: {url}\nEmail: {e}\nPassword: {p}", { b:brand(), n:s.name, url:appUrl(), e:email, p:pass });
  modal(`<h2>${t("Login ready")}</h2><p class="small muted">${t("Give these details to the person. The password is not shown again.")}</p>
    <div class="card"><div><span class="muted small">${t("Email")}</span><br><b class="mono">${h(email)}</b></div><div><span class="muted small">${t("Password")}</span><br><b class="keycode">${h(pass)}</b></div></div>
    <div class="row end"><button class="btn" data-act="copylogin" data-msg="${h(msg)}">${t("Copy message")}</button>${String(phone||"").replace(/[^0-9]/g,"")?`<a class="btn wa" target="_blank" rel="noopener" href="${h(waLink(phone, msg))}">${t("Send on WhatsApp")}</a>`:""}<button class="btn primary" data-closebtn="1">${t("Close")}</button></div>`);
}
const footer = label => `<div class="row end"><button type="button" class="btn" data-closebtn="1">${t("Cancel")}</button><button class="btn primary" type="submit">${label}</button></div>`;
function addUserModal(tid){
  const hasOwner = (AD.members[tid]||[]).some(m => m.role === "owner"), R = ROLES(), def = hasOwner ? Object.keys(R).slice(-1)[0] : "owner";
  modal(`<form data-form="uadd" data-t="${tid}"><h2>${t("Add a person")}</h2><div class="fields">
      <label>${t("Name")}<input id="uaName" required></label><label>${t("Email")}<input id="uaEmail" type="email" required autocomplete="off"></label>${passField("uaPass")}
      <label>${t("Role")}<select id="uaRole">${Object.entries(R).filter(([k]) => !(hasOwner && k==="owner")).map(([k,v]) => `<option value="${k}" ${k===def?"selected":""}>${v}</option>`).join("")}</select></label>${phoneField("uaPhone")}
    </div>${footer(t("Create login"))}</form>`);
}
function passModal(tid, uid){ const m = memberOf(tid, uid); if (!m) return;
  modal(`<form data-form="upass" data-t="${tid}" data-uid="${uid}"><h2>${t("New password")}</h2><p>${h(m.display_name)} · <span class="mono">${h(m.email)}</span></p>
    <div class="fields">${passField("upPass")}${phoneField("upPhone")}</div><p class="small muted">${t("The old password stops working at once.")}</p>${footer(t("Set password"))}</form>`); }
function emailModal(tid, uid){ const m = memberOf(tid, uid); if (!m) return;
  modal(`<form data-form="uemail" data-t="${tid}" data-uid="${uid}"><h2>${t("Change email")}</h2><p>${h(m.display_name)}</p>
    <div class="fields"><label>${t("New email")}<input id="ueEmail" type="email" required value="${h(m.email)}" autocomplete="off"></label></div>
    <p class="small muted">${t("The person signs in with the new email from now on. Their password does not change.")}</p>${footer(t("Save"))}</form>`); }
function editUserModal(tid, uid){ const m = memberOf(tid, uid); if (!m) return;
  modal(`<form data-form="uedit" data-t="${tid}" data-uid="${uid}"><h2>${t("Edit")} · ${h(m.display_name)}</h2><div class="fields">
      <label>${t("Name")}<input id="uedName" value="${h(m.display_name)}" required></label>
      <label>${t("Role")}<select id="uedRole">${Object.entries(ROLES()).map(([k,v]) => `<option value="${k}" ${k===m.role?"selected":""}>${v}</option>`).join("")}</select></label>
      <label class="check"><input id="uedActive" type="checkbox" ${m.active?"checked":""}> ${t("Can sign in")}</label></div>${footer(t("Save"))}</form>`); }
function newModal(){
  modal(`<form data-form="new"><h2>${t("New {u}", {u:U1().toLowerCase()})}</h2><div class="fields">${detailFields()}
      <label>${t("Start with")}<select id="fPlan"><option value="trial">${t("Free trial ({n} days)", {n:AD.settings.trial_days??14})}</option><option value="monthly">${t("1 month (paid)")}</option><option value="yearly">${t("1 year (paid)")}</option></select></label>
    </div>${footer(t("Create and get key"))}</form>`);
}
/* Credit packs bought by app users (no subscription). */
const PACKS = (window.ADMIN_CONFIG && ADMIN_CONFIG.creditPacks) || [];
async function creditsModal(){
  modal(`<form data-form="credits"><h2>${t("Add credits")}</h2><p class="small muted">${t("For a customer who bought a credit pack. They must already have an account in the app.")}</p>
    ${PACKS.length ? `<div class="row">${PACKS.map(p => `<button type="button" class="btn sm" data-act="pack" data-c="${p.credits}" data-p="${p.price}">${p.credits} · ${num(p.price)} ${h(AD.settings.currency||"")}</button>`).join("")}</div>` : ""}
    <div class="fields">
      <label>${t("Customer email")}<input id="crEmail" type="email" required autocomplete="off"></label>
      <label>${t("Credits")}<input id="crCredits" type="number" step="1" required></label>
      <label>${t("Amount received")}<input id="crPaid" type="number" min="0" step="any"></label>
      <label>${t("Method")}<select id="crMethod">${C.payMethods.map(m=>`<option>${h(t(m))}</option>`).join("")}</select></label>
      <label>${t("Reference / note")}<input id="crNote" placeholder="${t("e.g. transaction ID")}"></label>
    </div>${footer(t("Add credits"))}
    <div id="crSales"><p class="small muted">${t("Loading…")}</p></div></form>`);
  const { data, error } = await sb.rpc("admin_credit_sales", { p_limit:20 });
  const box = $("#crSales"); if (!box) return;
  box.innerHTML = error ? `<p class="err">${h(errMsg(error))}</p>` : !(data||[]).length ? `<p class="small muted">${t("No credit sales yet.")}</p>`
    : `<h3>${t("Recent credit sales")}</h3><div class="tw"><table><tbody>${data.map(r => `<tr><td>${dOnly(r.created_at)}</td><td class="mono small">${h(r.email)}</td><td class="r num">+${num(r.amount,0)}</td><td class="small muted">${h(String(r.reason||"").replace(/^Bought · ?/,""))}</td></tr>`).join("")}</tbody></table></div>`;
}
function settingsModal(){
  const p = AD.settings;
  modal(`<form data-form="settings"><h2>${t("Platform settings")}</h2><p class="small muted">${t("Used in messages to customers and on the public prices page.")}</p>
    <div class="fields">
      <label>${t("Brand name")}<input id="psBrand" value="${h(p.brand)}"></label><label>${t("Support phone")}<input id="psPhone" value="${h(p.support_phone)}"></label>
      <label>WhatsApp<input id="psWa" value="${h(p.support_whatsapp)}" placeholder="${h(C.phoneHint)}"></label><label>${t("Support email")}<input id="psEmail" type="email" value="${h(p.support_email)}"></label>
      <label>${t("Currency")}<input id="psCur" value="${h(p.currency)}"></label><label>${t("Free trial (days)")}<input id="psT" type="number" min="0" step="1" value="${h(p.trial_days)}"></label>
      <label>${t("Weekly pass price")}<input id="psWeek" type="number" min="0" step="any" value="${h(p.weekly_price??1000)}"></label>
    </div>
    <div class="tw"><table><thead><tr><th>${t("Plan size")}</th><th>${t("Users")}</th><th>${t("Monthly price")}</th><th>${t("Yearly price")}</th></tr></thead><tbody>
    ${Object.entries(TIERS()).map(([k,n]) => { const x = tiers()[k]||{}; return `<tr><td><b>${n}</b></td><td><input id="pt_${k}_users" type="number" min="1" value="${h(x.users??1)}" style="width:70px"></td><td><input id="pt_${k}_monthly" type="number" min="0" step="any" value="${h(x.monthly??0)}" style="width:110px"></td><td><input id="pt_${k}_yearly" type="number" min="0" step="any" value="${h(x.yearly??0)}" style="width:120px"></td></tr>`; }).join("")}
    </tbody></table></div>${footer(t("Save"))}</form>`);
}

/* ---------- events ---------- */
const v = id => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
async function refresh(msg){ await loadAll(); render(); if (msg) toast(msg); }
document.addEventListener("input", e => { if (e.target.id === "adQ"){ AD.q = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#adQ"); n.focus(); try { n.setSelectionRange(pos,pos); } catch(_){} } });
document.addEventListener("keydown", e => { if (e.key === "Escape"){ if ($("#overlay").innerHTML) closeModal(); else if (AD.open){ AD.open = null; render(); } } });
document.addEventListener("click", async e => {
  if (e.target.dataset && e.target.dataset.close) return closeModal();
  if (e.target.closest("[data-closebtn]")) return closeModal();
  const lb = e.target.closest("[data-lang]"); if (lb){ setLang(lb.dataset.lang); return AD.settings.id ? render() : route(); }
  const a = e.target.closest("[data-act]"); if (!a) return;
  const id = a.dataset.id, s = AD.rows.find(x => x.id === id), tid = a.dataset.t;
  try { switch(a.dataset.act){
    case "signout": await sb.auth.signOut(); break;
    case "claim": { const { data, error } = await sb.rpc("claim_platform_admin"); if (error) throw error; if (!data) toast(t("The platform already has an owner.")); route(); break; }
    case "filter": AD.filter = a.dataset.f; render(); break;
    case "view": AD.view = a.dataset.v; render(); break;
    case "newrow": newModal(); break;
    case "settings": settingsModal(); break;
    case "credits": creditsModal(); break;
    case "pack": $("#crCredits").value = a.dataset.c; $("#crPaid").value = a.dataset.p; break;
    case "export": toast(t("Preparing the Excel file…")); await exportExcel(); break;
    case "open": AD.open = id; render(); loadMembers(id); break;
    case "close": AD.open = null; render(); break;
    case "uadd": addUserModal(tid); break;
    case "upass": passModal(tid, a.dataset.uid); break;
    case "uemail": emailModal(tid, a.dataset.uid); break;
    case "uedit": editUserModal(tid, a.dataset.uid); break;
    case "genpass": { const el = document.getElementById(a.dataset.for); if (el) el.value = genPass(); break; }
    case "copylogin": copyText(a.dataset.msg); break;
    case "copykey": copyText(s.license_key); break;
    case "copymsg": copyText(welcomeMsg(s)); break;
    case "copyrenew": copyText(renewMsg(s)); break;
    case "preset": $("#exUntil").value = a.dataset.until; $("#exAmount").value = a.dataset.amount; $("#exPlan").value = a.dataset.plan; break;
    case "regen": { if (!a.dataset.sure){ a.dataset.sure = "1"; a.textContent = t("Click again to confirm"); return; } const { error } = await sb.rpc("admin_regenerate_key", { p_tenant:id }); if (error) throw error; await refresh(t("New key created. The old key no longer works.")); break; }
    case "suspend": { const { error } = await sb.from("tenants").update({ status: s.status==="active" ? "suspended" : "active" }).eq("id", id); if (error) throw error; await refresh(t("Saved")); break; }
  } } catch(err){ toast(errMsg(err)); }
});
document.addEventListener("submit", async e => {
  const f = e.target; if (!f.dataset.form) return; e.preventDefault();
  const tid = f.dataset.t, row = AD.rows.find(x => x.id === tid);
  try { switch(f.dataset.form){
    case "login": { const { error } = await sb.auth.signInWithPassword({ email:v("lgEmail"), password:v("lgPass") }); if (error) $("#lgErr").textContent = /Invalid login/i.test(error.message) ? t("Wrong email or password.") : error.message; break; }
    case "new": {
      const plan = v("fPlan"), d = new Date();
      if (plan === "trial") d.setDate(d.getDate() + Number(AD.settings.trial_days ?? 14)); else d.setMonth(d.getMonth() + (plan==="yearly"?12:1));
      const { data, error } = await sb.from("tenants").insert(Object.assign(detailRow(), { plan, expires_at:d.toISOString() })).select().single();
      if (error) throw error; closeModal(); AD.open = data.id; await refresh(t("Created. Send the owner their key.")); loadMembers(data.id); break; }
    case "extend": {
      const until = new Date(v("exUntil")+"T23:59:59");
      const { error } = await sb.rpc("admin_extend", { p_tenant:f.dataset.id, p_until:until.toISOString(), p_amount:Number(v("exAmount")||0), p_method:v("exMethod"), p_period:`${dOnly(new Date().toISOString())} → ${dOnly(until.toISOString())}`, p_note:v("exNote"), p_plan:v("exPlan") });
      if (error) throw error; await refresh(t("Payment saved. Valid until {d}.", {d:dOnly(until.toISOString())})); break; }
    case "edit": { const { error } = await sb.from("tenants").update(Object.assign(detailRow(), { notes:v("fNotes") })).eq("id", f.dataset.id); if (error) throw error; await refresh(t("Saved")); break; }
    case "uadd": {
      const email = v("uaEmail").toLowerCase(), pass = v("uaPass"), role = v("uaRole");
      if (pass.length < 6) return toast(t("The password must have at least 6 characters."));
      const { error } = await sb.rpc("admin_add_user", { p_tenant:tid, p_email:email, p_password:pass, p_role:role, p_name:v("uaName") });
      if (error) throw error; await loadMembers(tid); await refresh(); loginDone(row, email, pass, v("uaPhone") || (role==="owner" ? row.phone : "")); break; }
    case "upass": {
      const m = memberOf(tid, f.dataset.uid), pass = v("upPass");
      if (pass.length < 6) return toast(t("The password must have at least 6 characters."));
      const { error } = await sb.rpc("admin_set_password", { p_user:f.dataset.uid, p_password:pass });
      if (error) throw error; await loadMembers(tid); loginDone(row, m.email, pass, v("upPhone") || (m.role==="owner" ? row.phone : "")); break; }
    case "uemail": { const { error } = await sb.rpc("admin_set_email", { p_user:f.dataset.uid, p_email:v("ueEmail").toLowerCase() }); if (error) throw error; closeModal(); await loadMembers(tid); toast(t("Email changed.")); break; }
    case "uedit": { const { error } = await sb.rpc("admin_update_member", { p_tenant:tid, p_user:f.dataset.uid, p_role:v("uedRole"), p_name:v("uedName"), p_active:$("#uedActive").checked }); if (error) throw error; closeModal(); await loadMembers(tid); await refresh(t("Saved")); break; }
    case "credits": {
      const credits = parseInt(v("crCredits"), 10), paid = Number(v("crPaid")||0), cur = AD.settings.currency || "";
      if (!credits) return toast(t("Enter a number of credits."));
      const note = [paid ? `${num(paid)} ${cur}` : "", v("crMethod"), v("crNote")].filter(Boolean).join(" · ");
      const email = v("crEmail").toLowerCase();
      const { data, error } = await sb.rpc("admin_add_credits", { p_email:email, p_credits:credits, p_paid:0, p_note:note });
      if (error) throw error; closeModal(); toast(t("Done. {e} now has {n} credits.", { e:email, n:num(data,0) })); break; }
    case "settings": {
      const tiersNew = Object.fromEntries(Object.keys(C.tiers).map(k => [k, { users:Number(v(`pt_${k}_users`)||1), monthly:Number(v(`pt_${k}_monthly`)||0), yearly:Number(v(`pt_${k}_yearly`)||0) }]));
      const { error } = await sb.from("platform_settings").update({ brand:v("psBrand"), support_phone:v("psPhone"), support_whatsapp:v("psWa"), support_email:v("psEmail"), currency:v("psCur"), trial_days:Number(v("psT")||0), weekly_price:Number(v("psWeek")||0), tiers:tiersNew, updated_at:new Date().toISOString() }).eq("id",1);
      if (error) throw error; closeModal(); await refresh(t("Saved")); break; }
  } } catch(err){ toast(errMsg(err)); }
});
boot();
