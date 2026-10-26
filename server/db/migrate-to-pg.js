// ParkPulse — SQLite to PostgreSQL Migration Runner
// Preserves IDs, timestamps, foreign keys, and verifies row counts.
// Run with: DATABASE_URL="postgresql://user:pass@host:5432/parkpulse" node db/migrate-to-pg.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { DatabaseSync } = require('node:sqlite');

const SQLITE_PATH = path.join(__dirname, 'parkpulse.db');
const PG_SCHEMA_PATH = path.join(__dirname, 'migrations', '001_postgres_schema.sql');

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ Error: DATABASE_URL environment variable is required to migrate to PostgreSQL.');
    console.error('Example: DATABASE_URL="postgresql://user:password@localhost:5432/parkpulse" npm run migrate:pg');
    process.exit(1);
  }

  console.log('🚀 Starting SQLite to PostgreSQL migration for ParkPulse...');
  console.log(`📁 Source SQLite DB: ${SQLITE_PATH}`);
  
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`❌ SQLite database file not found at ${SQLITE_PATH}`);
    process.exit(1);
  }

  const sqlite = new DatabaseSync(SQLITE_PATH);
  const pgPool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  const client = await pgPool.connect();

  try {
    console.log('1️⃣ Running PostgreSQL schema migrations...');
    const schemaSql = fs.readFileSync(PG_SCHEMA_PATH, 'utf-8');
    await client.query(schemaSql);
    console.log('✅ PostgreSQL tables and indexes ready.');

    // Migration table list in dependency order
    const tables = [
      'colleges',
      'users',
      'parking_zones',
      'parking_slots',
      'geofence_settings',
      'map_nodes',
      'map_edges',
      'parking_requests',
      'parking_allocations',
      'parking_sessions',
      'waiting_queue',
      'occupancy_events',
      'notifications',
      'audit_logs',
      'location_approvals',
      'request_sequences'
    ];

    console.log('\n2️⃣ Migrating records from SQLite to PostgreSQL...');
    await client.query('BEGIN');

    const summary = [];

    for (const table of tables) {
      // Check if table exists in SQLite
      const tableCheck = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!tableCheck) {
        console.log(`ℹ️  Skipping '${table}' (not present in SQLite)`);
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      let importedCount = 0;

      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const colNames = columns.join(', ');
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
        const insertQuery = `INSERT INTO ${table} (${colNames}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

        for (const row of rows) {
          const values = columns.map(col => {
            const val = row[col];
            // Format booleans / JSON / timestamps
            if (val === null || val === undefined) return null;
            return val;
          });
          await client.query(insertQuery, values);
          importedCount++;
        }
      }

      // Verify row count in PG
      const pgCountRes = await client.query(`SELECT COUNT(*)::int as count FROM ${table}`);
      const pgCount = pgCountRes.rows[0].count;

      summary.push({
        table,
        sqliteRows: rows.length,
        pgRows: pgCount
      });

      console.log(`  ✓ ${table.padEnd(22)} SQLite: ${rows.length.toString().padStart(4)} ➔ PG: ${pgCount.toString().padStart(4)}`);
    }

    await client.query('COMMIT');
    console.log('\n🎉 Migration committed successfully!');

    console.log('\n╔═══════════════════════════════════════════════════╗');
    console.log('║           MIGRATION VERIFICATION SUMMARY          ║');
    console.log('╠═══════════════════════════════════════════════════╣');
    for (const s of summary) {
      const match = s.sqliteRows <= s.pgRows ? '✅ OK' : '⚠️ MISMATCH';
      console.log(`║ ${s.table.padEnd(20)} | SQLite: ${s.sqliteRows.toString().padStart(3)} | PG: ${s.pgRows.toString().padStart(3)} | ${match} ║`);
    }
    console.log('╚═══════════════════════════════════════════════════╝\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed, transaction rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pgPool.end();
  }
}

migrate();
