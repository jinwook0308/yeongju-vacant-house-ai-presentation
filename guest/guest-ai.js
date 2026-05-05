/**
 * guest-ai.js
 * 영주시 공공형 빈집 활용 플랫폼 - AI 추천 페이지 스크립트
 * GPT API + 백엔드 추천 API 연동 버전
 */

const API_BASE_URL = typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'http://localhost:8000';
let aiChatHistory = [];

async function handleChatSend() {
  const input = document.getElementById('aiChatInput');
  const messages = document.getElementById('aiChatMessages');
  const text = input.value.trim();

  if (!text) return;

  appendChatMessage(messages, 'user', escapeHtml(text));
  aiChatHistory.push({ role: 'user', content: text });
  input.value = '';

  const loadingEl = appendLoadingMessage(messages);

  try {
    const response = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: aiChatHistory.slice(-8)
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    loadingEl.remove();

    appendChatMessage(messages, 'bot', formatBotText(data.message));
    aiChatHistory.push({ role: 'assistant', content: data.message });

    if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
      appendRecommendationCards(
        messages,
        data.recommendations,
        data.parsedConditions,
        data.knowledgeApplied
      );
    }
  } catch (error) {
    console.error('AI 채팅 요청 실패:', error);
    loadingEl.remove();
    appendChatMessage(
      messages,
      'bot',
      '죄송합니다. 현재 AI 채팅 서버와 연결되지 않았습니다.<br>백엔드가 실행 중인지 확인해주세요.'
    );
  }

  messages.scrollTop = messages.scrollHeight;
}

// HTML onclick에서도 쓰고 싶으면 이 줄 추가
window.handleChatSend = handleChatSend;

document.addEventListener('DOMContentLoaded', function () {
  try {
    if (typeof renderHeader === 'function') renderHeader('ai');
    if (typeof renderFooter === 'function') renderFooter();
  } catch (e) {
    console.error('헤더/푸터 렌더링 오류:', e);
  }

  const sendBtn = document.getElementById('aiChatSendBtn');
  const input = document.getElementById('aiChatInput');

  if (sendBtn) {
    sendBtn.addEventListener('click', handleChatSend);
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleChatSend();
      }
    });
  }
});

/**
 * 분위기 선택 버튼을 설정합니다.
 */
function setupMoodButtons() {
  document.querySelectorAll('.ai-mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mood = btn.dataset.mood;
      if (btn.classList.contains('is-selected')) {
        btn.classList.remove('is-selected');
        selectedMoods = selectedMoods.filter(m => m !== mood);
      } else {
        btn.classList.add('is-selected');
        selectedMoods.push(mood);
      }
    });
  });
}

/**
 * AI 추천 로직을 실행합니다.
 * 실제 서비스에서는 Python 백엔드 API를 호출합니다.
 */
function runAiRecommendation() {
  const district = document.getElementById('aiDistrict').value;
  const capacity = parseInt(document.getElementById('aiCapacity').value);
  const stayDuration = document.getElementById('aiStayDuration').value;
  const budget = document.getElementById('aiBudget').value;

  // 로딩 표시
  document.getElementById('aiResultIntro').style.display = 'none';
  document.getElementById('aiResultContent').style.display = 'none';
  document.getElementById('aiResultLoading').style.display = 'flex';

  // 추천 처리 (데모: 1.5초 지연 후 결과)
  setTimeout(() => {
    const recommendations = computeAiRecommendations({ district, capacity, stayDuration, budget, moods: selectedMoods });
    displayAiRecommendations(recommendations, { district, capacity, stayDuration, budget });
  }, 1500);
}

/**
 * 조건에 따라 추천 빈집을 계산합니다.
 * @param {Object} conditions - 추천 조건
 * @returns {Array} 추천 빈집 목록 (점수 포함)
 */
