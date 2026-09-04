// Stockage simple basé sur un fichier JSON local (suffisant pour un MVP à
// faible trafic). À remplacer par une vraie base de données (Postgres,
// SQLite...) une fois la traction validée — voir README.md.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const EMPTY_DB = {
  users: [],
  shops: [],
  templates: [],
  previews: [],
};

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(EMPTY_DB, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  try {
    return { ...EMPTY_DB, ...JSON.parse(raw) };
  } catch {
    return { ...EMPTY_DB };
  }
}

function writeDb(db) {
  ensureDb();
  // Écriture atomique : on écrit dans un fichier temporaire puis on renomme,
  // pour éviter un fichier corrompu si le process s'arrête au milieu.
  const tmpFile = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2));
  fs.renameSync(tmpFile, DB_FILE);
}

function newId() {
  return crypto.randomUUID();
}

function list(collection) {
  const db = readDb();
  return db[collection] || [];
}

function find(collection, predicate) {
  return list(collection).find(predicate) || null;
}

function filter(collection, predicate) {
  return list(collection).filter(predicate);
}

function insert(collection, item) {
  const db = readDb();
  const record = { id: newId(), createdAt: new Date().toISOString(), ...item };
  db[collection] = db[collection] || [];
  db[collection].push(record);
  writeDb(db);
  return record;
}

function update(collection, id, patch) {
  const db = readDb();
  const items = db[collection] || [];
  const idx = items.findIndex((it) => it.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...patch, updatedAt: new Date().toISOString() };
  writeDb(db);
  return items[idx];
}

function remove(collection, id) {
  const db = readDb();
  const items = db[collection] || [];
  const next = items.filter((it) => it.id !== id);
  const removed = next.length !== items.length;
  db[collection] = next;
  if (removed) writeDb(db);
  return removed;
}

module.exports = { list, find, filter, insert, update, remove, newId };
