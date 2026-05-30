function renderPublicMaterialEditor(route){
  if(!isAdmin()){
    state.publicMaterialEditor = null;
    return renderSection(route);
  }
  const config = state.publicMaterialEditor;
  if(!config || config.route !== route){
    state.publicMaterialEditor = null;
    return renderSection(route);
  }
  const sectionTitle = sectionDisplayName(route);
  const isNew = config.mode !== 'edit';
  const found = isNew ? null : findEditableMaterial(state.content, route, config.slug || '', config.index);
  if(!isNew && !found.item){
    state.publicMaterialEditor = null;
    say('Материал не найден. Обновите страницу.', 'warning');
    return renderSection(route);
  }
  const item = isNew ? createEmptyItem() : found.item;
  const itemIndex = isNew ? 0 : found.index;
  const formId = isNew ? 'newMaterialForm' : 'materialForm';
  app.dataset.mediaUploadsInProgress = '0';
  app.innerHTML = `<article class="public-material-editor material-${attr(route)}">
    <form class="form public-material-form" id="${formId}" data-route="${attr(route)}" ${isNew ? '' : `data-slug="${attr(config.slug || item.slug || '')}" data-index="${attr(itemIndex)}"`}>
      ${itemEditor(item, itemIndex, {showRemove:false, route, mode:isNew ? 'new' : 'edit', showActions:true})}
    </form>
    ${footer()}
  </article>`;
  bindCompactCoverFields(app);
  bindMediaFields(app);
  bindItemPreviews(app);
  bindRichEditors(app);
  initBlockEditors(app);
  bindAdminEditorDirty(app);
  app.querySelector('#newMaterialForm')?.addEventListener('submit', saveNewMaterialForm);
  app.querySelector('#materialForm')?.addEventListener('submit', saveMaterialForm);
}
function serviceCta(item){
  return `<aside class="service-step">
    <div><h2>${esc(publicText(item.cta_label || 'Оставить заявку'))}</h2><p class="subtle">${esc(publicText(item.cta_note || 'Опишите ситуацию и оставьте способ связи.'))}</p></div>
    <button class="primary" data-action="inquiry" data-route="services" data-title="${attr(item.title || 'Услуга')}">Оставить заявку</button>
  </aside>`;
}
function materialAside(item){
  if(!item.cta_label && !item.cta_note) return '';
  return `<aside class="material-aside"><h2>${esc(publicText(item.cta_label || 'К сведению'))}</h2><p class="subtle">${esc(publicText(item.cta_note || ''))}</p></aside>`;
}

function commentsShell(route, slug, item={}, options={}){
  const mini = Boolean(options.mini);
  const disabled = route !== 'questions' && isAdmin() && materialStatus(item.status) !== 'published';
  if(disabled){
    return `<section class="community-block community-compact is-disabled" data-comments-route="${attr(route)}" data-comments-slug="${attr(slug)}">
      <div class="community-login-note">Комментарии появятся после открытия материала.</div>
    </section>`;
  }
  const signedIn = Boolean(state.user);
  const hint = state.user?.trusted || hasAdminRights() ? 'Комментарий появится сразу.' : 'Комментарий появится после проверки.';
  const form = signedIn
    ? `<form class="community-comment-form" data-comment-form>
        <textarea name="body" rows="2" required data-comment-autosize aria-label="Комментарий" placeholder="Напишите комментарий"></textarea>
        <div class="community-comment-actions">
          <p class="form-note" data-form-feedback data-feedback-style="note">${esc(hint)}</p>
          <button class="primary" data-save-content>Прокомментировать</button>
        </div>
      </form>`
    : `<div class="community-login-note ${mini ? 'is-mini' : ''}">
        <p>${mini ? 'Войдите, чтобы комментировать.' : 'Комментарии оставляют только зарегистрированные пользователи.'}</p>
        <button class="secondary" data-action="public-login">${mini || !state.health?.community?.registration_enabled ? 'Войти' : 'Войти / зарегистрироваться'}</button>
      </div>`;
  return `<section class="community-block community-compact ${mini ? 'is-mini' : ''}" data-comments-route="${attr(route)}" data-comments-slug="${attr(slug)}">
    <div class="community-list" data-comments-list></div>
    <div class="community-compose">${form}</div>
  </section>`;
}

function commentAuthorAvatarHtml(author={}){
  const url = cleanText(author.avatar_url || '');
  const name = cleanText(author.display_name || author.nickname || 'Участник');
  const nickname = cleanText(author.nickname || '');
  const initial = (Array.from(name)[0] || 'У').toUpperCase();
  const content = url
    ? `<img src="${attr(url)}" alt="${attr(name)}" loading="lazy" decoding="async">`
    : esc(initial);
  if(nickname){
    return `<a class="community-avatar ${url ? '' : 'is-empty'}" href="${routeHref('u', nickname)}" data-route="u" data-slug="${attr(nickname)}" aria-label="Открыть профиль ${attr(name)}">${content}</a>`;
  }
  if(url){
    return `<span class="community-avatar" role="img" aria-label="${attr(name)}">${content}</span>`;
  }
  return `<span class="community-avatar is-empty" aria-hidden="true">${content}</span>`;
}
function commentHtml(item, isReply=false){
  const author = item.author || {};
  const replies = Array.isArray(item.replies) ? item.replies : [];
  const isPending = item.status === 'pending';
  const isPublished = item.status === 'published';
  const nickname = cleanText(author.nickname || '');
  const displayName = author.display_name || nickname || 'Участник';
  const authorLink = nickname
    ? `<a class="community-author" href="${routeHref('u', nickname)}" data-route="u" data-slug="${attr(nickname)}">${esc(displayName)}</a>`
    : `<span class="community-author">${esc(displayName)}</span>`;
  const authorBadge = item.is_material_author ? `<span class="community-author-badge" title="Автор материала">Автор</span>` : '';
  const pendingBadge = isPending && isAdmin() ? `<span class="community-pending-badge">На проверке</span>` : '';
  const adminMenu = isAdmin()
    ? `<details class="comment-admin-menu" data-comment-admin-menu>
        <summary class="comment-admin-menu-trigger" aria-label="Управление комментарием" title="Управление комментарием"><span aria-hidden="true">⋯</span></summary>
        <div class="comment-admin-menu-list" role="menu">
          ${isPending ? `<button class="plain" type="button" role="menuitem" data-action="comment-moderate-page" data-id="${attr(item.id)}" data-status="published">Опубликовать</button>` : ''}
          ${isPublished ? `<button class="plain" type="button" role="menuitem" data-action="comment-moderate-page" data-id="${attr(item.id)}" data-status="hidden">Скрыть</button>` : ''}
          <button class="plain danger" type="button" role="menuitem" data-action="comment-moderate-page" data-id="${attr(item.id)}" data-status="rejected">Удалить</button>
        </div>
      </details>`
    : '';
  const actionsHtml = isPublished ? `<div class="community-actions">
      <span class="community-like-wrap reaction-like-wrap" data-like-wrap="${attr(item.id)}">
        <button class="plain community-like-button reaction-like-button ${item.liked_by_me ? 'is-liked' : ''}" data-action="comment-like" data-id="${attr(item.id)}" aria-label="${item.liked_by_me ? 'Убрать лайк' : 'Поставить лайк'}, всего ${attr(item.like_count || 0)}" aria-pressed="${item.liked_by_me ? 'true' : 'false'}">${reactionHeartHtml('community-heart reaction-heart')}<span class="reaction-like-count" data-like-count="${attr(item.id)}" aria-hidden="true">${esc(likeCountLabel(item.like_count || 0))}</span></button>
        <span class="community-like-tooltip reaction-like-popover" data-like-tooltip="${attr(item.id)}" role="tooltip"></span>
      </span>
      ${!isReply ? `<button class="plain community-reply-button" data-action="comment-reply" data-parent-id="${attr(item.id)}" data-author="${attr(displayName)}">Ответить</button>` : ''}
    </div>` : '';
  return `<article class="community-item ${isReply ? 'is-reply' : ''} ${item.is_material_author ? 'is-by-author' : ''} ${isPending ? 'is-pending' : ''}" id="comment-${attr(item.id)}" data-comment-id="${attr(item.id)}" data-comment-status="${attr(item.status || '')}">
    <header class="community-item-head">
      ${commentAuthorAvatarHtml(author)}
      <div class="community-author-block">
        <div class="community-author-line">${authorLink}${authorBadge}${pendingBadge}<span class="community-meta">${time(item.created_at)}</span></div>
        <p class="community-comment-body">${esc(item.body || '')}</p>
      </div>
      ${adminMenu}
    </header>
    ${actionsHtml}
    ${replies.length ? `<div class="community-replies">${replies.map(reply => commentHtml(reply, true)).join('')}</div>` : ''}
  </article>`;
}
async function moderateCommentOnPage(button){
  if(!isAdmin()) return;
  const id = button.dataset.id || '';
  const status = button.dataset.status || 'hidden';
  if(!id) return;
  if(status === 'rejected' && !window.confirm('Удалить комментарий безвозвратно?')) return;
  try{
    await api('/api/admin/community/comment', {method:'POST', body:{id, status}});
    const messages = {published:'Комментарий опубликован.', hidden:'Комментарий скрыт.', rejected:'Комментарий удалён.'};
    say(messages[status] || 'Комментарий обработан.', 'success');
    if(typeof loadAdminCommunity === 'function') await loadAdminCommunity(true).catch(() => {});
    await loadNotifications(true).catch(() => {});
    const shell = button.closest('[data-comments-route]') || document.querySelector('[data-comments-route]');
    if(shell){
      await loadComments(shell.dataset.commentsRoute || state.route, shell.dataset.commentsSlug || state.slug, shell);
    }
  }catch(error){
    say(error.message || 'Не удалось обработать комментарий.', 'danger');
  }
}

