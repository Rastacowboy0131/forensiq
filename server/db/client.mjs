import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

function databasePathFromUrl(databaseUrl, rootDir) {
  const raw = databaseUrl || 'file:./data/hoodscan.sqlite';
  if (raw.startsWith('file:')) {
    const value = raw.slice('file:'.length);
    return path.isAbsolute(value) ? value : path.join(rootDir, value);
  }
  if (path.isAbsolute(raw)) return raw;
  return path.join(rootDir, raw);
}

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return `"${name}"`;
}

function sqlLiteral(value) {
  if (value === undefined || value === null) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'object') value = JSON.stringify(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function bind(sql, params = []) {
  let index = 0;
  const bound = sql.replace(/\?/g, () => {
    if (index >= params.length) throw new Error(`Missing SQL parameter for: ${sql}`);
    return sqlLiteral(params[index++]);
  });
  if (index !== params.length) throw new Error(`Too many SQL parameters for: ${sql}`);
  return bound;
}

export function createDbClient(config) {
  const dbPath = databasePathFromUrl(config.databaseUrl, config.rootDir);
  const schemaPath = path.join(config.rootDir, 'server/db/schema.sql');

  function ensureReady() {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    if (!existsSync(schemaPath)) throw new Error(`Missing schema at ${schemaPath}`);
    execFileSync('sqlite3', [dbPath], { input: readFileSync(schemaPath), encoding: 'utf8' });
  }

  function run(sql, params = []) {
    ensureReady();
    execFileSync('sqlite3', ['-batch', dbPath, `${bind(sql, params)};`], { encoding: 'utf8' });
  }

  function all(sql, params = []) {
    ensureReady();
    const output = execFileSync('sqlite3', ['-json', dbPath, `${bind(sql, params)};`], { encoding: 'utf8' }).trim();
    return output ? JSON.parse(output) : [];
  }

  function get(sql, params = []) {
    return all(sql, params)[0] || null;
  }

  function upsert(table, keyColumns, row) {
    const columns = Object.keys(row).filter(column => row[column] !== undefined);
    const placeholders = columns.map(() => '?').join(', ');
    const conflict = keyColumns.map(quoteIdent).join(', ');
    const updates = columns
      .filter(column => !keyColumns.includes(column))
      .map(column => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
      .join(', ');
    const sql = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) VALUES (${placeholders}) ON CONFLICT (${conflict}) DO UPDATE SET ${updates || `${quoteIdent(keyColumns[0])} = excluded.${quoteIdent(keyColumns[0])}`}`;
    run(sql, columns.map(column => row[column]));
  }

  function insert(table, row) {
    const columns = Object.keys(row).filter(column => row[column] !== undefined);
    const sql = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
    run(sql, columns.map(column => row[column]));
  }

  function count(table) {
    return get(`SELECT COUNT(*) AS count FROM ${quoteIdent(table)}`)?.count || 0;
  }

  return { dbPath, schemaPath, ensureReady, run, all, get, upsert, insert, count };
}
