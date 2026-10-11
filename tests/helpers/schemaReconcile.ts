/**
 * Phase 38.2B: static reconciliation of PostgreSQL repository SQL against the versioned migrations.
 *
 * NO database is used. This parses the SQL text embedded in the repository sources and the DDL strings in
 * MIGRATIONS, then reports:
 *   - tables referenced by repositories that no migration creates
 *   - columns written/updated by repositories that the table does not define
 *   - NOT NULL columns without a default that an INSERT omits (would fail at runtime)
 *   - ON CONFLICT targets that are not defined columns
 * This is a static analysis: it does not prove the DDL executes on PostgreSQL.
 */
import fs from 'fs';
import { MIGRATIONS } from '../../server/persistence/migrations/schema';

export interface ColumnDef { name: string; notNull: boolean; hasDefault: boolean; primaryKey: boolean }
export type SchemaModel = Record<string, Record<string, ColumnDef>>;

export function buildSchemaModel(): SchemaModel {
  const model: SchemaModel = {};
  const ddl = MIGRATIONS.flatMap(m => m.up).join('\n');
  // CREATE TABLE
  const createRe = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\n\s*\);/g;
  let m: RegExpExecArray | null;
  while ((m = createRe.exec(ddl))) {
    const cols: Record<string, ColumnDef> = {};
    for (const raw of m[2].split('\n')) {
      const line = raw.trim().replace(/,$/, '');
      const cm = /^(\w+)\s+(TEXT|INTEGER|BIGSERIAL|BOOLEAN|DOUBLE PRECISION|TIMESTAMPTZ|JSONB)\b(.*)$/i.exec(line);
      if (!cm || /^(PRIMARY|UNIQUE|CONSTRAINT|CHECK|FOREIGN)$/i.test(cm[1])) continue;
      const rest = cm[3];
      cols[cm[1]] = {
        name: cm[1],
        primaryKey: /PRIMARY KEY/i.test(rest),
        notNull: /NOT NULL/i.test(rest) || /PRIMARY KEY/i.test(rest),
        hasDefault: /DEFAULT/i.test(rest) || /BIGSERIAL/i.test(cm[2])
      };
    }
    model[m[1]] = cols;
  }
  // ALTER TABLE ... ADD COLUMN IF NOT EXISTS (possibly several columns per statement)
  const alterRe = /ALTER TABLE (\w+)([\s\S]*?);/g;
  while ((m = alterRe.exec(ddl))) {
    const table = m[1];
    if (!model[table]) continue;
    const addRe = /ADD COLUMN IF NOT EXISTS (\w+) (TEXT|JSONB|INTEGER|BOOLEAN|TIMESTAMPTZ)([^,;]*)/gi;
    let a: RegExpExecArray | null;
    while ((a = addRe.exec(m[2]))) {
      model[table][a[1]] = {
        name: a[1],
        primaryKey: false,
        notNull: /NOT NULL/i.test(a[3]),
        hasDefault: /DEFAULT/i.test(a[3])
      };
    }
  }
  return model;
}

export interface ReconcileIssue { kind: string; table: string; detail: string; file: string }

