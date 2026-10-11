// 공개(읽기 전용) 키입니다. 쓰기는 DB 권한(RLS)으로 막혀 있어 공개돼도 안전합니다. 비밀 키는 절대 넣지 마세요.
const SUPABASE_URL = "https://gqcxpqilxwzfzblvpbck.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxY3hwcWlseHd6ZnpibHZwYmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNTk4MzIsImV4cCI6MjA4NzYzNTgzMn0.-bD1WVgFmqiDohUIBzR9glgG-JtGPyQnGNq22GLqNdc";
const CATEGORIES = ["캐릭터", "직업", "장소", "시스템", "아이템", "스킬", "기타"];
const TEMPLATE = "## 개요\n\n\n## 특징\n\n\n## 등장\n\n";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const param = (k) => new URLSearchParams(location.search).get(k);
const seg = () => location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
const path = (...p) => "/" + p.map(encodeURIComponent).join("/");
const isUrl = (u) => /^https?:\/\//.test(u || "");
const spoil = (h) => `<div class="spoiler" onclick="this.classList.add('open')">${h}</div><p class="hint">흐린 글을 누르면 보여요</p>`;

let user = null, editor = false;

// ---------------------------------------------------------------- 마크다운 (안전하게 변환)
function md(text, names) {
  const pre = (text || "").replace(/\[\[(.+?)\]\]/g, (m, n) => `<a href="${path("항목", n)}"${names.has(n) ? "" : ' class="new"'}>${esc(n)}</a>`);
  const box = document.createElement("div");
  box.innerHTML = DOMPurify.sanitize(marked.parse(pre));
  const hs = [...box.querySelectorAll("h2,h3")];
  hs.forEach((h, i) => (h.id = "s" + i));
  const toc = hs.length >= 3 ? `<div class="toc"><b>목차</b><ol>${hs.map((h, i) => `<li class="${h.tagName}"><a href="#s${i}">${esc(h.textContent)}</a></li>`).join("")}</ol></div>` : "";
  return toc + box.innerHTML;
}
const allNames = async () => new Set(((await sb.from("entries").select("name")).data || []).map((r) => r.name));

// ---------------------------------------------------------------- 로그인 / 상단바
const userName = () => user?.user_metadata?.full_name || user?.user_metadata?.name || "웹 편집자";

function nav() {
  $("#top").innerHTML = `<a class="brand" href="/">환장 RPG 위키</a><nav><a href="/항목">항목</a><a href="/떡밥">떡밥</a>${editor ? `<a href="/새문서">새 문서</a>` : ""}${user ? `<a href="#" id="out">로그아웃</a>` : `<a href="#" id="in">로그인</a>`}</nav>`;
  $("#in")?.addEventListener("click", (e) => { e.preventDefault(); sb.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: location.href.split("#")[0] } }); });
  $("#out")?.addEventListener("click", async (e) => { e.preventDefault(); await sb.auth.signOut(); location.reload(); });
}

