function renderTrebnik(){
  if(!state.user){
    app.innerHTML = `<section class="gate-closed"><article class="gate-card compact"><h1>Войдите в профиль</h1><p>Кабинет открывается только профилю, который администратор привязал к клиенту Требника.</p><div class="row" style="margin-top:22px"><button class="primary" data-action="public-login">Войти</button><a class="secondary" href="${routeHref('home')}" data-route="home">На главную</a></div></article></section>`;
    return;
  }
  if(isAdmin()) return renderAdminTrebnik();
  if(isClient()){
    app.innerHTML = `<section class="gate-closed"><article class="gate-card compact"><h1>Старый вход отключён</h1><p>Теперь кабинет Требника открывается только через обычный профиль сайта, который администратор привязал к клиенту.</p><div class="row" style="margin-top:22px"><button class="primary" data-action="logout">Выйти</button><button class="secondary" data-action="public-login">Войти профилем сайта</button></div></article></section>`;
    return;
  }
  if(isPublicUser() && !trebnikClientId()){
    app.innerHTML = `<section class="gate-closed"><article class="gate-card compact"><h1>Кабинет ещё не открыт</h1><p>Ваш профиль зарегистрирован на сайте, но администратор ещё не привязал его к клиенту Требника.</p><div class="row" style="margin-top:22px"><a class="secondary" href="${routeHref('home')}" data-route="home">На главную</a></div></article></section>`;
    return;
  }
  const clientId = trebnikClientId();
  if(!clientId){
    app.innerHTML = `<section class="gate-card"><h1>Клиент не выбран</h1><p>В Мастерской выберите клиента и откройте предпросмотр кабинета.</p><div class="row" style="margin-top:22px"><a class="primary" href="${routeHref('admin')}" data-route="admin">В Мастерскую</a></div></section>`;
    return;
  }
  renderClientCabinet(clientId, isAdmin());
}

function adminTrebnikPage(){
  if(state.slug === 'inquiries') return 'actions';
  return adminTrebnikPages.includes(state.slug) ? state.slug : 'clients';
}
function adminTrebnikNavBadge(page){
  const finance = state.adminFinance?.summary || state.dashboard?.finance?.summary || {};
  if(page === 'actions'){
    const todayCount = (state.dashboard?.work_today || []).length;
    const upcomingCount = (state.dashboard?.work_upcoming || []).length;
    const updatesCount = adminUnreadClientUpdates(state.dashboard?.fresh_client_messages || state.dashboard?.client_messages || []).length;
    const count = todayCount + upcomingCount + updatesCount;
    return count > 0 ? {value:count, label:`${count} дел в работе`} : null;
  }
  if(page === 'payments'){
    const pending = Number(finance.pending_count || (state.dashboard?.pending_payments || []).length);
    if(pending > 0) return {value:pending, label:`${pending} платежей на подтверждении`};
  }
  return null;
}
function adminTrebnikNavHtml(){
  const labels = {actions:'Дела', clients:'Клиенты', services:'Обрядник', payments:'Финансы'};
  const activePage = adminTrebnikPage();
  const sourceState = state.dashboard ? trebnikSourceStateClass(state.dashboard) : 'is-warning';
  const links = adminTrebnikPages.map(page => {
    const badge = adminTrebnikNavBadge(page);
    return `<a class="plain trebnik-nav-link ${activePage === page ? 'active' : ''} ${badge ? 'has-badge' : ''}" href="${routeHref('trebnik', page)}" data-route="trebnik" data-slug="${attr(page)}" ${activePage === page ? 'aria-current="page"' : ''}>
      <span>${esc(labels[page])}</span>${badge ? `<em class="trebnik-nav-badge" aria-label="${attr(badge.label)}">${esc(badge.value)}</em>` : ''}
    </a>`;
  });
  return `<nav class="client-map trebnik-nav-split" aria-label="Разделы Требника">
    <span class="trebnik-nav-side is-left">${links.slice(0, 2).join('')}</span>
    <span class="trebnik-nav-title ${sourceState}"><span>${esc(clientAreaName())}</span></span>
    <span class="trebnik-nav-side is-right">${links.slice(2).join('')}</span>
  </nav>`;
}
function adminTrebnikMetric(label, value, page, tone=''){
  const active = adminTrebnikPage() === page ? ' active' : '';
  const iconMap = {'Общий долг':'₽','На подтверждении':'⌛','Сегодня':'▦','Новые апдейты':'✦'};
  const icon = iconMap[label] || '•';
  const inner = `<span class="admin-trebnik__metric-icon" aria-hidden="true">${esc(icon)}</span><span>${esc(label)}</span><b>${esc(value)}</b>`;
  if(!page){
    return `<div class="admin-trebnik__metric${tone ? ` is-${attr(tone)}` : ''}">
      ${inner}
    </div>`;
  }
  return `<a class="admin-trebnik__metric${active} ${tone ? `is-${attr(tone)}` : ''}" href="${routeHref('trebnik', page)}" data-route="trebnik" data-slug="${attr(page)}">
    ${inner}
  </a>`;
}
function adminTrebnikSummaryHtml(){
  const overview = state.dashboard?.overview || {};
  const finance = state.dashboard?.finance?.summary || {};
  const hasFinance = Boolean(state.dashboard?.finance?.summary);
  const debt = Number(finance.debt || 0);
  const pending = Number(finance.pending || 0);
  const todayWorks = (state.dashboard?.work_today || []).length;
  const newUpdates = adminUnreadClientUpdates(state.dashboard?.fresh_client_messages || []).length;
  return `<div class="admin-trebnik__summary" aria-label="Краткая сводка Требника">
    ${adminTrebnikMetric('Общий долг', money(debt), 'payments', debt > 0 ? 'priority' : '')}
    ${adminTrebnikMetric('На подтверждении', hasFinance ? money(pending) : adminPendingAmount(), 'payments')}
    ${adminTrebnikMetric('Сегодня', todayWorks, 'actions', todayWorks ? 'priority' : '')}
    ${adminTrebnikMetric('Новые апдейты', newUpdates, 'actions', newUpdates ? 'priority' : '')}
  </div>`;
}
function adminUnreadClientUpdates(rows=[]){
  return (Array.isArray(rows) ? rows : []).filter(row => {
    return row && !row.read_at && row.status !== 'processing';
  });
}
function canShowUpdateReadAction(row={}){
  return Boolean(row && !row.read_at && (row.author === 'client' || isClientQuestionKind(row.kind) || row.kind === 'update'));
}
function adminTrebnikShell(title, body){
  const page = adminTrebnikPage();
  return `<section class="admin-trebnik is-${attr(page)}">
    <div class="admin-trebnik__topbar">
      ${adminTrebnikNavHtml()}
    </div>
    ${body}
  </section>`;
}
async function renderAdminTrebnik(){
  const ticket = state.renderSeq;
  const page = adminTrebnikPage();
  const hasPageData = page === 'actions' ? hasAdminActionsDashboard() : hasAdminDashboard();
  if(!hasPageData) app.innerHTML = adminTrebnikShell('Открываю данные', `<div class="admin-editor__panel">${loading(page === 'actions' ? 'Открываю дела…' : 'Открываю клиентов…')}</div>`);
  try{
    if(page === 'actions'){
      await loadAdminActionsDashboard();
    }else{
      await loadDashboard();
    }
    if(page === 'services'){
      await loadRitebookCatalog().catch(() => {});
    }
    if(page === 'payments'){
      startAdminFinanceEvents();
      await loadAdminFinance().catch(() => {});
    }
    if(page === 'clients'){
      const selected = selectedClient(state.dashboard?.clients || []);
      if(selected) await loadAdminClientOverview(selected.id).catch(error => { state.adminClientError = error.message; });
    }
    if(ticket !== state.renderSeq || state.route !== 'trebnik' || !isAdmin()) return;
    paintAdminTrebnik();
  }catch(error){ app.innerHTML = trebnikProblem(error); }
}

const clientCabinetTabs = [
  ['now','Главное'],
  ['requests','Запросы'],
  ['diagnostics','Диагностики'],
  ['services','Услуги'],
  ['payments','Оплаты'],
  ['updates','Апдейты'],
];
const clientNotificationFields = [
  ['notify_new_work','Новая работа'],
  ['notify_status_change','Смена статуса'],
  ['notify_diagnostics','Новая диагностика'],
  ['notify_recommendations','Новая рекомендация'],
  ['notify_payment_reminder','Напоминание об оплате'],
  ['notify_update_reminder','Запрос апдейта'],
];
const clientRequestPanes = ['works','diagnostics','updates','recommendations','payments'];

function clientCabinetSyncUrlState(){
  if(state.route !== 'trebnik' || isAdmin()) return;
  const params = new URLSearchParams(location.search || '');
  const tab = params.get('tab') || '';
  const pane = params.get('pane') || '';
  const requestId = params.get('request') || '';
  if(clientCabinetTabs.some(([key]) => key === tab)) state.clientCabinetTab = tab;
  if(clientRequestPanes.includes(pane)) state.clientCabinetRequestPane = pane;
  if(requestId) state.clientCabinetRequestId = requestId;
}
function clientCabinetWriteUrlState(payload=state.clientPayload || {}){
  if(state.route !== 'trebnik' || isAdmin() || clientCabinetIsPreview()) return;
  const params = new URLSearchParams(location.search || '');
  const tab = clientCabinetActiveTabFor(payload || {});
  params.set('tab', tab);
  if(tab === 'requests'){
    if(state.clientCabinetRequestId) params.set('request', state.clientCabinetRequestId);
    else params.delete('request');
    if(clientRequestPanes.includes(state.clientCabinetRequestPane) && state.clientCabinetRequestPane !== 'works') params.set('pane', state.clientCabinetRequestPane);
    else params.delete('pane');
  }else{
    params.delete('request');
    params.delete('pane');
  }
  const query = params.toString();
  const nextUrl = `${location.pathname}${query ? `?${query}` : ''}`;
  const currentUrl = `${location.pathname}${location.search}`;
  if(nextUrl !== currentUrl) history.replaceState(null, '', nextUrl);
}

