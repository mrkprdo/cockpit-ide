# Cockpit IDE

Panels float. The canvas is infinite. Nothing is docked.

A spatial IDE built in Electron — drag your editor, terminal, and docs wherever they fit, stack them, zoom out to see everything at once. Open multiple instances of anything. Sessions restore exactly as you left them.

[![Cockpit IDE demo](https://img.youtube.com/vi/GoyIwmrYI58/maxresdefault.jpg)](https://youtu.be/GoyIwmrYI58)

<video src="assets/teaser.mp4" controls width="100%"></video>

---

**Dev** — Monaco editor + resizable file explorer in one card  
**Terminal** — Full PTY terminal via node-pty + xterm.js  
**Context** — Tabbed markdown viewer with live file watching

---

## Running

```bash
npm install
npm start          # build + launch
npm run dev        # skip rebuild, launch directly
npm run dev:watch  # watch mode for TypeScript + esbuild
```

## Stack

Electron · Monaco Editor · xterm.js · TypeScript · esbuild

## Design

Dark navy (`#0A0E14`) by default. Light mode available. Background: dots, grid, or none. Art Nouveau × Floating.

_Generated from [https://www.usedesign.md/?mash=1&p=noir&c=Art+Nouveau&s=Floating&b=dashed+border&r=8px&f=%27Space+Mono%27%2C+%27Courier+New%27%2C+monospace&sh=rgba%2858%2C106%2C232%2C0.08%29+0+4px+12px%2C+rgba%280%2C0%2C0%2C0.04%29+0+2px+4px&shs=noir&mode=dark](https://www.usedesign.md/?mash=1&p=noir&c=Art+Nouveau&s=Floating&b=dashed+border&r=8px&f=%27Space+Mono%27%2C+%27Courier+New%27%2C+monospace&sh=rgba%2858%2C106%2C232%2C0.08%29+0+4px+12px%2C+rgba%280%2C0%2C0%2C0.04%29+0+2px+4px&shs=noir&mode=dark)_

[![design.md](data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNzEiIGhlaWdodD0iMjAiIHJvbGU9ImltZyIgYXJpYS1sYWJlbD0iREVTSUdOLk1EIEFydCBOb3V2ZWF1IMOXIEZsb2F0aW5nIj4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYnM2IiB4Mj0iMCIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiNmZmYiIHN0b3Atb3BhY2l0eT0iLjciLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIuMSIgc3RvcC1jb2xvcj0iI2ZmZiIgc3RvcC1vcGFjaXR5PSIuMSIvPgogICAgICA8c3RvcCBvZmZzZXQ9Ii45IiBzdG9wLWNvbG9yPSIjZmZmIiBzdG9wLW9wYWNpdHk9IjAiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmIiBzdG9wLW9wYWNpdHk9Ii4xIi8+CiAgICA8L2xpbmVhckdyYWRpZW50PgogICAgPGNsaXBQYXRoIGlkPSJicjYiPgogICAgICA8cmVjdCB3aWR0aD0iMjcxIiBoZWlnaHQ9IjIwIiByeD0iMyIgZmlsbD0iI2ZmZiIvPgogICAgPC9jbGlwUGF0aD4KICAgIDxnIGNsaXAtcGF0aD0idXJsKCNicjYpIj4KICAgICAgPHJlY3Qgd2lkdGg9Ijc5IiBoZWlnaHQ9IjIwIiBmaWxsPSIjNTU1Ii8+CiAgICAgIDxyZWN0IHg9Ijc5IiB3aWR0aD0iMTkyIiBoZWlnaHQ9IjIwIiBmaWxsPSIjMWExYTFhIi8+CiAgICAgIDxyZWN0IHdpZHRoPSIyNzEiIGhlaWdodD0iMjAiIGZpbGw9InVybCgjYnM2KSIvPgogICAgPC9nPgogICAgPGcgZmlsbD0iI2ZmZiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZm9udC1mYW1pbHk9InN5c3RlbS11aSxzYW5zLXNlcmlmIiBmb250LXNpemU9IjExIiBmb250LXdlaWdodD0iNjAwIj4KICAgICAgPHRleHQgeD0iMzkuNSIgeT0iMTQiPkRFU0lHTi5NRDwvdGV4dD4KICAgICAgPHRleHQgeD0iMTc1IiB5PSIxNCI+QXJ0IE5vdXZlYXUgw5cgRmxvYXRpbmc8L3RleHQ+CiAgICA8L2c+CiAgPC9zdmc+)](/?mash=1&p=noir&c=Art+Nouveau&s=Floating&b=dashed+border&r=8px&f=%27Space+Mono%27%2C+%27Courier+New%27%2C+monospace&sh=rgba%280%2C0%2C0%2C0.06%29+0+2px+8px%2C+rgba%280%2C0%2C0%2C0.04%29+0+4px+16px&shs=noir&mode=light)