function matchingCommentShells(route, slug, root=document){
  const cleanRoute = String(route || '');
  const cleanSlug = String(slug || '');
  const isMatch = shell => String(shell?.dataset?.commentsRoute || '') === cleanRoute && String(shell?.dataset?.commentsSlug || '') === cleanSlug;
  if(root?.matches?.('[data-comments-route]') && isMatch(root)) return [root];
  return Array.from((root || document).querySelectorAll?.('[data-comments-route]') || []).filter(isMatch);
}

async function loadComments(route, slug, root=document){
  const shells = matchingCommentShells(route, slug, root);
  const fallbackList = shells.length ? null : document.querySelector('[data-comments-list]');
  if(!shells.length && !fallbackList) return;
  try{
    const payload = await api(`/api/community/comments/list?route=${encodeURIComponent(route)}&slug=${encodeURIComponent(slug)}`);
    const items = payload.items || [];
    const html = items.map(commentHtml).join('');
    const targets = shells.length ? shells : [fallbackList.closest('[data-comments-route]') || fallbackList];
    targets.forEach(shell => {
      const list = shell.querySelector?.('[data-comments-list]') || fallbackList;
      if(!list) return;
      list.innerHTML = html;
      bindCommentLikeTooltips(list);
      bindCommentAdminMenus(list);
      list.closest('.community-block')?.classList.toggle('has-comments', items.length > 0);
    });
  }catch(error){
    const message = error.message || 'Не удалось загрузить комментарии.';
    const isHiddenAdminPreview = isAdmin() && /не найден|скрыт/i.test(message);
    const targets = shells.length ? shells : [fallbackList.closest('[data-comments-route]') || fallbackList];
    targets.forEach(shell => {
      const list = shell.querySelector?.('[data-comments-list]') || fallbackList;
      if(!list) return;
      list.innerHTML = empty(isHiddenAdminPreview ? 'Комментарии появятся после открытия материала.' : message);
      list.closest('.community-block')?.classList.add('has-comments');
    });
  }
}

function likeCountLabel(count=0){
  const value = Math.max(0, Number(count) || 0);
  if(value <= 0) return '';
  if(value < 1000) return String(value);
  const thousands = value / 1000;
  if(thousands >= 10) return `${Math.floor(thousands)}K`;
  const rounded = Math.floor(thousands * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',');
  return `${text}K`;
}
function reactionHeartHtml(className='reaction-heart'){
  return `<span aria-hidden="true" class="${attr(className)}"><svg class="reaction-heart-icon" viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path class="reaction-heart-shape" d="M12 20.2c-3.4-2.9-6.1-5.3-7.7-7.4C2.9 11 2.4 8.9 3.1 7.1c.6-1.6 2-2.7 3.7-2.9 1.9-.2 3.8.8 5.2 2.5 1.4-1.7 3.3-2.7 5.2-2.5 1.7.2 3.1 1.3 3.7 2.9.7 1.8.2 3.9-1.2 5.7-1.6 2.1-4.3 4.5-7.7 7.4Z"/></svg></span>`;
}
function likesPopoverAllowed(){
  return !(window.matchMedia?.('(hover: none), (pointer: coarse)')?.matches || window.innerWidth <= 860);
}
function likeIconHtml(user={}){
  user = user || {};
  const name = cleanText(user.display_name || user.nickname || 'Участник');
  const url = cleanText(user.avatar_url || '');
  const href = cleanText(user.profile_url || '');
  const nickname = cleanText(user.nickname || '');
  const initial = (Array.from(name)[0] || 'У').toUpperCase();
  const content = url
    ? `<img src="${attr(url)}" alt="${attr(name)}" loading="lazy" decoding="async">`
    : esc(initial);
  const avatar = `<span class="reaction-like-avatar ${url ? '' : 'is-empty'}" aria-hidden="true">${content}</span>`;
  if(href){
    return `<a class="reaction-like-person" href="${attr(href)}" ${nickname ? `data-route="u" data-slug="${attr(nickname)}"` : ''} aria-label="Открыть профиль ${attr(name)}">${avatar}</a>`;
  }
  return `<span class="reaction-like-person" role="img" aria-label="${attr(name)}">${avatar}</span>`;
}
function likeFullListHtml(items=[]){
  if(!items.length) return '';
  return `<div class="dlist">${items.map(user => {
    const nickname = cleanText(user.nickname || '');
    const name = cleanText(user.display_name || nickname || 'Участник');
    const href = cleanText(user.profile_url || (nickname ? routeHref('u', nickname) : ''));
    const title = href
      ? `<a href="${attr(href)}" ${nickname ? `data-route="u" data-slug="${attr(nickname)}"` : ''}>${esc(name)}</a>`
      : `<strong>${esc(name)}</strong>`;
    return `<div>${title}<em>${nickname ? `@${esc(nickname)}` : ''}${user.online === true ? ' · онлайн' : user.online === false ? ' · не онлайн' : ''}</em></div>`;
  }).join('')}</div>`;
}
function likeTooltipItemsHtml(items=[], options={}){
  if(!items.length) return '';
  const icons = items.slice(0, 4).map(likeIconHtml).join('');
  const action = cleanText(options.action || '');
  const attrs = action === 'comment-likes'
    ? `data-action="comment-likes" data-id="${attr(options.id || '')}"`
    : action === 'publication-likes'
      ? `data-action="publication-likes" data-route="${attr(options.route || '')}" data-slug="${attr(options.slug || '')}"`
      : '';
  return `<button class="reaction-like-more" type="button" ${attrs}>Кто лайкнул</button>${icons}`;
}
let reactionLikeCloseTimer = 0;
let reactionLikeAnchor = null;
let reactionLikePopoverInside = false;
function ensureReactionLikeFloatingPopover(){
  let popover = document.querySelector('#reactionLikeFloatingPopover');
  if(popover) return popover;
  popover = document.createElement('div');
  popover.id = 'reactionLikeFloatingPopover';
  popover.className = 'reaction-like-floating-popover';
  popover.hidden = true;
  popover.addEventListener('pointerenter', () => {
    reactionLikePopoverInside = true;
    window.clearTimeout(reactionLikeCloseTimer);
  });
  popover.addEventListener('pointerleave', () => {
    reactionLikePopoverInside = false;
    hideReactionLikePopoverSoon();
  });
  popover.addEventListener('focusin', () => {
    reactionLikePopoverInside = true;
    window.clearTimeout(reactionLikeCloseTimer);
  });
  popover.addEventListener('focusout', event => {
    if(!popover.contains(event.relatedTarget)){
      reactionLikePopoverInside = false;
      hideReactionLikePopoverSoon();
    }
  });
  document.body.append(popover);
  return popover;
}
function reactionLikePopoverIsActive(popover){
  if(reactionLikePopoverInside) return true;
  if(popover?.matches?.(':hover')) return true;
  if(popover?.contains?.(document.activeElement)) return true;
  if(reactionLikeAnchor?.matches?.(':hover')) return true;
  if(reactionLikeAnchor?.contains?.(document.activeElement)) return true;
  return false;
}
function positionReactionLikePopover(anchor){
  const popover = ensureReactionLikeFloatingPopover();
  const heart = anchor?.querySelector?.('.reaction-heart, .publication-heart, .community-heart');
  const rect = heart?.getBoundingClientRect?.();
  if(!rect) return;
  popover.hidden = false;
  popover.style.visibility = 'hidden';
  const width = popover.offsetWidth || 0;
  const height = popover.offsetHeight || 0;
  const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
  const top = Math.max(8, rect.top - height - 6);
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.visibility = 'visible';
}
function showReactionLikePopover(anchor, html=''){
  if(!likesPopoverAllowed()) return;
  const popover = ensureReactionLikeFloatingPopover();
  reactionLikeAnchor = anchor || null;
  window.clearTimeout(reactionLikeCloseTimer);
  if(!html){
    popover.hidden = true;
    return;
  }
  popover.innerHTML = html;
  popover.style.gridTemplateColumns = 'repeat(4, 30px)';
  popover.hidden = false;
  requestAnimationFrame(() => positionReactionLikePopover(anchor));
}
function hideReactionLikePopoverSoon(){
  window.clearTimeout(reactionLikeCloseTimer);
  reactionLikeCloseTimer = window.setTimeout(() => {
    const popover = ensureReactionLikeFloatingPopover();
    if(reactionLikePopoverIsActive(popover)) return;
    popover.hidden = true;
    popover.innerHTML = '';
    reactionLikeAnchor?.classList?.remove('is-open');
    reactionLikeAnchor = null;
    reactionLikePopoverInside = false;
  }, 160);
}

