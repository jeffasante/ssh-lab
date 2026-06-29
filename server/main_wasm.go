//go:build js && wasm

package main

import (
	"encoding/json"
	"math/rand"
	"syscall/js"
	"time"
)

func main() {
	rand.Seed(time.Now().UnixNano())

	// Expose initLab(configJSON string) to JS
	js.Global().Set("initLab", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		if len(args) < 1 {
			return `{"ok":false,"error":"missing config"}`
		}
		configJSON := args[0].String()
		var cfg struct {
			Hostname string `json:"hostname"`
			OS       string `json:"os"`
			Scenario string `json:"scenario"`
		}
		if err := json.Unmarshal([]byte(configJSON), &cfg); err != nil {
			return `{"ok":false,"error":"bad config"}`
		}

		// Apply config (same logic as /api/init in server mode)
		if cfg.Hostname != "" {
			currentHostname = cfg.Hostname
		}
		if cfg.OS != "" {
			currentOS = cfg.OS
		}

		cpuOverride = -1.0
		diskPct = 43
		userFiles = map[string]string{}
		userDirs = map[string]bool{}

		for _, s := range state.Services {
			s.Running = true
			if s.PID == 0 {
				s.PID = rand.Intn(2000) + 1000
			}
			s.CPU = randFloat(0.05, 3.5)
			s.MemMB = randFloat(8, 145)
		}

		switch cfg.Scenario {
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
			// all running
		}

		state.BootTime = time.Now().Add(-time.Duration(rand.Intn(240)+20) * time.Minute)
		return `{"ok":true}`
	}))

	// Expose processCommand(cmd string) to JS — returns JSON string
	js.Global().Set("processCommand", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		if len(args) < 1 {
			return `{"lines":[],"services":{}}`
		}
		cmd := args[0].String()
		resp := handleCommand(cmd)
		b, _ := json.Marshal(resp)
		return string(b)
	}))

	// Expose getServices() to JS — returns JSON string
	js.Global().Set("getServices", js.FuncOf(func(this js.Value, args []js.Value) interface{} {
		snap := serviceSnapshot()
		b, _ := json.Marshal(snap)
		return string(b)
	}))

	// Keep alive
	select {}
}
