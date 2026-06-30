// Minimal worker for container2wasm
importScripts("./workerTools.js");
importScripts("./wasi/index.js");
importScripts("./wasi/wasi_defs.js");

var ttyClient = null;
var pendingWasm = null;

onmessage = function (msg) {
  if (msg.data instanceof SharedArrayBuffer) {
    ttyClient = new TtyClient(msg.data);
    if (pendingWasm) {
      startContainer(pendingWasm, ttyClient);
      pendingWasm = null;
    }
    return;
  }
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
  console.log(
    "Worker: received WASM buffer of " + wasmBuffer.byteLength + " bytes",
  );
  if (wasmBuffer.byteLength === 0) {
    console.error("Worker: WASM buffer is empty!");
    return;
  }

  var args = ["arg0"];
  var env = [
    "SSL_CERT_FILE=/.wasmenv/proxy.crt",
    "https_proxy=http://192.168.127.253:80",
    "http_proxy=http://192.168.127.253:80",
  ];
  var fds = [undefined, undefined, undefined];

  var wasi = new WASI(args, env, fds);

  // Patch fd_read for stdin
  var _fd_read = wasi.wasiImport.fd_read;
  wasi.wasiImport.fd_read = function (fd, iovs_ptr, iovs_len, nread_ptr) {
    console.log("Worker: fd_read(" + fd + ")");
    if (fd == 0) {
      console.log("Worker: stdin read requested");
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

  // Patch fd_write for stdout/stderr
  var _fd_write = wasi.wasiImport.fd_write;
  wasi.wasiImport.fd_write = function (fd, iovs_ptr, iovs_len, nwritten_ptr) {
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

  // Socket stubs
  wasi.wasiImport.sock_accept = function () {
    return 6;
  };
  wasi.wasiImport.sock_open = function () {
    return 6;
  };
  wasi.wasiImport.sock_shutdown = function () {
    return 0;
  };
  wasi.wasiImport.sock_connect = function () {
    return 6;
  };
  wasi.wasiImport.sock_bind = function () {
    return 6;
  };
  wasi.wasiImport.sock_listen = function () {
    return 0;
  };
  wasi.wasiImport.sock_setsockopt = function () {
    return 0;
  };
  wasi.wasiImport.sock_getsockopt = function () {
    return 0;
  };

  // Override poll_oneoff — basic support for stdin polling
  wasi.wasiImport.poll_oneoff = function (
    in_ptr,
    out_ptr,
    nsubscriptions,
    nevents_ptr,
  ) {
    var mem = new DataView(wasi.inst.exports.memory.buffer);
    var mem8 = new Uint8Array(wasi.inst.exports.memory.buffer);
    var nevents = 0;
    for (var i = 0; i < nsubscriptions; i++) {
      // Each subscription is 48 bytes: 8 userdata + 1 type + 7 pad + 32 data
      var sub_ptr = in_ptr + i * 48;
      var type = mem.getUint8(sub_ptr + 8);
      // type 0 = clock, 1 = fd_read, 2 = fd_write
      if (type === 0) {
        // Clock subscription — check if timeout has elapsed
        // For simplicity, just return immediately
        // Write an event (32 bytes): 8 userdata + 4 errno + 2 type + 18 pad
        mem.setBigUint64(
          out_ptr + nevents * 32,
          mem.getBigUint64(sub_ptr, true),
          true,
        );
        mem.setUint8(out_ptr + nevents * 32 + 8, 0); // errno = 0 (success)
        mem.setUint8(out_ptr + nevents * 32 + 10, 0); // type = clock
        nevents++;
      } else if (type === 1 || type === 2) {
        // fd_read or fd_write subscription
        var fd = mem.getUint32(sub_ptr + 16, true);
        if (fd === 0 && type === 1) {
          // stdin read — check TtyClient for data
          if (ttyClient) {
            try {
              var avail = ttyClient.onRead(0).length;
              if (avail > 0) {
                mem.setBigUint64(
                  out_ptr + nevents * 32,
                  mem.getBigUint64(sub_ptr, true),
                  true,
                );
                mem.setUint8(out_ptr + nevents * 32 + 8, 0);
                mem.setUint8(out_ptr + nevents * 32 + 10, 1); // type = fd_read
                mem.setUint16(out_ptr + nevents * 32 + 16, avail, true); // nbytes
                nevents++;
              }
            } catch (e) {
              // onRead might throw if no data — ignore
            }
          }
        }
        // For stdout/stderr writes, always report as ready
        if ((fd === 1 || fd === 2) && type === 2) {
          mem.setBigUint64(
            out_ptr + nevents * 32,
            mem.getBigUint64(sub_ptr, true),
            true,
          );
          mem.setUint8(out_ptr + nevents * 32 + 8, 0);
          mem.setUint8(out_ptr + nevents * 32 + 10, 2); // type = fd_write
          mem.setUint16(out_ptr + nevents * 32 + 16, 4096, true); // nbytes
          nevents++;
        }
      }
    }
    mem.setUint32(nevents_ptr, nevents, true);
    return 0; // success
  };

  console.log("Worker: instantiating WASM...");
  WebAssembly.instantiate(wasmBuffer, {
    wasi_snapshot_preview1: wasi.wasiImport,
  })
    .then(function (inst) {
      console.log("Worker: WASM instantiated, starting...");
      wasi.start(inst.instance);
    })
    .catch(function (err) {
      console.error("Worker: WASM error:", err);
    });
}
