const bcrypt = require('bcryptjs');
const store = require('./store');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

function signup({ email, password, shopName }) {
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  shopName = String(shopName || '').trim();

  if (!EMAIL_RE.test(email)) {
    throw Object.assign(new Error("Adresse email invalide."), { status: 400 });
  }
  if (password.length < 8) {
    throw Object.assign(
      new Error('Le mot de passe doit contenir au moins 8 caractères.'),
      { status: 400 }
    );
  }
  if (store.find('users', (u) => u.email === email)) {
    throw Object.assign(new Error('Un compte existe déjà avec cet email.'), {
      status: 409,
    });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = store.insert('users', { email, passwordHash, shopName });
  return publicUser(user);
}

function login({ email, password }) {
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  const user = store.find('users', (u) => u.email === email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    throw Object.assign(new Error('Email ou mot de passe incorrect.'), {
      status: 401,
    });
  }
  return publicUser(user);
}

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Authentification requise.' });
  }
  const user = store.find('users', (u) => u.id === req.session.userId);
  if (!user) {
    return res.status(401).json({ error: 'Session invalide.' });
  }
  req.user = user;
  next();
}

module.exports = { signup, login, requireAuth, publicUser };
