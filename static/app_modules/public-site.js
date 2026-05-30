function compactPublicText(value, limit=180){
  const text = publicText(value).replace(/\s+/g, ' ').trim();
  if(text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function homeFeaturedHtml(featured, contactHtml=''){
  if(!featured.length) return contactHtml || '';
  const cards = featured.map(item => {
    const title = publicText(item.title || 'Материал');
    const excerpt = compactPublicText(item.excerpt || '', 120);
    return `<article class="hero-featured-item">
      <a class="hero-featured-main" href="${materialHref(item)}" data-route="${attr(item.route)}" data-slug="${attr(item.slug)}">
        <strong>${esc(title)}</strong>
        ${excerpt ? `<p>${esc(excerpt)}</p>` : ''}
      </a>
    </article>`;
  }).join('');
  return `<aside class="hero-featured" aria-label="Избранные материалы">
    <div class="hero-featured-head">
      <div class="hero-featured-title">Избранное</div>
      ${contactHtml}
    </div>
    <div class="hero-featured-list">${cards}</div>
  </aside>`;
}

function renderHome(){
  const hasHeroImage = Boolean(heroImageUrl());
  const kicker = publicText(heroKicker());
  const title = publicText(heroTitle());
  const text = publicText(heroText());
  const primaryLabel = publicText(homePrimaryLabel());
  const primaryAction = homePrimaryAction();
  const primaryRoute = homePrimaryRoute();
  const secondaryLabel = publicText(homeSecondaryLabel());
  const secondaryRoute = homeSecondaryRoute();
  const primaryButton = primaryLabel ? (primaryAction === 'inquiry' ? `<button class="primary" data-action="inquiry" data-route="${attr(primaryRoute)}" data-title="${attr(homePrimaryTitle())}">${esc(primaryLabel)}</button>` : `<a class="primary" href="${routeHref(primaryRoute)}" data-route="${attr(primaryRoute)}">${esc(primaryLabel)}</a>`) : '';
  const secondaryButton = secondaryLabel ? `<a class="secondary" href="${routeHref(secondaryRoute)}" data-route="${attr(secondaryRoute)}">${esc(secondaryLabel)}</a>` : '';
  const actionsHtml = primaryButton || secondaryButton ? `<div class="hero-actions">${primaryButton}${secondaryButton}</div>` : '';
  const featured = homeShowFeatured() ? selectedFeaturedMaterials() : [];
  app.innerHTML = `
    <section class="home-layout">
      <article class="hero-stage panel ${hasHeroImage ? 'has-media' : 'is-text-only'}">
        <div class="hero-copy">
          ${kicker ? `<div class="hero-kicker">${esc(kicker)}</div>` : ''}
          ${title ? `<h1>${esc(title)}</h1>` : `<h1 class="visually-hidden">${esc(siteName())}</h1>`}
          ${text ? `<div class="hero-text">${textToParagraphs(text)}</div>` : ''}
          ${actionsHtml}
          ${homeFeaturedHtml(featured, heroContactActionsHtml())}
        </div>
        ${hasHeroImage ? heroFrameHtml() : ''}
      </article>
    </section>`;
}

function renderLegal(kind){
  const title = kind === 'privacy'
    ? 'Политика обработки персональных данных'
    : kind === 'rules'
      ? 'Правила сайта'
      : 'Согласие на обработку персональных данных';
  app.innerHTML = `<article class="material-page legal-page">
    <h1>${esc(title)}</h1>
    <div class="material-body">${legalBodyHtml(kind)}</div>
  </article>`;
}

function legalBodyHtml(kind){
  const name = esc(siteName());
  if(kind === 'privacy'){
    return `
      <p><strong>${name}</strong> обрабатывает только те данные, которые нужны для работы сайта, публичного сообщества, заявок и закрытого клиентского доступа. Оператор сайта: администрация сайта ${name}. Связаться по вопросам персональных данных можно через форму заявки или через тот канал связи, который уже используется для общения с администрацией.</p>
      <h2>Какие данные обрабатываются</h2>
      <ul>
        <li>при регистрации: почта, пароль в защищенном виде, публичное имя, ник, дата регистрации, технический статус аккаунта;</li>
        <li>в публичном профиле: имя, ник, фото или монограмма, описание о себе, статус доверенного профиля, публичные комментарии, вопросы и лайки;</li>
        <li>в заявках: имя, контакт, текст сообщения, выбранный материал или раздел;</li>
        <li>в закрытом клиентском доступе: данные, сообщения, платежные отметки и рабочие записи, которые нужны для сопровождения клиента;</li>
        <li>технически: IP-адрес, время действий, данные сессии, защитные журналы сервера и браузерный токен входа.</li>
      </ul>
      <h2>Зачем это нужно</h2>
      <p>Данные используются для регистрации и входа, защиты от спама, модерации, публикации комментариев и вопросов, ответа на заявки, отправки кодов входа и важных уведомлений, работы подписок и закрытого клиентского доступа.</p>
      <h2>Что видно другим</h2>
      <p>Другим посетителям могут быть видны только публичные данные: имя, ник, фото профиля, описание, опубликованные комментарии, опубликованные вопросы, лайки и публичный статус профиля. Почта, контакт из заявки, пароль, технические журналы и закрытые клиентские данные не публикуются.</p>
      <h2>Файлы cookie и счетчики</h2>
      <p>Сайт использует техническую сессию и хранение входа в браузере, чтобы пользователь оставался авторизованным. Для администратора ведется внутренний счетчик посещений без внешних аналитических сервисов: открытый IP-адрес в нем не публикуется, а посетитель учитывается по техническому отпечатку. Google Analytics, Яндекс.Метрика и другие внешние счетчики на сайте не подключены. Если такие сервисы появятся, политика будет обновлена до подключения.</p>
      <h2>Передача данных</h2>
      <p>Данные не продаются и не передаются посторонним для рекламы. Технически данные могут обрабатываться хостингом, почтовым сервисом и средствами защиты сайта. Трансграничная передача специально не используется; иностранные аналитические сервисы не подключены.</p>
      <h2>Сроки и права</h2>
      <p>Данные хранятся, пока нужен аккаунт, заявка, клиентский доступ или защита сайта. Пользователь может попросить изменить, удалить, ограничить обработку данных или отозвать согласие. После отзыва часть данных может временно сохраняться в журналах и резервных копиях, если это нужно для безопасности и учета действий.</p>
      <p>Актуальная редакция: 30 апреля 2026 года.</p>`;
  }
  if(kind === 'personal-data-consent'){
    return `
      <p>Оставляя заявку, регистрируясь или публикуя материалы на сайте ${name}, пользователь дает администрации сайта согласие на обработку персональных данных на условиях ниже.</p>
      <h2>Состав данных</h2>
      <p>Согласие относится к данным, которые пользователь сам вводит на сайте: почта, имя, ник, пароль в защищенном виде, фото профиля, описание о себе, контакт для ответа, текст заявки, комментарии, вопросы, лайки, настройки подписок и технические данные входа.</p>
      <h2>Действия с данными</h2>
      <p>Разрешаются сбор, запись, хранение, уточнение, использование, публикация разрешенных публичных данных, блокирование, удаление и техническая передача тем сервисам, без которых сайт не может работать: хостингу, почтовой отправке и средствам защиты.</p>
      <h2>Публичная публикация</h2>
      <p>Пользователь отдельно разрешает показывать неопределенному кругу лиц свое публичное имя, ник, фото профиля, описание, опубликованные комментарии, опубликованные вопросы, лайки и публичный статус профиля. Почта, контакт из заявки, пароль и закрытые клиентские данные в это разрешение не входят.</p>
      <h2>Цель</h2>
      <p>Цель обработки: регистрация, вход, работа публичного профиля, публикация комментариев и вопросов, ответы на заявки, модерация, защита от спама, уведомления, подписки и закрытый клиентский доступ.</p>
      <h2>Срок</h2>
      <p>Согласие действует до его отзыва или до удаления аккаунта, если закон или безопасность сайта не требуют временно сохранить отдельные записи. Отозвать согласие можно через обращение к администрации сайта.</p>`;
  }
  return `
    <p>Регистрация дает публичный профиль для комментариев, вопросов, лайков и подписок. Она не открывает закрытый клиентский доступ.</p>
    <h2>Публичные материалы</h2>
    <p>Комментарии и вопросы проходят модерацию, если профиль еще не доверенный. Доверенный статус может быть включен или снят администрацией вручную.</p>
    <h2>Нельзя</h2>
    <ul>
      <li>публиковать чужие телефоны, адреса, почту, документы, личные переписки и фотографии без согласия людей на них;</li>
      <li>выдавать себя за другого человека;</li>
      <li>оставлять спам, угрозы, оскорбления и материалы, нарушающие закон;</li>
      <li>использовать сайт для сбора чужих персональных данных.</li>
    </ul>
    <p>Такие материалы могут быть скрыты, а профиль заблокирован. Личные переписки между пользователями в этой версии сайта не работают.</p>`;
}

function profileName(profile={}){
  return cleanText(profile.display_name || profile.nickname || 'Пользователь');
}
function profileInitialFrom(profile={}){
  const source = profileName(profile);
  return (source[0] || 'У').toUpperCase();
}
function profileAvatarHtml(profile={}, size='xl'){
  const url = cleanText(profile.avatar_url);
  const name = profileName(profile);
  if(url){
    return `<span class="profile-photo profile-photo-${attr(size)}"><img src="${attr(url)}" alt="${attr(name)}" loading="lazy" decoding="async"></span>`;
  }
  return `<span class="profile-monogram profile-photo-${attr(size)}">${esc(profileInitialFrom(profile))}</span>`;
}
function profileIdentityPhotoHtml(profile={}){
  const url = cleanText(profile.avatar_url);
  const name = profileName(profile);
  if(url){
    return `<button class="profile-identity-photo" type="button" data-action="image-lightbox" data-image-url="${attr(url)}" data-image-alt="${attr(name)}" aria-label="Открыть фото профиля"><img src="${attr(url)}" alt="${attr(name)}" loading="lazy" decoding="async"></button>`;
  }
  return `<span class="profile-identity-photo is-empty">${esc(profileInitialFrom(profile))}</span>`;
}
function profileStatusText(item={}){
  return cleanText(item.status_label || '');
}
function profileFeedMetaHtml(item={}){
  const date = time(item.answered_at || item.moderated_at || item.updated_at || item.created_at);
  const status = profileStatusText(item);
  return `<span class="profile-feed-meta"><em>${date}</em>${status ? `<b>${esc(status)}</b>` : ''}</span>`;
}
function profileFeedRowShell(item={}, inner='', options={}){
  const route = cleanText(item.target_route);
  const slug = cleanText(item.target_slug);
  const url = cleanText(item.target_url || (options.publicLink ? routeHref(route, slug) : ''));
  const classes = ['profile-feed-row', options.className || '', item.status ? `is-${cleanText(item.status).replace(/[^a-z0-9_-]/gi, '')}` : ''].filter(Boolean).join(' ');
  const actionHtml = options.canHide ? `<button class="profile-feed-hide" type="button" data-action="profile-activity-hide" data-kind="${attr(options.itemType || '')}" data-id="${attr(item.id || '')}" aria-label="Скрыть из профиля" title="Скрыть из профиля">...</button>` : '';
  const rowHtml = url
    ? `<a class="${attr(classes)}" href="${attr(url)}" data-route="${attr(route || options.route || '')}" data-slug="${attr(slug || options.slug || '')}">${inner}</a>`
    : `<div class="${attr(classes)}">${inner}</div>`;
  if(actionHtml){
    return `<div class="profile-feed-item">${rowHtml}${actionHtml}</div>`;
  }
  if(url){
    return rowHtml;
  }
  return rowHtml;
}
function profileCommentActivityHtml(item, options={}){
  const route = cleanText(item.target_route);
  const slug = cleanText(item.target_slug);
  const inner = `<strong>${esc(item.target_title || 'Материал')}</strong>
    <span>${esc(short(item.body || '', options.compact ? 110 : 150))}</span>
    ${profileFeedMetaHtml(item)}`;
  return profileFeedRowShell(item, inner, {publicLink:options.publicLink !== false, route, slug, canHide:options.canHide, itemType:'comment'});
}
function profileQuestionActivityHtml(item, options={}){
  const text = item.answer ? short(item.answer, options.compact ? 110 : 150) : 'Ответ пока не опубликован.';
  const inner = `<strong>${esc(short(item.question || 'Вопрос', options.compact ? 95 : 120))}</strong>
    <span>${esc(text)}</span>
    ${profileFeedMetaHtml(item)}`;
  return profileFeedRowShell(item, inner, {publicLink:options.publicLink !== false, route:'questions', slug:String(item.id || ''), canHide:options.canHide, itemType:'question'});
}
function normalizeProfileTab(tab='public'){
  const clean = cleanText(tab || 'public');
  if(clean === 'cabinet' || clean === 'overview') return 'public';
  if(['public', 'messages', 'notifications', 'settings'].includes(clean)) return clean;
  return 'public';
}
function profileMessageThreadFromLocation(){
  const value = new URLSearchParams(location.search || '').get('thread') || '';
  return /^\d+$/.test(value) ? value : '';
}
function profileTabFromLocation(){
  return normalizeProfileTab(new URLSearchParams(location.search || '').get('tab') || 'public');
}
function profileTabUrl(tab='public', nickname=''){
  const url = new URL(location.href);
  url.pathname = routePath('u', cleanText(nickname || state.slug || ''));
  const nextTab = normalizeProfileTab(tab);
  if(nextTab === 'public') url.searchParams.delete('tab');
  else url.searchParams.set('tab', nextTab);
  if(nextTab !== 'messages') url.searchParams.delete('thread');
  return `${url.pathname}${url.search}`;
}
function syncProfileTabUrl(tab='public', nickname='', options={}){
  const nextUrl = profileTabUrl(tab, nickname);
  const currentUrl = `${location.pathname}${location.search}`;
  if(nextUrl !== currentUrl) history[options.replace ? 'replaceState' : 'pushState']({}, '', nextUrl);
}
function profileTabsFor(isOwnProfile=false){
  if(isOwnProfile && isPublicUser()){
    return [
      ['public', 'Публичный вид'],
      ['notifications', 'Уведомления'],
      ['settings', 'Настройки'],
    ];
  }
  return [];
}
function profileTopbarHtml(activeTab='public', isOwnProfile=false){
  const tabs = profileTabsFor(isOwnProfile);
  if(tabs.length < 2) return '';
  const currentTab = normalizeProfileTab(activeTab);
  const buttonHtml = ([key,label]) => `<button class="plain profile-nav-link ${currentTab === key ? 'active' : ''}" data-action="profile-tab" data-tab="${attr(key)}" ${currentTab === key ? 'aria-current="page"' : ''}><span>${esc(label)}</span></button>`;
  return `<div class="profile-topbar">
    <nav class="profile-tabs" aria-label="Разделы профиля">${tabs.map(buttonHtml).join('')}</nav>
  </div>`;
}
function profileIdentityHtml(profile={}){
  return `<aside class="profile-identity-rail">
    ${profileIdentityPhotoHtml(profile)}
  </aside>`;
}
function profileWorkspaceHeadHtml(profile={}, activeTab='public', isOwnProfile=false){
  const onlineHtml = profile.online === true ? '<span class="profile-online-status">онлайн</span>' : '';
  return `<header class="profile-workspace-head">
    <div class="profile-name-slot"><h1>${esc(profileName(profile))}</h1>${onlineHtml}</div>
    ${profileTopbarHtml(activeTab, isOwnProfile)}
  </header>`;
}
function profilePublicPageHtml(profile={}, activity={}, isOwnProfile=false){
  const comments = Array.isArray(activity.comments) ? activity.comments : [];
  const questions = Array.isArray(activity.questions) ? activity.questions : [];
  const latest = [...comments.map(item => ({kind:'comment', item})), ...questions.map(item => ({kind:'question', item}))]
    .sort((left, right) => String(right.item.answered_at || right.item.created_at || '').localeCompare(String(left.item.answered_at || left.item.created_at || '')))
    .slice(0, 12);
  const latestHtml = latest.map(row => row.kind === 'question'
    ? profileQuestionActivityHtml(row.item, {compact:true, canHide:isOwnProfile})
    : profileCommentActivityHtml(row.item, {compact:true, canHide:isOwnProfile})
  ).join('');
  if(!latestHtml) return '';
  return `<div class="profile-content-grid profile-public-grid">
    <section class="profile-section is-wide">
      <div class="profile-section-head"><h3>Лента</h3></div>
      <div class="profile-feed-list">${latestHtml}</div>
    </section>
  </div>`;
}
function profileNotificationPeopleWord(count){
  const value = Math.abs(Number(count || 0));
  const mod10 = value % 10;
  const mod100 = value % 100;
  if(mod10 === 1 && mod100 !== 11) return 'человек';
  if(mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'человека';
  return 'человек';
}
function profileNotificationLinkAttrs(item={}, href=''){
  return `href="${attr(href || item.url || '#')}" data-action="notification-go" data-id="${attr(item.id || '')}"`;
}
function profileNotificationActorHtml(item={}){
  const actor = item.actor || {};
  const nickname = cleanText(actor.nickname || '');
  const name = cleanText(actor.display_name || actor.nickname || 'Участник');
  const href = cleanText(actor.profile_url || (nickname ? routeHref('u', nickname) : ''));
  if(href){
    return `<a class="profile-event-link profile-event-actor" ${profileNotificationLinkAttrs(item, href)}>${esc(name)}</a>`;
  }
  return `<span class="profile-event-link is-static">${esc(name)}</span>`;
}
function profileNotificationRowShell(item={}, titleHtml='', bodyHtml=''){
  const unread = !item.read_at;
  const stamp = item.event_at || item.updated_at || item.created_at;
  const targetAttrs = profileNotificationLinkAttrs(item);
  return `<article class="profile-feed-row profile-notification-row ${unread ? 'is-unread' : ''}">
    <div class="profile-notification-main">
      ${titleHtml}
      ${bodyHtml}
    </div>
    <span class="profile-feed-meta"><a ${targetAttrs}>${time(stamp)}</a>${unread ? '<b>новое</b>' : ''}</span>
  </article>`;
}
function profileNotificationLikeRowHtml(item={}){
  const count = Math.max(1, Number(item.count || 1));
  const extraCount = Math.max(0, count - 1);
  const actorHtml = profileNotificationActorHtml(item);
  const extraHtml = extraCount ? `<span class="profile-event-extra"> и ещё ${esc(extraCount)} ${profileNotificationPeopleWord(extraCount)}</span>` : '';
  const action = extraCount ? 'оставили лайк вашему комментарию' : 'оставил(а) лайк вашему комментарию';
  const titleHtml = `<strong class="profile-notification-title">${actorHtml}${extraHtml}<span> ${action}</span></strong>`;
  const bodyHtml = `<a class="profile-notification-body" ${profileNotificationLinkAttrs(item)}>Открыть комментарий</a>`;
  return profileNotificationRowShell(item, titleHtml, bodyHtml);
}
function profileNotificationQuestionRowHtml(item={}){
  const titleHtml = `<strong class="profile-notification-title">${profileNotificationActorHtml(item)}<span> задал вопрос</span></strong>`;
  const body = cleanText(item.body || item.target_title || 'Открыть вопрос');
  const bodyHtml = `<a class="profile-notification-body" ${profileNotificationLinkAttrs(item)}>${esc(short(body, 130))}</a>`;
  return profileNotificationRowShell(item, titleHtml, bodyHtml);
}
function profileNotificationDefaultRowHtml(item={}){
  const title = item.kind === 'section_material' && item.target_title
    ? `Новый материал: ${item.target_title}`
    : (item.title || 'Уведомление');
  const targetAttrs = profileNotificationLinkAttrs(item);
  const titleHtml = `<a class="profile-notification-title" ${targetAttrs}>${esc(title)}</a>`;
  const bodyHtml = item.body ? `<a class="profile-notification-body" ${targetAttrs}>${esc(short(item.body, 130))}</a>` : '';
  return profileNotificationRowShell(item, titleHtml, bodyHtml);
}
function profileNotificationRowHtml(item={}){
  if(item.kind === 'comment_like' && (item.actor?.display_name || item.actor?.nickname)) return profileNotificationLikeRowHtml(item);
  if(item.kind === 'question_moderation' && (item.actor?.display_name || item.actor?.nickname)) return profileNotificationQuestionRowHtml(item);
  return profileNotificationDefaultRowHtml(item);
}
function profileNotificationRowsHtml(){
  const items = state.notifications?.items || [];
  return items.map(profileNotificationRowHtml).join('') || `<p class="profile-quiet">Новых уведомлений нет.</p>`;
}
function profileSubscriptionRowsHtml(limit=6){
  const items = state.subscriptions || [];
  return items.slice(0, limit).map(item => `<a class="profile-info-row" href="${attr(item.url || '#')}"><strong>${esc(item.title || 'Подписка')}</strong><span>${item.target_type === 'section' ? 'раздел' : item.target_type === 'discussion' ? 'обсуждение' : 'публикация'}${item.email_enabled ? ' · письма включены' : ' · без писем'}</span></a>`).join('') || `<p class="profile-quiet">Подписок пока нет.</p>`;
}
function profileNotificationsHtml(payload={}){
  return `<div class="profile-content-grid profile-notifications-grid">
    <section class="profile-section is-wide profile-notifications-section">
      <div class="profile-section-head"><h3>События</h3>${Number(state.notifications?.unread_count || 0) ? '<button class="plain client-compact-action" data-action="notifications-read-all">Прочитать</button>' : ''}</div>
      <div class="profile-feed-list profile-notification-list">${profileNotificationRowsHtml()}</div>
    </section>
  </div>`;
}
function profileMessagesLoadingHtml(){
  return `<div class="profile-content-grid profile-messages-grid">
    <section class="profile-section is-wide profile-messages-section">
      <p class="profile-quiet">Открываю сообщения...</p>
    </section>
  </div>`;
}
function profileMessageUserName(user={}){
  return cleanText(user.display_name || user.nickname || 'Пользователь');
}
function profileMessageThreadRowHtml(thread={}, selectedId=''){
  const active = String(thread.user_id || '') === String(selectedId || '');
  const unread = Number(thread.unread_count || 0);
  return `<button class="profile-message-thread-row ${active ? 'active' : ''}" type="button" data-action="profile-message-thread" data-id="${attr(thread.user_id || '')}" aria-pressed="${active ? 'true' : 'false'}">
    <span><strong>${esc(profileMessageUserName(thread))}</strong><em>${esc(short(thread.last_body || '', 88) || 'Сообщение')}</em></span>
    <small>${unread ? esc(unread) : esc(time(thread.last_at))}</small>
  </button>`;
}
function profileMessageBubbleHtml(message={}){
  const own = Boolean(message.own);
  const author = message.author || {};
  return `<article class="profile-message-row ${own ? 'is-own' : 'is-other'}">
    <div>
      <strong>${esc(profileMessageUserName(author))}</strong>
      <p>${esc(message.body || '')}</p>
      <span>${esc(time(message.created_at))}</span>
    </div>
  </article>`;
}
function profileMessageFormHtml(threadId=''){
  return `<form class="profile-message-form" id="profileMessageForm" data-thread-id="${attr(threadId || '')}">
    <label><span class="visually-hidden">Сообщение</span><textarea name="body" rows="3" placeholder="Напишите сообщение" required></textarea></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary client-compact-action" type="submit" data-save-content>Отправить</button></div>
  </form>`;
}
function profileMessagesHtml(payload={}){
  const isAdminMessages = Boolean(payload.is_admin);
  const selectedId = String(payload.selected_thread_user_id || '');
  const selectedUser = payload.selected_user || {};
  const threads = Array.isArray(payload.threads) ? payload.threads : [];
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const threadList = isAdminMessages ? `<section class="profile-section profile-message-threads">
    <div class="profile-section-head"><h3>Люди</h3></div>
    <div class="profile-message-thread-list">${threads.map(thread => profileMessageThreadRowHtml(thread, selectedId)).join('') || '<p class="profile-quiet">Переписок пока нет.</p>'}</div>
  </section>` : '';
  const title = isAdminMessages
    ? (selectedUser.id ? profileMessageUserName(selectedUser) : 'Сообщения')
    : 'Переписка с владельцем сайта';
  const emptyText = isAdminMessages ? 'Выберите переписку.' : 'Сообщений пока нет.';
  const form = (!isAdminMessages || selectedUser.id) ? profileMessageFormHtml(selectedId) : '';
  return `<div class="profile-content-grid profile-messages-grid ${isAdminMessages ? 'is-admin' : ''}">
    ${threadList}
    <section class="profile-section is-wide profile-messages-section">
      <div class="profile-section-head"><h3>${esc(title)}</h3></div>
      <div class="profile-message-list">${messages.map(profileMessageBubbleHtml).join('') || `<p class="profile-quiet">${esc(emptyText)}</p>`}</div>
      ${form}
    </section>
  </div>`;
}
function communityMessagesThreadFromLocation(){
  const value = new URLSearchParams(location.search || '').get('thread') || '';
  return /^\d+$/.test(value) ? value : '';
}
function communityMessagesUrl(threadId='', channel=''){
  const clean = String(threadId || '').trim();
  const selectedChannel = channel === 'support' ? 'support' : 'owner';
  const params = new URLSearchParams();
  if(selectedChannel === 'support') params.set('channel', selectedChannel);
  if(clean) params.set('thread', clean);
  const query = params.toString();
  return query ? routeHref('messages', '', {params:query}) : routeHref('messages');
}
function communityMessageRelativeTime(value=''){
  const raw = cleanText(value || '');
  if(!raw) return '';
  const dateValue = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
  if(Number.isNaN(dateValue.getTime())) return time(raw);
  const diffMs = Math.max(0, Date.now() - dateValue.getTime());
  const minutes = Math.floor(diffMs / 60000);
  if(minutes < 1) return 'сейчас';
  if(minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if(hours < 24) return `${hours} ч`;
  const days = Math.floor(hours / 24);
  return `${days} д`;
}
function updateCommunityRelativeTimes(root=document){
  root.querySelectorAll?.('[data-relative-time]').forEach(node => {
    const source = node.getAttribute('datetime') || node.dataset.relativeTime || '';
    node.textContent = communityMessageRelativeTime(source);
  });
}
function communityMessagesSignature(payload={}){
  const channels = (payload.channels || []).map(channel => [
    channel.id || '',
    Number(channel.unread_count || 0),
  ]);
  const broadcasts = (payload.support_broadcasts || []).map(item => [
    item.id,
    item.body || '',
    item.created_at || '',
    Number(item.recipients_count || 0),
    Number(item.unread_count || 0),
    Number(item.attachments_count || 0),
  ]);
  const threads = (payload.threads || []).map(thread => [
    thread.user_id,
    thread.last_at || '',
    thread.last_body || '',
    Number(thread.unread_count || 0),
    Number(thread.messages_count || 0),
  ]);
  const messages = (payload.messages || []).map(message => [
    message.id,
    message.author_user_id,
    message.body || '',
    (message.attachments || []).map(item => [item.id, item.name || '', item.size_bytes || 0]).join('|'),
    message.created_at || '',
    message.read_by_user_at || '',
    message.read_by_admin_at || '',
    Boolean(message.read),
  ]);
  return JSON.stringify({
    admin:Boolean(payload.is_admin),
    channel:payload.channel || 'owner',
    selected:payload.selected_thread_user_id || '',
    unread:Number(payload.unread_count || 0),
    channels,
    broadcasts,
    threads,
    messages,
  });
}
function communityMessageInitial(user={}){
  const source = profileMessageUserName(user);
  return (Array.from(source)[0] || 'У').toUpperCase();
}
function communityMessageAvatarHtml(user={}, className='messenger-avatar'){
  const url = cleanText(user.avatar_url || '');
  const name = profileMessageUserName(user);
  if(url){
    return `<span class="${attr(className)}"><img src="${attr(url)}" alt="${attr(name)}" loading="lazy" decoding="async"></span>`;
  }
  return `<span class="${attr(className)} is-empty">${esc(communityMessageInitial(user))}</span>`;
}
function communityMessagesPeer(payload={}){
  if(payload.channel === 'support') return payload.support_user || {display_name:'Поддержка'};
  if(payload.is_admin) return payload.selected_user || {};
  if(payload.owner_user) return payload.owner_user || {};
  return {
    display_name: ownerName() || siteName(),
    nickname: '',
    avatar_url: '',
  };
}
function communityMessageProfileHref(user={}){
  const direct = cleanText(user.profile_url || '');
  if(direct) return direct;
  const nickname = cleanText(user.nickname || '');
  return nickname ? routeHref('u', nickname) : '';
}
function communityMessagePeerNameHtml(peer={}, name=''){
  const href = communityMessageProfileHref(peer);
  if(!href) return `<strong>${esc(name)}</strong>`;
  return `<a class="messenger-peer-name" href="${attr(href)}" data-route="u" data-slug="${attr(peer.nickname || '')}">${esc(name)}</a>`;
}
function communityMessagesChannelFromLocation(){
  const value = new URLSearchParams(location.search || '').get('channel') || '';
  return value === 'support' ? 'support' : 'owner';
}
function communityMessageThreadRowHtml(thread={}, selectedId=''){
  const active = String(thread.user_id || '') === String(selectedId || '');
  const unread = Number(thread.unread_count || 0);
  return `<button class="messenger-thread ${active ? 'active' : ''} ${unread ? 'is-unread' : ''}" type="button" data-action="community-message-thread" data-id="${attr(thread.user_id || '')}" aria-pressed="${active ? 'true' : 'false'}">
    ${communityMessageAvatarHtml(thread, 'messenger-thread-avatar')}
    <span class="messenger-thread-main">
      <strong>${esc(profileMessageUserName(thread))}</strong>
      <em>${esc(short(thread.last_body || '', 96) || 'Сообщение')}</em>
    </span>
    <span class="messenger-thread-side"><time datetime="${attr(thread.last_at || '')}" data-relative-time>${esc(communityMessageRelativeTime(thread.last_at))}</time>${unread ? `<b>${esc(unread)}</b>` : ''}</span>
  </button>`;
}
function communityMessageStatusHtml(message={}){
  if(!message.own || message.kind === 'broadcast') return '';
  const read = Boolean(message.read);
  const label = read ? 'Прочитано' : 'Не прочитано';
  const paths = read
    ? '<path d="M1.4 5.3 4.2 8 10.4 1.7"></path><path d="M7.2 5.3 10 8 16.2 1.7"></path>'
    : '<path d="M4.2 5.3 7 8 13.2 1.7"></path>';
  return `<span class="messenger-status ${read ? 'is-read' : 'is-unread'}" aria-label="${label}" title="${label}"><svg viewBox="0 0 18 10" aria-hidden="true">${paths}</svg></span>`;
}
function communityAttachmentSizeLabel(bytes=0){
  const value = Math.max(0, Number(bytes) || 0);
  if(value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1).replace('.', ',')} МБ`;
  if(value >= 1024) return `${Math.max(1, Math.round(value / 1024))} КБ`;
  return value ? `${value} Б` : '';
}
function communityAttachmentIconHtml(kind='file'){
  if(kind === 'image') return '<span class="messenger-attachment-icon" aria-hidden="true">Фото</span>';
  if(kind === 'archive') return '<span class="messenger-attachment-icon" aria-hidden="true">Арх</span>';
  if(kind === 'document') return '<span class="messenger-attachment-icon" aria-hidden="true">Док</span>';
  return '<span class="messenger-attachment-icon" aria-hidden="true">Файл</span>';
}
function communityAttachmentKindFromFile(file={}){
  const type = cleanText(file.type || '').toLowerCase();
  const name = cleanText(file.name || '').toLowerCase();
  if(type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(name)) return 'image';
  if(/\.(zip|rar|7z)$/i.test(name)) return 'archive';
  if(/\.(pdf|docx?|xlsx?|txt|rtf)$/i.test(name)) return 'document';
  return 'file';
}
const COMMUNITY_MESSAGE_UPLOAD_MIN_VISIBLE_MS = 450;
const COMMUNITY_MESSAGE_UPLOAD_TICK_MS = 1000;
function communityMessageUploadProgressValue(item={}){
  const value = Number(item.progress || 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}
function communityMessageUploadElapsed(item={}){
  const started = Number(item.started_at || 0);
  if(!started) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 1000));
}
function communityMessageUploadElapsedLabel(seconds=0){
  const value = Math.max(0, Number(seconds) || 0);
  if(value < 5) return '';
  if(value < 60) return `${value} сек`;
  const minutes = Math.floor(value / 60);
  const rest = String(value % 60).padStart(2, '0');
  return `${minutes}:${rest}`;
}
function communityMessageAttachmentMeta(item={}){
  if(item.error) return 'Не загрузилось';
  if(item.uploading){
    const progress = communityMessageUploadProgressValue(item);
    const elapsed = communityMessageUploadElapsedLabel(communityMessageUploadElapsed(item));
    if(progress >= 99) return elapsed ? `Завершаю ${elapsed}` : 'Завершаю';
    if(progress > 0) return elapsed ? `Загрузка ${progress}% · ${elapsed}` : `Загрузка ${progress}%`;
    return elapsed ? `Загрузка ${elapsed}` : 'Загрузка';
  }
  return communityAttachmentSizeLabel(item.size_bytes || 0);
}
function communityMessageAttachmentProgress(item={}){
  const progress = Math.max(0, Math.min(100, Math.round(Number(item.progress || 0))));
  const label = communityMessageAttachmentMeta(item);
  if(!item.uploading && !item.error) return '';
  return `<span class="messenger-attachment-progress" aria-label="${attr(label)}"><span style="width:${progress}%"></span></span>`;
}
function communityMessageAttachmentHtml(item={}, options={}){
  const name = cleanText(item.name || 'Файл');
  const url = cleanText(item.url || '');
  const kind = cleanText(item.kind || 'file');
  const remove = options.draft ? `<button class="messenger-attachment-remove" type="button" data-action="community-message-attachment-remove" data-id="${attr(item.id || '')}" aria-label="Убрать вложение" title="Убрать">×</button>` : '';
  const meta = communityMessageAttachmentMeta(item);
  const image = kind === 'image' && url ? `<span class="messenger-attachment-thumb"><img src="${attr(url)}" alt="" loading="lazy" decoding="async"></span>` : communityAttachmentIconHtml(kind);
  const progress = communityMessageAttachmentProgress(item);
  const classes = ['messenger-attachment', kind === 'image' ? 'is-image' : '', item.uploading ? 'is-uploading' : '', item.error ? 'is-error' : ''].filter(Boolean).join(' ');
  const body = `<span class="messenger-attachment-main"><strong>${esc(name)}</strong>${meta ? `<em>${esc(meta)}</em>` : ''}${progress}</span>${remove}`;
  if(options.draft || !url){
    return `<span class="${classes}">${image}${body}</span>`;
  }
  return `<a class="${classes}" href="${attr(url)}" target="_blank" rel="noopener">${image}${body}</a>`;
}
function communityMessageAttachmentsHtml(items=[], options={}){
  const attachments = Array.isArray(items) ? items.filter(item => item && item.id) : [];
  if(!attachments.length) return '';
  return `<div class="messenger-attachments ${options.draft ? 'is-draft' : ''}">${attachments.map(item => communityMessageAttachmentHtml(item, options)).join('')}</div>`;
}
function communityMessagesChannelTabsHtml(payload={}, placement='main'){
  const active = payload.channel || 'owner';
  const ownerUser = payload.owner_user || {};
  const ownerLabel = cleanText(ownerUser.display_name || ownerUser.nickname || ownerName() || 'Владелец');
  const channels = Array.isArray(payload.channels) && payload.channels.length
    ? payload.channels
    : [{id:'owner', label:ownerLabel, unread_count:0}, {id:'support', label:'Поддержка', unread_count:0}];
  return `<div class="messenger-channel-tabs is-${attr(placement)}" role="tablist" aria-label="Сообщения">${channels.map(channel => {
    const id = channel.id === 'support' ? 'support' : 'owner';
    const selected = id === active;
    const unread = Number(channel.unread_count || 0);
    const label = channel.label || (id === 'support' ? 'Поддержка' : ownerLabel);
    const avatar = id === 'owner' && placement === 'main' ? communityMessageAvatarHtml({...ownerUser, display_name:label}, 'messenger-tab-avatar') : '';
    return `<button class="${selected ? 'active' : ''}" type="button" data-action="community-message-channel" data-channel="${attr(id)}" role="tab" aria-selected="${selected ? 'true' : 'false'}">${avatar}<span class="messenger-tab-label">${esc(label)}</span>${unread ? `<span class="messenger-tab-count">${esc(unread)}</span>` : ''}</button>`;
  }).join('')}</div>`;
}
function communitySupportBroadcastFormHtml(payload={}){
  const items = Array.isArray(payload.support_broadcasts) ? payload.support_broadcasts : [];
  const recent = items.length ? `<div class="messenger-broadcast-recent">${items.map(item => `<p><span>${esc(time(item.created_at))}</span>${esc(short(item.body || '', 80) || (Number(item.attachments_count || 0) ? 'Вложение' : 'Сообщение'))}</p>`).join('')}</div>` : '';
  return `<form class="messenger-broadcast-form" id="communitySupportBroadcastForm" data-attachment-draft-key="broadcast:support">
    <strong>Рассылка</strong>
    <input class="visually-hidden" type="file" name="attachment" data-message-attachment-input multiple>
    <div class="messenger-attachment-drafts" data-message-attachment-drafts></div>
    <textarea name="body" rows="2" placeholder="Сообщение всем пользователям" aria-label="Рассылка поддержки"></textarea>
    <div class="messenger-broadcast-actions">
      <button class="messenger-attach" type="button" data-action="community-message-attach" aria-label="Прикрепить файл" title="Прикрепить файл">
        <img src="/static/message-attach-icon.png?v=messages-attachicon-upload-20260527-1" alt="" aria-hidden="true" decoding="async">
      </button>
      <button class="secondary client-compact-action" type="submit" data-save-content>Отправить всем</button>
    </div>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    ${recent}
  </form>`;
}
function communityMessageBubbleHtml(message={}){
  const own = Boolean(message.own);
  const author = message.author || {};
  const body = cleanText(message.body || '');
  return `<article class="messenger-message ${own ? 'is-own' : 'is-other'} ${message.kind === 'broadcast' ? 'is-broadcast' : ''}" data-message-id="${attr(message.id || '')}">
    <div class="messenger-bubble">
      <span class="messenger-author">${esc(profileMessageUserName(author))}</span>
      ${body ? `<p>${esc(body)}</p>` : ''}
      ${communityMessageAttachmentsHtml(message.attachments || [])}
      <span class="messenger-meta"><time>${esc(time(message.created_at))}</time>${communityMessageStatusHtml(message)}</span>
    </div>
  </article>`;
}
function communityMessageFormHtml(threadId=''){
  return `<form class="messenger-compose" id="communityMessageForm" data-thread-id="${attr(threadId || '')}">
    <input class="visually-hidden" type="file" name="attachment" data-message-attachment-input multiple>
    <div class="messenger-attachment-drafts" data-message-attachment-drafts></div>
    <textarea name="body" rows="1" placeholder="Сообщение" aria-label="Сообщение"></textarea>
    <button class="messenger-attach" type="button" data-action="community-message-attach" aria-label="Прикрепить файл" title="Прикрепить файл">
      <img src="/static/message-attach-icon.png?v=messages-attachicon-upload-20260527-1" alt="" aria-hidden="true" decoding="async">
    </button>
    <button class="messenger-send" type="submit" aria-label="Отправить" title="Отправить" disabled>
      <img src="/static/message-send-icon.png?v=messages-sendicon-file-20260524-2" alt="" aria-hidden="true" decoding="async">
    </button>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
  </form>`;
}
function communityMessagesEmptyText(payload={}){
  if(payload.is_admin && !Number(payload.selected_thread_user_id || 0)) return 'Выберите диалог.';
  return 'Сообщений пока нет.';
}
function communityMessagesHtml(payload={}){
  const isAdminMessages = Boolean(payload.is_admin);
  const channel = payload.channel || 'owner';
  const isSupport = channel === 'support';
  const selectedId = String(payload.selected_thread_user_id || '');
  const threads = Array.isArray(payload.threads) ? payload.threads : [];
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const peer = communityMessagesPeer(payload);
  const peerName = payload.is_admin
    ? (peer.id ? profileMessageUserName(peer) : 'Диалог')
    : profileMessageUserName(peer);
  const sidebar = isAdminMessages
    ? `<aside class="messenger-sidebar">
        ${communityMessagesChannelTabsHtml(payload, 'sidebar')}
        ${isSupport ? communitySupportBroadcastFormHtml(payload) : ''}
        <div class="messenger-sidebar-head">
          <strong>${isSupport ? 'Обращения' : 'Диалоги'}</strong>
          ${Number(payload.unread_count || 0) ? `<span>${esc(payload.unread_count)}</span>` : ''}
        </div>
        <div class="messenger-thread-list">${threads.map(thread => communityMessageThreadRowHtml(thread, selectedId)).join('') || '<p class="messenger-empty">Диалогов пока нет.</p>'}</div>
      </aside>`
    : '';
  const canWrite = !isAdminMessages || Number(selectedId || 0);
  const peerHeader = isAdminMessages ? `<header class="messenger-peer">
          ${communityMessageAvatarHtml(peer)}
          <div>${communityMessagePeerNameHtml(peer, peerName)}</div>
        </header>` : '';
  return `<section class="messenger-page" data-messenger-signature="${attr(communityMessagesSignature(payload))}">
    <div class="messenger-shell ${isAdminMessages ? 'is-admin' : 'is-user'} is-${attr(channel)}">
      ${sidebar}
      <section class="messenger-main">
        ${!isAdminMessages ? communityMessagesChannelTabsHtml(payload, 'main') : ''}
        ${peerHeader}
        <div class="messenger-list" data-message-list>${messages.map(communityMessageBubbleHtml).join('') || `<p class="messenger-empty">${esc(communityMessagesEmptyText(payload))}</p>`}</div>
        ${canWrite ? communityMessageFormHtml(selectedId) : ''}
      </section>
    </div>
  </section>`;
}
function communityMessagesLoadingHtml(){
  return `<section class="messenger-page" data-messenger-signature="">
    <div class="messenger-shell is-loading">
      <section class="messenger-main">
        <div class="messenger-list">${loading('Открываю сообщения...')}</div>
      </section>
    </div>
  </section>`;
}
function communityMessagesGateHtml(){
  return `<section class="gate-card">
    <h1>Сообщения</h1>
    <p>Войдите, чтобы написать на сайте и увидеть ответы.</p>
    <div class="row"><button class="primary" type="button" data-action="public-login">Войти</button></div>
  </section>`;
}
function communityMessagesDraft(){
  const form = document.querySelector('#communityMessageForm');
  const field = form?.querySelector?.('textarea[name="body"]');
  return {
    channel:communityMessagesChannelFromLocation(),
    threadId:String(form?.dataset.threadId || ''),
    body:field?.value || '',
    focused:document.activeElement === field,
    selectionStart:typeof field?.selectionStart === 'number' ? field.selectionStart : null,
    selectionEnd:typeof field?.selectionEnd === 'number' ? field.selectionEnd : null,
  };
}
function communityMessageDraftKey(form=document.querySelector('#communityMessageForm')){
  if(form?.dataset?.attachmentDraftKey) return form.dataset.attachmentDraftKey;
  const threadId = String(form?.dataset.threadId || state.communityMessagesThreadId || communityMessagesThreadFromLocation() || '');
  return `${communityMessagesChannelFromLocation()}:${threadId || 'self'}`;
}
function communityMessageDraftAttachments(form=document.querySelector('#communityMessageForm')){
  const key = communityMessageDraftKey(form);
  if(!state.communityMessagesDraftAttachments || typeof state.communityMessagesDraftAttachments !== 'object') state.communityMessagesDraftAttachments = {};
  if(!Array.isArray(state.communityMessagesDraftAttachments[key])) state.communityMessagesDraftAttachments[key] = [];
  return state.communityMessagesDraftAttachments[key];
}
function setCommunityMessageDraftAttachments(items=[], form=document.querySelector('#communityMessageForm')){
  const key = communityMessageDraftKey(form);
  if(!state.communityMessagesDraftAttachments || typeof state.communityMessagesDraftAttachments !== 'object') state.communityMessagesDraftAttachments = {};
  state.communityMessagesDraftAttachments[key] = Array.isArray(items) ? items : [];
}
function revokeCommunityMessageAttachmentPreview(item={}){
  const url = item.preview_url || '';
  if(url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
}
function renderCommunityMessageDraftAttachments(form=document.querySelector('#communityMessageForm')){
  const box = form?.querySelector?.('[data-message-attachment-drafts]');
  if(!box) return;
  const items = communityMessageDraftAttachments(form);
  box.innerHTML = communityMessageAttachmentsHtml(items, {draft:true});
  box.hidden = !items.length;
}
function communityMessageAnyUploadingAttachments(){
  const groups = Object.values(state.communityMessagesDraftAttachments || {});
  return groups.some(items => Array.isArray(items) && items.some(item => item && item.uploading));
}
function renderCommunityMessageActiveDrafts(){
  [document.querySelector('#communityMessageForm'), document.querySelector('#communitySupportBroadcastForm')]
    .filter(Boolean)
    .forEach(form => {
      renderCommunityMessageDraftAttachments(form);
      syncCommunityMessageUploadUi(form, communityMessageHasUploadingAttachments(form));
      syncCommunityMessageSendButton(form);
    });
}
function scheduleCommunityMessageUploadTick(){
  if(state.communityMessagesUploadTimer) return;
  state.communityMessagesUploadTimer = setInterval(() => {
    if(!communityMessageAnyUploadingAttachments()){
      clearInterval(state.communityMessagesUploadTimer);
      state.communityMessagesUploadTimer = null;
      renderCommunityMessageActiveDrafts();
      return;
    }
    renderCommunityMessageActiveDrafts();
  }, COMMUNITY_MESSAGE_UPLOAD_TICK_MS);
}
function waitCommunityMessagePaint(delayMs=0){
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if(delayMs > 0){
        setTimeout(resolve, delayMs);
        return;
      }
      resolve();
    }));
  });
}
function communityMessagesUploadingNow(form=document.querySelector('#communityMessageForm')){
  return Number(state.communityMessagesUploadsInFlight || 0) > 0 || communityMessageHasUploadingAttachments(form);
}
function syncCommunityMessageUploadUi(form=document.querySelector('#communityMessageForm'), active=false){
  if(!form) return;
  const attachButton = form.querySelector('.messenger-attach');
  form.classList.toggle('is-uploading-attachment', Boolean(active));
  if(attachButton){
    attachButton.classList.toggle('is-uploading', Boolean(active));
    attachButton.setAttribute('aria-busy', active ? 'true' : 'false');
  }
}
function beginCommunityMessageUpload(form=document.querySelector('#communityMessageForm')){
  state.communityMessagesUploadsInFlight = Math.max(0, Number(state.communityMessagesUploadsInFlight || 0)) + 1;
  syncCommunityMessageUploadUi(form, true);
}
function finishCommunityMessageUpload(form=document.querySelector('#communityMessageForm')){
  state.communityMessagesUploadsInFlight = Math.max(0, Number(state.communityMessagesUploadsInFlight || 0) - 1);
  syncCommunityMessageUploadUi(form, communityMessagesUploadingNow(form));
}
async function ensureCommunityMessageUploadVisible(startedAt){
  const elapsed = performance.now() - startedAt;
  const remaining = COMMUNITY_MESSAGE_UPLOAD_MIN_VISIBLE_MS - elapsed;
  if(remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
}
function communityMessageUploadedAttachments(form=document.querySelector('#communityMessageForm')){
  return communityMessageDraftAttachments(form).filter(item => item && !item.uploading && !item.error && Number(item.id || 0) > 0);
}
function communityMessageHasUploadingAttachments(form=document.querySelector('#communityMessageForm')){
  return communityMessageDraftAttachments(form).some(item => item && item.uploading);
}
function updateCommunityMessageDraftAttachment(form, id, updater){
  const targetId = String(id || '');
  const items = communityMessageDraftAttachments(form);
  let touched = false;
  const next = items.map(item => {
    if(String(item?.id || '') !== targetId) return item;
    touched = true;
    return typeof updater === 'function' ? updater(item) : updater;
  }).filter(Boolean);
  if(!touched) return false;
  setCommunityMessageDraftAttachments(next, form);
  renderCommunityMessageDraftAttachments(form);
  syncCommunityMessageSendButton(form);
  return true;
}
function pendingCommunityMessageAttachment(file={}){
  const kind = communityAttachmentKindFromFile(file);
  const localUrl = kind === 'image' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
  return {
    id:`pending:${Date.now()}:${Math.random().toString(16).slice(2)}`,
    name:file.name || 'Файл',
    size_bytes:file.size || 0,
    kind,
    url:localUrl,
    preview_url:localUrl,
    uploading:true,
    progress:0,
    started_at:Date.now(),
    last_progress_at:0,
    loaded_bytes:0,
    total_bytes:file.size || 0,
  };
}
async function uploadCommunityMessageFiles(form, files=[], attachButton=null){
  const feedback = form?.querySelector?.('[data-form-feedback]');
  const picked = Array.from(files || []);
  const current = communityMessageDraftAttachments(form);
  if(!picked.length) return;
  if(current.length + picked.length > COMMUNITY_MESSAGE_MAX_ATTACHMENTS){
    setFeedback(feedback, `Можно прикрепить не больше ${COMMUNITY_MESSAGE_MAX_ATTACHMENTS} файлов.`, 'danger');
    return;
  }
  const tooLarge = picked.find(file => file.size > COMMUNITY_ATTACHMENT_MAX_BYTES);
  if(tooLarge){
    setFeedback(feedback, `Файл слишком большой. Выберите файл до ${COMMUNITY_ATTACHMENT_MAX_LABEL}.`, 'danger');
    return;
  }
  const pendingItems = picked.map(pendingCommunityMessageAttachment);
  setCommunityMessageDraftAttachments([...current, ...pendingItems], form);
  renderCommunityMessageDraftAttachments(form);
  syncCommunityMessageSendButton(form);
  beginCommunityMessageUpload(form);
  scheduleCommunityMessageUploadTick();
  const visibleAt = performance.now();
  await waitCommunityMessagePaint(120);
  let failed = false;
  for(let index = 0; index < picked.length; index += 1){
    const file = picked[index];
    const pending = pendingItems[index];
    try{
      const payload = await uploadCommunityMessageAttachment(file, (progress, loaded, total) => {
        updateCommunityMessageDraftAttachment(form, pending.id, item => ({
          ...item,
          progress:Number.isFinite(Number(progress)) ? progress : (item.progress || 0),
          loaded_bytes:Number(loaded || item.loaded_bytes || 0),
          total_bytes:Number(total || item.total_bytes || file.size || 0),
          last_progress_at:Date.now(),
        }));
      });
      if(!payload.attachment) throw new Error('Сервер не вернул файл.');
      await ensureCommunityMessageUploadVisible(visibleAt);
      revokeCommunityMessageAttachmentPreview(pending);
      updateCommunityMessageDraftAttachment(form, pending.id, payload.attachment);
    }catch(error){
      failed = true;
      await ensureCommunityMessageUploadVisible(visibleAt);
      updateCommunityMessageDraftAttachment(form, pending.id, item => ({...item, uploading:false, error:true, progress:0}));
      setFeedback(feedback, error.message || 'Не удалось прикрепить файл.', 'danger');
    }
  }
  finishCommunityMessageUpload(form);
}
function restoreCommunityMessagesDraft(draft={}){
  if(!draft.body && !draft.focused) return;
  const form = document.querySelector('#communityMessageForm');
  const field = form?.querySelector?.('textarea[name="body"]');
  if(!form || !field || String(form.dataset.threadId || '') !== String(draft.threadId || '') || String(draft.channel || '') !== communityMessagesChannelFromLocation()) return;
  field.value = draft.body;
  fitCommunityMessageTextarea(field);
  syncCommunityMessageSendButton(form);
  if(draft.focused){
    field.focus({preventScroll:true});
    if(typeof draft.selectionStart === 'number' && typeof draft.selectionEnd === 'number'){
      field.setSelectionRange(draft.selectionStart, draft.selectionEnd);
    }
    requestAnimationFrame(() => fitCommunityMessageTextarea(field));
  }
}
function communityMessageTextareaMetrics(field){
  const styles = getComputedStyle(field);
  const lineHeight = parseFloat(styles.lineHeight) || 20;
  const padding = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
  const border = (parseFloat(styles.borderTopWidth) || 0) + (parseFloat(styles.borderBottomWidth) || 0);
  return {lineHeight, padding, border};
}
function fitCommunityMessageTextarea(field){
  if(!field) return;
  const {lineHeight, padding, border} = communityMessageTextareaMetrics(field);
  const minRows = document.activeElement === field ? 2 : 1;
  const minHeight = Math.ceil(lineHeight * minRows + padding + border);
  const maxHeight = Math.ceil(lineHeight * 4 + padding + border);
  field.style.height = 'auto';
  const nextHeight = Math.min(Math.max(field.scrollHeight, minHeight), maxHeight);
  field.style.height = `${nextHeight}px`;
  field.style.overflowY = field.scrollHeight > maxHeight ? 'auto' : 'hidden';
}
function syncCommunityMessageSendButton(form){
  const field = form?.querySelector?.('textarea[name="body"]');
  const button = form?.querySelector?.('.messenger-send');
  const attachments = communityMessageUploadedAttachments(form);
  const uploading = communityMessageHasUploadingAttachments(form);
  if(button) button.disabled = uploading || (!cleanText(field?.value || '') && attachments.length === 0);
}
function communityMessagesNearBottom(){
  const list = document.querySelector('[data-message-list]');
  if(!list) return true;
  return list.scrollHeight - list.scrollTop - list.clientHeight < 140;
}
function scrollCommunityMessagesToBottom(){
  const list = document.querySelector('[data-message-list]');
  if(list) list.scrollTop = list.scrollHeight;
}
function syncCommunityMessagesUrl(payload={}, options={}){
  if(state.route !== 'messages' || !payload.is_admin) return;
  const selected = String(payload.selected_thread_user_id || '');
  const nextUrl = communityMessagesUrl(selected, payload.channel || 'owner');
  const currentUrl = `${location.pathname}${location.search}`;
  if(selected && nextUrl !== currentUrl) history[options.replace ? 'replaceState' : 'pushState'](null, '', nextUrl);
}
function paintCommunityMessages(payload={}, options={}){
  const signature = communityMessagesSignature(payload);
  const changed = signature !== state.communityMessagesSignature;
  const domSignature = document.querySelector('.messenger-page')?.dataset.messengerSignature || '';
  const staleDom = domSignature !== signature;
  const forcePaint = Boolean(options.force && !options.background);
  state.communityMessagesPayload = payload;
  state.communityMessagesSignature = signature;
  state.communityMessagesThreadId = String(payload.selected_thread_user_id || '');
  state.messages = {unread_count:Number(payload.unread_count || 0), is_admin:Boolean(payload.is_admin)};
  syncHeaderControls();
  syncCommunityMessagesUrl(payload, {replace:true});
  if(state.route !== 'messages') return;
  if(options.background && communityMessagesUploadingNow()){
    updateCommunityRelativeTimes();
    return;
  }
  if(!changed && !forcePaint && !staleDom){
    updateCommunityRelativeTimes();
    return;
  }
  const draft = options.clearDraft ? {threadId:'', body:'', focused:false} : communityMessagesDraft();
  const stickToBottom = forcePaint || options.scrollBottom || communityMessagesNearBottom();
  app.innerHTML = communityMessagesHtml(payload);
  bindCommunityMessagesPage(app);
  restoreCommunityMessagesDraft(draft);
  updateCommunityRelativeTimes(app);
  if(stickToBottom) requestAnimationFrame(scrollCommunityMessagesToBottom);
}
async function loadCommunityMessages(threadId='', options={}){
  document.body.dataset.messagesSyncAt = String(Date.now());
  if(!isPublicUser()) return null;
  if(state.communityMessagesLoading && !options.force) return null;
  const requested = cleanText(threadId || communityMessagesThreadFromLocation() || state.communityMessagesThreadId || '');
  const channel = options.channel || communityMessagesChannelFromLocation();
  const params = new URLSearchParams();
  if(requested) params.set('thread_user_id', requested);
  params.set('channel', channel);
  params.set('_', String(Date.now()));
  const query = `?${params.toString()}`;
  document.body.dataset.messagesSyncTarget = `/api/community/messages${query}`;
  state.communityMessagesLoading = true;
  try{
    const payload = await api(`/api/community/messages${query}`);
    paintCommunityMessages(payload, options);
    return payload;
  }catch(error){
    if(state.route === 'messages' && !options.silent){
      app.innerHTML = `<section class="messenger-page"><div class="form-feedback is-danger">${esc(error.message || 'Не удалось открыть сообщения.')}</div></section>`;
    }
    return null;
  }finally{
    state.communityMessagesLoading = false;
  }
}
window.loadCommunityMessages = loadCommunityMessages;
function stopCommunityMessagesPolling(){
  if(state.communityMessagesPollTimer){
    clearInterval(state.communityMessagesPollTimer);
    state.communityMessagesPollTimer = null;
  }
}
function startCommunityMessagesPolling(){
  if(state.communityMessagesPollTimer) return;
  document.body.dataset.messagesSyncMode = 'poll';
  state.communityMessagesPollTimer = setInterval(() => {
    document.body.dataset.messagesSyncAt = String(Date.now());
    if(document.body.dataset.route !== 'messages') return;
    if(communityMessagesUploadingNow()) return;
    loadCommunityMessages(state.communityMessagesThreadId || communityMessagesThreadFromLocation(), {silent:true, force:true, background:true, channel:communityMessagesChannelFromLocation()}).catch(() => {});
  }, 1500);
}
function bindCommunityMessagesPage(root=document){
  root.querySelectorAll('[data-action="community-message-channel"]').forEach(button => {
    if(button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', event => {
      event.preventDefault();
      const channel = button.dataset.channel === 'support' ? 'support' : 'owner';
      history.pushState(null, '', communityMessagesUrl('', channel));
      state.communityMessagesThreadId = '';
      state.communityMessagesPayload = null;
      state.communityMessagesSignature = '';
      loadCommunityMessages('', {force:true, scrollBottom:true, channel}).catch(() => {});
    });
  });
  root.querySelectorAll('[data-action="community-message-thread"]').forEach(button => {
    if(button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', event => {
      event.preventDefault();
      const id = button.dataset.id || '';
      if(!id) return;
      const channel = communityMessagesChannelFromLocation();
      history.pushState(null, '', communityMessagesUrl(id, channel));
      loadCommunityMessages(id, {force:true, scrollBottom:true, channel}).catch(() => {});
    });
  });
  const broadcastForm = root.querySelector('#communitySupportBroadcastForm');
  if(broadcastForm && broadcastForm.dataset.bound !== '1'){
    broadcastForm.dataset.bound = '1';
    const broadcastAttachmentInput = broadcastForm.querySelector('[data-message-attachment-input]');
    const broadcastAttachButton = broadcastForm.querySelector('[data-action="community-message-attach"]');
    renderCommunityMessageDraftAttachments(broadcastForm);
    syncCommunityMessageUploadUi(broadcastForm, communityMessagesUploadingNow(broadcastForm));
    broadcastAttachButton?.addEventListener('click', () => broadcastAttachmentInput?.click());
    broadcastAttachmentInput?.addEventListener('change', async () => {
      const files = Array.from(broadcastAttachmentInput.files || []);
      broadcastAttachmentInput.value = '';
      if(!files.length) return;
      await uploadCommunityMessageFiles(broadcastForm, files, broadcastAttachButton);
    });
    broadcastForm.addEventListener('click', event => {
      const removeButton = event.target?.closest?.('[data-action="community-message-attachment-remove"]');
      if(!removeButton) return;
      event.preventDefault();
      const id = String(removeButton.dataset.id || '');
      communityMessageDraftAttachments(broadcastForm).filter(item => String(item.id || '') === id).forEach(revokeCommunityMessageAttachmentPreview);
      setCommunityMessageDraftAttachments(communityMessageDraftAttachments(broadcastForm).filter(item => String(item.id || '') !== id), broadcastForm);
      renderCommunityMessageDraftAttachments(broadcastForm);
    });
    broadcastForm.addEventListener('submit', async event => {
      event.preventDefault();
      const feedback = broadcastForm.querySelector('[data-form-feedback]');
      const data = new FormData(broadcastForm);
      const body = cleanText(data.get('body') || '');
      if(communityMessageHasUploadingAttachments(broadcastForm)){
        setFeedback(feedback, 'Дождитесь загрузки вложения.', 'danger');
        return;
      }
      const attachments = communityMessageUploadedAttachments(broadcastForm);
      if(!body && !attachments.length) return;
      if(broadcastForm.dataset.saving === '1') return;
      broadcastForm.dataset.saving = '1';
      setContentFormBusy(broadcastForm, true);
      try{
        const payload = await api('/api/community/messages', {method:'POST', body:{body, attachments:attachments.map(item => item.id), channel:'support', broadcast:true, thread_user_id:state.communityMessagesThreadId || communityMessagesThreadFromLocation() || ''}});
        broadcastForm.reset();
        setCommunityMessageDraftAttachments([], broadcastForm);
        renderCommunityMessageDraftAttachments(broadcastForm);
        paintCommunityMessages(payload, {force:true});
        say('Рассылка отправлена.', 'success');
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось отправить рассылку.', 'danger');
      }finally{
        delete broadcastForm.dataset.saving;
        setContentFormBusy(broadcastForm, false);
      }
    });
  }
  const form = root.querySelector('#communityMessageForm');
  if(form && form.dataset.bound !== '1'){
    form.dataset.bound = '1';
    const textarea = form.querySelector('textarea[name="body"]');
    const attachmentInput = form.querySelector('[data-message-attachment-input]');
    const attachButton = form.querySelector('[data-action="community-message-attach"]');
    if(textarea && textarea.dataset.autosizeBound !== '1'){
      textarea.dataset.autosizeBound = '1';
      textarea.addEventListener('input', () => {
        fitCommunityMessageTextarea(textarea);
        syncCommunityMessageSendButton(form);
      });
      textarea.addEventListener('focus', () => fitCommunityMessageTextarea(textarea));
      textarea.addEventListener('blur', () => fitCommunityMessageTextarea(textarea));
      requestAnimationFrame(() => {
        fitCommunityMessageTextarea(textarea);
        syncCommunityMessageSendButton(form);
      });
    }
    renderCommunityMessageDraftAttachments(form);
    syncCommunityMessageUploadUi(form, communityMessagesUploadingNow(form));
    attachButton?.addEventListener('click', () => attachmentInput?.click());
    attachmentInput?.addEventListener('change', async () => {
      const files = Array.from(attachmentInput.files || []);
      attachmentInput.value = '';
      if(!files.length) return;
      await uploadCommunityMessageFiles(form, files, attachButton);
    });
    form.addEventListener('click', event => {
      const removeButton = event.target?.closest?.('[data-action="community-message-attachment-remove"]');
      if(!removeButton) return;
      event.preventDefault();
      const id = String(removeButton.dataset.id || '');
      communityMessageDraftAttachments(form).filter(item => String(item.id || '') === id).forEach(revokeCommunityMessageAttachmentPreview);
      setCommunityMessageDraftAttachments(communityMessageDraftAttachments(form).filter(item => String(item.id || '') !== id), form);
      renderCommunityMessageDraftAttachments(form);
      syncCommunityMessageSendButton(form);
    });
    textarea?.addEventListener('keydown', event => {
      if(event.key === 'Enter' && !event.shiftKey){
        event.preventDefault();
        form.requestSubmit();
      }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      const body = cleanText(data.get('body') || '');
      if(communityMessageHasUploadingAttachments(form)){
        setFeedback(feedback, 'Дождитесь загрузки вложения.', 'danger');
        return;
      }
      const attachments = communityMessageUploadedAttachments(form);
      if(!body && !attachments.length){
        return;
      }
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        const payload = await api('/api/community/messages', {method:'POST', body:{body, attachments:attachments.map(item => item.id), channel:communityMessagesChannelFromLocation(), thread_user_id:form.dataset.threadId || ''}});
        form.reset();
        setCommunityMessageDraftAttachments([], form);
        renderCommunityMessageDraftAttachments(form);
        fitCommunityMessageTextarea(textarea);
        syncCommunityMessageSendButton(form);
        paintCommunityMessages(payload, {force:true, scrollBottom:true, clearDraft:true});
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось отправить сообщение.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }
}
function renderMessages(){
  if(!isPublicUser()){
    app.innerHTML = communityMessagesGateHtml();
    return;
  }
  app.innerHTML = state.communityMessagesPayload ? communityMessagesHtml(state.communityMessagesPayload) : communityMessagesLoadingHtml();
  bindCommunityMessagesPage(app);
  requestAnimationFrame(scrollCommunityMessagesToBottom);
  startCommunityMessagesPolling();
  loadCommunityMessages(communityMessagesThreadFromLocation(), {silent:true, force:true, scrollBottom:true, channel:communityMessagesChannelFromLocation()}).catch(() => {});
}
function profileSettingActionRowHtml(label='', valueHtml='', action='', actionLabel='Сменить'){
  const button = action ? `<button class="secondary client-compact-action" type="button" data-profile-setting="${attr(action)}">${esc(actionLabel)}</button>` : '';
  return `<div class="profile-info-row profile-setting-row ${action ? 'has-action' : ''}">
    <strong>${esc(label)}</strong>
    <span class="profile-setting-value">${valueHtml}</span>
    ${button}
  </div>`;
}
function profilePasswordStatusText(account={}){
  if(account.has_password === false) return 'Не задан';
  return account.password_set_at ? `Установлен ${date(account.password_set_at)}` : 'Установлен';
}
function profileSettingsHtml(profile={}, payload={}){
  const account = payload.account || {};
  const subscriptionCount = (state.subscriptions || []).length;
  const emailEnabled = (payload.account?.notification_email_enabled ?? state.user?.notification_email_enabled) !== false;
  const privacy = {
    profile_guest_visible: payload.privacy?.profile_guest_visible !== false,
    show_online_status: payload.privacy?.show_online_status === true,
    show_public_activity: payload.privacy?.show_public_activity !== false,
  };
  const email = cleanText(account.email || '');
  const hasPassword = account.has_password !== false;
  const requiredChanges = [
    state.user?.must_change_nickname ? 'имя' : '',
    state.user?.must_change_avatar ? 'фото' : '',
  ].filter(Boolean);
  return `<div class="profile-content-grid profile-settings-grid">
    <section class="profile-section">
      <div class="profile-section-head"><h3>Профиль</h3></div>
      <div class="profile-info-list profile-settings-summary">
        ${profileSettingActionRowHtml('Имя', esc(profileName(profile)), 'name')}
        ${profileSettingActionRowHtml('Фото', `<span class="profile-setting-media">${profileAvatarHtml(profile, 'settings')}</span>`, 'photo')}
      </div>
      ${requiredChanges.length ? `<p class="form-feedback is-warning">Нужно обновить: ${esc(requiredChanges.join(', '))}.</p>` : ''}
    </section>
    <section class="profile-section">
      <div class="profile-section-head"><h3>Аккаунт</h3></div>
      <div class="profile-info-list profile-settings-summary">
        ${profileSettingActionRowHtml('Почта', esc(email || 'Не указана'), 'email')}
        ${profileSettingActionRowHtml('Пароль', esc(profilePasswordStatusText(account)), 'password', hasPassword ? 'Сменить' : 'Задать')}
      </div>
    </section>
    <section class="profile-section">
      <form class="profile-settings-form profile-section-form profile-privacy-form" id="profilePrivacySettingsForm">
        <div class="profile-section-head">
          <h3>Видимость</h3>
          <button class="secondary client-compact-action" type="submit" data-save-content>Сохранить</button>
        </div>
        <label class="toggle-line"><input name="profile_guest_visible" type="checkbox" ${privacy.profile_guest_visible ? 'checked' : ''}><span>Профиль открыт гостям</span></label>
        <label class="toggle-line"><input name="show_online_status" type="checkbox" ${privacy.show_online_status ? 'checked' : ''}><span>Показывать онлайн</span></label>
        <label class="toggle-line"><input name="show_public_activity" type="checkbox" ${privacy.show_public_activity ? 'checked' : ''}><span>Показывать ленту</span></label>
        <p class="form-note" data-form-feedback data-feedback-style="note"></p>
      </form>
    </section>
    <section class="profile-section profile-mail-section">
      <form class="profile-settings-form profile-section-form profile-mail-form" id="profileNotificationSettingsForm">
        <div class="profile-section-head">
          <h3>Письма и подписки</h3>
          <button class="secondary client-compact-action" type="submit" data-save-content>Сохранить</button>
        </div>
        <label class="toggle-line"><input name="notification_email_enabled" type="checkbox" ${emailEnabled ? 'checked' : ''}><span>Важные письма</span></label>
        <p class="form-note" data-form-feedback data-feedback-style="note"></p>
      </form>
      <div class="profile-mail-grid">
        <div class="profile-subscription-head"><strong>Подписки</strong><button class="plain client-compact-action" type="button" data-action="subscriptions-manage">${subscriptionCount ? 'Управлять' : 'Настроить'}</button></div>
        <div class="profile-info-list profile-subscription-list">${profileSubscriptionRowsHtml(4)}</div>
      </div>
    </section>
  </div>`;
}
function profileBodyHtml(tab='public', payload={}, isOwnProfile=false){
  const profile = payload.profile || {};
  const activeTab = normalizeProfileTab(tab);
  if(activeTab === 'notifications' && isOwnProfile && isPublicUser()) return profileNotificationsHtml(payload);
  if(activeTab === 'settings' && isOwnProfile && isPublicUser()) return profileSettingsHtml(profile, payload);
  return profilePublicPageHtml(profile, payload.activity || {}, isOwnProfile);
}
async function loadProfileMessages(threadId=''){
  if(!isPublicUser()) return null;
  const requested = cleanText(threadId || profileMessageThreadFromLocation());
  state.profileMessagesLoading = true;
  const query = requested ? `?thread_user_id=${encodeURIComponent(requested)}` : '';
  try{
    const payload = await api(`/api/community/messages${query}`);
    state.profileMessagesPayload = payload;
    state.messages = {unread_count:Number(payload.unread_count || 0), is_admin:Boolean(payload.is_admin)};
    const cabinet = document.querySelector('.profile-cabinet');
    if(cabinet?.dataset.profileTab === 'messages'){
      const body = cabinet.querySelector('.profile-tab-body');
      if(body) body.innerHTML = profileMessagesHtml(payload);
      if(payload.is_admin && payload.selected_thread_user_id){
        const url = new URL(location.href);
        url.searchParams.set('tab', 'messages');
        url.searchParams.set('thread', String(payload.selected_thread_user_id));
        history.replaceState(null, '', `${url.pathname}${url.search}`);
      }
      bindProfileTab(cabinet);
    }
    syncHeaderControls();
    return payload;
  }catch(error){
    const cabinet = document.querySelector('.profile-cabinet');
    if(cabinet?.dataset.profileTab === 'messages'){
      const body = cabinet.querySelector('.profile-tab-body');
      if(body) body.innerHTML = `<div class="profile-content-grid profile-messages-grid"><section class="profile-section is-wide"><p class="form-feedback is-danger">${esc(error.message || 'Не удалось открыть сообщения.')}</p></section></div>`;
    }
    return null;
  }finally{
    state.profileMessagesLoading = false;
  }
}
async function openOwnMessagesTab(){
  if(!isPublicUser()){
    state.afterAuthAction = 'messages';
    publicLoginModal();
    return;
  }
  go('messages');
}
function siteMessageModal(){
  if(!isPublicUser()){
    state.afterAuthAction = 'site-message';
    publicLoginModal();
    return;
  }
  openOwnMessagesTab();
}
function bindProfileAvatarField(form){
  if(!form || form.dataset.avatarBound === '1') return;
  form.dataset.avatarBound = '1';
  const feedback = form.querySelector('[data-form-feedback]');
  const avatarInput = form.querySelector('[name="avatar_url"]');
  const fileInput = form.querySelector('[name="avatar_file"]');
  const preview = form.querySelector('[data-profile-avatar-preview]');
  const clearButton = form.querySelector('[data-profile-avatar-clear]');
  const paintAvatar = () => {
    if(!preview || !avatarInput) return;
    const data = {display_name: form.querySelector('[name="display_name"]')?.value || userDisplayName(), nickname: state.user?.nickname || '', avatar_url: avatarInput.value};
    preview.innerHTML = profileAvatarHtml(data, 'settings');
  };
  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if(!file) return;
    if(file.size > MEDIA_UPLOAD_MAX_BYTES){
      fileInput.value = '';
      setFeedback(feedback, `Файл слишком большой. Выберите изображение до ${MEDIA_UPLOAD_MAX_LABEL}.`, 'danger');
      return;
    }
    try{
      fileInput.disabled = true;
      if(clearButton) clearButton.disabled = true;
      setFeedback(feedback, 'Загружаю фото...', 'warning');
      const uploaded = await uploadProfileAvatar(file);
      avatarInput.value = String(uploaded.path || '').trim();
      fileInput.value = '';
      paintAvatar();
      setFeedback(feedback, 'Фото загружено. Сохраните профиль.', 'success');
    }catch(error){
      fileInput.value = '';
      setFeedback(feedback, error.message || 'Не удалось загрузить фото.', 'danger');
    }finally{
      fileInput.disabled = false;
      if(clearButton) clearButton.disabled = false;
    }
  });
  clearButton?.addEventListener('click', () => {
    if(avatarInput) avatarInput.value = '';
    if(fileInput) fileInput.value = '';
    paintAvatar();
    setFeedback(feedback, 'Фото будет убрано после сохранения.', 'warning');
  });
  form.querySelector('[name="display_name"]')?.addEventListener('input', paintAvatar);
}
function profileSettingsUpdateBase(){
  const profile = state.profilePayload?.profile || {};
  const account = state.profilePayload?.account || {};
  const privacy = state.profilePayload?.privacy || {};
  return {
    display_name: profile.display_name || profileName(profile),
    avatar_url: profile.avatar_url || '',
    notification_email_enabled: (account.notification_email_enabled ?? state.user?.notification_email_enabled) !== false,
    profile_guest_visible: privacy.profile_guest_visible !== false,
    show_online_status: privacy.show_online_status === true,
    show_public_activity: privacy.show_public_activity !== false,
  };
}
function profileSettingCloseButtonHtml(){
  return '<button class="secondary" type="button" data-modal-close-local>Отмена</button>';
}
function profileNameChangeModal(){
  const profile = state.profilePayload?.profile || {};
  openModal('Имя', `<form class="form profile-setting-modal-form" id="profileNameChangeForm">
    <label><span>Имя</span><input name="display_name" value="${attr(profileName(profile))}" required minlength="2" autocomplete="name"></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Сохранить</button>${profileSettingCloseButtonHtml()}</div>
  </form>`, {compact:true,kind:'profile-setting',onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const form = root.querySelector('#profileNameChangeForm');
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Сохраняю имя...', 'warning');
        const payload = await api('/api/community/profile', {method:'POST', body:{...profileSettingsUpdateBase(), display_name:data.get('display_name')}});
        closeModal(true);
        say('Имя сохранено.', 'success');
        await refreshProfileAfterProfileSave(payload, 'settings');
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось сохранить имя.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }});
}
function profilePhotoChangeModal(){
  const profile = state.profilePayload?.profile || {};
  openModal('Фото профиля', `<form class="form profile-setting-modal-form" id="profilePhotoChangeForm">
    <input type="hidden" name="display_name" value="${attr(profileName(profile))}">
    <div class="profile-avatar-field">
      <input type="hidden" name="avatar_url" value="${attr(profile.avatar_url || '')}">
      <div class="profile-avatar-preview" data-profile-avatar-preview>${profileAvatarHtml(profile, 'settings')}</div>
      <div class="stack profile-photo-actions">
        <label class="profile-file-button"><span>Сменить</span><input name="avatar_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
        <button class="secondary" type="button" data-profile-avatar-clear>Убрать</button>
      </div>
    </div>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Сохранить</button>${profileSettingCloseButtonHtml()}</div>
  </form>`, {compact:true,kind:'profile-setting',onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const form = root.querySelector('#profilePhotoChangeForm');
    bindProfileAvatarField(form);
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Сохраняю фото...', 'warning');
        const payload = await api('/api/community/profile', {method:'POST', body:{...profileSettingsUpdateBase(), avatar_url:data.get('avatar_url')}});
        closeModal(true);
        say('Фото сохранено.', 'success');
        await refreshProfileAfterProfileSave(payload, 'settings');
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось сохранить фото.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }});
}
function profileEmailChangeModal(){
  const account = state.profilePayload?.account || {};
  const email = cleanText(account.email || '');
  const hasPassword = account.has_password !== false;
  const formHtml = hasPassword
    ? `<form class="form profile-setting-modal-form" id="profileEmailChangeForm">
        <label><span>Новая почта</span><input name="email" type="email" value="${attr(email)}" autocomplete="email" required></label>
        <label><span>Текущий пароль для подтверждения</span><input name="current_password" type="password" autocomplete="current-password" required></label>
        <p class="form-note" data-form-feedback data-feedback-style="note"></p>
        <div class="row"><button class="primary" data-save-content>Сохранить</button>${profileSettingCloseButtonHtml()}</div>
      </form>`
    : `<div class="detail profile-setting-modal-form">
        <p class="form-feedback is-warning">Чтобы менять почту, сначала задайте пароль.</p>
        <div class="row"><button class="secondary" type="button" data-modal-close-local>Закрыть</button></div>
      </div>`;
  openModal('Почта', formHtml, {compact:true,kind:'profile-setting',onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const form = root.querySelector('#profileEmailChangeForm');
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Сохраняю почту...', 'warning');
        const payload = await api('/api/community/account', {method:'POST', body:{email:data.get('email'), current_password:data.get('current_password')}});
        state.profilePayload.account = payload.account || state.profilePayload.account || {};
        closeModal(true);
        say('Почта сохранена.', 'success');
        setProfileTab('settings');
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось сохранить почту.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }});
}
function profilePasswordChangeModal(){
  const account = state.profilePayload?.account || {};
  const hasPassword = account.has_password !== false;
  openModal(hasPassword ? 'Сменить пароль' : 'Задать пароль', `<form class="form profile-setting-modal-form" id="profilePasswordChangeForm">
    ${hasPassword ? '<label><span>Текущий пароль</span><input name="current_password" type="password" autocomplete="current-password" required></label>' : ''}
    <label><span>Новый пароль</span><input name="new_password" type="password" autocomplete="new-password" minlength="8" required></label>
    <label><span>Повтор пароля</span><input name="new_password_confirm" type="password" autocomplete="new-password" minlength="8" required></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>${hasPassword ? 'Сохранить' : 'Задать'}</button>${profileSettingCloseButtonHtml()}</div>
  </form>`, {compact:true,kind:'profile-setting',onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const form = root.querySelector('#profilePasswordChangeForm');
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(data.get('new_password') !== data.get('new_password_confirm')){
        setFeedback(feedback, 'Пароли не совпадают.', 'warning');
        return;
      }
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Сохраняю пароль...', 'warning');
        const payload = await api('/api/community/account', {method:'POST', body:{current_password:data.get('current_password'), new_password:data.get('new_password'), new_password_confirm:data.get('new_password_confirm')}});
        state.profilePayload.account = payload.account || state.profilePayload.account || {};
        closeModal(true);
        say('Пароль сохранен.', 'success');
        setProfileTab('settings');
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось сохранить пароль.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }});
}
function openProfileSettingAction(action=''){
  if(action === 'name') profileNameChangeModal();
  if(action === 'photo') profilePhotoChangeModal();
  if(action === 'email') profileEmailChangeModal();
  if(action === 'password') profilePasswordChangeModal();
}
async function refreshProfileAfterProfileSave(payload, activeTab='settings'){
  state.user = payload.auth_user || state.user;
  cacheAuthUser(state.user);
  refreshChrome();
  const nextNickname = cleanText(payload.user?.nickname || state.profilePayload?.profile?.nickname || state.slug || state.user?.nickname || '');
  if(nextNickname){
    state.slug = nextNickname;
  }
  state.profileRouteKey = '';
  state.profileTab = activeTab;
  if(nextNickname) syncProfileTabUrl(activeTab, nextNickname, {replace:true});
  await renderProfile(nextNickname || state.slug || '');
}
function bindProfileTab(root=document){
  const cabinet = root.querySelector?.('.profile-cabinet') || document.querySelector('.profile-cabinet');
  if(!cabinet) return;
  cabinet.querySelectorAll('[data-action="profile-message-thread"]').forEach(button => {
    if(button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', event => {
      event.preventDefault();
      loadProfileMessages(button.dataset.id || '');
    });
  });
  const messageForm = cabinet.querySelector('#profileMessageForm');
  if(messageForm && messageForm.dataset.bound !== '1'){
    messageForm.dataset.bound = '1';
    messageForm.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Отправляю...', 'warning');
        const payload = await api('/api/community/messages', {method:'POST', body:{body:data.get('body'), thread_user_id:form.dataset.threadId || ''}});
        state.profileMessagesPayload = payload;
        state.messages = {unread_count:Number(payload.unread_count || 0), is_admin:Boolean(payload.is_admin)};
        const body = cabinet.querySelector('.profile-tab-body');
        if(body) body.innerHTML = profileMessagesHtml(payload);
        bindProfileTab(cabinet);
        syncHeaderControls();
        say('Сообщение отправлено.', 'success');
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось отправить сообщение.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }
  cabinet.querySelectorAll('[data-profile-setting]').forEach(button => {
    if(button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', event => {
      event.preventDefault();
      openProfileSettingAction(button.dataset.profileSetting || '');
    });
  });
  const publicForm = cabinet.querySelector('#profilePublicSettingsForm');
  if(publicForm && publicForm.dataset.bound !== '1'){
    publicForm.dataset.bound = '1';
    bindProfileAvatarField(publicForm);
    publicForm.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Сохраняю профиль...', 'warning');
        const emailEnabled = (state.profilePayload?.account?.notification_email_enabled ?? state.user?.notification_email_enabled) !== false;
        const payload = await api('/api/community/profile', {method:'POST', body:{display_name:data.get('display_name'), avatar_url:data.get('avatar_url'), notification_email_enabled:emailEnabled}});
        say('Профиль сохранен.', 'success');
        await refreshProfileAfterProfileSave(payload, 'settings');
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось сохранить профиль.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }
  const notificationForm = cabinet.querySelector('#profileNotificationSettingsForm');
  if(notificationForm && notificationForm.dataset.bound !== '1'){
    notificationForm.dataset.bound = '1';
    notificationForm.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const profile = state.profilePayload?.profile || {};
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Сохраняю...', 'warning');
        const payload = await api('/api/community/profile', {method:'POST', body:{display_name:profile.display_name || profileName(profile), avatar_url:profile.avatar_url || '', notification_email_enabled:Boolean(data.get('notification_email_enabled'))}});
        state.profilePayload.account = {...(state.profilePayload.account || {}), notification_email_enabled:Boolean(data.get('notification_email_enabled'))};
        say('Настройки писем сохранены.', 'success');
        await refreshProfileAfterProfileSave(payload, cabinet.dataset.profileTab === 'settings' ? 'settings' : 'notifications');
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось сохранить письма.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }
  const privacyForm = cabinet.querySelector('#profilePrivacySettingsForm');
  if(privacyForm && privacyForm.dataset.bound !== '1'){
    privacyForm.dataset.bound = '1';
    privacyForm.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const profile = state.profilePayload?.profile || {};
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Сохраняю...', 'warning');
        const emailEnabled = (state.profilePayload?.account?.notification_email_enabled ?? state.user?.notification_email_enabled) !== false;
        const payload = await api('/api/community/profile', {method:'POST', body:{
          display_name:profile.display_name || profileName(profile),
          avatar_url:profile.avatar_url || '',
          notification_email_enabled:emailEnabled,
          profile_guest_visible:Boolean(data.get('profile_guest_visible')),
          show_online_status:Boolean(data.get('show_online_status')),
          show_public_activity:Boolean(data.get('show_public_activity')),
        }});
        state.profilePayload.privacy = payload.privacy || state.profilePayload.privacy || {};
        say('Видимость сохранена.', 'success');
        await refreshProfileAfterProfileSave(payload, 'settings');
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось сохранить видимость.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }
  cabinet.querySelectorAll('[data-action="profile-activity-hide"]').forEach(button => {
    if(button.dataset.bound === '1') return;
    button.dataset.bound = '1';
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const itemType = button.dataset.kind || '';
      const itemId = button.dataset.id || '';
      if(!itemType || !itemId) return;
      if(!window.confirm('Скрыть эту запись из профиля?')) return;
      button.disabled = true;
      try{
        const payload = await api('/api/community/profile/activity/hide', {method:'POST', body:{item_type:itemType, item_id:itemId}});
        state.profilePayload = payload;
        const body = cabinet.querySelector('.profile-tab-body');
        if(body) body.innerHTML = profileBodyHtml('public', state.profilePayload, true);
        bindProfileTab(cabinet);
        say('Запись скрыта из профиля.', 'success');
      }catch(error){
        button.disabled = false;
        say(error.message || 'Не удалось скрыть запись.', 'danger');
      }
    });
  });
  const emailForm = cabinet.querySelector('#profileEmailForm');
  if(emailForm && emailForm.dataset.bound !== '1'){
    emailForm.dataset.bound = '1';
    emailForm.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Сохраняю почту...', 'warning');
        const payload = await api('/api/community/account', {method:'POST', body:{email:data.get('email'), current_password:data.get('current_password')}});
        state.profilePayload.account = payload.account || state.profilePayload.account || {};
        setFeedback(feedback, 'Почта сохранена.', 'success');
        const currentPasswordInput = form.querySelector('[name="current_password"]');
        if(currentPasswordInput) currentPasswordInput.value = '';
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось сохранить почту.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }
  const passwordForm = cabinet.querySelector('#profilePasswordForm');
  if(passwordForm && passwordForm.dataset.bound !== '1'){
    passwordForm.dataset.bound = '1';
    passwordForm.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(data.get('new_password') !== data.get('new_password_confirm')){
        setFeedback(feedback, 'Пароли не совпадают.', 'warning');
        return;
      }
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Обновляю пароль...', 'warning');
        const payload = await api('/api/community/account', {method:'POST', body:{current_password:data.get('current_password'), new_password:data.get('new_password'), new_password_confirm:data.get('new_password_confirm')}});
        state.profilePayload.account = payload.account || state.profilePayload.account || {};
        form.reset();
        setFeedback(feedback, 'Пароль обновлен.', 'success');
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось обновить пароль.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }
}
function setProfileTab(tab='public'){
  const cabinet = document.querySelector('.profile-cabinet');
  const isOwnProfile = cabinet?.dataset.profileMode === 'own';
  const tabs = profileTabsFor(isOwnProfile).map(([key]) => key);
  const requested = normalizeProfileTab(tab);
  const activeTab = tabs.includes(requested) ? requested : 'public';
  state.profileTab = activeTab;
  syncProfileTabUrl(activeTab, state.profilePayload?.profile?.nickname || state.slug || '', {replace:false});
  if(cabinet && state.profilePayload){
    cabinet.dataset.profileTab = activeTab;
    if(activeTab === 'messages') state.profileMessagesPayload = null;
    cabinet.querySelectorAll('.profile-nav-link').forEach(button => {
      const active = button.dataset.tab === activeTab;
      button.classList.toggle('active', active);
      if(active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const body = cabinet.querySelector('.profile-tab-body');
    if(body) body.innerHTML = profileBodyHtml(activeTab, state.profilePayload, isOwnProfile);
    bindProfileTab(cabinet);
    if(activeTab === 'messages') loadProfileMessages();
    return;
  }
  if(state.route === 'u') renderProfile(state.slug || '');
}
async function renderProfile(nickname=''){
  app.innerHTML = loading('Открываю профиль…');
  try{
    const payload = await api(`/api/community/profile/${encodeURIComponent(nickname)}`);
    const profile = payload.profile || {};
    const activeKeys = [state.user?.nickname, state.user?.username].map(value => cleanText(value).toLowerCase()).filter(Boolean);
    const activeDisplayName = cleanText(state.user?.display_name || '').toLowerCase();
    const profileNickname = cleanText(profile.nickname || '').toLowerCase();
    const profileDisplayName = cleanText(profile.display_name || '').toLowerCase();
    const isOwnProfile = Boolean(state.user) && (
      (Boolean(profileNickname) && activeKeys.includes(profileNickname))
      || (Boolean(activeDisplayName) && Boolean(profileDisplayName) && activeDisplayName === profileDisplayName)
    );
    const profileRouteKey = `${profileNickname || nickname}:${isOwnProfile ? 'own' : 'public'}`;
    if(isOwnProfile && profileTabFromLocation() === 'messages'){
      const thread = profileMessageThreadFromLocation();
      go('messages', '', thread ? {replace:true, params:`thread=${encodeURIComponent(thread)}`} : {replace:true});
      return;
    }
    if(isOwnProfile){
      state.user = {...state.user, display_name:profile.display_name || state.user.display_name, nickname:profile.nickname || state.user.nickname, avatar_url:profile.avatar_url || '', avatar_updated_at:profile.avatar_updated_at || '', notification_email_enabled:state.user.notification_email_enabled !== false};
      cacheAuthUser(state.user);
    }
    state.profilePayload = payload;
    document.title = `${profileName(profile)} — ${siteName()}`;
    const tabs = profileTabsFor(isOwnProfile).map(([key]) => key);
    const routeChanged = state.profileRouteKey !== profileRouteKey;
    const urlTab = profileTabFromLocation();
    const requestedTab = urlTab !== 'public' ? urlTab : normalizeProfileTab(routeChanged ? 'public' : state.profileTab || 'public');
    const activeTab = tabs.includes(requestedTab) ? requestedTab : 'public';
    state.profileRouteKey = profileRouteKey;
    state.profileTab = activeTab;
    if(activeTab === 'messages') state.profileMessagesPayload = null;
    syncProfileTabUrl(activeTab, profile.nickname || nickname, {replace:true});
    app.innerHTML = `<article class="profile-cabinet" data-profile-tab="${attr(activeTab)}" data-profile-mode="${isOwnProfile ? 'own' : 'public'}">
      <div class="profile-cabinet-shell">
        ${profileIdentityHtml(profile)}
        <section class="profile-workspace">
          ${profileWorkspaceHeadHtml(profile, activeTab, isOwnProfile)}
          <div class="profile-tab-body">
            ${profileBodyHtml(activeTab, payload, isOwnProfile)}
          </div>
        </section>
      </div>
    </article>`;
    bindProfileTab(app);
    if(activeTab === 'messages') loadProfileMessages();
  }catch(error){
    app.innerHTML = problem(error.message || 'Профиль не найден.');
  }
}

function homeStartHtml(){
  const cards = [
    {title:'Заявка', text:'Коротко опишите ситуацию и способ связи. Этого достаточно для первого шага.', action:'inquiry'},
    {title:'Услуги', text:'Разборы, карты, сопровождение и форматы, которые можно согласовать до работы.', route:'services'},
  ];
  return `<section class="home-band start-band">
    <div class="section-title"><h2>С чего начать</h2></div>
    <div class="path-grid">${cards.map(card => card.action ? `<button class="path-card" data-action="${attr(card.action)}" data-route="services" data-title="Заявка с главной">
      <strong>${esc(card.title)}</strong><span>${esc(card.text)}</span>
    </button>` : `<a class="path-card" href="${routeHref(card.route)}" data-route="${attr(card.route)}">
      <strong>${esc(card.title)}</strong><span>${esc(card.text)}</span>
    </a>`).join('')}</div>
  </section>`;
}

function homeFaqHtml(){
  const items = [
    ['Когда ждать ответ?', 'После заявки ответ идет по указанному контакту. Лучше сразу оставить Telegram, почту или другой удобный способ связи.'],
    ['Что писать в заявке?', 'Цель, краткую ситуацию, важные даты и главный вопрос. Поток тревоги лучше заменить фактами.'],
    ['Где смотреть ход работы?', 'После согласования администратор открывает кабинет в вашем профиле сайта: там видны заявки, услуги, оплаты и свежие записи.'],
  ];
  return `<section class="home-band faq-band">
    <div class="section-title"><h2>Частые вопросы</h2></div>
    <div class="faq-grid">${items.map(item => `<details><summary>${esc(item[0])}</summary><p>${esc(item[1])}</p></details>`).join('')}</div>
  </section>`;
}

function sectionTopicGroups(route, section={}, activeTopic='', activeSlug=''){
  if(!sectionTopicsActive(section)) return [];
  const items = publishedItems(section).map((item, index) => ({...item, route, index, sectionTitle: section.title || sectionNames[route]}));
  return sectionTopicList(section).map(topic => ({
    ...topic,
    active: Boolean(activeTopic && activeTopic === topic.slug),
    items: items.filter(item => cleanText(item.topic_slug) === topic.slug),
  }));
}
function questionTopicNavInitialLinksHtml(section={}, activeTopic=''){
  if(!sectionTopicsActive(section)) return '';
  const topics = sectionTopicList(section);
  if(!topics.length) return '';
  const active = cleanText(activeTopic || new URLSearchParams(location.search || '').get('topic') || '');
  const knownActive = topics.some(topic => topic.slug === active);
  const href = slug => slug ? `${routeHref('questions')}?topic=${encodeURIComponent(slug)}` : routeHref('questions');
  return `<a class="question-topic-link question-topic-all ${!knownActive ? 'is-active' : ''}" href="${attr(href(''))}" ${!knownActive ? 'aria-current="page"' : ''}>
      <span>Все вопросы</span><em>0</em>
    </a>
    ${topics.map(topic => `<a class="question-topic-link ${knownActive && active === topic.slug ? 'is-active' : ''}" href="${attr(href(topic.slug))}" ${knownActive && active === topic.slug ? 'aria-current="page"' : ''}>
      <span>${esc(topic.title)}</span><em>0</em>
    </a>`).join('')}`;
}
function sectionTopicNavHtml(route, section={}, activeTopic='', activeSlug=''){
  if(route === 'questions'){
    const links = questionTopicNavInitialLinksHtml(section, activeTopic);
    if(!links) return '';
    return `<aside class="topic-nav" aria-label="Темы раздела ${attr(sectionDisplayName(route))}">
      <div class="topic-nav-head">Темы</div>
      <div class="topic-nav-list question-topic-list">${links}</div>
    </aside>`;
  }
  const groups = sectionTopicGroups(route, section, activeTopic, activeSlug);
  if(!groups.length) return '';
  return `<aside class="topic-nav" aria-label="Темы раздела ${attr(sectionDisplayName(route))}">
    <div class="topic-nav-head">Темы</div>
    <div class="topic-nav-list">
      ${groups.map(group => `<details class="topic-nav-group ${group.active ? 'is-active' : ''}" ${group.active ? 'open' : ''}>
        <summary><span>${esc(group.title)}</span><em>${esc(group.items.length)}</em></summary>
        <nav class="topic-nav-links" aria-label="${attr(group.title)}">
          ${group.items.map(item => {
            const active = cleanText(item.slug) && cleanText(item.slug) === cleanText(activeSlug);
            return `<a class="${active ? 'is-active' : ''}" href="${materialHref(item)}" data-route="${attr(route)}" data-slug="${attr(item.slug)}" ${active ? 'aria-current="page"' : ''}>${esc(publicText(item.title || 'Материал'))}</a>`;
          }).join('') || '<span class="topic-nav-empty">Материалов пока нет</span>'}
        </nav>
      </details>`).join('')}
    </div>
  </aside>`;
}
function mobileTopicMenuHtml(route, section={}, activeTopic='', activeSlug=''){
  if(route === 'questions'){
    const links = questionTopicNavInitialLinksHtml(section, activeTopic);
    if(!links) return '';
    return `<details class="mobile-topic-menu">
      <summary class="plain mobile-topic-trigger">Темы</summary>
      <div class="mobile-topic-panel"><div class="topic-nav-list question-topic-list">${links}</div></div>
    </details>`;
  }
  const groups = sectionTopicGroups(route, section, activeTopic, activeSlug);
  if(!groups.length) return '';
  return `<details class="mobile-topic-menu">
    <summary class="plain mobile-topic-trigger">Темы</summary>
    <div class="mobile-topic-panel">
      <div class="topic-nav-list">
        ${groups.map(group => `<details class="topic-nav-group ${group.active ? 'is-active' : ''}" ${group.active ? 'open' : ''}>
          <summary><span>${esc(group.title)}</span><em>${esc(group.items.length)}</em></summary>
          <nav class="topic-nav-links" aria-label="${attr(group.title)}">
            ${group.items.map(item => {
              const active = cleanText(item.slug) && cleanText(item.slug) === cleanText(activeSlug);
              return `<a class="${active ? 'is-active' : ''}" href="${materialHref(item)}" data-route="${attr(route)}" data-slug="${attr(item.slug)}" ${active ? 'aria-current="page"' : ''}>${esc(publicText(item.title || 'Материал'))}</a>`;
            }).join('') || '<span class="topic-nav-empty">Материалов пока нет</span>'}
          </nav>
        </details>`).join('')}
      </div>
    </div>
  </details>`;
}
function sectionTopicLayoutHtml(route, section={}, bodyHtml='', activeTopic='', activeSlug=''){
  const nav = sectionTopicNavHtml(route, section, activeTopic, activeSlug);
  const topicSlot = nav || '<div class="topic-nav topic-nav-placeholder" aria-hidden="true"></div>';
  return `<div class="section-topic-layout has-topic-slot ${nav ? 'has-topic-nav' : 'is-topic-empty'}">${topicSlot}<div class="section-topic-main">${bodyHtml}</div></div>`;
}
function renderSection(route){
  const section = state.content.sections?.[route] || {};
  if(route === 'questions'){
    const items = filteredSectionMaterials(route, section);
    const bodyHtml = `${questionsCommunityShell(section, items)}`;
    app.innerHTML = `
      <section class="public-section section-${attr(route)}">
        ${sectionActionsHtml(route, section)}
        ${sectionTopicLayoutHtml(route, section, bodyHtml)}
        ${footer()}
      </section>`;
    hydrateContentCardMedia(app);
    loadPublicQuestions();
    return;
  }
  const items = filteredSectionMaterials(route, section);
  const bodyHtml = `
      <h1 class="visually-hidden">${esc(publicText(section.title || sectionNames[route]))}</h1>
      <div class="content-grid section-grid section-grid-${attr(route)}">${items.map(materialCard).join('') || empty('В этом разделе пока нет опубликованных материалов.')}</div>`;
  app.innerHTML = `
    <section class="public-section section-${attr(route)}">
      ${sectionActionsHtml(route, section)}
      ${sectionTopicLayoutHtml(route, section, bodyHtml)}
      ${footer()}
    </section>`;
  hydrateContentCardMedia(app);
}
function sectionMaterialFilterHtml(route, section={}){
  if(!isAdmin()) return '';
  const counts = materialStatusCounts(Array.isArray(section.items) ? section.items : []);
  const active = materialFilterFor(route);
  const filters = [
    ['all', 'Все', counts.all],
    ['published', 'Открытые', counts.published],
    ['draft', 'Черновики', counts.draft],
    ['hidden', 'Скрытые', counts.hidden],
  ];
  const current = filters.find(([key]) => key === active) || filters[0];
  const countHtml = (key, count) => key === 'all' ? '' : `<span>${esc(count)}</span>`;
  return `<details class="section-admin-filters">
    <summary class="plain section-filter-summary">${esc(current[1])}${countHtml(current[0], current[2])}</summary>
    <div class="section-filter-options" role="menu" aria-label="Фильтр материалов">
      ${filters.map(([key, label, count]) => `<button class="${active === key ? 'active' : ''}" type="button" role="menuitem" data-action="material-filter" data-route="${attr(route)}" data-filter="${attr(key)}">${esc(label)}${countHtml(key, count)}</button>`).join('')}
    </div>
  </details>`;
}
function sectionActionsHtml(route, section={}){
  const subscription = subscriptionButtonHtml('section', route, '', 'Следить');
  const mobileTopics = mobileTopicMenuHtml(route, section);
  const adminMode = isAdmin();
  const questionAction = route === 'questions' && !adminMode && isPublicUser()
    ? '<div class="section-question-actions"><button class="primary question-toolbar-action" data-action="question-new">Задать вопрос</button></div>'
    : '';
  const admin = adminMode
    ? route === 'questions'
      ? `<button class="primary" data-action="admin-question-new">Добавить</button>`
      : `${sectionMaterialFilterHtml(route, section)}<button class="primary" data-action="new-material" data-route="${attr(route)}">Добавить</button>`
    : '';
  const classes = ['section-tools'];
  if(admin) classes.push('has-admin-actions');
  if(questionAction) classes.push('has-question-action');
  if(mobileTopics) classes.push('has-topic-actions');
  return `<div class="${classes.join(' ')}">
    <div class="section-left-actions">${mobileTopics}${questionAction}</div>
    <div class="section-right-actions">
      ${admin}
      ${subscription ? `<div class="section-public-actions">${subscription}</div>` : ''}
    </div>
  </div>`;
}
function materialCard(item, modifier=''){
  const label = item.route === 'services' && showItemField(item, 'price') ? cleanText(item.price) : '';
  const excerpt = publicText(item.excerpt || '');
  const hasCover = Boolean(String(item.cover_image_url || '').trim());
  const ratioClass = hasCover ? coverRatioClass(item) : '';
  return `<article class="content-card card-${attr(item.route || 'material')} ${attr(modifier)} ${hasCover ? 'has-cover' : 'no-cover'} ${attr(ratioClass)}">
    <a class="content-card-main" href="${materialHref(item)}" data-route="${item.route}" data-slug="${attr(item.slug)}">
      ${cardMediaHtml(item, item.title || 'Материал', item.sectionTitle || '')}
      <div class="content-card-copy">
        <h2>${esc(publicText(item.title || 'Без названия'))}</h2>
        ${excerpt ? `<p>${esc(excerpt)}</p>` : ''}
        ${label ? `<span class="card-foot"><span>${esc(label)}</span></span>` : ''}
      </div>
    </a>
    ${item.route === 'services' ? `<button class="service-card-action" type="button" data-action="inquiry" data-route="services" data-title="${attr(item.title || 'Услуга')}">Оставить заявку</button>` : ''}
  </article>`;
}
function materialStatusClass(status=''){
  const clean = materialStatus(status);
  if(clean === 'published') return 'is-live';
  if(clean === 'draft') return 'is-draft';
  return 'is-hidden';
}
function materialAuthorHtml(item={}){
  const name = cleanText(item.author_name || ownerName() || userDisplayName());
  if(!name) return '';
  const slug = cleanText(item.author_slug || item.author_nickname || '');
  if(slug){
    return `<a class="pill material-meta-link material-author-link" href="${routeHref('u', slug)}" data-route="u" data-slug="${attr(slug)}">${esc(name)}</a>`;
  }
  return `<span class="pill">${esc(name)}</span>`;
}
function materialPublicTools(route, slug, followHtml='', adminHtml='', topicMenuHtml=''){
  return `<div class="material-public-tools">
    <a class="plain material-back-link" href="${routeHref(route)}" data-route="${attr(route)}">К разделу</a>
    ${topicMenuHtml || ''}
    <div class="material-top-actions">
      ${followHtml ? `<div class="material-follow-action">${followHtml}</div>` : ''}
      ${adminHtml || ''}
    </div>
  </div>`;
}
function materialPageAdminTools(route, slug, item={}){
  if(!isAdmin()) return '';
  const status = materialStatus(item.status);
  const nextStatus = adminMaterialNextStatus(item);
  const visibilityLabel = status === 'published' ? 'Скрыть' : 'Открыть';
  const statusPill = status !== 'published'
    ? `<strong class="material-status-pill ${materialStatusClass(status)}">${esc(statusName(status))}</strong>`
    : '';
  return `<div class="material-admin-tools" aria-label="Действия администратора">
    ${statusPill}
    <details class="material-admin-menu" data-admin-menu>
      <summary class="material-admin-menu-trigger" aria-label="Управление материалом" title="Управление материалом"><span aria-hidden="true">⋯</span></summary>
      <div class="material-admin-menu-list" role="menu">
        <button class="plain" type="button" role="menuitem" data-action="edit-material" data-edit-route="${attr(route)}" data-slug="${attr(slug)}">Править</button>
        <button class="plain" type="button" role="menuitem" data-action="toggle-material-visibility" data-route="${attr(route)}" data-slug="${attr(slug)}" data-status="${attr(nextStatus)}">${esc(visibilityLabel)}</button>
        <button class="plain danger" type="button" role="menuitem" data-action="delete-material" data-route="${attr(route)}" data-slug="${attr(slug)}">Удалить</button>
      </div>
    </details>
  </div>`;
}
function materialMetaHeadHtml(item={}, route=''){
  const authorName = cleanText(item.author_name || ownerName() || userDisplayName());
  const authorSlug = cleanText(item.author_slug || item.author_nickname || '');
  const date = cleanText(item.date);
  const parts = [];
  if(authorName){
    parts.push(authorSlug
      ? `<a class="material-head-author" href="${routeHref('u', authorSlug)}" data-route="u" data-slug="${attr(authorSlug)}">${esc(authorName)}</a>`
      : `<span class="material-head-author">${esc(authorName)}</span>`);
  }
  if(date) parts.push(`<span class="material-head-date">${esc(dateLong(date))}</span>`);
  if(!parts.length) return '';
  return `<div class="material-head-meta">${parts.join('<span class="material-head-dot" aria-hidden="true">·</span>')}</div>`;
}
function hydrateMaterialToc(){
  const article = app.querySelector('.material-page.reading-page');
  if(!article) return;
  const body = article.querySelector('.material-body');
  if(!body) return;
  const headings = [...body.querySelectorAll('h2, h3')];
  if(headings.length < 2) return;
  const used = new Set();
  const slugify = (text='') => {
    const base = String(text || '').trim().toLowerCase()
      .replace(/[ \s]+/g, '-')
      .replace(/[^Ѐ-ӿa-z0-9-]+/g, '')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'section';
    let id = base;
    let counter = 2;
    while(used.has(id)){ id = `${base}-${counter++}`; }
    used.add(id);
    return id;
  };
  headings.forEach(h => { if(!h.id) h.id = slugify(h.textContent); });
  const links = headings.map(h =>
    `<a class="material-toc-link toc-${h.tagName.toLowerCase()}" href="#${attr(h.id)}" data-toc-link="${attr(h.id)}">${esc((h.textContent || '').trim())}</a>`
  ).join('');
  // Оглавление кладём ОТДЕЛЬНЫМ блоком рядом со статьёй, а не внутри неё.
  // Так статья остаётся узкой и центрированной, а TOC живёт справа как
  // самостоятельная панель и липнет при прокрутке.
  const aside = document.createElement('aside');
  aside.className = 'material-toc';
  aside.setAttribute('aria-label', 'Содержание материала');
  aside.innerHTML = `<div class="material-toc-head">Содержание</div><nav class="material-toc-list">${links}</nav>`;
  let layout = article.closest('.material-topic-layout, .material-layout');
  if(!layout){
    layout = document.createElement('div');
    layout.className = 'material-layout';
    article.parentNode.insertBefore(layout, article);
    layout.appendChild(article);
  }else{
    layout.classList.add('has-material-toc');
  }
  layout.appendChild(aside);
  if(typeof IntersectionObserver === 'function'){
    const linkMap = new Map();
    aside.querySelectorAll('[data-toc-link]').forEach(link => linkMap.set(link.dataset.tocLink, link));
    let activeId = '';
    const setActive = (id) => {
      if(!id || id === activeId) return;
      activeId = id;
      aside.querySelectorAll('[data-toc-link].is-active').forEach(node => node.classList.remove('is-active'));
      const link = linkMap.get(id);
      if(link) link.classList.add('is-active');
    };
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if(visible.length) setActive(visible[0].target.id);
    }, {rootMargin: '-20% 0px -65% 0px', threshold: 0});
    headings.forEach(h => observer.observe(h));
    setActive(headings[0].id);
  }
}

function renderMaterial(route, slug){
  if(route === 'questions') return renderQuestionDetail(slug);
  const section = state.content.sections?.[route] || {};
  const item = findMaterial(route, slug);
  if(!item){
    app.innerHTML = `<section class="gate-card"><h1>Материал не найден</h1><p>Он мог быть скрыт, переименован или еще не опубликован.</p><div class="row"><a class="secondary" href="${routeHref(route)}" data-route="${route}">Назад</a></div></section>`;
    return;
  }
  const materialPrice = showItemField(item, 'price') ? cleanText(item.price) : '';
  const followHtml = subscriptionButtonHtml('material', route, slug, 'Следить');
  const commentsDisabled = isAdmin() && materialStatus(item.status) !== 'published';
  const metaHeadHtml = materialMetaHeadHtml(item, route);
  const likesHtml = typeof publicationLikesShell === 'function' ? publicationLikesShell(route, slug) : '';
  const footerHtml = materialPrice
    ? `<div class="material-meta material-meta-public material-meta-footer"><span class="pill price">${esc(materialPrice)}</span></div>`
    : '';
  const articleHtml = `
    <article class="material-page reading-page material-${attr(route)} no-cover">
      ${materialPublicTools(route, slug, followHtml, materialPageAdminTools(route, slug, item), mobileTopicMenuHtml(route, section, cleanText(item.topic_slug), slug))}
      <header class="material-head">
        <h1 class="material-title">${esc(publicText(item.title))}</h1>
        ${metaHeadHtml}
      </header>
      <div class="material-body">${materialContentHtml(item)}</div>
      ${footerHtml}
      ${showItemField(item, 'cta') ? (route === 'services' ? serviceCta(item) : materialAside(item)) : ''}
      ${likesHtml}
      ${['works','articles'].includes(route) ? commentsShell(route, slug, item) : ''}
    </article>`;
  const topicNav = sectionTopicNavHtml(route, section, cleanText(item.topic_slug), slug);
  app.innerHTML = topicNav ? `<div class="material-topic-layout has-topic-nav">${topicNav}${articleHtml}</div>` : articleHtml;
  hydrateMaterialToc();
  if(typeof loadPublicationLikes === 'function') loadPublicationLikes(route, slug, app);
  if(['works','articles'].includes(route) && !commentsDisabled){
    bindInlineCommentForms(app);
    loadComments(route, slug);
  }
}
