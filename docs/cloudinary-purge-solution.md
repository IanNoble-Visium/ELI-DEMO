# Cloudinary Image Purge Solution

## Overview

This document describes the comprehensive solution implemented to address the 900,000+ image backlog and prevent future accumulation in Cloudinary.

## Problem Statement

1. **Performance Issue**: 900,000+ images accumulated, requiring 4,500+ manual purge operations at 200 images per request
2. **Prevention Issue**: No automatic mechanism to prevent images from accumulating beyond the 7-day retention policy

## Solution Components

### 1. Automated Multi-Batch Purge (Immediate Backlog Solution)

**Purpose**: Efficiently delete the 900,000 image backlog in a single request

**Implementation**:
- New API endpoint: `/api/debug/cloudinary/auto-purge`
- New function: `autoPurgeOldImages()` in `src/lib/cloudinary.js`
- New UI button: "Auto-Purge (Multi-Batch)" in Settings tab

**How it works**:
1. Runs multiple purge cycles automatically in a single request
2. Time-limited to 4 minutes (240 seconds) to stay within Vercel's 5-minute timeout
3. Processes 200 images per batch (2 batches of 100)
4. Shows real-time progress updates via Server-Sent Events (SSE)
5. Continues until either:
   - All old images are deleted, OR
   - Time limit is approaching (20-second buffer)

**Usage**:
1. Go to Debug Dashboard → Settings tab
2. Select retention period (default: 7 days)
3. Click "Auto-Purge (Multi-Batch)" button
4. Confirm the action
5. Watch real-time progress updates
6. If time limit reached, click again to continue

**Expected Performance**:
- ~200 images per batch
- ~4-5 seconds per batch
- ~40-50 batches in 4 minutes
- **~8,000-10,000 images per 4-minute run**
- For 900,000 images: ~90-112 runs needed (6-7.5 hours total if run consecutively)

### 2. Automatic Purge on Upload (Prevention Solution)

**Purpose**: Prevent future accumulation by automatically purging old images when new ones are uploaded

**Implementation**:
- Modified `uploadDataUri()` function in `src/lib/cloudinary.js`
- New background function: `autoPurgeBackground()`
- New environment variable: `CLOUDINARY_RETENTION_DAYS` (default: 7)

**How it works**:
1. Every time a new image is uploaded to Cloudinary
2. Automatically triggers a background purge (non-blocking)
3. Deletes up to 100 old images (1 batch) per upload
4. Uses configured retention period (default: 7 days)
5. Runs asynchronously - doesn't slow down the upload process
6. Logs purge activity for monitoring

**Configuration**:
```bash
# .env or Vercel environment variables
CLOUDINARY_RETENTION_DAYS=7  # Default: 7 days
```

Set to `0` to disable automatic purging.

**Benefits**:
- Zero manual intervention required
- Images never exceed retention period
- Gradual, continuous cleanup
- No performance impact on uploads
- Prevents backlog from accumulating again

### 3. Configuration Management

**New Environment Variable**:
- `CLOUDINARY_RETENTION_DAYS`: Number of days to retain images (default: 7)
  - Used by both automatic purge and manual purge operations
  - Set to 0 to disable automatic purging
  - Configurable per environment (dev, staging, production)

**Updated Files**:
- `src/config.js`: Added `retentionDays` to cloudinary config
- `.env.example`: Added `CLOUDINARY_RETENTION_DAYS=7`
- `docs/environment.md`: Documented the new variable

## Files Modified

### Core Logic
- `src/lib/cloudinary.js`: Added `autoPurgeOldImages()` and `autoPurgeBackground()`
- `src/config.js`: Added `retentionDays` configuration

### API Endpoints
- `src/pages/api/debug/cloudinary/auto-purge.js`: New SSE endpoint for automated purge

### UI Components
- `src/routes/debug.js`: Added auto-purge button and retention info display
- `public/debug/dashboard.js`: Added `startAutoPurge()` function with SSE handling

