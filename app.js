/* Meal Buddy: entirely fictional, local-only interactions. Classic script. */
(() => {
  'use strict';
  const D = window.MealBuddyData;
  const L = window.MealBuddyLogic;
  const KEY = 'mealBuddyDemo.v1';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateOK = value => typeof value === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
  const unique = items => new Set(items).size === items.length;
  const textOK = (value, max = 1000) => typeof value === 'string' && value.length <= max;
  const statusLabels = { pending: '等待回覆', accepted: '已接受（模擬）', declined: '已婉拒', expired: '已失效', cancelled: '已取消' };
  const windowLabels = { now: '現在', later: '等等', tomorrow: '明天' };
  const tastes = { salty: '鹹香', sweet: '甜', spicy: '辣', light: '清淡' };
  let state, seed, voiceTimer, voiceGeneration = 0, toastTimer;
  let voiceStatus = '語音 Demo：不會啟用麥克風';
  let voiceBusy = false;
  let storageWarning = '';
  let activeChat = null;
  const now = () => new Date(state.now);
  const user = id => seed.users.find(u => u.id === id);
  const restaurant = id => seed.restaurants.find(r => r.id === id);
  const group = id => state.groups.find(g => g.id === id);
  const intent = id => state.intents.find(i => i.id === id);
  const me = () => seed.currentUserId;
  const uid = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  function fmt(value) {
    if (!dateOK(value)) return '時間未設定';
    return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  }
  function localDate(value) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  function parseLocal(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error('請選擇有效的台北日期與時間。');
    const parsed = new Date(`${value}:00+08:00`);
    if (!Number.isFinite(+parsed) || localDate(parsed.toISOString()) !== value) throw Error('日期或時間無效。');
    return parsed.toISOString();
  }
  function defaultTime() {
    const date = localDate(state.now).slice(0, 10);
    const day = state.timeWindow === 'tomorrow' ? new Date(Date.parse(`${date}T12:00:00+08:00`) + 86400000) : now();
    return `${localDate(day.toISOString()).slice(0, 10)}T${state.timeWindow === 'later' ? '18:30' : state.timeWindow === 'tomorrow' ? '12:30' : '12:15'}`;
  }
  function fresh() {
    return { version: 1, now: seed.now, view: 'home', selectedRestaurantId: seed.restaurants[0].id, timeWindow: 'now', criteria: { ...L.parseDemoRequest('今天午餐預算150元'), maxDistance: 1500, sort: 'match' }, requestText: '明天午餐想吃鹹的，預算100元，附近有人一起吃更好', invitations: structuredClone(seed.invitations), groups: structuredClone(seed.groups), intents: structuredClone(seed.intents), blocked: [], reports: [], chats: {} };
  }
  function validCriteria(c) {
    return !!c && ['today', 'tomorrow'].includes(c.day) && ['breakfast', 'lunch', 'dinner'].includes(c.meal) && Array.isArray(c.taste) && c.taste.length <= 10 && c.taste.every(x => textOK(x, 30)) && Number.isFinite(c.budget) && c.budget >= 1 && c.budget <= 10000 && Number.isFinite(c.maxDistance) && c.maxDistance >= 1 && c.maxDistance <= 50000 && ['match', 'distance', 'rating'].includes(c.sort);
  }
  function parsedCriteria(text) {
    const next = { ...state.criteria, ...L.parseDemoRequest(text) };
    if (!validCriteria(next)) throw Error('每人預算需介於 1–10000 元，請修改文字或手動編輯條件。');
    return next;
  }
  function lastSupportedTime() {
    return `${localDate(new Date(+now() + 86400000).toISOString()).slice(0, 10)}T23:59`;
  }
  function checkHorizon(startAt) {
    const local = localDate(startAt);
    if (local.slice(0, 10) < localDate(state.now).slice(0, 10) || local > lastSupportedTime()) throw Error('此 Demo 只支援台北時間今天或明天的用餐時段。');
  }
  // Hydrate only known fields; reject the complete snapshot if any relation is invalid.
  function hydrate(raw) {
    if (!raw || typeof raw !== 'object' || raw.version !== 1 || !dateOK(raw.now) || localDate(raw.now).slice(0, 10) !== localDate(seed.now).slice(0, 10)) throw Error('舊版或跨日資料');
    const users = new Set(seed.users.map(u => u.id));
    const restaurants = new Set(seed.restaurants.map(r => r.id));
    const ids = (value, known) => Array.isArray(value) && value.length <= 100 && unique(value) && value.every(id => typeof id === 'string' && known.has(id));
    const list = (value, check) => Array.isArray(value) && value.length <= 300 && unique(value.map(x => x?.id)) && value.every(x => x && textOK(x.id, 120) && /^[\w-]+$/.test(x.id) && check(x));
    const c = validCriteria(raw.criteria) ? raw.criteria : fresh().criteria;
    if (!validCriteria(raw.criteria)) storageWarning = '保存的推薦條件無效，已重設條件；飯局、邀請與聊天紀錄仍保留。';
    if (!list(raw.intents, i => users.has(i.userId) && restaurants.has(i.restaurantId) && ['active', 'matched', 'expired', 'cancelled'].includes(i.status) && [i.startAt, i.endAt, i.expiresAt].every(dateOK) && Date.parse(i.endAt) > Date.parse(i.startAt) && textOK(i.message) && Number.isFinite(i.budget))) throw Error('意向資料無效');
    if (!list(raw.groups, g => users.has(g.hostUserId) && restaurants.has(g.restaurantId) && dateOK(g.startAt) && Number.isInteger(g.capacity) && g.capacity >= 2 && g.capacity <= 6 && ids(g.memberIds, users) && g.memberIds.length <= g.capacity && g.memberIds.includes(g.hostUserId) && ids(g.applicantIds, users) && !g.applicantIds.some(id => g.memberIds.includes(id)) && textOK(g.description) && ['open', 'full', 'cancelled', 'closed'].includes(g.status) && ['public', 'invite_only'].includes(g.visibility) && typeof g.approvalRequired === 'boolean')) throw Error('飯局資料無效');
    const intents = new Set(raw.intents.map(i => i.id));
    const groups = new Set(raw.groups.map(g => g.id));
    if (!list(raw.invitations, i => users.has(i.senderUserId) && users.has(i.recipientUserId) && i.senderUserId !== i.recipientUserId && restaurants.has(i.restaurantId) && intents.has(i.mealIntentId) && (!i.mealGroupId || groups.has(i.mealGroupId)) && Object.hasOwn(statusLabels, i.status) && dateOK(i.expiresAt) && dateOK(i.proposedAt) && textOK(i.message))) throw Error('邀請資料無效');
    if (!ids(raw.blocked, users) || raw.blocked.includes(me()) || !Array.isArray(raw.reports) || raw.reports.length > 300 || !raw.reports.every(r => users.has(r.userId) && textOK(r.reason, 300) && dateOK(r.at))) throw Error('安全設定無效');
    if (!raw.chats || typeof raw.chats !== 'object' || Array.isArray(raw.chats) || Object.keys(raw.chats).length > 300) throw Error('對話資料無效');
    const chats = {};
    for (const [key, messages] of Object.entries(raw.chats)) {
      if (!/^(inv|group):[\w-]+$/.test(key) || !Array.isArray(messages) || messages.length > 200 || !messages.every(m => users.has(m.senderId) && textOK(m.text, 500) && dateOK(m.at))) throw Error('訊息資料無效');
      chats[key] = messages.map(m => ({ senderId: m.senderId, text: m.text, at: m.at }));
    }
    if (!textOK(raw.requestText, 500)) throw Error('輸入資料無效');
    return { ...fresh(), now: seed.now, criteria: { day: c.day, meal: c.meal, taste: c.taste, budget: c.budget, maxDistance: c.maxDistance, sort: c.sort }, requestText: raw.requestText, view: ['home', 'buddies', 'meals', 'profile', 'restaurant'].includes(raw.view) ? raw.view : 'home', selectedRestaurantId: restaurants.has(raw.selectedRestaurantId) ? raw.selectedRestaurantId : seed.restaurants[0].id, timeWindow: Object.hasOwn(windowLabels, raw.timeWindow) ? raw.timeWindow : 'now', intents: raw.intents, groups: raw.groups, invitations: raw.invitations, blocked: raw.blocked, reports: raw.reports, chats };
  }
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify(state)); }
    catch { storageWarning = '此瀏覽器無法保存分頁資料；目前仍可操作，重新整理將重設。'; }
  }
  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').hidden = false;
    $('toast').classList.add('show');
    toastTimer = setTimeout(() => { $('toast').hidden = true; $('toast').classList.remove('show'); }, 4800);
  }
  function reportError(message) {
    const id = ['profileDialog', 'inviteSheet', 'groupDialog', 'chatDialog'].find(id => $(id).open);
    if (!id) { toast(message); return; }
    const alert = $(id + 'Error');
    alert.textContent = message;
    alert.hidden = false;
    alert.focus();
  }
  function btn(label, action, id = '', cls = 'secondary', extra = '') {
    return `<button type="button" class="${cls}" data-action="${action}" data-id="${esc(id)}" ${extra}>${esc(label)}</button>`;
  }
  function empty(message) { return `<div class="empty">${esc(message)}</div>`; }
  function avatar(u) {
    // Only embedded illustration images are allowed; never load a remote profile.
    const src = /^data:image\/(svg\+xml|png|jpeg|webp);/i.test(u.photoUrl || '') ? u.photoUrl : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="80" height="80" fill="%23f8dfbb"/%3E%3Ccircle cx="40" cy="28" r="14" fill="%239f765c"/%3E%3Cpath d="M12 80V66a28 28 0 0156 0v14" fill="%239f765c"/%3E%3C/svg%3E';
    return `<img class="avatar" src="${esc(src)}" alt="${esc(u.displayName)}的虛構人物插畫" width="48" height="48">`;
  }
  function visibleIntents(rid) {
    return state.intents.filter(i => (!rid || i.restaurantId === rid) && !state.blocked.includes(i.userId));
  }
  function windows(rid) { return L.groupIntentsByWindow(visibleIntents(rid), now()); }
  function eligibleGroups(i) {
    return state.groups.filter(g => g.hostUserId === me() && g.restaurantId === i.restaurantId && g.status === 'open' && g.memberIds.length < g.capacity && !g.memberIds.includes(i.userId) && Date.parse(g.startAt) >= +now() && Date.parse(g.startAt) >= Date.parse(i.startAt) && Date.parse(g.startAt) < Date.parse(i.endAt) && Date.parse(g.startAt) < Date.parse(i.expiresAt));
  }
  function groupWindow(g) {
    const buckets = L.groupIntentsByWindow([{ id: g.id, startAt: g.startAt, endAt: new Date(Date.parse(g.startAt) + 3600000).toISOString(), expiresAt: new Date(Date.parse(g.startAt) + 3600000).toISOString(), status: 'active' }], now());
    return Object.keys(buckets).find(k => buckets[k].length);
  }
  function availableGroups(rid) { return state.groups.filter(g => (!rid || g.restaurantId === rid) && g.visibility === 'public' && !['cancelled', 'closed'].includes(g.status) && !state.blocked.includes(g.hostUserId) && Date.parse(g.startAt) >= +now()); }
  function renderParsedCriteria(c) {
    return `<form id="criteriaForm" class="criteria form-grid" aria-label="編輯模擬解析條件"><p class="notice full-width">AI Demo 模擬解析 · 本地規則，可自行修正</p>
      <label class="field">哪一天<select name="day"><option value="today" ${c.day === 'today' ? 'selected' : ''}>今天</option><option value="tomorrow" ${c.day === 'tomorrow' ? 'selected' : ''}>明天</option></select></label>
      <label class="field">餐別<select name="meal">${Object.entries({ breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }).map(([k, v]) => `<option value="${k}" ${c.meal === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field">每人預算（元）<input name="budget" type="number" min="1" max="10000" required value="${esc(c.budget)}"></label>
      <label class="field">距離上限（公尺）<input name="maxDistance" type="number" min="1" max="50000" required value="${esc(c.maxDistance)}"></label>
      <fieldset class="full-width"><legend>口味（可複選）</legend><div class="chips">${Object.entries(tastes).map(([k, v]) => `<label class="chip"><input type="checkbox" name="taste" value="${k}" ${c.taste.includes(k) ? 'checked' : ''}>${v}</label>`).join('')}</div></fieldset>
      <label class="field full-width">排序<select name="sort">${Object.entries({ match: 'JEV 綜合推薦', distance: '距離由近到遠', rating: '評分由高到低' }).map(([k, v]) => `<option value="${k}" ${c.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <button class="secondary full-width" type="submit">更新推薦條件</button></form>`;
  }
  function renderRestaurantList(restaurants) {
    return `<div class="restaurant-list">${restaurants.map(r => {
      const w = windows(r.id);
      const g = availableGroups(r.id).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0];
      return `<article class="restaurant-card"><div class="food-art" data-food="${esc(r.id)}" aria-label="餐點示意插畫"><span aria-hidden="true">${({ r1: '🍜', r2: '🍱', r3: '🥟', r4: '🍛' })[r.id] || '🍽️'}</span></div><div class="restaurant-body"><div class="restaurant-meta"><span class="tag">${esc(r.category)}</span><span>${r.open ? '營業中（模擬）' : '休息中'}</span></div><h3>${esc(r.name)}</h3><p>約 NT$${esc(r.price)} · ${esc(r.distance)} 公尺</p><p class="rating">★ ${esc(r.rating)}（${esc(r.ratingCount)} 則虛構評分）${r.matchScore !== undefined ? ` · JEV ${esc(r.matchScore)} 分` : ''}</p><p class="green">現在 ${w.now.length} 人 · 等等 ${w.later.length} 人 · 明天 ${w.tomorrow.length} 人想吃</p>${g ? `<p class="small">最近飯局：${fmt(g.startAt)} · ${g.memberIds.length}/${g.capacity} 人</p>` : ''}<div class="restaurant-footer">${btn('看看誰想吃', 'restaurant', r.id, 'primary')}</div></div></article>`;
    }).join('') || empty('找不到符合的餐廳，試著提高預算或放寬距離。')}</div>`;
  }
  function renderHome() {
    const c = state.criteria;
    const chips = [c.day === 'tomorrow' ? '明天' : '今天', { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' }[c.meal], ...c.taste.map(t => tastes[t] || t), `NT$${c.budget} 內`, `${c.maxDistance}m 內`];
    $('homeView').innerHTML = `<div class="page-head"><p class="eyebrow">今天也好好吃飯</p><h1>想吃什麼，找個飯友吧</h1></div>
      <section class="hero"><div class="hero-copy"><h2>先選好吃的，再遇見聊得來的人</h2><p>純交友共餐 · 18+ · 公開餐廳</p>${btn(voiceBusy ? '正在模擬辨識…' : '體驗語音 Demo', 'voice', '', 'voice-button', voiceBusy ? 'disabled' : '')}<p id="voiceStatus" class="voice-status" role="status">${esc(voiceStatus)}</p></div><div class="hero-art" aria-hidden="true">🍜</div></section>
      <div class="chips" aria-label="目前推薦條件">${chips.map(t => `<span class="chip">${esc(t)}</span>`).join('')}</div>
      <details id="manualRequestDetails"><summary class="ghost">用文字說說想吃什麼</summary><form id="requestForm" class="request-form"><label class="field" for="requestText">也可以用文字說說想吃什麼</label><textarea id="requestText" name="request" maxlength="500" required rows="2">${esc(state.requestText)}</textarea><button class="primary" type="submit">模擬解析需求</button></form></details>
      <details id="criteriaDetails"><summary class="ghost">編輯條件與排序 · AI Demo 模擬解析</summary>${renderParsedCriteria(c)}</details>
      <div id="recommendations" class="section-head" tabindex="-1"><h2>為你推薦餐廳</h2><span class="muted small">距離為虛構資料</span></div>${renderRestaurantList(L.rankRestaurants(seed.restaurants, c))}
      <div class="section-head"><h2>附近公開飯局</h2></div>${availableGroups().slice(0, 3).map(groupCard).join('') || empty('目前沒有公開飯局，可以自己發起。')}`;
  }
  function scrollToRecommendations() {
    if (state.view !== 'home' || !$('recommendations')) return;
    const container = $('app'), target = $('recommendations');
    container.scrollTo({ top: container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 12, behavior: 'auto' });
  }
  function buddyCard(i) {
    const u = user(i.userId);
    return `<article class="buddy-card">${avatar(u)}<div class="buddy-info"><h3>${esc(u.displayName)} ${i.userId === me() ? '（我）' : ''}</h3><p class="small">${esc(u.ageRange)} · ${esc(u.mealStyle)}</p><p>${fmt(i.startAt)} ～ ${new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(i.endAt))}</p><p>${esc(i.message)}</p><p class="small">${u.interests.slice(0, 3).map(esc).join(' · ')}</p><p class="small">${esc(u.verificationStatus)}（模擬） · 共餐 ${esc(u.mealCount)} 次 · 準時 ${esc(u.onTimeRate)}% · ★${esc(u.rating)}</p>${i.userId === me() ? btn('取消我的意向', 'cancel-intent', i.id) : btn('查看飯友資料', 'profile', i.id)}</div></article>`;
  }
  function groupCard(g, showOpenButton = true) {
    const joined = g.memberIds.includes(me());
    const pending = g.applicantIds.includes(me());
    return `<article class="group-card"><div class="section-head"><h3>${esc(restaurant(g.restaurantId).name)}</h3><span class="capacity">${g.memberIds.length}/${g.capacity} 人</span></div><p>${fmt(g.startAt)} · ${esc(user(g.hostUserId).displayName)}發起</p><p>${esc(g.description)}</p><div class="avatar-stack">${g.memberIds.map(id => avatar(user(id))).join('')}</div><p class="small">人物皆為插畫 · ${g.approvalRequired ? '需發起人確認' : '免審核，可直接加入'} · ${g.status === 'cancelled' ? '已取消' : joined ? '已加入' : pending ? '申請待確認' : g.memberIds.length >= g.capacity ? '已額滿' : '尚有名額'}</p>${showOpenButton !== false ? btn('查看飯局', 'group', g.id) : ''}</article>`;
  }
  function renderRestaurantDetail() {
    const r = restaurant(state.selectedRestaurantId);
    const w = windows(r.id);
    $('restaurantView').innerHTML = `${btn('← 返回餐廳列表', 'back', '', 'back-button')}<div class="detail-hero"><div class="food-art" data-food="${esc(r.id)}" aria-hidden="true">🍽️</div><h1>${esc(r.name)}</h1><p>${esc(r.description)}</p><p>${esc(r.category)} · 約 NT$${esc(r.price)} · ${esc(r.distance)} 公尺 · ★${esc(r.rating)}</p><p class="muted">${esc(r.address)}（虛構公開餐廳）</p></div><div class="time-tabs" role="tablist" aria-label="想吃的時間">${Object.entries(windowLabels).map(([k, v]) => `<button type="button" role="tab" id="time-${k}" aria-controls="intentPanel" aria-selected="${state.timeWindow === k}" tabindex="${state.timeWindow === k ? '0' : '-1'}" data-action="time" data-id="${k}">${v} ${w[k].length}</button>`).join('')}</div><section id="intentPanel" role="tabpanel" aria-labelledby="time-${state.timeWindow}"><div class="section-head"><h2>${windowLabels[state.timeWindow]}想吃的飯友</h2></div>${w[state.timeWindow].map(buddyCard).join('') || empty('這個時段還沒有人發布意向。你可以成為第一位！')}<div class="actions">${btn('發布我的用餐意向', 'publish', r.id, 'primary')}${btn('發起 2–6 人飯局', 'create-group', r.id)}</div><div class="section-head"><h2>這個時段的公開飯局</h2></div>${availableGroups(r.id).filter(g => groupWindow(g) === state.timeWindow).map(groupCard).join('') || empty('還沒有這個時段的飯局，歡迎自行發起。')}</section>`;
  }
  function renderBuddies() {
    $('buddiesView').innerHTML = `<div class="page-head"><p class="eyebrow">從同一間餐廳開始</p><h1>附近有人想吃</h1><p class="muted">僅顯示主動發布的有效意向；距離與人物均為虛構。</p></div>${renderRestaurantList(seed.restaurants)}`;
  }
  function invitationCard(i, received) {
    const other = user(received ? i.senderUserId : i.recipientUserId);
    const blocked = state.blocked.includes(other.id);
    return `<article class="invitation-card"><div class="row">${avatar(other)}<h3>${esc(other.displayName)}</h3></div><p>${esc(restaurant(i.restaurantId).name)} · ${fmt(i.proposedAt)}</p><p>${i.mealGroupId ? '多人飯局邀請' : '一對一共餐邀請'} · <span class="tag">${statusLabels[i.status]}</span></p><p>${esc(i.message)}</p><p class="small muted">到期：${fmt(i.expiresAt)}</p><div class="actions">${i.status === 'pending' && !blocked ? received ? `${btn('接受邀請（模擬）', 'accept-invite', i.id, 'primary')}${btn('婉拒邀請', 'decline-invite', i.id)}` : `${btn('模擬對方接受', 'accept-invite', i.id, 'primary')}${btn('模擬對方婉拒', 'decline-invite', i.id)}${btn('取消邀請', 'cancel-invite', i.id)}` : ''}${i.status === 'accepted' && !blocked ? btn('開啟示範聊天室', 'chat-invite', i.id, 'primary') : ''}${i.status === 'accepted' && !i.mealGroupId ? btn('退出這次共餐', 'leave-invite', i.id) : ''}</div>${blocked ? '<p class="notice">已封鎖此人物，互動已停用。</p>' : ''}</article>`;
  }
  function renderMeals() {
    const received = state.invitations.filter(i => i.recipientUserId === me());
    const sent = state.invitations.filter(i => i.senderUserId === me());
    const joined = state.groups.filter(g => g.memberIds.includes(me()) && !['cancelled', 'closed'].includes(g.status));
    const applied = state.groups.filter(g => g.applicantIds.includes(me()) && g.status !== 'cancelled');
    $('mealsView').innerHTML = `<div class="page-head"><h1>我的飯局</h1><p class="notice">所有邀請、接受與訊息只在本分頁模擬，沒有通知或聯絡任何真人。</p></div><h2>收到的邀請</h2>${received.map(i => invitationCard(i, true)).join('') || empty('目前沒有收到邀請。')}<h2>送出的邀請</h2>${sent.map(i => invitationCard(i, false)).join('') || empty('還沒有送出邀請，從餐廳挑選飯友吧。')}<h2>待確認的申請</h2>${applied.map(groupCard).join('') || empty('沒有待確認的飯局申請。')}<h2>已加入的飯局</h2>${joined.map(groupCard).join('') || empty('尚未加入多人飯局。')}${btn('發起新飯局', 'create-group', state.selectedRestaurantId, 'primary')}`;
  }
  function profileBody(u) {
    return `<div class="profile-hero">${avatar(u)}<h2>${esc(u.displayName)}</h2><p>${esc(u.ageRange)} · 人物插畫（非真人照片）</p></div><p>${esc(u.bio)}</p><div class="profile-stats"><span>共餐 ${esc(u.mealCount)} 次</span><span>準時 ${esc(u.onTimeRate)}%</span><span>★ ${esc(u.rating)}</span></div><p>驗證狀態：${esc(u.verificationStatus)}（示範，未進行真實驗證）</p><p>興趣：${u.interests.map(esc).join('、') || '未填寫'}</p><p>飲食喜好：${u.foodPreferences.map(esc).join('、') || '未填寫'}</p><p>飲食限制：${u.dietaryRestrictions.map(esc).join('、') || '無特別限制'}</p><p>用餐風格：${esc(u.mealStyle)}</p><p class="notice">純交友共餐平台 · 僅限 18+ · 不提供聯絡方式與即時位置。人物、信用紀錄與評分皆為虛構。</p>`;
  }
  function renderProfile() {
    $('profileView').innerHTML = `<div class="page-head"><h1>我的示範資料</h1></div>${profileBody(user(me()))}<h2>我的有效意向</h2>${state.intents.filter(i => i.userId === me() && i.status === 'active' && Date.parse(i.expiresAt) > +now()).map(i => `<article class="invitation-card"><h3>${esc(restaurant(i.restaurantId).name)}</h3><p>${fmt(i.startAt)} · ${esc(i.message)}</p>${btn('取消我的意向', 'cancel-intent', i.id)}</article>`).join('') || empty('尚未發布自己的用餐意向。')}<h2>封鎖名單（本地示範）</h2>${state.blocked.map(id => `<p>${esc(user(id).displayName)} ${btn('解除封鎖', 'unblock', id)}</p>`).join('') || '<p class="muted">尚未封鎖人物。</p>'}<p>已記錄 ${state.reports.length} 筆本地示範檢舉，未送交任何平台。</p><p class="muted">資料只保存在此分頁；跨日會重新建立示範時鐘。</p>${btn('重設本分頁 Demo', 'reset', '', 'secondary')}`;
  }
  function expire() {
    state.invitations = state.invitations.map(i => i.status === 'pending' && Date.parse(i.expiresAt) <= +now() ? { ...i, status: 'expired' } : i);
  }
  function render() {
    expire();
    for (const view of ['home', 'buddies', 'meals', 'profile', 'restaurant']) $(view + 'View').hidden = state.view !== view;
    ({ home: renderHome, buddies: renderBuddies, meals: renderMeals, profile: renderProfile, restaurant: renderRestaurantDetail })[state.view]();
    document.querySelectorAll('[data-nav]').forEach(b => { const on = b.dataset.nav === state.view || state.view === 'restaurant' && b.dataset.nav === 'buddies'; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const disclosure = document.querySelector('.demo-disclosure');
    if (disclosure) {
      disclosure.textContent = `全站虛構・AI／語音模擬｜台北 ${fmt(state.now)}（固定）`;
      disclosure.title = `人物插畫、餐廳、評分、邀請與訊息皆為模擬；不會啟用麥克風或傳送真實通知。${storageWarning}`;
    }
    save();
  }
  function navigate(view) { state.view = view; render(); $('app').scrollTop = 0; $('app').focus({ preventScroll: true }); }
  function openRestaurant(id) { if (!restaurant(id)) return; state.selectedRestaurantId = id; state.timeWindow = state.criteria.day === 'tomorrow' ? 'tomorrow' : 'now'; navigate('restaurant'); }
  function setTimeWindow(value) { if (!Object.hasOwn(windowLabels, value)) return; state.timeWindow = value; render(); $('time-' + value)?.focus(); }
  function closeDialogs() { ['profileDialog', 'inviteSheet', 'groupDialog', 'chatDialog'].forEach(id => { if ($(id).open) $(id).close(); }); activeChat = null; }
  function dialog(id, title, body) {
    closeDialogs();
    const el = $(id);
    if (body.includes('id="createGroupForm"') || body.includes('id="intentForm"')) {
      body = `<p class="notice">本次 Demo 只支援台北時間今天或明天的用餐時段。</p>${body.replace('name="startAt"', `name="startAt" max="${lastSupportedTime()}"`)}`;
    }
    el.innerHTML = `<div class="sheet-head"><h2 id="${id}Title">${esc(title)}</h2>${btn('關閉', 'close', id, 'ghost')}</div><div class="sheet-body"><p id="${id}Error" class="notice" role="alert" aria-atomic="true" tabindex="-1" hidden></p>${body}</div>`;
    el.setAttribute('aria-labelledby', `${id}Title`);
    el.showModal();
  }
  function openBuddyProfile(userId, intentId) {
    const u = user(userId), i = intent(intentId);
    if (!u) return;
    dialog('profileDialog', '飯友資料', `${profileBody(u)}${i && !state.blocked.includes(u.id) ? `<div class="actions">${btn('邀他一起吃', 'invite-one', i.id, 'primary')}${btn('邀請加入飯局', 'invite-group', i.id)}</div>` : ''}${u.id !== me() ? `<div class="actions">${btn(state.blocked.includes(u.id) ? '解除封鎖' : '封鎖這位飯友', state.blocked.includes(u.id) ? 'unblock' : 'block', u.id)}${btn('檢舉（本地示範）', 'report', u.id)}</div>` : ''}`);
  }
  function openInviteSheet(mode, target) {
    const i = intent(target);
    if (!i) throw Error('找不到這則用餐意向。');
    const verdict = L.canInvite(me(), i.userId, i, state.invitations, now());
    const groups = eligibleGroups(i);
    const selected = groups[0];
    const initial = mode === 'group' && selected ? selected.startAt : new Date(Math.max(Date.parse(i.startAt), +now())).toISOString();
    dialog('inviteSheet', `邀請 ${user(i.userId).displayName}`, `<p>${esc(restaurant(i.restaurantId).name)}</p><p class="small">對方時段：${fmt(i.startAt)} ～ ${fmt(i.endAt)}</p><div class="mode-switch">${btn('一對一', 'invite-one', i.id, mode === 'one' ? 'primary' : 'secondary')}${btn('加入我的多人飯局', 'invite-group', i.id, mode === 'group' ? 'primary' : 'secondary')}</div><form id="inviteForm" data-intent="${esc(i.id)}" data-mode="${mode}" class="stack">${mode === 'group' ? `<label class="field">我發起的相容飯局<select name="mealGroupId" required>${groups.map(g => `<option value="${esc(g.id)}">${fmt(g.startAt)} · ${g.memberIds.length}/${g.capacity} 人 · ${esc(g.description)}</option>`).join('')}</select></label>${!groups.length ? '<p class="notice">沒有同餐廳、落在對方有效時段且尚有名額的自辦飯局。請先在餐廳頁發起飯局。</p>' : ''}` : ''}<label class="field">用餐時間（Asia/Taipei）<input name="proposedAt" type="datetime-local" value="${localDate(initial)}" min="${localDate(new Date(Math.max(+now(), Date.parse(i.startAt))).toISOString())}" max="${localDate(new Date(Date.parse(i.endAt) - 60000).toISOString())}" required ${mode === 'group' ? 'readonly' : ''}></label><label class="field">邀請訊息<textarea name="message" maxlength="300" rows="3" required>你好！要不要一起在公開餐廳吃飯、聊聊喜歡的料理？</textarea></label><p class="notice">只建立本地示範邀請，不會傳送通知。請勿填寫真實聯絡資料。</p>${!verdict.ok ? `<p class="notice">${esc(verdict.reason)}</p>` : ''}<button type="submit" class="primary" ${!verdict.ok || state.blocked.includes(i.userId) || mode === 'group' && !groups.length ? 'disabled' : ''}>送出示範邀請</button></form>`);
  }
  function submitInvitation(form) {
    const f = new FormData(form), i = intent(form.dataset.intent);
    if (!i || state.blocked.includes(i.userId)) throw Error('這位飯友目前無法邀請。');
    const verdict = L.canInvite(me(), i.userId, i, state.invitations, now());
    if (!verdict.ok) throw Error(verdict.reason);
    const g = form.dataset.mode === 'group' ? eligibleGroups(i).find(g => g.id === f.get('mealGroupId')) : null;
    if (form.dataset.mode === 'group' && !g) throw Error('飯局已額滿或時間不相容，請重新選擇。');
    const proposedAt = g ? g.startAt : parseLocal(String(f.get('proposedAt')));
    if (Date.parse(proposedAt) < +now() || Date.parse(proposedAt) < Date.parse(i.startAt) || Date.parse(proposedAt) >= Date.parse(i.endAt) || Date.parse(proposedAt) >= Date.parse(i.expiresAt)) throw Error('請選擇對方有效意向內的用餐時間。');
    const message = String(f.get('message')).trim();
    if (!message || message.length > 300) throw Error('請填寫 1–300 字的邀請訊息。');
    const invite = L.createInvitation({ id: uid('inv'), senderUserId: me(), recipientUserId: i.userId, restaurantId: i.restaurantId, mealIntentId: i.id, ...(g ? { mealGroupId: g.id } : {}), proposedAt, message, intentExpiresAt: i.expiresAt }, now());
    invite.expiresAt = new Date(Math.min(Date.parse(invite.expiresAt), Date.parse(i.expiresAt), Date.parse(proposedAt))).toISOString();
    if (Date.parse(invite.expiresAt) <= +now()) throw Error('請選擇示範時鐘之後的時間，才能等待接受邀請。');
    state.invitations.push(invite);
    closeDialogs(); navigate('meals'); toast('示範邀請已建立，等待模擬回覆；未通知任何人。');
  }
  function openGroup(id) {
    const g = group(id);
    if (!g) return;
    const joined = g.memberIds.includes(me()), pending = g.applicantIds.includes(me());
    const active = !['cancelled', 'closed'].includes(g.status) && Date.parse(g.startAt) >= +now();
    dialog('groupDialog', '公開飯局詳情', `${groupCard(g, false)}<p class="notice">${g.approvalRequired ? '申請會先保留待確認；接受按鈕只模擬發起人的操作。' : '此飯局免審核，按下加入即成為示範成員。'} 所有操作均為本地模擬，不會通知任何人。</p><div class="actions">${active ? joined ? `${btn('開啟群組示範聊天室', 'chat-group', g.id, 'primary')}${btn(g.hostUserId === me() ? '取消我發起的飯局' : '退出飯局', 'leave-group', g.id)}` : pending ? `${btn('模擬發起人接受申請', 'accept-application', g.id, 'primary')}${btn('撤回申請', 'withdraw', g.id)}` : btn(g.approvalRequired ? '申請加入飯局' : '直接加入飯局（模擬）', 'apply', g.id, 'primary', !L.canJoinGroup(g, me()).ok || state.blocked.includes(g.hostUserId) ? 'disabled' : '') : '<p class="notice">此飯局已結束或取消。</p>'}</div>${g.hostUserId === me() && active ? `<h3>待確認申請</h3>${g.applicantIds.map(id => `<p>${esc(user(id).displayName)} ${btn('接受申請（模擬）', 'host-accept', `${g.id}|${id}`)} ${btn('婉拒申請', 'host-decline', `${g.id}|${id}`)}</p>`).join('') || '<p class="muted">目前沒有申請。</p>'}` : ''}`);
  }
  function applyToGroup(id) {
    const g = group(id);
    if (!g || state.blocked.includes(g.hostUserId) || Date.parse(g.startAt) < +now()) throw Error('這個飯局目前無法申請。');
    const verdict = L.canJoinGroup(g, me());
    if (!verdict.ok) throw Error(verdict.reason);
    if (!g.approvalRequired) {
      g.memberIds.push(me());
      if (g.memberIds.length >= g.capacity) g.status = 'full';
      render(); openGroup(id); toast('已直接加入免審核的示範飯局；未通知任何人。');
      return;
    }
    g.applicantIds.push(me());
    render(); openGroup(id); toast('申請已存為待確認；尚未加入飯局，也未通知任何人。');
  }
  function acceptApplication(id, userId = me()) {
    const g = group(id);
    if (!g || !g.applicantIds.includes(userId) || (userId !== me() && g.hostUserId !== me())) throw Error('找不到可處理的申請。');
    if (state.blocked.includes(userId) || state.blocked.includes(g.hostUserId) || Date.parse(g.startAt) < +now()) throw Error('這則申請已無法接受。');
    const verdict = L.canJoinGroup({ ...g, applicantIds: g.applicantIds.filter(id => id !== userId) }, userId);
    if (!verdict.ok) throw Error(verdict.reason);
    g.applicantIds = g.applicantIds.filter(id => id !== userId);
    g.memberIds.push(userId);
    if (g.memberIds.length >= g.capacity) g.status = 'full';
    render(); openGroup(id); toast('已模擬接受申請，成員已加入示範飯局。');
  }
  function createDemoGroup(rid) {
    dialog('groupDialog', '發起 2–6 人飯局', `<form id="createGroupForm" class="stack"><label class="field">公開餐廳<select name="restaurantId">${seed.restaurants.map(r => `<option value="${esc(r.id)}" ${rid === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label><label class="field">用餐時間（Asia/Taipei）<input type="datetime-local" name="startAt" min="${localDate(state.now)}" value="${defaultTime()}" required></label><label class="field">人數上限（包含自己）<input type="number" name="capacity" min="2" max="6" value="4" required></label><label class="field">飯局簡介<textarea name="description" maxlength="300" required rows="3">一起吃頓輕鬆的飯，認識新的朋友。</textarea></label><label class="chip"><input type="checkbox" name="approvalRequired" checked>需發起人確認</label><p class="notice">只建立虛構公開飯局；勾選後申請需模擬確認，未勾選則可直接加入。</p><button class="primary" type="submit">建立示範飯局</button></form>`);
  }
  function publishIntent(rid) {
    dialog('groupDialog', '發布我的用餐意向', `<p>${esc(restaurant(rid).name)}</p><form id="intentForm" data-restaurant="${esc(rid)}" class="stack"><label class="field">開始時間（Asia/Taipei）<input name="startAt" type="datetime-local" min="${localDate(state.now)}" value="${defaultTime()}" required></label><label class="field">保留時段（分鐘）<select name="duration"><option value="60">60 分鐘</option><option value="90">90 分鐘</option><option value="120">120 分鐘</option></select></label><label class="field">每人預算（元）<input name="budget" type="number" min="1" max="10000" value="${restaurant(rid).price}" required></label><label class="field">想說的話<textarea name="message" maxlength="300" rows="3" required>有人也想吃這家嗎？歡迎一起共餐！</textarea></label><p class="notice">只在此分頁公開虛構意向，不會通知任何人。</p><button class="primary" type="submit">發布示範意向</button></form>`);
  }
  function transition(id, target) {
    const index = state.invitations.findIndex(i => i.id === id);
    if (index < 0) throw Error('找不到邀請。');
    const i = state.invitations[index];
    if (![i.senderUserId, i.recipientUserId].includes(me())) throw Error('無法操作這則邀請。');
    if (target === 'accepted' && (state.blocked.includes(i.senderUserId) || state.blocked.includes(i.recipientUserId))) throw Error('已封鎖人物，無法接受邀請。');
    let g;
    if (target === 'accepted') {
      const source = intent(i.mealIntentId);
      if (!source || source.status !== 'active' || Date.parse(source.expiresAt) <= +now() || Date.parse(i.proposedAt) < +now()) throw Error('這則用餐意向或時間已失效。');
      if (Date.parse(i.proposedAt) < Date.parse(source.startAt) || Date.parse(i.proposedAt) >= Date.parse(source.endAt)) throw Error('邀請時間已不在對方意向內。');
      if (i.mealGroupId) {
        g = group(i.mealGroupId);
        if (!g || g.hostUserId !== i.senderUserId || g.restaurantId !== i.restaurantId || Date.parse(g.startAt) !== Date.parse(i.proposedAt)) throw Error('飯局已取消或條件已變更。');
        const verdict = L.canJoinGroup({ ...g, applicantIds: g.applicantIds.filter(id => id !== i.recipientUserId) }, i.recipientUserId);
        if (!verdict.ok) throw Error(verdict.reason);
      }
    }
    const next = L.transitionInvitation(i, target, now());
    if (g) { g.memberIds.push(i.recipientUserId); g.applicantIds = g.applicantIds.filter(id => id !== i.recipientUserId); if (g.memberIds.length >= g.capacity) g.status = 'full'; }
    state.invitations[index] = next;
    render(); toast(target === 'accepted' ? '已模擬接受，可在飯局頁開啟本地聊天室。' : `邀請${statusLabels[target]}。`);
  }
  function chatContext(kind, id) {
    if (kind === 'group') {
      const g = group(id);
      if (!g || !g.memberIds.includes(me()) || ['cancelled', 'closed'].includes(g.status)) throw Error('只有已加入的成員可以進入聊天室。');
      return { key: `group:${id}`, title: restaurant(g.restaurantId).name, memberIds: g.memberIds, at: g.startAt };
    }
    const i = state.invitations.find(i => i.id === id);
    if (!i || i.status !== 'accepted' || ![i.senderUserId, i.recipientUserId].includes(me()) || state.blocked.includes(i.senderUserId) || state.blocked.includes(i.recipientUserId)) throw Error('此邀請聊天室已無法使用。');
    if (i.mealGroupId) return chatContext('group', i.mealGroupId);
    return { key: `inv:${id}`, title: restaurant(i.restaurantId).name, memberIds: [i.senderUserId, i.recipientUserId], at: i.proposedAt };
  }
  function openChat(kind, id) {
    const c = chatContext(kind, id);
    if (Date.parse(c.at) + 86400000 <= +now()) throw Error('示範聊天室已到期。');
    dialog('chatDialog', '示範聊天室', `<h3>${esc(c.title)}</h3><p>${fmt(c.at)}</p><p class="notice">僅此分頁的本地訊息 · 不會傳送給任何真人 · 用餐後 24 小時失效。</p><div id="chatMessages" class="chat-messages" role="log" aria-label="本地示範聊天訊息" aria-live="polite"></div><form id="chatForm" class="stack"><label class="field">輸入示範訊息<textarea name="message" rows="2" maxlength="500" required placeholder="例如：我會準時到餐廳門口。"></textarea></label><button class="primary" type="submit">新增本地訊息</button></form>`);
    activeChat = { kind, id };
    renderChatMessages(c);
  }
  function renderChatMessages(c) {
    $('chatMessages').innerHTML = (state.chats[c.key] || []).map(m => `<div class="chat-bubble ${m.senderId === me() ? 'mine' : ''}"><p class="small">${esc(user(m.senderId).displayName)} · ${fmt(m.at)}</p><p style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(m.text)}</p></div>`).join('') || empty('還沒有訊息。可以留下第一則本地示範訊息。');
    $('chatMessages').scrollTop = $('chatMessages').scrollHeight;
  }
  function startVoiceDemo() {
    if (voiceBusy) return;
    voiceBusy = true; voiceStatus = '模擬聆聽中…沒有錄音，也未使用麥克風。';
    const generation = ++voiceGeneration;
    render();
    voiceTimer = setTimeout(() => {
      if (generation !== voiceGeneration) return;
      voiceStatus = '本地規則理解中…AI Demo 模擬解析'; if (state.view === 'home') renderHome();
      voiceTimer = setTimeout(() => {
        if (generation !== voiceGeneration) return;
        state.requestText = '明天午餐想吃鹹的，預算100元，附近有人一起吃更好';
        state.criteria = parsedCriteria(state.requestText);
        voiceBusy = false; voiceStatus = '模擬完成：已帶入文字與條件，可自由修改。'; render(); scrollToRecommendations(); toast('語音模擬完成，已依新條件排序餐廳。');
      }, 700);
    }, 650);
  }
  function cancelGroup(g) {
    g.status = 'cancelled'; g.applicantIds = [];
    state.invitations = state.invitations.map(i => i.mealGroupId === g.id && ['pending', 'accepted'].includes(i.status) ? { ...i, status: 'cancelled' } : i);
  }
  function action(name, id) {
    switch (name) {
      case 'voice': startVoiceDemo(); break;
      case 'restaurant': openRestaurant(id); break;
      case 'back': navigate('buddies'); break;
      case 'time': setTimeWindow(id); break;
      case 'profile': { const i = intent(id); if (i) openBuddyProfile(i.userId, i.id); break; }
      case 'close': $(id).close(); activeChat = null; break;
      case 'invite-one': openInviteSheet('one', id); break;
      case 'invite-group': openInviteSheet('group', id); break;
      case 'group': openGroup(id); break;
      case 'create-group': createDemoGroup(id); break;
      case 'publish': publishIntent(id); break;
      case 'apply': applyToGroup(id); break;
      case 'accept-application': acceptApplication(id); break;
      case 'host-accept': { const [gid, userId] = id.split('|'); acceptApplication(gid, userId); break; }
      case 'host-decline': { const [gid, userId] = id.split('|'), g = group(gid); if (g?.hostUserId !== me()) throw Error('只有發起人可處理申請。'); g.applicantIds = g.applicantIds.filter(id => id !== userId); render(); openGroup(gid); toast('已婉拒示範申請。'); break; }
      case 'withdraw': { const g = group(id); g.applicantIds = g.applicantIds.filter(id => id !== me()); render(); openGroup(id); toast('已撤回申請。'); break; }
      case 'accept-invite': transition(id, 'accepted'); break;
      case 'decline-invite': transition(id, 'declined'); break;
      case 'cancel-invite': transition(id, 'cancelled'); break;
      case 'leave-invite': { const i = state.invitations.find(i => i.id === id); if (!i || i.status !== 'accepted' || ![i.senderUserId, i.recipientUserId].includes(me())) throw Error('無法退出此共餐。'); i.status = 'cancelled'; render(); toast('已退出示範共餐，聊天室已關閉。'); break; }
      case 'leave-group': { const g = group(id); if (!g?.memberIds.includes(me())) throw Error('你不是這個飯局的成員。'); if (g.hostUserId === me()) cancelGroup(g); else { g.memberIds = g.memberIds.filter(id => id !== me()); if (g.status === 'full') g.status = 'open'; state.invitations.forEach(i => { if (i.mealGroupId === g.id && i.recipientUserId === me() && i.status === 'accepted') i.status = 'cancelled'; }); } closeDialogs(); render(); toast('已退出或取消示範飯局。'); break; }
      case 'cancel-intent': { const i = intent(id); if (i?.userId !== me()) throw Error('只能取消自己的意向。'); i.status = 'cancelled'; state.invitations.forEach(inv => { if (inv.mealIntentId === i.id && inv.status === 'pending') inv.status = 'cancelled'; }); render(); toast('已取消自己的用餐意向。'); break; }
      case 'chat-invite': openChat('inv', id); break;
      case 'chat-group': openChat('group', id); break;
      case 'block': { if (id === me() || !user(id)) throw Error('無法封鎖此人物。'); if (!state.blocked.includes(id)) state.blocked.push(id); state.invitations.forEach(i => { if ([i.senderUserId, i.recipientUserId].includes(id) && i.status === 'pending') i.status = 'cancelled'; }); closeDialogs(); render(); toast('已在本地封鎖此人物並取消待回覆邀請。共同飯局可另行退出。'); break; }
      case 'unblock': state.blocked = state.blocked.filter(x => x !== id); closeDialogs(); render(); toast('已解除本地封鎖。'); break;
      case 'report': dialog('profileDialog', '本地示範檢舉', `<form id="reportForm" data-user="${esc(id)}" class="stack"><label class="field">檢舉原因<select name="reason"><option>不當言論</option><option>騷擾或索取聯絡資料</option><option>可疑或不實資料</option></select></label><p class="notice">只記錄在本分頁，不會送出給平台或聯絡真人。</p><button type="submit" class="primary">記錄示範檢舉</button></form>`); break;
      case 'reset': dialog('groupDialog', '重設此分頁 Demo', `<p>清除本分頁的示範邀請、飯局、訊息、封鎖與條件，恢復預設虛構資料。</p>${btn('確認重設 Demo', 'confirm-reset', '', 'primary')}`); break;
      case 'confirm-reset': clearTimeout(voiceTimer); voiceGeneration++; voiceBusy = false; voiceStatus = '語音 Demo：不會啟用麥克風'; closeDialogs(); try { sessionStorage.removeItem(KEY); } catch { /* unavailable storage still permits an in-memory reset */ } seed = D.createSeed(); state = fresh(); render(); toast('已重設 mealBuddyDemo.v1，未清除其他網站資料。'); break;
    }
  }
  function submit(form) {
    const f = new FormData(form);
    if (form.id === 'requestForm') {
      clearTimeout(voiceTimer); voiceGeneration++; voiceBusy = false;
      const text = String(f.get('request')).trim();
      if (!text || text.length > 500) throw Error('請輸入 1–500 字的需求。');
      const next = parsedCriteria(text);
      state.requestText = text;
      state.criteria = next;
      voiceStatus = 'AI Demo 已完成本地規則解析；未識別內容可在下方手動修正。'; render(); scrollToRecommendations(); toast('已更新模擬解析與餐廳推薦。');
    } else if (form.id === 'criteriaForm') {
      const budget = Number(f.get('budget')), maxDistance = Number(f.get('maxDistance'));
      if (!Number.isFinite(budget) || budget < 1 || budget > 10000 || !Number.isFinite(maxDistance) || maxDistance < 1 || maxDistance > 50000) throw Error('請填入有效的預算與距離。');
      state.criteria = { day: f.get('day'), meal: f.get('meal'), taste: f.getAll('taste'), budget, maxDistance, sort: f.get('sort') }; render(); toast('餐廳已依更新後的條件排序。');
    } else if (form.id === 'inviteForm') submitInvitation(form);
    else if (form.id === 'createGroupForm') {
      const startAt = parseLocal(String(f.get('startAt'))), capacity = Number(f.get('capacity')), description = String(f.get('description')).trim(), rid = String(f.get('restaurantId'));
      checkHorizon(startAt);
      if (!restaurant(rid) || Date.parse(startAt) <= +now() || !Number.isInteger(capacity) || capacity < 2 || capacity > 6 || !description || description.length > 300) throw Error('請選擇未來時間、2–6 人與有效的飯局簡介。');
      const g = { id: uid('g'), restaurantId: rid, hostUserId: me(), startAt, capacity, memberIds: [me()], applicantIds: [], description, visibility: 'public', approvalRequired: f.has('approvalRequired'), status: 'open' };
      state.groups.push(g); state.selectedRestaurantId = rid; closeDialogs(); navigate('meals'); openGroup(g.id); toast('已建立公開示範飯局。');
    } else if (form.id === 'intentForm') {
      const startAt = parseLocal(String(f.get('startAt'))), duration = Number(f.get('duration')), budget = Number(f.get('budget')), message = String(f.get('message')).trim(), rid = form.dataset.restaurant;
      checkHorizon(startAt);
      if (!restaurant(rid) || Date.parse(startAt) < +now() || ![60, 90, 120].includes(duration) || !Number.isFinite(budget) || budget < 1 || budget > 10000 || !message || message.length > 300) throw Error('請填寫有效的未來時段、預算與內容。');
      const endAt = new Date(Date.parse(startAt) + duration * 60000).toISOString();
      state.intents.push({ id: uid('i'), userId: me(), restaurantId: rid, startAt, endAt, expiresAt: endAt, status: 'active', partyPreference: 'either', budget, message });
      state.selectedRestaurantId = rid;
      const w = windows(rid); state.timeWindow = Object.keys(w).find(k => w[k].some(i => i.id === state.intents.at(-1).id)) || 'now'; closeDialogs(); navigate('restaurant'); toast('已發布本地示範意向，可在「我的」取消。');
    } else if (form.id === 'chatForm') {
      if (!activeChat) throw Error('請重新開啟聊天室。');
      const c = chatContext(activeChat.kind, activeChat.id), text = String(f.get('message')).trim();
      if (!text || text.length > 500) throw Error('請輸入 1–500 字的訊息。');
      if (Date.parse(c.at) + 86400000 <= +now()) throw Error('聊天室已到期。');
      state.chats[c.key] ||= []; if (state.chats[c.key].length >= 200) throw Error('本地聊天室最多 200 則訊息，可重設 Demo 重新體驗。');
      state.chats[c.key].push({ senderId: me(), text, at: state.now }); save(); renderChatMessages(c); form.reset(); form.elements.message.focus(); toast('已新增本地訊息，未傳送給真人。');
    } else if (form.id === 'reportForm') {
      if (!user(form.dataset.user)) throw Error('找不到這位人物。');
      state.reports.push({ userId: form.dataset.user, reason: String(f.get('reason')), at: state.now }); closeDialogs(); render(); toast('已記錄本地示範檢舉，未送交任何平台。');
    }
  }
  function start() {
    if (!D || !L) { $('homeView').textContent = '示範資料尚未載入，請確認 data.js 與 logic.js 已就緒後重新整理。'; return; }
    seed = D.createSeed(); state = fresh();
    try { const saved = sessionStorage.getItem(KEY); if (saved) state = hydrate(JSON.parse(saved)); }
    catch { state = fresh(); storageWarning = '保存資料無效、跨日或不可讀取，已安全恢復預設示範。'; }
    document.addEventListener('click', event => {
      const button = event.target.closest('button'); if (!button || button.disabled) return;
      try { if (button.dataset.nav) { closeDialogs(); navigate(button.dataset.nav); } else if (button.dataset.action) action(button.dataset.action, button.dataset.id); }
      catch (error) { reportError(error.message || '操作無法完成，請重新選擇。'); }
    });
    document.addEventListener('submit', event => { if (!event.target.matches('form')) return; event.preventDefault(); try { if (event.target.reportValidity()) submit(event.target); } catch (error) { reportError(error.message || '資料有誤，請重新確認。'); } });
    document.addEventListener('change', event => {
      if (event.target.name === 'mealGroupId' && event.target.closest('#inviteForm')) { const g = group(event.target.value); if (g) event.target.form.elements.proposedAt.value = localDate(g.startAt); }
      if (event.target.name === 'sort' && event.target.closest('#criteriaForm')) event.target.form.requestSubmit();
    });
    document.addEventListener('keydown', event => {
      if (!event.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const keys = Object.keys(windowLabels), index = keys.indexOf(state.timeWindow);
      setTimeWindow(keys[event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3]);
    });
    render();
    if (storageWarning) toast(storageWarning);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
})();
