function loginModal(role='admin'){
  if(role !== 'admin'){ publicLoginModal(); return; }
  if(role === 'admin' && state.setupRequired && !state.user){ setupAdminModal(); return; }
  openModal('Вход администратора', `<form class="form" id="loginForm"><input type="hidden" name="role" value="admin"><label><span>Логин</span><input name="username" autocomplete="username" required></label><label><span>Пароль</span><input name="password" type="password" autocomplete="current-password" required></label><p class="form-note" data-form-feedback data-feedback-style="note"></p><div class="row"><button class="primary" data-save-content>Войти</button></div><p class="subtle">Вход в управление сайтом открыт только администратору.</p></form>`, {compact:true,onMount(root){
    root.querySelector('#loginForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Проверяю вход…', 'warning');
        const payload = await api('/api/auth/login', {method:'POST', body:{role:data.get('role'), username:data.get('username'), password:data.get('password')}});
        state.user = payload.user; if(hasAdminRights()){ state.adminViewMode = 'admin'; localStorage.setItem(keys.adminViewMode, 'admin'); } cacheAuthUser(state.user); closeModal(true); say('Вход выполнен.','success'); resetAdminState(); await reloadContent(); go(payload.user.role === 'admin' ? 'admin' : 'trebnik'); render();
      }catch(error){ setFeedback(feedback, error.message || 'Не удалось войти.', 'danger'); say(error.message,'danger'); }
      finally{ delete form.dataset.saving; setContentFormBusy(form, false); }
    });
  }});
}
function setupAdminModal(){
  openModal('Первичная настройка', `<form class="form" id="setupForm"><p class="subtle">Введите ключ из окна запуска сервера или файла <b>data/setup_key.txt</b>.</p><label><span>Ключ настройки</span><input name="setup_key" autocomplete="one-time-code" required></label><label><span>Имя</span><input name="display_name" required></label><label><span>Логин</span><input name="username" autocomplete="username" required minlength="3"></label><label><span>Пароль</span><input name="password" type="password" autocomplete="new-password" required minlength="8"></label><p class="form-note" data-form-feedback data-feedback-style="note"></p><div class="row"><button class="primary" data-save-content>Создать вход</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div></form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    root.querySelector('#setupForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Создаю вход…', 'warning');
        const payload = await api('/api/auth/setup-admin', {method:'POST', body:{setup_key:data.get('setup_key'), display_name:data.get('display_name'), username:data.get('username'), password:data.get('password')}});
        state.user = payload.user; state.adminViewMode = 'admin'; localStorage.setItem(keys.adminViewMode, 'admin'); cacheAuthUser(state.user); state.setupRequired = false; closeModal(true); say('Администратор создан.','success'); resetAdminState(); await reloadContent(); go('admin'); render();
      }catch(error){ setFeedback(feedback, error.message || 'Не удалось создать вход.', 'danger'); say(error.message,'danger'); }
      finally{ delete form.dataset.saving; setContentFormBusy(form, false); }
    });
  }});
}
async function logout(){
  try{ await api('/api/auth/logout', {method:'POST', body:{}}); }catch{}
  clearBrowserSessionCache(); state.user = null; state.adminTraffic = null; state.adminTrafficPromise = null; resetAdminState(); resetCommunityState(); await reloadContent().catch(()=>{}); say('Вы вышли.'); go('home'); render();
}
async function copy(text){
  try{ await navigator.clipboard.writeText(text); say('Скопировано.','success'); }
  catch{ say('Скопируйте вручную.','warning'); }
}
function noteModal(){
  if(!state.clientId){ say('Сначала выберите клиента.','warning'); return; }
  openModal('Заметка по клиенту', `<form class="form" id="noteForm"><label><span>Заметка</span><textarea name="text" rows="5" required></textarea></label><p class="form-note" data-form-feedback data-feedback-style="note"></p><div class="row"><button class="primary" data-save-content>Сохранить</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div></form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    root.querySelector('#noteForm').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Сохраняю заметку…', 'warning');
        await api('/api/admin/note', {method:'POST', body:{client_id:state.clientId, text:data.get('text')}});
        closeModal(true);
        say('Заметка сохранена.','success');
        await loadDashboard(true);
        if(state.route === 'trebnik' && adminTrebnikPage() === 'clients' && state.clientId) await loadAdminClientOverview(state.clientId, true).catch(()=>{});
        state.route === 'trebnik' ? renderTrebnik() : renderAdmin();
      }
      catch(error){ setFeedback(feedback, error.message || 'Не удалось сохранить заметку.', 'danger'); say(error.message,'danger'); }
      finally{ delete form.dataset.saving; setContentFormBusy(form, false); }
    });
  }});
}
async function submitSimpleModal(form, feedback, path, body, successText, afterSuccess=()=>{}){
  if(form.dataset.saving === '1') return;
  form.dataset.saving = '1';
  setContentFormBusy(form, true);
  try{
    setFeedback(feedback, 'Отправляю…', 'warning');
    const payload = await api(path, {method:'POST', body});
    closeModal(true);
    say(payload.warning || successText, payload.warning ? 'warning' : 'success');
    await afterSuccess(payload);
  }catch(error){
    setFeedback(feedback, error.message || 'Не удалось выполнить действие.', 'danger');
    say(error.message || 'Не удалось выполнить действие.', 'danger');
  }finally{
    delete form.dataset.saving;
    setContentFormBusy(form, false);
  }
}

