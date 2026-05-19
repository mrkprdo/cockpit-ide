# Cockpit IDE - The IDE for developers who thinks spatialy

A spatial IDE built in Electron — drag your editor, terminal, and docs wherever they fit, stack them, zoom out to see everything at once. Open multiple instances of anything. Sessions restore exactly as you left them.

[![Cockpit IDE demo](https://img.youtube.com/vi/GoyIwmrYI58/maxresdefault.jpg)](https://youtu.be/GoyIwmrYI58)

---

**Dev** — Monaco editor + resizable file explorer in one card  
**Terminal** — Full PTY terminal via node-pty + xterm.js  
**Context** — Tabbed markdown viewer with live file watching

---

## Development

```bash
# Running
npm install
npm start           # build + launch
npm run dev         # skip rebuild, launch directly
npm run dev:watch   # watch mode (TypeScript + esbuild)

# Testing
npm test               # run all tests
npm run test:watch     # watch mode
npm run test:coverage  # coverage report

# Build and Packaging
npm run build       # compile TypeScript + bundle renderer
npm run pack        # build installer (all platforms)
npm run pack:win    # Windows NSIS installer
npm run pack:mac    # macOS DMG
npm run pack:linux  # Linux AppImage
make install        # run the built Windows installer

# wrapped make commands
make prod          # launch without hot reload
make dev           # launch dev with hot reload
make package       # creates installer
make install       # starts the installer that is in release folder
make test          # run test
```

### Basic Usage 

```bash
# Open from CLI
cockpit .           # open current directory as workspace
cockpit ~/projects  # open specific directory

# or Just start executable
```

When launched with a path, Cockpit skips the welcome prompt and opens directly into that workspace.

## Stack

Electron 42 · TypeScript 5.8 · Monaco Editor 0.53 · xterm.js 6 · node-pty · esbuild · marked

## Design

_Generated from [https://www.usedesign.md/?mash=1&p=noir&c=Art+Nouveau&s=Floating&b=dashed+border&r=8px&f=%27Space+Mono%27%2C+%27Courier+New%27%2C+monospace&sh=rgba%2858%2C106%2C232%2C0.08%29+0+4px+12px%2C+rgba%280%2C0%2C0%2C0.04%29+0+2px+4px&shs=noir&mode=dark](https://www.usedesign.md/?mash=1&p=noir&c=Art+Nouveau&s=Floating&b=dashed+border&r=8px&f=%27Space+Mono%27%2C+%27Courier+New%27%2C+monospace&sh=rgba%2858%2C106%2C232%2C0.08%29+0+4px+12px%2C+rgba%280%2C0%2C0%2C0.04%29+0+2px+4px&shs=noir&mode=dark)_

---

MIT License

