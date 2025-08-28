const express = require('express');
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

// Minimal single-file dashboard (no bundler)
router.get('/debug', requireDebugAccess, async (req, res) => {
  const mockBanner = config.mockMode ? '<div class="banner">MOCK MODE ENABLED — live integrations are disabled.</div>' : '';
  res.type('html').send(`<!doctype html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ELI Demo • Debug Dashboard</title>
    <style>
      :root { --bg:#0b1020; --card:#131b2f; --text:#e6eefc; --muted:#a8b3cf; --accent:#3aa0ff; }
      *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;background:var(--bg);color:var(--text)}
      header{padding:14px 16px;border-bottom:1px solid #1d2744;display:flex;align-items:center;gap:12px}
      header h1{font-size:18px;margin:0}
      .banner{background:#2b364f;color:#ffd24d;padding:8px 12px;margin:8px 16px;border-radius:6px}
      .container{padding:12px}
      .tabs{display:flex;gap:8px;margin:0 16px 12px}
      .tab{padding:8px 12px;border:1px solid #1d2744;border-radius:6px;background:var(--card);color:var(--text);cursor:pointer}
      .tab.active{outline:2px solid var(--accent)}
      .panel{display:none;margin:0 16px 16px;background:var(--card);border:1px solid #1d2744;border-radius:8px;overflow:auto}
      .panel.active{display:block}
      table{width:100%;border-collapse:collapse}
      th,td{border-bottom:1px solid #1d2744;padding:8px;text-align:left;font-size:13px;color:var(--muted)}
      th{color:var(--text)}
      .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;padding:12px}
      .thumb{border:1px solid #1d2744;border-radius:8px;overflow:hidden;background:#0e152b}
      .thumb img{display:block;width:100%;height:120px;object-fit:cover;background:#0b0f1e}
      .thumb .meta{padding:8px;font-size:12px;color:var(--muted)}
      .error{color:#ff8080;padding:8px}
      .controls{display:flex;gap:8px;align-items:center;padding:12px}
      input,select,button{background:#0e152b;color:var(--text);border:1px solid #1d2744;border-radius:6px;padding:6px 8px}
      button.primary{background:var(--accent);color:#041220;border-color:var(--accent)}
      @media (max-width:600px){ th,td{font-size:12px} }
    </style>
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
    </div>

    <section id="panel-pg" class="panel active">
      <div class="controls">
        <label>Limit <input id="pg-limit" type="number" value="50" min="1" max="200" /></label>
        <button class="primary" onclick="loadPg()">Refresh</button>
      </div>
      <div id="pg-content"></div>
    </section>

    <section id="panel-neo4j" class="panel">
      <div class="controls">
        <button class="primary" onclick="loadNeo4j()">Refresh</button>
      </div>
      <div id="neo4j-content"></div>
    </section>

    <section id="panel-cloudinary" class="panel">
      <div class="controls">
        <label>Folder <input id="cld-folder" type="text" value="${(require('../config').cloudinary.folder || 'irex-events').replace(/"/g,'&quot;')}" /></label>
        <label>Limit <input id="cld-limit" type="number" value="50" min="1" max="200" /></label>
        <button class="primary" onclick="loadCloudinary()">Refresh</button>
      </div>
      <div id="cloudinary-content"></div>
    </section>

    <script>
      const tabs = document.querySelectorAll('.tab');
      tabs.forEach(t=>t.addEventListener('click',()=>{
        tabs.forEach(x=>x.classList.remove('active'));
        t.classList.add('active');
        document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
        document.getElementById('panel-'+t.dataset.tab).classList.add('active');
      }));

      const token = '${process.env.DEBUG_DASHBOARD_TOKEN || ''}';
      const headers = token ? { 'X-Debug-Token': token } : {};

      async function loadPg(){
        const limit = document.getElementById('pg-limit').value || 50;
        const el = document.getElementById('pg-content');
        el.innerHTML = 'Loading...';
        try{
          const r = await fetch('/api/debug/pg?limit='+encodeURIComponent(limit), { headers });
          const j = await r.json();
          if(j.mock) { el.innerHTML = '<div class="error">Mock mode enabled — showing no live data.</div>'; return; }
          el.innerHTML = `
            <div style="padding:12px">
              <h3 style="margin:0 0 8px 0">Recent Events</h3>
              ${renderTable(j.events, ['id','start_time','topic','channel_id'])}
              <h3 style="margin:16px 0 8px 0">Recent Snapshots</h3>
              ${renderTable(j.snapshots, ['id','event_id','type','path','image_url','created_at'])}
            </div>`;
        }catch(e){ el.innerHTML = '<div class="error">'+(e && e.message || 'Failed to load')+'</div>'; }
      }

      function renderTable(rows, cols){
        if(!rows || rows.length===0) return '<div class="error">No rows</div>';
        const head = '<tr>'+cols.map(c=>'<th>'+c+'</th>').join('')+'</tr>';
        const body = rows.map(r=>'<tr>'+cols.map(c=>'<td>'+escapeHtml(r[c])+'</td>').join('')+'</tr>').join('');
        return '<div style="overflow:auto"><table>'+head+body+'</table></div>';
      }

      async function loadNeo4j(){
        const el = document.getElementById('neo4j-content');
        el.innerHTML = 'Loading...';
        try{
          const r = await fetch('/api/debug/neo4j', { headers });
          const j = await r.json();
          if(j.mock) { el.innerHTML = '<div class="error">Mock mode enabled — showing no live data.</div>'; return; }
          const nodeCols = ['id','labels'];
          const relCols = ['type','start','end'];
          const nodes = j.nodes.map(n=>({ id:n.id, labels:n.labels && n.labels.join(',') }));
          const rels = j.relationships.map(r=>({ type:r.type, start:r.start, end:r.end }));
          el.innerHTML = `
            <div style="padding:12px">
              <h3 style="margin:0 0 8px 0">Nodes</h3>
              ${renderTable(nodes, nodeCols)}
              <h3 style="margin:16px 0 8px 0">Relationships</h3>
              ${renderTable(rels, relCols)}
            </div>`;
        }catch(e){ el.innerHTML = '<div class="error">'+(e && e.message || 'Failed to load')+'</div>'; }
      }

      async function loadCloudinary(){
        const folder = document.getElementById('cld-folder').value || '';
        const limit = document.getElementById('cld-limit').value || 50;
        const el = document.getElementById('cloudinary-content');
        el.innerHTML = 'Loading...';
        try{
          const r = await fetch('/api/debug/cloudinary?folder='+encodeURIComponent(folder)+'&limit='+encodeURIComponent(limit), { headers });
          const j = await r.json();
          if(j.mock) { el.innerHTML = '<div class="error">Mock mode enabled — showing no live data.</div>'; return; }
          const items = (j.resources||[]).map(x=>
            `<div class="thumb">
              <img src="${x.secure_url}" alt="thumb" />
              <div class="meta">${escapeHtml(x.public_id)}<br/>${new Date(x.created_at).toLocaleString()}</div>
            </div>`).join('');
          el.innerHTML = '<div class="grid">'+(items||'<div class="error">No images</div>')+'</div>';
        }catch(e){ el.innerHTML = '<div class="error">'+(e && e.message || 'Failed to load')+'</div>'; }
      }

      function escapeHtml(v){ if(v==null) return ''; return String(v).replace(/[&<>"']/g, s=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[s])); }

      // Initial loads
      loadPg();
      loadNeo4j();
      loadCloudinary();
    </script>
  </body>
  </html>`);
});

router.get('/api/debug/pg', requireDebugAccess, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
  if (config.mockMode) return res.json({ mock: true, events: [], snapshots: [] });
  try {
    const ev = await query(
      `SELECT id, topic, start_time, channel_id FROM events ORDER BY start_time DESC NULLS LAST LIMIT $1`,
      [limit]
    );
    const sn = await query(
      `SELECT id, event_id, type, path, image_url, created_at FROM snapshots ORDER BY created_at DESC NULLS LAST LIMIT $1`,
      [limit]
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

module.exports = router;