export function reconcile(files: string[], extraTables: string[] = []): { issues: ReconcileIssue[]; tablesSeen: string[]; insertsChecked: number } {
  const model = buildSchemaModel();
  const issues: ReconcileIssue[] = [];
  const tablesSeen = new Set<string>();
  let insertsChecked = 0;

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    // Generic payload tables are declared via `new PayloadTable(client, 'name', ...)`
    const ptRe = /new PayloadTable\([^,]+,\s*'(\w+)'/g;
    let pm: RegExpExecArray | null;
    while ((pm = ptRe.exec(src))) {
      tablesSeen.add(pm[1]);
      if (!model[pm[1]]) issues.push({ kind: 'MISSING_TABLE', table: pm[1], detail: 'PayloadTable references a table that no migration creates', file });
    }

    const tableRefRe = /\b(?:FROM|INTO|UPDATE|DELETE FROM|JOIN)\s+([a-z_]+)\b/g;
    let tm: RegExpExecArray | null;
    while ((tm = tableRefRe.exec(src))) {
      const t = tm[1];
      if (['select', 'set', 'the', 'a', 'jsonb', 'where', 'values'].includes(t) || t === 'information_schema') continue;
      // only treat as SQL if the token follows an SQL-looking context (all-caps keyword) — regex above is case-sensitive
      tablesSeen.add(t);
      if (!model[t] && !extraTables.includes(t)) issues.push({ kind: 'MISSING_TABLE', table: t, detail: 'referenced by repository SQL but not created by any migration', file });
    }

    const insRe = /INSERT INTO (\w+)\s*\(([^)]*)\)/g;
    let im: RegExpExecArray | null;
    while ((im = insRe.exec(src))) {
      const table = im[1];
      const cols = im[2].split(',').map(c => c.trim()).filter(Boolean);
      if (!model[table]) continue;
      insertsChecked++;
      for (const c of cols) {
        if (!model[table][c]) issues.push({ kind: 'UNKNOWN_COLUMN', table, detail: `INSERT writes column "${c}" which the table does not define`, file });
      }
      for (const def of Object.values(model[table])) {
        if (def.notNull && !def.hasDefault && !cols.includes(def.name)) {
          issues.push({ kind: 'NOT_NULL_OMITTED', table, detail: `INSERT omits NOT NULL column "${def.name}" that has no default`, file });
        }
      }
    }

    const updRe = /UPDATE (\w+)\s+SET\s+([\s\S]*?)\s+WHERE/g;
    let um: RegExpExecArray | null;
    while ((um = updRe.exec(src))) {
      const table = um[1];
      if (!model[table]) continue;
      const setCols = Array.from(um[2].matchAll(/(?:^|,|\s)(\w+)\s*=/g)).map(x => x[1]);
      for (const c of setCols) {
        if (['EXCLUDED'].includes(c)) continue;
        if (!model[table][c]) issues.push({ kind: 'UNKNOWN_COLUMN', table, detail: `UPDATE sets column "${c}" which the table does not define`, file });
      }
    }

    const confRe = /INTO (\w+)(?:(?!INTO )[\s\S]){0,2500}?ON CONFLICT \((\w+)\)/g;
    let cm: RegExpExecArray | null;
    while ((cm = confRe.exec(src))) {
      if (model[cm[1]] && !model[cm[1]][cm[2]]) issues.push({ kind: 'UNKNOWN_CONFLICT_TARGET', table: cm[1], detail: `ON CONFLICT (${cm[2]}) is not a defined column`, file });
    }
  }
  return { issues, tablesSeen: Array.from(tablesSeen), insertsChecked };
}

/**
 * Row-mapper check: every `row.<col>` / `r.<col>` accessed inside a repository class must be a column of one of
 * the tables that class queries (catches mappers reading columns that were never created).
 */
export function reconcileRowAccess(file: string): ReconcileIssue[] {
  const model = buildSchemaModel();
  const src = fs.readFileSync(file, 'utf8');
  const issues: ReconcileIssue[] = [];
  const blocks = src.split(/\nexport class /).slice(1);
  for (const block of blocks) {
    const cls = block.split(' ')[0];
    const tables = Array.from(new Set(Array.from(block.matchAll(/\b(?:FROM|INTO|UPDATE)\s+([a-z_]+)\b/g)).map(m => m[1]))).filter(t => model[t]);
    if (tables.length === 0) continue;
    const allowed = new Set<string>();
    tables.forEach(t => Object.keys(model[t]).forEach(c => allowed.add(c)));
    // aggregate aliases produced by queries (COUNT(*) AS total, etc.)
    ['total', 'cnt', 'max_ver', 'health', 'health_check', 'payload'].forEach(a => allowed.add(a));
    for (const am of block.matchAll(/\b(?:row|r)\.([a-z_]+)\b/g)) {
      if (!allowed.has(am[1])) issues.push({ kind: 'UNKNOWN_ROW_FIELD', table: tables.join('|'), detail: `${cls} reads row.${am[1]} which is not a column of its tables`, file });
    }
  }
  return issues;
}