// ---------------------------------------------------------------- 홈 / 목록
async function home() {
  const { data: rows = [] } = await sb.from("entries").select("id,category,name,summary,image_url").order("id");
  const cats = [...new Set(rows.map((r) => r.category))];
  let cat = param("category") || "", q = "";
  $("#app").innerHTML = `<input id="q" type="search" placeholder="이름으로 검색"><div id="cats" class="chips"></div><div id="list" class="grid"></div>`;
  const draw = () => {
    $("#cats").innerHTML = ["전체", ...cats].map((c) => `<button class="chip ${(c === "전체" ? !cat : c === cat) ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("");
    const f = rows.filter((r) => (!cat || r.category === cat) && r.name.toLowerCase().includes(q));
    $("#list").innerHTML = f.length
      ? f.map((r) => `<a class="card" href="${path("항목", r.name)}">${isUrl(r.image_url) ? `<img src="${esc(r.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}<span class="badge">${esc(r.category)}</span><b>${esc(r.name)}</b><p>${esc(r.summary || "")}</p></a>`).join("")
      : `<p class="muted">결과가 없어요.</p>`;
  };
  $("#cats").onclick = (e) => { const c = e.target.dataset.c; if (c !== undefined) { cat = c === "전체" ? "" : c; draw(); } };
  $("#q").oninput = (e) => { q = e.target.value.trim().toLowerCase(); draw(); };
  draw();
}

// ---------------------------------------------------------------- 문서 보기
async function entry(name) {
  const { data = [] } = await sb.from("entries").select("*").eq("name", name);
  if (!data.length) {
    $("#app").innerHTML = `<h1>${esc(name)}</h1><p>아직 없는 문서예요. ${editor ? `<a href="/새문서?name=${encodeURIComponent(name)}">새로 만들기</a>` : "편집자가 만들면 여기에 나타나요."}</p>`;
    return;
  }
  if (data.length > 1) {
    $("#app").innerHTML = `<h1>${esc(name)}</h1><p>같은 이름의 문서가 여러 분류에 있어요.</p><ul>${data.map((e) => `<li>${esc(e.category)}</li>`).join("")}</ul><p class="hint">분류별 문서 주소는 아직 지원하지 않아요. 이름을 다르게 지어 주세요.</p>`;
    return;
  }
  const e = data[0];
  document.title = `${e.name} - 환장 RPG 위키`;
  const names = await allNames();
  const infoRows = [...(e.first_episode ? [["첫 등장", e.first_episode]] : []), ...(e.last_episode ? [["마지막 등장", e.last_episode]] : []), ...Object.entries(e.extra || {})];
  const info = `<aside class="info">${isUrl(e.image_url) ? `<img src="${esc(e.image_url)}" alt="${esc(e.name)}" referrerpolicy="no-referrer">` : ""}${e.summary ? `<p>${esc(e.summary)}</p>` : ""}${infoRows.length ? `<table>${infoRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>` : ""}</aside>`;
  const html = e.description ? md(e.description, names) : `<p class="muted">아직 본문이 없어요.${editor ? " 위의 편집 버튼으로 채워 주세요." : ""}</p>`;
  const { data: revs = [] } = await sb.from("entry_revisions").select("editor_name,created_at").eq("entry_id", e.id).order("created_at", { ascending: false }).limit(10);
  $("#app").innerHTML = `
    <a href="/항목?category=${encodeURIComponent(e.category)}"><span class="badge">${esc(e.category)}</span></a>
    ${editor ? ` · <a href="${path("편집", e.name)}">편집</a>` : ""}
    <h1>${esc(e.name)}</h1>${info}
    <div class="body">${e.is_spoiler ? spoil(html) : html}</div>
    ${revs.length ? `<h3 style="clear:both">최근 수정</h3><ul class="hist">${revs.map((r) => `<li>${esc(r.editor_name || "알 수 없음")} · ${new Date(r.created_at).toLocaleDateString("ko-KR")}</li>`).join("")}</ul>` : ""}`;
}

// ---------------------------------------------------------------- 편집
const toExtra = (t) => Object.fromEntries(t.replace(/：/g, ":").split("\n").map((l) => l.split(/:(.*)/s).map((x) => x.trim())).filter(([k, v]) => k && v));
const fromExtra = (o) => Object.entries(o || {}).map(([k, v]) => `${k}: ${v}`).join("\n");
const REV = ["category", "name", "summary", "first_episode", "last_episode", "image_url", "extra", "is_spoiler", "description"];
const pick = (o) => Object.fromEntries(REV.map((k) => [k, o[k] ?? null]));

async function edit(name) {
  if (!editor) { $("#app").innerHTML = `<p>${user ? "편집 권한이 없어요. 운영자에게 편집자 등록을 요청해 주세요." : "편집하려면 먼저 로그인해 주세요."}</p>`; return; }
  let e = { category: param("category") || "캐릭터", name: param("name") || "", extra: {}, description: TEMPLATE, is_spoiler: false };
  if (name) {
    const { data = [] } = await sb.from("entries").select("*").eq("name", name);
    if (data.length !== 1) { $("#app").innerHTML = "<p>편집할 문서를 찾을 수 없어요.</p>"; return; }
    e = data[0];
  }
  const names = await allNames();
  $("#app").innerHTML = `<h1>${name ? "문서 편집" : "새 문서"}</h1><form onsubmit="return false">
    <label>분류</label><select id="f_cat">${CATEGORIES.map((c) => `<option ${c === e.category ? "selected" : ""}>${c}</option>`).join("")}</select>
    <label>이름 (주소가 됩니다. / 는 쓸 수 없어요)</label><input type="text" id="f_name" value="${esc(e.name)}">
    <label>사진 주소 (https://...)</label><input type="text" id="f_img" value="${esc(e.image_url)}">
    <label>간단한 특징 (봇과 문서 오른쪽 상자에 보여요)</label><input type="text" id="f_sum" value="${esc(e.summary)}">
    <label>첫 등장 화</label><input type="text" id="f_first" value="${esc(e.first_episode)}">
    <label>마지막 등장 화</label><input type="text" id="f_last" value="${esc(e.last_episode)}">
    <label>추가 정보 (한 줄에 항목: 값, 예: 직업: 검사)</label><textarea id="f_extra" rows="3">${esc(fromExtra(e.extra))}</textarea>
    <label><input type="checkbox" id="f_sp" ${e.is_spoiler ? "checked" : ""}> 스포일러 (본문을 흐리게 가려요)</label>
    <label>본문 (마크다운. ## 제목, **굵게**, [[다른 문서]] 링크)</label><textarea id="f_body" rows="18">${esc(e.description)}</textarea>
    <button class="btn" id="save">저장</button><button class="btn sub" id="pv">미리보기</button><span id="msg" class="muted"></span>
    <div id="prev" hidden></div></form>`;
  $("#pv").onclick = () => { const p = $("#prev"); p.hidden = !p.hidden; if (!p.hidden) p.innerHTML = md($("#f_body").value, names); };
  $("#f_body").oninput = () => { if (!$("#prev").hidden) $("#prev").innerHTML = md($("#f_body").value, names); };
  $("#save").onclick = async () => {
    const v = (id) => $("#" + id).value.trim();
    const data = { category: v("f_cat"), name: v("f_name"), image_url: v("f_img") || null, summary: v("f_sum") || null, first_episode: v("f_first") || null, last_episode: v("f_last") || null, extra: toExtra($("#f_extra").value), is_spoiler: $("#f_sp").checked, description: $("#f_body").value.trim() || null, updated_by: userName(), updated_at: new Date().toISOString() };
    const fail = (t) => ($("#msg").textContent = t);
    if (!data.name || data.name.includes("/")) return fail("이름을 확인해 주세요. (비어 있거나 / 가 들어 있어요)");
    if (data.image_url && !isUrl(data.image_url)) return fail("사진 주소는 http(s):// 로 시작해야 해요.");
    fail("저장 중…");
    const q = name ? sb.from("entries").update(data).eq("id", e.id) : sb.from("entries").insert(data);
    const { data: saved, error } = await q.select().single();
    if (error) return fail("저장에 실패했어요. 같은 분류에 같은 이름이 있거나 권한이 없을 수 있어요.");
    await sb.from("entry_revisions").insert({ entry_id: saved.id, editor_name: data.updated_by, old_data: name ? pick(e) : null, new_data: pick(data) });
    location.href = path("항목", data.name);
  };
}

// ---------------------------------------------------------------- 떡밥 (보기 전용)
const STATUS = { open: "🔍 미해결", solved: "✅ 해결" };
async function mysteries() {
  const { data: rows = [] } = await sb.from("mysteries").select("id,title,status,description").order("id");
  let st = "open";
  $("#app").innerHTML = `<h1>떡밥</h1><div id="cats" class="chips"></div><div id="list" class="grid"></div>`;
  const draw = () => {
    $("#cats").innerHTML = [["open", "미해결"], ["solved", "해결"], ["all", "전체"]].map(([v, l]) => `<button class="chip ${v === st ? "on" : ""}" data-s="${v}">${l}</button>`).join("");
    const f = rows.filter((r) => st === "all" || r.status === st);
    $("#list").innerHTML = f.length ? f.map((r) => `<a class="card" href="${path("떡밥", r.title)}"><b>${STATUS[r.status] || ""} ${esc(r.title)}</b><p>${esc((r.description || "").slice(0, 60))}</p></a>`).join("") : `<p class="muted">해당하는 떡밥이 없어요.</p>`;
  };
  $("#cats").onclick = (e) => { if (e.target.dataset.s) { st = e.target.dataset.s; draw(); } };
  draw();
}
async function mystery(title) {
  const { data = [] } = await sb.from("mysteries").select("*").eq("title", title);
  const m = data[0];
  if (!m) { $("#app").innerHTML = `<p>떡밥을 찾을 수 없어요. <a href="/떡밥">목록으로</a></p>`; return; }
  document.title = `${m.title} - 환장 RPG 위키`;
  const nl = (t) => esc(t || "").replace(/\n/g, "<br>");
  $("#app").innerHTML = `<a href="/떡밥"><span class="badge">떡밥</span></a><h1>${esc(m.title)}</h1>
    <table><tr><td>상태</td><td>${STATUS[m.status] || esc(m.status)}</td></tr><tr><td>첫 언급</td><td>${esc(m.first_episode || "미상")}</td></tr>${m.status === "solved" ? `<tr><td>해결된 화</td><td>${esc(m.solved_episode || "미상")}</td></tr>` : ""}</table>
    <div>${m.description ? nl(m.description) : `<span class="muted">아직 설명이 없어요.</span>`}</div>
    ${m.status === "solved" && m.resolution ? `<h3>어떻게 풀렸나</h3>${spoil(nl(m.resolution))}` : ""}`;
}

// ---------------------------------------------------------------- 시작
function route() {
  const [a, b] = seg();
  if (!a || (a === "항목" && !b)) return home();
  if (a === "항목") return entry(b);
  if (a === "편집" && b) return edit(b);
  if (a === "새문서") return edit(null);
  if (a === "떡밥") return b ? mystery(b) : mysteries();
  $("#app").innerHTML = `<p>페이지를 찾을 수 없어요. <a href="/">홈으로</a></p>`;
}

(async () => {
  try {
    const { data } = await sb.auth.getSession();
    user = data.session?.user || null;
    if (location.hash.includes("access_token")) history.replaceState(null, "", location.pathname + location.search);
    if (user) editor = !!((await sb.from("editors").select("user_id").eq("user_id", user.id)).data || []).length;
    nav();
    await route();
  } catch (err) {
    console.error(err);
    $("#app").innerHTML = `<p class="muted">불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>`;
  }
})();
