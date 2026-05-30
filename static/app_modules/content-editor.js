function contentEditor(){
  say('Старый расширенный редактор закрыт, чтобы не путать материалы и разделы. Новый материал создаётся на странице самого раздела.', 'warning');
  if(state.route === 'admin') paintAdminEditor();
}
function homeEditor(){
  if(!isAdmin()) return loginModal('admin');
  const content = clone(state.content);
  const html = `<form class="form" id="homeForm">
    <p class="form-note" data-form-feedback data-feedback-style="note"></p>
    <label><span>Заголовок первого экрана</span><input name="hero_title" value="${attr(content.home?.hero_title || content.home?.welcome_title || '')}"></label>
    <div class="media-field" data-media-field data-slot="hero" data-ratio="portrait" data-title="Фото первого экрана" data-title-source="[name='hero_title']" data-alt-source="[name='hero_image_alt']" data-empty="Без фото">
      <input type="hidden" name="hero_image_url" value="${attr(content.home?.hero_image_url || '')}">
      <div data-media-preview>${mediaPreviewCardHtml({title:'Фото первого экрана', url:content.home?.hero_image_url || '', alt:content.home?.hero_image_alt || content.brand?.owner_name || '', ratio:'portrait', emptyText:'Без фото'})}</div>
      <div class="stack">
        <label><span>Отдельное фото для главной</span><input data-media-file name="hero_image_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label>
        <div class="row"><button class="secondary" type="button" data-media-clear>Убрать фото</button></div>
        <p class="form-note" data-media-feedback data-feedback-style="note"></p>
        <label><span>Описание изображения</span><input name="hero_image_alt" value="${attr(content.home?.hero_image_alt || content.brand?.owner_name || '')}"></label>
      </div>
    </div>
    <label><span>Текст первого экрана</span><textarea name="hero_text" rows="6">${esc(content.home?.hero_text || content.home?.welcome_text || '')}</textarea></label>
    <div class="row"><button class="primary" type="submit" data-save-content>Сохранить главную</button></div>
  </form>`;
  openModal('Главная страница', html, {wide:true, onMount(root){
    bindMediaFields(root);
    root.querySelector('#homeForm').addEventListener('submit', saveHomeForm);
  }});
}
function featuredEditor(){
  if(!isAdmin()) return loginModal('admin');
  const content = clone(state.content);
  const featuredSet = new Set((content.home?.featured_material_ids || []).map(value => String(value || '').trim()).filter(Boolean));
  const html = `<form class="form" id="featuredForm">
    <p class="form-note" data-form-feedback data-feedback-style="note">Не выбрано — блок скрыт.</p>
    <div class="featured-checklist">${featuredMaterialsOptions(content, featuredSet)}</div>
    <p class="form-note" data-featured-feedback data-feedback-style="note"></p>
    <div class="row"><button class="primary" type="submit" data-save-content>Сохранить избранное</button></div>
  </form>`;
  openModal('Избранное на главной', html, {wide:true, onMount(root){
    bindFeaturedChecklist(root);
    root.querySelector('#featuredForm').addEventListener('submit', saveFeaturedForm);
  }});
}
function sectionSettingsEditor(route){
  if(!isAdmin()) return loginModal('admin');
  if(!sectionRoutes.includes(route)){
    say('Раздел не найден.','warning');
    return;
  }
  const section = state.content?.sections?.[route] || {};
  openModal(`Раздел: ${section.title || sectionNames[route] || route}`, adminSectionEditorHtml(route), {wide:true, onMount(root){
    bindCompactCoverFields(root);
    bindMediaFields(root);
    bindAdminEditorDirty(root);
    root.querySelector('#sectionSettingsForm')?.addEventListener('submit', saveSectionSettingsForm);
  }});
}
function featuredMaterialsOptions(content, selected){
  return allMaterialsFromContent(content).map(item => {
    const key = materialKeyFromParts(item.route, item.slug || '');
    const status = item.status === 'published' ? 'опубликовано' : item.status === 'draft' ? 'черновик' : 'скрыто';
    return `<label class="featured-option">
      <input type="checkbox" name="featured_material_ids" value="${attr(key)}" ${selected.has(key) ? 'checked' : ''}>
      <span><strong>${esc(item.title || 'Без названия')}</strong><span>${esc(`${sectionNames[item.route] || item.route} · ${status}`)}</span></span>
    </label>`;
  }).join('') || empty('Сначала добавьте хотя бы один материал.');
}
function loadScriptOnce(src){
  if(loadedScriptPromises.has(src)) return loadedScriptPromises.get(src);
  const promise = new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(script => script.dataset.editorjsSrc === src);
    if(existing){
      existing.addEventListener('load', resolve, {once:true});
      existing.addEventListener('error', () => reject(new Error('Не удалось загрузить редактор.')), {once:true});
      if(existing.dataset.loaded === '1') resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.editorjsSrc = src;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error('Не удалось загрузить редактор.'));
    document.head.append(script);
  });
  loadedScriptPromises.set(src, promise);
  return promise;
}
async function loadEditorJsBundle(){
  for(const src of EDITORJS_VENDOR_FILES) await loadScriptOnce(src);
  if(!window.EditorJS || !window.Header || !window.EditorjsList || !window.ImageTool || !window.Quote || !window.Delimiter){
    throw new Error('Редактор загрузился не полностью.');
  }
}
function materialPagePreviewHtml(item={}, route=''){
  const price = showItemField(item, 'price') ? cleanText(item.price) : '';
  return `<article class="material-page-preview material-${attr(route)}">
    <h1>${esc(publicText(item.title || 'Название материала'))}</h1>
    ${price && route === 'services' ? `<div class="material-meta"><span class="pill price">${esc(price)}</span></div>` : ''}
    <div class="material-body">${materialContentHtml(item)}</div>
  </article>`;
}
async function syncSingleBlockEditor(box){
  const editor = blockEditors.get(box);
  if(!editor) return null;
  const hidden = box.querySelector('[name="item_blocks"]');
  const textarea = box.querySelector('[name="item_body"]');
  const preview = box.querySelector('[data-page-preview]');
  const data = await editor.save();
  const normalized = normalizeEditorData(data, textarea?.value || '');
  if(hidden) hidden.value = JSON.stringify(normalized);
  if(textarea) textarea.value = editorDataToPlainText(normalized);
  if(preview) preview.innerHTML = materialPagePreviewHtml(readItemEditorBox(box, 0), box.dataset.route || '');
  return normalized;
}
async function syncBlockEditors(root){
  await syncRichEditors(root);
  const boxes = [...root.querySelectorAll('[data-item]')].filter(box => blockEditors.has(box));
  for(const box of boxes) await syncSingleBlockEditor(box);
}
function cleanRichImageLayout(value=''){
  const layout = cleanText(value || '');
  return ['center','left','right','wide'].includes(layout) ? layout : 'center';
}
function cleanRichImageSize(value=''){
  const size = cleanText(value || '');
  return ['small','medium','large'].includes(size) ? size : 'medium';
}
function cleanRichTextAlign(value=''){
  const align = cleanText(value || '');
  return ['left','center','right','justify'].includes(align) ? align : 'left';
}
function richTextAlignFromNode(node){
  if(!node) return 'left';
  const dataAlign = cleanText(node.dataset?.textAlign || '');
  if(dataAlign) return cleanRichTextAlign(dataAlign);
  const styleAlign = cleanText(node.style?.textAlign || '');
  if(styleAlign) return cleanRichTextAlign(styleAlign === 'start' ? 'left' : styleAlign);
  for(const align of ['center','right','justify','left']){
    if(node.classList?.contains(`rich-text-align-${align}`) || node.classList?.contains(`is-text-align-${align}`)) return align;
  }
  return 'left';
}
function richTextAlignAttrs(value=''){
  const align = cleanRichTextAlign(value);
  return align === 'left' ? '' : ` data-text-align="${attr(align)}" class="rich-text-align-${attr(align)}"`;
}
function fileSizeLabel(size=0){
  const value = Number(size || 0);
  if(!Number.isFinite(value) || value <= 0) return '';
  if(value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  return `${Math.max(1, Math.round(value / 1024))} КБ`;
}
function richImageClass(layout='center', size='medium'){
  return `rich-image rich-image-${cleanRichImageLayout(layout)} rich-image-${cleanRichImageSize(size)}`;
}
function applyRichImageAttrs(figure, layout='center', size='medium', alt=''){
  if(!figure) return;
  const cleanLayout = cleanRichImageLayout(layout);
  const cleanSize = cleanRichImageSize(size);
  const selected = figure.classList.contains('is-selected');
  figure.dataset.imageLayout = cleanLayout;
  figure.dataset.imageSize = cleanSize;
  figure.className = richImageClass(cleanLayout, cleanSize);
  if(selected) figure.classList.add('is-selected');
  const image = figure.querySelector('img');
  if(image) image.alt = cleanText(alt || image.alt || 'Изображение');
}
function editorDataToRichHtml(data){
  const normalized = normalizeEditorData(data, '');
  return normalized.blocks.map(block => {
    const item = block?.data || {};
    const alignAttrs = richTextAlignAttrs(item.alignment || item.align || item.textAlign);
    if(block.type === 'header'){
      const level = [2,3,4].includes(Number(item.level)) ? Number(item.level) : 2;
      return `<h${level}${alignAttrs}>${sanitizeInlineHtml(item.text || '')}</h${level}>`;
    }
    if(block.type === 'list') return editorListHtml(item.items || [], item.style || 'unordered', alignAttrs);
    if(block.type === 'quote') return `<blockquote${alignAttrs}>${sanitizeInlineHtml(item.text || '')}</blockquote>`;
    if(block.type === 'image'){
      const url = cleanText(item.file?.url || item.url || '');
      if(!url) return '';
      const caption = sanitizeInlineHtml(item.caption || '');
      const layout = cleanRichImageLayout(item.layout || (item.stretched ? 'wide' : 'center'));
      const size = cleanRichImageSize(item.size || 'medium');
      const alt = cleanText(item.alt || editorHtmlToText(caption) || 'Изображение');
      return `<figure data-rich-image data-image-layout="${attr(layout)}" data-image-size="${attr(size)}" class="${attr(richImageClass(layout, size))}"><img src="${attr(url)}" alt="${attr(alt)}"><figcaption>${caption}</figcaption></figure>`;
    }
    if(block.type === 'delimiter') return '<hr>';
    return `<p${alignAttrs}>${sanitizeInlineHtml(item.text || '') || '<br>'}</p>`;
  }).join('') || '<p><br></p>';
}
function listNodeToEditorItems(list){
  return [...list.children].filter(node => node.tagName?.toLowerCase() === 'li').map(li => {
    const cloneNode = li.cloneNode(true);
    cloneNode.querySelectorAll('ul,ol').forEach(nested => nested.remove());
    return sanitizeInlineHtml(cloneNode.innerHTML || cloneNode.textContent || '');
  }).filter(Boolean);
}
function richHtmlToEditorData(html=''){
  const template = document.createElement('template');
  template.innerHTML = String(html || '');
  const blocks = [];
  const withTextAlignment = (data, node=null) => {
    const alignment = richTextAlignFromNode(node);
    return alignment === 'left' ? data : {...data, alignment};
  };
  const addParagraph = (value, node=null) => {
    const text = sanitizeInlineHtml(value || '').trim();
    if(text && text !== '<br>') blocks.push({type:'paragraph', data:withTextAlignment({text}, node)});
  };
  const visit = node => {
    if(node.nodeType === Node.TEXT_NODE){
      if(cleanText(node.textContent)) addParagraph(node.textContent);
      return;
    }
    if(node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if(['script','style','meta','link','title','xml'].includes(tag)) return;
    if(['h1','h2','h3','h4'].includes(tag)){
      const level = tag === 'h4' ? 4 : tag === 'h3' ? 3 : 2;
      const text = sanitizeInlineHtml(node.innerHTML || node.textContent || '').trim();
      if(text) blocks.push({type:'header', data:withTextAlignment({text, level}, node)});
      return;
    }
    if(tag === 'ul' || tag === 'ol'){
      const items = listNodeToEditorItems(node);
      if(items.length) blocks.push({type:'list', data:withTextAlignment({style:tag === 'ol' ? 'ordered' : 'unordered', items}, node)});
      return;
    }
    if(tag === 'blockquote'){
      const text = sanitizeInlineHtml(node.innerHTML || node.textContent || '').trim();
      if(text) blocks.push({type:'quote', data:withTextAlignment({text, caption:''}, node)});
      return;
    }
    if(tag === 'figure'){
      const img = node.querySelector('img');
      const url = cleanText(img?.getAttribute('src') || '');
      if(url){
        const caption = sanitizeInlineHtml(node.querySelector('figcaption')?.innerHTML || '');
        const layout = cleanRichImageLayout(node.dataset.imageLayout || (node.classList.contains('rich-image-wide') ? 'wide' : 'center'));
        const size = cleanRichImageSize(node.dataset.imageSize || 'medium');
        blocks.push({type:'image', data:{file:{url}, alt:cleanText(img?.getAttribute('alt') || ''), caption, layout, size, withBorder:false, stretched:layout === 'wide', withBackground:false}});
      }
      return;
    }
    if(tag === 'img'){
      const url = cleanText(node.getAttribute('src') || '');
      if(url) blocks.push({type:'image', data:{file:{url}, alt:cleanText(node.getAttribute('alt') || ''), caption:'', layout:'center', size:'medium', withBorder:false, stretched:false, withBackground:false}});
      return;
    }
    if(tag === 'hr'){
      blocks.push({type:'delimiter', data:{}});
      return;
    }
    if(tag === 'p' || tag === 'div'){
      const hasBlockChildren = node.querySelector(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > ul, :scope > ol, :scope > blockquote, :scope > figure, :scope > hr');
      if(hasBlockChildren) [...node.childNodes].forEach(visit);
      else addParagraph(node.innerHTML || node.textContent || '', node);
      return;
    }
    addParagraph(node.innerHTML || node.textContent || '', node);
  };
  [...template.content.childNodes].forEach(visit);
  return {time:Date.now(), blocks:blocks.length ? blocks : [{type:'paragraph', data:{text:''}}], version:EDITORJS_VERSION};
}
function saveRichSelection(editor){
  const selection = window.getSelection();
  if(!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  if(editor.contains(range.commonAncestorContainer)) richEditorSelections.set(editor, range.cloneRange());
}
function restoreRichSelection(editor){
  const range = richEditorSelections.get(editor);
  if(!range) return false;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
function syncSingleRichEditor(box){
  const editor = box.querySelector('[data-rich-editor]');
  if(!editor) return null;
  const hidden = box.querySelector('[name="item_blocks"]');
  const textarea = box.querySelector('[name="item_body"]');
  const data = richHtmlToEditorData(editor.innerHTML || '');
  if(hidden) hidden.value = JSON.stringify(data);
  if(textarea) textarea.value = editorDataToPlainText(data);
  return data;
}
async function syncRichEditors(root){
  root.querySelectorAll('[data-item]').forEach(syncSingleRichEditor);
}
function execRichCommand(editor, command, value=null){
  editor.focus();
  restoreRichSelection(editor);
  document.execCommand(command, false, value);
  saveRichSelection(editor);
  syncSingleRichEditor(editor.closest('[data-item]'));
  setSaveStatus('dirty', 'Есть изменения');
}
function richSelectionRange(editor){
  const selection = window.getSelection();
  if(selection?.rangeCount && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode)){
    return selection.getRangeAt(0);
  }
  const saved = richEditorSelections.get(editor);
  return saved && editor.contains(saved.commonAncestorContainer) ? saved : null;
}
function richBlockFromNode(editor, node){
  if(!node) return null;
  if(node.nodeType === Node.TEXT_NODE) node = node.parentElement;
  if(!node || node === editor || !editor.contains(node)) return null;
  const quote = node.closest?.('blockquote');
  if(quote && editor.contains(quote)) return quote;
  const block = node.closest?.('p,h1,h2,h3,h4,ul,ol,li,blockquote,figure,hr,div');
  return block && editor.contains(block) ? block : null;
}
function richSelectedBlocks(editor){
  const range = richSelectionRange(editor);
  if(!range) return [];
  if(range.collapsed){
    const block = richBlockFromNode(editor, range.commonAncestorContainer);
    return block ? [block] : [];
  }
  const directBlocks = [...editor.children]
    .filter(node => node.matches?.('p,h1,h2,h3,h4,ul,ol,blockquote,figure,hr,div') && range.intersectsNode(node));
  if(directBlocks.length) return directBlocks;
  const block = richBlockFromNode(editor, range.commonAncestorContainer);
  return block ? [block] : [];
}
function setRichCaretAtEnd(node){
  if(!node) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
function setRichCaretAtStart(node){
  if(!node) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}
function replaceRichBlockTag(block, tag='p'){
  if(!block || !block.parentNode) return block;
  const current = block.tagName?.toLowerCase() || '';
  if(current === tag) return block;
  const next = document.createElement(tag);
  const align = richTextAlignFromNode(block);
  if(align !== 'left'){
    next.dataset.textAlign = align;
    next.classList.add(`rich-text-align-${align}`);
  }
  const sourceHtml = current === 'blockquote' ? sanitizeInlineHtml(block.innerHTML || block.textContent || '') : sanitizeInlineHtml(block.innerHTML || block.textContent || '');
  next.innerHTML = sourceHtml && sourceHtml !== '<br>' ? sourceHtml : '<br>';
  block.replaceWith(next);
  return next;
}
function richFragmentHasContent(fragment){
  if(!fragment) return false;
  return Boolean(cleanText(fragment.textContent || '') || fragment.querySelector?.('img,figure,hr'));
}
function richInlineHtmlFromFragment(fragment){
  const box = document.createElement('div');
  box.append(fragment);
  box.querySelectorAll?.('script,style,meta,link,title,xml,svg,canvas,iframe').forEach(node => node.remove());
  return sanitizeInlineHtml(box.innerHTML || box.textContent || '').trim();
}
function richInlineHasText(html=''){
  const text = editorHtmlToText(html);
  return Boolean(cleanText(text || ''));
}
function richRangeCoversBlock(range, block){
  if(!range || !block) return false;
  const before = document.createRange();
  const after = document.createRange();
  try{
    before.selectNodeContents(block);
    before.setEnd(range.startContainer, range.startOffset);
    after.selectNodeContents(block);
    after.setStart(range.endContainer, range.endOffset);
  }catch{
    return false;
  }
  return !richFragmentHasContent(before.cloneContents()) && !richFragmentHasContent(after.cloneContents());
}
function createRichTextBlock(tag='p', html='', sourceBlock=null){
  const node = document.createElement(tag);
  const box = document.createElement('div');
  box.innerHTML = String(html || '');
  const cleanHtml = sanitizeInlineHtml(box.innerHTML || box.textContent || '').trim();
  node.innerHTML = richInlineHasText(cleanHtml) ? cleanHtml : '<br>';
  const align = richTextAlignFromNode(sourceBlock);
  if(align !== 'left'){
    node.dataset.textAlign = align;
    node.classList.add(`rich-text-align-${align}`);
  }
  return node;
}
function splitRichBlockSelection(editor, block, tag='p'){
  const range = richSelectionRange(editor);
  if(!range || !block || !block.parentNode || !block.contains(range.startContainer) || !block.contains(range.endContainer)) return null;
  const beforeRange = document.createRange();
  const afterRange = document.createRange();
  try{
    beforeRange.selectNodeContents(block);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    afterRange.selectNodeContents(block);
    afterRange.setStart(range.endContainer, range.endOffset);
  }catch{
    return null;
  }
  const beforeHtml = richInlineHtmlFromFragment(beforeRange.cloneContents());
  const selectedHtml = richInlineHtmlFromFragment(range.cloneContents());
  const afterHtml = richInlineHtmlFromFragment(afterRange.cloneContents());
  if(!richInlineHasText(selectedHtml)) return null;
  const currentTag = block.tagName?.toLowerCase() || 'p';
  const sideTag = ['h1','h2','h3','h4','blockquote'].includes(currentTag) ? currentTag : 'p';
  const nodes = [];
  if(richInlineHasText(beforeHtml)) nodes.push(createRichTextBlock(sideTag, beforeHtml, block));
  const selectedNode = createRichTextBlock(tag, selectedHtml, block);
  nodes.push(selectedNode);
  if(richInlineHasText(afterHtml)) nodes.push(createRichTextBlock(sideTag, afterHtml, block));
  block.replaceWith(...nodes);
  return selectedNode;
}
function toggleRichBlockFormat(editor, tag='p'){
  editor.focus();
  restoreRichSelection(editor);
  const range = richSelectionRange(editor);
  const singleBlock = range && !range.collapsed ? richBlockFromNode(editor, range.commonAncestorContainer) : null;
  if(singleBlock?.matches?.('p,h1,h2,h3,h4,blockquote,div') && singleBlock.contains(range.startContainer) && singleBlock.contains(range.endContainer) && !richRangeCoversBlock(range, singleBlock)){
    const current = singleBlock.tagName.toLowerCase();
    const target = current === tag ? 'p' : tag;
    const changed = splitRichBlockSelection(editor, singleBlock, target);
    if(changed){
      setRichCaretAtEnd(changed);
      saveRichSelection(editor);
      syncSingleRichEditor(editor.closest('[data-item]'));
      setSaveStatus('dirty', 'Есть изменения');
      return;
    }
  }
  const blocks = richSelectedBlocks(editor)
    .filter(block => block.matches?.('p,h1,h2,h3,h4,blockquote,div'));
  const target = blocks.length && blocks.every(block => block.tagName.toLowerCase() === tag) ? 'p' : tag;
  const changed = blocks.length ? blocks.map(block => replaceRichBlockTag(block, target)) : [];
  const last = changed[changed.length - 1] || richBlockFromNode(editor, window.getSelection()?.anchorNode);
  setRichCaretAtEnd(last || editor);
  saveRichSelection(editor);
  syncSingleRichEditor(editor.closest('[data-item]'));
  setSaveStatus('dirty', 'Есть изменения');
}
function insertRichParagraphAfter(editor, block){
  if(!block || !editor.contains(block)) return false;
  const paragraph = document.createElement('p');
  paragraph.innerHTML = '<br>';
  block.after(paragraph);
  setRichCaretAtStart(paragraph);
  saveRichSelection(editor);
  syncSingleRichEditor(editor.closest('[data-item]'));
  setSaveStatus('dirty', 'Есть изменения');
  return true;
}
function richRangeIsAtBlockEnd(range, block){
  if(!range || !block) return false;
  const after = range.cloneRange();
  after.selectNodeContents(block);
  try{
    after.setStart(range.endContainer, range.endOffset);
  }catch{
    return false;
  }
  const fragment = after.cloneContents();
  return !cleanText(fragment.textContent || '') && !fragment.querySelector?.('img,figure,hr');
}
function handleRichEnter(editor, event){
  if(event.key !== 'Enter' || event.shiftKey) return false;
  const block = richCurrentBlock(editor);
  editor.focus();
  restoreRichSelection(editor);
  const range = richSelectionRange(editor);
  if(!block?.matches?.('p,h1,h2,h3,h4,blockquote,div')) return false;
  if(!block.matches('h1,h2,h3,h4,blockquote') && !richRangeIsAtBlockEnd(range, block)) return false;
  event.preventDefault();
  if(!richSelectionIsCollapsed(editor)) document.execCommand('delete', false, null);
  return insertRichParagraphAfter(editor, block);
}
function applyRichAlignment(wrap, editor, align='left'){
  const cleanAlign = cleanRichTextAlign(align);
  const figure = selectedRichImage(editor);
  if(figure){
    const imageLayout = cleanAlign === 'justify' ? 'wide' : cleanAlign;
    const image = figure.querySelector('img');
    applyRichImageAttrs(figure, imageLayout, figure.dataset.imageSize || 'medium', image?.getAttribute('alt') || '');
    updateRichImageTools(wrap, figure);
    syncSingleRichEditor(editor.closest('[data-item]'));
    setSaveStatus('dirty', 'Есть изменения');
    return;
  }
  const command = {
    left:'justifyLeft',
    center:'justifyCenter',
    right:'justifyRight',
    justify:'justifyFull',
  }[cleanAlign] || 'justifyLeft';
  execRichCommand(editor, command);
}
function insertRichHtml(editor, html){
  editor.focus();
  restoreRichSelection(editor);
  document.execCommand('insertHTML', false, html);
  saveRichSelection(editor);
  syncSingleRichEditor(editor.closest('[data-item]'));
  setSaveStatus('dirty', 'Есть изменения');
}
function plainTextToRichHtml(value=''){
  const text = String(value || '').replace(/\r\n?/g, '\n').trim();
  if(!text) return '';
  return text.split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p>${esc(part).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
function plainTextToPastedRichHtml(value=''){
  const text = String(value || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
  if(!text) return '';
  return text.split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `<p>${esc(line)}</p>`)
    .join('');
}
function pastedHtmlToPlainText(html=''){
  const sourceHtml = String(html || '').trim();
  if(!sourceHtml) return '';
  const template = document.createElement('template');
  template.innerHTML = sourceHtml;
  template.content.querySelectorAll('script,style,meta,link,title,xml,svg,canvas,iframe,img,figure,picture').forEach(node => node.remove());
  template.content.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
  template.content.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,tr').forEach(node => node.append('\n'));
  return String(template.content.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function cleanPastedRichHtml(html='', plain=''){
  const text = String(plain || '').trim() || pastedHtmlToPlainText(html);
  return plainTextToPastedRichHtml(text);
}
function clipboardImageFile(clipboard){
  const files = Array.from(clipboard?.files || []);
  const file = files.find(item => /^image\//i.test(item?.type || ''));
  if(file) return file;
  const items = Array.from(clipboard?.items || []);
  const imageItem = items.find(item => item?.kind === 'file' && /^image\//i.test(item?.type || ''));
  return imageItem?.getAsFile?.() || null;
}
function pastedHtmlHasImage(html=''){
  return /<(img|figure|picture)\b/i.test(String(html || ''));
}
function handleRichPaste(editor, event){
  const clipboard = event.clipboardData || window.clipboardData;
  if(!clipboard) return;
  const html = clipboard.getData('text/html');
  const imageFile = clipboardImageFile(clipboard);
  if(imageFile){
    event.preventDefault();
    say('Фото вставляется через кнопку «Фото», чтобы его можно было выбрать, подписать и убрать.', 'warning');
    return;
  }
  const cleanHtml = cleanPastedRichHtml(html, clipboard.getData('text/plain'));
  if(!cleanHtml && pastedHtmlHasImage(html)){
    event.preventDefault();
    say('Фото вставляется через кнопку «Фото», чтобы оно не попало в текст без управления.', 'warning');
    return;
  }
  if(!cleanHtml) return;
  event.preventDefault();
  insertRichHtml(editor, cleanHtml);
}
function normalizeEditorLink(value=''){
  const raw = cleanText(value);
  if(!raw) return '';
  if(/^(https?:|mailto:|tel:|\/)/i.test(raw)) return raw;
  return `https://${raw}`;
}
function richSelectionIsCollapsed(editor){
  const selection = window.getSelection();
  if(selection && selection.rangeCount && editor.contains(selection.anchorNode)) return selection.isCollapsed;
  const saved = richEditorSelections.get(editor);
  return saved ? saved.collapsed : true;
}
function richCurrentAnchor(editor){
  const selection = window.getSelection();
  let node = selection?.anchorNode || richEditorSelections.get(editor)?.commonAncestorContainer || null;
  if(node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
  const link = node?.closest?.('a');
  return link && editor.contains(link) ? link : null;
}
function closeRichLinkTools(wrap){
  const tools = wrap.querySelector('[data-rich-link-tools]');
  if(tools) tools.hidden = true;
}
function openRichLinkTools(wrap, editor){
  saveRichSelection(editor);
  const tools = wrap.querySelector('[data-rich-link-tools]');
  if(!tools) return;
  const input = tools.querySelector('[data-rich-link-url]');
  const current = richCurrentAnchor(editor);
  if(input) input.value = current?.getAttribute('href') || '';
  tools.hidden = false;
  window.setTimeout(() => input?.focus(), 0);
}
function applyRichLink(wrap, editor){
  const input = wrap.querySelector('[data-rich-link-url]');
  const url = normalizeEditorLink(input?.value || '');
  if(!url){
    say('Вставьте адрес ссылки.', 'warning');
    return;
  }
  editor.focus();
  restoreRichSelection(editor);
  if(richSelectionIsCollapsed(editor)){
    insertRichHtml(editor, `<a href="${attr(url)}" target="_blank" rel="noopener">${esc(url)}</a>`);
  }else{
    document.execCommand('createLink', false, url);
    const link = richCurrentAnchor(editor);
    if(link){
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener');
    }
    saveRichSelection(editor);
    syncSingleRichEditor(editor.closest('[data-item]'));
    setSaveStatus('dirty', 'Есть изменения');
  }
  closeRichLinkTools(wrap);
}
function removeRichLink(wrap, editor){
  editor.focus();
  restoreRichSelection(editor);
  document.execCommand('unlink', false, null);
  saveRichSelection(editor);
  syncSingleRichEditor(editor.closest('[data-item]'));
  setSaveStatus('dirty', 'Есть изменения');
  closeRichLinkTools(wrap);
}
function richCurrentBlock(editor){
  const selectedImage = editor.querySelector('figure[data-rich-image].is-selected');
  if(selectedImage) return selectedImage;
  const range = richSelectionRange(editor);
  return richBlockFromNode(editor, range?.commonAncestorContainer || window.getSelection()?.anchorNode || null);
}
function ensureRichEditorNotEmpty(editor){
  if(!cleanText(editor.textContent || '') && !editor.querySelector('img')){
    editor.innerHTML = '<p><br></p>';
  }
}
function moveRichBlock(editor, direction=0){
  const block = richCurrentBlock(editor);
  if(!block) return;
  const sibling = direction < 0 ? block.previousElementSibling : block.nextElementSibling;
  if(!sibling) return;
  if(direction < 0) editor.insertBefore(block, sibling);
  else sibling.after(block);
  setRichCaretAtEnd(block);
  saveRichSelection(editor);
  syncSingleRichEditor(editor.closest('[data-item]'));
  setSaveStatus('dirty', 'Есть изменения');
}
function removeRichBlock(editor){
  const block = richCurrentBlock(editor);
  if(!block) return;
  const wasImage = block.matches?.('figure[data-rich-image]');
  block.remove();
  ensureRichEditorNotEmpty(editor);
  if(wasImage) updateRichImageTools(editor.closest('[data-rich-editor-wrap]'), null);
  syncSingleRichEditor(editor.closest('[data-item]'));
  setSaveStatus('dirty', 'Есть изменения');
}
function selectedRichImage(editor){
  return editor.querySelector('figure[data-rich-image].is-selected');
}
function selectRichImage(wrap, figure){
  const editor = wrap.querySelector('[data-rich-editor]');
  editor?.querySelectorAll('figure[data-rich-image].is-selected').forEach(node => node.classList.remove('is-selected'));
  if(figure) figure.classList.add('is-selected');
  updateRichImageTools(wrap, figure || null);
}
function updateRichImageTools(wrap, figure=null){
  if(!wrap) return;
  const tools = wrap.querySelector('[data-rich-image-tools]');
  const toolbarRemove = wrap.querySelector('[data-rich-image-remove-toolbar]');
  if(toolbarRemove) toolbarRemove.hidden = !figure;
  if(!tools) return;
  tools.hidden = !figure;
  if(!figure) return;
  const image = figure.querySelector('img');
  const layout = cleanRichImageLayout(figure.dataset.imageLayout || (figure.classList.contains('rich-image-wide') ? 'wide' : 'center'));
  const size = cleanRichImageSize(figure.dataset.imageSize || 'medium');
  const layoutControl = tools.querySelector('[data-rich-image-layout]');
  const sizeControl = tools.querySelector('[data-rich-image-size]');
  const altControl = tools.querySelector('[data-rich-image-alt]');
  if(layoutControl) layoutControl.value = layout;
  if(sizeControl) sizeControl.value = size;
  if(altControl) altControl.value = cleanText(image?.getAttribute('alt') || '');
  const coverButton = tools.querySelector('[data-rich-image-cover]');
  if(coverButton){
    const imageUrl = cleanText(image?.getAttribute('src') || '');
    const coverUrl = fieldValue(wrap.closest('[data-item]'), 'item_cover_url');
    coverButton.textContent = imageUrl && coverUrl === imageUrl ? 'На обложке' : 'На обложку';
  }
}
function syncRichImageTools(wrap){
  const editor = wrap.querySelector('[data-rich-editor]');
  const figure = editor ? selectedRichImage(editor) : null;
  if(!figure) return;
  const tools = wrap.querySelector('[data-rich-image-tools]');
  const layout = tools?.querySelector('[data-rich-image-layout]')?.value || figure.dataset.imageLayout || 'center';
  const size = tools?.querySelector('[data-rich-image-size]')?.value || 'medium';
  const alt = tools?.querySelector('[data-rich-image-alt]')?.value || '';
  applyRichImageAttrs(figure, layout, size, alt);
  syncSingleRichEditor(editor.closest('[data-item]'));
  setSaveStatus('dirty', 'Есть изменения');
}
function setRichUploadProgress(figure, percent=null, text=''){
  if(!figure) return;
  const overlay = figure.querySelector('[data-rich-upload-status]');
  const bar = figure.querySelector('[data-rich-upload-bar]');
  const label = figure.querySelector('[data-rich-upload-label]');
  const caption = figure.querySelector('figcaption');
  const value = Number.isFinite(Number(percent)) ? Math.max(0, Math.min(100, Number(percent))) : null;
  if(label) label.textContent = text || (value === null ? 'Загружаю фото…' : `Загружаю фото ${Math.round(value)}%`);
  if(bar) bar.style.setProperty('--upload-progress', value === null ? '35%' : `${Math.round(value)}%`);
  if(caption && !cleanText(caption.textContent || '')) caption.textContent = value === null ? 'Загружаю фото…' : `Загрузка ${Math.round(value)}%`;
  if(overlay) overlay.hidden = false;
}
function insertRichUploadingFigure(editor, file){
  const id = `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const localUrl = URL.createObjectURL(file);
  insertRichHtml(editor, `<figure data-rich-image data-rich-upload-id="${attr(id)}" data-image-layout="center" data-image-size="medium" class="${attr(richImageClass('center', 'medium'))} is-uploading"><img src="${attr(localUrl)}" alt="${attr(file.name || 'Изображение')}"><figcaption>Загрузка 0%</figcaption><div class="rich-upload-status" data-rich-upload-status><span data-rich-upload-label>Готовлю фото…</span><i data-rich-upload-bar style="--upload-progress:1%"></i></div></figure><p><br></p>`);
  const figure = editor.querySelector(`[data-rich-upload-id="${id}"]`);
  return {figure, localUrl};
}
function finishRichUploadFigure(figure, localUrl, url){
  if(!figure) return;
  const image = figure.querySelector('img');
  if(image) image.src = url;
  figure.classList.remove('is-uploading');
  figure.removeAttribute('data-rich-upload-id');
  figure.querySelector('[data-rich-upload-status]')?.remove();
  const caption = figure.querySelector('figcaption');
  if(caption && /^Загрузка\s+\d+%$|^Загружаю фото/.test(cleanText(caption.textContent || ''))) caption.innerHTML = '';
  if(localUrl) window.setTimeout(() => URL.revokeObjectURL(localUrl), 1000);
}
function bindRichEditors(root){
  root.querySelectorAll('[data-rich-editor-wrap]').forEach(wrap => {
    if(wrap.dataset.bound === '1') return;
    const box = wrap.closest('[data-item]');
    const editor = wrap.querySelector('[data-rich-editor]');
    const hidden = box?.querySelector('[name="item_blocks"]');
    const textarea = box?.querySelector('[name="item_body"]');
    const fileInput = wrap.querySelector('[data-rich-image-input]');
    if(!box || !editor) return;
    editor.innerHTML = editorDataToRichHtml(normalizeEditorData(hidden?.value || '', textarea?.value || ''));
    try{
      document.execCommand('styleWithCSS', false, false);
      document.execCommand('defaultParagraphSeparator', false, 'p');
    }catch{}
    const sync = () => {
      saveRichSelection(editor);
      syncSingleRichEditor(box);
      setSaveStatus('dirty', 'Есть изменения');
    };
    editor.addEventListener('input', sync);
    editor.addEventListener('keyup', () => saveRichSelection(editor));
    editor.addEventListener('keyup', () => updateRichImageTools(wrap, selectedRichImage(editor)));
    editor.addEventListener('mouseup', () => saveRichSelection(editor));
    editor.addEventListener('focus', () => saveRichSelection(editor));
    editor.addEventListener('paste', event => handleRichPaste(editor, event));
    editor.addEventListener('keydown', event => {
      if(handleRichEnter(editor, event)) return;
      if((event.key === 'Delete' || event.key === 'Backspace') && selectedRichImage(editor)){
        event.preventDefault();
        removeRichBlock(editor);
      }
    });
    editor.addEventListener('click', event => {
      const figure = event.target.closest?.('figure[data-rich-image]');
      selectRichImage(wrap, figure && editor.contains(figure) ? figure : null);
      saveRichSelection(editor);
    });
    wrap.querySelectorAll('[data-rich-command]').forEach(button => {
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => {
        const command = button.dataset.richCommand || '';
        if(command === 'h2') return toggleRichBlockFormat(editor, 'h2');
        if(command === 'h3') return toggleRichBlockFormat(editor, 'h3');
        if(command === 'bold') return execRichCommand(editor, 'bold');
        if(command === 'italic') return execRichCommand(editor, 'italic');
        if(command === 'link') return openRichLinkTools(wrap, editor);
        if(command === 'ul') return execRichCommand(editor, 'insertUnorderedList');
        if(command === 'ol') return execRichCommand(editor, 'insertOrderedList');
        if(command === 'quote') return toggleRichBlockFormat(editor, 'blockquote');
        if(command === 'move-up') return moveRichBlock(editor, -1);
        if(command === 'move-down') return moveRichBlock(editor, 1);
        if(command === 'image') fileInput?.click();
      });
    });
    wrap.querySelectorAll('[data-rich-align]').forEach(button => {
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => applyRichAlignment(wrap, editor, button.dataset.richAlign || 'left'));
    });
    wrap.querySelectorAll('[data-rich-image-layout], [data-rich-image-size]').forEach(control => {
      control.addEventListener('change', () => syncRichImageTools(wrap));
    });
    wrap.querySelector('[data-rich-link-apply]')?.addEventListener('click', () => applyRichLink(wrap, editor));
    wrap.querySelector('[data-rich-link-remove]')?.addEventListener('click', () => removeRichLink(wrap, editor));
    wrap.querySelector('[data-rich-link-close]')?.addEventListener('click', () => closeRichLinkTools(wrap));
    wrap.querySelector('[data-rich-link-url]')?.addEventListener('keydown', event => {
      if(event.key === 'Enter'){
        event.preventDefault();
        applyRichLink(wrap, editor);
      }
      if(event.key === 'Escape') closeRichLinkTools(wrap);
    });
    wrap.querySelector('[data-rich-image-alt]')?.addEventListener('input', () => syncRichImageTools(wrap));
    wrap.querySelector('[data-rich-image-cover]')?.addEventListener('click', () => setSelectedRichImageAsCover(wrap));
    wrap.querySelector('[data-rich-image-remove]')?.addEventListener('click', () => removeRichBlock(editor));
    wrap.querySelector('[data-rich-image-remove-toolbar]')?.addEventListener('mousedown', event => event.preventDefault());
    wrap.querySelector('[data-rich-image-remove-toolbar]')?.addEventListener('click', () => removeRichBlock(editor));
    fileInput?.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if(!file) return;
      if(file.size > MEDIA_UPLOAD_MAX_BYTES){
        fileInput.value = '';
        say(`Файл слишком большой. Выберите изображение до ${MEDIA_UPLOAD_MAX_LABEL}.`, 'warning');
        return;
      }
      const {figure, localUrl} = insertRichUploadingFigure(editor, file);
      try{
        fileInput.disabled = true;
        setRichUploadProgress(figure, 1, `${file.name || 'Фото'} · ${fileSizeLabel(file.size)}`);
        const upload = await uploadMediaFile(file, 'material-inline', percent => {
          setRichUploadProgress(figure, percent, percent >= 99 ? 'Сжимаю фото на сервере…' : `Загружаю фото ${Math.round(percent || 1)}%`);
        });
        const url = cleanText(upload.path || '');
        if(url){
          finishRichUploadFigure(figure, localUrl, url);
          syncSingleRichEditor(box);
          setSaveStatus('dirty', 'Есть изменения');
        }
      }catch(error){
        figure?.remove();
        if(localUrl) URL.revokeObjectURL(localUrl);
        ensureRichEditorNotEmpty(editor);
        syncSingleRichEditor(box);
        say(error.message || 'Не удалось загрузить фото.', 'danger');
      }finally{
        fileInput.value = '';
        fileInput.disabled = false;
      }
    });
    syncSingleRichEditor(box);
    wrap.dataset.bound = '1';
  });
}
function scheduleBlockEditorSync(box){
  window.clearTimeout(Number(box.dataset.blockEditorTimer || 0));
  const timer = window.setTimeout(() => {
    syncSingleBlockEditor(box).catch(() => {});
    setSaveStatus('dirty', 'Есть изменения');
  }, 320);
  box.dataset.blockEditorTimer = String(timer);
}
async function initBlockEditors(root){
  const holders = [...root.querySelectorAll('[data-block-editor]')];
  if(!holders.length) return;
  try{
    await loadEditorJsBundle();
  }catch(error){
    root.querySelectorAll('[data-editor-loading]').forEach(node => { node.textContent = error.message || 'Редактор не загрузился. Можно сохранить через обычное поле текста.'; });
    root.querySelectorAll('.block-editor-fallback').forEach(node => { node.hidden = false; });
    return;
  }
  holders.forEach(holder => {
    const box = holder.closest('[data-item]');
    if(!box || blockEditors.has(box)) return;
    const hidden = box.querySelector('[name="item_blocks"]');
    const textarea = box.querySelector('[name="item_body"]');
    const preview = box.querySelector('[data-page-preview]');
    const data = normalizeEditorData(hidden?.value || '', textarea?.value || '');
    const editor = new window.EditorJS({
      holder,
      data,
      minHeight: 220,
      placeholder: 'Вставьте текст сюда. Фото можно добавить через плюс между абзацами.',
      inlineToolbar: ['bold', 'italic', 'link'],
      tools: {
        header: {class: window.Header, inlineToolbar: true, config: {placeholder:'Заголовок', levels:[2,3,4], defaultLevel:2}},
        list: {class: window.EditorjsList, inlineToolbar: true, config: {defaultStyle:'unordered'}},
        image: {
          class: window.ImageTool,
          config: {
            captionPlaceholder: 'Подпись к фото',
            buttonContent: 'Выбрать фото',
            uploader: {
              uploadByFile: async file => {
                const upload = await uploadMediaFile(file, 'material-inline');
                return {success:1, file:{url:upload.path || ''}};
              },
            },
          },
        },
        quote: {class: window.Quote, inlineToolbar: true, config: {quotePlaceholder:'Цитата', captionPlaceholder:'Подпись'}},
        delimiter: window.Delimiter,
      },
      i18n: {
        messages: {
          ui: {toolbar: {toolbox: {Add:'Добавить'}}, inlineToolbar: {converter: {'Convert to':'Сделать'}}},
          toolNames: {Text:'Текст', Heading:'Заголовок', List:'Список', Image:'Фото', Quote:'Цитата', Delimiter:'Разделитель', Bold:'Жирный', Italic:'Курсив', Link:'Ссылка'},
          tools: {link: {'Add a link':'Добавить ссылку'}},
          blockTunes: {delete: {Delete:'Удалить'}, moveUp:{'Move up':'Выше'}, moveDown:{'Move down':'Ниже'}},
        },
      },
      onReady: () => {
        holder.classList.add('is-ready');
        if(textarea) textarea.hidden = true;
        box.querySelector('[data-editor-loading]')?.remove();
        if(preview) preview.innerHTML = materialPagePreviewHtml(readItemEditorBox(box, 0), box.dataset.route || '');
      },
      onChange: () => scheduleBlockEditorSync(box),
    });
    blockEditors.set(box, editor);
  });
}
function sectionEditor(route, section){
  const items = section.items || [];
  const sectionTitle = section.title || sectionNames[route];
  return `<details data-section="${route}"><summary>${esc(sectionTitle)}</summary><div class="detail-grid" style="margin-top:12px"><label><span>Название раздела</span><input name="section_title" value="${attr(sectionTitle)}"></label><label><span>Короткое описание</span><input name="section_intro" value="${attr(section.intro || '')}"></label></div><div class="media-field" data-media-field data-slot="section-cover" data-ratio="landscape" data-title="Обложка раздела" data-title-source="[name='section_title']" data-alt-source="[name='section_cover_alt']" data-empty="Без обложки"><input type="hidden" name="section_cover_url" value="${attr(section.cover_image_url || '')}"><div data-media-preview>${mediaPreviewCardHtml({title:`Обложка раздела «${sectionTitle}»`, url:section.cover_image_url || '', alt:section.cover_image_alt || sectionTitle, ratio:'landscape', emptyText:'Без обложки'})}</div><div class="stack"><label><span>Обложка раздела</span><input data-media-file name="section_cover_file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><div class="row"><button class="secondary" type="button" data-media-clear>Убрать обложку</button></div><p class="form-note" data-media-feedback data-feedback-style="note"></p><label><span>Описание изображения</span><input name="section_cover_alt" value="${attr(section.cover_image_alt || sectionTitle)}"></label></div></div><div data-items>${items.map((item, index) => itemEditor(item, index, {route})).join('')}</div><div class="row" style="margin-top:12px"><button class="secondary" type="button" data-add-item>${esc(sectionAddLabel(sectionTitle))}</button></div></details>`;
}
function materialDefaultDate(){
  return typeof dateLong === 'function' && typeof moscowDateValue === 'function' ? dateLong(moscowDateValue()) : new Date().toLocaleDateString('ru-RU');
}
function materialAuthorName(item={}){
  return cleanText(item.author_name || '') || userDisplayName() || ownerName() || siteName();
}
function materialAuthorSlug(item={}){
  return cleanText(item.author_slug || '') || cleanText(state.user?.nickname || state.user?.username || '');
}
function materialTopicFieldHtml(route='', item={}){
  const section = state.content?.sections?.[route] || {};
  if(section?.topics_enabled !== true) return '';
  const topics = sectionTopicList(section, {includeDisabled:true});
  if(!topics.length) return '';
  const selected = cleanText(item.topic_slug || '');
  return `<label><span>Тема</span><select name="item_topic_slug">
    <option value="" ${selected ? '' : 'selected'}>Без темы</option>
    ${topics.map(topic => `<option value="${attr(topic.slug)}" ${selected === topic.slug ? 'selected' : ''}>${esc(topic.title)}${topic.enabled ? '' : ' (выключена)'}</option>`).join('')}
  </select></label>`;
}
function readSectionTopicRows(root){
  return [...root.querySelectorAll('[data-section-topic-row]')].map(row => ({
    slug:fieldValue(row, 'topic_slug'),
    title:fieldValue(row, 'topic_title'),
    enabled:checkboxValue(row, 'topic_enabled', true),
  })).filter(topic => topic.title || topic.slug);
}
function paintCompactCoverField(field){
  if(!field) return;
  const box = field.closest('[data-item]');
  const url = fieldValue(box, 'item_cover_url');
  const alt = fieldValue(box, 'item_cover_alt') || fieldValue(box, 'item_title') || 'Обложка';
  const thumb = field.querySelector('[data-cover-thumb]');
  const status = field.querySelector('[data-cover-status]');
  const note = field.querySelector('[data-cover-note]');
  const clear = field.querySelector('[data-cover-clear]');
  if(thumb) thumb.innerHTML = url ? mediaImageHtml(url, alt, 'material-cover-thumb-img') : '<span>—</span>';
  if(status) status.textContent = 'Обложка карточки';
  if(note) note.textContent = url ? 'выбрана' : 'не выбрана';
  if(clear) clear.hidden = !url;
}
function setCompactCoverValue(field, url='', alt='', message='', type='muted'){
  const box = field?.closest('[data-item]');
  if(!box) return;
  const cover = box.querySelector('[name="item_cover_url"]');
  const coverAlt = box.querySelector('[name="item_cover_alt"]');
  if(cover) cover.value = cleanText(url);
  if(coverAlt) coverAlt.value = cleanText(alt) || fieldValue(box, 'item_title');
  paintCompactCoverField(field);
  setFeedback(field.querySelector('[data-cover-feedback]'), message, type);
  setSaveStatus('dirty', 'Есть изменения');
}
function bindCompactCoverField(field, root){
  if(!field || field.dataset.bound === '1') return;
  const box = field.closest('[data-item]');
  const file = field.querySelector('[data-cover-file]');
  const pick = field.querySelector('[data-cover-pick]');
  const clear = field.querySelector('[data-cover-clear]');
  const feedback = field.querySelector('[data-cover-feedback]');
  if(!box || !file || !pick || !clear) return;
  pick.addEventListener('click', () => file.click());
  clear.addEventListener('click', () => setCompactCoverValue(field, '', '', 'Обложка убрана. Сохраните материал.', 'warning'));
  file.addEventListener('change', async () => {
    const selected = file.files?.[0];
    if(!selected) return;
    if(selected.size > MEDIA_UPLOAD_MAX_BYTES){
      file.value = '';
      setFeedback(feedback, `Файл слишком большой. Выберите изображение до ${MEDIA_UPLOAD_MAX_LABEL}.`, 'danger');
      return;
    }
    try{
      bumpMediaUploads(root, 1);
      pick.disabled = true;
      clear.disabled = true;
      setFeedback(feedback, `${selected.name || 'Фото'} · загружаю 1%`, 'warning');
      const upload = await uploadMediaFile(selected, 'material-cover', percent => {
        setFeedback(feedback, percent >= 99 ? 'Сжимаю фото на сервере…' : `Загружаю обложку ${Math.round(percent || 1)}%`, 'warning');
      });
      setCompactCoverValue(field, upload.path || '', fieldValue(box, 'item_title'), 'Обложка загружена. Сохраните материал.', 'success');
    }catch(error){
      setFeedback(feedback, error.message || 'Не удалось загрузить обложку.', 'danger');
      say(error.message || 'Не удалось загрузить обложку.', 'danger');
    }finally{
      file.value = '';
      pick.disabled = false;
      clear.disabled = false;
      bumpMediaUploads(root, -1);
    }
  });
  box.querySelector('[name="item_title"]')?.addEventListener('input', () => {
    const coverAlt = box.querySelector('[name="item_cover_alt"]');
    if(coverAlt && !cleanText(coverAlt.value)) coverAlt.value = fieldValue(box, 'item_title');
    paintCompactCoverField(field);
  });
  field.dataset.bound = '1';
  paintCompactCoverField(field);
}
function bindCompactCoverFields(root){
  root.querySelectorAll('[data-cover-compact]').forEach(field => bindCompactCoverField(field, root));
}
function setSelectedRichImageAsCover(wrap){
  const box = wrap.closest('[data-item]');
  const field = box?.querySelector('[data-cover-compact]');
  const editor = wrap.querySelector('[data-rich-editor]');
  const figure = editor ? selectedRichImage(editor) : null;
  const image = figure?.querySelector('img');
  const url = cleanText(image?.getAttribute('src') || '');
  if(!field || !url){
    say('Сначала выберите фото в тексте.', 'warning');
    return;
  }
  if(url.startsWith('blob:')){
    say('Подождите, пока фото загрузится на сервер.', 'warning');
    return;
  }
  const caption = cleanText(figure.querySelector('figcaption')?.textContent || '');
  const alt = cleanText(image.getAttribute('alt') || caption || fieldValue(box, 'item_title'));
  setCompactCoverValue(field, url, alt, 'Фото из текста выбрано обложкой.', 'success');
  updateRichImageTools(wrap, figure);
}
function itemEditor(item={}, index=0, options={}){
  const showRemove = options.showRemove !== false;
  const route = options.route || '';
  const isService = route === 'services';
  const publishDate = item.date || materialDefaultDate();
  const authorName = materialAuthorName(item);
  const authorSlug = materialAuthorSlug(item);
  const hasAdvancedValues = Boolean(isService && (item.cta_label || item.cta_note));
  const showCta = isService ? showItemField(item, 'cta') : false;
  const priceField = isService
    ? `<label><span>Цена</span><input name="item_price" value="${attr(item.price || '')}" placeholder="можно оставить пустым"></label>`
    : `<input type="hidden" name="item_price" value="${attr(item.price || '')}">`;
  const ctaFields = isService ? `<label><span>Кнопка заявки</span><input name="item_cta_label" value="${attr(item.cta_label || '')}" placeholder="Оставить заявку"></label><label><span>Пояснение под кнопкой</span><input name="item_cta_note" value="${attr(item.cta_note || '')}" placeholder="можно оставить пустым"></label>` : '';
  const topicField = materialTopicFieldHtml(route, item);
  const cardOptionsOpen = Boolean(item.excerpt || item.tag);
  const cardOptionsHtml = `<details class="material-builder-card material-advanced material-advanced-compact" ${cardOptionsOpen ? 'open' : ''}>
          <summary>Карточка в списке</summary>
          <p class="material-help-line">Дополнительные данные карточки. Можно не трогать.</p>
          <div class="material-advanced-line">
            <label><span>Анонс</span><textarea name="item_excerpt" rows="2" placeholder="можно оставить пустым">${esc(item.excerpt || '')}</textarea></label>
            <label><span>Рубрика</span><input name="item_tag" value="${attr(item.tag || '')}" placeholder="например: заметка"></label>
          </div>
        </details>`;
  const serviceOptionsHtml = isService ? `<details class="material-builder-card material-advanced material-advanced-compact" ${hasAdvancedValues ? 'open' : ''}>
          <summary>Заявка</summary>
          <div class="material-advanced-line">
            ${ctaFields || '<span></span>'}
          </div>
        </details>` : '';
  const actionsHtml = options.showActions ? `<div class="material-editor-actions">
            <button class="primary" type="submit" data-save-content>${options.mode === 'edit' ? 'Сохранить' : 'Опубликовать'}</button>
            <button class="secondary" type="button" data-action="cancel-material-editor">Отмена</button>
            <button class="plain" type="button" data-action="material-preview" title="Посмотреть, как материал будет выглядеть после публикации">Предпросмотр</button>
          </div>` : '';
  const editorData = materialEditorData(item);
  return `<div class="item-editor material-builder" data-item data-route="${attr(route)}">
    <input type="hidden" name="item_symbol" value="${attr(item.cover_symbol || '✦')}">
    <input type="hidden" name="item_blocks" value="${attr(JSON.stringify(editorData))}">
    <input type="hidden" name="item_slug" value="${attr(item.slug || '')}">
    <input type="hidden" name="item_author_name" value="${attr(authorName)}">
    <input type="hidden" name="item_author_slug" value="${attr(authorSlug)}">
    <input type="hidden" name="item_cover_url" value="${attr(item.cover_image_url || '')}">
    <input type="hidden" name="item_cover_alt" value="${attr(item.cover_image_alt || item.title || '')}">
    <input type="hidden" name="item_seo_title" value="${attr(item.seo_title || '')}">
    <input type="hidden" name="item_seo_description" value="${attr(item.seo_description || '')}">
    ${isService ? '' : `<input type="hidden" name="item_price" value="${attr(item.price || '')}">`}
    <div class="material-editor-layout">
      <aside class="material-editor-side">
        <section class="material-builder-card material-card-panel">
          <div class="material-builder-card__head"><h3>Материал</h3></div>
          <label><span>Название</span><input name="item_title" value="${attr(item.title || '')}" placeholder="Название материала"></label>
          <div class="material-meta-line">
            <input name="item_date" value="${attr(publishDate)}" aria-label="Дата публикации">
            <span aria-hidden="true">·</span>
            <strong>${esc(authorName)}</strong>
          </div>
          <div class="detail-grid material-card-row">
            <label><span>Видимость</span><select name="item_status"><option value="published" ${item.status==='published'?'selected':''}>открыто</option><option value="draft" ${item.status==='draft'?'selected':''}>черновик</option><option value="hidden" ${item.status==='hidden'?'selected':''}>скрыто</option></select></label>
            ${isService ? priceField : ''}
          </div>
          ${topicField}
          <div class="material-cover-compact" data-cover-compact>
            <input data-cover-file type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
            <div class="material-cover-compact__main">
              <span class="material-cover-thumb" data-cover-thumb></span>
              <div>
                <strong data-cover-status></strong>
                <span data-cover-note></span>
              </div>
            </div>
            <div class="material-cover-actions">
              <button class="secondary" type="button" data-cover-pick>Загрузить</button>
              <button class="plain" type="button" data-cover-clear>Убрать</button>
            </div>
            <p class="form-note" data-cover-feedback data-feedback-style="note"></p>
          </div>
        </section>
        ${cardOptionsHtml}
        ${serviceOptionsHtml}
      </aside>
      <section class="material-editor-section material-editor-main">
        <div class="rich-editor" data-rich-editor-wrap>
          <div class="rich-editor-toolbar" aria-label="Панель редактора">
            <button type="button" data-rich-command="h2">Заголовок</button>
            <button type="button" data-rich-command="h3">Подзаг.</button>
            <button type="button" data-rich-command="bold"><b>Ж</b></button>
            <button type="button" data-rich-command="italic"><i>К</i></button>
            <button type="button" data-rich-command="link">Ссылка</button>
            <button type="button" data-rich-command="ul">Список</button>
            <button type="button" data-rich-command="ol">1. 2.</button>
            <button type="button" data-rich-command="quote">Цитата</button>
            <button class="rich-align-button" type="button" data-rich-align="left" title="Слева" aria-label="Слева">Л</button>
            <button class="rich-align-button" type="button" data-rich-align="center" title="По центру" aria-label="По центру">Ц</button>
            <button class="rich-align-button" type="button" data-rich-align="right" title="Справа" aria-label="Справа">П</button>
            <button class="rich-align-button" type="button" data-rich-align="justify" title="По ширине; для фото — широко" aria-label="По ширине; для фото — широко">Ш</button>
            <button type="button" data-rich-command="image">Фото</button>
            <button class="rich-image-remove-button" type="button" data-rich-image-remove-toolbar hidden>Удалить фото</button>
            <button type="button" data-rich-command="move-up">↑</button>
            <button type="button" data-rich-command="move-down">↓</button>
            ${actionsHtml}
          </div>
          <div class="rich-link-tools" data-rich-link-tools hidden>
            <label><span>Ссылка</span><input data-rich-link-url placeholder="https://..."></label>
            <button class="secondary" type="button" data-rich-link-apply>Вставить</button>
            <button class="plain" type="button" data-rich-link-remove>Убрать</button>
            <button class="plain" type="button" data-rich-link-close>Закрыть</button>
          </div>
          <div class="rich-editor-surface" data-rich-editor contenteditable="true" spellcheck="true" data-placeholder="Пишите текст. Фото в текст добавляется кнопкой сверху и сразу появляется здесь."></div>
          <div class="rich-image-tools" data-rich-image-tools hidden>
            <label><span>Размер</span><select data-rich-image-size><option value="small">маленькое</option><option value="medium">среднее</option><option value="large">крупное</option></select></label>
            <label><span>Описание</span><input data-rich-image-alt></label>
            <button class="secondary" type="button" data-rich-image-cover>На обложку</button>
            <button class="plain danger" type="button" data-rich-image-remove>Удалить фото</button>
          </div>
          <input data-rich-image-input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
          <textarea class="block-editor-fallback" name="item_body" hidden>${esc(item.body || editorDataToPlainText(editorData))}</textarea>
        </div>
      </section>
      </div>
    ${showRemove ? '<button class="plain" type="button" data-remove-item>Убрать материал</button>' : ''}
  </div>`;
}
function readItemEditorBox(box, index=0){
  const title = fieldValue(box, 'item_title') || `Материал ${index+1}`;
  const tag = fieldValue(box, 'item_tag');
  const route = box?.dataset?.route || '';
  const blocks = normalizeEditorData(fieldValue(box, 'item_blocks'), fieldValue(box, 'item_body'));
  const body = fieldValue(box, 'item_body') || editorDataToPlainText(blocks);
  const excerpt = fieldValue(box, 'item_excerpt');
  const ctaLabel = fieldValue(box, 'item_cta_label');
  const ctaNote = fieldValue(box, 'item_cta_note');
  return {
    title,
    slug: fieldValue(box, 'item_slug'),
    tag,
    topic_slug: fieldValue(box, 'item_topic_slug'),
    status: fieldValue(box, 'item_status') || 'published',
    date: fieldValue(box, 'item_date') || materialDefaultDate(),
    price: fieldValue(box, 'item_price'),
    excerpt,
    body,
    blocks,
    cover_symbol: fieldValue(box, 'item_symbol') || '✦',
    cover_image_url: fieldValue(box, 'item_cover_url'),
    cover_image_alt: fieldValue(box, 'item_cover_alt') || fieldValue(box, 'item_title'),
    author_name: fieldValue(box, 'item_author_name') || userDisplayName() || ownerName() || siteName(),
    author_slug: fieldValue(box, 'item_author_slug') || cleanText(state.user?.nickname || state.user?.username || ''),
    cta_label: route === 'services' ? ctaLabel : '',
    cta_note: route === 'services' ? ctaNote : '',
    seo_title: title,
    seo_description: excerpt || short(body, 220),
    show_tag: Boolean(tag),
    show_date: true,
    show_price: route === 'services',
    show_cta: route === 'services',
  };
}
function materialPreviewHtml(item, route=''){
  const tag = cleanText(item.tag);
  const dateLabel = route === 'services'
    ? (showItemField(item, 'price') ? cleanText(item.price) : '')
    : (showItemField(item, 'date') ? cleanText(item.date) : '');
  return `<div class="editor-preview-card">
    <span class="label">Предпросмотр карточки</span>
    ${tag && showItemField(item, 'tag') ? `<strong class="tag">${esc(tag)}</strong>` : ''}
    <h3>${esc(item.title || 'Без названия')}</h3>
    ${item.excerpt ? `<p>${esc(item.excerpt)}</p>` : ''}
    <div class="card-foot"><span>${route === 'services' ? 'Подробнее' : 'Читать'} →</span>${dateLabel ? `<span>${esc(dateLabel)}</span>` : ''}</div>
  </div>`;
}
function bindItemPreviews(root){
  root.querySelectorAll('[data-item]').forEach((box, index) => {
    const preview = box.querySelector('[data-material-preview]');
    const pagePreview = box.querySelector('[data-page-preview]');
    if(!preview || preview.dataset.bound === '1') return;
    const paint = () => {
      const item = readItemEditorBox(box, index);
      preview.innerHTML = materialPreviewHtml(item, box.dataset.route || '');
      if(pagePreview) pagePreview.innerHTML = materialPagePreviewHtml(item, box.dataset.route || '');
    };
    box.querySelectorAll('input,textarea,select').forEach(control => {
      control.addEventListener('input', paint);
      control.addEventListener('change', paint);
    });
    preview.dataset.bound = '1';
    paint();
  });
}
function findEditableMaterial(content, route, slug, fallbackIndex=null){
  const section = content?.sections?.[route];
  const items = Array.isArray(section?.items) ? section.items : [];
  let index = items.findIndex(item => String(item.slug || '') === String(slug || ''));
  if(index < 0 && fallbackIndex !== null && fallbackIndex !== ''){
    const numericIndex = Number(fallbackIndex);
    if(Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < items.length) index = numericIndex;
  }
  return {section, items, item:index >= 0 ? items[index] : null, index};
}
function materialPreviewModal(){
  const box = document.querySelector('[data-item]');
  if(!box){
    say('Сначала откройте редактор материала.', 'warning');
    return;
  }
  syncSingleRichEditor(box);
  const blocksValue = box.querySelector('[name="item_blocks"]')?.value || '';
  const data = normalizeEditorData(blocksValue, box.querySelector('[name="item_body"]')?.value || '');
  const title = cleanText(box.querySelector('[name="item_title"]')?.value || '') || 'Без названия';
  const dateRaw = cleanText(box.querySelector('[name="item_date"]')?.value || '');
  const authorName = cleanText(box.querySelector('[name="item_author_name"]')?.value || '') || ownerName();
  const route = box.dataset.route || '';
  const priceField = box.querySelector('[name="item_price"]');
  const priceText = priceField && route === 'services' ? cleanText(priceField.value) : '';
  const bodyHtml = editorBlocksHtml(data) || '<p class="form-note is-muted">Текст пока пустой.</p>';
  const metaPills = [
    priceText ? `<span class="pill price">${esc(priceText)}</span>` : '',
    dateRaw ? `<span class="pill">${esc(dateRaw)}</span>` : '',
    authorName ? `<span class="pill">${esc(authorName)}</span>` : '',
  ].filter(Boolean).join('');
  const html = `<article class="material-page reading-page material-preview-page">
    <p class="form-note is-muted material-preview-note">Это предпросмотр черновика. Материал не публикуется, пока вы не нажмёте «Опубликовать» или «Сохранить».</p>
    <h1 class="material-title">${esc(publicText(title))}</h1>
    <div class="material-body">${bodyHtml}</div>
    ${metaPills ? `<div class="material-meta material-meta-public material-meta-footer">${metaPills}</div>` : ''}
  </article>`;
  openModal('Предпросмотр', html, {wide:true, kind:'material-preview'});
}
function materialEditor(route, slug, fallbackIndex=null){
  if(!isAdmin()) return loginModal('admin');
  if(!sectionRoutes.includes(route) || (!slug && fallbackIndex === null)){
    say('Материал не найден.','warning');
    return;
  }
  const found = findEditableMaterial(state.content, route, slug, fallbackIndex);
  if(!found.item){
    say('Материал не найден. Обновите страницу.','warning');
    return;
  }
  openPublicMaterialEditor({mode:'edit', route, slug:slug || found.item.slug || '', index:found.index});
}
function cancelMaterialEditor(){
  if(state.publicMaterialEditor){
    cancelPublicMaterialEditor();
    return;
  }
  const route = state.adminMaterialEditor?.route || state.adminEditorPage || 'home';
  state.adminMaterialEditor = null;
  openAdminEditorPage(route);
}
function openPublicMaterialEditor(config={}){
  if(!isAdmin()) return loginModal('admin');
  const route = config.route;
  if(!sectionRoutes.includes(route)){
    say('Раздел не найден.', 'warning');
    return;
  }
  state.adminMaterialEditor = null;
  state.publicMaterialEditor = {
    mode: config.mode === 'edit' ? 'edit' : 'new',
    route,
    slug: config.slug || '',
    index: config.index ?? null,
  };
  setSaveStatus('idle', 'Готово');
  if(state.route !== route || state.slug){
    const url = routeHref(route);
    if(url !== `${location.pathname}${location.search}`) history.pushState(null, '', url);
    applyRouteFromLocation();
  }
  render();
}
function cancelPublicMaterialEditor(){
  const route = state.publicMaterialEditor?.route || state.route;
  state.publicMaterialEditor = null;
  if(sectionRoutes.includes(route) && (state.route !== route || state.slug)){
    go(route);
  }else{
    render();
  }
}
function wireRemove(root){ root.querySelectorAll('[data-remove-item]').forEach(button => button.onclick = () => button.closest('[data-item]').remove()); }
function createEmptyItem(){
  return {status:'published', cover_symbol:'✦', cover_image_url:'', cover_image_alt:''};
}
function addItemToSection(details, root){
  const box = details?.querySelector('[data-items]');
  if(!box) return;
  details.open = true;
  box.insertAdjacentHTML('beforeend', itemEditor(createEmptyItem(), box.querySelectorAll('[data-item]').length, {route: details.dataset.section || ''}));
  wireRemove(root);
  bindCompactCoverFields(root);
  bindMediaFields(root);
  bindItemPreviews(root);
  bindRichEditors(root);
  initBlockEditors(root);
  const added = box.lastElementChild;
  added?.querySelector('[name="item_title"]')?.focus();
  added?.scrollIntoView({block:'nearest'});
  const sectionTitle = details.querySelector('[name="section_title"]')?.value?.trim() || details.querySelector('summary')?.textContent?.trim() || 'раздел';
  say(`Новый материал добавлен в раздел «${sectionTitle}».`,'success');
}
function bindSectionItemActions(root){
  root.querySelectorAll('details[data-section] [data-add-item]').forEach(button => {
    button.onclick = () => addItemToSection(button.closest('details[data-section]'), root);
  });
  root.querySelectorAll('details[data-section] [name="section_title"]').forEach(input => {
    input.addEventListener('input', () => refreshSectionAddLabels(root));
  });
  refreshSectionAddLabels(root);
}
async function uploadMediaFile(file, slot='hero', onProgress=null){
  if(!file) return {path:''};
  if(file.size > MEDIA_UPLOAD_MAX_BYTES) throw new Error(`Файл слишком большой. Лучше выбрать изображение до ${MEDIA_UPLOAD_MAX_LABEL}.`);
  const body = new FormData();
  body.append('slot', slot);
  body.append('file', file, file.name || `${slot}.bin`);
  return apiFormUpload('/api/admin/media/upload', body, onProgress);
}
async function uploadProfileAvatar(file){
  if(!file) return {path:''};
  if(file.size > MEDIA_UPLOAD_MAX_BYTES) throw new Error(`Файл слишком большой. Выберите изображение до ${MEDIA_UPLOAD_MAX_LABEL}.`);
  const body = new FormData();
  body.append('file', file, file.name || 'profile-avatar.bin');
  return api('/api/community/profile/avatar', {method:'POST', formData:body});
}
function setFeedback(node, text, type='muted'){
  if(!node) return;
  node.textContent = text || '';
  const base = node.dataset.feedbackStyle === 'note' ? 'form-note' : 'form-feedback';
  node.className = `${base} ${type ? `is-${type}` : ''}`.trim();
}
function mediaRootForForm(form){
  return form.closest('#modalBody') || app;
}
function bumpMediaUploads(root, delta){
  const current = Number(root.dataset.mediaUploadsInProgress || 0) || 0;
  const next = Math.max(0, current + delta);
  root.dataset.mediaUploadsInProgress = String(next);
}
function mediaUploadOverlayHtml(percent=null, text=''){
  const value = Number.isFinite(Number(percent)) ? Math.max(1, Math.min(100, Number(percent))) : 35;
  return `<div class="media-upload-status" data-media-upload-status><span>${esc(text || 'Загружаю фото…')}</span><i style="--upload-progress:${attr(`${Math.round(value)}%`)}"></i></div>`;
}
function bindMediaField(field, root){
  if(!field || field.dataset.bound === '1') return;
  const preview = field.querySelector('[data-media-preview]');
  const fileInput = field.querySelector('[data-media-file]');
  const hiddenInput = field.querySelector('[name$="_url"]');
  const clearButton = field.querySelector('[data-media-clear]');
  const feedback = field.querySelector('[data-media-feedback]');
  if(!preview || !fileInput || !hiddenInput || !clearButton || !feedback) return;
  let pendingPreviewUrl = '';
  let pendingFileName = '';
  let uploadPercent = null;
  let uploadText = '';
  const findScoped = selector => field.closest('[data-item]')?.querySelector(selector) || field.closest('details[data-section]')?.querySelector(selector) || field.closest('form')?.querySelector(selector) || null;
  const paint = () => {
    const titleSource = field.dataset.titleSource ? findScoped(field.dataset.titleSource) : null;
    const altSource = field.dataset.altSource ? findScoped(field.dataset.altSource) : null;
    const title = titleSource?.value?.trim() || field.dataset.title || 'Изображение';
    const alt = altSource?.value?.trim() || title;
    const ratio = field.dataset.ratio || 'portrait';
    const emptyText = field.dataset.empty || 'Без изображения';
    const url = pendingPreviewUrl || hiddenInput.value || '';
    preview.innerHTML = mediaPreviewCardHtml({title, url, alt, ratio, emptyText});
    if(pendingPreviewUrl) preview.querySelector('.media-preview-frame')?.insertAdjacentHTML('beforeend', mediaUploadOverlayHtml(uploadPercent, uploadText || pendingFileName || 'Загружаю фото…'));
    clearButton.textContent = hiddenInput.value || pendingPreviewUrl ? 'Убрать' : 'Очистить';
  };
  field.querySelectorAll('input[type="text"], textarea').forEach(control => control.addEventListener('input', paint));
  const titleSource = field.dataset.titleSource ? findScoped(field.dataset.titleSource) : null;
  const altSource = field.dataset.altSource ? findScoped(field.dataset.altSource) : null;
  titleSource?.addEventListener('input', paint);
  altSource?.addEventListener('input', paint);
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if(!file){
      setFeedback(feedback, hiddenInput.value ? 'Загружено' : 'Файл не выбран.', hiddenInput.value ? 'muted' : 'warning');
      paint();
      return;
    }
    if(file.size > MEDIA_UPLOAD_MAX_BYTES){
      fileInput.value = '';
      setFeedback(feedback, `Файл слишком большой. Выберите изображение до ${MEDIA_UPLOAD_MAX_LABEL}.`, 'danger');
      say(`Файл слишком большой. Выберите изображение до ${MEDIA_UPLOAD_MAX_LABEL}.`,'warning');
      paint();
      return;
    }
    try{
      bumpMediaUploads(root, 1);
      pendingPreviewUrl = URL.createObjectURL(file);
      pendingFileName = `${file.name || 'Фото'}${file.size ? ` · ${fileSizeLabel(file.size)}` : ''}`;
      uploadPercent = 1;
      uploadText = pendingFileName;
      fileInput.disabled = true;
      clearButton.disabled = true;
      paint();
      setFeedback(feedback, 'Загружаю фото…', 'warning');
      const upload = await uploadMediaFile(file, field.dataset.slot || 'hero', percent => {
        uploadPercent = percent;
        uploadText = percent >= 99 ? 'Сжимаю фото на сервере…' : `Загружаю фото ${Math.round(percent || 1)}%`;
        paint();
      });
      hiddenInput.value = String(upload.path || '').trim();
      hiddenInput.dispatchEvent(new Event('input', {bubbles:true}));
      fileInput.value = '';
      if(pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = '';
      pendingFileName = '';
      uploadPercent = null;
      uploadText = '';
      paint();
      setFeedback(feedback, 'Загружено. Сохраните изменения.', 'success');
    }catch(error){
      fileInput.value = '';
      if(pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
      pendingPreviewUrl = '';
      pendingFileName = '';
      uploadPercent = null;
      uploadText = '';
      paint();
      setFeedback(feedback, error.message || 'Не удалось загрузить изображение.', 'danger');
      say(error.message || 'Не удалось загрузить изображение.','danger');
    }finally{
      bumpMediaUploads(root, -1);
      fileInput.disabled = false;
      clearButton.disabled = false;
    }
  });
  clearButton.addEventListener('click', () => {
    hiddenInput.value = '';
    hiddenInput.dispatchEvent(new Event('input', {bubbles:true}));
    fileInput.value = '';
    if(pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingPreviewUrl = '';
    pendingFileName = '';
    uploadPercent = null;
    uploadText = '';
    setFeedback(feedback, 'Убрано. Сохраните изменения.', 'warning');
    paint();
  });
  setFeedback(feedback, hiddenInput.value ? 'Загружено' : 'Без изображения', hiddenInput.value ? 'muted' : 'warning');
  field.dataset.bound = '1';
  paint();
}
function bindMediaFields(root){
  root.querySelectorAll('[data-media-field]').forEach(field => bindMediaField(field, root));
}
function bindFeaturedChecklist(root){
  const checks = [...root.querySelectorAll('[name="featured_material_ids"]')];
  const feedback = root.querySelector('[data-featured-feedback]');
  if(!checks.length || !feedback) return;
  const paint = (message='', type='muted') => {
    const count = checks.filter(box => box.checked).length;
    const base = message || `Выбрано ${count} из 4`;
    setFeedback(feedback, base, type);
  };
  checks.forEach(box => box.addEventListener('change', event => {
    const count = checks.filter(input => input.checked).length;
    if(count > 4){
      event.currentTarget.checked = false;
      paint('Не больше четырех материалов.', 'warning');
      say('Не больше четырех материалов.','warning');
      return;
    }
    paint();
  }));
  paint();
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
async function saveHomeForm(event){
  event.preventDefault();
  const form = event.currentTarget;
  if(form.dataset.saving === '1') return;
  const feedback = form.querySelector('[data-form-feedback]');
  const mediaRoot = mediaRootForForm(form);
  if(Number(mediaRoot?.dataset.mediaUploadsInProgress || 0) > 0){
    setFeedback(feedback, 'Подождите, пока сайт закончит загрузку изображения.', 'warning');
    say('Подождите, пока сайт закончит загрузку изображения.','warning');
    return;
  }
  form.dataset.saving = '1';
  setContentFormBusy(form, true);
  try{
    setSaveStatus('saving', 'Сохраняю главную…');
    setFeedback(feedback, 'Сохраняю главную…', 'warning');
    const payload = await api('/api/admin/content/home/save', {method:'POST', body:{
      base_updated_at:baseUpdatedAt(),
      base_version:baseContentVersion(),
      hero_title:fieldValue(form, 'hero_title'),
      hero_text:fieldValue(form, 'hero_text'),
      hero_image_url:fieldValue(form, 'hero_image_url'),
      hero_image_alt:fieldValue(form, 'hero_image_alt'),
    }});
    state.content = payload.content;
    markModalClean(form);
    setFeedback(feedback, saveSummary(payload, 'Главная сохранена.'), 'success');
    setSaveStatus('saved', `${saveSummary(payload, 'Главная сохранена.')} Изменения уже на сайте.`);
    say(saveSummary(payload, 'Главная сохранена.'), 'success');
    render();
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
async function saveFeaturedForm(event){
  event.preventDefault();
  const form = event.currentTarget;
  if(form.dataset.saving === '1') return;
  const feedback = form.querySelector('[data-form-feedback]');
  form.dataset.saving = '1';
  setContentFormBusy(form, true);
  try{
    const featuredIds = [...form.querySelectorAll('[name="featured_material_ids"]:checked')].map(box => cleanText(box.value)).filter(Boolean).slice(0, 4);
    setSaveStatus('saving', 'Сохраняю избранное…');
    setFeedback(feedback, 'Сохраняю избранное…', 'warning');
    const payload = await api('/api/admin/content/featured/save', {method:'POST', body:{base_updated_at:baseUpdatedAt(), base_version:baseContentVersion(), featured_material_ids:featuredIds}});
    state.content = payload.content;
    markModalClean(form);
    setFeedback(feedback, featuredIds.length ? saveSummary(payload, 'Избранное сохранено.') : 'Избранное очищено.', 'success');
    setSaveStatus('saved', `${featuredIds.length ? saveSummary(payload, 'Избранное сохранено.') : 'Избранное очищено.'} Изменения уже на сайте.`);
    say(featuredIds.length ? saveSummary(payload, 'Избранное сохранено.') : 'Избранное очищено.', 'success');
    render();
  }catch(error){
    const message = error?.message || 'Не удалось сохранить избранное.';
    setSaveStatus('error', message);
    setFeedback(feedback, message, 'danger');
    say(message, 'danger');
  }finally{
    delete form.dataset.saving;
    setContentFormBusy(form, false);
  }
}
async function saveSectionSettingsForm(event){
  event.preventDefault();
  const form = event.currentTarget;
  if(form.dataset.saving === '1') return;
  const route = form.dataset.route;
  const feedback = form.querySelector('[data-form-feedback]');
  const mediaRoot = mediaRootForForm(form);
  if(Number(mediaRoot?.dataset.mediaUploadsInProgress || 0) > 0){
    setFeedback(feedback, 'Подождите, пока сайт закончит загрузку изображения.', 'warning');
    say('Подождите, пока сайт закончит загрузку изображения.','warning');
    return;
  }
  form.dataset.saving = '1';
  setContentFormBusy(form, true);
  try{
    setSaveStatus('saving', 'Сохраняю раздел…');
    setFeedback(feedback, 'Сохраняю раздел…', 'warning');
    const payload = await api('/api/admin/content/section/save', {method:'POST', body:{
      route,
      base_updated_at:baseUpdatedAt(),
      base_version:baseContentVersion(),
      title:fieldValue(form, 'section_title') || sectionNames[route] || route,
      intro:fieldValue(form, 'section_intro'),
      seo_title:fieldValue(form, 'section_seo_title'),
      seo_description:fieldValue(form, 'section_seo_description') || fieldValue(form, 'section_intro'),
      cover_image_url:fieldValue(form, 'section_cover_url'),
      cover_image_alt:fieldValue(form, 'section_cover_alt'),
      topics_enabled:checkboxValue(form, 'section_topics_enabled', false),
      topics:readSectionTopicRows(form),
    }});
    state.content = payload.content;
    markModalClean(form);
    setFeedback(feedback, saveSummary(payload, 'Раздел сохранен.'), 'success');
    setSaveStatus('saved', `${saveSummary(payload, 'Раздел сохранен.')} Изменения уже на сайте.`);
    say(saveSummary(payload, 'Раздел сохранен.'),'success');
    render();
  }catch(error){
    const message = error?.message || 'Не удалось сохранить раздел.';
    setSaveStatus('error', message);
    setFeedback(feedback, message, 'danger');
    say(message, 'danger');
  }finally{
    delete form.dataset.saving;
    setContentFormBusy(form, false);
  }
}
async function saveMaterialForm(event){
  event.preventDefault();
  const form = event.currentTarget;
  if(form.dataset.saving === '1') return;
  const route = form.dataset.route;
  const oldSlug = form.dataset.slug;
  const oldIndex = form.dataset.index;
  const feedback = form.querySelector('[data-form-feedback]');
  const mediaRoot = mediaRootForForm(form);
  if(Number(mediaRoot?.dataset.mediaUploadsInProgress || 0) > 0){
    setFeedback(feedback, 'Подождите, пока сайт закончит загрузку изображения.', 'warning');
    say('Подождите, пока сайт закончит загрузку изображения.','warning');
    return;
  }
  form.dataset.saving = '1';
  setContentFormBusy(form, true);
  try{
    await syncBlockEditors(form);
    const box = form.querySelector('[data-item]');
    const nextItem = readItemEditorBox(box, Number(oldIndex) || 0);
    nextItem.slug = nextItem.slug || oldSlug;
    setSaveStatus('saving', 'Сохраняю материал…');
    setFeedback(feedback, 'Сохраняю материал…', 'warning');
    const payload = await api('/api/admin/content/material/save', {method:'POST', body:{
      route,
      old_slug:oldSlug,
      index:oldIndex,
      base_updated_at:baseUpdatedAt(),
      base_version:baseContentVersion(),
      material:nextItem,
    }});
    state.content = payload.content;
    markModalClean(form);
    const saved = findEditableMaterial(state.content, route, nextItem.slug || oldSlug, oldIndex);
    const savedSlug = saved.item?.slug || nextItem.slug || oldSlug;
    form.dataset.slug = savedSlug;
    setFeedback(feedback, saveSummary(payload, 'Материал сохранен.'), 'success');
    setSaveStatus('saved', `${saveSummary(payload, 'Материал сохранен.')} Изменения уже на сайте.`);
    say(saveSummary(payload, 'Материал сохранен.'),'success');
    if(state.publicMaterialEditor){
      state.publicMaterialEditor = null;
      go(route, savedSlug);
    }else if(state.route === 'admin'){
      state.adminMaterialEditor = null;
      state.adminEditorPage = route;
      localStorage.setItem(keys.adminEditor, route);
      paintAdminEditor();
    }else if(state.route === route && state.slug === oldSlug && savedSlug !== oldSlug){
      go(route, savedSlug);
    }else{
      render();
    }
  }catch(error){
    const message = error?.message || 'Не удалось сохранить материал.';
    setSaveStatus('error', message);
    setFeedback(feedback, message, 'danger');
    say(message, 'danger');
  }finally{
    delete form.dataset.saving;
    setContentFormBusy(form, false);
  }
}
async function saveContentForm(event){
  event.preventDefault();
  const form = event.currentTarget;
  if(form.dataset.saving === '1') return;
  const fd = new FormData(form);
  const content = clone(state.content);
  const formFeedback = form.querySelector('[data-form-feedback]');
  const mediaRoot = mediaRootForForm(form);
  if(Number(mediaRoot?.dataset.mediaUploadsInProgress || 0) > 0){
    setFeedback(formFeedback, 'Подождите, пока сайт закончит загрузку изображений.', 'warning');
    say('Подождите, пока сайт закончит загрузку изображений.','warning');
    return;
  }
  form.dataset.saving = '1';
  setContentFormBusy(form, true);
  try{
    const heroImageField = form.querySelector('[name="hero_image_url"]');
    const featuredIds = [...form.querySelectorAll('[name="featured_material_ids"]:checked')].map(box => String(box.value || '').trim()).filter(Boolean).slice(0, 4);
    setSaveStatus('saving', 'Сохраняю изменения на сайте…');
    setFeedback(formFeedback, 'Сохраняю изменения на сайте…', 'warning');
    say('Сохраняю изменения на сайте…');
    content.brand = {
      ...(content.brand || {}),
      site_name:cleanText(fd.get('site_name')),
      site_subtitle:'',
      client_area_name:cleanText(fd.get('client_area_name')),
      admin_area_name:cleanText(fd.get('admin_area_name')),
      owner_name:cleanText(fd.get('owner_name')),
      mark:content.brand?.mark || '',
      header_visual_url:content.brand?.header_visual_url || '',
      header_visual_alt:content.brand?.header_visual_alt || '',
      owner_photo_url:content.brand?.owner_photo_url || '',
    };
    content.home = {
      ...(content.home || {}),
      hero_title:String(fd.get('hero_title') || '').trim(),
      hero_text:String(fd.get('hero_text') || '').trim(),
      hero_image_url:String(heroImageField?.value || '').trim(),
      hero_image_alt:String(fd.get('hero_image_alt') || '').trim(),
      welcome_title:String(fd.get('hero_title') || '').trim(),
      welcome_text:String(fd.get('hero_text') || '').trim(),
      featured_material_ids:featuredIds,
    };
    content.sections = content.sections || {};
    form.querySelectorAll('details[data-section]').forEach(details => {
      const route = details.dataset.section;
      const section = content.sections[route] || {};
      section.title = details.querySelector('[name="section_title"]')?.value || sectionNames[route] || route;
      section.intro = details.querySelector('[name="section_intro"]')?.value || '';
      section.cover_image_url = details.querySelector('[name="section_cover_url"]')?.value || '';
      section.cover_image_alt = details.querySelector('[name="section_cover_alt"]')?.value || section.title || '';
      const topicsToggle = details.querySelector('[name="section_topics_enabled"]');
      if(topicsToggle){
        section.topics_enabled = topicsToggle.checked;
        section.topics = readSectionTopicRows(details);
      }
      section.items = [...details.querySelectorAll('[data-item]')].map(readItemEditorBox);
      content.sections[route] = section;
    });
    const payload = await api('/api/admin/content', {method:'POST', body:{content, base_updated_at:baseUpdatedAt(), base_version:baseContentVersion()}});
    state.content = payload.content;
    setFeedback(formFeedback, 'Изменения сохранены. Обновляю страницу…', 'success');
    await reloadContent().catch(() => {});
    markModalClean(form);
    closeModal(true);
    setSaveStatus('saved', 'Сайт обновлен. Изменения уже на сайте.');
    say('Сайт обновлен.','success');
    render();
  }catch(error){
    const message = error?.message || 'Не удалось сохранить изменения.';
    setSaveStatus('error', message);
    setFeedback(formFeedback, message, 'danger');
    say(message,'danger');
  }finally{
    delete form.dataset.saving;
    setContentFormBusy(form, false);
  }
}

