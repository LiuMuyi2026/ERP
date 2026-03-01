#!/usr/bin/env node
/**
 * Extract translations from src/lib/i18n.ts into per-language JSON files.
 * Converts arrow-function translations to ICU MessageFormat strings.
 *
 * Usage: node scripts/extract-messages.js
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'lib', 'i18n.ts');
const OUT_DIR = path.join(__dirname, '..', 'messages');

const src = fs.readFileSync(SRC, 'utf8');

// ── 1. Extract the translations object body ────────────────────────────
const startMarker = 'const translations = {';
const endMarker = '} as const;';
const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker, startIdx);
if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find translations object boundaries');
  process.exit(1);
}

let block = src.slice(startIdx + 'const translations = '.length, endIdx + 1);

// ── 2. Strip TypeScript type annotations (only inside arrow-fn params) ─
block = block.replace(/\(([^)]*)\)\s*=>/g, (match, params) => {
  const cleaned = params.replace(/:\s*(?:number|string|boolean)\b/g, '');
  return `(${cleaned}) =>`;
});

// ── 3. Evaluate as JS ──────────────────────────────────────────────────
let translations;
try {
  const script = new vm.Script(`(${block})`);
  translations = script.runInNewContext({});
} catch (e) {
  console.error('Failed to evaluate translations:', e.message);
  fs.writeFileSync('/tmp/debug_i18n.js', `(${block})`);
  console.error('Debug file written to /tmp/debug_i18n.js');
  process.exit(1);
}

// ── 4. Convert function values → ICU format strings ────────────────────

function convertFn(fn) {
  const source = fn.toString();

  // Extract parameter names
  const paramMatch = source.match(/^\(([^)]*)\)\s*=>/);
  if (!paramMatch) {
    // Fallback: call with placeholder strings
    try { return fn('{arg}'); } catch { return '[CONVERT_FAILED]'; }
  }
  const paramNames = paramMatch[1].split(',').map(p => p.trim()).filter(Boolean);

  // Extract body after =>
  const arrowIdx = source.indexOf('=>');
  let body = source.slice(arrowIdx + 2).trim();

  // ── Template literal ──
  if (body.startsWith('`') && body.endsWith('`')) {
    body = body.slice(1, -1);

    // Pattern A: ${var > 0 ? `inner ${var}` : ''}
    body = body.replace(
      /\$\{(\w+)\s*>\s*0\s*\?\s*`([^`]*)`\s*:\s*(?:''|"")\}/g,
      (_m, param, inner) => {
        inner = inner.replace(/\$\{(\w+)\}/g, '{$1}');
        return `{${param}, plural, =0 {} other {${inner}}}`;
      }
    );

    // Pattern B: ${var !== 1 ? 's' : ''}
    body = body.replace(
      /\$\{(\w+)\s*!==\s*1\s*\?\s*'(\w*)'\s*:\s*(?:''|"")\}/g,
      (_m, param, plural) => `{${param}, plural, one {} other {${plural}}}`
    );

    // Pattern C: ${bool ? 'text' : ''}
    body = body.replace(
      /\$\{(\w+)\s*\?\s*'([^']*)'\s*:\s*(?:''|"")\}/g,
      (_m, param, text) => `{${param}, select, true {${text}} other {}}`
    );

    // Pattern D: ${expr || 'default'} → {expr}
    body = body.replace(/\$\{(\w+)\s*\|\|\s*'[^']*'\}/g, '{$1}');

    // Simple interpolation: ${var} → {var}
    body = body.replace(/\$\{(\w+)\}/g, '{$1}');

    // Catch any remaining ${...} expressions — call fn with placeholders
    if (/\$\{/.test(body)) {
      try {
        const args = paramNames.map(n => `{${n}}`);
        return fn(...args);
      } catch {
        return body; // best effort
      }
    }

    return body;
  }

  // ── Not a template literal — call with placeholder values ──
  try {
    const args = paramNames.map(n => `{${n}}`);
    return fn(...args);
  } catch {
    return '[CONVERT_FAILED]';
  }
}

function walkAndConvert(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'function') {
      result[key] = convertFn(value);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = walkAndConvert(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ── 5. Write JSON files ─────────────────────────────────────────────────
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const langs = {
  en:      'en.json',
  'zh-CN': 'zh-CN.json',
  'zh-TW': 'zh-TW.json',
  ja:      'ja.json',
  it:      'it.json',
  es:      'es.json',
  pt:      'pt.json',
};

for (const [lang, filename] of Object.entries(langs)) {
  if (!translations[lang]) {
    console.warn(`⚠ Language '${lang}' not found, skipping`);
    continue;
  }
  const messages = walkAndConvert(translations[lang]);
  const outPath = path.join(OUT_DIR, filename);
  fs.writeFileSync(outPath, JSON.stringify(messages, null, 2) + '\n');
  const sections = Object.keys(messages);
  console.log(`✓ ${filename} — ${sections.length} sections: ${sections.join(', ')}`);
}

console.log('\nDone! JSON files written to messages/');
