const { v2: cloudinary } = require('cloudinary');
const config = require('../config');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

async function uploadDataUri(dataUri, publicId) {
  // Check if Cloudinary is enabled
  if (!config.cloudinary.enabled) {
    return null;
  }

  const res = await cloudinary.uploader.upload(dataUri, {
    folder: config.cloudinary.folder,
    public_id: publicId,
    overwrite: true,
  });
  return res.secure_url;
}

/**
 * Purge images older than specified days from Cloudinary
 * @param {number} days - Delete images older than this many days
 * @param {boolean} dryRun - If true, only return what would be deleted without deleting
 * @param {number} maxBatches - Maximum number of batches to process (default: 2, max 200 images)
 * @returns {Promise<{deleted: number, sample: string[], total: number, hasMore: boolean}>}
 */
async function purgeOldImages(days = 7, dryRun = false, maxBatches = 2) {
  const folder = config.cloudinary.folder || '';
  const prefix = folder ? (folder.endsWith('/') ? folder : folder + '/') : '';
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  const cutoffTimestamp = cutoffDate.getTime();

  let toDelete = [];
  let cursor;
  let batchesFetched = 0;
  const maxFetchBatches = Math.max(1, maxBatches); // At least 1 batch

  // Fetch resources in limited batches to avoid timeout
  do {
    const result = await cloudinary.api.resources({
      type: 'upload',
      resource_type: 'image',
      prefix,
      max_results: 100, // Smaller batches for faster processing
      next_cursor: cursor,
    });

    const resources = result?.resources || [];

    // Filter resources older than cutoff date
    const oldResources = resources.filter(r => {
      const createdAt = new Date(r.created_at).getTime();
      return createdAt < cutoffTimestamp;
    });

    toDelete.push(...oldResources.map(r => r.public_id));
    cursor = result?.next_cursor;
    batchesFetched++;

    // Stop after processing maxBatches to avoid timeout
    if (batchesFetched >= maxFetchBatches) {
      break;
    }
  } while (cursor);

  const total = toDelete.length;
  const sample = toDelete.slice(0, 10);
  const hasMore = cursor !== null && cursor !== undefined;

  if (dryRun || total === 0) {
    return { deleted: 0, sample, total, dryRun: true, hasMore };
  }

  // Delete in batches of 100 (Cloudinary API limit)
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    try {
      const delResult = await cloudinary.api.delete_resources(batch, {
        type: 'upload',
        resource_type: 'image',
        invalidate: true,
      });
      const ok = delResult?.deleted
        ? Object.values(delResult.deleted).filter(v => v === 'deleted' || v === 'queued').length
        : 0;
      deleted += ok;
    } catch (err) {
      console.error('Error deleting batch:', err.message);
    }
  }

  return { deleted, sample, total, dryRun: false, hasMore };
}

module.exports = { cloudinary, uploadDataUri, purgeOldImages };

