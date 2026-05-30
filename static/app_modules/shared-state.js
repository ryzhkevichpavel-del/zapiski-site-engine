const app = document.querySelector('#app');
const notice = document.querySelector('#notice');
const modal = document.querySelector('#modal');
const modalCard = modal.querySelector('.modal-card');
let modalTitle = document.querySelector('#modalTitle');
const modalBody = document.querySelector('#modalBody');
const modalClose = document.querySelector('#modalClose');
const loginButton = document.querySelector('#loginButton');
const adminButton = document.querySelector('#adminButton');
const menuButton = document.querySelector('#menuButton');
const siteHeader = document.querySelector('#siteHeader');
const brandName = document.querySelector('#brandName');
const brandSub = document.querySelector('#brandSub');
const brandMark = document.querySelector('#brandMark');
let profileControl = document.querySelector('#profileControl');
let profileButton = document.querySelector('#profileButton');
let profileAvatar = document.querySelector('#profileAvatar');
let profileMenu = document.querySelector('#profileMenu');
const mobileNavActions = document.querySelector('#mobileNavActions');
const headerActions = document.querySelector('.header-actions');

const keys = { token: 'zapiski.v5.token', client: 'zapiski.v5.client', adminClientTab: 'zapiski.v5.adminClientTab', adminEditor: 'zapiski.v5.adminEditor', user: 'zapiski.v5.user', adminViewMode: 'zapiski.v5.adminViewMode' };
localStorage.removeItem(keys.token);
const sectionRoutes = ['works', 'articles', 'questions', 'services', 'cards'];
const routes = ['home', 'trebnik', 'admin', 'messages', 'privacy', 'rules', 'personal-data-consent', 'u', ...sectionRoutes];
const sectionIcons = { works: '✒', articles: '☰', questions: '?', services: '✦', cards: '☾', trebnik: '✧' };
const sectionNames = { works: 'Работы', articles: 'Статьи', questions: 'Вопросы', services: 'Услуги', cards: 'Карты' };
const adminEditorPages = ['home', ...sectionRoutes, 'profiles', 'traffic'];
const adminTrebnikPages = ['actions', 'clients', 'services', 'payments'];
const homeHighlightRoutes = ['works', 'articles', 'services'];
const MEDIA_UPLOAD_MAX_BYTES = 50 * 1024 * 1024;
const MEDIA_UPLOAD_MAX_LABEL = '50 МБ';
const COMMUNITY_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;
const COMMUNITY_ATTACHMENT_MAX_LABEL = '25 МБ';
const COMMUNITY_MESSAGE_MAX_ATTACHMENTS = 10;
const OLD_HERO_TITLE = 'Добро пожаловать';
const OLD_HERO_TEXT = 'Здесь собраны материалы, личные записи, ответы и рабочие форматы обращения. Для клиентов отдельный кабинет остается спокойной закрытой частью сайта — без лишнего шума и без путаницы.';
const DEFAULT_HERO_TITLE = 'Услуги, материалы и заявки';
const DEFAULT_HERO_TEXT = 'Здесь можно почитать материалы, выбрать формат обращения и оставить заявку. Для клиентов открывается личный Требник: ход работы, записи, оплаты и сообщения собраны в одном спокойном месте.';
const DEFAULT_BRAND_LOGO_URL = '/static/zapiski-logo-mark.svg';
const EDITORJS_VERSION = '2.31.6';
const EDITORJS_VENDOR_FILES = [
  '/static/vendor/editorjs/editorjs.umd.js',
  '/static/vendor/editorjs/header.umd.js',
  '/static/vendor/editorjs/list.umd.js',
  '/static/vendor/editorjs/image.umd.js',
  '/static/vendor/editorjs/quote.umd.js',
  '/static/vendor/editorjs/delimiter.umd.js',
];
const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex]:not([tabindex="-1"])';
const loadedScriptPromises = new Map();
const blockEditors = new WeakMap();
const richEditorSelections = new WeakMap();

function cachedAuthUser(){
  try{
    const user = JSON.parse(localStorage.getItem(keys.user) || 'null');
    return user && typeof user === 'object' ? user : null;
  }catch(error){
    return null;
  }
}
function safeDecode(value=''){
  try{ return decodeURIComponent(value); }
  catch{ return value; }
}
function parseRoute(){
  const parts = location.pathname.split('/').filter(Boolean).map(safeDecode);
  const route = routes.includes(parts[0]) ? parts[0] : 'home';
  return { route, slug: parts[1] || '' };
}

const parsed = parseRoute();
const state = {
  route: parsed.route,
  slug: parsed.slug,
  token: '',
  clientId: localStorage.getItem(keys.client) || '',
  user: cachedAuthUser(),
  content: null,
  health: null,
  community: null,
  publicQuestions: [],
  notifications: {unread_count:0, items:[]},
  messages: {unread_count:0},
  communityMessagesPayload: null,
  communityMessagesSignature: '',
  communityMessagesThreadId: '',
  communityMessagesLoading: false,
  communityMessagesPollTimer: null,
  communityMessagesDraftAttachments: {},
  subscriptions: [],
  adminTraffic: null,
  adminTrafficPromise: null,
  dashboard: null,
  setupRequired: false,
  menuOpen: false,
  profileOpen: false,
  profileTab: 'cabinet',
  profileRouteKey: '',
  profilePayload: null,
  afterAuthAction: '',
  notificationsOpen: false,
  adminTrafficOpen: false,
  adminViewMode: localStorage.getItem(keys.adminViewMode) === 'visitor' ? 'visitor' : 'admin',
  lastTrackedPath: location.pathname,
  modalReturnFocus: null,
  adminDashboardReady: false,
  adminDashboardPromise: null,
  adminSummaryPromise: null,
  adminWorkbenchPromise: null,
  adminCommunityPromise: null,
  adminProfiles: null,
  adminProfilesPromise: null,
  adminProfileDetail: null,
  adminProfileDetailId: '',
  adminProfileDetailPromise: null,
  adminProfileId: '',
  adminProfileQuery: '',
  adminProfileFilter: 'all',
  adminWorkbenchError: '',
  adminAutoRefreshPromise: null,
  adminAutoRefreshAt: 0,
  adminFinance: null,
  adminFinancePromise: null,
  adminFinanceError: '',
  adminFinanceFilter: 'all',
  adminFinanceFocus: 'debt',
  adminFinanceIncomeOpen: false,
  adminFinanceDebtOpen: false,
  adminFinanceOverdueOpen: false,
  adminFinancePendingOpen: false,
  adminFinanceMonthKey: '',
  adminFinanceClientId: '',
  adminFinancePeriod: 'month',
  adminFinanceTargetType: 'all',
  adminFinancePaymentView: 'confirmed_recent',
  adminFinanceLedgerOpen: false,
  adminServiceFilter: 'all',
  adminRitebookFilter: 'all',
  adminFinanceEvents: null,
  adminFinanceEventsReady: false,
  adminFinanceRefreshAt: 0,
  adminFinanceRefreshPromise: null,
  clientAutoRefreshPromise: null,
  clientAutoRefreshAt: 0,
  clientPayload: null,
  clientCabinetTab: 'now',
  clientCabinetRequestId: '',
  clientCabinetRequestPane: 'works',
  clientCabinetRequestDetail: null,
  clientCabinetRequestDetailId: '',
  clientCabinetServiceId: '',
  clientCabinetDiagnosticId: '',
  clientCabinetServiceDetail: null,
  clientCabinetServiceDetailId: '',
  clientCabinetRequestDetailLoadingId: '',
  clientCabinetServiceDetailLoadingId: '',
  clientFinanceOpen: '',
  clientNotificationStatus: '',
  adminClientPayload: null,
  adminClientPayloadId: '',
  adminClientTab: ['requests','diagnostics','services','payments','updates','notifications','profile'].includes(localStorage.getItem(keys.adminClientTab) || '') ? localStorage.getItem(keys.adminClientTab) : 'requests',
  adminRequestId: '',
  adminRequestPane: 'works',
  adminDiagnosticId: '',
  adminDiagnosticOpenId: '',
  adminDiagnosticMenuId: '',
  adminShowArchivedRequests: false,
  adminClientListOpen: false,
  adminClientNavOpen: false,
  adminEditorPage: localStorage.getItem(keys.adminEditor) || 'home',
  adminMaterialEditor: null,
  publicMaterialEditor: null,
  sectionMaterialFilters: {},
  saveStatus: 'idle',
  saveMessage: 'Готово',
  saveUpdatedAt: '',
  renderSeq: 0,
};

