import { useEffect, useRef, useState, useCallback } from 'react'
import { LabConfig, OS_PRESETS } from '../types'
import type { OutputLine, NanoFile } from './useSSH'
import { getTheme } from '../themes'

type UseSSHReturn = {
  lines: OutputLine[]
  services: Record<string, never>
  connected: boolean
  sendCommand: (cmd: string) => void
  clearLines: () => void
  nanoFile: NanoFile | null
  setNanoFile: (file: NanoFile | null) => void
}

// container2wasm images available from the demo page
export const C2W_IMAGES: Record<string, { url: string; label: string }> = {
  debian:    { url: 'https://ktock.github.io/container2wasm-demo/debian.wasm',    label: 'Debian' },
  python:    { url: 'https://ktock.github.io/container2wasm-demo/python.wasm',    label: 'Python' },
  node:      { url: 'https://ktock.github.io/container2wasm-demo/node.wasm',      label: 'Node.js' },
  vim:       { url: 'https://ktock.github.io/container2wasm-demo/vim.wasm',       label: 'Vim' },
  debiancurl: { url: 'https://ktock.github.io/container2wasm-demo/debian-curl.wasm', label: 'Debian + curl' },
}

interface C2WInstance {
  stdin: (data: string) => void
  resize: (cols: number, rows: number) => void
  destroy: () => void
}

// Stub: actual container2wasm loading requires browser_wasi_shim + xterm-pty
// This sets up the architecture but needs the WASM runtime polyfill to function.
// See: https://github.com/ktock/container2wasm/tree/main/examples/wasi-browser
async function loadC2WImage(
  _url: string,
  onOutput: (text: string) => void,
  _theme: ReturnType<typeof getTheme>,
): Promise<C2WInstance> {
  // In production, this would:
  // 1. Fetch and instantiate the .wasm file
  // 2. Set up WASI with browser_wasi_shim
  // 3. Connect stdio to xterm-pty
  // 4. Return stdin/resize/destroy handles
  //
  // For now, provide a stub that shows setup instructions
  onOutput(`\r\n\x1b[1;33mcontainer2wasm\x1b[0m\r\n`)
  onOutput(`\r\nTo use container2wasm images, install the WASI polyfill:\r\n`)
  onOutput(`  npm install @bjorn3/browser_wasi_shim\r\n`)
  onOutput(`  npm install xterm-pty\r\n`)
  onOutput(`\r\nThen this function will boot real Linux containers in-browser.\r\n`)
  onOutput(`\r\nDemo: ${_url}\r\n`)
  onOutput(`\r\nFor now, switch back to "Simulated" mode to use the built-in engine.\r\n\n`)

  return {
    stdin: (_data: string) => {},
    resize: (_cols: number, _rows: number) => {},
    destroy: () => {},
  }
}

export function useContainer2Wasm(
  config: LabConfig | null,
  imageKey?: string,
): UseSSHReturn {
  const [connected, setConnected] = useState(false)
  const [lines, setLines] = useState<OutputLine[]>([])
  const instanceRef = useRef<C2WInstance | null>(null)
  const initDone = useRef(false)

  const appendLines = useCallback((newLines: OutputLine[]) => {
    setLines(prev => [...prev, ...newLines])
  }, [])

  const clearLines = useCallback(() => setLines([]), [])

  useEffect(() => {
    if (!config || !imageKey || initDone.current) return
    initDone.current = true

    const image = C2W_IMAGES[imageKey]
    if (!image) {
      appendLines([
        { text: `Unknown image: ${imageKey}`, class: 'err' },
        { text: '', class: '' },
      ])
      return
    }

    const osInfo = OS_PRESETS[config.os] ?? OS_PRESETS.ubuntu
    appendLines([
      { text: `${osInfo.pretty} — ${config.hostname}`, class: 'head' },
      { text: `Booting container2wasm: ${image.label}`, class: 'muted' },
      { text: '', class: '' },
    ])

    loadC2WImage(image.url, (text) => {
      appendLines([{ text, class: '' }])
    }, getTheme('monochrome')).then((inst) => {
      instanceRef.current = inst
      setConnected(true)
    })

    return () => {
      instanceRef.current?.destroy()
    }
  }, [config, imageKey, appendLines])

  const sendCommand = useCallback((cmd: string) => {
    if (instanceRef.current) {
      instanceRef.current.stdin(cmd + '\n')
    }
  }, [])

  return {
    lines,
    services: {},
    connected,
    sendCommand,
    clearLines,
    nanoFile: null,
    setNanoFile: () => {},
  }
}
