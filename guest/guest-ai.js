const API_BASE_URL = typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : 'http://localhost:8000';
const AI_CHAT_STORAGE_KEY = 'yeongjuAiChatHistory';
const AI_CHAT_STORAGE_KEY_PREFIX = 'yeongjuAiChatHistory:';
const AI_CHAT_ANONYMOUS_STORAGE_KEY = `${AI_CHAT_STORAGE_KEY_PREFIX}anonymous`;
const AI_CHAT_HISTORY_LIMIT = 20;
const AI_API_HISTORY_LIMIT = 8;
const AI_CHAT_IS_EMBEDDED = (() => {
  try {
    return new URLSearchParams(window.location.search).get('embed') === '1';
  } catch (error) {
    return false;
  }
})();

let aiChatHistory = [];
let aiChatDisplayHistory = [];

function getAiChatStorageKey() {
  const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;

  if (typeof buildUserScopedStorageId === 'function') {
    const scopedId = buildUserScopedStorageId(currentUser);
    if (scopedId) {
      return `${AI_CHAT_STORAGE_KEY_PREFIX}${scopedId}`;
    }
  }

  if (currentUser && typeof currentUser === 'object') {
    const role = String(currentUser.role || 'guest').trim().toLowerCase();
    const rawIdentifier = currentUser.id || currentUser.email || currentUser.username || currentUser.name;
    if (rawIdentifier) {
      return `${AI_CHAT_STORAGE_KEY_PREFIX}${encodeURIComponent(`${role}:${String(rawIdentifier).trim().toLowerCase()}`)}`;
    }
  }

  return AI_CHAT_ANONYMOUS_STORAGE_KEY;
}

function clearRenderedAiChatHistory(container) {
  if (!container) return;

  const renderedMessages = container.querySelectorAll('.ai-chat-msg');
  renderedMessages.forEach((messageEl, index) => {
    if (index === 0) return;
    messageEl.remove();
  });
}

function syncAiApiHistory() {
  aiChatHistory = aiChatDisplayHistory
    .filter((entry) => entry && (entry.kind === 'user' || entry.kind === 'bot'))
    .map((entry) => ({
      role: entry.kind === 'user' ? 'user' : 'assistant',
      content: entry.message || '',
    }));
}

function saveAiChatHistory() {
  try {
    localStorage.setItem(getAiChatStorageKey(), JSON.stringify(aiChatDisplayHistory.slice(-AI_CHAT_HISTORY_LIMIT)));
  } catch (error) {
    console.warn('AI 대화 기록 저장에 실패했습니다.', error);
  }
}

function restoreAiChatHistory() {
  const messages = document.getElementById('aiChatMessages');
  if (!messages) return;

  clearRenderedAiChatHistory(messages);
  aiChatDisplayHistory = [];
  aiChatHistory = [];

  try {
    const storageKey = getAiChatStorageKey();
    const rawSaved = localStorage.getItem(storageKey) || '[]';
    const saved = JSON.parse(rawSaved);

    if (!Array.isArray(saved) || saved.length === 0) return;

    aiChatDisplayHistory = saved.filter((entry) => entry && typeof entry === 'object');
    syncAiApiHistory();

    aiChatDisplayHistory.forEach((entry) => {
      if (entry.kind === 'user') {
        appendChatMessage(messages, 'user', escapeHtml(entry.message || ''));
        return;
      }

      appendBotResponse(
        messages,
        entry.message || '',
        Array.isArray(entry.recommendations) ? entry.recommendations : [],
        entry.parsedConditions || null,
        Boolean(entry.knowledgeApplied),
        { scroll: false }
      );
    });
  } catch (error) {
    aiChatDisplayHistory = [];
    aiChatHistory = [];
    localStorage.removeItem(getAiChatStorageKey());
  }
}