function cacheAuthUser(user){
  if(!user){
    localStorage.removeItem(keys.user);
    return;
  }
  localStorage.setItem(keys.user, JSON.stringify({
    role: user.role || '',
    username: user.username || '',
    display_name: user.display_name || user.username || '',
    client_id: user.client_id || '',
    trebnik_client_id: user.trebnik_client_id || '',
    trebnik_linked_at: user.trebnik_linked_at || '',
    trebnik_linked_by: user.trebnik_linked_by || '',
    user_id: user.user_id || '',
    nickname: user.nickname || '',
    avatar_url: user.avatar_url || '',
    avatar_updated_at: user.avatar_updated_at || '',
    notification_email_enabled: user.notification_email_enabled !== false,
    trusted: Boolean(user.trusted),
    site_admin: Boolean(user.site_admin),
    must_change_avatar: Boolean(user.must_change_avatar),
    must_change_nickname: Boolean(user.must_change_nickname),
    profile_url: user.profile_url || '',
  }));
}
function clearBrowserSessionCache(){
  state.token = '';
  localStorage.removeItem(keys.token);
  cacheAuthUser(null);
}
function esc(value){ return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }
function attr(value){ return esc(value).replace(/`/g, '&#96;'); }
function money(value){ const n = Number(value || 0); return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:n % 1 ? 2 : 0}).format(n); }
function date(value){ if(!value) return '—'; const d = new Date(String(value).replace(' ', 'T')); return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleDateString('ru-RU'); }
function time(value){ if(!value) return '—'; const d = new Date(String(value).replace(' ', 'T')); return Number.isNaN(d.getTime()) ? esc(value) : d.toLocaleString('ru-RU',{dateStyle:'medium',timeStyle:'short'}); }
function localDateValue(value=new Date()){ const d = value instanceof Date ? value : new Date(String(value).replace(' ', 'T')); if(Number.isNaN(d.getTime())) return ''; const pad = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function moscowDateParts(value=new Date()){
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Moscow', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23'}).formatToParts(value);
  const part = type => parts.find(item => item.type === type)?.value || '';
  return {date:`${part('year')}-${part('month')}-${part('day')}`, hour:Number(part('hour') || 0)};
}
function moscowDateValue(value=new Date()){ return moscowDateParts(value).date; }
function inputDateValue(value, fallback=''){ const text = String(value || ''); const match = text.match(/\d{4}-\d{2}-\d{2}/); if(match) return match[0]; const parsed = value ? localDateValue(value) : ''; if(parsed) return parsed; return fallback ? inputDateValue(fallback) : ''; }
function daysAgoDateValue(days=7){ const d = new Date(); d.setDate(d.getDate() - Math.max(1, Number(days || 1))); return localDateValue(d); }
function addIsoDays(value, days=0){ const iso = inputDateValue(value); if(!iso) return ''; const [y,m,d] = iso.split('-').map(Number); const dateValue = new Date(y, m - 1, d); dateValue.setDate(dateValue.getDate() + Number(days || 0)); return localDateValue(dateValue); }
const monthNamesRu = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
function dateLong(value){ const iso = inputDateValue(value); if(!iso) return date(value); const [y,m,d] = iso.split('-').map(Number); return `${d} ${monthNamesRu[m - 1] || ''} ${y} года`; }
function dateRangeLong(startValue, endValue){ const start = inputDateValue(startValue); const end = inputDateValue(endValue); if(!start && !end) return ''; if(start && (!end || start === end)) return dateLong(start); if(!start) return dateLong(end); const [sy,sm,sd] = start.split('-').map(Number); const [ey,em,ed] = end.split('-').map(Number); if(sy === ey) return `${sd} ${monthNamesRu[sm - 1] || ''} - ${ed} ${monthNamesRu[em - 1] || ''} ${ey} года`; return `${dateLong(start)} - ${dateLong(end)}`; }
function ruPlural(value, one, few, many){ const n = Math.abs(Number(value || 0)); const mod10 = n % 10; const mod100 = n % 100; return mod10 === 1 && mod100 !== 11 ? one : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many); }
function short(text, n=120){ const s = String(text || '').trim(); return s.length > n ? s.slice(0,n-1) + '…' : s; }
function empty(text='Пока пусто.'){ return `<div class="empty">${esc(text)}</div>`; }
function loading(text='Открываю…'){ return `<div class="loading"><span class="spinner"></span><span>${esc(text)}</span></div>`; }
function skeletonLine(width='100%'){ return `<span class="skeleton-line" style="width:${attr(width)}"></span>`; }
function skeletonStack(widths=['100%','88%','64%']){ return `<div class="skeleton-stack">${widths.map(width => skeletonLine(width)).join('')}</div>`; }
function loadingMetric(label){ return `<div class="metric is-busy"><b>${skeletonLine('56%')}</b><span>${esc(label)}</span></div>`; }
function liveDataWarningHtml(message='Данные Требника сейчас не живые. Обновите страницу позже.'){
  return `<div class="form-feedback is-danger" role="alert">${esc(message)}</div>`;
}
function trebnikDataMeta(payload={}){
  const sync = payload?.sync || {};
  const source = payload?.source || sync.source || '';
  const mode = payload?.mode || sync.mode || '';
  const bridgeError = payload?.bridge_error || payload?.error || null;
  const snapshot = Boolean(payload?.snapshot || mode === 'snapshot' || source === 'copy' || sync.status === 'using_copy');
  const live = !snapshot && (source === 'bot' || source === 'live_service' || sync.status === 'live_service' || payload?.status === 'ok' || payload?.ok === true);
  const revision = payload?.revision ?? payload?.trebnik_revision ?? sync.revision ?? '';
  const updatedAt = payload?.revision_updated_at || payload?.last_event_at || payload?.loaded_at || '';
  const errorText = bridgeError && typeof bridgeError === 'object' ? (bridgeError.message || bridgeError.error || bridgeError.code || '') : String(bridgeError || '');
  return {live, snapshot, revision, updatedAt, errorText};
}
function trebnikSourceIndicatorHtml(payload={}, compact=false){
  const meta = trebnikDataMeta(payload);
  return `<span class="trebnik-live-dot ${meta.live ? 'is-live' : 'is-warning'} ${compact ? 'is-compact' : ''}" title="${attr(meta.live ? 'Живые данные' : 'Данные Требника требуют проверки')}" aria-label="${attr(meta.live ? 'Живые данные' : 'Данные Требника требуют проверки')}"></span>`;
}
function trebnikSourceStateClass(payload={}){
  return trebnikDataMeta(payload).live ? 'is-live' : 'is-warning';
}
function payloadRevision(payload={}){
  const sync = payload?.sync || {};
  return payload?.revision ?? payload?.trebnik_revision ?? sync.revision ?? '';
}
function clientCabinetLoadedAtHtml(payload={}){
  return '';
}
function paintClientCabinetLoadedAt(payload=state.clientPayload || {}){
  document.querySelectorAll('[data-client-loaded-at]').forEach(node => {
    node.textContent = '';
  });
}
function trebnikProblem(error){
  const text = error?.message || String(error || '') || 'Служба Требника сейчас недоступна.';
  if(error?.code === 'live_error' || error?.status === 503){
    return `<section class="gate-card"><h1>Требник сейчас недоступен</h1>${liveDataWarningHtml(text)}<p>Старые данные не показаны, чтобы не создать иллюзию синхронизации.</p><div class="row" style="margin-top:22px"><button class="primary" data-action="reload">Обновить</button><a class="secondary" href="${routeHref('home')}" data-route="home">На главную</a></div></section>`;
  }
  return problem(text);
}
function hasAdminRights(){ return state.user?.role === 'admin' || Boolean(state.user?.site_admin); }
function isVisitorMode(){ return hasAdminRights() && state.adminViewMode === 'visitor'; }
function isAdmin(){ return hasAdminRights() && !isVisitorMode(); }
function isClient(){ return state.user?.role === 'client'; }
function isPublicUser(){ return state.user?.role === 'user'; }
function trebnikClientId(){ return isPublicUser() ? String(state.user?.trebnik_client_id || '') : ''; }
function isTrebnikClient(){ return isPublicUser() && Boolean(trebnikClientId()); }
function canKeepServerRenderedHome(){
  return app.dataset.ssr === '1' && state.route === 'home' && !state.slug && Boolean(app.querySelector('.home-layout'));
}
function brand(){ return state.content?.brand || {}; }
function siteName(){ return brand().site_name || state.content?.home?.title || 'Записки чернокнижника'; }
function clientAreaName(){ return brand().client_area_name || 'Требник'; }
function adminAreaName(){ const raw = String(brand().admin_area_name || '').trim(); return !raw || raw === 'Админка' ? 'Мастерская' : raw; }
function ownerName(){ return brand().owner_name || ''; }
function sectionDisplayName(route){ return publicText(state.content?.sections?.[route]?.title || sectionNames[route] || route); }
function headerVisualUrl(){ return brand().header_visual_url || ''; }
function brandLogoUrl(){ return cleanText(headerVisualUrl() || DEFAULT_BRAND_LOGO_URL); }
function cssUrl(value=''){ return `url("${String(value || '').replace(/["\\]/g, '\\$&')}")`; }
function heroImageUrl(){ return String(state.content?.home?.hero_image_url || '').trim(); }
function heroImageAlt(){ return String(state.content?.home?.hero_image_alt || ownerName() || siteName()).trim(); }
function heroKicker(){ return cleanText(state.content?.home?.hero_kicker || ''); }
function heroTitle(){
  const home = state.content?.home || {};
  if(Object.prototype.hasOwnProperty.call(home, 'hero_title')) return String(home.hero_title ?? '').trim();
  const value = String(home.welcome_title || '').trim();
  return !value || value === OLD_HERO_TITLE ? DEFAULT_HERO_TITLE : value;
}
function heroText(){
  const home = state.content?.home || {};
  if(Object.prototype.hasOwnProperty.call(home, 'hero_text')) return String(home.hero_text ?? '').trim();
  const value = String(home.welcome_text || '').trim();
  return !value || value === OLD_HERO_TEXT ? DEFAULT_HERO_TEXT : value;
}
function homePrimaryLabel(){ const home = state.content?.home || {}; return cleanText(home.cta_primary_label ?? home.cta_primary ?? 'Оставить заявку'); }
function homePrimaryAction(){ return cleanText(state.content?.home?.cta_primary_action || 'inquiry') === 'inquiry' ? 'inquiry' : 'link'; }
function homePrimaryRoute(){ const route = cleanText(state.content?.home?.cta_primary_route || 'services'); return sectionRoutes.includes(route) ? route : 'services'; }
function homePrimaryTitle(){ return cleanText(state.content?.home?.cta_primary_title || 'Заявка с главной'); }
function homeSecondaryLabel(){ const home = state.content?.home || {}; return cleanText(home.cta_secondary_label ?? home.cta_secondary ?? 'Смотреть услуги'); }
function homeSecondaryRoute(){ const route = cleanText(state.content?.home?.cta_secondary_route || 'services'); return sectionRoutes.includes(route) ? route : 'services'; }
function homeTelegramUrl(){ return cleanText(state.content?.home?.telegram_url || state.content?.brand?.telegram_url || ''); }
function homeTelegramLabel(){ return cleanText(state.content?.home?.telegram_label || 'Написать в Telegram'); }
function homeSiteMessageLabel(){ return cleanText(state.content?.home?.site_message_label || 'Написать тут'); }
function homeShowFeatured(){ return state.content?.home?.show_featured === true; }
function featuredMaterialKeys(){ return Array.isArray(state.content?.home?.featured_material_ids) ? state.content.home.featured_material_ids.map(x => String(x || '').trim()).filter(Boolean) : []; }
function userDisplayName(){ return state.user?.display_name || state.user?.username || ''; }
function userRoleLabel(){ return hasAdminRights() ? (isVisitorMode() ? 'Посетительский вид' : 'Администратор') : isTrebnikClient() ? 'Клиент' : isPublicUser() ? 'Участник' : 'Гость'; }
function ownerBadge(){
  const source = ownerName().trim();
  return source ? source[0].toUpperCase() : (brand().mark || '✦');
}
function profileInitial(){
  const source = userDisplayName().trim();
  if(source) return source[0].toUpperCase();
  if(isAdmin()) return 'А';
  if(isTrebnikClient()) return 'К';
  if(isPublicUser()) return 'У';
  return '';
}
function textToParagraphs(text){ const raw = String(text || '').trim(); return raw ? raw.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('') : ''; }
function clone(value){ return JSON.parse(JSON.stringify(value || {})); }
function cleanText(value){ return String(value ?? '').trim(); }
function publicText(value){
  return String(value ?? '')
    .replace(/личный Требник клиента/gi, 'закрытый клиентский доступ')
    .replace(/личный Требник/gi, 'закрытый клиентский доступ')
    .replace(/Требник клиента/g, 'клиентский доступ')
    .replace(/Требник/g, 'клиентский доступ');
}
function inlineTextToEditorHtml(text=''){
  return esc(publicText(text)).replace(/\n/g, '<br>');
}
function editorHtmlToText(value=''){
  const box = document.createElement('div');
  box.innerHTML = String(value || '').replace(/<br\s*\/?>/gi, '\n');
  return box.textContent || '';
}
function plainTextToEditorData(text=''){
  const blocks = String(text || '').trim().split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => ({type:'paragraph', data:{text:inlineTextToEditorHtml(part)}}));
  return {time:Date.now(), blocks:blocks.length ? blocks : [{type:'paragraph', data:{text:''}}], version:EDITORJS_VERSION};
}
function normalizeEditorData(value, fallbackText=''){
  if(value && typeof value === 'object' && Array.isArray(value.blocks)){
    return {time:value.time || Date.now(), blocks:value.blocks, version:value.version || EDITORJS_VERSION};
  }
  if(typeof value === 'string' && value.trim()){
    try{
      const parsed = JSON.parse(value);
      if(parsed && Array.isArray(parsed.blocks)) return normalizeEditorData(parsed, fallbackText);
    }catch{}
  }
  return plainTextToEditorData(fallbackText || '');
}
function materialEditorData(item={}){
  return normalizeEditorData(item.blocks, item.body || item.excerpt || '');
}
function editorDataToPlainText(data){
  const normalized = normalizeEditorData(data, '');
  return normalized.blocks.map(block => {
    const item = block?.data || {};
    if(block.type === 'header' || block.type === 'paragraph') return editorHtmlToText(item.text || '');
    if(block.type === 'quote') return [editorHtmlToText(item.text || ''), editorHtmlToText(item.caption || '')].filter(Boolean).join('\n');
    if(block.type === 'image') return editorHtmlToText(item.caption || '');
    if(block.type === 'list') return editorListItemsToText(item.items || []);
    return '';
  }).filter(Boolean).join('\n\n').trim();
}
function editorListItemsToText(items=[]){
  if(!Array.isArray(items)) return '';
  return items.map(entry => {
    if(typeof entry === 'string') return editorHtmlToText(entry);
    const current = editorHtmlToText(entry?.content || entry?.text || '');
    const children = editorListItemsToText(entry?.items || []);
    return [current, children].filter(Boolean).join('\n');
  }).filter(Boolean).join('\n');
}
function sanitizeInlineHtml(value=''){
  const template = document.createElement('template');
  template.innerHTML = publicText(value);
  const cleanNode = node => {
    if(node.nodeType === Node.TEXT_NODE) return esc(node.textContent || '');
    if(node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const children = [...node.childNodes].map(cleanNode).join('');
    if(tag === 'br') return '<br>';
    if(['b','strong','i','em'].includes(tag)) return `<${tag}>${children}</${tag}>`;
    if(tag === 'a'){
      const href = cleanText(node.getAttribute('href') || '');
      const safeHref = /^(https?:|mailto:|tel:|\/)/i.test(href) ? href : '';
      return safeHref ? `<a href="${attr(safeHref)}" target="_blank" rel="noopener">${children}</a>` : children;
    }
    return children;
  };
  return [...template.content.childNodes].map(cleanNode).join('');
}
function cleanTextAlignment(value=''){
  const align = cleanText(value || '');
  return ['left','center','right','justify'].includes(align) ? align : 'left';
}
function textAlignmentAttrs(value=''){
  const align = cleanTextAlignment(value);
  return align === 'left' ? '' : ` class="is-text-align-${attr(align)}"`;
}
function editorListHtml(items=[], style='unordered', attrs=''){
  if(!Array.isArray(items) || !items.length) return '';
  const tag = style === 'ordered' ? 'ol' : 'ul';
  const rows = items.map(entry => {
    const content = typeof entry === 'string' ? entry : (entry?.content || entry?.text || '');
    const nested = typeof entry === 'object' ? editorListHtml(entry.items || [], style) : '';
    return `<li>${sanitizeInlineHtml(content)}${nested}</li>`;
  }).join('');
  return `<${tag}${attrs}>${rows}</${tag}>`;
}
function editorBlocksHtml(data){
  const normalized = normalizeEditorData(data, '');
  return normalized.blocks.map(block => {
    const item = block?.data || {};
    const alignAttrs = textAlignmentAttrs(item.alignment || item.align || item.textAlign);
    if(block.type === 'header'){
      const level = [2,3,4].includes(Number(item.level)) ? Number(item.level) : 2;
      return `<h${level}${alignAttrs}>${sanitizeInlineHtml(item.text || '')}</h${level}>`;
    }
    if(block.type === 'list') return editorListHtml(item.items || [], item.style || 'unordered', alignAttrs);
    if(block.type === 'quote'){
      const caption = sanitizeInlineHtml(item.caption || '');
      return `<blockquote${alignAttrs}><p>${sanitizeInlineHtml(item.text || '')}</p>${caption ? `<cite>${caption}</cite>` : ''}</blockquote>`;
    }
    if(block.type === 'image'){
      const url = cleanText(item.file?.url || item.url || '');
      if(!url) return '';
      const caption = sanitizeInlineHtml(item.caption || '');
      const altText = cleanText(item.alt || editorHtmlToText(item.caption || '') || 'Изображение');
      const layout = ['center','left','right','wide'].includes(cleanText(item.layout)) ? cleanText(item.layout) : (item.stretched ? 'wide' : 'center');
      const size = ['small','medium','large'].includes(cleanText(item.size)) ? cleanText(item.size) : 'medium';
      const classes = ['material-body-image', `is-align-${layout}`, `is-size-${size}`];
      if(item.stretched || layout === 'wide') classes.push('is-stretched');
      return `<figure class="${classes.join(' ')}"><button class="material-image-open" type="button" data-action="image-lightbox" data-image-url="${attr(url)}" data-image-alt="${attr(altText)}">${mediaImageHtml(url, altText, 'card-image')}</button>${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
    }
    if(block.type === 'delimiter') return '<hr>';
    return `<p${alignAttrs}>${sanitizeInlineHtml(item.text || '')}</p>`;
  }).join('');
}
function materialContentHtml(item={}){
  const data = item.blocks && Array.isArray(item.blocks.blocks) ? item.blocks : null;
  if(data) return editorBlocksHtml(data);
  return textToParagraphs(publicText(item.body || item.excerpt || ''));
}
function routePath(route='home', slug=''){
  const cleanRoute = routes.includes(route) ? route : 'home';
  if(cleanRoute === 'home') return '/';
  const parts = [cleanRoute];
  if(slug) parts.push(slug);
  return `/${parts.map(part => encodeURIComponent(part)).join('/')}`;
}
function routeHref(route='home', slug='', options={}){
  const path = routePath(route, slug);
  const params = options.params || '';
  return params ? `${path}?${params}` : path;
}
function materialHref(item){
  return routeHref(item.route || 'home', item.slug || '');
}
function fieldValue(root, name){ return cleanText(root.querySelector(`[name="${name}"]`)?.value); }
function checkboxValue(root, name, fallback=true){ const input = root.querySelector(`[name="${name}"]`); return input ? input.checked : fallback; }
function baseUpdatedAt(){ return cleanText(state.content?.updated_at); }
function baseContentVersion(){ return Number(state.content?.version || 1); }
function publishedItems(section){ return (section?.items || []).filter(item => isAdmin() || item.status === 'published'); }
function sectionTopicList(section={}, options={}){
  const includeDisabled = Boolean(options.includeDisabled);
  const topics = Array.isArray(section?.topics) ? section.topics : [];
  const seen = new Set();
  return topics.map(topic => {
    const slug = cleanText(topic?.slug || '');
    const title = publicText(topic?.title || '');
    if(!slug || !title || seen.has(slug)) return null;
    seen.add(slug);
    return {slug, title, enabled: topic?.enabled !== false};
  }).filter(topic => topic && (includeDisabled || topic.enabled));
}
function sectionTopicsActive(section={}){
  return section?.topics_enabled === true && sectionTopicList(section).length > 0;
}
function materialStatus(value=''){
  const status = cleanText(value) || 'published';
  return ['published','draft','hidden'].includes(status) ? status : 'published';
}
function materialStatusLabel(status=''){
  const clean = materialStatus(status);
  if(clean === 'draft') return 'черновик';
  if(clean === 'hidden') return 'скрыто';
  return 'открыто';
}
function materialStatusClass(status=''){
  const clean = materialStatus(status);
  if(clean === 'draft') return 'is-draft';
  if(clean === 'hidden') return 'is-hidden';
  return 'is-live';
}
function materialFilterFor(route=''){
  const filter = cleanText(state.sectionMaterialFilters?.[route] || 'all');
  return ['all','published','draft','hidden'].includes(filter) ? filter : 'all';
}
function setMaterialFilter(route='', filter='all'){
  if(!sectionRoutes.includes(route)) return;
  state.sectionMaterialFilters = {...(state.sectionMaterialFilters || {}), [route]:['all','published','draft','hidden'].includes(filter) ? filter : 'all'};
  render();
}
function materialStatusCounts(items=[]){
  const counts = {all:0, published:0, draft:0, hidden:0};
  (Array.isArray(items) ? items : []).forEach(item => {
    const status = materialStatus(item?.status);
    counts.all += 1;
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
}
function filteredSectionMaterials(route='', section={}){
  const items = publishedItems(section).map((item, index) => ({...item, route, index, sectionTitle: section.title || sectionNames[route]}));
  if(!isAdmin()) return items;
  const filter = materialFilterFor(route);
  return filter === 'all' ? items : items.filter(item => materialStatus(item.status) === filter);
}
function adminMaterialNextStatus(item={}){
  return materialStatus(item.status) === 'published' ? 'hidden' : 'published';
}
function showItemField(item, field){ return item?.[`show_${field}`] !== false; }
function statusName(status){
  const map = {draft:'черновик', hidden:'скрыто', published:'опубликовано', new:'новое', planned:'запланировано', active:'активно', paused:'приостановлено', stopped:'остановлено', completed:'завершено', done:'выполнено', cancelled:'отменено', pending:'ждёт решения', processing:'в работе', closed:'закрыто', confirmed:'подтверждено', approved:'одобрено', rejected:'отклонено'};
  return map[status] || String(status || '—');
}
function diagnosticTypeName(type=''){
  const key = String(type || '').toLowerCase();
  if(key === 'ordered') return 'по заказу';
  if(key === 'diagnostic' || key === 'technical' || key === 'tech') return 'техническая';
  return key ? String(type) : 'техническая';
}
function diagnosticMetaParts(row={}, options={}){
  const parts = [diagnosticTypeName(row.type || '')];
  if(options.includeRequest && row.request_title) parts.push(`запрос: ${row.request_title}`);
  if(options.includeWork && row.work_title) parts.push(`работа: ${row.work_title}`);
  if(String(row.type || '').toLowerCase() === 'ordered' && Number(row.cost || 0) > 0) parts.push(money(row.cost || 0));
  if(options.includeHidden && row.is_hidden) parts.push('скрыта');
  if(row.created_at) parts.push(time(row.created_at));
  return parts.filter(Boolean);
}
function saveSummary(payload, fallback='Сохранено.'){
  const changed = Array.isArray(payload?.changed_fields) ? payload.changed_fields.filter(Boolean) : [];
  const warnings = Array.isArray(payload?.warnings) ? payload.warnings.filter(Boolean) : [];
  const changedText = changed.length ? `Сохранено: ${changed.join(', ')}.` : fallback;
  return warnings.length ? `${changedText} ${warnings.join(' ')}` : changedText;
}
function clockNow(){
  return new Date().toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});
}
function setSaveStatus(status='idle', message='Готово'){
  state.saveStatus = status;
  state.saveMessage = message;
  state.saveUpdatedAt = status === 'saved' ? clockNow() : state.saveUpdatedAt;
  paintSaveStatus();
}
function saveStatusText(){
  if(state.saveStatus === 'saving') return state.saveMessage || 'Сохраняю…';
  if(state.saveStatus === 'saved') return `${state.saveMessage || 'Сохранено.'}${state.saveUpdatedAt ? ` · ${state.saveUpdatedAt}` : ''}`;
  if(state.saveStatus === 'error') return state.saveMessage || 'Ошибка сохранения.';
  if(state.saveStatus === 'dirty') return state.saveMessage || 'Есть изменения.';
  return state.saveMessage || 'Готово';
}
function saveStatusClass(){
  return state.saveStatus === 'saving' ? 'is-saving' : state.saveStatus === 'saved' ? 'is-saved' : state.saveStatus === 'error' ? 'is-error' : '';
}
function saveStatusHtml(){
  return `<span class="admin-editor__save-state ${saveStatusClass()}" data-save-state>${esc(saveStatusText())}</span>`;
}
function paintSaveStatus(){
  document.querySelectorAll('[data-save-state]').forEach(node => {
    node.className = `admin-editor__save-state ${saveStatusClass()}`.trim();
    node.textContent = saveStatusText();
  });
  document.querySelectorAll('[data-persistent-feedback]').forEach(node => {
    if(state.saveStatus === 'idle'){
      node.className = 'form-note';
      node.textContent = '';
      return;
    }
    node.className = `form-feedback ${state.saveStatus === 'error' ? 'is-danger' : state.saveStatus === 'saving' ? 'is-warning' : state.saveStatus === 'saved' ? 'is-success' : 'is-muted'}`;
    node.textContent = saveStatusText();
  });
}
function resetAdminState(){
  if(state.adminFinanceEvents){
    state.adminFinanceEvents.close();
    state.adminFinanceEvents = null;
    state.adminFinanceEventsReady = false;
  }
  state.dashboard = null;
  state.adminDashboardReady = false;
  state.adminDashboardPromise = null;
  state.adminSummaryPromise = null;
  state.adminWorkbenchPromise = null;
  state.adminActionsPromise = null;
  state.adminProfiles = null;
  state.adminProfilesPromise = null;
  state.adminProfileDetail = null;
  state.adminProfileDetailId = '';
  state.adminProfileDetailPromise = null;
  state.adminWorkbenchError = '';
  state.adminAutoRefreshPromise = null;
  state.adminAutoRefreshAt = 0;
  state.adminFinance = null;
  state.adminFinancePromise = null;
  state.adminFinanceError = '';
  state.adminFinanceRefreshPromise = null;
  state.adminFinanceRefreshAt = 0;
  state.clientAutoRefreshPromise = null;
  state.clientAutoRefreshAt = 0;
  state.adminClientPayload = null;
  state.adminClientPayloadId = '';
  state.adminClientError = '';
}
function resetCommunityState(){
  state.notifications = {unread_count:0, items:[]};
  state.messages = {unread_count:0};
  state.communityMessagesPayload = null;
  state.communityMessagesSignature = '';
  state.communityMessagesThreadId = '';
  if(state.communityMessagesPollTimer){
    clearInterval(state.communityMessagesPollTimer);
    state.communityMessagesPollTimer = null;
  }
  state.subscriptions = [];
}
function mergeDashboard(payload){
  state.dashboard = {...(state.dashboard || {}), ...(payload || {})};
  return state.dashboard;
}
function unreadNotificationsCount(){
  return Number(state.notifications?.unread_count || 0);
}
function notificationBadgeHtml(){
  const count = unreadNotificationsCount();
  return count ? `<span class="notification-count">${count > 99 ? '99+' : esc(count)}</span>` : '';
}
function notificationIconHtml(){
  return `<svg class="notification-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
    <path d="M13.7 21a2 2 0 0 1-3.4 0"></path>
  </svg>`;
}
function unreadMessagesCount(){
  return Number(state.messages?.unread_count || 0);
}
function messageBadgeHtml(){
  const count = unreadMessagesCount();
  return count ? `<span class="notification-count">${count > 99 ? '99+' : esc(count)}</span>` : '';
}
function messageIconHtml(){
  return `<svg class="notification-icon message-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="3.5" y="5.5" width="17" height="13" rx="2"></rect>
    <path d="m4.5 7.5 7.5 5.5 7.5-5.5"></path>
  </svg>`;
}
function adminTrafficIconHtml(){
  return `<svg class="admin-traffic-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"></path>
    <circle cx="12" cy="12" r="3"></circle>
  </svg>`;
}
function adminTrafficText(){
  return 'Посещаемость';
}
function trafficNumber(value){
  return new Intl.NumberFormat('ru-RU').format(Number(value || 0));
}
function trafficPathDetails(path=''){
  const clean = cleanText(path || '/').split('?')[0] || '/';
  if(clean === '/') return {label:'Главная', kind:'page'};
  const parts = clean.split('/').filter(Boolean);
  const route = parts[0] || '';
  if(route === 'u') return {label:parts[1] ? `Профиль: ${safeDecode(parts[1]).replace(/-/g, ' ')}` : 'Профиль', kind:'profile'};
  if(route === 'privacy') return {label:'Персональные данные', kind:'page'};
  if(route === 'rules') return {label:'Правила сайта', kind:'page'};
  if(route === 'personal-data-consent') return {label:'Согласие', kind:'page'};
  const section = sectionDisplayName(route) || route;
  if(parts.length === 1) return {label:section, kind:'section'};
  const slug = safeDecode(parts.slice(1).join('/'));
  const item = findMaterial(route, slug);
  return {
    label:cleanText(item?.title) || slug.replace(/-/g, ' '),
    kind:'material',
  };
}
function trafficPathLabel(path=''){
  return trafficPathDetails(path).label;
}
function adminTrafficValueHtml(value, label=''){
  return `<span class="admin-traffic-value"><b>${esc(trafficNumber(value))}</b><em>${esc(label)}</em></span>`;
}
function adminTrafficPeriodHtml(label, row={}){
  const visitors = Number(row.visitors || 0);
  const pageviews = Number(row.pageviews || 0);
  return `<div class="admin-traffic-period-row">
    <strong>${esc(label)}</strong>
    ${adminTrafficValueHtml(visitors, 'пос.')}
    ${adminTrafficValueHtml(pageviews, 'просм.')}
  </div>`;
}
function adminTrafficStatsHtml(visitors=0, pageviews=0){
  const visitorText = trafficNumber(visitors);
  const pageviewText = trafficNumber(pageviews);
  return `<strong class="admin-traffic-stats" aria-label="${attr(`${visitorText} посетителей, ${pageviewText} просмотров`)}"><span title="Посетители">${esc(visitorText)}</span><span title="Просмотры">${esc(pageviewText)}</span></strong>`;
}
function adminTrafficRowsHtml(){
  const today = state.adminTraffic?.today || {};
  const yesterday = state.adminTraffic?.yesterday || {};
  return `<section class="admin-traffic-section admin-traffic-summary-section" aria-label="Краткая сводка посещаемости">
    <div class="admin-traffic-section-head"><strong>Сводка</strong>${adminTrafficHeadStatsHtml()}</div>
    <div class="admin-traffic-summary">
      ${adminTrafficPeriodHtml('Сегодня', today)}
      ${adminTrafficPeriodHtml('Вчера', yesterday)}
    </div>
  </section>`;
}
function adminTrafficActionsHtml(close=false){
  return `<header class="admin-traffic-head">
    <strong class="admin-traffic-title">Посещаемость</strong>
    <div class="admin-traffic-actions">
      <button class="plain" type="button" data-action="admin-traffic-refresh">Обновить</button>
      <button class="secondary" type="button" data-action="admin-traffic-reset">Сбросить</button>
      ${close ? '<button class="plain admin-traffic-close" type="button" data-admin-traffic-close aria-label="Закрыть">×</button>' : ''}
    </div>
  </header>`;
}
function adminTrafficVisibleRows(items=[]){
  return (Array.isArray(items) ? items : [])
    .filter(item => trafficPathDetails(item.path || item.last_path || '/').kind !== 'profile');
}
function adminTrafficPageRows(items=[]){
  return adminTrafficVisibleRows(items)
    .filter(item => trafficPathDetails(item.path || item.last_path || '/').kind !== 'material');
}
function adminTrafficHeadStatsHtml(){
  return `<span class="admin-traffic-head-stats" aria-hidden="true"><b>пос.</b><b>просм.</b></span>`;
}
function adminTrafficListHtml(title, items=[], mode='top', emptyText='Сегодня ещё нет переходов.', extraClass=''){
  const rows = adminTrafficVisibleRows(items).slice(0, 10);
  return `<section class="admin-traffic-section${extraClass ? ` ${attr(extraClass)}` : ''}">
    <div class="admin-traffic-section-head"><strong>${esc(title)}</strong>${adminTrafficHeadStatsHtml()}</div>
    <div class="admin-traffic-table" role="table" aria-label="${attr(title)}">
      ${rows.map(item => {
      const details = trafficPathDetails(item.path || item.last_path || '/');
      const label = cleanText(item.label) || details.label;
      const views = Number(item.pageviews || 0);
      const visitors = Number(item.visitors || 0);
      return `<div class="admin-traffic-line" role="row"><span>${esc(label)}</span>${adminTrafficStatsHtml(visitors, views)}</div>`;
    }).join('') || `<div class="admin-traffic-empty">${esc(emptyText)}</div>`}</div>
  </section>`;
}
function adminTrafficMaterialsHtml(){
  const source = adminTrafficVisibleRows(state.adminTraffic?.top_materials);
  const rows = source.length
    ? source
    : adminTrafficVisibleRows(state.adminTraffic?.top_pages).filter(item => trafficPathDetails(item.path || item.last_path || '/').kind === 'material');
  return adminTrafficListHtml('Материалы сегодня', rows, 'materials', 'Нет просмотров материалов.', 'admin-traffic-materials-section');
}
function adminTrafficHistoryHtml(){
  const days = Array.isArray(state.adminTraffic?.last_14_days)
    ? state.adminTraffic.last_14_days.slice(-14).sort((a, b) => String(b.day_key || '').localeCompare(String(a.day_key || '')))
    : [];
  const visibleDays = days.slice(0, 4);
  const hiddenDays = days.slice(4);
  const rowHtml = day => {
    const label = date(day.day_key).replace(/\s*г\.$/, '');
    return `<div class="admin-traffic-day"><span>${esc(label)}</span>${adminTrafficStatsHtml(day.visitors, day.pageviews)}</div>`;
  };
  return `<section class="admin-traffic-section admin-traffic-history-section">
    <div class="admin-traffic-section-head"><strong>14 дней</strong>${adminTrafficHeadStatsHtml()}</div>
    <div class="admin-traffic-history">${visibleDays.map(rowHtml).join('') || '<div class="admin-traffic-empty">История появится после первых посещений.</div>'}</div>
    ${hiddenDays.length ? `<details class="admin-traffic-more"><summary>Ещё ${hiddenDays.length} дней</summary><div class="admin-traffic-history">${hiddenDays.map(rowHtml).join('')}</div></details>` : ''}
  </section>`;
}
function adminTrafficBoardHtml(){
  return `<div class="admin-traffic-board">
    <div class="admin-traffic-board-grid">
      ${adminTrafficRowsHtml()}
      ${adminTrafficListHtml('Страницы сегодня', adminTrafficPageRows(state.adminTraffic?.top_pages || []), 'top', 'Сегодня ещё нет переходов.', 'admin-traffic-pages-section')}
      ${adminTrafficMaterialsHtml()}
      ${adminTrafficHistoryHtml()}
    </div>
  </div>`;
}
function adminTrafficDetailsHtml(){
  return `<div class="admin-traffic-popover" id="adminTrafficPopover" hidden>
    ${adminTrafficActionsHtml()}
    ${adminTrafficBoardHtml()}
  </div>`;
}
function adminTrafficButtonHtml(){
  return `${adminTrafficIconHtml()}<span class="visually-hidden">Посещаемость</span>`;
}
function adminTrafficSurfaceHtml(){
  return `<div class="notification-surface admin-traffic-surface">
    <div class="notification-surface-body">${adminTrafficActionsHtml(true)}${adminTrafficBoardHtml()}</div>
  </div>`;
}
function ensureAdminTrafficSheet(){
  let sheet = document.querySelector('#adminTrafficSheet');
  if(sheet) return sheet;
  sheet = document.createElement('div');
  sheet.id = 'adminTrafficSheet';
  sheet.className = 'notification-sheet admin-traffic-sheet';
  sheet.hidden = true;
  sheet.innerHTML = `<div class="notification-sheet-backdrop" data-admin-traffic-close></div><div class="notification-sheet-card"></div>`;
  document.body.append(sheet);
  return sheet;
}
function renderAdminTrafficSheet(){
  const sheet = ensureAdminTrafficSheet();
  const card = sheet.querySelector('.notification-sheet-card');
  if(card) card.innerHTML = adminTrafficSurfaceHtml();
  const show = state.adminTrafficOpen && isMobileViewport();
  sheet.hidden = !show;
  document.body.classList.toggle('admin-traffic-open', show);
}
function ensureAdminTrafficControl(){
  if(!headerActions) return null;
  let control = document.querySelector('#adminTrafficControl');
  if(!control){
    control = document.createElement('div');
    control.id = 'adminTrafficControl';
    control.className = 'admin-traffic-control';
    control.hidden = true;
    const button = document.createElement('button');
    button.id = 'adminTrafficButton';
    button.type = 'button';
    button.className = 'admin-traffic-chip';
    button.dataset.action = 'admin-traffic-toggle';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    control.append(button);
    headerActions.insertBefore(control, document.querySelector('#notificationsControl') || profileControl || null);
  }
  return control.querySelector('#adminTrafficButton');
}
function syncAdminTrafficControl(){
  const control = document.querySelector('#adminTrafficControl');
  if(control) control.hidden = true;
  state.adminTrafficOpen = false;
  document.querySelector('#adminTrafficSheet')?.setAttribute('hidden', '');
  document.body.classList.remove('admin-traffic-open');
}
function setAdminTrafficPanel(open){
  const next = Boolean(open) && isAdmin();
  if(next){
    closeProfileMenu();
    closeNotificationsPanel();
    setMenu(false);
  }
  state.adminTrafficOpen = next;
  syncAdminTrafficControl();
}
function closeAdminTrafficPanel(){
  if(state.adminTrafficOpen) setAdminTrafficPanel(false);
  document.querySelector('#adminTrafficSheet')?.setAttribute('hidden', '');
  document.body.classList.remove('admin-traffic-open');
}
function toggleAdminTrafficPanel(){
  if(!state.adminTraffic) loadAdminTraffic(true).catch(() => {});
  setAdminTrafficPanel(!state.adminTrafficOpen);
}
function accountInitial(user=state.user || {}){
  const source = cleanText(user.display_name || user.nickname || user.username || 'П');
  return (Array.from(source.trim())[0] || 'П').toUpperCase();
}
function accountAvatarHtml(user=state.user || {}){
  const url = cleanText(user.avatar_url || '');
  const name = cleanText(user.display_name || user.nickname || user.username || 'Профиль');
  if(url){
    return `<span class="account-avatar"><img src="${attr(url)}" alt="${attr(name)}" loading="lazy" decoding="async"></span>`;
  }
  return `<span class="account-avatar">${esc(accountInitial(user))}</span>`;
}
function accountTriggerHtml(){
  return `${accountAvatarHtml(state.user || {})}<span class="account-name">${esc(userDisplayName())}</span><span class="account-caret" aria-hidden="true"></span>`;
}
function isMobileViewport(){
  return window.matchMedia('(max-width: 860px)').matches;
}
function ensureNotificationsButton(){
  if(!headerActions) return null;
  let control = document.querySelector('#notificationsControl');
  if(!control){
    control = document.createElement('div');
    control.id = 'notificationsControl';
    control.className = 'notification-control';
    const button = document.createElement('button');
    button.id = 'notificationsButton';
    button.type = 'button';
    button.className = 'notification-button';
    button.dataset.action = 'notifications-open';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    const panel = document.createElement('div');
    panel.id = 'notificationsPanel';
    panel.className = 'notification-popover';
    panel.hidden = true;
    control.append(button, panel);
    headerActions.insertBefore(control, profileControl || null);
  }
  return control.querySelector('#notificationsButton');
}
function ensureMessagesButton(){
  if(!headerActions) return null;
  let control = document.querySelector('#messagesControl');
  if(!control){
    control = document.createElement('div');
    control.id = 'messagesControl';
    control.className = 'message-control';
    const button = document.createElement('button');
    button.id = 'messagesButton';
    button.type = 'button';
    button.className = 'message-button';
    button.dataset.action = 'messages-open';
    control.append(button);
    headerActions.insertBefore(control, profileControl || null);
  }
  return control.querySelector('#messagesButton');
}
function syncNotificationsButton(){
  const button = ensureNotificationsButton();
  if(!button) return;
  const control = document.querySelector('#notificationsControl');
  const visible = isPublicUser();
  if(control) control.hidden = !visible;
  if(!visible) closeNotificationsPanel();
  button.setAttribute('aria-label', unreadNotificationsCount() ? `Уведомления: ${unreadNotificationsCount()} новых` : 'Уведомления');
  button.setAttribute('aria-expanded', String(state.notificationsOpen && visible));
  button.title = 'Уведомления';
  button.innerHTML = `${notificationIconHtml()}${notificationBadgeHtml()}`;
}
function syncMessagesButton(){
  const button = ensureMessagesButton();
  if(!button) return;
  const control = document.querySelector('#messagesControl');
  const visible = isPublicUser();
  if(control) control.hidden = !visible;
  const count = unreadMessagesCount();
  button.setAttribute('aria-label', count ? `Сообщения: ${count} новых` : 'Сообщения');
  button.title = 'Сообщения';
  button.innerHTML = `${messageIconHtml()}${messageBadgeHtml()}`;
}
function adminViewModeToggleHtml(className='profile-menu-item'){
  if(!hasAdminRights()) return '';
  const visitor = isVisitorMode();
  const next = visitor ? 'admin' : 'visitor';
  const label = visitor ? 'Включить админа' : 'Как посетитель';
  return `<button class="${attr(className)} admin-view-mode-toggle" type="button" role="menuitem" data-action="admin-view-toggle" data-view="${attr(next)}">${esc(label)}</button>`;
}
function profileMenuHtml(){
  if(!state.user) return '';
  let links = '';
  const nick = state.user.nickname || state.user.username || '';
  const myProfileLink = nick ? `<a class="profile-menu-item" href="${routeHref('u', nick)}" role="menuitem" data-route="u" data-slug="${attr(nick)}">Профиль</a>` : '';
  const showAdminProfileLinks = hasAdminRights();
  const showTrebnikProfileLink = !showAdminProfileLinks && isTrebnikClient();
  const trebnikProfileLink = showTrebnikProfileLink ? `<a class="profile-menu-item profile-menu-desktop-only" href="${routeHref('trebnik')}" role="menuitem" data-route="trebnik">Требник</a>` : '';
  if(showAdminProfileLinks){
    links = `<a class="profile-menu-item" href="${routeHref('home')}" role="menuitem" data-route="home">Главная</a>
       ${myProfileLink}
       <a class="profile-menu-item profile-menu-admin-link" href="${routeHref('admin')}" role="menuitem" data-route="admin">${esc(adminAreaName())}</a>
       <a class="profile-menu-item profile-menu-admin-link" href="${routeHref('trebnik')}" role="menuitem" data-route="trebnik">Требник</a>`;
  }else{
    links = `${myProfileLink}${trebnikProfileLink}`;
  }
  links = `${adminViewModeToggleHtml('profile-menu-item')}${links}`;
  links += `<button class="profile-menu-item profile-menu-item-danger" type="button" role="menuitem" data-action="logout">Выйти</button>`;
  const gridClass = showAdminProfileLinks ? 'has-admin-links' : (showTrebnikProfileLink ? 'has-trebnik' : '');
  return `<div class="profile-menu-head"><strong>${esc(userDisplayName())}</strong><span>${esc(userRoleLabel())}</span></div><div class="profile-menu-list profile-menu-grid ${gridClass}">${links}</div>`;
}
function mobileNavActionsHtml(){
  if(!state.user){
    return `<button class="mobile-nav-button" type="button" data-action="public-login">${state.health?.community?.registration_enabled ? 'Войти / зарегистрироваться' : 'Войти'}</button>`;
  }
  let links = '';
  let primaryActionsCount = 0;
  if(state.user.role === 'admin'){
    links = `${adminViewModeToggleHtml('mobile-nav-button')}
       ${isAdmin() ? `<a class="mobile-nav-button" href="${routeHref('admin')}" data-route="admin">${esc(adminAreaName())}</a>
       <a class="mobile-nav-button" href="${routeHref('trebnik')}" data-route="trebnik">Требник</a>` : ''}`;
    primaryActionsCount = isAdmin() ? 2 : 0;
  }else if(isTrebnikClient()){
    links = `<a class="mobile-nav-button" href="${routeHref('trebnik')}" data-route="trebnik">Требник</a>`;
    primaryActionsCount = 1;
  }else{
    links = `${adminViewModeToggleHtml('mobile-nav-button')}
       ${isAdmin() ? `<a class="mobile-nav-button" href="${routeHref('admin')}" data-route="admin">${esc(adminAreaName())}</a><a class="mobile-nav-button" href="${routeHref('trebnik')}" data-route="trebnik">Требник</a>` : ''}`;
    primaryActionsCount = isAdmin() ? 2 : 0;
  }
  const logoutFull = primaryActionsCount !== 1 ? ' mobile-nav-button-full' : '';
  return `<div class="mobile-nav-block">
      ${links}
      <button class="mobile-nav-button mobile-nav-button-danger${logoutFull}" type="button" data-action="logout">Выйти</button>
    </div>`;
}
function ensureProfileControl(){
  if(!headerActions) return null;
  if(!profileControl){
    profileControl = document.createElement('div');
    profileControl.id = 'profileControl';
    profileControl.className = 'profile-control';
    profileControl.hidden = true;
    headerActions.append(profileControl);
  }
  if(!profileButton){
    profileButton = document.createElement('button');
    profileButton.id = 'profileButton';
    profileButton.type = 'button';
    profileButton.className = 'account-trigger';
    profileButton.setAttribute('aria-haspopup', 'menu');
    profileButton.setAttribute('aria-expanded', 'false');
    profileControl.append(profileButton);
  }
  if(!profileMenu){
    profileMenu = document.createElement('div');
    profileMenu.id = 'profileMenu';
    profileMenu.className = 'profile-menu';
    profileMenu.setAttribute('role', 'menu');
    profileMenu.hidden = true;
    profileControl.append(profileMenu);
  }
  profileAvatar = document.querySelector('#profileAvatar');
  return profileControl;
}
function syncHeaderControls(){
  const loggedIn = Boolean(state.user);
  if(brandSub){
    brandSub.textContent = brand().site_subtitle || '';
    brandSub.hidden = !cleanText(brand().site_subtitle);
  }
  if(brandMark){
    const logo = brandLogoUrl();
    brandMark.hidden = !logo;
    brandMark.textContent = '';
    if(logo) brandMark.style.setProperty('--brand-logo-url', cssUrl(logo));
  }
  if(loggedIn) ensureProfileControl();
  if(profileControl) profileControl.hidden = !loggedIn;
  if(loggedIn){
    profileButton.className = 'account-trigger';
    profileButton.setAttribute('aria-label', `Профиль: ${userDisplayName()}`);
    profileButton.innerHTML = accountTriggerHtml();
    profileAvatar = document.querySelector('#profileAvatar');
    profileMenu.innerHTML = profileMenuHtml();
    profileMenu.classList.toggle('profile-menu-with-trebnik', !hasAdminRights() && isTrebnikClient());
    profileMenu.classList.toggle('profile-menu-with-admin-links', hasAdminRights());
  }else if(profileMenu){
    state.profileOpen = false;
    profileMenu.innerHTML = '';
    profileMenu.classList.remove('profile-menu-with-trebnik');
    profileMenu.classList.remove('profile-menu-with-admin-links');
  }
  syncAdminTrafficControl();
  mobileNavActions.innerHTML = mobileNavActionsHtml();
  mobileNavActions.hidden = !mobileNavActions.innerHTML.trim();
  syncNotificationsButton();
  syncMessagesButton();
  if(profileControl) profileControl.classList.toggle('open', state.profileOpen && loggedIn);
  if(profileMenu) profileMenu.hidden = !(state.profileOpen && loggedIn);
  if(profileButton) profileButton.setAttribute('aria-expanded', String(state.profileOpen && loggedIn));
}
function setProfileMenu(open){
  state.profileOpen = Boolean(open) && Boolean(state.user);
  syncHeaderControls();
}
function closeProfileMenu(){
  if(state.profileOpen) setProfileMenu(false);
}
async function setAdminViewMode(mode='admin'){
  if(!hasAdminRights()) return;
  const next = mode === 'visitor' ? 'visitor' : 'admin';
  if(state.adminViewMode === next) return;
  state.adminViewMode = next;
  localStorage.setItem(keys.adminViewMode, next);
  state.adminTraffic = null;
  state.adminTrafficPromise = null;
  state.adminTrafficOpen = false;
  resetAdminState();
  closeProfileMenu();
  closeAdminTrafficPanel();
  try{
    await reloadContent();
    if(next === 'visitor' && (state.route === 'admin' || state.route === 'trebnik')){
      go('home', '', {replace:true});
    }else{
      render();
    }
    say(next === 'visitor' ? 'Включен вид обычного посетителя.' : 'Админский режим включен.', 'success');
  }catch(error){
    say(error.message || 'Не удалось переключить режим.', 'danger');
  }
}
function hasAdminSummary(){
  return Boolean(state.dashboard?.overview && Array.isArray(state.dashboard?.clients) && Array.isArray(state.dashboard?.notes));
}
function hasAdminWorkbench(){
  return ['pending_payments', 'recent_updates', 'services', 'expiring_services', 'work_today', 'work_upcoming', 'work_agenda', 'inquiries', 'client_messages', 'fresh_client_messages', 'payment_receipts', 'service_extend_requests', 'events'].every(key => Array.isArray(state.dashboard?.[key]));
}
function hasAdminActionsDashboard(){
  return ['pending_payments', 'recent_updates', 'expiring_services', 'work_today', 'work_upcoming', 'work_agenda', 'client_messages', 'fresh_client_messages', 'service_extend_requests'].every(key => Array.isArray(state.dashboard?.[key]));
}
function hasAdminDashboard(){
  return Boolean(state.adminDashboardReady && hasAdminSummary() && hasAdminWorkbench());
}
function imageDimensionValue(source={}, key=''){
  const value = Number(source?.[key] || 0);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}
function imageMetaAttrs(source={}, prefix='cover_image'){
  const width = imageDimensionValue(source, `${prefix}_width`);
  const height = imageDimensionValue(source, `${prefix}_height`);
  if(!width || !height) return '';
  const ratio = Math.max(.1, width / height).toFixed(4);
  return ` width="${attr(width)}" height="${attr(height)}" style="--image-ratio:${attr(ratio)}"`;
}
function coverRatioClass(source={}, prefix='cover_image'){
  const width = imageDimensionValue(source, `${prefix}_width`);
  const height = imageDimensionValue(source, `${prefix}_height`);
  if(!width || !height) return '';
  const ratio = width / height;
  if(ratio < .82) return 'cover-portrait';
  if(ratio > 1.18) return 'cover-landscape';
  return 'cover-square';
}
function mediaImageHtml(url='', alt='', className='card-image', source={}, prefix='cover_image', priority=false){
  const loading = priority ? '' : ' loading="lazy"';
  const fetchPriority = priority ? ' fetchpriority="high"' : '';
  if(url) return `<img class="${className}" src="${attr(url)}" alt="${attr(alt || siteName())}"${imageMetaAttrs(source, prefix)}${loading} decoding="async"${fetchPriority}>`;
  return '';
}
function optimizedImageSrcset(url=''){
  const match = String(url || '').match(/^(.*-)(\d+)(\.webp)$/);
  if(!match) return '';
  return `${url} ${match[2]}w`;
}
function heroImageHtml(url='', alt=''){
  if(!url) return '';
  const srcset = optimizedImageSrcset(url);
  const responsive = srcset ? ` srcset="${attr(srcset)}" sizes="(max-width: 860px) 92vw, 34vw"` : '';
  return mediaImageHtml(url, alt || siteName(), 'hero-image', state.content?.home || {}, 'hero_image', true).replace(`src="${attr(url)}"`, `src="${attr(url)}"${responsive}`);
}
function heroFrameHtml(){
  return `<div class="hero-media">
    <div class="hero-frame">
      <div class="hero-frame-inner">${heroImageHtml(heroImageUrl(), heroImageAlt())}</div>
    </div>
  </div>`;
}
function heroContactActionsHtml(){
  const telegramUrl = homeTelegramUrl();
  const telegram = telegramUrl ? `<a class="hero-contact-button" href="${attr(telegramUrl)}" target="_blank" rel="noopener">${esc(homeTelegramLabel())}</a>` : '';
  const siteMessage = `<button class="hero-contact-button" type="button" data-action="site-message">${esc(homeSiteMessageLabel())}</button>`;
  return `<div class="hero-contact-actions">${telegram}${siteMessage}</div>`;
}
function mediaPreviewCardHtml({title='', url='', alt='', ratio='portrait', emptyText='Без изображения'} = {}){
  return `<div class="media-preview-card">
    <div class="media-preview-frame ${ratio === 'landscape' ? 'is-landscape' : ''}">
      ${url ? mediaImageHtml(url, alt || title || siteName(), 'media-preview-image') : `<div class="media-preview-empty">${esc(emptyText)}</div>`}
    </div>
    <div class="stack">
      <strong>${esc(title || 'Изображение')}</strong>
      <span class="subtle">${url ? 'Загружено' : 'Без изображения'}</span>
    </div>
  </div>`;
}
function cardMediaHtml(itemOrUrl='', title='', note=''){
  const source = typeof itemOrUrl === 'object' && itemOrUrl ? itemOrUrl : {};
  const url = typeof itemOrUrl === 'object' && itemOrUrl ? String(itemOrUrl.cover_image_url || '') : String(itemOrUrl || '');
  const alt = typeof itemOrUrl === 'object' && itemOrUrl ? (itemOrUrl.cover_image_alt || itemOrUrl.title || title || siteName()) : (title || siteName());
  if(url) return `<div class="content-card-media">${mediaImageHtml(url, alt, 'card-image', source)}</div>`;
  return '';
}
function hydrateContentCardMedia(root=document){
  (root || document).querySelectorAll('.content-card.has-cover').forEach(card => {
    if(card.classList.contains('cover-portrait') || card.classList.contains('cover-landscape') || card.classList.contains('cover-square')) return;
    const img = card.querySelector('.content-card-media .card-image');
    if(!img) return;
    const apply = () => {
      const width = Number(img.naturalWidth || 0);
      const height = Number(img.naturalHeight || 0);
      card.classList.remove('cover-portrait', 'cover-landscape', 'cover-square');
      if(!width || !height) return;
      const ratio = width / height;
      card.style.setProperty('--cover-ratio', ratio.toFixed(4));
      card.classList.add(ratio < .82 ? 'cover-portrait' : ratio > 1.18 ? 'cover-landscape' : 'cover-square');
    };
    if(img.complete && img.naturalWidth) apply();
    else img.addEventListener('load', apply, {once:true});
  });
}
function materialKey(item){
  return `${item.route}:${item.slug}`;
}
function materialKeyFromParts(route='', slug=''){
  return `${route}:${slug}`;
}
function allMaterialsFromContent(content){
  const sections = content?.sections || {};
  return sectionRoutes.flatMap(route => {
    const section = sections[route] || {};
    const items = Array.isArray(section.items) ? section.items : [];
    return items.map((item, index) => ({
      ...item,
      route,
      index,
      sectionTitle: section.title || sectionNames[route],
    }));
  });
}
function selectedFeaturedMaterials(){
  const byKey = new Map(allMaterials().map(item => [materialKey(item), item]));
  const selected = featuredMaterialKeys().map(key => byKey.get(key)).filter(Boolean).filter(item => item.status === 'published' || isAdmin());
  return selected.slice(0, 4);
}
function sectionAddLabel(sectionTitle='раздел'){
  return 'Добавить материал';
}
function refreshSectionAddLabels(root){
  root.querySelectorAll('details[data-section]').forEach(details => {
    const sectionTitle = details.querySelector('[name="section_title"]')?.value?.trim() || details.querySelector('summary')?.textContent?.trim() || 'раздел';
    const button = details.querySelector('[data-add-item]');
    if(button) button.textContent = sectionAddLabel(sectionTitle);
  });
}
function allMaterials(){
  const sections = state.content?.sections || {};
  return sectionRoutes.flatMap(route => publishedItems(sections[route]).map((item, index) => ({...item, route, index, sectionTitle: sections[route]?.title || sectionNames[route]})));
}
function findMaterial(route, slug){ return publishedItems(state.content?.sections?.[route] || {}).find(item => (item.slug || '') === slug); }
function currentPageTitle(){
  const name = siteName();
  if(state.route === 'home') return name;
  if(state.route === 'admin') return `${adminAreaName()} — ${name}`;
  if(state.route === 'trebnik'){
    if(!isAdmin()) return `${clientAreaName()} — ${name}`;
    const labels = {actions:'Дела', clients:'Клиенты', services:'Обрядник', payments:'Финансы'};
    const page = state.slug === 'inquiries' ? 'actions' : (adminTrebnikPages.includes(state.slug) ? state.slug : 'clients');
    return `${labels[page] || 'Клиенты'} — ${clientAreaName()} — ${name}`;
  }
  if(state.route === 'messages') return `Сообщения — ${name}`;
  if(state.route === 'privacy') return `Политика обработки персональных данных — ${name}`;
  if(state.route === 'rules') return `Правила сайта — ${name}`;
  if(state.route === 'personal-data-consent') return `Согласие на обработку персональных данных — ${name}`;
  if(state.route === 'u'){
    const profile = state.profilePayload?.profile || {};
    const profileTitle = cleanText(profile.display_name || profile.nickname || '');
    return `${profileTitle || 'Профиль'} — ${name}`;
  }
  if(sectionRoutes.includes(state.route)){
    const section = state.content?.sections?.[state.route] || {};
    if(state.slug){
      if(state.route === 'questions') return `Вопрос — ${name}`;
      const item = findMaterial(state.route, state.slug);
      return `${publicText(item?.title || 'Материал не найден')} — ${name}`;
    }
    return `${publicText(section.title || sectionNames[state.route])} — ${name}`;
  }
  return name;
}

