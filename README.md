# ssh-lab

A fake SSH server for practicing Linux commands, monitoring workflows, and AI-agent actions safely.

## Stack

- **Backend**: Go + gorilla/websocket — simulates a full Linux server state in memory
- **Frontend**: React + TypeScript + Vite — terminal UI with live service sidebar

## Features

- 7 simulated services: nginx, postgresql, redis, node-api, prometheus, alertmanager, node-exporter
- Full command set: `systemctl`, `journalctl`, `ps aux`, `top`, `df`, `free`, `netstat`, `curl`, `ping`, and more
- Start/stop/restart services — sidebar updates live over WebSocket
- Arrow key history, Tab autocomplete for service names
- Periodic CPU/memory fluctuation to simulate a real server

## Quick start

### Prerequisites
- Go 1.21+
- Node.js 18+

### Run the backend

```bash
cd server
go mod download
go run main.go
# Listening on :8080
```

### Run the frontend (dev)

```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

### Build frontend for production

```bash
cd frontend
npm run build
# Output in frontend/dist/
```

The Go server can serve the built frontend statically — see the optional section below.

## Docker Compose (optional)

```yaml
version: "3.9"
services:
  server:
    build: ./server
    ports:
      - "8080:8080"
  frontend:
    build: ./frontend
    ports:
      - "5173:80"
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
| `curl localhost:PORT` | Probe a service |
| `ping HOST` | Ping a host |
| `uptime` | Uptime and load |
| `history` | Command history |
| `clear` | Clear terminal |
| `help` | Full command list |

## Extending

Add new services by appending to the `state.Services` map in `server/main.go`. Add new commands in the `switch cmd` block in `handleCommand()`.
