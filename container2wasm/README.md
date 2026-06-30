# container2wasm Integration

This branch explores replacing the simulated command engine with real Linux containers running in-browser via [container2wasm](https://github.com/container2wasm/container2wasm).

## Architecture

```
Browser
├── React UI (terminal, sidebar, themes) — shared with main branch
├── Simulated engine (ssh-lab.wasm) — our Go command engine compiled to WASM
└── container2wasm images (debian.wasm, python.wasm, etc.) — real Linux VMs
     │
     └── browser_wasi_shim + xterm-pty
         └── Full Linux kernel + container running in WASM
```

The user can switch between modes:

| Mode | Backend | Pros | Cons |
|---|---|---|---|
| Simulated | Our Go engine | Instant startup, small (4MB), all commands work | Fake output |
| Real Linux | container2wasm | Real commands, real output | Slow startup, large downloads (50-200MB) |

## How it works

1. `container2wasm` converts a container image (e.g. `debian:latest`) into a `.wasm` file
2. The `.wasm` file contains a Linux kernel + the container filesystem + an init system
3. In the browser, `browser_wasi_shim` provides WASI system call support
4. `xterm-pty` connects a terminal UI to the container's stdio
5. The container boots in seconds and behaves like a real VM

## Demo Images

Pre-built images are available from the container2wasm demo page:
https://ktock.github.io/container2wasm-demo/

Download them:
```bash
./container2wasm/download-demo.sh frontend/public/c2w/
```

Available images:
- `debian.wasm` (~80MB) — Basic Debian
- `python.wasm` (~100MB) — Debian + Python
- `node.wasm` (~120MB) — Debian + Node.js
- `vim.wasm` (~90MB) — Debian + Vim
- `debian-curl.wasm` (~85MB) — Debian + curl

## Setup

To fully enable container2wasm, you need WASI browser polyfills:

```bash
cd frontend
npm install @bjorn3/browser_wasi_shim
npm install xterm-pty
```

Then build your own service images:

```bash
# Requires c2w CLI from https://github.com/container2wasm/container2wasm
c2w nginx:alpine frontend/public/c2w/nginx.wasm
c2w postgres:15-alpine frontend/public/c2w/postgres.wasm
```

## Status

🟡 Experimental — the hook structure is in place but needs the WASI polyfill
    integration to be completed. See `frontend/src/hooks/useContainer2Wasm.ts`
    for the loader stub.
