self.postMessage({ type: "status", message: "worker entry loaded" });

setTimeout(function () {
  try {
    self.postMessage({ type: "status", message: "import worker.js" });
    importScripts("./worker.js");
    self.postMessage({ type: "status", message: "imported worker.js" });
  } catch (error) {
    self.postMessage({
      type: "error",
      message: error && error.stack ? error.stack : String(error),
    });
  }
}, 0);
