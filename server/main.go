//go:build !(js && wasm)

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

func init() {
	runRealPing = func(host string) ([]string, error) {
		cmd := exec.Command("ping", "-c", "3", "-W", "2", host)
		interruptRunning = func() error {
			return cmd.Process.Signal(os.Kill)
		}
		defer func() { interruptRunning = nil }()

		var out bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &out
		if err := cmd.Run(); err != nil {
			return nil, err
		}
		raw := strings.TrimSpace(out.String())
		if raw == "" {
			return nil, fmt.Errorf("empty ping output")
		}
		return strings.Split(raw, "\n"), nil
	}

	runRealDocker = func(dockerArgs ...string) ([]string, error) {
		// Build docker CLI args from our parsed args
		dockerCmd := []string{"docker"}
		dockerCmd = append(dockerCmd, dockerArgs...)

		cmd := exec.Command(dockerCmd[0], dockerCmd[1:]...)
		var out bytes.Buffer
		cmd.Stdout = &out
		cmd.Stderr = &out
		if err := cmd.Run(); err != nil {
			return nil, err
		}
		raw := strings.TrimSpace(out.String())
		if raw == "" {
			return nil, fmt.Errorf("empty docker output")
		}
		return strings.Split(raw, "\n"), nil
	}
}

type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade:", err)
		return
	}
	defer conn.Close()

	// Read first message to determine mode
	_, firstMsg, err := conn.ReadMessage()
	if err != nil {
		return
	}
	var initReq struct {
		Mode string    `json:"mode"`
		SSH  SSHConfig `json:"ssh,omitempty"`
	}
	if err := json.Unmarshal(firstMsg, &initReq); err != nil {
		return
	}

	// WASM mode — run container via wasmtime
	if initReq.Mode == "wasm" {
		sendJSON(conn, WSMessage{Type: "ssh_ready", Payload: "booting container..."})
		if err := startWasmSession(conn); err != nil {
			log.Println("wasm error:", err)
			sendJSON(conn, WSMessage{Type: "ssh_output", Payload: fmt.Sprintf("\r\nWASM failed: %s\r\n", err)})
		}
		return
	}

	// SSH mode — connect to real server
	if initReq.Mode == "ssh" {
		sendJSON(conn, WSMessage{Type: "ssh_ready", Payload: "connecting..."})
		if err := startSSHSession(conn, initReq.SSH); err != nil {
			log.Println("ssh error:", err)
			sendJSON(conn, WSMessage{Type: "ssh_output", Payload: fmt.Sprintf("\r\nSSH connection failed: %s\r\n", err)})
		}
		return
	}

	// Send initial state
	sendJSON(conn, WSMessage{
		Type:    "init",
		Payload: serviceSnapshot(),
	})

	// Periodic service stats update
	ticker := time.NewTicker(4 * time.Second)
	go func() {
		for range ticker.C {
			state.mu.Lock()
			for _, s := range state.Services {
				if s.Running {
					s.CPU = randFloat(0.05, 3.5)
					s.MemMB = randFloat(8, 145)
				}
			}
			snap := serviceSnapshot()
			state.mu.Unlock()
			if err := sendJSON(conn, WSMessage{Type: "services", Payload: snap}); err != nil {
				ticker.Stop()
				return
			}
		}
	}()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			ticker.Stop()
			break
		}
		var req struct {
			Command string `json:"command"`
		}
		if err := json.Unmarshal(msg, &req); err != nil {
			continue
		}
		resp := handleCommand(req.Command)
		state.mu.Lock()
		snap := serviceSnapshot()
		state.mu.Unlock()
		resp.Services = snap
		sendJSON(conn, WSMessage{Type: "output", Payload: resp})
	}
}

func sendJSON(conn *websocket.Conn, v interface{}) error {
	b, _ := json.Marshal(v)
	return conn.WriteMessage(websocket.TextMessage, b)
}

func main() {
	rand.Seed(time.Now().UnixNano())

	mux := http.NewServeMux()
	mux.HandleFunc("/ws", wsHandler)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	mux.HandleFunc("/api/init", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		if r.Method != "POST" {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			Hostname string `json:"hostname"`
			OS       string `json:"os"`
			Scenario string `json:"scenario"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"bad request"}`, http.StatusBadRequest)
			return
		}

		if req.Hostname != "" {
			currentHostname = req.Hostname
		}
		if req.OS != "" {
			currentOS = req.OS
		}

		// Reset to defaults first
		cpuOverride = -1.0
		diskPct = 43
		userFiles = map[string]string{}
		userDirs = map[string]bool{}
		state.mu.Lock()
		for _, s := range state.Services {
			s.Running = true
			if s.PID == 0 {
				s.PID = rand.Intn(2000) + 1000
			}
			s.CPU = randFloat(0.05, 3.5)
			s.MemMB = randFloat(8, 145)
		}

		// Apply scenario on top of defaults
		switch req.Scenario {
		case "services-down":
			state.Services["nginx"].Running = false
			state.Services["nginx"].PID = 0
			state.Services["postgresql"].Running = false
			state.Services["postgresql"].PID = 0

		case "high-load":
			cpuOverride = 88.0
			for _, s := range state.Services {
				if s.Running {
					s.CPU = randFloat(12, 25)
				}
			}

		case "disk-full":
			diskPct = 91

		case "healthy":
			// all services stay running (7/7 active)
		}
		state.mu.Unlock()

		state.mu.Lock()
		state.BootTime = time.Now().Add(-time.Duration(rand.Intn(240)+20) * time.Minute)
		state.mu.Unlock()

		w.Write([]byte(`{"ok":true}`))
	})

	// Real-service mock HTTP — lets localhost `curl` hit real simulated services
	serviceMux := http.NewServeMux()
	serviceMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Determine which service to mock based on path
		path := strings.TrimPrefix(r.URL.Path, "/")
		serviceName := strings.Split(path, "/")[0]
		if serviceName == "" {
			serviceName = "nginx"
		}

		state.mu.Lock()
		svc := matchService(serviceName)
		state.mu.Unlock()

		if svc == nil || !svc.Running {
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(fmt.Sprintf("Service %s is not running\n", serviceName)))
			return
		}

		switch svc.Port {
		case 80:
			w.Header().Set("Content-Type", "text/html")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`<!DOCTYPE html><html><head><title>Server</title></head><body><h1>Nginx OK</h1></body></html>`))
		case 3000:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			if strings.Contains(path, "/health") {
				w.Write([]byte(`{"status":"healthy","checks":{"database":"ok","redis":"ok","disk":"ok"},"uptime":10843}`))
			} else {
				w.Write([]byte(`{"status":"ok","uptime":10843,"services":{"db":"connected","cache":"connected"}}`))
			}
		case 9090:
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"success","data":{"resultType":"scalar","result":[1751200000,"1"]}}`))
		case 9100:
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(fmt.Sprintf(`# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} %.0f
node_cpu_seconds_total{cpu="0",mode="system"} %.0f
`, randFloat(50000, 200000), randFloat(5000, 50000))))
		default:
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(fmt.Sprintf("Connected to %s on port %d\n", svc.Display, svc.Port)))
		}
	})

	go func() {
		log.Println("mock services listening on :9099")
		if err := http.ListenAndServe(":9099", serviceMux); err != nil {
			log.Println("mock services stopped:", err)
		}
	}()

	// Wrap mux with CORS for dev
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		mux.ServeHTTP(w, r)
	})

	addr := ":8080"
	log.Printf("ssh-lab server listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, handler))
}
