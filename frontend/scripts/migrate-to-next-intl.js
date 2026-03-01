#!/usr/bin/env node
/**
 * Migrate all files from old i18n (useTranslation/useLanguage) to next-intl.
 * Handles: import replacement, hook replacement, t.ns.key → t('key'),
 * function calls t.ns.fn(args) → t('fn', {param: arg}), useLanguage → useLocale,
 * LanguageProvider removal, LangCode/LANGUAGES import.
 *
 * Usage: node scripts/migrate-to-next-intl.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── Build param map from en.json ──────────────────────────────────────────
const en = require(path.join(ROOT, 'messages', 'en.json'));
const paramMap = {}; // 'crm.leadsCount' → ['n']

function buildParamMap(obj, prefix) {
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof val === 'string') {
      const params = [];
      const re = /\{(\w+?)(?:[,}])/g;
      let m;
      while ((m = re.exec(val)) !== null) {
        if (!params.includes(m[1])) params.push(m[1]);
      }
      if (params.length > 0) paramMap[fullKey] = params;
    } else if (typeof val === 'object' && val) {
      buildParamMap(val, fullKey);
    }
  }
}
buildParamMap(en, '');

// ── Helpers ───────────────────────────────────────────────────────────────

function findMatchingParen(str, startIdx) {
  let depth = 1;
  let i = startIdx;
  while (i < str.length && depth > 0) {
    const ch = str[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    // Skip string literals
    if ((ch === "'" || ch === '"' || ch === '`') && depth > 0) {
      const quote = ch;
      i++;
      while (i < str.length) {
        if (str[i] === '\\') { i += 2; continue; }
        if (str[i] === quote) break;
        if (quote === '`' && str[i] === '$' && str[i + 1] === '{') {
          // Template literal interpolation — skip nested
          i += 2;
          let td = 1;
          while (i < str.length && td > 0) {
            if (str[i] === '{') td++;
            else if (str[i] === '}') td--;
            if (td > 0) i++;
          }
        }
        i++;
      }
    }
    if (depth > 0) i++;
  }
  return depth === 0 ? i - 1 : -1;
}

function splitArgs(str) {
  const args = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    // Skip strings
    else if ((ch === "'" || ch === '"' || ch === '`') && depth >= 0) {
      const q = ch;
      i++;
      while (i < str.length) {
        if (str[i] === '\\') { i++; }
        else if (str[i] === q) break;
        i++;
      }
    }
    else if (ch === ',' && depth === 0) {
      args.push(str.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = str.slice(start).trim();
  if (last) args.push(last);
  return args;
}

function nsToVarName(ns) {
  return 't' + ns.charAt(0).toUpperCase() + ns.slice(1);
}

// ── Find files ────────────────────────────────────────────────────────────

function findImportingFiles(dir) {
  const results = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules') walk(full);
      else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
        const content = fs.readFileSync(full, 'utf8');
        if (/from\s+['"]@\/lib\/i18n['"]/.test(content)) {
          results.push(full);
        }
      }
    }
  }
  walk(dir);
  return results;
}

// ── Replace function calls ────────────────────────────────────────────────

function replaceFnCalls(content, oldPrefix, newVarName, namespace) {
  // Regex to find: oldPrefix.key(
  const escapedPrefix = oldPrefix.replace(/\./g, '\\.');
  const pattern = new RegExp(escapedPrefix + '\\.(\\w+)\\(', 'g');

  let result = '';
  let lastIdx = 0;
  let match;

  // Reset regex
  pattern.lastIndex = 0;

  while ((match = pattern.exec(content)) !== null) {
    const key = match[1];
    const openParenIdx = match.index + match[0].length - 1;

    // Check character before match - must be word boundary or start of string
    if (match.index > 0 && /\w/.test(content[match.index - 1])) continue;

    const closeParenIdx = findMatchingParen(content, openParenIdx + 1);
    if (closeParenIdx === -1) continue;

    const argsStr = content.slice(openParenIdx + 1, closeParenIdx).trim();

    // Look up ICU param names
    const pKey = `${namespace}.${key}`;
    const paramNames = paramMap[pKey];

    let replacement;
    if (paramNames && argsStr) {
      const args = splitArgs(argsStr);
      const objEntries = paramNames.map((name, i) => {
        const argVal = (args[i] || 'undefined').trim();
        // Shorthand if arg name matches param name
        return argVal === name ? name : `${name}: ${argVal}`;
      });
      replacement = `${newVarName}('${key}', { ${objEntries.join(', ')} })`;
    } else if (!argsStr) {
      replacement = `${newVarName}('${key}')`;
    } else {
      // Unknown params — fallback to positional
      const args = splitArgs(argsStr);
      if (args.length === 1) {
        replacement = `${newVarName}('${key}', { value: ${args[0]} })`;
      } else {
        const entries = args.map((a, i) => `arg${i}: ${a}`);
        replacement = `${newVarName}('${key}', { ${entries.join(', ')} })`;
      }
    }

    result += content.slice(lastIdx, match.index) + replacement;
    lastIdx = closeParenIdx + 1;
    // Adjust regex lastIndex
    pattern.lastIndex = lastIdx;
  }

  result += content.slice(lastIdx);
  return result;
}

// ── Migrate a single file ─────────────────────────────────────────────────

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const relPath = path.relative(ROOT, filePath);

  // 1. Parse what's imported from @/lib/i18n
  const importMatch = content.match(/import\s+\{([^}]+)\}\s+from\s+['"]@\/lib\/i18n['"]/);
  if (!importMatch) return;
  const imports = importMatch[1].split(',').map(s => s.trim());
  const hasUseTranslation = imports.includes('useTranslation');
  const hasUseLanguage = imports.includes('useLanguage');
  const hasLanguageProvider = imports.includes('LanguageProvider');
  const hasLangCode = imports.includes('LangCode');
  const hasLANGUAGES = imports.includes('LANGUAGES');

  // 2. Find all namespaces used (t.namespace.key pattern)
  // Be careful not to match t_ or other variables
  const nsSet = new Set();
  const nsRe = /(?<!\w)t\.(\w+)\.\w+/g;
  let nsMatch;
  while ((nsMatch = nsRe.exec(content)) !== null) {
    // Verify this is actually a translation namespace access
    const ns = nsMatch[1];
    // Skip false positives: e.g. in layout.tsx the `t` in script tag
    if (['currentTarget', 'target', 'style', 'preventDefault'].includes(ns)) continue;
    nsSet.add(ns);
  }
  const namespaces = Array.from(nsSet);

  // 3. Build new imports
  const newImportLines = [];
  const nextIntlImports = [];
  if (hasUseTranslation && namespaces.length > 0) nextIntlImports.push('useTranslations');
  if (hasUseLanguage) nextIntlImports.push('useLocale');
  if (nextIntlImports.length > 0) {
    newImportLines.push(`import { ${nextIntlImports.join(', ')} } from 'next-intl';`);
  }

  const localeImports = [];
  if (hasLangCode) localeImports.push('LangCode');
  if (hasLANGUAGES) localeImports.push('LANGUAGES');
  if (hasUseLanguage && /setLang\s*\(/.test(content)) localeImports.push('setLocale');
  if (localeImports.length > 0) {
    newImportLines.push(`import { ${localeImports.join(', ')} } from '@/lib/locale';`);
  }

  // Replace old import line
  content = content.replace(
    /import\s+\{[^}]+\}\s+from\s+['"]@\/lib\/i18n['"];?\s*\n/,
    newImportLines.join('\n') + '\n'
  );

  // 4. Replace useTranslation() hook
  if (hasUseTranslation && namespaces.length > 0) {
    if (namespaces.length === 1) {
      const ns = namespaces[0];
      content = content.replace(
        /const\s+t\s*=\s*useTranslation\(\)\s*;?/,
        `const t = useTranslations('${ns}');`
      );
      // Replace function calls first, then simple accesses
      content = replaceFnCalls(content, `t.${ns}`, 't', ns);
      // Simple access: t.ns.key → t('key'), but not if followed by (
      const simpleRe = new RegExp(`(?<!\\w)t\\.${ns}\\.(\\w+)(?!\\s*\\()(?!\\w)`, 'g');
      content = content.replace(simpleRe, (_, key) => `t('${key}')`);
    } else {
      // Multiple namespaces
      const varMap = {};
      const hookDecls = namespaces.map(ns => {
        const varName = nsToVarName(ns);
        varMap[ns] = varName;
        return `const ${varName} = useTranslations('${ns}');`;
      });
      content = content.replace(
        /const\s+t\s*=\s*useTranslation\(\)\s*;?/,
        hookDecls.join('\n  ')
      );
      for (const ns of namespaces) {
        const vn = varMap[ns];
        content = replaceFnCalls(content, `t.${ns}`, vn, ns);
        const simpleRe = new RegExp(`(?<!\\w)t\\.${ns}\\.(\\w+)(?!\\s*\\()(?!\\w)`, 'g');
        content = content.replace(simpleRe, (_, key) => `${vn}('${key}')`);
      }
    }
  }

  // 5. Replace useLanguage()
  if (hasUseLanguage) {
    content = content.replace(
      /const\s+\{\s*lang\s*(?:,\s*setLang\s*)?\}\s*=\s*useLanguage\(\)\s*;?/g,
      'const lang = useLocale();'
    );
    // Also handle destructure with setLang first
    content = content.replace(
      /const\s+\{\s*setLang\s*,\s*lang\s*\}\s*=\s*useLanguage\(\)\s*;?/g,
      'const lang = useLocale();'
    );
    // Replace setLang → setLocale
    content = content.replace(/\bsetLang\b(?=\s*\()/g, 'setLocale');
  }

  // 6. Remove LanguageProvider wrapper
  if (hasLanguageProvider) {
    content = content.replace(/\s*<LanguageProvider>\s*\n?/g, '\n');
    content = content.replace(/\s*<\/LanguageProvider>\s*\n?/g, '\n');
  }

  fs.writeFileSync(filePath, content);
  console.log(`✓ ${relPath} — namespaces: [${namespaces.join(', ')}]`);
}

// ── Main ──────────────────────────────────────────────────────────────────

const srcDir = path.join(ROOT, 'src');
const files = findImportingFiles(srcDir);
console.log(`Found ${files.length} files to migrate\n`);

for (const f of files) {
  try {
    migrateFile(f);
  } catch (e) {
    console.error(`✗ ${path.relative(ROOT, f)} — ERROR: ${e.message}`);
  }
}

console.log(`\nDone! Migrated ${files.length} files.`);
