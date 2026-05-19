/**
 * header.js
 * 영주시 공공형 빈집 활용 플랫폼 - 공통 헤더 렌더링
 * 모든 페이지에서 동적으로 헤더를 삽입합니다.
 */

function isMypageContext(user) {
  if (!user) return false;

  const path = window.location.pathname;
  return (
    path.includes('/guest/guest-mypage.html') ||
    path.includes('/owner/owner-mypage.html') ||
    path.includes('/admin/admin-dashboard.html')
  );
}

function isAdminContext() {
  return window.location.pathname.includes('/admin/');
}

/**
 * 사이트 헤더 HTML을 생성하여 삽입합니다.
 * @param {string} activePage - 현재 활성화된 네비게이션 항목 키
 */
function renderHeader(activePage = '') {
  const user = getCurrentUser();
  const root = getRootPath();
  const isAdminPage = isAdminContext();
  const showWithdrawalAction = isMypageContext(user);
  const unreadCount = typeof getUnreadNotificationCount === 'function'
    ? getUnreadNotificationCount(user)
    : 0;
  const withdrawalHref = `${root}auth/withdraw.html`;
  const isHomePage =
    window.location.pathname.includes('/home/index.html') ||
    window.location.pathname.endsWith('/home/') ||
    window.location.pathname.endsWith('/index.html');
  document.body.classList.toggle('user-platform-page', !isAdminPage);
  document.body.classList.remove('has-mypage-hero');

const navItems = [
  { key: 'home', label: '홈', href: `${root}home/index.html` },
  { key: 'legal-info', label: '법적 정보 안내', href: `${root}legal/legal-info.html` },
  { key: 'house-list', label: '빈집 목록', href: `${root}guest/guest-list.html` },
  { key: 'ai', label: 'AI 추천', href: `${root}guest/guest-ai.html` },
  { key: 'vendor', label: '협력업체', href: `${root}vendor/vendor-list.html` },
  { key: 'community', label: '커뮤니티', href: `${root}community/community.html` }
];

  navItems.splice(3, 0, { key: 'map', label: '지도보기', href: `${root}guest/guest-map.html` });

  if (user && user.role === 'owner') {
    navItems.splice(4, 0, { key: 'register', label: '빈집 등록', href: `${root}owner/owner-register.html` });
  }

  const orderedNavKeys = ['home', 'house-list', 'map', 'vendor', 'community', 'legal-info', 'ai'];
  const orderedNavItems = orderedNavKeys
    .map((key) => navItems.find((item) => item.key === key))
    .filter(Boolean);

  const navHtml = orderedNavItems.map(item => `
    <a href="${item.href}" data-nav-key="${item.key}" class="site-header__nav-link ${item.key === 'ai' ? 'site-header__nav-link--ai' : ''} ${activePage === item.key ? 'is-active' : ''}">
      ${item.label}
    </a>
  `).join('');

  let mypageHref = `${root}home/index.html`;
  let actionHtml = '';

  if (user) {
    const roleLabel = {
      guest: '투숙 희망자',
      owner: '빈집 소유자',
      admin: '관리자',
    }[user.role] || '사용자';

    mypageHref = {
      guest: `${root}guest/guest-mypage.html`,
      owner: `${root}owner/owner-mypage.html`,
      admin: `${root}admin/admin-dashboard.html`,
    }[user.role] || `${root}home/index.html`;

    actionHtml = `
      <a href="${mypageHref}" class="btn btn--ghost btn--sm site-header__user-link">
        👤 ${user.name} (${roleLabel})
        <span class="site-header__notice-marker ${unreadCount > 0 ? 'is-active' : ''}" aria-label="읽지 않은 알림 ${unreadCount}개"></span>
      </a>
      <button type="button" class="site-header__notice-btn" id="notificationToggle" aria-label="알림 열기">
        알림${unreadCount > 0 ? `<span>${unreadCount}</span>` : ''}
      </button>
      ${showWithdrawalAction ? `<a href="${withdrawalHref}" class="btn btn--danger btn--sm">회원탈퇴</a>` : ''}
      <button class="btn btn--secondary btn--sm" onclick="logoutUser()">로그아웃</button>
    `;
  } else {
    actionHtml = `
      <a href="${root}auth/login.html" class="btn btn--auth btn--ghost btn--sm">로그인</a>
      <a href="${root}auth/signup.html" class="btn btn--auth btn--primary btn--sm">회원가입</a>
    `;
  }

  const mobileNavHtml = orderedNavItems.map(item => `
    <a href="${item.href}" data-nav-key="${item.key}" class="site-header__mobile-nav-link ${item.key === 'ai' ? 'site-header__mobile-nav-link--ai' : ''} ${activePage === item.key ? 'is-active' : ''}">
      ${item.label}
    </a>
  `).join('');

  const leftHtml = `
    <div class="site-header__left-spacer" aria-hidden="true"></div>
  `;

  const mobileActionHtml = user
    ? `
      <a href="${mypageHref}" class="btn btn--ghost btn--sm btn--full">마이페이지</a>
      <button type="button" class="btn btn--ghost btn--sm btn--full" id="mobileNotificationToggle">알림${unreadCount > 0 ? ` (${unreadCount})` : ''}</button>
      ${showWithdrawalAction ? `<a href="${withdrawalHref}" class="btn btn--danger btn--sm btn--full">회원탈퇴</a>` : ''}
      <button class="btn btn--secondary btn--sm btn--full" onclick="logoutUser()">로그아웃</button>
    `
    : `
      <a href="${root}auth/login.html" class="btn btn--ghost btn--sm btn--full">로그인</a>
      <a href="${root}auth/signup.html" class="btn btn--primary btn--sm btn--full">회원가입</a>
    `;

  const headerHtml = `
    <header class="site-header ${isHomePage ? 'site-header--home' : 'site-header--spaced'}" id="siteHeader">
      <div class="site-header__inner">
        ${leftHtml}

        <nav class="site-header__nav" aria-label="주요 메뉴">
          ${navHtml}
        </nav>

        <div class="site-header__actions">
          ${actionHtml}
          <button class="site-header__mobile-toggle" id="mobileMenuToggle" aria-label="메뉴 열기">
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>

      <div class="site-header__mobile-nav" id="mobileNav">
        ${mobileNavHtml}
        <div class="site-header__mobile-nav-actions">
          ${mobileActionHtml}
        </div>
      </div>
    </header>
  `;

  const headerPlaceholder = document.getElementById('headerPlaceholder');
  const currentHeader = document.getElementById('siteHeader');
  if (headerPlaceholder) {
    headerPlaceholder.outerHTML = headerHtml;
  } else if (currentHeader) {
    currentHeader.outerHTML = headerHtml;
  } else {
    document.body.insertAdjacentHTML('afterbegin', headerHtml);
  }

  const headerEl = document.getElementById('siteHeader');
  const toggleBtn = document.getElementById('mobileMenuToggle');
  const notificationToggle = document.getElementById('notificationToggle');
  const mobileNotificationToggle = document.getElementById('mobileNotificationToggle');
const mobileNavEl = document.getElementById('mobileNav');

if (notificationToggle) {
  const notificationCountHtml = unreadCount > 0
    ? `<span class="site-header__notice-count">${unreadCount}</span>`
    : '';
  notificationToggle.classList.add('site-header__notice-btn--icon');
  notificationToggle.innerHTML = `<span class="site-header__notice-icon" aria-hidden="true">🔔</span>${notificationCountHtml}`;
}

if (mobileNotificationToggle) {
  mobileNotificationToggle.innerHTML = `\uD83D\uDD14 \uc54c\ub9bc${unreadCount > 0 ? ` (${unreadCount})` : ''}`;
}

if (toggleBtn && mobileNavEl) {
  toggleBtn.addEventListener('click', () => {
    mobileNavEl.classList.toggle('is-open');
    toggleBtn.classList.toggle('is-open');
  });

  if (window.__yeongjuHeaderResizeHandler) {
    window.removeEventListener('resize', window.__yeongjuHeaderResizeHandler);
  }

  window.__yeongjuHeaderResizeHandler = () => {
    if (window.innerWidth > 1180) {
      mobileNavEl.classList.remove('is-open');
      toggleBtn.classList.remove('is-open');
    }
  };

  window.addEventListener('resize', window.__yeongjuHeaderResizeHandler);
}

  setupHeaderNotifications(user, activePage);

  if (window.__yeongjuHeaderPlatformHandler) {
    window.removeEventListener('yeongju:platform-data-changed', window.__yeongjuHeaderPlatformHandler);
  }

  window.__yeongjuHeaderPlatformHandler = (event) => {
    const type = String(event?.detail?.type || '');
    if (type.includes('notification')) {
      renderHeader(activePage);
    }
  };

  window.addEventListener('yeongju:platform-data-changed', window.__yeongjuHeaderPlatformHandler);

  if (window.__yeongjuHeaderScrollHandler) {
    window.removeEventListener('scroll', window.__yeongjuHeaderScrollHandler);
  }

  window.__yeongjuHeaderScrollHandler = () => {
    const header = document.getElementById('siteHeader');
    if (header) {
      header.classList.toggle('is-scrolled', window.scrollY > 10);
      if (
        isHomePage &&
        window.scrollY <= 10 &&
        !header.matches(':hover') &&
        !header.matches(':focus-within')
      ) {
        header.classList.remove('is-home-revealed');
      }
    }
  };

  window.addEventListener('scroll', window.__yeongjuHeaderScrollHandler);

  if (isHomePage && headerEl) {
    const revealHomeHeader = () => {
      headerEl.classList.add('is-home-revealed');
    };

    const hideHomeHeader = () => {
      window.requestAnimationFrame(() => {
        if (window.scrollY <= 10 && !headerEl.matches(':focus-within')) {
          headerEl.classList.remove('is-home-revealed');
        }
      });
    };

    headerEl.addEventListener('mouseenter', revealHomeHeader);
    headerEl.addEventListener('mouseleave', hideHomeHeader);
    headerEl.addEventListener('focusin', revealHomeHeader);
    headerEl.addEventListener('focusout', hideHomeHeader);
  }

  window.__yeongjuHeaderScrollHandler();
}

