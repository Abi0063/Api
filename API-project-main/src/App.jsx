/**
 * Smart Developer Tool — SDK Generator Dashboard
 * React frontend for the Flask backend (src/app.py)
 *
 * Endpoints consumed:
 *   POST /api/generate-sdk   → { success, sdk_code, live_test, meta }
 *   POST /api/validate-url   → { valid, errors }
 *   GET  /api/weather        → { city, country, temp, feels_like, desc, humidity, wind_kmph, sdk_preview }
 *   GET  /api/currency       → { from, to, amount, rate, result, updated_at }
 *   GET  /api/joke           → { id, type, setup, punchline }
 *   GET  /api/health         → { status, service, version }
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import './App.css';

/* ─────────────────────────────────────────────
   Constants
───────────────────────────────────────────── */
const FLASK = 'http://127.0.0.1:5000';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const METHOD_COLOR = {
  GET:    '#3fb950',
  POST:   '#58a6ff',
  PUT:    '#e3b341',
  PATCH:  '#a78bfa',
  DELETE: '#f85149',
};

const PRESETS = [
  {
    label:   '🌤 Weather',
    url:     'https://wttr.in/Chennai?format=j1',
    method:  'GET',
    params:  [{ key: 'city', value: 'Chennai' }],
    headers: [],
  },
  {
    label:   '🐙 GitHub User',
    url:     'https://api.github.com/users/octocat',
    method:  'GET',
    params:  [],
    headers: [],
  },
  {
    label:   '🌍 IP Geolocation',
    url:     'http://ip-api.com/json/8.8.8.8',
    method:  'GET',
    params:  [],
    headers: [],
  },
];

const CURRENCIES = ['USD', 'INR', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'CHF', 'CNY'];

/* ─────────────────────────────────────────────
   Tiny sub-components
───────────────────────────────────────────── */

/** Coloured HTTP method badge */
function MethodBadge({ method, size = 'sm' }) {
  const color = METHOD_COLOR[method] || '#8b949e';
  return (
    <span
      className={`method-badge method-badge--${size}`}
      style={{ background: color + '22', color, border: `1px solid ${color}55` }}
    >
      {method}
    </span>
  );
}

/** HTTP status code badge (green / blue / red / yellow) */
function StatusBadge({ code }) {
  if (!code) return null;
  const color =
    code >= 200 && code < 300 ? '#3fb950' :
    code >= 300 && code < 400 ? '#58a6ff' :
    code >= 400 && code < 500 ? '#f85149' : '#e3b341';
  return (
    <span
      className="status-badge"
      style={{ background: color + '22', color, border: `1px solid ${color}55` }}
    >
      {code}
    </span>
  );
}

/** One-click clipboard copy button */
function CopyBtn({ text, label = '📋 Copy SDK' }) {
  const [done, setDone] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    });
  return (
    <button className="copy-btn" onClick={copy}>
      {done ? '✅ Copied!' : label}
    </button>
  );
}

/** Download text as a .py file */
function DownloadBtn({ code, filename = 'sdk.py' }) {
  const download = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button className="copy-btn" onClick={download} title="Download as .py file">
      ⬇ Download
    </button>
  );
}

/** Animated spinner */
function Spinner({ size = 16 }) {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size, borderWidth: size > 20 ? 3 : 2 }}
    />
  );
}

/** Key-value pair table editor (params / headers) */
function KVEditor({ label, pairs, onChange }) {
  const add    = ()        => onChange([...pairs, { key: '', value: '' }]);
  const remove = (i)       => onChange(pairs.filter((_, idx) => idx !== i));
  const update = (i, f, v) =>
    onChange(pairs.map((p, idx) => (idx === i ? { ...p, [f]: v } : p)));

  return (
    <div className="kv-editor">
      {pairs.length > 0 && (
        <div className="kv-grid kv-grid--header">
          <span>Key</span>
          <span>Value</span>
          <span />
        </div>
      )}
      {pairs.map((p, i) => (
        <div className="kv-grid" key={i}>
          <input
            placeholder="key"
            value={p.key}
            onChange={e => update(i, 'key', e.target.value)}
          />
          <input
            placeholder="value"
            value={p.value}
            onChange={e => update(i, 'value', e.target.value)}
          />
          <button className="kv-remove" onClick={() => remove(i)} title="Remove row">✕</button>
        </div>
      ))}
      <button className="kv-add" onClick={add}>＋ Add {label}</button>
    </div>
  );
}

