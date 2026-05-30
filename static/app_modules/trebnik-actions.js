function targetLabel(item={}, fallback='Пункт Требника'){
  const prefix = item.target_type === 'service' || item.type === 'service' ? 'Услуга' : 'Запрос';
  return `${prefix}: ${item.title || item.label || fallback}`;
}
function targetOptionValue(item={}){
  return `${item.target_type || item.type || ''}:${item.target_id || item.id || ''}`;
}
function findLiveTarget(targets=[], targetType='', targetId=''){
  return (Array.isArray(targets) ? targets : []).find(item => String(item.target_type || item.type || '') === String(targetType || '') && String(item.target_id || item.id || '') === String(targetId || '')) || null;
}
function targetSelectHtml(targets=[], selected=''){
  return `<label data-live-target-field><span>К чему относится</span><select name="target" required><option value="">Выберите пункт</option>${targets.map(item => {
    const value = targetOptionValue(item);
    return `<option value="${attr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${esc(targetLabel(item))}</option>`;
  }).join('')}</select></label>`;
}
function fixedTargetHtml(item={}, selected=''){
  return `<div class="client-fixed-target">
    <input type="hidden" name="target" value="${attr(selected)}">
    <strong>${esc(targetLabel(item))}</strong>
  </div>`;
}
function targetWorkSelectHtml(targets=[], selectedTarget='', selectedWork=''){
  const item = findLiveTarget(targets, ...String(selectedTarget || '').split(':'));
  const works = (item?.target_type || item?.type) === 'request' && Array.isArray(item.works) ? item.works : [];
  if(!works.length) return '<input type="hidden" name="work_id" value="">';
  return `<label><span>Работа</span><select name="work_id"><option value="">К запросу в целом</option>${works.map(work => `<option value="${attr(work.id)}" ${String(work.id) === String(selectedWork || '') ? 'selected' : ''}>${esc(work.title || 'Работа')}</option>`).join('')}</select></label>`;
}
function syncPaymentWorkField(form, targets=[], preferredWork=''){
  const host = form?.querySelector('[data-payment-work-target]');
  if(!host) return;
  const selected = String(form.elements?.target?.value || '');
  const current = form.elements?.work_id?.value || preferredWork || '';
  host.innerHTML = targetWorkSelectHtml(targets, selected, current);
}
async function submitClientCabinetModal(form, feedback, path, body, successText, afterSuccess=()=>{}){
  if(form.dataset.saving === '1') return;
  form.dataset.saving = '1';
  setContentFormBusy(form, true);
  try{
    setFeedback(feedback, 'Отправляю…', 'warning');
    const payload = await api(path, {method:'POST', body});
    markModalClean(form);
    setFeedback(feedback, 'Отправлено.', 'success');
    say(payload.warning || successText || 'Отправлено.', payload.warning ? 'warning' : 'success');
    await afterSuccess(payload);
    setTimeout(() => closeModal(true), 500);
  }catch(error){
    setFeedback(feedback, error.message || 'Не удалось выполнить действие.', 'danger');
    say(error.message || 'Не удалось выполнить действие.', 'danger');
  }finally{
    delete form.dataset.saving;
    setContentFormBusy(form, false);
  }
}
function clientMessageModal(kind='question', targetType='', targetId=''){
  const isUpdate = kind === 'update';
  openModal(isUpdate ? 'Апдейт' : 'Вопрос по работе', `<form class="form" id="clientMessageForm">
    <p class="subtle">${isUpdate ? 'Напишите факт, событие или изменение по запросу или услуге.' : 'Напишите вопрос спокойно и по делу.'}</p>
    <div data-live-targets><p class="form-note">Проверяю актуальные запросы и услуги…</p></div>
    <label><span>${isUpdate ? 'Что произошло' : 'Вопрос'}</span><textarea name="text" rows="6" required></textarea></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content disabled>Отправить</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const form = root.querySelector('#clientMessageForm');
    const targetsRoot = root.querySelector('[data-live-targets]');
    const submit = form?.querySelector('[data-save-content]');
    loadClientTargetsLive().then(payload => {
      const targets = Array.isArray(payload.update_targets) ? payload.update_targets : [];
      const fixed = targetType && targetId ? findLiveTarget(targets, targetType, targetId) : null;
      const selected = fixed ? `${targetType}:${targetId}` : '';
      if(!targets.length || (targetType && targetId && !fixed)){
        targetsRoot.innerHTML = liveDataWarningHtml('Актуальных запросов или услуг для отправки сейчас нет.');
        if(submit) submit.disabled = true;
        return;
      }
      targetsRoot.innerHTML = fixed
        ? fixedTargetHtml(fixed, selected)
        : targetSelectHtml(targets, selected);
      if(submit) submit.disabled = false;
    }).catch(error => {
      targetsRoot.innerHTML = liveDataWarningHtml(error.message || 'Не удалось получить актуальные цели Требника.');
      if(submit) submit.disabled = true;
    });
    form?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const [pickedType, pickedId] = String(data.get('target') || '').split(':');
      if(!pickedType || !pickedId) return setFeedback(form.querySelector('[data-form-feedback]'), 'Выберите актуальный запрос или услугу.', 'danger');
      submitClientCabinetModal(form, form.querySelector('[data-form-feedback]'), '/api/client/message', withFormIdempotency(form, {kind:isUpdate ? 'update' : 'client_question', text:data.get('text'), target_type:pickedType, target_id:pickedId}, isUpdate ? 'client:update' : 'client:question'), 'Отправлено.', async () => { if(isAdmin()) await loadDashboard(true).catch(()=>{}); else if(isTrebnikClient()) await renderClientCabinet(trebnikClientId(), false); });
    });
  }});
}

function paymentReceiptModal(targetType='', targetId='', workId=''){
  openModal('Отметить платёж', `<form class="form" id="paymentReceiptForm">
    <div data-live-targets><p class="form-note">Проверяю актуальные оплаты…</p></div>
    <div data-payment-work-target></div>
    <label><span>Сумма</span><input name="amount" inputmode="decimal" autocomplete="transaction-amount" placeholder="например, 3000" required></label>
    <label><span>Комментарий</span><input name="text" autocomplete="off" placeholder="Когда и куда отправлен платёж"></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content disabled>Отправить</button></div>
  </form>`, {compact:true,kind:'payment-receipt',onMount(root){
    const form = root.querySelector('#paymentReceiptForm');
    const targetsRoot = root.querySelector('[data-live-targets]');
    const submit = form?.querySelector('[data-save-content]');
    loadClientTargetsLive().then(payload => {
      const targets = Array.isArray(payload.payment_targets) ? payload.payment_targets : [];
      const fixed = targetType && targetId ? findLiveTarget(targets, targetType, targetId) : null;
      const selected = fixed ? `${targetType}:${targetId}` : '';
      if(!targets.length || (targetType && targetId && !fixed)){
        targetsRoot.innerHTML = liveDataWarningHtml('Сейчас нет актуальной оплаты для этого пункта.');
        if(submit) submit.disabled = true;
        return;
      }
      targetsRoot.innerHTML = fixed
        ? fixedTargetHtml(fixed, selected)
        : targetSelectHtml(targets, selected);
      syncPaymentWorkField(form, targets, workId);
      form?.elements?.target?.addEventListener('change', () => syncPaymentWorkField(form, targets));
      if(submit) submit.disabled = false;
    }).catch(error => {
      targetsRoot.innerHTML = liveDataWarningHtml(error.message || 'Не удалось получить актуальные оплаты Требника.');
      if(submit) submit.disabled = true;
    });
    form?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const [pickedType, pickedId] = String(data.get('target') || '').split(':');
      if(!pickedType || !pickedId) return setFeedback(form.querySelector('[data-form-feedback]'), 'Выберите актуальный запрос или услугу.', 'danger');
      const payload = {target_type:pickedType, target_id:pickedId, amount:data.get('amount'), text:data.get('text')};
      if(pickedType === 'request' && data.get('work_id')) payload.work_id = data.get('work_id');
      submitClientCabinetModal(form, form.querySelector('[data-form-feedback]'), '/api/client/payment-receipt', withFormIdempotency(form, payload, 'client:payment'), 'Отправлено.', async () => { if(isTrebnikClient()) await renderClientCabinet(trebnikClientId(), false); else if(isAdmin()) await loadDashboard(true).catch(()=>{}); });
    });
  }});
}

