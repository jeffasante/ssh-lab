# ssh-lab

A fake SSH server for practicing Linux commands, monitoring workflows, and AI-agent actions safely.

**Try it now:** [jeffasante.github.io/ssh-lab/?mode=wasm](https://jeffasante.github.io/ssh-lab/?mode=wasm) — runs entirely in your browser via WebAssembly.

## Stack

- **Backend**: Go + gorilla/websocket — simulates a full Linux server state in memory
- **Frontend**: React + TypeScript + Vite — terminal UI with live service sidebar
- **WASM**: The same Go engine compiles to WebAssembly for zero-backend browser use

## Modes

| Mode | URL | Backend needed |
|---|---|---|
| **Server** (Docker) | `http://localhost:3002` | Go server via WebSocket |
| **WASM** (browser) | `https://jeffasante.github.io/ssh-lab/?mode=wasm` | None — runs client-side |
| **WASM** (local dev) | `http://localhost:5173?mode=wasm` | None — Vite dev server only |

## Features

- 7 simulated services: nginx, postgresql, redis, node-api, prometheus, alertmanager, node-exporter
- Full command set: `systemctl`, `journalctl`, `ps aux`, `top`, `df`, `free`, `netstat`, `curl`, `ping`, and more
- Start/stop/restart services — sidebar updates live over WebSocket
- Arrow key history, Tab autocomplete for commands, files, services, and flags
- Periodic CPU/memory fluctuation to simulate a real server
- Docker simulation: `docker ps`, `docker logs`, `docker stats`, `docker images`, `docker compose`
- Virtual filesystem: `/proc/cpuinfo`, `/etc/nginx/nginx.conf`, `/etc/passwd`, `~/.bashrc`, and more
- Pipe and redirect support: `cat /etc/os-release | grep VERSION`, `echo hi > test.txt`
- Package manager stubs: `apt install`, `apt list`, `apt update` (or `yum` for RHEL)
- Onboarding wizard with custom username, hostname, OS preset, and scenario

## Quick start (local)

### Prerequisites
- Go 1.21+
- Node.js 18+

### Docker (recommended)

```bash
docker compose up --build
# Open http://localhost:3002
```

### Or run manually

```bash
# Terminal 1 — backend
cd server && go run .

# Terminal 2 — frontend
cd frontend && npm install && npm run dev
# Open http://localhost:5173

# If port 8080 is already in use:
# Terminal 1 — PORT=8081 go run .
# Terminal 2 — VITE_SSH_LAB_SERVER_URL=http://localhost:8081 npm run dev

# For WASM mode instead:
# Open http://localhost:5173?mode=wasm
```

## Commands reference

| Command | Description |
|---|---|
| `systemctl status [svc]` | Show service status |
| `systemctl start/stop/restart [svc]` | Control a service |
| `systemctl list-units` | List all units |
| `journalctl -u [svc]` | View service logs |
| `journalctl -f` | Follow all logs |
| `ps aux` | All processes |
| `top` | Process snapshot |
| `df -h` | Disk usage |
| `free -h` | Memory usage |
| `netstat -tlnp` | Open ports |
| `docker ps` | List Docker containers |
| `docker logs <container>` | Container logs |
| `apt install <pkg>` | Simulated package install |
| `curl localhost:PORT` | Probe a service |
| `ping HOST` | Ping a host |
| `ip addr` | Network interfaces |
| `grep <pattern> <file>` | Search files |
| `uptime` | Uptime and load |
| `history` | Command history |
| `cat /etc/os-release` | OS info |
| `cat /proc/cpuinfo` | CPU info |
| `clear` | Clear terminal |
| `help` | Full command list |

## Project structure

```
ssh-lab/
├── server/
│   ├── engine.go          # Shared command engine (types, state, ~150 commands)
│   ├── main.go            # Server mode: WebSocket + HTTP (build tag: not WASM)
│   └── main_wasm.go       # WASM mode: exports to browser JS (build tag: WASM)
├── frontend/
│   ├── public/
│   │   ├── ssh-lab.wasm   # Compiled Go WASM binary
│   │   └── wasm_exec.js   # Go WASM runtime
│   └── src/
│       ├── App.tsx         # Mode detection (?mode=wasm)
│       ├── components/
│       │   ├── Terminal.tsx
│       │   ├── Sidebar.tsx
│       │   └── Onboarding.tsx
│       └── hooks/
│           ├── useSSH.ts       # Server mode (WebSocket)
│           └── useWasmSSH.ts   # WASM mode (in-browser)
└── docker-compose.yml
```

## Extending

Add new services by appending to the `state.Services` map in `server/engine.go`. Add new commands in the `switch cmd` block in `handleCommand()`.
