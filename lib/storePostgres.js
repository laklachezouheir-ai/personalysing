// Backend de stockage PostgreSQL — utilisé dès que DATABASE_URL est
// configurée. Modélise chaque "collection" (users, templates, previews...)
// comme des lignes JSONB dans une seule table générique : ça préserve le
// modèle de données souple hérité du prototype JSON (aucune migration de
// schéma à écrire à chaque nouveau champ), tout en apportant une vraie
// persistance indépendante du disque de l'app et une écriture atomique par
// ligne (contrairement au fichier JSON, où toute la base était réécrite à
// chaque opération).
//
// find()/filter() sont dérivés de list() dans lib/store.js (commun aux deux
// backends) : le filtrage se fait donc côté Node après récupération de la
// collection, pas en SQL. Suffisant tant que les collections restent de
// taille modeste ; si une collection grossit beaucoup (ex : aiUsage sur une
// grosse boutique), le premier levier d'optimisation est d'ajouter une
// vraie requête SQL indexée pour ce cas précis plutôt que de tout réécrire.
const { Pool } = require('pg');
const crypto = require('crypto');

let pool = null;
let schemaReady = null;

function getPool() {
  if (!pool) {
    const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // La plupart des Postgres hébergés (Neon, Supabase, Render...)
      // utilisent une chaîne de certificats que Node ne valide pas
      // toujours out-of-the-box ; rejectUnauthorized:false est la
      // pratique standard recommandée par ces fournisseurs pour `pg`.
      // Inutile (et non désirable) en local.
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS collections (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (collection, id)
      );
      CREATE INDEX IF NOT EXISTS idx_collections_collection
        ON collections (collection);
    `);
  }
  await schemaReady;
}

function newId() {
  return crypto.randomUUID();
}

async function list(collection) {
  await ensureSchema();
  const { rows } = await getPool().query(
    'SELECT data FROM collections WHERE collection = $1 ORDER BY created_at ASC',
    [collection]
  );
  return rows.map((r) => r.data);
}

async function insert(collection, item) {
  await ensureSchema();
  const record = { id: newId(), createdAt: new Date().toISOString(), ...item };
  await getPool().query(
    'INSERT INTO collections (collection, id, data) VALUES ($1, $2, $3)',
    [collection, record.id, JSON.stringify(record)]
  );
  return record;
}

async function update(collection, id, patch) {
  await ensureSchema();
  const { rows } = await getPool().query(
    'SELECT data FROM collections WHERE collection = $1 AND id = $2',
    [collection, id]
  );
  if (!rows.length) return null;
  const updated = { ...rows[0].data, ...patch, updatedAt: new Date().toISOString() };
  await getPool().query(
    'UPDATE collections SET data = $1 WHERE collection = $2 AND id = $3',
    [JSON.stringify(updated), collection, id]
  );
  return updated;
}

async function remove(collection, id) {
  await ensureSchema();
  const { rowCount } = await getPool().query(
    'DELETE FROM collections WHERE collection = $1 AND id = $2',
    [collection, id]
  );
  return rowCount > 0;
}

module.exports = { list, insert, update, remove, newId, getPool };