function serviceExtendModal(serviceId=''){
  openModal('Попросить больше времени', `<form class="form" id="serviceExtendForm">
    <label><span>Просит до</span><input name="requested_until" type="date" required></label>
    <label><span>Комментарий</span><textarea name="text" rows="5"></textarea></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Попросить больше времени</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    root.querySelector('#serviceExtendForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      submitSimpleModal(form, form.querySelector('[data-form-feedback]'), '/api/service/extend-request', withFormIdempotency(form, {service_id:serviceId, requested_until:data.get('requested_until'), text:data.get('text')}, 'client:more-time'), 'Запрос на новый срок отправлен.', async () => { if(isTrebnikClient()) renderTrebnik(); else if(isAdmin()) await loadDashboard(true).catch(()=>{}); });
    });
  }});
}

function adminClientPayload(){
  return state.adminClientPayload || {};
}
function adminClientSelected(clientId=''){
  const id = String(clientId || state.clientId || adminClientPayload().client?.id || '');
  const financeClient = (state.adminFinance?.clients || []).find(c => String(c.client_id) === id);
  return adminClientPayload().client
    || (state.dashboard?.clients || []).find(c => String(c.id) === id)
    || (financeClient ? {id:financeClient.client_id, name:financeClient.client_name} : null);
}
function adminClientRequire(clientId='', options={}){
  const client = adminClientSelected(clientId);
  if(!client?.id){
    if(!options.quiet) say('Сначала выберите клиента.', 'warning');
    return null;
  }
  if(String(state.clientId || '') !== String(client.id || '')){
    state.clientId = String(client.id);
    localStorage.setItem(keys.client, state.clientId);
  }
  return client;
}
function adminPublicUsers(){
  return state.dashboard?.community?.users || [];
}
function adminPublicUserLabel(user={}){
  const name = user.display_name || user.nickname || 'Профиль сайта';
  const nick = user.nickname ? `@${user.nickname}` : '';
  const email = user.email || '';
  return [name, nick, email].filter(Boolean).join(' · ');
}
function adminClientNameById(id=''){
  const row = (state.dashboard?.clients || []).find(client => String(client.id) === String(id));
  return row?.name || '';
}
function profileLinkOption(user={}, selected=''){
  const linked = user.trebnik_client_id ? adminClientNameById(user.trebnik_client_id) || `клиент ${user.trebnik_client_id}` : '';
  const suffix = linked ? ` — уже привязан: ${linked}` : '';
  return `<option value="${attr(user.id)}" ${String(user.id) === String(selected) ? 'selected' : ''}>${esc(adminPublicUserLabel(user) + suffix)}</option>`;
}
async function submitPublicProfileLink(form, force=false){
  const client = adminClientRequire();
  if(!client) return;
  const feedback = form.querySelector('[data-form-feedback]');
  const data = new FormData(form);
  const userId = String(data.get('user_id') || '');
  if(!userId){
    setFeedback(feedback, 'Выберите профиль сайта.', 'warning');
    return;
  }
  submitSimpleModal(
    form,
    feedback,
    '/api/admin/trebnik/profile-link',
    {client_id:client.id, user_id:userId, force},
    'Профиль привязан.',
    async payload => {
      state.adminClientPayload = {...adminClientPayload(), linked_user:payload.linked_user || null};
      await loadDashboard(true).catch(() => {});
      if(state.clientId) await loadAdminClientOverview(state.clientId, true).catch(error => { state.adminClientError = error.message; });
      closeModal(true);
      if(state.route === 'trebnik') paintAdminTrebnik();
    }
  );
}
function publicProfileLinkModal(clientId=''){
  const client = adminClientRequire(clientId);
  if(!client) return;
  const users = adminPublicUsers().filter(user => !user.blocked);
  if(!users.length){
    say('Зарегистрированных пользователей пока нет.', 'warning');
    return;
  }
  const linked = adminClientPayload().linked_user || {};
  openModal('Привязать профиль', `<form class="form" id="publicProfileLinkForm">
    <label><span>Поиск</span><input name="search" placeholder="Имя, почта или ник"></label>
    <label><span>Профиль сайта</span><select name="user_id" required><option value="">Выберите профиль</option>${users.map(user => profileLinkOption(user, linked.id || '')).join('')}</select></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Привязать</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const form = root.querySelector('#publicProfileLinkForm');
    const search = form?.elements?.search;
    const select = form?.elements?.user_id;
    const renderOptions = () => {
      const q = String(search?.value || '').trim().toLowerCase();
      const filtered = users.filter(user => adminPublicUserLabel(user).toLowerCase().includes(q) || String(user.trebnik_client_id || '').includes(q));
      select.innerHTML = `<option value="">Выберите профиль</option>${filtered.map(user => profileLinkOption(user, select.value || linked.id || '')).join('')}`;
    };
    search?.addEventListener('input', renderOptions);
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const chosen = users.find(user => String(user.id) === String(form.elements?.user_id?.value || ''));
      const current = adminClientPayload().linked_user || null;
      const linkedElsewhere = chosen?.trebnik_client_id && String(chosen.trebnik_client_id) !== String(client.id);
      const clientHasOther = current?.id && String(current.id) !== String(chosen?.id || '');
      let force = false;
      if(linkedElsewhere || clientHasOther){
        const parts = [];
        if(linkedElsewhere) parts.push('Этот профиль уже привязан к другому клиенту.');
        if(clientHasOther) parts.push('У этого клиента уже есть привязанный профиль.');
        if(!window.confirm(`${parts.join(' ')} Перепривязать?`)) return;
        force = true;
      }
      await submitPublicProfileLink(form, force);
    });
  }});
}
async function unlinkPublicProfile(clientId=''){
  const client = adminClientRequire();
  const id = clientId || client?.id || '';
  if(!id) return;
  const linked = adminClientPayload().linked_user;
  if(!linked){
    say('Профиль не привязан.', 'warning');
    return;
  }
  if(!window.confirm(`Отвязать профиль «${linked.display_name || linked.nickname || 'Профиль сайта'}» от клиента?`)) return;
  try{
    const payload = await api('/api/admin/trebnik/profile-link', {method:'POST', body:{client_id:id, user_id:null}});
    state.adminClientPayload = {...adminClientPayload(), linked_user:payload.linked_user || null};
    say('Профиль отвязан.', 'success');
    await loadDashboard(true).catch(() => {});
    if(state.clientId) await loadAdminClientOverview(state.clientId, true).catch(error => { state.adminClientError = error.message; });
    if(state.route === 'trebnik') paintAdminTrebnik();
  }catch(error){ say(error.message || 'Не удалось отвязать профиль.', 'danger'); }
}
function adminClientRequestById(id){
  return (adminClientPayload().requests || []).find(row => String(row.id) === String(id)) || {};
}
function adminClientWorkById(id){
  return (adminClientPayload().works || []).find(row => String(row.id) === String(id)) || {};
}
function workDefaultCostModeForRequest(requestId=''){
  const request = adminClientRequestById(requestId);
  return Number(request.base_cost || 0) > 0 ? 'included_in_request' : 'auto_from_payments';
}
function workEditorCostMode(row={}, requestId=''){
  if(row.cost_mode === 'included_in_request') return 'included_in_request';
  if(row.cost_mode === 'manual' || Number(row.extra_cost || 0) > 0) return 'manual';
  if(row.cost_mode === 'auto_from_payments') return 'auto_from_payments';
  return workDefaultCostModeForRequest(requestId || row.request_id || '');
}
function adminClientServiceById(id){
  return (adminClientPayload().services || []).find(row => String(row.id) === String(id)) || {};
}
function adminClientDiagnosticById(id){
  return (adminClientPayload().diagnostics || []).find(row => String(row.id) === String(id)) || {};
}
function adminClientRecommendationById(id){
  return (adminClientPayload().recommendations || []).find(row => String(row.id) === String(id)) || {};
}
function adminRequestOptions(selectedId=''){
  const rows = adminClientPayload().requests || [];
  return rows.map(row => `<option value="${attr(row.id)}" ${String(row.id) === String(selectedId) ? 'selected' : ''}>${esc(row.title || 'Запрос')}</option>`).join('');
}
function adminWorkOptions(selectedId=''){
  const rows = adminClientPayload().works || [];
  return rows.map(row => `<option value="${attr(row.id)}" ${String(row.id) === String(selectedId) ? 'selected' : ''}>${esc(row.title || 'Работа')}</option>`).join('');
}
function adminWorkOptionsForRequest(requestId='', selectedId=''){
  const rows = (adminClientPayload().works || []).filter(row => String(row.request_id || '') === String(requestId || ''));
  return rows.map(row => `<option value="${attr(row.id)}" ${String(row.id) === String(selectedId) ? 'selected' : ''}>${esc(row.title || 'Работа')}</option>`).join('');
}
function adminTargetOptions(selected=''){
  const requests = (adminClientPayload().requests || []).map(row => `<option value="request:${attr(row.id)}" ${selected === `request:${row.id}` ? 'selected' : ''}>Запрос: ${esc(row.title || 'без названия')}</option>`);
  const services = (adminClientPayload().services || []).map(row => `<option value="service:${attr(row.id)}" ${selected === `service:${row.id}` ? 'selected' : ''}>Услуга: ${esc(row.title || 'без названия')}</option>`);
  return [...requests, ...services].join('');
}
function adminPaymentWorkSelectHtml(selectedTarget='', selectedWork=''){
  const [type, id] = String(selectedTarget || '').split(':');
  if(type !== 'request' || !id) return '<input type="hidden" name="work_id" value="">';
  const options = adminWorkOptionsForRequest(id, selectedWork);
  if(!options) return '<input type="hidden" name="work_id" value="">';
  return `<label><span>К какой работе</span><select name="work_id"><option value="">К запросу в целом</option>${options}</select></label>`;
}
function syncAdminPaymentWorkField(form){
  const host = form?.querySelector('[data-payment-work-target]');
  if(!host) return;
  host.innerHTML = adminPaymentWorkSelectHtml(form.elements?.target?.value || '', form.elements?.work_id?.value || '');
}
async function afterAdminClientMutation(payload=null, options={}){
  const result = payload?.result || {};
  if(options.clearClient) selectClient('', false);
  else if(result.client_id) selectClient(result.client_id, false);
  if(result.request_id) state.adminRequestId = String(result.request_id);
  if(result.diagnostic_id) state.adminDiagnosticId = String(result.diagnostic_id);
  await loadDashboard(true).catch(() => {});
  if(state.clientId) await loadAdminClientOverview(state.clientId, true).catch(error => { state.adminClientError = error.message; });
  if(state.route === 'trebnik') paintAdminTrebnik();
}
async function afterAdminServiceMutation(){
  await loadDashboard(true).catch(() => {});
  if(state.clientId) await loadAdminClientOverview(state.clientId, true).catch(error => { state.adminClientError = error.message; });
  if(state.route === 'trebnik') paintAdminTrebnik();
  else if(state.route === 'admin') paintAdmin();
}
function submitAdminTrebnikForm(form, command, payload, successText){
  const safePayload = trebnikCommandNeedsIdempotency(command) ? withFormIdempotency(form, payload, `admin:${command}`) : payload;
  submitSimpleModal(form, form.querySelector('[data-form-feedback]'), '/api/admin/trebnik/action', {command, payload:safePayload}, successText, afterAdminClientMutation);
}
function adminNotifyClientLine(checked=false){
  return `<label class="toggle-line trebnik-notify-line"><input name="notify_client" type="checkbox" ${checked ? 'checked' : ''}><span>Сообщить клиенту</span></label>`;
}
async function runAdminTrebnikAction(command, payload, successText, options={}){
  try{
    const safePayload = trebnikCommandNeedsIdempotency(command) ? {...(payload || {}), idempotency_key:newIdempotencyKey(`admin:${command}`)} : payload;
    const result = await api('/api/admin/trebnik/action', {method:'POST', body:{command, payload:safePayload}});
    say(result.warning || successText, result.warning ? 'warning' : 'success');
    await afterAdminClientMutation(result, options);
  }catch(error){
    say(error.message || 'Не удалось выполнить действие.', 'danger');
  }
}
function clientAdminModal(mode='add'){
  const client = mode === 'rename' ? adminClientRequire() : {};
  if(mode === 'rename' && !client) return;
  const isEdit = mode === 'rename';
  openModal(isEdit ? 'Переименовать клиента' : 'Добавить клиента', `<form class="form" id="adminClientForm">
    <label><span>Имя клиента</span><input name="name" value="${attr(client?.name || '')}" required></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>${isEdit ? 'Сохранить' : 'Добавить'}</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    root.querySelector('#adminClientForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const payload = isEdit ? {client_id:client.id, name:data.get('name')} : {name:data.get('name')};
      submitAdminTrebnikForm(form, isEdit ? 'client.rename' : 'client.add', payload, isEdit ? 'Клиент переименован.' : 'Клиент добавлен.');
    });
  }});
}
function adminClientArchive(){
  const client = adminClientRequire();
  if(!client) return;
  if(!window.confirm(`Архивировать клиента «${client.name || 'Клиент'}»? Он исчезнет из рабочего списка, но данные не удалятся.`)) return;
  runAdminTrebnikAction('client.archive', {client_id:client.id}, 'Клиент отправлен в архив.', {clearClient:true});
}
function adminClientDelete(){
  const client = adminClientRequire();
  if(!client) return;
  if(!window.confirm(`Удалить клиента «${client.name || 'Клиент'}» вместе с его данными?\n\nЭто опасное действие. Лучше архивировать, если нет полной уверенности.`)) return;
  runAdminTrebnikAction('client.delete', {client_id:client.id}, 'Клиент удалён.', {clearClient:true});
}
function requestInstallmentMode(row={}){
  if(!row.installment) return 'none';
  const type = row.installment_plan_type || 'legacy';
  const schedule = row.installment_schedule_mode || '';
  if(type === 'free') return 'free';
  if(type === 'free_until_date') return 'free_until_date';
  if(type === 'fixed_amount' && schedule === 'monthly_any') return 'fixed_monthly_any';
  if(type === 'fixed_amount') return 'fixed_interval';
  if(type === 'equal_parts' && schedule === 'monthly_any') return 'equal_monthly_any';
  if(type === 'equal_parts') return 'equal_interval';
  return 'legacy';
}
function requestInstallmentPayload(mode, data){
  if(mode === 'none') return {installment:false};
  const payload = {
    installment:true,
    installment_first_payment:0,
    installment_fixed_amount:data.get('installment_fixed_amount') || 0,
    installment_terms:data.get('installment_terms') || '',
    installment_first_due_date:data.get('installment_first_due_date') || '',
    installment_interval_days:data.get('installment_interval_days') || '',
    installment_month_days:'',
    installment_end_date:data.get('installment_end_date') || '',
  };
  if(mode === 'free') return {...payload, installment_plan_type:'free', installment_schedule_mode:''};
  if(mode === 'free_until_date') return {...payload, installment_plan_type:'free_until_date', installment_schedule_mode:''};
  if(mode === 'fixed_monthly_any') return {...payload, installment_plan_type:'fixed_amount', installment_schedule_mode:'monthly_any'};
  if(mode === 'fixed_interval') return {...payload, installment_plan_type:'fixed_amount', installment_schedule_mode:'interval', installment_interval_days:data.get('installment_interval_days') || 14};
  if(mode === 'equal_monthly_any') return {...payload, installment_plan_type:'equal_parts', installment_schedule_mode:'monthly_any'};
  if(mode === 'equal_interval') return {...payload, installment_plan_type:'equal_parts', installment_schedule_mode:'interval', installment_interval_days:data.get('installment_interval_days') || 14};
  return {...payload, installment_plan_type:'legacy', installment_schedule_mode:''};
}
function syncRequestInstallmentFields(form){
  const mode = form.elements.installment_mode?.value || 'none';
  form.dataset.installmentMode = mode;
  let visibleCount = 0;
  form.querySelectorAll('[data-plan-field]').forEach(field => {
    const modes = String(field.dataset.modes || '').split(/\s+/).filter(Boolean);
    const visible = modes.includes(mode);
    field.hidden = !visible;
    if(visible) visibleCount += 1;
  });
  const planFields = form.querySelector('.request-plan-fields');
  if(planFields) planFields.hidden = visibleCount === 0;
}
function requestAdminModal(mode='add', id=''){
  const client = adminClientRequire();
  if(!client) return;
  const row = mode === 'edit' ? adminClientRequestById(id) : {};
  const isEdit = mode === 'edit';
  const planMode = requestInstallmentMode(row);
  openModal(isEdit ? 'Изменить запрос' : 'Новый запрос', `<form class="form trebnik-request-editor" id="adminRequestForm" data-installment-mode="${attr(planMode)}">
    <div class="form-grid two request-title-grid">
      <label><span>Название</span><input name="title" value="${attr(row.title || '')}" required></label>
      <label><span>Базовая стоимость</span><input name="base_cost" inputmode="decimal" value="${attr(row.base_cost || '')}"></label>
    </div>
    <label><span>Цель</span><textarea name="goal" rows="2">${esc(row.goal || '')}</textarea></label>
    <div class="form-grid two request-status-grid">
      <label><span>Статус</span><select name="status"><option value="planned" ${row.status === 'planned' ? 'selected' : ''}>запланирована</option><option value="active" ${row.status === 'active' ? 'selected' : ''}>активна</option><option value="closed" ${row.status === 'closed' ? 'selected' : ''}>закрыта</option></select></label>
      <label><span>Рассрочка</span><select name="installment_mode">
        <option value="none" ${planMode === 'none' ? 'selected' : ''}>Без рассрочки</option>
        <option value="free" ${planMode === 'free' ? 'selected' : ''}>Свободно: долг без срока</option>
        <option value="fixed_monthly_any" ${planMode === 'fixed_monthly_any' ? 'selected' : ''}>По сумме каждый месяц</option>
        <option value="fixed_interval" ${planMode === 'fixed_interval' ? 'selected' : ''}>По сумме каждые N дней</option>
        <option value="equal_monthly_any" ${planMode === 'equal_monthly_any' ? 'selected' : ''}>Равными частями по месяцам</option>
        <option value="equal_interval" ${planMode === 'equal_interval' ? 'selected' : ''}>Равными частями по интервалу</option>
        <option value="free_until_date" ${planMode === 'free_until_date' ? 'selected' : ''}>Весь остаток до даты</option>
        <option value="legacy" ${planMode === 'legacy' ? 'selected' : ''}>Только текстовые условия</option>
      </select></label>
    </div>
    <section class="request-plan-fields">
      <div class="form-grid two">
        <label data-plan-field data-modes="fixed_monthly_any fixed_interval"><span>Сумма платежа</span><input name="installment_fixed_amount" inputmode="decimal" value="${attr(row.installment_fixed_amount || '')}"></label>
        <label data-plan-field data-modes="fixed_monthly_any fixed_interval equal_monthly_any equal_interval"><span>Первая дата</span><input name="installment_first_due_date" type="date" value="${attr(inputDateValue(row.installment_first_due_date || '') || '')}"></label>
        <label data-plan-field data-modes="fixed_interval equal_interval"><span>Интервал, дней</span><input name="installment_interval_days" type="number" min="1" value="${attr(row.installment_interval_days || '')}"></label>
        <label data-plan-field data-modes="equal_monthly_any equal_interval free_until_date"><span>Закончить до</span><input name="installment_end_date" type="date" value="${attr(inputDateValue(row.installment_end_date || '') || '')}"></label>
        <label data-plan-field data-modes="free fixed_monthly_any fixed_interval equal_monthly_any equal_interval free_until_date legacy"><span>Условия</span><textarea name="installment_terms" rows="2">${esc(row.installment_terms || '')}</textarea></label>
      </div>
    </section>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row trebnik-request-editor__actions"><button class="primary" data-save-content>${isEdit ? 'Сохранить' : 'Создать'}</button>${isEdit ? `<button class="plain danger" type="button" data-action="request-delete" data-id="${attr(row.id)}">Удалить</button>` : ''}<button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {kind:'request-editor',onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const formRoot = root.querySelector('#adminRequestForm');
    formRoot?.elements.installment_mode?.addEventListener('change', () => syncRequestInstallmentFields(formRoot));
    if(formRoot) syncRequestInstallmentFields(formRoot);
    formRoot?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const installmentMode = data.get('installment_mode') || 'none';
      const payload = {
        client_id:client.id,
        title:data.get('title'),
        goal:data.get('goal'),
        status:data.get('status'),
        base_cost:data.get('base_cost') || 0,
      };
      if(isEdit) payload.request_id = row.id;
      Object.assign(payload, requestInstallmentPayload(installmentMode, data));
      submitAdminTrebnikForm(form, isEdit ? 'request.update' : 'request.add', payload, isEdit ? 'Запрос обновлён.' : 'Запрос создан.');
    });
  }});
}
function adminRequestDelete(id=''){
  if(!id) return;
  const row = adminClientRequestById(id);
  if(!window.confirm(`Удалить запрос «${row.title || 'Запрос'}»? Вместе с ним могут исчезнуть связанные работы и записи.`)) return;
  runAdminTrebnikAction('request.delete', {request_id:id}, 'Запрос удалён.');
}
function ritebookTemplateByKey(key=''){
  const rows = typeof ritebookCatalog === 'function' ? ritebookCatalog() : (state.dashboard?.work_catalog || []);
  return (Array.isArray(rows) ? rows : []).find(row => String(row.key || '') === String(key || '')) || null;
}
function ritebookTemplateOptions(selectedKey=''){
  const rows = typeof ritebookCatalog === 'function' ? ritebookCatalog() : (state.dashboard?.work_catalog || []);
  return (Array.isArray(rows) ? rows : []).slice(0, 200).map(row => {
    const meta = [
      typeof ritebookCategory === 'function' ? ritebookCategoryTitle(ritebookCategory(row)) : '',
      typeof ritebookScheduleText === 'function' ? ritebookScheduleText(row) : '',
    ].filter(Boolean).join(' · ');
    const label = [row.title || 'Работа', meta].filter(Boolean).join(' · ');
    return `<option value="${attr(row.key || '')}" ${String(row.key || '') === String(selectedKey || '') ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}
function ritebookTemplateSelectHtml(selectedKey=''){
  const options = ritebookTemplateOptions(selectedKey);
  return options ? `<label class="ritebook-template-picker"><span>Из Обрядника</span><select name="template_key"><option value="">Без шаблона</option>${options}</select></label>` : '';
}
function setWorkFormValue(form, name, value){
  const field = form?.elements?.[name];
  if(!field) return;
  field.value = value === undefined || value === null ? '' : String(value);
}
function applyWorkTemplateToForm(form, template={}){
  if(!form || !template?.key) return;
  setWorkFormValue(form, 'title', template.title || '');
  setWorkFormValue(form, 'goal', template.goal || '');
  setWorkFormValue(form, 'type', template.type || 'once');
  setWorkFormValue(form, 'total_days', template.total_days || '');
  setWorkFormValue(form, 'period_days', template.period_days || '');
  setWorkFormValue(form, 'period_times', template.period_times || '');
}
function workEditorPlannedDates(type='', start='', totalDays=0, periodDays=0, periodTimes=0, finalDate=''){
  const dates = [];
  const first = inputDateValue(start);
  if(!type || !first) return dates;
  if(type === 'once') return [first];
  if(type === 'multi'){
    const end = inputDateValue(finalDate) || (Number(totalDays || 0) > 0 ? addIsoDays(first, Number(totalDays || 0) - 1) : '');
    if(!end) return dates;
    let current = first;
    while(current && current <= end && dates.length < 366){
      dates.push(current);
      current = addIsoDays(current, 1);
    }
    return dates.length ? dates : [first];
  }
  if(type === 'periodic'){
    const step = Number(periodDays || 0);
    const times = Number(periodTimes || 0);
    if(step <= 0) return dates;
    if(times > 0){
      for(let index = 0; index < Math.min(times, 366); index += 1) dates.push(addIsoDays(first, step * index));
      return dates.filter(Boolean);
    }
    const end = inputDateValue(finalDate);
    if(!end) return dates;
    let current = first;
    while(current && current <= end && dates.length < 366){
      dates.push(current);
      current = addIsoDays(current, step);
    }
  }
  return dates;
}
function workEditorScheduleState(form){
  const type = form?.elements?.type?.value || '';
  const start = inputDateValue(form?.elements?.expected_first_result?.value);
  const totalDays = Number(form?.elements?.total_days?.value || 0);
  const periodDays = Number(form?.elements?.period_days?.value || 0);
  const periodTimes = Number(form?.elements?.period_times?.value || 0);
  let finalDate = '';
  if(type === 'once' && start) finalDate = start;
  if(type === 'multi' && start && totalDays > 0) finalDate = addIsoDays(start, totalDays - 1);
  if(type === 'periodic' && start && periodDays > 0 && periodTimes > 0) finalDate = addIsoDays(start, periodDays * (periodTimes - 1));
  const dates = workEditorPlannedDates(type, start, totalDays, periodDays, periodTimes, finalDate);
  const today = moscowDateValue();
  const pastDates = today ? dates.filter(item => item < today) : [];
  const todayAndFutureDates = today ? dates.filter(item => item >= today) : dates;
  const nextDue = todayAndFutureDates[0] || dates[0] || start || '';
  const ready = Boolean(type && start && (
    type === 'once' ||
    (type === 'multi' && totalDays > 0 && finalDate) ||
    (type === 'periodic' && periodDays > 0 && periodTimes > 0 && finalDate)
  ));
  let status = '';
  if(ready){
    if(today && dates.length && dates.every(item => item < today)) status = 'completed';
    else if(today && start <= today) status = 'active';
    else status = 'planned';
  }
  const markDates = status === 'completed' ? dates.filter(item => !today || item <= today) : pastDates;
  return {type, start, totalDays, periodDays, periodTimes, finalDate, dates, today, pastDates, todayAndFutureDates, nextDue, ready, status, markDates};
}
function workEditorSelectedMarkDates(form){
  return Array.from(form?.querySelectorAll('[data-work-past-date]:checked') || [])
    .map(item => inputDateValue(item.value))
    .filter(Boolean);
}
function workEditorNextDueAfterMarks(info, selectedDates=[]){
  const selected = new Set((selectedDates || []).map(inputDateValue).filter(Boolean));
  return (info.dates || []).find(item => item && !selected.has(item)) || info.nextDue || (info.dates || [])[0] || info.start || '';
}
function workEditorCompactDate(value=''){
  const iso = inputDateValue(value);
  if(!iso) return date(value);
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
}
function workEditorRenderMarkDatePicker(form, info, markDates=[], isEdit=false, onChange=null){
  const picker = form?.querySelector('[data-work-past-picker]');
  const list = form?.querySelector('[data-work-past-list]');
  const title = form?.querySelector('[data-work-past-title]');
  if(!picker || !list) return [];
  const dates = (markDates || []).map(inputDateValue).filter(Boolean);
  if(isEdit || !dates.length){
    picker.hidden = true;
    list.innerHTML = '';
    list.dataset.dates = '';
    return [];
  }
  picker.hidden = false;
  if(title) title.textContent = 'Уже проведены:';
  const datesKey = dates.join(',');
  if(list.dataset.dates !== datesKey){
    list.dataset.dates = datesKey;
    list.innerHTML = dates.map(date => `<label class="trebnik-work-date-chip" title="${attr(dateLong(date))}"><input data-work-past-date name="mark_dates" type="checkbox" value="${attr(date)}" checked><span>${esc(workEditorCompactDate(date))}</span></label>`).join('');
    list.querySelectorAll('[data-work-past-date]').forEach(input => {
      input.addEventListener('change', () => {
        if(typeof onChange === 'function') onChange();
      });
    });
  }
  return workEditorSelectedMarkDates(form);
}
async function ritebookEditModal(key=''){
  let row = ritebookTemplateByKey(key);
  if(!row && key){
    await loadRitebookCatalog(true).catch(() => {});
    row = ritebookTemplateByKey(key);
    if(state.route === 'trebnik') paintAdminTrebnik();
  }
  if(!row){ say('Не нашёл эту работу в Обряднике.', 'warning'); return; }
  const category = typeof ritebookCategory === 'function' ? ritebookCategory(row) : (row.category || 'служебная');
  const categoryOptions = typeof ritebookCategoryOptions === 'function' ? ritebookCategoryOptions(category) : '';
  openModal('Правка обряда', `<form class="form ritebook-editor" id="ritebookEditorForm">
    <div class="ritebook-editor__top">
      <label><span>Название работы</span><input name="title" value="${attr(row.title || '')}" required></label>
      <label><span>Категория</span><select name="category_select" data-ritebook-category-select required>${categoryOptions}<option value="__custom__">Своя категория</option></select></label>
      <label class="ritebook-editor__custom-category" hidden><span>Новая категория</span><input name="category_custom" value="" placeholder="например: чистка"></label>
    </div>
    <input type="hidden" name="category" value="${attr(category)}">
    <label><span>Пояснение</span><textarea name="goal" rows="4">${esc(row.goal || '')}</textarea></label>
    <div class="ritebook-editor__grid">
      <label><span>Тип</span><select name="type"><option value="once" ${(row.type || 'once') === 'once' ? 'selected' : ''}>разовая</option><option value="multi" ${row.type === 'multi' ? 'selected' : ''}>многодневная</option><option value="periodic" ${row.type === 'periodic' ? 'selected' : ''}>периодическая</option></select></label>
      <label><span>Всего дней</span><input name="total_days" type="number" min="1" value="${attr(row.total_days || '')}"></label>
      <label><span>Повтор, дней</span><input name="period_days" type="number" min="1" value="${attr(row.period_days || '')}"></label>
      <label><span>Повторов</span><input name="period_times" type="number" min="1" value="${attr(row.period_times || '')}"></label>
    </div>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="ritebook-editor__actions"><button class="primary" data-save-content>Сохранить</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {wide:true,kind:'ritebook-editor',onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const form = root.querySelector('#ritebookEditorForm');
    const categorySelect = root.querySelector('[data-ritebook-category-select]');
    const customCategory = root.querySelector('.ritebook-editor__custom-category');
    const customInput = root.querySelector('[name="category_custom"]');
    const categoryInput = root.querySelector('[name="category"]');
    const syncCategory = () => {
      if(!categorySelect || !categoryInput) return;
      const isCustom = categorySelect.value === '__custom__';
      if(customCategory) customCategory.hidden = !isCustom;
      if(isCustom){
        categoryInput.value = String(customInput?.value || '').trim();
        customInput?.setAttribute('required', 'required');
      }else{
        categoryInput.value = categorySelect.value;
        customInput?.removeAttribute('required');
      }
    };
    categorySelect?.addEventListener('change', () => {
      syncCategory();
      if(categorySelect.value === '__custom__') customInput?.focus({preventScroll:true});
    });
    customInput?.addEventListener('input', syncCategory);
    syncCategory();
    form?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const body = {
        key:row.key,
        title:data.get('title'),
        category:data.get('category'),
        goal:data.get('goal'),
        type:data.get('type'),
        total_days:data.get('total_days') || '',
        period_days:data.get('period_days') || '',
        period_times:data.get('period_times') || '',
      };
      submitSimpleModal(form, form.querySelector('[data-form-feedback]'), '/api/admin/ritebook/update', body, 'Обрядник обновлён.', async payload => {
        if(state.dashboard && Array.isArray(payload.work_catalog)) state.dashboard.work_catalog = payload.work_catalog;
        else await loadDashboard(true).catch(() => {});
        if(state.route === 'trebnik') paintAdminTrebnik();
      });
    });
  }});
}
async function workAdminModal(mode='add', idOrRequest='', templateKey=''){
  const client = adminClientRequire();
  if(!client) return;
  const isEdit = mode === 'edit';
  if(!isEdit) await loadRitebookCatalog().catch(() => {});
  const template = isEdit ? null : ritebookTemplateByKey(templateKey);
  const row = isEdit ? adminClientWorkById(idOrRequest) : (template || {});
  const selectedRequestId = isEdit ? row.request_id : (idOrRequest || (adminClientPayload().requests || [])[0]?.id || '');
  const workCostMode = isEdit ? workEditorCostMode(row, selectedRequestId) : workDefaultCostModeForRequest(selectedRequestId);
  if(!isEdit && !selectedRequestId){ say('Сначала создайте запрос клиента.', 'warning'); return; }
  const selectedType = row.type || (template?.type || '');
  openModal(isEdit ? 'Изменить работу' : 'Новая работа', `<form class="form trebnik-work-editor" id="adminWorkForm">
    ${isEdit ? '' : ritebookTemplateSelectHtml(templateKey)}
    ${isEdit ? '' : `<label><span>Запрос</span><select name="request_id" required>${adminRequestOptions(selectedRequestId)}</select></label>`}
    <div class="form-grid two trebnik-work-editor__main">
      <label><span>Название работы</span><input name="title" value="${attr(row.title || '')}" required></label>
      <label><span>Первая дата</span><input name="expected_first_result" type="date" value="${attr(inputDateValue(row.expected_first_result || row.next_due))}"></label>
    </div>
    <label><span>Пояснение</span><textarea name="goal" rows="3">${esc(row.goal || '')}</textarea></label>
    <details class="form-details trebnik-work-schedule" open><summary>Сроки и повторы</summary>
      <div class="form-grid two">
        <label><span>Тип</span><select name="type" required><option value="" ${selectedType ? '' : 'selected'}>Выберите тип</option><option value="once" ${selectedType === 'once' ? 'selected' : ''}>разовая</option><option value="multi" ${selectedType === 'multi' ? 'selected' : ''}>многодневная</option><option value="periodic" ${selectedType === 'periodic' ? 'selected' : ''}>периодическая</option></select></label>
        <label class="trebnik-work-editor__status"><span>Статус</span><select name="status"><option value="planned" ${row.status === 'planned' ? 'selected' : ''}>запланирована</option><option value="active" ${row.status === 'active' ? 'selected' : ''}>активна</option><option value="paused" ${row.status === 'paused' ? 'selected' : ''}>пауза</option><option value="completed" ${row.status === 'completed' ? 'selected' : ''}>завершена</option></select></label>
        <label data-work-field="total_days" hidden><span>Всего дней</span><input name="total_days" type="number" min="1" value="${attr(row.total_days || '')}"></label>
        <label data-work-field="period_days" hidden><span>Повторов каждые, дней</span><input name="period_days" type="number" min="1" value="${attr(row.period_days || '')}"></label>
        <label data-work-field="period_times" hidden><span>Всего повторов</span><input name="period_times" type="number" min="1" value="${attr(row.period_times || '')}"></label>
        <label class="trebnik-work-editor__computed" data-work-field="expected_final_result" hidden><span>Последняя дата</span><input name="expected_final_result" type="date" value="${attr(inputDateValue(row.expected_final_result))}" readonly tabindex="-1"></label>
        <input name="next_due" type="hidden" value="${attr(inputDateValue(row.next_due))}">
      </div>
      <div class="trebnik-work-status-line" data-work-status-line hidden>
        <p data-work-status-text></p>
        <div class="trebnik-work-date-picker" data-work-past-picker hidden>
          <div class="trebnik-work-date-picker__head">
            <span data-work-past-title></span>
            <span class="trebnik-work-date-picker__actions">
              <button class="plain" type="button" data-work-date-select="all">Все</button>
              <button class="plain" type="button" data-work-date-select="none">Снять</button>
            </span>
          </div>
          <div class="trebnik-work-date-picker__grid" data-work-past-list></div>
        </div>
      </div>
    </details>
    <details class="form-details"><summary>Стоимость</summary><div class="form-grid two">
      <label><span>Расчёт</span><select name="cost_mode"><option value="included_in_request" ${workCostMode === 'included_in_request' ? 'selected' : ''}>Входит в стоимость запроса</option><option value="auto_from_payments" ${workCostMode === 'auto_from_payments' ? 'selected' : ''}>По отдельным платежам</option><option value="manual" ${workCostMode === 'manual' ? 'selected' : ''}>Фиксированная сумма</option></select></label>
      <label data-work-fixed-cost><span>Сумма</span><input name="extra_cost" inputmode="decimal" value="${attr(workCostMode === 'manual' ? (row.extra_cost || '') : '')}"></label>
    </div></details>
    ${isEdit ? '' : adminNotifyClientLine(false)}
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row trebnik-work-editor__actions"><button class="primary" data-save-content>${isEdit ? 'Сохранить' : 'Создать'}</button>${isEdit ? `<button class="plain danger" type="button" data-action="work-delete" data-id="${attr(row.id)}">Удалить</button>` : ''}<button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {wide:true,kind:'work-editor',onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const form = root.querySelector('#adminWorkForm');
    let statusTouched = isEdit && Boolean(row.status);
    let costModeTouched = isEdit;
    const syncWorkSchedule = () => {
      if(!form) return;
      const info = workEditorScheduleState(form);
      const type = info.type;
      const finalInput = form.elements?.expected_final_result;
      const nextInput = form.elements?.next_due;
      const statusInput = form.elements?.status;
      const line = form.querySelector('[data-work-status-line]');
      const lineText = form.querySelector('[data-work-status-text]');
      form.querySelectorAll('[data-work-field]').forEach(item => {
        const name = item.dataset.workField || '';
        item.hidden = !((type === 'multi' && ['total_days','expected_final_result'].includes(name)) || (type === 'periodic' && ['period_days','period_times','expected_final_result'].includes(name)));
      });
      if(type !== 'multi' && form.elements?.total_days) form.elements.total_days.value = '';
      if(type !== 'periodic'){
        if(form.elements?.period_days) form.elements.period_days.value = '';
        if(form.elements?.period_times) form.elements.period_times.value = '';
      }
      if(finalInput) finalInput.value = info.finalDate || '';
      if(!statusTouched && statusInput && info.status) statusInput.value = info.status;
      if(line) line.hidden = !type;
      if(lineText){
        if(!type){
          lineText.textContent = '';
        }else if(!info.start){
          lineText.textContent = 'Укажите первую дату, чтобы сайт рассчитал сроки.';
        }else if(type === 'multi' && !info.totalDays){
          lineText.textContent = 'Укажите, сколько всего дней длится работа.';
        }else if(type === 'periodic' && (!info.periodDays || !info.periodTimes)){
          lineText.textContent = 'Укажите шаг повторов и общее количество повторов.';
        }else if(info.status === 'completed'){
          lineText.textContent = `По этим датам работа уже должна быть завершена. Последняя дата: ${dateLong(info.finalDate || info.dates[info.dates.length - 1])}.`;
        }else if(info.status === 'active' && info.pastDates.length){
          lineText.textContent = `Статус подходит: активна. Впереди ещё есть проведение: ${dateLong(info.nextDue)}.`;
        }else if(info.status === 'active'){
          lineText.textContent = `Статус подходит: активна. Ближайшее проведение: ${dateLong(info.nextDue)}.`;
        }else if(info.status === 'planned'){
          lineText.textContent = `Статус подходит: запланирована. Первое проведение: ${dateLong(info.start)}.`;
        }else{
          lineText.textContent = '';
        }
      }
      const markDates = info.markDates || [];
      const selectedMarkDates = workEditorRenderMarkDatePicker(form, info, markDates, isEdit, syncWorkSchedule);
      if(nextInput){
        nextInput.value = markDates.length && !isEdit ? workEditorNextDueAfterMarks(info, selectedMarkDates) : (info.nextDue || info.dates[0] || info.start || '');
      }
    };
    const syncCostMode = () => {
      const fixed = form?.querySelector('[data-work-fixed-cost]');
      const mode = form?.elements?.cost_mode?.value || 'auto_from_payments';
      if(fixed) fixed.hidden = mode !== 'manual';
      if(mode !== 'manual' && form?.elements?.extra_cost) form.elements.extra_cost.value = '';
    };
    form?.elements?.cost_mode?.addEventListener('change', () => {
      costModeTouched = true;
      syncCostMode();
    });
    form?.elements?.request_id?.addEventListener('change', () => {
      if(!costModeTouched && form?.elements?.cost_mode) form.elements.cost_mode.value = workDefaultCostModeForRequest(form.elements.request_id.value);
      syncCostMode();
    });
    form?.elements?.status?.addEventListener('change', () => { statusTouched = true; });
    form?.querySelectorAll('[data-work-date-select]').forEach(button => button.addEventListener('click', () => {
      const checked = button.dataset.workDateSelect === 'all';
      form.querySelectorAll('[data-work-past-date]').forEach(input => { input.checked = checked; });
      syncWorkSchedule();
    }));
    syncCostMode();
    ['type','expected_first_result','total_days','period_days','period_times'].forEach(name => form?.elements?.[name]?.addEventListener('input', syncWorkSchedule));
    ['type','expected_first_result','total_days','period_days','period_times'].forEach(name => form?.elements?.[name]?.addEventListener('change', syncWorkSchedule));
    syncWorkSchedule();
    const templateSelect = form?.elements?.template_key;
    templateSelect?.addEventListener('change', () => {
      const picked = ritebookTemplateByKey(templateSelect.value);
      if(picked){
        statusTouched = false;
        applyWorkTemplateToForm(form, picked);
        syncWorkSchedule();
      }
    });
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      syncWorkSchedule();
      const data = new FormData(form);
      const costMode = data.get('cost_mode') || 'auto_from_payments';
      const schedule = workEditorScheduleState(form);
      const availableMarkDates = new Set((schedule.markDates || []).map(inputDateValue).filter(Boolean));
      const markDates = !isEdit ? workEditorSelectedMarkDates(form).filter(item => availableMarkDates.has(item)) : [];
      const payload = {
        request_id:data.get('request_id') || selectedRequestId,
        title:data.get('title'),
        goal:data.get('goal'),
        status:data.get('status'),
        type:data.get('type') || 'once',
        expected_first_result:data.get('expected_first_result') || '',
        expected_final_result:schedule.finalDate || data.get('expected_final_result') || '',
        next_due:data.get('next_due') || data.get('expected_first_result') || '',
        total_days:schedule.type === 'multi' ? (data.get('total_days') || '') : '',
        period_days:schedule.type === 'periodic' ? (data.get('period_days') || '') : '',
        period_times:schedule.type === 'periodic' ? (data.get('period_times') || '') : '',
        extra_cost:costMode === 'manual' ? (data.get('extra_cost') || 0) : 0,
        cost_mode:costMode,
        notify_client:Boolean(data.get('notify_client')),
      };
      if(isEdit) payload.work_id = row.id;
      if(isEdit || !markDates.length){
        submitAdminTrebnikForm(form, isEdit ? 'work.update' : 'work.add', payload, isEdit ? 'Работа обновлена.' : 'Работа создана.');
        return;
      }
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      const feedback = form.querySelector('[data-form-feedback]');
      try{
        setFeedback(feedback, 'Создаю работу и отмечаю выбранные даты…', 'warning');
        const result = await api('/api/admin/trebnik/action', {method:'POST', body:{command:'work.add', payload}});
        const workId = result?.result?.work_id;
        let loggedCount = 0;
        if(workId){
          try{
            for(let index = 0; index < markDates.length; index += 31){
              const chunk = markDates.slice(index, index + 31);
              const body = chunk.length > 1 ? {work_id:workId, log_dates:chunk, notify_client:false} : {work_id:workId, log_date:chunk[0], notify_client:false};
              await api(chunk.length > 1 ? '/api/admin/work/log-bulk' : '/api/admin/work/log', {method:'POST', body});
              loggedCount += chunk.length;
            }
          }catch(logError){
            closeModal(true);
            say(`Работа создана, но прошлые даты отмечены не все: ${loggedCount} из ${markDates.length}.`, 'warning');
            await afterAdminClientMutation(result);
            return;
          }
        }
        closeModal(true);
        say(`Работа создана. Отмечено дат: ${loggedCount}.`, 'success');
        await afterAdminClientMutation(result);
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось создать работу.', 'danger');
        say(error.message || 'Не удалось создать работу.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }});
}
function adminWorkDelete(id=''){
  if(!id) return;
  const row = adminClientWorkById(id);
  if(!window.confirm(`Удалить работу «${row.title || 'Работа'}»?`)) return;
  runAdminTrebnikAction('work.delete', {work_id:id}, 'Работа удалена.');
}
function diagnosticAdminModal(requestId='', workId=''){
  const client = adminClientRequire();
  if(!client) return;
  const selectedWork = workId ? adminClientWorkById(workId) : {};
  const initialRequestId = requestId || selectedWork.request_id || '';
  const workOptions = initialRequestId ? adminWorkOptionsForRequest(initialRequestId, workId) : '';
  openModal('Добавить диагностику', `<form class="form" id="adminDiagnosticForm">
    <div class="form-grid two">
      <label><span>Запрос</span><select name="request_id"><option value="">Без запроса</option>${adminRequestOptions(initialRequestId)}</select></label>
      <label><span>Работа</span><select name="work_id"><option value="">Без работы</option>${workOptions}</select></label>
    </div>
    <label><span>Название</span><input name="title" required></label>
    <div class="form-grid two">
      <label><span>Тип</span><select name="type"><option value="diagnostic">Техническая</option><option value="ordered">По заказу</option></select></label>
      <label data-diagnostic-cost-field hidden><span>Стоимость</span><input name="cost" inputmode="decimal"></label>
    </div>
    <label><span>Что найдено</span><textarea name="findings" rows="5"></textarea></label>
    <label class="toggle-line"><input name="is_hidden" type="checkbox"><span>Скрыть от клиента</span></label>
    ${adminNotifyClientLine(false)}
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Добавить</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {wide:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const formRoot = root.querySelector('#adminDiagnosticForm');
    const syncDiagnosticFields = () => {
      const requestValue = String(formRoot?.elements?.request_id?.value || '');
      const workValue = String(formRoot?.elements?.work_id?.value || '');
      if(formRoot?.elements?.work_id){
        formRoot.elements.work_id.innerHTML = `<option value="">Без работы</option>${requestValue ? adminWorkOptionsForRequest(requestValue, workValue) : ''}`;
      }
      const ordered = String(formRoot?.elements?.type?.value || '') === 'ordered';
      const costField = formRoot?.querySelector('[data-diagnostic-cost-field]');
      if(costField) costField.hidden = !ordered;
      if(!ordered && formRoot?.elements?.cost) formRoot.elements.cost.value = '';
    };
    formRoot?.elements?.request_id?.addEventListener('change', syncDiagnosticFields);
    formRoot?.elements?.type?.addEventListener('change', syncDiagnosticFields);
    syncDiagnosticFields();
    formRoot?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const hidden = Boolean(data.get('is_hidden'));
      submitAdminTrebnikForm(form, 'diagnostic.add', {client_id:client.id, request_id:data.get('request_id') || null, work_id:data.get('work_id') || null, title:data.get('title'), type:data.get('type'), findings:data.get('findings'), cost:data.get('cost') || 0, is_hidden:hidden, notify_client:Boolean(data.get('notify_client')) && !hidden}, 'Диагностика добавлена.');
    });
  }});
}
function adminDiagnosticDetailModal(id=''){
  const row = adminClientDiagnosticById(id);
  if(!row?.id){
    openModal('Диагностика', problem('Не удалось открыть диагностику.'), {compact:true});
    return;
  }
  openModal('Диагностика', `<div class="detail trebnik-detail-modal">${adminDiagnosticDetailPane(row)}</div>`, {wide:true, kind:'trebnik-detail'});
}
function adminDiagnosticEditModal(id=''){
  const row = adminClientDiagnosticById(id);
  if(!row?.id){
    say('Не удалось открыть диагностику.', 'warning');
    return;
  }
  const isOrdered = String(row.type || '').toLowerCase() === 'ordered';
  openModal('Изменить диагностику', `<form class="form" id="adminDiagnosticEditForm">
    <label><span>Название</span><input name="title" value="${attr(row.title || '')}" required></label>
    <div class="form-grid two">
      <label><span>Тип</span><select name="type"><option value="diagnostic" ${isOrdered ? '' : 'selected'}>Техническая</option><option value="ordered" ${isOrdered ? 'selected' : ''}>По заказу</option></select></label>
      <label data-diagnostic-cost-field ${isOrdered ? '' : 'hidden'}><span>Стоимость</span><input name="cost" inputmode="decimal" value="${attr(row.cost || '')}"></label>
    </div>
    <label><span>Что найдено</span><textarea name="findings" rows="6">${esc(row.findings || '')}</textarea></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Сохранить</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {wide:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const formRoot = root.querySelector('#adminDiagnosticEditForm');
    const syncCostField = () => {
      const ordered = String(formRoot?.elements?.type?.value || '') === 'ordered';
      const costField = formRoot?.querySelector('[data-diagnostic-cost-field]');
      if(costField) costField.hidden = !ordered;
      if(!ordered && formRoot?.elements?.cost) formRoot.elements.cost.value = '';
    };
    formRoot?.elements?.type?.addEventListener('change', syncCostField);
    syncCostField();
    formRoot?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      submitAdminTrebnikForm(form, 'diagnostic.update', {diagnostic_id:row.id, title:data.get('title'), type:data.get('type'), findings:data.get('findings'), cost:data.get('cost') || 0}, 'Диагностика обновлена.');
    });
  }});
}
function adminDiagnosticToggleHidden(id=''){
  const row = adminClientDiagnosticById(id);
  if(!row?.id){
    say('Не удалось найти диагностику.', 'warning');
    return;
  }
  const nextHidden = !Boolean(row.is_hidden);
  runAdminTrebnikAction('diagnostic.update', {diagnostic_id:id, is_hidden:nextHidden}, nextHidden ? 'Диагностика скрыта от клиента.' : 'Диагностика открыта клиенту.');
}
function adminDiagnosticDelete(id=''){
  if(!id || !window.confirm('Удалить диагностику?')) return;
  runAdminTrebnikAction('diagnostic.delete', {diagnostic_id:id}, 'Диагностика удалена.');
}
function recommendationAdminModal(mode='add', idOrRequest=''){
  const client = adminClientRequire();
  if(!client) return;
  const isEdit = mode === 'edit';
  const row = isEdit ? adminClientRecommendationById(idOrRequest) : {};
  const requestId = isEdit ? row.request_id : idOrRequest;
  openModal(isEdit ? 'Изменить рекомендацию' : 'Добавить рекомендацию', `<form class="form" id="adminRecommendationForm">
    ${isEdit ? '' : `<label><span>Запрос</span><select name="request_id"><option value="">Без запроса</option>${adminRequestOptions(requestId)}</select></label>`}
    <label><span>Текст рекомендации</span><textarea name="text" rows="6" required>${esc(row.text || '')}</textarea></label>
    ${isEdit ? '' : adminNotifyClientLine(false)}
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>${isEdit ? 'Сохранить' : 'Добавить'}</button>${isEdit ? `<button class="plain danger" type="button" data-action="recommendation-delete" data-id="${attr(row.id)}">Удалить</button>` : ''}<button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    root.querySelector('#adminRecommendationForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const payload = isEdit ? {recommendation_id:row.id, text:data.get('text')} : {client_id:client.id, request_id:data.get('request_id') || null, text:data.get('text'), notify_client:Boolean(data.get('notify_client'))};
      submitAdminTrebnikForm(form, isEdit ? 'recommendation.update' : 'recommendation.add', payload, isEdit ? 'Рекомендация обновлена.' : 'Рекомендация добавлена.');
    });
  }});
}
function adminRecommendationAction(id='', action='cancel'){
  if(!id) return;
  const row = adminClientRecommendationById(id);
  const command = action === 'delete' ? 'recommendation.delete' : 'recommendation.cancel';
  const text = action === 'delete' ? 'Удалить рекомендацию?' : 'Отменить рекомендацию?';
  if(!window.confirm(text)) return;
  runAdminTrebnikAction(command, {recommendation_id:row.id || id}, action === 'delete' ? 'Рекомендация удалена.' : 'Рекомендация отменена.');
}
async function paymentReminderSend(targetType='', targetId='', clientId=''){
  if(!targetType || !targetId) return say('Не найден пункт для напоминания.', 'warning');
  openModal('Напоминание', `<div data-payment-reminder-preview>${loading('Открываю напоминание…')}</div>`, {compact:true,kind:'payment-reminder-send',onMount(root){
    const host = root.querySelector('[data-payment-reminder-preview]');
    api('/api/admin/trebnik/action', {method:'POST', body:{command:'payment.reminder.preview', payload:{target_type:targetType, target_id:targetId, client_id:clientId || undefined}}})
      .then(payload => {
        const preview = payload.result || {};
        const telegramDisabled = !preview.client_has_telegram;
        host.innerHTML = `<form class="form payment-reminder-send-form" id="paymentReminderSendForm">
          <div class="payment-reminder-summary">
            <strong>${esc(preview.client_name || 'Клиент')}</strong>
            <span>${esc(preview.target_label || 'Пункт')} · ${esc(preview.title || '')} · ${money(preview.amount || 0)}</span>
          </div>
          <label><span>Текст напоминания</span><textarea name="text" rows="8" required>${esc(preview.text || '')}</textarea></label>
          <div class="toggle-grid">
            <label class="toggle-line"><input name="channels" type="checkbox" value="site" ${(preview.default_channels || []).includes('site') ? 'checked' : ''}><span>В кабинет на сайте</span></label>
            <label class="toggle-line"><input name="channels" type="checkbox" value="telegram" ${(preview.default_channels || []).includes('telegram') ? 'checked' : ''} ${telegramDisabled ? 'disabled' : ''}><span>В Telegram</span></label>
          </div>
          ${telegramDisabled ? '<p class="form-note is-warning">У клиента нет Telegram. Можно отправить только в кабинет на сайте.</p>' : ''}
          <p class="form-note" data-form-feedback data-feedback-style="note"></p>
          <div class="row"><button class="primary" data-save-content>Отправить</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
        </form>`;
        const form = host.querySelector('#paymentReminderSendForm');
        form.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
        form.addEventListener('submit', event => {
          event.preventDefault();
          const data = new FormData(form);
          const channels = data.getAll('channels').map(String).filter(Boolean);
          if(!channels.length){
            setFeedback(form.querySelector('[data-form-feedback]'), 'Выберите, куда отправить напоминание.', 'danger');
            return;
          }
          submitSimpleModal(form, form.querySelector('[data-form-feedback]'), '/api/admin/trebnik/action', {
            command:'payment.reminder.send',
            payload:{
              target_type:targetType,
              target_id:targetId,
              client_id:clientId || undefined,
              text:data.get('text'),
              channels,
              idempotency_key:newIdempotencyKey('admin:payment.reminder.send'),
            },
          }, 'Напоминание отправлено.', async () => {
            if(state.route === 'trebnik' && adminTrebnikPage() === 'payments') await refreshAdminFinance(true).catch(()=>{});
            else await loadDashboard(true).catch(()=>{});
            if(state.route === 'trebnik') paintAdminTrebnik();
          });
        });
      })
      .catch(error => {
        host.innerHTML = `<p class="form-note is-danger">${esc(error.message || 'Не удалось открыть напоминание.')}</p><div class="row"><button class="secondary" type="button" data-modal-close-local>Закрыть</button></div>`;
        host.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
      });
  }});
}
function paymentReminderSettingsPreview(settings={}){
  const parts = [];
  if(settings.debt_amount) parts.push(`Долг: ${money(settings.debt_amount)}`);
  if(settings.due_until) parts.push(`Срок: ${date(settings.due_until)}`);
  if(settings.next_send_date) parts.push(`Ближайшее: ${date(settings.next_send_date)}`);
  return parts.length ? parts.join(' · ') : 'Настройте автоматическую отправку в Telegram.';
}
function paymentReminderSettingsForm(settings={}){
  const enabled = Boolean(settings.is_enabled);
  const amountMode = settings.amount_mode || 'auto';
  const scheduleType = settings.schedule_type || 'interval';
  const intervalDays = Number(settings.interval_days || 7);
  return `<form class="form payment-reminder-settings" id="paymentReminderSettingsForm">
    <div class="payment-reminder-summary">
      <strong>${esc(settings.title || 'Запрос')}</strong>
      <span>${esc(paymentReminderSettingsPreview(settings))}</span>
    </div>
    <label class="toggle-line"><input name="is_enabled" type="checkbox" ${enabled ? 'checked' : ''}><span>Автоматически напоминать клиенту в Telegram</span></label>
    ${settings.client_notifications ? '' : `<p class="form-note is-warning">У клиента выключены напоминания об оплате. Настройка сохранится, но отправка не пойдёт, пока клиентские уведомления выключены.</p>`}
    <div class="form-grid two">
      <label><span>Сумма</span><select name="amount_mode">
        <option value="auto" ${amountMode === 'auto' ? 'selected' : ''}>Текущий долг</option>
        <option value="custom" ${amountMode === 'custom' ? 'selected' : ''}>Своя сумма</option>
      </select></label>
      <label data-reminder-custom-amount><span>Своя сумма</span><input name="amount" inputmode="decimal" value="${attr(settings.amount || '')}"></label>
      <label><span>Первая отправка</span><input name="start_date" type="date" value="${attr(inputDateValue(settings.start_date) || moscowDateValue())}"></label>
      <label><span>Повтор</span><select name="schedule_type">
        <option value="interval" ${scheduleType === 'interval' ? 'selected' : ''}>Через равные дни</option>
        <option value="monthly" ${scheduleType === 'monthly' ? 'selected' : ''}>По дням месяца</option>
      </select></label>
      <label data-reminder-interval><span>Каждые, дней</span><input name="interval_days" type="number" min="1" max="120" value="${attr(intervalDays)}"></label>
      <label data-reminder-month-days><span>Дни месяца</span><input name="month_days" placeholder="например: 5, 20" value="${attr(settings.month_days || '')}"></label>
    </div>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Сохранить</button><button class="secondary" type="button" data-reminder-send-now>Отправить сейчас</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`;
}
function syncPaymentReminderSettingsFields(form){
  const amountMode = form.elements.amount_mode?.value || 'auto';
  const scheduleType = form.elements.schedule_type?.value || 'interval';
  const customAmount = form.querySelector('[data-reminder-custom-amount]');
  const interval = form.querySelector('[data-reminder-interval]');
  const monthDays = form.querySelector('[data-reminder-month-days]');
  if(customAmount) customAmount.hidden = amountMode !== 'custom';
  if(interval) interval.hidden = scheduleType !== 'interval';
  if(monthDays) monthDays.hidden = scheduleType !== 'monthly';
}
async function paymentReminderSettingsModal(targetType='', targetId=''){
  if(targetType !== 'request' && targetType !== 'service') return say('Не найден пункт для автонапоминаний.', 'warning');
  openModal('Напоминания об оплате', `<div data-payment-reminder-settings>${loading('Открываю настройки…')}</div>`, {compact:true,onMount(root){
    const host = root.querySelector('[data-payment-reminder-settings]');
    api('/api/admin/trebnik/action', {method:'POST', body:{command:'payment.reminder.settings', payload:{target_type:targetType, target_id:targetId}}})
      .then(payload => {
        const settings = payload.result || {};
        host.innerHTML = paymentReminderSettingsForm(settings);
        const form = host.querySelector('#paymentReminderSettingsForm');
        form.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
        form.addEventListener('input', () => syncPaymentReminderSettingsFields(form));
        form.addEventListener('change', () => syncPaymentReminderSettingsFields(form));
        syncPaymentReminderSettingsFields(form);
        form.querySelector('[data-reminder-send-now]')?.addEventListener('click', () => paymentReminderSend(targetType, targetId, settings.client_id || ''));
        form.addEventListener('submit', event => {
          event.preventDefault();
          const data = new FormData(form);
          const body = {
            command:'payment.reminder.settings.save',
            payload:{
              target_type:targetType,
              target_id:targetId,
              is_enabled:Boolean(data.get('is_enabled')),
              amount_mode:data.get('amount_mode'),
              amount:data.get('amount'),
              start_date:data.get('start_date'),
              schedule_type:data.get('schedule_type'),
              interval_days:data.get('interval_days'),
              month_days:data.get('month_days'),
            },
          };
          submitSimpleModal(form, form.querySelector('[data-form-feedback]'), '/api/admin/trebnik/action', body, 'Настройки сохранены.', async () => {
            await refreshAdminFinance(true).catch(()=>{});
            if(state.route === 'trebnik') paintAdminTrebnik();
          });
        });
      })
      .catch(error => {
        host.innerHTML = `<p class="form-note is-danger">${esc(error.message || 'Не удалось открыть настройки.')}</p><div class="row"><button class="secondary" type="button" data-modal-close-local>Закрыть</button></div>`;
        host.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
      });
  }});
}
function paymentAdminModal(targetType='', targetId=''){
  const client = adminClientRequire();
  if(!client) return;
  const fixed = targetType && targetId;
  const options = adminTargetOptions(fixed ? `${targetType}:${targetId}` : '');
  if(!fixed && !options){ say('Сначала создайте запрос или услугу.', 'warning'); return; }
  openModal('Добавить платёж', `<form class="form" id="adminPaymentForm">
    ${fixed ? `<input type="hidden" name="target" value="${attr(`${targetType}:${targetId}`)}">` : `<label><span>К чему относится</span><select name="target" required>${options}</select></label>`}
    <div data-payment-work-target></div>
    <label><span>Сумма</span><input name="amount" inputmode="decimal" required></label>
    <label class="toggle-line"><input name="confirmed" type="checkbox" checked><span>Сразу подтвердить платёж</span></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Добавить</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const form = root.querySelector('#adminPaymentForm');
    syncAdminPaymentWorkField(form);
    form?.elements?.target?.addEventListener('change', () => syncAdminPaymentWorkField(form));
    form?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const [type, id] = String(data.get('target') || '').split(':');
      const command = type === 'service' ? 'payment.service.add' : 'payment.request.add';
      const key = type === 'service' ? 'service_id' : 'request_id';
      const payload = {[key]:id, amount:data.get('amount'), confirmed:Boolean(data.get('confirmed'))};
      if(type === 'request' && data.get('work_id')) payload.work_id = data.get('work_id');
      submitAdminTrebnikForm(form, command, payload, 'Платёж добавлен.');
    });
  }});
}
async function serviceAdminModal(mode='add', id=''){
  const isEdit = mode === 'edit';
  let row = isEdit ? adminClientServiceById(id) : {};
  if(isEdit && !row.id){
    try{
      const payload = await api(`/api/service/${encodeURIComponent(id)}`);
      row = payload.service || {};
    }catch(error){
      say(error.message || 'Услуга не найдена.', 'warning');
      return;
    }
    if(!row.id){
      say('Услуга не найдена.', 'warning');
      return;
    }
  }
  const client = adminClientRequire(isEdit ? (row.client_id || '') : '', {quiet:isEdit});
  if(!client && !isEdit) return;
  const graceDays = row.grace_days === undefined || row.grace_days === null ? (isEdit ? '' : 3) : row.grace_days;
  const paymentMode = row.payment_mode || (row.open_price_on_first_payment ? 'first_payment' : 'fixed');
  const modalKind = isEdit ? 'service-editor' : 'service-create';
  const canTelegram = Boolean(client?.telegram_id);
  openModal(isEdit ? 'Изменить услугу' : 'Новая услуга', `<form class="form trebnik-service-editor" id="adminServiceForm">
    <div class="form-grid two">
      <label><span>Название услуги</span><input name="title" value="${attr(row.title || '')}" required></label>
      <label><span>Стоимость</span><input name="price" inputmode="decimal" value="${attr(row.price || '')}"></label>
    </div>
    <div class="form-grid three">
      <label><span>Статус</span><select name="status"><option value="active" ${row.status === 'active' ? 'selected' : ''}>активна</option><option value="paused" ${row.status === 'paused' ? 'selected' : ''}>пауза</option><option value="closed" ${row.status === 'closed' ? 'selected' : ''}>закрыта</option></select></label>
      <label><span>Тип услуги</span><select name="service_kind"><option value="one_time" ${row.service_kind === 'one_time' ? 'selected' : ''}>разовая</option><option value="periodic" ${row.service_kind === 'periodic' ? 'selected' : ''}>периодическая</option></select></label>
      <label><span>Оплата</span><select name="payment_mode"><option value="fixed" ${paymentMode !== 'first_payment' ? 'selected' : ''}>по указанной цене</option><option value="first_payment" ${paymentMode === 'first_payment' ? 'selected' : ''}>по первой оплате</option></select></label>
    </div>
    <div class="form-grid three" data-service-periodic-field>
      <label><span>Период, дней</span><input name="period_days" type="number" min="1" value="${attr(row.period_days || '')}"></label>
      <label><span>Активна до</span><input name="active_until" type="date" value="${attr(inputDateValue(row.active_until))}"></label>
      <label><span>Льготных дней</span><input name="grace_days" type="number" min="0" value="${attr(graceDays)}"></label>
    </div>
    <div class="form-grid three" data-service-periodic-field>
      <label><span>Отсрочка оплаты до</span><input name="payment_postponed_until" type="date" value="${attr(inputDateValue(row.payment_postponed_until))}"></label>
    </div>
    <div class="form-grid two trebnik-service-stop-row" data-service-periodic-field>
      ${isEdit ? `<label><span>Остановить с даты</span><input name="stop_from_date" type="date" value="${attr(inputDateValue(row.stopped_at))}"></label>` : '<span></span>'}
      <label class="toggle-line"><input name="stop_after_current" type="checkbox" ${row.stop_after_current ? 'checked' : ''}><span>Не продлевать после текущего срока</span></label>
    </div>
    ${isEdit ? '' : `<div class="trebnik-service-notice" data-service-notice>
      <label class="toggle-line"><input name="notify_client" type="checkbox"><span>Сообщить клиенту о новой услуге</span></label>
      <div class="trebnik-service-notice__options" data-service-notice-options hidden>
        <div class="row trebnik-service-notice__channels">
          <label class="toggle-line"><input name="notify_site" type="checkbox" checked><span>На сайте</span></label>
          <label class="toggle-line"><input name="notify_telegram" type="checkbox" ${canTelegram ? 'checked' : 'disabled'}><span>Telegram</span></label>
        </div>
        <label><span>Текст уведомления</span><textarea name="notification_text" rows="3">Добавлена услуга.</textarea></label>
      </div>
    </div>`}
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row trebnik-service-editor__actions"><button class="primary" data-save-content>${isEdit ? 'Сохранить' : 'Создать'}</button>${isEdit ? `<button class="plain danger" type="button" data-action="service-delete" data-id="${attr(row.id)}">Удалить</button>` : ''}<button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {kind:modalKind,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const formRoot = root.querySelector('#adminServiceForm');
    const syncPaymentMode = () => {
      const isOpenPrice = formRoot?.elements?.payment_mode?.value === 'first_payment';
      const priceInput = formRoot?.elements?.price;
      if(!priceInput) return;
      priceInput.disabled = isOpenPrice;
      priceInput.placeholder = isOpenPrice ? 'будет по первой оплате' : '';
      if(isOpenPrice) priceInput.value = '';
    };
    const syncPeriodicFields = () => {
      const isPeriodic = formRoot?.elements?.service_kind?.value === 'periodic';
      formRoot?.querySelectorAll('[data-service-periodic-field]').forEach(field => { field.hidden = !isPeriodic; });
      if(!isPeriodic){
        if(formRoot?.elements?.period_days) formRoot.elements.period_days.value = '';
        if(formRoot?.elements?.grace_days) formRoot.elements.grace_days.value = '0';
        if(formRoot?.elements?.payment_postponed_until) formRoot.elements.payment_postponed_until.value = '';
        if(formRoot?.elements?.stop_after_current) formRoot.elements.stop_after_current.checked = false;
        if(formRoot?.elements?.stop_from_date) formRoot.elements.stop_from_date.value = '';
      }else if(formRoot?.elements?.grace_days && formRoot.elements.grace_days.value === ''){
        formRoot.elements.grace_days.value = '3';
      }
    };
    const defaultNoticeText = () => {
      const title = String(formRoot?.elements?.title?.value || '').trim();
      return title ? `Добавлена услуга: ${title}.` : 'Добавлена услуга.';
    };
    const syncNotice = () => {
      const checked = Boolean(formRoot?.elements?.notify_client?.checked);
      const options = formRoot?.querySelector('[data-service-notice-options]');
      if(options) options.hidden = !checked;
      const textarea = formRoot?.elements?.notification_text;
      if(textarea && !textarea.dataset.touched) textarea.value = defaultNoticeText();
    };
    formRoot?.elements?.service_kind?.addEventListener('change', syncPeriodicFields);
    formRoot?.elements?.payment_mode?.addEventListener('change', syncPaymentMode);
    formRoot?.elements?.notify_client?.addEventListener('change', syncNotice);
    formRoot?.elements?.title?.addEventListener('input', syncNotice);
    formRoot?.elements?.notification_text?.addEventListener('input', event => { event.currentTarget.dataset.touched = '1'; });
    syncPeriodicFields();
    syncPaymentMode();
    syncNotice();
    formRoot?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const isPeriodic = data.get('service_kind') === 'periodic';
      const stopFromDate = isPeriodic && isEdit ? (data.get('stop_from_date') || '') : '';
      const paymentMode = data.get('payment_mode') === 'first_payment' ? 'first_payment' : 'fixed';
      const payload = {title:data.get('title'), price:paymentMode === 'first_payment' ? 0 : (data.get('price') || 0), payment_mode:paymentMode, status:data.get('status'), service_kind:data.get('service_kind'), period_days:isPeriodic ? (data.get('period_days') || '') : '', grace_days:isPeriodic ? (data.get('grace_days') || 0) : 0, active_until:isPeriodic ? (data.get('active_until') || '') : '', payment_postponed_until:isPeriodic ? (data.get('payment_postponed_until') || '') : '', stop_after_current:isPeriodic && (Boolean(data.get('stop_after_current')) || Boolean(stopFromDate))};
      if(isEdit){
        payload.service_id = row.id;
        payload.stop_from_date = stopFromDate;
      }else{
        payload.client_id = client.id;
        payload.notify_client = Boolean(data.get('notify_client'));
        payload.notification_channels = [data.get('notify_site') ? 'site' : '', data.get('notify_telegram') ? 'telegram' : ''].filter(Boolean);
        payload.notification_text = data.get('notification_text') || defaultNoticeText();
      }
      submitAdminTrebnikForm(form, isEdit ? 'service.update' : 'service.add', payload, isEdit ? 'Услуга обновлена.' : 'Услуга создана.');
    });
  }});
}
function adminServiceDelete(id=''){
  if(!id) return;
  const row = adminClientServiceById(id);
  if(!window.confirm(`Удалить услугу «${row.title || 'Услуга'}»?`)) return;
  runAdminTrebnikAction('service.delete', {service_id:id}, 'Услуга удалена.');
}