async function loadCommentLikeTooltip(id='', options={}){
  if(!likesPopoverAllowed()) return;
  const tooltip = document.querySelector(`[data-like-tooltip="${CSS.escape(String(id))}"]`);
  const wrap = tooltip?.closest?.('[data-like-wrap]');
  const force = Boolean(options.force);
  if(!tooltip || tooltip.dataset.loading === '1' || (!force && tooltip.dataset.loaded === '1')) return;
  if(!state.user){
    tooltip.innerHTML = '';
    return;
  }
  tooltip.dataset.loading = '1';
  tooltip.innerHTML = '';
  try{
    const payload = await api(`/api/community/comments/${encodeURIComponent(id)}/likes`);
    const html = likeTooltipItemsHtml(payload.items || [], {action:'comment-likes', id, count:(payload.items || []).length});
    tooltip.innerHTML = html;
    tooltip.dataset.loaded = '1';
    if(wrap?.classList?.contains('is-open')) showReactionLikePopover(wrap, html);
  }catch(error){
    tooltip.innerHTML = '';
  }finally{
    tooltip.dataset.loading = '0';
  }
}

function bindCommentLikeTooltips(root=document){
  root.querySelectorAll('[data-like-wrap]').forEach(wrap => {
    if(wrap.dataset.tooltipBound === '1') return;
    wrap.dataset.tooltipBound = '1';
    const id = wrap.dataset.likeWrap || '';
    let closeTimer = 0;
    const open = () => {
      if(!likesPopoverAllowed()) return;
      window.clearTimeout(closeTimer);
      wrap.classList.add('is-open');
      const html = wrap.querySelector('[data-like-tooltip]')?.innerHTML || '';
      if(html) showReactionLikePopover(wrap, html);
      loadCommentLikeTooltip(id);
    };
    const close = () => {
      if(!likesPopoverAllowed()) return;
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        wrap.classList.remove('is-open');
        hideReactionLikePopoverSoon();
      }, 180);
    };
    wrap.addEventListener('pointerenter', open);
    wrap.addEventListener('pointerleave', close);
    wrap.addEventListener('focusin', open);
    wrap.addEventListener('focusout', event => {
      if(!wrap.contains(event.relatedTarget)) close();
    });
  });
}

async function submitInlineComment(form){
  if(!state.user){ publicLoginModal(); return; }
  const shell = form.closest('[data-comments-route]');
  const route = shell?.dataset.commentsRoute || state.route;
  const slug = shell?.dataset.commentsSlug || state.slug;
  const body = cleanText(form.querySelector('[name="body"]')?.value || '');
  const feedback = form.querySelector('[data-form-feedback]');
  if(body.length < 3){
    if(feedback) feedback.textContent = 'Напишите комментарий чуть подробнее.';
    return;
  }
  form.dataset.saving = '1';
  const button = form.querySelector('[data-save-content]');
  if(button) button.disabled = true;
  if(feedback) feedback.textContent = 'Отправляю комментарий…';
  try{
    await api('/api/community/comments', {method:'POST', body:{target_route:route, target_slug:slug, parent_id:null, body}});
    form.reset();
    bindCommentTextareas(form);
    if(feedback) feedback.textContent = state.user?.trusted ? 'Комментарий опубликован.' : 'Комментарий отправлен на проверку.';
    await loadComments(route, slug, shell || document);
    await loadNotifications(true);
    await loadSubscriptions(true);
  }catch(error){
    if(feedback) feedback.textContent = error.message || 'Не удалось отправить комментарий.';
  }finally{
    form.dataset.saving = '0';
    if(button) button.disabled = false;
  }
}

function bindInlineCommentForms(root=document){
  bindCommentTextareas(root);
  root.querySelectorAll('[data-comment-form]').forEach(form => {
    if(form.dataset.bound === '1') return;
    form.dataset.bound = '1';
    form.addEventListener('submit', event => {
      event.preventDefault();
      submitInlineComment(form);
    });
  });
}

function placeCommentAdminMenu(menu){
  const list = menu.querySelector('.comment-admin-menu-list');
  if(!list) return;
  menu.classList.remove('is-drop-up', 'is-drop-left');
  const gap = 6;
  const triggerRect = menu.getBoundingClientRect();
  const listRect = list.getBoundingClientRect();
  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  if(spaceBelow < listRect.height + gap && spaceAbove > spaceBelow){
    menu.classList.add('is-drop-up');
  }
  if(triggerRect.right - listRect.width < 8 && window.innerWidth - triggerRect.left > listRect.width){
    menu.classList.add('is-drop-left');
  }
}

function bindCommentAdminMenus(root=document){
  root.querySelectorAll('[data-comment-admin-menu]').forEach(menu => {
    if(menu.dataset.adminMenuBound === '1') return;
    menu.dataset.adminMenuBound = '1';
    menu.addEventListener('toggle', () => {
      if(menu.open) requestAnimationFrame(() => placeCommentAdminMenu(menu));
    });
  });
}

