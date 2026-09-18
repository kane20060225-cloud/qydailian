'use strict';
// Insert only into the already inspected HTTPS server, retaining its existing rules.
const assert = require('node:assert/strict');
const worker = `
    # PWA worker/retirement endpoint must never fall back to index.html.
    location = /service-worker.js {
        types { application/javascript js; }
        default_type application/javascript;
        add_header Cache-Control "no-store" always;
        add_header Service-Worker-Allowed "/" always;
        try_files $uri =404;
    }
`;
const pwa = worker + `
    location = /manifest.webmanifest {
        types { application/manifest+json webmanifest; }
        default_type application/manifest+json;
        add_header Cache-Control "no-cache" always;
        try_files $uri =404;
    }
    location = /index.html {
        add_header Cache-Control "no-cache" always;
        try_files $uri =404;
    }
    location = /pwa.js {
        add_header Cache-Control "no-cache" always;
        try_files $uri =404;
    }
    location = /offline.html {
        add_header Cache-Control "no-cache" always;
        try_files $uri =404;
    }
    location /icons/ {
        try_files $uri =404;
    }
`;
function configure(original, retirement = false) {
  assert.equal((original.match(/index index\.html;/g) || []).length, 1);
  assert.match(original, /root \/var\/www\/your-site\/public;/);
  assert.match(original, /listen 443 ssl;/);
  assert.doesNotMatch(original, /location\s+=\s*\/(service-worker\.js|manifest\.webmanifest|index\.html|pwa\.js|offline\.html)|location\s+\/icons\//);
  return original.replace('    index index.html;', '    index index.html;\n' + (retirement ? worker : pwa));
}
module.exports = { configure };