async function updateInquiryStatus(id, status='processing'){
  try{
    await api('/api/admin/inquiry/update-status', {method:'POST', body:{id, status}});
    say(status === 'closed' ? 'Заявка закрыта.' : 'Статус заявки обновлен.', 'success');
    await loadAdminWorkbench(true);
    state.route === 'trebnik' ? renderTrebnik() : paintAdmin();
  }catch(error){ say(error.message || 'Не удалось обновить заявку.', 'danger'); }
}

async function refreshCommunityAdmin(){
  try{
    await loadAdminCommunity(true);
    if(state.route === 'admin') paintAdminEditor();
    else render();
    say('Данные сообщества обновлены.', 'success');
  }catch(error){ say(error.message || 'Не удалось обновить пользователей.', 'danger'); }
}
async function refreshAdminTraffic(){
  try{
    await loadAdminTraffic(true);
    syncHeaderControls();
  }catch(error){ say(error.message || 'Не удалось обновить счетчик.', 'danger'); }
}
async function resetAdminTrafficToday(){
  if(!window.confirm('Сбросить сегодняшнюю посещаемость? История за прошлые дни останется.')) return;
  try{
    const payload = await api('/api/admin/traffic/reset', {method:'POST', body:{mode:'today'}});
    state.adminTraffic = payload.traffic || null;
    syncHeaderControls();
    say('Сегодняшняя посещаемость сброшена.', 'success');
  }catch(error){ say(error.message || 'Не удалось сбросить счетчик.', 'danger'); }
}