async function finishPublicAuth(payload, message='Вход выполнен.'){
  const nextAction = state.afterAuthAction || '';
  state.afterAuthAction = '';
  state.user = payload.user;
  if(hasAdminRights()){
    state.adminViewMode = 'admin';
    localStorage.setItem(keys.adminViewMode, 'admin');
  }
  cacheAuthUser(state.user);
  await refreshCommunityUserData();
  closeModal(true);
  say(message, 'success');
  refreshChrome();
  await reloadContent().catch(() => {});
  render();
  if(nextAction === 'site-message' || nextAction === 'messages') setTimeout(() => openOwnMessagesTab(), 0);
}

function authModeTabs(mode='login'){
  if(!state.health?.community?.registration_enabled){
    return `<div class="row auth-mode-tabs">
      <button class="primary" type="button" data-auth-mode="login">Вход</button>
    </div>`;
  }
  return `<div class="row auth-mode-tabs">
    <button class="${mode === 'login' ? 'primary' : 'secondary'}" type="button" data-auth-mode="login">Вход</button>
    <button class="${mode === 'register' ? 'primary' : 'secondary'}" type="button" data-auth-mode="register">Регистрация</button>
  </div>`;
}

function wireAuthModeTabs(root){
  root.querySelectorAll('[data-auth-mode]').forEach(button => {
    button.addEventListener('click', () => publicLoginModal(button.dataset.authMode || 'login'));
  });
}

function publicLoginModal(mode='login'){
  if(mode === 'register'){
    if(!state.health?.community?.registration_enabled){
      openModal('Регистрация', `<p class="form-note">Регистрация пока закрыта.</p><div class="row"><button class="primary" type="button" data-auth-mode="login">Войти</button></div>`, {compact:true,onMount:wireAuthModeTabs});
      return;
    }
    openModal('Аккаунт', `<form class="form" id="publicRegisterForm">
      ${authModeTabs('register')}
      <label><span>Почта</span><input name="email" type="email" autocomplete="email" required></label>
      <label class="toggle-line"><input name="accepted_legal" type="checkbox"><span>Я принимаю <a href="${routeHref('rules')}" data-route="rules">правила сайта</a> и даю <a href="${routeHref('personal-data-consent')}" data-route="personal-data-consent">согласие на обработку персональных данных</a>, включая публикацию моего публичного профиля и материалов.</span></label>
      <p class="form-note" data-form-feedback data-feedback-style="note"></p>
      <div class="row"><button class="primary" data-save-content disabled>Получить код</button></div>
    </form>`, {compact:true,onMount(root){
      wireAuthModeTabs(root);
      const form = root.querySelector('#publicRegisterForm');
      const legalCheckbox = form?.querySelector('[name="accepted_legal"]');
      const submitButton = form?.querySelector('[data-save-content]');
      const syncSubmit = () => {
        if(!submitButton || !legalCheckbox) return;
        submitButton.disabled = form?.dataset.saving === '1' || !legalCheckbox.checked;
      };
      legalCheckbox?.addEventListener('change', syncSubmit);
      syncSubmit();
      form?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const feedback = form.querySelector('[data-form-feedback]');
        const data = new FormData(form);
        if(!Boolean(data.get('accepted_legal'))){
          setFeedback(feedback, 'Чтобы зарегистрироваться, примите правила и согласие на обработку данных.', 'warning');
          syncSubmit();
          return;
        }
        if(form.dataset.saving === '1') return;
        form.dataset.saving = '1';
        syncSubmit();
        setContentFormBusy(form, true);
        try{
          setFeedback(feedback, 'Отправляю код…', 'warning');
          await api('/api/community/auth/register/request-code', {method:'POST', body:{email:data.get('email'), accepted_legal:true}});
          publicRegisterCodeModal({email:String(data.get('email') || '')});
        }catch(error){
          setFeedback(feedback, error.message || 'Не удалось отправить код.', 'danger');
        }finally{
          delete form.dataset.saving;
          setContentFormBusy(form, false);
          syncSubmit();
        }
      });
    }});
    return;
  }

  openModal('Аккаунт', `<form class="form" id="publicPasswordLoginForm">
    ${authModeTabs('login')}
    <label><span>Почта</span><input name="login" type="email" autocomplete="username" required></label>
    <label><span>Пароль</span><input name="password" type="password" autocomplete="current-password" required></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Войти</button><button class="plain" type="button" data-reset-password>Забыли пароль?</button></div>
  </form>`, {compact:true,onMount(root){
    wireAuthModeTabs(root);
    root.querySelector('[data-reset-password]')?.addEventListener('click', publicResetModal);
    root.querySelector('#publicPasswordLoginForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Проверяю вход…', 'warning');
        const payload = await api('/api/community/auth/login', {method:'POST', body:{login:data.get('login'), password:data.get('password')}});
        await finishPublicAuth(payload);
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось войти.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }});
}

