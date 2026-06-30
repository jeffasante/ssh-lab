// Custom worker for ssh-lab — adapted from container2wasm demo
// Uses local paths instead of demo site paths

importScripts("./workerTools.js");
importScripts("./wasi/index.js");
importScripts("./wasi/wasi_defs.js");
importScripts("./wasi/worker-util.js");
importScripts("./wasi/wasi-util.js");

onmessage = (msg) => {
  if (serveIfInitMsg(msg)) {
    return;
  }
  var ttyClient = new TtyClient(msg.data);
  var args = [];
  var env = [];
  var fds = [];
  var listenfd = 3;

  // Accept either pre-loaded wasm buffer (type: 'wasm') or chunks (type: 'init')
  if (msg.data.type === "wasm") {
    var wasm = msg.data.buffer;
    env = [
      "SSL_CERT_FILE=/.wasmenv/proxy.crt",
      "https_proxy=http://192.168.127.253:80",
      "http_proxy=http://192.168.127.253:80",
      "HTTPS_PROXY=http://192.168.127.253:80",
      "HTTP_PROXY=http://192.168.127.253:80",
    ];
    fds = [
      undefined, // 0: stdin
      undefined, // 1: stdout
      undefined, // 2: stderr
      undefined, // 3: cert dir
      undefined, // 4: socket listenfd
      undefined, // 5: accepted socket fd
    ];
    args = ["arg0", "--net=socket=listenfd=4", "--mac", genmac()];
    listenfd = 4;
    startWasi(wasm, ttyClient, args, env, fds, listenfd, 5);
  } else {
    // Legacy chunk-based loading (fetches from remote origin)
    fetchChunks((wasm) => {
      env = [
        "SSL_CERT_FILE=/.wasmenv/proxy.crt",
        "https_proxy=http://192.168.127.253:80",
        "http_proxy=http://192.168.127.253:80",
        "HTTPS_PROXY=http://192.168.127.253:80",
        "HTTP_PROXY=http://192.168.127.253:80",
      ];
      fds = [undefined, undefined, undefined, undefined, undefined, undefined];
      args = ["arg0", "--net=socket=listenfd=4", "--mac", genmac()];
      listenfd = 4;
      startWasi(wasm, ttyClient, args, env, fds, listenfd, 5);
    });
  }
};

function startWasi(wasm, ttyClient, args, env, fds, listenfd, connfd) {
  var wasi = new WASI(args, env, fds);
  wasiHack(wasi, ttyClient, connfd);
  wasiHackSocket(wasi, listenfd, connfd);
  WebAssembly.instantiate(wasm, {
    wasi_snapshot_preview1: wasi.wasiImport,
  }).then((inst) => {
    wasi.start(inst.instance);
  });
}

// wasiHack patches wasi object for integrating it to xterm-pty.
function wasiHack(wasi, ttyClient, connfd) {
  const ERRNO_INVAL = 28;
  const ERRNO_AGAIN = 6;
  var _fd_read = wasi.wasiImport.fd_read;
  wasi.wasiImport.fd_read = (fd, iovs_ptr, iovs_len, nread_ptr) => {
    if (fd == 0) {
      var buffer = new DataView(wasi.inst.exports.memory.buffer);
      var buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
      var iovecs = Iovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
      var nread = 0;
      for (i = 0; i < iovecs.length; i++) {
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
      for (i = 0; i < iovecs.length; i++) {
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
}

function genmac() {
  return "02:XX:XX:XX:XX:XX".replace(/X/g, function () {
    return "0123456789ABCDEF".charAt(Math.floor(Math.random() * 16));
  });
}

// wasiHackSocket — stubs socket operations (real networking needs the full stack)
function wasiHackSocket(wasi, listenfd, connfd) {
  var _fd_close = wasi.wasiImport.fd_close;
  wasi.wasiImport.fd_close = (fd) => {
    if (fd == listenfd || fd == connfd) return 0;
    return _fd_close(fd);
  };
  var _fd_read = wasi.wasiImport.fd_read;
  wasi.wasiImport.fd_read = (fd, iovs_ptr, iovs_len, nread_ptr) => {
    if (fd == listenfd || fd == connfd) {
      // Return EAGAIN — no data available (networking not available)
      return 6; // ERRNO_AGAIN
    }
    return _fd_read(fd, iovs_ptr, iovs_len, nread_ptr);
  };
  var _fd_write = wasi.wasiImport.fd_write;
  wasi.wasiImport.fd_write = (fd, iovs_ptr, iovs_len, nwritten_ptr) => {
    if (fd == listenfd || fd == connfd) {
      return 6; // ERRNO_AGAIN
    }
    return _fd_write(fd, iovs_ptr, iovs_len, nwritten_ptr);
  };
  var _fd_fdstat_get = wasi.wasiImport.fd_fdstat_get;
  wasi.wasiImport.fd_fdstat_get = (fd, stat_ptr) => {
    if (fd == listenfd || fd == connfd) {
      var buffer = new DataView(wasi.inst.exports.memory.buffer);
      // Return a socket-type fdstat (filetype=2 for socket)
      buffer.setUint8(stat_ptr, 2); // filetype: socket
      buffer.setUint16(stat_ptr + 2, 0, true); // flags
      buffer.setUint16(stat_ptr + 4, 0, true); // rights
      buffer.setBigUint64(stat_ptr + 8, 0n, true);
      buffer.setBigUint64(stat_ptr + 16, 0n, true);
      return 0;
    }
    return _fd_fdstat_get(fd, iovs_ptr, iovs_len, nread_ptr);
  };
}
