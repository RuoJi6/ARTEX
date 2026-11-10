const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(
  path.join(__dirname, "../app/(main)/function/tasks/detail/_tabs/coverage-graph-tab.tsx"),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const flush = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function mount() {
  const effects = [],
    cleanups = [],
    refs = [],
    callbacks = [],
    graphs = [],
    errors = [],
    updates = [];
  // Execute the real component and effect callbacks without a browser/canvas.
  // G6's initialization and teardown events are deliberately delivered before
  // its viewport exists and before destroyed becomes true, matching G6 5.1.
  class Graph extends EventEmitter {
    rendered = false;
    destroyed = false;
    reads = 0;
    fitCalls = 0;
    ready = deferred();
    fit = null;
    zoom = null;
    constructor() {
      super();
      graphs.push(this);
    }
    setData() {
      return undefined;
    }
    render() {
      this.emit("aftertransform");
      return this.ready.promise;
    }
    getPosition() {
      assert.ok(this.rendered && !this.destroyed, "Viewport must exist before reading position");
      this.reads++;
      return [12, 34];
    }
    getZoom() {
      assert.ok(this.rendered && !this.destroyed, "Viewport must exist before reading zoom");
      this.reads++;
      return 1.5;
    }
    fitCenter() {
      this.fitCalls++;
      return this.fit?.promise ?? Promise.resolve();
    }
    translateTo() {
      return Promise.resolve();
    }
    zoomTo() {
      return this.zoom?.promise ?? Promise.resolve();
    }
    focusElement() {
      return Promise.resolve();
    }
    stopLayout() {
      return undefined;
    }
    destroy() {
      assert.equal(this.listenerCount("aftertransform"), 0, "Detach viewport listeners before destroying");
      assert.equal(this.listenerCount("afterresize"), 0, "Detach resize listeners before destroying");
      this.emit("aftertransform");
      this.destroyed = true;
      this.removeAllListeners();
    }
    finishRender() {
      this.rendered = true;
      this.ready.resolve();
    }
  }
  const react = {
    useState: (initial) => [typeof initial === "function" ? initial() : initial, (value) => updates.push(value)],
    useRef: (initial) => {
      // viewModeRef precedes the canvas container ref in GraphInner.
      const ref = { current: refs.length === 1 ? {} : initial };
      refs.push(ref);
      return ref;
    },
    useCallback: (callback) => {
      callbacks.push(callback);
      return callback;
    },
    useMemo: (factory) => factory(),
    useEffect: (effect) => effects.push(effect),
  };
  const ui = (key) => key;
  const exports = {};
  vm.runInNewContext(compiled + "\nexports.GraphInnerForTest = GraphInner;", {
    exports,
    console: { error: (...args) => errors.push(args) },
    URL,
    Map,
    Set,
    require: (id) => {
      if (id === "react") return react;
      if (id === "react/jsx-runtime")
        return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
      if (id === "@antv/g6") return { Graph };
      if (id === "@/i18n/use-ui-translation") return { useUITranslation: () => ({ ui, liveUI: ui }) };
      if (id === "@/lib/api")
        return {
          api: {
            taskCoverageGraph: async () => ({ nodes: [], edges: [] }),
            topologyMappingStatus: async () => ({ running: false }),
          },
        };
      if (id === "@/lib/utils") return { cn: () => "" };
      return {};
    },
  });
  exports.GraphInnerForTest({ taskId: "t-vpn-edge" });
  for (const effect of effects) {
    const cleanup = effect();
    if (cleanup) cleanups.push(cleanup);
  }
  return {
    graphs,
    errors,
    updates,
    // resetView is also the actual callback used by the reset/mode buttons.
    resetView: callbacks[2],
    unmount: () => {
      for (const cleanup of cleanups.toReversed()) cleanup();
    },
  };
}

test("coverage viewport ignores G6 initialization events and synchronizes after rendering", async () => {
  const screen = mount();
  await flush();
  const graph = screen.graphs[0];
  assert.ok(graph);
  assert.equal(graph.reads, 0);
  assert.doesNotThrow(() => graph.emit("afterresize"));
  assert.equal(graph.reads, 0);
  await screen.resetView();
  assert.equal(graph.fitCalls, 0);
  graph.finishRender();
  await flush();
  assert.ok(graph.reads > 0);
  assert.ok(screen.updates.some((value) => value?.zoom === 1.5));
  const before = graph.reads;
  graph.emit("aftertransform");
  graph.emit("afterresize");
  assert.equal(graph.reads, before + 4);
  screen.unmount();
  assert.deepEqual(screen.errors, []);
});

test("leaving coverage before its first render prevents late viewport operations", async () => {
  const screen = mount();
  await flush();
  const graph = screen.graphs[0];
  const staleEvent = graph.listeners("aftertransform")[0];
  screen.unmount();
  assert.doesNotThrow(() => staleEvent());
  graph.finishRender();
  await flush();
  assert.equal(graph.fitCalls, 0);
  assert.equal(graph.reads, 0);
  assert.deepEqual(screen.errors, []);
});

test("leaving coverage while G6 loads does not create a detached graph", async () => {
  const screen = mount();
  screen.unmount();
  await flush();
  assert.equal(screen.graphs.length, 0);
  assert.deepEqual(screen.errors, []);
});

test("leaving coverage during centering or reset cancels their remaining operations", async () => {
  const screen = mount();
  await flush();
  const graph = screen.graphs[0];
  graph.fit = deferred();
  graph.finishRender();
  await flush();
  assert.equal(graph.fitCalls, 1);
  graph.zoom = deferred();
  const reset = screen.resetView();
  screen.unmount();
  graph.fit.resolve();
  graph.zoom.resolve();
  await reset;
  await flush();
  assert.equal(graph.fitCalls, 1);
  assert.equal(graph.reads, 0);
  assert.deepEqual(screen.errors, []);
});
