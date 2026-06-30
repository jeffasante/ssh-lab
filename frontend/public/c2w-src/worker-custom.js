// Worker for container2wasm — fetches a single WASM URL and runs it
importScripts("./workerTools.js");
importScripts("./wasi/index.js");
importScripts("./wasi/wasi_defs.js");
importScripts("./wasi/wasi-util.js");

var imagename = "";

function serveIfInitMsg(msg) {
  if (msg.data && msg.data.type === "init") {
    if (msg.data.imagename) imagename = msg.data.imagename;
    return true;
  }
  return false;
}

onmessage = function (msg) {
  if (serveIfInitMsg(msg)) return;
  var ttyClient = new TtyClient(msg.data);
  fetch(imagename, { credentials: "same-origin" })
    .then(function (resp) {
      return resp["arrayBuffer"]();
    })
    .then(function (wasm) {
      startWasi(wasm, ttyClient);
    });
};

function startWasi(wasm, ttyClient) {
  var args = ["arg0"];
  var env = [];
  var fds = [undefined, undefined, undefined];
  var wasi = new WASI(args, env, fds);
  wasiHack(wasi, ttyClient);
  WebAssembly.instantiate(wasm, {
    wasi_snapshot_preview1: wasi.wasiImport,
  }).then(function (inst) {
    wasi.start(inst.instance);
  });
}

function wasiHack(wasi, ttyClient) {
  var _fd_read = wasi.wasiImport.fd_read;
  wasi.wasiImport.fd_read = function (fd, iovs_ptr, iovs_len, nread_ptr) {
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
  wasi.wasiImport.fd_write = function (fd, iovs_ptr, iovs_len, nwritten_ptr) {
    if (fd == 1 || fd == 2) {
      var buffer = new DataView(wasi.inst.exports.memory.buffer);
      var buffer8 = new Uint8Array(wasi.inst.exports.memory.buffer);
      var iovecs = Ciovec.read_bytes_array(buffer, iovs_ptr, iovs_len);
      var wtotal = 0;
      for (var i = 0; i < iovecs.length; i++) {
        var iovec = iovecs[i];
        var buf = buffer8.slice(iovec.buf, iovec.buf + iovec.buf_len);
        if (buf.length == 0) continue;
        ttyClient.onWrite(Array.from(buf));
        wtotal += buf.length;
      }
      buffer.setUint32(nwritten_ptr, wtotal, true);
      return 0;
    }
    return _fd_write(fd, iovs_ptr, iovs_len, nwritten_ptr);
  };

  wasi.wasiImport.poll_oneoff = function (
    in_ptr,
    out_ptr,
    nsubscriptions,
    nevents_ptr,
  ) {
    if (nsubscriptions == 0) return 28; // ERRNO_INVAL
    var buffer = new DataView(wasi.inst.exports.memory.buffer);
    var subs = Subscription.read_bytes_array(buffer, in_ptr, nsubscriptions);
    var events = [];
    for (var s = 0; s < subs.length; s++) {
      var sub = subs[s];
      if (sub.u.tag.variant == "fd_read" && sub.u.data.fd == 0) {
        var readable = ttyClient.onWaitForReadable(0.1);
        if (readable) {
          var ev = new Event();
          ev.userdata = sub.userdata;
          ev.error = 0;
          ev.type = new EventType("fd_read");
          events.push(ev);
        }
      } else if (
        sub.u.tag.variant == "fd_write" &&
        (sub.u.data.fd == 1 || sub.u.data.fd == 2)
      ) {
        var ev = new Event();
        ev.userdata = sub.userdata;
        ev.error = 0;
        ev.type = new EventType("fd_write");
        events.push(ev);
      } else if (sub.u.tag.variant == "clock") {
        var ev = new Event();
        ev.userdata = sub.userdata;
        ev.error = 0;
        ev.type = new EventType("clock");
        events.push(ev);
      }
    }
    Event.write_bytes_array(buffer, out_ptr, events);
    buffer.setUint32(nevents_ptr, events.length, true);
    return 0;
  };
}
