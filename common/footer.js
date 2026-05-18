/**
 * footer.js
 * 영주시 공공형 빈집 플랫폼 공통 푸터 및 플로팅 AI 채팅창
 */

let aiChatCoreLoaderPromise = null;

function renderFooter() {
  if (document.getElementById('siteFooter')) {
    return;
  }

  const root = getRootPath();
  const footerHtml = `
    <footer class="site-footer" id="siteFooter">
      <div class="site-footer__inner">
        <div class="site-footer__grid">
          <div class="site-footer__brand">
            <div class="site-footer__brand-title">영주 빈집 플랫폼</div>
            <p class="site-footer__brand-desc">
              영주시의 방치된 빈집을 공공기관 검토와 지역 연계 체계로 다시 연결하는
              영주시 전용 공공데이터 기반 플랫폼입니다.
              빈집 등록, 이용 추천, 협력업체 연결, 법적 안내를 한곳에서 확인할 수 있도록 구성했습니다.
            </p>
            <div style="margin-top: 16px;">
              <span class="site-footer__badge">영주시 공공데이터 활용 대회</span>
            </div>
          </div>

          <div>
            <div class="site-footer__col-title">서비스</div>
            <div class="site-footer__col-links">
              <a href="${root}guest/guest-list.html" class="site-footer__col-link">승인 빈집 목록</a>
              <a href="${root}guest/guest-ai.html" class="site-footer__col-link">AI 빈집 추천</a>
              <a href="${root}owner/owner-register.html" class="site-footer__col-link">빈집 등록 신청</a>
              <a href="${root}vendor/vendor-list.html" class="site-footer__col-link">협력업체 안내</a>
            </div>
          </div>

          <div>
            <div class="site-footer__col-title">이용 안내</div>
            <div class="site-footer__col-links">
              <a href="${root}auth/login.html" class="site-footer__col-link">로그인</a>
              <a href="${root}auth/signup.html" class="site-footer__col-link">회원가입</a>
              <a href="${root}guest/guest-mypage.html" class="site-footer__col-link">마이페이지</a>
              <a href="${root}community/community.html" class="site-footer__col-link">커뮤니티</a>
              <a href="${root}legal/legal-info.html" class="site-footer__col-link">법적 정보 안내</a>
            </div>
          </div>

          <div>
            <div class="site-footer__col-title">공공기관</div>
            <div class="site-footer__col-links">
              <a href="${root}admin/admin-dashboard.html" class="site-footer__col-link">관리자 대시보드</a>
              <a href="${root}home/index.html#dataBasisNotice" class="site-footer__col-link">공공데이터 활용 근거</a>
              <a href="${root}home/index.html#dataBasisNotice" class="site-footer__col-link">영주시 데이터 안내</a>
              <a href="${root}guest/guest-map.html" class="site-footer__col-link">지도 기반 확인</a>
            </div>
          </div>
        </div>

        <div class="site-footer__bottom">
          <div class="site-footer__copyright">
            <span class="site-footer__copyright-line">© 2025 영주 빈집 플랫폼 · 영주시 공공데이터 활용 대회 제출용 서비스</span>
            <span class="site-footer__copyright-line">주소: 경상북도 영주시 시청로 1 | 문의: 054-639-6000</span>
          </div>
          <div class="site-footer__meta">
            <span class="site-footer__badge">영주시 전용 서비스</span>
            <span class="site-footer__badge">공공기관 검토 기반</span>
          </div>
        </div>
      </div>
    </footer>
  `;

  const footerPlaceholder = document.getElementById('footerPlaceholder');
  if (footerPlaceholder) {
    footerPlaceholder.outerHTML = footerHtml;
  } else {
    document.body.insertAdjacentHTML('beforeend', footerHtml);
  }
}