async function selectAdminProfile(id=''){
  const profileId = String(id || '');
  if(!profileId) return;
  state.adminProfileId = profileId;
  state.adminProfileDetail = null;
  state.adminProfileDetailId = '';
  if(state.route === 'admin' && state.adminEditorPage === 'profiles') paintAdminEditor();
  try{
    await loadAdminProfileDetail(profileId, true);
    if(state.route === 'admin' && state.adminEditorPage === 'profiles') paintAdminEditor();
  }catch(error){
    say(error.message || 'Не удалось открыть профиль.', 'danger');
  }
}
async function refreshAdminProfiles(){
  try{
    await loadAdminProfiles(true);
    if(state.adminProfileId) await loadAdminProfileDetail(state.adminProfileId, true).catch(() => {});
    if(state.route === 'admin' && state.adminEditorPage === 'profiles') paintAdminEditor();
    say('Профили обновлены.', 'success');
  }catch(error){ say(error.message || 'Не удалось обновить профили.', 'danger'); }
}
async function deleteAdminProfile(id=''){
  const profileId = String(id || state.adminProfileId || '');
  if(!profileId) return;
  const profile = state.adminProfileDetail?.profile || (state.adminProfiles?.profiles || []).find(item => String(item.id) === profileId) || {};
  if(!window.confirm(`Удалить профиль «${adminProfileName(profile)}»? Комментарии останутся в истории.`)) return;
  try{
    const payload = await api('/api/admin/profiles/delete', {method:'POST', body:{id:profileId}});
    state.adminProfiles = {profiles:payload.profiles || [], summary:payload.summary || {}};
    state.adminProfileId = state.adminProfiles.profiles[0] ? String(state.adminProfiles.profiles[0].id || '') : '';
    state.adminProfileDetail = null;
    state.adminProfileDetailId = '';
    if(state.adminProfileId) await loadAdminProfileDetail(state.adminProfileId, true).catch(() => {});
    if(state.route === 'admin' && state.adminEditorPage === 'profiles') paintAdminEditor();
    say('Профиль удалён.', 'success');
  }catch(error){ say(error.message || 'Не удалось удалить профиль.', 'danger'); }
}
async function moderateAdminProfileComment(id, status='published', userId=''){
  try{
    await api('/api/admin/community/comment', {method:'POST', body:{id, status}});
    if(userId || state.adminProfileId){
      await loadAdminProfileDetail(userId || state.adminProfileId, true).catch(() => {});
    }
    await loadAdminProfiles(true).catch(() => {});
    if(state.route === 'admin' && state.adminEditorPage === 'profiles') paintAdminEditor();
    const messages = {published:'Комментарий опубликован.', hidden:'Комментарий скрыт.', rejected:'Комментарий удалён.'};
    say(messages[status] || 'Комментарий обработан.', 'success');
  }catch(error){ say(error.message || 'Не удалось обработать комментарий.', 'danger'); }
}

