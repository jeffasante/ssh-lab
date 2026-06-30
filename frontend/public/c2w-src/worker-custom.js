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
    // Debug: check buffer size
    console.log('Worker: received WASM buffer of ' + wasmBuffer.byteLength + ' bytes');
    if (wasmBuffer.byteLength === 0) {
        console.error('Worker: WASM buffer is empty!');
        return;
    }

    var args = ['arg0'];
    var env = [];
    // Add socket file descriptors and networking proxy env vars
    var listenfd = 3;
    var connfd = 5;
    var fds = [
        undefined, // 0: stdin
        undefined, // 1: stdout
        undefined, // 2: stderr
        undefined, // 3: cert dir
        undefined, // 4: socket listen
        undefined, // 5: accepted socket
    ];
    env = [
        "SSL_CERT_FILE=/.wasmenv/proxy.crt",
        "https_proxy=http://192.168.127.253:80",
        "http_proxy=http://192.168.127.253:80",
        "HTTPS_PROXY=http://192.168.127.253:80",
        "HTTP_PROXY=http://192.168.127.253:80"
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

  // Add stub for sock_accept and other socket functions the WASM might need
  wasi.wasiImport.sock_accept = (fd, flags, fd_ptr) => {
      return 6; // ERRNO_AGAIN — no connections
  };
  wasi.wasiImport.sock_open = (fd, flags, fd_ptr) => {
      return 6; // ERRNO_AGAIN
  };
  wasi.wasiImport.sock_shutdown = (fd, how) => {
      return 0; // success
  };
  wasi.wasiImport.sock_connect = (fd, addr, addr_len, ret_fd) => {
      return 6; // ERRNO_AGAIN
  };
  wasi.wasiImport.sock_bind = (fd, addr, addr_len) => {
      return 6; // ERRNO_AGAIN
  };
  wasi.wasiImport.sock_listen = (fd, backlog) => {
      return 0; // success
  };
  wasi.wasiImport.sock_setsockopt = (fd, level, optname, optval, optlen) => {
      return 0; // success
  };
  wasi.wasiImport.sock_getsockopt = (fd, level, optname, optval_ptr, optlen_ptr) => {
      return 0; // success
  };

  console.log('Worker: instantiating WASM...');
  WebAssembly.instantiate(wasmBuffer, {
      "wasi_snapshot_preview1": wasi.wasiImport,
  }).then((inst) => {
      console.log('Worker: WASM instantiated, starting...');
      wasi.start(inst.instance);
  }).catch((err) => {
      console.error('Worker: WASM error:', err);
  });
};
}
