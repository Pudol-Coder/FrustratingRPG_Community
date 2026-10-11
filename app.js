// 공개(읽기 전용) 키입니다. 쓰기는 RLS로 막혀 있어서 공개돼도 안전합니다. 비밀 키는 절대 넣지 마세요.
const SUPABASE_URL = "https://gqcxpqilxwzfzblvpbck.supabase.co";
const SUPABASE_KEY = "sb_publishable_J65KKUoAgyFO2nDNH_DDJQ_V0uFM87r";

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const param = (k) => new URLSearchParams(location.search).get(k);

async function api(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_KEY } });
  if (!r.ok) throw new Error(r.status);
  return r.json();
}

function shell() {
  $("#top").innerHTML = `<a class="brand" href="index.html">환장 RPG 위키</a><nav><a href="index.html">항목</a><a href="mysteries.html">떡밥</a></nav>`;
  document.body.insertAdjacentHTML("beforeend", `<footer>비공식 팬 위키예요. 원작자·채널과 무관하고, 내용은 팬들이 직접 정리해요. 스포일러는 흐리게 가려져 있어요.</footer>`);
}

// 가려진 글(스포일러): 눌러서 열기
const spoil = (html) => `<div class="spoiler" onclick="this.classList.add('open')">${html}</div><p class="hint">흐린 글을 누르면 보여요</p>`;

// ---------------------------------------------------------------- 홈
async function home() {
  const rows = await api("entries?select=id,category,name,summary&order=id");
  const cats = [...new Set(rows.map((r) => r.category))];
  let cat = param("category") || "";
  let q = "";
  $("#app").innerHTML = `<input id="q" type="search" placeholder="이름으로 검색"><div id="cats" class="chips"></div><div id="list" class="grid"></div>`;
  const draw = () => {
    $("#cats").innerHTML = ["전체", ...cats]
      .map((c) => `<button class="chip ${(c === "전체" ? !cat : c === cat) ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`)
      .join("");
    const f = rows.filter((r) => (!cat || r.category === cat) && r.name.toLowerCase().includes(q));
    $("#list").innerHTML = f.length
      ? f.map((r) => `<a class="card" href="entry.html?id=${r.id}"><span class="badge">${esc(r.category)}</span><b>${esc(r.name)}</b><p>${esc(r.summary || "")}</p></a>`).join("")
      : `<p class="muted">결과가 없어요.</p>`;
  };
  $("#cats").onclick = (e) => {
    const c = e.target.dataset.c;
    if (c !== undefined) { cat = c === "전체" ? "" : c; draw(); }
  };
  $("#q").oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  draw();
}

// ---------------------------------------------------------------- 항목 상세
async function entry() {
  const id = Number(param("id"));
  const [e] = Number.isInteger(id) ? await api(`entries?id=eq.${id}&select=*`) : [];
  if (!e) { $("#app").innerHTML = `<p>항목을 찾을 수 없어요. <a href="index.html">목록으로</a></p>`; return; }
  document.title = `${e.name} - 환장 RPG 위키`;

  const names = await api("entries?select=id,name");
  const idOf = new Map(names.map((n) => [n.name, n.id]));
  // [[이름]] 을 해당 항목 링크로 바꿈 (먼저 이스케이프한 뒤 변환하므로 안전)
  const fmt = (t) =>
    esc(t || "").replace(/\[\[(.+?)\]\]/g, (m, n) => (idOf.has(n) ? `<a href="entry.html?id=${idOf.get(n)}">${n}</a>` : n)).replace(/\n/g, "<br>");

  const extra = Object.entries(e.extra || {}).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${fmt(v)}</td></tr>`);
  if (e.first_episode) extra.push(`<tr><td>첫 등장</td><td>${esc(e.first_episode)}</td></tr>`);
  const body = e.description ? fmt(e.description) : `<span class="muted">아직 자세한 설명이 없어요. 디스코드에서 <code>/위키 수정</code>으로 채워 주세요.</span>`;

  const revs = await api(`entry_revisions?entry_id=eq.${id}&select=editor_name,created_at&order=created_at.desc&limit=10`);
  const hist = revs.map((r) => `<li>${esc(r.editor_name || "알 수 없음")} · ${new Date(r.created_at).toLocaleDateString("ko-KR")}</li>`).join("");

  $("#app").innerHTML = `
    <a href="index.html?category=${encodeURIComponent(e.category)}"><span class="badge">${esc(e.category)}</span></a>
    <h1>${esc(e.name)}</h1>
    ${e.summary ? `<p class="muted">${fmt(e.summary)}</p>` : ""}
    ${extra.length ? `<table>${extra.join("")}</table>` : ""}
    ${e.is_spoiler && e.description ? spoil(body) : `<div>${body}</div>`}
    ${hist ? `<h3>최근 수정</h3><ul class="hist">${hist}</ul>` : ""}`;
}

// ---------------------------------------------------------------- 떡밥
const STATUS = { open: "🔍 미해결", solved: "✅ 해결" };

async function mysteries() {
  const rows = await api("mysteries?select=id,title,status,description&order=id");
  let st = "open";
  $("#app").innerHTML = `<h1>떡밥</h1><div id="cats" class="chips"></div><div id="list" class="grid"></div>`;
  const draw = () => {
    $("#cats").innerHTML = [["open", "미해결"], ["solved", "해결"], ["all", "전체"]]
      .map(([v, l]) => `<button class="chip ${v === st ? "on" : ""}" data-s="${v}">${l}</button>`).join("");
    const f = rows.filter((r) => st === "all" || r.status === st);
    $("#list").innerHTML = f.length
      ? f.map((r) => `<a class="card" href="mystery.html?id=${r.id}"><b>${STATUS[r.status] || ""} ${esc(r.title)}</b><p>${esc((r.description || "").slice(0, 60))}</p></a>`).join("")
      : `<p class="muted">해당하는 떡밥이 없어요.</p>`;
  };
  $("#cats").onclick = (e) => { if (e.target.dataset.s) { st = e.target.dataset.s; draw(); } };
  draw();
}

async function mystery() {
  const id = Number(param("id"));
  const [m] = Number.isInteger(id) ? await api(`mysteries?id=eq.${id}&select=*`) : [];
  if (!m) { $("#app").innerHTML = `<p>떡밥을 찾을 수 없어요. <a href="mysteries.html">목록으로</a></p>`; return; }
  document.title = `${m.title} - 환장 RPG 위키`;
  const nl = (t) => esc(t || "").replace(/\n/g, "<br>");
  $("#app").innerHTML = `
    <a href="mysteries.html"><span class="badge">떡밥</span></a>
    <h1>${esc(m.title)}</h1>
    <table>
      <tr><td>상태</td><td>${STATUS[m.status] || esc(m.status)}</td></tr>
      <tr><td>첫 언급</td><td>${esc(m.first_episode || "미상")}</td></tr>
      ${m.status === "solved" ? `<tr><td>해결된 화</td><td>${esc(m.solved_episode || "미상")}</td></tr>` : ""}
    </table>
    <div>${m.description ? nl(m.description) : `<span class="muted">아직 설명이 없어요.</span>`}</div>
    ${m.status === "solved" && m.resolution ? `<h3>어떻게 풀렸나</h3>${spoil(nl(m.resolution))}` : ""}`;
}

// ---------------------------------------------------------------- 시작
shell();
const run = { home, entry, mysteries, mystery }[document.body.dataset.page];
if (run) {
  run().catch((err) => {
    console.error(err);
    $("#app").innerHTML = `<p class="muted">불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>`;
  });
}
