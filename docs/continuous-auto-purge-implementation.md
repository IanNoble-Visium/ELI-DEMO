# Continuous Auto-Purge Implementation

## Overview

The auto-purge system has been upgraded from a single 4-minute cycle to a **fully automatic continuous mode** that runs multiple cycles with automatic pauses between them. This eliminates the need for manual intervention to clear large image backlogs.

## Problem Solved

**Previous Limitation**: 
- Single 4-minute cycle processed ~8,000-10,000 images
- 900,000 image backlog required ~90-112 manual clicks
- User had to repeatedly click "Auto-Purge" button to continue

**New Solution**:
- Continuous automatic cycles with 1-minute pauses
- Runs until all old images are deleted
- Zero manual intervention needed (except initial click)
- User can stop at any time with "Stop Auto-Purge" button

## Implementation Details

### Architecture

**Client-Side Approach** (Browser-based)
- Runs in the Debug Dashboard browser tab
- Uses JavaScript async/await for cycle management
- Implements automatic retry loop with pause logic
- Respects Vercel's 5-minute timeout with 4-minute cycles + 1-minute pauses

**Why Client-Side?**
- Works within Vercel's serverless constraints
- No need for persistent backend state
- User can monitor progress in real-time
- Can be stopped immediately by closing browser tab or clicking stop button

### Key Components

#### 1. Global State Management (`autoPurgeState`)
```javascript
let autoPurgeState = {
  running: false,           // Prevents multiple simultaneous runs
  cancelled: false,         // User-triggered stop
  totalDeletedGlobal: 0,    // Cumulative total across all cycles
  cyclesRun: 0,             // Number of cycles completed
  startTime: null           // For calculating total elapsed time
};
```

#### 2. Single Cycle Function (`runAutoPurgeCycle`)
- Runs one 4-minute purge cycle
- Handles SSE streaming from server
- Tracks cycle-specific metrics
- Returns: `{ completed, deleted, hasMore }`

#### 3. Main Loop (`startAutoPurge`)
- Initializes state and UI
- Runs continuous cycle loop:
  1. Execute 4-minute purge cycle
  2. Check if all images deleted (hasMore = false)
  3. If not done: pause for 1 minute with countdown
  4. Repeat until complete or user cancels
- Updates UI with cumulative progress
- Handles errors gracefully

### UI/UX Features

#### Real-Time Progress Display
```
Cycle 1, Batch 5: Deleted 200 images
Cycle total: 1000 | Global total: 1000
Time elapsed: 45s (cycle) / 45s (total) | More images: Yes
```

#### Pause Countdown
```
Pausing between cycles...
Cycle 1 complete. Resuming in 45 seconds...
Global total deleted: 10000
Total time elapsed: 240s
```

#### Stop Button
- Appears during purge
- Allows user to cancel at any time
- Sets `autoPurgeState.cancelled = true`
- Current cycle completes, then stops

#### Final Status
- Shows total images deleted
- Shows number of cycles run
- Shows total time elapsed
- Indicates if stopped by user or completed naturally

## Performance Characteristics

### Per Cycle
- Duration: 4 minutes (240 seconds)
- Batches: ~40-50 batches
- Images per batch: 200 (2 batches of 100)
- **Total per cycle: ~8,000-10,000 images**

### For Large Backlog (900,000 images)
- Cycles needed: ~90-112
- Pause time: 1 minute between cycles
- **Total time: ~12-15 hours**
- Can run continuously or be stopped/restarted

### Rate Limiting
- 500ms delay between batches (within cycle)
- 1-minute pause between cycles
- Prevents Cloudinary API rate limiting
- Allows Vercel to reset between cycles

## Usage Instructions

### Starting Continuous Auto-Purge
1. Go to Debug Dashboard → Settings tab
2. Click "Auto-Purge (Multi-Batch)" button
3. Confirm warning (cannot be undone)
4. System automatically runs continuous cycles

### Monitoring Progress
- Watch cycle number and batch progress
- See cumulative totals across all cycles
- Monitor pause countdown between cycles
- Total time elapsed shown

### Stopping Auto-Purge
- Click "Stop Auto-Purge" button (appears during purge)
- Current cycle completes, then stops
- Can restart by clicking "Auto-Purge" again

### Browser Tab Requirements
- Keep Debug Dashboard tab open during purge
- Closing tab stops the purge
- Progress is not persisted (restart from beginning if needed)

## Code Changes

### Files Modified

#### `public/debug/dashboard.js`
- Added `autoPurgeState` global object
- Added `sleep()` helper function
- Added `runAutoPurgeCycle()` function for single cycle
- Rewrote `startAutoPurge()` with continuous loop logic
- Added stop button event listener
- Updated UI to show cycle numbers and cumulative totals

#### `README.md`
- Updated "Automated Multi-Batch Purge System" section
- Added "Continuous Mode" documentation
- Updated usage instructions
- Updated troubleshooting section
- Added best practices for long-running purges
- Updated performance characteristics

### Files NOT Modified
- `src/routes/debug.js` - No changes needed (endpoint already supports multiple calls)
- `src/lib/cloudinary.js` - No changes needed (autoPurgeOldImages already works correctly)

## Testing Recommendations

1. **Small Backlog Test** (100-200 images)
   - Verify continuous cycles work
   - Check pause countdown displays correctly
   - Verify stop button works

2. **Medium Backlog Test** (1,000-5,000 images)
   - Run multiple cycles
   - Verify cumulative totals are correct
   - Check pause timing

3. **Large Backlog Test** (10,000+ images)
   - Run for extended period
   - Monitor for memory leaks
   - Verify browser stability

4. **Stop/Cancel Test**
   - Click stop button during cycle
   - Verify current cycle completes
   - Verify can restart

5. **Browser Tab Close Test**
   - Close tab during purge
   - Verify purge stops
   - Verify can restart

## Limitations & Considerations

1. **Browser Tab Must Stay Open**
   - Purge runs in browser, not server
   - Closing tab stops the purge
   - No persistent state across sessions

2. **Long-Running Operations**
   - 900,000 images = ~12-15 hours
   - User should run during off-peak hours
   - Can be stopped and restarted

3. **Network Interruptions**
   - If connection drops, purge stops
   - Can be restarted by clicking "Auto-Purge" again
   - Progress is not persisted

4. **Single User at a Time**
   - Only one auto-purge can run at a time
   - Prevents duplicate work and API conflicts

## Future Enhancements

1. **Server-Side Persistence** (if needed)
   - Store purge state in database
   - Allow purge to continue across browser sessions
   - Requires backend changes

2. **Scheduled Purges**
   - Run purges on a schedule (e.g., nightly)
   - Requires cron job or scheduled function

3. **Progress Persistence**
   - Save progress to localStorage
   - Resume if browser tab is closed
   - Requires careful state management

4. **Parallel Cycles**
   - Run multiple cycles in parallel (if API allows)
   - Requires rate limit analysis

