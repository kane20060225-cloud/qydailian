'use strict';

const CATEGORY_LABELS = Object.freeze({
  in_game: '游戏内动态',
  community: '社区与赛事'
});

function cleanText(value, maxLength) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  if (maxLength && text.length > maxLength) throw new Error(`内容不能超过 ${maxLength} 个字符`);
  return text;
}

function plainSummary(content, maxLength = 120) {
  const text = String(content || '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function normalizeUrl(value, { allowLocal = false } = {}) {
  const url = cleanText(value, 1000);
  if (!url) return null;
  if (allowLocal && /^\/(?!\/)/.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return parsed.href;
  } catch (_) {
    throw new Error(allowLocal ? '图片地址必须是 HTTP(S) 地址或站内绝对路径' : '原文链接必须是 HTTP(S) 地址');
  }
}

function normalizePublishedAt(value) {
  if (!value) return null;
  const text = String(value).trim();
  const local = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/.exec(text);
  if (local) {
    const candidate = `${local[1]}T${local[2]}:${local[3] || '00'}`;
    if (Number.isNaN(new Date(candidate).getTime())) throw new Error('发布时间无效');
    return `${local[1]} ${local[2]}:${local[3] || '00'}`;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error('发布时间无效');
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizeGameNewsInput(input = {}) {
  const title = cleanText(input.title, 200);
  const content = cleanText(input.content, 60000);
  if (!title || !content) throw new Error('标题和内容必填');
  const category = Object.hasOwn(CATEGORY_LABELS, input.category) ? input.category : 'in_game';
  const summary = cleanText(input.summary, 280) || plainSummary(content);
  const label = cleanText(input.label, 40) || CATEGORY_LABELS[category];
  return {
    title,
    content,
    category,
    summary,
    label,
    cover_url: normalizeUrl(input.cover_url, { allowLocal: true }),
    source_name: cleanText(input.source_name, 100) || null,
    source_url: normalizeUrl(input.source_url),
    published_at: normalizePublishedAt(input.published_at),
    is_featured: input.is_featured === true || input.is_featured === 1 || input.is_featured === '1' ? 1 : 0
  };
}

module.exports = { CATEGORY_LABELS, plainSummary, normalizeUrl, normalizePublishedAt, normalizeGameNewsInput };