async function moderateComment(id, status='published'){
  try{
    await api('/api/admin/community/comment', {method:'POST', body:{id, status}});
    await loadAdminCommunity(true);
    if(state.route === 'admin') paintAdminEditor();
    else render();
    const messages = {published:'Комментарий опубликован.', hidden:'Комментарий скрыт.', rejected:'Комментарий удалён.'};
    say(messages[status] || 'Комментарий обработан.', 'success');
  }catch(error){ say(error.message || 'Не удалось обработать комментарий.', 'danger'); }
}

function questionModerationRows(){
  const publicRows = Array.isArray(state.publicQuestions) ? state.publicQuestions : [];
  const pendingRows = Array.isArray(state.dashboard?.community?.pending_questions) ? state.dashboard.community.pending_questions : [];
  return [...publicRows, ...pendingRows];
}
function adminQuestionTopicFieldHtml(item={}){
  const section = state.content?.sections?.questions || {};
  if(section?.topics_enabled !== true) return '';
  const topics = sectionTopicList(section, {includeDisabled:true});
  if(!topics.length) return '';
  const selected = cleanText(item.category || item.topic_slug || '');
  const known = topics.some(topic => topic.slug === selected);
  const currentOption = selected && !known
    ? `<option value="${attr(selected)}" selected>Текущая: ${esc(selected)}</option>`
    : '';
  return `<label class="admin-question-topic"><span>Тема</span><select name="category">
    <option value="" ${selected ? '' : 'selected'}>Без темы</option>
    ${topics.map(topic => `<option value="${attr(topic.slug)}" ${selected === topic.slug ? 'selected' : ''}>${esc(topic.title)}${topic.enabled ? '' : ' (выключена)'}</option>`).join('')}
    ${currentOption}
  </select></label>`;
}
function answerQuestionModal(id){
  const row = questionModerationRows().find(item => String(item.id) === String(id)) || {};
  const currentQuestion = row.question || '';
  const currentAnswer = row.answer || '';
  const publishAnonymously = Boolean(row.publish_anonymously);
  const status = cleanText(row.status || 'pending');
  const statusChecked = value => status === value ? 'checked' : '';
  openModal('Править вопрос', `<form class="form question-answer-form admin-question-form" id="questionAnswerForm">
    <label><span>Вопрос</span><textarea name="question" rows="1" required>${esc(currentQuestion)}</textarea></label>
    <label><span>Ответ</span><textarea name="answer" rows="1">${esc(currentAnswer)}</textarea></label>
    ${adminQuestionTopicFieldHtml(row)}
    <div class="admin-question-options">
      <label class="toggle-line question-anonymous-toggle"><input type="checkbox" name="publish_anonymously" value="1" ${publishAnonymously ? 'checked' : ''}><span>Анонимно</span></label>
      <label class="toggle-line"><input type="radio" name="status" value="hidden" ${statusChecked('hidden')}><span>Скрыто</span></label>
      <label class="toggle-line"><input type="radio" name="status" value="published" ${statusChecked('published')}><span>Открыто</span></label>
    </div>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="secondary" type="button" data-modal-close-local>Отмена</button><button class="primary" data-save-content>Сохранить</button></div>
  </form>`, {compact:true,kind:'admin-question',onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const question = root.querySelector('[name="question"]');
    const answer = root.querySelector('[name="answer"]');
    const autoGrow = textarea => {
      if(!(textarea instanceof HTMLTextAreaElement)) return;
      textarea.style.height = 'auto';
      const maxHeight = Number.parseFloat(getComputedStyle(textarea).maxHeight) || 150;
      const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${Math.ceil(nextHeight)}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    };
    root.querySelectorAll('#questionAnswerForm textarea').forEach(textarea => {
      textarea.addEventListener('input', () => {
        autoGrow(textarea);
      });
      autoGrow(textarea);
    });
    root.querySelector('#questionAnswerForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const nextStatus = data.get('status') || status || 'hidden';
      const messages = {pending:'Вопрос сохранён.', hidden:'Вопрос сохранён скрыто.', published:'Вопрос открыт на сайте.'};
      submitSimpleModal(form, form.querySelector('[data-form-feedback]'), '/api/admin/community/question', {
        id,
        question:data.get('question'),
        answer:data.get('answer'),
        publish_anonymously:Boolean(data.get('publish_anonymously')),
        status:nextStatus,
        ...(data.has('category') ? {category:data.get('category')} : {}),
      }, messages[nextStatus] || 'Вопрос сохранён.', async () => {
        await loadAdminCommunity(true).catch(() => {});
        if(state.route === 'questions' && state.slug) await renderQuestionDetail(state.slug);
        else if(state.route === 'questions') await loadPublicQuestions();
        else if(state.route === 'admin') paintAdminEditor();
        else render();
      });
    });
    question?.focus();
  }});
}

