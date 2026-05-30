function say(text, type=''){
  notice.textContent = text;
  notice.className = `notice ${type}`.trim();
  notice.setAttribute('role', type === 'danger' ? 'alert' : 'status');
  notice.hidden = false;
  clearTimeout(say.timer);
  say.timer = setTimeout(() => { notice.hidden = true; }, 4600);
}

function setContentFormBusy(form, busy){
  const controls = form.querySelectorAll('button,input,textarea,select');
  const saveButton = form.querySelector('[data-save-content]');
  if(saveButton){
    if(!saveButton.dataset.defaultLabel) saveButton.dataset.defaultLabel = saveButton.textContent.trim() || 'Сохранить';
    saveButton.textContent = busy ? 'Сохраняю…' : saveButton.dataset.defaultLabel;
  }
  form.classList.toggle('is-busy', Boolean(busy));
  controls.forEach(control => { control.disabled = Boolean(busy); });
}

const DASH_AUTOFIX_SKIP_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'email',
  'file',
  'hidden',
  'image',
  'month',
  'number',
  'password',
  'radio',
  'range',
  'reset',
  'submit',
  'time',
  'url',
  'week',
]);
let dashAutofixDispatching = false;

function normalizeDoubleDashText(value=''){
  return String(value).replace(/--/g, '—');
}

function shouldAutofixDashField(node){
  if(node instanceof HTMLTextAreaElement) return !node.readOnly && !node.disabled;
  if(!(node instanceof HTMLInputElement)) return false;
  const type = (node.getAttribute('type') || 'text').toLowerCase();
  if(DASH_AUTOFIX_SKIP_INPUT_TYPES.has(type)) return false;
  if(node.readOnly || node.disabled) return false;
  if(node.matches('[data-rich-link-url]')) return false;
  const label = `${node.name || ''} ${node.id || ''} ${node.placeholder || ''}`.toLowerCase();
  return !/(^|\s|[_-])(url|link|href|slug|path)(\s|[_-]|$)|https?:\/\//.test(label);
}

function dispatchDashAutofixInput(node){
  if(dashAutofixDispatching) return;
  dashAutofixDispatching = true;
  try{
    const event = typeof InputEvent === 'function'
      ? new InputEvent('input', {bubbles:true, inputType:'insertReplacementText', data:'—'})
      : new Event('input', {bubbles:true});
    node.dispatchEvent(event);
  }finally{
    dashAutofixDispatching = false;
  }
}

function autofixDoubleDashField(field){
  if(!shouldAutofixDashField(field)) return false;
  const value = field.value || '';
  if(!value.includes('--')) return false;
  const selectionStart = typeof field.selectionStart === 'number' ? field.selectionStart : value.length;
  const selectionEnd = typeof field.selectionEnd === 'number' ? field.selectionEnd : selectionStart;
  const nextValue = normalizeDoubleDashText(value);
  const nextStart = normalizeDoubleDashText(value.slice(0, selectionStart)).length;
  const nextEnd = normalizeDoubleDashText(value.slice(0, selectionEnd)).length;
  field.value = nextValue;
  if(document.activeElement === field && typeof field.setSelectionRange === 'function'){
    try{ field.setSelectionRange(nextStart, nextEnd); }catch{}
  }
  dispatchDashAutofixInput(field);
  return true;
}

function editableDashRoot(node){
  const root = node instanceof Element
    ? node.closest('[contenteditable="true"]')
    : node?.parentElement?.closest?.('[contenteditable="true"]');
  if(!(root instanceof HTMLElement) || root.getAttribute('contenteditable') !== 'true') return null;
  if(root.closest('[data-no-dash-autofix]')) return null;
  return root;
}