function publicRegisterCodeModal(pending){
  openModal('Код регистрации', `<form class="form" id="publicRegisterCodeForm">
    <p class="subtle">Письмо отправлено на ${esc(pending.email)}.</p>
    <input type="hidden" name="email" value="${attr(pending.email)}">
    <label><span>Код</span><input name="code" inputmode="numeric" autocomplete="one-time-code" minlength="6" maxlength="6" required></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Подтвердить код</button><button class="secondary" type="button" data-auth-mode="register">Получить новый код</button></div>
  </form>`, {compact:true,onMount(root){
    wireAuthModeTabs(root);
    root.querySelector('#publicRegisterCodeForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Проверяю код…', 'warning');
        const payload = await api('/api/community/auth/register/verify-code', {method:'POST', body:{email:data.get('email'), code:data.get('code')}});
        publicRegisterDetailsModal({email:String(data.get('email') || ''), registration_token:payload.registration_token || ''});
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось подтвердить код.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }});
}

function publicRegisterDetailsModal(pending){
  openModal('Профиль', `<form class="form" id="publicRegisterDetailsForm">
    <p class="form-note is-muted">Почта подтверждена. Теперь придумайте публичное имя и пароль для входа.</p>
    <input type="hidden" name="email" value="${attr(pending.email)}">
    <input type="hidden" name="registration_token" value="${attr(pending.registration_token)}">
    <label><span>Публичное имя</span><input name="display_name" autocomplete="name" required minlength="2"></label>
    <label><span>Пароль</span><input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
    <label><span>Повторите пароль</span><input name="password_confirm" type="password" autocomplete="new-password" required minlength="8"></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Создать аккаунт</button></div>
  </form>`, {compact:true,onMount(root){
    root.querySelector('#publicRegisterDetailsForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(data.get('password') !== data.get('password_confirm')){
        setFeedback(feedback, 'Пароли не совпадают.', 'warning');
        return;
      }
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Создаю аккаунт…', 'warning');
        const payload = await api('/api/community/auth/register/complete', {method:'POST', body:{email:data.get('email'), registration_token:data.get('registration_token'), display_name:data.get('display_name'), password:data.get('password'), password_confirm:data.get('password_confirm')}});
        await finishPublicAuth(payload, 'Регистрация завершена.');
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось завершить регистрацию.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }});
}

function publicResetModal(){
  openModal('Восстановление пароля', `<form class="form" id="publicResetForm">
    <p class="subtle">Введите почту аккаунта. Сайт пришлет код для нового пароля.</p>
    <label><span>Почта</span><input name="email" type="email" autocomplete="email" required></label>
    <p class="form-note" data-form-feedback data-feedback-style="note">Код действует ${esc(state.health?.community?.login_code_ttl_minutes || 10)} минут.</p>
    <div class="row"><button class="primary" data-save-content>Получить код</button><button class="secondary" type="button" data-auth-mode="login">Назад ко входу</button></div>
  </form>`, {compact:true,onMount(root){
    wireAuthModeTabs(root);
    root.querySelector('#publicResetForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Отправляю код…', 'warning');
        await api('/api/community/auth/password-reset/request-code', {method:'POST', body:{email:data.get('email')}});
        publicResetCodeModal(String(data.get('email') || ''));
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось отправить код.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }});
}

