'use strict';

(function exposeGameNews(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GameNewsUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGameNewsUI() {
  const CATEGORY_LABELS = Object.freeze({
    in_game: '游戏内动态',
    community: '社区与赛事'
  });
  const stateByContainer = new WeakMap();
  let lastTrigger = null;

  function cleanText(value, maxLength = Infinity) {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  }

  function safeMediaUrl(value) {
    const url = cleanText(value, 1000);
    if (!url) return '';
    if (/^\/(?!\/)/.test(url)) return url;
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (_) {
      return '';
    }
  }

  function safeSourceUrl(value) {
    const url = cleanText(value, 1000);
    if (!url) return '';
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (_) {
      return '';
    }
  }

  function plainSummary(content, maxLength = 120) {
    const text = cleanText(content)
      .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
  }

  function parseDate(value) {
    if (!value) return null;
    const normalized = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} /.test(value)
      ? value.replace(' ', 'T') : value;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, compact = false) {
    const date = parseDate(value);
    if (!date) return '';
    return new Intl.DateTimeFormat('zh-CN', compact
      ? { month: 'numeric', day: 'numeric' }
      : { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    ).format(date);
  }

  function normalizeNews(item) {
    const category = Object.hasOwn(CATEGORY_LABELS, item?.category) ? item.category : 'in_game';
    const content = cleanText(item?.content);
    return {
      id: Number(item?.id) || 0,
      title: cleanText(item?.title, 200) || '未命名资讯',
      content,
      category,
      summary: cleanText(item?.summary, 280) || plainSummary(content),
      label: cleanText(item?.label, 40) || CATEGORY_LABELS[category],
      cover_url: safeMediaUrl(item?.cover_url),
      source_name: cleanText(item?.source_name, 100),
      source_url: safeSourceUrl(item?.source_url),
      is_featured: item?.is_featured === true || Number(item?.is_featured) === 1,
      published_at: item?.published_at || item?.created_at || '',
      created_at: item?.created_at || ''
    };
  }

  function byPriority(a, b) {
    if (a.is_featured !== b.is_featured) return Number(b.is_featured) - Number(a.is_featured);
    return (parseDate(b.published_at)?.getTime() || 0) - (parseDate(a.published_at)?.getTime() || 0);
  }

  function selectCardGroups(items, category) {
    const matching = items.map(normalizeNews).filter(item => item.category === category).sort(byPriority);
    return { featured: matching.slice(0, 2), standard: matching.slice(2) };
  }

  function element(document, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function createCard(document, item, featured, openDetail) {
    const article = element(document, 'article', `game-news-card${featured ? ' featured' : ''}`);
    const button = element(document, 'button', `game-news-card-button${item.cover_url ? ' has-cover' : ''}`);
    button.type = 'button';
    button.setAttribute('aria-label', `查看资讯：${item.title}`);
    button.addEventListener('click', () => openDetail(item, button));

    if (item.cover_url) {
      const image = element(document, 'img', 'game-news-card-media');
      image.src = item.cover_url;
      image.alt = '';
      image.loading = 'lazy';
      image.decoding = 'async';
      button.appendChild(image);
    }

    const top = element(document, 'div', 'game-news-card-topline');
    top.append(element(document, 'span', 'game-news-card-tag', item.label));
    top.append(element(document, 'time', 'game-news-card-date', formatDate(item.published_at, true)));

    const content = element(document, 'div', 'game-news-card-content');
    content.append(element(document, 'h4', 'game-news-card-title', item.title));
    if (item.summary) content.append(element(document, 'p', 'game-news-card-summary', item.summary));
    button.append(top, content);
    article.appendChild(button);
    return article;
  }

  function appendRichText(document, container, content) {
    container.replaceChildren();
    const text = typeof content === 'string' ? content : '';
    const pattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let cursor = 0;
    let match;
    while ((match = pattern.exec(text))) {
      if (match.index > cursor) container.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      const src = safeMediaUrl(match[2]);
      if (src) {
        const image = document.createElement('img');
        image.src = src;
        image.alt = cleanText(match[1], 200);
        image.loading = 'lazy';
        image.decoding = 'async';
        container.appendChild(image);
      } else {
        container.appendChild(document.createTextNode(match[0]));
      }
      cursor = pattern.lastIndex;
    }
    if (cursor < text.length) container.appendChild(document.createTextNode(text.slice(cursor)));
  }

  function closeDetail(document) {
    const modal = document.getElementById('gameNewsDetailModal');
    if (!modal) return;
    modal.style.display = 'none';
    if (lastTrigger?.isConnected) lastTrigger.focus();
    lastTrigger = null;
  }

  function openDetail(document, item, trigger) {
    const modal = document.getElementById('gameNewsDetailModal');
    if (!modal) return;
    lastTrigger = trigger;
    document.getElementById('gameNewsDetailCategory').textContent = `${CATEGORY_LABELS[item.category]} · ${item.label}`;
    document.getElementById('gameNewsDetailTitle').textContent = item.title;
    document.getElementById('gameNewsDetailMeta').textContent = formatDate(item.published_at);
    appendRichText(document, document.getElementById('gameNewsDetailContent'), item.content);

    const cover = document.getElementById('gameNewsDetailCover');
    cover.hidden = !item.cover_url;
    cover.removeAttribute('src');
    if (item.cover_url) cover.src = item.cover_url;

    const source = document.getElementById('gameNewsDetailSource');
    source.hidden = !item.source_url;
    source.removeAttribute('href');
    if (item.source_url) {
      source.href = item.source_url;
      source.firstChild.textContent = item.source_name ? `查看来源：${item.source_name} ` : '查看原文 ';
    }
    modal.style.display = 'flex';
    document.getElementById('closeGameNewsDetailBtn')?.focus();
  }

  function bindDetailModal(document) {
    const modal = document.getElementById('gameNewsDetailModal');
    if (!modal || modal.dataset.bound === 'true') return;
    modal.dataset.bound = 'true';
    document.getElementById('closeGameNewsDetailBtn')?.addEventListener('click', () => closeDetail(document));
    modal.addEventListener('click', event => { if (event.target === modal) closeDetail(document); });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.style.display === 'flex') closeDetail(document);
    });
  }

  function renderCategory(document, container, items, category) {
    container.replaceChildren();
    const groups = selectCardGroups(items, category);
    if (!groups.featured.length) {
      const empty = element(document, 'div', 'game-news-empty');
      const copy = element(document, 'div');
      copy.append(element(document, 'strong', '', `${CATEGORY_LABELS[category]}暂时没有新内容`));
      copy.append(document.createTextNode('管理员发布后会显示在这里。'));
      empty.appendChild(copy);
      container.appendChild(empty);
      return;
    }
    const open = (item, trigger) => openDetail(document, item, trigger);
    const featured = element(document, 'div', `game-news-featured-grid${groups.featured.length === 1 ? ' single' : ''}`);
    groups.featured.forEach(item => featured.appendChild(createCard(document, item, true, open)));
    container.appendChild(featured);
    if (groups.standard.length) {
      const standard = element(document, 'div', 'game-news-standard-grid');
      groups.standard.forEach(item => standard.appendChild(createCard(document, item, false, open)));
      container.appendChild(standard);
    }
  }

  function render(document, container, tabs, rawItems) {
    if (!document || !container) return;
    bindDetailModal(document);
    const items = Array.isArray(rawItems) ? rawItems.map(normalizeNews) : [];
    const previous = stateByContainer.get(container);
    const state = { items, category: previous?.category || 'in_game' };
    stateByContainer.set(container, state);

    const redraw = category => {
      state.category = Object.hasOwn(CATEGORY_LABELS, category) ? category : 'in_game';
      renderCategory(document, container, state.items, state.category);
      tabs?.querySelectorAll('[data-news-category]').forEach(button => {
        const active = button.dataset.newsCategory === state.category;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
      });
    };

    if (tabs && tabs.dataset.bound !== 'true') {
      tabs.dataset.bound = 'true';
      tabs.addEventListener('click', event => {
        const button = event.target.closest('[data-news-category]');
        if (!button) return;
        const current = stateByContainer.get(container);
        if (!current) return;
        current.category = button.dataset.newsCategory;
        render(document, container, tabs, current.items);
      });
    }
    redraw(state.category);
    container.closest('.game-news-surface')?.setAttribute('aria-busy', 'false');
  }

  function renderStatus(document, container, type, message) {
    if (!document || !container) return;
    const className = type === 'error' ? 'game-news-error' : 'game-news-loading';
    container.replaceChildren(element(document, 'div', className, message));
    container.closest('.game-news-surface')?.setAttribute('aria-busy', type === 'loading' ? 'true' : 'false');
  }

  return {
    CATEGORY_LABELS,
    normalizeNews,
    safeMediaUrl,
    safeSourceUrl,
    plainSummary,
    selectCardGroups,
    render,
    renderStatus
  };
});
