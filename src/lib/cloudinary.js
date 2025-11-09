const { v2: cloudinary } = require('cloudinary');
const config = require('../config');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key: config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

/**
 * Automatic background purge - deletes a small batch of old images
 * This runs asynchronously and doesn't block the upload
 * @param {number} retentionDays - Delete images older than this many days
 */
async function autoPurgeBackground(retentionDays) {
  try {
    // Small batch to avoid slowing down uploads (50 images max)
    const result = await purgeOldImages(retentionDays, false, 1);
    if (result.deleted > 0) {
      console.log(`[Auto-Purge] Deleted ${result.deleted} old images (>${retentionDays} days)`);
    }
  } catch (err) {
    console.error('[Auto-Purge] Background purge failed:', err.message);
    // Don't throw - this is a background operation
  }
}

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

  // Trigger automatic purge in background (non-blocking)
  const retentionDays = config.cloudinary.retentionDays;
  if (retentionDays > 0) {
    // Fire and forget - don't await
    autoPurgeBackground(retentionDays).catch(err => {
      console.error('[Auto-Purge] Error:', err);
    });
  }

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

/**
 * Automated multi-batch purge that runs until time limit or all images deleted
 * @param {number} days - Delete images older than this many days
 * @param {number} maxTimeSeconds - Maximum time to run (default: 240 seconds = 4 minutes)
 * @param {function} progressCallback - Optional callback for progress updates
 * @returns {Promise<{totalDeleted: number, batchesRun: number, timeElapsed: number, completed: boolean}>}
 */
async function autoPurgeOldImages(days = 7, maxTimeSeconds = 240, progressCallback = null) {
  const startTime = Date.now();
  const maxTimeMs = maxTimeSeconds * 1000;
  let totalDeleted = 0;
  let batchesRun = 0;
  let hasMore = true;

  while (hasMore) {
    // Check if we're approaching time limit (leave 20 second buffer)
    const elapsed = Date.now() - startTime;
    if (elapsed > maxTimeMs - 20000) {
      console.log(`Auto-purge stopping: approaching time limit (${elapsed}ms elapsed)`);
      break;
    }

    // Run one batch (2 batches of 100 = 200 images)
    const result = await purgeOldImages(days, false, 2);
    totalDeleted += result.deleted;
    batchesRun++;
    hasMore = result.hasMore;

    // Send progress update
    if (progressCallback) {
      progressCallback({
        batch: batchesRun,
        deleted: result.deleted,
        totalDeleted,
        hasMore,
        timeElapsed: Math.round(elapsed / 1000),
      });
    }

    console.log(`Auto-purge batch ${batchesRun}: deleted ${result.deleted}, total ${totalDeleted}, hasMore: ${hasMore}`);

    // If no more images, we're done
    if (!hasMore || result.deleted === 0) {
      break;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const timeElapsed = Math.round((Date.now() - startTime) / 1000);
  return {
    totalDeleted,
    batchesRun,
    timeElapsed,
    completed: !hasMore,
  };
}

module.exports = { cloudinary, uploadDataUri, purgeOldImages, autoPurgeOldImages };

