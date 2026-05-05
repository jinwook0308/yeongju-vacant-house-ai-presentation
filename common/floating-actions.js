/**
 * floating-actions.js
 * 영주시 공공형 빈집 활용 플랫폼 - 플로팅 액션 버튼 UI
 * AI 상담 및 맨 위로 이동 버튼
 */

/**
 * 플로팅 액션 버튼들을 초기화합니다.
 * 이 함수는 페이지 로드 후 자동으로 호출됩니다.
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

// 페이지 로드 완료 후 플로팅 액션 초기화
document.addEventListener('DOMContentLoaded', initFloatingActions);
