// Pulls the live `public` schema DDL from Supabase (via the Management API's
// SQL-query endpoint, using SUPABASE_ACCESS_TOKEN — no DB password needed)
// and overwrites web/supabase/schema.sql. Run after making changes in the
// Supabase SQL editor, to keep schema.sql as accurate documentation.
// Run: npm run sync:schema

import { config as loadEnvLocal } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvLocal({ path: path.join(__dirname, "..", ".env.local") });

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!accessToken) throw new Error("SUPABASE_ACCESS_TOKEN not set in .env.local");
if (!projectUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL not set in .env.local");

const projectRef = new URL(projectUrl).hostname.split(".")[0];

async function runQuery(query: string): Promise<any[]> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );
  if (!res.ok) throw new Error(`Supabase query failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// One query, built from pg_catalog, that reconstructs `create table` DDL
// (columns, types, defaults, not-null, check/PK/FK constraints) plus RLS
// enable state and any policies, for every table in the public schema.
const DUMP_QUERY = `
with cols as (
  select
    c.oid,
    c.relname as table_name,
    string_agg(
      format(
        '  %I %s%s%s',
        a.attname,
        pg_catalog.format_type(a.atttypid, a.atttypmod),
        case when a.attnotnull then ' not null' else '' end,
        case when d.adbin is not null
          then ' default ' || pg_get_expr(d.adbin, d.adrelid)
          else '' end
      ),
      E',\\n' order by a.attnum
    ) as column_defs
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind = 'r'
  group by c.oid, c.relname
),
constraints as (
  select
    conrelid as oid,
    string_agg('  constraint ' || conname || ' ' || pg_get_constraintdef(oid), E',\\n' order by conname) as constraint_defs
  from pg_constraint
  where connamespace = 'public'::regnamespace
  group by conrelid
),
rls as (
  select oid, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'
),
policies as (
  select
    tablename,
    string_agg(
      format(
        'create policy %I on %I for %s to %s%s%s;',
        policyname, tablename, cmd,
        array_to_string(roles, ', '),
        case when qual is not null then ' using (' || qual || ')' else '' end,
        case when with_check is not null then ' with check (' || with_check || ')' else '' end
      ),
      E'\\n'
    ) as policy_defs
  from pg_policies
  where schemaname = 'public'
  group by tablename
)
select
  cols.table_name,
  format(
    E'create table if not exists %I (\\n%s\\n);',
    cols.table_name,
    cols.column_defs || coalesce(E',\\n' || constraints.constraint_defs, '')
  ) as create_stmt,
  rls.relrowsecurity as rls_enabled,
  policies.policy_defs
from cols
join rls on rls.oid = cols.oid
left join constraints on constraints.oid = cols.oid
left join policies on policies.tablename = cols.table_name
order by cols.table_name;
`;

const rows = await runQuery(DUMP_QUERY);

const parts: string[] = [
  "-- Auto-generated from the live Supabase project via `npm run sync:schema`.",
  "-- Do not hand-edit — change the DB (SQL editor / migration), then re-run the sync.",
  "",
];

for (const row of rows) {
  parts.push(row.create_stmt, "");
}
for (const row of rows) {
  if (row.rls_enabled) parts.push(`alter table ${row.table_name} enable row level security;`);
}
parts.push("");
for (const row of rows) {
  if (row.policy_defs) parts.push(row.policy_defs, "");
}

const outPath = path.join(__dirname, "..", "supabase", "schema.sql");
writeFileSync(outPath, parts.join("\n").trimEnd() + "\n");
console.log(`Wrote ${outPath} (${rows.length} tables)`);
