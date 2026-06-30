//go:build !(js && wasm)

package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os/exec"
	"sync"

	"github.com/gorilla/websocket"
)

func startWasmSession(conn *websocket.Conn) error {
	// Start wasmtime with the Debian image
	cmd := exec.Command("wasmtime", "/app/debian.wasm")

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("stdin pipe: %w", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %w", err)
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("stderr pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("wasmtime start: %w", err)
	}

	var wg sync.WaitGroup
	wg.Add(2)

	// Pipe stdout → WebSocket
	go func() {
		defer wg.Done()
		reader := bufio.NewReader(stdout)
		buf := make([]byte, 4096)
		for {
			n, err := reader.Read(buf)
			if n > 0 {
				sendJSON(conn, WSMessage{Type: "ssh_output", Payload: string(buf[:n])})
			}
			if err != nil {
				if err != io.EOF {
					log.Println("wasm stdout read:", err)
				}
				return
			}
		}
	}()

	// Pipe stderr → WebSocket
	go func() {
		defer wg.Done()
		reader := bufio.NewReader(stderr)
		buf := make([]byte, 4096)
		for {
			n, err := reader.Read(buf)
			if n > 0 {
				sendJSON(conn, WSMessage{Type: "ssh_output", Payload: string(buf[:n])})
			}
			if err != nil {
				if err != io.EOF {
					log.Println("wasm stderr read:", err)
				}
				return
			}
		}
	}()

	// Read keystrokes from WebSocket → stdin
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Println("ws read (wasm):", err)
			break
		}
		var req struct {
			Type    string `json:"type"`
			Payload string `json:"payload"`
		}
		if err := json.Unmarshal(msg, &req); err != nil {
			continue
		}
		if req.Type == "ssh_keystroke" {
			stdin.Write([]byte(req.Payload))
		}
	}

	cmd.Process.Kill()
	cmd.Wait()
	wg.Wait()
	return nil
}