function resizeCommentTextarea(textarea){
  if(!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.max(textarea.scrollHeight, textarea.offsetHeight)}px`;
}

function bindCommentTextareas(root=document){
  root.querySelectorAll('textarea[data-comment-autosize]').forEach(textarea => {
    if(textarea.dataset.autosizeBound !== '1'){
      textarea.dataset.autosizeBound = '1';
      textarea.addEventListener('input', () => resizeCommentTextarea(textarea));
    }
    resizeCommentTextarea(textarea);
  });
}

function commentModal(parentId='', parentAuthor='', trigger=null){
  if(!state.user){ publicLoginModal(); return; }
  const shell = trigger?.closest?.('[data-comments-route]') || document.querySelector('[data-comments-route]');
  const route = shell?.dataset.commentsRoute || state.route;
  const slug = shell?.dataset.commentsSlug || state.slug;
  const isReply = Boolean(parentId);
  openModal(isReply ? 'Ответ' : 'Комментарий', `<form class="form" id="commentForm">
    ${isReply ? `<p class="form-note">Ответ для ${esc(parentAuthor || 'участника')}.</p>` : ''}
    <label><span>Текст комментария</span><textarea name="body" rows="2" required data-comment-autosize></textarea></label>
    <p class="form-note" data-form-feedback data-feedback-style="note">${state.user.trusted ? 'Комментарий появится сразу.' : 'Комментарий появится после проверки.'}</p>
    <div class="row"><button class="primary" data-save-content>Отправить</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    bindCommentTextareas(root);
    root.querySelector('#commentForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      submitSimpleModal(form, form.querySelector('[data-form-feedback]'), '/api/community/comments', {target_route:route, target_slug:slug, parent_id:parentId || null, body:data.get('body')}, state.user.trusted ? 'Комментарий опубликован.' : 'Комментарий отправлен на проверку.', async () => { await loadComments(route, slug, shell || document); await loadNotifications(true); await loadSubscriptions(true); });
    });
  }});
}

async function likeComment(id, trigger=null){
  if(!state.user){ publicLoginModal(); return; }
  try{
    const payload = await api('/api/community/comments/like', {method:'POST', body:{comment_id:id}});
    document.querySelectorAll(`[data-like-count="${CSS.escape(String(id))}"]`).forEach(node => { node.textContent = likeCountLabel(payload.like_count); });
    document.querySelectorAll(`[data-action="comment-like"][data-id="${CSS.escape(String(id))}"]`).forEach(button => {
      button.classList.toggle('is-liked', Boolean(payload.liked));
      button.setAttribute('aria-pressed', payload.liked ? 'true' : 'false');
      button.setAttribute('aria-label', payload.liked ? `Убрать лайк, всего ${payload.like_count || 0}` : `Поставить лайк, всего ${payload.like_count || 0}`);
      button.removeAttribute('title');
    });
    document.querySelectorAll(`[data-like-tooltip="${CSS.escape(String(id))}"]`).forEach(tooltip => {
      tooltip.innerHTML = '';
      tooltip.dataset.loaded = '0';
    });
    await loadNotifications(true);
    const wrap = trigger?.closest?.('[data-like-wrap]');
    if(wrap && likesPopoverAllowed()) await loadCommentLikeTooltip(id, {force:true});
    trigger?.blur?.();
  }catch(error){ say(error.message || 'Не удалось поставить лайк.', 'danger'); }
}

async function commentLikesModal(id){
  if(!state.user){ publicLoginModal(); return; }
  openModal('Лайки', loading('Открываю список…'), {compact:true});
  try{
    const payload = await api(`/api/community/comments/${encodeURIComponent(id)}/likes`);
    openModal('Лайки', likeFullListHtml(payload.items || []) || empty('Лайков пока нет.'), {compact:true});
  }catch(error){ openModal('Лайки', problem(error.message), {compact:true}); }
}

function publicationLikesEnabled(route=''){
  return ['works', 'articles', 'questions', 'cards'].includes(cleanText(route));
}
function publicationLikesShell(route='', slug=''){
  const cleanRoute = cleanText(route);
  const cleanSlug = cleanText(slug);
  if(!publicationLikesEnabled(cleanRoute) || !cleanSlug) return '';
  return `<section class="publication-reactions" data-publication-like-route="${attr(cleanRoute)}" data-publication-like-slug="${attr(cleanSlug)}">
    <span class="publication-like-wrap reaction-like-wrap" data-publication-like-wrap>
      <button class="publication-like-button reaction-like-button" type="button" data-action="publication-like" data-route="${attr(cleanRoute)}" data-slug="${attr(cleanSlug)}" aria-label="Поставить лайк" aria-pressed="false">
        ${reactionHeartHtml('publication-heart reaction-heart')}<span class="publication-like-count reaction-like-count" data-publication-like-count aria-hidden="true"></span>
      </button>
      <span class="publication-like-popover reaction-like-popover" data-publication-like-tooltip role="tooltip"></span>
    </span>
  </section>`;
}
function publicationLikeIconHtml(user={}){
  return likeIconHtml(user);
}
function publicationLikeItemsHtml(items=[]){
  if(!items.length) return '';
  return items.map(publicationLikeIconHtml).join('');
}
function updatePublicationLikeShells(route='', slug='', payload={}){
  const selector = `[data-publication-like-route="${CSS.escape(String(route || ''))}"][data-publication-like-slug="${CSS.escape(String(slug || ''))}"]`;
  document.querySelectorAll(selector).forEach(shell => {
    const count = Number(payload.like_count || 0);
    const liked = Boolean(payload.liked_by_me);
    shell.querySelectorAll('[data-publication-like-count]').forEach(node => {
      node.textContent = likeCountLabel(count);
    });
    shell.querySelectorAll('.publication-like-button').forEach(button => {
      button.classList.toggle('is-liked', liked);
      button.setAttribute('aria-pressed', liked ? 'true' : 'false');
      button.setAttribute('aria-label', liked ? `Убрать лайк, всего ${count}` : `Поставить лайк, всего ${count}`);
      button.removeAttribute('title');
    });
    const tooltip = shell.querySelector('[data-publication-like-tooltip]');
    if(tooltip && (tooltip.dataset.loaded === '1' || Array.isArray(payload.items))){
      tooltip.innerHTML = likeTooltipItemsHtml(payload.items || [], {action:'publication-likes', route, slug, count});
      tooltip.dataset.loaded = '1';
    }
  });
}
async function loadPublicationLikes(route='', slug='', root=document){
  const cleanRoute = cleanText(route);
  const cleanSlug = cleanText(slug);
  if(!publicationLikesEnabled(cleanRoute) || !cleanSlug) return null;
  bindPublicationLikeTooltips(root);
  try{
    const payload = await api(`/api/community/publications/likes?route=${encodeURIComponent(cleanRoute)}&slug=${encodeURIComponent(cleanSlug)}`);
    updatePublicationLikeShells(cleanRoute, cleanSlug, payload);
    return payload;
  }catch(error){
    return null;
  }
}
async function loadPublicationLikeTooltip(wrap){
  if(!likesPopoverAllowed()) return;
  const shell = wrap?.closest?.('[data-publication-like-route][data-publication-like-slug]');
  const tooltip = shell?.querySelector?.('[data-publication-like-tooltip]');
  if(!shell || !tooltip || tooltip.dataset.loading === '1' || tooltip.dataset.loaded === '1') return;
  const route = shell.dataset.publicationLikeRoute || '';
  const slug = shell.dataset.publicationLikeSlug || '';
  tooltip.dataset.loading = '1';
  try{
    const payload = await api(`/api/community/publications/likes?route=${encodeURIComponent(route)}&slug=${encodeURIComponent(slug)}`);
    updatePublicationLikeShells(route, slug, payload);
    if(wrap?.classList?.contains('is-open')) showReactionLikePopover(wrap, tooltip.innerHTML || '');
  }catch(error){
    tooltip.textContent = '';
  }finally{
    tooltip.dataset.loading = '0';
  }
}
function bindPublicationLikeTooltips(root=document){
  root.querySelectorAll('[data-publication-like-wrap]').forEach(wrap => {
    if(wrap.dataset.tooltipBound === '1') return;
    wrap.dataset.tooltipBound = '1';
    let closeTimer = 0;
    const open = () => {
      if(!likesPopoverAllowed()) return;
      window.clearTimeout(closeTimer);
      wrap.classList.add('is-open');
      const html = wrap.querySelector('[data-publication-like-tooltip]')?.innerHTML || '';
      if(html) showReactionLikePopover(wrap, html);
      loadPublicationLikeTooltip(wrap);
    };
    const close = () => {
      if(!likesPopoverAllowed()) return;
      window.clearTimeout(closeTimer);
      closeTimer = window.setTimeout(() => {
        wrap.classList.remove('is-open');
        hideReactionLikePopoverSoon();
      }, 180);
    };
    wrap.addEventListener('pointerenter', open);
    wrap.addEventListener('pointerleave', close);
    wrap.addEventListener('focusin', open);
    wrap.addEventListener('focusout', event => {
      if(!wrap.contains(event.relatedTarget)) close();
    });
  });
}
async function likePublication(button){
  if(!state.user){ publicLoginModal(); return; }
  const route = cleanText(button.dataset.route || '');
  const slug = cleanText(button.dataset.slug || '');
  if(!publicationLikesEnabled(route) || !slug) return;
  try{
    button.disabled = true;
    const payload = await api('/api/community/publications/like', {method:'POST', body:{target_route:route, target_slug:slug}});
    updatePublicationLikeShells(route, slug, payload);
  }catch(error){
    say(error.message || 'Не удалось поставить лайк.', 'danger');
  }finally{
    button.disabled = false;
    button.blur?.();
  }
}
async function publicationLikesModal(button){
  if(!state.user){ publicLoginModal(); return; }
  const route = cleanText(button.dataset.route || '');
  const slug = cleanText(button.dataset.slug || '');
  if(!publicationLikesEnabled(route) || !slug) return;
  openModal('Лайки', loading('Открываю список…'), {compact:true});
  try{
    const payload = await api(`/api/community/publications/likes?route=${encodeURIComponent(route)}&slug=${encodeURIComponent(slug)}`);
    openModal('Лайки', likeFullListHtml(payload.items || []) || empty('Лайков пока нет.'), {compact:true});
  }catch(error){
    openModal('Лайки', problem(error.message), {compact:true});
  }
}

