'use strict';
// Botkeep writes service variables to a .env file inside the container and
// expects the app to read it. Values already present in the real environment
// win, so a local shell export still overrides the file.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '.env');

if (fs.existsSync(file)) {
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length > 1 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0])) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

module.exports = {};
