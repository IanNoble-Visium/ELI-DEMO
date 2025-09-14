// Debug Dashboard Client-Side JavaScript
// Separated from HTML for better maintainability and debugging

(function() {
  'use strict';

  // Configuration from server
  const config = window.DEBUG_CONFIG || {};
  const token = config.token || '';
  const headers = token ? { 'X-Debug-Token': token } : {};
  const clearEnabled = config.clearEnabled || false;

  // State variables
  let pgOffset = 0;
  let webhooksOffset = 0;
  let clearModalEl = null;

  // Initialize the dashboard
  function init() {
    setupTabs();
    setupEventListeners();
    setupClearDataButton();
    
    // Initial data loads
    loadPg();
    loadNeo4j();
    loadCloudinary();
    loadWebhooks();
    loadAI();
  }

  // Tab switching functionality
  function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        // Remove active class from all tabs and panels
        tabs.forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        
        // Add active class to clicked tab and corresponding panel
        tab.classList.add('active');
        const panelId = 'panel-' + tab.dataset.tab;
        const panel = document.getElementById(panelId);
        if (panel) {
          panel.classList.add('active');
        }
      });
    });
  }

  // Setup event listeners for buttons
  function setupEventListeners() {
    // PostgreSQL controls
    const pgPrevBtn = document.getElementById('pg-prev-btn');
    const pgNextBtn = document.getElementById('pg-next-btn');
    const pgRefreshBtn = document.getElementById('pg-refresh-btn');
    
    if (pgPrevBtn) pgPrevBtn.addEventListener('click', pgPrev);
    if (pgNextBtn) pgNextBtn.addEventListener('click', pgNext);
    if (pgRefreshBtn) pgRefreshBtn.addEventListener('click', () => loadPg(true));

    // Neo4j controls
    const neo4jRefreshBtn = document.getElementById('neo4j-refresh-btn');
    if (neo4jRefreshBtn) neo4jRefreshBtn.addEventListener('click', loadNeo4j);

    // Cloudinary controls
    const cloudinaryRefreshBtn = document.getElementById('cloudinary-refresh-btn');
    if (cloudinaryRefreshBtn) cloudinaryRefreshBtn.addEventListener('click', loadCloudinary);

    // Webhook controls
    const webhooksPrevBtn = document.getElementById('webhooks-prev-btn');
    const webhooksNextBtn = document.getElementById('webhooks-next-btn');
    const webhooksRefreshBtn = document.getElementById('webhooks-refresh-btn');

    if (webhooksPrevBtn) webhooksPrevBtn.addEventListener('click', webhooksPrev);
    if (webhooksNextBtn) webhooksNextBtn.addEventListener('click', webhooksNext);
    if (webhooksRefreshBtn) webhooksRefreshBtn.addEventListener('click', () => loadWebhooks(true));

    // AI Analytics controls
    const aiRefreshBtn = document.getElementById('ai-refresh-btn');
    const aiViewSelect = document.getElementById('ai-view');
    
    if (aiRefreshBtn) aiRefreshBtn.addEventListener('click', loadAI);
    if (aiViewSelect) aiViewSelect.addEventListener('change', loadAI);

    // Data management controls
    const clearDataBtn = document.getElementById('clear-data-btn');
    if (clearDataBtn) clearDataBtn.addEventListener('click', openClearModal);
  }

  // Setup clear data button state
  function setupClearDataButton() {
    if (!clearEnabled) {
      const btn = document.getElementById('clear-data-btn');
      if (btn) {
        btn.setAttribute('disabled', 'disabled');
        btn.title = 'Set DEBUG_DASHBOARD_ENABLED=true to enable';
      }
      const dc = document.getElementById('data-content');
      if (dc) {
        dc.textContent = 'Disabled. Set DEBUG_DASHBOARD_ENABLED=true to enable this feature.';
      }
    }
  }

  // Utility function to format UTC timestamps
  function fmtUTC(v) {
    try {
      if (v == null || v === '') return '';
      let d;
      if (v instanceof Date) {
        d = v;
      } else if (typeof v === 'string') {
        // Timestamptz from PG often serializes to ISO string; if numeric string, treat as ms
        const num = Number(v);
        d = Number.isFinite(num) && v.trim() !== '' && /^[0-9]+$/.test(v.trim()) ? new Date(num) : new Date(v);
      } else if (typeof v === 'number') {
        d = new Date(v);
      } else {
        return '';
      }
      if (isNaN(d.getTime())) return '';
      return d.toISOString().replace('T', ' ').replace('Z', ' UTC');
    } catch (_) {
      return '';
    }
  }

  // Utility function to escape HTML
  function escapeHtml(v) {
    if (v == null) return '';
    return String(v).replace(/[&<>"']/g, function(s) {
      switch (s) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return s;
      }
    });
  }

  // Utility function to render tables
  function renderTable(rows, cols) {
    if (!rows || rows.length === 0) return '<div class="error">No rows</div>';
    const head = '<tr>' + cols.map(c => '<th>' + c + '</th>').join('') + '</tr>';
    const body = rows.map(r => '<tr>' + cols.map(c => '<td>' + escapeHtml(r[c]) + '</td>').join('') + '</tr>').join('');
    return '<div style="overflow:auto"><table>' + head + body + '</table></div>';
  }

  // PostgreSQL data loading
  async function loadPg(reset) {
    const limit = parseInt(document.getElementById('pg-limit').value || 50, 10);
    if (reset) pgOffset = 0;
    const el = document.getElementById('pg-content');
    el.innerHTML = 'Loading...';
    
    try {
      const url = '/api/debug/pg?limit=' + encodeURIComponent(limit) + '&offset=' + encodeURIComponent(pgOffset);
      const r = await fetch(url, { headers });
      const j = await r.json();
      
      if (j.mock) {
        el.innerHTML = '<div class="error">Mock mode enabled — showing no live data.</div>';
        return;
      }
      
      const events = j.events.map(function(e) {
        return {
          id: e.id,
          start_time: fmtUTC(e.start_time),
          topic: e.topic,
          channel_id: e.channel_id,
          created_at: fmtUTC(e.created_at)
        };
      });
      
      const snapshots = j.snapshots.map(function(s) {
        return {
          id: s.id,
          event_id: s.event_id,
          type: s.type,
          path: s.path,
          image_url: s.image_url,
          created_at: fmtUTC(s.created_at)
        };
      });
      
      el.innerHTML = '<div style="padding:12px">' +
        '<h3 style="margin:0 0 8px 0">Recent Events</h3>' +
        renderTable(events, ['id', 'start_time', 'topic', 'channel_id', 'created_at']) +
        '<h3 style="margin:16px 0 8px 0">Recent Snapshots</h3>' +
        renderTable(snapshots, ['id', 'event_id', 'type', 'path', 'image_url', 'created_at']) +
        '</div>';
      
      const page = Math.floor(pgOffset / limit) + 1;
      document.getElementById('pg-page').textContent = 'Page: ' + page;
    } catch (e) {
      el.innerHTML = '<div class="error">' + (e && e.message || 'Failed to load') + '</div>';
    }
  }

  // PostgreSQL pagination
  function pgNext() {
    const limit = parseInt(document.getElementById('pg-limit').value || 50, 10);
    pgOffset += limit;
    loadPg();
  }

  function pgPrev() {
    const limit = parseInt(document.getElementById('pg-limit').value || 50, 10);
    pgOffset = Math.max(0, pgOffset - limit);
    loadPg();
  }

  // Neo4j data loading
  async function loadNeo4j() {
    const el = document.getElementById('neo4j-content');
    el.innerHTML = 'Loading...';
    
    try {
      const r = await fetch('/api/debug/neo4j', { headers });
      const j = await r.json();
      
      if (j.mock) {
        el.innerHTML = '<div class="error">Mock mode enabled — showing no live data.</div>';
        return;
      }
      
      const nodeCols = ['id', 'labels'];
      const relCols = ['type', 'start', 'end'];
      const nodes = j.nodes.map(function(n) {
        return { id: n.id, labels: (n.labels || []).join(',') };
      });
      const rels = j.relationships.map(function(r) {
        return { type: r.type, start: r.start, end: r.end };
      });
      
      el.innerHTML = '<div style="padding:12px">' +
        '<h3 style="margin:0 0 8px 0">Nodes</h3>' +
        renderTable(nodes, nodeCols) +
        '<h3 style="margin:16px 0 8px 0">Relationships</h3>' +
        renderTable(rels, relCols) +
        '</div>';

      // Cytoscape mini-visualization
      renderNeo4jGraph(j);
    } catch (e) {
      el.innerHTML = '<div class="error">' + (e && e.message || 'Failed to load') + '</div>';
    }
  }

  // Render Neo4j graph visualization
  function renderNeo4jGraph(data) {
    try {
      const cy = cytoscape({
        container: document.getElementById('neo4j-graph'),
        style: [
          {
            selector: 'node',
            style: {
              'background-color': '#3aa0ff',
              'label': 'data(id)',
              'font-size': 8,
              'color': '#111'
            }
          },
          {
            selector: 'edge',
            style: {
              'line-color': '#8aa4c8',
              'target-arrow-color': '#8aa4c8',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'width': 1,
              'label': 'data(label)',
              'font-size': 7,
              'color': '#a8b3cf'
            }
          }
        ],
        layout: { name: 'cose', animate: false }
      });

      const elNodes = data.nodes.map(function(n) {
        return { data: { id: String(n.id) } };
      });

      const elEdges = data.relationships.map(function(rel) {
        return {
          data: {
            id: rel.start + '_' + rel.type + '_' + rel.end,
            source: String(rel.start),
            target: String(rel.end),
            label: rel.type
          }
        };
      });

      cy.add(elNodes.concat(elEdges));
      cy.layout({ name: 'cose', animate: false }).run();
    } catch (e) {
      console.error('Failed to render Neo4j graph:', e);
    }
  }

  // Cloudinary data loading
  async function loadCloudinary() {
    const folder = document.getElementById('cld-folder').value || '';
    const limit = document.getElementById('cld-limit').value || 50;
    const el = document.getElementById('cloudinary-content');
    el.innerHTML = 'Loading...';

    try {
      const url = '/api/debug/cloudinary?folder=' + encodeURIComponent(folder) + '&limit=' + encodeURIComponent(limit);
      const r = await fetch(url, { headers });
      const j = await r.json();

      if (j.mock) {
        el.innerHTML = '<div class="error">Mock mode enabled — showing no live data.</div>';
        return;
      }

      const items = (j.resources || []).map(function(x) {
        return '<div class="thumb">' +
          '<img src="' + x.secure_url + '" alt="thumb" />' +
          '<div class="meta">' + escapeHtml(x.public_id) + '<br/>' + new Date(x.created_at).toLocaleString() + '</div>' +
          '</div>';
      }).join('');

      el.innerHTML = '<div class="grid">' + (items || '<div class="error">No images</div>') + '</div>';
    } catch (e) {
      el.innerHTML = '<div class="error">' + (e && e.message || 'Failed to load') + '</div>';
    }
  }

  // Data Management: Clear All Data modal and actions
  function openClearModal() {
    if (clearModalEl) {
      clearModalEl.remove();
      clearModalEl = null;
    }

    const msg = 'This will delete:\\n\\n• PostgreSQL: events and snapshots\\n• Neo4j: all nodes and relationships\\n• Cloudinary: all images in the configured folder\\n\\nAre you sure?';
    clearModalEl = document.createElement('div');
    clearModalEl.innerHTML = '<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999">' +
      '<div style="background:#0e152b;border:1px solid #1d2744;border-radius:8px;max-width:520px;width:92%;padding:16px;color:#e6eefc">' +
      '<h3 style="margin:0 0 8px 0">Confirm Clear All Data</h3>' +
      '<pre style="white-space:pre-wrap;background:#0b0f1e;border:1px solid #1d2744;padding:8px;border-radius:6px;color:#a8b3cf">' + msg + '</pre>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">' +
      '<button onclick="window.closeClearModal()">Cancel</button>' +
      '<button class="danger" onclick="window.confirmClearAll()">Yes, Clear</button>' +
      '</div></div></div>';
    document.body.appendChild(clearModalEl);
  }

  function closeClearModal() {
    if (clearModalEl) {
      clearModalEl.remove();
      clearModalEl = null;
    }
  }

  async function confirmClearAll() {
    const dry = document.getElementById('dry-run')?.checked ? 'true' : 'false';
    const el = document.getElementById('data-content');
    el.innerHTML = '<div class="error" style="color:#ffd24d">Clearing... please wait</div>';

    try {
      const r = await fetch('/api/debug/clear-all?dry_run=' + dry, { method: 'POST', headers });
      const j = await r.json();

      if (!r.ok) {
        throw new Error(j && j.error || 'Failed');
      }

      el.innerHTML = '<pre style="white-space:pre-wrap;padding:12px;color:#a8b3cf">' + escapeHtml(JSON.stringify(j, null, 2)) + '</pre>';
      // Proactively refresh the Cloudinary panel so the UI reflects the deletion
      try { await loadCloudinary(); } catch(_) {}
    } catch (e) {
      el.innerHTML = '<div class="error">' + escapeHtml(e && e.message || 'Failed to clear') + '</div>';
    } finally {
      closeClearModal();
    }
  }

  // Webhook logs functionality
  async function loadWebhooks(reset = false) {
    if (reset) webhooksOffset = 0;

    const el = document.getElementById('webhooks-content');
    if (!el) return;

    const limit = parseInt(document.getElementById('webhooks-limit')?.value || 50, 10);
    const status = document.getElementById('webhooks-status')?.value || '';
    const ip = document.getElementById('webhooks-ip')?.value || '';
    const path = document.getElementById('webhooks-path')?.value || '';

    try {
      let url = `/api/debug/webhook-requests?limit=${encodeURIComponent(limit)}&offset=${encodeURIComponent(webhooksOffset)}`;
      if (status) url += `&status=${encodeURIComponent(status)}`;
      if (ip) url += `&ip=${encodeURIComponent(ip)}`;
      if (path) url += `&path=${encodeURIComponent(path)}`;

      const r = await fetch(url, { headers });
      const j = await r.json();

      if (j.mock) {
        el.innerHTML = '<div class="error">Mock mode enabled — showing no live data.</div>';
        return;
      }

      const requests = j.requests.map(function(req) {
        return {
          id: req.id,
          timestamp: fmtUTC(req.timestamp),
          method: req.method,
          path: req.path,
          status_code: req.status_code,
          source_ip: req.source_ip,
          processing_time_ms: req.processing_time_ms,
          error_message: req.error_message || '',
          request_body: req.request_body ? JSON.stringify(req.request_body, null, 2) : '',
          response_body: req.response_body ? JSON.stringify(req.response_body, null, 2) : ''
        };
      });

      el.innerHTML = '<div style="padding:12px">' +
        '<h3 style="margin:0 0 8px 0">Webhook Requests (Total: ' + j.total + ')</h3>' +
        renderWebhookTable(requests) +
        '</div>';

      const page = Math.floor(webhooksOffset / limit) + 1;
      document.getElementById('webhooks-page').textContent = 'Page: ' + page;
    } catch (e) {
      el.innerHTML = '<div class="error">' + (e && e.message || 'Failed to load') + '</div>';
    }
  }

  function renderWebhookTable(requests) {
    if (!requests.length) return '<p style="color:#a8b3cf">No webhook requests found.</p>';

    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="background:#2a2a2a">';
    html += '<th style="padding:8px;border:1px solid #444;text-align:left">Time</th>';
    html += '<th style="padding:8px;border:1px solid #444;text-align:left">Method</th>';
    html += '<th style="padding:8px;border:1px solid #444;text-align:left">Path</th>';
    html += '<th style="padding:8px;border:1px solid #444;text-align:left">Status</th>';
    html += '<th style="padding:8px;border:1px solid #444;text-align:left">Source IP</th>';
    html += '<th style="padding:8px;border:1px solid #444;text-align:left">Time (ms)</th>';
    html += '<th style="padding:8px;border:1px solid #444;text-align:left">Error</th>';
    html += '<th style="padding:8px;border:1px solid #444;text-align:left">Request</th>';
    html += '<th style="padding:8px;border:1px solid #444;text-align:left">Response</th>';
    html += '</tr></thead><tbody>';

    requests.forEach(function(req) {
      const statusColor = req.status_code >= 400 ? '#ff6b6b' : req.status_code >= 300 ? '#ffd93d' : '#51cf66';
      html += '<tr>';
      html += '<td style="padding:4px;border:1px solid #444;font-size:11px">' + escapeHtml(req.timestamp) + '</td>';
      html += '<td style="padding:4px;border:1px solid #444">' + escapeHtml(req.method) + '</td>';
      html += '<td style="padding:4px;border:1px solid #444">' + escapeHtml(req.path) + '</td>';
      html += '<td style="padding:4px;border:1px solid #444;color:' + statusColor + '">' + req.status_code + '</td>';
      html += '<td style="padding:4px;border:1px solid #444;font-size:11px">' + escapeHtml(req.source_ip) + '</td>';
      html += '<td style="padding:4px;border:1px solid #444">' + (req.processing_time_ms || 'N/A') + '</td>';
      html += '<td style="padding:4px;border:1px solid #444;color:#ff6b6b;font-size:11px">' + escapeHtml(req.error_message) + '</td>';
      html += '<td style="padding:4px;border:1px solid #444;max-width:200px;overflow:hidden"><pre style="margin:0;font-size:10px;white-space:pre-wrap">' + escapeHtml(req.request_body.substring(0, 200)) + (req.request_body.length > 200 ? '...' : '') + '</pre></td>';
      html += '<td style="padding:4px;border:1px solid #444;max-width:200px;overflow:hidden"><pre style="margin:0;font-size:10px;white-space:pre-wrap">' + escapeHtml(req.response_body.substring(0, 200)) + (req.response_body.length > 200 ? '...' : '') + '</pre></td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
    return html;
  }

  function webhooksNext() {
    const limit = parseInt(document.getElementById('webhooks-limit')?.value || 50, 10);
    webhooksOffset += limit;
    loadWebhooks();
  }

  function webhooksPrev() {
    const limit = parseInt(document.getElementById('webhooks-limit')?.value || 50, 10);
    webhooksOffset = Math.max(0, webhooksOffset - limit);
    loadWebhooks();
  }

  // AI Analytics loading function
  async function loadAI() {
    const content = document.getElementById('ai-content');
    const view = document.getElementById('ai-view')?.value || 'jobs';
    const limit = parseInt(document.getElementById('ai-limit')?.value || '50', 10);
    
    if (!content) return;
    
    content.innerHTML = '<div style="padding:12px;color:#a8b3cf">Loading AI analytics...</div>';
    
    try {
      const url = `/api/debug/ai?view=${encodeURIComponent(view)}&limit=${limit}`;
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.mock) {
        content.innerHTML = '<div style="padding:12px;color:#a8b3cf">Mock mode - AI analytics data not available</div>';
        return;
      }
      
      if (!result.data || result.data.length === 0) {
        content.innerHTML = `<div style="padding:12px;color:#a8b3cf">No ${view} data found</div>`;
        return;
      }
      
      let html = `<div style="margin-bottom:8px;color:#a8b3cf">Showing ${result.data.length} of ${result.total} ${view}</div>`;
      
      // Create table based on view type
      switch (view) {
        case 'jobs':
          html += '<table><thead><tr><th>ID</th><th>Source</th><th>Status</th><th>Created</th><th>Updated</th><th>Error</th></tr></thead><tbody>';
          result.data.forEach(item => {
            const errorText = item.error ? escapeHtml(item.error) : '';
            html += `<tr>
              <td>${escapeHtml(item.id)}</td>
              <td>${escapeHtml(item.source_type)}:${escapeHtml(item.source_id)}</td>
              <td><span class="status-${item.status}">${escapeHtml(item.status)}</span></td>
              <td>${fmtUTC(item.created_at)}</td>
              <td>${fmtUTC(item.updated_at)}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${errorText}</td>
            </tr>`;
          });
          html += '</tbody></table>';
          break;
          
        case 'detections':
          html += '<table><thead><tr><th>ID</th><th>Event</th><th>Channel</th><th>Type</th><th>Label</th><th>Score</th><th>Time</th></tr></thead><tbody>';
          result.data.forEach(item => {
            const score = item.score ? (item.score * 100).toFixed(1) + '%' : '';
            html += `<tr>
              <td>${escapeHtml(item.id)}</td>
              <td>${escapeHtml(item.event_id || '')}</td>
              <td>${escapeHtml(item.channel_id || '')}</td>
              <td>${escapeHtml(item.type || '')}</td>
              <td>${escapeHtml(item.label || '')}</td>
              <td>${score}</td>
              <td>${fmtUTC(item.ts)}</td>
            </tr>`;
          });
          html += '</tbody></table>';
          break;
          
        case 'baselines':
          html += '<table><thead><tr><th>ID</th><th>Entity Type</th><th>Entity ID</th><th>Features</th><th>Updated</th></tr></thead><tbody>';
          result.data.forEach(item => {
            const features = item.features ? JSON.stringify(item.features).substring(0, 100) + '...' : '';
            html += `<tr>
              <td>${escapeHtml(item.id)}</td>
              <td>${escapeHtml(item.entity_type)}</td>
              <td>${escapeHtml(item.entity_id)}</td>
              <td style="max-width:200px;overflow:hidden">${escapeHtml(features)}</td>
              <td>${fmtUTC(item.updated_at)}</td>
            </tr>`;
          });
          html += '</tbody></table>';
          break;
          
        case 'anomalies':
          html += '<table><thead><tr><th>ID</th><th>Metric</th><th>Entity</th><th>Value</th><th>Score</th><th>Threshold</th><th>Time</th></tr></thead><tbody>';
          result.data.forEach(item => {
            html += `<tr>
              <td>${escapeHtml(item.id)}</td>
              <td>${escapeHtml(item.metric)}</td>
              <td>${escapeHtml(item.entity_type)}:${escapeHtml(item.entity_id)}</td>
              <td>${item.value ? item.value.toFixed(2) : ''}</td>
              <td>${item.score ? item.score.toFixed(2) : ''}</td>
              <td>${item.threshold ? item.threshold.toFixed(2) : ''}</td>
              <td>${fmtUTC(item.ts)}</td>
            </tr>`;
          });
          html += '</tbody></table>';
          break;
          
        case 'insights':
          html += '<table><thead><tr><th>ID</th><th>Scope</th><th>Summary</th><th>Recommendations</th><th>Time</th></tr></thead><tbody>';
          result.data.forEach(item => {
            const summary = item.summary ? escapeHtml(item.summary).substring(0, 150) + '...' : '';
            const recs = item.recommendations ? JSON.stringify(item.recommendations).substring(0, 100) + '...' : '';
            html += `<tr>
              <td>${escapeHtml(item.id)}</td>
              <td>${escapeHtml(item.scope)}:${escapeHtml(item.scope_id || '')}</td>
              <td style="max-width:200px">${summary}</td>
              <td style="max-width:150px">${escapeHtml(recs)}</td>
              <td>${fmtUTC(item.ts)}</td>
            </tr>`;
          });
          html += '</tbody></table>';
          break;
      }
      
      content.innerHTML = html;
    } catch (error) {
      content.innerHTML = `<div style="padding:12px;color:#ff6b6b">Error loading AI analytics: ${escapeHtml(error.message)}</div>`;
    }
  }

  // Export functions to global scope for compatibility
  window.loadPg = loadPg;
  window.pgNext = pgNext;
  window.pgPrev = pgPrev;
  window.loadNeo4j = loadNeo4j;
  window.loadCloudinary = loadCloudinary;
  window.loadWebhooks = loadWebhooks;
  window.webhooksNext = webhooksNext;
  window.webhooksPrev = webhooksPrev;
  window.loadAI = loadAI;
  window.openClearModal = openClearModal;
  window.closeClearModal = closeClearModal;
  window.confirmClearAll = confirmClearAll;

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
