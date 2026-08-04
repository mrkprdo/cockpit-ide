// SpecsMap — static visual assets: the window's injected <style> text and the
// header SVG icon markup. Kept out of the facade so the facade stays under the
// LOC ceiling; these are pure string constants with no behavior.

export const SM_STYLES = `
  .sm-node {
    position: absolute;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    cursor: pointer;
    transition: box-shadow 0.15s, border-color 0.15s, opacity 0.15s;
    box-shadow: var(--shadow);
    overflow: visible;
    box-sizing: border-box;
  }
  .sm-node.sm-selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px color-mix(in oklab, var(--accent) 40%, transparent), 0 0 18px color-mix(in oklab, var(--accent) 18%, transparent);
  }
  .sm-node-inner {
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    height: 100%;
    box-sizing: border-box;
  }
  .sm-node-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .sm-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .sm-name {
    font-size: 13px; font-weight: 700; color: var(--primary);
    line-height: 1.3; flex: 1; min-width: 0;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .sm-layer-badge { font-size: 9px; font-weight: 700; letter-spacing: 0.8px; flex-shrink: 0; color: var(--tertiary); opacity: 0.8; }
  .sm-file { font-size: 11px; color: var(--tertiary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sm-meta { font-size: 10px; color: var(--secondary); margin-top: auto; display: flex; gap: 6px; }
  .sm-node-ui .sm-name { font-size: 11px; }
  .sm-node-ui .sm-file { font-size: 10px; }
  .sm-node-ui .sm-dot { width: 6px; height: 6px; opacity: 0.6; }
  .sm-layer-header {
    position: absolute; font-size: 13px; font-weight: 700; letter-spacing: 1.5px;
    user-select: none; pointer-events: none; opacity: 0.45;
  }
  .sm-panel-section { padding: 10px 14px; border-bottom: 1px solid var(--border); }
  .sm-panel-label {
    font-size: 9px; font-weight: 700; letter-spacing: 1px;
    color: var(--tertiary); margin-bottom: 8px;
  }
  .sm-panel-row { font-size: 11px; color: var(--primary); line-height: 1.5; }
  .sm-panel-mono { font-size: 10px; color: var(--secondary); word-break: break-all; }
  .sm-dep-item {
    display: flex; gap: 6px; align-items: baseline;
    padding: 4px 0; border-bottom: 1px solid var(--border);
    font-size: 10px;
  }
  .sm-dep-item:last-child { border-bottom: none; }
  .sm-dep-name { font-weight: 700; color: var(--primary); flex-shrink: 0; }
  .sm-dep-file { color: var(--tertiary); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sm-dep-usage { font-size: 9px; color: var(--secondary); line-height: 1.4; margin-top: 1px; }
  @keyframes sm-flow { to { stroke-dashoffset: -20; } }
  .sm-edge-active { animation: sm-flow 0.8s linear infinite; }
  @keyframes sm-flow-fast { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -24; } }
  .sm-isolated-border { animation: sm-flow-fast 0.4s linear infinite; stroke-dashoffset: 0; }
  @keyframes sm-spin { to { transform: rotate(360deg); } }
  .sm-spinning { display: inline-block; animation: sm-spin 0.7s linear infinite; }
  .sm-panel-el { transition: transform 0.2s cubic-bezier(0.4,0,0.2,1); }
  @media (prefers-reduced-motion: reduce) {
    .sm-edge-active { animation: none; }
    .sm-isolated-border { animation: none; }
    .sm-spinning { animation: none; }
    .sm-panel-el { transition: none; }
  }
  .sm-header-btn { border:none; outline:none; background:none; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:5px 7px; color:var(--tertiary); line-height:0; transition:color 0.15s,background 0.15s; }
  .sm-header-btn:hover { color:var(--accent); background:var(--surface); }
  .sm-header-btn:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .sm-empty-btn {
    pointer-events: auto;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 24px;
    font-family: "Space Mono", "Courier New", monospace;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.8px;
    color: var(--primary);
    cursor: pointer;
    transition: border-color 0.15s, box-shadow 0.15s, color 0.15s;
  }
  .sm-empty-btn:hover {
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 12px color-mix(in oklab, var(--accent) 20%, transparent);
  }
  .sm-empty-btn:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .sm-isolated {
    box-shadow: 0 0 0 1px #fbbf2444, 0 0 14px #fbbf2433 !important;
  }
  .sm-port {
    position: absolute;
    width: 6px; height: 6px;
    border-radius: 50%;
    z-index: 1;
    pointer-events: none;
    opacity: 0.4;
    transition: opacity 0.15s, transform 0.15s;
  }
  .sm-node:hover .sm-port {
    opacity: 0.85;
    transform: scale(1.3);
  }
  .sm-node-ui .sm-port {
    display: none;
  }
  .sm-search-bar { box-sizing: border-box; }
  .sm-search-bar input::placeholder { color: var(--tertiary); opacity: 0.5; }
  .sm-search-bar input:focus { border-color: var(--accent); }
  .sm-search-mark {
    background: var(--accent);
    color: var(--bg);
    border-radius: 2px;
    padding: 0 2px;
  }
`;