function setupHeaderNotifications(user, activePage = '') {
  if (!user || typeof getNotifications !== 'function') return;

  const existing = document.getElementById('siteNotificationPanel');
  if (existing) existing.remove();

  const notifications = getNotifications(user);
  const unreadCount = typeof getUnreadNotificationCount === 'function'
    ? getUnreadNotificationCount(user)
    : notifications.filter(item => !item.read).length;
  const fallbackHref = typeof getNotificationSectionHref === 'function'
    ? getNotificationSectionHref(user)
    : `${getRootPath()}home/index.html`;
  const panel = document.createElement('div');
  panel.className = 'site-notification-panel';
  panel.id = 'siteNotificationPanel';
  panel.innerHTML = `
    <div class="site-notification-panel__header">
      <strong>알림</strong>
      <button type="button" id="notificationReadAllBtn">모두 읽음</button>
    </div>
    <div class="site-notification-panel__list">
      ${notifications.length ? notifications.slice(0, 8).map(item => `
        <a href="${item.href || '#'}" class="site-notification-item ${item.read ? '' : 'is-unread'}">
          <span class="site-notification-item__dot"></span>
          <span>
            <strong>${item.message}</strong>
            <small>${item.createdAt ? new Date(item.createdAt).toLocaleDateString('ko-KR') : ''}</small>
          </span>
        </a>
      `).join('') : '<div class="site-notification-empty">새 알림이 없습니다.</div>'}
    </div>
  `;
  document.body.appendChild(panel);

  const handleToggleClick = (event) => {
    if (unreadCount === 0) {
      window.location.href = fallbackHref;
      return;
    }

    event.preventDefault();
    panel.classList.toggle('is-open');
  };

  document.getElementById('notificationToggle')?.addEventListener('click', handleToggleClick);
  document.getElementById('mobileNotificationToggle')?.addEventListener('click', handleToggleClick);
  document.getElementById('notificationReadAllBtn')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    markNotificationsRead(user);
    panel.classList.remove('is-open');
    renderHeader(activePage);
  });

  if (document.__yeongjuNotificationOutsideHandler) {
    document.removeEventListener('click', document.__yeongjuNotificationOutsideHandler);
  }

  document.__yeongjuNotificationOutsideHandler = (event) => {
    if (!panel.contains(event.target) && !event.target.closest('#notificationToggle') && !event.target.closest('#mobileNotificationToggle')) {
      panel.classList.remove('is-open');
    }
  };

  document.addEventListener('click', document.__yeongjuNotificationOutsideHandler);
}

