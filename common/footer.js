/**
 * footer.js
 * 영주시 공공형 빈집 활용 플랫폼 - 공통 푸터 렌더링
 * 모든 페이지에서 동적으로 푸터를 삽입합니다.
 */

/**
 * 사이트 푸터 HTML을 생성하여 삽입합니다.
 */
function renderFooter() {
  // 중복 실행 시 푸터가 두 번 붙는 것을 방지
  if (document.getElementById('siteFooter')) {
    return;
  }

  const root = getRootPath();

  const footerHtml = `
    <footer class="site-footer" id="siteFooter">
      <div class="site-footer__inner">
        <div class="site-footer__grid">
          <!-- 브랜드 소개 -->
          <div class="site-footer__brand">
            <div class="site-footer__brand-title">영주 빈집 플랫폼</div>
            <p class="site-footer__brand-desc">영주시 내 방치된 빈집을 공공기관 검토와 지역 연계를 통해<br>활용 가능한 공간으로 전환하고, 영주시민·방문자·소유자·공공기관<br>지역 관리업체를 연결하는 영주시 전용 공공형 플랫폼입니다.</p>
            <div style="margin-top: 16px;">
              <span class="site-footer__badge">🏆 영주시 공공데이터 활용 대회</span>
            </div>
          </div>

          <!-- 서비스 링크 -->
          <div>
            <div class="site-footer__col-title">서비스</div>
            <div class="site-footer__col-links">
              <a href="${root}guest/guest-list.html" class="site-footer__col-link">승인된 빈집 목록</a>
              <a href="${root}guest/guest-ai.html" class="site-footer__col-link">AI 빈집 추천</a>
              <a href="${root}owner/owner-register.html" class="site-footer__col-link">빈집 등록 신청</a>
              <a href="${root}vendor/vendor-list.html" class="site-footer__col-link">협력업체 안내</a>
            </div>
          </div>

          <!-- 이용 안내 -->
          <div>
            <div class="site-footer__col-title">이용 안내</div>
            <div class="site-footer__col-links">
              <a href="${root}auth/login.html" class="site-footer__col-link">로그인</a>
              <a href="${root}auth/signup.html" class="site-footer__col-link">회원가입</a>
              <a href="${root}guest/guest-mypage.html" class="site-footer__col-link">마이페이지</a>
              <a href="#" class="site-footer__col-link">이용약관</a>
              <a href="#" class="site-footer__col-link">개인정보처리방침</a>
            </div>
          </div>

          <!-- 공공기관 -->
          <div>
            <div class="site-footer__col-title">공공기관</div>
            <div class="site-footer__col-links">
              <a href="${root}admin/admin-dashboard.html" class="site-footer__col-link">관리자 대시보드</a>
              <a href="#" class="site-footer__col-link">영주시청 공식 홈페이지</a>
              <a href="${root}home/index.html#dataBasisNotice" class="site-footer__col-link">데이터 기준 안내</a>
              <a href="${root}home/index.html#dataBasisNotice" class="site-footer__col-link">공공데이터 활용 기준</a>
              <a href="${root}legal/legal-info.html" class="site-footer__col-link">빈집 관련 법령 안내</a>
            </div>
          </div>
        </div>

        <!-- 하단 정보 -->
        <div class="site-footer__bottom">
          <div class="site-footer__copyright">
            <span class="site-footer__copyright-line">© 2025 영주시 공공형 빈집 활용 플랫폼. 본 서비스는 영주시 공공데이터 활용 대회 제출용입니다.</span>
            <span class="site-footer__copyright-line">주소: 경상북도 영주시 구성로 221 영주시청 | 문의: 054-639-6000</span>
          </div>
          <div class="site-footer__meta">
            <span class="site-footer__badge">📍 영주시 한정 서비스</span>
            <span class="site-footer__badge">🏛️ 공공기관 검토 기반</span>
          </div>
        </div>
      </div>
    </footer>
  `;

  // 푸터 삽입
  const footerPlaceholder = document.getElementById('footerPlaceholder');
  if (footerPlaceholder) {
    footerPlaceholder.outerHTML = footerHtml;
  } else {
    document.body.insertAdjacentHTML('beforeend', footerHtml);
  }
}

/**
 * 플로팅 액션 버튼들을 초기화합니다.
 * 모든 페이지에서 사용됩니다.
 */
function initFloatingActions() {
  const root = getRootPath();
  const floatingActionsHtml = `
    <div class="floating-actions">
      <!-- AI 상담 버튼 -->
      <a href="${root}guest/guest-ai.html" class="floating-ai-link" aria-label="AI 상담">
        <span class="floating-btn floating-btn--ai">
          <img src="${root}assets/images/yeongju_mas.jpg" alt="도령이 마스코트" class="floating-btn__img">
        </span>
        <span class="floating-ai-link__label">AI 상담</span>
      </a>
      
      <!-- 맨 위로 이동 버튼 -->
      <button class="floating-btn floating-btn--top" id="scrollTopBtn" title="맨 위로 이동" aria-label="페이지 맨 위로">
        <span class="floating-btn__label">TOP</span>
      </button>
    </div>
  `;

  // 플로팅 액션 요소 삽입
  if (!document.querySelector('.floating-actions')) {
    document.body.insertAdjacentHTML('beforeend', floatingActionsHtml);
  }

  // 맨 위로 버튼 이벤트 등록
  const scrollTopBtn = document.getElementById('scrollTopBtn');
  if (scrollTopBtn) {
    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });

    // 스크롤 위치에 따라 맨 위로 버튼 표시/숨김
    const updateScrollTopButtonVisibility = () => {
      if (window.scrollY > 300) {
        scrollTopBtn.classList.add('is-visible');
      } else {
        scrollTopBtn.classList.remove('is-visible');
      }
    };

    window.addEventListener('scroll', updateScrollTopButtonVisibility);
    updateScrollTopButtonVisibility(); // 초기 상태 설정
  }
}

// 페이지 로드 완료 후 푸터와 플로팅 액션 초기화
document.addEventListener('DOMContentLoaded', () => {
  renderFooter();
  initFloatingActions();
});
