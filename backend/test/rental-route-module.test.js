'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const backendDir = path.join(__dirname, '..');

test('rental account routes are installed from one dependency-injected module', () => {
  const server = fs.readFileSync(path.join(backendDir, 'server.js'), 'utf8');
  const routes = fs.readFileSync(path.join(backendDir, 'routes', 'rental-accounts.js'), 'utf8');
  assert.match(server, /createRentalAccountRouter\(\{/);
  assert.match(server, /uploadDir: path\.join\(__dirname, 'uploads'\)/);
  assert.doesNotMatch(server, /app\.(?:get|post|put)\('\/api\/(?:admin\/)?rental\/accounts/);
  for (const endpoint of ["router.get('/rental/accounts'",
    "router.post('/rental/accounts'", "router.get('/rental/my-accounts'",
    "router.put('/admin/rental/accounts/:id/review'",
    "router.get('/admin/rental/accounts'"]) {
    assert.match(routes, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(routes, /require\(['"]\.\.\/server/);
});
