import { autoPurgeOldImages } from '../../../../lib/cloudinary';

export const config = {
  maxDuration: 300, // 5 minutes max
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Set up SSE headers for streaming progress updates
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const days = parseInt(req.body?.days || '7', 10);
  const maxTimeSeconds = parseInt(req.body?.maxTimeSeconds || '240', 10);

  try {
    // Send initial message
    res.write(`data: ${JSON.stringify({ type: 'start', days, maxTimeSeconds })}\n\n`);

    // Progress callback to send updates
    const progressCallback = (progress) => {
      res.write(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);
    };

    // Run the automated purge
    const result = await autoPurgeOldImages(days, maxTimeSeconds, progressCallback);

    // Send final result
    res.write(`data: ${JSON.stringify({ type: 'complete', ...result })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Auto-purge error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
}

