(function(){
  var userKey = 'zapiski.v5.user';
  var adminViewModeKey = 'zapiski.v5.adminViewMode';
  var user = null;
  var adminViewMode = 'admin';
  try{
    user = JSON.parse(localStorage.getItem(userKey) || 'null');
    adminViewMode = localStorage.getItem(adminViewModeKey) === 'visitor' ? 'visitor' : 'admin';
  }catch(error){
    user = null;
  }

  var role = user && user.role ? String(user.role) : '';
  var displayName = user && (user.display_name || user.username) ? String(user.display_name || user.username) : '';
  if(!role) return;

  var adminButton = document.getElementById('adminButton');
  var loginButton = document.getElementById('loginButton');
  var profileControl = document.getElementById('profileControl');
  var profileButton = document.getElementById('profileButton');
  var profileAvatar = document.getElementById('profileAvatar');
  var hasAdminRights = role === 'admin' || !!(user && user.site_admin);
  if(adminButton) adminButton.hidden = !hasAdminRights || adminViewMode === 'visitor';
  if(loginButton) loginButton.hidden = true;
  if(profileControl) profileControl.hidden = false;
  if(profileAvatar){
    var initial = displayName.trim() ? displayName.trim().charAt(0).toUpperCase() : (role === 'admin' ? 'П' : role === 'client' ? 'К' : 'У');
    profileAvatar.textContent = initial;
  }
  if(profileButton){
    profileButton.setAttribute('aria-label', displayName ? 'Профиль: ' + displayName : 'Профиль');
  }
  document.body.dataset.adminViewMode = hasAdminRights && adminViewMode === 'visitor' ? 'visitor' : 'admin';
  document.body.classList.remove('auth-pending');
  document.body.classList.add('auth-warmed');
})();
