document.addEventListener('DOMContentLoaded', () => {
  try {
    if (typeof renderHeader === 'function') renderHeader('ai');
    if (typeof renderFooter === 'function') renderFooter();
  } catch (error) {
    console.error('AI 페이지 공통 레이아웃 렌더링에 실패했습니다.', error);
  }

  const chatRoot = document.getElementById('guestAiChatRoot');
  if (!chatRoot || !window.YeongjuAiChatCore) {
    return;
  }

  const rootPath = typeof getRootPath === 'function' ? getRootPath() : '../';

  const chatInstance = window.YeongjuAiChatCore.create({
    rootElement: chatRoot,
    rootPath,
    recommendationTarget: '_self',
    openLinksInNewTab: false,
    welcomeMessage: '안녕하세요. 영주시 공공형 빈집 AI 추천 도우미입니다. 원하는 지역, 인원, 일정, 분위기를 말씀해 주세요.',
    initialPrompt: '예: "풍기읍, 4명, 2박, 조용한 자연 분위기"',
  });

  window.yeongjuAiPageChat = chatInstance;
});