function adminQuestionModal(){
  if(!isAdmin()) return;
  openModal('Добавить вопрос', `<form class="form question-answer-form admin-question-form" id="adminQuestionForm">
    <label><span>Вопрос</span><textarea name="question" rows="1" required></textarea></label>
    <label><span>Ответ</span><textarea name="answer" rows="1"></textarea></label>
    ${adminQuestionTopicFieldHtml()}
    <div class="admin-question-options">
      <label class="toggle-line question-anonymous-toggle"><input type="checkbox" name="publish_anonymously" value="1" checked><span>Анонимно</span></label>
      <label class="toggle-line"><input type="radio" name="status" value="hidden" checked><span>Скрыто</span></label>
      <label class="toggle-line"><input type="radio" name="status" value="published"><span>Открыто</span></label>
    </div>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="secondary" type="button" data-modal-close-local>Отмена</button><button class="primary" data-save-content>Сохранить</button></div>
  </form>`, {compact:true,kind:'admin-question',onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const question = root.querySelector('[name="question"]');
    const autoGrow = textarea => {
      if(!(textarea instanceof HTMLTextAreaElement)) return;
      textarea.style.height = 'auto';
      const maxHeight = Number.parseFloat(getComputedStyle(textarea).maxHeight) || 150;
      const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${Math.ceil(nextHeight)}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    };
    root.querySelectorAll('#adminQuestionForm textarea').forEach(textarea => {
      textarea.addEventListener('input', () => autoGrow(textarea));
      autoGrow(textarea);
    });
    root.querySelector('#adminQuestionForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      submitSimpleModal(form, form.querySelector('[data-form-feedback]'), '/api/admin/community/question/create', {
        question:data.get('question'),
        answer:data.get('answer'),
        publish_anonymously:Boolean(data.get('publish_anonymously')),
        status:data.get('status') || 'hidden',
        ...(data.has('category') ? {category:data.get('category')} : {}),
      }, data.get('status') === 'published' ? 'Вопрос открыт на сайте.' : 'Вопрос сохранён скрыто.', async () => {
        await loadAdminCommunity(true).catch(() => {});
        if(state.route === 'questions') await loadPublicQuestions();
        else if(state.route === 'admin') paintAdminEditor();
        else render();
      });
    });
    question?.focus();
  }});
}