(function injectHeaderMobileStyles() {
  const style = document.createElement('style');
  style.textContent = `
    body.user-platform-page:not(.home-page):not(.legal-info-page) {
      background: #ffffff !important;
    }
    body.user-platform-page:not(.home-page):not(.legal-info-page) main,
    body.user-platform-page:not(.home-page):not(.legal-info-page) .page-layout,
    body.user-platform-page:not(.home-page):not(.legal-info-page) .page-layout__main,
    body.user-platform-page:not(.home-page):not(.legal-info-page) .guest-list-main,
    body.user-platform-page:not(.home-page):not(.legal-info-page) .community-main,
    body.user-platform-page:not(.home-page):not(.legal-info-page) .ai-main,
    body.user-platform-page:not(.home-page):not(.legal-info-page) .vendor-page,
    body.user-platform-page:not(.home-page):not(.legal-info-page) .owner-register-main,
    body.user-platform-page:not(.home-page):not(.legal-info-page) .map-shell {
      background: #ffffff !important;
      background-image: none !important;
    }
    body.user-platform-page:not(.home-page):not(.legal-info-page) .guest-list-main::before,
    body.user-platform-page:not(.home-page):not(.legal-info-page) .owner-register-main::before,
    body.user-platform-page:not(.home-page):not(.legal-info-page) .owner-register-main::after {
      content: none !important;
      background: none !important;
    }
    body.user-platform-page .site-header__nav {
      justify-content: center !important;
      gap: clamp(4px, 0.7vw, 12px) !important;
    }
    body.user-platform-page .site-header__nav-link,
    body.user-platform-page.home-page .site-header__nav-link,
    body.user-platform-page.guest-list-page .site-header__nav-link,
    body.user-platform-page.community-page .site-header__nav-link,
    body.user-platform-page.legal-info-page .site-header__nav-link {
      color: #2b2216 !important;
      text-shadow: none !important;
      background: transparent !important;
      box-shadow: none !important;
      font-weight: 800 !important;
    }
    body.user-platform-page .site-header__nav-link:hover,
    body.user-platform-page .site-header__nav-link:focus-visible {
      color: #7a5a17 !important;
      text-shadow: none !important;
      background: rgba(201, 168, 76, 0.12) !important;
      box-shadow: none !important;
    }
    body.user-platform-page .site-header__nav-link.is-active {
      color: #ffffff !important;
      text-shadow: none !important;
      background: linear-gradient(135deg, #8b6914 0%, #c9a84c 100%) !important;
      box-shadow: 0 10px 20px rgba(76, 58, 17, 0.18) !important;
    }
    body.user-platform-page .site-header__actions {
      justify-self: end !important;
      justify-content: flex-end !important;
      width: max-content !important;
      margin-left: auto !important;
    }
    body.user-platform-page .site-header__actions .btn,
    body.user-platform-page .site-header__notice-btn {
      text-shadow: none !important;
    }
    body.user-platform-page.home-page .site-header {
      background: transparent !important;
      backdrop-filter: none !important;
      border-bottom: 0 !important;
      box-shadow: none !important;
      transition: background-color 0.22s ease, backdrop-filter 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
    }
    body.user-platform-page.home-page .site-header__nav-link {
      color: rgba(255, 255, 255, 0.98) !important;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.34) !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    body.user-platform-page.home-page .site-header__nav-link.is-active {
      color: #ffffff !important;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.34) !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    body.user-platform-page.home-page .site-header__nav-link:hover:not(.is-active),
    body.user-platform-page.home-page .site-header__nav-link:focus-visible:not(.is-active) {
      color: #7a5a17 !important;
      background: rgba(201, 168, 76, 0.18) !important;
      text-shadow: none !important;
      box-shadow: none !important;
    }
    body.user-platform-page.home-page .site-header__actions .btn,
    body.user-platform-page.home-page .site-header__notice-btn {
      color: #ffffff !important;
      background: transparent !important;
      border-color: rgba(255, 255, 255, 0.18) !important;
      box-shadow: none !important;
    }
    body.user-platform-page.home-page .site-header__actions .btn.btn--primary,
    body.user-platform-page.home-page .site-header__actions .btn.btn--auth.btn--primary {
      background: rgba(201, 168, 76, 0.24) !important;
      color: #ffffff !important;
      border-color: rgba(239, 217, 159, 0.38) !important;
    }
    body.user-platform-page.home-page .site-header__actions .btn.btn--secondary {
      background: rgba(255, 255, 255, 0.12) !important;
      color: #ffffff !important;
      border-color: rgba(255, 255, 255, 0.24) !important;
    }
    body.user-platform-page.home-page .site-header__mobile-toggle span {
      background-color: #fff7e6 !important;
    }
    body.user-platform-page.home-page .site-header:hover,
    body.user-platform-page.home-page .site-header:focus-within,
    body.user-platform-page.home-page .site-header.is-home-revealed,
    body.user-platform-page.home-page .site-header.is-scrolled {
      background: #ffffff !important;
      backdrop-filter: blur(10px) !important;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
      box-shadow: 0 6px 20px rgba(18, 18, 18, 0.08) !important;
    }
    body.user-platform-page.home-page .site-header:hover .site-header__nav-link,
    body.user-platform-page.home-page .site-header:focus-within .site-header__nav-link,
    body.user-platform-page.home-page .site-header.is-home-revealed .site-header__nav-link,
    body.user-platform-page.home-page .site-header.is-scrolled .site-header__nav-link {
      color: #111111 !important;
      text-shadow: none !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    body.user-platform-page.home-page .site-header:hover .site-header__nav-link.is-active,
    body.user-platform-page.home-page .site-header:focus-within .site-header__nav-link.is-active,
    body.user-platform-page.home-page .site-header.is-home-revealed .site-header__nav-link.is-active,
    body.user-platform-page.home-page .site-header.is-scrolled .site-header__nav-link.is-active {
      color: #111111 !important;
      text-shadow: none !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    body.user-platform-page.home-page .site-header:hover .site-header__nav-link:hover:not(.is-active),
    body.user-platform-page.home-page .site-header:hover .site-header__nav-link:focus-visible:not(.is-active),
    body.user-platform-page.home-page .site-header:focus-within .site-header__nav-link:hover:not(.is-active),
    body.user-platform-page.home-page .site-header:focus-within .site-header__nav-link:focus-visible:not(.is-active),
    body.user-platform-page.home-page .site-header.is-home-revealed .site-header__nav-link:hover:not(.is-active),
    body.user-platform-page.home-page .site-header.is-home-revealed .site-header__nav-link:focus-visible:not(.is-active),
    body.user-platform-page.home-page .site-header.is-scrolled .site-header__nav-link:hover:not(.is-active),
    body.user-platform-page.home-page .site-header.is-scrolled .site-header__nav-link:focus-visible:not(.is-active) {
      color: #7a5a17 !important;
      background: rgba(201, 168, 76, 0.12) !important;
      text-shadow: none !important;
      box-shadow: none !important;
    }
    body.user-platform-page.home-page .site-header:hover .site-header__actions .btn,
    body.user-platform-page.home-page .site-header:hover .site-header__notice-btn,
    body.user-platform-page.home-page .site-header:focus-within .site-header__actions .btn,
    body.user-platform-page.home-page .site-header:focus-within .site-header__notice-btn,
    body.user-platform-page.home-page .site-header.is-home-revealed .site-header__actions .btn,
    body.user-platform-page.home-page .site-header.is-home-revealed .site-header__notice-btn,
    body.user-platform-page.home-page .site-header.is-scrolled .site-header__actions .btn,
    body.user-platform-page.home-page .site-header.is-scrolled .site-header__notice-btn {
      color: #111111 !important;
      background: #ffffff !important;
      border-color: rgba(0, 0, 0, 0.12) !important;
      box-shadow: none !important;
    }
    body.user-platform-page.home-page .site-header:hover .site-header__actions .btn.btn--primary,
    body.user-platform-page.home-page .site-header:hover .site-header__actions .btn.btn--auth.btn--primary,
    body.user-platform-page.home-page .site-header:focus-within .site-header__actions .btn.btn--primary,
    body.user-platform-page.home-page .site-header:focus-within .site-header__actions .btn.btn--auth.btn--primary,
    body.user-platform-page.home-page .site-header.is-home-revealed .site-header__actions .btn.btn--primary,
    body.user-platform-page.home-page .site-header.is-home-revealed .site-header__actions .btn.btn--auth.btn--primary,
    body.user-platform-page.home-page .site-header.is-scrolled .site-header__actions .btn.btn--primary,
    body.user-platform-page.home-page .site-header.is-scrolled .site-header__actions .btn.btn--auth.btn--primary {
      color: #ffffff !important;
      background: linear-gradient(135deg, #8b6914 0%, #c9a84c 100%) !important;
      border-color: rgba(139, 105, 20, 0.32) !important;
    }
    body.user-platform-page.home-page .site-header:hover .site-header__actions .btn.btn--secondary,
    body.user-platform-page.home-page .site-header:focus-within .site-header__actions .btn.btn--secondary,
    body.user-platform-page.home-page .site-header.is-home-revealed .site-header__actions .btn.btn--secondary,
    body.user-platform-page.home-page .site-header.is-scrolled .site-header__actions .btn.btn--secondary {
      color: #ffffff !important;
      background: #2d271f !important;
      border-color: #2d271f !important;
    }
    body.user-platform-page.home-page .site-header:hover .site-header__mobile-toggle span,
    body.user-platform-page.home-page .site-header:focus-within .site-header__mobile-toggle span,
    body.user-platform-page.home-page .site-header.is-home-revealed .site-header__mobile-toggle span,
    body.user-platform-page.home-page .site-header.is-scrolled .site-header__mobile-toggle span {
      background-color: #111111 !important;
    }
    @media (min-width: 1181px) {
      body.user-platform-page .site-header__inner {
        display: grid !important;
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        align-items: center !important;
        justify-content: stretch !important;
        position: relative !important;
        padding: 0 clamp(10px, 1.6vw, 24px) !important;
        box-sizing: border-box !important;
      }
      body.user-platform-page .site-header__left-spacer {
        display: none !important;
      }
      body.user-platform-page .site-header__nav {
        grid-column: 1 !important;
        justify-self: start !important;
        justify-content: flex-start !important;
        width: 100% !important;
        max-width: none !important;
        padding-left: var(--header-nav-start) !important;
        overflow-x: auto !important;
      }
      body.user-platform-page .site-header__actions {
        position: static !important;
        transform: none !important;
        grid-column: 2 !important;
        justify-self: end !important;
        justify-content: flex-end !important;
        margin-left: clamp(10px, 1.4vw, 20px) !important;
        width: max-content !important;
      }
    }
    @media (max-width: 1180px) {
      body.user-platform-page .site-header__nav {
        padding-left: 0 !important;
      }
    }
    .site-header__mobile-nav {
      display: none;
      flex-direction: column;
      background-color: var(--color-bg-header);
      border-top: 1px solid var(--color-border-light);
      padding: var(--spacing-md);
      gap: var(--spacing-xs);
      box-shadow: var(--shadow-md);
    }
    .site-header__mobile-nav.is-open {
      display: flex;
    }
    .site-header__mobile-nav-link {
      padding: var(--spacing-md);
      font-size: var(--font-size-base);
      color: var(--color-text-secondary);
      border-radius: var(--border-radius-sm);
      transition: all var(--transition-fast);
      text-decoration: none;
    }
    .site-header__mobile-nav-link:hover,
    .site-header__mobile-nav-link.is-active {
      background-color: var(--color-bg-section);
      color: var(--color-primary);
    }
    .site-header__mobile-nav-actions {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-sm);
      padding-top: var(--spacing-sm);
      border-top: 1px solid var(--color-border-light);
    }
    .site-header.is-scrolled {
      box-shadow: var(--shadow-md);
    }
    .site-header__mobile-toggle.is-open span:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }
    .site-header__mobile-toggle.is-open span:nth-child(2) {
      opacity: 0;
    }
    .site-header__mobile-toggle.is-open span:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }
  @media (min-width: 1181px) {
  .site-header__mobile-nav { display: none !important; }
}
    body.user-platform-page:not(.guest-list-page) .site-header,
    body.user-platform-page:not(.guest-list-page) .site-header *,
    body.user-platform-page:not(.guest-list-page) .site-notification-panel,
    body.user-platform-page:not(.guest-list-page) .site-notification-panel * {
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
})();
