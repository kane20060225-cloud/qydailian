'use strict';

const jwt = require('jsonwebtoken');

function issueSessionToken(userId, tokenVersion, secret) {
  if (!Number.isSafeInteger(userId) || userId < 1 ||
      !Number.isSafeInteger(tokenVersion) || tokenVersion < 0) {
    throw new Error('用户会话参数无效');
  }
  return jwt.sign({ userId, tokenVersion }, secret, { expiresIn: '7d' });
}

function verifySessionClaims(token, secret) {
  const claims = jwt.verify(token, secret);
  if (!Number.isSafeInteger(claims.userId) || claims.userId < 1 ||
      !Number.isSafeInteger(claims.tokenVersion) || claims.tokenVersion < 0) {
    throw new Error('用户会话声明无效');
  }
  return claims;
}

function isCurrentSession(claims, row) {
  return Number.isSafeInteger(row?.token_version) &&
    claims.tokenVersion === row.token_version;
}

function createAuthMiddleware(pool, secret) {
  return async function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未提供认证令牌' });
    }
    const token = header.slice('Bearer '.length);
    let claims;
    try {
      claims = verifySessionClaims(token, secret);
    } catch {
      return res.status(401).json({ error: '令牌无效或已过期' });
    }

    try {
      const [rows] = await pool.execute('SELECT token_version FROM users WHERE id = ?', [claims.userId]);
      if (rows.length !== 1 || !isCurrentSession(claims, rows[0])) {
        return res.status(401).json({ error: '登录已失效，请重新登录' });
      }
      req.userId = claims.userId;
      req.tokenVersion = claims.tokenVersion;
      next();
    } catch {
      return res.status(503).json({ error: '暂时无法验证登录状态' });
    }
  };
}

module.exports = {
  createAuthMiddleware,
  issueSessionToken,
  verifySessionClaims,
  isCurrentSession
};