function metric(label, value){ return `<div class="metric"><b>${esc(value)}</b><span>${esc(label)}</span></div>`; }
function receiptStatusName(status){
  const map = {new:'платёж отправлен', processing:'ждёт подтверждения', confirmed:'подтверждён', rejected:'отклонён'};
  return map[status] || statusName(status);
}
function clientCabinetActiveTab(){
  return clientCabinetTabs.some(([key]) => key === state.clientCabinetTab) ? state.clientCabinetTab : 'now';
}
function clientCabinetTabsFor(payload={}){
  return clientCabinetTabs;
}
function clientCabinetActiveTabFor(payload={}){
  const tabs = clientCabinetTabsFor(payload);
  return tabs.some(([key]) => key === state.clientCabinetTab) ? state.clientCabinetTab : 'now';
}
function clientCabinetIsPreview(){
  return Boolean(state.clientCabinetPreview || (isAdmin() && state.route === 'trebnik'));
}
function clientCabinetCanWrite(preview=clientCabinetIsPreview()){
  return isTrebnikClient() && !preview;
}
function clientCabinetClientId(){
  if(!isTrebnikClient() || state.route !== 'trebnik' || isAdmin()) return '';
  return trebnikClientId();
}
function clientCabinetHasDraft(){
  if(!modal.hidden) return true;
  const active = document.activeElement;
  if(!(active instanceof HTMLElement)) return false;
  if(!app.contains(active)) return false;
  return Boolean(active.closest('form') || active.matches('input,textarea,select,[contenteditable="true"]'));
}
function clientCabinetRows(payload={}, key='requests'){
  return Array.isArray(payload[key]) ? payload[key] : [];
}
function clientCabinetActionSummary(payload={}){
  return payload.action_summary || payload.actionSummary || {};
}
function clientCabinetFinancialReport(payload={}){
  return payload.financial_report || payload.finance?.report || payload.report || {};
}
function clientCabinetFinanceSummary(payload={}){
  const report = clientCabinetFinancialReport(payload);
  return payload.finance?.summary || {
    total: report.total || 0,
    paid: report.combined_confirmed_total || report.paid || 0,
    pending: report.combined_pending_total || 0,
    debt: report.combined_debt_total || report.remainder || 0,
  };
}
function clientCabinetMoneyValue(value){
  return Number(value || 0);
}
function clientCabinetPaymentTitle(row={}){
  return row.title || row.target_title || row.request_title || row.service_title || 'Пункт Требника';
}
function clientTargetAction(type='request'){
  return type === 'service' ? 'service-detail' : 'request-detail';
}
function clientCabinetTopbarHtml(payload={}, activeTab=clientCabinetActiveTab()){
  const sourceState = payload ? trebnikSourceStateClass(payload) : 'is-warning';
  const tabs = clientCabinetTabsFor(payload || {});
  const splitAt = Math.ceil(tabs.length / 2);
  const links = tabs.map(([key,label]) => {
    return `<button class="plain trebnik-nav-link ${activeTab === key ? 'active' : ''}" data-action="client-cabinet-tab" data-tab="${attr(key)}" ${activeTab === key ? 'aria-current="page"' : ''}><span>${esc(label)}</span></button>`;
  });
  return `<div class="admin-trebnik__topbar client-cabinet-topbar">
    <nav class="client-map trebnik-nav-split client-cabinet-map" aria-label="Разделы Требника">
      <span class="trebnik-nav-side is-left">${links.slice(0, splitAt).join('')}</span>
      <span class="trebnik-nav-title ${sourceState}"><span>${esc(clientAreaName())}</span></span>
      <span class="trebnik-nav-side is-right">${links.slice(splitAt).join('')}</span>
    </nav>
  </div>`;
}
function clientCabinetMetaHtml(payload={}){
  const counts = payload.counts || {};
  const finance = clientCabinetFinanceSummary(payload);
  const items = [
    Number(finance.debt || 0) > 0 ? `${money(finance.debt || 0)} к оплате` : '',
    Number(counts.requests || 0) ? `${Number(counts.requests || 0)} ${ruPlural(Number(counts.requests || 0), 'запрос', 'запроса', 'запросов')}` : '',
    Number(counts.diagnostics || 0) ? `${Number(counts.diagnostics || 0)} ${ruPlural(Number(counts.diagnostics || 0), 'диагностика', 'диагностики', 'диагностик')}` : '',
    Number(counts.services || 0) ? `${Number(counts.services || 0)} ${ruPlural(Number(counts.services || 0), 'услуга', 'услуги', 'услуг')}` : '',
  ].filter(Boolean);
  return items.length ? `<div class="trebnik-client-meta">${items.map(item => `<span>${esc(item)}</span>`).join('')}</div>` : '';
}
function clientCabinetHeadActionsHtml(tab='now', preview=false){
  if(preview) return '<span class="client-readonly-note">предпросмотр</span>';
  return '';
}
function clientCabinetHtml(payload=null, preview=false){
  const tab = payload ? clientCabinetActiveTabFor(payload) : clientCabinetActiveTab();
  const tabClass = `is-client-${attr(tab)}`;
  if(!payload){
    return `<section class="admin-trebnik is-client-cabinet client-layout client-cabinet ${tabClass}" data-client-tab="${attr(tab)}">
      ${preview ? '<div class="preview-ribbon">Предпросмотр клиентского кабинета.</div>' : ''}
      ${clientCabinetTopbarHtml({}, tab)}
      <div class="client-cabinet-shell">
        <article class="trebnik-client-workspace client-cabinet-workspace is-busy">
          <header class="trebnik-client-head"><div class="trebnik-client-title"><h2>Открываю Требник</h2></div></header>
          <div class="trebnik-client-tab">${skeletonStack(['100%','92%','78%'])}</div>
        </article>
      </div>
    </section>`;
  }
  const headActions = clientCabinetHeadActionsHtml(tab, preview);
  return `<section class="admin-trebnik is-client-cabinet client-layout client-cabinet ${tabClass}" data-client-tab="${attr(tab)}">
    ${preview ? '<div class="preview-ribbon">Предпросмотр клиентского кабинета.</div>' : ''}
    ${clientCabinetTopbarHtml(payload, tab)}
    <div class="client-cabinet-shell">
      <article class="trebnik-client-workspace client-cabinet-workspace">
        <header class="trebnik-client-head">
          <div class="trebnik-client-title">
            <h2>${esc(payload.client?.name || clientAreaName())}</h2>
            ${clientCabinetMetaHtml(payload)}
          </div>
          ${headActions ? `<div class="trebnik-client-head__actions">${headActions}</div>` : ''}
        </header>
        <div class="trebnik-client-tab">${clientCabinetTabHtml(tab, payload, preview)}</div>
      </article>
    </div>
  </section>`;
}
function clientCabinetTabHtml(tab, payload, preview=false){
  tab = clientCabinetActiveTabFor(payload);
  if(tab === 'requests') return clientRequestsHtml(payload, preview);
  if(tab === 'diagnostics') return clientDiagnosticsHtml(payload, preview);
  if(tab === 'services') return clientServicesHtml(payload, preview);
  if(tab === 'payments') return clientPaymentsHtml(payload, preview);
  if(tab === 'updates') return clientUpdatesHtml(payload, preview);
  return clientNowHtml(payload, preview);
}
function clientSectionHeadHtml(title, action=''){
  return `<div class="trebnik-section-head"><h3>${esc(title)}</h3><div class="row">${action || ''}</div></div>`;
}
function clientCabinetStat(label, value){
  return `<span><b>${esc(value)}</b><em>${esc(label)}</em></span>`;
}
async function loadClientCabinetPayload(clientId){
  const [overview, actionSummary, financialReport, targets, updates] = await Promise.all([
    api(`/api/client/${clientId}/overview`),
    api(`/api/client/${clientId}/action-summary`),
    api(`/api/client/${clientId}/financial-report`),
    api(`/api/client/${clientId}/targets`),
    api(`/api/client/${clientId}/updates`),
  ]);
  const payload = {
    ...overview,
    action_summary: actionSummary.summary || actionSummary,
    financial_report: financialReport.report || financialReport,
    targets,
    updates: Array.isArray(updates.items) ? updates.items : [],
    revision: overview.revision ?? actionSummary.revision ?? financialReport.revision ?? targets.revision ?? updates.revision,
    trebnik_revision: overview.trebnik_revision ?? actionSummary.trebnik_revision ?? financialReport.trebnik_revision ?? targets.trebnik_revision ?? updates.trebnik_revision,
  };
  payload.active_request_details = await loadClientActiveRequestDetails(payload);
  return payload;
}
async function loadClientActiveRequestDetails(payload={}){
  const rows = clientActiveRequestRows(payload);
  if(!rows.length) return {};
  const entries = await Promise.allSettled(rows.map(async row => {
    const requestId = String(row.id || '');
    if(!requestId) return null;
    const [detail, workLogs] = await Promise.all([
      api(`/api/request/${requestId}`),
      api(`/api/request/${requestId}/work-logs`).catch(() => ({})),
    ]);
    return [requestId, {...detail, work_logs:workLogs}];
  }));
  return entries.reduce((acc, item) => {
    if(item.status === 'fulfilled' && item.value && item.value[0]) acc[item.value[0]] = item.value[1];
    return acc;
  }, {});
}
async function renderClientCabinet(clientId, preview=false){
  clientCabinetSyncUrlState();
  const ticket = state.renderSeq;
  state.clientCabinetPreview = Boolean(preview);
  state.clientAutoRefreshPromise = null;
  state.clientAutoRefreshAt = 0;
  app.innerHTML = clientCabinetHtml(null, preview);
  try{
    const payload = await loadClientCabinetPayload(clientId);
    if(ticket !== state.renderSeq || state.route !== 'trebnik') return;
    state.clientPayload = payload;
    clientCabinetWriteUrlState(payload);
    app.innerHTML = clientCabinetHtml(payload, preview);
  }catch(error){
    state.clientPayload = null;
    app.innerHTML = trebnikProblem(error);
  }
}
function setClientCabinetTab(tab='now'){
  state.clientCabinetTab = clientCabinetTabs.some(([key]) => key === tab) ? tab : 'now';
  if(state.route === 'trebnik' && state.clientPayload){
    state.clientCabinetTab = clientCabinetTabsFor(state.clientPayload).some(([key]) => key === state.clientCabinetTab) ? state.clientCabinetTab : 'now';
    clientCabinetWriteUrlState(state.clientPayload);
    app.innerHTML = clientCabinetHtml(state.clientPayload, clientCabinetIsPreview());
  }
}
async function loadClientTargetsLive(){
  const clientId = clientCabinetClientId() || (isAdmin() ? String(state.clientId || '') : '');
  if(!clientId) throw new Error('Клиент не выбран.');
  return await api(`/api/client/${clientId}/targets`);
}
async function refreshClientCabinetSilently(force=false){
  const clientId = clientCabinetClientId();
  if(!clientId || document.hidden) return;
  if(!force && Date.now() - Number(state.clientAutoRefreshAt || 0) < 18000) return;
  if(clientCabinetHasDraft()) return;
  if(state.clientAutoRefreshPromise) return state.clientAutoRefreshPromise;
  state.clientAutoRefreshAt = Date.now();
  state.clientAutoRefreshPromise = (async () => {
    const previousRevision = payloadRevision(state.clientPayload || {});
    const payload = await loadClientCabinetPayload(clientId);
    if(clientCabinetClientId() !== clientId || clientCabinetHasDraft()) return;
    const nextRevision = payloadRevision(payload);
    if(previousRevision !== '' && nextRevision !== '' && String(previousRevision) === String(nextRevision)){
      state.clientPayload = {...(state.clientPayload || {}), loaded_at:payload.loaded_at, revision:payload.revision, trebnik_revision:payload.trebnik_revision};
      paintClientCabinetLoadedAt(state.clientPayload);
      return;
    }
    state.clientPayload = payload;
    preservePageView(() => { app.innerHTML = clientCabinetHtml(payload, false); });
  })().catch(() => {}).finally(() => { state.clientAutoRefreshPromise = null; });
  return state.clientAutoRefreshPromise;
}
function clientNowHtml(payload, preview=false){
  const summary = clientCabinetActionSummary(payload);
  const payRows = Array.isArray(summary.pay_now_items) ? summary.pay_now_items : [];
  const waitRows = Array.isArray(summary.waiting_items) ? summary.waiting_items : [];
  const activeRequests = clientActiveRequestRows(payload);
  const activeServices = clientActiveServiceRows(payload);
  const payments = clientPaymentBoardItems(payload, {payRows, waitRows});
  const notifications = clientTrebnikNotifications(payload).filter(row => !row.read_at);
  const noticeRows = notifications.slice(0, 4).map(row => clientMainNotificationRow(row, preview, {showRead:false}));
  const visiblePayments = clientMainVisiblePaymentRows(payments.total, activeRequests, activeServices);
  const paymentRows = visiblePayments.slice(0, 4).map(row => clientPaymentActionRow(row, row.mode, preview, {context:'main'}));
  const serviceRows = activeServices.slice(0, 3).map(row => clientCurrentServiceRow(row, preview, {context:'main'}));
  const feedRows = [...noticeRows, ...paymentRows, ...serviceRows];
  const requestRows = activeRequests.length
    ? activeRequests.map(row => clientCurrentRequestCard(row, payload, preview)).join('')
    : clientMainEmpty('Сейчас активных запросов нет.');
  const feedAction = notifications.length && !preview ? '<button class="plain client-compact-action" data-action="client-trebnik-notification-read-all">Прочитать всё</button>' : '';
  const settingsAction = !preview ? '<button class="plain client-compact-action" data-action="client-notifications-settings">Уведомления</button>' : '';
  return `<div class="client-action-center client-home-dashboard client-home-dashboard-v3">
    <div class="client-main-layout ${feedRows.length ? '' : 'is-single'}">
      <section class="client-main-section is-requests">
        <div class="client-main-section__head"><h3>В работе</h3><div class="row">${settingsAction}</div></div>
        <div class="client-main-list">${requestRows}</div>
      </section>
      ${feedRows.length ? `<section class="client-main-section is-feed">
        <div class="client-main-section__head"><h3>Важное</h3><div class="row">${feedAction}</div></div>
        <div class="client-main-list">${feedRows.join('')}</div>
      </section>` : ''}
    </div>
  </div>`;
}
function clientMainSectionHtml(title='', body='', action='', mod=''){
  return `<section class="client-main-section ${mod ? `is-${attr(mod)}` : ''}">
    <div class="client-main-section__head"><h3>${esc(title)}</h3><div class="row">${action || ''}</div></div>
    <div class="client-main-list">${body || clientMainEmpty('Пока пусто.')}</div>
  </section>`;
}
function clientMainEmpty(text='Пока пусто.'){
  return `<p class="client-main-empty">${esc(text)}</p>`;
}
function clientCabinetMainCount(payload={}){
  const summary = clientCabinetActionSummary(payload);
  const payments = clientPaymentBoardItems(payload, {
    payRows:Array.isArray(summary.pay_now_items) ? summary.pay_now_items : [],
    waitRows:Array.isArray(summary.waiting_items) ? summary.waiting_items : [],
  });
  const activeRequests = clientActiveRequestRows(payload);
  const activeServices = clientActiveServiceRows(payload);
  const visiblePayments = clientMainVisiblePaymentRows(payments.total, activeRequests, activeServices);
  return activeRequests.length
    + Math.min(activeServices.length, 9)
    + Math.min(visiblePayments.length, 9)
    + Math.min(Number(payload.notification_unread_count || 0), 9);
}
function clientPaymentTargetKey(row={}){
  const rawType = row.entity_type || row.target_type || 'request';
  const type = String(rawType || '').toLowerCase() === 'service' ? 'service' : 'request';
  const id = String(row.entity_id || row.target_id || row.id || '').trim();
  return id ? `${type}:${id}` : '';
}
function clientMainVisiblePaymentRows(rows=[], activeRequests=[], activeServices=[]){
  const visibleKeys = new Set([
    ...activeRequests.map(row => `request:${String(row.id || '').trim()}`).filter(key => !key.endsWith(':')),
    ...activeServices.map(row => `service:${String(row.id || '').trim()}`).filter(key => !key.endsWith(':')),
  ]);
  return (Array.isArray(rows) ? rows : []).filter(row => {
    const key = clientPaymentTargetKey(row);
    return !key || !visibleKeys.has(key);
  });
}
function clientRequestIsClosed(row={}){
  return ['closed','done','cancelled','canceled','completed','archived'].includes(String(row.status || '').toLowerCase());
}
function clientRequestIsArchived(row={}){
  return Boolean(row.is_archived) || String(row.status || '').toLowerCase() === 'archived';
}
function clientSortRequestRows(rows=[]){
  return [...(Array.isArray(rows) ? rows : [])].sort((a,b) => {
    const openDelta = Number(clientRequestIsClosed(a)) - Number(clientRequestIsClosed(b));
    if(openDelta) return openDelta;
    return String(b.updated_at || b.created_at || b.id || '').localeCompare(String(a.updated_at || a.created_at || a.id || ''));
  });
}
function clientActiveRequestRows(payload={}){
  return clientSortRequestRows(clientCabinetRows(payload, 'requests')).filter(row => !clientRequestIsClosed(row) && !clientRequestIsArchived(row));
}
function clientActiveServiceRows(payload={}){
  return clientCabinetRows(payload, 'services').filter(row => !clientServiceClosed(row));
}
function clientRequestMoneySummaryText(row={}){
  const f = row.financials || {};
  const debt = Number(f.remainder || f.money_debt_total || 0);
  const pending = Number(f.pending || f.money_pending_total || 0);
  const future = Number(f.future_total || f.display_future_total || f.full_remainder || f.money_full_debt_total || 0);
  if(debt > 0) return `${money(debt)} к оплате`;
  if(pending > 0) return `${money(pending)} на проверке`;
  if(future > 0) return `${money(future)} предстоит`;
  return '';
}
function mobileTextSeparator(){
  try{
    return clientMobileViewport() ? '\u00A0\u00A0\u00A0' : ' · ';
  }catch(error){
    return ' · ';
  }
}
function clientMobileViewport(){
  try{
    return Boolean(window.matchMedia?.('(max-width: 920px)').matches);
  }catch(error){
    return false;
  }
}
function clientPhraseJoin(items=[], desktopSeparator=' · '){
  const separator = mobileTextSeparator().includes('\u00A0') ? '\u00A0\u00A0\u00A0' : desktopSeparator;
  return (Array.isArray(items) ? items : []).filter(Boolean).join(separator);
}
function clientPlainSeparators(text=''){
  return String(text || '').replace(/\s*[·•]\s*/g, mobileTextSeparator());
}
function clientCompactDate(value=''){
  const iso = inputDateValue(value || '');
  if(!iso) return '';
  const [y,m,d] = iso.split('-').map(Number);
  if(!y || !m || !d) return '';
  return `${String(d).padStart(2,'0')}.${String(m).padStart(2,'0')}.${String(y).slice(-2)}`;
}
function clientCompactNoticeDates(text=''){
  return String(text || '')
    .replace(/\b(\d{1,2})\.(\d{2})\.(\d{4})\s*[-–—]\s*(\d{1,2})\.(\d{2})\.(\d{4})\b/g, (_, d1, m1, y1, d2, m2, y2) => {
      const leftDay = String(Number(d1));
      const rightDay = String(Number(d2));
      const yy1 = String(y1).slice(-2);
      const yy2 = String(y2).slice(-2);
      return m1 === m2 && y1 === y2 ? `${leftDay}-${rightDay}.${m2}.${yy2}` : `${leftDay}.${m1}.${yy1}-${rightDay}.${m2}.${yy2}`;
    })
    .replace(/\b(\d{1,2})\.(\d{2})\.(\d{4})\b/g, (_, d, m, y) => `${String(Number(d)).padStart(2,'0')}.${m}.${String(y).slice(-2)}`)
    .replace(/\s*(?:[·•]\s*)?\d{1,2}\s+[а-яё]+\s+\d{4}\s*г?\.?,?\s*\d{1,2}:\d{2}\s*$/iu, '')
    .replace(/\s*,?\s*\d{1,2}:\d{2}\s*$/u, '')
    .trim();
}
function clientStatusTone(status=''){
  const key = String(status || '').toLowerCase();
  if(key.includes('оплачено') || key.includes('подтверж') || ['confirmed','paid'].includes(key)) return 'done';
  if(key.includes('просроч') || key.includes('отклон') || key.includes('отмен') || key.includes('останов') || ['overdue','rejected','cancelled','canceled','stopped'].includes(key)) return 'alert';
  if(key.includes('ждёт оплат') || key.includes('ждет оплат')) return 'pay-wait';
  if(key.includes('к оплат') || key.includes('оплатить') || ['pay','payment','due'].includes(key)) return 'pay-now';
  if(key.includes('провер') || key.includes('решен') || ['pending','new','wait','waiting'].includes(key)) return 'wait';
  if(key.includes('уведом')) return 'notice';
  if(key.includes('заплан') || key.includes('предстоит') || ['planned','upcoming','draft'].includes(key)) return 'planned';
  if(key.includes('заверш') || key.includes('выполн') || ['completed','done','closed'].includes(key)) return 'done';
  if(key.includes('актив') || ['active','processing','approved'].includes(key)) return 'active';
  return 'neutral';
}
function clientStatusSvg(tone='neutral'){
  const icons = {
    active:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/></svg>',
    planned:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6h4"/></svg>',
    done:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>',
    wait:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg>',
    'pay-now':'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>',
    'pay-wait':'<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2"/><path d="M3 11h3c.8 0 1.6.3 2.1.9l1.1.9c1.6 1.6 4.1 1.6 5.7 0l1.1-.9c.5-.5 1.3-.9 2.1-.9H21"/></svg>',
    notice:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/></svg>',
    alert:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    neutral:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/></svg>',
  };
  return icons[tone] || icons.neutral;
}
function clientStatusIcon(label='', tone='neutral'){
  return label ? `<span class="client-status-icon is-${attr(tone || 'neutral')}" title="${attr(label)}" aria-label="${attr(label)}" data-status-label="${attr(label)}">${clientStatusSvg(tone || 'neutral')}</span>` : '';
}
function clientStatusLine(label='', tone='neutral', detail=''){
  return `<span class="client-status-line">${clientStatusIcon(label, tone)}${detail ? `<em>${esc(detail)}</em>` : ''}</span>`;
}
function clientWorkCountNote(count=0){
  return count ? `<span class="client-work-count">${esc(`${count} ${ruPlural(count, 'активная работа', 'активные работы', 'активных работ')}`)}</span>` : '';
}
function clientCurrentRequestCard(row={}, payload={}, preview=false){
  const detail = clientRequestDetailFromPayload(row.id, payload);
  const activeWorks = clientActiveWorksForRequest(row, payload);
  const allWorks = clientWorksForRequest(row, payload);
  const activeWorksCount = activeWorks.length;
  const worksState = activeWorksCount ? '' : (allWorks.length ? 'активных работ сейчас нет' : 'работы пока не назначены');
  const meta = clientPhraseJoin([
    clientRequestMoneySummaryText(row),
    worksState,
  ]);
  const workCountBadge = clientWorkCountNote(activeWorksCount);
  const visibleWorks = activeWorks.slice(0, 5);
  const hiddenWorksCount = Math.max(0, activeWorksCount - visibleWorks.length);
  const workRows = activeWorks.length ? `<div class="client-main-request__works">
      <div class="client-main-work-list">${visibleWorks.map(work => clientMainWorkRow(work, detail?.work_logs?.logs_by_work_id?.[String(work.id)] || [])).join('')}</div>
      ${hiddenWorksCount ? `<p class="client-main-note">${hiddenWorksCount} ${ruPlural(hiddenWorksCount, 'активная работа', 'активные работы', 'активных работ')} ещё в запросе.</p>` : ''}
    </div>` : '';
  return `<article class="client-main-request ${activeWorks.length ? 'has-active-works' : 'is-without-works'}" data-action="client-open-request" data-id="${attr(row.id)}">
    <div class="client-main-request__summary">
      <button class="client-main-request__title" data-action="client-open-request" data-id="${attr(row.id)}">
        <span class="client-main-request__title-line"><strong>${esc(row.title || 'Запрос')}</strong>${workCountBadge}</span>
        ${row.goal ? `<span class="client-main-request__description">${esc(row.goal)}</span>` : ''}
      </button>
      ${meta ? `<p class="client-main-request__meta">${esc(meta)}</p>` : ''}
    </div>
    ${workRows}
  </article>`;
}
function clientRequestDetailFromPayload(id='', payload={}){
  return payload.active_request_details?.[String(id || '')] || null;
}
function clientActiveWorksForRequest(row={}, payload={}){
  return clientWorksForRequest(row, payload)
    .filter(work => !clientWorkIsClosed(work))
    .sort((a,b) => String(clientWorkMainDate(a) || '9999-12-31').localeCompare(String(clientWorkMainDate(b) || '9999-12-31')) || String(a.title || '').localeCompare(String(b.title || ''), 'ru'));
}
function clientWorksForRequest(row={}, payload={}){
  const detail = clientRequestDetailFromPayload(row.id, payload);
  const works = Array.isArray(detail?.works) ? detail.works : [];
  return [...works].sort(clientWorkFeedSort);
}
function clientWorkFeedSort(a={}, b={}){
  const created = String(b.created_at || b.createdAt || '').localeCompare(String(a.created_at || a.createdAt || ''));
  if(created) return created;
  const bId = Number(b.id || 0);
  const aId = Number(a.id || 0);
  if(Number.isFinite(bId) && Number.isFinite(aId) && bId !== aId) return bId - aId;
  return String(clientWorkMainDate(b) || '').localeCompare(String(clientWorkMainDate(a) || '')) || String(a.title || '').localeCompare(String(b.title || ''), 'ru');
}
function clientWorkIsClosed(work={}){
  return ['closed','done','cancelled','canceled','completed'].includes(String(work.status || '').toLowerCase());
}
function clientWorkMainDate(work={}){
  return inputDateValue(work.next_due || work.expected_first_result || work.expected_final_result);
}
function clientMainWorkRow(work={}, logs=[]){
  const status = work.status || 'planned';
  const meta = clientPhraseJoin([clientWorkTermRange(work), clientWorkProgressText(work, logs)]);
  return `<article class="client-main-work">
    <div class="trebnik-work-main"><strong>${esc(clientReadableWorkTitle(work.title || 'Работа'))}</strong>${clientStatusLine(statusName(status), clientStatusTone(status), meta || workTypeName(work.type || ''))}</div>
  </article>`;
}
function clientCurrentWorkRow(work={}, logs=[], preview=false, requestId=''){
  const status = work.status || 'planned';
  const meta = clientPhraseJoin([clientWorkTermRange(work), clientWorkProgressText(work, logs)]);
  return `<article class="trebnik-inline-row is-work client-current-work">
    <div class="trebnik-work-main"><strong>${esc(clientReadableWorkTitle(work.title || 'Работа'))}</strong>${clientStatusLine(statusName(status), clientStatusTone(status), meta || workTypeName(work.type || ''))}</div>
    <div class="trebnik-inline-actions">${!preview ? `<button class="plain" data-action="payment-receipt" data-target-type="request" data-target-id="${attr(requestId)}" data-work-id="${attr(work.id || '')}">Платёж</button>` : ''}</div>
  </article>`;
}
function clientReadableWorkTitle(title=''){
  const text = String(title || '').trim();
  if(!text) return 'Работа';
  const hasLetters = /[A-ZА-ЯЁ]/.test(text);
  const upper = text.toLocaleUpperCase('ru-RU');
  if(hasLetters && text === upper && text.length > 3){
    const lower = text.toLocaleLowerCase('ru-RU');
    return lower.replace(/^(\s*)([a-zа-яё])/, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase('ru-RU')}`);
  }
  return text;
}
function clientInlineEmpty(text='Пока пусто.'){
  return `<p class="trebnik-inline-empty">${esc(text)}</p>`;
}
function clientCurrentServiceRow(row={}, preview=false, options={}){
  const f = row.financials || {};
  const now = serviceAmountNow(row, f);
  const future = serviceFutureAmount(row, f);
  const status = clientServiceStatusParts(row, f);
  const meta = clientPhraseJoin([status.detail, now > 0 ? money(now) : (future > 0 ? money(future) : '')]);
  const showActions = options.context !== 'main';
  const actions = showActions && !preview && now > 0 ? `<button class="secondary client-main-row-action" data-action="payment-receipt" data-target-type="service" data-target-id="${attr(row.id)}">Отметить оплату</button>` : '';
  return `<div class="client-action-row is-service ${actions ? 'has-actions' : ''}">
    <button class="client-action-row__main" data-action="client-open-service" data-id="${attr(row.id)}">
      <strong>${esc(row.title || 'Услуга')}</strong>
      ${clientStatusLine(status.label, status.tone, meta)}
    </button>
    ${actions ? `<div class="client-action-row__actions">${actions}</div>` : ''}
  </div>`;
}
function clientServiceStatusParts(row={}, f={}){
  const now = serviceAmountNow(row, f);
  const future = serviceFutureAmount(row, f);
  const due = serviceDueValue(row, f);
  const paidThrough = row.paid_through_until || row.last_paid_period_end || '';
  if(now > 0 && serviceIsOverdue(row, f)){
    const after = serviceDatePlusDays(due, 1);
    return {label:'просрочено', tone:'alert', detail:after ? `с ${dateLong(after)}` : ''};
  }
  if(now > 0) return {label:'ждёт оплату', tone:'pay-wait', detail:due ? `до ${dateLong(due)}` : ''};
  if(paidThrough) return {label:'оплачено', tone:'done', detail:`до ${dateLong(paidThrough)}`};
  if(future > 0) return {label:'предстоит', tone:'planned', detail:due ? `до ${dateLong(due)}` : ''};
  const label = row.state_label || statusName(row.status || 'active');
  return {label, tone:clientStatusTone(label || row.status), detail:''};
}
function clientMainNotificationRow(row={}, preview=false, options={}){
  const read = options.showRead !== false && !preview ? `<button class="secondary client-main-row-action" data-action="client-trebnik-notification-read" data-id="${attr(row.id)}">Прочитано</button>` : '';
  const noticeDate = clientCompactDate(row.updated_at || row.created_at);
  const noticeBody = clientPlainSeparators(clientCompactNoticeDates(row.body || ''));
  const canOpen = !preview && clientNoticeHasHiddenDetail(row, noticeBody);
  const mainTag = canOpen ? 'button' : 'div';
  const mainAttrs = canOpen ? `type="button" data-action="client-trebnik-notification-detail" data-id="${attr(row.id || '')}"` : '';
  return `<div class="client-action-row is-notice ${read ? 'has-actions' : ''}">
    <${mainTag} class="client-action-row__main" ${mainAttrs}>
      <span class="client-notice-row__head"><strong>${esc(row.title || 'Уведомление')}</strong>${noticeDate ? `<em>${esc(noticeDate)}</em>` : ''}</span>
      ${clientStatusLine('уведомление', 'notice', noticeBody)}
    </${mainTag}>
    ${read ? `<div class="client-action-row__actions">${read}</div>` : ''}
  </div>`;
}
function clientNoticeIsWorkLog(row={}){
  const kind = String(row.kind || '').toLowerCase();
  const title = String(row.title || '').toLocaleLowerCase('ru-RU');
  return kind === 'work_log' || title.includes('проведение отмеч') || title.includes('проведения отмеч');
}
function clientNoticeHasHiddenDetail(row={}, visibleBody=''){
  if(clientNoticeIsWorkLog(row)) return false;
  const body = clientPlainSeparators(row.body || '').trim();
  if(!body) return false;
  return body.length > 90 || body.includes('\n');
}
function clientTrebnikNotificationDetailModal(id=''){
  const row = clientTrebnikNotifications(state.clientPayload || {}).find(item => String(item.id || '') === String(id || ''));
  if(!row || clientNoticeIsWorkLog(row)) return;
  const body = clientPlainSeparators(row.body || '').trim();
  if(!body) return;
  const date = clientCompactDate(row.updated_at || row.created_at);
  openModal(row.title || 'Уведомление', `<div class="detail client-notice-detail">
    ${date ? `<p class="subtle">${esc(date)}</p>` : ''}
    <div class="client-request-full-text">${esc(body)}</div>
  </div>`, {compact:true, kind:'client-notice-detail'});
}
function clientPaymentBoardItems(payload={}, context={}){
  const summary = clientCabinetActionSummary(payload);
  const payRows = Array.isArray(context.payRows) ? context.payRows : (Array.isArray(summary.pay_now_items) ? summary.pay_now_items : []);
  const waitRows = Array.isArray(context.waitRows) ? context.waitRows : (Array.isArray(summary.waiting_items) ? summary.waiting_items : []);
  const waitingPayments = waitRows.filter(row => String(row.kind || '').includes('payment'));
  const upcoming = clientUpcomingPaymentRows(payload, [...payRows, ...waitingPayments]);
  return {
    payNow: payRows.map(row => ({...row, mode:'pay'})),
    waiting: waitingPayments.map(row => ({...row, mode:'wait'})),
    upcoming: upcoming.map(row => ({...row, mode:'upcoming'})),
    total: [
      ...payRows.map(row => ({...row, mode:'pay'})),
      ...waitingPayments.map(row => ({...row, mode:'wait'})),
      ...upcoming.map(row => ({...row, mode:'upcoming'})),
    ],
  };
}
function clientUpcomingPaymentRows(payload={}, excluded=[]){
  const excludedKeys = new Set(excluded.map(row => `${row.entity_type || row.target_type || 'request'}:${row.entity_id || row.target_id || row.id || ''}`));
  const rows = [];
  clientCabinetRows(payload, 'requests').forEach(row => {
    const f = row.financials || {};
    const id = row.id || '';
    const key = `request:${id}`;
    const future = Number(f.future_total || f.display_future_total || 0);
    const debt = Number(f.remainder || f.money_debt_total || 0);
    const pending = Number(f.pending || f.money_pending_total || 0);
    if(id && future > 0 && debt <= 0 && pending <= 0 && !excludedKeys.has(key)){
      rows.push({kind:'request_payment_future', entity_type:'request', entity_id:id, title:row.title || 'Запрос', amount:future, due_until:row.display_due_until || row.due_until || '', mode:'upcoming'});
    }
  });
  clientCabinetRows(payload, 'services').forEach(row => {
    const f = row.financials || {};
    const id = row.id || '';
    const key = `service:${id}`;
    const future = serviceFutureAmount(row, f);
    const debt = serviceAmountNow(row, f);
    const pending = Number(f.pending || f.money_pending_total || 0);
    if(id && future > 0 && debt <= 0 && pending <= 0 && !excludedKeys.has(key)){
      rows.push({kind:'service_payment_future', entity_type:'service', entity_id:id, title:row.title || 'Услуга', amount:future, due_until:serviceDueValue(row, f), mode:'upcoming'});
    }
  });
  return rows.sort((a,b) => String(a.due_until || '9999-12-31').localeCompare(String(b.due_until || '9999-12-31')));
}
function clientPaymentActionRow(row={}, mode='pay', preview=false, options={}){
  const type = row.entity_type || row.target_type || 'request';
  const id = row.entity_id || row.target_id || row.id || '';
  const amount = Number(row.amount || row.debt || 0);
  const action = type === 'service' ? 'client-open-service' : 'client-open-request';
  const label = mode === 'wait' ? 'на проверке' : (mode === 'upcoming' ? 'предстоит' : 'к оплате');
  const tone = mode === 'wait' ? 'wait' : (mode === 'upcoming' ? 'planned' : 'pay-now');
  const detail = clientPhraseJoin([type === 'service' ? 'Услуга' : 'Запрос', amount > 0 ? money(amount) : '', row.due_until ? dateLong(row.due_until) : '']);
  const showActions = options.context !== 'main';
  const payButton = showActions && !preview && mode === 'pay' && id ? `<button class="secondary client-main-row-action" data-action="payment-receipt" data-target-type="${attr(type)}" data-target-id="${attr(id)}">Отметить оплату</button>` : '';
  return `<div class="client-action-row is-${attr(mode)} ${payButton ? 'has-actions' : ''}">
    <button class="client-action-row__main" data-action="${attr(action)}" data-id="${attr(id)}">
      <strong>${esc(clientCabinetPaymentTitle(row))}</strong>
      ${clientStatusLine(label, tone, detail)}
    </button>
    ${payButton ? `<div class="client-action-row__actions">${payButton}</div>` : ''}
  </div>`;
}
function clientTrebnikNotifications(payload={}){
  return Array.isArray(payload.notifications) ? payload.notifications : [];
}
async function clientTrebnikNotificationRead(id=''){
  if(!clientCabinetCanWrite()) return;
  try{
    await api('/api/client/notifications/read', {method:'POST', body:{id, client_id:trebnikClientId()}});
    const payload = await loadClientCabinetPayload(trebnikClientId());
    state.clientPayload = payload;
    app.innerHTML = clientCabinetHtml(payload, false);
  }catch(error){ say(error.message || 'Не удалось отметить уведомление.', 'danger'); }
}
async function clientTrebnikNotificationReadAll(){
  await clientTrebnikNotificationRead('');
}
function clientRequestsHtml(payload, preview=false){
  const rows = clientSortRequestRows(clientCabinetRows(payload, 'requests'));
  const active = clientActiveRequest(rows, payload);
  if(!rows.length){
    return `<div class="trebnik-request-empty"><span>Запросов пока нет.</span></div>`;
  }
  return `<div class="trebnik-request-workbench">
    <aside class="trebnik-request-master" aria-label="Запросы">
      <div class="trebnik-request-master__list">${rows.map(row => clientRequestMasterRow(row, active)).join('')}</div>
    </aside>
    <section class="trebnik-request-detail-pane">${active ? clientRequestDetailPane(active, payload, preview) : clientEmptyDetail('Выберите запрос')}</section>
  </div>`;
}
function clientActiveRequest(rows=[], payload={}){
  const current = rows.find(row => String(row.id) === String(state.clientCabinetRequestId || ''));
  const active = current
    || rows.find(row => !clientRequestIsArchived(row) && clientRequestActiveWorkCount(row, payload) > 0)
    || rows.find(row => !clientRequestIsArchived(row))
    || rows[0]
    || null;
  if(active) state.clientCabinetRequestId = String(active.id || '');
  return active;
}
function clientRequestActiveWorkCount(row={}, payload={}){
  const detail = clientRequestDetailFromPayload(row.id, payload);
  if(Array.isArray(detail?.works)) return detail.works.filter(work => !clientWorkIsClosed(work)).length;
  return Number(row.active_works_count || row.open_works_count || row.works_active_count || row.works_count || 0);
}
function clientRequestMasterRow(row={}, active=null){
  const selected = active && String(active.id) === String(row.id);
  const worksCount = Number(row.works_count || 0);
  const meta = [
    typeof requestStatusName === 'function' ? requestStatusName(row.status || 'planned') : statusName(row.status || 'planned'),
    worksCount ? `${worksCount} ${ruPlural(worksCount, 'работа', 'работы', 'работ')}` : '',
    clientRequestMoneySummaryText(row),
  ].filter(Boolean);
  return `<button class="trebnik-request-master__item ${selected ? 'active' : ''}" data-action="client-request-select" data-id="${attr(row.id)}" aria-pressed="${selected ? 'true' : 'false'}">
    <span class="trebnik-request-master__copy">
      <strong>${esc(row.title || 'Запрос')}</strong>
      ${row.goal ? `<span>${esc(short(row.goal, 92))}</span>` : ''}
      ${trebnikChips(meta)}
    </span>
  </button>`;
}
function clientRequestDetailPane(row={}, payload={}, preview=false){
  const detail = clientRequestDetailFor(row, payload);
  if(!detail){
    clientLoadRequestDetail(row.id);
    return `<article class="trebnik-request-detail client-request-detail">${loading('Открываю запрос…')}</article>`;
  }
  const r = detail.request || row;
  const f = detail.financials || row.financials || {};
  const works = Array.isArray(detail.works) ? detail.works : [];
  const updates = Array.isArray(detail.updates) ? detail.updates : [];
  const payments = Array.isArray(detail.payments) ? detail.payments : [];
  const diagnostics = Array.isArray(detail.diagnostics) ? detail.diagnostics : [];
  const recommendations = Array.isArray(detail.recommendations) ? detail.recommendations : [];
  const logsByWork = detail.work_logs?.logs_by_work_id || {};
  const counts = {works:works.length, updates:updates.length, payments:payments.length, diagnostics:diagnostics.length, recommendations:recommendations.length};
  const lists = {works, updates, payments, diagnostics, recommendations, logsByWork, financials:f};
  return `<article class="trebnik-request-detail client-request-detail">
    ${clientRequestInlineMoney({...r, financials:f})}
    ${clientRequestPaneTabs(counts)}
    <div class="trebnik-request-pane-body">${clientRequestPaneBody(r, lists, preview)}</div>
  </article>`;
}
function clientRequestDetailFor(row={}, payload={}){
  const requestId = String(row.id || '');
  if(state.clientCabinetRequestDetailId === requestId) return state.clientCabinetRequestDetail;
  return clientRequestDetailFromPayload(requestId, payload);
}
function clientRequestMetric(label, value, mod=''){
  if(value === undefined || value === null || String(value).trim() === '') return '';
  return `<span class="${mod ? `is-${attr(mod)}` : ''}"><em>${esc(label)}</em><strong>${esc(value)}</strong></span>`;
}
function clientRequestInlineMoney(row={}){
  const f = row.financials || row || {};
  const total = Number(f.total || f.money_total || 0);
  const paid = Number(f.paid || f.money_paid_total || 0);
  const pending = Number(f.pending || f.money_pending_total || 0);
  const debt = Number(f.remainder || f.money_debt_total || 0);
  const future = Number(f.future_total || f.display_future_total || 0);
  const fullDebt = Number(f.full_remainder || f.money_full_debt_total || debt + future || 0);
  const paymentLabel = pending > 0 ? 'На проверке' : (debt > 0 || future > 0 || fullDebt > 0 ? 'К оплате' : 'Оплата');
  const paymentValue = pending > 0 ? money(pending) : (debt > 0 ? money(debt) : (future > 0 || fullDebt > 0 ? money(future || fullDebt) : (total > 0 ? 'закрыта' : 'не указана')));
  const paymentMod = pending > 0 ? 'wait' : (debt > 0 ? 'alert' : (future > 0 || fullDebt > 0 ? 'wait' : ''));
  const cells = [
    clientRequestMetric('Сумма', total > 0 ? money(total) : 'не указана'),
    clientRequestMetric('Оплачено', money(paid)),
    clientRequestMetric(paymentLabel, paymentValue, paymentMod),
  ].filter(Boolean).join('');
  return cells ? `<div class="trebnik-request-ledger is-client-money">${cells}</div>` : '';
}
function clientRequestSection(title, actionHtml='', bodyHtml='', mod=''){
  const head = title || actionHtml ? `<div class="trebnik-request-section__head">${title ? `<h3>${esc(title)}</h3>` : '<span></span>'}<div>${actionHtml}</div></div>` : '';
  return `<section class="trebnik-request-section ${mod ? `is-${attr(mod)}` : ''}">
    ${head}
    <div class="trebnik-request-section__body">${bodyHtml || clientInlineEmpty('Пока нет.')}</div>
  </section>`;
}
function clientRequestPaneTabs(counts={}){
  const tabs = [
    ['works','Работы', counts.works || 0],
    ['diagnostics','Диагностики', counts.diagnostics || 0],
    ['updates','Апдейты', counts.updates || 0],
    ['recommendations','Рекомендации', counts.recommendations || 0],
    ['payments','Оплаты', counts.payments || 0],
  ];
  if(!clientRequestPanes.includes(state.clientCabinetRequestPane)) state.clientCabinetRequestPane = 'works';
  return `<nav class="trebnik-request-panes" aria-label="Что открыть в запросе">
    ${tabs.map(([key,label,count]) => `<button class="plain ${state.clientCabinetRequestPane === key ? 'active' : ''}" data-action="client-request-pane" data-pane="${attr(key)}" aria-selected="${state.clientCabinetRequestPane === key ? 'true' : 'false'}">
      <span>${esc(label)}</span>${count !== '' ? `<em>${esc(count)}</em>` : ''}
    </button>`).join('')}
  </nav>`;
}
function clientRequestPaneBody(request={}, lists={}, preview=false){
  const panes = {
    works: () => clientRequestWorksBody(request, lists.works || [], lists.logsByWork || {}, preview),
    updates: () => clientRequestUpdatesBody(request, lists.updates || [], preview),
    payments: () => clientRequestPaymentsBody(request, lists.payments || [], lists.financials || {}, preview),
    diagnostics: () => clientRequestSimpleRowsBody('Диагностики', (lists.diagnostics || []).map(clientRequestDiagnosticLine).join(''), 'diagnostics'),
    recommendations: () => clientRequestSimpleRowsBody('Рекомендации', (lists.recommendations || []).map(clientRequestRecommendationLine).join(''), 'recommendations'),
  };
  return (panes[state.clientCabinetRequestPane] || panes.works)();
}
function clientRequestWorksBody(request={}, works=[], logsByWork={}, preview=false){
  const items = [...works].sort(clientWorkFeedSort).map(work => clientRequestWorkLine(work, logsByWork[String(work.id)] || [], preview, request.id)).join('');
  return clientRequestSection('', '', items, 'main works');
}
function clientRequestUpdatesBody(request={}, updates=[], preview=false){
  const action = !preview ? `<button class="secondary" data-action="client-message" data-kind="update" data-target-type="request" data-target-id="${attr(request.id || '')}">Написать апдейт</button>` : '';
  const rows = [...updates].sort((a,b) => String(b.created_at || b.id || '').localeCompare(String(a.created_at || a.id || '')));
  return clientRequestSection('', action, rows.map((row, index) => clientRequestUpdateLine(row, index)).join(''), 'main updates');
}
function clientRequestPaymentsBody(request={}, payments=[], financials={}, preview=false){
  const debt = Number(financials.remainder || financials.money_debt_total || financials.debt || 0);
  const action = !preview && debt > 0 ? `<button class="secondary" data-action="payment-receipt" data-target-type="request" data-target-id="${attr(request.id || '')}">Отметить платёж</button>` : '';
  const rows = [...payments].sort((a,b) => String(b.created_at || b.confirmed_at || b.id || '').localeCompare(String(a.created_at || a.confirmed_at || a.id || '')));
  return clientRequestSection('', action, rows.map((row, index) => clientRequestPaymentLine(row, index)).join(''), 'main payments');
}
function clientRequestSimpleRowsBody(title='', rowsHtml='', mod=''){
  return clientRequestSection('', '', rowsHtml, `main ${mod}`);
}
function clientRequestUpdateLine(row={}){
  const author = clientUpdateAuthor(row);
  const index = Number(arguments[1] || 0);
  const id = row.id || row.update_id || '';
  const attachmentsCount = Number(row.attachments_count || (Array.isArray(row.attachments) ? row.attachments.length : 0) || 0);
  const meta = clientPhraseJoin([clientUpdateShortDateTime(row.created_at), author, attachmentsCount > 0 ? (attachmentsCount === 1 ? 'фото' : `фото ${attachmentsCount}`) : '']);
  return `<article class="trebnik-inline-row is-client-update">
    <button class="trebnik-inline-open" data-action="client-update-detail" data-id="${attr(id)}" data-index="${attr(index)}">
      <strong>${esc(meta || 'Апдейт')}</strong>
      <span>${esc(short(row.text || '', 220) || 'без текста')}</span>
    </button>
    <div class="trebnik-inline-actions"></div>
  </article>`;
}
function clientAllUpdateRows(payload=state.clientPayload || {}){
  const rows = clientCabinetRows(payload, 'updates');
  const fallback = rows.length ? rows : (Array.isArray(payload.recent_updates) ? payload.recent_updates : []);
  return [...fallback].sort((a,b) => String(b.created_at || b.updated_at || b.id || '').localeCompare(String(a.created_at || a.updated_at || a.id || '')));
}
function clientUpdateTargetType(row={}){
  const raw = row.target_type || (row.service_id ? 'service' : (row.request_id ? 'request' : ''));
  return String(raw || '').toLowerCase() === 'service' ? 'service' : (raw ? 'request' : '');
}
function clientUpdateTargetId(row={}){
  return row.target_id || row.entity_id || row.request_id || row.service_id || '';
}
function clientUpdateTargetTitle(row={}){
  return row.target_title || row.request_title || row.service_title || '';
}
function clientUpdateTargetLabel(row={}){
  const type = clientUpdateTargetType(row);
  const title = clientUpdateTargetTitle(row);
  if(!type || !title) return '';
  return `${type === 'service' ? 'Услуга' : 'Запрос'}: ${title}`;
}
function clientUpdatesHtml(payload={}, preview=false){
  const rows = clientAllUpdateRows(payload);
  const countText = rows.length ? `${rows.length} ${ruPlural(rows.length, 'запись', 'записи', 'записей')}` : '';
  const action = !preview ? `<button class="secondary client-compact-action" data-action="client-message" data-kind="update">Написать апдейт</button>` : '';
  return `<section class="client-updates-feed">
    <div class="client-updates-toolbar"><span>${esc(countText)}</span><div class="row">${action}</div></div>
    <div class="client-updates-list">${rows.map((row, index) => clientUpdateFeedRow(row, index)).join('') || clientMainEmpty('Апдейтов пока нет.')}</div>
  </section>`;
}
function clientUpdateFeedRow(row={}, index=0){
  const id = row.id || row.update_id || '';
  const author = clientUpdateAuthor(row);
  const attachmentsCount = Number(row.attachments_count || (Array.isArray(row.attachments) ? row.attachments.length : 0) || 0);
  const meta = clientPhraseJoin([clientUpdateShortDateTime(row.created_at || row.updated_at), author, attachmentsCount > 0 ? (attachmentsCount === 1 ? 'фото' : `фото ${attachmentsCount}`) : '']);
  const targetType = clientUpdateTargetType(row);
  const targetId = clientUpdateTargetId(row);
  const targetLabel = clientUpdateTargetLabel(row);
  const targetAction = targetType === 'service' ? 'client-open-service' : 'client-open-request';
  const target = targetLabel
    ? (targetId ? `<button class="plain client-update-target" data-action="${attr(targetAction)}" data-id="${attr(targetId)}">${esc(targetLabel)}</button>` : `<span class="client-update-target">${esc(targetLabel)}</span>`)
    : '';
  return `<article class="client-update-feed-row">
    <button class="client-update-feed-main" data-action="client-update-detail" data-id="${attr(id)}" data-index="${attr(index)}">
      <strong>${esc(meta || 'Апдейт')}</strong>
      <span>${esc(short(row.text || '', 260) || 'без текста')}</span>
    </button>
    <div class="client-update-feed-actions">${target}</div>
  </article>`;
}
function clientFindClientUpdateItem(id='', index=''){
  const rows = clientAllUpdateRows(state.clientPayload || {});
  const itemId = String(id || '');
  if(itemId){
    const found = rows.find(row => String(row.id || row.update_id || '') === itemId);
    if(found) return found;
  }
  const rowIndex = Number(index);
  return Number.isInteger(rowIndex) && rowIndex >= 0 ? rows[rowIndex] : null;
}
function clientRequestPaymentLine(row={}){
  const pending = Number(row.confirmed || 0) !== 1 && String(row.status || '') !== 'confirmed';
  const index = Number(arguments[1] || 0);
  const id = row.id || row.payment_id || '';
  return `<article class="trebnik-inline-row is-client-payment">
    <button class="trebnik-inline-open" data-action="client-payment-detail" data-id="${attr(id)}" data-index="${attr(index)}">
      <strong>${money(row.amount || 0)}</strong>
      <span>${esc(clientPhraseJoin([pending ? 'на проверке' : 'подтверждён', clientShortDateTime(row.created_at), row.work_title || '']))}</span>
    </button>
    <div class="trebnik-inline-actions"></div>
  </article>`;
}
function clientShortDateTime(value=''){
  if(!value) return '';
  const d = new Date(String(value).replace(' ', 'T'));
  if(Number.isNaN(d.getTime())) return String(value);
  const day = d.getDate();
  const month = monthNamesRu[d.getMonth()] || '';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month}, ${hours}:${minutes}`;
}
function clientUtcDate(value=''){
  if(!value) return null;
  const raw = String(value).trim();
  const normalized = raw.replace(' ', 'T');
  const hasExplicitZone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(normalized);
  const d = new Date(hasExplicitZone ? normalized : `${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function clientUpdateShortDateTime(value=''){
  const d = clientUtcDate(value);
  if(!d) return value ? String(value) : '';
  const parts = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}`;
}
function clientUpdateFullDateTime(value=''){
  const d = clientUtcDate(value);
  return d ? d.toLocaleString('ru-RU', {dateStyle:'medium', timeStyle:'short', timeZone:'Europe/Moscow'}) : (value ? String(value) : '');
}
function clientFullDateTime(value=''){
  return value ? time(value) : '';
}
function clientCurrentRequestDetail(){
  const requestId = String(state.clientCabinetRequestId || '');
  if(!requestId) return null;
  if(state.clientCabinetRequestDetailId === requestId && state.clientCabinetRequestDetail) return state.clientCabinetRequestDetail;
  return clientRequestDetailFromPayload(requestId, state.clientPayload || {});
}
function clientSortedRequestItems(key='updates'){
  const detail = clientCurrentRequestDetail() || {};
  const rows = Array.isArray(detail[key]) ? detail[key] : [];
  if(key === 'payments') return [...rows].sort((a,b) => String(b.created_at || b.confirmed_at || b.id || '').localeCompare(String(a.created_at || a.confirmed_at || a.id || '')));
  return [...rows].sort((a,b) => String(b.created_at || b.id || '').localeCompare(String(a.created_at || a.id || '')));
}
function clientFindRequestItem(key='', id='', index=''){
  const rows = clientSortedRequestItems(key);
  const itemId = String(id || '');
  if(itemId){
    const found = rows.find(row => String(row.id || row.update_id || row.payment_id || '') === itemId);
    if(found) return found;
  }
  const rowIndex = Number(index);
  return Number.isInteger(rowIndex) && rowIndex >= 0 ? rows[rowIndex] : null;
}
function clientUpdateAuthor(row={}){
  const rawAuthor = String(row.author || row.direction || '').toLowerCase();
  if(rawAuthor === 'client' || rawAuthor === 'out') return 'вы';
  if(['admin','master','operator','in'].includes(rawAuthor)) return 'мастер';
  return '';
}
function clientUpdateAttachmentsHtml(row={}){
  const items = Array.isArray(row.attachments) ? row.attachments.filter(item => item && item.url) : [];
  if(!items.length) return '';
  return `<section class="trebnik-update-attachments"><h3>Фото</h3><div class="trebnik-update-attachments__grid">${items.map((item, index) => `<button class="trebnik-update-attachment" type="button" data-action="image-lightbox" data-image-url="${attr(item.url)}" data-image-alt="${attr(`Вложение ${index + 1}`)}"><img src="${attr(item.url)}" alt="${attr(`Вложение ${index + 1}`)}" loading="lazy" decoding="async"></button>`).join('')}</div></section>`;
}
function clientRequestUpdateModal(id='', index=''){
  const row = clientCabinetActiveTab() === 'updates'
    ? clientFindClientUpdateItem(id, index)
    : (clientFindRequestItem('updates', id, index) || clientFindClientUpdateItem(id, ''));
  if(!row){
    openModal('Апдейт', problem('Не удалось открыть апдейт.'), {compact:true});
    return;
  }
  const meta = clientPhraseJoin([clientUpdateFullDateTime(row.created_at), clientUpdateAuthor(row)]);
  const target = clientUpdateTargetLabel(row);
  openModal(isClientQuestionKind(row.kind) ? 'Вопрос' : 'Апдейт', `<div class="detail trebnik-detail-modal client-request-modal-detail">
    ${meta ? `<p class="subtle">${esc(meta)}</p>` : ''}
    ${target ? `<p class="subtle">${esc(target)}</p>` : ''}
    <div class="client-request-full-text">${esc(row.text || 'Текст не указан.')}</div>
    ${clientUpdateAttachmentsHtml(row)}
  </div>`, {wide:true, kind:'trebnik-update-detail'});
}
function clientRequestPaymentModal(id='', index=''){
  const row = clientFindRequestItem('payments', id, index);
  if(!row){
    openModal('Оплата', problem('Не удалось открыть оплату.'), {compact:true});
    return;
  }
  const pending = Number(row.confirmed || 0) !== 1 && String(row.status || '') !== 'confirmed';
  const meta = clientPhraseJoin([
    pending ? 'на проверке' : 'подтверждена',
    clientFullDateTime(row.created_at),
    row.work_title || '',
  ]);
  const text = row.text || row.comment || row.note || '';
  openModal('Оплата', `<div class="detail trebnik-detail-modal client-request-modal-detail">
    <div class="client-request-payment-total"><em>Сумма</em><strong>${money(row.amount || 0)}</strong></div>
    ${meta ? `<p class="subtle">${esc(meta)}</p>` : ''}
    ${text ? `<div class="client-request-full-text">${esc(text)}</div>` : ''}
  </div>`, {compact:true, kind:'trebnik-detail'});
}
function clientRequestDiagnosticLine(row={}){
  const index = Number(arguments[1] || 0);
  const id = row.id || row.diagnostic_id || '';
  const meta = diagnosticMetaParts(row, {includeWork:true}).join(' · ');
  return `<article class="trebnik-inline-row is-client-diagnostic">
    <button class="trebnik-inline-open" data-action="client-diagnostic-detail" data-id="${attr(id)}" data-index="${attr(index)}">
      <strong>${esc(row.title || 'Диагностика')}</strong>
      ${row.findings ? `<span>${esc(short(row.findings, 160))}</span>` : (meta ? `<span>${esc(meta)}</span>` : '')}
    </button>
    <div class="trebnik-inline-actions"></div>
  </article>`;
}
function clientRequestDiagnosticModal(id='', index=''){
  const row = clientFindRequestItem('diagnostics', id, index)
    || clientDiagnosticRows(state.clientPayload || {}).find(item => String(item.id || '') === String(id || ''));
  if(!row){
    openModal('Диагностика', problem('Не удалось открыть диагностику.'), {compact:true});
    return;
  }
  openModal('Диагностика', `<div class="detail trebnik-detail-modal client-request-modal-detail">${clientDiagnosticDetailHtml(row, {compact:true})}</div>`, {wide:true, kind:'trebnik-detail'});
}
function clientRequestRecommendationLine(row={}){
  return `<article class="trebnik-inline-row">
    <div>
      <strong>${esc(statusName(row.status || 'active'))}</strong>
      <span>${esc(short(row.text || '', 180) || 'без текста')}</span>
    </div>
    <div class="trebnik-inline-actions"></div>
  </article>`;
}
function clientRequestWorkLine(work={}, logs=[], preview=false, requestId=''){
  const terms = clientWorkTermRange(work);
  const meta = clientPhraseJoin([statusName(work.status || 'planned'), terms], ' • ');
  const note = String(work.goal || work.description || '').trim();
  return `<article class="trebnik-inline-row is-work" data-action="client-work-detail" data-id="${attr(work.id || '')}" data-request-id="${attr(requestId || work.request_id || '')}" role="button" tabindex="0" aria-label="Открыть работу ${attr(work.title || 'Работа')}">
    <span class="trebnik-work-dot ${clientWorkStatusDotClass(work)}" aria-hidden="true"></span>
    <div class="trebnik-work-main">
      <strong>${esc(work.title || 'Работа')}</strong>
      <span>${esc(meta || workTypeName(work.type || ''))}</span>
    </div>
    <p class="trebnik-work-note ${note ? '' : 'is-empty'}">${note ? esc(note) : ''}</p>
    <div class="trebnik-inline-actions"></div>
  </article>`;
}
function clientWorkStatusDotClass(work={}){
  const status = String(work.status || '').toLowerCase();
  if(['completed','done','closed','cancelled','canceled'].includes(status)) return 'is-complete';
  if(['active','planned','paused'].includes(status)) return 'is-open is-active';
  return 'is-muted';
}
function clientWorkDetailModal(id='', requestId=''){
  const requestRows = clientCabinetRows(state.clientPayload || {}, 'requests');
  const request = requestRows.find(row => String(row.id || '') === String(requestId || '')) || {};
  const detail = clientRequestDetailFromPayload(requestId, state.clientPayload || {}) || state.clientCabinetRequestDetail || {};
  const work = (detail.works || []).find(row => String(row.id || '') === String(id || ''));
  if(!work){
    openModal('Работа', problem('Не удалось открыть работу.'), {compact:true});
    return;
  }
  const logs = detail.work_logs?.logs_by_work_id?.[String(work.id || '')] || [];
  const facts = [
    workTypeName(work.type || ''),
    statusName(work.status || 'planned'),
    clientWorkTermRange(work),
    clientWorkProgressText(work, logs),
  ].filter(Boolean);
  const logsHtml = logs.map(row => `<div class="trebnik-work-log-row"><strong>${date(row.log_date)}</strong>${row.comment ? `<span>${esc(row.comment || '')}</span>` : ''}</div>`).join('');
  const pay = clientCabinetCanWrite() ? `<button class="secondary" data-action="payment-receipt" data-target-type="request" data-target-id="${attr(requestId || work.request_id || '')}" data-work-id="${attr(work.id || '')}">Отметить платёж</button>` : '';
  openModal(work.title || 'Работа', `<div class="detail trebnik-work-detail client-work-detail">
    <div class="trebnik-work-detail__top">
      <div>
        <p class="subtle">${esc(request.title || work.request_title || 'Запрос')}</p>
        ${work.goal || work.description ? `<p>${esc(work.goal || work.description || '')}</p>` : ''}
      </div>
      <div class="trebnik-work-detail__actions">${pay}</div>
    </div>
    <div class="trebnik-work-facts">${facts.map(item => `<span>${esc(item)}</span>`).join('')}</div>
    <section class="trebnik-work-logs"><h3>Проведения</h3>${logsHtml || empty('Проведений пока нет.')}</section>
  </div>`, {compact:true});
}
function clientWorkTermRange(work={}){
  let start = inputDateValue(work.expected_first_result || work.next_due);
  let end = inputDateValue(work.expected_final_result);
  const type = work.type || '';
  const totalDays = Number(work.total_days || 0);
  const period = Number(work.period_days || 0);
  const times = Number(work.period_times || 0);
  if(!end && start && type === 'multi' && totalDays > 0) end = addIsoDays(start, totalDays - 1);
  if(!end && start && type === 'periodic' && period > 0 && times > 0) end = addIsoDays(start, period * (times - 1));
  if(!end && start && type === 'once') end = start;
  return dateRangeLong(start, end);
}
function clientWorkProgressText(work={}, logs=[]){
  const done = clientLoggedWorkDateCount(logs);
  const type = work.type || '';
  if(type === 'multi'){
    const total = Number(work.total_days || 0) || clientWorkPlannedDays(work);
    return total > 0 ? `${done}/${total} ${ruPlural(total, 'день', 'дня', 'дней')}` : (done ? `${done} ${ruPlural(done, 'проведение', 'проведения', 'проведений')}` : '');
  }
  if(type === 'periodic' && Number(work.period_days || 0) > 0){
    return done ? `${done} ${ruPlural(done, 'проведение', 'проведения', 'проведений')}` : '';
  }
  return done ? 'проведена' : '';
}
function clientLoggedWorkDateCount(logs=[]){
  const dates = new Set();
  (Array.isArray(logs) ? logs : []).forEach(row => {
    const value = inputDateValue(row?.log_date || row?.date || row?.created_at);
    if(value) dates.add(value);
  });
  return dates.size || Number(logs?.length || 0);
}
function clientWorkPlannedDays(work={}){
  const start = inputDateValue(work.expected_first_result || work.next_due);
  const end = inputDateValue(work.expected_final_result);
  if(!start || !end) return 0;
  const [sy,sm,sd] = start.split('-').map(Number);
  const [ey,em,ed] = end.split('-').map(Number);
  return Math.max(1, Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1);
}
async function clientLoadRequestDetail(id=''){
  const requestId = String(id || '');
  if(!requestId || state.clientCabinetRequestDetailLoadingId === requestId) return;
  state.clientCabinetRequestDetailLoadingId = requestId;
  try{
    const [detail, history, workLogs] = await Promise.all([
      api(`/api/request/${requestId}`),
      api(`/api/request/${requestId}/history`),
      api(`/api/request/${requestId}/work-logs`),
    ]);
    if(String(state.clientCabinetRequestId || '') !== requestId) return;
    state.clientCabinetRequestDetail = {...detail, history, work_logs:workLogs};
    state.clientCabinetRequestDetailId = requestId;
    if(state.route === 'trebnik' && clientCabinetActiveTab() === 'requests') preservePageView(() => { app.innerHTML = clientCabinetHtml(state.clientPayload, clientCabinetIsPreview()); });
  }catch(error){
    state.clientCabinetRequestDetail = {request:{id:requestId, title:'Запрос'}, error:error.message};
    state.clientCabinetRequestDetailId = requestId;
    if(state.route === 'trebnik' && clientCabinetActiveTab() === 'requests') preservePageView(() => { app.innerHTML = clientCabinetHtml(state.clientPayload, clientCabinetIsPreview()); });
  }finally{
    state.clientCabinetRequestDetailLoadingId = '';
  }
}
function setClientRequest(id=''){
  state.clientCabinetRequestId = String(id || '');
  state.clientCabinetRequestDetail = null;
  state.clientCabinetRequestDetailId = '';
  clientCabinetWriteUrlState(state.clientPayload || {});
  if(state.route === 'trebnik') app.innerHTML = clientCabinetHtml(state.clientPayload, clientCabinetIsPreview());
  if(state.clientCabinetRequestId && !clientRequestDetailFromPayload(state.clientCabinetRequestId, state.clientPayload || {})){
    clientLoadRequestDetail(state.clientCabinetRequestId);
  }
}
function setClientRequestPane(pane='works'){
  state.clientCabinetRequestPane = clientRequestPanes.includes(pane) ? pane : 'works';
  clientCabinetWriteUrlState(state.clientPayload || {});
  if(state.route === 'trebnik') app.innerHTML = clientCabinetHtml(state.clientPayload, clientCabinetIsPreview());
}
function openClientRequest(id=''){
  const requestId = String(id || '');
  if(requestId) state.clientCabinetRequestId = requestId;
  setClientCabinetTab('requests');
  clientCabinetWriteUrlState(state.clientPayload || {});
  if(requestId && !clientRequestDetailFromPayload(requestId, state.clientPayload || {})){
    clientLoadRequestDetail(requestId);
  }
}
function openClientService(id=''){
  const serviceId = String(id || '');
  if(serviceId) state.clientCabinetServiceId = serviceId;
  setClientCabinetTab('services');
}
function clientDiagnosticRows(payload={}){
  const rows = clientCabinetRows(payload, 'diagnostics');
  if(rows.length) return [...rows].sort((a,b) => String(b.created_at || b.id || '').localeCompare(String(a.created_at || a.id || '')));
  const fromDetails = new Map();
  Object.values(payload.active_request_details || {}).forEach(detail => {
    (detail?.diagnostics || []).forEach(row => {
      const key = String(row.id || `${row.request_id || ''}-${row.title || ''}-${row.created_at || ''}`);
      if(key) fromDetails.set(key, row);
    });
  });
  return [...fromDetails.values()].sort((a,b) => String(b.created_at || b.id || '').localeCompare(String(a.created_at || a.id || '')));
}
function clientActiveDiagnostic(rows=[]){
  if(!rows.length){
    state.clientCabinetDiagnosticId = '';
    return null;
  }
  const current = rows.find(row => String(row.id || '') === String(state.clientCabinetDiagnosticId || ''));
  const active = current || rows[0];
  state.clientCabinetDiagnosticId = String(active.id || '');
  return active;
}
function clientDiagnosticMasterRow(row={}, active=null){
  const selected = active && String(active.id || '') === String(row.id || '');
  const meta = diagnosticMetaParts(row, {includeRequest:true, includeWork:true}).slice(0, 3);
  return `<button class="trebnik-request-master__item ${selected ? 'active' : ''}" data-action="client-diagnostic-select" data-id="${attr(row.id || '')}" aria-pressed="${selected ? 'true' : 'false'}">
    <span class="trebnik-request-master__copy">
      <strong>${esc(row.title || 'Диагностика')}</strong>
      ${trebnikChips(meta)}
    </span>
  </button>`;
}
function clientDiagnosticDetailHtml(row={}, options={}){
  const facts = diagnosticMetaParts(row, {includeRequest:!options.compact, includeWork:true});
  const openRequest = row.request_id ? `<button class="secondary" data-action="client-open-request" data-id="${attr(row.request_id)}">Открыть запрос</button>` : '';
  return `<article class="trebnik-request-detail client-diagnostic-detail">
    <header class="trebnik-request-detail__head">
      <div><h3>${esc(row.title || 'Диагностика')}</h3><p>${esc(facts.join(' · ') || 'диагностика')}</p></div>
      <div class="row">${openRequest}</div>
    </header>
    <section class="trebnik-request-section is-main">
      <div class="trebnik-request-section__body">
        <div class="client-request-full-text">${esc(row.findings || 'Описание диагностики пока не заполнено.')}</div>
      </div>
    </section>
  </article>`;
}
function clientDiagnosticsHtml(payload, preview=false){
  const rows = clientDiagnosticRows(payload);
  if(!rows.length) return `<div class="client-action-center">${clientEmptyDetail('Диагностик пока нет.')}</div>`;
  const active = clientActiveDiagnostic(rows);
  return `<div class="trebnik-request-workbench client-diagnostics-workbench">
    <aside class="trebnik-request-master" aria-label="Диагностики">
      <div class="trebnik-request-master__list">${rows.map(row => clientDiagnosticMasterRow(row, active)).join('')}</div>
    </aside>
    <section class="trebnik-request-detail-pane">${active ? clientDiagnosticDetailHtml(active) : clientEmptyDetail('Выберите диагностику')}</section>
  </div>`;
}
function setClientDiagnostic(id=''){
  state.clientCabinetDiagnosticId = String(id || '');
  setClientCabinetTab('diagnostics');
}
function clientServicesHtml(payload, preview=false){
  const rows = clientCabinetRows(payload, 'services');
  if(!rows.length) return `<div class="client-action-center">${clientEmptyDetail('Услуг пока нет.')}</div>`;
  if(clientMobileViewport()) return clientServicesMobileHtml(rows, preview);
  const active = clientActiveService(rows);
  const openRows = rows.filter(row => !clientServiceClosed(row));
  const closedRows = rows.filter(clientServiceClosed);
  const listRows = [...openRows, ...closedRows];
  return `<div class="trebnik-request-workbench client-services-workbench">
    <aside class="trebnik-request-master" aria-label="Услуги">
      <div class="trebnik-request-master__list">${listRows.map(row => clientServiceMasterRow(row, active)).join('') || empty('Услуг пока нет.')}</div>
    </aside>
    <section class="trebnik-request-detail-pane">${active ? clientServiceDetailPane(active, preview) : clientEmptyDetail('Выберите услугу')}</section>
  </div>`;
}
function clientServicesMobileHtml(rows=[], preview=false){
  const openRows = rows.filter(row => !clientServiceClosed(row));
  const closedRows = rows.filter(clientServiceClosed);
  const listRows = [...openRows, ...closedRows];
  return `<section class="client-main-section client-services-mobile-section">
    <div class="client-main-section__head"><h3>Услуги</h3><div class="row"></div></div>
    <div class="client-main-list client-services-mobile-list">${listRows.map(row => clientServiceMobileRow(row, preview)).join('') || clientMainEmpty('Услуг пока нет.')}</div>
  </section>`;
}
function clientServiceMobileRow(row={}, preview=false){
  const f = row.financials || {};
  const meta = clientServiceMobileMeta(row, f);
  const action = preview ? '' : `data-action="client-service-select" data-id="${attr(row.id)}"`;
  return `<article class="client-service-mobile-row">
    <button class="client-action-row__main" ${action || 'type="button"'}>
      <strong>${esc(row.title || 'Услуга')}</strong>
      ${meta.length ? `<span class="client-service-mobile-meta">${meta.map(item => `<span>${esc(item)}</span>`).join('')}</span>` : ''}
    </button>
  </article>`;
}
function clientServiceMobileMeta(row={}, f={}){
  const status = clientServiceStatusParts(row, f);
  const now = serviceAmountNow(row, f);
  const future = serviceFutureAmount(row, f);
  const amount = now > 0 ? money(now) : (future > 0 ? money(future) : '');
  return [
    clientServiceCleanMeta(status.label || serviceMainStateText(row, f)),
    clientServiceCleanMeta(status.detail),
    serviceKindDisplay(row.service_kind || row.kind || ''),
    amount,
  ].filter(Boolean);
}
function clientServiceCleanMeta(text=''){
  const value = String(text || '').trim();
  if(!value) return '';
  return value.replace(/^([а-яё])/, letter => letter.toLocaleUpperCase('ru-RU'));
}
function clientServiceClosed(row={}){
  return ['closed','done','cancelled','completed','stopped'].includes(String(row.status || '').toLowerCase());
}
function clientActiveService(rows=[]){
  const current = rows.find(row => String(row.id) === String(state.clientCabinetServiceId || ''));
  const active = current || rows.find(row => !clientServiceClosed(row)) || rows[0] || null;
  if(active) state.clientCabinetServiceId = String(active.id || '');
  return active;
}
function clientServiceMasterRow(row={}, active=null){
  const f = row.financials || {};
  const selected = active && String(active.id) === String(row.id);
  const now = serviceAmountNow(row, f);
  const future = serviceFutureAmount(row, f);
  const meta = [serviceMainStateText(row, f), now > 0 ? money(now) : (future > 0 ? money(future) : '')].filter(Boolean);
  return `<button class="trebnik-request-master__item ${selected ? 'active' : ''}" data-action="client-service-select" data-id="${attr(row.id)}" aria-pressed="${selected ? 'true' : 'false'}">
    <span class="trebnik-request-master__copy">
      <strong>${esc(row.title || 'Услуга')}</strong>
      ${trebnikChips(meta)}
    </span>
  </button>`;
}
function clientServiceDetailPane(row={}, preview=false){
  const detail = state.clientCabinetServiceDetailId === String(row.id) ? state.clientCabinetServiceDetail : null;
  if(!detail){
    clientLoadServiceDetail(row.id);
    return `<article class="trebnik-request-detail client-service-detail">${loading('Открываю услугу…')}</article>`;
  }
  const s = detail.service || row;
  const f = detail.financials || row.financials || {};
  const actions = clientServiceActionButtons(s, f, preview);
  return `<article class="trebnik-request-detail client-service-detail">
    <header class="trebnik-request-detail__head">
      <div><h3>${esc(s.title || 'Услуга')}</h3><p>${esc(clientPhraseJoin([serviceMainStateText(s, f), serviceKindLabel(s.service_kind)]))}</p></div>
      <div class="row">${actions}</div>
    </header>
    ${serviceDetailStoryHtml({...detail, service:{...s, client_name:''}, financials:f})}
  </article>`;
}
function serviceKindLabel(kind=''){
  const map = {one_time:'разовая', once:'разовая', periodic:'периодическая', subscription:'периодическая'};
  return map[kind] || '';
}
function serviceKindDisplay(kind=''){
  const map = {one_time:'Разовая услуга', once:'Разовая услуга', periodic:'Периодическая услуга', subscription:'Периодическая услуга'};
  return map[kind] || '';
}
function serviceAmountNow(s={}, f={}){
  if(s.display_debt_total !== undefined) return Number(s.display_debt_total || 0);
  return Number(f.debt || f.money_debt_total || s.amount_due_now || 0);
}
function serviceFutureAmount(s={}, f={}){
  if(s.display_future_total !== undefined) return Number(s.display_future_total || 0);
  return Number(f.future_total || f.money_future_total || 0);
}
function serviceDueValue(s={}, f={}){
  const target = String(s.payment_target || '');
  if(['next_term','renewal'].includes(target)){
    return s.payment_due_until || f.payment_due_until || f.money_due_until || s.money_due_until || s.next_period_end || s.next_term_until || s.display_due_until || f.display_due_until || s.payment_postponed_until || '';
  }
  return s.display_due_until || f.display_due_until || s.payment_due_until || f.payment_due_until || f.money_due_until || s.payment_postponed_until || '';
}
function serviceIsOverdue(s={}, f={}){
  if(s.display_is_overdue !== undefined) return Boolean(s.display_is_overdue);
  if(f.money_is_overdue !== undefined) return Boolean(f.money_is_overdue);
  const due = inputDateValue(serviceDueValue(s, f));
  return Boolean(due && serviceAmountNow(s, f) > 0 && due < moscowDateValue());
}
function serviceDatePlusDays(value='', days=1){
  const iso = inputDateValue(value);
  if(!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const stamp = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return stamp.toISOString().slice(0, 10);
}
function servicePeriodText(start='', end=''){
  const from = inputDateValue(start);
  const to = inputDateValue(end);
  if(from && to) return `с ${dateLong(from)} по ${dateLong(to)}`;
  if(to) return `до ${dateLong(to)}`;
  if(from) return `с ${dateLong(from)}`;
  return '';
}
function servicePaymentPeriod(s={}){
  const target = String(s.payment_target || '');
  if(['next_term','renewal','first_term','current_term','service_debt'].includes(target)){
    const text = servicePeriodText(s.payment_period_start, s.payment_period_end);
    if(text) return text;
  }
  return servicePeriodText(s.current_period_start, s.current_period_end);
}
function servicePaymentTermText(row={}){
  return servicePeriodText(row.term_start, row.term_end);
}
function servicePaidThroughText(s={}){
  const until = s.paid_through_until || s.last_paid_period_end || '';
  if(!until) return '';
  const paidPeriod = servicePeriodText(s.last_paid_period_start, s.last_paid_period_end);
  return paidPeriod ? `оплачено до ${dateLong(until)}; последний закрытый срок ${paidPeriod}` : `оплачено до ${dateLong(until)}`;
}
function serviceTermCountLabel(count=0){
  const value = Math.abs(Number(count || 0));
  const tail = value % 100;
  const last = value % 10;
  if(tail >= 11 && tail <= 14) return `${count} сроков`;
  if(last === 1) return `${count} срок`;
  if(last >= 2 && last <= 4) return `${count} срока`;
  return `${count} сроков`;
}
function serviceCoverageText(s={}, f={}){
  if(String(s.service_kind || '') !== 'periodic') return '';
  const price = Number(s.price || f.price || 0);
  const confirmed = Number(s.confirmed_total || f.paid || f.money_confirmed_total || 0);
  if(price <= 0 || confirmed <= 0) return '';
  const fullTerms = Math.floor((confirmed + 0.001) / price);
  const extra = Math.max(confirmed - fullTerms * price, 0);
  const parts = [`подтверждено ${money(confirmed)}`];
  if(fullTerms > 0) parts.push(`${serviceTermCountLabel(fullTerms)} по ${money(price)}`);
  if(extra > 0) parts.push(`${money(extra)} пошло в следующий срок`);
  return clientPhraseJoin(parts);
}
function serviceTargetPaidText(s={}, f={}){
  const paid = Number(s.next_paid_amount || s.future_prepaid_amount || 0);
  const price = Number(s.price || f.price || 0);
  const debt = serviceAmountNow(s, f);
  if(paid <= 0 && price <= 0) return '';
  if(price > 0) return `внесено ${money(paid)} из ${money(price)}; осталось ${money(debt)}`;
  if(paid > 0) return `внесено ${money(paid)}; осталось ${money(debt)}`;
  return '';
}
function serviceActorName(row={}){
  const actor = String(row.actor_role || row.marked_by || '').toLowerCase();
  if(actor === 'client') return 'клиент';
  if(actor === 'admin') return 'мастер';
  if(actor === 'system') return 'система';
  if(actor === 'migration_reconcile_v3') return 'перенос данных';
  return row.actor_username || row.marked_by || '';
}
function serviceStopLog(payload={}){
  return (payload.action_logs || []).find(row => ['service.stop','service.resume'].includes(String(row.action || '')));
}
function serviceRenewalText(s={}, payload={}){
  const stopLog = serviceStopLog(payload);
  if(s.stop_after_current){
    const actor = stopLog ? serviceActorName(stopLog) : '';
    const stamp = stopLog?.created_at ? time(stopLog.created_at) : '';
    const who = actor || 'в журнале не указано кто';
    return stamp ? `Остановлено: ${who}, ${stamp}.` : `Остановлено; в журнале не указано кто.`;
  }
  if(String(s.payment_target || '') === 'renewal' && serviceAmountNow(s, payload.financials || {}) > 0){
    return 'Никто не отменял продление; поэтому открыт новый срок и он ждёт оплаты.';
  }
  return 'Никто не отменял продление.';
}
function serviceMainStateText(s={}, f={}){
  const now = serviceAmountNow(s, f);
  const future = serviceFutureAmount(s, f);
  const due = serviceDueValue(s, f);
  const paidThrough = s.paid_through_until || s.last_paid_period_end || '';
  if(now > 0 && serviceIsOverdue(s, f)){
    const after = serviceDatePlusDays(due, 1);
    return after ? `просрочено с ${dateLong(after)}` : 'просрочено';
  }
  if(now > 0 && due) return `оплатить до ${dateLong(due)}`;
  if(now > 0) return 'есть сумма к оплате';
  if(paidThrough) return `оплачено до ${dateLong(paidThrough)}`;
  if(future > 0 && due) return `следующая оплата до ${dateLong(due)}`;
  return s.state_label || statusName(s.status || 'active');
}
function serviceFactRows(s={}, f={}, payload={}){
  const rows = [];
  const now = serviceAmountNow(s, f);
  const future = serviceFutureAmount(s, f);
  const due = serviceDueValue(s, f);
  const payPeriod = servicePaymentPeriod(s);
  const paidThrough = servicePaidThroughText(s);
  const coverage = serviceCoverageText(s, f);
  const isPeriodic = String(s.service_kind || '') === 'periodic';
  const target = String(s.payment_target || '');
  const lastEnd = s.paid_through_until || s.last_paid_period_end || s.current_period_end || '';
  if(isPeriodic && now > 0 && serviceIsOverdue(s, f) && target === 'renewal'){
    rows.push(['Что происходит', `Срок закончился ${lastEnd ? dateLong(lastEnd) : 'раньше'}. Продление не остановлено, поэтому открыт новый срок.`]);
    rows.push(['Новый срок', clientPhraseJoin([payPeriod, serviceTargetPaidText(s, f)])]);
    if(due){
      const after = serviceDatePlusDays(due, 1);
      rows.push(['Просрочка', `оплатить нужно было до ${dateLong(due)}${after ? `; просрочено с ${dateLong(after)}` : ''}`]);
    }
  }else if(isPeriodic && future > 0 && target === 'next_term'){
    rows.push(['Что происходит', paidThrough || 'услуга сейчас без долга']);
    if(payPeriod) rows.push(['Следующая оплата', `${money(future)} за срок ${payPeriod}${due ? `; оплатить до ${dateLong(due)}` : ''}`]);
  }else if(isPeriodic && now > 0){
    rows.push(['Что происходит', paidThrough || 'есть неоплаченная часть услуги']);
    rows.push(['Что оплатить', `${money(now)}${payPeriod ? ` за срок ${payPeriod}` : ''}${due ? `; оплатить до ${dateLong(due)}` : ''}`]);
  }else if(isPeriodic){
    rows.push(['Что происходит', paidThrough || 'сейчас долга нет']);
  }else if(now > 0){
    rows.push(['Что оплатить', `${money(now)} по разовой услуге`]);
  }else{
    rows.push(['Что происходит', 'сейчас долга нет']);
  }
  if(coverage) rows.push(['Как посчитано', coverage]);
  if(isPeriodic) rows.push(['Продление', serviceRenewalText(s, payload)]);
  return rows;
}
function serviceCurrentSummary(s={}, f={}){
  const now = serviceAmountNow(s, f);
  const due = serviceDueValue(s, f);
  const paidThrough = s.paid_through_until || s.last_paid_period_end || '';
  if(now > 0 && serviceIsOverdue(s, f)){
    const since = serviceDatePlusDays(due, 1);
    if(String(s.payment_target || '') === 'renewal' && s.payment_period_end){
      return {
        tone:'danger',
        label:'Сейчас',
        title:`Открыт срок до ${dateLong(s.payment_period_end)}`,
        text: since ? `Оплата просрочена с ${dateLong(since)}.` : 'Оплата этого срока просрочена.',
      };
    }
    return {
      tone:'danger',
      label:'Сейчас',
      title: since ? `Просрочено с ${dateLong(since)}` : 'Просрочено',
      text: due ? `Срок оплаты был до ${dateLong(due)}.` : 'Срок оплаты уже прошёл.',
    };
  }
  if(now > 0){
    return {
      tone:'wait',
      label:'Сейчас',
      title:'Есть сумма к оплате',
      text: due ? `Нужно оплатить до ${dateLong(due)}.` : 'Срок оплаты не указан.',
    };
  }
  if(paidThrough){
    return {
      tone:'ok',
      label:'Сейчас',
      title:`Оплачено до ${dateLong(paidThrough)}`,
      text:'Долга сейчас нет.',
    };
  }
  return {
    tone:'ok',
    label:'Сейчас',
    title:s.state_label || statusName(s.status || 'active'),
    text:'Суммы к оплате сейчас нет.',
  };
}
function serviceActionSummary(s={}, f={}){
  const now = serviceAmountNow(s, f);
  const future = serviceFutureAmount(s, f);
  const due = serviceDueValue(s, f);
  const period = servicePaymentPeriod(s);
  if(now > 0){
    return {
      tone: serviceIsOverdue(s, f) ? 'danger' : 'wait',
      label:'Нужно оплатить',
      title:money(now),
      text:clientPhraseJoin([period ? `за срок ${period}` : '', due ? `оплатить до ${dateLong(due)}` : 'срок оплаты не указан']),
    };
  }
  if(future > 0){
    return {
      tone:'next',
      label:'Следующая оплата',
      title:money(future),
      text:clientPhraseJoin([period ? `за срок ${period}` : '', due ? `оплатить до ${dateLong(due)}` : 'срок оплаты не указан']),
    };
  }
  return null;
}
function serviceReasonSteps(s={}, f={}, payload={}){
  const steps = [];
  const now = serviceAmountNow(s, f);
  const future = serviceFutureAmount(s, f);
  const due = serviceDueValue(s, f);
  const period = servicePaymentPeriod(s);
  const paidThrough = servicePaidThroughText(s);
  const coverage = serviceCoverageText(s, f);
  const isPeriodic = String(s.service_kind || '') === 'periodic';
  const target = String(s.payment_target || '');
  const lastEnd = s.paid_through_until || s.last_paid_period_end || s.current_period_end || '';
  if(coverage) steps.push(['Оплаты', coverage]);
  if(isPeriodic && now > 0 && serviceIsOverdue(s, f) && target === 'renewal'){
    steps.push(['Закрыто', lastEnd ? `предыдущий оплаченный срок закончился ${dateLong(lastEnd)}` : 'предыдущий оплаченный срок закончился']);
    steps.push(['Новый срок', clientPhraseJoin([period, serviceTargetPaidText(s, f)])]);
    if(due){
      const since = serviceDatePlusDays(due, 1);
      steps.push(['Просрочка', `оплатить нужно было до ${dateLong(due)}${since ? `; просрочено с ${dateLong(since)}` : ''}`]);
    }
  }else if(isPeriodic && future > 0 && target === 'next_term'){
    if(paidThrough) steps.push(['Закрыто', paidThrough]);
    steps.push(['Дальше', `${period ? `следующий срок ${period}` : 'следующий срок ждёт оплаты'}${due ? `; оплатить до ${dateLong(due)}` : ''}`]);
  }else if(isPeriodic && now > 0){
    if(paidThrough) steps.push(['Закрыто', paidThrough]);
    steps.push(['К оплате', `${money(now)}${period ? ` за срок ${period}` : ''}${due ? `; оплатить до ${dateLong(due)}` : ''}`]);
  }else if(isPeriodic && paidThrough){
    steps.push(['Закрыто', paidThrough]);
  }
  if(!isPeriodic && now > 0) steps.push(['К оплате', `${money(now)} по разовой услуге`]);
  if(isPeriodic) steps.push(['Продление', serviceRenewalText(s, payload)]);
  return steps.length ? steps : [['Сейчас', serviceMainStateText(s, f)]];
}
function serviceMoneyStripHtml(s={}, f={}){
  const pending = Number(f.pending || f.money_pending_total || 0);
  const price = Number(f.price || s.price || 0);
  const paid = Number(f.paid || f.money_confirmed_total || s.confirmed_total || 0);
  const items = [
    price > 0 ? `<span><em>Цена</em><strong>${money(price)}</strong></span>` : '',
    paid > 0 ? `<span><em>Подтверждено</em><strong>${money(paid)}</strong></span>` : '',
    pending > 0 ? `<span class="is-wait"><em>На проверке</em><strong>${money(pending)}</strong></span>` : '',
  ].filter(Boolean);
  return items.length ? `<div class="service-money-strip">${items.join('')}</div>` : '';
}
function serviceProofDetails(title='', rows='', count=0, open=false){
  if(!rows || Number(count || 0) <= 0) return '';
  return `<details class="service-proof-details" ${open ? 'open' : ''}>
    <summary><span>${esc(title)}</span><b>${count}</b></summary>
    <div class="service-proof-rows">${rows}</div>
  </details>`;
}
function serviceTermKey(start='', end=''){
  return `${inputDateValue(start) || ''}__${inputDateValue(end) || ''}`;
}
function servicePeriodStartFromEnd(end='', days=28){
  const iso = inputDateValue(end);
  const count = Math.max(1, Number(days || 28));
  return iso ? serviceDatePlusDays(iso, -(count - 1)) : '';
}
function servicePaymentIsConfirmed(row={}){
  return Boolean(row.confirmed || row.status === 'confirmed');
}
function servicePaymentDateText(row={}){
  return row.created_at ? date(row.created_at) : '';
}
function servicePaymentShortMeta(row={}, assigned=false){
  return clientPhraseJoin([serviceActorName(row), servicePaymentDateText(row), assigned ? 'из общей оплаты' : '']);
}
function serviceTermLedgerRows(s={}, f={}, payload={}){
  if(String(s.service_kind || '') !== 'periodic') return [];
  const price = Number(s.price || f.price || 0);
  const periodDays = Math.max(1, Number(s.period_days || 28));
  const confirmedTotal = Number(s.confirmed_total || f.paid || f.money_confirmed_total || 0);
  const fullTerms = price > 0 ? Math.floor((confirmedTotal + 0.001) / price) : 0;
  const payments = (payload.payments || []).filter(servicePaymentIsConfirmed);
  const rows = [];
  const byKey = new Map();
  const ensureRow = (start='', end='', source='paid') => {
    const from = inputDateValue(start);
    const to = inputDateValue(end);
    if(!from || !to) return null;
    const key = serviceTermKey(from, to);
    if(byKey.has(key)) return byKey.get(key);
    const row = {key, start:from, end:to, source, price, paid:0, payments:[], due:'', status:'', tone:'', remainder:price};
    byKey.set(key, row);
    rows.push(row);
    return row;
  };
  let paidEnd = inputDateValue(s.paid_through_until || s.last_paid_period_end);
  if(paidEnd && fullTerms > 0){
    const generated = [];
    let end = paidEnd;
    for(let i = 0; i < fullTerms; i += 1){
      const start = servicePeriodStartFromEnd(end, periodDays);
      if(!start) break;
      generated.unshift([start, end]);
      end = serviceDatePlusDays(start, -1);
    }
    generated.forEach(([start, end]) => ensureRow(start, end, 'paid'));
  }
  payments.forEach(row => {
    const term = servicePaymentTermText(row);
    if(term) ensureRow(row.term_start, row.term_end, 'payment');
  });
  const paymentStart = inputDateValue(s.payment_period_start);
  const paymentEnd = inputDateValue(s.payment_period_end);
  const target = String(s.payment_target || '');
  if(paymentStart && paymentEnd && ['renewal','next_term','current_term','service_debt','first_term'].includes(target)){
    const row = ensureRow(paymentStart, paymentEnd, target);
    if(row) row.source = target;
  }
  payments.forEach(row => {
    const targetRow = servicePaymentTermText(row) ? byKey.get(serviceTermKey(row.term_start, row.term_end)) : null;
    if(!targetRow) return;
    const amount = Number(row.amount || 0);
    targetRow.paid += amount;
    targetRow.payments.push({...row, assigned_amount:amount, assigned:false});
  });
  const unassigned = payments.filter(row => !servicePaymentTermText(row)).sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
  unassigned.forEach(row => {
    let amountLeft = Number(row.amount || 0);
    if(amountLeft <= 0) return;
    for(const targetRow of rows.slice().sort((a, b) => a.start.localeCompare(b.start))){
      if(amountLeft <= 0) break;
      const need = Math.max(price - targetRow.paid, 0);
      if(need <= 0) continue;
      const used = Math.min(need, amountLeft);
      targetRow.paid += used;
      targetRow.payments.push({...row, assigned_amount:used, assigned:true});
      amountLeft -= used;
    }
    if(amountLeft > 0){
      const last = rows[rows.length - 1];
      if(last){
        last.paid += amountLeft;
        last.payments.push({...row, assigned_amount:amountLeft, assigned:true});
      }
    }
  });
  const activeKey = paymentStart && paymentEnd ? serviceTermKey(paymentStart, paymentEnd) : '';
  rows.forEach(row => {
    const isActivePayment = row.key === activeKey;
    row.due = isActivePayment ? serviceDueValue(s, f) : '';
    row.paid = Math.max(0, row.paid);
    row.remainder = Math.max(price - row.paid, 0);
    if(price > 0 && row.paid + 0.001 >= price){
      row.status = 'Оплачен';
      row.tone = 'ok';
      row.remainder = 0;
    }else if(isActivePayment && serviceAmountNow(s, f) > 0 && serviceIsOverdue(s, f)){
      row.status = row.paid > 0 ? 'Частично, просрочен' : 'Просрочен';
      row.tone = 'danger';
    }else if(isActivePayment && serviceAmountNow(s, f) > 0){
      row.status = row.paid > 0 ? 'Частично' : 'К оплате';
      row.tone = 'wait';
    }else if(isActivePayment && serviceFutureAmount(s, f) > 0){
      row.status = 'Следующая оплата';
      row.tone = 'next';
    }else if(row.paid > 0){
      row.status = 'Частично';
      row.tone = 'wait';
    }else{
      row.status = 'Не оплачен';
      row.tone = 'wait';
    }
  });
  return rows.sort((a, b) => a.start.localeCompare(b.start));
}
function serviceTermPaymentHtml(row={}){
  const amount = Number(row.assigned_amount ?? row.amount ?? 0);
  return `<span><b>${money(amount)}</b><em>${esc(servicePaymentShortMeta(row, Boolean(row.assigned)))}</em></span>`;
}
function serviceTermRowHtml(row={}){
  const payments = row.payments.length ? row.payments.map(serviceTermPaymentHtml).join('') : '<i>платежей нет</i>';
  const paidText = `${money(row.paid)} / ${money(row.price || 0)}`;
  const remainderText = row.remainder > 0 ? money(row.remainder) : 'закрыто';
  const dueText = row.remainder > 0 && row.due ? clientPhraseJoin([`оплатить до ${dateLong(row.due)}`, row.tone === 'danger' ? `просрочено с ${dateLong(serviceDatePlusDays(row.due, 1))}` : '']) : '';
  return `<article class="service-term-row is-${esc(row.tone || 'wait')}">
    <div class="service-term-period"><span>${esc(row.status)}</span><strong>${esc(servicePeriodText(row.start, row.end))}</strong></div>
    <div class="service-term-payments"><span>Оплачено ${esc(paidText)}</span><div>${payments}</div></div>
    <div class="service-term-rest"><span>${row.remainder > 0 ? 'Осталось' : 'Итог'}</span><strong>${esc(remainderText)}</strong>${dueText ? `<em>${esc(dueText)}</em>` : ''}</div>
  </article>`;
}
function serviceLedgerHtml(s={}, f={}, payload={}){
  const rows = serviceTermLedgerRows(s, f, payload);
  if(!rows.length){
    const payments = (payload.payments || []).map(x => servicePaymentHistoryRow(x, s)).join('');
    if(!payments) return '';
    return `<section class="service-ledger"><h3>Платежи</h3><div class="service-proof-rows">${payments}</div></section>`;
  }
  return `<section class="service-ledger">
    <h3>Сроки услуги</h3>
    <div class="service-term-table">${rows.map(serviceTermRowHtml).join('')}</div>
  </section>`;
}
function serviceJournalHtml(payload={}){
  const updates = (payload.updates || []).map(x => `<div><strong>${time(x.created_at)}</strong><em>${esc(short(x.text || '', 220))}</em></div>`).join('');
  const moreTime = (payload.more_time_requests || []).map(serviceMoreTimeHistoryRow).join('');
  const blocks = [
    serviceProofDetails('Запросы на новый срок', moreTime, (payload.more_time_requests || []).length, false),
    serviceProofDetails('Апдейты', updates, (payload.updates || []).length, false),
  ].filter(Boolean).join('');
  return blocks ? `<section class="service-journal"><h3>Журнал</h3><div class="service-proof-grid">${blocks}</div></section>` : '';
}
function serviceRenewalNoteHtml(s={}, payload={}){
  if(String(s.service_kind || '') !== 'periodic') return '';
  if(clientServiceClosed(s)) return '';
  return `<p class="service-renewal-note">${esc(serviceRenewalText(s, payload))}</p>`;
}
function serviceSummaryLineHtml(s={}, f={}){
  const now = serviceAmountNow(s, f);
  const future = serviceFutureAmount(s, f);
  const paidThrough = s.paid_through_until || s.last_paid_period_end || '';
  const cards = [];
  if(now <= 0 && paidThrough){
    const current = serviceCurrentSummary(s, f);
    if(current) cards.push(current);
  }
  const action = serviceActionSummary(s, f);
  if(action && (now > 0 || future > 0)) cards.push(action);
  if(!cards.length) return '';
  return `<section class="service-summary-line is-${esc(cards[0]?.tone || 'ok')} ${cards.length === 1 ? 'is-single' : ''}">
    ${cards.map(card => `<div class="is-${esc(card.tone || 'ok')}">
      <span>${esc(card.label)}</span>
      <strong>${esc(card.title)}</strong>
      <em>${esc(card.text)}</em>
    </div>`).join('')}
  </section>`;
}
function serviceDetailStoryHtml(payload={}, options={}){
  const s = payload.service || {};
  const f = payload.financials || {};
  const client = s.client_name ? `<p class="service-owner">${esc(s.client_name)}</p>` : '';
  const actions = options.actions || '';
  const facts = serviceFactRows(s, f, payload);
  const factsHtml = facts.length ? `<div class="client-service-detail-facts service-detail-facts">${facts.map(([label, value]) => `<span><em>${esc(label)}</em><strong>${esc(value)}</strong></span>`).join('')}</div>` : '';
  return `<div class="detail trebnik-detail-modal service-readable-card service-ledger-card">
    ${client}
    ${serviceSummaryLineHtml(s, f)}
    ${factsHtml}
    ${actions}
    ${serviceLedgerHtml(s, f, payload)}
    ${serviceMoneyStripHtml(s, f)}
    ${serviceRenewalNoteHtml(s, payload)}
    ${serviceJournalHtml(payload)}
  </div>`;
}
function servicePaymentMeta(row={}, service={}){
  const state = row.confirmed || row.status === 'confirmed' ? 'подтверждён' : receiptStatusName(row.status || 'new');
  const term = servicePaymentTermText(row);
  const termText = term || (String(service.service_kind || '') === 'periodic' ? 'без срока в записи, учтён в общей оплате' : '');
  const actor = serviceActorName(row);
  return clientPhraseJoin([state, actor, termText, time(row.created_at)]);
}
function servicePaymentHistoryRow(row={}, service={}){
  return `<div><strong>${money(row.amount || 0)}</strong><em>${esc(servicePaymentMeta(row, service))}</em></div>`;
}
function serviceMoreTimeHistoryRow(row={}){
  const current = row.current_limit ? `было до ${dateLong(row.current_limit)}` : '';
  const requested = row.requested_until ? `просили до ${dateLong(row.requested_until)}` : '';
  const approved = row.approved_until ? `одобрено до ${dateLong(row.approved_until)}` : '';
  return clientPlainRow(statusName(row.status || 'pending'), clientPhraseJoin([current, requested, approved, row.created_at ? time(row.created_at) : '']));
}
function clientServiceActionButtons(s={}, f={}, preview=false){
  if(preview) return '';
  const debt = serviceAmountNow(s, f);
  const buttons = [];
  if(s.can_mark_payment || (s.can_mark_payment !== false && debt > 0)) buttons.push(`<button class="secondary" data-action="payment-receipt" data-target-type="service" data-target-id="${attr(s.id)}">Отметить платёж</button>`);
  const timeButtons = [];
  if(s.can_request_more_time){
    timeButtons.push(`<button class="plain" data-action="client-more-time-quick" data-service-id="${attr(s.id)}" data-days="1">+1</button>`);
    timeButtons.push(`<button class="plain" data-action="client-more-time-quick" data-service-id="${attr(s.id)}" data-days="3">+3</button>`);
    timeButtons.push(`<button class="plain" data-action="client-more-time-quick" data-service-id="${attr(s.id)}" data-days="7">+7</button>`);
    timeButtons.push(`<button class="plain" data-action="service-extend" data-service-id="${attr(s.id)}">Свой срок</button>`);
  }
  if(timeButtons.length) buttons.push(`<span class="client-service-quick-actions" aria-label="Попросить новый срок">${timeButtons.join('')}</span>`);
  if(s.can_postpone_payment) buttons.push(`<button class="plain" data-action="service-action" data-service-id="${attr(s.id)}" data-mode="postpone">Отложить оплату</button>`);
  if(s.can_resume) buttons.push(`<button class="plain" data-action="service-action" data-service-id="${attr(s.id)}" data-mode="resume">Снова продлевать</button>`);
  else if(s.can_stop_after_current) buttons.push(`<button class="plain" data-action="service-action" data-service-id="${attr(s.id)}" data-mode="stop">Не продлевать</button>`);
  return buttons.join('');
}
async function clientLoadServiceDetail(id=''){
  const serviceId = String(id || '');
  if(!serviceId || state.clientCabinetServiceDetailLoadingId === serviceId) return;
  state.clientCabinetServiceDetailLoadingId = serviceId;
  try{
    const detail = await api(`/api/service/${serviceId}`);
    if(String(state.clientCabinetServiceId || '') !== serviceId) return;
    state.clientCabinetServiceDetail = detail;
    state.clientCabinetServiceDetailId = serviceId;
    if(state.route === 'trebnik' && clientCabinetActiveTab() === 'services') preservePageView(() => { app.innerHTML = clientCabinetHtml(state.clientPayload, clientCabinetIsPreview()); });
  }finally{
    state.clientCabinetServiceDetailLoadingId = '';
  }
}
function setClientService(id=''){
  state.clientCabinetServiceId = String(id || '');
  state.clientCabinetServiceDetail = null;
  state.clientCabinetServiceDetailId = '';
  if(state.route === 'trebnik') app.innerHTML = clientCabinetHtml(state.clientPayload, clientCabinetIsPreview());
}
function clientServiceSelect(id=''){
  if(clientMobileViewport()){
    clientServiceDetailModal(id);
    return;
  }
  setClientService(id);
}
async function clientServiceDetailModal(id=''){
  const serviceId = String(id || '');
  if(!serviceId) return;
  const row = clientCabinetRows(state.clientPayload || {}, 'services').find(item => String(item.id || '') === serviceId);
  openModal('Услуга', loading('Открываю услугу…'), {compact:true, kind:'client-service-detail'});
  try{
    const payload = await api(`/api/service/${serviceId}`);
    const s = payload.service || row || {};
    const f = payload.financials || row?.financials || {};
    const actions = clientServiceActionButtons(s, f, clientCabinetIsPreview());
    openModal('Услуга', clientServiceDetailModalHtml({...payload, service:{...s, client_name:''}, financials:f}, row, actions), {compact:true, kind:'client-service-detail'});
  }catch(error){
    openModal('Услуга', problem(error.message), {compact:true, kind:'client-service-detail'});
  }
}
function clientServiceDetailModalHtml(payload={}, fallback={}, actions=''){
  const s = payload.service || fallback || {};
  const f = payload.financials || fallback.financials || {};
  const status = clientServiceStatusParts(s, f);
  const kind = serviceKindDisplay(s.service_kind || fallback.service_kind || '');
  const now = serviceAmountNow(s, f);
  const future = serviceFutureAmount(s, f);
  const due = serviceDueValue(s, f);
  const facts = [
    ['Статус', clientServiceCleanMeta(status.label || serviceMainStateText(s, f))],
    kind ? ['Тип', kind] : null,
    status.detail ? ['Сейчас', clientServiceCleanMeta(status.detail)] : null,
    now > 0 ? ['К оплате', clientPhraseJoin([money(now), due ? `до ${dateLong(due)}` : ''])] : null,
    future > 0 ? ['Следующая оплата', clientPhraseJoin([money(future), due ? `до ${dateLong(due)}` : ''])] : null,
    now <= 0 && future <= 0 ? ['Оплата', 'Сейчас суммы к оплате нет'] : null,
  ].filter(Boolean);
  const extra = [
    serviceSummaryLineHtml(s, f),
    serviceLedgerHtml(s, f, payload),
    serviceMoneyStripHtml(s, f),
    serviceRenewalNoteHtml(s, payload),
    serviceJournalHtml(payload),
  ].filter(Boolean).join('');
  return `<div class="detail client-service-detail-modal">
    <h3>${esc(s.title || fallback.title || 'Услуга')}</h3>
    <div class="client-service-detail-facts">${facts.map(([label, value]) => `<span><em>${esc(label)}</em><strong>${esc(value)}</strong></span>`).join('')}</div>
    ${actions ? `<div class="row client-service-detail-actions">${actions}</div>` : ''}
    ${extra ? `<div class="detail service-readable-card service-ledger-card">${extra}</div>` : ''}
  </div>`;
}
function clientPaymentsHtml(payload, preview=false){
  const report = clientCabinetFinancialReport(payload);
  const finance = clientCabinetFinanceSummary(payload);
  const board = clientPaymentBoardItems(payload);
  const receipts = payload.payment_receipts || [];
  if(clientMobileViewport()) return clientPaymentsMobileHtml(finance, report, board, receipts, preview);
  const model = clientFinanceModel(board);
  return `<section class="trebnik-finance client-finance">
    ${clientFinanceHeroHtml(finance, report, board, receipts)}
    <div class="finance-cockpit client-finance-cockpit">
      ${clientFinanceActionCenterHtml(model, preview)}
    </div>
  </section>`;
}
function clientPaymentsMobileHtml(finance={}, report={}, board={}, receipts=[], preview=false){
  const views = clientFinanceViewItems(finance, report, board, receipts);
  const activeView = clientFinanceActiveView(board, receipts);
  const active = views.find(item => item.view === activeView) || views[0];
  const rows = clientFinanceRowsForView(active.view, board, receipts);
  const count = rows.length ? `${rows.length} ${ruPlural(rows.length, 'запись', 'записи', 'записей')}` : 'пусто';
  const emptyText = {
    pay:'Сейчас оплат к внесению нет.',
    wait:'Платежей на проверке нет.',
    upcoming:'Будущих оплат пока нет.',
    paid:'Подтверждённых оплат пока нет.',
  };
  return `<section class="trebnik-finance client-finance client-payments-mobile">
    <div class="client-payment-status-grid">
      ${views.map(item => clientFinanceMobileSwitchHtml(item, active.view)).join('')}
    </div>
    <section class="client-main-section client-payment-mobile-section">
      <div class="client-main-section__head"><h3>${esc(active.label)}</h3><div class="row"><span class="client-payment-mobile-count">${esc(count)}</span></div></div>
      <div class="client-payment-mobile-list">
        ${rows.map((row, index) => clientFinanceMobileRowHtml(row, active.view, index, preview)).join('') || clientFinanceEmptyHtml(emptyText[active.view] || 'Оплат сейчас нет')}
      </div>
    </section>
  </section>`;
}
function clientFinanceViewItems(finance={}, report={}, board={}, receipts=[]){
  const debt = Number(finance.debt || report.combined_debt_total || 0);
  const pending = Number(finance.pending || report.combined_pending_total || 0);
  const future = Number(report.combined_future_total || 0);
  const paid = Number(finance.paid || report.combined_confirmed_total || 0);
  const paidRows = clientFinancePaidRows(receipts);
  return [
    {view:'pay', label:'К оплате', value:money(debt), tone:debt > 0 ? 'is-main' : '', count:(board.payNow || []).length},
    {view:'wait', label:'На проверке', value:money(pending), tone:pending > 0 ? 'is-wait' : '', count:(board.waiting || []).length},
    {view:'upcoming', label:'Предстоит', value:money(future), tone:future > 0 ? 'is-main' : '', count:(board.upcoming || []).length},
    {view:'paid', label:'Оплачено', value:money(paid), tone:paid > 0 || paidRows.length ? 'is-good' : '', count:paidRows.length},
  ];
}
function clientFinanceMobileSwitchHtml(item={}, activeView='pay'){
  const active = item.view === activeView;
  return `<button class="client-payment-status ${attr(item.tone || '')} ${active ? 'active' : ''}" data-action="client-finance-view" data-view="${attr(item.view || 'pay')}" aria-pressed="${active ? 'true' : 'false'}">
    <span>${esc(item.label || '')}</span>
    <strong class="finance-amount">${esc(item.value || money(0))}</strong>
  </button>`;
}
function clientFinanceHeroHtml(finance={}, report={}, board={}, receipts=[]){
  const debt = Number(finance.debt || report.combined_debt_total || 0);
  const pending = Number(finance.pending || report.combined_pending_total || 0);
  const future = Number(report.combined_future_total || 0);
  const paid = Number(finance.paid || report.combined_confirmed_total || 0);
  const paidRows = clientFinancePaidRows(receipts);
  return `<section class="finance-hero client-finance-hero">
    ${clientFinanceHeroCell('К оплате', money(debt), 'pay', debt > 0 ? 'is-main' : '', board.payNow || [], board.payNow?.length || 0)}
    ${clientFinanceHeroCell('На проверке', money(pending), 'wait', pending > 0 ? 'is-wait' : '', board.waiting || [], board.waiting?.length || 0)}
    ${clientFinanceHeroCell('Предстоит', money(future), 'upcoming', future > 0 ? 'is-main' : '', board.upcoming || [], board.upcoming?.length || 0)}
    ${clientFinanceHeroCell('Оплачено', money(paid), 'paid', paid > 0 || paidRows.length ? 'is-good' : '', paidRows, paidRows.length)}
  </section>`;
}
function clientFinanceHeroCell(label='', value='', view='pay', tone='', rows=[], count=0){
  const active = state.clientFinanceOpen === view;
  const suffix = count > 0 ? `${mobileTextSeparator()}${count}` : '';
  return `<div class="finance-hero-cell client-finance-cell is-${attr(view)}">
    <button class="finance-hero-stat ${attr(tone)} ${active ? 'active' : ''}" data-action="client-finance-view" data-view="${attr(view)}" aria-expanded="${active ? 'true' : 'false'}"><span>${esc(label + suffix)}</span><strong class="finance-amount">${esc(value)}</strong></button>
    ${active ? clientFinanceMenuHtml(view, rows) : ''}
  </div>`;
}
function clientFinanceModel(board={}){
  const items = [
    ...(board.payNow || []).map(row => ({kind:'pay', row, priority:0, amount:Number(row.amount || row.debt || 0)})),
    ...(board.waiting || []).map(row => ({kind:'wait', row, priority:1, amount:Number(row.amount || row.debt || 0)})),
    ...(board.upcoming || []).map(row => ({kind:'upcoming', row, priority:2, amount:Number(row.amount || row.debt || 0)})),
  ];
  return {items, visible:items.sort(clientFinanceItemSort)};
}
function clientFinanceItemSort(a={}, b={}){
  if(a.priority !== b.priority) return a.priority - b.priority;
  const aTime = String(a.row?.due_until || a.row?.created_at || '');
  const bTime = String(b.row?.due_until || b.row?.created_at || '');
  return aTime.localeCompare(bTime);
}
function clientFinanceActionCenterHtml(model={}, preview=false){
  const items = model.visible || [];
  if(!items.length) return '';
  const count = items.length ? `${items.length} ${ruPlural(items.length, 'запись', 'записи', 'записей')}` : 'нет записей';
  return `<section class="finance-panel finance-action-center client-finance-action-center">
    <div class="finance-panel-head"><h2>Действия</h2><span>${esc(count)}</span></div>
    <div class="finance-action-list">${items.map(item => clientFinanceActionHtml(item, preview)).join('') || clientFinanceEmptyHtml('Оплат сейчас нет')}</div>
  </section>`;
}
function clientFinanceActionHtml(item={}, preview=false){
  const row = item.row || {};
  const type = clientFinanceTargetType(row);
  const id = clientFinanceTargetId(row, type);
  const openAction = type === 'service' ? 'client-open-service' : 'client-open-request';
  const cardAttrs = id ? ` data-action="${attr(openAction)}" data-id="${attr(id)}" role="button" tabindex="0"` : '';
  const title = clientCabinetPaymentTitle(row);
  const amount = Number(row.amount || row.debt || row.remainder || 0);
  const stateText = clientFinanceStateText(item.kind, row);
  const tone = item.kind === 'wait' ? 'is-wait' : 'is-main';
  const targetText = clientFinanceTargetTypeLabel(type);
  const meta = clientFinanceMeta(item.kind, row, targetText);
  const target = id
    ? `<button class="finance-client-link" data-action="${attr(openAction)}" data-id="${attr(id)}">${esc(title)}</button>`
    : `<span class="finance-client-link">${esc(title)}</span>`;
  const pay = !preview && item.kind === 'pay' && id ? `<button class="secondary" data-action="payment-receipt" data-target-type="${attr(type)}" data-target-id="${attr(id)}">Платёж</button>` : '';
  return `<article class="finance-action-card ${tone}"${cardAttrs}>
    <div class="finance-action-state"><b class="finance-amount">${money(amount)}</b><span>${esc(stateText)}</span></div>
    <div class="finance-action-main">
      ${target}
      <span>${esc(meta)}</span>
    </div>
    <div class="finance-action-buttons">${pay}</div>
  </article>`;
}
function clientFinanceTargetType(row={}){
  if(row.entity_type || row.target_type) return row.entity_type || row.target_type;
  if(row.service_id) return 'service';
  return 'request';
}
function clientFinanceTargetId(row={}, type='request'){
  return row.entity_id || row.target_id || (type === 'service' ? row.service_id : row.request_id) || '';
}
function clientFinanceTargetTypeLabel(type='request'){
  return type === 'service' ? 'Услуга' : 'Запрос';
}
function clientFinanceStateText(kind='pay', row={}){
  if(kind === 'wait') return 'на проверке';
  if(kind === 'upcoming') return row.due_until ? 'предстоит' : 'ожидает срока';
  return 'к оплате';
}
function clientFinanceMeta(kind='pay', row={}, targetText='Запрос'){
  const parts = [targetText];
  parts.push(row.due_until ? dateLong(row.due_until) : '');
  if(row.work_title) parts.push(row.work_title);
  return clientPhraseJoin(parts);
}
function clientFinanceEmptyHtml(title='', text=''){
  return `<div class="finance-empty"><strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
}
function clientFinancePaidRows(receipts=[]){
  return (Array.isArray(receipts) ? receipts : [])
    .filter(row => Boolean(row.confirmed) || String(row.status || '').toLowerCase() === 'confirmed')
    .sort((a,b) => String(b.confirmed_at || b.created_at || b.id || '').localeCompare(String(a.confirmed_at || a.created_at || a.id || '')));
}
function clientFinanceRowsForView(view='', board={}, receipts=[]){
  if(view === 'paid') return clientFinancePaidRows(receipts);
  const rows = view === 'wait' ? board.waiting : (view === 'upcoming' ? board.upcoming : board.payNow);
  return (Array.isArray(rows) ? rows : [])
    .map(row => ({...row, mode:row.mode || view}))
    .sort((a,b) => {
      const aTime = String(a.due_until || a.created_at || '');
      const bTime = String(b.due_until || b.created_at || '');
      return view === 'wait' ? bTime.localeCompare(aTime) : aTime.localeCompare(bTime);
    });
}
function clientFinanceDefaultView(board={}, receipts=[]){
  if((board.payNow || []).length) return 'pay';
  if((board.waiting || []).length) return 'wait';
  if((board.upcoming || []).length) return 'upcoming';
  if(clientFinancePaidRows(receipts).length) return 'paid';
  return 'pay';
}
function clientFinanceActiveView(board={}, receipts=[]){
  const allowed = ['pay','wait','upcoming','paid'];
  return allowed.includes(state.clientFinanceOpen) ? state.clientFinanceOpen : clientFinanceDefaultView(board, receipts);
}
function clientFinanceMobileRowHtml(row={}, view='pay', index=0, preview=false){
  const type = clientFinanceTargetType(row);
  const id = clientFinanceTargetId(row, type);
  const openAction = type === 'service' ? 'client-open-service' : 'client-open-request';
  const title = clientCabinetPaymentTitle(row);
  const amount = Number(row.amount || row.debt || row.remainder || 0);
  const label = view === 'paid' ? 'оплачено' : view === 'wait' ? 'на проверке' : view === 'upcoming' ? 'предстоит' : 'к оплате';
  const meta = view === 'paid'
    ? clientPhraseJoin([clientFinanceTargetTypeLabel(type), clientShortDateTime(row.confirmed_at || row.created_at)])
    : clientFinanceMeta(view, row, clientFinanceTargetTypeLabel(type));
  const mainAttrs = view === 'paid'
    ? `type="button" data-action="client-finance-payment-detail" data-index="${attr(index)}"`
    : (id ? `type="button" data-action="${attr(openAction)}" data-id="${attr(id)}"` : '');
  const mainTag = mainAttrs ? 'button' : 'div';
  const pay = !preview && view === 'pay' && id ? `<button class="secondary client-compact-action" data-action="payment-receipt" data-target-type="${attr(type)}" data-target-id="${attr(id)}">Платёж</button>` : '';
  return `<article class="client-payment-mobile-row is-${attr(view)}">
    <${mainTag} class="client-payment-mobile-main" ${mainAttrs}>
      <strong>${esc(title)}</strong>
      ${meta ? `<span>${esc(meta)}</span>` : ''}
    </${mainTag}>
    <div class="client-payment-mobile-side">
      <b class="finance-amount">${money(amount)}</b>
      <span>${esc(label)}</span>
    </div>
    ${pay ? `<div class="client-payment-mobile-actions">${pay}</div>` : ''}
  </article>`;
}
function clientFinanceMenuHtml(view='', rows=[]){
  const allowed = ['pay','wait','upcoming','paid'];
  if(!allowed.includes(view)) return '';
  const source = (Array.isArray(rows) ? rows : []).slice();
  const sorted = view === 'paid'
    ? clientFinancePaidRows(source)
    : source.map(row => ({...row, mode:row.mode || view})).sort((a,b) => {
      const aTime = String(a.due_until || a.created_at || '');
      const bTime = String(b.due_until || b.created_at || '');
      return view === 'wait' ? bTime.localeCompare(aTime) : aTime.localeCompare(bTime);
    });
  const emptyText = {
    pay:'Текущих оплат нет',
    wait:'Платежей на проверке нет',
    upcoming:'Будущих оплат нет',
    paid:'Подтверждённых оплат пока нет',
  };
  return `<aside class="finance-debt-menu client-finance-menu is-${attr(view)}">
    <div class="finance-debt-list">
      ${sorted.map((row, index) => clientFinanceMenuRowHtml(row, view, index)).join('') || `<div class="finance-income-empty">${esc(emptyText[view] || emptyText.pay)}</div>`}
    </div>
  </aside>`;
}
function clientFinanceMenuRowHtml(row={}, view='pay', index=0){
  const type = clientFinanceTargetType(row);
  const id = clientFinanceTargetId(row, type);
  const action = type === 'service' ? 'client-open-service' : 'client-open-request';
  const amount = Number(row.amount || row.debt || row.remainder || 0);
  const title = clientCabinetPaymentTitle(row);
  const dateText = view === 'paid'
    ? clientShortDateTime(row.confirmed_at || row.created_at)
    : (row.due_until ? dateLong(row.due_until) : clientShortDateTime(row.created_at));
  const label = view === 'paid' ? 'оплачено' : view === 'wait' ? 'на проверке' : view === 'upcoming' ? 'предстоит' : 'к оплате';
  const meta = clientPhraseJoin([label, clientFinanceTargetTypeLabel(type), dateText]);
  const content = `<span><b>${esc(title)}</b><i>${esc(meta)}</i></span><strong class="finance-amount">${money(amount)}</strong>`;
  const className = `finance-debt-row client-finance-menu-row is-${attr(view)}`;
  if(view === 'paid') return `<button class="${className}" data-action="client-finance-payment-detail" data-index="${attr(index)}">${content}</button>`;
  if(id) return `<button class="${className}" data-action="${attr(action)}" data-id="${attr(id)}">${content}</button>`;
  return `<div class="${className}">${content}</div>`;
}
function clientFinancePaymentModal(index=''){
  const rows = clientFinancePaidRows(state.clientPayload?.payment_receipts || []);
  const row = rows[Number(index)];
  if(!row){
    openModal('Оплата', problem('Не удалось открыть оплату.'), {compact:true});
    return;
  }
  const type = clientFinanceTargetType(row);
  const meta = clientPhraseJoin([
    'подтверждена',
    clientFinanceTargetTypeLabel(type),
    clientFullDateTime(row.confirmed_at || row.created_at),
  ]);
  const text = row.text || row.comment || row.note || '';
  openModal('Оплата', `<div class="detail trebnik-detail-modal client-request-modal-detail client-finance-payment-detail">
    <div class="client-request-payment-total"><em>Сумма</em><strong>${money(row.amount || 0)}</strong></div>
    <p class="subtle">${esc(clientCabinetPaymentTitle(row))}</p>
    ${meta ? `<p class="subtle">${esc(meta)}</p>` : ''}
    ${text ? `<div class="client-request-full-text">${esc(text)}</div>` : ''}
  </div>`, {compact:true, kind:'trebnik-detail'});
}
function setClientFinanceView(view=''){
  const allowed = ['pay','wait','upcoming','paid'];
  const next = allowed.includes(view) ? view : '';
  if(clientMobileViewport() && state.route === 'trebnik' && clientCabinetActiveTab() === 'payments'){
    const board = clientPaymentBoardItems(state.clientPayload || {});
    state.clientFinanceOpen = next || clientFinanceDefaultView(board, state.clientPayload?.payment_receipts || []);
  }else{
    state.clientFinanceOpen = state.clientFinanceOpen === next ? '' : next;
  }
  if(state.route === 'trebnik' && state.clientPayload){
    app.innerHTML = clientCabinetHtml(state.clientPayload, clientCabinetIsPreview());
  }
}
function clientNotificationsHtml(payload, preview=false){
  const client = payload.client || {};
  const buttons = preview ? '' : '<div class="client-notification-actions"><button class="plain client-compact-action" data-action="client-notifications-all" data-value="0">выкл. все</button><button class="secondary client-compact-action" data-action="client-notifications-all" data-value="1">вкл. все</button></div>';
  const status = state.clientNotificationStatus ? `<p class="form-note client-notification-status">${esc(state.clientNotificationStatus)}</p>` : '';
  return `<div class="client-notifications">
    ${buttons}
    ${status}
    <div class="client-notification-list">${clientNotificationFields.map(([field,label]) => {
      const checked = client[field] !== false && client[field] !== 0;
      return `<label class="toggle-line client-notification-row">
        <input type="checkbox" ${checked ? 'checked' : ''} ${preview ? 'disabled' : ''} data-action="client-notification" data-field="${attr(field)}" data-value="${checked ? '0' : '1'}">
        <span>${esc(label)}</span>
      </label>`;
    }).join('')}</div>
  </div>`;
}
function clientNotificationsModal(){
  if(!state.clientPayload) return;
  openModal('Настройки уведомлений', clientNotificationsHtml(state.clientPayload, clientCabinetIsPreview()), {compact:true, kind:'client-notifications'});
}
function paintClientNotificationsSettings(){
  if(modal.hidden || modalCard.dataset.modalKind !== 'client-notifications') return;
  modalBody.innerHTML = clientNotificationsHtml(state.clientPayload || {}, false);
  bindModalDirtyGuard(modalBody);
}
function clientPlainRow(title='', meta=''){
  return `<div><strong>${esc(title || 'Событие')}</strong>${meta ? `<em>${esc(meta)}</em>` : ''}</div>`;
}
function clientEmptyDetail(text='Выберите пункт'){
  return `<article class="client-detail-card is-empty">${empty(text)}</article>`;
}
async function clientMoreTimeQuick(serviceId='', days=1){
  if(!clientCabinetCanWrite()) return;
  const requestedUntil = addIsoDays(localDateValue(), Math.max(1, Number(days || 1)));
  try{
    say('Отправляю запрос…', 'warning');
    await api('/api/service/extend-request', {method:'POST', body:{service_id:serviceId, requested_until:requestedUntil, idempotency_key:newIdempotencyKey('client:more-time')}});
    say('Отправлено.', 'success');
    await renderClientCabinet(trebnikClientId(), false);
  }catch(error){ say(error.message || 'Не удалось попросить больше времени.', 'danger'); }
}
async function clientNotificationUpdate(field='', value=false){
  if(!clientCabinetCanWrite()) return;
  try{
    state.clientNotificationStatus = 'Сохраняю…';
    paintClientNotificationsSettings();
    if(state.route === 'trebnik') app.innerHTML = clientCabinetHtml(state.clientPayload, false);
    await api('/api/client/notification', {method:'POST', body:{field, value:Boolean(value), idempotency_key:newIdempotencyKey('client:notification')}});
    state.clientNotificationStatus = 'Сохранено.';
    say('Сохранено.', 'success');
    await renderClientCabinet(trebnikClientId(), false);
    paintClientNotificationsSettings();
  }catch(error){ say(error.message || 'Не удалось изменить уведомления.', 'danger'); }
}
async function clientNotificationsAll(value=false){
  if(!clientCabinetCanWrite()) return;
  try{
    state.clientNotificationStatus = 'Сохраняю…';
    paintClientNotificationsSettings();
    if(state.route === 'trebnik') app.innerHTML = clientCabinetHtml(state.clientPayload, false);
    await api('/api/client/notifications-all', {method:'POST', body:{value:Boolean(value), idempotency_key:newIdempotencyKey('client:notifications-all')}});
    state.clientNotificationStatus = 'Сохранено.';
    say('Сохранено.', 'success');
    await renderClientCabinet(trebnikClientId(), false);
    paintClientNotificationsSettings();
  }catch(error){ say(error.message || 'Не удалось изменить уведомления.', 'danger'); }
}