async function deleteCommunityQuestion(id){
  if(!id || !isAdmin()) return;
  if(!window.confirm('Удалить этот вопрос?')) return;
  try{
    await api('/api/admin/community/question', {method:'POST', body:{id, status:'rejected', answer:''}});
    await loadAdminCommunity(true).catch(() => {});
    if(state.route === 'questions') await loadPublicQuestions();
    else if(state.route === 'admin') paintAdminEditor();
    else render();
    say('Вопрос удалён.', 'success');
  }catch(error){
    say(error.message || 'Не удалось удалить вопрос.', 'danger');
  }
}

async function updateCommunityUser(id, patch){
  try{
    await api('/api/admin/community/user', {method:'POST', body:{id, ...patch}});
    await loadAdminCommunity(true);
    if(state.route === 'admin') paintAdminEditor();
    else render();
    say('Пользователь обновлен.', 'success');
  }catch(error){ say(error.message || 'Не удалось обновить пользователя.', 'danger'); }
}

function smtpTestModal(){
  openModal('Тест почты', `<form class="form" id="smtpTestForm">
    <label><span>Куда отправить тест</span><input name="email" type="email" required></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Отправить</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    root.querySelector('#smtpTestForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      submitSimpleModal(form, form.querySelector('[data-form-feedback]'), '/api/admin/community/smtp-test', {email:data.get('email')}, 'Тестовое письмо отправлено.', async () => {});
    });
  }});
}

async function paymentReview(targetType, paymentId, decision='confirmed'){
  const financeBefore = state.adminFinance ? JSON.parse(JSON.stringify(state.adminFinance)) : null;
  try{
    const payload = await api(`/api/admin/payment/${decision === 'rejected' ? 'reject' : 'confirm'}`, {method:'POST', body:{target_type:targetType, payment_id:paymentId, idempotency_key:newIdempotencyKey(`payment:${decision}`)}});
    say(payload.warning || 'Решение по платежу записано.', 'success');
    if(state.route === 'trebnik' && adminTrebnikPage() === 'payments') await refreshAdminFinance(true);
    await loadAdminWorkbench(true).catch(()=>{});
    if(state.route === 'trebnik' && adminTrebnikPage() === 'clients' && state.clientId) await loadAdminClientOverview(state.clientId, true).catch(()=>{});
    if(state.route === 'trebnik') renderTrebnik();
    else if(state.route === 'admin') paintAdmin();
  }catch(error){
    if(financeBefore){
      state.adminFinance = financeBefore;
      if(state.route === 'trebnik' && adminTrebnikPage() === 'payments') paintAdminTrebnik();
    }
    say(error.message || 'Не удалось записать решение.', 'danger');
  }
}

async function serviceAction(serviceId, mode=''){
  const labels = {postpone:'Оплата отложена.', stop:'Услуга не будет продлеваться после срока.', resume:'Услуга снова будет продлеваться.'};
  try{
    const payload = await api('/api/service/action', {method:'POST', body:{service_id:serviceId, action:mode, idempotency_key:newIdempotencyKey(`service:${mode}`)}});
    say(payload.warning || labels[mode] || 'Услуга обновлена.', payload.warning ? 'warning' : 'success');
    closeModal(true);
    if(isAdmin()) await afterAdminServiceMutation();
    else if(isTrebnikClient()) renderTrebnik();
  }catch(error){ say(error.message || 'Не удалось обновить услугу.', 'danger'); }
}

async function serviceMoreTimeReview(requestId, decision='approved', approvedUntil=''){
  try{
    const path = `/api/admin/service/more-time/${decision === 'rejected' ? 'reject' : 'approve'}`;
    const payload = await api(path, {method:'POST', body:{request_id:requestId, approved_until:approvedUntil, idempotency_key:newIdempotencyKey(`more-time:${decision}`)}});
    say(payload.warning || (decision === 'rejected' ? 'Новый срок отклонён.' : 'Новый срок одобрен.'), payload.warning ? 'warning' : 'success');
    closeModal(true);
    await afterAdminServiceMutation();
  }catch(error){ say(error.message || 'Не удалось обработать новый срок.', 'danger'); }
}

function serviceMoreTimeCustomModal(requestId='', requestedUntil=''){
  openModal('Свой срок', `<form class="form" id="moreTimeCustomForm">
    <label><span>Одобрить до</span><input name="approved_until" type="date" value="${attr(requestedUntil || '')}" required></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Одобрить</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    root.querySelector('#moreTimeCustomForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      serviceMoreTimeReview(requestId, 'approved', data.get('approved_until'));
    });
  }});
}

