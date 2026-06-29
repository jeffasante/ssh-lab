// engine.go - Shared command engine for both server and WASM builds
package main

import (
	"encoding/base64"
	"fmt"
	"math"
	"math/rand"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Types

type Service struct {
	Name    string  `json:"name"`
	Display string  `json:"display"`
	Port    int     `json:"port"`
	Running bool    `json:"running"`
	PID     int     `json:"pid"`
	CPU     float64 `json:"cpu"`
	MemMB   float64 `json:"mem_mb"`
	Logs    []string
}

type ServerState struct {
	mu       sync.Mutex
	Services map[string]*Service
	BootTime time.Time
	History  []string
}

type OutputLine struct {
	Text  string `json:"text"`
	Class string `json:"class"`
}

type NanoPayload struct {
	Filename string `json:"filename"`
	Content  string `json:"content"`
}

type CommandResponse struct {
	Lines    []OutputLine       `json:"lines"`
	Services map[string]Service `json:"services,omitempty"`
	Nano     *NanoPayload       `json:"nano,omitempty"`
}

var state = &ServerState{
	BootTime: time.Now().Add(-3*time.Hour - 43*time.Minute),
	Services: map[string]*Service{
		"nginx": {
			Name: "nginx", Display: "nginx", Port: 80, Running: true, PID: 1042, CPU: 0.3, MemMB: 12.4,
			Logs: []string{"[notice] nginx/1.24.0 started", "[notice] worker process 1043 started", "[notice] worker process 1044 started"},
		},
		"postgresql": {
			Name: "postgresql", Display: "postgresql", Port: 5432, Running: true, PID: 1156, CPU: 1.1, MemMB: 87.2,
			Logs: []string{"LOG: database system is ready", "LOG: autovacuum launcher started", "LOG: listening on IPv4 0.0.0.0:5432"},
		},
		"redis": {
			Name: "redis", Display: "redis", Port: 6379, Running: true, PID: 1201, CPU: 0.1, MemMB: 8.1,
			Logs: []string{"* Server initialized", "* Ready to accept connections", "# Background saving started by pid 1889"},
		},
		"node-api": {
			Name: "node-api", Display: "node-api", Port: 3000, Running: true, PID: 2310, CPU: 2.4, MemMB: 145.3,
			Logs: []string{"App listening on :3000", "Database connected OK", "Redis connected OK"},
		},
		"prometheus": {
			Name: "prometheus", Display: "prometheus", Port: 9090, Running: true, PID: 2501, CPU: 0.8, MemMB: 56.7,
			Logs: []string{`msg="Server is ready to receive web requests."`, `msg="Completed loading of configuration file"`},
		},
		"alertmanager": {
			Name: "alertmanager", Display: "alertmanager", Port: 9093, Running: false, PID: 0, CPU: 0, MemMB: 0,
			Logs: []string{`level=info msg="Starting Alertmanager"`},
		},
		"node-exporter": {
			Name: "node-exporter", Display: "node-exp", Port: 9100, Running: true, PID: 2601, CPU: 0.1, MemMB: 14.0,
			Logs: []string{`level=info msg="Listening on" address=:9100`},
		},
	},
}

var (
	currentHostname = "server-a1b2"
	currentUser     = "jeff"
	currentOS       = "ubuntu"
	totalMemG       = 7.8
	cpuOverride     = -1.0
	diskPct         = 43
)

// ── Virtual filesystem ────────────────────────────────────────────────────────

var userFiles = map[string]string{}
var userDirs = map[string]bool{}

// ── Docker simulation ─────────────────────────────────────────────────────────

type DockerContainer struct {
	ID      string
	Image   string
	Command string
	Status  string
	Ports   string
	Name    string
	Running bool
}

var dockerContainers = []DockerContainer{
	{"a1b2c3d4e5f6", "nginx:1.24-alpine", `nginx -g "daemon off;"`, "Up 3 hours", "0.0.0.0:80->80/tcp", "lab-nginx", true},
	{"b2c3d4e5f6a1", "postgres:15-alpine", "docker-entrypoint.sh postgres", "Up 3 hours", "0.0.0.0:5432->5432/tcp", "lab-postgres", true},
	{"c3d4e5f6a1b2", "redis:7-alpine", "docker-entrypoint.sh redis-server", "Up 3 hours", "0.0.0.0:6379->6379/tcp", "lab-redis", true},
	{"d4e5f6a1b2c3", "node:18-alpine", "node /app/server.js", "Up 3 hours", "0.0.0.0:3000->3000/tcp", "lab-node-api", true},
	{"e5f6a1b2c3d4", "prom/prometheus:v2.48", "/bin/prometheus --config.file=/etc/prometheus/prometheus.yml", "Up 3 hours", "0.0.0.0:9090->9090/tcp", "lab-prometheus", true},
	{"f6a1b2c3d4e5", "prom/alertmanager:v0.26", "/bin/alertmanager", "Exited (1) 2 hours ago", "0.0.0.0:9093->9093/tcp", "lab-alertmanager", false},
	{"a7b8c9d0e1f2", "prom/node-exporter:v1.7", "/bin/node_exporter", "Up 3 hours", "0.0.0.0:9100->9100/tcp", "lab-node-exporter", true},
}

var dockerImages = [][4]string{
	{"nginx", "1.24-alpine", "a1b2c3d4e5f6", "41.2MB"},
	{"postgres", "15-alpine", "b2c3d4e5f6a1", "238MB"},
	{"redis", "7-alpine", "c3d4e5f6a1b2", "30.1MB"},
	{"node", "18-alpine", "d4e5f6a1b2c3", "173MB"},
	{"prom/prometheus", "v2.48", "e5f6a1b2c3d4", "245MB"},
	{"prom/alertmanager", "v0.26", "f6a1b2c3d4e5", "66.4MB"},
	{"prom/node-exporter", "v1.7", "a7b8c9d0e1f2", "23.1MB"},
}

// ── Environment variables ─────────────────────────────────────────────────────

var envVars = map[string]string{
	"SHELL":          "/bin/bash",
	"TERM":           "xterm-256color",
	"LANG":           "en_US.UTF-8",
	"LC_ALL":         "en_US.UTF-8",
	"EDITOR":         "nano",
	"PAGER":          "less",
	"PATH":           "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/snap/bin",
	"XDG_SESSION_ID": "42",
	"LOGNAME":        "",
	"MAIL":           "",
	"SHLVL":          "1",
	"_":              "/usr/bin/env",
	"NODE_ENV":       "production",
	"PGDATA":         "/var/lib/postgresql/15/main",
}

// ── Helpersunc line(text, class string) OutputLine { return OutputLine{Text: text, Class: class} }
func line(text, class string) OutputLine { return OutputLine{Text: text, Class: class} }

func blank() OutputLine { return OutputLine{Text: "", Class: ""} }

func uptimeStr() string {
	d := time.Since(state.BootTime)
	h := int(d.Hours())
	m := int(d.Minutes()) % 60
	return fmt.Sprintf("up %d hours, %d minutes", h, m)
}

func nowStr() string { return time.Now().Format("15:04:05") }

func randFloat(min, max float64) float64 {
	return min + rand.Float64()*(max-min)
}

func matchService(name string) *Service {
	name = strings.ToLower(name)
	if s, ok := state.Services[name]; ok {
		return s
	}
	for _, s := range state.Services {
		if strings.HasPrefix(s.Name, name) {
			return s
		}
	}
	return nil
}

func serviceSnapshot() map[string]Service {
	out := make(map[string]Service, len(state.Services))
	for k, v := range state.Services {
		out[k] = *v
	}
	return out
}

func cpuLoad() string {
	if cpuOverride >= 0 {
		return fmt.Sprintf("%.1f", cpuOverride)
	}
	return fmt.Sprintf("%.1f", randFloat(12, 18))
}
func memUsed() string { return fmt.Sprintf("%.1f", totalMemG*0.35+rand.Float64()*0.3) }

// ── Virtual file content ──────────────────────────────────────────────────────

func getFileContent(path string) (string, bool) {
	// Normalize path
	p := strings.TrimSpace(path)

	switch p {
	case "/proc/cpuinfo":
		return fmt.Sprintf(`processor	: 0
vendor_id	: GenuineIntel
cpu family	: 6
model		: 142
model name	: Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz
stepping	: 10
cpu MHz		: 2394.374
cache size	: 35840 KB
physical id	: 0
siblings	: 4
core id		: 0
cpu cores	: 4
bogomips	: 4788.74
flags		: fpu vme de pse tsc msr pae mce cx8 apic sep mtrr pge mca cmov pat pse36 clflush mmx fxsr sse sse2 ss ht syscall nx pdpe1gb rdtscp lm constant_tsc arch_perfmon rep_good nopl xtopology cpuid pni pclmulqdq ssse3 fma cx16 pcid sse4_1 sse4_2 x2apic movbe popcnt tsc_deadline_timer aes xsave avx f16c rdrand hypervisor lahf_lm abm 3dnowprefetch cpuid_fault invpcid_single ssbd ibrs ibpb stibp ibrs_enhanced
`), true

	case "/proc/meminfo":
		totalKB := int(totalMemG * 1024 * 1024)
		freeKB := int(totalMemG * 0.15 * 1024 * 1024)
		availKB := int(totalMemG * 0.52 * 1024 * 1024)
		buffersKB := 142840
		cachedKB := int(totalMemG * 0.27 * 1024 * 1024)
		return fmt.Sprintf(`MemTotal:       %d kB
MemFree:        %d kB
MemAvailable:   %d kB
Buffers:        %d kB
Cached:         %d kB
SwapTotal:      2097152 kB
SwapFree:       2097152 kB
`, totalKB, freeKB, availKB, buffersKB, cachedKB), true

	case "/proc/version":
		return "Linux version 5.15.0-91-generic (buildd@lcy02-amd64-026) (gcc (Ubuntu 11.4.0-1ubuntu1~22.04) 11.4.0, GNU ld (GNU Binutils for Ubuntu) 2.38) #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2024\n", true

	case "/proc/uptime":
		secs := time.Since(state.BootTime).Seconds()
		idle := secs * 3.8
		return fmt.Sprintf("%.2f %.2f\n", secs, idle), true

	case "/proc/loadavg":
		return fmt.Sprintf("%.2f %.2f %.2f 1/287 %d\n", randFloat(0.4, 0.7), randFloat(0.35, 0.65), randFloat(0.3, 0.6), rand.Intn(5000)+10000), true

	case "/etc/hostname":
		return currentHostname + "\n", true

	case "/etc/hosts":
		return fmt.Sprintf(`127.0.0.1	localhost
127.0.1.1	%s
10.0.0.42	%s

# The following lines are desirable for IPv6 capable hosts
::1     ip6-localhost ip6-loopback
fe00::0 ip6-localnet
ff00::0 ip6-mcastprefix
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
`, currentHostname, currentHostname), true

	case "/etc/fstab":
		return `# /etc/fstab: static file system information.
UUID=a1b2c3d4-e5f6-7890-abcd-ef1234567890  /              ext4    errors=remount-ro 0 1
UUID=b2c3d4e5-f6a1-2345-bcde-f12345678901  /var/lib/postgresql  ext4  defaults  0 2
tmpfs                                       /dev/shm       tmpfs   defaults,noexec,nosuid  0 0
/dev/sdb1                                   none           swap    sw  0 0
`, true

	case "/etc/passwd":
		return fmt.Sprintf(`root:x:0:0:root:/root:/bin/bash
daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin
bin:x:2:2:bin:/bin:/usr/sbin/nologin
sys:x:3:3:sys:/dev:/usr/sbin/nologin
sync:x:4:65534:sync:/bin:/bin/sync
www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin
nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin
sshd:x:110:65534::/run/sshd:/usr/sbin/nologin
postgres:x:112:117:PostgreSQL administrator,,,:/var/lib/postgresql:/bin/bash
%s:x:1001:1001:SSH Lab,,,:/home/%s:/bin/bash
`, currentUser, currentUser), true

	case "/etc/shadow":
		return "", false // permission denied handled by caller

	case "/etc/group":
		return fmt.Sprintf(`root:x:0:
daemon:x:1:
sudo:x:27:%s
docker:x:998:%s
%s:x:1001:
`, currentUser, currentUser, currentUser), true

	case "/etc/os-release", "os-release":
		switch currentOS {
		case "debian":
			return "PRETTY_NAME=\"Debian GNU/Linux 12 (bookworm)\"\nNAME=\"Debian GNU/Linux\"\nVERSION_ID=\"12\"\nVERSION=\"12 (bookworm)\"\nID=debian\nID_LIKE=debian\n", true
		case "rhel":
			return "PRETTY_NAME=\"Red Hat Enterprise Linux 9.4 (Plow)\"\nNAME=\"Red Hat Enterprise Linux\"\nVERSION_ID=\"9.4\"\nID=rhel\nID_LIKE=\"fedora\"\n", true
		case "alpine":
			return "PRETTY_NAME=\"Alpine Linux 3.19\"\nNAME=\"Alpine Linux\"\nVERSION_ID=\"3.19\"\nID=alpine\n", true
		default:
			return "PRETTY_NAME=\"Ubuntu 22.04.3 LTS\"\nNAME=\"Ubuntu\"\nVERSION_ID=\"22.04\"\nVERSION=\"22.04.3 LTS (Jammy Jellyfish)\"\nID=ubuntu\nID_LIKE=debian\n", true
		}

	case "/etc/resolv.conf":
		return "nameserver 10.0.0.1\nnameserver 8.8.8.8\nsearch lab.internal\n", true

	case "/etc/ssh/sshd_config":
		return `# SSH Server Configuration
Port 22
ListenAddress 0.0.0.0
PermitRootLogin prohibit-password
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PasswordAuthentication no
ChallengeResponseAuthentication no
UsePAM yes
X11Forwarding yes
PrintMotd no
AcceptEnv LANG LC_*
Subsystem sftp /usr/lib/openssh/sftp-server
`, true

	case "/etc/nginx/nginx.conf":
		return `user www-data;
worker_processes auto;
pid /run/nginx.pid;
include /etc/nginx/modules-enabled/*.conf;

events {
    worker_connections 768;
}

http {
    sendfile on;
    tcp_nopush on;
    types_hash_max_size 2048;
    server_tokens off;

    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;

    gzip on;

    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
`, true

	case "/etc/nginx/sites-enabled/default", "/etc/nginx/sites-available/default":
		return `server {
    listen 80 default_server;
    listen [::]:80 default_server;

    root /var/www/html;
    index index.html index.htm;

    server_name _;

    location / {
        try_files $uri $uri/ =404;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
`, true

	case "/etc/postgresql/15/main/pg_hba.conf", "/etc/postgresql/pg_hba.conf":
		return `# PostgreSQL Client Authentication Configuration File
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             postgres                                peer
local   all             all                                     peer
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
host    all             all             10.0.0.0/24             scram-sha-256
`, true

	case "/etc/redis/redis.conf", "/etc/redis.conf":
		return `# Redis Configuration
bind 127.0.0.1 -::1
port 6379
daemonize yes
pidfile /var/run/redis/redis-server.pid
loglevel notice
logfile /var/log/redis/redis-server.log
databases 16
save 900 1
save 300 10
save 60 10000
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly yes
appendfilename "appendonly.aof"
`, true

	case "/etc/prometheus/prometheus.yml":
		return `global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "prometheus"
    static_configs:
      - targets: ["localhost:9090"]

  - job_name: "node"
    static_configs:
      - targets: ["localhost:9100"]

  - job_name: "node-api"
    static_configs:
      - targets: ["localhost:3000"]
    metrics_path: /metrics
`, true

	case "/var/log/syslog":
		now := time.Now()
		var sb strings.Builder
		msgs := []string{
			"systemd[1]: Started Session 42 of User %s.",
			"kernel: [    0.000000] Linux version 5.15.0-91-generic",
			"systemd[1]: Starting Daily apt download activities...",
			"CRON[%d]: (root) CMD (test -x /usr/sbin/anacron)",
			"kernel: [    0.432817] ACPI: Core revision 20210930",
			"systemd-logind[882]: New session 42 of user %s.",
			"sshd[%d]: Accepted publickey for %s from 10.0.0.5 port 51234 ssh2",
			"systemd[1]: Started OpenBSD Secure Shell server.",
		}
		for i, m := range msgs {
			ts := now.Add(-time.Duration(len(msgs)-i) * 17 * time.Minute).Format("Jan  2 15:04:05")
			formatted := fmt.Sprintf(m, currentUser, rand.Intn(5000)+1000)
			// cheap way: if format has two %s args, provide both
			if strings.Count(m, "%s") == 2 {
				formatted = fmt.Sprintf(m, currentUser, currentUser)
			} else if strings.Count(m, "%d") == 1 && strings.Count(m, "%s") == 1 {
				formatted = fmt.Sprintf(m, rand.Intn(5000)+1000, currentUser)
			}
			sb.WriteString(fmt.Sprintf("%s %s %s\n", ts, currentHostname, formatted))
		}
		return sb.String(), true

	case "/var/log/auth.log":
		now := time.Now()
		var sb strings.Builder
		entries := []string{
			fmt.Sprintf("sshd[%d]: Accepted publickey for %s from 10.0.0.5 port 51234 ssh2: RSA SHA256:abc123def456", rand.Intn(5000)+1000, currentUser),
			fmt.Sprintf("sshd[%d]: pam_unix(sshd:session): session opened for user %s(uid=1001) by (uid=0)", rand.Intn(5000)+1000, currentUser),
			fmt.Sprintf("sudo: %s : TTY=pts/0 ; PWD=/home/%s ; USER=root ; COMMAND=/usr/bin/systemctl restart nginx", currentUser, currentUser),
			fmt.Sprintf("sshd[%d]: Disconnected from user %s 10.0.0.5 port 51234", rand.Intn(5000)+1000, currentUser),
		}
		for i, e := range entries {
			ts := now.Add(-time.Duration(len(entries)-i) * 45 * time.Minute).Format("Jan  2 15:04:05")
			sb.WriteString(fmt.Sprintf("%s %s %s\n", ts, currentHostname, e))
		}
		return sb.String(), true

	case ".bashrc", "/home/" + currentUser + "/.bashrc":
		return fmt.Sprintf(`# ~/.bashrc: executed by bash(1) for non-login shells.

# If not running interactively, don't do anything
case $- in
    *i*) ;;
      *) return;;
esac

HISTCONTROL=ignoreboth
HISTSIZE=1000
HISTFILESIZE=2000
shopt -s histappend
shopt -s checkwinsize

PS1='${debian_chroot:+($debian_chroot)}\u@\h:\w\$ '

alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'
alias grep='grep --color=auto'

export PATH="$HOME/.local/bin:$PATH"

# Node.js
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Docker alias
alias dps='docker ps'
alias dlogs='docker logs -f'

echo "Welcome back, %s"
`, currentUser), true

	case ".profile", "/home/" + currentUser + "/.profile":
		return `# ~/.profile: executed by the command interpreter for login shells.
if [ -n "$BASH_VERSION" ]; then
    if [ -f "$HOME/.bashrc" ]; then
        . "$HOME/.bashrc"
    fi
fi

if [ -d "$HOME/bin" ] ; then
    PATH="$HOME/bin:$PATH"
fi

if [ -d "$HOME/.local/bin" ] ; then
    PATH="$HOME/.local/bin:$PATH"
fi
`, true

	case "health-check.sh", "/home/" + currentUser + "/health-check.sh":
		return "#!/bin/bash\n# Server health check\nfor svc in nginx postgresql redis node-api prometheus; do\n  systemctl is-active --quiet $svc && echo \"$svc: OK\" || echo \"$svc: FAIL\"\ndone\n", true

	case "/etc/crontab":
		return fmt.Sprintf(`SHELL=/bin/sh
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# m h dom mon dow user  command
17 *    * * *   root    cd / && run-parts --report /etc/cron.hourly
25 6    * * *   root    test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.daily )
47 6    * * 7   root    test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.weekly )
52 6    1 * *   root    test -x /usr/sbin/anacron || ( cd / && run-parts --report /etc/cron.monthly )
*/5 *   * * *   %s    /home/%s/health-check.sh >> /var/log/healthcheck.log 2>&1
0 2     * * *   root    /usr/bin/certbot renew --quiet
*/15 *  * * *   root    /usr/bin/docker system prune -f > /dev/null 2>&1
`, currentUser, currentUser), true

	case "/etc/docker/daemon.json":
		return `{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "live-restore": true,
  "default-address-pools": [
    {"base": "172.17.0.0/16", "size": 24}
  ]
}
`, true

	case "docker-compose.yml", "/home/" + currentUser + "/docker-compose.yml":
		return `version: "3.8"
services:
  nginx:
    image: nginx:1.24-alpine
    ports: ["80:80"]
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on: [node-api]
    restart: unless-stopped

  postgresql:
    image: postgres:15-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: appdb
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --maxmemory 256mb
    restart: unless-stopped

  node-api:
    image: node:18-alpine
    ports: ["3000:3000"]
    working_dir: /app
    volumes: ["./apps/node-api:/app"]
    command: node server.js
    depends_on: [postgresql, redis]
    restart: unless-stopped

  prometheus:
    image: prom/prometheus:v2.48
    ports: ["9090:9090"]
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
    restart: unless-stopped

  node-exporter:
    image: prom/node-exporter:v1.7
    ports: ["9100:9100"]
    restart: unless-stopped

volumes:
  pgdata:
`, true
	}

	// Check user-created files
	if content, ok := userFiles[p]; ok {
		return content, true
	}

	return "", false
}

// ── ls directory listings ─────────────────────────────────────────────────────

func lsDir(dir string, long bool) []OutputLine {
	var lines []OutputLine

	switch dir {
	case "/etc":
		if long {
			lines = append(lines, line("total 92", "muted"))
			for _, f := range []string{"crontab", "docker/", "fstab", "group", "hostname", "hosts", "nginx/", "os-release", "passwd", "postgresql/", "prometheus/", "redis/", "resolv.conf", "shadow", "ssh/"} {
				perm := "-rw-r--r--"
				if strings.HasSuffix(f, "/") {
					perm = "drwxr-xr-x"
				}
				if f == "shadow" {
					perm = "-rw-r-----"
				}
				lines = append(lines, line(fmt.Sprintf("%s  1 root root  4096 Jun 20 12:00 %s", perm, f), "muted"))
			}
		} else {
			lines = append(lines, line("crontab  docker  fstab  group  hostname  hosts  nginx  os-release  passwd  postgresql  prometheus  redis  resolv.conf  shadow  ssh", ""))
		}
	case "/var/log":
		if long {
			lines = append(lines, line("total 2048", "muted"))
			for _, f := range []string{"auth.log", "kern.log", "nginx/", "postgresql/", "redis/", "syslog"} {
				sz := fmt.Sprintf("%d", rand.Intn(50000)+1000)
				lines = append(lines, line(fmt.Sprintf("-rw-r--r--  1 root root %8s Jun 29 %s %s", sz, nowStr(), f), "muted"))
			}
		} else {
			lines = append(lines, line("auth.log  kern.log  nginx  postgresql  redis  syslog", ""))
		}
	case "/proc":
		if long {
			lines = append(lines, line("total 0", "muted"))
			for _, f := range []string{"cpuinfo", "loadavg", "meminfo", "uptime", "version"} {
				lines = append(lines, line(fmt.Sprintf("-r--r--r--  1 root root 0 Jun 29 %s %s", nowStr(), f), "muted"))
			}
		} else {
			lines = append(lines, line("cpuinfo  loadavg  meminfo  uptime  version", ""))
		}
	case "/":
		if long {
			lines = append(lines, line("total 72", "muted"))
			for _, f := range []string{"bin", "boot", "dev", "etc", "home", "lib", "media", "mnt", "opt", "proc", "root", "run", "sbin", "srv", "sys", "tmp", "usr", "var"} {
				lines = append(lines, line(fmt.Sprintf("drwxr-xr-x  2 root root 4096 Jun 20 12:00 %s", f), "muted"))
			}
		} else {
			lines = append(lines, line("bin  boot  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var", ""))
		}
	case "/home":
		if long {
			lines = append(lines, line("total 4", "muted"))
			lines = append(lines, line(fmt.Sprintf("drwxr-xr-x  5 %s %s 4096 Jun 29 08:14 %s", currentUser, currentUser, currentUser), "ok"))
		} else {
			lines = append(lines, line(currentUser, ""))
		}
	case "/tmp":
		if long {
			lines = append(lines, line("total 8", "muted"))
			lines = append(lines, line(fmt.Sprintf("-rw-------  1 %s %s  0 Jun 29 08:14 .X0-lock", currentUser, currentUser), "muted"))
			lines = append(lines, line("drwx------  2 root root 4096 Jun 29 06:00 systemd-private-abc123", "muted"))
		} else {
			lines = append(lines, line(".X0-lock  systemd-private-abc123", ""))
		}
	case "/etc/nginx":
		if long {
			lines = append(lines, line("total 16", "muted"))
			for _, f := range []string{"conf.d/", "mime.types", "modules-enabled/", "nginx.conf", "sites-available/", "sites-enabled/"} {
				lines = append(lines, line(fmt.Sprintf("-rw-r--r--  1 root root 4096 Jun 20 12:00 %s", f), "muted"))
			}
		} else {
			lines = append(lines, line("conf.d  mime.types  modules-enabled  nginx.conf  sites-available  sites-enabled", ""))
		}
	default:
		lines = append(lines, line(fmt.Sprintf("ls: cannot access '%s': No such file or directory", dir), "err"))
	}
	lines = append(lines, blank())
	return lines
}

// ── Command engine

func handleCommand(raw string) CommandResponse {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return CommandResponse{}
	}

	if !strings.HasPrefix(raw, "__") {
		state.mu.Lock()
		state.History = append(state.History, raw)
		if len(state.History) > 100 {
			state.History = state.History[1:]
		}
		state.mu.Unlock()
	}

	// ── Pipe support ──────────────────────────────────────────────────────
	if strings.Contains(raw, " | ") {
		pipeParts := strings.SplitN(raw, " | ", 2)
		leftCmd := strings.TrimSpace(pipeParts[0])
		rightCmd := strings.TrimSpace(pipeParts[1])

		left := handleCommand(leftCmd)
		rightParts := strings.Fields(rightCmd)
		if len(rightParts) == 0 {
			return left
		}

		switch rightParts[0] {
		case "grep":
			if len(rightParts) < 2 {
				return left
			}
			pattern := rightParts[1]
			caseInsensitive := false
			invert := false
			for _, a := range rightParts[1:] {
				if a == "-i" {
					caseInsensitive = true
				}
				if a == "-v" {
					invert = true
				}
			}
			// last non-flag arg is pattern
			for _, a := range rightParts[1:] {
				if !strings.HasPrefix(a, "-") {
					pattern = a
					break
				}
			}
			var filtered []OutputLine
			for _, l := range left.Lines {
				text := l.Text
				p := pattern
				if caseInsensitive {
					text = strings.ToLower(text)
					p = strings.ToLower(p)
				}
				match := strings.Contains(text, p)
				if invert {
					match = !match
				}
				if match && l.Text != "" {
					filtered = append(filtered, l)
				}
			}
			filtered = append(filtered, blank())
			return CommandResponse{Lines: filtered, Services: left.Services}

		case "head":
			n := 10
			if len(rightParts) > 2 && rightParts[1] == "-n" {
				fmt.Sscanf(rightParts[2], "%d", &n)
			}
			var filtered []OutputLine
			count := 0
			for _, l := range left.Lines {
				if count >= n {
					break
				}
				filtered = append(filtered, l)
				if l.Text != "" {
					count++
				}
			}
			filtered = append(filtered, blank())
			return CommandResponse{Lines: filtered, Services: left.Services}

		case "tail":
			n := 10
			if len(rightParts) > 2 && rightParts[1] == "-n" {
				fmt.Sscanf(rightParts[2], "%d", &n)
			}
			// collect non-blank lines
			var nonBlank []OutputLine
			for _, l := range left.Lines {
				if l.Text != "" {
					nonBlank = append(nonBlank, l)
				}
			}
			start := len(nonBlank) - n
			if start < 0 {
				start = 0
			}
			result := nonBlank[start:]
			result = append(result, blank())
			return CommandResponse{Lines: result, Services: left.Services}

		case "wc":
			lineCount := 0
			wordCount := 0
			charCount := 0
			for _, l := range left.Lines {
				if l.Text != "" {
					lineCount++
					wordCount += len(strings.Fields(l.Text))
					charCount += len(l.Text) + 1
				}
			}
			return CommandResponse{
				Lines: []OutputLine{
					line(fmt.Sprintf("  %d  %d  %d", lineCount, wordCount, charCount), ""),
					blank(),
				},
			}

		case "sort":
			var sortable []string
			for _, l := range left.Lines {
				if l.Text != "" {
					sortable = append(sortable, l.Text)
				}
			}
			sort.Strings(sortable)
			var sorted []OutputLine
			for _, s := range sortable {
				sorted = append(sorted, line(s, "muted"))
			}
			sorted = append(sorted, blank())
			return CommandResponse{Lines: sorted, Services: left.Services}

		default:
			return left
		}
	}

	// ── Output redirection ────────────────────────────────────────────────
	if strings.Contains(raw, " >> ") {
		rParts := strings.SplitN(raw, " >> ", 2)
		cmdPart := strings.TrimSpace(rParts[0])
		filePart := strings.TrimSpace(rParts[1])
		if cmdPart != "" && filePart != "" {
			result := handleCommand(cmdPart)
			var content strings.Builder
			for _, l := range result.Lines {
				if l.Text != "" {
					content.WriteString(l.Text + "\n")
				}
			}
			existing := userFiles[filePart]
			userFiles[filePart] = existing + content.String()
			return CommandResponse{Lines: []OutputLine{blank()}}
		}
	}
	if strings.Contains(raw, " > ") && !strings.Contains(raw, " >> ") {
		rParts := strings.SplitN(raw, " > ", 2)
		cmdPart := strings.TrimSpace(rParts[0])
		filePart := strings.TrimSpace(rParts[1])
		if cmdPart != "" && filePart != "" {
			result := handleCommand(cmdPart)
			var content strings.Builder
			for _, l := range result.Lines {
				if l.Text != "" {
					content.WriteString(l.Text + "\n")
				}
			}
			userFiles[filePart] = content.String()
			return CommandResponse{Lines: []OutputLine{blank()}}
		}
	}

	parts := strings.Fields(raw)
	cmd := parts[0]
	args := parts[1:]

	var lines []OutputLine

	// Handle ./script.sh execution
	if strings.HasPrefix(cmd, "./") && len(cmd) > 2 {
		script := cmd[2:]
		switch script {
		case "health-check.sh":
			lines = append(lines, line("Running health check...", "head"))
			state.mu.Lock()
			for _, name := range []string{"nginx", "postgresql", "redis", "node-api", "prometheus"} {
				s := state.Services[name]
				if s != nil && s.Running {
					lines = append(lines, line(fmt.Sprintf("%-12s OK", name+":"), "ok"))
				} else {
					lines = append(lines, line(fmt.Sprintf("%-12s FAIL", name+":"), "err"))
				}
			}
			state.mu.Unlock()
			lines = append(lines, blank())
			return CommandResponse{Lines: lines, Services: serviceSnapshot()}
		default:
			lines = append(lines,
				line(fmt.Sprintf("bash: %s: No such file or directory", cmd), "err"),
				blank(),
			)
			return CommandResponse{Lines: lines}
		}
	}

	switch cmd {

	case "help", "?":
		cmds := [][2]string{
			{"uptime", "System uptime and load"},
			{"uname -a", "Kernel / OS info"},
			{"whoami / id", "User info"},
			{"hostname / hostname -I", "Hostname and IP"},
			{"ps aux", "All processes"},
			{"top", "Live process snapshot"},
			{"df -h", "Disk usage"},
			{"free -h", "Memory usage"},
			{"netstat -tlnp / ss -tlnp", "Open TCP ports"},
			{"systemctl status [svc]", "Service status"},
			{"systemctl start|stop|restart", "Control a service"},
			{"systemctl list-units", "List all units"},
			{"journalctl -u [svc]", "Service logs"},
			{"curl localhost:PORT", "HTTP probe"},
			{"ping HOST", "Ping a host"},
			{"cat FILE", "Read a file"},
			{"ls / ls -la [DIR]", "List directory"},
			{"head / tail FILE", "First/last lines"},
			{"touch / mkdir / rm", "File operations"},
			{"chmod / chown", "Change permissions"},
			{"echo / env / export", "Variables"},
			{"docker ps / images / logs", "Docker containers"},
			{"ip addr / ip route", "Network config"},
			{"dig / nslookup HOST", "DNS lookup"},
			{"iptables -L", "Firewall rules"},
			{"kill / killall PID", "Kill processes"},
			{"apt list / apt update", "Package management"},
			{"find / du / lsblk / mount", "Filesystem tools"},
			{"date / w / who / last", "Time and sessions"},
			{"dmesg", "Kernel ring buffer"},
			{"crontab -l", "Scheduled tasks"},
			{"wget URL", "Download files"},
			{"traceroute HOST", "Network path"},
			{"nano / vi FILE", "Text editor (stub)"},
			{"grep PATTERN FILE", "Search patterns"},
			{"CMD | grep / head / tail", "Pipe support"},
			{"CMD > file / CMD >> file", "Output redirection"},
			{"history", "Command history"},
			{"clear", "Clear terminal"},
			{"tutorial", "Interactive command walkthrough"},
			{"exit", "Close session"},
		}
		lines = append(lines, line("Available commands (simulated)", "head"), blank())
		for _, c := range cmds {
			lines = append(lines, line(fmt.Sprintf("  %-34s %s", c[0], c[1]), "muted"))
		}
		lines = append(lines, blank())

	case "uptime":
		load := randFloat(0.4, 0.7)
		if cpuOverride >= 0 {
			load = cpuOverride / 100.0 * 2.5
		}
		lines = append(lines,
			line(fmt.Sprintf(" %s  %s,  1 user,  load average: %.2f, %.2f, %.2f",
				nowStr(), uptimeStr(), load, load*0.9, load*0.75), "ok"),
			blank())

	case "whoami":
		lines = append(lines, line(currentUser, ""), blank())

	case "id":
		lines = append(lines, line(fmt.Sprintf("uid=1001(%s) gid=1001(%s) groups=1001(%s),27(sudo),998(docker)", currentUser, currentUser, currentUser), ""), blank())

	case "hostname":
		if len(args) > 0 && args[0] == "-I" {
			lines = append(lines, line("10.0.0.42 172.17.0.1", ""), blank())
		} else {
			lines = append(lines, line(currentHostname, ""), blank())
		}

	case "uname":
		unameStr := "Linux " + currentHostname + " 5.15.0-91-generic #101-Ubuntu SMP Tue Nov 14 13:30:08 UTC 2024 x86_64 x86_64 x86_64 GNU/Linux"
		switch currentOS {
		case "debian":
			unameStr = "Linux " + currentHostname + " 6.1.0-21-amd64 #1 SMP Debian 6.1.90-1 (2024-05-03) x86_64 GNU/Linux"
		case "rhel":
			unameStr = "Linux " + currentHostname + " 5.14.0-427.el9.x86_64 #1 SMP PREEMPT_DYNAMIC Wed May 8 06:51:38 EDT 2024 x86_64 x86_64 x86_64 GNU/Linux"
		case "alpine":
			unameStr = "Linux " + currentHostname + " 6.6.30-0-virt #1-Alpine SMP PREEMPT_DYNAMIC Mon May 6 10:47:07 UTC 2024 x86_64 Linux"
		}
		lines = append(lines, line(unameStr, ""), blank())

	case "pwd":
		lines = append(lines, line(fmt.Sprintf("/home/%s", currentUser), ""), blank())

	case "ls":
		la := false
		var dirArg string
		for _, a := range args {
			if strings.HasPrefix(a, "-") && strings.Contains(a, "l") {
				la = true
			} else if !strings.HasPrefix(a, "-") {
				dirArg = a
			}
		}
		// If a directory argument is given, delegate to lsDir
		if dirArg != "" {
			lines = append(lines, lsDir(dirArg, la)...)
		} else {
			// Home directory listing
			if la {
				lines = append(lines, line("total 48", "muted"))
				lines = append(lines,
					line(fmt.Sprintf("drwxr-xr-x  5 %s %s 4096 Jun 29 08:14 .", currentUser, currentUser), "ok"),
					line("drwxr-xr-x  4 root  root  4096 Mar 12 09:01 ..", "muted"),
					line(fmt.Sprintf("-rw-------  1 %s %s  892 Jun 28 22:47 .bash_history", currentUser, currentUser), "muted"),
					line(fmt.Sprintf("-rw-r--r--  1 %s %s  220 Mar 12 09:01 .bash_logout", currentUser, currentUser), "muted"),
					line(fmt.Sprintf("-rw-r--r--  1 %s %s 3526 Mar 12 09:01 .bashrc", currentUser, currentUser), "muted"),
					line(fmt.Sprintf("drwx------  2 %s %s 4096 Mar 12 09:02 .ssh", currentUser, currentUser), "ok"),
					line(fmt.Sprintf("drwxr-xr-x  3 %s %s 4096 Jun 20 14:31 apps", currentUser, currentUser), "ok"),
					line(fmt.Sprintf("drwxr-xr-x  2 %s %s 4096 Jun 20 14:31 logs", currentUser, currentUser), "ok"),
					line(fmt.Sprintf("-rwxr-xr-x  1 %s %s 1204 Jun 25 11:02 health-check.sh", currentUser, currentUser), "ok"),
					line(fmt.Sprintf("-rw-r--r--  1 %s %s  842 Jun 20 14:31 docker-compose.yml", currentUser, currentUser), "ok"),
				)
				// Show user-created files
				for name := range userFiles {
					if !strings.Contains(name, "/") {
						lines = append(lines, line(fmt.Sprintf("-rw-r--r--  1 %s %s %5d Jun 29 %s %s", currentUser, currentUser, len(userFiles[name]), nowStr(), name), "ok"))
					}
				}
				for name := range userDirs {
					if !strings.Contains(name, "/") {
						lines = append(lines, line(fmt.Sprintf("drwxr-xr-x  2 %s %s 4096 Jun 29 %s %s", currentUser, currentUser, nowStr(), name), "ok"))
					}
				}
			} else {
				extra := ""
				for name := range userFiles {
					if !strings.Contains(name, "/") {
						extra += "  " + name
					}
				}
				for name := range userDirs {
					if !strings.Contains(name, "/") {
						extra += "  " + name
					}
				}
				lines = append(lines, line("apps  logs  health-check.sh  docker-compose.yml  .bashrc  .profile  .ssh"+extra, ""))
			}
			lines = append(lines, blank())
		}

	case "cat":
		f := ""
		if len(args) > 0 {
			f = args[0]
		}
		if f == "" {
			lines = append(lines, line("cat: missing operand", "err"), blank())
		} else if f == "/etc/shadow" {
			lines = append(lines, line("cat: /etc/shadow: Permission denied", "err"), blank())
		} else if content, ok := getFileContent(f); ok {
			for _, l := range strings.Split(strings.TrimRight(content, "\n"), "\n") {
				lines = append(lines, line(l, "muted"))
			}
			lines = append(lines, blank())
		} else {
			lines = append(lines, line(fmt.Sprintf("cat: %s: No such file or directory", f), "err"), blank())
		}

	case "echo":
		val := strings.Join(args, " ")
		// Handle quoted strings
		val = strings.Trim(val, "\"'")
		switch val {
		case "$USER":
			val = currentUser
		case "$HOSTNAME":
			val = currentHostname
		case "$PATH":
			val = envVars["PATH"]
		case "$SHELL":
			val = envVars["SHELL"]
		case "$HOME":
			val = fmt.Sprintf("/home/%s", currentUser)
		case "$TERM":
			val = envVars["TERM"]
		case "$LANG":
			val = envVars["LANG"]
		case "$EDITOR":
			val = envVars["EDITOR"]
		case "$NODE_ENV":
			val = envVars["NODE_ENV"]
		default:
			// Handle $VAR references
			if strings.HasPrefix(val, "$") {
				key := val[1:]
				if v, ok := envVars[key]; ok && v != "" {
					val = v
				} else if key == "USER" {
					val = currentUser
				} else if key == "HOSTNAME" {
					val = currentHostname
				} else if key == "HOME" {
					val = "/home/" + currentUser
				}
			}
		}
		lines = append(lines, line(val, ""), blank())

	case "history":
		state.mu.Lock()
		hist := state.History
		state.mu.Unlock()
		start := 0
		if len(hist) > 20 {
			start = len(hist) - 20
		}
		for i := start; i < len(hist); i++ {
			lines = append(lines, line(fmt.Sprintf("  %4d  %s", i+1, hist[i]), "muted"))
		}
		lines = append(lines, blank())

	case "ping":
		host := "10.0.0.1"
		if len(args) > 0 {
			host = args[0]
		}
		ms1 := randFloat(0.3, 0.6)
		ms2 := randFloat(0.3, 0.6)
		ms3 := randFloat(0.3, 0.6)
		lines = append(lines,
			line(fmt.Sprintf("PING %s (%s) 56(84) bytes of data.", host, host), "muted"),
			line(fmt.Sprintf("64 bytes from %s: icmp_seq=1 ttl=64 time=%.3f ms", host, ms1), "ok"),
			line(fmt.Sprintf("64 bytes from %s: icmp_seq=2 ttl=64 time=%.3f ms", host, ms2), "ok"),
			line(fmt.Sprintf("64 bytes from %s: icmp_seq=3 ttl=64 time=%.3f ms", host, ms3), "ok"),
			line(fmt.Sprintf("--- %s ping statistics ---", host), "muted"),
			line(fmt.Sprintf("3 packets transmitted, 3 received, 0%% packet loss, time 2003ms"), "ok"),
			line(fmt.Sprintf("rtt min/avg/max/mdev = %.3f/%.3f/%.3f/%.3f ms", ms1, (ms1+ms2+ms3)/3, ms3, math.Abs(ms3-ms1)), "muted"),
			blank(),
		)

	case "df":
		usedG := int(float64(diskPct) * 0.98)
		freeG := 98 - usedG
		lines = append(lines,
			line("Filesystem      Size  Used Avail Use% Mounted on", "head"),
			line(fmt.Sprintf("/dev/sda1        98G  %dG   %dG  %d%% /", usedG, freeG, diskPct), "ok"),
			line("tmpfs           3.9G  1.2M  3.9G   1% /dev/shm", "muted"),
			line("/dev/sdb1       200G  112G   82G  58% /var/lib/postgresql", "muted"),
			line("overlay          98G   40G   54G  43% /var/lib/docker", "muted"),
			blank(),
		)

	case "free":
		mu := memUsed()
		lines = append(lines,
			line("               total        used        free      shared  buff/cache   available", "head"),
			line(fmt.Sprintf("Mem:           %.1fGi       %sGi      1.2Gi      120Mi      2.1Gi      4.1Gi", totalMemG, mu), "ok"),
			line("Swap:          2.0Gi       0.0Gi      2.0Gi", "muted"),
			blank(),
		)

	case "ps":
		lines = append(lines, line("USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND", "head"))
		lines = append(lines, line("root           1  0.0  0.0 168152 12048 ?        Ss   06:00   0:01 /sbin/init", "muted"))
		state.mu.Lock()
		svcs := state.Services
		state.mu.Unlock()
		for _, s := range svcs {
			if !s.Running {
				continue
			}
			cmdName := s.Name
			if s.Name == "node-api" {
				cmdName = "node /app/server.js"
			} else if s.Name == "node-exporter" {
				cmdName = "node_exporter"
			}
			memPct := fmt.Sprintf("%.1f", s.MemMB/totalMemG/10)
			lines = append(lines, line(
				fmt.Sprintf("%-13s%-7d%-6.1f%-6s%-7d%-7d?        Ss   Jun28 %3.0f:%02d %s",
					currentUser, s.PID, s.CPU, memPct, 512000, int(s.MemMB*1024), s.CPU*10, rand.Intn(60), cmdName),
				"ok",
			))
		}
		lines = append(lines, line(fmt.Sprintf("%-13s%-7d0.0   0.0  23148  5232 pts/0    Ss   08:14   0:00 -bash", currentUser, 9812), "muted"), blank())

	case "top":
		cpu := cpuLoad()
		mu := memUsed()
		lines = append(lines,
			line(fmt.Sprintf("top - %s  %s", nowStr(), uptimeStr()), "head"),
			line("Tasks:  89 total,   1 running,  88 sleeping,   0 stopped,   0 zombie", "muted"),
			line(fmt.Sprintf("%%Cpu(s): %s us,  1.2 sy,  0.0 ni, 82.3 id,  0.1 wa", cpu), "muted"),
			line(fmt.Sprintf("MiB Mem :  %.0f total,   1228.1 free,   %.0f used,   2150.4 buff/cache", totalMemG*1024, randFloat(3.0, 3.5)*1024), "muted"),
			blank(),
			line("    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM  TIME+     COMMAND", "head"),
		)
		_ = mu
		state.mu.Lock()
		svcs := state.Services
		state.mu.Unlock()
		for _, s := range svcs {
			if !s.Running {
				continue
			}
			nm := s.Name
			if len(nm) > 12 {
				nm = nm[:12]
			}
			lines = append(lines, line(
				fmt.Sprintf("%7d %-9s 20   0 %7.0f%7.0f%7.0f S  %5.1f  %5.1f %3.0f:%02d.%02d %s",
					s.PID, currentUser, s.MemMB*1024, s.MemMB*614, s.MemMB*512,
					s.CPU, s.MemMB/totalMemG/10,
					s.CPU*10, rand.Intn(60), rand.Intn(100), nm),
				"ok",
			))
		}
		lines = append(lines, blank())

	case "netstat", "ss":
		lines = append(lines, line("Proto  Local Address           State       PID/Program", "head"))
		state.mu.Lock()
		svcs := state.Services
		state.mu.Unlock()
		for _, s := range svcs {
			if !s.Running {
				continue
			}
			nm := s.Display
			if len(nm) > 10 {
				nm = nm[:10]
			}
			lines = append(lines, line(fmt.Sprintf("tcp    0.0.0.0:%-5d          LISTEN      %d/%s", s.Port, s.PID, nm), "ok"))
		}
		lines = append(lines, line("tcp    0.0.0.0:22              LISTEN      892/sshd", "ok"), blank())

	case "curl":
		// Parse flags and URL
		url := ""
		headersOnly := false
		verbose := false
		for _, a := range args {
			switch a {
			case "-I", "--head":
				headersOnly = true
			case "-v", "--verbose":
				verbose = true
			case "-s", "--silent", "-S", "-sS", "-sSL", "-L", "-f", "-o", "/dev/null", "-w":
				// ignore these flags
			default:
				if !strings.HasPrefix(a, "-") {
					url = a
				}
			}
		}
		// Strip protocol
		cleanURL := strings.TrimPrefix(strings.TrimPrefix(url, "http://"), "https://")
		port := 80
		if idx := strings.Index(cleanURL, ":"); idx >= 0 {
			portStr := cleanURL[idx+1:]
			// Strip path after port
			if slashIdx := strings.Index(portStr, "/"); slashIdx >= 0 {
				portStr = portStr[:slashIdx]
			}
			fmt.Sscanf(portStr, "%d", &port)
		}

		state.mu.Lock()
		var found *Service
		for _, s := range state.Services {
			if s.Port == port {
				found = s
				break
			}
		}
		state.mu.Unlock()

		if verbose {
			lines = append(lines,
				line(fmt.Sprintf("*   Trying 127.0.0.1:%d...", port), "muted"),
				line(fmt.Sprintf("* Connected to localhost (127.0.0.1) port %d (#0)", port), "muted"),
				line("> GET / HTTP/1.1", "muted"),
				line(fmt.Sprintf("> Host: localhost:%d", port), "muted"),
				line("> User-Agent: curl/7.81.0", "muted"),
				line("> Accept: */*", "muted"),
				line(">", "muted"),
			)
		}

		if found != nil && found.Running {
			if headersOnly || verbose {
				lines = append(lines,
					line("HTTP/1.1 200 OK", "ok"),
					line(fmt.Sprintf("Server: %s", found.Name), "muted"),
					line(fmt.Sprintf("Date: %s", time.Now().Format("Mon, 02 Jan 2006 15:04:05 GMT")), "muted"),
					line("Content-Type: text/html; charset=utf-8", "muted"),
					line("Connection: keep-alive", "muted"),
				)
				if headersOnly {
					lines = append(lines, blank())
					break
				}
				lines = append(lines, line("", "muted"))
			}
			switch port {
			case 80:
				lines = append(lines, line(`<!DOCTYPE html><html><head><title>Server</title></head><body><h1>Nginx OK</h1></body></html>`, "ok"))
			case 9090:
				lines = append(lines, line(`{"status":"success","data":{"resultType":"scalar","result":[1751200000,"1"]}}`, "ok"))
			case 3000:
				// Check for path
				path := "/"
				if idx := strings.Index(cleanURL, "/"); idx >= 0 {
					path = cleanURL[idx:]
				} else if idx := strings.Index(cleanURL, ":"); idx >= 0 {
					afterPort := cleanURL[idx+1:]
					if slashIdx := strings.Index(afterPort, "/"); slashIdx >= 0 {
						path = afterPort[slashIdx:]
					}
				}
				switch {
				case path == "/health" || path == "/healthz":
					lines = append(lines, line(`{"status":"healthy","checks":{"database":"ok","redis":"ok","disk":"ok"},"uptime":10843}`, "ok"))
				case path == "/metrics":
					lines = append(lines,
						line("# HELP http_requests_total Total HTTP requests", "muted"),
						line("# TYPE http_requests_total counter", "muted"),
						line(fmt.Sprintf(`http_requests_total{method="GET",status="200"} %d`, rand.Intn(50000)+10000), "ok"),
						line(fmt.Sprintf(`http_requests_total{method="POST",status="200"} %d`, rand.Intn(5000)+1000), "ok"),
						line(fmt.Sprintf(`http_requests_total{method="GET",status="404"} %d`, rand.Intn(500)+50), "warn"),
						line("# HELP http_request_duration_seconds HTTP request latency", "muted"),
						line("# TYPE http_request_duration_seconds histogram", "muted"),
						line(fmt.Sprintf(`http_request_duration_seconds_bucket{le="0.1"} %d`, rand.Intn(40000)+5000), "ok"),
						line(fmt.Sprintf(`http_request_duration_seconds_bucket{le="0.5"} %d`, rand.Intn(45000)+10000), "ok"),
					)
				case path == "/api/users" || path == "/api/v1/users":
					lines = append(lines, line(`[{"id":1,"name":"admin","role":"admin"},{"id":2,"name":"deploy","role":"service"}]`, "ok"))
				default:
					lines = append(lines, line(`{"status":"ok","uptime":10843,"services":{"db":"connected","cache":"connected"}}`, "ok"))
				}
			case 6379:
				lines = append(lines, line("+PONG", "ok"))
			case 9093:
				lines = append(lines, line(`{"status":"success","data":{"clusterStatus":"disabled","versionInfo":{"version":"0.26.0"}}}`, "ok"))
			case 9100:
				lines = append(lines,
					line("# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.", "muted"),
					line(fmt.Sprintf(`node_cpu_seconds_total{cpu="0",mode="idle"} %.1f`, randFloat(50000, 80000)), "ok"),
					line(fmt.Sprintf(`node_cpu_seconds_total{cpu="0",mode="user"} %.1f`, randFloat(5000, 15000)), "ok"),
				)
			default:
				lines = append(lines, line(fmt.Sprintf("Connection to 127.0.0.1:%d [OK]", port), "ok"))
			}
		} else if found != nil {
			lines = append(lines, line(fmt.Sprintf("curl: (7) Failed to connect to localhost port %d: Connection refused", port), "err"))
		} else {
			lines = append(lines, line(fmt.Sprintf("curl: (7) Failed to connect to %s: Connection refused", url), "err"))
		}
		lines = append(lines, blank())

	case "journalctl":
		uIdx := -1
		follow := false
		var svcArg string
		for i, a := range args {
			if a == "-u" && i+1 < len(args) {
				uIdx = i
				svcArg = args[i+1]
			}
			if a == "-f" {
				follow = true
			}
		}
		_ = uIdx

		if follow && svcArg == "" {
			lines = append(lines, line("-- Logs begin. --", "muted"))
			state.mu.Lock()
			svcs := state.Services
			state.mu.Unlock()
			now := time.Now()
			for _, s := range svcs {
				if !s.Running {
					continue
				}
				for i, l := range s.Logs {
					ts := now.Add(-time.Duration(len(s.Logs)-i) * 12 * time.Second).Format("2006-01-02 15:04:05")
					lines = append(lines, line(fmt.Sprintf("%s %s %s: %s", ts, currentHostname, s.Name, l), "muted"))
				}
			}
			lines = append(lines, blank())
		} else if svcArg != "" {
			state.mu.Lock()
			s := matchService(svcArg)
			state.mu.Unlock()
			if s == nil {
				lines = append(lines, line(fmt.Sprintf("No journal entries for: %s", svcArg), "warn"), blank())
			} else {
				lines = append(lines, line(fmt.Sprintf("-- Logs for %s --", s.Name), "head"))
				pid := fmt.Sprintf("%d", s.PID)
				if s.PID == 0 {
					pid = "—"
				}
				for i, l := range s.Logs {
					ts := time.Now().Add(-time.Duration(len(s.Logs)-i) * 8 * time.Second).Format("Jan 02 15:04:05")
					cls := "muted"
					if s.Running {
						cls = "ok"
					} else {
						cls = "warn"
					}
					lines = append(lines, line(fmt.Sprintf("%s %s %s[%s]: %s", ts, currentHostname, s.Name, pid, l), cls))
				}
				if !s.Running {
					lines = append(lines, line(fmt.Sprintf("Jun 29 07:48:11 %s systemd[1]: %s.service: Main process exited", currentHostname, s.Name), "err"))
				}
				lines = append(lines, blank())
			}
		} else {
			lines = append(lines, line("journalctl: specify -u <service> or -f", "warn"), blank())
		}

	case "systemctl":
		sub := ""
		if len(args) > 0 {
			sub = args[0]
		}
		svcArg := ""
		if len(args) > 1 {
			svcArg = args[1]
		}

		switch sub {
		case "status":
			if svcArg == "" {
				state.mu.Lock()
				stopped := 0
				for _, s := range state.Services {
					if !s.Running {
						stopped++
					}
				}
				svcs := state.Services
				state.mu.Unlock()
				lines = append(lines,
					line(fmt.Sprintf("● %s", currentHostname), "head"),
					line("    State: running", "ok"),
					line("     Jobs: 0 queued", "muted"),
					line(fmt.Sprintf("   Failed: %d units", stopped), func() string {
						if stopped > 0 {
							return "warn"
						}
						return "muted"
					}()),
					blank(),
					line("UNIT                     ACTIVE", "head"),
				)
				for _, s := range svcs {
					cls := "ok"
					st := "active (running)"
					if !s.Running {
						cls = "err"
						st = "inactive (dead)"
					}
					lines = append(lines, line(fmt.Sprintf("  %-22s   %s", s.Name, st), cls))
				}
				lines = append(lines, blank())
			} else {
				state.mu.Lock()
				s := matchService(svcArg)
				state.mu.Unlock()
				if s == nil {
					lines = append(lines, line(fmt.Sprintf("Unit %s.service could not be found.", svcArg), "err"), blank())
				} else {
					lines = append(lines, line(fmt.Sprintf("● %s.service", s.Name), "head"))
					lines = append(lines, line(fmt.Sprintf("   Loaded: loaded (/lib/systemd/system/%s.service; enabled)", s.Name), "muted"))
					if s.Running {
						lines = append(lines,
							line(fmt.Sprintf("   Active: active (running) since Jun 29; %dmin ago", rand.Intn(180)+20), "ok"),
							line(fmt.Sprintf("  Process: %d ExecStart (code=started)", s.PID), "muted"),
							line(fmt.Sprintf(" Main PID: %d", s.PID), "muted"),
							line(fmt.Sprintf("   Memory: %.1fM", s.MemMB), "muted"),
							line(fmt.Sprintf("      CPU: %.0fms", s.CPU*60), "muted"),
							blank(),
						)
						for _, l := range s.Logs {
							lines = append(lines, line(fmt.Sprintf("Jun 29 %s %s %s[%d]: %s", nowStr(), currentHostname, s.Name, s.PID, l), "muted"))
						}
					} else {
						lines = append(lines,
							line("   Active: inactive (dead)", "err"),
							line("   Memory: 0B", "muted"),
						)
					}
					lines = append(lines, blank())
				}
			}

		case "start", "stop", "restart":
			state.mu.Lock()
			s := matchService(svcArg)
			if s == nil {
				state.mu.Unlock()
				lines = append(lines, line(fmt.Sprintf("Failed to %s %s.service: Unit not found.", sub, svcArg), "err"), blank())
			} else {
				switch sub {
				case "stop":
					if !s.Running {
						lines = append(lines, line(fmt.Sprintf("Warning: %s.service is already inactive.", s.Name), "warn"))
					} else {
						s.Running = false
						s.PID = 0
						lines = append(lines,
							line(fmt.Sprintf("Stopping %s.service...", s.Name), "warn"),
							line(fmt.Sprintf("● %s.service stopped.", s.Name), "ok"),
						)
					}
				case "start":
					if s.Running {
						lines = append(lines, line(fmt.Sprintf("Warning: %s.service is already active (PID %d).", s.Name, s.PID), "warn"))
					} else {
						s.PID = rand.Intn(1000) + 3000
						s.Running = true
						lines = append(lines,
							line(fmt.Sprintf("Starting %s.service...", s.Name), "ok"),
							line(fmt.Sprintf("● %s.service started (PID %d).", s.Name, s.PID), "ok"),
						)
					}
				case "restart":
					s.PID = rand.Intn(1000) + 3000
					s.Running = true
					lines = append(lines,
						line(fmt.Sprintf("Restarting %s.service...", s.Name), "warn"),
						line(fmt.Sprintf("● %s.service restarted (PID %d).", s.Name, s.PID), "ok"),
					)
				}
				state.mu.Unlock()
				lines = append(lines, blank())
				return CommandResponse{Lines: lines, Services: serviceSnapshot()}
			}

		case "list-units", "list":
			lines = append(lines, line("UNIT                          LOAD   ACTIVE  SUB     DESCRIPTION", "head"))
			state.mu.Lock()
			svcs := state.Services
			state.mu.Unlock()
			running := 0
			for _, s := range svcs {
				st := "active "
				sub2 := "running"
				cls := "ok"
				if !s.Running {
					st = "inactive"
					sub2 = "dead   "
					cls = "err"
				} else {
					running++
				}
				lines = append(lines, line(fmt.Sprintf("  %-30s loaded %s %s %s", s.Name+".service", st, sub2, s.Name), cls))
			}
			lines = append(lines, blank(), line(fmt.Sprintf("%d loaded units listed.", running), "muted"), blank())

		case "is-active":
			state.mu.Lock()
			s := matchService(svcArg)
			state.mu.Unlock()
			if s == nil {
				lines = append(lines, line("unknown", "warn"))
			} else if s.Running {
				lines = append(lines, line("active", "ok"))
			} else {
				lines = append(lines, line("inactive", "err"))
			}
			lines = append(lines, blank())

		case "enable":
			lines = append(lines, line(fmt.Sprintf("Created symlink /etc/systemd/system/multi-user.target.wants/%s.service.", svcArg), "ok"), blank())

		case "disable":
			lines = append(lines, line(fmt.Sprintf("Removed /etc/systemd/system/multi-user.target.wants/%s.service.", svcArg), "ok"), blank())

		default:
			lines = append(lines, line(fmt.Sprintf("systemctl: unknown subcommand '%s'. Try: status, start, stop, restart, list-units, is-active", sub), "warn"), blank())
		}

	case "service":
		svcArg := ""
		sub2 := ""
		if len(args) > 0 {
			svcArg = args[0]
		}
		if len(args) > 1 {
			sub2 = args[1]
		}
		if svcArg != "" && sub2 != "" {
			return handleCommand(fmt.Sprintf("systemctl %s %s", sub2, svcArg))
		}
		lines = append(lines, line("Usage: service <name> start|stop|status|restart", "warn"), blank())

	case "tutorial":
		topic := ""
		if len(args) > 0 {
			topic = strings.ToLower(args[0])
			topic = strings.ReplaceAll(topic, "-", "")
			topic = strings.ReplaceAll(topic, "_", "")
		}

		switch topic {
		case "systemctl", "svc":
			lines = append(lines,
				line("━━┫ systemctl tutorial ┣━━", "head"),
				blank(),
				line("1. Check all services:", "muted"),
				line("   systemctl status", "ok"),
				blank(),
				line("2. Check a specific service:", "muted"),
				line("   systemctl status nginx", "ok"),
				blank(),
				line("3. Stop a service:", "muted"),
				line("   systemctl stop nginx", "ok"),
				blank(),
				line("4. Start a service:", "muted"),
				line("   systemctl start nginx", "ok"),
				blank(),
				line("5. List all units:", "muted"),
				line("   systemctl list-units", "ok"),
				blank(),
				line("Available: tutorial systemctl, tutorial docker, tutorial curl, tutorial basic", "muted"),
				blank(),
			)

		case "docker", "container":
			lines = append(lines,
				line("━━┫ docker tutorial ┣━━", "head"),
				blank(),
				line("1. List running containers:", "muted"),
				line("   docker ps", "ok"),
				blank(),
				line("2. View container logs:", "muted"),
				line("   docker logs lab-nginx", "ok"),
				blank(),
				line("3. Container resource usage:", "muted"),
				line("   docker stats", "ok"),
				blank(),
				line("4. List images:", "muted"),
				line("   docker images", "ok"),
				blank(),
				line("5. Docker Compose:", "muted"),
				line("   docker compose ps", "ok"),
				blank(),
				line("Available: tutorial systemctl, tutorial docker, tutorial curl, tutorial basic", "muted"),
				blank(),
			)

		case "curl", "http":
			lines = append(lines,
				line("━━┫ curl tutorial ┣━━", "head"),
				blank(),
				line("1. Probe nginx (port 80):", "muted"),
				line("   curl localhost:80", "ok"),
				blank(),
				line("2. Probe Node API (port 3000):", "muted"),
				line("   curl localhost:3000", "ok"),
				blank(),
				line("3. Prometheus metrics:", "muted"),
				line("   curl localhost:9090/metrics", "ok"),
				blank(),
				line("4. Node exporter:", "muted"),
				line("   curl localhost:9100/metrics", "ok"),
				blank(),
				line("5. Download a file:", "muted"),
				line("   wget http://localhost:80", "ok"),
				blank(),
				line("Available: tutorial systemctl, tutorial docker, tutorial curl, tutorial basic", "muted"),
				blank(),
			)

		default:
			lines = append(lines,
				line("━━┫ ssh-lab tutorials ┣━━", "head"),
				blank(),
				line("Pick a topic:", "muted"),
				blank(),
				line("  tutorial systemctl    — Manage services with systemctl", "ok"),
				line("  tutorial docker       — Docker container management", "ok"),
				line("  tutorial curl         — HTTP probing and curl", "ok"),
				line("  tutorial basic        — Basic Linux commands", "ok"),
				blank(),
				line("Tip: Tab-completion works for commands, files, and services", "muted"),
				blank(),
			)
		}

	case "exit", "logout":
		lines = append(lines,
			line("logout", "muted"),
			line(fmt.Sprintf("Connection to %s closed.", currentHostname), "muted"),
			blank(),
			line("EXIT", "exit"),
		)

	case "clear":
		lines = append(lines, line("CLEAR", "clear"))

	case "sudo":
		if len(args) > 0 {
			lines = append(lines, line(fmt.Sprintf("[sudo] password for %s: ", currentUser), "warn"), line(fmt.Sprintf("(lab mode: sudo executed as %s)", currentUser), "muted"))
			rest := handleCommand(strings.Join(args, " "))
			lines = append(lines, rest.Lines...)
			return CommandResponse{Lines: lines, Services: rest.Services}
		}
		lines = append(lines, line("usage: sudo <command>", "warn"), blank())

	case "grep":
		pattern := ""
		file := ""
		rest := args
		recursive := false
		for i := 0; i < len(rest); i++ {
			if rest[i] == "-r" || rest[i] == "-R" {
				recursive = true
			} else if pattern == "" && !strings.HasPrefix(rest[i], "-") {
				pattern = rest[i]
			} else if pattern != "" && file == "" && !strings.HasPrefix(rest[i], "-") {
				file = rest[i]
			}
		}
		if pattern == "" {
			lines = append(lines, line("Usage: grep [-r] <pattern> [file...]", "warn"), blank())
		} else if file != "" {
			// Try to read the file from VFS
			if content, ok := getFileContent(file); ok {
				for _, l := range strings.Split(content, "\n") {
					if strings.Contains(l, pattern) {
						lines = append(lines, line(l, "ok"))
					}
				}
				if len(lines) == 0 {
					lines = append(lines, line(fmt.Sprintf("(no matches for '%s' in %s)", pattern, file), "muted"))
				}
				lines = append(lines, blank())
			} else if file == "/etc/passwd" || file == "passwd" {
				lines = append(lines,
					line("root:x:0:0:root:/root:/bin/bash", "muted"),
					line("daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin", "muted"),
					line(fmt.Sprintf("%s:x:1001:1001:SSH Lab,,,:/home/%s:/bin/bash", currentUser, currentUser), "ok"),
					blank(),
				)
			} else {
				lines = append(lines, line(fmt.Sprintf("grep: %s: No such file or directory", file), "err"), blank())
			}
		} else if !recursive {
			// Simulate stdin-style matching on history or services
			state.mu.Lock()
			hist := state.History
			state.mu.Unlock()
			found := false
			for _, h := range hist {
				if strings.Contains(h, pattern) {
					lines = append(lines, line(h, "ok"))
					found = true
				}
			}
			if !found {
				lines = append(lines, line(fmt.Sprintf("grep: no matches for '%s'", pattern), "muted"))
			}
			lines = append(lines, blank())
		} else {
			dir := file
			if dir == "" {
				dir = "."
			}
			lines = append(lines, line(fmt.Sprintf("grep -r '%s' %s", pattern, dir), "muted"))
			if strings.Contains("nginx postgresql redis", pattern) {
				state.mu.Lock()
				for _, s := range state.Services {
					for _, l := range s.Logs {
						if strings.Contains(l, pattern) {
							lines = append(lines, line(fmt.Sprintf("logs/%s.log: %s", s.Name, l), "ok"))
						}
					}
				}
				state.mu.Unlock()
			}
			lines = append(lines, line("Binary file apps/node-api/server matches", "muted"), blank())
		}

	case "ssh":
		lines = append(lines, line("ssh: lab mode — already on the target host.", "warn"), blank())

	// ── NEW COMMANDS ──────────────────────────────────────────────────────

	case "date":
		lines = append(lines, line(time.Now().Format("Mon Jan  2 15:04:05 MST 2006"), ""), blank())

	case "cal":
		now := time.Now()
		lines = append(lines, line(fmt.Sprintf("     %s %d", now.Format("January"), now.Year()), "head"))
		lines = append(lines, line("Su Mo Tu We Th Fr Sa", "muted"))
		first := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		dow := int(first.Weekday())
		padding := strings.Repeat("   ", dow)
		day := 1
		for day <= 31 {
			d := time.Date(now.Year(), now.Month(), day, 0, 0, 0, 0, now.Location())
			if d.Month() != now.Month() {
				break
			}
			if day == 1 {
				s := padding
				for day <= 31 {
					d = time.Date(now.Year(), now.Month(), day, 0, 0, 0, 0, now.Location())
					if d.Month() != now.Month() {
						break
					}
					s += fmt.Sprintf("%2d ", day)
					day++
					if int(d.Weekday()) == 6 {
						break
					}
				}
				lines = append(lines, line(s, ""))
			} else {
				s := ""
				for i := 0; i < 7 && day <= 31; i++ {
					d = time.Date(now.Year(), now.Month(), day, 0, 0, 0, 0, now.Location())
					if d.Month() != now.Month() {
						break
					}
					s += fmt.Sprintf("%2d ", day)
					day++
				}
				lines = append(lines, line(s, ""))
			}
		}
		lines = append(lines, blank())

	case "env", "printenv":
		// Dynamic vars
		envVars["USER"] = currentUser
		envVars["LOGNAME"] = currentUser
		envVars["HOME"] = "/home/" + currentUser
		envVars["HOSTNAME"] = currentHostname
		envVars["MAIL"] = "/var/mail/" + currentUser
		envVars["PWD"] = "/home/" + currentUser

		keys := make([]string, 0, len(envVars))
		for k := range envVars {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			lines = append(lines, line(fmt.Sprintf("%s=%s", k, envVars[k]), "muted"))
		}
		lines = append(lines, blank())

	case "export":
		if len(args) == 0 {
			lines = append(lines, line("usage: export VAR=value", "warn"), blank())
		} else {
			for _, a := range args {
				if idx := strings.Index(a, "="); idx > 0 {
					key := a[:idx]
					val := a[idx+1:]
					val = strings.Trim(val, "\"'")
					envVars[key] = val
					lines = append(lines, line(fmt.Sprintf("export %s=%s", key, val), "muted"))
				}
			}
			lines = append(lines, blank())
		}

	case "w":
		lines = append(lines,
			line(fmt.Sprintf(" %s  %s,  1 user,  load average: %.2f, %.2f, %.2f", nowStr(), uptimeStr(), randFloat(0.4, 0.7), randFloat(0.35, 0.65), randFloat(0.3, 0.6)), "head"),
			line("USER     TTY      FROM             LOGIN@   IDLE   JCPU   PCPU WHAT", "head"),
			line(fmt.Sprintf("%-9spts/0    10.0.0.5         08:14    0.00s  0.12s  0.00s w", currentUser), "ok"),
			blank(),
		)

	case "who":
		lines = append(lines,
			line(fmt.Sprintf("%-12s pts/0        %s (10.0.0.5)", currentUser, time.Now().Format("2006-01-02 15:04")), "ok"),
			blank(),
		)

	case "last":
		lines = append(lines, line("USERNAME  TTY    FROM          LOGIN@                 LOGOUT", "head"))
		now := time.Now()
		for i := 0; i < 8; i++ {
			loginTime := now.Add(-time.Duration(i*4+2) * time.Hour)
			dur := time.Duration(rand.Intn(120)+30) * time.Minute
			logoutTime := loginTime.Add(dur)
			lines = append(lines, line(fmt.Sprintf("%-10spts/0  10.0.0.%-3d    %s - %s  (%s)",
				currentUser, rand.Intn(20)+1,
				loginTime.Format("Mon Jan 2 15:04"),
				logoutTime.Format("15:04"),
				fmt.Sprintf("%02d:%02d", int(dur.Hours()), int(dur.Minutes())%60),
			), "muted"))
		}
		lines = append(lines,
			line("", ""),
			line(fmt.Sprintf("wtmp begins %s", now.Add(-30*24*time.Hour).Format("Mon Jan  2 15:04:05 2006")), "muted"),
			blank(),
		)

	case "groups":
		lines = append(lines, line(fmt.Sprintf("%s : %s sudo docker", currentUser, currentUser), ""), blank())

	case "passwd":
		lines = append(lines,
			line(fmt.Sprintf("Changing password for %s.", currentUser), "warn"),
			line("Current password: ", "warn"),
			line("(lab mode: password change not supported)", "muted"),
			blank(),
		)

	// ── Docker

	case "docker":
		sub := ""
		if len(args) > 0 {
			sub = args[0]
		}
		switch sub {
		case "ps":
			showAll := false
			for _, a := range args {
				if a == "-a" || a == "--all" {
					showAll = true
				}
			}
			lines = append(lines, line("CONTAINER ID   IMAGE                        COMMAND                  STATUS              PORTS                    NAMES", "head"))
			for _, c := range dockerContainers {
				if !c.Running && !showAll {
					continue
				}
				cmd := c.Command
				if len(cmd) > 25 {
					cmd = cmd[:22] + "..."
				}
				cls := "ok"
				if !c.Running {
					cls = "err"
				}
				lines = append(lines, line(fmt.Sprintf("%-15s%-29s%-25s%-20s%-25s%s",
					c.ID[:12], c.Image, `"`+cmd+`"`, c.Status, c.Ports, c.Name), cls))
			}
			lines = append(lines, blank())

		case "images":
			lines = append(lines, line("REPOSITORY            TAG        IMAGE ID       SIZE", "head"))
			for _, img := range dockerImages {
				lines = append(lines, line(fmt.Sprintf("%-22s%-11s%-15s%s", img[0], img[1], img[2][:12], img[3]), "muted"))
			}
			lines = append(lines, blank())

		case "logs":
			cname := ""
			if len(args) > 1 {
				cname = args[len(args)-1]
			}
			var target *DockerContainer
			for i := range dockerContainers {
				if strings.Contains(dockerContainers[i].Name, cname) || strings.HasPrefix(dockerContainers[i].ID, cname) {
					target = &dockerContainers[i]
					break
				}
			}
			if target == nil {
				lines = append(lines, line(fmt.Sprintf("Error: No such container: %s", cname), "err"), blank())
			} else {
				// Map container to service logs
				svcName := strings.TrimPrefix(target.Name, "lab-")
				state.mu.Lock()
				s := matchService(svcName)
				state.mu.Unlock()
				if s != nil {
					for _, l := range s.Logs {
						ts := time.Now().Add(-time.Duration(rand.Intn(3600)) * time.Second).Format("2006-01-02T15:04:05.000Z")
						lines = append(lines, line(fmt.Sprintf("%s  %s", ts, l), "muted"))
					}
				} else {
					lines = append(lines, line(fmt.Sprintf("%s  Container %s started", time.Now().Add(-3*time.Hour).Format("2006-01-02T15:04:05.000Z"), target.Name), "muted"))
				}
				lines = append(lines, blank())
			}

		case "exec":
			lines = append(lines, line("(lab mode: docker exec is not supported — use systemctl or service commands instead)", "warn"), blank())

		case "inspect":
			cname := ""
			if len(args) > 1 {
				cname = args[1]
			}
			lines = append(lines,
				line(fmt.Sprintf(`[{"Id": "%s", "Name": "/%s", "State": {"Status": "running"}}]`, cname, cname), "muted"),
				blank(),
			)

		case "stats":
			lines = append(lines, line("CONTAINER ID   NAME              CPU %     MEM USAGE / LIMIT     NET I/O           BLOCK I/O", "head"))
			for _, c := range dockerContainers {
				if !c.Running {
					continue
				}
				lines = append(lines, line(fmt.Sprintf("%-15s%-18s%.1f%%      %dMiB / 7.8GiB      %dMB / %dMB      %dMB / %dMB",
					c.ID[:12], c.Name, randFloat(0.1, 5.0), rand.Intn(200)+10, rand.Intn(500)+10, rand.Intn(200)+5, rand.Intn(100)+1, rand.Intn(50)+1), "muted"))
			}
			lines = append(lines, blank())

		case "compose":
			compSub := ""
			if len(args) > 1 {
				compSub = args[1]
			}
			switch compSub {
			case "ps":
				lines = append(lines, line("NAME              IMAGE                      SERVICE          STATUS", "head"))
				for _, c := range dockerContainers {
					st := "running"
					cls := "ok"
					if !c.Running {
						st = "exited (1)"
						cls = "err"
					}
					svc := strings.TrimPrefix(c.Name, "lab-")
					lines = append(lines, line(fmt.Sprintf("%-18s%-27s%-17s%s", c.Name, c.Image, svc, st), cls))
				}
				lines = append(lines, blank())
			case "up":
				lines = append(lines,
					line("Creating network \"lab_default\" with the default driver", "muted"),
					line("Creating lab-redis        ... done", "ok"),
					line("Creating lab-postgres     ... done", "ok"),
					line("Creating lab-node-api     ... done", "ok"),
					line("Creating lab-nginx        ... done", "ok"),
					line("Creating lab-prometheus   ... done", "ok"),
					line("Creating lab-node-exporter... done", "ok"),
					blank(),
				)
			case "down":
				lines = append(lines,
					line("Stopping lab-nginx        ... done", "ok"),
					line("Stopping lab-node-api     ... done", "ok"),
					line("Stopping lab-redis        ... done", "ok"),
					line("Stopping lab-postgres     ... done", "ok"),
					line("Stopping lab-prometheus   ... done", "ok"),
					line("Removing containers       ... done", "ok"),
					line("Removing network lab_default", "muted"),
					blank(),
				)
			default:
				lines = append(lines, line("Usage: docker compose [ps|up|down|logs]", "warn"), blank())
			}

		case "":
			lines = append(lines, line("Usage: docker [ps|images|logs|exec|stats|inspect|compose]", "warn"), blank())
		default:
			lines = append(lines, line(fmt.Sprintf("docker: '%s' is not a docker command.", sub), "err"), blank())
		}

	// ── Networking ────────────────────────────────────────────────────────

	case "ip":
		sub := ""
		if len(args) > 0 {
			sub = args[0]
		}
		switch sub {
		case "addr", "a", "address":
			lines = append(lines,
				line("1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000", "muted"),
				line("    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00", "muted"),
				line("    inet 127.0.0.1/8 scope host lo", "ok"),
				line("       valid_lft forever preferred_lft forever", "muted"),
				line("    inet6 ::1/128 scope host", "muted"),
				line("       valid_lft forever preferred_lft forever", "muted"),
				line("2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000", "muted"),
				line("    link/ether 52:54:00:a1:b2:c3 brd ff:ff:ff:ff:ff:ff", "muted"),
				line("    inet 10.0.0.42/24 brd 10.0.0.255 scope global eth0", "ok"),
				line("       valid_lft forever preferred_lft forever", "muted"),
				line("    inet6 fe80::5054:ff:fea1:b2c3/64 scope link", "muted"),
				line("       valid_lft forever preferred_lft forever", "muted"),
				line("3: docker0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP group default", "muted"),
				line("    link/ether 02:42:a1:b2:c3:d4 brd ff:ff:ff:ff:ff:ff", "muted"),
				line("    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0", "ok"),
				line("       valid_lft forever preferred_lft forever", "muted"),
				blank(),
			)
		case "route", "r":
			lines = append(lines,
				line("default via 10.0.0.1 dev eth0 proto dhcp metric 100", "ok"),
				line("10.0.0.0/24 dev eth0 proto kernel scope link src 10.0.0.42 metric 100", "ok"),
				line("172.17.0.0/16 dev docker0 proto kernel scope link src 172.17.0.1", "muted"),
				blank(),
			)
		case "link", "l":
			lines = append(lines,
				line("1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN mode DEFAULT group default qlen 1000", "muted"),
				line("    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00", "muted"),
				line("2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP mode DEFAULT group default qlen 1000", "ok"),
				line("    link/ether 52:54:00:a1:b2:c3 brd ff:ff:ff:ff:ff:ff", "muted"),
				line("3: docker0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP mode DEFAULT group default", "muted"),
				line("    link/ether 02:42:a1:b2:c3:d4 brd ff:ff:ff:ff:ff:ff", "muted"),
				blank(),
			)
		case "neigh", "n":
			lines = append(lines,
				line("10.0.0.1 dev eth0 lladdr 52:54:00:00:00:01 REACHABLE", "ok"),
				line("10.0.0.5 dev eth0 lladdr 52:54:00:00:00:05 STALE", "muted"),
				blank(),
			)
		default:
			lines = append(lines, line("Usage: ip [addr|route|link|neigh]", "warn"), blank())
		}

	case "ifconfig":
		lines = append(lines,
			line("eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500", "ok"),
			line("        inet 10.0.0.42  netmask 255.255.255.0  broadcast 10.0.0.255", "ok"),
			line("        inet6 fe80::5054:ff:fea1:b2c3  prefixlen 64  scopeid 0x20<link>", "muted"),
			line("        ether 52:54:00:a1:b2:c3  txqueuelen 1000  (Ethernet)", "muted"),
			line(fmt.Sprintf("        RX packets %d  bytes %d (%.1f MB)", rand.Intn(500000)+100000, rand.Intn(500000000)+100000000, randFloat(100, 500)), "muted"),
			line(fmt.Sprintf("        TX packets %d  bytes %d (%.1f MB)", rand.Intn(300000)+50000, rand.Intn(300000000)+50000000, randFloat(50, 300)), "muted"),
			line("", ""),
			line("lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536", "muted"),
			line("        inet 127.0.0.1  netmask 255.0.0.0", "muted"),
			blank(),
		)

	case "iptables":
		lines = append(lines,
			line("Chain INPUT (policy ACCEPT)", "head"),
			line("target     prot opt source               destination", "muted"),
			line("ACCEPT     all  --  anywhere             anywhere             state RELATED,ESTABLISHED", "ok"),
			line("ACCEPT     icmp --  anywhere             anywhere", "ok"),
			line("ACCEPT     all  --  anywhere             anywhere", "ok"),
			line("ACCEPT     tcp  --  anywhere             anywhere             tcp dpt:ssh", "ok"),
			line("ACCEPT     tcp  --  anywhere             anywhere             tcp dpt:http", "ok"),
			line("DROP       all  --  anywhere             anywhere", "muted"),
			blank(),
			line("Chain FORWARD (policy DROP)", "head"),
			line("target     prot opt source               destination", "muted"),
			line("DOCKER     all  --  anywhere             anywhere", "ok"),
			blank(),
			line("Chain OUTPUT (policy ACCEPT)", "head"),
			line("target     prot opt source               destination", "muted"),
			blank(),
		)

	case "dig":
		host := "localhost"
		if len(args) > 0 {
			for _, a := range args {
				if !strings.HasPrefix(a, "-") && !strings.HasPrefix(a, "+") {
					host = a
					break
				}
			}
		}
		lines = append(lines,
			line(fmt.Sprintf("; <<>> DiG 9.18.24 <<>> %s", host), "muted"),
			line(";; global options: +cmd", "muted"),
			line(";; Got answer:", "muted"),
			line(";; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: "+fmt.Sprintf("%d", rand.Intn(60000)+1000), "muted"),
			line(fmt.Sprintf(";; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1"), "muted"),
			blank(),
			line(";; ANSWER SECTION:", "head"),
			line(fmt.Sprintf("%-24s 300  IN  A   %d.%d.%d.%d", host+".", rand.Intn(200)+10, rand.Intn(255), rand.Intn(255), rand.Intn(254)+1), "ok"),
			blank(),
			line(fmt.Sprintf(";; Query time: %d msec", rand.Intn(20)+1), "muted"),
			line(";; SERVER: 10.0.0.1#53(10.0.0.1) (UDP)", "muted"),
			line(fmt.Sprintf(";; WHEN: %s", time.Now().Format("Mon Jan 02 15:04:05 MST 2006")), "muted"),
			blank(),
		)

	case "nslookup":
		host := "localhost"
		if len(args) > 0 {
			host = args[0]
		}
		ip := fmt.Sprintf("%d.%d.%d.%d", rand.Intn(200)+10, rand.Intn(255), rand.Intn(255), rand.Intn(254)+1)
		if host == "localhost" {
			ip = "127.0.0.1"
		}
		lines = append(lines,
			line("Server:		10.0.0.1", "muted"),
			line("Address:	10.0.0.1#53", "muted"),
			blank(),
			line("Non-authoritative answer:", "head"),
			line(fmt.Sprintf("Name:	%s", host), "ok"),
			line(fmt.Sprintf("Address: %s", ip), "ok"),
			blank(),
		)

	case "traceroute":
		host := "8.8.8.8"
		if len(args) > 0 {
			host = args[0]
		}
		lines = append(lines, line(fmt.Sprintf("traceroute to %s (%s), 30 hops max, 60 byte packets", host, host), "muted"))
		hops := []string{"10.0.0.1", "192.168.1.1", "172.16.0.1", "10.255.0.1", host}
		for i, h := range hops {
			ms := randFloat(0.5, 15.0) * float64(i+1)
			lines = append(lines, line(fmt.Sprintf(" %d  %s  %.3f ms  %.3f ms  %.3f ms", i+1, h, ms, ms*1.1, ms*0.9), "ok"))
		}
		lines = append(lines, blank())

	case "wget":
		url := ""
		if len(args) > 0 {
			for _, a := range args {
				if !strings.HasPrefix(a, "-") {
					url = a
					break
				}
			}
		}
		if url == "" {
			lines = append(lines, line("wget: missing URL", "err"), blank())
		} else {
			filename := "index.html"
			if idx := strings.LastIndex(url, "/"); idx >= 0 && idx < len(url)-1 {
				filename = url[idx+1:]
			}
			lines = append(lines,
				line(fmt.Sprintf("--2026-06-29 %s--  %s", nowStr(), url), "muted"),
				line(fmt.Sprintf("Resolving %s... done.", strings.Split(strings.TrimPrefix(strings.TrimPrefix(url, "http://"), "https://"), "/")[0]), "muted"),
				line("Connecting... connected.", "ok"),
				line("HTTP request sent, awaiting response... 200 OK", "ok"),
				line(fmt.Sprintf("Length: %d (%.1fK) [text/html]", rand.Intn(50000)+1000, randFloat(1, 50)), "muted"),
				line(fmt.Sprintf("Saving to: '%s'", filename), "muted"),
				blank(),
				line(fmt.Sprintf("'%s' saved [%d]", filename, rand.Intn(50000)+1000), "ok"),
				blank(),
			)
			userFiles[filename] = fmt.Sprintf("<!-- Downloaded from %s -->\n<html><body>OK</body></html>\n", url)
		}

	// ── Package management ────────────────────────────────────────────────

	case "apt", "apt-get":
		sub := ""
		if len(args) > 0 {
			sub = args[0]
		}
		switch sub {
		case "update":
			lines = append(lines,
				line("Hit:1 http://archive.ubuntu.com/ubuntu jammy InRelease", "muted"),
				line("Hit:2 http://archive.ubuntu.com/ubuntu jammy-updates InRelease", "muted"),
				line("Hit:3 http://security.ubuntu.com/ubuntu jammy-security InRelease", "muted"),
				line("Hit:4 https://download.docker.com/linux/ubuntu jammy InRelease", "muted"),
				line("Reading package lists... Done", "ok"),
				line("Building dependency tree... Done", "ok"),
				line("All packages are up to date.", "ok"),
				blank(),
			)
		case "upgrade":
			lines = append(lines,
				line("Reading package lists... Done", "muted"),
				line("Building dependency tree... Done", "muted"),
				line("Calculating upgrade... Done", "ok"),
				line("0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.", "ok"),
				blank(),
			)
		case "install":
			if len(args) < 2 {
				lines = append(lines, line("E: Unable to locate package", "err"), blank())
			} else {
				pkg := args[1]
				lines = append(lines,
					line(fmt.Sprintf("Reading package lists... Done"), "muted"),
					line(fmt.Sprintf("Building dependency tree... Done"), "muted"),
					line(fmt.Sprintf("%s is already the newest version.", pkg), "ok"),
					line("0 upgraded, 0 newly installed, 0 to remove.", "ok"),
					blank(),
				)
			}
		case "list":
			installed := false
			for _, a := range args {
				if a == "--installed" {
					installed = true
				}
			}
			if installed {
				pkgs := []string{
					"bash/jammy,now 5.1-6ubuntu1.1 amd64 [installed]",
					"coreutils/jammy,now 8.32-4.1ubuntu1.1 amd64 [installed]",
					"curl/jammy,now 7.81.0-1ubuntu1.15 amd64 [installed]",
					"docker-ce/jammy,now 24.0.7-1~ubuntu.22.04~jammy amd64 [installed]",
					"git/jammy,now 1:2.34.1-1ubuntu1.10 amd64 [installed]",
					"nginx/jammy,now 1.24.0-1ubuntu1 amd64 [installed]",
					"nodejs/jammy,now 18.19.0-1nodesource1 amd64 [installed]",
					"openssh-server/jammy,now 1:8.9p1-3ubuntu0.6 amd64 [installed]",
					"postgresql-15/jammy,now 15.6-0ubuntu0.22.04.1 amd64 [installed]",
					"prometheus/jammy,now 2.48.1+ds-1 amd64 [installed]",
					"redis-server/jammy,now 6:7.0.15-1 amd64 [installed]",
					"sudo/jammy,now 1.9.9-1ubuntu2.4 amd64 [installed]",
					"vim/jammy,now 2:8.2.3995-1ubuntu2.15 amd64 [installed]",
				}
				for _, p := range pkgs {
					lines = append(lines, line(p, "muted"))
				}
			} else {
				lines = append(lines, line("Listing... Done", "ok"))
			}
			lines = append(lines, blank())

		case "search":
			if len(args) > 1 {
				lines = append(lines,
					line(fmt.Sprintf("Sorting... Done"), "muted"),
					line(fmt.Sprintf("Full Text Search... Done"), "muted"),
					line(fmt.Sprintf("%s/jammy 1.0.0-1 amd64", args[1]), "ok"),
					line(fmt.Sprintf("  %s package", args[1]), "muted"),
					blank(),
				)
			} else {
				lines = append(lines, line("apt search: missing search term", "warn"), blank())
			}

		default:
			lines = append(lines, line("Usage: apt [update|upgrade|install|list|search]", "warn"), blank())
		}

	case "dpkg":
		sub := ""
		if len(args) > 0 {
			sub = args[0]
		}
		if sub == "-l" || sub == "--list" {
			lines = append(lines, line("Desired=Unknown/Install/Remove/Purge/Hold", "muted"))
			lines = append(lines, line("| Status=Not/Inst/Conf-files/Unpacked/halF-conf/Half-inst/trig-aWait/Trig-pend", "muted"))
			lines = append(lines, line("|/ Err?=(none)/Reinst-required (Status,Err: uppercase=bad)", "muted"))
			lines = append(lines, line("||/ Name                    Version                 Architecture Description", "head"))
			pkgs := [][3]string{
				{"bash", "5.1-6ubuntu1.1", "GNU Bourne Again SHell"},
				{"curl", "7.81.0-1ubuntu1.15", "command line tool for transferring data"},
				{"docker-ce", "24.0.7-1~ubuntu.22.04", "Docker: the open-source application container engine"},
				{"nginx", "1.24.0-1ubuntu1", "small, powerful, scalable web/proxy server"},
				{"nodejs", "18.19.0-1nodesource1", "Node.js event-based server-side javascript engine"},
				{"openssh-server", "1:8.9p1-3ubuntu0.6", "secure shell (SSH) server"},
				{"postgresql-15", "15.6-0ubuntu0.22.04.1", "PostgreSQL 15"},
			}
			for _, p := range pkgs {
				lines = append(lines, line(fmt.Sprintf("ii  %-24s%-24s amd64    %s", p[0], p[1], p[2]), "muted"))
			}
			lines = append(lines, blank())
		} else {
			lines = append(lines, line("Usage: dpkg [-l|--list]", "warn"), blank())
		}

	case "yum":
		if currentOS == "rhel" {
			sub := ""
			if len(args) > 0 {
				sub = args[0]
			}
			switch sub {
			case "list":
				lines = append(lines, line("Installed Packages", "head"))
				lines = append(lines, line("bash.x86_64           5.2.26-3.el9         @baseos", "muted"))
				lines = append(lines, line("nginx.x86_64          1:1.24.0-1.el9       @appstream", "muted"))
				lines = append(lines, line("postgresql15.x86_64   15.6-1PGDG.rhel9     @pgdg-common", "muted"))
				lines = append(lines, blank())
			default:
				lines = append(lines, line("Usage: yum [list|install|update]", "warn"), blank())
			}
		} else {
			lines = append(lines, line("bash: yum: command not found (try: apt)", "err"), blank())
		}

	// ── File operations ───────────────────────────────────────────────────

	case "touch":
		if len(args) == 0 {
			lines = append(lines, line("touch: missing file operand", "err"), blank())
		} else {
			for _, f := range args {
				if _, exists := userFiles[f]; !exists {
					userFiles[f] = ""
				}
			}
			lines = append(lines, blank())
		}

	case "mkdir":
		if len(args) == 0 {
			lines = append(lines, line("mkdir: missing operand", "err"), blank())
		} else {
			for _, d := range args {
				if d == "-p" {
					continue
				}
				if userDirs[d] {
					lines = append(lines, line(fmt.Sprintf("mkdir: cannot create directory '%s': File exists", d), "err"))
				} else {
					userDirs[d] = true
				}
			}
			lines = append(lines, blank())
		}

	case "rm":
		if len(args) == 0 {
			lines = append(lines, line("rm: missing operand", "err"), blank())
		} else {
			for _, f := range args {
				if f == "-r" || f == "-rf" || f == "-f" || f == "-fr" {
					continue
				}
				if _, ok := userFiles[f]; ok {
					delete(userFiles, f)
				} else if userDirs[f] {
					delete(userDirs, f)
				} else {
					lines = append(lines, line(fmt.Sprintf("rm: cannot remove '%s': No such file or directory", f), "err"))
				}
			}
			lines = append(lines, blank())
		}

	case "mv":
		if len(args) < 2 {
			lines = append(lines, line("mv: missing destination operand", "err"), blank())
		} else {
			src := args[0]
			dst := args[1]
			if content, ok := userFiles[src]; ok {
				userFiles[dst] = content
				delete(userFiles, src)
			} else {
				lines = append(lines, line(fmt.Sprintf("mv: cannot stat '%s': No such file or directory", src), "err"))
			}
			lines = append(lines, blank())
		}

	case "cp":
		if len(args) < 2 {
			lines = append(lines, line("cp: missing destination operand", "err"), blank())
		} else {
			src := args[0]
			dst := args[1]
			if content, ok := userFiles[src]; ok {
				userFiles[dst] = content
			} else if content, ok := getFileContent(src); ok {
				userFiles[dst] = content
			} else {
				lines = append(lines, line(fmt.Sprintf("cp: cannot stat '%s': No such file or directory", src), "err"))
			}
			lines = append(lines, blank())
		}

	case "chmod":
		if len(args) < 2 {
			lines = append(lines, line("chmod: missing operand", "err"), blank())
		} else {
			// Silently accept
			lines = append(lines, blank())
		}

	case "chown":
		if len(args) < 2 {
			lines = append(lines, line("chown: missing operand", "err"), blank())
		} else {
			lines = append(lines, blank())
		}

	case "head":
		if len(args) == 0 {
			lines = append(lines, line("head: missing file operand", "err"), blank())
		} else {
			n := 10
			file := ""
			for i, a := range args {
				if a == "-n" && i+1 < len(args) {
					fmt.Sscanf(args[i+1], "%d", &n)
				} else if !strings.HasPrefix(a, "-") {
					file = a
				}
			}
			if content, ok := getFileContent(file); ok {
				fileLines := strings.Split(strings.TrimRight(content, "\n"), "\n")
				if n > len(fileLines) {
					n = len(fileLines)
				}
				for _, l := range fileLines[:n] {
					lines = append(lines, line(l, "muted"))
				}
			} else {
				lines = append(lines, line(fmt.Sprintf("head: cannot open '%s' for reading: No such file or directory", file), "err"))
			}
			lines = append(lines, blank())
		}

	case "tail":
		if len(args) == 0 {
			lines = append(lines, line("tail: missing file operand", "err"), blank())
		} else {
			n := 10
			file := ""
			for i, a := range args {
				if a == "-n" && i+1 < len(args) {
					fmt.Sscanf(args[i+1], "%d", &n)
				} else if a == "-f" {
					// just show last lines (no follow in simulation)
				} else if !strings.HasPrefix(a, "-") {
					file = a
				}
			}
			if content, ok := getFileContent(file); ok {
				fileLines := strings.Split(strings.TrimRight(content, "\n"), "\n")
				start := len(fileLines) - n
				if start < 0 {
					start = 0
				}
				for _, l := range fileLines[start:] {
					lines = append(lines, line(l, "muted"))
				}
			} else {
				lines = append(lines, line(fmt.Sprintf("tail: cannot open '%s' for reading: No such file or directory", file), "err"))
			}
			lines = append(lines, blank())
		}

	case "wc":
		if len(args) == 0 {
			lines = append(lines, line("wc: missing file operand", "err"), blank())
		} else {
			file := ""
			for _, a := range args {
				if !strings.HasPrefix(a, "-") {
					file = a
					break
				}
			}
			if content, ok := getFileContent(file); ok {
				lineCount := strings.Count(content, "\n")
				wordCount := len(strings.Fields(content))
				charCount := len(content)
				lines = append(lines, line(fmt.Sprintf("  %d  %d  %d %s", lineCount, wordCount, charCount, file), ""), blank())
			} else {
				lines = append(lines, line(fmt.Sprintf("wc: %s: No such file or directory", file), "err"), blank())
			}
		}

	case "nano", "vi", "vim":
		if len(args) == 0 {
			lines = append(lines, line(fmt.Sprintf("usage: %s <filename>", cmd), "warn"), blank())
		} else {
			file := args[0]
			content := ""
			if c, ok := getFileContent(file); ok {
				content = c
			}
			return CommandResponse{
				Lines: []OutputLine{},
				Nano: &NanoPayload{
					Filename: file,
					Content:  content,
				},
			}
		}

	// ── Process control ───────────────────────────────────────────────────

	case "kill":
		if len(args) == 0 {
			lines = append(lines, line("kill: usage: kill [-s sigspec | -n signum | -sigspec] pid", "warn"), blank())
		} else {
			for _, a := range args {
				if strings.HasPrefix(a, "-") {
					continue
				}
				pid, err := strconv.Atoi(a)
				if err != nil {
					lines = append(lines, line(fmt.Sprintf("kill: (%s) - No such process", a), "err"))
					continue
				}
				state.mu.Lock()
				found := false
				for _, s := range state.Services {
					if s.PID == pid && s.Running {
						s.Running = false
						s.PID = 0
						lines = append(lines, line(fmt.Sprintf("[1]+  Terminated              %s (PID %d)", s.Name, pid), "warn"))
						found = true
						break
					}
				}
				state.mu.Unlock()
				if !found {
					lines = append(lines, line(fmt.Sprintf("kill: (%d) - No such process", pid), "err"))
				}
			}
			lines = append(lines, blank())
			return CommandResponse{Lines: lines, Services: serviceSnapshot()}
		}

	case "killall", "pkill":
		if len(args) == 0 {
			lines = append(lines, line(fmt.Sprintf("%s: missing process name", cmd), "err"), blank())
		} else {
			name := args[0]
			if name == "-9" && len(args) > 1 {
				name = args[1]
			}
			state.mu.Lock()
			s := matchService(name)
			if s != nil && s.Running {
				pid := s.PID
				s.Running = false
				s.PID = 0
				state.mu.Unlock()
				lines = append(lines, line(fmt.Sprintf("[1]+  Terminated              %s (PID %d)", s.Name, pid), "warn"), blank())
				return CommandResponse{Lines: lines, Services: serviceSnapshot()}
			}
			state.mu.Unlock()
			lines = append(lines, line(fmt.Sprintf("%s: %s: no process found", cmd, name), "err"), blank())
		}

	// ── System info ───────────────────────────────────────────────────────

	case "lsblk":
		lines = append(lines,
			line("NAME    MAJ:MIN RM   SIZE RO TYPE MOUNTPOINTS", "head"),
			line("sda       8:0    0   100G  0 disk", "muted"),
			line("├─sda1    8:1    0    98G  0 part /", "ok"),
			line("└─sda2    8:2    0     2G  0 part [SWAP]", "muted"),
			blank(),
		)

	case "mount":
		lines = append(lines,
			line("/dev/sda1 on / type ext4 (rw,relatime,errors=remount-ro)", "ok"),
			line("/dev/sdb1 on /var/lib/postgresql type ext4 (rw,relatime)", "ok"),
			line("tmpfs on /dev/shm type tmpfs (rw,nosuid,nodev)", "muted"),
			line("tmpfs on /run type tmpfs (rw,nosuid,nodev,size=807320k,nr_inodes=819200,mode=755)", "muted"),
			line("overlay on /var/lib/docker/overlay2/... type overlay (rw,relatime)", "muted"),
			blank(),
		)

	case "dmesg":
		lines = append(lines,
			line("[    0.000000] Linux version 5.15.0-91-generic (buildd@lcy02-amd64-026)", "muted"),
			line("[    0.000000] Command line: BOOT_IMAGE=/vmlinuz-5.15.0-91-generic root=UUID=a1b2c3d4", "muted"),
			line("[    0.000000] BIOS-provided physical RAM map:", "muted"),
			line(fmt.Sprintf("[    0.000000] BIOS-e820: [mem 0x0000000000000000-0x%016x] usable", int(totalMemG*1024*1024*1024)), "muted"),
			line("[    0.432817] ACPI: Core revision 20210930", "muted"),
			line("[    1.234567] Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz", "muted"),
			line("[    1.567890] e1000: eth0: e1000_probe: Intel PRO/1000 Network Connection", "ok"),
			line("[    2.345678] EXT4-fs (sda1): mounted filesystem with ordered data mode", "ok"),
			line("[    2.567890] systemd[1]: systemd 249 (249.11-0ubuntu3.12) running in system mode", "muted"),
			line("[    3.123456] docker0: port 1(veth123abc) entered blocking state", "muted"),
			blank(),
		)

	case "du":
		if len(args) == 0 || (len(args) == 1 && (args[0] == "-sh" || args[0] == "-h")) {
			lines = append(lines,
				line("4.0K\t./.ssh", "muted"),
				line("1.2M\t./apps/node-api", "muted"),
				line("1.2M\t./apps", "muted"),
				line("256K\t./logs", "muted"),
				line("4.0K\t./.bashrc", "muted"),
				line("1.5M\t.", "ok"),
				blank(),
			)
		} else {
			dir := "."
			for _, a := range args {
				if !strings.HasPrefix(a, "-") {
					dir = a
				}
			}
			lines = append(lines, line(fmt.Sprintf("%.1fM\t%s", randFloat(0.5, 50.0), dir), "ok"), blank())
		}

	case "find":
		dir := "."
		if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
			dir = args[0]
		}
		if dir == "." || dir == "/home/"+currentUser {
			lines = append(lines,
				line(".", "muted"),
				line("./.bashrc", "muted"),
				line("./.profile", "muted"),
				line("./.bash_history", "muted"),
				line("./.ssh", "muted"),
				line("./.ssh/authorized_keys", "muted"),
				line("./apps", "muted"),
				line("./apps/node-api", "muted"),
				line("./apps/node-api/server.js", "muted"),
				line("./apps/node-api/package.json", "muted"),
				line("./logs", "muted"),
				line("./logs/nginx-access.log", "muted"),
				line("./logs/nginx-error.log", "muted"),
				line("./health-check.sh", "ok"),
				line("./docker-compose.yml", "muted"),
			)
			for name := range userFiles {
				lines = append(lines, line("./"+name, "ok"))
			}
			for name := range userDirs {
				lines = append(lines, line("./"+name, "ok"))
			}
		} else {
			lines = append(lines, line(fmt.Sprintf("%s", dir), "muted"))
		}
		lines = append(lines, blank())

	case "crontab":
		if len(args) > 0 && args[0] == "-l" {
			lines = append(lines,
				line("# Edit this file to introduce tasks to be run by cron.", "muted"),
				line("# m h  dom mon dow   command", "muted"),
				line(fmt.Sprintf("*/5 * * * * /home/%s/health-check.sh >> /var/log/healthcheck.log 2>&1", currentUser), "ok"),
				line("0 3 * * * /usr/bin/apt-get update -qq && /usr/bin/apt-get upgrade -y -qq", "muted"),
				line("0 */6 * * * /usr/bin/docker system prune -f > /dev/null 2>&1", "muted"),
				blank(),
			)
		} else if len(args) > 0 && args[0] == "-e" {
			lines = append(lines, line("(lab mode: crontab editing not supported)", "warn"), blank())
		} else {
			lines = append(lines, line("usage: crontab [-l | -e]", "warn"), blank())
		}

	case "tar":
		lines = append(lines, line("(lab mode: tar archiving simulated)", "warn"))
		if len(args) > 0 {
			for _, a := range args {
				if !strings.HasPrefix(a, "-") && (strings.HasSuffix(a, ".tar.gz") || strings.HasSuffix(a, ".tgz")) {
					lines = append(lines, line(fmt.Sprintf("tar: %s: archive created", a), "ok"))
					break
				}
			}
		}
		lines = append(lines, blank())

	case "unzip", "zip", "gzip", "gunzip":
		lines = append(lines, line(fmt.Sprintf("(lab mode: %s is simulated)", cmd), "warn"), blank())

	case "tee":
		if len(args) > 0 {
			// Read from stdin (just echo empty)
			file := args[len(args)-1]
			userFiles[file] = ""
			lines = append(lines, line(fmt.Sprintf("(lab mode: tee writing to %s)", file), "muted"), blank())
		} else {
			lines = append(lines, line("tee: missing file operand", "err"), blank())
		}

	case "__writefile":
		if len(args) >= 2 {
			filename := args[0]
			b64Content := args[1]
			dec, err := base64.StdEncoding.DecodeString(b64Content)
			if err == nil {
				userFiles[filename] = string(dec)
			}
		}
		return CommandResponse{Lines: []OutputLine{}}

	case "xargs":
		lines = append(lines, line("(lab mode: xargs is not supported — run commands directly)", "warn"), blank())

	case "htop":
		// Just show top output with a note
		lines = append(lines, line("(lab mode: htop rendered as top — install ncurses for full htop)", "muted"))
		resp := handleCommand("top")
		lines = append(lines, resp.Lines...)
		return CommandResponse{Lines: lines, Services: resp.Services}

	default:
		lines = append(lines,
			line(fmt.Sprintf("bash: %s: command not found", cmd), "err"),
			line("Type 'help' to see available commands.", "muted"),
			blank(),
		)
	}

	return CommandResponse{Lines: lines}
}