/** Collapsible section */
function Collapsible({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapsible">
      <button className="collapsible-toggle" onClick={() => setOpen(o => !o)}>
        <span className={`caret ${open ? 'caret--open' : ''}`}>›</span>
        {title}
      </button>
      {open && <div className="collapsible-body">{children}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */
const pairsToObj = (pairs) =>
  pairs.reduce((acc, { key, value }) => {
    const k = key.trim();
    if (k) acc[k] = value;
    return acc;
  }, {});

/* ── Build a URL with query params appended ── */
const buildUrlWithParams = (baseUrl, paramsObj) => {
  const entries = Object.entries(paramsObj || {});
  if (!entries.length) return baseUrl;
  const usp = new URLSearchParams(entries);
  const sep = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${sep}${usp.toString()}`;
};

/* ── Generate a JavaScript (fetch) snippet ── */
const generateJsCode = ({ url, method, params, headers, body }) => {
  const fullUrl   = buildUrlWithParams(url, params);
  const headerObj = { ...headers };
  const hasBody   = body && ['POST', 'PUT', 'PATCH'].includes(method);
  if (hasBody && !headerObj['Content-Type']) headerObj['Content-Type'] = 'application/json';

  const headerLines = Object.keys(headerObj).length
    ? `  headers: ${JSON.stringify(headerObj, null, 2).replace(/\n/g, '\n  ')},\n`
    : '';
  const bodyLine = hasBody
    ? `  body: JSON.stringify(${JSON.stringify(body, null, 2).replace(/\n/g, '\n  ')}),\n`
    : '';

  return `/**
 * Auto-generated JavaScript client
 * Method: ${method}
 */
async function callApi() {
  const response = await fetch("${fullUrl}", {
    method: "${method}",
${headerLines}${bodyLine}  });

  if (!response.ok) {
    throw new Error(\`Request failed with status \${response.status}\`);
  }

  const data = await response.json();
  return data;
}

callApi()
  .then(data => console.log(data))
  .catch(err => console.error("Error:", err.message));
`;
};

/* ── Generate a cURL command ── */
const generateCurlCode = ({ url, method, params, headers, body }) => {
  const fullUrl   = buildUrlWithParams(url, params);
  const headerObj = { ...headers };
  const hasBody   = body && ['POST', 'PUT', 'PATCH'].includes(method);
  if (hasBody && !headerObj['Content-Type']) headerObj['Content-Type'] = 'application/json';

  let cmd = `curl -X ${method} "${fullUrl}"`;
  Object.entries(headerObj).forEach(([k, v]) => {
    cmd += ` \\\n  -H "${k}: ${v}"`;
  });
  if (hasBody) {
    cmd += ` \\\n  -d '${JSON.stringify(body)}'`;
  }
  return cmd + '\n';
};

const formatBytes = (b) => {
  if (b >= 1_048_576) return (b / 1_048_576).toFixed(2) + ' MB';
  if (b >= 1_024)     return (b / 1_024).toFixed(1) + ' KB';
  return b + ' B';
};

const statusColor = (code) =>
  code >= 200 && code < 300 ? '#3fb950' :
  code >= 300 && code < 400 ? '#58a6ff' :
  code >= 400 && code < 500 ? '#f85149' : '#e3b341';

/* ─────────────────────────────────────────────
   Main App
───────────────────────────────────────────── */
export default function App() {
  /* ── top-level tab: 'sdk' | 'quickapi' ── */
  const [mainTab, setMainTab] = useState('sdk');

  /* ── server health ── */
  const [serverOk, setServerOk] = useState(null); // null=checking, true, false

  useEffect(() => {
    axios.get(`${FLASK}/api/health`, { timeout: 4000 })
      .then(() => setServerOk(true))
      .catch(() => setServerOk(false));
  }, []);

  return (
    <div className="app-root">
      <Header
        mainTab={mainTab}
        setMainTab={setMainTab}
        serverOk={serverOk}
      />

      {mainTab === 'sdk'      && <SDKGeneratorTab />}
      {mainTab === 'quickapi' && <QuickAPITab />}

      <footer className="app-footer">
        ⚡ Smart Developer Tool &nbsp;·&nbsp; SDK Generator &amp; API Integration Platform
        &nbsp;·&nbsp; Flask + React
      </footer>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Header
───────────────────────────────────────────── */
function Header({ mainTab, setMainTab, serverOk }) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <span className="brand-glow">⚡</span>
        <div>
          <h1 className="brand-title">Smart<span>Dev</span>Tool</h1>
          <p className="brand-sub">API SDK Generator &amp; Integration Platform</p>
        </div>
      </div>

      <nav className="main-tabs">
        <button
          className={`main-tab ${mainTab === 'sdk' ? 'active' : ''}`}
          onClick={() => setMainTab('sdk')}
        >
          🛠 SDK Generator
        </button>
        <button
          className={`main-tab ${mainTab === 'quickapi' ? 'active' : ''}`}
          onClick={() => setMainTab('quickapi')}
        >
          🔁 Quick APIs
        </button>
      </nav>

      <div className="server-status">
        {serverOk === null && <span className="status-dot status-dot--warn" title="Checking…" />}
        {serverOk === true  && <span className="status-dot status-dot--ok"   title="Flask server online" />}
        {serverOk === false && <span className="status-dot status-dot--err"  title="Flask server offline" />}
        <span className="status-label">
          {serverOk === null ? 'Connecting…' : serverOk ? 'Server online' : 'Server offline'}
        </span>
      </div>
    </header>
  );
}

/* ─────────────────────────────────────────────
   SDK Generator Tab
───────────────────────────────────────────── */
function SDKGeneratorTab() {
  /* ── request builder state ── */
  const [url,         setUrl]         = useState('https://wttr.in/Chennai?format=j1');
  const [method,      setMethod]      = useState('GET');
  const [paramPairs,  setParamPairs]  = useState([{ key: 'city', value: 'Chennai' }]);
  const [headerPairs, setHeaderPairs] = useState([]);
  const [bodyText,    setBodyText]    = useState('');
  const [timeout,     setTimeout_]    = useState(15);
  const [activeTab,   setActiveTab]   = useState('params');

  /* ── URL validation (debounced) ── */
  const [urlValid,  setUrlValid]  = useState(true);
  const [urlErrors, setUrlErrors] = useState([]);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!url.trim()) { setUrlValid(true); setUrlErrors([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      axios.post(`${FLASK}/api/validate-url`, { url }, { timeout: 3000 })
        .then(r => { setUrlValid(r.data.valid); setUrlErrors(r.data.errors || []); })
        .catch(() => { setUrlValid(true); setUrlErrors([]); });
    }, 500);
    return () => clearTimeout(debounceRef.current);
  }, [url]);

  /* ── output state ── */
  const [sdkCode,      setSdkCode]      = useState('');
  const [liveTest,     setLiveTest]     = useState(null);
  const [meta,         setMeta]         = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [errorDetails, setErrorDetails] = useState([]);
  const [codeLang,     setCodeLang]     = useState('python'); // 'python' | 'javascript' | 'curl'
  const [lastReq,      setLastReq]      = useState(null); // snapshot of the request that produced sdkCode

  /* ── load preset ── */
  const loadPreset = (p) => {
    setUrl(p.url);
    setMethod(p.method);
    setParamPairs(p.params);
    setHeaderPairs(p.headers);
    setBodyText('');
    setSdkCode('');
    setLiveTest(null);
    setMeta(null);
    setError('');
    setErrorDetails([]);
    setCodeLang('python');
    setLastReq(null);
  };

  /* ── generate SDK ── */
  const generate = useCallback(async () => {
    if (!url.trim()) { setError('API URL is required.'); return; }

    let bodyObj = null;
    if (['POST', 'PUT', 'PATCH'].includes(method) && bodyText.trim()) {
      try { bodyObj = JSON.parse(bodyText); }
      catch { setError('Body is not valid JSON. Fix it before generating.'); return; }
    }

    setLoading(true);
    setSdkCode('');
    setLiveTest(null);
    setMeta(null);
    setError('');
    setErrorDetails([]);

    try {
      const res = await axios.post(`${FLASK}/api/generate-sdk`, {
        api_url: url.trim(),
        method,
        params:  pairsToObj(paramPairs),
        headers: pairsToObj(headerPairs),
        body:    bodyObj,
        timeout: Number(timeout) || 15,
      });

      if (res.data.success) {
        setSdkCode(res.data.sdk_code  || '');
        setLiveTest(res.data.live_test || null);
        setMeta(res.data.meta         || null);
        setCodeLang('python');
        setLastReq({
          url: url.trim(),
          method,
          params:  pairsToObj(paramPairs),
          headers: pairsToObj(headerPairs),
          body:    bodyObj,
        });
      } else {
        setError(res.data.error || 'Server returned an error.');
        setErrorDetails(res.data.details || []);
      }
    } catch (err) {
      const d = err.response?.data;
      if (d) {
        setError(d.error || 'Validation failed.');
        setErrorDetails(d.details || []);
      } else {
        setError('Cannot reach the Flask server. Make sure it is running on port 5000.');
      }
    } finally {
      setLoading(false);
    }
  }, [url, method, paramPairs, headerPairs, bodyText, timeout]);

  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const paramCount  = paramPairs.filter(p => p.key.trim()).length;
  const headerCount = headerPairs.filter(h => h.key.trim()).length;
  const sdkFilename = meta
    ? `${meta.class_name || 'sdk'}.py`
    : 'sdk.py';

  const displayedCode = !lastReq
    ? sdkCode
    : codeLang === 'python'     ? sdkCode
    : codeLang === 'javascript' ? generateJsCode(lastReq)
    : generateCurlCode(lastReq);

  const codeFilename =
    codeLang === 'python'     ? sdkFilename
    : codeLang === 'javascript' ? (meta?.class_name ? `${meta.class_name}.js` : 'api-client.js')
    : (meta?.class_name ? `${meta.class_name}.sh` : 'request.sh');

  return (
    <div className="sdk-layout">

      {/* ── LEFT: Request Builder ── */}
      <section className="builder-panel">
        <div className="panel-heading">
          <h2 className="panel-title">Request Builder</h2>
          <span className="panel-hint">Press ⏎ or click Generate to run</span>
        </div>

        {/* Presets */}
        <div className="presets-row">
          <span className="presets-label">Presets</span>
          <div className="presets-chips">
            {PRESETS.map(p => (
              <button key={p.label} className="preset-chip" onClick={() => loadPreset(p)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Method + URL */}
        <div className="url-bar">
          <select
            className="method-select"
            value={method}
            onChange={e => setMethod(e.target.value)}
            style={{
              borderColor: (METHOD_COLOR[method] || '#8b949e') + '99',
              color: METHOD_COLOR[method] || '#8b949e',
            }}
          >
            {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>

          <div className="url-input-wrap">
            <input
              className={`url-input ${!urlValid ? 'url-input--invalid' : ''}`}
              type="text"
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
              placeholder="https://api.example.com/v1/endpoint"
              spellCheck={false}
            />
            {!urlValid && urlErrors.length > 0 && (
              <div className="url-error-tip">{urlErrors[0]}</div>
            )}
          </div>
        </div>

        {/* Timeout */}
        <div className="timeout-row">
          <label className="timeout-label" htmlFor="timeoutInput">Timeout (s)</label>
          <input
            id="timeoutInput"
            className="timeout-input"
            type="number"
            min={1}
            max={120}
            value={timeout}
            onChange={e => setTimeout_(e.target.value)}
          />
        </div>

        {/* Params / Headers / Body tabs */}
        <div className="sub-tabs">
          {[
            { id: 'params',  label: 'Params',  count: paramCount },
            { id: 'headers', label: 'Headers', count: headerCount },
            { id: 'body',    label: 'Body',    count: 0 },
          ].map(t => (
            <button
              key={t.id}
              className={`sub-tab ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
              {t.count > 0 && <span className="tab-badge">{t.count}</span>}
            </button>
          ))}
        </div>

        <div className="sub-tab-body">
          {activeTab === 'params' && (
            <KVEditor label="Param" pairs={paramPairs} onChange={setParamPairs} />
          )}
          {activeTab === 'headers' && (
            <KVEditor label="Header" pairs={headerPairs} onChange={setHeaderPairs} />
          )}
          {activeTab === 'body' && (
            hasBody ? (
              <div className="body-wrap">
                <div className="body-toolbar">
                  <span className="body-hint">JSON body for {method} request</span>
                  <button
                    className="kv-add"
                    onClick={() => {
                      try {
                        setBodyText(JSON.stringify(JSON.parse(bodyText), null, 2));
                      } catch { /* not valid JSON yet */ }
                    }}
                  >
                    ✦ Format
                  </button>
                </div>
                <textarea
                  className="body-editor"
                  rows={9}
                  placeholder={'{\n  "key": "value"\n}'}
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  spellCheck={false}
                />
              </div>
            ) : (
              <p className="body-disabled">
                Body is only applicable to POST, PUT, and PATCH requests.
              </p>
            )
          )}
        </div>

        {/* Generate button */}
        <button
          className={`generate-btn ${loading ? 'generate-btn--busy' : ''}`}
          onClick={generate}
          disabled={loading}
        >
          {loading
            ? <><Spinner size={16} /> Generating SDK…</>
            : '⚡ Generate SDK & Test Live'}
        </button>

        {/* Validation error box */}
        {error && (
          <div className="error-box" role="alert">
            <p className="error-title">⚠ {error}</p>
            {errorDetails.length > 0 && (
              <ul className="error-list">
                {errorDetails.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ── RIGHT: Output Panel ── */}
      <section className="output-panel">

        {/* Idle state */}
        {!loading && !sdkCode && !liveTest && (
          <div className="output-idle">
            <div className="idle-icon">🚀</div>
            <p className="idle-title">Ready to generate</p>
            <p className="idle-sub">
              Pick a preset or enter a URL, then click<br />
              <strong>⚡ Generate SDK &amp; Test Live</strong>
            </p>
            <div className="idle-steps">
              <div className="idle-step"><span>1</span> Enter API URL &amp; method</div>
              <div className="idle-step"><span>2</span> Add params / headers / body</div>
              <div className="idle-step"><span>3</span> Get live test + Python SDK</div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="output-loading">
            <Spinner size={40} />
            <p className="loading-steps">
              Validating &nbsp;→&nbsp; Testing live &nbsp;→&nbsp; Generating SDK…
            </p>
          </div>
        )}

        {/* Live test card */}
        {liveTest && !loading && (
          <Collapsible title="Live Test Result" defaultOpen={true}>
            <LiveTestCard liveTest={liveTest} meta={meta} />
          </Collapsible>
        )}

        {/* SDK output */}
        {sdkCode && !loading && (
          <div className="sdk-output-card">
            <div className="sdk-output-header">
              <div className="sdk-output-title">
                <span>
                  {codeLang === 'python' ? '🐍 Generated Python SDK'
                    : codeLang === 'javascript' ? '📜 Generated JavaScript'
                    : '⌨️ Generated cURL Command'}
                </span>
                {codeLang === 'python' && meta?.class_name && (
                  <code className="sdk-classname">class {meta.class_name}</code>
                )}
              </div>
              <div className="sdk-output-actions">
                <CopyBtn text={displayedCode} />
                <DownloadBtn code={displayedCode} filename={codeFilename} />
              </div>
            </div>

            <div className="lang-tabs">
              {[
                { id: 'python',     label: 'Python' },
                { id: 'javascript', label: 'JavaScript' },
                { id: 'curl',       label: 'cURL' },
              ].map(l => (
                <button
                  key={l.id}
                  className={`lang-tab ${codeLang === l.id ? 'active' : ''}`}
                  onClick={() => setCodeLang(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <pre className="sdk-code">{displayedCode}</pre>
          </div>
        )}

      </section>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Live Test Card
───────────────────────────────────────────── */
function LiveTestCard({ liveTest, meta }) {
  const [previewOpen, setPreviewOpen] = useState(true);

  if (liveTest.error) {
    return (
      <div className="live-test-warn">
        <span>⚠</span> {liveTest.error}
      </div>
    );
  }

  const sc = liveTest.status_code;

  return (
    <div className="live-test-body">
      {/* Stats row */}
      <div className="live-stats">
        <div className="live-stat">
          <span className="live-stat-label">Status</span>
          <div className="live-stat-val-row">
            <StatusBadge code={sc} />
            <span className="live-stat-sub">{liveTest.status_label}</span>
          </div>
        </div>

        <div className="live-stat">
          <span className="live-stat-label">Latency</span>
          <span
            className="live-stat-val"
            style={{ color: liveTest.latency_ms > 1000 ? '#f85149' : '#3fb950' }}
          >
            {liveTest.latency_ms} ms
          </span>
        </div>

        <div className="live-stat">
          <span className="live-stat-label">Size</span>
          <span className="live-stat-val">
            {formatBytes(liveTest.size_bytes)}
          </span>
        </div>

        <div className="live-stat">
          <span className="live-stat-label">Type</span>
          <span className="live-stat-sub" style={{ maxWidth: 180, wordBreak: 'break-all' }}>
            {liveTest.content_type || '—'}
          </span>
        </div>

        {meta?.class_name && (
          <div className="live-stat" style={{ marginLeft: 'auto' }}>
            <span className="live-stat-label">Class</span>
            <code className="sdk-classname">{meta.class_name}</code>
          </div>
        )}
      </div>

      {/* Progress bar for status */}
      <div className="status-bar-bg">
        <div
          className="status-bar-fill"
          style={{
            width: `${Math.min((sc / 599) * 100, 100)}%`,
            background: statusColor(sc),
          }}
        />
      </div>

      {/* Response preview */}
      {liveTest.data_preview && (
        <div className="preview-wrap">
          <button
            className="preview-toggle"
            onClick={() => setPreviewOpen(o => !o)}
          >
            <span className={`caret ${previewOpen ? 'caret--open' : ''}`}>›</span>
            Response Preview
            <span className="preview-type-badge">
              {liveTest.response_type === 'json' ? 'JSON' : 'TEXT'}
            </span>
            {!previewOpen && (
              <span className="preview-peek">
                {liveTest.data_preview.slice(0, 60).replace(/\n/g, ' ')}…
              </span>
            )}
          </button>
          {previewOpen && (
            <div className="preview-body">
              <CopyBtn text={liveTest.data_preview} label="📋 Copy" />
              <pre className="response-pre">{liveTest.data_preview}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Quick API Tab  (Weather / Currency / Jokes)
───────────────────────────────────────────── */
function QuickAPITab() {
  const [tab, setTab] = useState('weather');
  const [data, setData]   = useState(null);
  const [err,  setErr]    = useState('');
  const [busy, setBusy]   = useState(false);

  // Weather
  const [city,   setCity]   = useState('');
  const [docUrl, setDocUrl] = useState('https://wttr.in');

  // Currency
  const [from,   setFrom]   = useState('USD');
  const [to,     setTo]     = useState('INR');
  const [amount, setAmount] = useState(1);

  const reset = (t) => { setTab(t); setData(null); setErr(''); };

  const call = async () => {
    setBusy(true); setErr(''); setData(null);
    try {
      let res;
      if (tab === 'weather') {
        if (!city.trim()) { setErr('City name is required.'); setBusy(false); return; }
        res = await axios.get(`${FLASK}/api/weather`, {
          params: { city: city.trim(), url: docUrl },
        });
      } else if (tab === 'currency') {
        res = await axios.get(`${FLASK}/api/currency`, {
          params: { from, to, amount },
        });
      } else {
        res = await axios.get(`${FLASK}/api/joke`);
      }
      setData(res.data);
    } catch (e) {
      setErr(e.response?.data?.error || 'Request failed. Check the Flask server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="quickapi-wrap">
      {/* Sub-nav */}
      <div className="qa-tabs">
        {[
          { id: 'weather',  label: '🌤 Weather'  },
        ].map(t => (
          <button
            key={t.id}
            className={`qa-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => reset(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="qa-card">
        {/* Error banner */}
        {err && (
          <div className="error-box" role="alert">
            <p className="error-title">⚠ {err}</p>
          </div>
        )}

        {/* ── Weather ── */}
        {tab === 'weather' && (
          <>
            <h3 className="qa-title">☁️ Weather SDK Generator</h3>
            <p className="qa-desc">
              Fetch live weather data and get a ready-to-use Python SDK for the wttr.in API.
            </p>

            <div className="qa-form">
              <div className="form-field">
                <label>City Name</label>
                <input
                  className="text-input"
                  placeholder="e.g. Chennai"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && call()}
                />
              </div>
              <div className="form-field">
                <label>Documentation URL</label>
                <input
                  className="text-input"
                  placeholder="https://wttr.in"
                  value={docUrl}
                  onChange={e => setDocUrl(e.target.value)}
                />
              </div>
            </div>

            <button className="generate-btn" onClick={call} disabled={busy}>
              {busy ? <><Spinner /> Fetching…</> : '⚡ Generate & Fetch'}
            </button>

            {data && (
              <div className="qa-result">
                {/* Weather stats */}
                <div className="weather-stats">
                  <div className="weather-stat">
                    <span>🌡</span>
                    <div>
                      <div className="ws-val">{data.temp}°C</div>
                      <div className="ws-lbl">Temperature</div>
                    </div>
                  </div>
                  <div className="weather-stat">
                    <span>🤔</span>
                    <div>
                      <div className="ws-val">{data.feels_like}°C</div>
                      <div className="ws-lbl">Feels Like</div>
                    </div>
                  </div>
                  <div className="weather-stat">
                    <span>💧</span>
                    <div>
                      <div className="ws-val">{data.humidity}%</div>
                      <div className="ws-lbl">Humidity</div>
                    </div>
                  </div>
                  <div className="weather-stat">
                    <span>💨</span>
                    <div>
                      <div className="ws-val">{data.wind_kmph} km/h</div>
                      <div className="ws-lbl">Wind</div>
                    </div>
                  </div>
                </div>

                <div className="weather-desc">
                  📍 {data.city}, {data.country} &nbsp;—&nbsp; {data.desc}
                </div>

                {/* SDK preview */}
                <div className="sdk-output-card" style={{ marginTop: 16 }}>
                  <div className="sdk-output-header">
                    <span>🐍 Generated SDK</span>
                    <div className="sdk-output-actions">
                      <CopyBtn text={data.sdk_preview} />
                      <DownloadBtn code={data.sdk_preview} filename="smart_weather_sdk.py" />
                    </div>
                  </div>
                  <pre className="sdk-code">{data.sdk_preview}</pre>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Currency ── */}
        {tab === 'currency' && (
          <>
            <h3 className="qa-title">💱 Currency Converter</h3>
            <p className="qa-desc">
              Live exchange rates from open.er-api.com with ISO 4217 code validation.
            </p>

            <div className="currency-form">
              <div className="form-field">
                <label>Amount</label>
                <input
                  className="text-input"
                  type="number"
                  min={0}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label>From</label>
                <select className="text-input" value={from} onChange={e => setFrom(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="currency-arrow">→</div>
              <div className="form-field">
                <label>To</label>
                <select className="text-input" value={to} onChange={e => setTo(e.target.value)}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <button className="generate-btn" onClick={call} disabled={busy}>
              {busy ? <><Spinner /> Converting…</> : '💱 Convert'}
            </button>

            {data && (
              <div className="qa-result">
                <div className="currency-result">
                  <div className="cr-equation">
                    <span className="cr-amount">{data.amount} {data.from}</span>
                    <span className="cr-eq">=</span>
                    <span className="cr-converted">{data.result} {data.to}</span>
                  </div>
                  <div className="cr-rate">
                    Rate: 1 {data.from} = {data.rate} {data.to}
                  </div>
                  {data.updated_at && (
                    <div className="cr-updated">Updated: {data.updated_at}</div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Jokes ── */}
        {tab === 'jokes' && (
          <>
            <h3 className="qa-title">😆 Random Dev Joke</h3>
            <p className="qa-desc">
              Fetches a random programming joke from the Official Joke API.
            </p>

            <button className="generate-btn" onClick={call} disabled={busy}>
              {busy ? <><Spinner /> Fetching…</> : '🎲 Get a Joke'}
            </button>

            {data && (
              <div className="qa-result joke-result">
                <div className="joke-setup">❓ {data.setup}</div>
                <div className="joke-punchline">💡 {data.punchline}</div>
                {data.type && (
                  <div className="joke-meta">Type: {data.type} &nbsp;·&nbsp; #{data.id}</div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