function updateAttachmentsHtml(update={}){
  const items = Array.isArray(update.attachments) ? update.attachments.filter(item => item && item.url) : [];
  if(!items.length) return '';
  return `<section class="trebnik-update-attachments"><h3>Фото</h3><div class="trebnik-update-attachments__grid">${items.map((item, index) => `<button class="trebnik-update-attachment" type="button" data-action="image-lightbox" data-image-url="${attr(item.url)}" data-image-alt="${attr(`Вложение ${index + 1}`)}"><img src="${attr(item.url)}" alt="${attr(`Вложение ${index + 1}`)}" loading="lazy" decoding="async"></button>`).join('')}</div></section>`;
}

async function detailUpdate(id){
  openModal('Апдейт', loading('Открываю апдейт…'), {wide:true,kind:'trebnik-update-detail'});
  try{
    const payload = await api(`/api/admin/update/${id}`);
    const u = payload.update || {};
    const targetType = u.request_id ? 'request' : (u.service_id ? 'service' : '');
    const targetId = u.request_id || u.service_id || '';
    const targetButton = targetType ? `<button class="secondary" data-action="${targetType === 'request' ? 'request-detail' : 'service-detail'}" data-id="${attr(targetId)}">Открыть ${targetType === 'request' ? 'запрос' : 'услугу'}</button>` : '';
    const canMarkRead = canShowUpdateReadAction(u);
    openModal(isClientQuestionKind(u.kind) ? 'Вопрос' : 'Апдейт', `<div class="detail trebnik-detail-modal trebnik-update-detail">
      <p class="subtle">${esc(u.client_name || 'Клиент')} · ${esc(updateTargetLabel(u))} · ${time(u.created_at)}</p>
      <div class="form-feedback">${esc(u.text || 'Текст не указан.')}</div>
      ${updateAttachmentsHtml(u)}
      <div class="row">
        ${u.read_at ? `<span class="admin-trebnik__status is-live">прочитано</span>` : ''}
        ${canMarkRead ? `<button class="primary" data-action="update-read" data-id="${attr(u.id)}">Прочитано</button>` : ''}
        ${targetButton}
      </div>
    </div>`, {wide:true,kind:'trebnik-update-detail'});
  }catch(error){ openModal('Апдейт', problem(error.message), {wide:true,kind:'trebnik-update-detail'}); }
}

async function markUpdateRead(id){
  try{
    const payload = await api('/api/admin/update/read', {method:'POST', body:{update_id:id}});
    say(payload.warning || 'Апдейт отмечен как прочитанный.', payload.warning ? 'warning' : 'success');
    closeModal(true);
    await loadDashboard(true).catch(()=>{});
    if(state.route === 'trebnik' && adminTrebnikPage() === 'clients' && state.clientId) await loadAdminClientOverview(state.clientId, true).catch(()=>{});
    if(state.route === 'trebnik') renderTrebnik();
    else if(state.route === 'admin') paintAdmin();
  }catch(error){ say(error.message || 'Не удалось отметить апдейт.', 'danger'); }
}
async function markAllUpdatesRead(){
  try{
    const payload = await api('/api/admin/update/read-all', {method:'POST', body:{}});
    say(payload.warning || `Прочитано: ${payload.read_count || 0}.`, payload.warning ? 'warning' : 'success');
    closeModal(true);
    await loadDashboard(true).catch(()=>{});
    if(state.route === 'trebnik') paintAdminTrebnik();
    else if(state.route === 'admin') paintAdmin();
  }catch(error){ say(error.message || 'Не удалось отметить апдейты.', 'danger'); }
}

async function detailWork(id){
  openModal('Работа', loading('Открываю работу…'), {compact:true});
  try{
    const payload = await api(`/api/work/${id}`);
    const w = payload.work || {};
    const logs = payload.logs || [];
    const facts = [
      workTypeName(w.type),
      w.next_due ? dateLong(w.next_due) : '',
      w.period_days ? `каждые ${w.period_days} дн.` : '',
      statusName(w.status || 'planned'),
    ].filter(Boolean);
    const logsHtml = logs.map(row => `<div class="trebnik-work-log-row"><strong>${date(row.log_date)}</strong>${row.comment ? `<span>${esc(row.comment || '')}</span>` : ''}</div>`).join('');
    openModal(w.title || 'Работа', `<div class="detail trebnik-work-detail">
      <div class="trebnik-work-detail__top">
        <div>
          <p class="subtle">${esc(w.client_name || 'Клиент')} · ${esc(w.request_title || 'Запрос')}</p>
          ${w.goal ? `<p>${esc(w.goal || '')}</p>` : ''}
        </div>
        <div class="trebnik-work-detail__actions">
          <button class="primary" data-action="work-log" data-id="${attr(w.id)}" data-log-date="${attr(inputDateValue(w.next_due))}">Отметить</button>
          <button class="secondary" data-action="request-detail" data-id="${attr(w.request_id)}">Запрос</button>
        </div>
      </div>
      <div class="trebnik-work-facts">${facts.map(item => `<span>${esc(item)}</span>`).join('')}</div>
      <section class="trebnik-work-logs"><h3>Проведения</h3>${logsHtml || empty('Проведений пока нет.')}</section>
    </div>`, {compact:true});
  }catch(error){ openModal('Работа', problem(error.message), {compact:true}); }
}

function workTypeName(type=''){
  const map = {once:'Разовая', multi:'Многодневная', periodic:'Периодическая'};
  return map[type] || type || 'Работа';
}

async function workLogModal(id='', dueDate=''){
  openModal('Отметить выполнение', loading('Открываю работу…'), {compact:true});
  try{
    const payload = await api(`/api/work/${id}`);
    const work = payload.work || {};
    const logs = payload.logs || [];
    const logDates = workOverdueLogDates(work, dueDate, logs);
    const firstDate = logDates[0] || inputDateValue(work.next_due || dueDate, new Date());
    const dates = logDates.length ? logDates : [firstDate];
    openModal('Отметить выполнение', `<form class="form work-log-form" id="workLogForm">
      ${workLogScheduleBox(work, logDates, logs)}
      ${workLogDateChoices(dates)}
      ${adminNotifyClientLine(false)}
      <p class="form-note" data-form-feedback data-feedback-style="note"></p>
      <div class="row"><button class="primary" data-save-content>Отметить выполнено</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
    </form>`, {compact:true,kind:'work-log',onMount(root){
      root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
      root.querySelector('#workLogForm')?.addEventListener('submit', event => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const pickedDates = Array.from(form.querySelectorAll('input[name="log_dates"]:checked,input[name="log_dates"][type="hidden"]')).map(input => input.value).filter(Boolean);
        if(!pickedDates.length){
          setFeedback(form.querySelector('[data-form-feedback]'), 'Выберите хотя бы одну дату.', 'danger');
          return;
        }
        const path = pickedDates.length > 1 ? '/api/admin/work/log-bulk' : '/api/admin/work/log';
        const body = pickedDates.length > 1
          ? {work_id:id, log_dates:pickedDates, notify_client:Boolean(data.get('notify_client'))}
          : {work_id:id, log_date:pickedDates[0], notify_client:Boolean(data.get('notify_client'))};
        const successText = pickedDates.length > 1 ? `Отмечено дат: ${pickedDates.length}.` : 'Выполнение записано.';
        submitSimpleModal(form, form.querySelector('[data-form-feedback]'), path, body, successText, async () => {
          await loadAdminWorkbench(true).catch(()=>{});
          if(state.route === 'trebnik' && adminTrebnikPage() === 'clients' && state.clientId) await loadAdminClientOverview(state.clientId, true).catch(()=>{});
          if(state.route === 'trebnik') renderTrebnik();
          else if(state.route === 'admin') paintAdmin();
        });
      });
    }});
  }catch(error){
    openModal('Отметить выполнение', problem(error.message), {compact:true});
  }
}
function loggedWorkDates(logs=[]){
  return new Set((Array.isArray(logs) ? logs : []).map(row => inputDateValue(row?.log_date)).filter(Boolean));
}
function collectDailyDates(startValue, endValue, logs=[]){
  const start = inputDateValue(startValue);
  if(!start) return [];
  const today = localDateValue();
  let end = inputDateValue(endValue) || today;
  if(today && start > today) end = start;
  else if(today && end > today) end = today;
  if(end < start) end = start;
  const logged = loggedWorkDates(logs);
  const dates = [];
  let current = start;
  while(current && current <= end && dates.length < 62){
    if(!logged.has(current)) dates.push(current);
    current = addIsoDays(current, 1);
  }
  return dates;
}
function workOverdueLogDates(work={}, fallbackDate='', logs=[]){
  const type = work.type || '';
  const totalDays = Number(work.total_days || 0);
  if(type === 'multi'){
    const start = inputDateValue(work.expected_first_result || work.next_due || fallbackDate);
    const end = inputDateValue(work.expected_final_result) || (start && totalDays > 0 ? addIsoDays(start, totalDays - 1) : fallbackDate);
    const dates = collectDailyDates(start, end, logs);
    return dates.length ? dates : (start ? [start] : []);
  }
  const start = inputDateValue(type === 'periodic' ? (work.next_due || fallbackDate) : (fallbackDate || work.log_default_date || work.next_due || work.expected_first_result));
  if(!start) return [];
  const today = localDateValue();
  const period = Number(work.period_days || 0);
  if(type !== 'periodic' || period <= 0) return [start];
  const logged = loggedWorkDates(logs);
  const dates = [];
  let current = start;
  while(current && current <= today && dates.length < 31){
    if(!logged.has(current)) dates.push(current);
    current = addIsoDays(current, period);
  }
  return dates.length ? dates : [start];
}
function workLogDateChoices(dates=[]){
  const cleanDates = dates.filter(Boolean);
  if(cleanDates.length <= 1){
    const picked = cleanDates[0] || localDateValue();
    return `<div class="work-log-date-card"><span>Дата проведения</span><strong>${dateLong(picked)}</strong><input type="hidden" name="log_dates" value="${attr(picked)}"></div>`;
  }
  return `<div class="work-log-date-list">
    <h3>Даты проведения</h3>
    ${cleanDates.map(value => `<label class="toggle-line"><input type="checkbox" name="log_dates" value="${attr(value)}" checked><span>${dateLong(value)}</span></label>`).join('')}
  </div>`;
}
function workTermRange(work={}){
  let start = inputDateValue(work.expected_first_result);
  let end = inputDateValue(work.expected_final_result);
  const period = Number(work.period_days || 0);
  const times = Number(work.period_times || 0);
  const totalDays = Number(work.total_days || 0);
  if(!start) start = inputDateValue(work.next_due);
  if(!end && start && work.type === 'periodic' && period > 0 && times > 0) end = addIsoDays(start, period * (times - 1));
  if(!end && start && work.type === 'multi' && totalDays > 0) end = addIsoDays(start, totalDays - 1);
  if(!end && start && work.type === 'once') end = start;
  return dateRangeLong(start, end);
}
function workLogScheduleBox(work={}, logDates=[], logs=[]){
  const type = workTypeName(work.type || '');
  const period = Number(work.period_days || 0);
  const totalDays = Number(work.total_days || 0);
  const doneCount = loggedWorkDates(logs).size;
  const nextAfter = work.type === 'periodic' && period > 0 && logDates.length ? addIsoDays(logDates[logDates.length - 1], period) : '';
  const title = `${esc(work.client_name || 'Клиент')} · ${esc(work.title || work.request_title || 'Работа')}`;
  const terms = workTermRange(work);
  const dateCountText = `${logDates.length} ${ruPlural(logDates.length, 'дата', 'даты', 'дат')}`;
  const totalDaysText = totalDays ? `${totalDays} ${ruPlural(totalDays, 'день', 'дня', 'дней')}` : '';
  const facts = [
    ['Тип', type],
    terms ? ['Сроки', terms] : null,
    period > 0 ? ['Повтор', `каждые ${period} дн.`] : null,
    work.type === 'multi' && totalDaysText ? ['Всего', totalDaysText] : null,
    work.type === 'periodic' && work.period_times ? ['Всего', `${work.period_times}`] : null,
    work.type === 'multi' && doneCount ? ['Уже отмечено', `${doneCount} ${ruPlural(doneCount, 'дата', 'даты', 'дат')}`] : null,
    logDates.length > 1 ? ['К отметке', dateCountText] : (logDates[0] ? [work.type === 'multi' ? 'К отметке' : 'Плановая дата', dateLong(logDates[0])] : null),
    nextAfter ? ['Следующая дата', dateLong(nextAfter)] : null,
  ].filter(Boolean);
  return `<div class="work-log-summary"><strong>${title}</strong><div class="work-log-facts">${facts.map(([label,value]) => `<span><em>${esc(label)}</em><b>${esc(value)}</b></span>`).join('')}</div></div>`;
}

