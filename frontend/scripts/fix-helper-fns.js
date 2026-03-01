#!/usr/bin/env node
/**
 * Fix helper functions that used to accept the old translation object `t`.
 * - Replace `ReturnType<typeof useTranslation>` with `any`
 * - Rename function param `t` to match the namespace variable used inside
 * - Fix old-style dynamic access patterns like `(t.crm as any)[key]`
 * - Update call sites to pass the namespace-specific function
 */
const fs = require('fs');

// ── Fix each file ─────────────────────────────────────────────────────────

function fixFile(filePath, fns) {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Remove `typeof useTranslation` references (which refers to the old function)
  //    Replace ReturnType<typeof useTranslation> with any
  content = content.replace(/ReturnType<typeof useTranslation>/g, 'any');

  // 2. For each helper function spec, fix param name and call sites
  for (const fn of fns) {
    const { name, nsVar, nsName, paramIdx, extraFix } = fn;

    // Fix function signature: rename `t` param to nsVar
    // Pattern: function name(... t: any ...) or function name(t: any)
    if (paramIdx === 0) {
      // First param is t
      const sigRe = new RegExp(`function ${name}\\(t:\\s*any`);
      content = content.replace(sigRe, `function ${name}(${nsVar}: any`);
    } else if (paramIdx === 1) {
      // Second param is t (like relTime(ts: string, t: any))
      const sigRe = new RegExp(`function ${name}\\(([^,]+),\\s*t:\\s*any`);
      content = content.replace(sigRe, `function ${name}($1, ${nsVar}: any`);
    }

    // Fix prop type: { ..., t: any }
    const propRe = new RegExp(`(\\{[^}]*?)\\bt:\\s*any`, 'g');
    // Only fix for component props that match the function name
    if (fn.isProp) {
      // For component props like { views, t }: { views: ...; t: any }
      // We need to rename the `t` prop AND destructured param
      // Handled per-file below
    }

    // Fix call sites: name(t) → name(nsVar)  or  name(expr, t) → name(expr, nsVar)
    if (fn.callPattern) {
      content = content.replace(fn.callPattern, fn.callReplacement);
    }

    // Apply extra fixes
    if (extraFix) {
      content = extraFix(content);
    }
  }

  fs.writeFileSync(filePath, content);
  console.log(`Fixed: ${filePath}`);
}

