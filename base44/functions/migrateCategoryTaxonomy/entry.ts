/**
 * Phase 3 — Category Taxonomy Migration
 *
 * Steps performed (idempotent — safe to re-run):
 * 1. Snapshot all entities with category values to their backup entities
 * 2. Migrate Source.category → canonical keys (set category_ai_proposed)
 * 3. Migrate GlobalTrend.category → canonical keys
 * 4. Migrate ExpertExample.category → canonical keys
 * 5. Migrate Project.category → canonical keys
 *
 * Cross-category sources ("Other Food Applications"): category → null,
 * category_ai_proposed preserved, category_relevance[] unchanged.
 *
 * Admin-only. Returns a detailed summary per entity.
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── Inline canonical mapping (cannot import lib/ from functions) ────────────

const VALID_CATEGORY_VALUES = [
  'bakery', 'condiments', 'chocolate_confectionery', 'dairy',
  'ice_cream', 'meat', 'oils_fats', 'plant_based', 'rutf_rusf',
  'out_of_scope', 'needs_human_review',
];

// Legacy Source.category (12-value) → canonical
const LEGACY_SOURCE = {
  'Bakery':                   'bakery',
  'Confectionery':            'chocolate_confectionery',
  'Dairy':                    'dairy',
  'Ice Cream':                'ice_cream',
  'Meat':                     'meat',
  'Lipid':                    'oils_fats',
  'Feed':                     'out_of_scope',
  'Fine Food':                'needs_human_review',
  'PCI':                      'out_of_scope',
  'Polymer':                  'out_of_scope',
  'Tech':                     'out_of_scope',
  'Other Food Applications':  '__cross_category__', // null + preserve category_relevance
};

// Legacy GlobalTrend / ExpertExample.category (7-value) → canonical
const LEGACY_TREND = {
  'Ice Cream':     'ice_cream',
  'Dairy':         'dairy',
  'Confectionery': 'chocolate_confectionery',
  'Bakery':        'bakery',
  'Spreads':       'needs_human_review',
  'Dressings':     'condiments',
  'Other':         'needs_human_review',
};

function migrateSourceCategory(legacyValue) {
  if (!legacyValue) return { canonical: null, isCrossCategory: false };
  if (VALID_CATEGORY_VALUES.includes(legacyValue)) {
    return { canonical: legacyValue, isCrossCategory: false }; // already migrated
  }
  const mapped = LEGACY_SOURCE[legacyValue];
  if (mapped === '__cross_category__') return { canonical: null, isCrossCategory: true };
  return { canonical: mapped || 'needs_human_review', isCrossCategory: false };
}

function migrateTrendCategory(legacyValue) {
  if (!legacyValue) return null;
  if (VALID_CATEGORY_VALUES.includes(legacyValue)) return legacyValue; // already migrated
  return LEGACY_TREND[legacyValue] || 'needs_human_review';
}

// Brief free-text → canonical (for Project.category coming from convertBriefToProject)
const BRIEF_NORM = {
  'confectionery': 'chocolate_confectionery',
  'chocolate': 'chocolate_confectionery',
  'chocolate confectionery': 'chocolate_confectionery',
  'chocolate & confectionery': 'chocolate_confectionery',
  'bakery': 'bakery',
  'cake': 'bakery',
  'cake gels': 'bakery',
  'dairy': 'dairy',
  'ice cream': 'ice_cream',
  'ice-cream': 'ice_cream',
  'meat': 'meat',
  'processed meat': 'meat',
  'oils': 'oils_fats',
  'oils & fats': 'oils_fats',
  'fats': 'oils_fats',
  'plant based': 'plant_based',
  'plant-based': 'plant_based',
  'plant based products': 'plant_based',
  'rutf': 'rutf_rusf',
  'rusf': 'rutf_rusf',
  'rutf and rusf': 'rutf_rusf',
  'condiments': 'condiments',
};

function migrateProjectCategory(rawValue) {
  if (!rawValue) return 'needs_human_review';
  if (VALID_CATEGORY_VALUES.includes(rawValue)) return rawValue; // already migrated
  // Try legacy Source map first
  const fromSource = LEGACY_SOURCE[rawValue];
  if (fromSource && fromSource !== '__cross_category__') return fromSource;
  // Try brief normalization map
  const fromBrief = BRIEF_NORM[rawValue.trim().toLowerCase()];
  if (fromBrief) return fromBrief;
  return 'needs_human_review';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const svc = base44.asServiceRole;
    const now = new Date().toISOString();
    const summary = {
      source: { backed_up: 0, migrated: 0, cross_category: 0, already_canonical: 0, errors: [] },
      global_trend: { backed_up: 0, migrated: 0, already_canonical: 0, errors: [] },
      expert_example: { backed_up: 0, migrated: 0, already_canonical: 0, errors: [] },
      project: { backed_up: 0, migrated: 0, already_canonical: 0, errors: [] },
    };

    // ── 1. Sources ──────────────────────────────────────────────────────────
    console.log('[migrateCategoryTaxonomy] Migrating Sources...');
    const sources = await svc.entities.Source.list('-created_date', 500);
    for (const s of sources) {
      if (!s.category) continue; // null already — skip
      const { canonical, isCrossCategory } = migrateSourceCategory(s.category);

      // Backup
      try {
        await svc.entities.SourceCategoryBackup.create({
          source_id: s.id,
          title: s.title || '',
          category_original: s.category,
          backed_up_at: now,
        });
        summary.source.backed_up++;
      } catch (_) {} // idempotent — may already exist

      if (VALID_CATEGORY_VALUES.includes(s.category)) {
        summary.source.already_canonical++;
        continue;
      }

      try {
        const updatePayload = { category_ai_proposed: s.category };
        if (isCrossCategory) {
          updatePayload.category = null;
          summary.source.cross_category++;
        } else {
          updatePayload.category = canonical;
          summary.source.migrated++;
        }
        await svc.entities.Source.update(s.id, updatePayload);
      } catch (e) {
        summary.source.errors.push(`${s.id}: ${e.message}`);
      }
    }

    await sleep(500);

    // ── 2. GlobalTrends ─────────────────────────────────────────────────────
    console.log('[migrateCategoryTaxonomy] Migrating GlobalTrends...');
    const trends = await svc.entities.GlobalTrend.list('-created_date', 200);
    for (const t of trends) {
      if (!t.category) continue;
      const canonical = migrateTrendCategory(t.category);

      try {
        await svc.entities.GlobalTrendCategoryBackup.create({
          global_trend_id: t.id,
          trend_name: t.trend_name || '',
          category_original: t.category,
          backed_up_at: now,
        });
        summary.global_trend.backed_up++;
      } catch (_) {}

      if (VALID_CATEGORY_VALUES.includes(t.category)) {
        summary.global_trend.already_canonical++;
        continue;
      }

      try {
        await svc.entities.GlobalTrend.update(t.id, {
          category: canonical,
          category_ai_proposed: t.category,
        });
        summary.global_trend.migrated++;
      } catch (e) {
        summary.global_trend.errors.push(`${t.id} ${t.trend_name}: ${e.message}`);
      }
    }

    await sleep(500);

    // ── 3. ExpertExamples ───────────────────────────────────────────────────
    console.log('[migrateCategoryTaxonomy] Migrating ExpertExamples...');
    const examples = await svc.entities.ExpertExample.list('-extracted_at', 500);
    for (const ex of examples) {
      if (!ex.category) continue;
      const canonical = migrateTrendCategory(ex.category);

      try {
        await svc.entities.ExpertExampleCategoryBackup.create({
          expert_example_id: ex.id,
          product_name: ex.product_name || '',
          category_original: ex.category,
          backed_up_at: now,
        });
        summary.expert_example.backed_up++;
      } catch (_) {}

      if (VALID_CATEGORY_VALUES.includes(ex.category)) {
        summary.expert_example.already_canonical++;
        continue;
      }

      try {
        await svc.entities.ExpertExample.update(ex.id, {
          category: canonical,
          category_ai_proposed: ex.category,
        });
        summary.expert_example.migrated++;
      } catch (e) {
        summary.expert_example.errors.push(`${ex.id}: ${e.message}`);
      }
    }

    await sleep(500);

    // ── 4. Projects ─────────────────────────────────────────────────────────
    console.log('[migrateCategoryTaxonomy] Migrating Projects...');
    const projects = await svc.entities.Project.list('-created_date', 200);
    for (const p of projects) {
      if (!p.category) continue;
      const canonical = migrateProjectCategory(p.category);

      try {
        await svc.entities.ProjectCategoryBackup.create({
          project_id: p.id,
          name: p.name || '',
          category_original: p.category,
          backed_up_at: now,
        });
        summary.project.backed_up++;
      } catch (_) {}

      if (VALID_CATEGORY_VALUES.includes(p.category)) {
        summary.project.already_canonical++;
        continue;
      }

      try {
        await svc.entities.Project.update(p.id, {
          category: canonical,
          category_ai_proposed: p.category,
        });
        summary.project.migrated++;
      } catch (e) {
        summary.project.errors.push(`${p.id} ${p.name}: ${e.message}`);
      }
    }

    console.log('[migrateCategoryTaxonomy] Done:', JSON.stringify(summary));
    return Response.json({ success: true, summary });

  } catch (error) {
    console.error('[migrateCategoryTaxonomy] Fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});