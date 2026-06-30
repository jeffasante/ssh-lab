// Custom worker for ssh-lab — adapted from container2wasm demo
// Uses local paths instead of demo site paths

importScripts("https://cdn.jsdelivr.net/npm/xterm-pty@0.9.4/workerTools.js");
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
    fetchChunks((wasm) => {
        // Skip networking — just run the container
        startWasi(wasm, ttyClient, args, env, fds, listenfd, 5);
    });
};

function startWasi(wasm, ttyClient, args, env, fds, listenfd, connfd) {
    var wasi = new WASI(args, env, fds);
    wasiHack(wasi, ttyClient, connfd);
    WebAssembly.instantiate(wasm, {
        "wasi_snapshot_preview1": wasi.wasiImport,
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