// ── CRM page ──────────────────────────────────────────────────────────────
fixFile('src/app/[tenant]/crm/page.tsx', [
  {
    name: 'getFunnelStages',
    nsVar: 'tCrm',
    paramIdx: 0,
    callPattern: /getFunnelStages\(tCrm\b/g, // may have been called with t originally
    callReplacement: 'getFunnelStages(tCrm',
    extraFix: (c) => {
      // Fix: (t.crm as any)[s.labelKey] → tCrm(s.labelKey as any)
      c = c.replace(/\(tCrm\.crm as any\)\[([^\]]+)\]/g, 'tCrm($1 as any)');
      // Also handle if it was left as (t.crm as any)[key] where t was not renamed yet
      c = c.replace(/\(t\.crm as any\)\[([^\]]+)\]/g, 'tCrm($1 as any)');
      return c;
    },
  },
  { name: 'getLeadStatusOptions', nsVar: 'tCrm', paramIdx: 0,
    callPattern: /getLeadStatusOptions\(tCrm\b/g, callReplacement: 'getLeadStatusOptions(tCrm' },
  { name: 'getSortOptions', nsVar: 'tCrm', paramIdx: 0,
    callPattern: /getSortOptions\(tCrm\b/g, callReplacement: 'getSortOptions(tCrm' },
  { name: 'getSourceChannels', nsVar: 'tCrm', paramIdx: 0,
    callPattern: /getSourceChannels\(tCrm\b/g, callReplacement: 'getSourceChannels(tCrm' },
  { name: 'getCustomerTypes', nsVar: 'tCrm', paramIdx: 0,
    callPattern: /getCustomerTypes\(tCrm\b/g, callReplacement: 'getCustomerTypes(tCrm' },
]);

// Also fix call sites (they may still pass `t`)
let crmContent = fs.readFileSync('src/app/[tenant]/crm/page.tsx', 'utf8');
// The call sites used `t` from useTranslation, now they need to pass tCrm/tCommon
// In multi-ns files, the hook vars are tCrm, tCommon
// The helper functions all use tCrm, so call sites should pass tCrm
crmContent = crmContent.replace(/getFunnelStages\(t\)/g, 'getFunnelStages(tCrm)');
crmContent = crmContent.replace(/getLeadStatusOptions\(t\)/g, 'getLeadStatusOptions(tCrm)');
crmContent = crmContent.replace(/getSortOptions\(t\)/g, 'getSortOptions(tCrm)');
crmContent = crmContent.replace(/getSourceChannels\(t\)/g, 'getSourceChannels(tCrm)');
crmContent = crmContent.replace(/getCustomerTypes\(t\)/g, 'getCustomerTypes(tCrm)');
fs.writeFileSync('src/app/[tenant]/crm/page.tsx', crmContent);

// ── Accounting page ───────────────────────────────────────────────────────
fixFile('src/app/[tenant]/accounting/page.tsx', [
  { name: 'getStatusLabel', nsVar: 'tAccounting', paramIdx: 0 },
  { name: 'getPayableStatusLabel', nsVar: 'tAccounting', paramIdx: 0 },
]);
let accContent = fs.readFileSync('src/app/[tenant]/accounting/page.tsx', 'utf8');
accContent = accContent.replace(/getStatusLabel\(t\)/g, 'getStatusLabel(tAccounting)');
accContent = accContent.replace(/getPayableStatusLabel\(t\)/g, 'getPayableStatusLabel(tAccounting)');
fs.writeFileSync('src/app/[tenant]/accounting/page.tsx', accContent);

// ── Customer 360 page ─────────────────────────────────────────────────────
fixFile('src/app/[tenant]/crm/customer-360/[id]/page.tsx', [
  { name: 'getCH', nsVar: 't', paramIdx: 0 },
  { name: 'getLeadStatus', nsVar: 't', paramIdx: 0 },
  { name: 'getContractStatus', nsVar: 't', paramIdx: 0 },
  { name: 'getLeadStatuses', nsVar: 't', paramIdx: 0 },
  { name: 'getSources', nsVar: 't', paramIdx: 0 },
  { name: 'getFlowSteps', nsVar: 't', paramIdx: 0 },
  { name: 'relTime', nsVar: 't', paramIdx: 1 },
  { name: 'dateGroupKey', nsVar: 't', paramIdx: 1 },
]);
// customer360 is a single-namespace file, t is already useTranslations('customer360')
// So the helper functions can accept t directly — no rename needed

// ── Orders page ───────────────────────────────────────────────────────────
fixFile('src/app/[tenant]/orders/page.tsx', [
  { name: 'getPOStatusLabels', nsVar: 't', paramIdx: 0 },
  { name: 'getSOStatusLabels', nsVar: 't', paramIdx: 0 },
]);
// orders is single-namespace, t is already useTranslations('orders')

// ── TemplateGallery ───────────────────────────────────────────────────────
let tgContent = fs.readFileSync('src/components/workspace/TemplateGallery.tsx', 'utf8');
// Fix component prop type: t: ReturnType<typeof useTranslation> → t: any
// Already handled by the global replace above
// But also need to fix how these components use t
// ViewStructureViz and BlankPageCard receive t as prop, using t.workspace.xxx or tWorkspace('xxx')
tgContent = tgContent.replace(/ReturnType<typeof useTranslation>/g, 'any');
// These sub-components receive tWorkspace, not the old t
// Fix prop destructuring if needed
fs.writeFileSync('src/components/workspace/TemplateGallery.tsx', tgContent);

// ── SharePanel ────────────────────────────────────────────────────────────
let spContent = fs.readFileSync('src/components/workspace/SharePanel.tsx', 'utf8');
spContent = spContent.replace(/ReturnType<typeof useTranslation>/g, 'any');
fs.writeFileSync('src/components/workspace/SharePanel.tsx', spContent);

console.log('\nDone fixing helper functions!');