const ICON_ATTRS =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="16" height="16" ' +
  'fill="none" stroke="currentColor" stroke-width="32" stroke-linecap="round" stroke-linejoin="round"';

export const SVG_EYE =
  `<svg ${ICON_ATTRS}>` +
  `<path d="M255.66 112c-77.94 0-157.89 45.11-220.83 135.33a16 16 0 0 0-.27 17.77` +
  `C82.92 340.8 161.8 400 255.66 400c92.84 0 173.34-59.38 221.79-135.25a16.14 16.14 0 0 0 0-17.47` +
  `C428.89 172.28 347.8 112 255.66 112z"/>` +
  `<circle cx="256" cy="256" r="80" stroke-miterlimit="10"/>` +
  `</svg>`;

export const SVG_REFRESH =
  `<svg ${ICON_ATTRS}>` +
  `<path d="M320 146s24.36-12-64-12a160 160 0 1 0 160 160" stroke-miterlimit="10"/>` +
  `<polyline points="256 58 336 138 256 218"/>` +
  `</svg>`;

export const SVG_GEAR =
  `<svg ${ICON_ATTRS}>` +
  `<circle cx="256" cy="256" r="48"/>` +
  `<path d="M222.7 48.6a16 16 0 0 0-13.6 13.2l-3.4 22.5a17.4 17.4 0 0 1-13.5 14.8A187.2 187.2 0 0 0 145.2 119a17.4 17.4 0 0 1-14.8 6.3l-22.7-2.6a16 16 0 0 0-15.7 10.5 207.9 207.9 0 0 0-14.7 39.9 16 16 0 0 0 5.3 17.5l16.9 14.6a17.4 17.4 0 0 1 5.2 16.2 186.1 186.1 0 0 0 0 36.8 17.4 17.4 0 0 1-5.2 16.2L92.7 294.6a16 16 0 0 0-5.3 17.5 207.9 207.9 0 0 0 14.7 39.9 16 16 0 0 0 15.7 10.5l22.7-2.6a17.4 17.4 0 0 1 14.8 6.3 187.2 187.2 0 0 0 47 31.9 17.4 17.4 0 0 1 13.5 14.8l3.4 22.5a16 16 0 0 0 13.6 13.2 207.9 207.9 0 0 0 66.6 0 16 16 0 0 0 13.6-13.2l3.4-22.5a17.4 17.4 0 0 1 13.5-14.8 187.2 187.2 0 0 0 47-31.9 17.4 17.4 0 0 1 14.8-6.3l22.7 2.6a16 16 0 0 0 15.7-10.5 207.9 207.9 0 0 0 14.7-39.9 16 16 0 0 0-5.3-17.5l-16.9-14.6a17.4 17.4 0 0 1-5.2-16.2 186.1 186.1 0 0 0 0-36.8 17.4 17.4 0 0 1 5.2-16.2l16.9-14.6a16 16 0 0 0 5.3-17.5 207.9 207.9 0 0 0-14.7-39.9 16 16 0 0 0-15.7-10.5l-22.7 2.6a17.4 17.4 0 0 1-14.8-6.3 187.2 187.2 0 0 0-47-31.9 17.4 17.4 0 0 1-13.5-14.8l-3.4-22.5a16 16 0 0 0-13.6-13.2 207.9 207.9 0 0 0-66.6 0z"/>` +
  `</svg>`;

export const SVG_SEARCH =
  `<svg ${ICON_ATTRS}>` +
  `<path d="M221.09 64a157.09 157.09 0 1 0 0 314.17 157.09 157.09 0 0 0 0-314.17z" stroke-miterlimit="10"/>` +
  `<path d="M338.29 338.29L448 448" stroke-miterlimit="10"/>` +
  `</svg>`;