function ensureStylesheet(id, href) {
  if (document.getElementById(id)) {
    return;
  }

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

function ensureFloatingChatStyles(root) {
  ensureStylesheet('floatingActionsStylesheet', `${root}common/floating-actions.css?v=4`);
  ensureStylesheet('guestAiChatStylesheet', `${root}guest/guest-ai.css?v=9`);
}

function ensureAiChatCore(root) {
  if (window.YeongjuAiChatCore) {
    return Promise.resolve(window.YeongjuAiChatCore);
  }

  if (aiChatCoreLoaderPromise) {
    return aiChatCoreLoaderPromise;
  }

  aiChatCoreLoaderPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${root}common/ai-chat-core.js?v=1`;
    script.async = true;
    script.onload = () => {
      if (window.YeongjuAiChatCore) {
        resolve(window.YeongjuAiChatCore);
        return;
      }
      reject(new Error('AI chat core loaded without global export.'));
    };
    script.onerror = () => reject(new Error('Failed to load AI chat core.'));
    document.body.appendChild(script);
  });

  return aiChatCoreLoaderPromise;
}

function formatFloatingAiPanelDate() {
  const now = new Date();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${now.getMonth() + 1}월 ${now.getDate()}일 (${weekdays[now.getDay()]})`;
}

function buildFloatingChatMarkup() {
  return `
    <section class="floating-chat-shell" id="floatingChatRoot" aria-label="AI 채팅">
      <div class="guest-ai-chat__messages floating-chat-shell__messages" data-ai-chat-messages aria-live="polite"></div>

      <div class="guest-ai-chat__composer floating-chat-shell__composer">
        <label class="guest-ai-chat__input-wrap floating-chat-shell__input-wrap" for="floatingAiChatInput">
          <textarea
            id="floatingAiChatInput"
            data-ai-chat-input
            class="guest-ai-chat__input floating-chat-shell__input"
            rows="1"
            placeholder="무엇이든 물어보세요"
          ></textarea>
        </label>
        <button type="button" class="guest-ai-chat__send floating-chat-shell__send" data-ai-chat-send>보내기</button>
      </div>

      <p class="guest-ai-chat__status floating-chat-shell__status" data-ai-chat-status></p>
    </section>
  `;
}

function initFloatingActions() {
  if (document.querySelector('.floating-actions')) {
    return;
  }

  const root = getRootPath();
  const isFullAiPage = document.body.classList.contains('guest-ai-page');
  const aiPageUrl = `${root}guest/guest-ai.html`;

  ensureFloatingChatStyles(root);

  const floatingActionsHtml = `
    <div class="floating-actions floating-actions--panel">
      ${isFullAiPage ? '' : `
        <div class="floating-ai-panel" id="floatingAiPanel" hidden aria-hidden="true">
          <div class="floating-ai-panel__card" role="dialog" aria-modal="false" aria-labelledby="floatingAiPanelTitle">
            <header class="floating-ai-panel__header">
              <div class="floating-ai-panel__header-copy">
                <strong class="floating-ai-panel__title" id="floatingAiPanelTitle">영주시 빈집 AI 도우미</strong>
                <p class="floating-ai-panel__subtitle">영주시 빈집 활용 조건을 바로 물어보세요</p>
              </div>
              <div class="floating-ai-panel__controls">
                <button type="button" class="floating-ai-panel__icon" id="floatingAiOpenPageBtn" aria-label="AI 추천 페이지로 이동">↗</button>
                <button type="button" class="floating-ai-panel__icon" id="floatingAiCloseBtn" aria-label="AI 채팅창 닫기">×</button>
              </div>
            </header>

            <div class="floating-ai-panel__body">
              <section class="floating-ai-panel__intro" id="floatingAiIntro">
                <p class="floating-ai-panel__date">${formatFloatingAiPanelDate()}</p>
                <div class="floating-ai-panel__actions">
                  <button type="button" class="floating-ai-panel__primary" id="floatingAiInlineBtn">여기서 바로 시작</button>
                  <a href="${aiPageUrl}" class="floating-ai-panel__secondary" id="floatingAiPageBtn">AI 추천 페이지로 가기</a>
                </div>
              </section>

              <section class="floating-ai-panel__chat" id="floatingAiChat" hidden>
                ${buildFloatingChatMarkup()}
              </section>
            </div>
          </div>
        </div>

        <button
          type="button"
          class="floating-ai-link floating-ai-link--toggle"
          id="floatingAiToggleBtn"
          aria-label="AI 채팅 열기"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="floatingAiPanel"
        >
          <span class="floating-btn floating-btn--ai">
            <img src="${root}assets/images/yeongju_mas.jpg" alt="영주시 AI 도우미" class="floating-btn__img">
          </span>
          <span class="floating-ai-link__label">AI 상담</span>
        </button>
      `}

      <button class="floating-btn floating-btn--top" id="scrollTopBtn" title="맨 위로 이동" aria-label="페이지 맨 위로">
        <span class="floating-btn__label">TOP</span>
      </button>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', floatingActionsHtml);

  const floatingAiPanel = document.getElementById('floatingAiPanel');
  const floatingAiToggleBtn = document.getElementById('floatingAiToggleBtn');
  const floatingAiCloseBtn = document.getElementById('floatingAiCloseBtn');
  const floatingAiInlineBtn = document.getElementById('floatingAiInlineBtn');
  const floatingAiOpenPageBtn = document.getElementById('floatingAiOpenPageBtn');
  const floatingAiIntro = document.getElementById('floatingAiIntro');
  const floatingAiChat = document.getElementById('floatingAiChat');
  const scrollTopBtn = document.getElementById('scrollTopBtn');

  let chatInstance = null;

  function resetChatMount() {
    if (!floatingAiChat) {
      return null;
    }

    floatingAiChat.innerHTML = buildFloatingChatMarkup();
    return document.getElementById('floatingChatRoot');
  }

  function getFloatingChatRoot() {
    return document.getElementById('floatingChatRoot');
  }

  function showIntroScreen() {
    if (!floatingAiPanel || !floatingAiIntro || !floatingAiChat) return;
    floatingAiPanel.classList.remove('is-chat-mode');
    floatingAiIntro.hidden = false;
    floatingAiChat.hidden = true;
  }

  function showChatScreen() {
    if (!floatingAiPanel || !floatingAiIntro || !floatingAiChat) return;
    floatingAiPanel.classList.add('is-chat-mode');
    floatingAiIntro.hidden = true;
    floatingAiChat.hidden = false;
  }

  function openFloatingAiPanel() {
    if (!floatingAiPanel || !floatingAiToggleBtn) return;
    floatingAiPanel.hidden = false;
    floatingAiPanel.setAttribute('aria-hidden', 'false');
    floatingAiToggleBtn.setAttribute('aria-expanded', 'true');
  }

  function closeFloatingAiPanel() {
    if (!floatingAiPanel || !floatingAiToggleBtn) return;

    if (chatInstance && !chatInstance.isPersistentUser()) {
      chatInstance.destroy();
      chatInstance = null;
      resetChatMount();
    }

    showIntroScreen();
    floatingAiPanel.hidden = true;
    floatingAiPanel.setAttribute('aria-hidden', 'true');
    floatingAiToggleBtn.setAttribute('aria-expanded', 'false');
  }

  async function mountFloatingChat() {
    if (!floatingAiPanel) return;

    try {
      const core = await ensureAiChatCore(root);
      let chatRoot = getFloatingChatRoot();

      if (!chatRoot) {
        chatRoot = resetChatMount();
      }

      if (!chatInstance && chatRoot) {
        chatInstance = core.create({
          rootElement: chatRoot,
          rootPath: root,
          recommendationTarget: '_blank',
          openLinksInNewTab: true,
          welcomeMessage: '안녕하세요. 영주시 공공형 빈집 AI 추천 도우미입니다. 찾으시는 조건을 편하게 말씀해 주세요.',
          initialPrompt: '예: "풍기읍, 4명, 2박, 조용한 자연 분위기"',
        });
      } else if (chatInstance) {
        if (chatInstance.isPersistentUser()) {
          chatInstance.restoreConversation();
        } else {
          chatInstance.resetConversation();
        }
      }

      showChatScreen();
      openFloatingAiPanel();

      if (chatInstance) {
        chatInstance.focusInput();
      }
    } catch (error) {
      console.error('AI 채팅 코어를 불러오지 못했습니다.', error);
    }
  }

  if (floatingAiToggleBtn) {
    floatingAiToggleBtn.addEventListener('click', () => {
      if (floatingAiPanel && !floatingAiPanel.hidden) {
        closeFloatingAiPanel();
        return;
      }

      showIntroScreen();
      openFloatingAiPanel();
    });
  }

  if (floatingAiCloseBtn) {
    floatingAiCloseBtn.addEventListener('click', closeFloatingAiPanel);
  }

  if (floatingAiInlineBtn) {
    floatingAiInlineBtn.addEventListener('click', mountFloatingChat);
  }

  if (floatingAiOpenPageBtn) {
    floatingAiOpenPageBtn.addEventListener('click', () => {
      window.location.href = aiPageUrl;
    });
  }

  if (floatingAiPanel) {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !floatingAiPanel.hidden) {
        closeFloatingAiPanel();
      }
    });

    window.addEventListener('yeongju:auth-changed', () => {
      if (chatInstance && chatInstance.isPersistentUser()) {
        chatInstance.restoreConversation();
      }

      if (!chatInstance) {
        return;
      }

      if (!chatInstance.isPersistentUser()) {
        chatInstance.resetConversation();
      }
    });
  }

  if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    });

    const updateScrollTopButtonVisibility = () => {
      if (window.scrollY > 300) {
        scrollTopBtn.classList.add('is-visible');
      } else {
        scrollTopBtn.classList.remove('is-visible');
      }
    };

    window.addEventListener('scroll', updateScrollTopButtonVisibility);
    updateScrollTopButtonVisibility();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  renderFooter();
  initFloatingActions();
});