function subscriptionKey(type, route, slug=''){
  return `${type}:${route}:${slug || ''}`;
}
function activeSubscription(type, route, slug=''){
  const key = subscriptionKey(type, route, slug);
  return (state.subscriptions || []).find(item => subscriptionKey(item.target_type, item.target_route, item.target_slug) === key && item.active !== false);
}
async function loadNotifications(silent=false){
  if(!isPublicUser()){ resetCommunityState(); syncHeaderControls(); return null; }
  try{
    const payload = await api('/api/community/notifications');
    state.notifications = {unread_count:Number(payload.unread_count || 0), items:payload.items || []};
    syncHeaderControls();
    return payload;
  }catch(error){
    if(!silent) say(error.message || 'Не удалось открыть уведомления.', 'danger');
    return null;
  }
}
async function loadMessageSummary(silent=false){
  if(!isPublicUser()){ state.messages = {unread_count:0}; syncHeaderControls(); return null; }
  try{
    const payload = await api('/api/community/messages/summary');
    state.messages = {unread_count:Number(payload.unread_count || 0), is_admin:Boolean(payload.is_admin)};
    syncHeaderControls();
    return payload;
  }catch(error){
    if(!silent) say(error.message || 'Не удалось проверить сообщения.', 'danger');
    return null;
  }
}
async function loadSubscriptions(silent=false){
  if(!isPublicUser()){ state.subscriptions = []; syncHeaderControls(); return null; }
  try{
    const payload = await api('/api/community/subscriptions');
    state.subscriptions = payload.items || [];
    syncHeaderControls();
    return payload;
  }catch(error){
    if(!silent) say(error.message || 'Не удалось открыть подписки.', 'danger');
    return null;
  }
}
async function refreshCommunityUserData(){
  if(!isPublicUser()){ resetCommunityState(); return; }
  await Promise.all([loadNotifications(true), loadMessageSummary(true), loadSubscriptions(true)]);
}
function refreshCommunityBadgesSilently(){
  if(document.hidden || document.body.classList.contains('auth-pending') || !isPublicUser()) return;
  loadNotifications(true).catch(() => {});
  if(state.route !== 'messages') loadMessageSummary(true).catch(() => {});
}
setInterval(refreshCommunityBadgesSilently, 8000);
document.addEventListener('visibilitychange', () => {
  if(!document.hidden){
    refreshCommunityBadgesSilently();
    if(state.route === 'messages' && typeof window.loadCommunityMessages === 'function'){
      window.loadCommunityMessages(state.communityMessagesThreadId || '', {silent:true, force:true}).catch(() => {});
    }
  }
});
window.addEventListener('focus', () => {
  refreshCommunityBadgesSilently();
  if(state.route === 'messages' && typeof window.loadCommunityMessages === 'function'){
    window.loadCommunityMessages(state.communityMessagesThreadId || '', {silent:true, force:true}).catch(() => {});
  }
});
function subscriptionButtonHtml(type, route, slug='', label='Следить'){
  if(!isPublicUser()){
    return '';
  }
  const active = Boolean(activeSubscription(type, route, slug));
  const actionLabel = active ? 'Не следить' : label;
  return `<button class="plain subscription-button ${active ? 'is-active' : ''}" type="button" data-action="subscription-toggle" data-type="${attr(type)}" data-route="${attr(route)}" data-slug="${attr(slug)}" data-active="${active ? '0' : '1'}" aria-pressed="${active ? 'true' : 'false'}" aria-label="${attr(actionLabel)}">${active ? 'Вы следите' : esc(label)}</button>`;
}
function subscriptionStrip(type, route, slug='', label='Следить'){
  const button = subscriptionButtonHtml(type, route, slug, label);
  return button ? `<div class="subscription-strip">${button}</div>` : '';
}
async function toggleSubscription(button){
  if(!isPublicUser()){ publicLoginModal(); return; }
  const type = button.dataset.type || '';
  const route = button.dataset.route || '';
  const slug = button.dataset.slug || '';
  const active = button.dataset.active === '1';
  try{
    button.disabled = true;
    const payload = await api('/api/community/subscriptions', {method:'POST', body:{target_type:type, target_route:route, target_slug:slug, active, email_enabled:type === 'section'}});
    state.subscriptions = payload.items || [];
    syncHeaderControls();
    render();
    say(active ? 'Подписка включена.' : 'Подписка отключена.', 'success');
  }catch(error){
    say(error.message || 'Не удалось изменить подписку.', 'danger');
  }finally{
    button.disabled = false;
  }
}
async function removeSubscription(type, route, slug=''){
  if(!isPublicUser()) return;
  try{
    const payload = await api('/api/community/subscriptions', {method:'POST', body:{target_type:type, target_route:route, target_slug:slug, active:false}});
    state.subscriptions = payload.items || [];
    subscriptionsModal();
  }catch(error){ say(error.message || 'Не удалось отключить подписку.', 'danger'); }
}
async function updateSubscriptionEmail(button){
  if(!isPublicUser()) return;
  const type = button.dataset.type || '';
  const route = button.dataset.route || '';
  const slug = button.dataset.slug || '';
  const emailEnabled = button.dataset.email === '1';
  try{
    const payload = await api('/api/community/subscriptions', {method:'POST', body:{target_type:type, target_route:route, target_slug:slug, active:true, email_enabled:emailEnabled}});
    state.subscriptions = payload.items || [];
    subscriptionsModal();
  }catch(error){ say(error.message || 'Не удалось обновить письма.', 'danger'); }
}
function notificationItemHtml(item){
  const unread = !item.read_at;
  const href = item.url || '#';
  const targetAttrs = `href="${attr(href)}" data-action="notification-go" data-id="${attr(item.id)}"`;
  const stamp = item.event_at || item.created_at || item.updated_at;
  const isCommentLike = item.kind === 'comment_like';
  const isQuestionModeration = item.kind === 'question_moderation';
  const hasLikeActor = isCommentLike && Boolean(item.actor?.display_name || item.actor?.nickname);
  const hasQuestionActor = isQuestionModeration && Boolean(item.actor?.display_name || item.actor?.nickname);
  const titleHtml = hasLikeActor
    ? notificationLikeTitleHtml(item)
    : hasQuestionActor
      ? notificationQuestionTitleHtml(item)
      : `<a class="notification-title" ${targetAttrs}>${esc(item.title || 'Уведомление')}</a>`;
  const bodyHtml = !hasLikeActor && item.body
    ? `<a class="notification-body" ${targetAttrs}>${esc(short(item.body, 140))}</a>`
    : '';
  const readMark = unread
    ? `<button class="notification-read-mark" type="button" data-action="notification-read" data-id="${attr(item.id)}" aria-label="Отметить как прочитанное" title="Отметить как прочитанное"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-11"/></svg></button>`
    : '';
  return `<article class="notification-item ${unread ? 'is-unread' : 'is-read'}">
    <div class="notification-main">
      ${titleHtml}
      ${bodyHtml}
      <a class="notification-time" ${targetAttrs}>${time(stamp)}</a>
    </div>
    ${readMark}
  </article>`;
}
function notificationPeopleWord(count){
  const value = Math.abs(Number(count || 0));
  const mod10 = value % 10;
  const mod100 = value % 100;
  if(mod10 === 1 && mod100 !== 11) return 'человек';
  if(mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'человека';
  return 'человек';
}
function notificationLikeTitleHtml(item){
  const actorHtml = notificationActorLinkHtml(item);
  const count = Math.max(1, Number(item.count || 1));
  const extraCount = Math.max(0, count - 1);
  const extraHtml = extraCount
    ? `<span class="notification-like-extra"> и ещё ${esc(extraCount)} ${notificationPeopleWord(extraCount)}</span>`
    : '';
  const action = extraCount ? 'оставили лайк вашему комментарию' : 'оставил(а) лайк вашему комментарию';
  return `<strong class="notification-title notification-like-title">${actorHtml}${extraHtml}<span> ${action}</span></strong>`;
}
function notificationQuestionTitleHtml(item){
  return `<strong class="notification-title notification-like-title">${notificationActorLinkHtml(item)}<span> задал вопрос</span></strong>`;
}
function notificationActorLinkHtml(item){
  const actor = item.actor || {};
  const nickname = cleanText(actor.nickname || '');
  const name = cleanText(actor.display_name || actor.nickname || item.title || 'Участник');
  const profileHref = cleanText(actor.profile_url || (nickname ? routeHref('u', nickname) : ''));
  return profileHref
    ? `<a class="notification-profile-link" href="${attr(profileHref)}" data-action="notification-go" data-id="${attr(item.id)}" ${nickname ? `data-route="u" data-slug="${attr(nickname)}"` : ''}>${esc(name)}</a>`
    : `<span class="notification-profile-link is-static">${esc(name)}</span>`;
}
function notificationEmptyHtml(text='Новых уведомлений нет'){
  return `<div class="notification-empty">${esc(text)}</div>`;
}
function notificationsHtml(items=[]){
  const allItems = Array.isArray(items) ? items : [];
  const unreadItems = allItems.filter(item => !item.read_at);
  const readItems = allItems.filter(item => item.read_at);
  const showRead = Boolean(state.notificationsShowRead);
  const readLimit = 6;
  const visibleItems = showRead ? unreadItems.concat(readItems.slice(0, readLimit)) : unreadItems;
  const readToggle = readItems.length
    ? `<a class="notification-read-toggle" href="#" data-action="notifications-toggle-read">${showRead ? 'Скрыть прочитанные' : 'Показать прочитанные'}</a>`
    : '';
  return `<div class="notifications-panel">
    <div class="notifications-list">${visibleItems.map(notificationItemHtml).join('') || notificationEmptyHtml()}</div>
    ${readToggle ? `<div class="notifications-footer">${readToggle}</div>` : ''}
  </div>`;
}
function notificationsSurfaceHtml(html){
  const unread = unreadNotificationsCount();
  const items = state.notifications.items || [];
  const unreadItems = items.filter(item => !item.read_at);
  const readItems = items.filter(item => item.read_at);
  const visibleCount = state.notificationsShowRead ? unreadItems.length + Math.min(readItems.length, 6) : unreadItems.length;
  const longClass = visibleCount > 6 ? ' is-long' : '';
  const readAll = unread
    ? `<a class="notification-mark-all" href="#" data-action="notifications-read-all">Прочитать всё</a>`
    : '';
  return `<div class="notification-surface${longClass}">
    <header class="notification-surface-head">
      <span class="notification-surface-title">Уведомления${unread ? ` <span class="notification-surface-count">${esc(unread)}</span>` : ''}</span>
      <div class="notification-surface-head-actions">
        ${readAll}
      </div>
    </header>
    <div class="notification-surface-body">${html}</div>
  </div>`;
}
function toggleReadNotifications(){
  state.notificationsShowRead = !state.notificationsShowRead;
  renderNotificationsPanel();
}
function ensureNotificationSheet(){
  let sheet = document.querySelector('#notificationSheet');
  if(sheet) return sheet;
  sheet = document.createElement('div');
  sheet.id = 'notificationSheet';
  sheet.className = 'notification-sheet';
  sheet.hidden = true;
  sheet.innerHTML = `<div class="notification-sheet-backdrop" data-notifications-close></div><div class="notification-sheet-card"></div>`;
  document.body.append(sheet);
  return sheet;
}
function renderNotificationsPanel(html=''){
  const content = notificationsSurfaceHtml(html || notificationsHtml(state.notifications.items || []));
  const sheet = ensureNotificationSheet();
  const panel = document.querySelector('#notificationsPanel');
  if(isMobileViewport()){
    sheet.hidden = true;
    document.body.classList.remove('notifications-open');
    if(panel){
      panel.innerHTML = content;
      panel.hidden = !state.notificationsOpen;
    }
  }else{
    sheet.hidden = true;
    document.body.classList.remove('notifications-open');
    if(panel){
      panel.innerHTML = content;
      panel.hidden = !state.notificationsOpen;
    }
  }
  syncNotificationsButton();
}
function closeNotificationsPanel(){
  if(!state.notificationsOpen) return;
  state.notificationsOpen = false;
  const panel = document.querySelector('#notificationsPanel');
  const sheet = document.querySelector('#notificationSheet');
  if(panel) panel.hidden = true;
  if(sheet) sheet.hidden = true;
  document.body.classList.remove('notifications-open');
  syncNotificationsButton();
}
async function openNotificationsPanel(){
  if(!isPublicUser()){ publicLoginModal(); return; }
  state.notificationsOpen = true;
  state.notificationsShowRead = false;
  closeProfileMenu();
  closeAdminTrafficPanel();
  setMenu(false);
  renderNotificationsPanel((state.notifications.items || []).length ? '' : `<div class="notifications-panel"><div class="notifications-list">${notificationEmptyHtml('Открываю уведомления')}</div></div>`);
  try{
    const payload = await api('/api/community/notifications');
    state.notifications = {unread_count:Number(payload.unread_count || 0), items:payload.items || []};
    renderNotificationsPanel();
  }catch(error){
    renderNotificationsPanel(`<div class="notifications-panel"><div class="notifications-list">${notificationEmptyHtml('Не удалось открыть уведомления')}</div></div>`);
  }
}
function toggleNotificationsPanel(){
  if(state.notificationsOpen){
    closeNotificationsPanel();
  }else{
    openNotificationsPanel();
  }
}
async function markNotificationRead(id){
  if(!isPublicUser() || !id) return;
  try{
    const payload = await api('/api/community/notifications/read', {method:'POST', body:{id}});
    state.notifications = {unread_count:Number(payload.unread_count || 0), items:payload.items || []};
    renderNotificationsPanel();
    if(state.route === 'u' && state.profileTab === 'notifications' && typeof setProfileTab === 'function') setProfileTab('notifications');
  }catch(error){ say(error.message || 'Не удалось отметить уведомление.', 'danger'); }
}
async function markAllNotificationsRead(){
  if(!isPublicUser()) return;
  try{
    const payload = await api('/api/community/notifications/read', {method:'POST', body:{all:true}});
    state.notifications = {unread_count:Number(payload.unread_count || 0), items:payload.items || []};
    state.notificationsShowRead = false;
    renderNotificationsPanel();
    if(state.route === 'u' && state.profileTab === 'notifications' && typeof setProfileTab === 'function') setProfileTab('notifications');
  }catch(error){ say(error.message || 'Не удалось отметить уведомления.', 'danger'); }
}
async function openNotificationLink(link){
  const id = link.dataset.id || '';
  const href = link.getAttribute('href') || '#';
  try{
    if(id){
      const payload = await api('/api/community/notifications/read', {method:'POST', body:{id}});
      state.notifications = {unread_count:Number(payload.unread_count || 0), items:payload.items || []};
    }
  }catch(error){
    // Даже если отметка прочитанного не прошла, ссылку все равно открываем.
  }
  closeNotificationsPanel();
  if(!href || href === '#') return;
  try{
    const url = new URL(href, location.origin);
    if(url.origin !== location.origin){
      window.location.href = href;
      return;
    }
    const parts = url.pathname.split('/').filter(Boolean).map(safeDecode);
    const route = routes.includes(parts[0]) ? parts[0] : 'home';
    const slug = parts[1] || '';
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if(nextUrl !== `${location.pathname}${location.search}${location.hash}`) history.pushState(null, '', nextUrl);
    state.route = route;
    state.slug = slug;
    await renderCurrentRoute();
    if(url.hash){
      setTimeout(() => {
        const target = document.querySelector(url.hash);
        target?.scrollIntoView({block:'center'});
        target?.classList?.add('is-highlighted');
        setTimeout(() => target?.classList?.remove('is-highlighted'), 1600);
      }, 450);
    }
  }catch(error){
    window.location.href = href;
  }
}
function subscriptionsSettingsHtml(){
  const items = state.subscriptions || [];
  return `<div class="subscriptions-settings">
    ${items.map(item => `<div class="subscription-row">
      <a href="${attr(item.url || '#')}"><strong>${esc(item.title || 'Подписка')}</strong><span>${item.target_type === 'section' ? 'раздел' : item.target_type === 'discussion' ? 'обсуждение' : 'публикация'}</span></a>
      <div class="row">
        <button class="plain" type="button" data-action="subscription-email-toggle" data-type="${attr(item.target_type)}" data-route="${attr(item.target_route)}" data-slug="${attr(item.target_slug)}" data-email="${item.email_enabled ? '0' : '1'}">${item.email_enabled ? 'Без писем' : 'С письмами'}</button>
        <button class="plain danger" type="button" data-action="subscription-remove" data-type="${attr(item.target_type)}" data-route="${attr(item.target_route)}" data-slug="${attr(item.target_slug)}">Убрать</button>
      </div>
    </div>`).join('') || empty('Подписок пока нет.')}
  </div>`;
}

function subscriptionsModal(){
  if(!isPublicUser()){
    say('Подписки доступны только участникам сайта.', 'warning');
    return;
  }
  openModal('Подписки', `<div id="subscriptionsModalBody">
    <p class="form-note is-muted">Управляйте подписками на разделы и обсуждения. Письма можно отключить отдельно для каждой.</p>
    ${subscriptionsSettingsHtml()}
    <div class="row" style="margin-top:14px"><button class="secondary" type="button" data-modal-close-local>Закрыть</button></div>
  </div>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
  }});
}

function questionsCommunityShell(section={}, materials=[]){
  const admin = isAdmin();
  const materialCards = materials.map(materialCard).join('');
  return `<section class="questions-hub ${admin ? 'is-admin' : ''}">
    <h1 class="visually-hidden">${esc(publicText(section.title || 'Вопросы'))}</h1>
    <div class="questions-content">
      ${materialCards ? `<div class="content-grid section-grid section-grid-questions questions-materials">${materialCards}</div>` : ''}
      <div class="community-list questions-list" data-questions-list hidden></div>
    </div>
  </section>`;
}

function questionsEmptyHtml(){
  return `<div class="questions-empty">
    <h2>Пока нет опубликованных вопросов</h2>
    <p>Когда вопрос пройдет ответ и публикацию, он появится в этой ленте.</p>
  </div>`;
}
function questionsTopicEmptyHtml(title=''){
  return `<div class="questions-empty">
    <h2>В этой теме пока нет вопросов</h2>
    <p>${esc(title ? `Когда появятся вопросы по теме «${title}», они будут здесь.` : 'Когда появятся вопросы по этой теме, они будут здесь.')}</p>
  </div>`;
}

function activeQuestionTopic(){
  return cleanText(new URLSearchParams(location.search || '').get('topic') || '');
}

function questionTopicItems(){
  const section = state.content?.sections?.questions || {};
  return section?.topics_enabled === true ? sectionTopicList(section) : [];
}

function questionTopicHref(slug=''){
  const cleanSlug = cleanText(slug);
  return cleanSlug ? `${routeHref('questions')}?topic=${encodeURIComponent(cleanSlug)}` : routeHref('questions');
}

function questionTopicLinkHtml(topic={}, count=0, active=false){
  const title = publicText(topic.title || 'Тема');
  return `<a class="question-topic-link ${active ? 'is-active' : ''}" href="${attr(questionTopicHref(topic.slug))}" ${active ? 'aria-current="page"' : ''}>
    <span>${esc(title)}</span><em>${esc(count)}</em>
  </a>`;
}

function questionTopicNavListHtml(items=[]){
  const topics = questionTopicItems();
  if(!topics.length) return '';
  const active = activeQuestionTopic();
  const knownActive = topics.some(topic => topic.slug === active);
  const counts = new Map(topics.map(topic => [topic.slug, 0]));
  items.forEach(item => {
    const slug = cleanText(item.category || item.topic_slug || '');
    if(counts.has(slug)) counts.set(slug, (counts.get(slug) || 0) + 1);
  });
  return `<a class="question-topic-link question-topic-all ${!knownActive ? 'is-active' : ''}" href="${attr(questionTopicHref(''))}" ${!knownActive ? 'aria-current="page"' : ''}>
      <span>Все вопросы</span><em>${esc(items.length)}</em>
    </a>
    ${topics.map(topic => questionTopicLinkHtml(topic, counts.get(topic.slug) || 0, knownActive && active === topic.slug)).join('')}`;
}

function refreshQuestionTopicNav(items=[]){
  const html = questionTopicNavListHtml(items);
  if(!html) return;
  document.querySelectorAll('.topic-nav .topic-nav-list, .mobile-topic-panel .topic-nav-list').forEach(list => {
    list.classList.add('question-topic-list');
    list.innerHTML = html;
  });
}

function filteredQuestionItems(items=[]){
  const topics = questionTopicItems();
  const active = activeQuestionTopic();
  if(!active || !topics.some(topic => topic.slug === active)) return items;
  return items.filter(item => cleanText(item.category || item.topic_slug || '') === active);
}

function activeQuestionTopicTitle(){
  const active = activeQuestionTopic();
  return questionTopicItems().find(topic => topic.slug === active)?.title || '';
}

function questionAuthorName(item={}){
  const author = item.author || {};
  return cleanText(author.display_name || author.nickname || 'Участник');
}

function questionBylineHtml(item={}, options={}){
  const author = item.author || {};
  const nickname = cleanText(author.nickname || '');
  const authorName = questionAuthorName(item);
  if(item.publish_anonymously){
    return `<span class="question-author-label">${options.short ? 'Анонимно' : 'Анонимный вопрос'}</span>`;
  }
  const authorLink = nickname
    ? `<a class="material-head-author" href="${routeHref('u', nickname)}" data-route="u" data-slug="${attr(nickname)}">${esc(authorName)}</a>`
    : `<span class="material-head-author">${esc(authorName)}</span>`;
  return `${options.short ? 'Задал' : 'Вопрос задал'} ${authorLink}`;
}

function questionStatusHtml(item={}){
  if(!isAdmin()) return '';
  if(item.status === 'pending') return '<span class="community-pending-badge">На ответ</span>';
  if(item.status === 'hidden') return '<span class="community-pending-badge">Скрыт</span>';
  return '';
}

function questionCardAuthorHtml(item={}){
  if(item.publish_anonymously){
    return '<span class="question-card-source">Анонимный вопрос</span>';
  }
  const author = item.author || {};
  const nickname = cleanText(author.nickname || '');
  const authorName = questionAuthorName(item);
  return nickname
    ? `<a class="question-card-source material-head-author" href="${routeHref('u', nickname)}" data-route="u" data-slug="${attr(nickname)}">${esc(authorName)}</a>`
    : `<span class="question-card-source">${esc(authorName)}</span>`;
}

function questionAnswerAuthorName(item={}){
  const answerer = item.answerer || {};
  const answererName = cleanText(answerer.display_name || answerer.nickname || '');
  const owner = cleanText(ownerName());
  const answeredBy = cleanText(item.answered_by || '');
  if(answererName) return answererName;
  if(owner) return owner;
  if(answeredBy && answeredBy.toLowerCase() !== 'admin') return answeredBy;
  return 'Павел Рч';
}

function questionAnswerAuthorHtml(item={}){
  const answerer = item.answerer || {};
  const nickname = cleanText(answerer.nickname || '');
  const name = questionAnswerAuthorName(item);
  if(nickname){
    return `<a class="material-head-author" href="${routeHref('u', nickname)}" data-route="u" data-slug="${attr(nickname)}">${esc(name)}</a>`;
  }
  return `<span>${esc(name)}</span>`;
}

function questionHtml(item){
  const href = routeHref('questions', String(item.id || ''));
  return `<article class="question-card question-item ${item.status === 'pending' ? 'is-pending' : ''}" id="question-${attr(item.id)}" data-question-id="${attr(item.id)}" data-question-status="${attr(item.status || '')}" data-question-category="${attr(item.category || '')}">
    <div class="question-card-main">
      <a class="question-card-question" href="${attr(href)}" data-route="questions" data-slug="${attr(item.id)}">
        <h3>${esc(item.question || '')}</h3>
      </a>
      <div class="question-card-bottom">${questionCardAuthorHtml(item)}</div>
    </div>
  </article>`;
}

async function loadPublicQuestions(){
  const list = document.querySelector('[data-questions-list]');
  if(!list) return;
  try{
    const payload = await api('/api/community/questions');
    const items = payload.items || [];
    state.publicQuestions = items;
    refreshQuestionTopicNav(items);
    const visibleItems = filteredQuestionItems(items);
    if(visibleItems.length){
      list.hidden = false;
      list.innerHTML = visibleItems.map(questionHtml).join('');
    }else{
      list.hidden = false;
      list.innerHTML = items.length ? questionsTopicEmptyHtml(activeQuestionTopicTitle()) : questionsEmptyHtml();
    }
  }catch(error){
    list.hidden = false;
    list.innerHTML = empty(error.message || 'Не удалось загрузить вопросы.');
  }
}

function questionAdminActionsHtml(item={}){
  if(!isAdmin()) return '';
  return `<div class="question-admin-actions question-detail-admin-actions">
    <button class="secondary" type="button" data-action="community-question-answer" data-id="${attr(item.id)}">Править</button>
    <button class="plain danger" type="button" data-action="community-question-delete" data-id="${attr(item.id)}">Удалить</button>
  </div>`;
}

function questionDetailHtml(item={}){
  const isPending = item.status === 'pending';
  const isHidden = item.status === 'hidden';
  const status = questionStatusHtml(item);
  const likesHtml = item.status === 'published' ? publicationLikesShell('questions', String(item.id || '')) : '';
  const commentsHtml = !isPending && !isHidden && item.answer
    ? commentsShell('questions', String(item.id || ''), {}, {mini:false})
    : `<section class="community-block community-compact is-disabled"><div class="community-login-note">Комментарии появятся после открытия вопроса.</div></section>`;
  return `<article class="material-page reading-page question-page no-cover" id="question-${attr(item.id)}">
    <div class="material-public-tools">
      <a class="plain material-back-link" href="${routeHref('questions')}" data-route="questions">К вопросам</a>
      <div class="material-top-actions">${questionAdminActionsHtml(item)}</div>
    </div>
    <header class="material-head question-detail-head">
      <section class="question-detail-block" aria-label="Вопрос">
        <div class="question-detail-card">
          <h1 class="material-title question-detail-title">${esc(item.question || 'Вопрос')}</h1>
        </div>
        <div class="question-detail-meta">
          <div class="question-detail-author">
            ${questionBylineHtml(item)}
            ${status}
          </div>
          <span class="question-detail-date">${dateLong(item.created_at)}</span>
        </div>
      </section>
    </header>
    ${item.answer ? `<div class="material-body question-answer">${textToParagraphs(item.answer || '')}<footer class="question-answer-signature"><span>Ответил</span> <strong>${questionAnswerAuthorHtml(item)}</strong></footer></div>` : ''}
    ${likesHtml}
    ${commentsHtml}
  </article>`;
}

async function renderQuestionDetail(id=''){
  const questionId = cleanText(id);
  app.innerHTML = `<section class="gate-card compact">${loading('Открываю вопрос…')}</section>`;
  try{
    const payload = await api(`/api/community/questions/${encodeURIComponent(questionId)}`);
    const item = payload.question || {};
    state.publicQuestions = Array.from(new Map([...(state.publicQuestions || []), item].filter(row => row?.id).map(row => [String(row.id), row])).values());
    app.innerHTML = `${questionDetailHtml(item)}${footer()}`;
    await loadPublicationLikes('questions', String(item.id || questionId), app);
    if(item.status === 'published' && item.answer){
      bindInlineCommentForms(app);
      await loadComments('questions', String(item.id || questionId), app);
    }
  }catch(error){
    app.innerHTML = `<section class="gate-card"><h1>Вопрос не найден</h1><p>${esc(error.message || 'Он мог быть удалён или ещё не опубликован.')}</p><div class="row"><a class="secondary" href="${routeHref('questions')}" data-route="questions">К вопросам</a></div></section>${footer()}`;
  }
}

function questionModal(){
  if(!isPublicUser()){ publicLoginModal(); return; }
  openModal('Задать вопрос', `<form class="form question-submit-form" id="questionForm">
    <label><span>Вопрос</span><textarea name="question" rows="1" required></textarea></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="secondary" type="button" data-modal-close-local>Отмена</button><button class="primary" data-save-content>Отправить</button></div>
  </form>`, {compact:true,kind:'public-question',onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const textarea = root.querySelector('#questionForm textarea[name="question"]');
    const autoGrow = () => {
      if(!(textarea instanceof HTMLTextAreaElement)) return;
      textarea.style.height = 'auto';
      const maxHeight = Number.parseFloat(getComputedStyle(textarea).maxHeight) || 170;
      const nextHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${Math.ceil(nextHeight)}px`;
      textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
    };
    textarea?.addEventListener('input', autoGrow);
    autoGrow();
    root.querySelector('#questionForm')?.addEventListener('submit', event => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      submitSimpleModal(form, form.querySelector('[data-form-feedback]'), '/api/community/questions', {question:data.get('question')}, 'Вопрос отправлен на проверку.', async () => {});
    });
  }});
}

