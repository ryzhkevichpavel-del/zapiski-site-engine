function inquiryModal(title='', route=''){
  openModal('Заявка', `<form class="form" id="inquiryForm"><p class="subtle">Укажите контакт для ответа.</p><input type="hidden" name="material_title" value="${attr(title)}"><input type="hidden" name="route" value="${attr(route)}"><label><span>Имя</span><input name="name" autocomplete="name" required></label><label><span>Контакт</span><input name="contact" inputmode="text" autocomplete="email" placeholder="Telegram, почта или другой способ связи" required></label><label><span>Сообщение</span><textarea name="message" rows="5" required>${title ? `Интересует: ${title}\n` : ''}</textarea></label><label class="toggle-line"><input name="accepted_personal_data" type="checkbox"><span>Я согласен на обработку данных из заявки для ответа на заявку.</span></label><p class="form-note" data-form-feedback data-feedback-style="note"></p><div class="row"><button class="primary" data-save-content disabled>Отправить</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div></form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const form = root.querySelector('#inquiryForm');
    const consent = form?.querySelector('[name="accepted_personal_data"]');
    const submitButton = form?.querySelector('[data-save-content]');
    const syncSubmit = () => {
      if(!submitButton || !consent) return;
      submitButton.disabled = form?.dataset.saving === '1' || !consent.checked;
    };
    consent?.addEventListener('change', syncSubmit);
    syncSubmit();
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(!Boolean(data.get('accepted_personal_data'))){
        setFeedback(feedback, 'Чтобы отправить заявку, нужно согласие на обработку данных.', 'warning');
        syncSubmit();
        return;
      }
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      syncSubmit();
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Отправляю заявку…', 'warning');
        await api('/api/public/inquiry', {method:'POST', body:{name:data.get('name'), contact:data.get('contact'), message:data.get('message'), material_title:data.get('material_title'), route:data.get('route'), accepted_personal_data:true}});
        closeModal(true); say('Заявка отправлена.','success');
      }catch(error){ setFeedback(feedback, error.message || 'Не удалось отправить заявку.', 'danger'); say(error.message,'danger'); }
      finally{ delete form.dataset.saving; setContentFormBusy(form, false); syncSubmit(); }
    });
  }});
}

function requestPaymentLine(x={}){
  const state = x.confirmed ? 'подтверждён' : 'платёж отправлен';
  const target = x.work_title ? ` · ${x.work_title}` : '';
  return `<div><span><strong>${money(x.amount || 0)}</strong><em>${esc(`${state} · ${time(x.created_at)}${target}`)}</em></span>${isAdmin() && !x.confirmed ? `<div class="row"><button class="plain" data-action="payment-review" data-target-type="request" data-payment-id="${attr(x.id)}" data-decision="confirmed">Подтвердить</button><button class="plain danger" data-action="payment-review" data-target-type="request" data-payment-id="${attr(x.id)}" data-decision="rejected">Отклонить</button></div>` : ''}</div>`;
}
function clientDetailActionsHtml(targetType='', targetId='', financials={}){
  const debt = Number(financials.remainder || financials.debt || financials.money_debt_total || 0);
  const buttons = [`<button class="secondary" data-action="client-message" data-kind="update" data-target-type="${attr(targetType)}" data-target-id="${attr(targetId)}">Написать</button>`];
  if(debt > 0) buttons.push(`<button class="secondary" data-action="payment-receipt" data-target-type="${attr(targetType)}" data-target-id="${attr(targetId)}">Отметить платёж</button>`);
  return `<div class="row trebnik-actions-row">${buttons.join('')}</div>`;
}
function clientRequestDetailHtml(payload={}){
  const r = payload.request || {};
  const f = payload.financials || {};
  return `<div class="detail trebnik-detail-modal client-detail-modal">
    <p class="subtle">${esc(statusName(r.status || 'planned'))}</p>
    ${r.goal ? `<p>${esc(r.goal)}</p>` : ''}
    <div class="trebnik-request-ledger">
      <span><em>Итого</em><strong>${money(f.total || 0)}</strong></span>
      <span><em>Оплачено</em><strong>${money(f.paid || 0)}</strong></span>
      <span class="${Number(f.pending || 0) > 0 ? 'is-wait' : ''}"><em>На проверке</em><strong>${money(f.pending || 0)}</strong></span>
      <span class="${Number(f.remainder || f.money_debt_total || 0) > 0 ? 'is-alert' : ''}"><em>Остаток</em><strong>${money(f.remainder || f.money_debt_total || 0)}</strong></span>
    </div>
    ${clientDetailActionsHtml('request', r.id, f)}
    <div class="client-detail-grid">
      <section class="dlist"><h3>Работы</h3>${(payload.works || []).map(x => `<div><strong>${esc(x.title || 'Работа')}</strong><em>${esc(statusName(x.status || 'planned'))} · ${date(x.next_due || x.expected_first_result)}</em></div>`).join('') || empty('Работ нет.')}</section>
      <section class="dlist"><h3>Диагностики</h3>${(payload.diagnostics || []).map(x => `<div><strong>${esc(x.title || 'Диагностика')}</strong><em>${esc([x.type || '', Number(x.cost || 0) ? money(x.cost || 0) : ''].filter(Boolean).join(' · '))}</em></div>`).join('') || empty('Диагностик нет.')}</section>
      <section class="dlist"><h3>Платежи</h3>${(payload.payments || []).map(requestPaymentLine).join('') || empty('Платежей нет.')}</section>
      <section class="dlist"><h3>Записи</h3>${(payload.updates || []).map(x => `<div><strong>${time(x.created_at)}</strong><em>${esc(short(x.text || '', 180))}</em></div>`).join('') || empty('Записей пока нет.')}</section>
    </div>
  </div>`;
}
async function detailRequest(id){
  openModal('Запрос', loading('Открываю запрос…'), {wide:true,kind:'trebnik-detail'});
  try{
    const payload = await api(`/api/request/${id}`);
    const r = payload.request || {}; const f = payload.financials || {};
    if(isTrebnikClient() && !isAdmin()){
      openModal(r.title || 'Запрос', clientRequestDetailHtml(payload), {wide:true,kind:'trebnik-detail'});
      return;
    }
    openModal(r.title || 'Запрос', `<div class="detail trebnik-detail-modal"><p class="subtle">${esc(r.client_name || '')} · ${esc(statusName(r.status || 'planned'))}</p><p>${esc(r.goal || '')}</p><div class="metrics">${metric('Итого', money(f.total || 0))}${metric('Оплачено', money(f.paid || 0))}${metric('Ждёт подтверждения', money(f.pending || 0))}${metric('Остаток', money(f.remainder || f.money_debt_total || 0))}</div><div class="detail-grid"><div class="dlist trebnik-work-list"><h3>Работы</h3>${(payload.works || []).map(x => `<div><span><strong>${esc(x.title)}</strong><em>${esc(statusName(x.status || 'planned'))} · ${date(x.next_due || x.expected_first_result)}</em></span>${isAdmin() ? `<div class="row"><button class="plain" data-action="work-detail" data-id="${attr(x.id)}">Открыть</button><button class="secondary" data-action="work-log" data-id="${attr(x.id)}" data-log-date="${attr(inputDateValue(x.next_due || x.expected_first_result))}">Выполнено</button></div>` : ''}</div>`).join('') || empty('Работ нет.')}</div><div class="dlist"><h3>Диагностики</h3>${(payload.diagnostics || []).map(x => `<div><strong>${esc(x.title)}</strong><em>${esc(x.type || '')} · ${money(x.cost || 0)}</em></div>`).join('') || empty('Диагностик нет.')}</div></div><div class="dlist trebnik-payment-list trebnik-full-list"><h3>Платежи</h3>${(payload.payments || []).map(requestPaymentLine).join('') || empty('Платежей нет.')}</div><div class="dlist"><h3>Рекомендации</h3>${(payload.recommendations || []).map(x => `<div><strong>${esc(statusName(x.status || 'active'))}</strong><em>${esc(short(x.text || '', 180))}</em></div>`).join('') || empty('Рекомендаций нет.')}</div><div class="dlist"><h3>Апдейты</h3>${(payload.updates || []).map(x => `<div><strong>${time(x.created_at)}</strong><em>${esc(short(x.text || '', 220))}</em></div>`).join('') || empty('Апдейтов пока нет.')}</div></div>`, {wide:true,kind:'trebnik-detail'});
  }catch(error){ openModal('Запрос', problem(error.message), {wide:true,kind:'trebnik-detail'}); }
}
function serviceClientActions(s={}, f={}){
  if(!isTrebnikClient()) return '';
  const debt = serviceAmountNow(s, f);
  const buttons = [
    `<button class="secondary" data-action="client-message" data-kind="update" data-target-type="service" data-target-id="${attr(s.id)}">Написать</button>`,
  ];
  if(s.can_mark_payment || (s.can_mark_payment !== false && debt > 0)){
    buttons.push(`<button class="secondary" data-action="payment-receipt" data-target-type="service" data-target-id="${attr(s.id)}">Отметить платёж</button>`);
  }
  if(s.can_request_more_time){
    buttons.push(`<button class="secondary" data-action="service-extend" data-service-id="${attr(s.id)}">Попросить больше времени</button>`);
  }
  if(s.can_postpone_payment){
    buttons.push(`<button class="plain" data-action="service-action" data-service-id="${attr(s.id)}" data-mode="postpone">Отложить оплату</button>`);
  }
  if(s.can_resume){
    buttons.push(`<button class="plain" data-action="service-action" data-service-id="${attr(s.id)}" data-mode="resume">Снова продлевать</button>`);
  }else if(s.can_stop_after_current){
    buttons.push(`<button class="plain" data-action="service-action" data-service-id="${attr(s.id)}" data-mode="stop">Не продлевать после срока</button>`);
  }
  return `<div class="row trebnik-actions-row">${buttons.join('')}</div>`;
}
function serviceAdminActions(s={}, f={}){
  if(!isAdmin()) return '';
  const buttons = [
    `<button class="secondary" data-action="service-edit" data-id="${attr(s.id)}">Править</button>`,
    `<button class="plain" data-action="payment-add" data-target-type="service" data-target-id="${attr(s.id)}">Платёж</button>`,
  ];
  return `<div class="row trebnik-actions-row">${buttons.join('')}</div>`;
}
function clientServiceDetailHtml(payload={}){
  const s = payload.service || {};
  const f = payload.financials || {};
  return serviceDetailStoryHtml(payload, {actions:serviceClientActions(s, f)});
}
async function detailService(id){
  const modalKind = isAdmin() ? 'service-detail' : 'trebnik-detail';
  openModal('Услуга', loading('Открываю услугу…'), {wide:true,kind:modalKind});
  try{
    const payload = await api(`/api/service/${id}`);
    const s = payload.service || {}; const f = payload.financials || {};
    if(isTrebnikClient() && !isAdmin()){
      openModal(s.title || 'Услуга', clientServiceDetailHtml(payload), {wide:true,kind:'trebnik-detail'});
      return;
    }
    const clientActions = isAdmin() ? serviceAdminActions(s, f) : serviceClientActions(s, f);
    const moreTimeRows = (payload.more_time_requests || []).map(x => `<div><strong>${esc(statusName(x.status || 'pending'))}</strong><em>${esc([x.current_limit ? `было до ${dateLong(x.current_limit)}` : '', x.requested_until ? `просили до ${dateLong(x.requested_until)}` : '', x.approved_until ? `одобрено до ${dateLong(x.approved_until)}` : '', x.created_at ? time(x.created_at) : ''].filter(Boolean).join(' · '))}</em>${isAdmin() && x.status === 'pending' ? `<div class="row"><button class="plain" data-action="service-more-time-review" data-request-id="${attr(x.id)}" data-decision="approved">Одобрить</button><button class="plain danger" data-action="service-more-time-review" data-request-id="${attr(x.id)}" data-decision="rejected">Отказать</button></div>` : ''}</div>`).join('') || empty('Запросов на новый срок нет.');
    const payments = (payload.payments || []).map(x => `<div><span><strong>${money(x.amount)}</strong><em>${esc(servicePaymentMeta(x, s))}</em></span>${isAdmin() && !x.confirmed ? `<div class="row"><button class="plain" data-action="payment-review" data-target-type="service" data-payment-id="${attr(x.id)}" data-decision="confirmed">Подтвердить</button><button class="plain danger" data-action="payment-review" data-target-type="service" data-payment-id="${attr(x.id)}" data-decision="rejected">Отклонить</button></div>` : ''}</div>`).join('');
    const updates = (payload.updates || []).map(x => `<div><strong>${time(x.created_at)}</strong><em>${esc(short(x.text || '', 220))}</em></div>`).join('');
    openModal(s.title || 'Услуга', serviceDetailStoryHtml(payload, {
      actions:clientActions,
      paymentsHtml:payments,
      paymentCount:(payload.payments || []).length,
      moreTimeHtml:moreTimeRows,
      moreTimeCount:(payload.more_time_requests || []).length,
      updatesHtml:updates,
      updateCount:(payload.updates || []).length,
    }), {wide:true,kind:modalKind});
  }catch(error){ openModal('Услуга', problem(error.message), {wide:true,kind:modalKind}); }
}

function problem(text){ return `<section class="gate-card"><h1>Что-то пошло не так</h1><p>${esc(text || 'Ошибка')}</p><div class="row" style="margin-top:22px"><button class="primary" data-action="reload">Обновить</button><a class="secondary" href="${routeHref('home')}" data-route="home">На главную</a></div></section>`; }
function footer(){
  return '';
}

function bookSvg(){
  return `<svg class="book-orbit" viewBox="0 0 620 430" role="img" aria-label="Книга и перо">
    <defs><linearGradient id="quillGradient" x1="0" x2="1"><stop offset="0" stop-color="#8b5a24"/><stop offset=".45" stop-color="#f5d47b"/><stop offset="1" stop-color="#f8ebbd"/></linearGradient></defs>
    <circle class="orbit" cx="330" cy="218" r="168"/><circle class="orbit" cx="330" cy="218" r="118"/><ellipse class="orbit" cx="330" cy="218" rx="210" ry="78"/>
    <path class="rays" d="M330 23v52M330 356v52M112 218h58M470 218h58M190 78l28 34M462 78l-28 34M190 356l28-34M462 356l-28-34"/>
    <path class="ember-line" d="M82 246c78-35 147 22 214-12 69-34 123-92 225-41"/>
    <path class="book" d="M185 242c60-42 128-38 204 6v82c-77-42-144-48-204-6v-82Z"/>
    <path class="book" d="M389 248c61-50 118-66 171-40v86c-55-20-112-6-171 36v-82Z"/>
    <path class="page" d="M205 255c49-25 101-20 161 10v49c-61-28-113-34-161-10v-49ZM413 259c44-30 86-43 125-30v48c-40-8-82 3-125 28v-46Z"/>
    <path class="quill" d="M405 280c32-112 73-181 149-241-111 33-171 100-193 222l-37 84 81-65Z"/>
  </svg>`;
}

boot();
