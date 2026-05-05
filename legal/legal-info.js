window.addEventListener('load', () => {
  renderHeader('legal-info');
  renderFooter();
  initRevealAnimations();
  initFaqAccordion();
  initAnchorButtons();
});

function initRevealAnimations() {
  const targets = document.querySelectorAll('.reveal-on-scroll');
  if (!targets.length) return;

  targets.forEach((el, index) => {
    if (!el.dataset.revealDelay) {
      el.style.setProperty('--reveal-delay', String(index * 40));
    } else {
      el.style.setProperty('--reveal-delay', el.dataset.revealDelay);
    }
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
      } else {
        entry.target.classList.remove('is-visible');
      }
    });
  }, {
    threshold: 0.16,
    rootMargin: '0px 0px -6% 0px'
  });

  targets.forEach((el) => observer.observe(el));
}

function initFaqAccordion() {
  const questions = document.querySelectorAll('.faq-question');
  questions.forEach((button, idx) => {
    const answer = button.nextElementSibling;
    if (!answer) return;

    const panelId = `faq-panel-${idx + 1}`;
    answer.id = panelId;
    button.setAttribute('aria-controls', panelId);

    button.addEventListener('click', () => {
      const isOpen = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!isOpen));
      answer.hidden = isOpen;
    });
  });
}

function initAnchorButtons() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      const href = anchor.getAttribute('href');
      if (!href || href.length <= 1) return;

      const target = document.querySelector(href);
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}