function textOffsetInEditable(root){
  const selection = window.getSelection?.();
  if(!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if(!root.contains(range.startContainer)) return null;
  const before = range.cloneRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString().length;
}

function restoreEditableTextOffset(root, offset){
  const selection = window.getSelection?.();
  if(!selection || offset === null) return;
  const range = document.createRange();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = Math.max(0, offset);
  let node = walker.nextNode();
  while(node){
    const length = node.nodeValue?.length || 0;
    if(remaining <= length){
      range.setStart(node, remaining);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function autofixDoubleDashEditable(root){
  if(!root?.textContent?.includes('--')) return false;
  const currentOffset = textOffsetInEditable(root);
  const nextOffset = currentOffset === null
    ? null
    : normalizeDoubleDashText(root.textContent.slice(0, currentOffset)).length;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let changed = false;
  let node = walker.nextNode();
  while(node){
    const value = node.nodeValue || '';
    if(value.includes('--')){
      node.nodeValue = normalizeDoubleDashText(value);
      changed = true;
    }
    node = walker.nextNode();
  }
  if(!changed) return false;
  restoreEditableTextOffset(root, nextOffset);
  dispatchDashAutofixInput(root);
  return true;
}

document.addEventListener('input', event => {
  if(dashAutofixDispatching || event.isComposing) return;
  const target = event.target;
  if(autofixDoubleDashField(target)) return;
  const root = editableDashRoot(target);
  if(root) autofixDoubleDashEditable(root);
});

function setFeedback(node, text, type='muted'){
  if(!node) return;
  node.textContent = text || '';
  const base = node.dataset.feedbackStyle === 'note' ? 'form-note' : 'form-feedback';
  node.className = `${base} ${type ? `is-${type}` : ''}`.trim();
}

function ensureModalTitle(){
  if(!modalTitle){
    modalTitle = document.createElement('h2');
    modalTitle.id = 'modalTitle';
    modal.querySelector('.modal-head')?.insertBefore(modalTitle, modalClose);
  }
  modal.setAttribute('aria-labelledby', 'modalTitle');
  return modalTitle;
}
function openModal(title, html, options={}){
  state.modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  ensureModalTitle().textContent = title || 'Окно';
  modalBody.innerHTML = html || empty('Здесь пока нет содержимого.');
  modalBody.dataset.dirty = '0';
  modalBody.dataset.mediaUploadsInProgress = '0';
  modalCard.classList.toggle('wide', Boolean(options.wide));
  modalCard.classList.toggle('compact', Boolean(options.compact));
  modalCard.dataset.modalKind = options.kind || '';
  modal.hidden = false;
  document.body.classList.add('modal-open');
  if(typeof options.onMount === 'function') options.onMount(modalBody);
  bindModalDirtyGuard(modalBody);
  const first = modalBody.querySelector('input,textarea,select,button,[href],summary');
  (first instanceof HTMLElement ? first : modalClose).focus({preventScroll:true});
}
function mediaLookupPath(url=''){
  const clean = cleanText(url);
  if(!clean) return '';
  try{
    const parsed = new URL(clean, window.location.origin);
    if(parsed.origin !== window.location.origin) return '';
    if(!parsed.pathname.startsWith('/static/uploads/')) return '';
    return parsed.pathname;
  }catch{
    return clean.startsWith('/static/uploads/') ? clean.split('?', 1)[0] : '';
  }
}
function applyFullImageWhenAvailable(viewer, sourceUrl=''){
  const path = mediaLookupPath(sourceUrl);
  const image = viewer?.querySelector?.('img');
  if(!viewer || !image || !path) return;
  api(`/api/media/full-url?url=${encodeURIComponent(path)}`).then(payload => {
    const fullUrl = cleanText(payload?.url || '');
    if(fullUrl && viewer.isConnected && fullUrl !== image.getAttribute('src')) image.src = fullUrl;
  }).catch(() => {});
}
function openImageLightbox(action){
  const image = action.querySelector('img');
  const url = cleanText(action.dataset.imageUrl || image?.getAttribute('src') || '');
  const fullUrl = cleanText(action.dataset.imageFullUrl || image?.dataset.fullImageUrl || image?.dataset.originalUrl || '');
  const alt = cleanText(action.dataset.imageAlt || image?.getAttribute('alt') || 'Фото');
  if(!url) return;
  const rect = image?.getBoundingClientRect?.();
  const sourceWidth = Math.ceil(Number(action.dataset.imageWidth || rect?.width || 0));
  const sourceHeight = Math.ceil(Number(action.dataset.imageHeight || rect?.height || 0));
  closeImageViewer();
  const viewer = document.createElement('div');
  viewer.className = 'material-image-viewer';
  viewer.dataset.imageViewer = '1';
  if(sourceWidth > 0) viewer.style.setProperty('--viewer-source-width', `${sourceWidth}px`);
  if(sourceHeight > 0) viewer.style.setProperty('--viewer-source-height', `${sourceHeight}px`);
  viewer.innerHTML = `<button class="material-image-viewer__backdrop" type="button" data-action="image-viewer-close" aria-label="Закрыть"></button><button class="material-image-viewer__close" type="button" data-action="image-viewer-close" aria-label="Закрыть">×</button><img src="${attr(fullUrl || url)}" alt="${attr(alt || 'Фото')}">`;
  document.body.appendChild(viewer);
  if(!fullUrl) applyFullImageWhenAvailable(viewer, url);
  document.body.classList.add('image-viewer-open');
  viewer.querySelector('.material-image-viewer__close')?.focus({preventScroll:true});
}
function closeImageViewer(){
  document.querySelectorAll('[data-image-viewer]').forEach(node => node.remove());
  document.body.classList.remove('image-viewer-open');
}
function openClickedSiteImage(event, action){
  if(state.route === 'home' || document.body.dataset.route === 'home') return false;
  if(action) return false;
  const image = event.target.closest('img');
  if(!image) return false;
  if(image.closest('a.community-avatar[href],.community-avatar[data-route="u"],a[data-route="u"]')) return false;
  if(image.closest('a.content-card-main[href],a.hero-featured-main[href],a.profile-feed-row[href],a.profile-info-row[href]')) return false;
  if(image.closest('button,[role="button"],.messenger-compose,.messenger-send,.messenger-attach')) return false;
  if(image.closest('#siteHeader,#mobileNav,#profileMenu,.modal-head,.material-image-viewer,.codex-editor,.material-editor-layout,.public-material-editor,[contenteditable="true"]')) return false;
  const url = cleanText(image.currentSrc || image.getAttribute('src') || '');
  if(!url || /\.svg(?:[?#].*)?$/i.test(url)) return false;
  event.preventDefault();
  event.stopPropagation();
  openImageLightbox({
    dataset: {
      imageUrl: url,
      imageAlt: image.getAttribute('alt') || 'Фото',
      imageWidth: String(Math.ceil(image.getBoundingClientRect().width || 0)),
      imageHeight: String(Math.ceil(image.getBoundingClientRect().height || 0)),
    },
    querySelector: selector => selector === 'img' ? image : null,
  });
  return true;
}
function keepFocusInsideModal(event){
  if(event.key !== 'Tab' || modal.hidden) return;
  const focusable = [modalClose, ...modalBody.querySelectorAll(focusableSelector)]
    .filter(node => node instanceof HTMLElement && node.offsetParent !== null);
  if(!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if(event.shiftKey && document.activeElement === first){
    event.preventDefault();
    last.focus({preventScroll:true});
  }else if(!event.shiftKey && document.activeElement === last){
    event.preventDefault();
    first.focus({preventScroll:true});
  }
}
function modalHasBusyWork(){
  return Number(modalBody.dataset.mediaUploadsInProgress || 0) > 0 || Boolean(modalBody.querySelector('form[data-saving="1"]'));
}
function bindModalDirtyGuard(root){
  root.querySelectorAll('form').forEach(form => {
    if(form.dataset.dirtyBound === '1') return;
    form.dataset.dirtyBound = '1';
    form.addEventListener('input', () => { root.dataset.dirty = '1'; });
    form.addEventListener('change', () => { root.dataset.dirty = '1'; });
  });
}
function markModalClean(formOrRoot=modalBody){
  const root = formOrRoot.closest?.('#modalBody') || modalBody;
  root.dataset.dirty = '0';
}
function closeModal(force=false){
  if(!force && modalHasBusyWork()){
    say('Подождите, пока действие закончится.','warning');
    return;
  }
  if(!force && modalBody.dataset.dirty === '1' && !window.confirm('Есть несохраненные изменения. Закрыть окно и потерять их?')) return;
  modal.hidden = true;
  modalBody.innerHTML = '';
  modalBody.dataset.dirty = '0';
  modalBody.dataset.mediaUploadsInProgress = '0';
  modalCard.classList.remove('wide','compact');
  modalCard.dataset.modalKind = '';
  modal.removeAttribute('aria-labelledby');
  modalTitle?.remove();
  modalTitle = null;
  document.body.classList.remove('modal-open');
  state.modalReturnFocus?.focus?.({preventScroll:true});
  state.modalReturnFocus = null;
}
modalClose.addEventListener('click', closeModal);
modal.querySelector('[data-modal-close]').addEventListener('click', closeModal);
document.addEventListener('keydown', event => {
  keepFocusInsideModal(event);
  if(event.key === 'Escape' && !modal.hidden) closeModal();
  if(event.key === 'Escape' && document.querySelector('[data-image-viewer]')) closeImageViewer();
  if(event.key === 'Escape' && state.notificationsOpen) closeNotificationsPanel();
  if(event.key === 'Escape' && state.adminTrafficOpen) closeAdminTrafficPanel();
  if(event.key === 'Escape' && state.menuOpen) setMenu(false);
  if(event.key === 'Escape' && state.profileOpen) closeProfileMenu();
  if((event.key === 'Enter' || event.key === ' ') && event.target?.matches?.('.trebnik-inline-row[role="button"]')){
    event.preventDefault();
    event.target.click();
  }
});

function applyRouteFromLocation(){
  const p = parseRoute();
  state.route = p.route;
  state.slug = p.slug;
}
function renderCurrentRoute(){
  applyRouteFromLocation();
  if(state.publicMaterialEditor && state.publicMaterialEditor.route !== state.route) state.publicMaterialEditor = null;
  if(state.route !== 'admin') state.adminMaterialEditor = null;
  if(state.route !== 'messages' && typeof stopCommunityMessagesPolling === 'function') stopCommunityMessagesPolling();
  closeProfileMenu();
  closeAdminTrafficPanel();
  closeNotificationsPanel();
  setMenu(false);
  render();
  trackClientVisit();
  setTimeout(() => app.focus({preventScroll:true}), 0);
}
function go(route, slug='', options={}){
  const url = routeHref(route, slug, options);
  const currentUrl = `${location.pathname}${location.search}`;
  if(url !== currentUrl){
    const method = options.replace ? 'replaceState' : 'pushState';
    history[method](null, '', url);
  }
  renderCurrentRoute();
}
function setMenu(open){
  const next = Boolean(open);
  if(next){
    closeProfileMenu();
    closeNotificationsPanel();
    closeAdminTrafficPanel();
  }
  state.menuOpen = next;
  siteHeader.classList.toggle('menu-open', state.menuOpen);
  menuButton.setAttribute('aria-expanded', String(state.menuOpen));
}
menuButton.addEventListener('click', () => setMenu(!state.menuOpen));
headerActions?.addEventListener('click', event => {
  const button = event.target?.closest?.('#profileButton');
  if(!button) return;
  event.preventDefault();
  event.stopPropagation();
  const next = !state.profileOpen;
  if(next){
    closeNotificationsPanel();
    closeAdminTrafficPanel();
    setMenu(false);
  }
  setProfileMenu(next);
});

function refreshChrome(){
  document.body.dataset.route = state.route || 'home';
  const trebnikPage = state.slug === 'inquiries' ? 'actions' : (adminTrebnikPages.includes(state.slug) ? state.slug : 'clients');
  document.body.dataset.trebnikPage = state.route === 'trebnik' ? trebnikPage : '';
  document.body.dataset.adminViewMode = isVisitorMode() ? 'visitor' : 'admin';
  const currentSiteName = siteName();
  brandName.textContent = currentSiteName;
  brandName.dataset.text = currentSiteName;
  document.title = currentPageTitle();
  sectionRoutes.forEach(route => {
    document.querySelectorAll(`#siteNav [data-route="${route}"]`).forEach(link => { link.textContent = sectionDisplayName(route); });
  });
  document.querySelectorAll('a[data-route]:not([data-action]),button[data-route]:not([data-action])').forEach(button => {
    const route = button.dataset.route;
    const slug = button.dataset.slug || '';
    const sameRoute = route === state.route;
    const active = sameRoute && (!slug || slug === state.slug);
    button.classList.toggle('active', active);
    if(active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if(!state.user){
    loginButton.hidden = false;
    loginButton.textContent = 'Войти';
    loginButton.title = 'Вход и регистрация';
    if(adminButton) adminButton.hidden = true;
  }else if(isAdmin()){
    loginButton.hidden = true;
    if(adminButton) adminButton.hidden = true;
  }else{
    loginButton.hidden = true;
    if(adminButton) adminButton.hidden = true;
  }
  syncHeaderControls();
}
function scrollSelectorFor(node){
  if(!node || node === document || node === window) return '';
  if(node === document.scrollingElement || node === document.documentElement || node === document.body) return ':root';
  if(node.id) return `#${cssToken(node.id)}`;
  if(node.dataset?.scrollKey) return `[data-scroll-key="${String(node.dataset.scrollKey).replace(/"/g, '\\"')}"]`;
  const parts = [];
  let current = node;
  while(current && current !== document.body && current !== document.documentElement && parts.length < 5){
    let part = current.tagName ? current.tagName.toLowerCase() : '';
    const stableClasses = Array.from(current.classList || [])
      .filter(name => !['active','open','hidden','is-busy','is-loading'].includes(name))
      .slice(0, 3);
    if(stableClasses.length) part += stableClasses.map(name => `.${cssToken(name)}`).join('');
    if(current.parentElement){
      const same = Array.from(current.parentElement.children).filter(child => child.tagName === current.tagName);
      if(same.length > 1) part += `:nth-of-type(${same.indexOf(current) + 1})`;
    }
    if(part) parts.unshift(part);
    if(current === app) break;
    current = current.parentElement;
  }
  return parts.length ? parts.join('>') : '';
}
function cssToken(value=''){
  if(window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
function capturePageView(){
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const activeSelector = active ? scrollSelectorFor(active) : '';
  const selection = active && typeof active.selectionStart === 'number'
    ? {start:active.selectionStart, end:active.selectionEnd}
    : null;
  const scrolls = [{selector:':window', top:window.scrollY || 0, left:window.scrollX || 0}];
  const roots = [document.scrollingElement, app, ...app.querySelectorAll('*')].filter(Boolean);
  const seen = new Set();
  roots.forEach(node => {
    if(!(node instanceof HTMLElement)) return;
    if(seen.has(node)) return;
    seen.add(node);
    const canScroll = node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1 || node.scrollTop || node.scrollLeft;
    if(!canScroll) return;
    const selector = scrollSelectorFor(node);
    if(!selector || scrolls.some(row => row.selector === selector)) return;
    scrolls.push({selector, top:node.scrollTop || 0, left:node.scrollLeft || 0});
  });
  return {scrolls, activeSelector, selection};
}
function restorePageView(snapshot){
  if(!snapshot) return;
  const apply = () => {
    (snapshot.scrolls || []).forEach(row => {
      if(row.selector === ':window'){
        window.scrollTo(row.left || 0, row.top || 0);
        return;
      }
      const node = row.selector === ':root' ? document.scrollingElement : document.querySelector(row.selector);
      if(node){
        node.scrollTop = row.top || 0;
        node.scrollLeft = row.left || 0;
      }
    });
    if(snapshot.activeSelector){
      const next = document.querySelector(snapshot.activeSelector);
      next?.focus?.({preventScroll:true});
      if(next && snapshot.selection && typeof next.setSelectionRange === 'function'){
        next.setSelectionRange(snapshot.selection.start, snapshot.selection.end ?? snapshot.selection.start);
      }
    }
  };
  apply();
  window.requestAnimationFrame?.(apply);
}
function preservePageView(fn){
  const snapshot = capturePageView();
  const result = fn();
  restorePageView(snapshot);
  return result;
}

loginButton.addEventListener('click', () => {
  publicLoginModal();
});
adminButton?.addEventListener('click', () => go('admin'));
window.addEventListener('popstate', renderCurrentRoute);
window.addEventListener('resize', () => {
  if(state.notificationsOpen) renderNotificationsPanel();
  if(state.adminTrafficOpen) syncAdminTrafficControl();
});

function financeMenusOpen(){
  return Boolean(state.adminFinanceIncomeOpen || state.adminFinanceDebtOpen || state.adminFinanceOverdueOpen || state.adminFinancePendingOpen);
}
function closeFinanceMenus(){
  state.adminFinanceIncomeOpen = false;
  state.adminFinanceDebtOpen = false;
  state.adminFinanceOverdueOpen = false;
  state.adminFinancePendingOpen = false;
}
function closeFinanceMenusOnPageClick(event, action){
  if(state.route !== 'trebnik' || adminTrebnikPage() !== 'payments' || !financeMenusOpen()) return false;
  if(action) return false;
  if(event.target.closest('.finance-hero-cell')) return false;
  closeFinanceMenus();
  preserveFinanceView(() => paintAdminTrebnik());
  return true;
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-action]');
  document.querySelectorAll('.admin-editor__nav-menu[open]').forEach(menu => {
    if(!menu.contains(event.target)) menu.removeAttribute('open');
  });
  if(state.profileOpen && !event.target.closest('#profileControl')) closeProfileMenu();
  if(event.target.closest('[data-admin-traffic-close]')) closeAdminTrafficPanel();
  if(state.adminTrafficOpen && !event.target.closest('#adminTrafficControl') && !event.target.closest('#adminTrafficSheet')) closeAdminTrafficPanel();
  if(event.target.closest('[data-notifications-close]')) closeNotificationsPanel();
  if(state.notificationsOpen && !event.target.closest('#notificationsControl') && !event.target.closest('#notificationSheet')) closeNotificationsPanel();
  if(state.adminClientNavOpen && !event.target.closest('.trebnik-client-mobile-nav') && typeof closeAdminClientNav === 'function') closeAdminClientNav();
  if(!action && state.adminDiagnosticMenuId && !event.target.closest('.admin-diagnostic-mobile-actions') && typeof closeAdminDiagnosticMobileMenu === 'function') closeAdminDiagnosticMobileMenu();
  if(closeFinanceMenusOnPageClick(event, action)) return;
  if(openClickedSiteImage(event, action)) return;
  if(action){
    event.preventDefault();
    closeProfileMenu();
    setMenu(false);
    const name = action.dataset.action;
    if(name === 'login-admin') loginModal('admin');
    if(name === 'public-login') publicLoginModal();
    if(name === 'admin-view-toggle') setAdminViewMode(action.dataset.view || 'admin');
    if(name === 'profile-settings') profileSettingsModal();
    if(name === 'subscriptions-manage') subscriptionsModal();
    if(name === 'profile-tab') setProfileTab(action.dataset.tab || 'overview');
    if(name === 'notifications-open') toggleNotificationsPanel();
    if(name === 'messages-open') openOwnMessagesTab();
    if(name === 'site-message') siteMessageModal();
    if(name === 'notification-go') openNotificationLink(action);
    if(name === 'notification-read') markNotificationRead(action.dataset.id || '');
    if(name === 'notifications-read-all') markAllNotificationsRead();
    if(name === 'notifications-toggle-read') toggleReadNotifications();
    if(name === 'subscription-toggle') toggleSubscription(action);
    if(name === 'subscription-remove') removeSubscription(action.dataset.type || '', action.dataset.route || '', action.dataset.slug || '');
    if(name === 'subscription-email-toggle') updateSubscriptionEmail(action);
    if(name === 'image-lightbox') openImageLightbox(action);
    if(name === 'image-viewer-close') closeImageViewer();
    if(name === 'comment-new') commentModal('', '', action);
    if(name === 'comment-reply') commentModal(action.dataset.parentId || '', action.dataset.author || '', action);
    if(name === 'comment-like') likeComment(action.dataset.id || '', action);
    if(name === 'comment-likes') commentLikesModal(action.dataset.id || '');
    if(name === 'publication-like') likePublication(action);
    if(name === 'publication-likes') publicationLikesModal(action);
    if(name === 'comment-moderate-page') moderateCommentOnPage(action);
    if(name === 'question-new') questionModal();
    if(name === 'community-refresh') refreshCommunityAdmin();
    if(name === 'admin-traffic-toggle') toggleAdminTrafficPanel();
    if(name === 'admin-traffic-refresh') refreshAdminTraffic();
    if(name === 'admin-traffic-reset') resetAdminTrafficToday();
    if(name === 'admin-profile-select') selectAdminProfile(action.dataset.id || '');
    if(name === 'admin-profile-refresh') refreshAdminProfiles();
    if(name === 'admin-profile-delete') deleteAdminProfile(action.dataset.id || '');
    if(name === 'admin-profile-comment') moderateAdminProfileComment(action.dataset.id || '', action.dataset.status || 'published', action.dataset.userId || '');
    if(name === 'community-comment') moderateComment(action.dataset.id || '', action.dataset.status || 'published');
    if(name === 'admin-question-new') adminQuestionModal();
    if(name === 'community-question-answer') answerQuestionModal(action.dataset.id || '');
    if(name === 'community-question-delete') deleteCommunityQuestion(action.dataset.id || '');
    if(name === 'community-user-trust') updateCommunityUser(action.dataset.id || '', {trusted: action.dataset.value === '1'});
    if(name === 'community-user-block') updateCommunityUser(action.dataset.id || '', {blocked: action.dataset.value === '1'});
    if(name === 'community-user-admin') updateCommunityUser(action.dataset.id || '', {site_admin: action.dataset.value === '1'});
    if(name === 'smtp-test') smtpTestModal();
    if(name === 'setup-admin') setupAdminModal();
    if(name === 'logout') logout();
    if(name === 'select-admin-editor-page') selectAdminEditorPage(action.dataset.page || 'home');
    if(name === 'material-filter') setMaterialFilter(action.dataset.route || state.route, action.dataset.filter || 'all');
    if(name === 'cancel-material-editor') cancelMaterialEditor();
    if(name === 'material-preview') materialPreviewModal();
    if(name === 'new-material') newMaterialModal(action.dataset.route || state.adminEditorPage || '');
    if(name === 'toggle-material-visibility') toggleMaterialVisibility(action.dataset.route || state.adminEditorPage || '', action.dataset.slug || '', action.dataset.index, action.dataset.status || '');
    if(name === 'delete-material') deleteMaterial(action.dataset.route || state.adminEditorPage || '', action.dataset.slug || '', action.dataset.index);
    if(name === 'edit-content') contentEditor();
    if(name === 'edit-home') homeEditor();
    if(name === 'edit-featured') featuredEditor();
    if(name === 'content-history') contentHistoryModal();
    if(name === 'edit-section') sectionSettingsEditor(action.dataset.editRoute || state.route);
    if(name === 'edit-material') materialEditor(action.dataset.editRoute || state.route, action.dataset.slug || state.slug, action.dataset.index);
    if(name === 'link-public-profile') publicProfileLinkModal(action.dataset.clientId || state.clientId || '');
    if(name === 'unlink-public-profile') unlinkPublicProfile(action.dataset.clientId || state.clientId || '');
    if(name === 'note') noteModal();
    if(name === 'request-detail') openAdminRequestInlineOrModal(action.dataset.id);
    if(name === 'request-select') setAdminRequest(action.dataset.id || '');
    if(name === 'request-pane') setAdminRequestPane(action.dataset.pane || 'works');
    if(name === 'request-archive-toggle') toggleAdminRequestArchive();
    if(name === 'service-detail') detailService(action.dataset.id);
    if(name === 'work-detail') detailWork(action.dataset.id);
    if(name === 'work-log') workLogModal(action.dataset.id, action.dataset.logDate || '');
    if(name === 'update-detail') detailUpdate(action.dataset.id);
    if(name === 'update-read') markUpdateRead(action.dataset.id);
    if(name === 'updates-read-all') markAllUpdatesRead();
    if(name === 'finance-refresh') refreshAdminFinance(false);
    if(name === 'finance-filter'){
      state.adminFinanceFilter = action.dataset.filter || 'all';
      preserveFinanceView(() => paintAdminTrebnik());
    }
    if(name === 'finance-client'){
      const clientId = action.dataset.id || '';
      state.adminFinanceClientId = clientId;
      if(clientId){
        selectClient(clientId, false);
        state.adminClientTab = 'payments';
        go('trebnik', 'clients');
      }else{
        preserveFinanceView(() => paintAdminTrebnik());
      }
    }
    if(name === 'finance-view'){
      const view = action.dataset.view || 'debt';
      if(view === 'paid'){
        state.adminFinanceFocus = 'paid';
        state.adminFinanceIncomeOpen = !state.adminFinanceIncomeOpen;
        state.adminFinanceDebtOpen = false;
        state.adminFinanceOverdueOpen = false;
        state.adminFinancePendingOpen = false;
      }else if(view === 'debt'){
        state.adminFinanceFocus = 'debt';
        state.adminFinanceDebtOpen = !state.adminFinanceDebtOpen;
        state.adminFinanceIncomeOpen = false;
        state.adminFinanceOverdueOpen = false;
        state.adminFinancePendingOpen = false;
      }else if(view === 'overdue'){
        state.adminFinanceOverdueOpen = !state.adminFinanceOverdueOpen;
        state.adminFinanceIncomeOpen = false;
        state.adminFinanceDebtOpen = false;
        state.adminFinancePendingOpen = false;
      }else if(view === 'pending'){
        state.adminFinancePendingOpen = !state.adminFinancePendingOpen;
        state.adminFinanceIncomeOpen = false;
        state.adminFinanceDebtOpen = false;
        state.adminFinanceOverdueOpen = false;
      }else{
        state.adminFinanceFocus = view;
        state.adminFinanceIncomeOpen = false;
        state.adminFinanceDebtOpen = false;
        state.adminFinanceOverdueOpen = false;
        state.adminFinancePendingOpen = false;
      }
      preserveFinanceView(() => paintAdminTrebnik());
      if(view !== 'paid' && view !== 'debt' && view !== 'overdue' && view !== 'pending') window.requestAnimationFrame?.(() => {
        document.querySelector('.finance-action-center')?.scrollIntoView?.({block:'nearest'});
      });
    }
    if(name === 'finance-month-select'){
      state.adminFinanceMonthKey = action.dataset.month || '';
      state.adminFinanceFocus = 'paid';
      state.adminFinanceIncomeOpen = false;
      state.adminFinanceDebtOpen = false;
      state.adminFinanceOverdueOpen = false;
      state.adminFinancePendingOpen = false;
      preserveFinanceView(() => paintAdminTrebnik());
    }
    if(name === 'finance-payment-view'){
      state.adminFinancePaymentView = action.dataset.view || 'confirmed_recent';
      preserveFinanceView(() => paintAdminTrebnik());
    }
    if(name === 'ritebook-filter'){
      const filter = action.dataset.filter || 'all';
      state.adminRitebookFilter = state.adminRitebookFilter === filter ? 'all' : filter;
      paintAdminTrebnik();
    }
    if(name === 'ritebook-edit') ritebookEditModal(action.dataset.key || '');
    if(name === 'preview-client') previewClient();
    if(name === 'select-client') selectClient(action.dataset.id);
    if(name === 'client-tab') setAdminClientTab(action.dataset.tab || 'requests');
    if(name === 'client-cabinet-tab') setClientCabinetTab(action.dataset.tab || 'now');
    if(name === 'client-open-request') openClientRequest(action.dataset.id || '');
    if(name === 'client-open-service') openClientService(action.dataset.id || '');
    if(name === 'client-request-select') setClientRequest(action.dataset.id || '');
    if(name === 'client-request-pane') setClientRequestPane(action.dataset.pane || 'works');
    if(name === 'client-work-detail') clientWorkDetailModal(action.dataset.id || '', action.dataset.requestId || '');
    if(name === 'client-diagnostic-select') setClientDiagnostic(action.dataset.id || '');
    if(name === 'client-diagnostic-detail') clientRequestDiagnosticModal(action.dataset.id || '', action.dataset.index || '');
    if(name === 'client-update-detail') clientRequestUpdateModal(action.dataset.id || '', action.dataset.index || '');
    if(name === 'client-payment-detail') clientRequestPaymentModal(action.dataset.id || '', action.dataset.index || '');
    if(name === 'client-finance-payment-detail') clientFinancePaymentModal(action.dataset.index || '');
    if(name === 'client-service-select') clientServiceSelect(action.dataset.id || '');
    if(name === 'client-finance-view') setClientFinanceView(action.dataset.view || '');
    if(name === 'client-more-time-quick') clientMoreTimeQuick(action.dataset.serviceId || '', action.dataset.days || '1');
    if(name === 'client-notifications-settings') clientNotificationsModal();
    if(name === 'client-notification') clientNotificationUpdate(action.dataset.field || '', action.dataset.value === '1');
    if(name === 'client-notifications-all') clientNotificationsAll(action.dataset.value === '1');
    if(name === 'client-trebnik-notification-detail') clientTrebnikNotificationDetailModal(action.dataset.id || '');
    if(name === 'client-trebnik-notification-read') clientTrebnikNotificationRead(action.dataset.id || '');
    if(name === 'client-trebnik-notification-read-all') clientTrebnikNotificationReadAll();
    if(name === 'client-list-back') showAdminClientList();
    if(name === 'client-nav-toggle') toggleAdminClientNav();
    if(name === 'client-refresh') refreshAdminClient();
    if(name === 'client-add') clientAdminModal('add');
    if(name === 'client-rename') clientAdminModal('rename');
    if(name === 'client-archive') adminClientArchive();
    if(name === 'client-delete') adminClientDelete();
    if(name === 'request-add') requestAdminModal('add');
    if(name === 'request-edit') requestAdminModal('edit', action.dataset.id || '');
    if(name === 'request-delete') adminRequestDelete(action.dataset.id || '');
    if(name === 'work-add') workAdminModal('add', action.dataset.requestId || '');
    if(name === 'work-edit') workAdminModal('edit', action.dataset.id || '');
    if(name === 'work-delete') adminWorkDelete(action.dataset.id || '');
    if(name === 'diagnostic-select') setAdminDiagnostic(action.dataset.id || '');
    if(name === 'diagnostic-mobile-toggle') toggleAdminDiagnosticMobile(action.dataset.id || '');
    if(name === 'diagnostic-mobile-menu') toggleAdminDiagnosticMobileMenu(action.dataset.id || '');
    if(name === 'diagnostic-detail') adminDiagnosticDetailModal(action.dataset.id || '');
    if(name === 'diagnostic-edit') adminDiagnosticEditModal(action.dataset.id || '');
    if(name === 'diagnostic-toggle-hidden') adminDiagnosticToggleHidden(action.dataset.id || '');
    if(name === 'diagnostic-add') diagnosticAdminModal(action.dataset.requestId || '', action.dataset.workId || '');
    if(name === 'diagnostic-delete') adminDiagnosticDelete(action.dataset.id || '');
    if(name === 'recommendation-add') recommendationAdminModal('add', action.dataset.requestId || '');
    if(name === 'recommendation-edit') recommendationAdminModal('edit', action.dataset.id || '');
    if(name === 'recommendation-cancel') adminRecommendationAction(action.dataset.id || '', 'cancel');
    if(name === 'recommendation-delete') adminRecommendationAction(action.dataset.id || '', 'delete');
    if(name === 'payment-reminder-send') paymentReminderSend(action.dataset.targetType || '', action.dataset.targetId || '', action.dataset.clientId || '');
    if(name === 'payment-reminder-settings') paymentReminderSettingsModal(action.dataset.targetType || '', action.dataset.targetId || '');
    if(name === 'payment-add'){
      if(action.dataset.clientId) selectClient(action.dataset.clientId, false);
      paymentAdminModal(action.dataset.targetType || '', action.dataset.targetId || '');
    }
    if(name === 'service-add') serviceAdminModal('add');
    if(name === 'service-edit') serviceAdminModal('edit', action.dataset.id || '');
    if(name === 'service-delete') adminServiceDelete(action.dataset.id || '');
    if(name === 'inquiry') inquiryModal(action.dataset.title || '', action.dataset.route || '');
    if(name === 'client-message') clientMessageModal(action.dataset.kind || 'question', action.dataset.targetType || '', action.dataset.targetId || '');
    if(name === 'payment-receipt') paymentReceiptModal(action.dataset.targetType || '', action.dataset.targetId || '', action.dataset.workId || '');
    if(name === 'service-extend') serviceExtendModal(action.dataset.serviceId || '');
    if(name === 'service-action') serviceAction(action.dataset.serviceId || '', action.dataset.mode || '');
    if(name === 'inquiry-status') updateInquiryStatus(action.dataset.id || '', action.dataset.status || 'processing');
    if(name === 'payment-review') paymentReview(action.dataset.targetType || '', action.dataset.paymentId || '', action.dataset.decision || 'confirmed');
    if(name === 'service-more-time-review') serviceMoreTimeReview(action.dataset.requestId || '', action.dataset.decision || 'approved');
    if(name === 'service-more-time-custom') serviceMoreTimeCustomModal(action.dataset.requestId || '', action.dataset.requestedUntil || '');
    if(name === 'content-restore') restoreContentBackup(action.dataset.name || '');
    if(name === 'reload') location.reload();
    if(name === 'copy') copy(action.dataset.copy || '');
    if(name === 'scroll-to') document.getElementById(action.dataset.target || '')?.scrollIntoView({behavior:'smooth', block:'start'});
    return;
  }
  const routeButton = event.target.closest('button[data-route],a[data-route]');
  if(routeButton){
    if(routeButton.tagName === 'A' && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || routeButton.target === '_blank')){
      return;
    }
    event.preventDefault();
    closeProfileMenu();
    go(routeButton.dataset.route, routeButton.dataset.slug || '');
    setMenu(false);
    return;
  }
  const link = event.target.closest('a[href]');
  if(link && link.origin === location.origin && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && link.target !== '_blank'){
    const rawHref = link.getAttribute('href') || '';
    if(rawHref.startsWith('#')) return;
    const url = new URL(link.href);
    if(url.hash && url.pathname === location.pathname && url.search === location.search) return;
    const parts = url.pathname.split('/').filter(Boolean).map(safeDecode);
    const knownPath = parts.length === 0 || routes.includes(parts[0]);
    if(knownPath){
      event.preventDefault();
      closeProfileMenu();
      if(link.closest('.notification-main')) closeModal(true);
      setMenu(false);
      history.pushState(null, '', `${url.pathname}${url.search}`);
      renderCurrentRoute();
    }
  }
});

async function boot(){
  if(app.dataset.ssr !== '1') app.innerHTML = loading('Открываю записи…');
  try{
    const keepServerHome = canKeepServerRenderedHome();
    const contentPath = siteContentApiPath();
    const healthPromise = api('/api/health');
    const mePromise = api('/api/auth/me').catch(() => ({user:null, setup_required:false}));
    const contentPromise = api(contentPath);
    const [health, me, initialContent] = await Promise.all([healthPromise, mePromise, contentPromise]);
    state.health = health;
    state.community = health.community || {};
    state.user = me.user;
    cacheAuthUser(state.user);
    const nextContentPath = siteContentApiPath();
    const content = nextContentPath === contentPath ? initialContent : await api(nextContentPath);
    state.content = content.content;
    if(isPublicUser()) await refreshCommunityUserData();
    else resetCommunityState();
    state.setupRequired = Boolean(health.setup_required || me.setup_required);
    refreshChrome();
    document.body.classList.remove('auth-pending');
    if(window.ensureAppWorkspace){
      await window.ensureAppWorkspace(state.route || 'public', state.user || null);
    }
    if(keepServerHome && state.route === 'home'){
      app.dataset.ssr = 'hydrated';
      trackClientVisit();
      return;
    }
    render();
    trackClientVisit();
  }catch(error){
    document.body.classList.remove('auth-pending');
    app.innerHTML = problem(error.message);
  }
}

async function reloadContent(){
  const payload = await api(siteContentApiPath());
  state.content = payload.content;
  refreshChrome();
}

function trackClientVisit(){
  const path = location.pathname || '/';
  if(path === state.lastTrackedPath) return;
  state.lastTrackedPath = path;
  if(!state.content || hasAdminRights() || ['admin', 'trebnik'].includes(state.route)) return;
  api('/api/site/visit', {method:'POST', body:{path}}).catch(() => {});
}

async function render(){
  state.renderSeq += 1;
  refreshChrome();
  if(!state.content){ app.innerHTML = loading('Открываю записи…'); return; }
  if(window.ensureAppWorkspace){
    await window.ensureAppWorkspace(state.route || 'public', state.user || null);
  }
  if(state.route === 'home') return renderHome();
  if(state.route === 'trebnik') return renderTrebnik();
  if(state.route === 'admin') return renderAdmin();
  if(state.route === 'messages') return renderMessages();
  if(state.route === 'privacy') return renderLegal('privacy');
  if(state.route === 'rules') return renderLegal('rules');
  if(state.route === 'personal-data-consent') return renderLegal('personal-data-consent');
  if(state.route === 'u') return renderProfile(state.slug);
  if(sectionRoutes.includes(state.route)){
    if(state.publicMaterialEditor?.route === state.route) return renderPublicMaterialEditor(state.route);
    return state.slug ? renderMaterial(state.route, state.slug) : renderSection(state.route);
  }
  renderHome();
}

