#!/usr/bin/env node
// Generate README.md for awesome-b2b-mcp from the live Revuo MCP directory.
//
// The list is a *build artifact* of Revuo's public data, not a hand-maintained
// file — re-run this to resync. No dependencies; needs Node 18+ (global fetch).
//
//   node generate.mjs            # writes ./README.md
//   REVUO_API=… node generate.mjs
//
// See PLANS/Revuo/github-parasite-play.md in the Autarky repo for the why.

import { writeFileSync } from 'node:fs';

const API = process.env.REVUO_API ?? 'https://www.revuo.ai';
const SITE = 'https://www.revuo.ai';
const PAGE = 100;

async function fetchJson(path) {
  const res = await fetch(`${API}${path}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchAllServers() {
  const all = [];
  for (let skip = 0; ; skip += PAGE) {
    const page = await fetchJson(`/api/mcp-directory?skip=${skip}&limit=${PAGE}`);
    all.push(...page.servers);
    if (all.length >= page.total || page.servers.length === 0) return all;
  }
}

/** Escape the markdown/HTML metacharacters that would break an inline list item or link label. */
function esc(s) {
  return String(s ?? '')
    .replace(/\r?\n+/g, ' ')
    .replace(/([\\`*_[\]<>|])/g, '\\$1')
    .trim();
}

/** GitHub's heading-anchor slugification (lowercase, drop punctuation, spaces → hyphens). */
function anchor(text) {
  return text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}

function titleCase(slug) {
  return slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

function listingUrl(s) {
  return `${SITE}/category/${s.categorySlug}/${s.productSlug}`;
}

function entryLine(s) {
  const name = esc(s.productName || s.displayName || s.productSlug);
  const tagline = esc(s.productTagline || s.description || '');
  const tools = s.toolCount || s.totalToolCount || 0;
  const meta = [];
  if (tools > 0) meta.push(`\`${tools} tool${tools === 1 ? '' : 's'}\``);
  if (s.isRemoteCapable) meta.push('remote');
  if (s.isVerified) meta.push('✓ verified');
  const desc = tagline ? ` — ${tagline}` : '';
  const tail = meta.length ? ` · ${meta.join(' · ')}` : '';
  return `- **[${name}](${listingUrl(s)})**${desc}${tail}`;
}

function buildReadme(servers, catName, date) {
  // Group by category
  const groups = new Map();
  for (const s of servers) {
    const key = s.categorySlug || 'uncategorized';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  const sections = [...groups.entries()]
    .map(([slug, items]) => ({ slug, name: catName[slug] || titleCase(slug), items }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name));

  // Verified first, then most capable, then name — within each category.
  for (const sec of sections) {
    sec.items.sort(
      (a, b) =>
        Number(b.isVerified) - Number(a.isVerified) ||
        (b.toolCount || 0) - (a.toolCount || 0) ||
        (a.productName || '').localeCompare(b.productName || ''),
    );
  }

  const verified = servers.filter((s) => s.isVerified).length;
  const out = [];

  out.push('# awesome-b2b-mcp');
  out.push('');
  out.push(
    'A curated, always-current list of **B2B SaaS products that expose an agent-callable ' +
      'MCP server** — grouped by category, each linking to its continuously-verified listing.',
  );
  out.push('');
  out.push(`**Auto-synced from [Revuo](${SITE}) · last updated ${date}.**`);
  out.push('');
  out.push(
    `${servers.length} products across ${sections.length} categories · ${verified} with a ` +
      'verified vendor claim. This file is generated from Revuo\'s public directory API — ' +
      'to refresh it, run `node generate.mjs`.',
  );
  out.push('');
  out.push(
    '> Why this exists: general `awesome-mcp-servers` lists catalogue OSS and dev-tool ' +
      'servers. This one tracks **commercial B2B SaaS** with MCP endpoints — what an agent ' +
      'builder or procurement researcher actually searches for. Listings are neutral and ' +
      'complete: competitors and vendor-operated products alike, ranked only by verified ' +
      'signals (claim status, then tool count). The linked Revuo page is the citable source ' +
      'of truth for each — capabilities, access model, and any operator affiliation.',
  );
  out.push('');

  // TOC
  out.push('## Contents');
  out.push('');
  for (const sec of sections) {
    out.push(`- [${esc(sec.name)}](#${anchor(sec.name)}) (${sec.items.length})`);
  }
  out.push('');

  // Sections
  for (const sec of sections) {
    out.push(`## ${esc(sec.name)}`);
    out.push('');
    for (const s of sec.items) out.push(entryLine(s));
    out.push('');
  }

  // Footer
  out.push('---');
  out.push('');
  out.push(
    '### About the data\n\n' +
      `Every entry links to its [Revuo](${SITE}) listing, where the MCP endpoint is probed ` +
      'and re-verified over time. "✓ verified" means the vendor has a verified claim on the ' +
      'listing; "remote" means the server is reachable over HTTP (agent-callable without ' +
      'local install). Tool counts and taglines come straight from the directory.\n',
  );
  out.push(
    '### Contributing\n\n' +
      "Don't edit `README.md` by hand — it's regenerated. To get a product listed (or to " +
      `claim and verify an existing one), add it on [Revuo](${SITE}/vendor); the next sync ` +
      'picks it up automatically.\n',
  );
  out.push('### License\n\n[CC0-1.0](LICENSE) — public domain. Data © the respective vendors.');
  out.push('');

  return out.join('\n');
}

const [servers, cats] = await Promise.all([fetchAllServers(), fetchJson('/api/categories')]);
const catName = Object.fromEntries(cats.map((c) => [c.slug, c.name]));
const date = new Date().toISOString().slice(0, 10);
const readme = buildReadme(servers, catName, date);
writeFileSync(new URL('./README.md', import.meta.url), readme);
console.log(`Wrote README.md — ${servers.length} products, ${new Set(servers.map((s) => s.categorySlug)).size} categories.`);
