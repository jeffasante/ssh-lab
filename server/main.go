//go:build !(js && wasm)

package main

import (
	"encoding/json"
	"log"
	"math"
	"math/rand"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

type WSMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// ── WebSocket upgrader ────────────────────────────────────────────────────────

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// WebSocket handler

func wsHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade:", err)
		return
	}
	defer conn.Close()

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
					s.CPU = math.Round(randFloat(0.05, 3.5)*10) / 10
					s.MemMB = math.Round(s.MemMB*(0.98+rand.Float64()*0.04)*10) / 10
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

// Main

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
