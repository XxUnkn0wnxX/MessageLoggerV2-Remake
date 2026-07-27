const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createPlugin, loggerEvents, resetHarness } = require('./helpers/plugin-harness');

test.beforeEach(resetHarness);

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
      promises: {
        ...fs.promises,
        unlink: async filePath => {
          unlinkCalls.push(filePath);
          const error = new Error('ENOENT');
          error.code = 'ENOENT';
          throw error;
        }
      }
    };
    const plugin = createTrimPlugin(root, {
      settings: { liveCacheMaxSizeGb: 1 },
      nodeModules: { fs: fakeFs, path },
      _walkMediaCacheTrimRoot: async () => ({
        files: [
          { path: path.join(root, 'gone (600).bin'), name: 'gone (600).bin', size: Math.floor(gb * 0.6), mtimeMs: 1 },
          { path: path.join(root, 'new (601).bin'), name: 'new (601).bin', size: Math.floor(gb * 0.6), mtimeMs: 2 }
        ],
        directories: []
      })
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

test('lifecycle toasts replace timer/debounce entries and debug deletion has no deletion toast', async () => {
  await withTempRoot(async root => {
    const oldFile = path.join(root, 'old (500).png');
    writeSizedFile(oldFile, 4, Date.now() - 2 * 60 * 60 * 1000);
    const plugin = createTrimPlugin(root, {
      settings: { liveCacheMaxAgeHours: 1, liveCacheMaxSizeGb: 1, debugLogging: true }
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
    assert.ok(loggerEvents.some(([, message]) => typeof message === 'string' && message.includes('old (500).png')));
  });
});
