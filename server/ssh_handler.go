//go:build !(js && wasm)

package main

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/crypto/ssh"
)

type SSHConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password,omitempty"`
	Key      string `json:"key,omitempty"`
}

func startSSHSession(conn *websocket.Conn, cfg SSHConfig) error {
	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)

	auth := ssh.Password(cfg.Password)
	if cfg.Key != "" {
		signer, err := ssh.ParsePrivateKey([]byte(cfg.Key))
		if err != nil {
			return fmt.Errorf("parse key: %w", err)
		}
		auth = ssh.PublicKeys(signer)
	}

	client, err := ssh.Dial("tcp", addr, &ssh.ClientConfig{
		User:            cfg.Username,
		Auth:            []ssh.AuthMethod{auth},
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         10 * time.Second,
	})
	if err != nil {
		return fmt.Errorf("ssh dial: %w", err)
	}
	defer client.Close()

	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("ssh session: %w", err)
	}
	defer session.Close()

	// Request PTY with standard terminal settings
	modes := ssh.TerminalModes{
		ssh.ECHO:          1,
		ssh.TTY_OP_ISPEED: 14400,
		ssh.TTY_OP_OSPEED: 14400,
	}
	if err := session.RequestPty("xterm-256color", 40, 120, modes); err != nil {
		return fmt.Errorf("request pty: %w", err)
	}

	stdin, err := session.StdinPipe()
	if err != nil {
		return err
	}
	stdout, err := session.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := session.StderrPipe()
	if err != nil {
		return err
	}

	// Start the shell
	if err := session.Shell(); err != nil {
		return fmt.Errorf("shell: %w", err)
	}

	var wg sync.WaitGroup
	wg.Add(2)

	// Pipe SSH stdout/stderr → WebSocket
	go func() {
		defer wg.Done()
		buf := make([]byte, 4096)
		for {
			n, err := stdout.Read(buf)
			if n > 0 {
				sendJSON(conn, WSMessage{
					Type:    "ssh_output",
					Payload: string(buf[:n]),
				})
			}
			if err != nil {
				return
			}
		}
	}()

	go func() {
		defer wg.Done()
		buf := make([]byte, 4096)
		for {
			n, err := stderr.Read(buf)
			if n > 0 {
				sendJSON(conn, WSMessage{
					Type:    "ssh_output",
					Payload: string(buf[:n]),
				})
			}
			if err != nil {
				return
			}
		}
	}()

	// Read keystrokes from WebSocket, forward to SSH
	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			log.Println("ws read (ssh):", err)
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
		} else if req.Type == "ssh_resize" {
			// Could handle resize events here
		}
	}

	session.Close()
	client.Close()
	wg.Wait()
	return nil
}