function publicResetCodeModal(email){
  openModal('Новый пароль', `<form class="form" id="publicResetCodeForm">
    <p class="subtle">Письмо отправлено на ${esc(email)}.</p>
    <input type="hidden" name="email" value="${attr(email)}">
    <label><span>Код</span><input name="code" inputmode="numeric" autocomplete="one-time-code" minlength="6" maxlength="6" required></label>
    <label><span>Новый пароль</span><input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
    <label><span>Повторите пароль</span><input name="password_confirm" type="password" autocomplete="new-password" required minlength="8"></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Сохранить пароль</button><button class="secondary" type="button" data-reset-password>Получить новый код</button></div>
  </form>`, {compact:true,onMount(root){
    root.querySelector('[data-reset-password]')?.addEventListener('click', publicResetModal);
    root.querySelector('#publicResetCodeForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(data.get('password') !== data.get('password_confirm')){
        setFeedback(feedback, 'Пароли не совпадают.', 'warning');
        return;
      }
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Проверяю код…', 'warning');
        const payload = await api('/api/community/auth/password-reset/complete', {method:'POST', body:{email:data.get('email'), code:data.get('code'), password:data.get('password'), password_confirm:data.get('password_confirm')}});
        await finishPublicAuth(payload, 'Пароль обновлен.');
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось обновить пароль.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }});
}

function profileSettingsModal(){
  if(!isPublicUser()){
    say('Настройки публичного профиля доступны только участникам сайта.', 'warning');
    return;
  }
  const currentProfile = {
    display_name: userDisplayName(),
    nickname: state.user.nickname || state.user.username || '',
    avatar_url: state.user.avatar_url || '',
    notification_email_enabled: state.user.notification_email_enabled !== false,
  };
  const requiredChanges = [
    state.user.must_change_nickname ? 'имя' : '',
    state.user.must_change_avatar ? 'фото' : '',
  ].filter(Boolean);
  openModal('Настройки профиля', `<form class="form" id="profileSettingsForm">
    <label><span>Публичное имя</span><input name="display_name" value="${attr(userDisplayName())}" required minlength="2"></label>
    ${requiredChanges.length ? `<p class="form-feedback is-warning">Администратор попросил обновить: ${esc(requiredChanges.join(', '))}.</p>` : ''}
    <p class="form-note is-muted">Имя и фото видны в публичном профиле.</p>
    <div class="profile-avatar-field">
      <input type="hidden" name="avatar_url" value="${attr(currentProfile.avatar_url)}">
      <div class="profile-avatar-preview" data-profile-avatar-preview>${profileAvatarHtml(currentProfile, 'settings')}</div>
      <div class="stack">
        <label><span>Фото профиля</span><input name="avatar_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
        <div class="row"><button class="secondary" type="button" data-profile-avatar-clear>Убрать фото</button></div>
      </div>
    </div>
    <label class="toggle-line"><input name="notification_email_enabled" type="checkbox" ${currentProfile.notification_email_enabled ? 'checked' : ''}><span>Получать важные письма по уведомлениям</span></label>
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" data-save-content>Сохранить</button><button class="secondary" type="button" data-modal-close-local>Отмена</button></div>
  </form>`, {compact:true,onMount(root){
    root.querySelector('[data-modal-close-local]')?.addEventListener('click', closeModal);
    const form = root.querySelector('#profileSettingsForm');
    const feedback = form?.querySelector('[data-form-feedback]');
    const avatarInput = form?.querySelector('[name="avatar_url"]');
    const fileInput = form?.querySelector('[name="avatar_file"]');
    const preview = form?.querySelector('[data-profile-avatar-preview]');
    const clearButton = form?.querySelector('[data-profile-avatar-clear]');
    const paintAvatar = () => {
      if(!preview || !avatarInput) return;
      const data = {display_name: form?.querySelector('[name="display_name"]')?.value || userDisplayName(), nickname: state.user.nickname || '', avatar_url: avatarInput.value};
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
        setFeedback(feedback, 'Загружаю фото…', 'warning');
        const uploaded = await uploadProfileAvatar(file);
        avatarInput.value = String(uploaded.path || '').trim();
        fileInput.value = '';
        paintAvatar();
        setFeedback(feedback, 'Фото загружено. Теперь сохраните профиль.', 'success');
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
      setFeedback(feedback, 'Фото будет убрано после сохранения профиля.', 'warning');
    });
    form?.querySelector('[name="display_name"]')?.addEventListener('input', paintAvatar);
    form?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const feedback = form.querySelector('[data-form-feedback]');
      const data = new FormData(form);
      if(form.dataset.saving === '1') return;
      form.dataset.saving = '1';
      setContentFormBusy(form, true);
      try{
        setFeedback(feedback, 'Сохраняю профиль…', 'warning');
        const payload = await api('/api/community/profile', {method:'POST', body:{display_name:data.get('display_name'), avatar_url:data.get('avatar_url'), notification_email_enabled:Boolean(data.get('notification_email_enabled'))}});
        state.user = payload.auth_user || state.user;
        cacheAuthUser(state.user);
        closeModal(true);
        say('Профиль сохранен.', 'success');
        refreshChrome();
        render();
      }catch(error){
        setFeedback(feedback, error.message || 'Не удалось сохранить профиль.', 'danger');
      }finally{
        delete form.dataset.saving;
        setContentFormBusy(form, false);
      }
    });
  }});
}

