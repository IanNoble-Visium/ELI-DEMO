const express = require('express');
const path = require('path');
const config = require('../config');
const logger = require('../logger');
const { query } = require('../db/postgres');
const { getSession } = require('../db/neo4j');
const { cloudinary } = require('../lib/cloudinary');

const router = express.Router();

function requireDebugAccess(req, res, next) {
  const enabled = process.env.DEBUG_DASHBOARD_ENABLED === 'true' || config.env !== 'production';
  if (!enabled) return res.status(404).end();

  const token = process.env.DEBUG_DASHBOARD_TOKEN;
  if (token) {
    const header = req.headers['x-debug-token'] || (req.query.token ? String(req.query.token) : null);
    if (header !== token) return res.status(401).send('Unauthorized');
  }
  next();
}

// Serve static debug assets
// These asset routes accept the token either by header or query parameter
// so that including ?token=... on the URL works for browsers fetching assets
router.get('/debug/styles.css', requireDebugAccess, (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/debug/styles.css'));
});

router.get('/debug/dashboard.js', requireDebugAccess, (req, res) => {
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, '../../public/debug/dashboard.js'));
});

// Refactored debug route with separated concerns
router.get('/debug', requireDebugAccess, async (req, res) => {
  const mockBanner = config.mockMode ? '<div class="banner">MOCK MODE ENABLED — live integrations are disabled.</div>' : '';
  const debugToken = process.env.DEBUG_DASHBOARD_TOKEN || '';
  const clearEnabled = process.env.DEBUG_DASHBOARD_ENABLED === 'true';
  const cloudinaryFolder = (require('../config').cloudinary.folder || 'irex-events').replace(/"/g,'&quot;');

  // Render the HTML template with separated concerns
  res.type('html').send(renderDebugTemplate({
    mockBanner,
    debugToken,
    clearEnabled,
    cloudinaryFolder
  }));
});

// Separate function to render the HTML template
function renderDebugTemplate({ mockBanner, debugToken, clearEnabled, cloudinaryFolder }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ELI Demo • Debug Dashboard</title>
  <link rel="stylesheet" href="/debug/styles.css${debugToken ? ('?token=' + encodeURIComponent(debugToken)) : ''}">
  <script src="https://unpkg.com/cytoscape@3.26.0/dist/cytoscape.min.js"></script>
</head>
<body>
  <header>
    <h1>ELI Demo • Debug Dashboard</h1>
  </header>
  ${mockBanner}
  <div class="tabs">
    <button class="tab active" data-tab="pg">PostgreSQL</button>
    <button class="tab" data-tab="neo4j">Neo4j</button>
    <button class="tab" data-tab="cloudinary">Cloudinary</button>
    <button class="tab" data-tab="webhooks">Webhook Logs</button>
    <button class="tab" data-tab="data">Data Management</button>
  </div>

  <section id="panel-pg" class="panel active">
    <div class="controls">
      <label>Limit <input id="pg-limit" type="number" value="50" min="1" max="200" /></label>
      <button id="pg-prev-btn">Prev</button>
      <button id="pg-next-btn">Next</button>
      <span id="pg-page" style="color:#a8b3cf">Page: 1</span>
      <button class="primary" id="pg-refresh-btn">Refresh</button>
    </div>
    <div id="pg-content"></div>
  </section>

  <section id="panel-neo4j" class="panel">
    <div class="controls">
      <button class="primary" id="neo4j-refresh-btn">Refresh</button>
    </div>
    <div id="neo4j-content"></div>
    <div id="neo4j-graph"></div>
  </section>

  <section id="panel-cloudinary" class="panel">
    <div class="controls">
      <label>Folder <input id="cld-folder" type="text" value="${cloudinaryFolder}" /></label>
      <label>Limit <input id="cld-limit" type="number" value="50" min="1" max="200" /></label>
      <button class="primary" id="cloudinary-refresh-btn">Refresh</button>
    </div>
    <div id="cloudinary-content"></div>
  </section>

  <section id="panel-webhooks" class="panel">
    <div class="controls">
      <label>Limit <input id="webhooks-limit" type="number" value="50" min="1" max="200" /></label>
      <label>Status <select id="webhooks-status"><option value="">All</option><option value="200">200</option><option value="400">400</option><option value="500">500</option></select></label>
      <label>IP <input id="webhooks-ip" type="text" placeholder="Filter by IP" /></label>
      <label>Path <input id="webhooks-path" type="text" placeholder="Filter by path" /></label>
      <button id="webhooks-prev-btn">Prev</button>
      <button id="webhooks-next-btn">Next</button>
      <span id="webhooks-page" style="color:#a8b3cf">Page: 1</span>
      <button class="primary" id="webhooks-refresh-btn">Refresh</button>
    </div>
    <div id="webhooks-content"></div>
  </section>

  <section id="panel-data" class="panel">
    <div class="controls">
      <button class="danger" id="clear-data-btn">Clear All Data</button>
      <label style="margin-left:auto">Dry run <input id="dry-run" type="checkbox" /></label>
    </div>
    <div id="data-content" style="padding:12px;color:#a8b3cf">
      Use this to reset all data stores for fresh testing. Only available when DEBUG_DASHBOARD_ENABLED=true.
    </div>
  </section>

  <script>
    // Pass configuration to the client-side script
    window.DEBUG_CONFIG = {
      token: ${JSON.stringify(debugToken)},
      clearEnabled: ${clearEnabled}
    };
  </script>
  <script src="/debug/dashboard.js${debugToken ? ('?token=' + encodeURIComponent(debugToken)) : ''}"></script>
</body>
</html>`;
}

router.get('/api/debug/pg', requireDebugAccess, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
  if (config.mockMode) return res.json({ mock: true, events: [], snapshots: [] });
  try {
    const ev = await query(
      `SELECT id, topic, start_time, channel_id, created_at FROM events ORDER BY start_time DESC NULLS LAST LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const sn = await query(
      `SELECT id, event_id, type, path, image_url, created_at FROM snapshots ORDER BY created_at DESC NULLS LAST LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    res.json({ events: ev.rows, snapshots: sn.rows });
  } catch (err) {
    logger.error({ err }, 'debug pg fetch failed');
    res.status(500).json({ error: 'Failed to query Postgres' });
  }
});

router.get('/api/debug/neo4j', requireDebugAccess, async (_req, res) => {
  if (config.mockMode) return res.json({ mock: true, nodes: [], relationships: [] });
  const session = getSession();
  try {
    const nodes = new Map();
    const rels = [];
    // Cameras -> Events
    let r = await session.run(`MATCH (c:Camera)-[g:GENERATED]->(e:Event) RETURN c,e LIMIT 100`);
    r.records.forEach(rec => {
      const c = rec.get('c'); const e = rec.get('e');
      nodes.set(c.identity.toString(), { id: c.properties.id || c.identity.toString(), labels: c.labels });
      nodes.set(e.identity.toString(), { id: e.properties.id || e.identity.toString(), labels: e.labels });
      rels.push({ type: 'GENERATED', start: (c.properties.id||c.identity.toString()), end: (e.properties.id||e.identity.toString()) });
    });
    // Events -> Images
    r = await session.run(`MATCH (e:Event)-[h:HAS_SNAPSHOT]->(i:Image) RETURN e,i LIMIT 200`);
    r.records.forEach(rec => {
      const e = rec.get('e'); const i = rec.get('i');
      nodes.set(e.identity.toString(), { id: e.properties.id || e.identity.toString(), labels: e.labels });
      nodes.set(i.identity.toString(), { id: i.properties.id || i.identity.toString(), labels: i.labels });
      rels.push({ type: 'HAS_SNAPSHOT', start: (e.properties.id||e.identity.toString()), end: (i.properties.id||i.identity.toString()) });
    });
    res.json({ nodes: Array.from(nodes.values()), relationships: rels });
  } catch (err) {
    logger.error({ err }, 'debug neo4j fetch failed');
    res.status(500).json({ error: 'Failed to query Neo4j' });
  } finally {
    try { await session.close(); } catch (_) {}
  }
});

router.get('/api/debug/cloudinary', requireDebugAccess, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const folder = String(req.query.folder || (require('../config').cloudinary.folder || ''));
  if (config.mockMode) return res.json({ mock: true, resources: [] });
  try {
    // Prefer search API for folder filtering when available
    let out = await cloudinary.search.expression(`folder=${folder}`).max_results(limit).execute();
    const resources = (out && out.resources) ? out.resources.map(r => ({
      public_id: r.public_id, secure_url: r.secure_url, created_at: r.created_at, folder: r.folder
    })) : [];
    res.json({ resources });
  } catch (err) {
    // Fallback to resources listing by prefix
    try {
      const out = await cloudinary.api.resources({ type: 'upload', prefix: folder ? folder + '/' : undefined, max_results: limit });
      const resources = (out && out.resources) ? out.resources.map(r => ({
        public_id: r.public_id, secure_url: r.secure_url, created_at: r.created_at, folder: r.folder
      })) : [];
      return res.json({ resources });
    } catch (e2) {
      logger.error({ err: e2 }, 'debug cloudinary fetch failed');
      return res.status(500).json({ error: 'Failed to query Cloudinary' });
    }
  }
});

router.get('/api/debug/webhook-requests', requireDebugAccess, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);
  const statusFilter = req.query.status ? parseInt(req.query.status, 10) : null;
  const ipFilter = req.query.ip ? String(req.query.ip) : null;
  const pathFilter = req.query.path ? String(req.query.path) : null;

  if (config.mockMode) return res.json({ mock: true, requests: [], total: 0 });

  try {
    // Build WHERE clause dynamically
    const conditions = [];
    const params = [limit, offset];
    let paramIndex = 3;

    if (statusFilter !== null) {
      conditions.push(`status_code = $${paramIndex}`);
      params.push(statusFilter);
      paramIndex++;
    }

    if (ipFilter) {
      conditions.push(`source_ip ILIKE $${paramIndex}`);
      params.push(`%${ipFilter}%`);
      paramIndex++;
    }

    if (pathFilter) {
      conditions.push(`path ILIKE $${paramIndex}`);
      params.push(`%${pathFilter}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count for pagination
    const countSql = `SELECT COUNT(*) as total FROM webhook_requests ${whereClause}`;
    const countResult = await query(countSql, params.slice(2)); // Skip limit/offset for count
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    // Get paginated results
    const sql = `
      SELECT id, timestamp, method, path, status_code, host, source_ip, user_agent,
             content_type, request_body, response_body, error_message,
             validation_errors, processing_time_ms, created_at
      FROM webhook_requests
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await query(sql, params);
    const requests = result.rows.map(row => ({
      id: row.id,
      timestamp: row.timestamp,
      method: row.method,
      path: row.path,
      status_code: row.status_code,
      host: row.host,
      source_ip: row.source_ip,
      user_agent: row.user_agent,
      content_type: row.content_type,
      request_body: row.request_body,
      response_body: row.response_body,
      error_message: row.error_message,
      validation_errors: row.validation_errors,
      processing_time_ms: row.processing_time_ms,
      created_at: row.created_at
    }));

    res.json({ requests, total, limit, offset });
  } catch (err) {
    logger.error({ err }, 'Failed to fetch webhook requests');
    res.status(500).json({ error: 'Failed to fetch webhook requests' });
  }
});

// POST /api/debug/clear-all
// Safely clears data from Postgres, Neo4j, and Cloudinary. Respects mock mode.
// Includes optional dry_run and configurable in-memory rate limiting to protect misuse.
const rateLimit = { last: 0 };
const CLEAR_RATE_LIMIT_MS = Math.max(parseInt(process.env.DEBUG_CLEAR_RATE_LIMIT_MS || '1000', 10) || 0, 0);
router.post('/api/debug/clear-all', requireDebugAccess, async (req, res) => {
  // Only enable when explicitly allowed
  const enabled = process.env.DEBUG_DASHBOARD_ENABLED === 'true' || config.env !== 'production';
  if (!enabled) return res.status(404).end();

  const dryRun = String(req.query.dry_run || 'false') === 'true';
  const now = Date.now();
  if (CLEAR_RATE_LIMIT_MS > 0 && now - rateLimit.last < CLEAR_RATE_LIMIT_MS) {
    const retryAfter = Math.ceil((CLEAR_RATE_LIMIT_MS - (now - rateLimit.last)) / 1000);
    res.set('Retry-After', String(Math.max(retryAfter, 1)));
    return res.status(429).json({ error: 'Too Many Requests. Try again shortly.' });
  }
  rateLimit.last = now;

  const results = { mock: config.mockMode, dryRun, postgres: {}, neo4j: {}, cloudinary: {} };

  // Postgres: counts for dry-run, else delete snapshots then events
  try {
    if (dryRun) {
      if (!config.mockMode) {
        const s = await query('SELECT count(*)::int AS c FROM snapshots');
        const e = await query('SELECT count(*)::int AS c FROM events');
        results.postgres = { would_delete_snapshots: s.rows[0]?.c || 0, would_delete_events: e.rows[0]?.c || 0 };
      } else {
        results.postgres = { skipped: true };
      }
    } else if (!config.mockMode) {
      let rc1 = 0, rc2 = 0;
      const r1 = await query('DELETE FROM snapshots'); rc1 = r1.rowCount || 0;
      const r2 = await query('DELETE FROM events'); rc2 = r2.rowCount || 0;
      results.postgres = { deleted_snapshots: rc1, deleted_events: rc2 };
    } else {
      results.postgres = { skipped: true };
    }
  } catch (err) {
    results.postgres = { error: String(err.message || err) };
  }

  // Neo4j: dry-run via count, else detach delete
  try {
    if (dryRun) {
      if (!config.mockMode) {
        const session = getSession();
        try {
          const r = await session.run('MATCH (n) RETURN count(n) AS cnt');
          const cnt = r.records?.[0]?.get('cnt').toInt?.() ?? r.records?.[0]?.get('cnt') ?? 0;
          results.neo4j = { would_delete_nodes: Number(cnt) };
        } finally { try{ await session.close(); }catch(_){} }
      } else {
        results.neo4j = { skipped: true };
      }
    } else if (!config.mockMode) {
      const session = getSession();
      try { await session.run('MATCH (n) DETACH DELETE n'); results.neo4j = { cleared: true }; }
      finally { try{ await session.close(); }catch(_){} }
    } else {
      results.neo4j = { skipped: true };
    }
  } catch (err) {
    results.neo4j = { error: String(err.message || err) };
  }

  // Cloudinary: dry-run via listing by prefix, else delete by batching public_ids under prefix
  try {
    const folder = require('../config').cloudinary.folder || '';
    const prefix = folder ? (folder.endsWith('/') ? folder : folder + '/') : '';

    if (dryRun) {
      if (!config.mockMode && folder) {
        let total = 0; let sample = []; let cursor;
        do {
          const out = await cloudinary.api.resources({ type: 'upload', resource_type: 'image', prefix, max_results: 500, next_cursor: cursor });
          const list = out?.resources || [];
          total += list.length;
          if (sample.length < 5) sample.push(...list.slice(0, 5 - sample.length).map(r => r.public_id));
          cursor = out?.next_cursor;
        } while (cursor);
        results.cloudinary = { folder, prefix, would_delete_resources: total, sample_public_ids: sample };
      } else {
        results.cloudinary = { skipped: true, folder, prefix };
      }
    } else if (!config.mockMode && folder) {
      let deleted = 0; let errors = []; let cursor; let batches = 0;
      do {
        const out = await cloudinary.api.resources({ type: 'upload', resource_type: 'image', prefix, max_results: 500, next_cursor: cursor });
        const ids = (out?.resources || []).map(r => r.public_id);
        cursor = out?.next_cursor;
        if (ids.length) {
          batches++;
          try {
            const delRes = await cloudinary.api.delete_resources(ids, { type: 'upload', resource_type: 'image', invalidate: true });
            const ok = delRes?.deleted ? Object.values(delRes.deleted).filter(v => v === 'deleted' || v === 'queued').length : 0;
            deleted += ok;
            const notFound = (delRes?.deleted ? Object.entries(delRes.deleted).filter(([,v]) => v !== 'deleted' && v !== 'queued') : []).map(([k,v]) => ({ id:k, status:v }));
            if (notFound.length) errors.push(...notFound);
          } catch (e) {
            errors.push({ batchError: String(e.message || e) });
          }
        }
      } while (cursor);

      // Attempt to delete the (now-empty) folder; ignore failures
      try { await cloudinary.api.delete_folder(folder); } catch (e) { errors.push({ delete_folder: String(e.message || e) }); }

      // Verify remaining assets under prefix
      let remaining = 0; let verifyCursor;
      do {
        const out = await cloudinary.api.resources({ type: 'upload', resource_type: 'image', prefix, max_results: 500, next_cursor: verifyCursor });
        remaining += (out?.resources || []).length;
        verifyCursor = out?.next_cursor;
      } while (verifyCursor);

      results.cloudinary = { cleared: remaining === 0, folder, prefix, deleted_resources: deleted, remaining_resources: remaining, batches, errors };
    } else {
      results.cloudinary = { skipped: true, folder, prefix };
    }
  } catch (err) {
    results.cloudinary = { error: String(err.message || err) };
  }

  const anyError = [results.postgres.error, results.neo4j.error, results.cloudinary.error].some(Boolean);
  if (anyError) { logger.warn({ results }, 'debug clear-all completed with errors'); }
  else { logger.info({ results }, 'debug clear-all completed successfully'); }

  return res.status(anyError ? 207 : 200).json(results);
});

module.exports = router;
