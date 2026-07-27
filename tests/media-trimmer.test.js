const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  captureConsoleEvent,
  createPlugin,
  loggerEvents,
  Plugin,
  resetHarness
} = require('./helpers/plugin-harness');

let styledConsoleEvents = [];
let originalConsoleLog;

test.beforeEach(() => {
  resetHarness();
  styledConsoleEvents = [];
  originalConsoleLog = console.log;
  console.log = (...args) => {
    styledConsoleEvents.push(args);
    captureConsoleEvent('log', args);
  };
});

test.afterEach(() => {
  console.log = originalConsoleLog;
});

function styledConsoleMessages(category = null) {
  return styledConsoleEvents.flatMap(args => {
    const format = String(args[0] || '');
    const compound = /^%cMessageLoggerV2%c%c DEBUG %c%c (.+) %c$/.exec(format);
    if (compound) {
      if (category != null && category !== `DEBUG · ${compound[1]}`) return [];
      return [String(args.at(-1))];
    }
    const single = /^%cMessageLoggerV2%c%c (.+) %c$/.exec(format);
    if (!single || (category != null && single[1] !== category)) return [];
    return [String(args.at(-1))];
  });
}

test('styled media lifecycle logs use separated identity and category pills with one-shot fallback', () => {
  const plugin = createPlugin();

  assert.equal(plugin._logStyledConsoleEvent('PROMOTE', 'promoted'), true);
  assert.equal(styledConsoleEvents.length, 1);
  const [format, identityStyle, , categoryStyle, , message] = styledConsoleEvents[0];
  assert.equal(format, '%cMessageLoggerV2%c%c PROMOTE %c');
  assert.match(identityStyle, /background:#f59e0b/);
  assert.match(identityStyle, /color:#000/);
  assert.match(categoryStyle, /background:#5865f2/);
  assert.match(categoryStyle, /color:#f0f0f0/);
  assert.match(categoryStyle, /margin-left:4px/);
  assert.equal(message, 'promoted');

  styledConsoleEvents.length = 0;
  assert.equal(plugin._logStyledConsoleEvent('DEBUG', 'debugged'), true);
  assert.equal(styledConsoleEvents[0][0], '%cMessageLoggerV2%c%c DEBUG %c');
  assert.match(styledConsoleEvents[0][3], /background:#ed4245/);
  assert.match(styledConsoleEvents[0][3], /color:#000/);
  assert.equal(styledConsoleEvents[0].length, 6);
  assert.equal(styledConsoleEvents[0].at(-1), 'debugged');

  styledConsoleEvents.length = 0;
  assert.equal(plugin._logStyledConsoleEvent('DEBUG · TRIM', 'deleted'), true);
  assert.equal(styledConsoleEvents[0][0], '%cMessageLoggerV2%c%c DEBUG %c%c TRIM %c');
  assert.match(styledConsoleEvents[0][3], /background:#ed4245/);
  assert.match(styledConsoleEvents[0][3], /color:#000/);
  assert.match(styledConsoleEvents[0][5], /background:#5865f2/);
  assert.match(styledConsoleEvents[0][5], /color:#f0f0f0/);
  assert.equal(styledConsoleEvents[0].at(-1), 'deleted');

  styledConsoleEvents.length = 0;
  loggerEvents.length = 0;
  console.log = () => { throw new Error('console unavailable'); };
  assert.equal(plugin._logStyledConsoleEvent('PROMOTE', 'fallback'), false);
  assert.deepEqual(loggerEvents, [['log', '[PROMOTE] fallback']]);
});

test('uncategorized logger severities use one orange identity pill and preserve arguments', () => {
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };
  const calls = { log: [], warn: [], error: [] };
  for (const level of Object.keys(calls)) {
    console[level] = (...args) => calls[level].push(args);
  }
  try {
    const detail = { id: 7 };
    Plugin.__logger.log('plain log', detail);
    Plugin.__logger.warn('plain warn', detail);
    Plugin.__logger.error('plain error', detail);
    for (const level of Object.keys(calls)) {
      assert.equal(calls[level][0][0], '%cMessageLoggerV2%c');
      assert.match(calls[level][0][1], /background:#f59e0b/);
      assert.match(calls[level][0][1], /color:#000/);
      assert.equal(calls[level][0][3], `plain ${level}`);
      assert.equal(calls[level][0][4], detail);
    }
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
});

function createTrimPlugin(root, overrides = {}) {
  const notifications = [];
  const { settings: overrideSettings = {}, ...otherOverrides } = overrides;
  const plugin = createPlugin({
    __started: true,
    settings: {
      cacheAllImages: true,
      debugLogging: false,
      imageCacheDir: root,
      newCacheAllImagesPath: '',
      liveCacheMaxAgeHours: 0,
      liveCacheMaxSizeGb: 0,
      preCacheMaxAgeHours: 0,
      preCacheMaxSizeGb: 0,
      mediaCacheTrimIntervalMinutes: 15,
      showMediaCacheTrimLifecycleToasts: false,
      ...overrideSettings
    },
    nodeModules: { fs, path },
    imageCacheServerSimulator: {
      _getBaseCachePath: () => root,
      cleanUp() {}
    },
    notifyUser(message, options) {
      notifications.push({ message, options });
    },
    notifyDataSaveModeTransitionChange() {},
    notifications,
    ...otherOverrides
  });
  return plugin;
}

function writeSizedFile(filePath, size, mtimeMs = Date.now()) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from([0x4d]));
  fs.truncateSync(filePath, size);
  fs.utimesSync(filePath, new Date(mtimeMs), new Date(mtimeMs));
}

async function withTempRoot(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-trim-'));
  try {
    return await callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('normalization keeps explicit blank limits unlimited and repairs interval values', () => {
  const plugin = createPlugin();
  const settings = {
    liveCacheMaxAgeHours: '',
    liveCacheMaxSizeGb: -1,
    preCacheMaxAgeHours: '',
    preCacheMaxSizeGb: 1.5,
    mediaCacheTrimIntervalMinutes: ''
  };
  assert.equal(plugin.normalizeMediaCacheTrimSettings(settings), true);
  assert.deepEqual(settings, {
    liveCacheMaxAgeHours: 0,
    liveCacheMaxSizeGb: 0,
    preCacheMaxAgeHours: 0,
    preCacheMaxSizeGb: 5,
    mediaCacheTrimIntervalMinutes: 15
  });
  assert.equal(plugin.normalizeMediaCacheTrimSettings(settings), false);

  const corrupt = {
    liveCacheMaxAgeHours: null,
    liveCacheMaxSizeGb: true,
    preCacheMaxAgeHours: [],
    preCacheMaxSizeGb: {},
    mediaCacheTrimIntervalMinutes: 15
  };
  assert.equal(plugin.normalizeMediaCacheTrimSettings(corrupt), true);
  assert.deepEqual(corrupt, {
    liveCacheMaxAgeHours: 0,
    liveCacheMaxSizeGb: 0,
    preCacheMaxAgeHours: 24,
    preCacheMaxSizeGb: 5,
    mediaCacheTrimIntervalMinutes: 15
  });
});

test('lifecycle toast setting uses the boolean default-repair path', () => {
  const plugin = createPlugin();
  const settings = { showMediaCacheTrimLifecycleToasts: 'yes' };
  assert.equal(plugin.normalizeSettingsAgainstDefaults(settings, {
    showMediaCacheTrimLifecycleToasts: false
  }), true);
  assert.equal(settings.showMediaCacheTrimLifecycleToasts, false);
  assert.equal(plugin.normalizeSettingsAgainstDefaults({}, {
    showMediaCacheTrimLifecycleToasts: false
  }), true);
});

test('age trimmer deletes old files and leaves newer files while reusing one scan per root', async () => {
  await withTempRoot(async root => {
    const now = Date.now();
    writeSizedFile(path.join(root, 'old (100).png'), 4, now - 3 * 60 * 60 * 1000);
    writeSizedFile(path.join(root, 'new (101).png'), 4, now - 30 * 60 * 1000);
    const preRoot = `${root}_PreCache`;
    writeSizedFile(path.join(preRoot, 'pre-old.png'), 4, now - 3 * 60 * 60 * 1000);
    const plugin = createTrimPlugin(root, {
      settings: {
        imageCacheDir: root,
        liveCacheMaxAgeHours: 1,
        preCacheMaxAgeHours: 1
      }
    });
    let scans = 0;
    const scanRoots = [];
    const originalWalk = plugin._walkMediaCacheTrimRoot.bind(plugin);
    plugin._walkMediaCacheTrimRoot = (...args) => {
      scans++;
      scanRoots.push(args[0]);
      return originalWalk(...args);
    };
    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();
    assert.equal(fs.existsSync(path.join(root, 'old (100).png')), false);
    assert.equal(fs.existsSync(path.join(root, 'new (101).png')), true);
    assert.equal(fs.existsSync(path.join(preRoot, 'pre-old.png')), false);
    assert.equal(scans, 2);
    assert.deepEqual(scanRoots, [preRoot, root]);
  });
});

test('size thresholds use remaining files after age and the 95%/80% targets', async () => {
  await withTempRoot(async root => {
    const now = Date.now();
    const gb = 1024 ** 3;
    writeSizedFile(path.join(root, 'old (200).bin'), Math.floor(gb * 0.5), now - 2 * 60 * 60 * 1000);
    writeSizedFile(path.join(root, 'new (201).bin'), Math.floor(gb * 0.6), now);
    const preRoot = `${root}_PreCache`;
    writeSizedFile(path.join(preRoot, 'pre-old.bin'), Math.floor(gb * 0.9), now - 2 * 60 * 60 * 1000);
    writeSizedFile(path.join(preRoot, 'pre-new.bin'), Math.floor(gb * 0.2), now);
    const plugin = createTrimPlugin(root, {
      settings: {
        liveCacheMaxSizeGb: 1,
        preCacheMaxSizeGb: 1
      }
    });
    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();
    assert.equal(fs.existsSync(path.join(root, 'old (200).bin')), false);
    assert.equal(fs.existsSync(path.join(root, 'new (201).bin')), true);
    assert.equal(fs.existsSync(path.join(preRoot, 'pre-old.bin')), false);
    assert.equal(fs.existsSync(path.join(preRoot, 'pre-new.bin')), true);
  });
});

test('interval changes reset the countdown without starting a trim and debounce coalesces limit edits', async () => {
  await withTempRoot(async root => {
    const plugin = createTrimPlugin(root, { settings: { mediaCacheTrimIntervalMinutes: 5 } });
    plugin._mediaCacheTrimDebounceMs = 10;
    let passes = 0;
    const originalRun = plugin._runMediaCacheTrimPass.bind(plugin);
    plugin._runMediaCacheTrimPass = (...args) => {
      passes++;
      return originalRun(...args);
    };
    plugin.startMediaCacheTrimmer();
    plugin.handleMediaCacheTrimIntervalChange(5);
    assert.equal(passes, 0);
    plugin.settings.preCacheMaxAgeHours = 1;
    plugin.handleMediaCacheTrimLimitChange('preCacheMaxAgeHours', 1);
    plugin.handleMediaCacheTrimLimitChange('preCacheMaxAgeHours', 1);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(passes, 1);
    plugin.stopMediaCacheTrimmer();
  });
});

test('cache off clears future work but lets an active pass finish', async () => {
  await withTempRoot(async root => {
    const oldFile = path.join(root, 'old (300).png');
    writeSizedFile(oldFile, 4, Date.now() - 2 * 60 * 60 * 1000);
    const plugin = createTrimPlugin(root, { settings: { liveCacheMaxAgeHours: 1 } });
    const originalWalk = plugin._walkMediaCacheTrimRoot.bind(plugin);
    plugin._walkMediaCacheTrimRoot = async (...args) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return originalWalk(...args);
    };
    const pass = plugin.runMediaCacheTrimNow();
    plugin.settings.cacheAllImages = false;
    plugin.handleMediaCachingSetting(false);
    await pass;
    assert.equal(fs.existsSync(oldFile), false);
    assert.equal(plugin._mediaCacheTrimPeriodicTimeout, 0);
    assert.equal(plugin._mediaCacheTrimDebounceTimeout, 0);
  });
});

test('stop cancellation prevents a pending walker from deleting files', async () => {
  await withTempRoot(async root => {
    const oldFile = path.join(root, 'old (400).png');
    writeSizedFile(oldFile, 4, Date.now() - 2 * 60 * 60 * 1000);
    const plugin = createTrimPlugin(root, { settings: { liveCacheMaxAgeHours: 1 } });
    plugin._walkMediaCacheTrimRoot = async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return { files: [{ path: oldFile, name: 'old (400).png', size: 4, mtimeMs: Date.now() - 2 * 60 * 60 * 1000 }], directories: [root] };
    };
    const pass = plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();
    await pass;
    assert.equal(fs.existsSync(oldFile), true);
  });
});

test('a running pass waits for a still-pending limit debounce before its merged follow-up', async () => {
  await withTempRoot(async root => {
    const plugin = createTrimPlugin(root, { settings: { preCacheMaxAgeHours: 1 } });
    plugin._mediaCacheTrimDebounceMs = 40;
    let passes = 0;
    plugin._runMediaCacheTrimPass = async () => {
      passes++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return { files: 0, deleted: 0, errors: [] };
    };
    const first = plugin.runMediaCacheTrimNow();
    plugin.handleMediaCacheTrimLimitChange('preCacheMaxAgeHours', 1);
    await first;
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(passes, 1);
    await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(passes, 2);
    plugin.stopMediaCacheTrimmer();
  });
});

test('concurrent ENOENT removes the vanished scan entry without counting a deletion', async () => {
  await withTempRoot(async root => {
    const gb = 1024 ** 3;
    const unlinkCalls = [];
    const fakeFs = {
      ...fs,
      unlinkSync: filePath => {
        unlinkCalls.push(filePath);
        const error = new Error('ENOENT');
        error.code = 'ENOENT';
        throw error;
      }
    };
    const plugin = createTrimPlugin(root, {
      settings: { liveCacheMaxSizeGb: 1 },
      nodeModules: { fs: fakeFs, path },
      _walkMediaCacheTrimRoot: (() => {
        let scans = 0;
        return async () => ({
          files: scans++ === 0
            ? [
                { path: path.join(root, 'gone (600).bin'), name: 'gone (600).bin', size: Math.floor(gb * 0.6), mtimeMs: 1 },
                { path: path.join(root, 'new (601).bin'), name: 'new (601).bin', size: Math.floor(gb * 0.6), mtimeMs: 2 }
              ]
            : [
                { path: path.join(root, 'new (601).bin'), name: 'new (601).bin', size: Math.floor(gb * 0.6), mtimeMs: 2 }
              ],
          directories: []
        });
      })()
    });
    const result = await plugin._trimMediaCacheRoot('live', root, 2, 0);
    assert.equal(result.files, 1);
    assert.equal(result.deleted, 0);
    assert.equal(unlinkCalls.length, 1);
  });
});

test('custom live roots trim only Logger-shaped files, skip symlinks, and remove empty descendants', async () => {
  await withTempRoot(async root => {
    const now = Date.now();
    const keptFile = path.join(root, 'nested', 'notes.txt');
    const trimmedFile = path.join(root, 'nested', 'cached (700).png');
    const emptiedFile = path.join(root, 'empty', 'deep', 'cached (701).png');
    writeSizedFile(keptFile, 4, now - 3 * 60 * 60 * 1000);
    writeSizedFile(trimmedFile, 4, now - 3 * 60 * 60 * 1000);
    writeSizedFile(emptiedFile, 4, now - 3 * 60 * 60 * 1000);
    const symlink = path.join(root, 'linked (702).png');
    fs.symlinkSync(keptFile, symlink);
    const scanRoots = [];
    const plugin = createTrimPlugin(root, {
      settings: {
        imageCacheDir: path.join(root, 'default-cache'),
        liveCacheMaxAgeHours: 1
      },
      deleteCachedFilesForRecord() {
        assert.fail('the trimmer must not enter Logger record-deletion cleanup');
      }
    });
    const originalWalk = plugin._walkMediaCacheTrimRoot.bind(plugin);
    plugin._walkMediaCacheTrimRoot = (...args) => {
      scanRoots.push(args[0]);
      return originalWalk(...args);
    };

    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();

    assert.deepEqual(scanRoots, [root]);
    assert.equal(fs.existsSync(root), true);
    assert.equal(fs.existsSync(trimmedFile), false);
    assert.equal(fs.existsSync(emptiedFile), false);
    assert.equal(fs.existsSync(path.join(root, 'empty')), false);
    assert.equal(fs.existsSync(keptFile), true);
    assert.equal(fs.lstatSync(symlink).isSymbolicLink(), true);
  });
});

test('sync BetterDiscord fs bridge trims cooperatively without fs.promises', async () => {
  await withTempRoot(async root => {
    const now = Date.now();
    const nested = path.join(root, 'nested');
    const empty = path.join(nested, 'empty');
    fs.mkdirSync(empty, { recursive: true });
    for (let index = 0; index < 40; index++) {
      writeSizedFile(
        path.join(nested, `old (${index}).png`),
        4,
        now - 2 * 60 * 60 * 1000
      );
    }
    writeSizedFile(path.join(empty, 'old (999).png'), 4, now - 2 * 60 * 60 * 1000);
    writeSizedFile(path.join(nested, 'keep.txt'), 4, now - 2 * 60 * 60 * 1000);

    const bridgeStatSync = fs.statSync.bind(fs);
    const bridgeFs = {
      readdirSync: fs.readdirSync.bind(fs),
      lstatSync: bridgeStatSync,
      statSync: bridgeStatSync,
      realpathSync: fs.realpathSync.bind(fs),
      unlinkSync: fs.unlinkSync.bind(fs),
      rmdirSync: fs.rmdirSync.bind(fs)
    };
    assert.equal(Object.prototype.hasOwnProperty.call(bridgeFs, 'promises'), false);
    const plugin = createTrimPlugin(root, {
      nodeModules: { fs: bridgeFs, path },
      settings: {
        liveCacheMaxAgeHours: 1,
        preCacheMaxAgeHours: 1,
        imageCacheDir: path.join(root, 'default-cache'),
        showMediaCacheTrimLifecycleToasts: false
      }
    });

    let rendererTicked = false;
    setTimeout(() => { rendererTicked = true; }, 0);
    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();

    assert.equal(rendererTicked, true, 'large synchronous scans must yield to the renderer');
    assert.equal(fs.existsSync(path.join(nested, 'old (0).png')), false);
    assert.equal(fs.existsSync(path.join(empty, 'old (999).png')), false);
    assert.equal(fs.existsSync(empty), false);
    assert.equal(fs.existsSync(path.join(nested, 'keep.txt')), true);
    assert.ok(styledConsoleMessages('TRIM').some(message => message === 'Live cache age trimmer started.'));
    assert.ok(styledConsoleMessages('TRIM').some(message => message === 'Live cache age trimmer ended.'));
    assert.equal(
      plugin.notifications.some(item => /trimmer (?:started|ended)\.$/i.test(item.message)),
      false
    );
  });
});

test('size trimming yields across large snapshots and reaches the live target', async () => {
  await withTempRoot(async root => {
    const fileSize = 30 * 1024 * 1024;
    for (let index = 0; index < 40; index++) {
      writeSizedFile(
        path.join(root, `size (${index}).bin`),
        fileSize,
        Date.now() - (40 - index) * 1000
      );
    }
    const plugin = createTrimPlugin(root, {
      settings: { liveCacheMaxSizeGb: 1, showMediaCacheTrimLifecycleToasts: false }
    });
    const rendererTicks = [];
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = (callback, delay, ...args) => originalSetTimeout(() => {
      rendererTicks.push(delay);
      callback(...args);
    }, delay);
    try {
      await plugin.runMediaCacheTrimNow();
    } finally {
      plugin.stopMediaCacheTrimmer();
      global.setTimeout = originalSetTimeout;
    }

    const remainingBytes = fs.readdirSync(root)
      .filter(name => name.endsWith('.bin'))
      .reduce((sum, name) => sum + fs.statSync(path.join(root, name)).size, 0);
    assert.ok(rendererTicks.length >= 2, 'scan and size work must yield across multiple turns');
    assert.ok(remainingBytes <= 1024 ** 3 * 0.95);
  });
});

test('size verification pass removes a file created during the first reduction', async () => {
  await withTempRoot(async root => {
    const fileSize = 30 * 1024 * 1024;
    for (let index = 0; index < 40; index++) {
      writeSizedFile(
        path.join(root, `size (${index}).bin`),
        fileSize,
        Date.now() - (40 - index) * 1000
      );
    }
    const originalUnlinkSync = fs.unlinkSync.bind(fs);
    let injected = false;
    const bridgeFs = {
      readdirSync: fs.readdirSync.bind(fs),
      lstatSync: fs.lstatSync.bind(fs),
      statSync: fs.statSync.bind(fs),
      realpathSync: fs.realpathSync.bind(fs),
      unlinkSync(filePath) {
        originalUnlinkSync(filePath);
        if (!injected) {
          injected = true;
          writeSizedFile(path.join(root, 'concurrent (999).bin'), fileSize, Date.now() - 60_000);
        }
      },
      rmdirSync: fs.rmdirSync.bind(fs)
    };
    const plugin = createTrimPlugin(root, {
      nodeModules: { fs: bridgeFs, path },
      settings: { liveCacheMaxSizeGb: 1, showMediaCacheTrimLifecycleToasts: false }
    });

    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();

    assert.equal(injected, true);
    assert.equal(fs.existsSync(path.join(root, 'concurrent (999).bin')), false);
    const remainingBytes = fs.readdirSync(root)
      .filter(name => name.endsWith('.bin'))
      .reduce((sum, name) => sum + fs.statSync(path.join(root, name)).size, 0);
    assert.ok(remainingBytes <= 1024 ** 3 * 0.95);
  });
});

test('lifecycle toasts replace timer/debounce entries and debug deletion has no deletion toast', async () => {
  await withTempRoot(async root => {
    const oldFile = path.join(root, 'old (500).png');
    writeSizedFile(oldFile, 4, Date.now() - 2 * 60 * 60 * 1000);
    const plugin = createTrimPlugin(root, {
      settings: {
        liveCacheMaxAgeHours: 1,
        liveCacheMaxSizeGb: 1,
        debugLogging: true,
        showMediaCacheTrimLifecycleToasts: true
      }
    });
    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();
    assert.ok(plugin.notifications.some(item => item.message === 'Live cache age trimmer started.'));
    assert.ok(plugin.notifications.some(item => item.message === 'Live cache age trimmer ended.'));
    const lifecycle = plugin.notifications.map(item => item.message);
    assert.ok(lifecycle.indexOf('Live cache age trimmer started.') < lifecycle.indexOf('Live cache age trimmer ended.'));
    assert.ok(lifecycle.indexOf('Live cache age trimmer ended.') < lifecycle.indexOf('Live cache GB size trimmer started.'));
    assert.ok(lifecycle.indexOf('Live cache GB size trimmer started.') < lifecycle.indexOf('Live cache GB size trimmer ended.'));
    assert.equal(plugin.notifications.some(item => /deleted .*old \(500\)/i.test(item.message)), false);
    assert.ok(styledConsoleMessages('DEBUG · TRIM').some(message => message.includes('old (500).png')));
  });
});
