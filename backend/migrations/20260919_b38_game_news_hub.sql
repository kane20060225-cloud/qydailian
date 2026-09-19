-- Additive game-news hub migration. Existing news stays in the in-game category.
-- Review and back up the target database before applying.

ALTER TABLE game_news
  ADD COLUMN category ENUM('in_game','community') NOT NULL DEFAULT 'in_game' AFTER content,
  ADD COLUMN summary VARCHAR(280) NULL AFTER category,
  ADD COLUMN cover_url VARCHAR(1000) NULL AFTER summary,
  ADD COLUMN label VARCHAR(40) NULL AFTER cover_url,
  ADD COLUMN source_name VARCHAR(100) NULL AFTER label,
  ADD COLUMN source_url VARCHAR(1000) NULL AFTER source_name,
  ADD COLUMN is_featured TINYINT(1) NOT NULL DEFAULT 0 AFTER source_url,
  ADD COLUMN published_at DATETIME NULL AFTER is_featured;

UPDATE game_news SET published_at = created_at WHERE published_at IS NULL;

CREATE INDEX idx_game_news_category_published
  ON game_news (category, is_featured, published_at, id);

INSERT INTO game_news
  (title, content, category, summary, cover_url, label, source_name, source_url, is_featured, published_at)
SELECT
  '2026 秋季赛资格赛进行中',
  '《坦克世界闪击战》2026 秋季赛 Prove Your Skill 资格赛已进入第二轮。欧洲区第二轮比赛时间为 9月17日至20日，第三轮为 9月23日至26日，使用 X 级坦克与争霸战模式。具体报名资格和开赛时间以官方页面与游戏内比赛卡为准。',
  'community',
  '第二轮资格赛正在进行，第三轮将于 9月23日至26日展开。',
  '/bg.webp',
  '赛事',
  'World of Tanks Blitz 官方',
  'https://eu.wotblitz.com/en/content/autumn-games-pys-eu/',
  1,
  '2026-09-17 00:00:00'
WHERE NOT EXISTS (
  SELECT 1 FROM game_news WHERE source_url='https://eu.wotblitz.com/en/content/autumn-games-pys-eu/'
);

INSERT INTO game_news
  (title, content, category, summary, cover_url, label, source_name, source_url, is_featured, published_at)
SELECT
  '2026 秋季赛职业组与跨服决赛赛程',
  '2026 秋季赛区域职业组将于 10月2日至11日进行；跨服决赛分欧洲、北美和亚太主场阶段，从 10月23日持续到 11月7日。准确比赛时间、对阵和地图以游戏内比赛卡为准。',
  'community',
  '区域职业组将在 10月开赛，跨服决赛持续至 11月。',
  '/bg.webp',
  '赛程',
  'World of Tanks Blitz 官方',
  'https://na.wotblitz.com/en/content/top-8-autumn-games/',
  0,
  '2026-09-19 00:00:00'
WHERE NOT EXISTS (
  SELECT 1 FROM game_news WHERE source_url='https://na.wotblitz.com/en/content/top-8-autumn-games/'
);
