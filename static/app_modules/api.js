function siteContentApiPath(){
  return isVisitorMode() ? '/api/site/content?view=public' : '/api/site/content';
}

async function api(path, opts={}){
  const headers = {};
  const request = { method: opts.method || 'GET', headers, credentials:'same-origin' };
  if(request.method === 'GET') request.cache = 'no-store';
  if(opts.formData){
    request.body = opts.formData;
  }else if(opts.body !== undefined){
    headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(opts.body);
  }else if(opts.rawBody !== undefined){
    request.body = opts.rawBody;
  }
  let response;
  try{
    response = await fetch(path, request);
  }catch(error){
    throw new Error('Сервер не отвечает. Проверьте интернет или попробуйте обновить страницу через минуту.');
  }
  const data = await response.json().catch(() => ({}));
  if(!response.ok || data.ok === false){
    if(response.status === 401 && !opts.keepSessionOn401){ clearBrowserSessionCache(); state.user = null; }
    if(response.status === 413){
      throw new Error('Файл слишком большой для текущего лимита сервера. Попробуйте файл поменьше или повторите загрузку после обновления страницы.');
    }
    const error = new Error(data.error || `Ошибка ${response.status}`);
    error.status = response.status;
    error.code = data.code || '';
    error.source = data.source || '';
    throw error;
  }
  if(data.ok !== true) throw new Error('Сервер не подтвердил действие. Обновите страницу и попробуйте снова.');
  if(data.source === 'copy' || data.mode === 'snapshot' || data.sync?.status === 'using_copy'){
    data.snapshot = true;
  }
  data.loaded_at = new Date().toISOString();
  return data;
}

function parseApiResponseText(text=''){
  try{
    return JSON.parse(text || '{}');
  }catch(error){
    return {};
  }
}
function apiErrorFromResponse(status, data={}){
  if(status === 401){
    clearBrowserSessionCache();
    state.user = null;
  }
  if(status === 413){
    return new Error('Файл слишком большой для текущего лимита сервера. Попробуйте файл поменьше или обновите страницу.');
  }
  const error = new Error(data.error || `Ошибка ${status}`);
  error.status = status;
  error.code = data.code || '';
  error.source = data.source || '';
  return error;
}
function apiFormUpload(path, formData, onProgress){
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', path);
    xhr.withCredentials = true;
    xhr.upload.onprogress = event => {
      if(typeof onProgress !== 'function') return;
      if(event.lengthComputable && event.total > 0){
        onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))), event.loaded, event.total);
      }else{
        onProgress(null, event.loaded || 0, event.total || 0);
      }
    };
    xhr.onerror = () => reject(new Error('Сервер не отвечает. Проверьте интернет или попробуйте обновить страницу через минуту.'));
    xhr.onload = () => {
      const data = parseApiResponseText(xhr.responseText);
      if(xhr.status < 200 || xhr.status >= 300 || data.ok === false){
        reject(apiErrorFromResponse(xhr.status, data));
        return;
      }
      if(data.ok !== true){
        reject(new Error('Сервер не подтвердил действие. Обновите страницу и попробуйте снова.'));
        return;
      }
      data.loaded_at = new Date().toISOString();
      resolve(data);
    };
    xhr.send(formData);
  });
}

async function uploadProfileAvatar(file){
  if(!file) return {path:''};
  if(file.size > MEDIA_UPLOAD_MAX_BYTES) throw new Error(`Файл слишком большой. Выберите изображение до ${MEDIA_UPLOAD_MAX_LABEL}.`);
  const body = new FormData();
  body.append('file', file, file.name || 'profile-avatar.bin');
  return api('/api/community/profile/avatar', {method:'POST', formData:body});
}

async function uploadCommunityMessageAttachment(file, onProgress){
  if(!file) return {attachment:null};
  if(file.size > COMMUNITY_ATTACHMENT_MAX_BYTES) throw new Error(`Файл слишком большой. Выберите файл до ${COMMUNITY_ATTACHMENT_MAX_LABEL}.`);
  const body = new FormData();
  body.append('file', file, file.name || 'attachment.bin');
  return apiFormUpload('/api/community/messages/attachment', body, onProgress);
}

function newIdempotencyKey(prefix='trebnik'){
  const uuid = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}:${uuid}`;
}
function formIdempotencyKey(form, prefix='trebnik'){
  if(!form.dataset.idempotencyKey) form.dataset.idempotencyKey = newIdempotencyKey(prefix);
  return form.dataset.idempotencyKey;
}
function withFormIdempotency(form, body, prefix='trebnik'){
  return {...(body || {}), idempotency_key:formIdempotencyKey(form, prefix)};
}
function trebnikCommandNeedsIdempotency(command=''){
  return ['request.add','update.add','client.question.add','payment.add','payment.request.add','payment.service.add','payment.reminder.send','service.action','service.more_time.request','work.log.add'].includes(command);
}
function isClientQuestionKind(kind=''){
  return kind === 'client_question' || kind === 'question';
}

