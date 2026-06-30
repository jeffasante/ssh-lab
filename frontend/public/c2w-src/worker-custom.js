// Minimal worker for container2wasm
// Receives pre-loaded WASM buffer from main thread, instantiates with WASI, runs it

importScripts("./workerTools.js");
importScripts("./wasi/index.js");
importScripts("./wasi/wasi_defs.js");

var ttyClient = null;
var pendingWasm = null;

onmessage = (msg) => {
  // First message from TtyServer: SharedArrayBuffer
  if (msg.data instanceof SharedArrayBuffer) {
    ttyClient = new TtyClient(msg.data);
    // If WASM buffer was already received, start now
    if (pendingWasm) {
      startContainer(pendingWasm, ttyClient);
      pendingWasm = null;
    }
    return;
  }

  // Second message: WASM buffer
  if (msg.data.type === "wasm") {
    if (ttyClient) {
      startContainer(msg.data.buffer, ttyClient);
    } else {
      pendingWasm = msg.data.buffer;
    }
    return;
  }
};

function startContainer(wasmBuffer, ttyClient) {
  var args = ["arg0"];
  var env = [];
  var fds = [
    undefined, // 0: stdin
    undefined, // 1: stdout
    undefined, // 2: stderr
  ];

  var wasi = new WASI(args, env, fds);

  // Patch fd_read/fd_write for TtyClient I/O
  var _fd_read = wasi.wasiImport.fd_read;
  wasi.wasiImport.fd_read = (fd, iovs_ptr, iovs_len, nread_ptr) => {
    if (fd == 0) {
      var buffer = new DataView(wasi.inst.exports.memory.buffer);
      var buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
      var iovecs = Iovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
      var nread = 0;
      for (var i = 0; i < iovecs.length; i++) {
        var iovec = iovecs[i];
        if (iovec.buf_len == 0) continue;
        var data = ttyClient.onRead(iovec.buf_len);
        buffer8.set(data, iovec.buf);
        nread += data.length;
      }
      buffer.setUint32(nread_ptr, nread, true);
      return 0;
    }
    return _fd_read(fd, iovs_ptr, iovs_len, nread_ptr);
  };

  var _fd_write = wasi.wasiImport.fd_write;
  wasi.wasiImport.fd_write = (fd, iovs_ptr, iovs_len, nwritten_ptr) => {
    if (fd == 1 || fd == 2) {
      var buffer = new DataView(wasi.inst.exports.memory.buffer);
      var buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
      var iovecs = Iovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
      var nwritten = 0;
      for (var i = 0; i < iovecs.length; i++) {
        var iovec = iovecs[i];
        if (iovec.buf_len == 0) continue;
        var slice = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
        ttyClient.onWrite(slice);
        nwritten += slice.length;
      }
      buffer.setUint32(nwritten_ptr, nwritten, true);
      return 0;
    }
    return _fd_write(fd, iovs_ptr, iovs_len, nwritten_ptr);
  };

  WebAssembly.instantiate(wasmBuffer, {
    wasi_snapshot_preview1: wasi.wasiImport,
  }).then((inst) => {
    wasi.start(inst.instance);
  });
}
