// Stockage objet S3-compatible (Cloudflare R2, Backblaze B2, AWS S3,
// MinIO...) pour les fichiers binaires (photos de template, aperçus,
// mockups, vidéos générés). Contrairement aux données structurées
// (Postgres), ces fichiers restaient sur le disque local de l'app — donc
// perdus à chaque redéploiement/veille sur le plan Render gratuit, même
// une fois la base de données migrée.
//
// Recommandé : Cloudflare R2 (10 Go gratuits, aucun frais de sortie —
// contrairement à S3 où la bande passante sortante est facturée). Voir
// README.md pour la mise en place.
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

let client = null;

function isConfigured() {
  return Boolean(
    process.env.S3_ENDPOINT && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
  );
}

function getClient() {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'auto',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
      // Adressage par chemin (bucket.tld/objet plutôt que
      // bucket.endpoint.tld/objet) : requis par R2/MinIO, contrairement au
      // style "vhost" par défaut du SDK pensé pour AWS S3 lui-même.
      forcePathStyle: true,
    });
  }
  return client;
}

function bucket() {
  return process.env.S3_BUCKET;
}

async function uploadBuffer(key, buffer, contentType) {
  await getClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
}

async function getObjectBuffer(key) {
  const res = await getClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function getSignedGetUrl(key, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}

async function deleteObject(key) {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

module.exports = { isConfigured, uploadBuffer, getObjectBuffer, getSignedGetUrl, deleteObject };
