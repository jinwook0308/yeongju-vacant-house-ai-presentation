/**
 * footer.js
 * 영주시 공공형 빈집 플랫폼 공통 푸터 및 플로팅 액션
 */

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
              영주시 안의 빈집을 공공기관 검토와 지역 협력 체계로 다시 연결하는 영주 전용 공공데이터 기반 플랫폼입니다.
              빈집 등록, 활용 추천, 협력업체 연결, 법적 안내를 한 흐름에서 확인할 수 있도록 구성했습니다.
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
            <span class="site-footer__copyright-line">© 2025 영주시 공공형 빈집 플랫폼. 영주시 공공데이터 활용 대회 제출용 서비스입니다.</span>
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

function isEmbeddedAiMode() {
  try {
    return new URLSearchParams(window.location.search).get('embed') === '1';
  } catch (error) {
    return false;
  }
}

function formatFloatingAiPanelDate() {
  const now = new Date();
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${now.getMonth() + 1}월 ${now.getDate()}일 (${weekdays[now.getDay()]})`;
}

function initFloatingActions() {
  if (document.querySelector('.floating-actions')) {
    return;
  }

  const root = getRootPath();
  const aiPageUrl = `${root}guest/guest-ai.html`;
  const isFullAiPage = document.body.classList.contains('guest-ai-page') && !isEmbeddedAiMode();

  const floatingActionsHtml = `
    <div class="floating-actions floating-actions--panel">
      ${isFullAiPage ? '' : `
      <div class="floating-ai-panel" id="floatingAiPanel" hidden aria-hidden="true">
        <div class="floating-ai-panel__card" role="dialog" aria-modal="false" aria-labelledby="floatingAiPanelTitle">
          <div class="floating-ai-panel__header">
            <div class="floating-ai-panel__header-copy">
              <span class="floating-ai-panel__eyebrow">영주시 빈집 AI 도우미</span>
              <strong class="floating-ai-panel__title" id="floatingAiPanelTitle">영주시 빈집 활용 조건을 바로 물어보세요</strong>
            </div>
            <div class="floating-ai-panel__controls">
              <button type="button" class="floating-ai-panel__icon" id="floatingAiOpenPageBtn" aria-label="AI 추천 페이지 열기">↗</button>
              <button type="button" class="floating-ai-panel__icon" id="floatingAiCloseBtn" aria-label="AI 채팅창 닫기">×</button>
            </div>
          </div>

          <div class="floating-ai-panel__body">
            <section class="floating-ai-panel__intro" id="floatingAiIntro">
              <p class="floating-ai-panel__date">${formatFloatingAiPanelDate()}</p>
              <h3 class="floating-ai-panel__headline">작은 채팅창에서 바로 묻고,<br>필요하면 전체 AI 추천 페이지로 이어갈 수 있어요</h3>
              <p class="floating-ai-panel__copy">
                희망 지역, 인원, 체류 기간, 활용 목적을 남기면 영주시 기준 빈집 추천과 행정 안내를 도와드립니다.
              </p>
              <div class="floating-ai-panel__actions">
                <button type="button" class="floating-ai-panel__primary" id="floatingAiInlineBtn">여기서 바로 시작</button>
                <a href="${aiPageUrl}" class="floating-ai-panel__secondary">AI 추천 페이지로 가기</a>
              </div>
              <p class="floating-ai-panel__hint">같은 계정으로 사용하면 이 채팅창과 AI 페이지의 대화 기록이 이어집니다.</p>
            </section>

            <section class="floating-ai-panel__chat" id="floatingAiChat" hidden>
              <iframe
                id="floatingAiIframe"
                class="floating-ai-panel__iframe"
                title="영주시 빈집 AI 바로 상담"
                loading="lazy"
                src=""
              ></iframe>
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
          <img src="${root}assets/images/yeongju_mas.jpg" alt="영주 AI 도우미" class="floating-btn__img">
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
  const floatingAiIframe = document.getElementById('floatingAiIframe');
  const scrollTopBtn = document.getElementById('scrollTopBtn');
  let floatingAiChatInitialized = false;

  const openFloatingAiPanel = () => {
    if (!floatingAiPanel || !floatingAiToggleBtn) return;
    floatingAiPanel.hidden = false;
    floatingAiPanel.setAttribute('aria-hidden', 'false');
    floatingAiToggleBtn.setAttribute('aria-expanded', 'true');
  };

  const closeFloatingAiPanel = () => {
    if (!floatingAiPanel || !floatingAiToggleBtn) return;
    floatingAiPanel.hidden = true;
    floatingAiPanel.setAttribute('aria-hidden', 'true');
    floatingAiToggleBtn.setAttribute('aria-expanded', 'false');
  };

  const showFloatingAiIntro = () => {
    if (!floatingAiPanel || !floatingAiIntro || !floatingAiChat) return;
    floatingAiPanel.classList.remove('is-chat-mode');
    floatingAiIntro.hidden = false;
    floatingAiChat.hidden = true;
  };

  const showFloatingAiChat = () => {
    if (!floatingAiPanel || !floatingAiIntro || !floatingAiChat || !floatingAiIframe) return;

    if (!floatingAiChatInitialized || !floatingAiIframe.src) {
      floatingAiIframe.src = `${aiPageUrl}?embed=1`;
      floatingAiChatInitialized = true;
    }

    floatingAiPanel.classList.add('is-chat-mode');
    floatingAiIntro.hidden = true;
    floatingAiChat.hidden = false;
    openFloatingAiPanel();
  };

  if (floatingAiToggleBtn) {
    floatingAiToggleBtn.addEventListener('click', () => {
      if (floatingAiPanel && !floatingAiPanel.hidden) {
        closeFloatingAiPanel();
        return;
      }

      openFloatingAiPanel();
      if (!floatingAiPanel.classList.contains('is-chat-mode')) {
        showFloatingAiIntro();
      }
    });
  }

  if (floatingAiCloseBtn) {
    floatingAiCloseBtn.addEventListener('click', closeFloatingAiPanel);
  }

  if (floatingAiInlineBtn) {
    floatingAiInlineBtn.addEventListener('click', showFloatingAiChat);
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

    document.addEventListener('click', (event) => {
      if (floatingAiPanel.hidden) return;
      if (!event.target.closest('.floating-actions')) {
        closeFloatingAiPanel();
      }
    });

    window.addEventListener('yeongju:auth-changed', () => {
      if (!floatingAiIframe || !floatingAiChatInitialized) return;
      const currentSrc = floatingAiIframe.getAttribute('src');
      if (currentSrc) {
        floatingAiIframe.setAttribute('src', currentSrc);
      }
    });
  }

  if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
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
  if (isEmbeddedAiMode()) {
    return;
  }

  renderFooter();
  initFloatingActions();
});
