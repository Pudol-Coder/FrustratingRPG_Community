// 공개(읽기 전용) 키입니다. 쓰기는 DB 권한(RLS)으로 막혀 있어 공개돼도 안전합니다. 비밀 키는 절대 넣지 마세요.
const SUPABASE_URL = "https://gqcxpqilxwzfzblvpbck.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxY3hwcWlseHd6ZnpibHZwYmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNTk4MzIsImV4cCI6MjA4NzYzNTgzMn0.-bD1WVgFmqiDohUIBzR9glgG-JtGPyQnGNq22GLqNdc";
// 분류를 늘리고 싶으면 여기에 이름만 추가하면 돼요. (봇의 CATEGORIES 도 같이 맞추세요)
const CATEGORIES = ["영상", "캐릭터", "떡밥", "설정", "시스템", "NPC", "몬스터", "장소", "직업", "아이템", "스킬", "기타"];
const TEMPLATE = "## 개요\n\n\n## 특징\n\n\n## 등장\n\n";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const param = (k) => new URLSearchParams(location.search).get(k);
const seg = () => location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
const path = (...p) => "/" + p.map(encodeURIComponent).join("/");
const isUrl = (u) => /^https?:\/\//.test(u || "");
const ytId = (s) => (String(s || "").match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/) || [])[1];
const fmtDate = (d) => new Date(d).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
const spoil = (h) => `<div class="spoiler" onclick="this.classList.add('open')">${h}</div><p class="hint">흐린 글을 누르면 보여요</p>`;
const img = (r) => (isUrl(r.image_url) ? `<img src="${esc(r.image_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "");
const card = (r) => `<a class="card" href="${path(r.category, r.name)}">${img(r)}<span class="badge">${esc(r.category)}</span><b>${esc(r.name)}</b><p>${esc(r.summary || "")}</p></a>`;

let user = null, editor = false;
const userName = () => user?.user_metadata?.full_name || user?.user_metadata?.name || "웹 편집자";

// ---------------------------------------------------------------- 문서 목록(링크 확인용) + 마크다운
async function index() {
  const { data = [] } = await sb.from("entries").select("category,name");
  const byName = new Map();
  data.forEach((r) => !byName.has(r.name) && byName.set(r.name, r.category));
  return { keys: new Set(data.map((r) => r.category + "/" + r.name)), byName };
}
// [[이름]] [[분류/이름]] [[이름|보일 글]] 형식 → [분류, 이름]
function target(raw, idx) {
  const tg = raw.split("|")[0].trim(), i = tg.indexOf("/");
  return i > 0 && CATEGORIES.includes(tg.slice(0, i)) ? [tg.slice(0, i), tg.slice(i + 1)] : [idx.byName.get(tg), tg];
}
function md(text, idx) {
  const fns = [];
  // 각주: 본문에 [* 내용] 이라고 쓰면 번호가 붙고 맨 아래에 모여요
  let t = (text || "").replace(/\[\*\s*([^\]]+?)\]/g, (m, f) => { fns.push(f.trim()); const n = fns.length; return `<sup><a href="#fn${n}" id="fr${n}">[${n}]</a></sup>`; });
  t = t.replace(/\[\[(.+?)\]\]/g, (m, x) => {
    const [c, n] = target(x, idx), label = x.includes("|") ? x.split("|")[1] : n;
    return `<a href="${path(c || "기타", n)}"${c && idx.keys.has(c + "/" + n) ? "" : ' class="new"'}>${esc(label.trim())}</a>`;
  });
  const box = document.createElement("div");
  box.innerHTML = DOMPurify.sanitize(marked.parse(t));
  const hs = [...box.querySelectorAll("h2,h3")];
  hs.forEach((h, i) => (h.id = "s" + i));
  const toc = hs.length >= 3 ? `<div class="toc"><b>목차</b><ol>${hs.map((h, i) => `<li class="${h.tagName}"><a href="#s${i}">${esc(h.textContent)}</a></li>`).join("")}</ol></div>` : "";
  const fn = fns.length ? `<ol class="fn">${fns.map((f, i) => `<li id="fn${i + 1}"><a href="#fr${i + 1}">^</a> ${esc(f)}</li>`).join("")}</ol>` : "";
  return toc + box.innerHTML + fn;
}

// ---------------------------------------------------------------- 상단바 / 로그인
function nav() {
  $("#top").innerHTML = `<a class="brand" href="/">환장 RPG 위키</a><nav><a href="/영상">영상</a><a href="/최근변경">최근 변경</a>${editor ? `<a href="/새문서">새 문서</a>` : ""}${user ? `<a href="#" id="out">로그아웃</a>` : `<a href="#" id="in">로그인</a>`}</nav>`;
  $("#in")?.addEventListener("click", (e) => { e.preventDefault(); sb.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: location.href.split("#")[0] } }); });
  $("#out")?.addEventListener("click", async (e) => { e.preventDefault(); await sb.auth.signOut(); location.reload(); });
}

// ---------------------------------------------------------------- 홈 / 분류 목록 / 검색 / 최근 변경
async function home() {
  const { data = [] } = await sb.from("entries").select("id,category,name,summary,image_url,updated_at").order("id");
  const count = (c) => data.filter((r) => r.category === c).length;
  const vids = data.filter((r) => r.category === "영상").slice(-6).reverse();
  const recent = [...data].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 10);
  $("#app").innerHTML = `<form action="/검색"><input type="search" name="q" placeholder="문서 검색 (이름, 특징, 본문)"></form>
    <div class="chips">${CATEGORIES.map((c) => `<a class="chip" href="${path(c)}">${c} ${count(c)}</a>`).join("")}</div>
    ${vids.length ? `<h3>최근 영상</h3><div class="grid">${vids.map(card).join("")}</div>` : ""}
    <h3>최근 수정된 문서</h3><ul>${recent.map((r) => `<li><span class="badge">${esc(r.category)}</span> <a href="${path(r.category, r.name)}">${esc(r.name)}</a></li>`).join("")}</ul>`;
}
async function list(cat) {
  document.title = `${cat} - 환장 RPG 위키`;
  const vid = cat === "영상";
  const { data = [] } = await sb.from("entries").select("id,category,name,summary,image_url").eq("category", cat).order(vid ? "id" : "name", { ascending: !vid });
  $("#app").innerHTML = `<h1>${esc(cat)}</h1>${editor ? `<a href="/새문서?category=${encodeURIComponent(cat)}">+ ${esc(cat)} 문서 만들기</a>` : ""}
    <div class="grid" style="margin-top:12px">${data.length ? data.map(card).join("") : `<p class="muted">아직 문서가 없어요.</p>`}</div>`;
}
async function search() {
  const q = (param("q") || "").replace(/[,()"%*\\]/g, " ").trim();
  let rows = [];
  if (q) rows = (await sb.from("entries").select("id,category,name,summary,image_url").or(`name.ilike.%${q}%,summary.ilike.%${q}%,description.ilike.%${q}%`).limit(50)).data || [];
  $("#app").innerHTML = `<form action="/검색"><input type="search" name="q" value="${esc(q)}" placeholder="문서 검색"></form><h3>'${esc(q)}' 검색 결과 ${rows.length}건</h3><div class="grid">${rows.map(card).join("") || `<p class="muted">결과가 없어요.</p>`}</div>`;
}
async function recent() {
  const { data = [] } = await sb.from("entry_revisions").select("id,created_at,editor_name,edit_summary,entries(category,name)").order("created_at", { ascending: false }).limit(40);
  $("#app").innerHTML = `<h1>최근 변경</h1>${data.filter((r) => r.entries).map((r) => `<div class="rev"><a href="${path(r.entries.category, r.entries.name)}">${esc(r.entries.name)}</a> <span class="badge">${esc(r.entries.category)}</span> · ${fmtDate(r.created_at)} · ${esc(r.editor_name || "")}${r.edit_summary ? ` · <i>${esc(r.edit_summary)}</i>` : ""}</div>`).join("") || `<p class="muted">변경 기록이 없어요.</p>`}`;
}

// ---------------------------------------------------------------- 문서 보기
async function entry(cat, name) {
  const { data: e } = await sb.from("entries").select("*").eq("category", cat).eq("name", name).maybeSingle();
  if (!e) {
    $("#app").innerHTML = `<h1>${esc(name)}</h1><p>아직 없는 문서예요. ${editor ? `<a href="/새문서?category=${encodeURIComponent(cat)}&name=${encodeURIComponent(name)}">새로 만들기</a>` : "편집자가 만들면 나타나요."}</p>`;
    return;
  }
  const idx = await index();
  // 넘겨주기: 본문 첫 줄에 #넘겨주기 [[문서]] 라고 쓰면 그 문서로 이동해요
  const rd = (e.description || "").match(/^\s*#넘겨주기\s*\[\[(.+?)\]\]/);
  if (rd && !param("from")) {
    const [c, n] = target(rd[1], idx);
    if (c && idx.keys.has(c + "/" + n)) { location.replace(path(c, n) + "?from=" + encodeURIComponent(e.name)); return; }
  }
  document.title = `${e.name} - 환장 RPG 위키`;
  const vid = cat === "영상" ? ytId(Object.values(e.extra || {}).find((v) => ytId(v))) : null;
  const rows = [...(e.first_episode ? [["첫 등장", e.first_episode]] : []), ...(e.last_episode ? [["마지막 등장", e.last_episode]] : []), ...Object.entries(e.extra || {})];
  const cell = (v) => (isUrl(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener noreferrer">링크</a>` : esc(v));
  const info = `<aside class="info">${img(e)}${e.summary ? `<p>${esc(e.summary)}</p>` : ""}${rows.length ? `<table>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${cell(v)}</td></tr>`).join("")}</table>` : ""}</aside>`;
  const body = e.description ? md(e.description, idx) : `<p class="muted">아직 본문이 없어요.${editor ? " 위의 편집 버튼으로 채워 주세요." : ""}</p>`;
  const [a, b] = await Promise.all([
    sb.from("entries").select("category,name").ilike("description", `%[[${e.name}]]%`).neq("id", e.id).limit(30),
    sb.from("entries").select("category,name").ilike("description", `%[[${cat}/${e.name}]]%`).neq("id", e.id).limit(30),
  ]);
  const back = [...new Map([...(a.data || []), ...(b.data || [])].map((r) => [r.category + "/" + r.name, r])).values()];
  $("#app").innerHTML = `
    <a href="${path(cat)}"><span class="badge">${esc(cat)}</span></a>
    · <a href="${path("역사", cat, e.name)}">역사</a>${editor ? ` · <a href="${path("편집", cat, e.name)}">편집</a>` : ""}
    <h1>${esc(e.name)}</h1>${param("from") ? `<p class="hint">'${esc(param("from"))}'에서 넘어왔어요.</p>` : ""}${info}
    ${vid ? `<div class="yt"><iframe src="https://www.youtube.com/embed/${vid}" allowfullscreen loading="lazy"></iframe></div>` : ""}
    <div class="body">${e.is_spoiler ? spoil(body) : body}</div>
    ${back.length ? `<h3 style="clear:both">이 문서를 가리키는 문서</h3><ul>${back.map((r) => `<li><span class="badge">${esc(r.category)}</span> <a href="${path(r.category, r.name)}">${esc(r.name)}</a></li>`).join("")}</ul>` : ""}`;
}

// ---------------------------------------------------------------- 문서 역사 / 되돌리기
const REV = ["category", "name", "summary", "first_episode", "last_episode", "image_url", "extra", "is_spoiler", "description"];
const pick = (o) => Object.fromEntries(REV.map((k) => [k, o[k] ?? null]));

async function showHistory(cat, name) {
  const { data: e } = await sb.from("entries").select("*").eq("category", cat).eq("name", name).maybeSingle();
  if (!e) { $("#app").innerHTML = "<p>문서를 찾을 수 없어요.</p>"; return; }
  const { data: revs = [] } = await sb.from("entry_revisions").select("id,editor_name,created_at,edit_summary,new_data").eq("entry_id", e.id).order("created_at", { ascending: false }).limit(50);
  const idx = await index();
  $("#app").innerHTML = `<h1>${esc(name)} — 역사</h1><p><a href="${path(cat, name)}">← 문서로</a></p><div id="revs">${revs.map((r, i) => `<div class="rev"><b>${fmtDate(r.created_at)}</b> · ${esc(r.editor_name || "")}${r.edit_summary ? ` · <i>${esc(r.edit_summary)}</i>` : ""}${editor ? `<button class="chip" data-i="${i}">이 판으로 되돌리기</button>` : ""}<details><summary>내용 보기</summary><div class="body">${r.new_data?.description ? md(r.new_data.description, idx) : `<pre>${esc(JSON.stringify(r.new_data, null, 1))}</pre>`}</div></details></div>`).join("") || `<p class="muted">기록이 없어요.</p>`}</div>`;
  $("#revs").onclick = async (ev) => {
    const i = ev.target.dataset.i;
    if (i === undefined || !confirm("이 판으로 되돌릴까요?")) return;
    const nd = revs[i].new_data || {}, upd = {};
    ["description", "summary", "first_episode", "last_episode", "image_url", "extra", "is_spoiler"].forEach((k) => { if (k in nd) upd[k] = nd[k]; });
    Object.assign(upd, { updated_by: userName(), updated_at: new Date().toISOString() });
    const { error } = await sb.from("entries").update(upd).eq("id", e.id);
    if (error) return alert("되돌리기에 실패했어요.");
    await sb.from("entry_revisions").insert({ entry_id: e.id, editor_name: userName(), old_data: pick(e), new_data: pick({ ...e, ...upd }), edit_summary: `${fmtDate(revs[i].created_at)} 판으로 되돌림` });
    location.href = path(cat, name);
  };
}

// ---------------------------------------------------------------- 편집 / 새 문서
const toExtra = (t) => Object.fromEntries(t.replace(/：/g, ":").split("\n").map((l) => l.split(/:(.*)/s).map((x) => x.trim())).filter(([k, v]) => k && v));
const fromExtra = (o) => Object.entries(o || {}).map(([k, v]) => `${k}: ${v}`).join("\n");

async function edit(cat, name) {
  if (!editor) { $("#app").innerHTML = `<p>${user ? "편집 권한이 없어요. 디스코드에서 편집 역할을 받은 뒤 다시 로그인해 주세요." : "편집하려면 먼저 로그인해 주세요."}</p>`; return; }
  let e = { category: param("category") || cat || "캐릭터", name: param("name") || "", extra: {}, description: TEMPLATE, is_spoiler: false };
  if (name) {
    const { data } = await sb.from("entries").select("*").eq("category", cat).eq("name", name).maybeSingle();
    if (!data) { $("#app").innerHTML = "<p>편집할 문서를 찾을 수 없어요.</p>"; return; }
    e = data;
  }
  const idx = await index();
  $("#app").innerHTML = `<h1>${name ? "문서 편집" : "새 문서"}</h1><form onsubmit="return false">
    <label>항목(분류)</label><select id="f_cat">${CATEGORIES.map((c) => `<option ${c === e.category ? "selected" : ""}>${c}</option>`).join("")}</select>
    <label>문서 이름 (주소가 됩니다. / 는 쓸 수 없어요)</label><input type="text" id="f_name" value="${esc(e.name)}">
    <label>사진 주소 (https://...)</label><input type="text" id="f_img" value="${esc(e.image_url)}">
    <label>간단한 특징 (봇과 문서 오른쪽 상자에 보여요)</label><input type="text" id="f_sum" value="${esc(e.summary)}">
    <label>첫 등장 화</label><input type="text" id="f_first" value="${esc(e.first_episode)}">
    <label>마지막 등장 화</label><input type="text" id="f_last" value="${esc(e.last_episode)}">
    <label>추가 정보 (한 줄에 항목: 값. 영상 문서는 유튜브: 주소 를 넣으면 영상이 나와요)</label><textarea id="f_extra" rows="3">${esc(fromExtra(e.extra))}</textarea>
    <label><input type="checkbox" id="f_sp" ${e.is_spoiler ? "checked" : ""}> 스포일러 (본문을 흐리게 가려요)</label>
    <label>본문 (마크다운. ## 제목, **굵게**, [[문서]] 링크, [* 각주], 첫 줄 #넘겨주기 [[문서]])</label><textarea id="f_body" rows="18">${esc(e.description)}</textarea>
    <label>편집 요약 (무엇을 바꿨는지 짧게)</label><input type="text" id="f_note">
    <button class="btn" id="save">저장</button><button class="btn sub" id="pv">미리보기</button><span id="msg" class="muted"></span>
    <div id="prev" hidden></div></form>`;
  const prev = () => ($("#prev").innerHTML = md($("#f_body").value, idx));
  $("#pv").onclick = () => { $("#prev").hidden = !$("#prev").hidden; if (!$("#prev").hidden) prev(); };
  $("#f_body").oninput = () => { if (!$("#prev").hidden) prev(); };
  $("#save").onclick = async () => {
    const v = (id) => $("#" + id).value.trim();
    const data = { category: v("f_cat"), name: v("f_name"), image_url: v("f_img") || null, summary: v("f_sum") || null, first_episode: v("f_first") || null, last_episode: v("f_last") || null, extra: toExtra($("#f_extra").value), is_spoiler: $("#f_sp").checked, description: $("#f_body").value.trim() || null, updated_by: userName(), updated_at: new Date().toISOString() };
    const fail = (t) => ($("#msg").textContent = t);
    if (!data.name || data.name.includes("/")) return fail("이름을 확인해 주세요. (비어 있거나 / 가 들어 있어요)");
    if (data.image_url && !isUrl(data.image_url)) return fail("사진 주소는 http(s):// 로 시작해야 해요.");
    fail("저장 중…");
    const q = name ? sb.from("entries").update(data).eq("id", e.id) : sb.from("entries").insert(data);
    const { data: saved, error } = await q.select().single();
    if (error) return fail("저장에 실패했어요. 같은 항목에 같은 이름이 있거나 권한이 없을 수 있어요.");
    await sb.from("entry_revisions").insert({ entry_id: saved.id, editor_name: data.updated_by, old_data: name ? pick(e) : null, new_data: pick(data), edit_summary: v("f_note") || (name ? null : "새 문서") });
    location.href = path(data.category, data.name);
  };
}

// ---------------------------------------------------------------- 주소 처리
async function route() {
  const [a, b, c] = seg();
  if (!a || a === "항목") return home();
  if (a === "최근변경") return recent();
  if (a === "검색") return search();
  if (a === "새문서") return edit(null, null);
  if (a === "편집" && b && c) return edit(b, c);
  if (a === "역사" && b && c) return showHistory(b, c);
  if (CATEGORIES.includes(a)) return b ? entry(a, b) : list(a);
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
