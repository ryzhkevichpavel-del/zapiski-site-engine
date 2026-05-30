function paintAdminTrebnik(){
  const page = adminTrebnikPage();
  const titles = {actions:'Дела', clients:'Клиенты', services:'Обрядник', payments:'Финансы'};
  const body = page === 'actions' ? adminTrebnikActionsHtml()
    : page === 'clients' ? adminTrebnikClientsHtml()
    : page === 'services' ? adminTrebnikServicesHtml()
    : adminTrebnikPaymentsHtml();
  app.innerHTML = adminTrebnikShell(titles[page], body);
  wireAdminTrebnikSearch();
  wireAdminRitebookMobile();
  wireAdminFinance();
}
function adminTrebnikActionsHtml(){
  const unreadMessages = adminUnreadClientUpdates(state.dashboard?.fresh_client_messages || state.dashboard?.client_messages || []);
  const pending = state.dashboard?.pending_payments || [];
  const extendsRows = (state.dashboard?.service_extend_requests || []).filter(row => (row.status || 'pending') === 'pending');
  const dueWorks = state.dashboard?.work_today || [];
  const overdue = dueWorks.filter(isWorkOverdue);
  const today = dueWorks.filter(row => !isWorkOverdue(row));
  const upcoming = state.dashboard?.work_upcoming || [];
  const expiring = state.dashboard?.expiring_services || [];
  const sections = [
    unreadMessages.length ? adminActionSection('Новые апдейты', unreadMessages, adminClientUpdateItem, 'is-urgent') : '',
    overdue.length ? adminActionSection('Просрочено', overdue, workLine, 'is-urgent') : '',
    today.length ? adminActionSection('Сегодня', today, workLine) : '',
    upcoming.length ? adminActionSection('Ближайшие 3 дня', upcoming, workLine) : '',
    pending.length ? adminActionSection('Платежи', pending, paymentLine) : '',
    extendsRows.length ? adminActionSection('Новый срок', extendsRows, adminMoreTimeItem) : '',
    expiring.length ? adminActionSection('Заканчиваются услуги', expiring, serviceDueLine) : '',
  ].filter(Boolean).join('');
  if(!sections){
    return `<div class="trebnik-action-board is-calm">
      <div class="trebnik-action-empty"><strong>Сейчас спокойно</strong><span>Срочных дел нет.</span></div>
    </div>`;
  }
  return `<div class="trebnik-action-board">${sections}</div>`;
}
function isWorkOverdue(work){
  const due = workAgendaDate(work);
  const today = moscowDateValue();
  return Number(work?.days_late || 0) > 0 || Boolean(due && today && due < today);
}
function workAgendaDate(work={}){
  return inputDateValue(work?.agenda_date || work?.next_due || work?.expected_first_result);
}
function workDefaultLogDate(work={}){
  return inputDateValue(work?.log_default_date || workAgendaDate(work));
}
function adminActionCountLabel(count=0){
  const n = Math.abs(Number(count || 0));
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'пункт' : (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'пункта' : 'пунктов');
  return `${n} ${word}`;
}
function adminActionCard(title, rows, mapper, emptyText, limit=4, footer='', tone=''){
  const source = Array.isArray(rows) ? rows : [];
  const items = source.slice(0,limit);
  const emptyClass = items.length ? '' : ' is-empty';
  const toneClass = tone ? ` ${tone}` : '';
  const countText = source.length > 1 ? `<span>${adminActionCountLabel(source.length)}</span>` : '';
  return `<article class="admin-card admin-action-card${emptyClass}${toneClass}">
    <div class="admin-action-card__head"><h2>${esc(title)}</h2>${countText}</div>
    <div class="action-list">${items.map(item => mapper(item)).join('') || empty(emptyText)}</div>
    ${footer ? `<div class="admin-action-card__foot">${footer}</div>` : ''}
  </article>`;
}
function adminActionSection(title, rows, mapper, tone=''){
  const source = Array.isArray(rows) ? rows : [];
  const toneClass = tone ? ` ${tone}` : '';
  const count = source.length > 1 ? `<span>${source.length}</span>` : '';
  return `<section class="trebnik-action-section${toneClass}">
    <div class="trebnik-action-section__head"><h2>${esc(title)}</h2>${count}</div>
    <div class="trebnik-action-section__rows">${source.slice(0, 12).map(item => mapper(item)).join('')}</div>
  </section>`;
}
function isoDayDiff(fromValue, toValue){
  const from = inputDateValue(fromValue);
  const to = inputDateValue(toValue);
  if(!from || !to) return 0;
  const [fy,fm,fd] = from.split('-').map(Number);
  const [ty,tm,td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}
function workActionStatusParts(work={}){
  const agendaDate = workAgendaDate(work);
  const today = moscowDateValue();
  const diff = isoDayDiff(today, agendaDate);
  if(isWorkOverdue(work) && agendaDate) return [['', date(agendaDate), 'is-danger']];
  if(agendaDate === today) return [['', date(agendaDate), 'is-today']];
  if(diff > 0) return [['', date(agendaDate), 'is-upcoming']];
  return agendaDate ? [['', date(agendaDate), '']] : [['', 'не указана', '']];
}
function updateTargetLabel(row){
  if(row.request_id) return row.request_title || row.target_title || 'без названия';
  if(row.service_id) return row.service_title || row.target_title || 'без названия';
  return 'Требник';
}
function adminClientUpdateItem(row){
  const target = updateTargetLabel(row);
  const preview = short(String(row.text || '').trim(), 96) || (isClientQuestionKind(row.kind) ? 'Вопрос клиента' : 'Апдейт клиента');
  return `<article class="action-line admin-action-line admin-work-line admin-update-row">
    <button class="admin-action-open" data-action="update-detail" data-id="${attr(row.id)}">
      <span class="trebnik-update-dot" aria-hidden="true"></span>
      <strong>${esc(row.client_name || 'Клиент')}</strong>
      <span class="admin-work-title admin-update-target">${esc(target)}</span>
      <span class="admin-work-note admin-update-preview">${esc(preview)}</span>
      <span class="admin-work-status admin-update-date"><span><b>${date(row.created_at)}</b></span></span>
    </button>
    <div class="admin-action-buttons">
      <button class="plain" data-action="update-detail" data-id="${attr(row.id)}">Открыть</button>
      ${canShowUpdateReadAction(row) ? `<button class="secondary trebnik-work-log-icon" data-action="update-read" data-id="${attr(row.id)}" aria-label="Отметить прочитанным" title="Прочитано">✓</button>` : ''}
    </div>
  </article>`;
}
function adminMoreTimeItem(row){
  return `<article class="inquiry-card admin-action-item">
    <button class="admin-action-open" data-action="service-detail" data-id="${attr(row.service_id)}">
      <strong>${esc(row.service_title || 'Услуга')}</strong>
      <span>${esc(row.client_name || 'Клиент')} · просит до ${date(row.requested_until)}</span>
      ${row.text ? `<p>${esc(short(row.text || '', 160))}</p>` : ''}
    </button>
    <div class="row">
      <button class="plain" data-action="service-more-time-review" data-request-id="${attr(row.id)}" data-decision="approved">Одобрить</button>
      <button class="plain" data-action="service-more-time-custom" data-request-id="${attr(row.id)}" data-requested-until="${attr(row.requested_until || '')}">Свой срок</button>
      <button class="plain danger" data-action="service-more-time-review" data-request-id="${attr(row.id)}" data-decision="rejected">Отказать</button>
      <button class="secondary" data-action="service-detail" data-id="${attr(row.service_id)}">Открыть услугу</button>
    </div>
  </article>`;
}
function adminTrebnikClientsHtml(){
  const clients = state.dashboard?.clients || [];
  const selected = selectedClient(clients);
  const payload = selected && String(state.adminClientPayloadId) === String(selected.id) ? state.adminClientPayload : null;
  const rows = clients.map(c => adminTrebnikClientRow(c, selected)).join('') || empty('Клиентов нет.');
  const mobileSelected = Boolean(selected && isAdminTrebnikMobileViewport());
  const showList = state.adminClientListOpen || !selected;
  return `<div class="trebnik-clients ${showList ? 'is-list-open' : ''} ${selected ? 'is-client-selected' : ''}">
    ${mobileSelected ? '' : `<aside class="trebnik-client-list">
      <div class="trebnik-client-list__head">
        <h2>Клиенты</h2>
        <button class="secondary trebnik-client-add" data-action="client-add">Добавить</button>
      </div>
      <input class="search" id="adminTrebnikSearch" placeholder="Поиск клиентов" aria-label="Найти клиента" autocomplete="off">
      <div class="trebnik-client-rows" id="adminTrebnikClientList">${rows}</div>
    </aside>`}
    <section class="trebnik-client-detail">
      ${selected ? adminClientWorkspaceHtml(selected, payload) : adminClientsOverviewHtml(clients)}
    </section>
  </div>`;
}
function adminTrebnikClientRow(c, selected){
  const active = selected && String(selected.id) === String(c.id);
  const pending = Number(c.pending_total || 0);
  const debt = Number(c.debt_total || c.money_debt_total || 0);
  const meta = [debt > 0 ? money(debt) : '', pending > 0 ? `${money(pending)} на проверке` : ''].filter(Boolean);
  return `<button class="trebnik-client-row ${active ? 'active' : ''}" data-action="select-client" data-id="${attr(c.id)}" aria-pressed="${active ? 'true' : 'false'}">
    <strong>${esc(c.name || 'Клиент')}</strong>
    ${meta.length ? `<span class="trebnik-client-row__meta">${meta.map((item, index) => `<em class="${index ? 'is-alert' : ''}">${esc(item)}</em>`).join('')}</span>` : ''}
  </button>`;
}
function adminTrebnikClientNavRow(c, selected){
  const active = selected && String(selected.id) === String(c.id);
  const pending = Number(c.pending_total || 0);
  const debt = Number(c.debt_total || c.money_debt_total || 0);
  const amount = debt > 0 ? money(debt) : (pending > 0 ? money(pending) : '');
  return `<button class="trebnik-client-row trebnik-client-nav-row ${active ? 'active' : ''}" data-action="select-client" data-id="${attr(c.id)}" aria-pressed="${active ? 'true' : 'false'}">
    <strong>${esc(c.name || 'Клиент')}</strong>
    ${amount ? `<span class="trebnik-client-nav-row__amount">${esc(amount)}</span>` : ''}
  </button>`;
}
function adminClientMobileNavHtml(clients=[], selected=null){
  const rows = clients.map(c => adminTrebnikClientNavRow(c, selected)).join('') || empty('Клиентов нет.');
  const isOpen = Boolean(state.adminClientNavOpen);
  return `<div class="trebnik-client-mobile-nav ${isOpen ? 'is-open' : ''}">
    <button class="secondary trebnik-client-mobile-nav__button" data-action="client-nav-toggle" aria-expanded="${isOpen ? 'true' : 'false'}">Навигация</button>
    <div class="trebnik-client-mobile-menu" ${isOpen ? '' : 'hidden'}>
      <input class="search" id="adminTrebnikMobileSearch" placeholder="Поиск клиента" aria-label="Найти клиента" autocomplete="off">
      <div class="trebnik-client-rows trebnik-client-mobile-rows" id="adminTrebnikMobileClientList">${rows}</div>
    </div>
  </div>`;
}
function wireAdminTrebnikSearch(){
  const clients = state.dashboard?.clients || [];
  const selected = selectedClient(clients);
  [
    ['#adminTrebnikSearch', '#adminTrebnikClientList', adminTrebnikClientRow],
    ['#adminTrebnikMobileSearch', '#adminTrebnikMobileClientList', adminTrebnikClientNavRow],
  ].forEach(([inputSelector, listSelector, rowRenderer]) => {
    const input = document.querySelector(inputSelector);
    const list = document.querySelector(listSelector);
    if(!input || !list) return;
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      const filtered = clients.filter(c => `${c.name} ${c.pending_total} ${c.active_requests_count} ${c.works_count} ${c.services_count}`.toLowerCase().includes(q));
      list.innerHTML = filtered.map(c => rowRenderer(c, selected)).join('') || empty('Ничего не найдено.');
    });
  });
}
function wireAdminRitebookMobile(){
  const select = document.querySelector('#adminRitebookMobileFilter');
  if(!select) return;
  select.addEventListener('change', () => {
    state.adminRitebookFilter = select.value || 'all';
    paintAdminTrebnik();
  });
}
function adminClientEmptyHtml(){
  return `<article class="trebnik-client-empty">
    <h2>Клиент не выбран</h2>
    <p>Выберите клиента слева, чтобы открыть его запросы, услуги, оплаты, апдейты и профиль.</p>
  </article>`;
}
function selectedClient(clients=[]){
  const selected = clients.find(c => String(c.id) === String(state.clientId));
  if(selected) return selected;
  if(state.clientId && String(state.adminClientPayloadId || '') === String(state.clientId) && state.adminClientPayload?.client){
    return state.adminClientPayload.client;
  }
  return null;
}
function isAdminTrebnikMobileViewport(){
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 920px)').matches;
}
function adminClientsOverviewHtml(clients=[]){
  return `<article class="trebnik-clients-overview is-empty" aria-label="Общий экран клиентов"></article>`;
}
function adminClientWorkspaceHtml(client, payload){
  if(state.adminClientError && String(state.adminClientPayloadId) === String(client.id)){
    return `<article class="trebnik-client-empty"><h2>${esc(client.name || 'Клиент')}</h2><p>${esc(state.adminClientError)}</p><button class="secondary" data-action="client-refresh">Обновить</button></article>`;
  }
  if(!payload){
    return `<article class="trebnik-client-empty"><h2>${esc(client.name || 'Клиент')}</h2>${loading('Открываю кабинет клиента…')}</article>`;
  }
  const tabs = [
    ['requests','Запросы'],
    ['diagnostics','Диагностики'],
    ['services','Услуги'],
    ['payments','Оплаты'],
    ['updates','Апдейты'],
    ['notifications','Уведомления'],
    ['profile','Заметки и профиль'],
  ];
  if(!tabs.some(([key]) => key === state.adminClientTab)) state.adminClientTab = 'requests';
  const body = adminClientTabHtml(state.adminClientTab, payload);
  return `<article class="trebnik-client-workspace">
    <header class="trebnik-client-head">
      <button class="plain trebnik-client-back" data-action="client-list-back">К списку</button>
      ${adminClientMobileNavHtml(state.dashboard?.clients || [], payload.client || client)}
      <div class="trebnik-client-title">
        <h2>${esc(payload.client?.name || client.name || 'Клиент')}</h2>
        ${adminClientMetaHtml(payload.client || client)}
      </div>
      <div class="trebnik-client-head__actions">${adminClientHeadActionsHtml(state.adminClientTab)}</div>
    </header>
    <nav class="trebnik-client-tabs" aria-label="Разделы клиента">
      ${tabs.map(([key,label]) => `<button class="plain ${state.adminClientTab === key ? 'active' : ''}" data-action="client-tab" data-tab="${attr(key)}" aria-selected="${state.adminClientTab === key ? 'true' : 'false'}">${esc(label)}</button>`).join('')}
    </nav>
    <div class="trebnik-client-tab">${body}</div>
  </article>`;
}
function adminClientMetaHtml(client={}){
  const created = inputDateValue(client.created_at || client.joined_at || client.registered_at);
  const items = [
    created ? `Клиент с ${date(created)}` : '',
    client.id ? `ID: ${client.id}` : '',
  ].filter(Boolean);
  return items.length ? `<div class="trebnik-client-meta">${items.map(item => `<span>${esc(item)}</span>`).join('')}</div>` : '';
}
function adminClientTabHtml(tab, payload){
  if(tab === 'requests') return adminClientRequestsHtml(payload);
  if(tab === 'diagnostics') return adminClientDiagnosticsHtml(payload);
  if(tab === 'services') return adminClientServicesHtml(payload);
  if(tab === 'payments') return adminClientPaymentsHtml(payload);
  if(tab === 'updates') return adminClientUpdatesHtml(payload);
  if(tab === 'notifications') return adminClientNotificationsHtml(payload);
  if(tab === 'profile') return adminClientAccessHtml(payload);
  return adminClientOverviewHtml(payload);
}
function adminClientHeadActionsHtml(tab='requests'){
  if(tab === 'profile' || tab === 'updates' || tab === 'payments' || tab === 'notifications') return '';
  if(tab === 'services') return '<button class="primary" data-action="service-add"><span aria-hidden="true">⊕</span> Новая услуга</button>';
  if(tab === 'diagnostics') return '<button class="primary" data-action="diagnostic-add"><span aria-hidden="true">⊕</span> Новая диагностика</button>';
  return '<button class="primary" data-action="request-add"><span aria-hidden="true">⊕</span> Новый запрос</button>';
}
function adminClientSectionHead(title, actionHtml=''){
  return `<div class="trebnik-section-head"><h3>${esc(title)}</h3><div class="row">${actionHtml}</div></div>`;
}
function trebnikChips(items=[]){
  const rows = items.filter(item => item !== undefined && item !== null && String(item).trim());
  return rows.length ? `<span class="trebnik-card__chips">${rows.map(item => `<em>${esc(item)}</em>`).join('')}</span>` : '';
}
function adminClientOverviewHtml(payload){
  const works = (payload.works || []).filter(row => !workIsClosed(row));
  const moneyRows = adminClientMoneyItems(payload);
  const urgentWorks = adminClientUrgentWorks(works);
  const unreadMessages = adminClientUnreadMessages(payload);
  const rows = [
    ...moneyRows.slice(0,4).map(adminClientNowMoneyRow),
    ...urgentWorks.slice(0,4).map(adminClientNowWorkRow),
    ...unreadMessages.slice(0,4).map(adminClientNowMessageRow),
  ].slice(0,8);
  if(!rows.length){
    return `<div class="trebnik-now is-calm">
      <div class="trebnik-now-empty">
        <strong>Сейчас спокойно</strong>
        <span>Нет новых апдейтов, долгов и срочных сроков.</span>
      </div>
    </div>`;
  }
  return `<div class="trebnik-now">
    <div class="trebnik-now-list">${rows.join('')}</div>
  </div>`;
}
function adminOverviewFact(label, value){
  return `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}
function workMainDate(row={}){
  return workNextLogDate(row) || inputDateValue(row.next_due || row.expected_first_result || row.expected_final_result);
}
function adminClientMoneyItems(payload){
  const requestRows = (payload.requests || []).map(row => {
    const f = row.financials || {};
    return {
      target_type:'request',
      target_id:row.id,
      title:row.title || 'Запрос',
      kind:'Запрос',
      debt:Number(f.remainder || f.money_debt_total || 0),
      pending:Number(f.pending || f.money_pending_total || 0),
      due:row.display_due_until || row.due_until || '',
    };
  });
  const serviceRows = (payload.services || []).map(row => {
    const f = row.financials || {};
    return {
      target_type:'service',
      target_id:row.id,
      title:row.title || 'Услуга',
      kind:'Услуга',
      debt:Number(f.debt || f.money_debt_total || 0),
      pending:Number(f.pending || f.money_pending_total || 0),
      due:row.active_until || row.due_until || '',
    };
  });
  return [...requestRows, ...serviceRows]
    .filter(row => row.debt > 0 || row.pending > 0)
    .sort((a,b) => (b.debt - a.debt) || (b.pending - a.pending) || String(a.title).localeCompare(String(b.title), 'ru'));
}
function adminClientUrgentWorks(works=[]){
  return works
    .filter(row => {
      return workCanLog(row) && workPendingLogDates(row).length > 0;
    })
    .sort((a,b) => String(workMainDate(a) || '').localeCompare(String(workMainDate(b) || '')));
}
function adminClientUnreadMessages(payload){
  const isActionable = row => {
    return row && !row.read_at && row.status !== 'processing' && (row.author === 'client' || isClientQuestionKind(row.kind) || row.kind === 'update');
  };
  const clientRows = (payload.client_messages || []).filter(isActionable);
  const fallback = (payload.recent_updates || []).filter(isActionable);
  const byId = new Map();
  [...clientRows, ...fallback]
    .sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .forEach(row => byId.set(String(row.id || `${row.created_at}-${row.text}`), row));
  return [...byId.values()];
}
function adminClientNowMoneyRow(row){
  const action = row.target_type === 'service' ? 'service-detail' : 'request-detail';
  const amount = row.debt > 0 ? money(row.debt) : money(row.pending);
  const label = row.debt > 0 ? 'К оплате' : 'На проверке';
  const due = row.due ? date(row.due) : '';
  return `<button class="trebnik-now-row is-money" data-action="${attr(action)}" data-id="${attr(row.target_id)}">
    <span>${esc(label)}</span>
    <strong>${esc(row.title)}</strong>
    <em>${esc([amount, due].filter(Boolean).join(' · '))}</em>
  </button>`;
}
function adminClientNowWorkRow(row){
  return `<button class="trebnik-now-row is-work" data-action="work-detail" data-id="${attr(row.id)}">
    <span>${esc(workDueText(row))}</span>
    <strong>${esc(row.title || 'Работа')}</strong>
    <em>${esc(row.request_title || '')}</em>
  </button>`;
}
function adminClientNowMessageRow(row){
  const normalized = normalizeClientUpdateForCard(row);
  return `<button class="trebnik-now-row is-message" data-action="update-detail" data-id="${attr(row.id)}">
    <span>${esc(normalized.title)}</span>
    <strong>${esc(short(normalized.text || '', 140))}</strong>
    <em>${esc(time(row.created_at))}</em>
  </button>`;
}
function adminClientPendingPayments(payload){
  const requestRows = (payload.request_payments || []).map(row => ({...row, target_type:'request', target_id:row.request_id}));
  const serviceRows = (payload.service_payments || []).map(row => ({...row, target_type:'service', target_id:row.service_id}));
  return [...requestRows, ...serviceRows].filter(row => Number(row.confirmed || 0) !== 1);
}
function workDueText(row={}){
  const due = workMainDate(row);
  if(!due) return statusName(row.status || 'planned');
  const today = moscowDateValue();
  if(due < today) return `просрочено с ${dateLong(due)}`;
  if(due === today) return 'на сегодня';
  return dateLong(due);
}
function adminClientRequestsHtml(payload){
  const allRows = adminSortRequests(payload.requests || []);
  const archivedRows = allRows.filter(requestIsArchived);
  const rows = state.adminShowArchivedRequests ? allRows : allRows.filter(row => !requestIsArchived(row));
  const selected = adminSelectedRequest(rows);
  if(!allRows.length){
    return `<div class="trebnik-request-empty">
      <span>У клиента пока нет запросов.</span>
      <button class="primary" data-action="request-add">Новый запрос</button>
    </div>`;
  }
  const looseRecommendations = (payload.recommendations || []).filter(row => !row.request_id);
  const archiveButton = archivedRows.length ? `<button class="plain trebnik-request-archive-toggle" data-action="request-archive-toggle">${state.adminShowArchivedRequests ? 'Скрыть архивные запросы' : 'Показать архивные запросы'}</button>` : '';
  return `<div class="trebnik-request-workbench">
    <aside class="trebnik-request-master" aria-label="Запросы клиента">
      <div class="trebnik-request-master__list">${rows.map(row => adminRequestMasterItem(row, selected)).join('') || empty('Архивные запросы скрыты.')}</div>
      ${archiveButton}
    </aside>
    <section class="trebnik-request-detail-pane">
      ${selected ? adminRequestInlineDetail(selected, payload) : '<div class="trebnik-request-empty"><span>Архивные запросы скрыты.</span></div>'}
    </section>
  </div>${adminClientLooseRequestItems([], looseRecommendations)}`;
}
function adminRowsForRequest(rows=[], requestId=''){
  return (rows || []).filter(row => String(row.request_id || '') === String(requestId));
}
function requestIsClosed(row={}){
  return ['closed','done','cancelled','canceled','completed','archived'].includes(String(row.status || '').toLowerCase());
}
function requestIsArchived(row={}){
  return Boolean(row.is_archived) || String(row.status || '').toLowerCase() === 'archived';
}
function adminSortRequests(rows=[]){
  return [...rows].sort((a,b) => {
    const openDelta = Number(requestIsClosed(a)) - Number(requestIsClosed(b));
    if(openDelta) return openDelta;
    return String(b.updated_at || b.created_at || b.id || '').localeCompare(String(a.updated_at || a.created_at || a.id || ''));
  });
}
function adminSelectedRequest(rows=[]){
  if(!rows.length){
    state.adminRequestId = '';
    return null;
  }
  const current = rows.find(row => String(row.id) === String(state.adminRequestId));
  const selected = current || rows.find(row => !requestIsClosed(row)) || rows[0];
  state.adminRequestId = String(selected.id || '');
  return selected;
}
function adminRequestMoneySummary(financials={}){
  const total = Number(financials.total || financials.money_total || 0);
  const pending = Number(financials.pending || financials.money_pending_total || 0);
  const debt = Number(financials.remainder || financials.money_debt_total || 0);
  const future = Number(financials.future_total || financials.display_future_total || 0);
  const fullDebt = Number(financials.full_remainder || financials.money_full_debt_total || debt + future || 0);
  if(debt > 0) return `${money(debt)} к оплате`;
  if(pending > 0) return `${money(pending)} на проверке`;
  if(future > 0 || fullDebt > 0) return `${money(future || fullDebt)} ждём оплаты`;
  if(total > 0) return 'оплата закрыта';
  return '';
}
function requestStatusName(status){
  const map = {active:'активен', planned:'запланирован', paused:'приостановлен', stopped:'остановлен', completed:'завершён', done:'завершён', cancelled:'отменён', canceled:'отменён', closed:'закрыт', archived:'в архиве'};
  return map[String(status || '').toLowerCase()] || statusName(status);
}
function adminRequestMasterItem(row, selected){
  const isActive = selected && String(selected.id) === String(row.id);
  const worksCount = Number(row.works_count || 0);
  const meta = [
    requestStatusName(row.status || 'planned'),
    worksCount ? `${worksCount} ${ruPlural(worksCount, 'работа', 'работы', 'работ')}` : '',
    adminRequestMoneySummary(row.financials || {}),
  ].filter(Boolean);
  return `<button class="trebnik-request-master__item ${isActive ? 'active' : ''}" data-action="request-select" data-id="${attr(row.id)}" aria-pressed="${isActive ? 'true' : 'false'}">
    <span class="trebnik-request-master__copy">
      <strong>${esc(row.title || 'Запрос')}</strong>
      ${row.goal ? `<span>${esc(short(row.goal, 92))}</span>` : ''}
      ${trebnikChips(meta)}
    </span>
  </button>`;
}
function adminRequestMetric(label, value, mod='', icon=''){
  if(value === undefined || value === null || String(value).trim() === '') return '';
  return `<span class="${mod ? `is-${attr(mod)}` : ''}">${icon ? `<i aria-hidden="true">${esc(icon)}</i>` : ''}<em>${esc(label)}</em><strong>${esc(value)}</strong></span>`;
}
function adminRequestInlineMoney(row={}){
  const f = row.financials || {};
  const total = Number(f.total || f.money_total || 0);
  const paid = Number(f.paid || f.money_paid_total || 0);
  const pending = Number(f.pending || f.money_pending_total || 0);
  const debt = Number(f.remainder || f.money_debt_total || 0);
  const future = Number(f.future_total || f.display_future_total || 0);
  const fullDebt = Number(f.full_remainder || f.money_full_debt_total || debt + future || 0);
  const paymentLabel = pending > 0 ? 'На проверке' : (debt > 0 || future > 0 || fullDebt > 0 ? 'К оплате' : 'Оплата');
  const paymentValue = pending > 0 ? money(pending) : (debt > 0 ? money(debt) : (future > 0 || fullDebt > 0 ? money(future || fullDebt) : (total > 0 ? 'закрыта' : 'не указана')));
  const paymentMod = pending > 0 ? 'wait' : (debt > 0 ? 'alert' : (future > 0 || fullDebt > 0 ? 'wait' : ''));
  const paymentIcon = pending > 0 ? '⌛' : (debt > 0 ? '₽' : (future > 0 || fullDebt > 0 ? '◷' : '▣'));
  const cells = [
    adminRequestMetric('Сумма', total > 0 ? money(total) : 'не указана', '', '▭'),
    adminRequestMetric('Оплачено', money(paid), '', '✓'),
    adminRequestMetric(paymentLabel, paymentValue, paymentMod, paymentIcon),
  ].filter(Boolean).join('');
  return cells ? `<div class="trebnik-request-ledger">${cells}</div>` : '';
}
function adminRequestSection(title, actionHtml='', bodyHtml='', mod=''){
  return `<section class="trebnik-request-section ${mod ? `is-${attr(mod)}` : ''}">
    <div class="trebnik-request-section__head"><h3>${esc(title)}</h3><div>${actionHtml}</div></div>
    <div class="trebnik-request-section__body">${bodyHtml || '<p class="trebnik-inline-empty">Пока нет.</p>'}</div>
  </section>`;
}
function adminRequestPaneTabs(counts={}){
  const tabs = [
    ['works','Работы', counts.works || 0],
    ['diagnostics','Диагностики', counts.diagnostics || 0],
    ['updates','Апдейты', counts.updates || 0],
    ['recommendations','Рекомендации', counts.recommendations || 0],
    ['payments','Оплаты', counts.payments || 0],
    ['about','Описание', ''],
  ];
  if(!tabs.some(([key]) => key === state.adminRequestPane)) state.adminRequestPane = 'works';
  return `<nav class="trebnik-request-panes" aria-label="Что открыть в запросе">
    ${tabs.map(([key,label,count]) => `<button class="plain ${state.adminRequestPane === key ? 'active' : ''}" data-action="request-pane" data-pane="${attr(key)}" aria-selected="${state.adminRequestPane === key ? 'true' : 'false'}">
      <span>${esc(label)}</span>${count !== '' ? `<em>${esc(count)}</em>` : ''}
    </button>`).join('')}
  </nav>`;
}
function adminRequestPaneBody(row, lists={}){
  const panes = {
    works: () => adminRequestSection('Работы', `<button class="secondary" data-action="work-add" data-request-id="${attr(row.id)}">Добавить работу</button>`, lists.works.map(adminRequestWorkLine).join(''), 'main'),
    diagnostics: () => adminRequestSection('Диагностики', `<button class="secondary" data-action="diagnostic-add" data-request-id="${attr(row.id)}">Добавить диагностику</button>`, lists.diagnostics.map(adminRequestDiagnosticLine).join(''), 'main'),
    recommendations: () => adminRequestSection('Рекомендации', `<button class="secondary" data-action="recommendation-add" data-request-id="${attr(row.id)}">Добавить рекомендацию</button>`, lists.recommendations.map(adminRequestRecommendationLine).join(''), 'main'),
    updates: () => adminRequestSection('Апдейты', '', lists.updates.map(adminRequestUpdateLine).join(''), 'main'),
    payments: () => adminRequestSection('Оплаты', `<button class="secondary" data-action="payment-add" data-target-type="request" data-target-id="${attr(row.id)}">Добавить платёж</button>`, lists.payments.map(adminRequestPaymentLine).join(''), 'main'),
    about: () => adminRequestAboutPane(row),
  };
  return (panes[state.adminRequestPane] || panes.works)();
}
function adminRequestWorksBody(row={}, works=[]){
  const items = works.map(adminRequestWorkLine).join('');
  return adminRequestSection('Работы', `<button class="secondary" data-action="work-add" data-request-id="${attr(row.id)}">Добавить работу</button>`, items, 'main works');
}
function adminRequestAboutPane(row={}){
  const chips = [
    statusName(row.status || 'planned'),
    row.created_at ? `создан ${time(row.created_at)}` : '',
    row.updated_at ? `обновлён ${time(row.updated_at)}` : '',
  ];
  return `<section class="trebnik-request-section is-main">
    <div class="trebnik-request-section__head"><h3>Описание</h3><div><button class="secondary" data-action="request-edit" data-id="${attr(row.id)}">Править запрос</button></div></div>
    <div class="trebnik-request-about">
      ${trebnikChips(chips)}
      <p>${esc(row.goal || 'Описание пока не заполнено.')}</p>
    </div>
  </section>`;
}
function workCanLog(row={}){
  if(['closed','done','cancelled','canceled','completed'].includes(String(row.status || '').toLowerCase())) return false;
  return workPendingLogDates(row).length > 0;
}
function workPendingLogDates(work={}){
  const type = work.type || '';
  const today = moscowDateValue();
  const logged = loggedWorkDates(work.logs || work.work_logs || []);
  if(type === 'multi'){
    const start = inputDateValue(work.expected_first_result || work.next_due);
    if(!start || (today && start > today)) return [];
    let end = inputDateValue(work.expected_final_result) || (Number(work.total_days || 0) > 0 ? addIsoDays(start, Number(work.total_days || 0) - 1) : today);
    if(today && (!end || end > today)) end = today;
    const dates = [];
    let current = start;
    while(current && current <= end && dates.length < 62){
      if(!logged.has(current)) dates.push(current);
      current = addIsoDays(current, 1);
    }
    return dates;
  }
  const start = inputDateValue(type === 'periodic' ? work.next_due : (work.log_default_date || work.next_due || work.expected_first_result));
  if(!start || (today && start > today)) return [];
  if(type !== 'periodic' || !Number(work.period_days || 0)) return logged.has(start) ? [] : [start];
  const dates = [];
  let current = start;
  const period = Number(work.period_days || 0);
  while(current && current <= today && dates.length < 31){
    if(!logged.has(current)) dates.push(current);
    current = addIsoDays(current, period);
  }
  return dates;
}
function workNextLogDate(row={}){
  return workPendingLogDates(row)[0] || inputDateValue(row.next_due || row.expected_first_result);
}
function workIsOverdue(row={}){
  const pending = workPendingLogDates(row);
  if(!pending.length) return false;
  const next = pending[0];
  const now = moscowDateParts();
  return next < now.date || (next === now.date && now.hour >= 21);
}
function workStatusDotClass(row={}){
  const status = String(row.status || '').toLowerCase();
  if(['completed','done','closed','cancelled','canceled'].includes(status)) return 'is-complete';
  if(workIsOverdue(row)) return 'is-overdue';
  if(['active','planned','paused'].includes(status)) return workCanLog(row) ? 'is-open is-active' : 'is-active';
  return workCanLog(row) ? 'is-open' : 'is-muted';
}
function adminRequestWorkLine(row){
  const terms = workTermRange(row);
  const meta = [statusName(row.status || 'planned'), terms].filter(Boolean).join(' • ');
  const note = String(row.goal || row.description || '').trim();
  return `<article class="trebnik-inline-row is-work" data-action="work-edit" data-id="${attr(row.id)}" role="button" tabindex="0" aria-label="Открыть работу ${attr(row.title || 'Работа')}">
    <span class="trebnik-work-dot ${workStatusDotClass(row)}" aria-hidden="true"></span>
    <div class="trebnik-work-main">
      <strong>${esc(row.title || 'Работа')}</strong>
      <span>${esc(meta || workTypeName(row.type || ''))}</span>
    </div>
    <p class="trebnik-work-note ${note ? '' : 'is-empty'}">${note ? esc(note) : ''}</p>
    <div class="trebnik-inline-actions">
      ${workCanLog(row) ? `<button class="plain trebnik-work-log-icon" data-action="work-log" data-id="${attr(row.id)}" data-log-date="${attr(workNextLogDate(row))}" aria-label="Отметить выполнение" title="Отметить выполнение">✓</button>` : ''}
    </div>
  </article>`;
}
function adminRequestDiagnosticLine(row){
  const meta = diagnosticMetaParts(row, {includeWork:true, includeHidden:true}).join(' · ');
  return `<article class="trebnik-inline-row is-diagnostic">
    <button class="trebnik-inline-open" data-action="diagnostic-detail" data-id="${attr(row.id)}">
      <strong>${esc(row.title || 'Диагностика')}</strong>
      ${row.findings ? `<span>${esc(short(row.findings, 120))}</span>` : (meta ? `<span>${esc(meta)}</span>` : '')}
    </button>
    <div class="trebnik-inline-actions">
      <button class="plain danger" data-action="diagnostic-delete" data-id="${attr(row.id)}">Удалить</button>
    </div>
  </article>`;
}
function adminRequestRecommendationLine(row){
  return `<article class="trebnik-inline-row">
    <div>
      <strong>${esc(statusName(row.status || 'active'))}</strong>
      <span>${esc(short(row.text || '', 140) || 'без текста')}</span>
    </div>
    <div class="trebnik-inline-actions">
      <button class="plain" data-action="recommendation-edit" data-id="${attr(row.id)}">Править</button>
      <button class="plain" data-action="recommendation-cancel" data-id="${attr(row.id)}">Отменить</button>
    </div>
  </article>`;
}
function adminRequestUpdateLine(row){
  const normalized = normalizeClientUpdateForCard(row);
  return `<article class="trebnik-inline-row">
    <button class="trebnik-inline-open" data-action="update-detail" data-id="${attr(row.id)}">
      <strong>${esc(normalized.title || 'Апдейт')}</strong>
      <span>${esc(short(normalized.text || row.text || '', 150))}</span>
    </button>
    <div class="trebnik-inline-actions">
      <em>${esc(time(row.created_at))}</em>
      ${canShowUpdateReadAction(row) ? `<button class="plain" data-action="update-read" data-id="${attr(row.id)}">Прочитано</button>` : ''}
    </div>
  </article>`;
}
function adminRequestPaymentLine(row){
  const pending = Number(row.confirmed || 0) !== 1;
  const target = row.work_title ? ` · ${row.work_title}` : '';
  return `<article class="trebnik-inline-row">
    <div>
      <strong>${money(row.amount || 0)}</strong>
      <span>${esc(pending ? `на проверке · ${time(row.created_at)}${target}` : `подтверждён · ${time(row.created_at)}${target}`)}</span>
    </div>
    ${pending ? `<div class="trebnik-inline-actions">
      <button class="plain" data-action="payment-review" data-target-type="request" data-payment-id="${attr(row.id)}" data-decision="confirmed">Подтвердить</button>
      <button class="plain danger" data-action="payment-review" data-target-type="request" data-payment-id="${attr(row.id)}" data-decision="rejected">Отклонить</button>
    </div>` : ''}
  </article>`;
}
function adminRequestInlineDetail(row, payload){
  const works = adminRowsForRequest(payload.works || [], row.id).sort((a,b) => String(workMainDate(b) || '').localeCompare(String(workMainDate(a) || '')) || Number(workCanLog(b)) - Number(workCanLog(a)));
  const diagnostics = adminRowsForRequest(payload.diagnostics || [], row.id);
  const recommendations = adminRowsForRequest(payload.recommendations || [], row.id);
  const updatesById = new Map();
  [...(payload.recent_updates || []), ...(payload.updates || [])].forEach(item => updatesById.set(String(item.id || `${item.created_at}-${item.text}`), item));
  const updates = adminRowsForRequest([...updatesById.values()], row.id).sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 8);
  const payments = adminRowsForRequest(payload.request_payments || [], row.id).sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || ''))).slice(0, 8);
  const lists = {works, diagnostics, recommendations, updates, payments};
  return `<div class="trebnik-request-detail">
    ${adminRequestInlineMoney(row)}
    <div class="trebnik-request-pane-body">${adminRequestWorksBody(row, lists.works)}</div>
  </div>`;
}
function adminClientLooseRequestItems(diagnostics=[], recommendations=[]){
  if(!diagnostics.length && !recommendations.length) return '';
  return `<div class="trebnik-loose-items">
    ${diagnostics.length ? `<section>
      <h3>Диагностики без запроса</h3>
      <div>${diagnostics.map(adminClientDiagnosticCard).join('')}</div>
    </section>` : ''}
    ${recommendations.length ? `<section>
      <h3>Рекомендации без запроса</h3>
      <div>${recommendations.map(adminClientRecommendationCard).join('')}</div>
    </section>` : ''}
  </div>`;
}
function adminClientDiagnosticCard(row){
  return `<article class="trebnik-loose-card">
    <div>
      <strong>${esc(row.title || 'Диагностика')}</strong>
      ${row.findings ? `<p>${esc(short(row.findings, 150))}</p>` : ''}
      <span>${esc([row.type || '', money(row.cost || 0)].filter(Boolean).join(' · '))}</span>
    </div>
    <div>
      <button class="plain danger" data-action="diagnostic-delete" data-id="${attr(row.id)}">Удалить</button>
    </div>
  </article>`;
}
function adminClientRecommendationCard(row){
  return `<article class="trebnik-loose-card">
    <div>
      <strong>${esc(statusName(row.status || 'active'))}</strong>
      <p>${esc(short(row.text || '', 170))}</p>
    </div>
    <div>
      <button class="plain" data-action="recommendation-edit" data-id="${attr(row.id)}">Править</button>
      <button class="plain" data-action="recommendation-cancel" data-id="${attr(row.id)}">Отменить</button>
      <button class="plain danger" data-action="recommendation-delete" data-id="${attr(row.id)}">Удалить</button>
    </div>
  </article>`;
}
function adminSortDiagnostics(rows=[]){
  return [...(Array.isArray(rows) ? rows : [])].sort((a,b) => String(b.created_at || b.id || '').localeCompare(String(a.created_at || a.id || '')));
}
function adminActiveDiagnostic(rows=[]){
  if(!rows.length){
    state.adminDiagnosticId = '';
    return null;
  }
  const current = rows.find(row => String(row.id || '') === String(state.adminDiagnosticId || ''));
  const active = current || rows[0];
  state.adminDiagnosticId = String(active.id || '');
  return active;
}
function adminDiagnosticMasterItem(row={}, active=null){
  const selected = active && String(active.id || '') === String(row.id || '');
  const meta = diagnosticMetaParts(row, {includeRequest:true, includeWork:true, includeHidden:true}).slice(0, 3);
  return `<button class="trebnik-request-master__item ${selected ? 'active' : ''}" data-action="diagnostic-select" data-id="${attr(row.id || '')}" aria-pressed="${selected ? 'true' : 'false'}">
    <span class="trebnik-request-master__copy">
      <strong>${esc(row.title || 'Диагностика')}</strong>
      ${trebnikChips(meta)}
    </span>
  </button>`;
}
function adminDiagnosticDetailPane(row={}){
  if(!row?.id) return '<div class="trebnik-request-empty"><span>Выберите диагностику.</span></div>';
  const facts = diagnosticMetaParts(row, {includeRequest:true, includeWork:true, includeHidden:true});
  const hidden = Boolean(row.is_hidden);
  return `<article class="trebnik-request-detail admin-diagnostic-detail">
    <header class="trebnik-request-detail__head">
      <div><h3>${esc(row.title || 'Диагностика')}</h3><p>${esc(facts.join(' · ') || 'диагностика')}</p></div>
      <div class="row">
        <details class="trebnik-request-menu admin-diagnostic-menu">
          <summary aria-label="Управление диагностикой" title="Управление диагностикой"><span aria-hidden="true">⋯</span></summary>
          <div role="menu">
            <button class="plain" type="button" role="menuitem" data-action="diagnostic-edit" data-id="${attr(row.id)}">Изменить</button>
            <button class="plain" type="button" role="menuitem" data-action="diagnostic-toggle-hidden" data-id="${attr(row.id)}">${hidden ? 'Открыть клиенту' : 'Скрыть от клиента'}</button>
            <button class="plain danger" type="button" role="menuitem" data-action="diagnostic-delete" data-id="${attr(row.id)}">Удалить</button>
          </div>
        </details>
      </div>
    </header>
    <section class="trebnik-request-section is-main">
      <div class="trebnik-request-section__body">
        <div class="client-request-full-text">${esc(row.findings || 'Описание диагностики пока не заполнено.')}</div>
      </div>
    </section>
  </article>`;
}
function adminDiagnosticMobileItem(row={}){
  const id = String(row.id || '');
  const isOpen = id && String(state.adminDiagnosticOpenId || '') === id;
  const menuOpen = id && String(state.adminDiagnosticMenuId || '') === id;
  const hidden = Boolean(row.is_hidden);
  const facts = diagnosticMetaParts(row, {includeRequest:true, includeWork:true, includeHidden:true}).slice(0, 3);
  return `<article class="admin-diagnostic-mobile-card ${isOpen ? 'is-open' : ''}">
    <div class="admin-diagnostic-mobile-card__top">
      <button class="admin-diagnostic-mobile-card__summary" type="button" data-action="diagnostic-mobile-toggle" data-id="${attr(id)}" aria-expanded="${isOpen ? 'true' : 'false'}">
        <strong>${esc(row.title || 'Диагностика')}</strong>
        ${trebnikChips(facts)}
      </button>
      <div class="admin-diagnostic-mobile-actions">
        <button class="plain admin-diagnostic-mobile-menu-button" type="button" data-action="diagnostic-mobile-menu" data-id="${attr(id)}" aria-expanded="${menuOpen ? 'true' : 'false'}" aria-label="Действия с диагностикой"><span aria-hidden="true">⋯</span></button>
        <div class="admin-diagnostic-mobile-menu" ${menuOpen ? '' : 'hidden'} role="menu">
          <button class="plain" type="button" role="menuitem" data-action="diagnostic-edit" data-id="${attr(id)}">Изменить</button>
          <button class="plain" type="button" role="menuitem" data-action="diagnostic-toggle-hidden" data-id="${attr(id)}">${hidden ? 'Открыть клиенту' : 'Скрыть от клиента'}</button>
          <button class="plain danger" type="button" role="menuitem" data-action="diagnostic-delete" data-id="${attr(id)}">Удалить</button>
        </div>
      </div>
    </div>
    <div class="admin-diagnostic-mobile-card__body">
      <div class="client-request-full-text">${esc(row.findings || 'Описание диагностики пока не заполнено.')}</div>
    </div>
  </article>`;
}
function adminClientDiagnosticsHtml(payload){
  const rows = adminSortDiagnostics(payload.diagnostics || []);
  if(!rows.length){
    return `<div class="trebnik-request-empty">
      <span>У клиента пока нет диагностик.</span>
      <button class="primary" data-action="diagnostic-add">Новая диагностика</button>
    </div>`;
  }
  const active = adminActiveDiagnostic(rows);
  return `<div class="admin-diagnostics-mobile" aria-label="Диагностики клиента">
    ${rows.map(adminDiagnosticMobileItem).join('')}
  </div>
  <div class="trebnik-request-workbench admin-diagnostics-desktop">
    <aside class="trebnik-request-master" aria-label="Диагностики клиента">
      <div class="trebnik-request-master__list">${rows.map(row => adminDiagnosticMasterItem(row, active)).join('')}</div>
    </aside>
    <section class="trebnik-request-detail-pane">${adminDiagnosticDetailPane(active)}</section>
  </div>`;
}
function adminClientWorksHtml(payload){
  const rows = payload.works || [];
  const requestOptions = (payload.requests || []).map(row => `<option value="${attr(row.id)}">${esc(row.title || 'Запрос')}</option>`).join('');
  const add = requestOptions ? '<button class="primary" data-action="work-add">Добавить работу</button>' : '';
  return `${adminClientSectionHead('Работы', add)}<div class="trebnik-cards">${rows.map(adminClientWorkCard).join('') || empty('Работ пока нет.')}</div>`;
}
function adminClientWorkCard(row){
  const type = workTypeName(row.type || '');
  const terms = workTermRange(row);
  const status = statusName(row.status || 'planned');
  return `<article class="trebnik-card">
    <div class="trebnik-card__main">
      <strong>${esc(row.title || 'Работа')}</strong>
      ${trebnikChips([type, status, terms])}
      ${row.request_title ? `<p>${esc(row.request_title)}</p>` : ''}
    </div>
    <div class="trebnik-card__actions">
      <button class="plain" data-action="work-detail" data-id="${attr(row.id)}">Открыть</button>
      <button class="secondary" data-action="work-log" data-id="${attr(row.id)}" data-log-date="${attr(inputDateValue(row.next_due || row.expected_first_result))}">Выполнение</button>
      <button class="plain" data-action="work-edit" data-id="${attr(row.id)}">Править</button>
      <button class="plain danger" data-action="work-delete" data-id="${attr(row.id)}">Удалить</button>
    </div>
  </article>`;
}
function adminClientServicesHtml(payload){
  const rows = payload.services || [];
  return `${adminClientSectionHead('Услуги', '<button class="primary" data-action="service-add">Добавить услугу</button>')}<div class="trebnik-cards">${rows.map(adminClientServiceCard).join('') || empty('Услуг пока нет.')}</div>`;
}
function adminClientServiceCard(row){
  const f = row.financials || {};
  const isPeriodic = String(row.service_kind || '') === 'periodic';
  const debt = Number(f.debt || f.money_debt_total || row.display_debt_total || 0);
  const pending = Number(f.pending || f.money_pending_total || row.pending_total || 0);
  const chips = [
    row.state_label || statusName(row.status || 'active'),
    isPeriodic ? (row.active_until ? `до ${dateLong(row.active_until)}` : 'срок не указан') : 'разовая',
    row.payment_mode === 'first_payment' ? 'цена по первой оплате' : '',
    pending > 0 ? `${money(pending)} на проверке` : '',
    debt > 0 ? `${money(debt)} к оплате` : '',
  ].filter(Boolean);
  return `<article class="trebnik-card">
    <div class="trebnik-card__main">
      <strong>${esc(row.title || 'Услуга')}</strong>
      ${trebnikChips(chips)}
    </div>
    <div class="trebnik-card__actions">
      <button class="plain" data-action="service-detail" data-id="${attr(row.id)}">Детали</button>
      <button class="plain" data-action="payment-add" data-target-type="service" data-target-id="${attr(row.id)}">Платёж</button>
      <button class="plain" data-action="service-edit" data-id="${attr(row.id)}">Править</button>
    </div>
  </article>`;
}
function adminClientPaymentsHtml(payload){
  const requestRows = (payload.request_payments || []).map(row => ({...row, target_type:'request', target_id:row.request_id}));
  const serviceRows = (payload.service_payments || []).map(row => ({...row, target_type:'service', target_id:row.service_id}));
  const rows = [...requestRows, ...serviceRows].sort((a,b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  return `${adminClientSectionHead('Оплаты', '<button class="primary" data-action="payment-add">Добавить платёж</button>')}<div class="trebnik-cards">${rows.map(adminClientPaymentCard).join('') || empty('Оплат пока нет.')}</div>`;
}
function adminClientPaymentCard(row){
  const confirmed = Number(row.confirmed || 0) === 1;
  return `<article class="trebnik-card">
    <div class="trebnik-card__main">
      <strong>${money(row.amount || 0)}</strong>
      ${trebnikChips([row.target_title || 'Пункт Требника', confirmed ? 'подтверждён' : 'ждёт подтверждения', time(row.created_at)])}
    </div>
    <div class="trebnik-card__actions">
      <button class="plain" data-action="${row.target_type === 'service' ? 'service-detail' : 'request-detail'}" data-id="${attr(row.target_id)}">Открыть</button>
      ${confirmed ? '' : `<button class="secondary" data-action="payment-review" data-target-type="${attr(row.target_type)}" data-payment-id="${attr(row.id)}" data-decision="confirmed">Подтвердить</button><button class="plain danger" data-action="payment-review" data-target-type="${attr(row.target_type)}" data-payment-id="${attr(row.id)}" data-decision="rejected">Отклонить</button>`}
    </div>
  </article>`;
}
function adminClientUpdatesHtml(payload){
  const rows = payload.recent_updates || [];
  return `${adminClientSectionHead('Апдейты', '')}<div class="trebnik-cards">${rows.map(adminClientUpdateCard).join('') || empty('Апдейтов пока нет.')}</div>`;
}
function adminClientUpdateCard(row){
  const normalized = normalizeClientUpdateForCard(row);
  return `<article class="trebnik-card">
    <div class="trebnik-card__main">
      <strong>${normalized.title}</strong>
      ${trebnikChips([time(row.created_at), normalized.target])}
      <p>${esc(short(normalized.text || '', 220))}</p>
    </div>
    <div class="trebnik-card__actions">
      ${row.id ? `<button class="plain" data-action="update-detail" data-id="${attr(row.id)}">Открыть</button>` : ''}
      ${canShowUpdateReadAction(row) ? `<button class="secondary" data-action="update-read" data-id="${attr(row.id)}">Прочитано</button>` : ''}
    </div>
  </article>`;
}
function normalizeClientUpdateForCard(row={}){
  const text = String(row.text || '');
  const isQuestion = isClientQuestionKind(row.kind);
  const target = row.request_title ? `Запрос: ${row.request_title}` : (row.service_title ? `Услуга: ${row.service_title}` : '');
  return {title:isQuestion ? 'Вопрос клиента' : 'Апдейт клиента', text, target};
}
function adminClientNotificationsHtml(payload){
  const siteRows = Array.isArray(payload.notifications) ? payload.notifications : [];
  const telegramRows = Array.isArray(payload.outgoing_notifications) ? payload.outgoing_notifications : [];
  const siteHtml = siteRows.map(adminClientNotificationCard).join('') || empty('Уведомлений на сайте пока нет.');
  const telegramHtml = telegramRows.map(adminClientSentNoticeCard).join('') || empty('Сообщений в Telegram пока нет.');
  return `<div class="client-notice-groups">
    ${adminClientSectionHead('Уведомления на сайте', '')}
    <div class="trebnik-cards">${siteHtml}</div>
    ${adminClientSectionHead('Сообщения в Telegram', '')}
    <div class="trebnik-cards">${telegramHtml}</div>
  </div>`;
}
function adminClientNotificationCard(row={}){
  const unread = !row.read_at;
  const targetType = row.request_id ? 'request' : (row.service_id ? 'service' : '');
  const targetId = row.request_id || row.service_id || '';
  return `<article class="trebnik-card client-notification-card ${unread ? 'is-unread' : ''}">
    <div class="trebnik-card__main">
      <strong>${esc(row.title || 'Уведомление')}</strong>
      ${trebnikChips([time(row.updated_at || row.created_at), (row.channels || []).includes('telegram') ? 'Telegram' : '', Number(row.count || 1) > 1 ? `${row.count} события` : '', unread ? 'не прочитано' : 'прочитано'])}
      ${row.body ? `<p>${esc(short(row.body || '', 220))}</p>` : ''}
    </div>
    <div class="trebnik-card__actions">
      ${targetType && targetId ? `<button class="plain" data-action="${targetType === 'request' ? 'request-detail' : 'service-detail'}" data-id="${attr(targetId)}">Открыть</button>` : ''}
    </div>
  </article>`;
}
function outgoingNoticeStatus(row={}){
  const status = String(row.status || '');
  if(status === 'sent') return 'Отправлено';
  if(status === 'pending') return 'Ждет отправки';
  if(status === 'failed') return 'Не отправилось';
  return status || '';
}
function telegramNoticeHtml(text=''){
  return esc(text || '')
    .replace(/&lt;(\/?)(b|strong|i|em|u|s|code|pre)&gt;/gi, '<$1$2>')
    .replace(/\r?\n/g, '<br>');
}
function outgoingNoticeError(row={}){
  if(!row.last_error) return '';
  const text = String(row.last_error) === 'TrebnikApiError'
    ? 'Бот не смог отправить это сообщение. Чаще всего причина в связи с Telegram или доступе клиента к боту.'
    : row.last_error;
  return `<p class="form-note is-warning">${esc(text)}</p>`;
}
function adminClientSentNoticeCard(row={}){
  const sentAt = row.sent_at || row.updated_at || row.created_at;
  const targetType = row.request_id ? 'request' : (row.service_id ? 'service' : '');
  const targetId = row.request_id || row.service_id || '';
  const error = outgoingNoticeError(row);
  const tone = String(row.status || '') === 'failed' ? 'is-warning' : '';
  return `<article class="trebnik-card client-notification-card ${tone}">
    <div class="trebnik-card__main">
      <strong>${esc(outgoingNoticeStatus(row) || 'Уведомление')}</strong>
      ${trebnikChips([time(sentAt), 'Telegram', row.attempts ? `${row.attempts} попыток` : ''])}
      <div class="trebnik-notice-text">${telegramNoticeHtml(row.text || '')}</div>
      ${error}
    </div>
    <div class="trebnik-card__actions">
      ${targetType && targetId ? `<button class="plain" data-action="${targetType === 'request' ? 'request-detail' : 'service-detail'}" data-id="${attr(targetId)}">Открыть</button>` : ''}
    </div>
  </article>`;
}
function adminClientAccessHtml(payload){
  const notes = payload.admin_notes || [];
  const linked = payload.linked_user || null;
  const linkedHtml = linked
    ? `<div class="trebnik-profile-link"><div class="trebnik-profile-link__main"><strong>${esc(linked.display_name || linked.nickname || 'Профиль сайта')}</strong>${trebnikChips([linked.nickname ? '@' + linked.nickname : '', linked.email || '', linked.last_seen ? `был ${time(linked.last_seen)}` : '', linked.trebnik_linked_at ? `привязан ${time(linked.trebnik_linked_at)}` : ''])}</div><div class="trebnik-profile-link__actions"><button class="secondary" data-action="link-public-profile" data-client-id="${attr(payload.client?.id || state.clientId || '')}">Сменить</button><button class="plain danger" data-action="unlink-public-profile" data-client-id="${attr(payload.client?.id || state.clientId || '')}">Отвязать</button></div></div>`
    : `<div class="trebnik-profile-link"><div class="trebnik-profile-link__main"><strong>Профиль не привязан</strong></div><div class="trebnik-profile-link__actions"><button class="primary" data-action="link-public-profile" data-client-id="${attr(payload.client?.id || state.clientId || '')}">Привязать</button></div></div>`;
  return `<div class="trebnik-client-access">
    ${adminClientSectionHead('Заметки и профиль', '<button class="secondary" data-action="note">Заметка</button>')}
    ${linkedHtml}
    <div class="trebnik-danger-zone">
      <button class="secondary" data-action="client-rename">Переименовать</button>
      <button class="plain danger" data-action="client-archive">Архивировать</button>
      <button class="plain danger" data-action="client-delete">Удалить</button>
    </div>
    <div class="trebnik-cards">${notes.slice().reverse().map(note => `<article class="trebnik-card"><div class="trebnik-card__main"><strong>${time(note.created_at)}</strong><p>${esc(note.text || '')}</p></div></article>`).join('') || empty('Внутренних заметок пока нет.')}</div>
  </div>`;
}
function compactInquiryRow(row){
  const closed = row.status === 'closed';
  return `<div class="admin-trebnik__row">
    <span class="admin-trebnik__cell"><strong>${esc(row.material_title || 'Заявка')}</strong><br><span class="subtle">${esc(row.name || 'Без имени')} · ${esc(row.contact || '')}</span></span>
    <span class="admin-trebnik__cell">${esc(short(row.message || row.text || '', 90))}</span>
    <span class="admin-trebnik__cell is-priority"><span class="admin-trebnik__status ${closed ? '' : 'is-draft'}">${esc(statusName(row.status || 'new'))}</span></span>
    <span class="admin-trebnik__cell is-actions">${!closed && row.id ? `<button class="plain" data-action="inquiry-status" data-id="${attr(row.id)}" data-status="processing">В работу</button><button class="plain" data-action="inquiry-status" data-id="${attr(row.id)}" data-status="closed">Закрыть</button>` : time(row.created_at)}</span>
  </div>`;
}
function adminTrebnikInquiriesHtml(){
  const unreadMessages = adminUnreadClientUpdates(state.dashboard?.fresh_client_messages || state.dashboard?.client_messages || []);
  const readAllButton = unreadMessages.length ? `<button class="secondary" data-action="updates-read-all">Прочитать все</button>` : '';
  return `<div class="admin-editor__panel admin-trebnik-updates"><div class="admin-trebnik__toolbar"><div><h2 class="admin-editor__panel-title">Апдейты</h2></div>${readAllButton}</div>
    <div class="trebnik-updates-scroll">
      <section class="trebnik-update-group"><div class="admin-trebnik__compact-list">${unreadMessages.map(adminClientUpdateItem).join('') || empty('Непрочитанных апдейтов нет.')}</div></section>
    </div>
  </div>`;
}
function ritebookTypeName(type=''){
  return {once:'разовая', multi:'многодневная', periodic:'периодическая'}[type] || 'разовая';
}
const RITEBOOK_DEFAULT_CATEGORIES = ['служебная', 'защита', 'приворот', 'вызов', 'отворот'];
function ritebookNormalizeCategory(value=''){
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase() || RITEBOOK_DEFAULT_CATEGORIES[0];
}
function ritebookCategory(row={}){
  return ritebookNormalizeCategory(row.category);
}
function ritebookCategoryTitle(value=''){
  const category = ritebookNormalizeCategory(value);
  return category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Служебная';
}
function ritebookCategories(rows=[]){
  const seen = new Set(RITEBOOK_DEFAULT_CATEGORIES);
  (Array.isArray(rows) ? rows : []).forEach(row => seen.add(ritebookCategory(row)));
  return [...RITEBOOK_DEFAULT_CATEGORIES, ...[...seen].filter(category => !RITEBOOK_DEFAULT_CATEGORIES.includes(category)).sort((a,b) => a.localeCompare(b, 'ru'))];
}
function ritebookCategoryOptions(selected=''){
  const current = ritebookNormalizeCategory(selected);
  const categories = ritebookCategories(ritebookCatalog());
  if(current && !categories.includes(current)) categories.push(current);
  return categories.map(category => `<option value="${attr(category)}" ${category === current ? 'selected' : ''}>${esc(ritebookCategoryTitle(category))}</option>`).join('');
}
function ritebookTypeFilterName(filter='all'){
  return filter === 'all' ? 'Все работы' : ritebookCategoryTitle(filter);
}
function ritebookCountText(count=0){
  const n = Number(count || 0);
  return `${n} ${ruPlural(n, 'работа', 'работы', 'работ')}`;
}
function ritebookShortCountText(count=0){
  const n = Number(count || 0);
  return `${n} ${ruPlural(n, 'работа', 'работы', 'работ')}`;
}
function ritebookCatalog(){
  return (Array.isArray(state.dashboard?.work_catalog) ? state.dashboard.work_catalog : [])
    .filter(row => row?.key && row?.title)
    .slice()
    .sort((a,b) => (Number(b.count || 0) - Number(a.count || 0)) || String(a.title || '').localeCompare(String(b.title || ''), 'ru'));
}
function ritebookScheduleText(row={}){
  const type = row.type || 'once';
  const total = Number(row.total_days || 0);
  const period = Number(row.period_days || 0);
  const times = Number(row.period_times || 0);
  if(type === 'multi') return total > 0 ? `${total} ${ruPlural(total, 'день', 'дня', 'дней')}` : 'несколько дней';
  if(type === 'periodic'){
    const parts = [];
    if(period > 0) parts.push(`каждые ${period} ${ruPlural(period, 'день', 'дня', 'дней')}`);
    if(times > 0) parts.push(`${times} ${ruPlural(times, 'раз', 'раза', 'раз')}`);
    return parts.join(' · ') || 'повторяется';
  }
  return 'один день';
}
function ritebookUseText(row={}){
  const count = Number(row.count || 0);
  if(!count) return 'ещё не использовалась';
  return `${count} ${ruPlural(count, 'раз', 'раза', 'раз')}`;
}
function ritebookMetaText(row={}){
  const items = [
    ritebookTypeName(row.type || 'once'),
    ritebookScheduleText(row),
  ].filter(Boolean);
  return items.join(' · ');
}
function ritebookRowsByFilter(rows=[], filter='all'){
  if(filter && filter !== 'all') return rows.filter(row => ritebookCategory(row) === ritebookNormalizeCategory(filter));
  return rows;
}
function ritebookStat(label, value, filter){
  const active = (state.adminRitebookFilter || 'all') === filter;
  return `<button class="ritebook-stat ${active ? 'active' : ''}" data-action="ritebook-filter" data-filter="${attr(filter)}" aria-pressed="${active ? 'true' : 'false'}"><span>${esc(label)}</span><strong>${esc(value)}</strong></button>`;
}
function ritebookHeroHtml(rows=[]){
  return `<section class="ritebook-hero">
    ${ritebookCategories(rows).map(category => ritebookStat(ritebookCategoryTitle(category), rows.filter(row => ritebookCategory(row) === category).length, category)).join('')}
  </section>`;
}
function ritebookExamplesText(row={}){
  const examples = Array.isArray(row.examples) ? row.examples.filter(Boolean) : [];
  if(examples.length) return examples.slice(0, 3).join(', ');
  return row.latest_client_name || '';
}
function adminRitebookRow(row={}){
  const key = row.key || '';
  const category = ritebookCategory(row);
  return `<article class="ritebook-row">
    <button class="ritebook-row-main" data-action="ritebook-edit" data-key="${attr(key)}">
      <strong>${esc(row.title || 'Работа')}</strong>
      <span>${esc(row.goal ? short(row.goal, 190) : 'Пояснение пока не задано.')}</span>
    </button>
    <div class="ritebook-row-terms">
      <b>${esc(ritebookCategoryTitle(category))}</b>
      <span>${esc(ritebookMetaText(row))}</span>
    </div>
    <div class="ritebook-row-use">
      <b>${esc(ritebookUseText(row))}</b>
      ${row.catalog_updated_at ? `<span>правилось ${date(row.catalog_updated_at)}</span>` : (row.last_used_at ? `<span>${time(row.last_used_at)}</span>` : '')}
    </div>
    <div class="ritebook-row-actions">
      <button class="plain" data-action="ritebook-edit" data-key="${attr(key)}">Править</button>
    </div>
  </article>`;
}
function ritebookMobileFilterOptions(rows=[], selected='all'){
  const total = rows.length;
  const current = selected || 'all';
  const all = `<option value="all" ${current === 'all' ? 'selected' : ''}>Все работы - ${total}</option>`;
  const options = ritebookCategories(rows).map(category => {
    const count = rows.filter(row => ritebookCategory(row) === category).length;
    return `<option value="${attr(category)}" ${category === current ? 'selected' : ''}>${esc(ritebookCategoryTitle(category))} - ${count}</option>`;
  }).join('');
  return all + options;
}
function adminRitebookMobileRow(row={}){
  const key = row.key || '';
  const meta = [
    ritebookCategoryTitle(ritebookCategory(row)),
    ritebookUseText(row),
    ritebookScheduleText(row),
  ].filter(Boolean);
  return `<article class="client-action-row admin-ritebook-mobile-row has-actions">
    <button class="client-action-row__main" data-action="ritebook-edit" data-key="${attr(key)}">
      <strong>${esc(row.title || 'Работа')}</strong>
      <span class="client-service-mobile-meta">${meta.map(item => `<span>${esc(item)}</span>`).join('')}</span>
    </button>
    <div class="client-action-row__actions">
      <button class="plain client-compact-action" data-action="ritebook-edit" data-key="${attr(key)}">Править</button>
    </div>
  </article>`;
}
function adminRitebookMobileHtml(rows=[], filter='all', filtered=[]){
  const activeName = ritebookTypeFilterName(filter);
  return `<section class="trebnik-ritebook admin-ritebook-mobile">
    <div class="admin-mobile-filter">
      <label for="adminRitebookMobileFilter"><span>Раздел</span></label>
      <select id="adminRitebookMobileFilter" class="admin-mobile-select" aria-label="Раздел Обрядника">
        ${ritebookMobileFilterOptions(rows, filter)}
      </select>
      <b>${esc(ritebookShortCountText(filtered.length))}</b>
    </div>
    <section class="client-main-section admin-ritebook-mobile-section">
      <div class="client-main-section__head"><h3>${esc(activeName)}</h3><div class="row"></div></div>
      <div class="client-main-list admin-ritebook-mobile-list">
        ${filtered.map(adminRitebookMobileRow).join('') || clientMainEmpty('В этом разделе пока нет работ.')}
      </div>
    </section>
  </section>`;
}
function adminTrebnikServicesHtml(){
  const rows = ritebookCatalog();
  const filter = state.adminRitebookFilter || 'all';
  const filtered = ritebookRowsByFilter(rows, filter);
  if(clientMobileViewport()) return adminRitebookMobileHtml(rows, filter, filtered);
  return `<section class="trebnik-ritebook">
    ${ritebookHeroHtml(rows)}
    <section class="ritebook-board">
      <div class="ritebook-board-head"><h2>${esc(ritebookTypeFilterName(filter))}</h2><span>${esc(ritebookCountText(filtered.length))}</span></div>
      <div class="ritebook-list">${filtered.map(adminRitebookRow).join('') || empty('В Обряднике пока нет работ.')}</div>
    </section>
  </section>`;
}
function adminTrebnikPaymentsHtml(){
  if(state.adminFinanceError){
    return `<section class="trebnik-finance"><article class="finance-topline is-error">
      <div><p>Финансовый кабинет временно недоступен. Данные Требника не загружены.</p></div>
      <button class="secondary" data-action="finance-refresh">Повторить</button>
    </article></section>`;
  }
  if(!state.adminFinance){
    return `<section class="trebnik-finance"><article class="finance-topline"><p>${esc('Открываю живой финансовый кабинет…')}</p></article>${loading('Собираю деньги, долги и платежи…')}</section>`;
  }
  const finance = state.adminFinance || {};
  state.adminFinanceFilter = state.adminFinanceFilter || 'all';
  state.adminFinanceSearch = state.adminFinanceSearch || '';
  const summary = finance.summary || {};
  const model = financeCockpitModel(finance);
  return `<section class="trebnik-finance" data-finance-revision="${attr(finance.revision || '')}">
    ${financeCockpitHeroHtml(summary, model)}
    <div class="finance-cockpit">
      ${financeActionCenterHtml(model)}
    </div>
  </section>`;
}
function financeNumber(value){
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}
function financeCockpitModel(finance=state.adminFinance || {}){
  const debts = financeDebtItems(finance).sort(financeDebtSort);
  const pendingPayments = financePendingPayments(finance.payments || {});
  const pendingKeys = new Set(pendingPayments.map(row => financeItemKey(row)).filter(Boolean));
  const visibleDebts = debts.filter(item => !pendingKeys.has(financeItemKey(item)));
  const overdueDebts = visibleDebts.filter(item => item.is_overdue).sort(financeDebtSort);
  const waitingDebts = visibleDebts.filter(item => !item.is_overdue).sort(financeDebtSort);
  const dueSoonDebts = waitingDebts.filter(item => financeDebtBucket(item) === 'soon');
  const clients = financeClientRows(finance, pendingPayments);
  return {
    debts,
    pendingPayments,
    pendingKeys,
    visibleDebts,
    overdueDebts,
    waitingDebts,
    dueSoonDebts,
    clients,
    actionItems: financeActionItems(pendingPayments, overdueDebts, dueSoonDebts, waitingDebts),
    paidRows: financePaidRows(finance.payments || {}),
    ledgerRows: financeLedgerRows(finance.payments || {}),
    workRows: financeWorkRows(finance.payments || {}, visibleDebts),
  };
}
function financeCockpitHeroHtml(summary={}, model={}){
  const debt = financeNumber(summary.debt_total);
  const overdue = financeNumber(summary.overdue_total);
  const pendingFromPayments = (model.pendingPayments || []).reduce((sum, row) => sum + financeNumber(row.amount), 0);
  const pending = Math.max(financeNumber(summary.pending_total), pendingFromPayments);
  const income = financeIncomeSummary(summary, model);
  const selectedMonth = financeSelectedIncomeMonth(income);
  const monthAmount = financeNumber(selectedMonth?.amount ?? financeCurrentMonthPaid(summary, model));
  const monthLabel = selectedMonth?.key ? financeMonthLabelFromKey(selectedMonth.key) : financeMonthLabel();
  return `<section class="finance-hero">
    ${financeIncomeHeroStat(monthLabel, money(monthAmount), income, selectedMonth?.key || financeCurrentMonthKey(), monthAmount > 0 ? 'is-good' : '')}
    ${financeDebtHeroStat('Долг', money(debt), model.visibleDebts || [], debt > 0 ? 'is-main' : '')}
    ${financeOverdueHeroStat('Просрочено', money(overdue), model.overdueDebts || [], overdue > 0 ? 'is-danger' : '')}
    ${financePendingHeroStat('Подтвердить', money(pending), model.pendingPayments || [], pending > 0 ? 'is-wait' : '')}
  </section>`;
}
function financeMetric(label, value, tone='', icon=''){
  return `<article class="finance-metric ${attr(tone)}"><span>${esc(label)}</span><strong class="finance-amount">${esc(value)}</strong></article>`;
}
function financeHeroStat(label, value, view='', tone=''){
  const expanded = view === 'paid' && state.adminFinanceIncomeOpen ? ' aria-expanded="true"' : '';
  return `<button class="finance-hero-stat ${attr(tone)}" data-action="finance-view" data-view="${attr(view)}"${expanded}><span>${esc(label)}</span><strong class="finance-amount">${esc(value)}</strong></button>`;
}
function financeIncomeHeroStat(label, value, income={}, selectedKey='', tone=''){
  const open = Boolean(state.adminFinanceIncomeOpen);
  return `<div class="finance-hero-cell is-income">
    <button class="finance-hero-stat ${attr(tone)} ${open ? 'active' : ''}" data-action="finance-view" data-view="paid" aria-expanded="${open ? 'true' : 'false'}"><span>${esc(label)}</span><strong class="finance-amount">${esc(value)}</strong></button>
    ${open ? financeIncomeMenuHtml(income, selectedKey) : ''}
  </div>`;
}
function financeDebtHeroStat(label, value, debts=[], tone=''){
  const open = Boolean(state.adminFinanceDebtOpen);
  return `<div class="finance-hero-cell is-debt">
    <button class="finance-hero-stat ${attr(tone)} ${open ? 'active' : ''}" data-action="finance-view" data-view="debt" aria-expanded="${open ? 'true' : 'false'}"><span>${esc(label)}</span><strong class="finance-amount">${esc(value)}</strong></button>
    ${open ? financeDebtMenuHtml(debts) : ''}
  </div>`;
}
function financeOverdueHeroStat(label, value, debts=[], tone=''){
  const open = Boolean(state.adminFinanceOverdueOpen);
  return `<div class="finance-hero-cell is-overdue">
    <button class="finance-hero-stat ${attr(tone)} ${open ? 'active' : ''}" data-action="finance-view" data-view="overdue" aria-expanded="${open ? 'true' : 'false'}"><span>${esc(label)}</span><strong class="finance-amount">${esc(value)}</strong></button>
    ${open ? financeDebtMenuHtml(debts, 'Просроченных долгов нет') : ''}
  </div>`;
}
function financePendingHeroStat(label, value, payments=[], tone=''){
  const open = Boolean(state.adminFinancePendingOpen);
  return `<div class="finance-hero-cell is-pending">
    <button class="finance-hero-stat ${attr(tone)} ${open ? 'active' : ''}" data-action="finance-view" data-view="pending" aria-expanded="${open ? 'true' : 'false'}"><span>${esc(label)}</span><strong class="finance-amount">${esc(value)}</strong></button>
    ${open ? financePendingMenuHtml(payments) : ''}
  </div>`;
}
function financeMonthLabel(){
  const label = new Intl.DateTimeFormat('ru-RU', {month:'long'}).format(new Date());
  return label ? label[0].toUpperCase() + label.slice(1) : 'Месяц';
}
function financeMonthLabelFromKey(key=''){
  const [year, month] = String(key || '').split('-').map(Number);
  if(!year || !month) return financeMonthLabel();
  const label = new Intl.DateTimeFormat('ru-RU', {month:'long', year:'numeric'}).format(new Date(year, month - 1, 1));
  return label ? label[0].toUpperCase() + label.slice(1) : 'Месяц';
}
function financeCurrentMonthKey(){
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function financeCurrentMonthStart(){
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}
function financeCurrentMonthPaid(summary={}, model={}){
  if(summary.paid_month !== undefined) return financeNumber(summary.paid_month);
  const start = financeCurrentMonthStart();
  return (model.paidRows || []).reduce((sum, row) => {
    const stamp = new Date(String(row.confirmed_at || row.created_at || '').replace(' ', 'T')).getTime();
    return stamp && stamp >= start ? sum + financeNumber(row.amount) : sum;
  }, 0) || financeNumber(summary.paid_30d);
}
function financeIncomeSummary(summary={}, model={}){
  const income = state.adminFinance?.income || {};
  const rawMonths = Array.isArray(income.months) ? income.months : Array.isArray(summary.paid_months) ? summary.paid_months : [];
  const months = rawMonths
    .map(row => ({key:String(row.key || row.month_key || row.month || ''), amount:financeNumber(row.amount), count:Number(row.count || row.payments_count || 0)}))
    .filter(row => /^\d{4}-\d{2}$/.test(row.key))
    .sort((a,b) => String(b.key).localeCompare(String(a.key)));
  if(!months.length){
    const byMonth = new Map();
    (model.paidRows || []).forEach(row => {
      const stamp = new Date(String(row.confirmed_at || row.created_at || '').replace(' ', 'T'));
      if(Number.isNaN(stamp.getTime())) return;
      const key = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}`;
      const current = byMonth.get(key) || {key, amount:0, count:0};
      current.amount += financeNumber(row.amount);
      current.count += 1;
      byMonth.set(key, current);
    });
    months.push(...Array.from(byMonth.values()).sort((a,b) => String(b.key).localeCompare(String(a.key))));
  }
  const total = financeNumber(income.total ?? summary.paid_total_all ?? months.reduce((sum, row) => sum + financeNumber(row.amount), 0));
  return {total, months};
}
function financeSelectedIncomeMonth(income={}){
  const months = Array.isArray(income.months) ? income.months : [];
  const picked = String(state.adminFinanceMonthKey || financeCurrentMonthKey());
  return months.find(row => row.key === picked) || (picked === financeCurrentMonthKey() ? {key:picked, amount:financeCurrentMonthPaid(state.adminFinance?.summary || {}, state.adminFinance ? financeCockpitModel(state.adminFinance) : {})} : null) || months[0] || null;
}
function financeIncomeMenuHtml(income={}, selectedKey=''){
  const months = Array.isArray(income.months) ? income.months : [];
  return `<aside class="finance-income-menu">
    <div class="finance-income-total"><span>За всё время</span><strong class="finance-amount">${money(income.total || 0)}</strong></div>
    <div class="finance-income-months">
      ${months.map(row => `<button class="finance-income-month ${row.key === selectedKey ? 'active' : ''}" data-action="finance-month-select" data-month="${attr(row.key)}"><span>${esc(financeMonthLabelFromKey(row.key))}</span><strong class="finance-amount">${money(row.amount || 0)}</strong></button>`).join('') || '<div class="finance-income-empty">Подтверждённых оплат пока нет</div>'}
    </div>
  </aside>`;
}
function financeDebtMenuHtml(debts=[], emptyText='Текущих долгов нет'){
  const rows = (Array.isArray(debts) ? debts : []).slice().sort(financeDebtSort);
  return `<aside class="finance-debt-menu">
    <div class="finance-debt-list">
      ${rows.map(financeDebtMenuRowHtml).join('') || `<div class="finance-income-empty">${esc(emptyText)}</div>`}
    </div>
  </aside>`;
}
function financeDebtMenuRowHtml(item={}){
  const targetType = financeTargetType(item);
  const action = financeTargetAction(targetType);
  const targetId = financeTargetId(item);
  const overdue = Boolean(item.is_overdue);
  const row = `<span><b>${esc(item.client_name || 'Клиент')}</b><i>${esc(item.title || 'Пункт Требника')}</i></span><strong class="finance-amount">${money(item.remainder || 0)}</strong>`;
  if(targetId) return `<button class="finance-debt-row ${overdue ? 'is-danger' : ''}" data-action="${attr(action)}" data-id="${attr(targetId)}">${row}</button>`;
  return `<div class="finance-debt-row ${overdue ? 'is-danger' : ''}">${row}</div>`;
}
function financePendingMenuHtml(payments=[]){
  const rows = (Array.isArray(payments) ? payments : []).slice().sort(financePaymentSort).slice(0, 8);
  return `<aside class="finance-pending-menu">
    <div class="finance-pending-list">
      ${rows.map(financePendingMenuRowHtml).join('') || '<div class="finance-income-empty">Платежей на подтверждение нет</div>'}
    </div>
  </aside>`;
}
function financePendingMenuRowHtml(row={}){
  const targetType = financeTargetType(row);
  const action = financePaymentTargetAction(row);
  const targetId = financePaymentTargetId(row);
  const paymentId = row.payment_id || row.id || '';
  return `<article class="finance-pending-row">
    <button class="finance-pending-target" data-action="${attr(action)}" data-id="${attr(targetId)}">
      <span><b>${esc(row.client_name || 'Клиент')}</b><i>${esc(financePaymentTitle(row))}</i></span>
      <strong class="finance-amount">${money(row.amount || 0)}</strong>
    </button>
    <div class="finance-pending-buttons">
      <button class="plain" data-action="payment-review" data-target-type="${attr(targetType)}" data-payment-id="${attr(paymentId)}" data-decision="confirmed">Подтвердить</button>
      <button class="plain danger" data-action="payment-review" data-target-type="${attr(targetType)}" data-payment-id="${attr(paymentId)}" data-decision="rejected">Отклонить</button>
    </div>
  </article>`;
}
function financeClients(finance=state.adminFinance || {}){
  return Array.isArray(finance.clients) ? finance.clients : [];
}
function financeDebtItems(finance=state.adminFinance || {}){
  if(Array.isArray(finance.debts)) return finance.debts;
  return financeClients(finance).flatMap(client => (Array.isArray(client.items) ? client.items : []).map(item => ({
    ...item,
    client_id:item.client_id || client.client_id,
    client_name:item.client_name || client.client_name,
  })));
}
function financeFilteredClients(clients=[]){
  return Array.isArray(clients) ? clients : [];
}
function financeFilteredDebts(items=[]){
  return Array.isArray(items) ? items : [];
}
function financeSelectedClient(){
  const clients = financeClients();
  if(state.adminFinanceClientId === 'all') state.adminFinanceClientId = '';
  const selected = clients.find(client => String(client.client_id) === String(state.adminFinanceClientId || ''));
  if(selected) return selected;
  const fallback = clients.find(client => Number(client.pending_total || 0) > 0 || Number(client.overdue_total || 0) > 0) || clients[0] || null;
  if(fallback?.client_id) state.adminFinanceClientId = String(fallback.client_id);
  return fallback;
}
function financeRelativeTime(value){
  if(!value) return '';
  const stamp = new Date(String(value).replace(' ', 'T')).getTime();
  if(Number.isNaN(stamp)) return time(value);
  const diff = Math.max(0, Date.now() - stamp);
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if(minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if(hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if(days < 30) return `${days} дн. назад`;
  return date(value);
}
function financeEmptyHtml(title, text=''){
  return `<div class="finance-empty"><strong>${esc(title)}</strong>${text ? `<span>${esc(text)}</span>` : ''}</div>`;
}
function financeSectionHeadHtml(title, rows=[], total=0){
  const count = Array.isArray(rows) ? rows.length : 0;
  return `<div class="finance-section-head">
    <h2>${esc(title)}</h2>
    <span>${count ? `${count} ${ruPlural(count, 'запись', 'записи', 'записей')}` : 'нет записей'}</span>
    ${financeNumber(total) > 0 ? `<b class="finance-amount">${money(total)}</b>` : ''}
  </div>`;
}
function financePendingPayments(payments={}){
  return (Array.isArray(payments.pending) ? payments.pending : []).filter(row => !row.confirmed);
}
function financeItemKey(item={}){
  const type = financeTargetType(item);
  const id = financeTargetId(item);
  return id ? `${type}:${id}` : '';
}
function financeActionItems(pendingPayments=[], overdueDebts=[], dueSoonDebts=[], waitingDebts=[]){
  const dueKeys = new Set(dueSoonDebts.map(row => financeItemKey(row)).filter(Boolean));
  const nextWaiting = waitingDebts.filter(row => !dueKeys.has(financeItemKey(row)));
  const items = [
    ...pendingPayments.map(row => ({kind:'payment', tone:'wait', row, priority:0, amount:financeNumber(row.amount)})),
    ...overdueDebts.map(row => ({kind:'overdue', tone:'danger', row, priority:1, amount:financeNumber(row.remainder)})),
    ...dueSoonDebts.map(row => ({kind:'due', tone:'main', row, priority:2, amount:financeNumber(row.remainder)})),
    ...nextWaiting.map(row => ({kind:'waiting', tone:'main', row, priority:3, amount:financeNumber(row.remainder)})),
  ];
  const focus = state.adminFinanceFocus || 'debt';
  const filtered = focus === 'pending' ? items.filter(item => item.kind === 'payment')
    : focus === 'overdue' ? items.filter(item => item.kind === 'overdue')
    : focus === 'debt' ? items.filter(item => item.kind !== 'payment')
    : focus === 'paid' ? items
    : items;
  return filtered.sort((a,b) => (a.priority - b.priority) || (b.amount - a.amount));
}
function financeActionCenterHtml(model={}){
  const items = model.actionItems || [];
  return `<section class="finance-panel finance-action-center">
    <div class="finance-panel-head">
      <h2>Действия</h2>
    </div>
    <div class="finance-action-list">${items.map(financeActionItemHtml).join('') || financeEmptyHtml('Сейчас действий нет')}</div>
  </section>`;
}
function financeActionItemHtml(item){
  if(item.kind === 'payment') return financePaymentActionHtml(item.row);
  return financeDebtActionHtml(item.row, item.kind);
}
function financePaymentActionHtml(row){
  const targetType = financeTargetType(row);
  const targetId = financePaymentTargetId(row);
  const action = financePaymentTargetAction(row);
  const paymentId = row.payment_id || row.id || '';
  return `<article class="finance-action-card is-wait" data-action="${attr(action)}" data-id="${attr(targetId)}" role="button" tabindex="0">
    <div class="finance-action-state"><b class="finance-amount">${money(row.amount || 0)}</b><span>Подтвердить</span></div>
    <div class="finance-action-main">
      <button class="finance-client-link" data-action="finance-client" data-id="${attr(row.client_id || '')}">${esc(row.client_name || 'Клиент')}</button>
      <button class="finance-target-link" data-action="${attr(action)}" data-id="${attr(targetId)}">${esc(financePaymentTitle(row))}</button>
      <span>${esc(financePaymentTypeLabel(row))} · ${esc(financePaymentTime(row))}</span>
    </div>
    <div class="finance-action-buttons">
      <button class="plain" data-action="payment-review" data-target-type="${attr(targetType)}" data-payment-id="${attr(paymentId)}" data-decision="confirmed">Подтвердить</button>
      <button class="plain danger" data-action="payment-review" data-target-type="${attr(targetType)}" data-payment-id="${attr(paymentId)}" data-decision="rejected">Отклонить</button>
    </div>
  </article>`;
}
function financeDebtActionHtml(item, kind='overdue'){
  const targetType = financeTargetType(item);
  const targetId = financeTargetId(item);
  const action = financeTargetAction(targetType);
  const overdue = kind === 'overdue' || item.is_overdue;
  const label = financeDebtActionLabel(item, kind, overdue);
  return `<article class="finance-action-card ${overdue ? 'is-danger' : 'is-main'}" data-action="${attr(action)}" data-id="${attr(targetId)}" role="button" tabindex="0">
    <div class="finance-action-state"><b class="finance-amount">${money(item.remainder || 0)}</b><span>${esc(label)}</span></div>
    <div class="finance-action-main">
      <button class="finance-client-link" data-action="finance-client" data-id="${attr(item.client_id || '')}">${esc(item.client_name || 'Клиент')}</button>
      <button class="finance-target-link" data-action="${attr(action)}" data-id="${attr(targetId)}">${esc(item.title || 'Пункт Требника')}</button>
      <span>${esc(financeTargetTypeLabel(targetType))} · ${esc(financeDebtTerm(item))}</span>
    </div>
    <div class="finance-action-buttons">
      <button class="plain ${overdue ? 'danger' : ''}" data-action="payment-reminder-send" data-client-id="${attr(item.client_id || '')}" data-target-type="${attr(targetType)}" data-target-id="${attr(targetId)}">Напомнить</button>
      <button class="secondary" data-action="payment-reminder-settings" data-target-type="${attr(targetType)}" data-target-id="${attr(targetId)}">${item.reminder_enabled ? 'Авто вкл' : 'Авто'}</button>
      <button class="secondary" data-action="payment-add" data-client-id="${attr(item.client_id || '')}" data-target-type="${attr(targetType)}" data-target-id="${attr(targetId)}">Платёж</button>
    </div>
  </article>`;
}
function financeDebtActionLabel(item={}, kind='overdue', overdue=false){
  if(overdue) return 'Просрочено';
  if(financeTargetType(item) === 'service' && String(item.payment_target || '') === 'next_term') return 'Следующая оплата';
  if(kind === 'due') return 'Срок близко';
  return 'К оплате';
}
function financeDebtBucket(item){
  const due = financeDueStamp(item);
  if(!due) return 'none';
  return financeDaysUntil(due) <= 7 ? 'soon' : 'later';
}
function financeDebtSort(a, b){
  if(Boolean(a.is_overdue) !== Boolean(b.is_overdue)) return a.is_overdue ? -1 : 1;
  const dueA = financeDueStamp(a) || Number.MAX_SAFE_INTEGER;
  const dueB = financeDueStamp(b) || Number.MAX_SAFE_INTEGER;
  if(dueA !== dueB) return dueA - dueB;
  return financeNumber(b.remainder) - financeNumber(a.remainder);
}
function financeDueStamp(item={}){
  const value = item.due_until || item.active_until || item.next_send_date || '';
  if(!value) return 0;
  const stamp = new Date(String(value).replace(' ', 'T')).getTime();
  return Number.isNaN(stamp) ? 0 : stamp;
}
function financeDueValue(item={}){
  return item.due_until || item.active_until || item.next_send_date || '';
}
function financeDatePlusDays(value='', days=1){
  const iso = inputDateValue(value);
  if(!iso) return '';
  const [year, month, day] = iso.split('-').map(Number);
  const stamp = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
  return stamp.toISOString().slice(0, 10);
}
function financeDaysUntil(stamp){
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(stamp);
  target.setHours(0, 0, 0, 0);
  return Math.floor((target.getTime() - today.getTime()) / 86400000);
}
function financeDebtTerm(item={}){
  const stamp = financeDueStamp(item);
  if(!stamp) return 'срок не указан';
  const days = financeDaysUntil(stamp);
  if(item.is_overdue && days < 0){
    const since = financeDatePlusDays(financeDueValue(item), 1);
    return since ? `просрочено с ${dateLong(since)}` : `${Math.abs(days)} ${ruPlural(Math.abs(days), 'день', 'дня', 'дней')} просрочено`;
  }
  if(financeTargetType(item) === 'service' && String(item.payment_target || '') === 'next_term' && item.paid_through_until){
    return `оплачено до ${date(item.paid_through_until)}`;
  }
  if(days === 0) return 'оплатить сегодня';
  if(days === 1) return 'завтра';
  return `до ${date(financeDueValue(item))}`;
}
function financeTargetType(item={}){
  return item.target_type === 'service' || item.entity_type === 'service' || item.service_id ? 'service' : 'request';
}
function financeTargetId(item={}){
  return item.target_id || item.entity_id || item.request_id || item.service_id || '';
}
function financeTargetAction(targetType='request'){
  return targetType === 'service' ? 'service-detail' : 'request-detail';
}
function financeTargetTypeLabel(targetType='request'){
  return targetType === 'service' ? 'Услуга' : 'Запрос';
}
function financePaymentTitle(row={}){
  return row.work_title || row.target_title || row.request_title || row.service_title || 'Пункт Требника';
}
function financePaymentTargetId(row={}){
  return row.work_id || financeTargetId(row);
}
function financePaymentTargetAction(row={}){
  if(row.work_id) return 'work-detail';
  return financeTargetAction(financeTargetType(row));
}
function financePaymentTypeLabel(row={}){
  if(row.work_id) return 'Работа';
  return financeTargetTypeLabel(financeTargetType(row));
}
function financeAllPayments(){
  const payments = state.adminFinance?.payments || {};
  const rows = [
    ...(payments.pending || []).map(row => ({...row, finance_section:'pending'})),
    ...(payments.confirmed_recent || []).map(row => ({...row, finance_section:'confirmed_recent'})),
    ...(payments.rejected_recent || []).map(row => ({...row, finance_section:'rejected_recent'})),
    ...(payments.client_marked || []).map(row => ({...row, finance_section:'client_marked'})),
  ];
  const seen = new Set();
  return rows.filter(item => {
    const key = `${item.target_type || ''}:${item.payment_id || item.id || ''}:${item.created_at || ''}:${item.confirmed_at || ''}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function financePaidRows(payments={}){
  const rows = [
    ...(payments.confirmed_recent || []).map(row => ({...row, finance_section:'confirmed_recent'})),
    ...(payments.client_marked || []).filter(row => row.confirmed).map(row => ({...row, finance_section:'client_marked'})),
  ];
  const seen = new Set();
  return rows.filter(item => {
    const key = `${financeTargetType(item)}:${item.payment_id || item.id || ''}:${item.created_at || ''}:${item.confirmed_at || ''}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort(financePaymentSort);
}
function financeLedgerRows(payments={}){
  const rows = [
    ...(payments.pending || []).map(row => ({...row, finance_section:'pending'})),
    ...(payments.confirmed_recent || []).map(row => ({...row, finance_section:'confirmed_recent'})),
    ...(payments.rejected_recent || []).map(row => ({...row, finance_section:'rejected_recent'})),
    ...(payments.client_marked || []).filter(row => row.confirmed).map(row => ({...row, finance_section:'client_marked'})),
  ];
  const seen = new Set();
  return rows.filter(item => {
    const key = `${financeTargetType(item)}:${item.payment_id || item.id || ''}:${item.created_at || ''}:${item.confirmed_at || ''}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort(financePaymentSort);
}
function financeClientPayments(clientId){
  const seen = new Set();
  return financeAllPayments().filter(item => {
    const key = `${item.target_type}:${item.payment_id}:${item.created_at}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return String(item.client_id) === String(clientId);
  });
}
function financeWorkRows(payments={}, debts=[]){
  const rows = new Map();
  const touch = (type, title, targetId='') => {
    const key = `${type}:${title}`;
    const current = rows.get(key) || {title, type, target_id:targetId, paid:0, debt:0, pending:0, overdue:0, payments:0, debts:0};
    if(!current.target_id && targetId) current.target_id = targetId;
    rows.set(key, current);
    return current;
  };
  financePendingPayments(payments).forEach(row => {
    const type = financeTargetType(row);
    const title = row.target_title || row.request_title || row.service_title || (type === 'service' ? 'Услуга' : 'Запрос');
    const current = touch(type, title, financeTargetId(row));
    current.pending += financeNumber(row.amount);
  });
  financePaidRows(payments).forEach(row => {
    if(!row.confirmed) return;
    const type = financeTargetType(row);
    const title = row.target_title || row.request_title || row.service_title || (type === 'service' ? 'Услуга' : 'Запрос');
    const current = touch(type, title, financeTargetId(row));
    current.paid += financeNumber(row.amount);
    current.payments += 1;
  });
  (Array.isArray(debts) ? debts : []).forEach(row => {
    const type = financeTargetType(row);
    const title = row.title || (type === 'service' ? 'Услуга' : 'Запрос');
    const current = touch(type, title, financeTargetId(row));
    current.debt += financeNumber(row.remainder);
    current.overdue += row.is_overdue ? financeNumber(row.remainder) : 0;
    current.debts += 1;
  });
  return Array.from(rows.values())
    .filter(row => row.paid > 0 || row.debt > 0 || row.pending > 0)
    .sort((a,b) => (b.overdue - a.overdue) || ((b.debt + b.pending + b.paid) - (a.debt + a.pending + a.paid)))
    .slice(0, 8);
}
function financePaymentSort(a, b){
  const stampA = new Date(String(a.confirmed_at || a.created_at || '').replace(' ', 'T')).getTime() || 0;
  const stampB = new Date(String(b.confirmed_at || b.created_at || '').replace(' ', 'T')).getTime() || 0;
  return stampB - stampA;
}
function financePaymentTime(row={}){
  const value = row.confirmed_at || row.created_at;
  if(!value) return '';
  if(!row.confirmed && row.finance_section !== 'rejected_recent') return financeRelativeTime(value);
  const stamp = new Date(String(value).replace(' ', 'T')).getTime();
  if(Number.isNaN(stamp)) return time(value);
  if(Date.now() - stamp < 3 * 86400000) return financeRelativeTime(value);
  return date(value);
}
function financeClientRows(finance=state.adminFinance || {}, pendingPayments=[]){
  const hasAllClients = Array.isArray(finance.all_clients) && finance.all_clients.length;
  const sourceClients = hasAllClients ? finance.all_clients : financeClients(finance);
  const byClient = new Map();
  (Array.isArray(sourceClients) ? sourceClients : []).forEach(client => {
    const id = String(client.client_id || client.id || '');
    if(!id) return;
    byClient.set(id, {
      client_id:id,
      client_name:client.client_name || client.name || 'Клиент',
      paid_total:financeNumber(client.paid_total),
      debt_total:financeNumber(client.debt_total),
      overdue_total:financeNumber(client.overdue_total),
      pending_total:financeNumber(client.pending_total),
      positions_count:financeNumber(client.positions_count),
      active_count:financeNumber(client.active_requests_count) + financeNumber(client.active_services_count),
    });
  });
  financeClients(finance).forEach(client => {
    const id = String(client.client_id || client.id || '');
    if(!id) return;
    const current = byClient.get(id) || {client_id:id, client_name:client.client_name || client.name || 'Клиент', paid_total:0, debt_total:0, overdue_total:0, pending_total:0, positions_count:0, active_count:0};
    current.client_name = current.client_name || client.client_name || client.name || 'Клиент';
    current.debt_total = Math.max(financeNumber(current.debt_total), financeNumber(client.debt_total));
    current.overdue_total = Math.max(financeNumber(current.overdue_total), financeNumber(client.overdue_total));
    current.pending_total = Math.max(financeNumber(current.pending_total), financeNumber(client.pending_total));
    current.positions_count = Math.max(financeNumber(current.positions_count), financeNumber(client.positions_count));
    byClient.set(id, current);
  });
  if(!hasAllClients){
    financePaidRows(finance.payments || {}).forEach(row => {
      const id = String(row.client_id || '');
      if(!id) return;
      const current = byClient.get(id) || {client_id:id, client_name:row.client_name || 'Клиент', paid_total:0, debt_total:0, overdue_total:0, pending_total:0, positions_count:0, active_count:0};
      current.client_name = current.client_name || row.client_name || 'Клиент';
      current.paid_total += financeNumber(row.amount);
      byClient.set(id, current);
    });
  }
  const pendingByClient = new Map();
  pendingPayments.forEach(row => {
    const id = String(row.client_id || '');
    pendingByClient.set(id, financeNumber(pendingByClient.get(id)) + financeNumber(row.amount));
  });
  pendingByClient.forEach((amount, id) => {
    const current = byClient.get(id) || {client_id:id, client_name:'Клиент', paid_total:0, debt_total:0, overdue_total:0, pending_total:0, positions_count:0, active_count:0};
    current.pending_total = Math.max(financeNumber(current.pending_total), financeNumber(amount));
    byClient.set(id, current);
  });
  return Array.from(byClient.values())
    .filter(client => financeNumber(client.paid_total) > 0 || financeNumber(client.debt_total) > 0 || financeNumber(client.pending_total) > 0)
    .sort((a,b) => (financeNumber(b.debt_total) + financeNumber(b.pending_total) + financeNumber(b.paid_total)) - (financeNumber(a.debt_total) + financeNumber(a.pending_total) + financeNumber(a.paid_total)))
    .slice(0, 10);
}
function financeRiskClientsHtml(model={}){
  const rows = model.clients || [];
  return `<section class="finance-panel finance-radar">
    <div class="finance-panel-head">
      <h2>Клиенты</h2>
    </div>
    <div class="finance-radar-list">${rows.map(financeRiskClientHtml).join('') || financeEmptyHtml('Клиентов с оплатами пока нет')}</div>
  </section>`;
}
function financeRiskClientHtml(client){
  const overdue = financeNumber(client.overdue_total);
  const pending = financeNumber(client.pending_total);
  const paid = financeNumber(client.paid_total);
  const debt = financeNumber(client.debt_total);
  return `<button class="finance-radar-row ${overdue > 0 ? 'is-danger' : pending > 0 ? 'is-wait' : ''}" data-action="finance-client" data-id="${attr(client.client_id || '')}">
    <span><strong>${esc(client.client_name || 'Клиент')}</strong></span>
    <span class="finance-client-money"><b>${money(paid)}</b><i class="${debt > 0 ? 'is-danger' : ''}">${money(debt)}</i></span>
  </button>`;
}
function financeServicePulseHtml(model={}){
  const rows = model.workRows || [];
  return `<section class="finance-panel finance-pulse">
    <div class="finance-panel-head">
      <h2>Работы</h2>
    </div>
    <div class="finance-service-list">${rows.map(financeServiceRowHtml).join('') || financeEmptyHtml('Работ с деньгами пока нет')}</div>
  </section>`;
}
function financeServiceRowHtml(row){
  const action = financeTargetAction(row.type || 'request');
  const stuck = financeNumber(row.debt) + financeNumber(row.pending);
  const content = `<span><strong>${esc(row.title || 'Пункт Требника')}</strong></span><span class="finance-service-money"><b>${money(row.paid || 0)}</b><i class="${stuck > 0 ? 'is-danger' : ''}">${money(stuck)}</i></span>`;
  if(row.target_id) return `<button class="finance-service-row ${row.overdue > 0 ? 'is-danger' : ''}" data-action="${attr(action)}" data-id="${attr(row.target_id)}">${content}</button>`;
  return `<div class="finance-service-row ${row.overdue > 0 ? 'is-danger' : ''}">${content}</div>`;
}
function adminShellLoading(){
  return `<section class="admin-grid">
    <aside class="admin-sidebar panel is-busy">
      <h2>Клиенты</h2>
      <div class="skeleton-stack" style="margin-top:12px">${skeletonLine('100%')}${skeletonLine('92%')}${skeletonLine('78%')}${skeletonLine('88%')}</div>
    </aside>
    <div class="admin-main">
      <article class="admin-head panel is-busy">
        <div class="admin-head-top">
          <div><h1>${esc(adminAreaName())}</h1><p class="subtle">Открываю рабочий контур и клиентов.</p></div>
        </div>
        <div class="metrics">${loadingMetric('Клиенты')}${loadingMetric('Запросы в работе')}${loadingMetric('Услуги')}${loadingMetric('Ждёт подтверждения')}</div>
      </article>
      <div class="workbench">${adminLoadingCard('Заявки с сайта')}${adminLoadingCard('Платежи на подтверждение')}${adminLoadingCard('На сегодня')}${adminLoadingCard('Свежие апдейты')}${adminLoadingCard('Заканчиваются услуги')}</div>
    </div>
  </section>`;
}
function adminLoadingCard(title){
  return `<div class="admin-card is-busy"><h2>${esc(title)}</h2>${skeletonStack(['100%','90%','74%'])}</div>`;
}
function normalizeAdminEditorPage(page='home'){
  return adminEditorPages.includes(page) ? page : 'home';
}
function openAdminEditorPage(page='home'){
  state.adminMaterialEditor = null;
  state.adminEditorPage = normalizeAdminEditorPage(page);
  localStorage.setItem(keys.adminEditor, state.adminEditorPage);
  setSaveStatus('idle', 'Готово');
  if(state.route !== 'admin'){
    go('admin');
    return;
  }
  paintAdminEditor();
}
function selectAdminEditorPage(page='home'){
  openAdminEditorPage(page);
}
function adminEditorPageLabel(page){
  const labels = {home:'Главная', profiles:'Профили', traffic:'Посещаемость'};
  return labels[page] || sectionDisplayName(page);
}
function adminEditorPageNote(page){
  if(page === 'home') return 'Первый экран';
  if(page === 'profiles') return 'Люди сайта';
  if(page === 'traffic') return 'Статистика';
  if(sectionRoutes.includes(page)) return 'Раздел';
  return '';
}
function publicHrefForEditorPage(page){
  if(page === 'profiles') return routeHref('admin');
  if(page === 'traffic') return routeHref('admin');
  return sectionRoutes.includes(page) ? routeHref(page) : routeHref('home');
}
function adminEditorNavHtml(){
  return `<nav class="admin-editor__page-list" aria-label="Страницы сайта">${adminEditorPages.map(page => `<button class="${state.adminEditorPage === page ? 'active' : ''}" type="button" data-action="select-admin-editor-page" data-page="${attr(page)}"><strong>${esc(adminEditorPageLabel(page))}</strong>${adminEditorPageNote(page) ? `<span>${esc(adminEditorPageNote(page))}</span>` : ''}</button>`).join('')}</nav>`;
}
function adminEditorMenuHtml(){
  return `<details class="admin-editor__nav-menu">
    <summary><span>Разделы</span></summary>
    <nav class="admin-editor__menu-list" aria-label="Разделы мастерской">
      ${adminEditorPages.map(page => `<button class="${state.adminEditorPage === page ? 'active' : ''}" type="button" data-action="select-admin-editor-page" data-page="${attr(page)}">${esc(adminEditorPageLabel(page))}</button>`).join('')}
    </nav>
  </details>`;
}
function adminEditorTopbarHtml(){
  return `<div class="admin-editor__topbar">
    <h1 class="admin-editor__title">${esc(adminAreaName())}</h1>
    <div class="admin-editor__top-actions">
      ${adminEditorMenuHtml()}
    </div>
  </div>`;
}
function editorPanel(title, note, body){
  return `<article class="admin-editor__panel">
    <div class="admin-editor__panel-head"><div><h2 class="admin-editor__panel-title">${esc(title)}</h2>${note ? `<p class="admin-editor__panel-note">${esc(note)}</p>` : ''}</div></div>
    ${body}
  </article>`;
}
function adminEditorShell(body){
  return `<section class="admin-editor">
    ${adminEditorTopbarHtml()}
    <div class="admin-editor__layout">
      <aside class="admin-editor__sidebar">
        <div class="admin-editor__sidebar-head"><h2 class="admin-editor__sidebar-title">Разделы</h2></div>
        ${adminEditorNavHtml()}
      </aside>
      <div class="admin-editor__main">${body}</div>
    </div>
  </section>`;
}
function editorField(label, name, value='', options={}){
  const wide = options.wide ? ' is-wide' : '';
  const cls = options.textarea ? 'admin-editor__textarea' : options.select ? 'admin-editor__select' : 'admin-editor__input';
  const input = options.textarea
    ? `<textarea class="${cls}" name="${attr(name)}" rows="${attr(options.rows || 4)}">${esc(value || '')}</textarea>`
    : options.select
      ? `<select class="${cls}" name="${attr(name)}">${options.options.map(item => `<option value="${attr(item.value)}" ${String(item.value) === String(value) ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select>`
      : `<input class="${cls}" name="${attr(name)}" value="${attr(value || '')}" ${options.required ? 'required' : ''}>`;
  return `<label class="admin-editor__field${wide}"><span class="admin-editor__label">${esc(label)}</span>${input}${options.help ? `<em class="admin-editor__help">${esc(options.help)}</em>` : ''}</label>`;
}
function editorRouteOptions(){
  return sectionRoutes.map(route => ({value:route, label:sectionDisplayName(route)}));
}
function adminHomeEditorHtml(){
  const content = clone(state.content);
  const home = content.home || {};
  const brandData = content.brand || {};
  const featuredSet = new Set((home.featured_material_ids || []).map(value => String(value || '').trim()).filter(Boolean));
  return `<form class="form admin-editor__form" id="adminHomeEditorForm">
    <p class="form-note" data-persistent-feedback></p>
    <div class="admin-editor__form-grid">
      ${editorField('Название сайта', 'site_name', brandData.site_name || siteName(), {required:true})}
      ${editorField('Подпись под названием сайта', 'site_subtitle', brandData.site_subtitle || '')}
      ${editorField('Название Мастерской', 'admin_area_name', brandData.admin_area_name || adminAreaName())}
      ${editorField('Название Требника', 'client_area_name', brandData.client_area_name || clientAreaName())}
      ${editorField('Заголовок для поиска', 'home_seo_title', home.seo_title || '', {help:'Можно не трогать. Это запасной заголовок для поисковиков.'})}
      ${editorField('Короткая строка над именем', 'hero_kicker', home.hero_kicker || '')}
      ${editorField('Заголовок первого экрана', 'hero_title', home.hero_title ?? '')}
      ${editorField('Описание для поиска', 'home_seo_description', home.seo_description || '', {wide:true, help:'Можно не трогать. Если пусто, сайт возьмёт обычный текст главной.'})}
      ${editorField('Текст первого экрана', 'hero_text', home.hero_text ?? '', {textarea:true, rows:5, wide:true})}
      ${editorField('Главная кнопка', 'cta_primary_label', home.cta_primary_label ?? home.cta_primary ?? 'Оставить заявку')}
      ${editorField('Действие главной кнопки', 'cta_primary_action', home.cta_primary_action || 'inquiry', {select:true, options:[{value:'inquiry', label:'Открыть заявку'}, {value:'link', label:'Открыть раздел'}]})}
      ${editorField('Куда ведёт главная кнопка', 'cta_primary_route', home.cta_primary_route || 'services', {select:true, options:editorRouteOptions()})}
      ${editorField('Название заявки', 'cta_primary_title', home.cta_primary_title || 'Заявка с главной')}
      ${editorField('Кнопка-ссылка', 'cta_secondary_label', home.cta_secondary_label ?? home.cta_secondary ?? 'Смотреть услуги')}
      ${editorField('Куда ведёт кнопка-ссылка', 'cta_secondary_route', home.cta_secondary_route || 'services', {select:true, options:editorRouteOptions()})}
      ${editorField('Кнопка Telegram', 'telegram_label', home.telegram_label || 'Написать в Telegram')}
      ${editorField('Ссылка Telegram', 'telegram_url', home.telegram_url || '')}
      ${editorField('Кнопка на сайте', 'site_message_label', home.site_message_label || 'Написать тут')}
    </div>
    <div class="media-field" data-media-field data-slot="hero" data-ratio="portrait" data-title="Фото первого экрана" data-title-source="[name='hero_title']" data-alt-source="[name='hero_image_alt']" data-empty="Без фото">
      <input type="hidden" name="hero_image_url" value="${attr(home.hero_image_url || '')}">
      <div data-media-preview>${mediaPreviewCardHtml({title:'Фото первого экрана', url:home.hero_image_url || '', alt:home.hero_image_alt || siteName(), ratio:'portrait', emptyText:'Без фото'})}</div>
      <div class="stack">
        <label><span>Фото первого экрана</span><input data-media-file name="hero_image_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
        <div class="row"><button class="secondary" type="button" data-media-clear>Убрать фото</button></div>
        <p class="form-note" data-media-feedback data-feedback-style="note"></p>
        <label><span>Описание изображения</span><input name="hero_image_alt" value="${attr(home.hero_image_alt || siteName())}"></label>
      </div>
    </div>
    <label class="toggle-line"><input type="checkbox" name="show_featured" ${home.show_featured === true ? 'checked' : ''}><span>Показывать избранное</span></label>
    <div class="featured-checklist">${featuredMaterialsOptions(content, featuredSet)}</div>
    <p class="form-note" data-featured-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" type="submit" data-save-content>Сохранить</button><a class="secondary" href="${routeHref('home')}" target="_blank" rel="noopener">Открыть</a></div>
  </form>`;
}
function adminSectionTopicRowHtml(topic={}, index=0){
  const title = topic.title || '';
  const slug = topic.slug || '';
  const enabled = topic.enabled !== false;
  return `<div class="section-topic-row" data-section-topic-row>
    <input type="hidden" name="topic_slug" value="${attr(slug)}">
    <label class="topic-title-field"><span>Тема</span><input name="topic_title" value="${attr(title)}" placeholder="Название темы"></label>
    <div class="topic-row-actions">
      <label class="topic-row-toggle"><input type="checkbox" name="topic_enabled" ${enabled ? 'checked' : ''}><span>показывать</span></label>
      <button class="plain" type="button" data-action="section-topic-remove">Убрать</button>
    </div>
  </div>`;
}
function adminSectionTopicsHtml(section={}){
  const topics = sectionTopicList(section, {includeDisabled:true});
  return `<section class="section-topic-editor">
    <label class="toggle-line section-topic-toggle"><input type="checkbox" name="section_topics_enabled" ${section.topics_enabled === true ? 'checked' : ''}><span>Показывать темы в разделе</span></label>
    <div class="section-topic-rows" data-section-topics>
      ${topics.map(adminSectionTopicRowHtml).join('') || '<div class="section-topic-empty">Тем пока нет.</div>'}
    </div>
    <div class="row"><button class="secondary" type="button" data-action="section-topic-add">Добавить тему</button></div>
  </section>`;
}
function adminSectionEditorHtml(route){
  const section = clone(state.content?.sections?.[route] || {});
  const title = section.title || sectionNames[route] || route;
  return `<form class="form admin-editor__form" id="sectionSettingsForm" data-route="${attr(route)}">
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="admin-editor__form-grid section-basic-grid">
      ${editorField('Название раздела в меню', 'section_title', title, {required:true, help:'Так раздел называется в верхнем меню сайта.'})}
      ${editorField('Короткое описание раздела', 'section_intro', section.intro || '', {wide:true, textarea:true, rows:3, help:'Можно оставить пустым. Это короткий запасной текст для описания раздела.'})}
    </div>
    <details class="admin-editor__details">
      <summary>Для поисковиков и служебных случаев</summary>
      <p class="form-note">Это не нужно заполнять каждый раз. Заголовок и описание помогают поисковикам и ссылкам в соцсетях понять, что это за раздел. Если оставить пустым, сайт возьмёт обычное название и описание.</p>
      <div class="admin-editor__form-grid" style="margin-top:12px">
        ${editorField('Заголовок для поиска', 'section_seo_title', section.seo_title || '', {help:'Обычно можно оставить пустым.'})}
        ${editorField('Описание для поиска', 'section_seo_description', section.seo_description || section.intro || '', {help:'Коротко: о чём этот раздел.'})}
      </div>
      <div class="media-field" data-media-field data-slot="section-cover" data-ratio="landscape" data-title="Фото раздела" data-title-source="[name='section_title']" data-alt-source="[name='section_cover_alt']" data-empty="Фото не выбрано">
        <input type="hidden" name="section_cover_url" value="${attr(section.cover_image_url || '')}">
        <div data-media-preview>${mediaPreviewCardHtml({title:`Фото раздела «${title}»`, url:section.cover_image_url || '', alt:section.cover_image_alt || title, ratio:'landscape', emptyText:'Фото не выбрано'})}</div>
        <div class="stack">
          <label><span>Фото раздела</span><input data-media-file name="section_cover_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
          <div class="row"><button class="secondary" type="button" data-media-clear>Убрать фото</button></div>
          <p class="form-note" data-media-feedback data-feedback-style="note"></p>
          <label><span>Короткое описание фото</span><input name="section_cover_alt" value="${attr(section.cover_image_alt || title)}"></label>
        </div>
      </div>
    </details>
    ${adminSectionTopicsHtml(section)}
    <div class="row"><button class="primary" type="submit" data-save-content>Сохранить раздел</button><a class="secondary" href="${routeHref(route)}" target="_blank" rel="noopener">Открыть раздел</a></div>
  </form>`;
}
function adminTrafficEditorHtml(){
  if(!state.adminTraffic){
    return `<div class="admin-editor__traffic">${loading('Открываю посещаемость…')}</div>`;
  }
  return `<div class="admin-editor__traffic">${adminTrafficBoardHtml()}</div>`;
}
function adminTrafficEditorPanelHtml(){
  if(!state.adminTraffic){
    return `<article class="admin-editor__panel admin-editor__panel--traffic">
      <div class="admin-editor__panel-head"><div><h2 class="admin-editor__panel-title">Посещаемость</h2></div></div>
      <div class="admin-editor__traffic">${loading('Открываю посещаемость…')}</div>
    </article>`;
  }
  return `<article class="admin-editor__panel admin-editor__panel--traffic">
    <div class="admin-editor__panel-head">
      <div><h2 class="admin-editor__panel-title">Посещаемость</h2></div>
      <div class="admin-editor__traffic-actions">
      <button class="secondary" type="button" data-action="admin-traffic-refresh">Обновить</button>
      <button class="plain danger" type="button" data-action="admin-traffic-reset">Сбросить</button>
    </div>
    </div>
    ${adminTrafficEditorHtml()}
  </article>`;
}
function adminProfileName(profile={}){
  return cleanText(profile.display_name || profile.nickname || profile.email || 'Профиль');
}
function adminProfileDuration(seconds=0){
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if(hours) return `${hours}ч ${minutes}м`;
  if(minutes) return `${minutes}м`;
  return '0м';
}
function adminProfileStatusTags(profile={}){
  const tags = [];
  if(profile.blocked) tags.push(['заблокирован','is-danger']);
  if(profile.email_blocked) tags.push(['почта','is-danger']);
  if(profile.ip_blocked) tags.push(['IP','is-danger']);
  if(profile.comments_locked) tags.push(['комм. закрыты','is-warning']);
  if(profile.trusted) tags.push(['без проверки','is-good']);
  if(profile.must_change_avatar || profile.must_change_nickname) tags.push(['замена','is-warning']);
  return tags.map(([label, cls]) => `<em class="${cls}">${esc(label)}</em>`).join('');
}
function adminProfilesFiltered(){
  const source = Array.isArray(state.adminProfiles?.profiles) ? state.adminProfiles.profiles : [];
  const query = cleanText(state.adminProfileQuery || '').toLowerCase();
  const filter = state.adminProfileFilter || 'all';
  return source.filter(profile => {
    const hay = `${profile.display_name || ''} ${profile.nickname || ''} ${profile.email || ''}`.toLowerCase();
    if(query && !hay.includes(query)) return false;
    if(filter === 'blocked') return Boolean(profile.blocked || profile.email_blocked || profile.ip_blocked);
    if(filter === 'trusted') return Boolean(profile.trusted);
    if(filter === 'locked') return Boolean(profile.comments_locked);
    if(filter === 'change') return Boolean(profile.must_change_avatar || profile.must_change_nickname);
    return true;
  });
}
function adminProfileRowsHtml(){
  const rows = adminProfilesFiltered();
  return rows.slice(0, 160).map(profile => {
    const active = String(state.adminProfileId || '') === String(profile.id || '');
    const stats = profile.visit_stats || {};
    const meta = [
      profile.email || '',
      profile.last_seen ? `был ${date(profile.last_seen)}` : 'без входов',
      `${Number(profile.comments_total || 0)} комм.`,
    ].filter(Boolean);
    const tags = adminProfileStatusTags(profile);
    return `<div class="admin-profile-row ${active ? 'active' : ''}">
      <button type="button" data-action="admin-profile-select" data-id="${attr(profile.id)}" aria-pressed="${active ? 'true' : 'false'}">
        <strong>${esc(adminProfileName(profile))}</strong>
        <span>${meta.map(item => esc(item)).join(' · ')}${tags ? `<span class="admin-profile-tags">${tags}</span>` : ''}</span>
      </button>
      <div class="admin-profile-row__side">
        <span>${esc(adminProfileDuration(stats.today_seconds || 0))}</span>
        <a class="plain" href="${attr(profile.profile_url || '#')}" target="_blank" rel="noopener" title="Открыть публичный профиль">↗</a>
      </div>
    </div>`;
  }).join('') || `<div class="admin-profile-empty">Ничего не найдено.</div>`;
}
function adminProfilesListHtml(){
  const summary = state.adminProfiles?.summary || {};
  const visible = adminProfilesFiltered().length;
  return `<aside class="admin-profile-list">
    <div class="admin-profile-tools">
      <input class="admin-editor__input" id="adminProfileSearch" value="${attr(state.adminProfileQuery || '')}" placeholder="Найти по имени или почте" autocomplete="off">
      <select class="admin-editor__select" id="adminProfileFilter" aria-label="Фильтр профилей">
        ${[
          ['all','Все'],
          ['blocked','Блоки'],
          ['trusted','Без проверки'],
          ['locked','Комм. закрыты'],
          ['change','Замена'],
        ].map(([value,label]) => `<option value="${attr(value)}" ${state.adminProfileFilter === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}
      </select>
    </div>
    <div class="admin-profile-count" data-admin-profile-count>${esc(visible)} из ${esc(summary.total || 0)}</div>
    <div class="admin-profile-rows" id="adminProfileRows">${adminProfileRowsHtml()}</div>
  </aside>`;
}
function adminProfileLockMode(profile={}){
  if(profile.comments_locked_permanent) return 'permanent';
  if(cleanText(profile.comments_locked_until || '')) return 'until';
  return 'none';
}
function adminProfileInfoGrid(profile={}){
  const stats = profile.visit_stats || {};
  const cells = [
    ['Почта', profile.email || '—'],
    ['Регистрация', date(profile.created_at)],
    ['Последний вход', profile.last_seen ? time(profile.last_seen) : '—'],
    ['Сегодня', `${adminProfileDuration(stats.today_seconds || 0)} · ${Number(stats.today_pageviews || 0)} просм.`],
    ['14 дней', `${adminProfileDuration(stats.seconds_14d || 0)} · ${Number(stats.pageviews_14d || 0)} просм.`],
    ['IP', profile.last_ip || '—'],
  ];
  return `<div class="admin-profile-facts">${cells.map(([label,value]) => `<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</div>`;
}
function adminProfileSettingsHtml(profile={}){
  const lockMode = adminProfileLockMode(profile);
  const lockDate = inputDateValue(profile.comments_locked_until || '');
  return `<form class="admin-profile-settings" id="adminProfileSettingsForm" data-id="${attr(profile.id)}" data-lock-mode="${attr(lockMode)}">
    <div class="admin-profile-switches">
      <label><input type="checkbox" name="trusted" ${profile.trusted ? 'checked' : ''}><span>Комментарии без проверки</span></label>
      <label><input type="checkbox" name="blocked" ${profile.blocked ? 'checked' : ''}><span>Заблокировать профиль</span></label>
      <label><input type="checkbox" name="email_blocked" ${profile.email_blocked ? 'checked' : ''}><span>Блок почты</span></label>
      <label class="${profile.last_ip ? '' : 'is-disabled'}"><input type="checkbox" name="ip_blocked" ${profile.ip_blocked ? 'checked' : ''} ${profile.last_ip ? '' : 'disabled'}><span>Блок IP</span></label>
      <label><input type="checkbox" name="must_change_avatar" ${profile.must_change_avatar ? 'checked' : ''}><span>Заменить фото</span></label>
      <label><input type="checkbox" name="must_change_nickname" ${profile.must_change_nickname ? 'checked' : ''}><span>Заменить имя</span></label>
    </div>
    <div class="admin-profile-form-grid">
      <label><span>Доступ</span><select class="admin-editor__select" name="comment_lock_mode">
        <option value="none" ${lockMode === 'none' ? 'selected' : ''}>Открыты</option>
        <option value="until" ${lockMode === 'until' ? 'selected' : ''}>До даты</option>
        <option value="permanent" ${lockMode === 'permanent' ? 'selected' : ''}>Закрыты</option>
      </select></label>
      <label data-lock-date><span>Дата</span><input class="admin-editor__input" name="comments_locked_until" type="date" value="${attr(lockDate)}"></label>
      <label><span>Причина</span><input class="admin-editor__input" name="block_reason" value="${attr(profile.block_reason || profile.comments_locked_reason || '')}"></label>
      <label><span>Заметка</span><input class="admin-editor__input" name="moderation_note" value="${attr(profile.moderation_note || '')}"></label>
    </div>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="admin-profile-actions">
      <button class="primary" type="submit" data-save-content>Сохранить</button>
      <button class="plain danger" type="button" data-action="admin-profile-delete" data-id="${attr(profile.id)}">Удалить</button>
    </div>
  </form>`;
}
function adminProfileCommentStatus(status=''){
  const names = {published:'опубликован', pending:'на проверке', hidden:'скрыт', rejected:'удалён'};
  return names[status] || status || '—';
}
function adminProfileCommentsHtml(comments=[]){
  const rows = Array.isArray(comments) ? comments : [];
  return `<section class="admin-profile-comments">
    <div class="admin-profile-section-head"><strong>Комментарии</strong><span>${esc(rows.length)}</span></div>
    <div class="admin-profile-comment-rows">
      ${rows.map(comment => {
        const canPublish = comment.status !== 'published';
        const canHide = comment.status === 'published' || comment.status === 'pending';
        return `<article class="admin-profile-comment">
          <a href="${attr(comment.target_url || '#')}" target="_blank" rel="noopener"><strong>${esc(comment.target_title || 'Материал')}</strong><span>${esc(date(comment.created_at))} · ${esc(adminProfileCommentStatus(comment.status))}</span></a>
          <p>${esc(short(comment.body || '', 220))}</p>
          <div class="admin-profile-comment-actions">
            ${canPublish ? `<button class="plain" type="button" data-action="admin-profile-comment" data-id="${attr(comment.id)}" data-user-id="${attr(comment.user_id)}" data-status="published">Опубликовать</button>` : ''}
            ${canHide ? `<button class="plain danger" type="button" data-action="admin-profile-comment" data-id="${attr(comment.id)}" data-user-id="${attr(comment.user_id)}" data-status="hidden">Скрыть</button>` : ''}
          </div>
        </article>`;
      }).join('') || `<div class="admin-profile-empty">Комментариев нет.</div>`}
    </div>
  </section>`;
}
function adminProfileDetailHtml(){
  const detail = state.adminProfileDetail;
  const selectedId = String(state.adminProfileId || '');
  if(!selectedId) return `<section class="admin-profile-detail is-empty">Выберите профиль.</section>`;
  if(!detail || String(state.adminProfileDetailId || '') !== selectedId){
    return `<section class="admin-profile-detail">${loading('Открываю профиль…')}</section>`;
  }
  const profile = detail.profile || {};
  return `<section class="admin-profile-detail">
    <header class="admin-profile-head">
      <div class="admin-profile-person">
        ${profileAvatarHtml(profile, 'admin')}
        <div><h3>${esc(adminProfileName(profile))}</h3><span>${profile.nickname ? '@' + esc(profile.nickname) : ''}</span></div>
      </div>
      <a class="secondary" href="${attr(profile.profile_url || '#')}" target="_blank" rel="noopener">Открыть профиль</a>
    </header>
    ${adminProfileInfoGrid(profile)}
    ${adminProfileSettingsHtml(profile)}
    ${adminProfileCommentsHtml(detail.comments || [])}
  </section>`;
}
function adminProfilesEditorPanelHtml(){
  if(!state.adminProfiles){
    return `<article class="admin-editor__panel admin-editor__panel--profiles">
      <div class="admin-editor__panel-head"><div><h2 class="admin-editor__panel-title">Профили</h2></div></div>
      ${adminCommunityLoadingHtml('Открываю профили…')}
    </article>`;
  }
  const profiles = state.adminProfiles.profiles || [];
  if(!state.adminProfileId && profiles.length) state.adminProfileId = String(profiles[0].id || '');
  const summary = state.adminProfiles.summary || {};
  return `<article class="admin-editor__panel admin-editor__panel--profiles">
    <div class="admin-editor__panel-head">
      <div><h2 class="admin-editor__panel-title">Профили</h2></div>
      <div class="admin-profile-summary">
        <span>${esc(summary.total || 0)} всего</span>
        <span>${esc(summary.blocked || 0)} блок</span>
        <span>${esc(summary.locked_comments || 0)} закрыто</span>
        <button class="plain" type="button" data-action="admin-profile-refresh">Обновить</button>
      </div>
    </div>
    <div class="admin-profile-workspace">
      ${adminProfilesListHtml()}
      ${adminProfileDetailHtml()}
    </div>
  </article>`;
}
function hasAdminCommunity(){
  const community = state.dashboard?.community;
  return Boolean(community && Array.isArray(community.pending_questions) && Array.isArray(community.pending_comments) && Array.isArray(community.users));
}
function adminCommunityLoadingHtml(text='Открываю данные…'){
  return `<div class="admin-editor__queue">${loading(text)}</div>`;
}
function adminSeoEditorHtml(){
  const brandData = state.content?.brand || {};
  return `<form class="form admin-editor__form" id="adminSeoForm">
    <p class="form-note" data-persistent-feedback></p>
    <div class="admin-editor__form-grid">
      ${editorField('Название сайта', 'site_name', brandData.site_name || siteName(), {required:true})}
      ${editorField('Название Мастерской', 'admin_area_name', brandData.admin_area_name || adminAreaName())}
      ${editorField('Название Требника', 'client_area_name', brandData.client_area_name || clientAreaName())}
      ${editorField('Имя / подпись', 'owner_name', brandData.owner_name || '')}
    </div>
    <p class="form-note">SEO страниц находится в нужном разделе.</p>
    <div class="row"><button class="primary" type="submit" data-save-content>Сохранить</button></div>
  </form>`;
}
function adminMaterialEditorPageHtml(){
  const config = state.adminMaterialEditor;
  if(!config || !sectionRoutes.includes(config.route)){
    state.adminMaterialEditor = null;
    return '';
  }
  const route = config.route;
  const sectionTitle = sectionDisplayName(route);
  const isNew = config.mode === 'new';
  const found = isNew ? null : findEditableMaterial(state.content, route, config.slug || '', config.index);
  if(!isNew && !found?.item){
    state.adminMaterialEditor = null;
    return editorPanel('Материал не найден', 'Обновите страницу или выберите материал из списка.', `<div class="row"><button class="secondary" data-action="select-admin-editor-page" data-page="${attr(route)}">К списку материалов</button></div>`);
  }
  const item = isNew ? createEmptyItem() : found.item;
  const itemIndex = isNew ? 0 : found.index;
  const formId = isNew ? 'newMaterialForm' : 'materialForm';
  const title = isNew ? 'Новый материал' : (item.title || 'Материал');
  return `<article class="admin-material-workspace">
    <div class="admin-material-header">
      <div>
        <button class="linkish admin-material-back" type="button" data-action="cancel-material-editor">Закрыть редактор</button>
        <h2>${esc(title)}</h2>
        <p>Пишите и собирайте материал здесь. После сохранения изменения сразу появятся на сайте.</p>
      </div>
      <div class="row">
        <a class="secondary" href="${routeHref(route)}" target="_blank" rel="noopener">Открыть раздел</a>
      </div>
    </div>
    <form class="form admin-material-form" id="${formId}" data-route="${attr(route)}" ${isNew ? '' : `data-slug="${attr(config.slug || item.slug || '')}" data-index="${attr(itemIndex)}"`}>
      <p class="form-note" data-form-feedback data-feedback-style="note"></p>
      ${itemEditor(item, itemIndex, {showRemove:false, route, mode:isNew ? 'new' : 'edit'})}
      <div class="admin-material-savebar">
        <button class="primary" type="submit" data-save-content>${isNew ? 'Создать материал' : 'Сохранить материал'}</button>
        <button class="secondary" type="button" data-action="cancel-material-editor">Отмена</button>
      </div>
    </form>
  </article>`;
}
function adminEditorMainHtml(){
  if(state.adminMaterialEditor) return adminMaterialEditorPageHtml();
  const page = normalizeAdminEditorPage(state.adminEditorPage);
  if(page === 'home') return editorPanel('Главная', '', adminHomeEditorHtml());
  if(page === 'profiles') return adminProfilesEditorPanelHtml();
  if(page === 'traffic') return adminTrafficEditorPanelHtml();
  if(sectionRoutes.includes(page)) return editorPanel(adminEditorPageLabel(page), '', adminSectionEditorHtml(page));
  return editorPanel('Главная', '', adminHomeEditorHtml());
}
function adminEditorNeedsCommunity(page){
  return false;
}
function paintAdminEditor(){
  state.adminEditorPage = normalizeAdminEditorPage(state.adminEditorPage);
  app.innerHTML = adminEditorShell(adminEditorMainHtml());
  bindAdminEditor(app);
  paintSaveStatus();
  if(state.adminEditorPage === 'traffic' && !state.adminTraffic && !state.adminTrafficPromise){
    loadAdminTraffic().then(() => {
      if(state.route === 'admin' && state.adminEditorPage === 'traffic') paintAdminEditor();
    }).catch(error => {
      app.querySelector('.admin-editor__main')?.insertAdjacentHTML('beforeend', `<p class="form-feedback is-danger">${esc(error.message || 'Не удалось открыть посещаемость.')}</p>`);
    });
  }
  if(state.adminEditorPage === 'profiles' && !state.adminProfiles && !state.adminProfilesPromise){
    loadAdminProfiles().then(() => {
      if(state.route === 'admin' && state.adminEditorPage === 'profiles') paintAdminEditor();
    }).catch(error => {
      app.querySelector('.admin-editor__main')?.insertAdjacentHTML('beforeend', `<p class="form-feedback is-danger">${esc(error.message || 'Не удалось открыть профили.')}</p>`);
    });
  }
  if(state.adminEditorPage === 'profiles' && state.adminProfileId && (!state.adminProfileDetail || String(state.adminProfileDetailId || '') !== String(state.adminProfileId)) && !state.adminProfileDetailPromise){
    loadAdminProfileDetail(state.adminProfileId).then(() => {
      if(state.route === 'admin' && state.adminEditorPage === 'profiles') paintAdminEditor();
    }).catch(error => {
      app.querySelector('.admin-profile-detail')?.insertAdjacentHTML('beforeend', `<p class="form-feedback is-danger">${esc(error.message || 'Не удалось открыть профиль.')}</p>`);
    });
  }
  if(adminEditorNeedsCommunity(state.adminEditorPage) && !hasAdminCommunity() && !state.adminCommunityPromise){
    loadAdminCommunity().then(() => {
      if(state.route === 'admin' && adminEditorNeedsCommunity(state.adminEditorPage)) paintAdminEditor();
    }).catch(error => {
      app.querySelector('.admin-editor__main')?.insertAdjacentHTML('beforeend', `<p class="form-feedback is-danger">${esc(error.message || 'Не удалось открыть вопросы.')}</p>`);
    });
  }
}
function bindAdminEditor(root){
  bindMediaFields(root);
  bindFeaturedChecklist(root);
  bindItemPreviews(root);
  bindRichEditors(root);
  initBlockEditors(root);
  bindAdminEditorDirty(root);
  bindSectionTopicEditor(root);
  root.querySelector('#adminHomeEditorForm')?.addEventListener('submit', saveAdminHomeEditorForm);
  root.querySelector('#adminSeoForm')?.addEventListener('submit', saveAdminSeoForm);
  root.querySelector('#sectionSettingsForm')?.addEventListener('submit', saveSectionSettingsForm);
  root.querySelector('#newMaterialForm')?.addEventListener('submit', saveNewMaterialForm);
  root.querySelector('#materialForm')?.addEventListener('submit', saveMaterialForm);
  bindAdminProfiles(root);
}
function bindSectionTopicEditor(root){
  root.querySelectorAll('[data-action="section-topic-add"]').forEach(button => {
    if(button.dataset.topicBound === '1') return;
    button.dataset.topicBound = '1';
    button.addEventListener('click', () => {
      const form = button.closest('form');
      const box = form?.querySelector('[data-section-topics]');
      if(!box) return;
      box.querySelector('.section-topic-empty')?.remove();
      box.insertAdjacentHTML('beforeend', adminSectionTopicRowHtml({}, box.querySelectorAll('[data-section-topic-row]').length));
      setSaveStatus('dirty', 'Есть изменения');
      const added = box.lastElementChild;
      added?.querySelector('[name="topic_title"]')?.focus();
      bindSectionTopicEditor(root);
    });
  });
  root.querySelectorAll('[data-action="section-topic-remove"]').forEach(button => {
    if(button.dataset.topicBound === '1') return;
    button.dataset.topicBound = '1';
    button.addEventListener('click', () => {
      const row = button.closest('[data-section-topic-row]');
      const box = row?.parentElement;
      row?.remove();
      if(box && !box.querySelector('[data-section-topic-row]')){
        box.innerHTML = '<div class="section-topic-empty">Тем пока нет.</div>';
      }
      setSaveStatus('dirty', 'Есть изменения');
    });
  });
}
function bindAdminProfiles(root){
  const search = root.querySelector('#adminProfileSearch');
  const filter = root.querySelector('#adminProfileFilter');
  const rows = root.querySelector('#adminProfileRows');
  const count = root.querySelector('[data-admin-profile-count]');
  const repaintList = () => {
    if(rows) rows.innerHTML = adminProfileRowsHtml();
    if(count){
      const summary = state.adminProfiles?.summary || {};
      count.textContent = `${adminProfilesFiltered().length} из ${summary.total || 0}`;
    }
  };
  search?.addEventListener('input', () => {
    state.adminProfileQuery = search.value || '';
    repaintList();
  });
  filter?.addEventListener('change', () => {
    state.adminProfileFilter = filter.value || 'all';
    repaintList();
  });
  const form = root.querySelector('#adminProfileSettingsForm');
  form?.querySelector('[name="comment_lock_mode"]')?.addEventListener('change', event => {
    form.dataset.lockMode = event.currentTarget.value || 'none';
  });
  form?.addEventListener('submit', saveAdminProfileSettings);
}
async function saveAdminProfileSettings(event){
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = form.querySelector('[data-form-feedback]');
  const data = new FormData(form);
  const id = form.dataset.id || state.adminProfileId || '';
  if(!id || form.dataset.saving === '1') return;
  const body = {
    id,
    trusted:Boolean(data.get('trusted')),
    blocked:Boolean(data.get('blocked')),
    email_blocked:Boolean(data.get('email_blocked')),
    ip_blocked:Boolean(data.get('ip_blocked')),
    must_change_avatar:Boolean(data.get('must_change_avatar')),
    must_change_nickname:Boolean(data.get('must_change_nickname')),
    comment_lock_mode:data.get('comment_lock_mode') || 'none',
    comments_locked_until:data.get('comments_locked_until') || '',
    comments_locked_reason:data.get('block_reason') || '',
    block_reason:data.get('block_reason') || '',
    moderation_note:data.get('moderation_note') || '',
  };
  form.dataset.saving = '1';
  setContentFormBusy(form, true);
  try{
    setFeedback(feedback, 'Сохраняю…', 'warning');
    const payload = await api('/api/admin/profiles/update', {method:'POST', body});
    state.adminProfileDetail = {profile:payload.profile, comments:payload.comments || []};
    state.adminProfileDetailId = String(payload.profile?.id || id);
    await loadAdminProfiles(true);
    setFeedback(feedback, 'Сохранено.', 'success');
    paintAdminEditor();
  }catch(error){
    setFeedback(feedback, error.message || 'Не удалось сохранить профиль.', 'danger');
  }finally{
    delete form.dataset.saving;
    setContentFormBusy(form, false);
  }
}
function bindAdminEditorDirty(root){
  root.querySelectorAll('form').forEach(form => {
    if(form.dataset.adminDirtyBound === '1') return;
    form.dataset.adminDirtyBound = '1';
    form.addEventListener('input', () => setSaveStatus('dirty', 'Есть изменения'));
    form.addEventListener('change', () => setSaveStatus('dirty', 'Есть изменения'));
  });
}
async function saveWholeContent(content, fallback='Сохранено.'){
  setSaveStatus('saving', 'Сохраняю…');
  const payload = await api('/api/admin/content', {method:'POST', body:{content, base_updated_at:baseUpdatedAt(), base_version:baseContentVersion()}});
  state.content = payload.content;
  const message = saveSummary(payload, fallback);
  setSaveStatus('saved', `${message} Изменения уже на сайте.`);
  say(message, 'success');
  return payload;
}
async function saveAdminHomeEditorForm(event){
  event.preventDefault();
  const form = event.currentTarget;
  if(form.dataset.saving === '1') return;
  const feedback = form.querySelector('[data-persistent-feedback]');
  if(Number(app.dataset.mediaUploadsInProgress || 0) > 0){
    setFeedback(feedback, 'Подождите, пока сайт закончит загрузку изображения.', 'warning');
    return;
  }
  form.dataset.saving = '1';
  setContentFormBusy(form, true);
  try{
    const content = clone(state.content);
    content.brand = {...(content.brand || {}), site_name:fieldValue(form, 'site_name'), site_subtitle:fieldValue(form, 'site_subtitle'), admin_area_name:fieldValue(form, 'admin_area_name'), client_area_name:fieldValue(form, 'client_area_name')};
    content.home = {
      ...(content.home || {}),
      hero_kicker:fieldValue(form, 'hero_kicker'),
      hero_title:fieldValue(form, 'hero_title'),
      welcome_title:fieldValue(form, 'hero_title'),
      hero_text:fieldValue(form, 'hero_text'),
      welcome_text:fieldValue(form, 'hero_text'),
      hero_image_url:fieldValue(form, 'hero_image_url'),
      hero_image_alt:fieldValue(form, 'hero_image_alt'),
      cta_primary_label:fieldValue(form, 'cta_primary_label'),
      cta_primary:fieldValue(form, 'cta_primary_label'),
      cta_primary_route:fieldValue(form, 'cta_primary_route') || 'services',
      cta_primary_action:fieldValue(form, 'cta_primary_action') || 'inquiry',
      cta_primary_title:fieldValue(form, 'cta_primary_title') || 'Заявка с главной',
      cta_secondary_label:fieldValue(form, 'cta_secondary_label'),
      cta_secondary:fieldValue(form, 'cta_secondary_label'),
      cta_secondary_route:fieldValue(form, 'cta_secondary_route') || 'services',
      telegram_label:fieldValue(form, 'telegram_label') || 'Написать в Telegram',
      telegram_url:fieldValue(form, 'telegram_url'),
      site_message_label:fieldValue(form, 'site_message_label') || 'Написать тут',
      show_featured:checkboxValue(form, 'show_featured', false),
      featured_material_ids:[...form.querySelectorAll('[name="featured_material_ids"]:checked')].map(box => cleanText(box.value)).filter(Boolean).slice(0,4),
      seo_title:fieldValue(form, 'home_seo_title'),
      seo_description:fieldValue(form, 'home_seo_description'),
    };
    const payload = await saveWholeContent(content, 'Главная сохранена.');
    setFeedback(feedback, saveSummary(payload, 'Главная сохранена.') + ' Изменения уже на сайте.', 'success');
    paintAdminEditor();
  }catch(error){
    const message = error?.message || 'Не удалось сохранить главную.';
    setSaveStatus('error', message);
    setFeedback(feedback, message, 'danger');
    say(message, 'danger');
  }finally{
    delete form.dataset.saving;
    setContentFormBusy(form, false);
  }
}
async function saveAdminSeoForm(event){
  event.preventDefault();
  const form = event.currentTarget;
  if(form.dataset.saving === '1') return;
  const feedback = form.querySelector('[data-persistent-feedback]');
  form.dataset.saving = '1';
  setContentFormBusy(form, true);
  try{
    const content = clone(state.content);
    content.brand = {...(content.brand || {}), site_name:fieldValue(form, 'site_name'), admin_area_name:fieldValue(form, 'admin_area_name'), client_area_name:fieldValue(form, 'client_area_name'), owner_name:fieldValue(form, 'owner_name')};
    const payload = await saveWholeContent(content, 'Настройки сохранены.');
    setFeedback(feedback, saveSummary(payload, 'Настройки сохранены.') + ' Изменения уже на сайте.', 'success');
    paintAdminEditor();
  }catch(error){
    const message = error?.message || 'Не удалось сохранить настройки.';
    setSaveStatus('error', message);
    setFeedback(feedback, message, 'danger');
    say(message, 'danger');
  }finally{
    delete form.dataset.saving;
    setContentFormBusy(form, false);
  }
}
function slugifyRu(text=''){
  const map = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
  return String(text || '').toLowerCase().split('').map(ch => map[ch] ?? ch).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0,80) || `material-${Date.now()}`;
}
function newMaterialModal(route){
  if(!sectionRoutes.includes(route)) return say('Раздел не найден.', 'warning');
  openPublicMaterialEditor({mode:'new', route});
}
function repaintAfterMaterialChange(route='', slug='', options={}){
  const deleted = Boolean(options.deleted);
  closeModal(true);
  state.adminMaterialEditor = null;
  state.publicMaterialEditor = null;
  if(deleted && state.route === route && state.slug){
    go(route);
    return;
  }
  if(state.route === 'admin'){
    paintAdminEditor();
    return;
  }
  if(state.route === route && state.slug && slug && state.slug !== slug){
    go(route, slug);
    return;
  }
  render();
}
async function saveNewMaterialForm(event){
  event.preventDefault();
  const form = event.currentTarget;
  if(form.dataset.saving === '1') return;
  const route = form.dataset.route;
  const feedback = form.querySelector('[data-form-feedback]');
  const mediaRoot = mediaRootForForm(form);
  if(Number(mediaRoot?.dataset.mediaUploadsInProgress || 0) > 0){
    setFeedback(feedback, 'Подождите, пока сайт закончит загрузку изображения.', 'warning');
    return;
  }
  form.dataset.saving = '1';
  setContentFormBusy(form, true);
  try{
    await syncBlockEditors(form);
    const box = form.querySelector('[data-item]');
    const item = readItemEditorBox(box, 0);
    item.slug = item.slug || slugifyRu(item.title || 'material');
    setSaveStatus('saving', 'Создаю материал…');
    setFeedback(feedback, 'Создаю материал…', 'warning');
    const payload = await api('/api/admin/content/material/create', {method:'POST', body:{
      route,
      base_updated_at:baseUpdatedAt(),
      base_version:baseContentVersion(),
      material:item,
    }});
    state.content = payload.content;
    const savedSlug = payload.material?.slug || item.slug;
    setSaveStatus('saved', 'Материал создан. Изменения уже на сайте.');
    state.publicMaterialEditor = null;
    go(route, savedSlug);
  }catch(error){
    const message = error?.message || 'Не удалось создать материал.';
    setSaveStatus('error', message);
    setFeedback(feedback, message, 'danger');
    say(message, 'danger');
  }finally{
    delete form.dataset.saving;
    setContentFormBusy(form, false);
  }
}
async function deleteMaterial(route, slug='', fallbackIndex=null){
  if(!isAdmin()) return loginModal('admin');
  if(!sectionRoutes.includes(route)){
    say('Раздел не найден.', 'warning');
    return;
  }
  const content = clone(state.content);
  const section = content.sections?.[route];
  const items = Array.isArray(section?.items) ? section.items : [];
  let index = items.findIndex(item => String(item.slug || '') === String(slug || ''));
  if(index < 0 && fallbackIndex !== null && fallbackIndex !== ''){
    const numericIndex = Number(fallbackIndex);
    if(Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < items.length) index = numericIndex;
  }
  if(index < 0){
    say('Материал не найден. Обновите страницу.', 'warning');
    return;
  }
  const item = items[index];
  const title = item.title || 'Без названия';
  const sectionTitle = section.title || sectionNames[route] || route;
  if(!window.confirm(`Удалить материал «${title}» из раздела «${sectionTitle}»? Он исчезнет с сайта. Перед изменением сайт создаст резервную копию.`)) return;
  try{
    setSaveStatus('saving', 'Удаляю материал…');
    const payload = await api('/api/admin/content/material/delete', {method:'POST', body:{
      route,
      slug:cleanText(item.slug || slug),
      index:fallbackIndex,
      base_updated_at:baseUpdatedAt(),
      base_version:baseContentVersion(),
    }});
    state.content = payload.content;
    setSaveStatus('saved', 'Материал удален. Изменения уже на сайте.');
    repaintAfterMaterialChange(route, payload.deleted?.slug || slug, {deleted:true});
  }catch(error){
    const message = error?.message || 'Не удалось удалить материал.';
    setSaveStatus('error', message);
    say(message, 'danger');
  }
}
async function toggleMaterialVisibility(route, slug='', fallbackIndex=null, nextStatus=''){
  if(!isAdmin()) return loginModal('admin');
  if(!sectionRoutes.includes(route)){
    say('Раздел не найден.', 'warning');
    return;
  }
  const section = state.content?.sections?.[route];
  const items = Array.isArray(section?.items) ? section.items : [];
  let index = items.findIndex(item => String(item.slug || '') === String(slug || ''));
  if(index < 0 && fallbackIndex !== null && fallbackIndex !== ''){
    const numericIndex = Number(fallbackIndex);
    if(Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < items.length) index = numericIndex;
  }
  if(index < 0){
    say('Материал не найден. Обновите страницу.', 'warning');
    return;
  }
  const current = items[index].status || 'published';
  const status = ['published','hidden','draft'].includes(nextStatus) ? nextStatus : (current === 'published' ? 'hidden' : 'published');
  try{
    setSaveStatus('saving', status === 'published' ? 'Открываю материал…' : 'Скрываю материал…');
    const payload = await api('/api/admin/content/material/status', {method:'POST', body:{
      route,
      slug:cleanText(items[index].slug || slug),
      index:fallbackIndex,
      status,
      base_updated_at:baseUpdatedAt(),
      base_version:baseContentVersion(),
    }});
    state.content = payload.content;
    setSaveStatus('saved', `${status === 'published' ? 'Материал показан на сайте.' : 'Материал скрыт с сайта.'} Изменения уже на сайте.`);
    repaintAfterMaterialChange(route, payload.material?.slug || slug);
  }catch(error){
    const message = error?.message || 'Не удалось изменить видимость материала.';
    setSaveStatus('error', message);
    say(message, 'danger');
  }
}
function ensureSelectedClient(clients){
  const selected = clients.find(c => String(c.id) === String(state.clientId));
  if(selected) return selected;
  const fallback = clients.find(c => !c.is_archived) || clients[0];
  if(fallback?.id){
    state.clientId = String(fallback.id);
    localStorage.setItem(keys.client, state.clientId);
    return fallback;
  }
  state.clientId = '';
  localStorage.removeItem(keys.client);
  return null;
}
function adminPendingAmount(){
  if(!hasAdminWorkbench()) return '…';
  return money((state.dashboard.pending_payments || []).reduce((sum, item) => sum + Number(item.amount || 0), 0));
}
function adminWorkbenchHtml(){
  if(state.adminWorkbenchError){
    return `<div class="workbench"><div class="admin-card"><h2>Рабочие блоки</h2><p>${esc(state.adminWorkbenchError)}</p></div></div>`;
  }
  if(!hasAdminWorkbench()){
    return `<div class="workbench">${adminLoadingCard('Заявки с сайта')}${adminLoadingCard('Платежи на подтверждение')}${adminLoadingCard('На сегодня')}${adminLoadingCard('Свежие апдейты')}${adminLoadingCard('Заканчиваются услуги')}</div>`;
  }
  return `${adminQueueHtml()}
  <div class="workbench">
    ${adminInquiries(state.dashboard.inquiries || [])}
    ${adminClientMessages(state.dashboard.client_messages || [])}
    ${adminPaymentReceipts(state.dashboard.payment_receipts || [])}
    ${adminExtendRequests(state.dashboard.service_extend_requests || [])}
    ${adminListCard('Платежи на подтверждение', state.dashboard.pending_payments || [], paymentLine, 'Таких платежей нет.')}
    ${adminListCard('На сегодня', state.dashboard.work_today || [], workLine, 'Проведений на сегодня нет.')}
    ${adminListCard('Ближайшие 3 дня', state.dashboard.work_upcoming || [], workLine, 'На ближайшие 3 дня работ не найдено.')}
    ${adminListCard('Свежие апдейты', state.dashboard.recent_updates || [], adminUpdateLine, 'Апдейтов пока нет.')}
    ${adminListCard('Заканчиваются услуги', state.dashboard.expiring_services || [], serviceDueLine, 'На ближайшие дни таких услуг нет.')}
  </div>`;
}
function adminQueueHtml(){
  const urgent = [
    ...(state.dashboard.inquiries || []).filter(row => row.status === 'new').slice(-4).reverse().map(row => queueItem('Новая заявка', row.material_title || 'Заявка', `${row.name || 'Без имени'} · ${time(row.created_at)}`)),
    ...(state.dashboard.payment_receipts || []).slice(-4).reverse().map(row => queueItem('Клиент отметил платёж', row.client_name || 'Клиент', `${row.amount || 'сумма не указана'} · ${time(row.created_at)}`)),
    ...(state.dashboard.pending_payments || []).slice(0,4).map(row => queueItem('Платёж ждёт подтверждения', row.client_name || 'Клиент', `${money(row.amount || 0)} · ${time(row.created_at)}`)),
  ].slice(0,6);
  const today = (state.dashboard.work_agenda || []).slice(0,6).map(row => queueItem('Ближайшая работа', row.client_name || 'Клиент', `${row.title || row.request_title || 'Работа'} · ${date(row.next_due)}`));
  const waiting = [
    ...(state.dashboard.client_messages || []).slice(-5).reverse().map(row => queueItem(row.kind === 'update' ? 'Апдейт' : 'Вопрос', row.client_name || 'Клиент', `${short(row.text || '', 90)} · ${time(row.created_at)}`)),
    ...(state.dashboard.service_extend_requests || []).slice(-3).reverse().map(row => queueItem('Запрос на новый срок', row.client_name || 'Клиент', `${row.service_title || 'Услуга'} · ${date(row.requested_until)}`)),
  ].slice(0,6);
  return `<section class="admin-queue">
    ${adminQueueColumn('Срочно', urgent, 'Срочных дел нет.')}
    ${adminQueueColumn('Сегодня', today, 'Работ на сегодня не найдено.')}
    ${adminQueueColumn('Ждёт ответа', waiting, 'Новых ожиданий нет.')}
  </section>`;
}
function queueItem(kicker, title, meta){
  return `<div class="queue-line"><span>${esc(kicker)}</span><strong>${esc(title || 'Без названия')}</strong><em>${esc(meta || '')}</em></div>`;
}
function adminQueueColumn(title, rows, emptyText){
  return `<article class="admin-card queue-card"><h2>${esc(title)}</h2><div class="queue-list">${rows.join('') || empty(emptyText)}</div></article>`;
}
function paintAdmin(){
  const clients = state.dashboard?.clients || [];
  const selected = ensureSelectedClient(clients);
  const notes = (state.dashboard?.notes || []).filter(note => selected && String(note.client_id) === String(selected.id)).slice(-4).reverse();
  app.innerHTML = `<section class="admin-grid">
    <aside class="admin-sidebar panel">
      <h2>Клиенты</h2>
      <input class="search" id="clientSearch" placeholder="Поиск по имени, статусу, оплатам…">
      <div class="client-list" id="clientList">${clients.map(c => clientRow(c, selected)).join('') || empty('Клиентов нет.')}</div>
    </aside>
    <div class="admin-main">
      <article class="admin-head panel">
        <div class="admin-head-top">
          <div><h1>${esc(adminAreaName())}</h1><p class="subtle">Сайт и материалы.</p></div>
          <div class="admin-toolbar">
            <div class="tool-group">
              <button class="secondary" data-action="edit-home">Главная</button>
              <button class="secondary" data-action="edit-featured">Избранное</button>
              <button class="plain" data-action="edit-content">Расширенный редактор</button>
            </div>
            <div class="tool-group">
              <button class="danger" data-action="logout">Выйти</button>
            </div>
          </div>
        </div>
        ${selected ? `<div class="selected-client"><div><h2>${esc(selected.name)}</h2><span>${selected.active_requests_count || 0} запросов в работе · ${money(selected.pending_total || 0)} ждёт подтверждения</span></div><div class="row"><button class="secondary" data-action="preview-client">Предпросмотр</button><button class="plain" data-action="note">Заметка</button></div>${notes.map(note => `<div class="selected-note">${esc(short(note.text, 240))}<br><span class="subtle">${time(note.created_at)}</span></div>`).join('')}</div>` : `<div class="selected-client"><div><h2>Выберите клиента</h2><span>Заметка и предпросмотр станут доступны после выбора человека слева.</span></div></div>`}
        <div class="metrics">${metric('Клиенты', state.dashboard?.overview?.clients_count || 0)}${metric('Запросы в работе', state.dashboard?.overview?.active_requests_count || 0)}${metric('Услуги', state.dashboard?.overview?.active_services_count || 0)}${metric('Ждёт подтверждения', adminPendingAmount())}</div>
      </article>
      ${adminWorkbenchHtml()}
    </div>
  </section>`;
  wireAdminSearch(clients, selected);
}
async function renderAdmin(){
  if(state.setupRequired && !state.user){
    app.innerHTML = `<section class="gate-closed"><article class="gate-card compact"><h1>${esc(adminAreaName())}</h1><p>Создание администратора закрыто ключом из окна запуска сервера и файла <b>data/setup_key.txt</b>.</p><div class="row" style="margin-top:22px"><button class="primary" data-action="setup-admin">Создать администратора</button><a class="secondary" href="${routeHref('home')}" data-route="home">На главную</a></div></article></section>`;
    return;
  }
  if(!isAdmin()){
    app.innerHTML = `<section class="gate-closed"><article class="gate-card compact"><h1>Вход администратора</h1><p>Войдите, чтобы открыть ${esc(adminAreaName())}.</p><div class="row" style="margin-top:22px"><button class="primary" data-action="login-admin">Войти</button><a class="secondary" href="${routeHref('home')}" data-route="home">На главную</a></div></article></section>`;
    return;
  }
  paintAdminEditor();
}
async function loadAdminTraffic(force=false){
  if(force){
    state.adminTraffic = null;
    state.adminTrafficPromise = null;
  }
  if(state.adminTraffic) return state.adminTraffic;
  if(!state.adminTrafficPromise){
    state.adminTrafficPromise = api('/api/admin/traffic', {keepSessionOn401:true})
      .then(payload => {
        state.adminTraffic = payload.traffic || null;
        syncAdminTrafficControl();
        mobileNavActions.innerHTML = mobileNavActionsHtml();
        mobileNavActions.hidden = !mobileNavActions.innerHTML.trim();
        return state.adminTraffic;
      })
      .finally(() => { state.adminTrafficPromise = null; });
  }
  return state.adminTrafficPromise;
}
async function loadAdminCommunity(force=false){
  state.dashboard = state.dashboard || {};
  if(force){
    state.adminCommunityPromise = null;
    delete state.dashboard.community;
  }
  if(hasAdminCommunity()) return state.dashboard.community;
  if(!state.adminCommunityPromise){
    state.adminCommunityPromise = api('/api/admin/community')
      .then(payload => {
        state.dashboard = state.dashboard || {};
        state.dashboard.community = payload.community || {};
        return state.dashboard.community;
      })
      .finally(() => { state.adminCommunityPromise = null; });
  }
  return state.adminCommunityPromise;
}
async function loadAdminProfiles(force=false){
  if(force){
    state.adminProfilesPromise = null;
    state.adminProfiles = null;
  }
  if(state.adminProfiles) return state.adminProfiles;
  if(!state.adminProfilesPromise){
    state.adminProfilesPromise = api('/api/admin/profiles')
      .then(payload => {
        state.adminProfiles = {profiles:payload.profiles || [], summary:payload.summary || {}};
        if(state.adminProfileId && !state.adminProfiles.profiles.some(profile => String(profile.id) === String(state.adminProfileId))){
          state.adminProfileId = '';
          state.adminProfileDetail = null;
          state.adminProfileDetailId = '';
        }
        if(!state.adminProfileId && state.adminProfiles.profiles.length){
          state.adminProfileId = String(state.adminProfiles.profiles[0].id || '');
        }
        return state.adminProfiles;
      })
      .finally(() => { state.adminProfilesPromise = null; });
  }
  return state.adminProfilesPromise;
}
async function loadAdminProfileDetail(id, force=false){
  const profileId = String(id || '');
  if(!profileId) return null;
  if(force || String(state.adminProfileDetailId || '') !== profileId){
    state.adminProfileDetail = null;
    state.adminProfileDetailId = '';
  }
  if(!force && state.adminProfileDetail && String(state.adminProfileDetailId || '') === profileId) return state.adminProfileDetail;
  if(!state.adminProfileDetailPromise){
    state.adminProfileDetailPromise = api(`/api/admin/profiles/${encodeURIComponent(profileId)}`)
      .then(payload => {
        state.adminProfileDetail = {profile:payload.profile || {}, comments:payload.comments || []};
        state.adminProfileDetailId = String(payload.profile?.id || profileId);
        return state.adminProfileDetail;
      })
      .finally(() => { state.adminProfileDetailPromise = null; });
  }
  return state.adminProfileDetailPromise;
}
async function loadAdminSummary(force=false){
  if(force) resetAdminState();
  if(hasAdminSummary()) return state.dashboard;
  if(!state.adminSummaryPromise){
    state.adminSummaryPromise = api('/api/admin/summary')
      .then(payload => mergeDashboard(payload))
      .finally(() => { state.adminSummaryPromise = null; });
  }
  return state.adminSummaryPromise;
}
async function loadAdminWorkbench(force=false){
  if(force){
    state.adminWorkbenchPromise = null;
    state.adminWorkbenchError = '';
    if(state.dashboard){
      delete state.dashboard.pending_payments;
      delete state.dashboard.recent_updates;
      delete state.dashboard.services;
      delete state.dashboard.expiring_services;
      delete state.dashboard.work_today;
      delete state.dashboard.work_upcoming;
      delete state.dashboard.work_agenda;
      delete state.dashboard.inquiries;
      delete state.dashboard.client_messages;
      delete state.dashboard.fresh_client_messages;
      delete state.dashboard.payment_receipts;
      delete state.dashboard.service_extend_requests;
      delete state.dashboard.payment_reviews;
      delete state.dashboard.events;
      delete state.dashboard.community;
    }
  }
  if(hasAdminWorkbench()) return state.dashboard;
  if(!state.adminWorkbenchPromise){
    state.adminWorkbenchPromise = api('/api/admin/workbench')
      .then(payload => {
        state.adminWorkbenchError = '';
        return mergeDashboard(payload);
      })
      .catch(error => {
        state.adminWorkbenchError = error.message;
        throw error;
      })
      .finally(() => { state.adminWorkbenchPromise = null; });
  }
  return state.adminWorkbenchPromise;
}
async function loadAdminActionsDashboard(force=false){
  if(force){
    state.adminActionsPromise = null;
    if(state.dashboard){
      delete state.dashboard.pending_payments;
      delete state.dashboard.recent_updates;
      delete state.dashboard.expiring_services;
      delete state.dashboard.work_today;
      delete state.dashboard.work_upcoming;
      delete state.dashboard.work_agenda;
      delete state.dashboard.client_messages;
      delete state.dashboard.fresh_client_messages;
      delete state.dashboard.service_extend_requests;
    }
  }
  if(!force && hasAdminActionsDashboard()) return state.dashboard;
  if(!state.adminActionsPromise){
    state.adminActionsPromise = api('/api/admin/actions')
      .then(payload => {
        state.adminWorkbenchError = '';
        return mergeDashboard(payload);
      })
      .catch(error => {
        state.adminWorkbenchError = error.message;
        throw error;
      })
      .finally(() => { state.adminActionsPromise = null; });
  }
  return state.adminActionsPromise;
}
async function loadDashboard(force=false){
  if(force) resetAdminState();
  if(!force && hasAdminDashboard()) return state.dashboard;
  if(!state.adminDashboardPromise){
    state.adminDashboardPromise = api('/api/admin/dashboard')
      .then(payload => {
        state.adminWorkbenchError = '';
        state.adminDashboardReady = true;
        return mergeDashboard(payload);
      })
      .catch(error => {
        state.adminWorkbenchError = error.message;
        throw error;
      })
      .finally(() => { state.adminDashboardPromise = null; });
  }
  return state.adminDashboardPromise;
}
async function loadRitebookCatalog(force=false){
  const current = state.dashboard?.work_catalog;
  if(!force && Array.isArray(current) && current.length) return current;
  const payload = await api('/api/admin/ritebook');
  if(!state.dashboard) state.dashboard = {};
  state.dashboard.work_catalog = Array.isArray(payload?.items) ? payload.items : [];
  state.dashboard.work_catalog_source = payload?.source || 'bot';
  return state.dashboard.work_catalog;
}
async function loadAdminFinance(force=false){
  if(force){
    state.adminFinancePromise = null;
    state.adminFinanceError = '';
  }
  if(!force && state.adminFinance) return state.adminFinance;
  if(!state.adminFinancePromise){
    state.adminFinancePromise = Promise.all([
      api('/api/admin/finance'),
      api('/api/clients').catch(() => ({items:[]})),
    ])
      .then(([payload, clientsPayload]) => {
        payload.all_clients = Array.isArray(clientsPayload?.items) ? clientsPayload.items : [];
        state.adminFinance = payload;
        state.adminFinanceError = '';
        state.adminFinanceRefreshAt = Date.now();
        return payload;
      })
      .catch(error => {
        state.adminFinanceError = error.message || 'Финансовый кабинет временно недоступен. Данные Требника не загружены.';
        throw error;
      })
      .finally(() => { state.adminFinancePromise = null; });
  }
  return state.adminFinancePromise;
}
function preserveFinanceView(fn){
  const actionTop = document.querySelector('.finance-action-list')?.scrollTop || 0;
  const debtTop = document.querySelector('.finance-debt-list')?.scrollTop || 0;
  const result = preservePageView(fn);
  const restoreFinanceScroll = () => {
    const actionList = document.querySelector('.finance-action-list');
    if(actionList) actionList.scrollTop = actionTop;
    const debtList = document.querySelector('.finance-debt-list');
    if(debtList) debtList.scrollTop = debtTop;
  };
  restoreFinanceScroll();
  window.requestAnimationFrame?.(restoreFinanceScroll);
  return result;
}
function preserveRitebookView(fn){
  return preservePageView(fn);
}
function ritebookCatalogFingerprint(rows=[]){
  return JSON.stringify((Array.isArray(rows) ? rows : []).map(row => [
    row.key || '',
    row.title || '',
    row.goal || '',
    ritebookCategory(row),
    row.type || '',
    row.total_days ?? '',
    row.period_days ?? '',
    row.period_times ?? '',
    row.count ?? '',
    row.catalog_updated_at || '',
    row.last_used_at || '',
  ]));
}
async function refreshAdminFinance(silent=true){
  if(state.adminFinanceRefreshPromise) return state.adminFinanceRefreshPromise;
  state.adminFinanceRefreshPromise = loadAdminFinance(true)
    .then(() => {
      if(state.route === 'trebnik' && adminTrebnikPage() === 'payments'){
        preserveFinanceView(() => paintAdminTrebnik());
      }
    })
    .catch(error => {
      state.adminFinanceError = error.message || 'Финансовый кабинет временно недоступен. Данные Требника не загружены.';
      if(!silent && state.route === 'trebnik' && adminTrebnikPage() === 'payments') paintAdminTrebnik();
    })
    .finally(() => { state.adminFinanceRefreshPromise = null; });
  return state.adminFinanceRefreshPromise;
}
function startAdminFinanceEvents(){
  if(!window.EventSource || state.adminFinanceEvents) return;
  try{
    const source = new EventSource('/api/trebnik/events');
    state.adminFinanceEvents = source;
    source.addEventListener('open', () => { state.adminFinanceEventsReady = true; });
    source.addEventListener('error', () => { state.adminFinanceEventsReady = false; });
    const onFinance = event => {
      let payload = {};
      try{ payload = JSON.parse(event.data || '{}'); }catch(_error){ payload = {}; }
      const nextRevision = Number(payload.revision || 0);
      const currentRevision = Number(state.adminFinance?.revision || 0);
      if(nextRevision && currentRevision && nextRevision === currentRevision) return;
      if(state.route === 'trebnik' && adminTrebnikPage() === 'payments') refreshAdminFinance(true);
      else if(isAdmin()) loadAdminFinance(true).catch(() => {});
    };
    ['finance.changed','payment.created','payment.confirmed','payment.rejected','debt.changed','service.changed','request.changed','trebnik.revision.changed'].forEach(type => {
      source.addEventListener(type, onFinance);
    });
  }catch(_error){
    state.adminFinanceEventsReady = false;
  }
}
function wireAdminFinance(){
  const period = document.querySelector('#adminFinancePeriod');
  if(period){
    period.addEventListener('change', () => {
      state.adminFinancePeriod = period.value;
      preserveFinanceView(() => paintAdminTrebnik());
    });
  }
  const targetType = document.querySelector('#adminFinanceTargetType');
  if(targetType){
    targetType.addEventListener('change', () => {
      state.adminFinanceTargetType = targetType.value;
      preserveFinanceView(() => paintAdminTrebnik());
    });
  }
  const ledger = document.querySelector('#adminFinanceLedger');
  if(ledger){
    ledger.addEventListener('toggle', () => {
      state.adminFinanceLedgerOpen = ledger.open;
    });
  }
}
async function loadAdminClientOverview(clientId, force=false){
  const id = String(clientId || '');
  if(!id) return null;
  if(!force && state.adminClientPayload && String(state.adminClientPayloadId) === id) return state.adminClientPayload;
  state.adminClientPayloadId = id;
  state.adminClientError = '';
  const payload = await api(`/api/client/${id}/overview`);
  state.adminClientPayload = payload;
  state.adminClientPayloadId = id;
  state.clientPayload = payload;
  return payload;
}
function setAdminClientTab(tab='requests'){
  const allowed = ['requests','diagnostics','services','payments','updates','notifications','profile'];
  state.adminClientTab = allowed.includes(tab) ? tab : 'requests';
  localStorage.setItem(keys.adminClientTab, state.adminClientTab);
  state.adminClientListOpen = false;
  state.adminDiagnosticMenuId = '';
  if(state.route === 'trebnik') paintAdminTrebnik();
}
function setAdminDiagnostic(id=''){
  state.adminDiagnosticId = String(id || '');
  state.adminClientTab = 'diagnostics';
  state.adminClientListOpen = false;
  state.adminDiagnosticMenuId = '';
  localStorage.setItem(keys.adminClientTab, state.adminClientTab);
  closeModal(true);
  if(state.route === 'trebnik') paintAdminTrebnik();
}
function toggleAdminDiagnosticMobile(id=''){
  const next = String(id || '');
  state.adminDiagnosticOpenId = state.adminDiagnosticOpenId === next ? '' : next;
  state.adminDiagnosticMenuId = '';
  if(next) state.adminDiagnosticId = next;
  if(state.route === 'trebnik') paintAdminTrebnik();
}
function toggleAdminDiagnosticMobileMenu(id=''){
  const next = String(id || '');
  state.adminDiagnosticMenuId = state.adminDiagnosticMenuId === next ? '' : next;
  if(next) state.adminDiagnosticId = next;
  if(state.route === 'trebnik') paintAdminTrebnik();
}
function closeAdminDiagnosticMobileMenu(){
  if(!state.adminDiagnosticMenuId) return;
  state.adminDiagnosticMenuId = '';
  if(state.route === 'trebnik') paintAdminTrebnik();
}
function setAdminRequest(id=''){
  const next = String(id || '');
  if(next && next !== state.adminRequestId) state.adminRequestPane = 'works';
  state.adminRequestId = next;
  state.adminClientTab = 'requests';
  state.adminClientListOpen = false;
  closeModal(true);
  if(state.route === 'trebnik') paintAdminTrebnik();
}
function setAdminRequestPane(pane='works'){
  const allowed = ['works','diagnostics','recommendations','updates','payments','about'];
  state.adminRequestPane = allowed.includes(pane) ? pane : 'works';
  state.adminClientTab = 'requests';
  state.adminClientListOpen = false;
  if(state.route === 'trebnik') paintAdminTrebnik();
}
function toggleAdminRequestArchive(){
  state.adminShowArchivedRequests = !state.adminShowArchivedRequests;
  if(state.route === 'trebnik') paintAdminTrebnik();
}
function openAdminRequestInlineOrModal(id=''){
  const requestId = String(id || '');
  if(isAdmin() && state.route === 'trebnik' && adminTrebnikPage() === 'clients' && adminClientRequestById(requestId).id){
    setAdminRequest(requestId);
    return;
  }
  detailRequest(requestId);
}
function showAdminClientList(){
  clearAdminClientSelection();
  state.adminClientListOpen = true;
  state.adminClientNavOpen = false;
  if(state.route === 'trebnik') paintAdminTrebnik();
}
function toggleAdminClientNav(){
  state.adminClientListOpen = false;
  setAdminClientNavOpen(!state.adminClientNavOpen);
}
function closeAdminClientNav(){
  if(!state.adminClientNavOpen) return;
  setAdminClientNavOpen(false);
}
function setAdminClientNavOpen(isOpen){
  state.adminClientNavOpen = Boolean(isOpen);
  document.querySelectorAll('.trebnik-client-mobile-nav').forEach(nav => {
    nav.classList.toggle('is-open', state.adminClientNavOpen);
    nav.querySelector('.trebnik-client-mobile-nav__button')?.setAttribute('aria-expanded', state.adminClientNavOpen ? 'true' : 'false');
    const menu = nav.querySelector('.trebnik-client-mobile-menu');
    if(menu) menu.hidden = !state.adminClientNavOpen;
  });
}
function clearAdminClientSelection(){
  state.clientId = '';
  state.adminClientPayload = null;
  state.adminClientPayloadId = '';
  state.adminClientError = '';
  state.adminRequestId = '';
  state.adminDiagnosticOpenId = '';
  state.adminDiagnosticMenuId = '';
  state.adminShowArchivedRequests = false;
  state.adminClientListOpen = false;
  state.adminClientNavOpen = false;
  localStorage.removeItem(keys.client);
}
async function refreshAdminClient(){
  if(!state.clientId) return;
  await loadDashboard(true).catch(() => {});
  await loadAdminClientOverview(state.clientId, true).catch(error => { state.adminClientError = error.message; });
  if(state.route === 'trebnik') paintAdminTrebnik();
}
async function refreshAdminTrebnikSilently(force=false){
  if(!isAdmin() || state.route !== 'trebnik' || document.hidden) return;
  if(!force && Date.now() - Number(state.adminAutoRefreshAt || 0) < 12000) return;
  if(state.adminAutoRefreshPromise) return state.adminAutoRefreshPromise;
  state.adminAutoRefreshAt = Date.now();
  state.adminAutoRefreshPromise = (async () => {
    const page = adminTrebnikPage();
    if(page === 'payments'){
      await refreshAdminFinance(true);
      return;
    }
    if(!modal.hidden) return;
    if(page === 'services'){
      const before = ritebookCatalogFingerprint(state.dashboard?.work_catalog || []);
      await loadRitebookCatalog(true).catch(() => {});
      const after = ritebookCatalogFingerprint(state.dashboard?.work_catalog || []);
      if(before !== after && state.route === 'trebnik' && isAdmin() && modal.hidden) preserveRitebookView(() => paintAdminTrebnik());
      return;
    }
    await loadDashboard(true).catch(() => {});
    if(page === 'clients'){
      const selected = selectedClient(state.dashboard?.clients || []);
      if(selected) await loadAdminClientOverview(selected.id, true).catch(error => { state.adminClientError = error.message; });
    }
    if(state.route === 'trebnik' && isAdmin() && modal.hidden) preservePageView(() => paintAdminTrebnik());
  })().finally(() => { state.adminAutoRefreshPromise = null; });
  return state.adminAutoRefreshPromise;
}
setInterval(() => {
  refreshAdminTrebnikSilently().catch(() => {});
  refreshClientCabinetSilently().catch(() => {});
}, 12000);
document.addEventListener('visibilitychange', () => {
  if(!document.hidden) refreshAdminTrebnikSilently(true).catch(() => {});
  if(!document.hidden) refreshClientCabinetSilently(true).catch(() => {});
});
window.addEventListener('focus', () => {
  refreshAdminTrebnikSilently(true).catch(() => {});
  refreshClientCabinetSilently(true).catch(() => {});
});
function selectClient(id, rerender=true){
  state.clientId = String(id || '');
  state.adminRequestId = '';
  state.adminDiagnosticOpenId = '';
  state.adminDiagnosticMenuId = '';
  state.adminShowArchivedRequests = false;
  state.adminClientListOpen = false;
  state.adminClientNavOpen = false;
  if(String(state.adminClientPayloadId) !== String(state.clientId)){
    state.adminClientPayload = null;
    state.adminClientPayloadId = '';
    state.adminClientError = '';
  }
  state.clientId ? localStorage.setItem(keys.client, state.clientId) : localStorage.removeItem(keys.client);
  if(rerender && state.route === 'trebnik' && adminTrebnikPage() === 'clients'){
    paintAdminTrebnik();
    if(state.clientId){
      loadAdminClientOverview(state.clientId, true)
        .then(() => { if(state.route === 'trebnik' && adminTrebnikPage() === 'clients') paintAdminTrebnik(); })
        .catch(error => { state.adminClientError = error.message; if(state.route === 'trebnik' && adminTrebnikPage() === 'clients') paintAdminTrebnik(); });
    }
    return;
  }
  if(rerender){
    if(state.route === 'trebnik') renderTrebnik();
    else renderAdmin();
  }
}
function clientRow(c, selected){ return `<button class="client-row ${selected && String(selected.id) === String(c.id) ? 'active' : ''}" data-action="select-client" data-id="${attr(c.id)}"><strong>${esc(c.name)}</strong><span>${c.active_requests_count || 0} активных · ${money(c.pending_total || 0)} ждёт подтверждения</span></button>`; }
function wireAdminSearch(clients, selected){
  const input = document.querySelector('#clientSearch'); const list = document.querySelector('#clientList');
  if(!input || !list) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const filtered = clients.filter(c => `${c.name} ${c.pending_total} ${c.active_requests_count}`.toLowerCase().includes(q));
    list.innerHTML = filtered.map(c => clientRow(c, selected)).join('') || empty('Ничего не найдено.');
  });
}
function adminInquiries(rows=[]){
  const items = rows.slice(-8).reverse();
  return `<div class="admin-card"><h2>Заявки с сайта</h2><div class="action-list">${items.map(inquiryLine).join('') || empty('Заявок пока нет.')}</div></div>`;
}
function inquiryLine(row){ const closed = row.status === 'closed'; return `<div class="inquiry-card ${closed ? 'is-closed' : ''}"><h3>${esc(row.material_title || 'Заявка')}</h3><p>${esc(row.name || 'Без имени')} · ${esc(row.contact || '')}</p><p>${esc(short(row.message || '', 180))}</p><span class="subtle">${time(row.created_at)} · ${esc(statusName(row.status || 'new'))}</span>${!closed ? `<div class="row"><button class="plain" data-action="inquiry-status" data-id="${attr(row.id)}" data-status="processing">В работу</button><button class="plain" data-action="inquiry-status" data-id="${attr(row.id)}" data-status="closed">Закрыть</button></div>` : ''}</div>`; }
function adminClientMessages(rows=[]){
  const items = rows.slice(0,8);
  return `<div class="admin-card"><h2>Свежие апдейты</h2><div class="action-list">${items.map(adminClientUpdateItem).join('') || empty('Апдейтов пока нет.')}</div></div>`;
}
function adminPaymentReceipts(rows=[]){
  const items = rows.slice(-8).reverse();
  return `<div class="admin-card"><h2>Клиент отметил платёж</h2><div class="action-list">${items.map(row => `<div class="inquiry-card"><h3>${esc(row.client_name || 'Клиент')} ${row.amount ? '· ' + esc(row.amount) : ''}</h3><p>${esc(short(row.text || '', 180))}</p><span class="subtle">${receiptStatusName(row.status || 'new')} · ${time(row.created_at)}</span></div>`).join('') || empty('Отмеченных платежей нет.')}</div></div>`;
}
function adminExtendRequests(rows=[]){
  const items = rows.slice(0,8);
  return `<div class="admin-card"><h2>Запросы на новый срок</h2><div class="action-list">${items.map(adminMoreTimeItem).join('') || empty('Запросов на новый срок нет.')}</div></div>`;
}
function adminListCard(title, rows, mapper, emptyText){ return adminActionCard(title, rows, mapper, emptyText); }
function paymentLine(p){
  const isRequest = Boolean(p.request_id);
  const targetType = isRequest ? 'request' : 'service';
  const targetId = p.request_id || p.service_id;
  return `<article class="action-line admin-action-line admin-queue-line">
    <button class="admin-action-open" data-action="${isRequest ? 'request-detail' : 'service-detail'}" data-id="${attr(targetId)}">
      <strong>${esc(p.client_name || 'Клиент')}</strong>
      <span class="admin-action-meta"><span>${money(p.amount || 0)}</span><span>${time(p.created_at)}</span></span>
    </button>
    <div class="admin-action-buttons">
      <button class="plain" data-action="${isRequest ? 'request-detail' : 'service-detail'}" data-id="${attr(targetId)}">Открыть</button>
      <button class="plain" data-action="payment-review" data-target-type="${attr(targetType)}" data-payment-id="${attr(p.id)}" data-decision="confirmed">Подтвердить</button>
      <button class="plain danger" data-action="payment-review" data-target-type="${attr(targetType)}" data-payment-id="${attr(p.id)}" data-decision="rejected">Отклонить</button>
    </div>
  </article>`;
}
function workLine(w){
  const agendaDate = workAgendaDate(w);
  const logDate = workDefaultLogDate(w) || agendaDate;
  const overdue = isWorkOverdue(w);
  let statusParts = workActionStatusParts(w);
  if(w.agenda_kind === 'work_attention'){
    statusParts = overdue && agendaDate
      ? [['', date(agendaDate), 'is-danger']]
      : [['', agendaDate ? date(agendaDate) : '', 'is-today']];
  }
  const statusHtml = statusParts.map(([label, value, tone]) => `<span class="${attr(tone || '')}">${label ? `<em>${esc(label)}</em>` : ''}${value ? `<b>${esc(value)}</b>` : ''}</span>`).join('');
  const note = String(w.goal || w.description || w.note || '').trim();
  return `<article class="action-line admin-action-line admin-work-line${overdue ? ' is-overdue' : ''}">
    <button class="admin-action-open" data-action="work-detail" data-id="${attr(w.id)}">
      <span class="trebnik-work-dot ${overdue ? 'is-overdue' : 'is-open'}" aria-hidden="true"></span>
      <strong>${esc(w.client_name || 'Клиент')}</strong>
      <span class="admin-work-title">${esc(w.title || w.request_title || 'Работа')}</span>
      ${note ? `<span class="admin-work-note">${esc(short(note, 96))}</span>` : ''}
      <span class="admin-work-status">${statusHtml}</span>
    </button>
    <div class="admin-action-buttons">
      <button class="plain" data-action="work-detail" data-id="${attr(w.id)}">Открыть</button>
      <button class="secondary trebnik-work-log-icon" data-action="work-log" data-id="${attr(w.id)}" data-log-date="${attr(logDate)}" aria-label="Отметить выполнение" title="Отметить выполнение">✓</button>
    </div>
  </article>`;
}
function adminUpdateLine(u){ return `<button class="action-line" data-action="update-detail" data-id="${attr(u.id)}"><strong>${esc(u.client_name || '')}</strong><span>${time(u.created_at)}</span></button>`; }
function serviceDueLine(s){ return `<button class="action-line admin-action-line admin-queue-line" data-action="service-detail" data-id="${attr(s.id || s.service_id)}"><strong>${esc(s.client_name || '')}</strong><span class="admin-action-meta"><span>${esc(s.title || s.service_title || '')}</span><span>до ${date(s.active_until || s.due_until)}</span></span></button>`; }
function previewClient(){ if(!state.clientId){ say('Сначала выберите клиента.','warning'); return; } go('trebnik'); }

async function contentHistoryModal(){
  openModal('История сайта', loading('Открываю резервные копии…'), {wide:true});
  try{
    const payload = await api('/api/admin/content/history');
    const backups = payload.backups || [];
    openModal('История сайта', `<div class="detail">
      <p class="form-note">Выберите копию для восстановления.</p>
      <div class="dlist">${backups.map(item => `<div><strong>${esc(item.name)}</strong><em>${time(item.modified_at)} · ${Math.round((item.size_bytes || 0)/1024)} КБ</em><button class="plain" data-action="content-restore" data-name="${attr(item.name)}">Восстановить</button></div>`).join('') || empty('Резервных копий пока нет.')}</div>
    </div>`, {wide:true});
  }catch(error){
    openModal('История сайта', problem(error.message), {wide:true});
  }
}

async function restoreContentBackup(name){
  if(!name) return;
  if(!window.confirm('Восстановить эту резервную копию сайта? Текущий вариант тоже будет сохранен.')) return;
  try{
    const payload = await api('/api/admin/content/restore', {method:'POST', body:{name}});
    state.content = payload.content;
    closeModal(true);
    say(saveSummary(payload, 'Резервная копия восстановлена.'), 'success');
    render();
  }catch(error){ say(error.message || 'Не удалось восстановить копию.', 'danger'); }
}

