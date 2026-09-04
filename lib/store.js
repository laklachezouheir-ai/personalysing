// Point d'entrée unique de stockage utilisé par tout le reste de l'app.
// Bascule automatiquement entre deux backends selon la configuration :
//   - DATABASE_URL définie  -> PostgreSQL (lib/storePostgres.js), persistant
//   - DATABASE_URL absente  -> fichier JSON local (lib/storeJson.js),
//     filet de secours pour développer sans base de données à disposition
//     (voir README.md pour les limites de ce mode).
//
// L'API est volontairement 100% asynchrone (Promises), y compris quand le
// backend JSON — lui-même synchrone en interne — est actif : ça garantit
// que tout le code appelant (routes, middlewares) fonctionne à l'identique
// quel que soit le backend, et qu'un changement de backend ne demande
// aucune modification ailleurs dans l'app.
const jsonStore = require('./storeJson');

function backend() {
  if (process.env.DATABASE_URL) {
    // require() différé : évite de charger `pg` / d'initialiser un pool
    // de connexions quand ce backend n'est pas utilisé.
    return require('./storePostgres');
  }
  return jsonStore;
}

async function list(collection) {
  return backend().list(collection);
}

async function find(collection, predicate) {
  const items = await list(collection);
  return items.find(predicate) || null;
}

async function filter(collection, predicate) {
  const items = await list(collection);
  return items.filter(predicate);
}

async function insert(collection, item) {
  return backend().insert(collection, item);
}

async function update(collection, id, patch) {
  return backend().update(collection, id, patch);
}

async function remove(collection, id) {
  return backend().remove(collection, id);
}

function newId() {
  return backend().newId();
}

module.exports = {
  list,
  find,
  filter,
  insert,
  update,
  remove,
  newId,
  usingPostgres: Boolean(process.env.DATABASE_URL),
};
