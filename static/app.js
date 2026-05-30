(() => {
  const version = new URL(import.meta.url).search || '';
  const publicScripts = [
    'shared-state.js',
    'api.js',
    'shared-ui.js',
    'public-site.js',
    'community.js',
    'auth.js',
  ];
  const workspaceScripts = [
    'trebnik-client.js',
    'trebnik-admin.js',
    'content-editor.js',
    'trebnik-actions.js',
  ];
  const finalScripts = ['public-actions.js'];
  const styleGroups = {
    public: [
      '/static/styles_modules/00-base.css',
      '/static/styles_modules/01-layout.css',
      '/static/styles_modules/02-components-forms-modals-auth.css',
      '/static/styles_modules/03-public-pages.css',
      '/static/styles_modules/06-content-editor.css',
      '/static/styles_modules/10-responsive.css',
      '/static/styles_modules/14-mobile-complete.css',
    ],
    admin: [
      '/static/styles_modules/04-content-admin.css',
      '/static/styles_modules/05-admin-trebnik-actions.css',
      '/static/styles_modules/06-content-editor.css',
      '/static/styles_modules/07-client-cabinet.css',
      '/static/styles_modules/08-admin-trebnik.css',
      '/static/styles_modules/09-admin-trebnik-clients.css',
      '/static/styles_modules/11-admin-finance.css',
      '/static/styles_modules/12-admin-services.css',
      '/static/styles_modules/13-trebnik-stability.css',
    ],
    client: [
      '/static/styles_modules/07-client-cabinet.css',
      '/static/styles_modules/08-admin-trebnik.css',
      '/static/styles_modules/09-admin-trebnik-clients.css',
      '/static/styles_modules/11-admin-finance.css',
      '/static/styles_modules/12-admin-services.css',
      '/static/styles_modules/13-trebnik-stability.css',
    ],
  };
  const base = '/static/app_modules/';
  const loadedScripts = new Map();
  const routeFromPath = () => {
    const first = decodeURIComponent(location.pathname.split('/').filter(Boolean)[0] || 'home');
    return ['admin', 'trebnik'].includes(first) ? first : 'public';
  };
  const hasAdminRights = (user) => Boolean(user && (user.role === 'admin' || (user.role === 'user' && user.site_admin)));
  const scriptsFor = (route, user) => {
    const scripts = [...publicScripts];
    if(['admin', 'trebnik'].includes(route) || hasAdminRights(user)){
      scripts.push(...workspaceScripts);
    }
    return scripts;
  };
  const stylesFor = (route, user) => {
    const styles = [...styleGroups.public];
    if(route === 'admin' || hasAdminRights(user)){
      styles.push(...styleGroups.admin);
    }else if(route === 'trebnik' && user){
      styles.push(...styleGroups.client);
    }
    const ordered = [...new Set(styles)];
    const finalNames = ['10-responsive.css', '14-mobile-complete.css'];
    const finalStyles = [];
    const normalStyles = [];
    ordered.forEach((href) => {
      if(finalNames.some(name => href.includes(name))) finalStyles.push(href);
      else normalStyles.push(href);
    });
    finalStyles.sort((a, b) => finalNames.findIndex(name => a.includes(name)) - finalNames.findIndex(name => b.includes(name)));
    return [...normalStyles, ...finalStyles];
  };
  const load = (src) => {
    if(loadedScripts.has(src)) return loadedScripts.get(src);
    const promise = new Promise((resolve, reject) => {
      const existing = [...document.scripts].find(script => script.src.includes(`${base}${src}`));
      if(existing?.dataset.loaded === '1'){
        resolve();
        return;
      }
      if(existing){
        existing.addEventListener('load', resolve, {once:true});
        existing.addEventListener('error', () => reject(new Error(`Не удалось загрузить ${src}`)), {once:true});
        return;
      }
      const script = document.createElement('script');
      script.src = base + src + version;
      script.async = false;
      script.onload = () => {
        script.dataset.loaded = '1';
        resolve();
      };
      script.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
      document.head.appendChild(script);
    });
    loadedScripts.set(src, promise);
    return promise;
  };
  const ensureStyles = (route, user) => {
    stylesFor(route, user).forEach((href) => {
      const desiredHref = href + version;
      let link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(item => item.href.includes(href));
      if(!link){
        link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = desiredHref;
      }else if(version && !link.href.includes(desiredHref)){
        link.href = desiredHref;
      }
      document.head.appendChild(link);
    });
  };
  const loadMany = (scripts) => scripts.reduce((chain, src) => chain.then(() => load(src)), Promise.resolve());
  window.ensureAppStyles = (route='public', user=null) => ensureStyles(route, user);
  window.ensureAppModules = (route='public', user=null) => loadMany(scriptsFor(route, user));
  window.ensureAppWorkspace = (route='public', user=null) => {
    ensureStyles(route, user);
    return window.ensureAppModules(route, user);
  };
  const initialRoute = routeFromPath();
  ensureStyles(initialRoute, null);
  loadMany([...scriptsFor(initialRoute, null), ...finalScripts]).catch((error) => {
    console.error(error);
    const app = document.querySelector('#app');
    if(app){
      app.innerHTML = '<section class="gate-card"><h1>Что-то пошло не так</h1><p>Не удалось открыть сайт. Обновите страницу.</p></section>';
    }
  });
})();
