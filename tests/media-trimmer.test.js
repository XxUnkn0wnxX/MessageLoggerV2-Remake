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

function discordSnowflakeForTimestamp(timestampMs) {
  return String((BigInt(timestampMs) - 1420070400000n) << 22n);
}

async function withTempRoot(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mlv2-trim-'));
  try {
    return await callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(`${root}_PreCache`, { recursive: true, force: true });
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
    preCacheMaxSizeGb: 1.5,
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

test('media trim interval normalization keeps only whole values from 5 through the timer maximum', () => {
  const plugin = createPlugin();
  const maxInterval = Math.floor(0x7fffffff / 60000);
  const cases = [
    [0, 15],
    [4, 15],
    [4.5, 15],
    ['', 15],
    [maxInterval + 1, 15],
    [5, 5]
  ];

  for (const [raw, expected] of cases) {
    const settings = {
      liveCacheMaxAgeHours: 0,
      liveCacheMaxSizeGb: 0,
      preCacheMaxAgeHours: 0,
      preCacheMaxSizeGb: 0,
      mediaCacheTrimIntervalMinutes: raw
    };
    const changed = plugin.normalizeMediaCacheTrimSettings(settings);
    assert.equal(settings.mediaCacheTrimIntervalMinutes, expected, `interval ${String(raw)}`);
    assert.equal(changed, raw !== expected, `changed state for interval ${String(raw)}`);
  }
});

test('media trim limiter mask keeps each age and size dimension independent', () => {
  const cases = [
    {
      name: 'live age unlimited leaves live size active',
      settings: { liveCacheMaxAgeHours: 0, liveCacheMaxSizeGb: 1, preCacheMaxAgeHours: 0, preCacheMaxSizeGb: 0 },
      active: ['liveCacheMaxSizeGb']
    },
    {
      name: 'live size unlimited leaves live age active',
      settings: { liveCacheMaxAgeHours: 1, liveCacheMaxSizeGb: 0, preCacheMaxAgeHours: 0, preCacheMaxSizeGb: 0 },
      active: ['liveCacheMaxAgeHours']
    },
    {
      name: 'pre age unlimited leaves pre size active',
      settings: { liveCacheMaxAgeHours: 0, liveCacheMaxSizeGb: 0, preCacheMaxAgeHours: 0, preCacheMaxSizeGb: 1 },
      active: ['preCacheMaxSizeGb']
    },
    {
      name: 'pre size unlimited leaves pre age active',
      settings: { liveCacheMaxAgeHours: 0, liveCacheMaxSizeGb: 0, preCacheMaxAgeHours: 1, preCacheMaxSizeGb: 0 },
      active: ['preCacheMaxAgeHours']
    },
    {
      name: 'both age limits unlimited leaves both size limits active',
      settings: { liveCacheMaxAgeHours: 0, liveCacheMaxSizeGb: 1, preCacheMaxAgeHours: 0, preCacheMaxSizeGb: 1 },
      active: ['liveCacheMaxSizeGb', 'preCacheMaxSizeGb']
    }
  ];

  for (const { name, settings, active } of cases) {
    const plugin = createPlugin({ settings });
    const expected = active.reduce(
      (mask, settingId) => mask | plugin._mediaCacheTrimLimitBit(settingId),
      0
    );
    assert.equal(plugin.getMediaCacheTrimLimiterMask(), expected, name);
  }
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

test('live age uses an old source-message snowflake even when the file mtime is fresh', async () => {
  await withTempRoot(async root => {
    const now = Date.now();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    const sourceMessageId = discordSnowflakeForTimestamp(now - 15 * 24 * 60 * 60 * 1000);
    const filePath = path.join(root, `attachment (${sourceMessageId}).png`);
    writeSizedFile(filePath, 4, now);
    const plugin = createTrimPlugin(root, {
      settings: { liveCacheMaxAgeHours: twoWeeks / (60 * 60 * 1000) }
    });

    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();

    assert.equal(fs.existsSync(filePath), false);
  });
});

test('live size ordering uses source-message snowflake time before file mtime', async () => {
  await withTempRoot(async root => {
    const now = Date.now();
    const gb = 1024 ** 3;
    const oldSourceMessageId = discordSnowflakeForTimestamp(now - 2 * 24 * 60 * 60 * 1000);
    const newSourceMessageId = discordSnowflakeForTimestamp(now - 24 * 60 * 60 * 1000);
    const oldPath = path.join(root, `old-file (${oldSourceMessageId}).bin`);
    const newPath = path.join(root, `new-file (${newSourceMessageId}).bin`);
    writeSizedFile(oldPath, Math.floor(gb * 0.6), now);
    writeSizedFile(newPath, Math.floor(gb * 0.6), now - 60 * 60 * 1000);
    const plugin = createTrimPlugin(root, {
      settings: { liveCacheMaxSizeGb: 1 }
    });

    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();

    assert.equal(fs.existsSync(oldPath), false);
    assert.equal(fs.existsSync(newPath), true);
  });
});

test('live size ordering falls back to mtime for invalid and missing source IDs', async () => {
  await withTempRoot(async root => {
    const now = Date.now();
    const gb = 1024 ** 3;
    const mtimeOld = now - 2 * 60 * 60 * 1000;
    const mtimeNew = now - 60 * 60 * 1000;
    const oldByMtimePath = path.join(root, 'newest-by-name (not-a-snowflake).bin');
    const newByMtimePath = path.join(root, 'oldest-by-name.bin');
    writeSizedFile(oldByMtimePath, Math.floor(gb * 0.6), mtimeOld);
    writeSizedFile(newByMtimePath, Math.floor(gb * 0.6), mtimeNew);
    const plugin = createTrimPlugin(root, {
      settings: { liveCacheMaxSizeGb: 1 }
    });

    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();

    assert.equal(fs.existsSync(oldByMtimePath), false);
    assert.equal(fs.existsSync(newByMtimePath), true);
  });
});

test('invalid or missing live source IDs fall back to file mtime for age trimming', async () => {
  await withTempRoot(async root => {
    const now = Date.now();
    const invalidPath = path.join(root, 'invalid (not-a-snowflake).png');
    const missingPath = path.join(root, 'missing-source-id.png');
    writeSizedFile(invalidPath, 4, now - 2 * 60 * 60 * 1000);
    writeSizedFile(missingPath, 4, now);
    const plugin = createTrimPlugin(root, {
      settings: { liveCacheMaxAgeHours: 1 }
    });

    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();

    assert.equal(fs.existsSync(invalidPath), false);
    assert.equal(fs.existsSync(missingPath), true);
  });
});

test('short numeric filename tokens are not treated as Discord snowflakes', async () => {
  await withTempRoot(async root => {
    const filePath = path.join(root, 'unrelated (14694400).png');
    writeSizedFile(filePath, 4, Date.now());
    const plugin = createTrimPlugin(root, {
      settings: { liveCacheMaxAgeHours: 1 }
    });

    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();

    assert.equal(fs.existsSync(filePath), true);
  });
});

test('pre-cache age remains mtime-only when filenames include source-message snowflakes', async () => {
  await withTempRoot(async root => {
    const now = Date.now();
    const preRoot = `${root}_PreCache`;
    const oldSourceMessageId = discordSnowflakeForTimestamp(now - 15 * 24 * 60 * 60 * 1000);
    const newSourceMessageId = discordSnowflakeForTimestamp(now - 60 * 60 * 1000);
    const freshMtimePath = path.join(preRoot, `fresh-mtime (${oldSourceMessageId}).bin`);
    const oldMtimePath = path.join(preRoot, `old-mtime (${newSourceMessageId}).bin`);
    writeSizedFile(freshMtimePath, 4, now);
    writeSizedFile(oldMtimePath, 4, now - 2 * 60 * 60 * 1000);
    const plugin = createTrimPlugin(root, {
      settings: { preCacheMaxAgeHours: 1 }
    });

    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();

    assert.equal(fs.existsSync(freshMtimePath), true);
    assert.equal(fs.existsSync(oldMtimePath), false);
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

test('decimal GB caps use SI bytes and round the live 95% target', async () => {
  await withTempRoot(async root => {
    const now = Date.now();
    const oldFile = path.join(root, 'old (300).bin');
    const newFile = path.join(root, 'new (301).bin');
    writeSizedFile(oldFile, 1_000_000, now - 2 * 60 * 60 * 1000);
    writeSizedFile(newFile, 9_500_000, now);
    const plugin = createTrimPlugin(root, {
      settings: { liveCacheMaxSizeGb: 0.01 }
    });

    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();

    // 0.01 SI GB = 10,000,000 bytes and the rounded live target is 9,500,000.
    assert.equal(fs.existsSync(oldFile), false);
    assert.equal(fs.existsSync(newFile), true);
  });
});

test('size deletion debug reasons report decimal megabytes with the cap in GB', async () => {
  await withTempRoot(async root => {
    const now = Date.now();
    const smallFile = path.join(root, 'small (14694400).bin');
    const largeFile = path.join(root, 'large (14694401).bin');
    writeSizedFile(smallFile, 7 * 1024 ** 2, now - 2 * 60 * 60 * 1000);
    writeSizedFile(largeFile, 16 * 1024 ** 3, now);
    const plugin = createTrimPlugin(root, {
      settings: {
        liveCacheMaxSizeGb: 15,
        debugLogging: true
      }
    });

    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();

    const debugMessages = styledConsoleMessages('DEBUG · TRIM');
    assert.ok(debugMessages.some(message => message.includes('size 7.3MB over 15GB')));
    assert.equal(debugMessages.some(message => message.includes('size 0.007GB over 15GB')), false);
  });
});

test('interval changes reset the countdown without starting a trim and debounce coalesces limit edits', async () => {
  await withTempRoot(async root => {
    const plugin = createTrimPlugin(root, {
      settings: {
        mediaCacheTrimIntervalMinutes: 5,
        showMediaCacheTrimLifecycleToasts: true
      }
    });
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
    assert.ok(plugin.notifications.some(item => item.message === 'Cache limit trim scheduled in 20 seconds.'));
    plugin.handleMediaCacheTrimLimitChange('preCacheMaxAgeHours', 1);
    assert.ok(plugin.notifications.some(item => item.message === 'Cache limit trim rescheduled in 20 seconds.'));
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.ok(plugin.notifications.some(item => item.message === 'Cache limit delay ended. Starting trim.'));
    assert.equal(passes, 1);
    plugin.stopMediaCacheTrimmer();
  });
});

test('startup trimmer delay reuses the periodic timeout slot and stop cancels it', t => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const scheduled = [];
  t.after(() => {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cleared: false };
    scheduled.push(timer);
    return timer;
  };
  global.clearTimeout = timer => {
    if (timer) timer.cleared = true;
  };

  let periodicSchedules = 0;
  const plugin = createPlugin({
    __started: true,
    settings: { cacheAllImages: true },
    _scheduleMediaCacheTrimPeriodic() {
      periodicSchedules++;
      return true;
    }
  });

  assert.equal(plugin.startMediaCacheTrimmer(800), true);
  assert.equal(scheduled.length, 1);
  const startupTimer = scheduled[0];
  assert.equal(startupTimer.delay, 800);
  assert.strictEqual(plugin._mediaCacheTrimPeriodicTimeout, startupTimer);
  assert.equal(periodicSchedules, 0);

  plugin.stopMediaCacheTrimmer();
  assert.equal(startupTimer.cleared, true);
  assert.equal(plugin._mediaCacheTrimPeriodicTimeout, 0);
  startupTimer.callback();
  assert.equal(periodicSchedules, 0);
});

test('trimmer toast master gates schedule notifications while preserving console logs', () => {
  const nativeNotifications = [];
  const plugin = createPlugin({
    __started: true,
    _notificationRouterReady: true,
    settings: {
      cacheAllImages: true,
      useNotificationsInstead: true,
      mediaCacheTrimIntervalMinutes: 5,
      showMediaCacheTrimLifecycleToasts: true
    },
    _enqueueNativeNotification(notification) {
      nativeNotifications.push(notification);
    }
  });

  assert.equal(plugin._scheduleMediaCacheTrimPeriodic(), true);
  assert.equal(nativeNotifications.length, 1);
  assert.equal(nativeNotifications[0].content, 'Shared cache trim timer scheduled for 5 minutes.');
  assert.equal(nativeNotifications[0].replaceKey, 'media-cache-trim:timer');
  assert.equal(nativeNotifications[0].pauseOnHover, false);
  assert.equal(nativeNotifications[0].instantDismiss, true);

  styledConsoleEvents.length = 0;
  plugin.settings.showMediaCacheTrimLifecycleToasts = false;
  assert.equal(plugin._scheduleMediaCacheTrimPeriodic(), true);
  assert.equal(nativeNotifications.length, 1);
  assert.ok(styledConsoleMessages('TIMER').includes('Shared cache trim timer scheduled for 5 minutes.'));
  plugin.stopMediaCacheTrimmer();
});

test('limit warning toast is gated, replaceable, and skipped for same-value or interval changes', async () => {
  await withTempRoot(async root => {
    const warningMessage = 'Cache limits changed. If the first catch-up trim has to process a large cache, Discord may briefly become unresponsive.';
    const warningKey = 'media-cache-trim:limit-warning';
    const plugin = createTrimPlugin(root, {
      settings: {
        preCacheMaxAgeHours: 24,
        showMediaCacheTrimLifecycleToasts: true
      }
    });
    plugin.settings.preCacheMaxAgeHours = 12;
    assert.equal(plugin.handleMediaCacheTrimLimitChange('preCacheMaxAgeHours', 12, 24), true);
    const warningNotifications = plugin.notifications.filter(item => item.options?.replaceKey === warningKey);
    assert.equal(warningNotifications.length, 1);
    assert.deepEqual(warningNotifications[0], {
      message: warningMessage,
      options: {
        title: 'Message Logger Media Cache',
        type: 'warning',
        timeout: 8000,
        replaceKey: warningKey
      }
    });

    const notificationCount = plugin.notifications.length;
    let clearCalls = 0;
    let logCalls = 0;
    let scheduleCalls = 0;
    const originalClear = plugin._mediaCacheTrimClearPeriodicTimeout;
    const originalNotify = plugin._mediaCacheTrimNotify;
    const originalDebug = plugin._mediaCacheTrimDebug;
    const originalSchedule = plugin._scheduleMediaCacheTrimDebounce;
    plugin._mediaCacheTrimClearPeriodicTimeout = () => { clearCalls++; };
    plugin._mediaCacheTrimNotify = () => { logCalls++; };
    plugin._mediaCacheTrimDebug = () => { logCalls++; };
    plugin._scheduleMediaCacheTrimDebounce = () => { scheduleCalls++; };
    try {
      assert.equal(plugin.handleMediaCacheTrimLimitChange('preCacheMaxAgeHours', 12, 12), false);
    } finally {
      plugin._mediaCacheTrimClearPeriodicTimeout = originalClear;
      plugin._mediaCacheTrimNotify = originalNotify;
      plugin._mediaCacheTrimDebug = originalDebug;
      plugin._scheduleMediaCacheTrimDebounce = originalSchedule;
    }
    assert.equal(clearCalls, 0);
    assert.equal(logCalls, 0);
    assert.equal(scheduleCalls, 0);
    assert.equal(plugin.notifications.length, notificationCount);

    plugin.notifications.length = 0;
    plugin.handleMediaCacheTrimIntervalChange(15);
    assert.equal(plugin.notifications.some(item => item.options?.replaceKey === warningKey), false);

    plugin.notifications.length = 0;
    styledConsoleEvents.length = 0;
    plugin.settings.showMediaCacheTrimLifecycleToasts = false;
    plugin._mediaCacheTrimClearDebounceTimeout();
    plugin.settings.preCacheMaxAgeHours = 13;
    assert.equal(plugin.handleMediaCacheTrimLimitChange('preCacheMaxAgeHours', 13, 12), true);
    assert.deepEqual(plugin.notifications, []);
    assert.ok(styledConsoleMessages('TRIM').includes('Pre-cache age limit changed to 13 hours.'));
    assert.ok(styledConsoleMessages('TIMER').includes('Cache limit trim scheduled in 20 seconds.'));
    plugin.stopMediaCacheTrimmer();
  });
});

test('trimmer toast master gates error alerts while preserving console errors', async () => {
  await withTempRoot(async root => {
    for (const enabled of [false, true]) {
      const plugin = createTrimPlugin(root, {
        settings: {
          liveCacheMaxAgeHours: 1,
          showMediaCacheTrimLifecycleToasts: enabled
        },
        async _runMediaCacheTrimPass() {
          return {
            files: 0,
            deleted: 0,
            errors: [{ root: 'live', error: new Error('trim failure') }]
          };
        }
      });
      await plugin.runMediaCacheTrimNow();
      assert.equal(
        plugin.notifications.some(item => item.options?.replaceKey === 'media-cache-trim:error'),
        enabled
      );
      assert.ok(loggerEvents.some(event =>
        event[0] === 'error' && String(event[1]).includes('Media cache trim pass encountered unexpected errors.')
      ));
      plugin.stopMediaCacheTrimmer();
    }
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
    let resolveFirstPass;
    let resolveFirstPassStarted;
    let resolveSecondPassStarted;
    const firstPassStarted = new Promise(resolve => { resolveFirstPassStarted = resolve; });
    const secondPassStarted = new Promise(resolve => { resolveSecondPassStarted = resolve; });
    const firstPassGate = new Promise(resolve => { resolveFirstPass = resolve; });
    plugin._runMediaCacheTrimPass = async () => {
      passes++;
      if (passes === 1) {
        resolveFirstPassStarted();
        await firstPassGate;
      } else {
        resolveSecondPassStarted();
      }
      return { files: 0, deleted: 0, errors: [] };
    };
    const first = plugin.runMediaCacheTrimNow();
    await firstPassStarted;
    plugin.handleMediaCacheTrimLimitChange('preCacheMaxAgeHours', 1);
    resolveFirstPass();
    await first;
    assert.equal(passes, 1);
    assert.ok(plugin._mediaCacheTrimDebounceTimeout, 'the limit debounce must still be pending when the first pass ends');
    await secondPassStarted;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(passes, 2);
    plugin.stopMediaCacheTrimmer();
  });
});

test('immediate media trim requests share one pending in-flight pass', async () => {
  await withTempRoot(async root => {
    const plugin = createTrimPlugin(root, {
      settings: { liveCacheMaxAgeHours: 1 }
    });
    let passCalls = 0;
    let resolvePass;
    const pendingPass = new Promise(resolve => {
      resolvePass = resolve;
    });
    plugin._runMediaCacheTrimPass = async () => {
      passCalls++;
      return pendingPass;
    };

    try {
      const first = plugin.runMediaCacheTrimNow();
      const second = plugin.runMediaCacheTrimNow();
      assert.equal(passCalls, 1);
      assert.strictEqual(second, first);

      let completed = false;
      const completion = first.finally(() => {
        completed = true;
      });
      await Promise.resolve();
      assert.equal(completed, false);

      resolvePass({ files: 0, deleted: 0, errors: [] });
      await completion;
      assert.equal(passCalls, 1);
    } finally {
      plugin.stopMediaCacheTrimmer();
    }
  });
});

test('manual trim requests queue uncovered limiter bits behind an active narrow pass', async () => {
  await withTempRoot(async root => {
    const plugin = createTrimPlugin(root, {
      settings: {
        liveCacheMaxAgeHours: 1,
        preCacheMaxAgeHours: 1
      }
    });
    const liveBit = plugin._mediaCacheTrimLimitBit('liveCacheMaxAgeHours');
    const preBit = plugin._mediaCacheTrimLimitBit('preCacheMaxAgeHours');
    const passMasks = [];
    let resolveFirst;
    let resolveFollowUp;
    plugin._runMediaCacheTrimPass = async mask => {
      passMasks.push(mask);
      if (passMasks.length === 1) {
        await new Promise(resolve => { resolveFirst = resolve; });
      } else if (passMasks.length === 2) {
        await new Promise(resolve => { resolveFollowUp = resolve; });
      }
      return { files: 0, deleted: 0, errors: [] };
    };

    try {
      const first = plugin.runMediaCacheTrimNow(liveBit);
      const followUpRequest = plugin.runMediaCacheTrimNow(preBit);
      assert.strictEqual(followUpRequest, first);
      assert.deepEqual(passMasks, [liveBit]);

      resolveFirst();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(passMasks, [liveBit, preBit]);

      resolveFollowUp();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(passMasks, [liveBit, preBit]);
    } finally {
      plugin.stopMediaCacheTrimmer();
    }
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
    assert.ok(styledConsoleMessages('TRIM').some(message => message === 'Live cache age phase started.'));
    assert.ok(styledConsoleMessages('TRIM').some(message => message === 'Live cache age phase ended.'));
    assert.equal(
      plugin.notifications.some(item => /phase(?:s)? (?:started|ended)\.$/i.test(item.message)),
      false
    );
  });
});

test('message-only non-empty directory cleanup races are benign while real errors reject', async () => {
  await withTempRoot(async root => {
    const directory = path.join(root, 'nested');
    fs.mkdirSync(directory, { recursive: true });
    const messageOnlyBridgeFs = {
      ...fs,
      rmdirSync() {
        throw new Error('rmdir failed: ENOTEMPTY');
      }
    };
    const plugin = createTrimPlugin(root, {
      nodeModules: { fs: messageOnlyBridgeFs, path }
    });
    await assert.doesNotReject(() => plugin._removeEmptyMediaCacheTrimDirectories(
      root,
      [root, directory],
      plugin._mediaCacheTrimStopGeneration,
      { count: 0 }
    ));

    const realErrorBridgeFs = {
      ...fs,
      rmdirSync() {
        const error = new Error('rmdir failed: EACCES');
        error.code = 'EACCES';
        throw error;
      }
    };
    const realErrorPlugin = createTrimPlugin(root, {
      nodeModules: { fs: realErrorBridgeFs, path }
    });
    await assert.rejects(
      () => realErrorPlugin._removeEmptyMediaCacheTrimDirectories(
        root,
        [root, directory],
        realErrorPlugin._mediaCacheTrimStopGeneration,
        { count: 0 }
      ),
      /EACCES/
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
    assert.ok(rendererTicks.some(delay => delay === 4), 'trimmer yields must use the 4ms responsiveness delay');
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

test('lifecycle toasts combine age and size while preserving individual console phases', async () => {
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
    assert.deepEqual(
      plugin.notifications.map(item => item.message),
      ['Live cache age + GB size phases started.', 'Live cache age + GB size phases ended.']
    );
    assert.ok(styledConsoleMessages('TRIM').includes('Live cache age phase started.'));
    assert.ok(styledConsoleMessages('TRIM').includes('Live cache age phase ended.'));
    assert.ok(styledConsoleMessages('TRIM').includes('Live cache GB size phase started.'));
    assert.ok(styledConsoleMessages('TRIM').includes('Live cache GB size phase ended.'));
    assert.equal(plugin.notifications.some(item => /deleted .*old \(500\)/i.test(item.message)), false);
    assert.ok(styledConsoleMessages('DEBUG · TRIM').some(message => message.includes('old (500).png')));
  });
});

test('pre-cache lifecycle toasts use the combined root label', async () => {
  await withTempRoot(async root => {
    const preRoot = `${root}_PreCache`;
    writeSizedFile(path.join(preRoot, 'old (501).png'), 4, Date.now() - 2 * 60 * 60 * 1000);
    const plugin = createTrimPlugin(root, {
      settings: {
        preCacheMaxAgeHours: 1,
        preCacheMaxSizeGb: 1,
        showMediaCacheTrimLifecycleToasts: true
      }
    });
    await plugin.runMediaCacheTrimNow();
    plugin.stopMediaCacheTrimmer();
    assert.deepEqual(
      plugin.notifications.map(item => item.message),
      ['Pre-cache age + GB size phases started.', 'Pre-cache age + GB size phases ended.']
    );
    assert.ok(styledConsoleMessages('TRIM').includes('Pre-cache age phase started.'));
    assert.ok(styledConsoleMessages('TRIM').includes('Pre-cache age phase ended.'));
    assert.ok(styledConsoleMessages('TRIM').includes('Pre-cache GB size phase started.'));
    assert.ok(styledConsoleMessages('TRIM').includes('Pre-cache GB size phase ended.'));
  });
});

test('lifecycle toasts stay individual for age-only and size-only roots and are absent when disabled', async () => {
  await withTempRoot(async root => {
    const cases = [
      {
        name: 'age-only',
        settings: { liveCacheMaxAgeHours: 1 },
        notifications: ['Live cache age phase started.', 'Live cache age phase ended.'],
        consolePhases: ['Live cache age phase started.', 'Live cache age phase ended.']
      },
      {
        name: 'size-only',
        settings: { liveCacheMaxSizeGb: 1 },
        notifications: ['Live cache GB size phase started.', 'Live cache GB size phase ended.'],
        consolePhases: ['Live cache GB size phase started.', 'Live cache GB size phase ended.']
      },
      {
        name: 'disabled',
        settings: {},
        notifications: [],
        consolePhases: []
      }
    ];
    for (const scenario of cases) {
      styledConsoleEvents.length = 0;
      const plugin = createTrimPlugin(root, {
        settings: {
          ...scenario.settings,
          showMediaCacheTrimLifecycleToasts: true
        }
      });
      await plugin.runMediaCacheTrimNow();
      plugin.stopMediaCacheTrimmer();
      const lifecycleNotifications = plugin.notifications
        .map(item => item.message)
        .filter(message => /phase(?:s)? (?:started|ended)\.$/i.test(message));
      assert.deepEqual(lifecycleNotifications, scenario.notifications, scenario.name);
      for (const message of scenario.consolePhases) {
        assert.ok(styledConsoleMessages('TRIM').includes(message), `${scenario.name}: missing console phase ${message}`);
      }
    }
  });
});
