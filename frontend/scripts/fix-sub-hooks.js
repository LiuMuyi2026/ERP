#!/usr/bin/env node
const fs = require('fs');

const files = [
  'src/components/workspace/TaskTracker/FilterPanel.tsx',
  'src/app/[tenant]/settings/page.tsx',
  'src/components/workspace/TaskTracker/TaskTracker.tsx',
  'src/app/[tenant]/crm/page.tsx',
  'src/app/[tenant]/accounting/page.tsx',
  'src/app/[tenant]/workspace/automations/page.tsx',
  'src/components/workspace/TaskTracker/TaskModal.tsx',
  'src/app/[tenant]/inventory/page.tsx',
  'src/app/[tenant]/crm/customer-360/[id]/page.tsx',
];

for (const f of files) {
  let content = fs.readFileSync(f, 'utf8');

  // Check if single or multi namespace
  const singleMatch = content.match(/const t = useTranslations\('(\w+)'\)/);
  if (singleMatch) {
    const ns = singleMatch[1];
    content = content.replace(/const t = useTranslation\(\);?/g, `const t = useTranslations('${ns}');`);
    fs.writeFileSync(f, content);
    console.log(`Fixed (single ns '${ns}'): ${f}`);
    continue;
  }

  // Multi namespace: find all useTranslations declarations
  const allNs = [];
  const nsRe = /const (\w+) = useTranslations\('(\w+)'\)/g;
  let m;
  while ((m = nsRe.exec(content)) !== null) {
    allNs.push({ varName: m[1], ns: m[2] });
  }

  if (allNs.length === 0) {
    console.log(`SKIP (no useTranslations found): ${f}`);
    continue;
  }

  const hookDecls = allNs.map(h => `const ${h.varName} = useTranslations('${h.ns}');`).join('\n  ');
  content = content.replace(/const t = useTranslation\(\);?/g, hookDecls);
  fs.writeFileSync(f, content);
  const remaining = (content.match(/useTranslation\(\)/g) || []).length;
  console.log(`Fixed (multi ns): ${f}${remaining > 0 ? ` (remaining: ${remaining})` : ''}`);
}
