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
    } catch (e) {
      el.innerHTML = '<div class="error">' + escapeHtml(e && e.message || 'Failed to clear') + '</div>';
    } finally {
      closeClearModal();
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export functions to global scope for compatibility
  window.loadPg = loadPg;
  window.pgNext = pgNext;
  window.pgPrev = pgPrev;
  window.loadNeo4j = loadNeo4j;
  window.loadCloudinary = loadCloudinary;
  window.openClearModal = openClearModal;
  window.closeClearModal = closeClearModal;
  window.confirmClearAll = confirmClearAll;

})();