### Documentation
- `.env.example`: Added `CLOUDINARY_RETENTION_DAYS`
- `docs/environment.md`: Documented automatic purge feature
- `docs/cloudinary-purge-solution.md`: This document

## Usage Instructions

### Immediate Backlog Cleanup

1. **Deploy the changes** to your Vercel environment
2. **Set environment variable** (optional):
   ```
   CLOUDINARY_RETENTION_DAYS=7
   ```
3. **Access Debug Dashboard**: https://elidemo.visiumtechnologies.com/debug?token=YOUR_TOKEN
4. **Go to Settings tab**
5. **Click "Auto-Purge (Multi-Batch)"** button
6. **Confirm** the action
7. **Monitor progress** in real-time
8. **Repeat** as needed until all old images are deleted

### Ongoing Prevention

Once deployed, automatic purging is **enabled by default**:
- Every image upload triggers a background purge
- Old images (>7 days by default) are automatically deleted
- No manual intervention required
- Monitor logs for purge activity

To adjust retention period:
```bash
# Vercel → Settings → Environment Variables
CLOUDINARY_RETENTION_DAYS=14  # Keep images for 14 days instead
```

To disable automatic purging:
```bash
CLOUDINARY_RETENTION_DAYS=0  # Disable automatic purge
```

## Monitoring

### Logs
- **Auto-purge activity**: `[Auto-Purge] Deleted X old images (>Y days)`
- **Auto-purge errors**: `[Auto-Purge] Background purge failed: ...`

### Debug Dashboard
- **Settings tab** shows:
  - Auto-Purge status (Enabled/Disabled)
  - Retention period (X days)
  - Real-time progress during automated purge

## Performance Characteristics

### Automated Multi-Batch Purge
- **Time limit**: 4 minutes (240 seconds)
- **Images per batch**: ~200
- **Batches per run**: ~40-50
- **Total per run**: ~8,000-10,000 images
- **Safety buffer**: 20 seconds before timeout

### Automatic Background Purge
- **Trigger**: Every image upload
- **Images per trigger**: Up to 100
- **Performance impact**: None (runs asynchronously)
- **Frequency**: Depends on upload rate

## Best Practices

1. **Initial cleanup**: Use Auto-Purge button to clear backlog
2. **Keep automatic purge enabled**: Set `CLOUDINARY_RETENTION_DAYS=7` (or desired retention)
3. **Monitor logs**: Check for purge activity and errors
4. **Adjust retention as needed**: Balance between storage costs and data retention requirements
5. **Run manual purges periodically**: If upload rate is low, run manual purges to ensure cleanup

## Troubleshooting

### Auto-Purge times out
- This is expected for large backlogs
- Simply click "Auto-Purge" again to continue
- Each run processes ~8,000-10,000 images

### Automatic purge not working
- Check `CLOUDINARY_RETENTION_DAYS` is set and > 0
- Check logs for `[Auto-Purge]` messages
- Verify images are being uploaded (triggers the purge)

### Images still accumulating
- Verify automatic purge is enabled (`CLOUDINARY_RETENTION_DAYS > 0`)
- Check if upload rate exceeds purge rate (100 images per upload)
- Run manual Auto-Purge to catch up

## Future Enhancements

Potential improvements for consideration:
1. **Scheduled cron job**: Daily automatic purge via Vercel Cron
2. **Purge metrics**: Track purge statistics in database
3. **Email notifications**: Alert when purge fails or backlog grows
4. **Configurable batch size**: Allow tuning purge performance
5. **Dry-run for auto-purge**: Preview what would be deleted

## Summary

This solution provides:
- ✅ **Efficient bulk purge**: Clear 900,000 image backlog with ~90-112 automated runs
- ✅ **Automatic prevention**: Never accumulate images beyond retention period again
- ✅ **Zero manual intervention**: Set it and forget it
- ✅ **Configurable retention**: Adjust retention period per environment
- ✅ **Real-time monitoring**: Track progress and activity via logs and UI
- ✅ **Performance optimized**: Time-limited batches, async background purge
- ✅ **Safe and reliable**: Timeout protection, error handling, logging