function computeAiRecommendations(conditions) {
  // 승인된 빈집만 대상
  const approvedHouses = VACANT_HOUSE_LIST.filter(h => h.isApproved);

  const scored = approvedHouses.map(house => {
    let score = 0;
    const reasons = [];

    // 지역 일치
    if (conditions.district && house.districtId === conditions.district) {
      score += 30;
      reasons.push('희망 지역 일치');
    } else if (!conditions.district) {
      score += 10;
    }

    // 수용 인원
    if (house.maxCapacity >= conditions.capacity) {
      score += 20;
      reasons.push(`${conditions.capacity}명 수용 가능`);
    }

    // 체류 기간 - 운영 유형 매핑
    if (conditions.stayDuration === 'long' && house.operationType === 'longterm') {
      score += 25;
      reasons.push('장기체류형 적합');
    } else if (conditions.stayDuration === 'short' && house.operationType === 'lodging') {
      score += 20;
      reasons.push('단기 숙박 적합');
    } else if (conditions.stayDuration === 'medium') {
      score += 10;
    }

    // 분위기 매핑
    if (conditions.moods.includes('nature') && house.tags.some(t => ['자연', '산촌', '농촌'].includes(t))) {
      score += 15;
      reasons.push('자연 환경 적합');
    }
    if (conditions.moods.includes('family') && house.tags.some(t => ['가족', '한옥'].includes(t))) {
      score += 15;
      reasons.push('가족 여행 적합');
    }
    if (conditions.moods.includes('experience') && house.operationType === 'experience') {
      score += 20;
      reasons.push('체험 공간 적합');
    }
    if (conditions.moods.includes('farming') && house.tags.some(t => ['농촌', '귀농', '사과'].includes(t))) {
      score += 20;
      reasons.push('귀농 체험 적합');
    }
    if (conditions.moods.includes('hiking') && house.tags.some(t => ['등산', '소백산'].includes(t))) {
      score += 20;
      reasons.push('등산·트레킹 적합');
    }

    // 상태 등급 A 보너스
    if (house.conditionGrade === 'A') {
      score += 10;
      reasons.push('A등급 (즉시 활용)');
    }

    return { house, score, reasons };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}


function appendLoadingMessage(container) {
  const msg = document.createElement('div');
  msg.className = 'ai-chat-msg ai-chat-msg--bot';
  msg.innerHTML = `
    <div class="ai-chat-msg__avatar"><img src="../assets/images/yeongju_mas.jpg" alt="영주도령 프로필"></div>
    <div class="ai-chat-msg__content">
      <div class="ai-chat-msg__name">AI 추천 도우미</div>
      <div class="ai-chat-msg__bubble">
        추천 조건을 분석하고 있습니다
        <span class="ai-chat-loading" aria-hidden="true"><span></span><span></span><span></span></span>
      </div>
    </div>
  `;
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

function appendChatMessage(container, role, html) {
  const msg = document.createElement('div');
  msg.className = `ai-chat-msg ai-chat-msg--${role}`;

  if (role === 'user') {
    msg.innerHTML = `
      <div class="ai-chat-msg__content">
        <div class="ai-chat-msg__name">나</div>
        <div class="ai-chat-msg__bubble">${html}</div>
      </div>
    `;
  } else {
    msg.innerHTML = `
      <div class="ai-chat-msg__avatar"><img src="../assets/images/yeongju_mas.jpg" alt="영주도령 프로필"></div>
      <div class="ai-chat-msg__content">
        <div class="ai-chat-msg__name">AI 추천 도우미</div>
        <div class="ai-chat-msg__bubble">${html}</div>
      </div>
    `;
  }
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function appendRecommendationCards(container, recommendations, parsedConditions, knowledgeApplied) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-chat-msg ai-chat-msg--bot';

  const parsedSummary = buildParsedSummary(parsedConditions);
  const cardsHtml = recommendations.map((item, idx) => {
    const house = item.house;
    return `
      <a href="guest-detail.html?id=${house.id}" class="ai-result-card" style="display:flex;text-decoration:none;color:inherit;margin-top:12px;">
        <div class="ai-result-card__rank">${idx + 1}</div>
        <div class="ai-result-card__emoji">${getHouseEmoji(house.operationType)}</div>
        <div class="ai-result-card__info">
          <div class="ai-result-card__name">${escapeHtml(house.name)}</div>
          <div class="ai-result-card__location">📍 영주시 ${escapeHtml(house.districtName)} · 최대 ${house.maxCapacity}명</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;margin:6px 0;">
            ${getConditionGradeBadge(house.conditionGrade)}
            ${getOperationTypeBadge(house.operationType)}
          </div>
          <div class="ai-result-card__match">✓ 추천 이유: ${item.reasons.map(escapeHtml).join(' · ')}</div>
          <div style="margin-top:8px;font-size:var(--font-size-xs);color:var(--color-text-secondary);line-height:1.7;">
            <div><strong>공공데이터 반영</strong> : ${escapeHtml(getPublicDataSummary(house))}</div>
            <div><strong>주의사항</strong> : ${escapeHtml(getGradeCautionText(house.conditionGrade))}</div>
          </div>
        </div>
        <div style="font-size:var(--font-size-sm);font-weight:700;color:var(--color-primary);flex-shrink:0;">${escapeHtml(house.priceRange)}</div>
      </a>
    `;
  }).join('');

  wrapper.innerHTML = `
    <div class="ai-chat-msg__avatar"><img src="../assets/images/yeongju_mas.jpg" alt="영주도령 프로필"></div>
    <div class="ai-chat-msg__content" style="max-width:min(92%,980px);">
      <div class="ai-chat-msg__name">AI 추천 도우미</div>
      <div class="ai-chat-msg__bubble" style="width:100%;max-width:100%;">
        <div style="font-weight:700;margin-bottom:8px;">추천 후보 ${recommendations.length}개</div>
        <div style="font-size:var(--font-size-sm);color:var(--color-text-muted);margin-bottom:8px;">${parsedSummary}</div>
        ${knowledgeApplied ? '<div style="font-size:var(--font-size-xs);color:var(--color-primary);margin-bottom:8px;">지식 파일 반영됨</div>' : ''}
        ${cardsHtml}
      </div>
    </div>
  `;

  container.appendChild(wrapper);
  container.scrollTop = container.scrollHeight;
}

function buildParsedSummary(parsedConditions = {}) {
  const parts = [];
  if (parsedConditions.districtName) parts.push(`지역: ${parsedConditions.districtName}`);
  if (parsedConditions.capacity) parts.push(`인원: ${parsedConditions.capacity}명`);
  if (parsedConditions.stayDuration) {
    const map = { short: '단기', medium: '중기', long: '장기' };
    parts.push(`체류: ${map[parsedConditions.stayDuration] || parsedConditions.stayDuration}`);
  }
  if (Array.isArray(parsedConditions.moods) && parsedConditions.moods.length > 0) {
    parts.push(`분위기: ${parsedConditions.moods.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '질문 내용을 기준으로 조건을 자동 해석했습니다.';
}

function getPublicDataSummary(house) {
  const rawStatus = house.status ? `원문 상태 '${house.status}'` : '원문 상태 정보 없음';
  return `${rawStatus}, ${getConditionGradeText(house.conditionGrade)} 반영`;
}

function getHouseEmoji(operationType) {
  return {
    lodging: '🏠',
    longterm: '📅',
    experience: '🌿',
    review_needed: '🔍',
  }[operationType] || '🏠';
}

function formatBotText(text) {
  return escapeHtml(text).replace(/\n/g, '<br>');
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