async function handleChatSend() {
  const input = document.getElementById('aiChatInput');
  const messages = document.getElementById('aiChatMessages');
  if (!input || !messages) return;

  const text = input.value.trim();
  if (!text) return;

  appendChatMessage(messages, 'user', escapeHtml(text));
  aiChatDisplayHistory.push({ kind: 'user', message: text });
  syncAiApiHistory();
  saveAiChatHistory();
  input.value = '';

  const loadingEl = appendLoadingMessage(messages);

  try {
    const response = await fetch(`${API_BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        history: aiChatHistory.slice(-AI_API_HISTORY_LIMIT),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    loadingEl.remove();

    const recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
    appendBotResponse(
      messages,
      data.message || '',
      recommendations,
      data.parsedConditions || null,
      Boolean(data.knowledgeApplied)
    );

    aiChatDisplayHistory.push({
      kind: 'bot',
      message: data.message || '',
      recommendations,
      parsedConditions: data.parsedConditions || null,
      knowledgeApplied: Boolean(data.knowledgeApplied),
    });
    syncAiApiHistory();
    saveAiChatHistory();
  } catch (error) {
    console.error('AI 채팅 요청 실패:', error);
    loadingEl.remove();

    const fallbackMessage = '죄송합니다. 지금은 AI 채팅 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.';
    appendChatMessage(messages, 'bot', `${escapeHtml(fallbackMessage)}`);

    aiChatDisplayHistory.push({
      kind: 'bot',
      message: fallbackMessage,
      recommendations: [],
      parsedConditions: null,
      knowledgeApplied: false,
    });
    syncAiApiHistory();
    saveAiChatHistory();
  }
}

function appendBotResponse(container, message, recommendations = [], parsedConditions = null, knowledgeApplied = false, options = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ai-chat-msg ai-chat-msg--bot ai-chat-msg--bot-response';

  const parsedSummary = buildParsedSummary(parsedConditions || {});
  const introMessage = recommendations.length > 0
    ? `조건에 맞는 빈집을 ${recommendations.length}곳 골랐습니다. 아래에서 설명 하나와 연결 링크 하나씩 바로 확인해 주세요.`
    : message;

  const summaryHtml = recommendations.length > 0
    ? `
      <div class="ai-response-summary">
        <strong class="ai-response-summary__title">추천 조건 해석</strong>
        <p class="ai-response-summary__text">${escapeHtml(parsedSummary)}</p>
        ${knowledgeApplied ? '<p class="ai-response-summary__meta">영주시 지역 특성을 반영해 추천했습니다.</p>' : ''}
      </div>
    `
    : '';

  const resultHtml = recommendations.length > 0
    ? `
      <div class="ai-response-results">
        <div class="ai-response-results__title">추천 빈집 안내</div>
        <div class="ai-result-flow">${renderRecommendationFlow(recommendations)}</div>
      </div>
    `
    : '';

  wrapper.innerHTML = `
    <div class="ai-chat-msg__avatar"><img src="../assets/images/yeongju_mas.jpg" alt="영주 AI 마스코트"></div>
    <div class="ai-chat-msg__content ai-chat-msg__content--wide">
      <div class="ai-chat-msg__name">AI 추천 도우미</div>
      <div class="ai-chat-msg__bubble ai-chat-msg__bubble--response">
        <div class="ai-response-copy">${formatBotText(introMessage)}</div>
        ${summaryHtml}
        ${resultHtml}
      </div>
    </div>
  `;

  container.appendChild(wrapper);
  if (options.scroll !== false) {
    requestAnimationFrame(() => {
      wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
  return wrapper;
}

function renderRecommendationFlow(recommendations = []) {
  return recommendations.map((item, idx) => {
    const house = item.house || {};
    return `
      <section class="ai-recommendation-block">
        <div class="ai-recommendation-block__copy">
          <div class="ai-recommendation-block__heading">${idx + 1}. ${escapeHtml(house.name || `추천 빈집 ${idx + 1}`)}</div>
          <p class="ai-recommendation-block__line"><strong>추천 이유</strong> ${escapeHtml(buildRecommendationReasonLine(item))}</p>
          <p class="ai-recommendation-block__line"><strong>잘 맞는 점</strong> ${escapeHtml(buildRecommendationFitLine(house))}</p>
          <p class="ai-recommendation-block__line"><strong>참고할 점</strong> ${escapeHtml(buildRecommendationCautionLine(house))}</p>
        </div>
        <div class="ai-recommendation-block__card">
          ${renderRecommendationCard(item, idx)}
        </div>
      </section>
    `;
  }).join('');
}

function renderRecommendationCard(item, idx) {
  const house = item.house || {};
  const reasons = Array.isArray(item.reasons) ? item.reasons.filter(Boolean) : [];
  const locationText = `영주시 ${escapeHtml(house.districtName || '-')} · 최대 ${escapeHtml(house.maxCapacity || '-')}명`;

  return `
    <a href="guest-detail.html?id=${house.id}" class="ai-result-card">
      <div class="ai-result-card__rank">${idx + 1}</div>
      <div class="ai-result-card__emoji">${getHouseEmoji(house.operationType)}</div>
      <div class="ai-result-card__info">
        <div class="ai-result-card__name">${escapeHtml(house.name || '추천 빈집')}</div>
        <div class="ai-result-card__location">${locationText}</div>
        <div class="ai-result-card__badge-row">
          ${getConditionGradeBadge(house.conditionGrade)}
          ${getOperationTypeBadge(house.operationType)}
        </div>
        <div class="ai-result-card__match">추천 이유: ${escapeHtml(reasons.join(' · ') || '조건에 맞는 공개 승인 빈집입니다.')}</div>
        <div class="ai-result-card__meta">
          <div><strong>공공데이터 반영</strong> : ${escapeHtml(getPublicDataSummary(house))}</div>
          <div><strong>참고</strong> : ${escapeHtml(getGradeCautionText(house.conditionGrade))}</div>
        </div>
      </div>
      <div class="ai-result-card__price">${escapeHtml(house.priceRange || '-')}</div>
    </a>
  `;
}

function buildRecommendationReasonLine(item = {}) {
  const reasons = Array.isArray(item.reasons) ? item.reasons.filter(Boolean) : [];
  if (reasons.length > 0) {
    return reasons.join(', ');
  }
  return '입력하신 조건과 비교했을 때 무난하게 검토할 수 있는 후보입니다.';
}

function buildRecommendationFitLine(house = {}) {
  const parts = [];
  if (house.maxCapacity) parts.push(`최대 ${house.maxCapacity}명 이용 가능`);
  if (house.priceRange) parts.push(`${house.priceRange} 예산대`);
  if (house.conditionGrade) parts.push(`${house.conditionGrade}등급 기준 반영`);
  return parts.length > 0
    ? `${parts.join(', ')}해서 조건에 맞춰 보기 좋습니다.`
    : '상세 조건과 기본 상태 정보를 함께 확인하기 좋은 후보입니다.';
}

function buildRecommendationCautionLine(house = {}) {
  const caution = getGradeCautionText(house.conditionGrade);
  if (house.area && Number(house.area) > 0) {
    return `${caution} 면적은 ${house.area}㎡로 표시되어 있어 상세 페이지에서 활용 가능 범위를 함께 보는 것이 좋습니다.`;
  }
  return `${caution} 상세 페이지에서 실제 운영 상태와 이용 조건을 같이 확인해 주세요.`;
}

function appendLoadingMessage(container) {
  const msg = document.createElement('div');
  msg.className = 'ai-chat-msg ai-chat-msg--bot';
  msg.innerHTML = `
    <div class="ai-chat-msg__avatar"><img src="../assets/images/yeongju_mas.jpg" alt="영주 AI 마스코트"></div>
    <div class="ai-chat-msg__content">
      <div class="ai-chat-msg__name">AI 추천 도우미</div>
      <div class="ai-chat-msg__bubble">
        추천 조건을 분석하고 있습니다.
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
        <div class="ai-chat-msg__name">사용자</div>
        <div class="ai-chat-msg__bubble">${html}</div>
      </div>
    `;
  } else {
    msg.innerHTML = `
      <div class="ai-chat-msg__avatar"><img src="../assets/images/yeongju_mas.jpg" alt="영주 AI 마스코트"></div>
      <div class="ai-chat-msg__content">
        <div class="ai-chat-msg__name">AI 추천 도우미</div>
        <div class="ai-chat-msg__bubble">${html}</div>
      </div>
    `;
  }

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
  return msg;
}

function buildParsedSummary(parsedConditions = {}) {
  const parts = [];
  if (parsedConditions.districtName) parts.push(`지역: ${parsedConditions.districtName}`);
  if (parsedConditions.capacity) parts.push(`인원: ${parsedConditions.capacity}명`);

  if (parsedConditions.stayDuration) {
    const stayDurationMap = { short: '단기', medium: '중기', long: '장기' };
    parts.push(`체류: ${stayDurationMap[parsedConditions.stayDuration] || parsedConditions.stayDuration}`);
  }

  if (Array.isArray(parsedConditions.moods) && parsedConditions.moods.length > 0) {
    parts.push(`분위기: ${parsedConditions.moods.join(', ')}`);
  }

  return parts.length > 0 ? parts.join(' · ') : '질문 내용을 기준으로 조건을 자동 해석했습니다.';
}

function getPublicDataSummary(house = {}) {
  const statusSummary = house.status ? `현장 상태 ${house.status}` : '현장 상태 정보 없음';
  return `${statusSummary}, ${getConditionGradeText(house.conditionGrade)} 반영`;
}

function getHouseEmoji(operationType) {
  return {
    lodging: '🏡',
    longterm: '🛏️',
    experience: '🌿',
    review_needed: '🔎',
  }[operationType] || '🏠';
}

function formatBotText(text) {
  return escapeHtml(text || '').replace(/\n/g, '<br>');
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.handleChatSend = handleChatSend;
window.restoreAiChatHistory = restoreAiChatHistory;
window.focusAiChatInput = () => {
  const input = document.getElementById('aiChatInput');
  if (input) {
    input.focus();
  }
};

document.addEventListener('DOMContentLoaded', () => {
  if (AI_CHAT_IS_EMBEDDED) {
    document.body.classList.add('guest-ai-page--embed');
  }

  try {
    if (!AI_CHAT_IS_EMBEDDED && typeof renderHeader === 'function') renderHeader('ai');
    if (!AI_CHAT_IS_EMBEDDED && typeof renderFooter === 'function') renderFooter();
  } catch (error) {
    console.error('레이아웃 렌더링 실패:', error);
  }

  const sendBtn = document.getElementById('aiChatSendBtn');
  const input = document.getElementById('aiChatInput');

  if (sendBtn) {
    sendBtn.addEventListener('click', handleChatSend);
  }

  if (input) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleChatSend();
      }
    });
  }

  restoreAiChatHistory();
  window.addEventListener('yeongju:auth-changed', restoreAiChatHistory);

  if (AI_CHAT_IS_EMBEDDED && input) {
    requestAnimationFrame(() => {
      input.focus();
    });
  }
});
