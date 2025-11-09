# Auto-Purge Quick Start Guide

## What's New?

The Auto-Purge system now runs **continuously and automatically** without manual intervention!

### Before (Old Way)
- Click "Auto-Purge" → runs 4 minutes → stops
- Need to click again to continue
- 900,000 images = ~90-112 manual clicks 😞

### Now (New Way)
- Click "Auto-Purge" once → runs continuously
- Automatically pauses 1 minute between cycles
- Stops automatically when done
- 900,000 images = 1 click, ~12-15 hours ✅

## Quick Start

### Step 1: Access Debug Dashboard
```
https://elidemo.visiumtechnologies.com/debug?token=YOUR_TOKEN
```

### Step 2: Go to Settings Tab
Click the **Settings** tab in the Debug Dashboard

### Step 3: Click Auto-Purge Button
Click the orange **"Auto-Purge (Multi-Batch)"** button

### Step 4: Confirm
- Read the warning
- Click "OK" to confirm
- **Cannot be undone!**

### Step 5: Watch Progress
The system will:
1. Run 4-minute purge cycle
2. Show real-time progress
3. Pause 1 minute (countdown shown)
4. Repeat until all old images deleted
5. Stop automatically

## Real-Time Progress Display

```
Cycle 1, Batch 5: Deleted 200 images
Cycle total: 1000 | Global total: 1000
Time elapsed: 45s (cycle) / 45s (total) | More images: Yes

[After 4 minutes...]

Pausing between cycles...
Cycle 1 complete. Resuming in 45 seconds...
Global total deleted: 10000
Total time elapsed: 240s

[Cycle 2 starts...]

Cycle 2, Batch 1: Deleted 200 images
Cycle total: 200 | Global total: 10200
Time elapsed: 9s (cycle) / 249s (total) | More images: Yes
```

## How to Stop

### Option 1: Stop Button
- Click **"Stop Auto-Purge"** button (appears during purge)
- Current cycle completes, then stops
- Can restart by clicking "Auto-Purge" again

### Option 2: Close Browser Tab
- Close the Debug Dashboard tab
- Purge stops immediately
- Can restart by clicking "Auto-Purge" again

## Performance

### Per Cycle (4 minutes)
- ~8,000-10,000 images deleted
- ~40-50 batches processed
- 1-minute pause after

### For Large Backlog
- 900,000 images = ~90-112 cycles
- **Total time: ~12-15 hours**
- Can run continuously or stop/restart

## Important Notes

✅ **Keep browser tab open** - Purge runs in browser, not server

✅ **Can stop anytime** - Click "Stop Auto-Purge" button

✅ **Automatic pauses** - 1-minute pause between cycles prevents rate limiting

✅ **Real-time monitoring** - Watch progress with cycle and batch numbers

✅ **Cumulative totals** - See total images deleted across all cycles

❌ **Don't close tab** - Closing stops the purge (but you can restart)

❌ **Don't refresh page** - Refreshing stops the purge (but you can restart)

## Troubleshooting

### "Auto-purge is already running"
- Another purge is in progress
- Wait for it to complete or click "Stop Auto-Purge"

### Progress stopped updating
- Check browser console for errors
- Verify Debug Dashboard token is correct
- Try refreshing and starting again

### Want to stop
- Click "Stop Auto-Purge" button
- Or close the browser tab

### Want to restart
- Click "Auto-Purge" button again
- Starts from beginning (progress not saved)

## Configuration

### Retention Period
Set in Vercel environment variables:
```
CLOUDINARY_RETENTION_DAYS=7
```
- Default: 7 days
- Purge deletes images older than this
- Set to 0 to disable automatic purging

### Disable Uploads
```
CLOUDINARY_ENABLED=false
```
- Prevents new uploads
- Useful during maintenance
- Default: true (uploads enabled)

## Best Practices

1. **Run during off-peak hours** - 12-15 hours for large backlogs
2. **Keep tab open** - Don't close browser tab during purge
3. **Monitor progress** - Watch the real-time updates
4. **Stop if needed** - Click "Stop Auto-Purge" to cancel
5. **Check logs** - Verify purge completed successfully

## Questions?

See full documentation:
- README.md - Cloudinary Usage Management section
- docs/continuous-auto-purge-implementation.md - Technical details

