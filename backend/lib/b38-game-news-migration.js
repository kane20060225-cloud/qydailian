'use strict';

const LOCK_NAME = 'qydailian_b38_game_news_hub';
const COLUMNS = Object.freeze({
  category: "ENUM('in_game','community') NOT NULL DEFAULT 'in_game' AFTER content",
  summary: 'VARCHAR(280) NULL AFTER category',
  cover_url: 'VARCHAR(1000) NULL AFTER summary',
  label: 'VARCHAR(40) NULL AFTER cover_url',
  source_name: 'VARCHAR(100) NULL AFTER label',
  source_url: 'VARCHAR(1000) NULL AFTER source_name',
  is_featured: 'TINYINT(1) NOT NULL DEFAULT 0 AFTER source_url',
  published_at: 'DATETIME NULL AFTER is_featured'
});
const INDEX_NAME = 'idx_game_news_category_published';
const SEEDS = Object.freeze([
  Object.freeze({
    key: 'autumn-games-pys-2026',
    title: '2026 秋季赛资格赛进行中',
    content: '《坦克世界闪击战》2026 秋季赛 Prove Your Skill 资格赛已进入第二轮。欧洲区第二轮比赛时间为 9月17日至20日，第三轮为 9月23日至26日，使用 X 级坦克与争霸战模式。具体报名资格和开赛时间以官方页面与游戏内比赛卡为准。',
    summary: '第二轮资格赛正在进行，第三轮将于 9月23日至26日展开。',
    label: '赛事',
    source_url: 'https://eu.wotblitz.com/en/content/autumn-games-pys-eu/',
    is_featured: 1,
    published_at: '2026-09-17 00:00:00'
  }),
  Object.freeze({
    key: 'autumn-games-professionals-2026',
    title: '2026 秋季赛职业组与跨服决赛赛程',
    content: '2026 秋季赛区域职业组将于 10月2日至11日进行；跨服决赛分欧洲、北美和亚太主场阶段，从 10月23日持续到 11月7日。准确比赛时间、对阵和地图以游戏内比赛卡为准。',
    summary: '区域职业组将在 10月开赛，跨服决赛持续至 11月。',
    label: '赛程',
    source_url: 'https://na.wotblitz.com/en/content/top-8-autumn-games/',
    is_featured: 0,
    published_at: '2026-09-19 00:00:00'
  })
]);

async function inspect(conn) {
  const [tables] = await conn.execute(
    `SELECT COUNT(*) AS total FROM information_schema.tables
     WHERE table_schema=DATABASE() AND table_name='game_news'`
  );
  if (Number(tables[0].total) !== 1) throw new Error('game_news table is missing');
  const [columns] = await conn.execute(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema=DATABASE() AND table_name='game_news'`
  );
  const [indexes] = await conn.execute(
    `SELECT index_name FROM information_schema.statistics
     WHERE table_schema=DATABASE() AND table_name='game_news' AND index_name=?`, [INDEX_NAME]
  );
  const columnNames = new Set(columns.map(row => row.column_name));
  let seedUrls = new Set();
  if (columnNames.has('source_url')) {
    const [seedRows] = await conn.execute(
      `SELECT source_url FROM game_news WHERE source_url IN (${SEEDS.map(() => '?').join(',')})`,
      SEEDS.map(seed => seed.source_url)
    );
    seedUrls = new Set(seedRows.map(row => row.source_url));
  }
  return { columns: columnNames, hasIndex: indexes.length > 0, seedUrls };
}

function plan(schema) {
  return [
    ...Object.keys(COLUMNS).map(name => ({ name: `game_news.${name}`, status: schema.columns.has(name) ? 'applied' : 'pending' })),
    { name: INDEX_NAME, status: schema.hasIndex ? 'applied' : 'pending' },
    ...SEEDS.map(seed => ({ name: `seed.${seed.key}`, status: schema.seedUrls.has(seed.source_url) ? 'applied' : 'pending' }))
  ];
}

async function runMigration(conn, { apply = false } = {}) {
  let schema = await inspect(conn);
  const initialPlan = plan(schema);
  if (!apply) return initialPlan;
  const [lockRows] = await conn.execute('SELECT GET_LOCK(?, 10) AS acquired', [LOCK_NAME]);
  if (Number(lockRows[0].acquired) !== 1) throw new Error('Could not acquire B38 migration lock');
  try {
    schema = await inspect(conn);
    for (const [name, definition] of Object.entries(COLUMNS)) {
      if (!schema.columns.has(name)) await conn.execute(`ALTER TABLE game_news ADD COLUMN ${name} ${definition}`);
    }
    await conn.execute('UPDATE game_news SET published_at=created_at WHERE published_at IS NULL');
    schema = await inspect(conn);
    if (!schema.hasIndex) {
      await conn.execute(`CREATE INDEX ${INDEX_NAME} ON game_news (category, is_featured, published_at, id)`);
    }
    schema = await inspect(conn);
    for (const seed of SEEDS) {
      if (schema.seedUrls.has(seed.source_url)) continue;
      await conn.execute(`INSERT INTO game_news
        (title, content, category, summary, cover_url, label, source_name, source_url, is_featured, published_at)
        SELECT ?, ?, 'community', ?, '/bg.webp', ?, 'World of Tanks Blitz 官方', ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM game_news WHERE source_url=?)`,
      [seed.title, seed.content, seed.summary, seed.label, seed.source_url,
        seed.is_featured, seed.published_at, seed.source_url]);
    }
    return plan(await inspect(conn));
  } finally {
    await conn.execute('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

module.exports = { COLUMNS, INDEX_NAME, SEEDS, inspect, plan, runMigration };
