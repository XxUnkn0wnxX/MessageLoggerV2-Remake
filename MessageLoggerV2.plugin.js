/**
 * @name MessageLoggerV2
 * @version 2.8.0.2.5
 * @author Lighty, Davilarek, NightBirde
 * @authorId 525522753609138206
 * @description Saves all deleted and purged messages, as well as all edit history and ghost pings. With highly configurable ignore options, and even restoring deleted messages after restarting Discord.
 * @invite e66JbKte2P
 * @source https://git.slowb.ro/NightBirde/MessageLoggerV2-Remake/src/branch/main/MessageLoggerV2.plugin.js
 * @updateUrl https://git.slowb.ro/NightBirde/MessageLoggerV2-Remake/raw/branch/main/MessageLoggerV2.plugin.js
 */
const REPO_MAIN_URL = "https://git.slowb.ro/NightBirde/MessageLoggerV2-Remake/raw/branch/main/";
const DISCORD_EPOCH = 14200704e5;
const { React, ReactDOM, Webpack, UI, Plugins, DOM, Patcher, Components, ContextMenu, Utils, Hooks, ReactUtils, Logger } = new BdApi('MessageLoggerV2');
const { Data } = BdApi;
const { Filters } = Webpack;
const DiscordModules = (() => {
  const cache = {};
  const lazyGet = (key, getter) => ({
    get() {
      if (cache[key] === undefined) {
        try { cache[key] = getter() ?? null; }
        catch (e) { Logger.error(`Failed to load module: ${key}`, e); cache[key] = null; }
      }
      return cache[key];
    },
    enumerable: true, configurable: true
  });
  return Object.defineProperties({}, {
    UserStore: lazyGet('UserStore', () => Webpack.Stores.UserStore),
    MessageStore: lazyGet('MessageStore', () => Webpack.Stores.MessageStore),
    ChannelStore: lazyGet('ChannelStore', () => Webpack.Stores.ChannelStore ?? Webpack.getByKeys('getChannel', 'getDMFromUserId')),
    SelectedChannelStore: lazyGet('SelectedChannelStore', () => Webpack.Stores.SelectedChannelStore),
    GuildStore: lazyGet('GuildStore', () => Webpack.Stores.GuildStore),
    GuildMemberStore: lazyGet('GuildMemberStore', () => Webpack.Stores.GuildMemberStore),
    RelationshipStore: lazyGet('RelationshipStore', () => Webpack.Stores.RelationshipStore ?? Webpack.getByKeys('isBlocked')),
    MessageActions: lazyGet('MessageActions', () => Webpack.getByKeys('sendMessage', 'editMessage', 'deleteMessage')),
    ModalActions: lazyGet('ModalActions', () => Webpack.getByKeys('openModal', 'hasModalOpen')),
    HistoryUtils: lazyGet('HistoryUtils', () => Webpack.getByKeys('getHistory')),
    HttpModule: lazyGet('HttpModule', () => Webpack.getByKeys('get', 'post', 'put', 'delete')),
    Endpoints: lazyGet('Endpoints', () => Webpack.getByKeys('Endpoints', 'ActionTypes')),
    ClickableClasses: lazyGet('ClickableClasses', () => Webpack.getByKeys('clickable')),
    ColorClasses: lazyGet('ColorClasses', () => Webpack.getByKeys('colorDanger', 'colorPremium')),
    ButtonClasses: lazyGet('ButtonClasses', () => Webpack.getByKeys('button', 'colorBrand', 'lookFilled')),
    MessageWrapperClasses: lazyGet('MessageWrapperClasses', () => Webpack.getByKeys('message', 'cozyMessage') || Webpack.getByKeys('message', 'groupStart')),
    ContainerClasses: lazyGet('ContainerClasses', () => Webpack.getByKeys('containerCozyBounded')),
    ChatContentClasses: lazyGet('ChatContentClasses', () => Webpack.getByKeys('chatContent')),
    MarkupClasses: lazyGet('MarkupClasses', () => Webpack.getByKeys('markup')),
    SpoilerClasses: lazyGet('SpoilerClasses', () => Webpack.getByKeys('spoilerText', 'hidden') ?? Webpack.getByKeys('spoilerContent', 'hidden')),
    FocusedClasses: lazyGet('FocusedClasses', () => Webpack.getByKeys('focused')),
    TabBarClasses: lazyGet('TabBarClasses', () => Webpack.getByKeys('tabBar')),
    DefaultColorClasses: lazyGet('DefaultColorClasses', () => Webpack.getByKeys('defaultColor')),
    BotTagClasses: lazyGet('BotTagClasses', () => Webpack.getByKeys('botTag')),
    ExecutedCommandClasses: lazyGet('ExecutedCommandClasses', () => Webpack.getByKeys('executedCommand')),
    TitleClasses: lazyGet('TitleClasses', () => Webpack.getByKeys('title', 'chatContent')),
    ContentClasses: lazyGet('ContentClasses', () => Webpack.getByKeys('content', 'marginCompactIndent')),
    ContainerCompactClasses: lazyGet('ContainerCompactClasses', () => Webpack.getByKeys('container', 'containerCompactBounded')),
    ErrorPageClasses: lazyGet('ErrorPageClasses', () => Webpack.getByKeys('errorPage')),
    TabItemClasses: lazyGet('TabItemClasses', () => Webpack.getModule(Filters.byKeys('item', 'selected', 'topPill'))),
    CUser: lazyGet('CUser', () => Webpack.getModule(Filters.byPrototypeKeys('getAvatarSource', 'isLocalBot'))),
    DiscordUtils: lazyGet('DiscordUtils', () => Webpack.getByKeys('bindAll', 'debounce')),
    TimestampUtils: lazyGet('TimestampUtils', () => Webpack.getByKeys('relativeTimeRounding', 'locales') || Webpack.getByKeys('createFromInputFallback')),
    Parser: lazyGet('Parser', () => Webpack.getByKeys('parse', 'astParserFor')),
    ParserNew: lazyGet('ParserNew', () => Webpack.getByKeys('defaultRules', 'parse')),
    GuildUtils: lazyGet('GuildUtils', () => Webpack.getByKeys('getGuild', 'getGuildCount')),
    MuteModule: lazyGet('MuteModule', () => Webpack.getModule(Filters.byKeys('isChannelMuted'))),
    Dispatcher: lazyGet('Dispatcher', () => Webpack.getStore("UserStore")._dispatcher),
    ChannelMessages: lazyGet('ChannelMessages', () => Webpack.getModule(Filters.byKeys('_channelMessages'))),
    RenderUserPopout: lazyGet('RenderUserPopout', () => Webpack.getByStrings('"SENDING"===', 'renderUserGuildPopout: channel should never be')),
    ChannelListModule: lazyGet('ChannelListModule', () => Webpack.getByKeys('getChannels')),
    ManaModule: lazyGet('ManaModule', () => ({
      Modal: Webpack.getModule(
        Filters.combine(Filters.byStrings('actionBarInput', 'notice'), Filters.not(Filters.byStrings('caretConfig'))),
        { searchExports: true }
      ),
      ConfirmModal: Webpack.getByKeys('ConfirmModal')?.ConfirmModal,
      ModalSize: Webpack.getByKeys('SMALL', 'MEDIUM', 'LARGE', 'DYNAMIC', { searchExports: true }),
    })),
    MessageContentComponent: lazyGet('MessageContentComponent', () => Webpack.getModule(e => e?.type?.toString()?.includes('.isCommandType()') && !e?.type?.toString()?.includes('.isFirstMessageInForumPost'))),
    I18nModule: lazyGet('I18nModule', () => Webpack.getModule(m => Object.values(m).some(x => x != null && Object.getPrototypeOf(x)?.withFormatters != null))),
    TextModule: lazyGet('TextModule', () => Webpack.getBySource('case"always-white"', { searchExports: true })),
    GetSrcModule: lazyGet('GetSrcModule', () => Webpack.getBySource('sourceMetadata:', 'getSrc', { searchExports: true })),
    UserContextMenuModule: lazyGet('UserContextMenuModule', () => Webpack.getBySource('isGroupDM', 'moderationAlertId', { searchExports: true })),
    _cache: { value: cache, writable: false },
    _validateCritical: {
      value: function () {
        const critical = ['UserStore', 'MessageStore', 'ChannelStore', 'SelectedChannelStore', 'MessageActions', 'Dispatcher'];
        return critical.filter(k => !this[k]);
      }
    },
    _invalidate: {
      value: function (key) {
        if (key) delete cache[key];
        else Object.keys(cache).forEach(k => delete cache[k]);
      }
    }
  });
})();
class PopoutManager {
  constructor() {
    this.popouts = new Map();
    this.container = null;
  }
  ensureContainer() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'mlv2-popout-container';
      document.body.appendChild(this.container);
    }
    return this.container;
  }
  showPopout(target, content, options = {}) {
    const {
      position = "right", align = "top"
    } = options;
    const id = Symbol('popout');
    const container = this.ensureContainer();
    const popoutElement = React.createElement(
      PopoutComponent, {
      target,
      position,
      align,
      onClose: () => this.closePopout(id)
    },
      content
    );
    const root = ReactDOM.createRoot(container);
    root.render(popoutElement);
    this.popouts.set(id, {
      root,
      container: container
    });
    return id;
  }
  closePopout(id) {
    const popout = this.popouts.get(id);
    if (!popout) return;
    popout.root.unmount();
    this.popouts.delete(id);
    if (this.popouts.size === 0 && this.container) {
      this.container.remove();
      this.container = null;
    }
  }
  closeAllPopouts() {
    this.popouts.forEach((_, id) => this.closePopout(id));
  }
}
const PopoutComponent = ({
  target,
  position,
  align,
  onClose,
  children
}) => {
  const [popoutStyle, setPopoutStyle] = React.useState({
    position: 'absolute',
    visibility: 'hidden'
  });
  const popoutRef = React.useRef();
  React.useEffect(() => {
    const calculatePosition = () => {
      if (!target || !popoutRef.current) return;
      const targetRect = target.getBoundingClientRect();
      const popoutRect = popoutRef.current.getBoundingClientRect();
      const style = {
        position: 'fixed',
        zIndex: 1002
      };
      switch (position) {
        case 'right':
          style.left = `${targetRect.right + window.scrollX}px`;
          break;
        case 'left':
          style.left = `${targetRect.left - popoutRect.width + window.scrollX}px`;
          break;
        case 'center':
          style.left = `${targetRect.left + (targetRect.width / 2) - (popoutRect.width / 2) + window.scrollX}px`;
          break;
        default:
          style.left = `${targetRect.right + window.scrollX}px`;
      }
      switch (align) {
        case 'top':
          style.top = `${targetRect.top + window.scrollY}px`;
          break;
        case 'bottom':
          style.top = `${targetRect.bottom - popoutRect.height + window.scrollY}px`;
          break;
        case 'center':
        case 'middle':
          style.top = `${targetRect.top + (targetRect.height / 2) - (popoutRect.height / 2) + window.scrollY}px`;
          break;
        default:
          style.top = `${targetRect.top + window.scrollY}px`;
      }
      style.visibility = 'visible';
      setPopoutStyle(style);
    };
    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    window.addEventListener('scroll', calculatePosition);
    return () => {
      window.removeEventListener('resize', calculatePosition);
      window.removeEventListener('scroll', calculatePosition);
    };
  }, [target, position, align]);
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoutRef.current && !popoutRef.current.contains(event.target) &&
        !target.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, target]);
  return React.createElement(
    'div', {
    ref: popoutRef,
    style: popoutStyle,
    className: 'mlv2-popout'
  },
    children
  );
};
module.exports = class MessageLoggerV2 {
  constructor(meta) {
    this.meta = meta;
  }
  getName() {
    return this.meta.name;
  }
  getVersion() {
    return this.meta.version;
  }
  start() {
    if (this.__started) return;
    if (this.updateTimeout) clearTimeout(this.updateTimeout);
    const onLoaded = () => {
      try {
        this.UserStore = DiscordModules.UserStore;
        this.localUser = this.UserStore.getCurrentUser();
        if (!this.UserStore || !this.localUser) {
          setTimeout(onLoaded, 1000);
        } else {
          this.initialize();
        }
      } catch (err) {
        Logger.error('Failed to start!', err);
        this.stop();
        UI.showToast(`[**${this.getName()}**] Failed to start!`, { type: 'error', timeout: 0 });
      }
    };
    this.pluginDir = Plugins.folder || globalThis.ContentManager?.pluginsFolder;
    onLoaded();
  }
  stop() {
    if (!this.__started) return;
    this.__started = false;
    try {
      clearInterval(this.dataManagerInterval);
      clearInterval(this._autoUpdateInterval);
      clearTimeout(this.updateTimeout);
      clearTimeout(this.saveBackupTimeout);
      clearTimeout(this.requestedDataSave);
      if (this.menu?.filterSetTimeout) clearTimeout(this.menu.filterSetTimeout);
      if (this.keydownListener) {
        document.removeEventListener('keydown', this.keydownListener);
      }
      if (this.keyupListener) {
        document.removeEventListener('keyup', this.keyupListener);
      }
      this.removeOpenLogsButton();
      if (this.style?.css) {
        DOM.removeStyle(this.style.css);
      }
      if (this.stringHeldCaptive) {
        DOM.removeStyle(this.stringHeldCaptive);
      }
      if (this.ModalStack?.closeModal && this.style?.menu) {
        this.ModalStack.closeModal(this.style.menu);
      }
      if (typeof this._modalsApiUnsubcribe === 'function') {
        this._modalsApiUnsubcribe();
      }
      if (typeof this._modalsApiUnsubcribe_popoutManager === 'function') {
        this._modalsApiUnsubcribe_popoutManager();
      }
      if (this.tools?.popoutManager?.closeAllPopouts) {
        this.tools.popoutManager.closeAllPopouts();
      }
      const toastsContainer = document.querySelector('.mlv2-toasts');
      if (toastsContainer) toastsContainer.remove();
      const toastStyles = document.querySelector('#mlv2-toast-styles');
      if (toastStyles) toastStyles.remove();
      if (this.imageCacheServerSimulator?.cleanUp) {
        this.imageCacheServerSimulator.cleanUp();
      }
      if (!this.settings?.dontSaveData && this.messageRecord) {
        this.saveData();
      }
      if (this._globalUpdateCallbackMessage && this.dispatcher) {
        this.dispatcher.unsubscribe('MLV2_FORCE_UPDATE_MESSAGE', this._globalUpdateCallbackMessage);
        this._globalUpdateCallbackMessage = null;
      }
      if (this._globalUpdateCallbackContent && this.dispatcher) {
        this.dispatcher.unsubscribe('MLV2_FORCE_UPDATE_MESSAGE_CONTENT', this._globalUpdateCallbackContent);
        this._globalUpdateCallbackContent = null;
      }
      if (this._messageUpdateRegistry) {
        this._messageUpdateRegistry.clear();
      }
      for (const unpatch of this.unpatches) {
        try {
          unpatch();
        } catch (err) {
          Logger.error('Error unpatching:', err);
        }
      }
      this.unpatches = [];
      Logger.log('All patches removed, forcing UI update to clear...');
      this.forceUpdateUI();
      if (this.menu) {
        this.menu.open = false;
        this.menu.deleteKeyDown = false;
      }
    } catch (err) {
      Logger.error('Error during cleanup:', err);
    }
  }
  checkVersionNewer(current, remote) {
    const toNumber = (version) => {
      const parts = version.split('.');
      let result = 0;
      for (let i = 0; i < 5; i++) {
        result = result * 1000 + (Number.parseInt(parts[i]) || 0);
      }
      return result;
    };
    return toNumber(remote) > toNumber(current);
  }
  getVersionFromContent(text) {
    const match = text.match(/@version\s+([\d.]+)/);
    return match ? match[1] : '0.0.0';
  }
  getChanges() {
    return [
      {
        title: 'Fixed',
        type: 'fixed',
        items: [
          'Fixed to match latest Discord structure changes.'       
        ]
      }
    ];
  }
  async checkNewUpdate(showNoUpdateNotice = false) {
    if (this.alreadyTestedForUpdate) return;
    this.alreadyTestedForUpdate = true;
    try {
      const updateUrl = `${REPO_MAIN_URL}${this.getName()}.plugin.js`;
      Logger.log('Checking for updates at:', updateUrl);
      const response = await BdApi.Net.fetch(updateUrl, {
        headers: { 'User-Agent': 'BetterDiscord' }
      });
      Logger.log('Update check response:', response.status, response.statusText);
      if (!response.ok) {
        if (showNoUpdateNotice) {
          UI.showToast(`[${this.getName()}] Failed to check for updates (${response.status})`, {
            type: "error",
            timeout: 5000
          });
        }
        return;
      }
      const remoteContent = await response.text();
      const remoteVersion = this.getVersionFromContent(remoteContent);
      const currentVersion = this.getVersion();
      if (this.checkVersionNewer(currentVersion, remoteVersion)) {
        UI.showNotification({
          title: `${this.getName()} Update Available`,
          content: `v${currentVersion} -> v${remoteVersion}`,
          type: "info",
          duration: 2 * 60 * 60 * 1000,
          actions: [
            {
              label: "Update Now",
              onClick: () => {
                this.performUpdate(remoteContent, remoteVersion);
              }
            }
          ]
        });
      } else if (showNoUpdateNotice) {
        UI.showToast(`[${this.getName()}] You're on the latest version (v${currentVersion})`, {
          type: "success",
          timeout: 3000
        });
      }
    } catch (error) {
      Logger.error('Update check failed:', error);
      if (showNoUpdateNotice) {
        UI.showToast(`[${this.getName()}] Failed to check for updates`, {
          type: "error",
          timeout: 5000
        });
      }
    } finally {
      this.alreadyTestedForUpdate = false;
    }
  }
  performUpdate(remoteContent, remoteVersion) {
    UI.showConfirmationModal(
      "Update MessageLoggerV2",
      `Are you sure you want to update to version ${remoteVersion}?\n\nThe plugin will reload after updating.`,
      {
        confirmText: "Update",
        cancelText: "Cancel",
        danger: false,
        onConfirm: () => {
          try {
            const pluginPath = this.nodeModules.path.join(Plugins.folder, `${this.getName()}.plugin.js`);
            const backupPath = pluginPath + '.backup';
            const currentContent = this.nodeModules.fs.readFileSync(pluginPath, 'utf-8');
            this.nodeModules.fs.writeFileSync(backupPath, currentContent, 'utf-8');
            this.nodeModules.fs.writeFileSync(pluginPath, remoteContent, 'utf-8');
            UI.showToast(`[${this.getName()}] Successfully updated to v${remoteVersion}!`, {
              type: "success",
              timeout: 3000
            });
            setTimeout(() => {
              Plugins.reload(this.getName());
            }, 1000);
          } catch (error) {
            Logger.error('Update failed:', error);
            UI.showToast(`[${this.getName()}] Update failed! Check console for details.`, {
              type: "error",
              timeout: 0
            });
          }
        }
      }
    );
  }
  forceUpdateUI() {
    try {
      Logger.log('Forcing UI update...');
      const rootElement = document.getElementById("app-mount");
      if (!rootElement) {
        Logger.error('Could not find app-mount element');
        return;
      }
      const containerKey = Object.keys(rootElement).find((k) =>
        k.startsWith("__reactContainer$")
      );
      if (!containerKey) {
        Logger.error('Could not find React container key');
        return;
      }
      const target = Utils.findInTree(
        rootElement[containerKey],
        (c) => c?.stateNode?.isReactComponent,
        { walkable: ["child"] }
      );
      if (!target?.stateNode) {
        Logger.error('Could not find React component');
        return;
      }
      const { render } = target.stateNode;
      if (render.toString().includes("null")) {
        Logger.log('Render already null, skipping');
        return;
      }
      target.stateNode.render = () => null;
      target.stateNode.forceUpdate(() => {
        target.stateNode.render = render;
        target.stateNode.forceUpdate();
        Logger.log('UI force update completed');
      });
    } catch (e) {
      Logger.error('Failed to force UI update:', e);
    }
  }
  initialize() {
    if (this.__started) return UI.showToast(`[**${this.getName()}**] Tried to start twice..`, { timeout: 0 }, { type: "warning" });
    this.__started = true;
    DiscordModules.ModalActions.closeModal(`${this.getName()}_DEP_MODAL`);
    if (globalThis.PluginUpdates?.plugins) delete PluginUpdates.plugins['https://gitlab.com/_Lighty_/bdstuff/raw/main/public/plugins/MessageLoggerV2.plugin.js'];
    if (Plugins.get('NoDeleteMessages') && Plugins.isEnabled('NoDeleteMessages'))
      UI.showToast(`[**${this.getName()}**] Using **NoDeleteMessages** with **${this.getName()}** is completely unsupported and will cause issues. Please either disable **NoDeleteMessages** or delete it to avoid issues.`, { type: "warning" });
    if (Plugins.get('SuppressUserMentions') && Plugins.isEnabled('SuppressUserMentions'))
      UI.showToast(`[**${this.getName()}**] Using **SuppressUserMentions** with **${this.getName()}** is completely unsupported and will cause issues. Please either disable **SuppressUserMentions** or delete it to avoid issues.`, { type: "warning" });
    const missingCritical = DiscordModules._validateCritical();
    if (missingCritical.length) {
      Logger.error('Critical Discord modules missing:', missingCritical);
      UI.showToast(`[**${this.getName()}**] Warning: Some Discord modules failed to load (${missingCritical.join(', ')}). Some features may not work correctly.`, { type: 'warning', timeout: 10000 });
    }
    const defaultSettings = {
      obfuscateCSSClasses: true,
      autoBackup: false,
      dontSaveData: false,
      displayUpdateNotes: true,
      ignoreMutedGuilds: true,
      ignoreMutedChannels: true,
      ignoreBots: true,
      ignoreSelf: false,
      ignoreBlockedUsers: true,
      ignoreNSFW: false,
      ignoreLocalEdits: false,
      ignoreLocalDeletes: false,
      alwaysLogGhostPings: false,
      showOpenLogsButton: true,
      messageCacheCap: 1000,
      savedMessagesCap: 1000,
      reverseOrder: true,
      onlyLogWhitelist: true,
      whitelist: [],
      blacklist: [],
      notificationBlacklist: [],
      toastToggles: {
        sent: false,
        edited: true,
        deleted: true,
        ghostPings: true
      },
      toastTogglesDMs: {
        sent: false,
        edited: true,
        deleted: true,
        ghostPings: true,
        disableToastsForLocal: false
      },
      useNotificationsInstead: true,
      blockSpamEdit: false,
      cacheAllImages: true,
      newCacheAllImagesPath: '',
      newCacheAllImages: false,
      alwaysNotifChannel: false,
      alwaysNotifGuild: false,
      notifOnlyWhitelist: false,
      notificationWhitelist: [],
      aggresiveMessageCaching: true,
      renderCap: 50,
      maxShownEdits: 0,
      hideNewerEditsFirst: true,
      displayDates: true,
      deletedMessageColor: '',
      useAlternativeDeletedStyle: false,
      showEditedMessages: true,
      showDeletedMessages: true,
      showPurgedMessages: true,
      showDeletedCount: true,
      showEditedCount: true,
      alwaysLogSelected: true,
      alwaysLogDM: true,
      restoreDeletedMessages: true,
      contextmenuSubmenuName: 'Message Logger',
      imageCacheDir: this.pluginDir + '/MLV2_IMAGE_CACHE',
      maxCacheFileSize: 0,
      flags: 0,
      autoUpdate: true,
      versionInfo: ''
    };
    const Flags = {
      STARTUP_HELP: 1 << 1
    };
    this.settings = (Data.load(this.getName(), 'settings') || defaultSettings);
    let settingsChanged = false;
    if (!this.settings || !Object.keys(this.settings).length) {
      UI.showToast(`[${this.getName()}] Settings file corrupted! All settings restored to default.`, { type: "error", timeout: 0 });
      this.settings = defaultSettings;
      settingsChanged = true;
    }
    if (this.settings.autoUpdate) {
      if (this._autoUpdateInterval) clearInterval(this._autoUpdateInterval);
      setTimeout(() => this.checkNewUpdate(false), 5000);
      this._autoUpdateInterval = setInterval(() => {
        this.checkNewUpdate(false);
      }, 60 * 60 * 1000);
    }
    if (this.settings.versionInfo !== this.getVersion() && this.settings.displayUpdateNotes) {
      UI.showChangelogModal({
        title: `${this.getName()} has been updated!`,
        subtitle: this.getVersion(),
        changes: this.getChanges()
      });
      this.settings.versionInfo = this.getVersion();
      this.saveSettings();
      settingsChanged = false;
    }
    if (settingsChanged) this.saveSettings();
    this.errorImage = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="104" viewBox="0 0 200 104"%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23666" font-family="Arial" font-size="14"%3EImage Error%3C/text%3E%3C/svg%3E';
    this.nodeModules = {
      electron: require('electron'),
      fs: require('fs'),
      path: require('path')
    };
    const guildStore_ = DiscordModules.GuildStore;
    this.imageCacheServerSimulator = {
      "cached": {},
      "_getBaseCachePath": () => {
        return this.settings.newCacheAllImagesPath && this.nodeModules.fs.existsSync(this.settings.newCacheAllImagesPath) ? this.settings.newCacheAllImagesPath : this.settings.imageCacheDir;
      },
      "_resolveImagePath": (attachmentId, ext, channelId, messageId) => {
        let pathname = this.nodeModules.path.join(this.settings.imageCacheDir, attachmentId + ext);
        if (this.nodeModules.fs.existsSync(pathname)) return pathname;
        const joinBase = this.imageCacheServerSimulator.resolveNewCachePath({ channelId }) + "/";
        pathname = this.nodeModules.path.join(joinBase, attachmentId + ` (${messageId})` + ext);
        if (this.nodeModules.fs.existsSync(pathname)) return pathname;
        const record = this.messageRecord[messageId];
        if (record && this.settings.addUserIdToSavedMediaFilename) {
          pathname = this.nodeModules.path.join(joinBase, attachmentId + ` (${messageId} by ${record.message.author.id})` + ext);
          if (this.nodeModules.fs.existsSync(pathname)) return pathname;
        }
        return null;
      },
      "exists": (attachmentId, filename, channelId, messageId) => {
        try {
          const ext = filename.match(/\.[0-9a-z]+$/i)?.[0] || '.png';
          return !!this.imageCacheServerSimulator._resolveImagePath(attachmentId, ext, channelId, messageId);
        } catch {
          return false;
        }
      },
      "get": (path) => {
        if (!this.imageCacheServerSimulator.cached[path]) {
          try {
            const parsedUrl = new URL(path);
            const parsedFile = this.nodeModules.path.parse(parsedUrl.pathname);
            const messageId = parsedUrl.hash.split(",")[2];
            const attachmentId = parsedUrl.hash.split(",")[1];
            const channelId = parsedUrl.hash.split(",")[0].split("#")[1];
            const pathname = this.imageCacheServerSimulator._resolveImagePath(attachmentId, parsedFile.ext, channelId, messageId);
            if (!pathname) {
              Logger.warn(`Cached image not found: ${attachmentId}`);
              this.imageCacheServerSimulator.cached[path] = this.errorImage;
              return this.imageCacheServerSimulator.cached[path];
            }
            const image = this.nodeModules.fs.readFileSync(pathname, "");
            const arrayBuffer = image.buffer.slice(
              image.byteOffset,
              image.byteOffset + image.byteLength
            );
            const blob = new Blob([arrayBuffer], { type: 'image/' + parsedFile.ext.split(".")[1] });
            const dataUri = URL.createObjectURL(blob);
            this.imageCacheServerSimulator.cached[path] = dataUri;
          }
          catch (e) {
            Logger.warn('Error loading cached image:', e.message);
            this.imageCacheServerSimulator.cached[path] = this.errorImage;
            return this.imageCacheServerSimulator.cached[path];
          }
        }
        return this.imageCacheServerSimulator.cached[path];
      },
      "getSettings": () => { return this.settings; },
      "getMessageRecord": () => { return this.messageRecord; },
      "resolveNewCachePath": (options) => {
        const savePath = this.imageCacheServerSimulator._getBaseCachePath();
        let { channelId, serverId } = options;
        let channelData = DiscordModules.ChannelStore?.getChannel(channelId);
        if (!channelData) {
          channelData = {};
          let basePath;
          if (serverId) {
            basePath = this.imageCacheServerSimulator.tryToGuessName(serverId);
          } else if (this.nodeModules.fs.existsSync(savePath + "/DMs")) {
            basePath = savePath + "/DMs";
          }
          let guessedName = this.imageCacheServerSimulator.tryToGuessName(channelId, basePath);
          if (!guessedName) {
            const results = this.imageCacheServerSimulator.tryToGuessNameDeep(channelId);
            if (results.length != 0) {
              guessedName = results[0].result;
              serverId = results[0].parentName == "DMs" ? null : results[0].parentName.substring(0, results[0].parentName.indexOf("(") - 1);
            }
          }
          if (guessedName) {
            channelData.name = guessedName.split(channelId)[1].slice(2, -1);
          }
        }
        if (!serverId)
          serverId = channelData.guild_id ?? null;
        let serverNameRaw;
        if (serverId == null) {
          serverNameRaw = "DMs";
        } else {
          const guildInfo = guildStore_.getGuild(serverId);
          if (guildInfo) {
            serverNameRaw = guildInfo.name;
          } else {
            serverNameRaw = this.imageCacheServerSimulator.tryToGuessName(serverId).split(serverId)[1].slice(2, -1);
          }
        }
        let channelNameRaw;
        if (serverId == null) {
          channelNameRaw = channelData.recipients?.length == 1 ? channelData.rawRecipients[0].username : "Unknown DM";
        } else {
          channelNameRaw = channelData.name;
        }
        const serverName = serverNameRaw.normalize("NFD").replaceAll(/[\u0300-\u036f]/g, "").replaceAll(/[^a-zA-Z0-9_. -]/g, "");
        const channelName = channelNameRaw.normalize("NFD").replaceAll(/[\u0300-\u036f]/g, "").replaceAll(/[^a-zA-Z0-9_. -]/g, "");
        const filePath = savePath + "/" + (serverId == null ? serverName : serverId + " (" + serverName + ")") + "/" + channelId + " (" + channelName + ")";
        return filePath;
      },
      "cleanUp": () => {
        for (let cachedPath in this.imageCacheServerSimulator.cached) {
          if (this.imageCacheServerSimulator.cached.hasOwnProperty(cachedPath)) {
            URL.revokeObjectURL(this.imageCacheServerSimulator.cached[cachedPath]);
            delete this.imageCacheServerSimulator.cached[cachedPath];
          }
        }
      },
      "tryToGuessNameDeep": (id, base) => {
        if (!base)
          base = this.imageCacheServerSimulator._getBaseCachePath();
        const stuffInBase = this.nodeModules.fs.readdirSync(base);
        const results = [];
        for (const element of stuffInBase) {
          if (this.nodeModules.fs.statSync(base + "/" + element).isDirectory()) {
            const result = this.imageCacheServerSimulator.tryToGuessName(id, base + "/" + element);
            if (!result) continue;
            results.push({ result, parentName: element });
          }
        }
        return results;
      },
      "tryToGuessName": (id, base) => {
        if (!base)
          base = this.imageCacheServerSimulator._getBaseCachePath();
        const stuffInBase = this.nodeModules.fs.readdirSync(base);
        const filtered = stuffInBase.filter(x => x.startsWith(id));
        switch (filtered.length) {
          case 0:
            return undefined;
          case 1:
            return filtered[0];
          default: {
            const temp = {};
            filtered.forEach((v) => { temp[v] = this.nodeModules.fs.statSync(base + "/" + v).mtime });
            return Object.keys(temp).sort((a, b) => temp[b] - temp[a])[0];
          }
        }
      }
    };
    this.nodeModules.electron.clipboard = {};
    this.nodeModules.electron.clipboard.write = DiscordNative.clipboard.copy;
    this.nodeModules.electron.clipboard.writeText = DiscordNative.clipboard.copy;
    const defaultConstruct = () => {
      return {
        messageRecord: {},
        deletedMessageRecord: {},
        editedMessageRecord: {},
        purgedMessageRecord: {}
      };
    };
    let data;
    if (this.settings.dontSaveData) {
      data = defaultConstruct();
    } else {
      data = (Data.load(this.getName() + 'Data', 'data') || defaultConstruct());
      const isBad = map => !(map?.messageRecord && map.editedMessageRecord && map.deletedMessageRecord && map.purgedMessageRecord && typeof map.messageRecord == 'object' && typeof map.editedMessageRecord == 'object' && typeof map.deletedMessageRecord == 'object' && typeof map.purgedMessageRecord == 'object');
      if (isBad(data)) {
        if (this.settings.autoBackup) {
          data = (Data.load(this.getName() + 'DataBackup', 'data') || defaultConstruct());
          if (isBad(data)) {
            UI.showToast(`[${this.getName()}] Data and backup files were corrupted. All deleted/edited/purged messages have been erased.`, { type: "error", timeout: 0 });
            data = defaultConstruct();
          } else {
            UI.showToast(`[${this.getName()}] Data was corrupted, loaded backup!`, { type: "warning", timeout: 5000 });
          }
        } else {
          UI.showToast(`[${this.getName()}] Data was corrupted! Recommended to turn on auto backup in settings! All deleted/edited/purged messages have been erased.`, { type: "error", timeout: 0 });
          data = defaultConstruct();
        }
      }
    }
    this.messageStore = DiscordModules.MessageStore;
    this.ChannelStore = DiscordModules.ChannelStore;
    if (!this.settings.dontSaveData) {
      const records = data.messageRecord;
      for (let a in records) {
        const record = records[a];
        if (record.deletedata) {
          if (record.deletedata.deletetime) {
            record.delete_data = {};
            record.delete_data.time = record.deletedata.deletetime;
          }
          delete record.deletedata;
        } else if (record.delete_data?.rel_ids !== undefined) delete record.delete_data.rel_ids;
        if (record.editHistory) {
          record.edit_history = [];
          for (let b in record.editHistory) {
            record.edit_history.push({ content: record.editHistory[b].content, time: record.editHistory[b].editedAt });
          }
          delete record.editHistory;
        }
        record.message = this.cleanupMessageObject(record.message);
        record.message.embeds.map(x => {
          if (x.image !== undefined) {
            const hasUrl = x.image.url !== undefined;
            const hasProxyUrl = x.image.proxy_url !== undefined;
            if (!hasUrl && !hasProxyUrl) {
              delete x.image;
            }
            else if (!hasUrl && hasProxyUrl) {
              x.image.url = x.image.proxy_url;
            }
            else if (hasUrl && !hasProxyUrl) {
              x.image.proxy_url = x.image.url;
            }
          }
          return x;
        });
      }
    }
    this.cachedMessageRecord = [];
    this.cachedMessageIds = new Set();
    this.cachedMessagesMap = new Map();
    this.messageRecord = data.messageRecord;
    this.messageRecordIds = new Set(Object.keys(this.messageRecord));
    this.deletedMessageRecord = data.deletedMessageRecord;
    this.editedMessageRecord = data.editedMessageRecord;
    this.purgedMessageRecord = data.purgedMessageRecord;
    this.deletedMessageSet = new Map();
    this.editedMessageSet = new Map();
    this.purgedMessageSet = new Map();
    for (const [channelId, ids] of Object.entries(this.deletedMessageRecord)) {
      this.deletedMessageSet.set(channelId, new Set(ids));
    }
    for (const [channelId, ids] of Object.entries(this.editedMessageRecord)) {
      this.editedMessageSet.set(channelId, new Set(ids));
    }
    for (const [channelId, ids] of Object.entries(this.purgedMessageRecord)) {
      this.purgedMessageSet.set(channelId, new Set(ids));
    }
    this.sortedDeletedMessageIds = new Map();
    this.sortedPurgedMessageIds = new Map();
    this._messageUpdateRegistry = new Map();
    this._globalUpdateCallbackMessage = null;
    this._globalUpdateCallbackContent = null;
    this.tempEditedMessageRecord = {};
    this.editHistoryAntiSpam = {};
    this.localDeletes = [];
    const defaultImageCacheDir = this.pluginDir + '/MLV2_IMAGE_CACHE';
    this.settings.imageCacheDir = defaultImageCacheDir;
    const imageCacheDirFailure = () => {
      this.settings.imageCacheDir = defaultImageCacheDir;
      UI.showToast(`[**${this.getName()}**] Failed to access custom image cache dir. It has been reset to plugins folder!`, { type: "error" });
    };
    if (this.settings.cacheAllImages && !this.nodeModules.fs.existsSync(this.settings.imageCacheDir)) {
      try {
        this.nodeModules.fs.mkdirSync(this.settings.imageCacheDir);
      } catch {
        imageCacheDirFailure();
      }
    }
    const CUser = DiscordModules.CUser;
    const userRecord = {};
    const lastSeenUser = {};
    for (const messageId in this.messageRecord) {
      const record = this.messageRecord[messageId];
      const userObj = record.message.author;
      if (!userObj || typeof userObj === 'string') continue;
      const date = new Date(record.message.timestamp);
      if (!(userRecord[userObj.id] && lastSeenUser[userObj.id] && lastSeenUser[userObj.id] > date)) {
        userRecord[userObj.id] = userObj;
        lastSeenUser[userObj.id] = date;
      }
    }
    this.unpatches = [];
    this.unpatches.push(
      Patcher.after(this.UserStore, 'getUser', (_this, args, ret) => {
        if (!ret && !args[1]) {
          const userId = args[0];
          const users = this.UserStore.getUsers();
          if (userRecord[userId]) {
            users[userId] = new CUser(userRecord[userId]);
            return users[userId];
          }
        }
      })
    );
    const RenderUserPopout_mod = DiscordModules.RenderUserPopout
    this.tools = {
      getMessage: this.messageStore.getMessage,
      getChannel: this.ChannelStore.getChannel,
      getServer: DiscordModules.GuildUtils?.getGuild,
      getUser: this.UserStore.getUser,
      parse: DiscordModules.Parser?.parse,
      isBlocked: DiscordModules.RelationshipStore?.isBlocked,
      createMomentObject: DiscordModules.TimestampUtils,
      isMentioned: (e, id) => {
        if (e.mentionEveryone || e.mention_everyone) return true;
        const mentions = e.mentions || [];
        for (const mention of mentions) {
          const mentionId = typeof mention === 'string' ? mention : mention?.id;
          if (mentionId === id) return true;
        }
        return false;
      },
      DiscordUtils: DiscordModules.DiscordUtils,
      parserNew: DiscordModules.ParserNew?.parse,
      buttonColors: Components.Button.Colors,
      _nativeMediaModal: null,
      getNativeMediaModal() {
        if (this._nativeMediaModal) return this._nativeMediaModal;
        try {
          const searchPatterns = [
            () => Webpack.getBySource('startingIndex', 'items', 'Media Viewer Modal', { searchExports: false }),
            () => Webpack.getBySource('numMediaItems', 'shouldHideMediaOptions', { searchExports: false }),
            () => Webpack.getBySource('MEDIA_VIEWER', 'OPEN_MODAL', 'backdropStyle', { searchExports: false })
          ];
          for (const getModule of searchPatterns) {
            try {
              const module = getModule();
              if (module) {
                const openerFunc = Object.values(module).find(v =>
                  typeof v === 'function' && v.toString().includes('startingIndex')
                );
                if (openerFunc) {
                  this._nativeMediaModal = { openMediaModal: openerFunc, module };
                  Logger.log('Found native media modal');
                  return this._nativeMediaModal;
                }
              }
            } catch {
            }
          }
        } catch (e) {
          Logger.error('Error finding native media modal:', e);
        }
        return null;
      },
      _imageModal: null,
      findImageModal() {
        if (this._imageModal != null) return this._imageModal;
        try {
          const patterns = [
            "zoomThumbnailPlaceholder",
            ".MEDIA_MODAL_CLOSE,",
            "renderMobileCloseButton"
          ];
          for (const pattern of patterns) {
            const module = Webpack.getBySource(pattern, { searchExports: false });
            if (module) {
              const filterFunc = m2 => m2?.toString?.().includes(pattern);
              const ImageModal = Object.values(module).find(filterFunc);
              if (ImageModal) {
                this._imageModal = ImageModal;
                Logger.log(`Found ImageModal using pattern: ${pattern}`);
                return this._imageModal;
              }
            }
          }
        } catch (e) {
          Logger.error('Error getting image modal', e);
          this._imageModal = null;
        }
        return this._imageModal;
      },
      manaModule: DiscordModules.ManaModule,
      resolvedModalStuff: {},
      createWrappedElement(elements) {
        if (Array.isArray(elements)) {
          const tmp = document.createElement("div");
          tmp.className = "dom-wrapper";
          tmp.append(...elements);
          elements = tmp;
        }
        return React.createElement(ReactUtils.wrapElement(elements));
      },
      popoutStack: [],
      popoutManager: new PopoutManager(),
      showUserPopout(hookTo, user, channelId) {
        const content = RenderUserPopout_mod(null, { type: 1, author: user, channel_id: channelId || DiscordModules.SelectedChannelStore?.getChannelId() });
        const newPopout = this.popoutManager.showPopout(hookTo, content, {
          position: 'right',
          align: 'top'
        });
        this.popoutStack.push(newPopout);
      },
    };
    this.tools.resolvedModalStuff.ModalSize = Object.values(this.tools.manaModule).find(x => x?.LARGE && x?.DYNAMIC) ?? { SMALL: 'sm', MEDIUM: 'md', LARGE: 'lg', DYNAMIC: 'dynamic' };
    this.ModalStack = DiscordModules.ModalActions;
    this._modalsApiUnsubcribe_popoutManager = this.ModalStack.useModalsStore.subscribe(_ => {
      this.tools.popoutStack.forEach(x => this.tools.popoutManager.closePopout(x));
      this.tools.popoutStack.length = 0;
    });
    this.createButton.classes = {
      button: (() => {
        const buttonData = DiscordModules.ButtonClasses;
        if (!buttonData) return '';
        return `${buttonData.button} ${buttonData.lookFilled} ${buttonData.colorBrand} ${buttonData.sizeSmall} ${buttonData.grow}`;
      })(),
      buttonContents: DiscordModules.ButtonClasses?.contents || ''
    };
    this.safeGetClass = (func, fail, heckoff) => {
      try {
        return func();
      } catch {
        if (heckoff) return fail;
        return fail + '-MLV2';
      }
    };
    this.multiClasses = {
      defaultColor: DiscordModules.DefaultColorClasses?.defaultColor || '',
      edited: this.joinClassNames(
        this.getDiscordClass('separator timestamp'),
        this.getDiscordClass('separator timestampInline')
      ),
      markup: DiscordModules.MarkupClasses?.markup || ''
    };
    const spoilerModule = DiscordModules.SpoilerClasses
    this.classes = {
      markup: DiscordModules.MarkupClasses?.markup?.split(/ /g)[0] || '',
      hidden: spoilerModule?.hidden?.split(/ /g)[0] || '',
      messages: this.safeGetClass(
        () => `.${DiscordModules.ContainerCompactClasses?.container?.split(/ /g)[0]} > div:not(.${DiscordModules.ContentClasses?.content?.split(/ /g)[0]})`,
        '.messages-container-fallback',
        true
      ),
      avatar: this.safeGetClass(
        () => this.getSingleDiscordClass('header avatar'),
        'avatar-MLV2'
      ),
      username: Webpack.getByKeys('username')?.username?.split(/ /g)[0] || '',
      timestamp: Webpack.getByKeys('timestamp')?.timestamp?.split(/ /g)[0] || '',
      selected: Webpack.getByKeys('selected', 'message')?.selected?.split(/ /g)[0] || '',
      container: Webpack.getByKeys('container', 'content')?.container?.split(/ /g)[0] || '',
      message: DiscordModules.MessageWrapperClasses?.message?.split(/ /g)[0] || '',
      messageContent: Webpack.getByKeys('messageContent')?.messageContent?.split(/ /g)[0] || ''
    };
    this.muteModule = DiscordModules.MuteModule;
    this.menu = {};
    this.menu.classes = {};
    this.menu.filter = '';
    this.menu.open = false;
    const ImageModal = this.tools.findImageModal() ?? (() => React.createElement("div", undefined, "Image Modal failed!"));
    const MaskedLink = DiscordModules.MaskedLink || {};
    const renderLinkComponent = props => React.createElement(MaskedLink, props);
    this.tools.renderLinkComponent = renderLinkComponent;
    this.createModal.imageModal = ImageModal;
    const chatContent = DiscordModules.ChatContentClasses;
    this.observer.chatContentClass = (chatContent?.chatContent || '').split(/ /g)[0];
    this.observer.chatClass = chatContent?.chat?.split(/ /g)[0] || '';
    this.observer.titleClass = chatContent ? DiscordModules.TitleClasses?.title?.split(/ /g)[0] : 'ERROR-CLASSWTF';
    this.observer.containerCozyClass = this.safeGetClass(() => DiscordModules.ContainerClasses.containerCozyBounded.split(/ /g)[0], 'containerCozyBounded');
    this.deletedChatMessagesCount = {};
    this.editedChatMessagesCount = {};
    this.channelMessages = DiscordModules.ChannelMessages?._channelMessages;
    this.autoBackupSaveInterupts = 0;
    this.dispatcher = DiscordModules.Dispatcher;
    this.unpatches.push(
      Patcher.instead(
        this.dispatcher,
        'dispatch',
        (_, args, original) => this.onDispatchEvent(args, original)
      ),
      Patcher.instead(DiscordModules.MessageActions, 'startEditMessage', (_, args, original) => {
        const channelId = args[0];
        const messageId = args[1];
        if (this.deletedMessageSet.get(channelId)?.has(messageId)) return;
        return original(...args);
      })
    );
    this.noTintIds = new Set();
    this.editModifiers = {};
    this.style = {};
    this.style.deleted = 'ml2-deleted';
    this.style.deletedAlt = this.obfuscatedClass('ml2-deleted-alt');
    this.style.edited = this.obfuscatedClass('ml2-edited');
    this.style.editedCompact = this.obfuscatedClass('ml2-edited-compact');
    this.style.tab = this.obfuscatedClass('ml2-tab');
    this.style.tabSelected = this.obfuscatedClass('ml2-tab-selected');
    this.style.textIndent = this.obfuscatedClass('ml2-help-text-indent');
    this.style.menu = this.obfuscatedClass('ML2-MENU');
    this.style.openLogs = this.obfuscatedClass('ML2-OL');
    this.style.filter = this.obfuscatedClass('ML2-FILTER');
    this.style.menuMessages = this.obfuscatedClass('ML2-MENU-MESSAGES');
    this.style.menuTabBar = this.obfuscatedClass('ML2-MENU-TABBAR');
    this.style.menuRoot = this.obfuscatedClass('MLv2-menu-root');
    this.style.toolbarButton = this.obfuscatedClass('MLv2-toolbar-button');
    this.style.imageRoot = this.obfuscatedClass('MLv2-image-root');
    this.style.imageError = this.obfuscatedClass('MLv2-image-error');
    this.style.inputWrapper = this.obfuscatedClass('MLv2-input-wrapper');
    this.style.multiInput = this.obfuscatedClass('MLv2-input');
    this.style.multiInputFirst = this.obfuscatedClass('MLv2-input-first');
    this.style.input = this.obfuscatedClass('MLv2-input-input');
    this.style.questionMark = this.obfuscatedClass('MLv2-question-mark');
    this.style.tabBarContainer = this.obfuscatedClass('MLv2-tab-bar-container');
    this.style.tabBar = this.obfuscatedClass('MLv2-tab-bar');
    this.style.tabBarItem = this.obfuscatedClass('MLv2-tab-bar-item');
    this.invalidateAllChannelCache();
    this.selectedChannel = this.getSelectedTextChannel();
    if (this.selectedChannel) this.cacheChannelMessages(this.selectedChannel.id);
    const hexToRgb = (hex, alpha = 1) => {
      hex = hex.replace(/^#/, '');
      const bigint = Number.parseInt(hex, 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;
      alpha = Math.min(1, Math.max(0, alpha));
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    this.stringHeldCaptive = this.randomString();
    this.updateCSS = () => {
      DOM.removeStyle(this.settings.obfuscateCSSClasses ? this.stringHeldCaptive : 'ML2-CSS')
      this.style.css = this.settings.obfuscateCSSClasses ? this.stringHeldCaptive : 'ML2-CSS';
      DOM.addStyle(
        this.style.css,
        `
                    .${this.style.deleted} .${this.classes.markup}, .${this.style.deleted} .${this.classes.markup} .hljs, .${this.style.deleted} .${this.classes.container} *{
                        color: #f04747 !important;
                    }
                    html #app-mount .${this.style.deletedAlt} {
                      background-color: ${this.settings.deletedMessageColor ? hexToRgb(this.settings.deletedMessageColor, 0.15) : "rgba(240, 71, 71, 0.15)"} !important;
                    }
                    html #app-mount .${this.style.deletedAlt}:hover, html #app-mount .${this.style.deletedAlt}.${this.classes.selected} {
                      background-color: ${this.settings.deletedMessageColor ? hexToRgb(this.settings.deletedMessageColor, 0.1) : "rgba(240, 71, 71, 0.1)"} !important;
                    }
                    .theme-dark .${this.classes.markup}.${this.style.edited} .${this.style.edited} {
                        filter: brightness(70%);
                    }
                    .theme-light .${this.classes.markup}.${this.style.edited} .${this.style.edited} {
                        opacity: 0.5;
                    }
                    .${this.style.editedCompact} {
                        text-indent: 0;
                    }
                    .theme-dark .${this.style.deleted}:not(:hover) img:not(.${this.classes.avatar}), .${this.style.deleted}:not(:hover) .mention, .${this.style.deleted}:not(:hover) .reactions, .${this.style.deleted}:not(:hover) a {
                        filter: grayscale(100%) !important;
                    }
                    .${this.style.deleted} img:not(.${this.classes.avatar}), .${this.style.deleted} .mention, .${this.style.deleted} .reactions, .${this.style.deleted} a {
                        transition: filter 0.3s !important;
                    }
                    .theme-dark .${this.style.tab} {
                        border-color: transparent;
                        color: rgba(255, 255, 255, 0.4);
                        padding: 0px 24px;
                    }
                    .theme-light .${this.style.tab} {
                        border-color: transparent;
                        color: rgba(0, 0, 0, 0.4);
                        padding: 0px 24px;
                    }
                    #sent.${this.style.tab} {
                      display: none;
                    }
                    .theme-dark  .${this.style.tabSelected} {
                        border-color: rgb(255, 255, 255);
                        color: rgb(255, 255, 255);
                    }
                    .theme-light  .${this.style.tabSelected} {
                        border-color: rgb(0, 0, 0);
                        color: rgb(0, 0, 0);
                    }
                    #${this.style.menuTabBar} {
                      justify-content: space-around;
                    }
                    .${this.style.textIndent} {
                        margin-left: 40px;
                    }
                    .${this.style.imageRoot} {
                      pointer-events: all;
                    }
                    #${this.style.menuMessages} {
                      max-height: 0px;
                    }
                    .${this.style.menuRoot} .${this.style.questionMark} {
                      margin-left: 5px;
                    }
                    .${this.style.menuRoot} {
                      max-height: 80vh;
                      min-height: 80vh;
                      min-width: 85vw;
                      max-width: 85vw;
                    }
                    .${this.style.menuRoot} main {
                      overflow: visible !important;
                    }
                    .${this.style.menuRoot} :has(> main) {
                      flex: 1 1 auto !important;
                    }
                    .${this.style.menuRoot} .${this.classes.markup} {
                      color: var(--text-default) !important;
                    }
                    .${this.style.menuRoot} .${this.classes.username} {
                      color: var(--mobile-text-heading-primary) !important;
                    }
                    .${this.style.menuRoot} .${this.classes.timestamp} {
                      color: var(--text-muted) !important;
                    }
                    .${this.style.toolbarButton} { color: var(--interactive-text-default); cursor: pointer; }
                    .${this.style.toolbarButton}:hover { color: var(--interactive-text-hover); }
                    #${this.style.filter} {
                      opacity: 1;
                    }
                    .${this.style.inputWrapper} {
                      display: -webkit-box;
                      display: -ms-flexbox;
                      display: flex;
                      -webkit-box-orient: vertical;
                      -webkit-box-direction: normal;
                      -ms-flex-direction: column;
                      flex-direction: column;
                    }
                    .${this.style.multiInput} {
                      font-size: 16px;
                      -webkit-box-sizing: border-box;
                      box-sizing: border-box;
                      width: 100%;
                      border-radius: 3px;
                      color: var(--text-default);
                      background-color: var(--background-surface-high);
                      border: 1px solid var(--border-subtle);
                      -webkit-transition: border-color .2s ease-in-out;
                      transition: border-color .2s ease-in-out;
                      display: -webkit-box;
                      display: -ms-flexbox;
                      display: flex;
                      -webkit-box-align: center;
                      -ms-flex-align: center;
                      align-items: center;
                    }
                    .${this.style.multiInputFirst} {
                      -webkit-box-flex: 1;
                      -ms-flex-positive: 1;
                      flex-grow: 1;
                    }
                    .${this.style.input} {
                      font-size: 16px;
                      box-sizing: border-box;
                      width: 100%;
                      border-radius: 3px;
                      color: var(--text-default);
                      background-color: var(--input-background-default);
                      border: 1px solid var(--input-border-default);
                      transition: border-color .2s ease-in-out;
                      padding: 10px;
                      height: 40px;
                    }
                    .${this.style.questionMark} {
                      display: -webkit-box;
                      display: -ms-flexbox;
                      display: flex;
                      -webkit-box-align: center;
                      -ms-flex-align: center;
                      align-items: center;
                      -webkit-box-pack: center;
                      -ms-flex-pack: center;
                      justify-content: center;
                      width: 32px;
                      height: 32px;
                      border-radius: 2px;
                      margin-right: 4px;
                      padding: 0;
                      min-width: 0;
                      min-height: 0;
                      background-color: var(--brand-500);
                    }
                    .${this.style.tabBarContainer} {
                      border-bottom: 1px solid var(--background-accent);
                      padding-left: 20px;
                    }
                    .${this.style.tabBar} {
                      display: flex;
                      height: 55px;
                      align-items: stretch;
                      -ms-flex-align: stretch;
                      -webkit-box-align: stretch;
                    }
                    .${this.style.tabBarItem} {
                      display: flex;
                      margin-right: 40px;
                      border-bottom: 2px solid transparent;
                      align-items: center;
                      -ms-flex-align: center;
                      -webkit-box-align: center;
                      cursor: pointer;
                      line-height: 20px;
                      font-size: 16px;
                      position: relative;
                      font-weight: 500;
                      flex-shrink: 0;
                      -ms-flex-negative: 0;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      white-space: nowrap;
                    }
                `
      );
    }
    this.updateCSS();
    this.patchMessages();
    this.patchModal();
    this.dataManagerInterval = setInterval(() => {
      this.handleMessagesCap();
    }, 60 * 1000 * 5);
    this.menu.randomValidChannel = (() => {
      const channels = this.ChannelStore.getChannels ? this.ChannelStore.getChannels() : DiscordModules.ChannelListModule?.getChannels();
      var keys = Object.keys(channels);
      return channels[keys[Math.trunc(keys.length * Math.random())]];
    })();
    this.menu.deleteKeyDown = false;
    this.keydownListener = e => {
      if (e.repeat) return;
      if (e.keyCode === 46) this.menu.deleteKeyDown = true;
    };
    document.addEventListener('keydown', this.keydownListener);
    this.keyupListener = e => {
      if (e.repeat) return;
      if (e.keyCode === 46) this.menu.deleteKeyDown = false;
    };
    document.addEventListener('keyup', this.keyupListener);
    this.menu.shownMessages = -1;
    this.Tooltip = Components.Tooltip;
    this.addOpenLogsButton();
    this.unpatches.push(
      Patcher.instead(DiscordModules.MessageActions, 'deleteMessage', (_, args, original) => {
        const messageId = args[1];
        if (this.messageRecord[messageId]?.delete_data) return;
        this.localDeletes.push(messageId);
        if (this.localDeletes.length > 10) this.localDeletes.shift();
        return original(...args);
      }),
      Patcher.instead(this.messageStore, 'getLastEditableMessage', (_this, [channelId]) => {
        const me = this.localUser.id;
        return _this
          .getMessages(channelId)
          .toArray()
          .reverse()
          .find(iMessage => iMessage.author.id === me && iMessage.state === 'SENT' && (!this.messageRecord[iMessage.id]?.delete_data));
      })
    );
    const getSrc_filter = m => typeof m === 'function' && ['sourceMetadata:', 'getSrc'].every(s => m.toString().includes(s));
    const getSrcModule = DiscordModules.GetSrcModule;
    const getSrc = [getSrcModule, Object.keys(getSrcModule).find(key => getSrc_filter(getSrcModule[key]))];
    const old_getSrc = getSrc[0][getSrc[1]].prototype.getSrc;
    this.unpatches.push(
      Patcher.instead(getSrc[0][getSrc[1]].prototype, "getSrc", (_, args, original) => {
        try {
          if (_.props?.src?.startsWith?.('blob:'))
            return _.props.src;
          return old_getSrc.call(_, ...args);
        } catch {
          return _.props?.src;
        }
      })
    );
    this.patchContextMenus();
    Logger.log('All patches applied, forcing UI update...');
    setTimeout(() => {
      this.forceUpdateUI();
    }, 100);
    Logger.log('initialize() about to return...');
    if (!(this.settings.flags & Flags.STARTUP_HELP)) {
      this.settings.flags |= Flags.STARTUP_HELP;
      this.showLoggerHelpModal(true);
      this.saveSettings();
    }
  }
  observer({ addedNodes }) {
    let isChat = false;
    let isTitle = false;
    for (const change of addedNodes) {
      const className = change.className;
      const isString = typeof className === 'string';
      const matchesChatClass = isString && className.includes(this.observer.chatClass);
      const matchesChatContentClass = isString && className.includes(this.observer.chatContentClass);
      const matchesTitleClass = isString && className.includes(this.observer.titleClass);
      const matchesContainerCozy = isString && className.includes(this.observer.containerCozyClass);
      const matchesStyle = change.style?.cssText === 'border-radius: 2px; background-color: rgba(114, 137, 218, 0);';
      if (matchesChatClass) {
        isTitle = true;
        isChat = true;
      } else if (matchesChatContentClass) {
        isChat = true;
      } else if (matchesTitleClass) {
        isTitle = true;
      }
      if (matchesChatClass || matchesChatContentClass || matchesTitleClass || matchesStyle || matchesContainerCozy) {
        try {
          if (isChat) {
            this.selectedChannel = this.getSelectedTextChannel();
            this.noTintIds = new Set();
            this.editModifiers = {};
          }
          if (!this.selectedChannel) return Logger.warn('Chat was loaded but no text channel is selected');
          if (isTitle && !isChat) return;
          const showStuff = (map, name) => {
            if (map[this.selectedChannel.id]) {
              this._showNotification(
                `New ${name.charAt(0).toUpperCase() + name.slice(1)} Messages`,
                `There are ${map[this.selectedChannel.id]} new ${name} messages in ${this.selectedChannel.name && this.selectedChannel.type !== 3 ? '#' + this.selectedChannel.name : 'DMs'}`,
                "info",
                [{ label: "View", onClick: () => this.openWindow(name) }],
                3000
              );
              map[this.selectedChannel.id] = 0;
            }
          };
          if (this.settings.showDeletedCount) showStuff(this.deletedChatMessagesCount, 'deleted');
          if (this.settings.showEditedCount) showStuff(this.editedChatMessagesCount, 'edited');
        } catch (e) {
          Logger.error('Error in observer', e);
        }
        break;
      }
    }
  }
  buildSetting(data) {
    const { id } = data;
    const setting = UI.buildSettingsPanel({
      settings: [{
        id: this.obfuscatedClass(id),
        ...data,
      }],
      onChange(c, id, v) {
        data.onChange(v);
      },
    });
    return setting;
  }
  createSetting(data) {
    const current = { ...data };
    if (current.type === "textbox") current.type = "text";
    if (!current.onChange) {
      current.onChange = value => {
        this.settings[current.id] = value;
        if (current.callback) current.callback(value);
        this.saveSettings();
      };
    }
    if (current.value === undefined) current.value = this.settings[current.id];
    return this.buildSetting(current);
  }
  createGroup(group) {
    const { name, id, collapsible, shown, settings } = group;
    const list = [];
    for (const setting of settings) list.push(this.createSetting(setting));
    const settingGroup = React.createElement(Components.SettingGroup, { key: id, id, shown, collapsible, name }, ...list);
    return settingGroup;
  }
  getSettingsPanel() {
    const settingsConfig = [
      {
        name: 'Ignores and overrides',
        id: 'ml2-settings-ignores-overrides',
        collapsible: true,
        shown: false,
        settings: [
          { name: 'Ignore muted servers', id: 'ignoreMutedGuilds', type: 'switch' },
          { name: 'Ignore muted channels', id: 'ignoreMutedChannels', type: 'switch' },
          { name: 'Ignore bots', id: 'ignoreBots', type: 'switch' },
          { name: 'Ignore messages posted by you', id: 'ignoreSelf', type: 'switch' },
          { name: 'Ignore message edits from you', id: 'ignoreLocalEdits', type: 'switch' },
          {
            name: 'Ignore message deletes from you',
            note: 'Only ignores if you delete your own message.',
            id: 'ignoreLocalDeletes',
            type: 'switch'
          },
          { name: 'Ignore blocked users', id: 'ignoreBlockedUsers', type: 'switch' },
          { name: 'Ignore NSFW channels', id: 'ignoreNSFW', type: 'switch' },
          { name: 'Only log whitelist', id: 'onlyLogWhitelist', type: 'switch' },
          { name: 'Always log selected channel, regardless of whitelist/blacklist', id: 'alwaysLogSelected', type: 'switch' },
          { name: 'Always log DMs, regardless of whitelist/blacklist', id: 'alwaysLogDM', type: 'switch' },
          {
            name: 'Always log ghost pings, regardless of whitelist/blacklist',
            note: 'Messages sent in ignored/muted/blacklisted servers and channels will be logged and shown in sent, but only gets saved if a ghost ping occurs.',
            id: 'alwaysLogGhostPings',
            type: 'switch'
          }
        ]
      },
      {
        name: 'Display settings',
        id: 'ml2-settings-display',
        collapsible: true,
        shown: false,
        settings: [
          {
            name: 'Display dates with timestamps',
            id: 'displayDates',
            type: 'switch',
            action: 'refreshCache'
          },
          {
            name: 'Display deleted messages in chat',
            id: 'showDeletedMessages',
            type: 'switch',
            action: 'refreshCache'
          },
          {
            name: 'Display edited messages in chat',
            id: 'showEditedMessages',
            type: 'switch',
            action: 'forceUpdateContent'
          },
          {
            name: 'Max number of shown edits',
            id: 'maxShownEdits',
            type: 'textbox',
            validator: 'number',
            action: 'forceUpdateContent'
          },
          {
            name: 'Show oldest edit instead of newest if over the shown edits limit',
            id: 'hideNewerEditsFirst',
            type: 'switch',
            action: 'forceUpdateContent'
          },
          {
            name: 'Use red background instead of red text for deleted messages',
            id: 'useAlternativeDeletedStyle',
            type: 'switch',
            action: 'forceUpdateMessage'
          },
          {
            name: 'Display purged messages in chat',
            id: 'showPurgedMessages',
            type: 'switch',
            action: 'refreshCache'
          },
          {
            name: 'Restore deleted messages after reload',
            id: 'restoreDeletedMessages',
            type: 'switch',
            action: 'refreshCache'
          },
          { name: 'Show amount of new deleted messages when entering a channel', id: 'showDeletedCount', type: 'switch' },
          { name: 'Show amount of new edited messages when entering a channel', id: 'showEditedCount', type: 'switch' },
          { name: 'Display update notes', id: 'displayUpdateNotes', type: 'switch' },
          {
            name: 'Menu sort direction',
            id: 'reverseOrder',
            type: 'radio',
            options: [
              { name: 'New - old', value: false },
              { name: 'Old - new', value: true }
            ]
          },
          {
            name: 'Use BdApi basic notifications instead of custom toasts',
            note: "This works for edit, send, delete and purge toasts, as well as delete and edit count toasts. Toggle it if you don't know what this does.",
            id: 'useNotificationsInstead',
            type: 'switch',
            action: 'notificationTest'
          }
        ]
      },
      {
        name: 'Misc settings',
        id: 'ml2-settings-misc',
        collapsible: true,
        shown: false,
        settings: [
          {
            name: 'Disable saving data. Logged messages are erased after reload/restart. Disables auto backup.',
            id: 'dontSaveData',
            type: 'switch',
            action: 'handleDataSave'
          },
          {
            name: "Auto backup data (won't fully prevent losing data, just prevent total data loss)",
            id: 'autoBackup',
            type: 'switch',
            action: 'handleBackup'
          },
          { name: 'Deleted messages color', id: 'deletedMessageColor', type: 'textbox' },
          { name: 'Aggresive message caching (makes sure we have the data of any deleted or edited messages)', id: 'aggresiveMessageCaching', type: 'switch' },
          { name: 'Cache all images by storing them locally in the MLV2_IMAGE_CACHE folder inside the plugins folder', id: 'cacheAllImages', type: 'switch' },
          {
            name: "Use new cached images system",
            note: "Makes image cache in a hierarchy",
            id: 'newCacheAllImages',
            type: 'switch'
          },
          { name: "Always show notifications for selected channel", id: 'alwaysNotifChannel', type: 'switch' },
          { name: "Always show notifications for selected guild", id: 'alwaysNotifGuild', type: 'switch' },
          { name: "Add user id to saved media filename", id: 'addUserIdToSavedMediaFilename', type: 'switch' },
          { name: "Show notifications to whitelisted only", id: 'notifOnlyWhitelist', type: 'switch' },
          {
            name: 'Path to new cached images system (optional)',
            note: "",
            id: 'newCacheAllImagesPath',
            type: 'textbox'
          },
          {
            name: "Save all cached attachments",
            note: "Allows you to save all file types, png, gif, mp3, mp4 etc",
            id: 'newSaveAllFileTypes',
            type: 'switch',
            customValue: true
          },
          {
            name: 'Max cache file size (MB, 0 = no limit)',
            note: 'Files larger than this will not be cached',
            id: 'maxCacheFileSize',
            type: 'textbox'
          },
          {
            name: 'Display open logs button next to the search box top right in channels',
            id: 'showOpenLogsButton',
            type: 'switch',
            action: 'toggleLogsButton'
          },
          { name: 'Block spam edit notifications (if enabled)', id: 'blockSpamEdit', type: 'switch' }
        ]
      },
      {
        name: 'Toast notifications for guilds',
        id: 'ml2-settings-toast-guilds',
        collapsible: true,
        shown: false,
        settings: [
          { name: 'Message sent', id: 'sent', type: 'switch', parent: 'toastToggles' },
          { name: 'Message edited', id: 'edited', type: 'switch', parent: 'toastToggles' },
          { name: 'Message deleted', id: 'deleted', type: 'switch', parent: 'toastToggles' },
          { name: 'Ghost pings', id: 'ghostPings', type: 'switch', parent: 'toastToggles' },
          { name: 'Disable toasts for local user (yourself)', id: 'disableToastsForLocal', type: 'switch', parent: 'toastToggles' }
        ]
      },
      {
        name: 'Toast notifications for DMs',
        id: 'ml2-settings-toast-dms',
        collapsible: true,
        shown: false,
        settings: [
          { name: 'Message sent', id: 'sent', type: 'switch', parent: 'toastTogglesDMs' },
          { name: 'Message edited', id: 'edited', type: 'switch', parent: 'toastTogglesDMs' },
          { name: 'Message deleted', id: 'deleted', type: 'switch', parent: 'toastTogglesDMs' },
          { name: 'Ghost pings', id: 'ghostPings', type: 'switch', parent: 'toastTogglesDMs' }
        ]
      },
      {
        name: 'Message caps',
        id: 'ml2-settings-caps',
        collapsible: true,
        shown: false,
        settings: [
          {
            name: 'Cached messages cap',
            note: 'Max number of sent messages logger should keep track of',
            id: 'messageCacheCap',
            type: 'textbox',
            validator: 'number',
            action: 'resetDataInterval'
          },
          {
            name: 'Saved messages cap',
            note: "Max number of messages saved to disk, this limit is for deleted, edited and purged INDIVIDUALLY. So if you have it set to 1000, it'll be 1000 edits, 1000 deletes and 1000 purged messages max",
            id: 'savedMessagesCap',
            type: 'textbox',
            validator: 'number',
            action: 'resetDataInterval'
          },
          {
            name: 'Menu message render cap',
            note: 'How many messages will show before the LOAD MORE button will show',
            id: 'renderCap',
            type: 'textbox',
            validator: 'number'
          }
        ]
      },
      {
        name: 'Advanced',
        id: 'ml2-settings-advanced',
        collapsible: true,
        shown: false,
        settings: [
          {
            name: 'Obfuscate CSS classes',
            note: 'Enable this if some plugin, library or theme is blocking you from using the plugin',
            id: 'obfuscateCSSClasses',
            type: 'switch'
          },
          {
            name: 'Automatic updates',
            note: "Do NOT disable unless you really don't want automatic updates",
            id: 'autoUpdate',
            type: 'switch',
            action: 'toggleAutoUpdate'
          },
          {
            name: 'Contextmenu submenu name',
            note: "Instead of saying Message Logger, make it say something else, so it's screenshot friendly",
            id: 'contextmenuSubmenuName',
            type: 'textbox'
          }
        ]
      }
    ];
    const actions = {
      refreshCache: () => {
        this.invalidateAllChannelCache();
        if (this.selectedChannel) this.cacheChannelMessages(this.selectedChannel.id);
      },
      forceUpdateContent: () => this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT' }),
      forceUpdateMessage: () => this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE' }),
      notificationTest: (val) => {
        const message = val ? 'Using BdApi notifications' : 'Using custom toasts';
        if (val) {
          UI.showNotification({
            title: "Notification Test",
            content: message,
            type: "success",
            duration: 5000
          });
        } else {
          this.showToast(message, { type: 'success', timeout: 5000 });
        }
      },
      handleDataSave: (val) => {
        if (!val) this.saveData();
        if (!val && this.settings.autoBackup) this.saveBackup();
      },
      handleBackup: (val) => {
        if (val && !this.settings.dontSaveData) this.saveBackup();
      },
      toggleLogsButton: (val) => {
        if (val) return this.addOpenLogsButton();
        this.removeOpenLogsButton();
      },
      resetDataInterval: () => {
        clearInterval(this.dataManagerInterval);
        this.dataManagerInterval = setInterval(() => {
          this.handleMessagesCap();
        }, 60 * 1000 * 5);
      },
      toggleAutoUpdate: (val) => {
        if (val) {
          this._autoUpdateInterval = setInterval(_ => this.checkNewUpdate(false), 1000 * 60 * 15);
          this.checkNewUpdate(false);
        } else {
          clearInterval(this._autoUpdateInterval);
        }
      }
    };
    const createSettingFromConfig = (config) => {
      const setting = { ...config };
      if (config.parent) {
        setting.value = this.settings[config.parent][config.id];
        setting.onChange = val => {
          this.settings[config.parent][config.id] = val;
          this.saveSettings();
        };
      }
      else if (config.customValue) {
        setting.value = this.settings[config.id];
        setting.onChange = val => {
          this.settings[config.id] = val;
          this.saveSettings();
        };
      }
      else if (config.validator === 'number') {
        setting.onChange = val => {
          if (Number.isNaN(Number(val))) return this.showToast('Value must be a number!', { type: 'error' });
          this.settings[config.id] = Number.parseInt(val);
          if (config.action && actions[config.action]) {
            actions[config.action](Number.parseInt(val));
          }
          this.saveSettings();
        };
      }
      else if (!setting.onChange) {
        setting.callback = val => {
          this.settings[config.id] = val;
          if (config.action && actions[config.action]) {
            actions[config.action](val);
          }
          this.saveSettings();
        };
      }
      return setting;
    };
    const list = settingsConfig.map(group => {
      return this.createGroup({
        name: group.name,
        id: this.obfuscatedClass(group.id),
        collapsible: group.collapsible,
        shown: group.shown,
        settings: group.settings.map(s => createSettingFromConfig(s))
      });
    });
    const div = document.createElement('div');
    div.id = this.obfuscatedClass('ml2-settings-buttonbox');
    div.style.display = 'inline-flex';
    div.appendChild(this.createButton('Stats', () => this.showStatsModal()));
    div.appendChild(
      this.createButton('Check for update now!', () => {
        this.checkNewUpdate(true);
      })
    );
    div.appendChild(
      this.createButton('Support server', () => UI.showInviteModal('e66JbKte2P'))
    );
    div.appendChild(this.createButton('Help', () => this.showLoggerHelpModal()));
    let button = div.firstElementChild;
    while (button) {
      button.style.marginRight = button.style.marginLeft = `5px`;
      button = button.nextElementSibling;
    }
    list.push(React.createElement(ReactUtils.wrapElement(div), { key: 'ml2-settings-buttons' }));
    return React.createElement("div", { className: "plugin-form-container" }, list);
  }
  saveSettings() {
    Data.save(this.getName(), 'settings', this.settings);
  }
  handleDataSaving() {
    if (!this.handleDataSaving.errorPageClass) {
      const errorPageModule = DiscordModules.ErrorPageClasses;
      this.handleDataSaving.errorPageClass = errorPageModule?.errorPage ? ('.' + errorPageModule.errorPage) : '.error-page-not-found';
    }
    if (!this.messageRecord || document.querySelector(this.handleDataSaving.errorPageClass)) return;
    if (!Object.keys(this.messageRecord).length) return Data.delete(this.getName() + 'Data', 'data');
    const callback = err => {
      if (err) {
        UI.showToast('There has been an error saving the data file', { type: "error" });
        Logger.error('There has been an error saving the data file', err);
      }
      if (this.settings.autoBackup) {
        if (this.saveBackupTimeout) this.autoBackupSaveInterupts++;
        if (this.autoBackupSaveInterupts < 4) {
          if (this.saveBackupTimeout) clearTimeout(this.saveBackupTimeout);
          this.saveBackupTimeout = setTimeout(() => this.saveBackup(), 20 * 1000);
        }
      }
      this.requestedDataSave = 0;
    };
    this.efficientlySaveData(this.getName() + 'Data', 'data', this._getDataPayload(), callback);
  }
  saveData() {
    if (!this.settings.dontSaveData && !this.requestedDataSave) this.requestedDataSave = setTimeout(() => this.handleDataSaving(), 1000);
  }
  async efficientlySaveData(name, key, data, callback) {
    try {
      let loadedData;
      try {
        loadedData = Data.load(name, key);
      } catch { }
      if (loadedData) for (const k in data) loadedData[k] = data[k];
      const filePath = this.nodeModules.path.join(this.pluginDir, `${name}.config.json`);
      const serializedData = JSON.stringify({ [key]: data });
      const fs = this.nodeModules.fs;
      if (fs?.promises?.writeFile) {
        await fs.promises.writeFile(filePath, serializedData, "utf8");
      } else if (typeof fs?.writeFile === "function") {
        await new Promise((resolve, reject) =>
          fs.writeFile(filePath, serializedData, "utf8", err => (err ? reject(err) : resolve()))
        );
      } else if (typeof fs?.writeFileSync === "function") {
        fs.writeFileSync(filePath, serializedData, "utf8");
      } else {
        throw new TypeError("No supported filesystem write method");
      }
      if (callback) callback(null);
    } catch (e) {
      UI.showToast('There has been an error saving the data file', { type: "error" });
      Logger.error('Error saving data file', e);
      if (callback) callback(e);
    }
  }
  saveBackup() {
    const callback = err => {
      if (err) {
        UI.showToast('There has been an error saving the data file', { type: "error" });
        Logger.error('Error saving backup file', err);
      }
      this.saveBackupTimeout = 0;
      this.autoBackupSaveInterupts = 0;
      if (!Data.load(this.getName() + 'DataBackup', 'data')?.messageRecord) this.saveBackupTimeout = setTimeout(() => this.saveBackup(), 300);
    };
    this.efficientlySaveData(this.getName() + 'DataBackup', 'data', this._getDataPayload(), callback);
  }
  parseHTML(html) {
    var template = document.createElement('template');
    html = html.trim();
    template.innerHTML = html;
    return template.content.firstChild;
  }
  randomString() {
    const rand = () => Math.random().toString(36).substring(2, 9);
    let start = rand();
    while (start[0].toUpperCase() == start[0].toLowerCase()) start = rand();
    return start + '-' + rand();
  }
  obfuscatedClass(selector) {
    if (!this.obfuscatedClass.obfuscations) this.obfuscatedClass.obfuscations = {};
    if (this.settings.obfuscateCSSClasses) {
      const { obfuscations } = this.obfuscatedClass;
      return obfuscations[selector] || (obfuscations[selector] = this.randomString());
    }
    return selector;
  }
  createTimeStamp(from = undefined, forcedDate = false) {
    let date;
    if (from) date = new Date(from);
    else date = new Date();
    if ((this.settings.displayDates || forcedDate) && forcedDate != -1) {
      return `${date.toLocaleTimeString()}, ${date.toLocaleDateString()}`;
    }
    if (forcedDate == -1) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleTimeString();
  }
  getCachedMessage(id, channelId = 0) {
    const cached = this.cachedMessagesMap.get(id);
    if (cached) return cached;
    if (channelId) return this.tools.getMessage(channelId, id);
    return null;
  }
  getEditedMessage(messageId, channelId) {
    if (this.editedMessageSet.get(channelId)?.has(messageId)) {
      return this.messageRecord[messageId];
    }
    return null;
  }
  getSavedMessage(id) {
    return this.messageRecord[id];
  }
  cleanupUserObject(user) {
    return {
      discriminator: user.discriminator,
      username: user.username,
      avatar: user.avatar,
      id: user.id,
      bot: user.bot,
      public_flags: user.publicFlags === undefined ? user.public_flags : user.publicFlags
    };
  }
  cleanupMessageObject(message) {
    let mentionEveryone;
    if (typeof message.mention_everyone === 'boolean') {
      mentionEveryone = message.mention_everyone;
    } else if (typeof message.mentionEveryone === 'boolean') {
      mentionEveryone = message.mentionEveryone;
    } else {
      mentionEveryone = false;
    }
    const ret = {
      mention_everyone: mentionEveryone,
      edited_timestamp: message.edited_timestamp || message.editedTimestamp && new Date(message.editedTimestamp).getTime() || null,
      attachments: message.attachments || [],
      channel_id: message.channel_id,
      reactions: (message.reactions || []).map(e => {
        if (!e.emoji.animated) delete e.emoji.animated;
        if (!e.me) delete e.me;
        return e;
      }),
      guild_id: message.guild_id || this.ChannelStore.getChannel(message.channel_id)?.guild_id,
      content: message.content,
      type: message.type,
      embeds: message.embeds || [],
      author: this.cleanupUserObject(message.author),
      mentions: (message.mentions || []).map(e => {
        if (typeof e === 'string') {
          const user = this.UserStore.getUser(e);
          return user ? this.cleanupUserObject(user) : { id: e, username: 'Unknown', discriminator: '0000', avatar: null };
        }
        return this.cleanupUserObject(e);
      }),
      mention_roles: message.mention_roles || message.mentionRoles || [],
      id: message.id,
      flags: message.flags,
      timestamp: new Date(message.timestamp).getTime(),
      referenced_message: null
    };
    if (ret.type === 19) {
      ret.message_reference = message.message_reference || message.messageReference;
      if (ret.message_reference) {
        if (message.referenced_message) {
          ret.referenced_message = this.cleanupMessageObject(message.referenced_message);
        } else {
          const refMsg = this.messageStore.getMessage(ret.message_reference.channel_id, ret.message_reference.message_id);
          if (refMsg) ret.referenced_message = this.cleanupMessageObject(refMsg);
        }
      }
    }
    this.fixEmbeds(ret);
    return ret;
  }
  createMiniFormattedData(message) {
    message = structuredClone(message);
    const obj = {
      message: this.cleanupMessageObject(message),
      local_mentioned: this.tools.isMentioned(message, this.localUser.id),
      delete_data: null,
      edit_history: null
    };
    return obj;
  }
  getSelectedTextChannel() {
    return this.ChannelStore.getChannel(DiscordModules.SelectedChannelStore?.getChannelId());
  }
  invalidateAllChannelCache() {
    for (let channelId in this.channelMessages) this.invalidateChannelCache(channelId);
  }
  invalidateChannelCache(channelId) {
    if (!this.channelMessages[channelId]) return;
    this.channelMessages[channelId].ready = false;
  }
  cacheChannelMessages(id, relative) {
    DiscordModules.MessageActions.fetchMessages({ channelId: id, limit: 50, jump: (relative && { messageId: relative, ML2: true }) || undefined });
  }
  formatMarkup(content, channelId) {
    if (!content) return null;
    try {
      const markup = document.createElement('div');
      if (!this.tools.parse) {
        Logger.warn('Parse function not available, using fallback');
        markup.textContent = content;
        return markup;
      }
      const parsed = this.tools.parse(content, true, channelId ? { channelId: channelId } : {});
      const root = ReactDOM.createRoot(markup);
      ReactDOM.flushSync(() => {
        root.render(React.createElement('div', { className: '' }, parsed));
      });
      markup.__react_root = root;
      const hiddenClass = this.classes.hidden;
      const hidden = markup.getElementsByClassName(hiddenClass);
      for (const el of Array.from(hidden)) {
        el.classList.remove(hiddenClass);
      }
      const child = markup.firstChild;
      let isCleanedUp = false;
      const cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        try {
          if (child && child.parentNode !== markup) {
            markup.appendChild(child);
          }
          if (markup.__react_root) {
            markup.__react_root.unmount();
            markup.__react_root = null;
          }
        } catch (e) { Logger.error('cleanup error:', e) }
        if (observer) observer.disconnect();
      };
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          const nodes = Array.from(mutation.removedNodes);
          const directMatch = nodes.includes(child);
          const parentMatch = nodes.some(parent => parent.contains?.(child));
          if (directMatch || parentMatch) {
            cleanup();
            break;
          }
        }
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      return child;
    } catch (e) {
      Logger.error('formatMarkup error:', e);
      const fallback = document.createElement('div');
      fallback.textContent = content;
      return fallback;
    }
  }
  showToast(content, options = {}) {
    const { type = '', icon = '', timeout = 3000, onClick = () => { }, onContext = () => { } } = options;
    let container = document.querySelector('.mlv2-toasts');
    if (!container) {
      container = document.createElement('div');
      container.className = 'mlv2-toasts';
      container.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 1000000;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        pointer-events: none;
      `;
      document.querySelector('#app-mount').appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'mlv2-toast';
    const typeConfig = {
      'success': { bg: '#43b581', icon: '\u2713' },
      'info': { bg: '#4a90e2', icon: '\u2139' },
      'warning': { bg: '#faa61a', icon: '\u26A0' },
      'error': { bg: '#f04747', icon: '\u2715' },
      'danger': { bg: '#f04747', icon: '\u2715' },
      '': { bg: '#7289da', icon: '' }
    };
    const config = typeConfig[type] || typeConfig[''];
    toast.style.cssText = `
      background-color: ${config.bg};
      color: white;
      padding: 14px 18px;
      margin-top: 10px;
      border-radius: 5px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      pointer-events: all;
      opacity: 0;
      transform: translateX(400px);
      transition: all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
      max-width: 360px;
      min-width: 200px;
      word-wrap: break-word;
      box-shadow: 0 3px 8px rgba(0, 0, 0, 0.25);
      display: flex;
      align-items: center;
      position: relative;
    `;
    let toastContent = '';
    if (icon || config.icon) {
      toastContent = `<span style="margin-right: 8px; font-size: 16px;">${icon || config.icon}</span>`;
    }
    toastContent += `<span style="flex: 1;">${content.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')}</span>`;
    toast.innerHTML = toastContent;
    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '\u2715';
    closeBtn.style.cssText = `
      margin-left: 12px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s;
      font-size: 16px;
    `;
    closeBtn.onmouseover = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseout = () => closeBtn.style.opacity = '0.7';
    toast.appendChild(closeBtn);
    if (timeout > 0) {
      const progressBar = document.createElement('div');
      progressBar.style.cssText = `
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background-color: rgba(255, 255, 255, 0.5);
        width: 100%;
        transform-origin: left;
        animation: mlv2-toast-progress ${timeout}ms linear forwards;
      `;
      toast.appendChild(progressBar);
      if (!document.querySelector('#mlv2-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'mlv2-toast-styles';
        style.textContent = `
          @keyframes mlv2-toast-progress {
            from { transform: scaleX(1); }
            to { transform: scaleX(0); }
          }
        `;
        document.head.appendChild(style);
      }
    }
    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(0)';
    });
    let timeoutId;
    let removeTimeoutId;
    const remove = () => {
      if (removeTimeoutId) return;
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(400px)';
      removeTimeoutId = setTimeout(() => {
        toast.remove();
        if (!container.children.length) {
          container.remove();
        }
      }, 300);
    };
    const clearTimeouts = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (removeTimeoutId) clearTimeout(removeTimeoutId);
    };
    if (timeout > 0) {
      timeoutId = setTimeout(remove, timeout);
    }
    const handleClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeouts();
      remove();
      onClick();
    };
    const handleRightClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeouts();
      remove();
      onContext();
    };
    const handleMiddleClick = (e) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        clearTimeouts();
        remove();
      }
    };
    toast.addEventListener('click', handleClick);
    toast.addEventListener('contextmenu', handleRightClick);
    toast.addEventListener('auxclick', handleMiddleClick);
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      clearTimeouts();
      remove();
    });
    if (timeout > 0) {
      toast.addEventListener('mouseenter', () => {
        clearTimeout(timeoutId);
      });
      toast.addEventListener('mouseleave', () => {
        timeoutId = setTimeout(remove, 2000);
      });
    }
    return toast;
  }
  _showNotification(title, content, type, actions, timeout = 4500) {
    if (this.settings.useNotificationsInstead) {
      UI.showNotification({
        title,
        content,
        type,
        duration: timeout,
        actions
      });
    } else {
      this.showToast(content, {
        type,
        onClick: actions?.[0]?.onClick,
        onContext: actions?.[1]?.onClick,
        timeout
      });
    }
  }
  _getChangedAttachments(oldAttachments, newAttachments, messageId, channelId, guildId) {
    const logged = this.messageRecord[messageId]?.logged_attachments ?? [];
    const changed = oldAttachments.filter(item =>
      !newAttachments.some(mod => mod.id === item.id)
    );
    let content = "";
    for (let i = 0; i < changed.length; i++) {
      if (logged.includes(changed[i].id)) continue;
      content += "`Attachment Deleted: `" + changed[i].url + "\n";
      if (this.settings.cacheAllImages) {
        this.cacheImage(changed[i].url, i, changed[i].id, messageId, channelId,
          this.settings.newCacheAllImages ? guildId : undefined);
      }
      logged.push(changed[i].id);
    }
    return { content, logged_attachments: logged };
  }
  _ensureChannelCached(channelId) {
    const channelMessages = this.channelMessages[channelId];
    if (!channelMessages?.ready) {
      this.cacheChannelMessages(channelId);
    }
  }
  _invalidateAndRecache(channelId) {
    this.invalidateChannelCache(channelId);
    this.cacheChannelMessages(channelId);
  }
  _openUserContextMenu(event, user, channel) {
    const targetModule = DiscordModules.UserContextMenuModule;
    const filterFunc2 = x2 => x2?.toString?.().includes("isGroupDM") && x2?.toString?.().includes("targetIsUser");
    Object.values(targetModule).find(filterFunc2)(event, user, channel || this.menu.randomValidChannel);
  }
  _addListToggleItems(newItems, id, listName, oppositeListName, displayName) {
    const list = this.settings[listName];
    const oppositeList = this.settings[oppositeListName];
    const idx = list.indexOf(id);
    const oppositeIdx = oppositeList.indexOf(id);
    const addElement = (label, action) => newItems.push({ label, action });
    if (idx === -1 && oppositeIdx === -1) {
      addElement(`Add to ${displayName}`, () => {
        list.push(id);
        this.saveSettings();
        this.showToast('Added!', { type: 'success' });
      });
      addElement(`Add to ${displayName.replace('Whitelist', 'Blacklist').replace('whitelist', 'blacklist')}`, () => {
        oppositeList.push(id);
        this.saveSettings();
        this.showToast('Added!', { type: 'success' });
      });
    } else if (idx === -1) {
      addElement(`Remove From ${displayName.replace('Whitelist', 'Blacklist').replace('whitelist', 'blacklist')}`, () => {
        oppositeList.splice(oppositeIdx, 1);
        this.saveSettings();
        this.showToast('Removed!', { type: 'success' });
      });
      addElement(`Move to ${displayName}`, () => {
        oppositeList.splice(oppositeIdx, 1);
        list.push(id);
        this.saveSettings();
        this.showToast('Moved!', { type: 'success' });
      });
    } else {
      addElement(`Remove From ${displayName}`, () => {
        list.splice(idx, 1);
        this.saveSettings();
        this.showToast('Removed!', { type: 'success' });
      });
      addElement(`Move to ${displayName.replace('Whitelist', 'Blacklist').replace('whitelist', 'blacklist')}`, () => {
        list.splice(idx, 1);
        oppositeList.push(id);
        this.saveSettings();
        this.showToast('Moved!', { type: 'success' });
      });
    }
  }
  _addToChannelSet(setMap, channelId, id) {
    if (!setMap.has(channelId)) setMap.set(channelId, new Set());
    setMap.get(channelId).add(id);
  }
  _getDataPayload() {
    return {
      messageRecord: this.messageRecord,
      deletedMessageRecord: this.deletedMessageRecord,
      editedMessageRecord: this.editedMessageRecord,
      purgedMessageRecord: this.purgedMessageRecord
    };
  }
  _shouldShowToast(channel, guild, toastType, isLocalUser = false) {
    if (!this.selectedChannel || this.selectedChannel.id !== channel.id) {
      const toggles = guild ? this.settings.toastToggles : this.settings.toastTogglesDMs;
      if (toggles[toastType]) {
        if (guild && isLocalUser && this.settings.toastToggles.disableToastsForLocal) return false;
        if (!guild && isLocalUser) return false;
        return true;
      }
    }
    return false;
  }
  _notifyEvent(eventType, channel, guild, messageId, options = {}) {
    const configs = {
      deleted: {
        title: "Message Deleted",
        getMessage: (name) => `Message deleted from ${name}`,
        type: "error",
        tab: "deleted"
      },
      edited: {
        title: "Message Edited",
        getMessage: (name) => `Message edited in ${name}`,
        type: "info",
        tab: "edited"
      },
      ghostPing: {
        title: "Ghost Ping",
        getMessage: (name) => `You got ghost pinged in ${name}`,
        type: "warning",
        tab: "ghostpings",
        timeout: 0
      },
      bulkDelete: {
        title: "Bulk Delete",
        getMessage: (name, count) => `${count} messages bulk deleted from ${name}`,
        type: "error",
        tab: "purged"
      },
      sent: {
        title: "Message Sent",
        getMessage: (name) => `Message sent in ${name}`,
        type: "info",
        tab: "sent"
      },
      editSpamBlocked: {
        title: "Edit Spam Blocked",
        getMessage: (_, __, username) => `Edit notifications from ${username} have been temporarily blocked for 1 minute.`,
        type: "warning",
        tab: null,
        timeout: 7500
      }
    };
    const config = configs[eventType];
    if (!config) return;
    const locationName = this.getLiteralName(channel.guild_id, channel.id);
    const message = config.getMessage(locationName, options.count, options.username);
    const timeout = config.timeout === undefined ? undefined : config.timeout;
    const actions = config.tab ? [
      { label: "View", onClick: () => this.openWindow(config.tab) },
      { label: "Jump", onClick: () => this.jumpToMessage(channel.id, messageId, guild?.id) }
    ] : [];
    this._showNotification(config.title, message, config.type, actions, timeout);
  }
  _sortMessagesById(messages) {
    messages.sort((a, b) => {
      const aId = BigInt(a.id);
      const bId = BigInt(b.id);
      if (aId > bId) return -1;
      if (aId < bId) return 1;
      return 0;
    });
  }
  clamp(val, min, max) {
    return Math.max(min, Math.min(val, max));
  }
  deleteEditedMessageFromRecord(id, editNum) {
    const record = this.messageRecord[id];
    if (!record) return;
    record.edit_history.splice(editNum, 1);
    if (record.edit_history.length) { return this.saveData(); }
    else { record.edit_history = null; }
    const channelId = record.message.channel_id;
    const channelMessages = this.editedMessageRecord[channelId];
    channelMessages.splice(
      channelMessages.indexOf(id),
      1
    );
    if (this.deletedMessageSet.get(channelId)?.has(id)) return this.saveData();
    if (this.purgedMessageSet.get(channelId)?.has(id)) return this.saveData();
    delete this.messageRecord[id];
    this.messageRecordIds.delete(id);
    this.saveData();
  }
  jumpToMessage(channelId, messageId, guildId) {
    if (this.menu.open) this.ModalStack.closeModal(this.style.menu);
    const historyModule = DiscordModules.HistoryUtils;
    if (historyModule) {
      const path = `/channels/${guildId || '@me'}/${channelId}${messageId ? '/' + messageId : ''}`;
      historyModule.getHistory().push(path);
    }
  }
  _cacheIncomingMessage(message) {
    if (this.cachedMessageIds.has(message.id)) return true;
    this.cachedMessageRecord.push(message);
    this.cachedMessageIds.add(message.id);
    this.cachedMessagesMap.set(message.id, message);
    return false;
  }
  _testUrlPattern(url, regex) {
    if (regex.test(url)) return true;
    try { return regex.test(new URL(url).pathname); } catch { return false; }
  }
  isImage(url) {
    return this._testUrlPattern(url, /\.(jpe?g|png|gif|bmp|webp)$/i);
  }
  isVideo(url) {
    return this._testUrlPattern(url, /\.(mp4|webm|mov|avi|mkv)$/i);
  }
  cleanupEmbed(embed) {
    if (!embed.id) return embed;
    const retEmbed = {};
    if (typeof embed.rawTitle === 'string') retEmbed.title = embed.rawTitle;
    if (typeof embed.rawDescription === 'string') retEmbed.description = embed.rawDescription;
    if (embed.referenceId !== undefined) retEmbed.reference_id = embed.referenceId;
    if (typeof embed.color === 'string') retEmbed.color = Number.parseInt(embed.color.replace('#', ''), 16);
    if (embed.type !== undefined) retEmbed.type = embed.type;
    if (embed.url !== undefined) retEmbed.url = embed.url;
    if (typeof embed.provider === 'object') retEmbed.provider = { name: embed.provider.name, url: embed.provider.url };
    if (typeof embed.footer === 'object') retEmbed.footer = { text: embed.footer.text, icon_url: embed.footer.iconURL, proxy_icon_url: embed.footer.iconProxyURL };
    if (typeof embed.author === 'object') retEmbed.author = { name: embed.author.name, url: embed.author.url, icon_url: embed.author.iconURL, proxy_icon_url: embed.author.iconProxyURL };
    if (typeof embed.timestamp === 'object' && embed.timestamp._isAMomentObject) retEmbed.timestamp = embed.timestamp.milliseconds();
    if (typeof embed.thumbnail === 'object') {
      if (typeof embed.thumbnail.proxy_url === 'string' || (typeof embed.thumbnail.url === 'string' && !embed.thumbnail.url.endsWith('?format=jpeg'))) {
        retEmbed.thumbnail = {
          url: embed.thumbnail.url,
          proxy_url: typeof embed.thumbnail.proxy_url === 'string' ? embed.thumbnail.proxy_url.split('?format')[0] : undefined,
          width: embed.thumbnail.width,
          height: embed.thumbnail.height
        };
      }
    }
    if (typeof embed.image === 'object') {
      retEmbed.image = {
        url: embed.image.url,
        proxy_url: embed.image.proxy_url,
        width: embed.image.width,
        height: embed.image.height
      };
    }
    if (typeof embed.video === 'object') {
      retEmbed.video = {
        url: embed.video.url,
        proxy_url: embed.video.proxy_url,
        width: embed.video.width,
        height: embed.video.height
      };
    }
    if (Array.isArray(embed.fields) && embed.fields.length) {
      retEmbed.fields = embed.fields.map(e => ({ name: e.rawName, value: e.rawValue, inline: e.inline }));
    }
    return retEmbed;
  }
  fixEmbeds(message) {
    message.embeds = message.embeds.map(this.cleanupEmbed);
  }
  addOpenLogsButton() {
    if (this.toolbarButtonCleanup) {
      this.toolbarButtonCleanup();
    }
    if (!this.settings.showOpenLogsButton) return;
    let button = null;
    const insertButton = () => {
      if (document.querySelector('.' + this.style.toolbarButton)) return true;
      const toolbar =
        document.querySelector('section [class*="search"]')?.parentElement ||
        document.querySelector('section [class*="toolbar"]');
      if (!toolbar) return false;
      const template = toolbar.querySelector('[class*="iconWrapper"]');
      if (!template) return false;
      button = template.cloneNode(true);
      button.classList.add(this.style.toolbarButton);
      button.setAttribute('aria-label', this.getName());
      button.setAttribute('role', 'button');
      button.setAttribute('tabindex', '0');
      button.title = `${this.getName()} - Left click: All logs | Right click: Current channel`;
      const svg = button.querySelector('svg');
      if (svg) {
        svg.setAttribute('viewBox', '0 0 576 512');
        svg.innerHTML = '<path fill="currentColor" d="M218.17 424.14c-2.95-5.92-8.09-6.52-10.17-6.52s-7.22.59-10.02 6.19l-7.67 15.34c-6.37 12.78-25.03 11.37-29.48-2.09L144 386.59l-10.61 31.88c-5.89 17.66-22.38 29.53-41 29.53H80c-8.84 0-16-7.16-16-16s7.16-16 16-16h12.39c4.83 0 9.11-3.08 10.64-7.66l18.19-54.64c3.3-9.81 12.44-16.41 22.78-16.41s19.48 6.59 22.77 16.41l13.88 41.64c19.75-16.19 54.06-9.7 66 14.16 1.89 3.78 5.49 5.95 9.36 6.26v-82.12l128-127.09V160H248c-13.2 0-24-10.8-24-24V0H24C10.7 0 0 10.7 0 24v464c0 13.3 10.7 24 24 24h336c13.3 0 24-10.7 24-24v-40l-128-.11c-16.12-.31-30.58-9.28-37.83-23.75zM384 121.9c0-6.3-2.5-12.4-7-16.9L279.1 7c-4.5-4.5-10.6-7-17-7H256v128h128v-6.1zm-96 225.06V416h68.99l161.68-162.78-67.88-67.88L288 346.96zm280.54-179.63l-31.87-31.87c-9.94-9.94-26.07-9.94-36.01 0l-27.25 27.25 67.88 67.88 27.25-27.25c9.95-9.94 9.95-26.07 0-36.01z"/>';
      }
      button.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.openWindow();
      };
      button.oncontextmenu = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.selectedChannel) {
          this.menu.filter = `channel:${this.selectedChannel.id}`;
        }
        this.openWindow();
      };
      const search = toolbar.querySelector('[class*="search"]');
      if (search) {
        search.before(button);
      } else {
        toolbar.appendChild(button);
      }
      return true;
    };
    if (!insertButton()) {
      const waitForToolbar = setInterval(() => {
        if (insertButton()) {
          clearInterval(waitForToolbar);
        }
      }, 1000);
      setTimeout(() => clearInterval(waitForToolbar), 10000);
    }
    this.toolbarObserver = new MutationObserver(() => {
      if (this.settings.showOpenLogsButton && !document.querySelector('.' + this.style.toolbarButton)) {
        insertButton();
      }
    });
    this.toolbarObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
    this.toolbarButtonCleanup = () => {
      if (this.toolbarObserver) {
        this.toolbarObserver.disconnect();
        this.toolbarObserver = null;
      }
      button?.remove();
      const existing = document.querySelector('.' + this.style.toolbarButton);
      if (existing) existing.remove();
    };
  }
  removeOpenLogsButton() {
    if (this.toolbarButtonCleanup) {
      this.toolbarButtonCleanup();
      this.toolbarButtonCleanup = null;
    }
  }
  showLoggerHelpModal(initial = false) {
    this.createModal({
      confirmText: 'OK',
      header: 'Logger help',
      size: this.tools.resolvedModalStuff.ModalSize.LARGE,
      confirmButtonColor: this.tools.buttonColors.BRAND,
      children: [
        this.tools.createWrappedElement([
          this.parseHTML(
            `<div class="${this.multiClasses.defaultColor}" style="max-height: 0; min-height: 60vh;">
                               ${initial ? '</br><span style="font-size: 40px;">As you are a <strong>first time user</strong>, you must know in order to have a server be logged, you must <strong>RIGHT CLICK</strong> a server or channel and add it to the whitelist.</br>Alternatively if this behavior is unwanted, you can always log all unmuted servers and channels by disabling <strong>Only log whitelist</strong> in logger settings under <strong>IGNORES AND OVERRIDES</strong>.</span></br></br>' : ''}
                               Hello! This is the ${this.getName()} help modal! You may at any time open this in plugin settings by clicking the help button, or in the menu by pressing the question mark button and then then Logger help button.</br>
                               <strong>Menu:</strong></br></br>
                                <div class="${this.style.textIndent}">
                                    DELETE + LEFT-CLICK:</br>
                                    <div class="${this.style.textIndent}">
                                        Clicking on a message, deletes the message</br>
                                        Clicking on an edit deletes that specific edit</br>
                                        Clicking on the timestamp deletes all messages in that message group
                                    </div></br>
                                    RIGHT-CLICK:</br>
                                    <div class="${this.style.textIndent}">
                                        Right-clicking the timestamp opens up options for the entire message group
                                    </div></br>
                                </div>
                                <strong>Toasts:</strong></br>
                                <div class="${this.style.textIndent}">
                                    Note: Little "notifications" in discord that tell you if a message was edited, deleted, purged etc are called Toasts!</br></br>
                                    LEFT-CLICK:</br>
                                    <div class="${this.style.textIndent}">
                                        Opens menu with the relevant tab</br>
                                    </div></br>
                                    RIGHT-CLICK:</br>
                                    <div class="${this.style.textIndent}">
                                        Jumps to relevant message in the relevant channel
                                    </div></br>
                                    MIDDLE-CLICK/SCROLLWHEEL-CLICK:</br>
                                    <div class="${this.style.textIndent}">
                                        Only dismisses/closes the Toast.
                                    </div></br>
                                </div>
                                <strong>Notifications:</strong></br>
                                <div class="${this.style.textIndent}">
                                    Note: They show in the bottom right corner and are called Custom notifications. Can be enabled in Settings > Display Settings, all the way at the bottom.</br></br>
                                    LEFT-CLICK:</br>
                                    <div class="${this.style.textIndent}">
                                        Opens menu with the relevant tab</br>
                                    </div></br>
                                    RIGHT-CLICK:</br>
                                    <div class="${this.style.textIndent}">
                                        Jumps to relevant message in the relevant channel
                                    </div></br>
                                </div>
                                <strong>Open Logs button (top right next to search):</strong></br>
                                <div class="${this.style.textIndent}">
                                    LEFT-CLICK:</br>
                                    <div class="${this.style.textIndent}">
                                        Opens menu</br>
                                    </div></br>
                                    RIGHT-CLICK:</br>
                                    <div class="${this.style.textIndent}">
                                        Opens filtered menu that only shows messages from selected channel</br>
                                    </div></br>
                                </div>
                                <strong>Whitelist/blacklist, ignores and overrides:</strong></br>
                                <div class="${this.style.textIndent}">
                                    WHITELIST-ONLY:</br>
                                    <div class="${this.style.textIndent}">
                                        All servers are ignored unless whitelisted</br>
                                        Muted channels in whitelisted servers are ignored unless whitelisted or "Ignore muted channels" is disabled</br>
                                        All channels in whitelisted servers are logged unless blacklisted, or muted and "Ignore muted channels" is enabled
                                    </div></br>
                                    DEFAULT:</br>
                                    <div class="${this.style.textIndent}">
                                        All servers are logged unless blacklisted or muted and "Ignore muted servers" is enabled</br>
                                        Muted channels are ignored unless whitelisted or "Ignore muted channels" is disabled</br>
                                        Muted servers are ignored unless whitelisted or "Ignore muted servers" is disabled</br>
                                        Whitelisted channels in muted or blacklisted servers are logged</br>
                                    </div></br>
                                    ALL:</br>
                                    <div class="${this.style.textIndent}">
                                        Whitelisted channels in blacklisted servers are logged</br>
                                        Blacklisted channels in whitelisted servers are ignored</br>
                                        "Always log selected channel" overrides blacklist, whitelist-only mode, NSFW channel ignore, mute</br>
                                        "Always log DMs" overrides blacklist as well as whitelist-only mode</br>
                                        Channels marked NSFW and not whitelisted are ignored unless "Ignore NSFW channels" is disabled
                                    </div></br>
                                </div>
                                <strong>Chat:</strong></br>
                                <div class="${this.style.textIndent}">
                                    RIGHT-CLICK:</br>
                                    <div class="${this.style.textIndent}">
                                        Right-clicking an edit (darkened text) allows you to delete that edit, or hide edits</br>
                                        Right-clicking on a edited or deleted message gives you the option to hide the deleted message or hide or unhide edits, remove the edited or deleted message from log and remove deleted tint which makes the message look like it isn't deleted.
                                    </div></br>
                                </div>
                            </div>`
          )
        ])
      ],
    });
  }
  showStatsModal() {
    const elements = [];
    const totalMessages = Object.keys(this.messageRecord).length;
    const messageCounts = [];
    let mostDeletesChannel = { num: 0, id: '' };
    let mostEditsChannel = { num: 0, id: '' };
    const deleteDataTemp = {};
    const editDataTemp = {};
    for (const map of [this.deletedMessageRecord, this.editedMessageRecord, this.cachedMessageRecord]) {
      let messageCount = 0;
      if (!Array.isArray(map)) {
        for (const channelId in map) {
          if (!deleteDataTemp[channelId]) deleteDataTemp[channelId] = [];
          if (!editDataTemp[channelId]) editDataTemp[channelId] = [];
          for (const messageId of map[channelId]) {
            messageCount++;
            const record = this.messageRecord[messageId];
            if (!record) continue;
            if (record.delete_data && deleteDataTemp[channelId].indexOf(messageId)) deleteDataTemp[channelId].push(messageId);
            if (record.edit_history && editDataTemp[channelId].indexOf(messageId)) editDataTemp[channelId].push(messageId);
          }
        }
      }
      for (const channelId in deleteDataTemp) if (deleteDataTemp[channelId].length > mostDeletesChannel.num) mostDeletesChannel = { num: deleteDataTemp[channelId].length, id: channelId };
      for (const channelId in editDataTemp) if (editDataTemp[channelId].length > mostEditsChannel.num) mostEditsChannel = { num: editDataTemp[channelId].length, id: channelId };
      messageCounts.push(messageCount);
    }
    const addLine = (name, value) => {
      elements.push(this.parseHTML(`<div class="${this.multiClasses.defaultColor}"><strong>${name}</strong>: ${value}</div></br>`));
    };
    addLine('Total messages', totalMessages);
    addLine('Deleted message count', messageCounts[0]);
    addLine('Edited message count', messageCounts[1]);
    addLine('Sent message count', this.cachedMessageRecord.length);
    const channel = this.tools.getChannel(mostDeletesChannel.id);
    if (channel) addLine('Most deletes', mostDeletesChannel.num + ' ' + this.getLiteralName(channel.guild_id, channel.id));
    if (channel) addLine('Most edits', mostEditsChannel.num + ' ' + this.getLiteralName(channel.guild_id, channel.id));
    this.createModal({
      confirmText: 'OK',
      header: 'Data stats',
      confirmButtonColor: this.tools.buttonColors.BRAND,
      size: this.tools.resolvedModalStuff.ModalSize.SMALL,
      children: [this.tools.createWrappedElement(elements)],
    });
  }
  _unregisterMessageCallback(msgId, callback) {
    const callbacks = this._messageUpdateRegistry.get(msgId);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) this._messageUpdateRegistry.delete(msgId);
    }
  }
  _getSortedMessageIds(channelId, isPurged = false) {
    const cache = isPurged ? this.sortedPurgedMessageIds : this.sortedDeletedMessageIds;
    const source = isPurged ? this.purgedMessageRecord : this.deletedMessageRecord;
    if (!cache.has(channelId)) {
      const ids = source[channelId];
      if (!ids?.length) {
        cache.set(channelId, []);
        return [];
      }
      const sorted = [...ids].sort((a, b) => {
        const aId = BigInt(a);
        const bId = BigInt(b);
        if (aId > bId) return 1;
        if (aId < bId) return -1;
        return 0;
      });
      cache.set(channelId, sorted);
    }
    return cache.get(channelId);
  }
  _binarySearchSnowflakeIndex(sortedIds, targetTime, findLower = true) {
    let left = 0;
    let right = sortedIds.length - 1;
    let result = findLower ? sortedIds.length : -1;
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midTime = (Number(sortedIds[mid]) / 4194304) + DISCORD_EPOCH;
      if (findLower) {
        if (midTime > targetTime) {
          result = mid;
          right = mid - 1;
        } else {
          left = mid + 1;
        }
      } else if (midTime < targetTime) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }
    return result;
  }
  reAddDeletedMessages(messages, deletedMessages, channelStart, channelEnd) {
    if (!deletedMessages.length) return;
    const existingMessageIds = new Set(messages.map(e => e.id));
    const lowestTime = messages.length ? (Number(messages[messages.length - 1].id) / 4194304) + DISCORD_EPOCH : Infinity;
    const highestTime = messages.length ? (Number(messages[0].id) / 4194304) + DISCORD_EPOCH : 0;
    const ensureUserCleaned = (record) => {
      if (record._usersCleaned) return;
      const message = record.message;
      const author = this.tools.getUser(message.author.id);
      if (author) message.author = this.cleanupUserObject(author);
      for (let j = 0; j < message.mentions.length; j++) {
        const user = message.mentions[j];
        const realUser = this.tools.getUser(user.id || user);
        if (realUser) message.mentions[j] = this.cleanupUserObject(realUser);
      }
      record._usersCleaned = true;
    };
    const processId = (id, toInsert) => {
      if (existingMessageIds.has(id)) return;
      const record = this.messageRecord[id];
      if (!record) return;
      if (!record.delete_data) {
        this.deleteMessageFromRecords(id);
        return;
      }
      if (record.delete_data.hidden) return;
      ensureUserCleaned(record);
      toInsert.push(record.message);
    };
    const toInsert = [];
    if (deletedMessages.length >= 100 && !channelStart && !channelEnd) {
      const channelId = messages[0].channel_id;
      const isPurged = deletedMessages === this.purgedMessageRecord[channelId];
      const sortedIds = this._getSortedMessageIds(channelId, isPurged);
      if (sortedIds.length >= 100) {
        const startIdx = this._binarySearchSnowflakeIndex(sortedIds, lowestTime, true);
        const endIdx = this._binarySearchSnowflakeIndex(sortedIds, highestTime, false);
        for (let i = startIdx; i <= endIdx && i < sortedIds.length; i++) {
          processId(sortedIds[i], toInsert);
        }
        if (toInsert.length) {
          messages.push(...toInsert);
          this._sortMessagesById(messages);
        }
        return;
      }
    }
    for (let i = 0, len = deletedMessages.length; i < len; i++) {
      const id = deletedMessages[i];
      const time = (Number(id) / 4194304) + DISCORD_EPOCH;
      const inLowerRange = channelEnd || time > lowestTime;
      const inUpperRange = channelStart || time < highestTime;
      if (!inLowerRange || !inUpperRange) continue;
      processId(id, toInsert);
    }
    if (!toInsert.length) return;
    messages.push(...toInsert);
    this._sortMessagesById(messages);
  }
  getLiteralName(guildId, channelId, useTags = false) {
    const guild = this.tools.getServer(guildId);
    const channel = this.tools.getChannel(channelId);
    if (guildId) {
      const channelName = (channel ? channel.name : 'unknown-channel');
      const guildName = (guild ? guild.name : 'unknown-server');
      if (useTags && channel) return `${guildName}, <#${channel.id}>`;
      return `${guildName}, #${channelName}`;
    } else if (channel?.name.length) {
      return `group ${channel.name}`;
    } else if (channel?.type == 3) {
      let finalGroupName = '';
      for (let i of channel.recipients) {
        const user = this.tools.getUser(i);
        if (!user) continue;
        if (useTags) finalGroupName += ', <@' + user.id + '>';
        else finalGroupName += ',' + user.username;
      }
      if (finalGroupName.length) {
        finalGroupName = finalGroupName.substring(1);
        if (useTags) return `group ${finalGroupName}`;
        finalGroupName = finalGroupName.length > 10 ? finalGroupName.substring(0, 9) + '...' : finalGroupName;
        return `group ${finalGroupName}`;
      } else {
        return 'unknown group';
      }
    } else if (channel?.recipients) {
      const user = this.tools.getUser(channel.recipients[0]);
      if (!user) return 'DMs';
      if (useTags) return `<@${user.id}> DMs`;
      return `${user.username} DMs`;
    } else {
      return 'DMs';
    }
  }
  saveDeletedMessage(message, targetMessageRecord) {
    const result = this.createMiniFormattedData(message);
    result.delete_data = {};
    const id = message.id;
    const channelId = message.channel_id;
    result.delete_data.time = Date.now();
    result.ghost_pinged = result.local_mentioned;
    if (!Array.isArray(targetMessageRecord[channelId])) targetMessageRecord[channelId] = [];
    if (this.messageRecord[id]) {
      const record = this.messageRecord[id];
      record.delete_data = result.delete_data;
      record.ghost_pinged = result.ghost_pinged;
    } else {
      this.messageRecord[id] = result;
      this.messageRecordIds.add(id);
    }
    if (this.messageRecord[id].message.attachments) {
      const attachments = this.messageRecord[id].message.attachments;
      for (const attachment of attachments) {
        attachment.url = attachment.proxy_url;
      }
    }
    if (this.messageRecord[id].message.embeds) {
      const embeds = this.messageRecord[id].message.embeds;
      for (const embed of embeds) {
        if (embed.image)
          embed.image.url = embed.image.proxy_url;
      }
    }
    if (this.settings.cacheAllImages) this.cacheMessageImages(this.messageRecord[id].message);
    targetMessageRecord[channelId].push(id);
    const sortedCache = targetMessageRecord === this.deletedMessageRecord ? this.sortedDeletedMessageIds : this.sortedPurgedMessageIds;
    sortedCache.delete(channelId);
    const targetSet = targetMessageRecord === this.deletedMessageRecord ? this.deletedMessageSet : this.purgedMessageSet;
    this._addToChannelSet(targetSet, channelId, id);
  }
  createButton(label, callback) {
    const classes = this.createButton.classes;
    const ret = this.parseHTML(`<button type="button" class="${classes.button}"><div class="${classes.buttonContents}">${label}</div></button>`);
    if (callback) ret.addEventListener('click', callback);
    return ret;
  }
  getKeyByValue(obj, value) {
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && obj[key] === value) {
        return key;
      }
    }
  }
  createModal(options, image, name) {
    const ModalActions = this.ModalStack;
    const item = options.items?.[0] || options;
    const isVideo = item.type === "VIDEO";
    if (isVideo) {
      ModalActions.openModal(props =>
        React.createElement(
          this.tools.manaModule.Modal,
          {
            ...props,
            size: this.tools.resolvedModalStuff.ModalSize.LARGE,
            style: { padding: 0, backgroundColor: 'transparent' }
          },
          React.createElement('div', {
            style: {
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              borderRadius: '8px',
              padding: '8px'
            }
          },
            React.createElement('video', {
              src: item.url || item.src,
              controls: true,
              autoPlay: true,
              style: {
                maxWidth: '90vw',
                maxHeight: '80vh',
                borderRadius: '4px'
              }
            })
          )
        ), { modalKey: name }
      );
      return;
    }
    if (image) {
      const nativeModal = this.tools.getNativeMediaModal();
      if (nativeModal?.openMediaModal) {
        const items = options.items || [options];
        const nativeItems = items.map(item => ({
          url: item.url || item.src || item.original,
          proxyUrl: item.url || item.src || item.original,
          width: item.width || 0,
          height: item.height || 0,
          type: "IMAGE"
        }));
        nativeModal.openMediaModal({
          items: nativeItems,
          startingIndex: 0,
          location: this.getName()
        });
        return;
      }
      if (!this.createModal.imageModal || this.createModal.imageModal.toString().includes("Image Modal failed")) {
        this.createModal.imageModal = this.tools.findImageModal() ?? this.createModal.imageModal;
      }
      if (!this.createModal.imageModal) {
        Logger.error('Image modal not found, cannot display image');
        return;
      }
      const imageProps = {
        src: item.url || item.src,
        original: item.original || item.url || item.src,
        placeholder: item.placeholder || item.url || item.src,
        width: item.width,
        height: item.height,
        animated: item.animated || false,
        renderLinkComponent: this.tools.renderLinkComponent,
        renderForwardComponent: () => null,
        shouldAnimate: true
      };
      ModalActions.openModal(props =>
        React.createElement(
          this.tools.manaModule.Modal,
          { ...props, size: this.tools.resolvedModalStuff.ModalSize.DYNAMIC },
          React.createElement(this.createModal.imageModal,
            { ...imageProps, ...props, ...(options.onClose ? { onClose: options.onClose } : {}) }
          )
        ), { modalKey: name }
      );
      return;
    }
    if (options.ml2Data) {
      ModalActions.openModal(props => {
        const actions = [];
        if (options.confirmText) {
          actions.push({
            text: options.confirmText,
            variant: options.confirmButtonColor === Components.Button.Colors.BRAND ? "primary" : "critical-primary",
            onClick: () => { options.onConfirm?.(); },
          });
        }
        if (options.cancelText) {
          actions.push({
            text: options.cancelText,
            variant: "secondary",
            onClick: () => { options.onCancel?.(); },
          });
        }
        return React.createElement(this.tools.manaModule.Modal, {
          ...props,
          size: options.size,
          title: options.header,
          actions,
          actionBarInput: false,
          children: options.children,
        });
      }, { modalKey: name });
      if (options.className) {
        requestAnimationFrame(() => {
          const containers = document.querySelectorAll('[data-mana-component="modal"]');
          const container = containers[containers.length - 1];
          if (container) container.classList.add(options.className);
        });
      }
    } else {
      const isCritical = !options.confirmButtonColor || options.confirmButtonColor === Components.Button.Colors.RED;
      ModalActions.openModal(props => {
        return React.createElement(this.tools.manaModule.ConfirmModal, {
          ...props,
          size: options.size,
          title: options.header,
          confirmText: options.confirmText,
          cancelText: options.cancelText,
          onConfirm: options.onConfirm,
          onCancel: options.onCancel ?? props.onClose,
          variant: isCritical ? "critical" : undefined,
          children: options.children,
        });
      }, { modalKey: name });
    }
  }
  getMessageAny(id) {
    const record = this.messageRecord[id];
    if (!record) return this.cachedMessageRecord.find(m => m.id == id);
    return record.message;
  }
  async cacheImage(url, attachmentIdx, attachmentId, messageId, channelId, serverId, attempts = 0) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        if (response.status === 404 || response.status === 403) {
          Logger.warn(`Image ${attachmentId} unavailable (${response.status}), skipping cache`);
          return;
        }
        attempts++;
        if (attempts > 3) {
          Logger.warn(`Failed to get image ${attachmentId} for caching, error code ${response.status}`);
          return;
        }
        return setTimeout(() => this.cacheImage(url, attachmentIdx, attachmentId, messageId, channelId, serverId, attempts), 1000);
      }
      const arrayBuffer = await response.arrayBuffer();
      const finalData = new Uint8Array(arrayBuffer);
      let match = /\.[0-9a-z]+$/i.exec(new URL(url).pathname);
      if (match == null) {
        match = [this.contentTypeToExtension(response.headers.get("content-type"))];
      }
      const fileExtension = match[0];
      if (!fileExtension) {
        Logger.warn(`Could not determine file extension for ${attachmentId}, skipping cache`);
        return;
      }
      if (!Number(attachmentId)) attachmentId = messageId;
      if (this.settings.newCacheAllImages === true) {
        const filePath = this.imageCacheServerSimulator.resolveNewCachePath({ channelId: channelId, serverId: serverId });
        this.nodeModules.fs.mkdirSync(filePath, { recursive: true });
        this.nodeModules.fs.writeFileSync(filePath + `/${attachmentId} (${messageId}${(this.settings.addUserIdToSavedMediaFilename && this.messageRecord[messageId]?.message?.author?.id) ? (" by " + this.messageRecord[messageId].message.author.id) : ""
        })${fileExtension}`, finalData, { encoding: null });
      }
      else {
        this.nodeModules.fs.writeFileSync(this.settings.imageCacheDir + `/${attachmentId}${fileExtension}`, finalData, { encoding: null });
      }
      Logger.log(`Cached image: ${attachmentId}${fileExtension}`);
    } catch (e) {
      attempts++;
      if (attempts > 3) {
        Logger.error(`Failed to cache image ${attachmentId}:`, e.message);
        return;
      }
      setTimeout(() => this.cacheImage(url, attachmentIdx, attachmentId, messageId, channelId, serverId, attempts), 1000);
    }
  }
  contentTypeToExtension(contentType) {
    const extensionMap = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/mpeg': '.mpeg',
      'audio/mpeg': '.mp3',
    };
    if (contentType in extensionMap) {
      return extensionMap[contentType];
    }
    return '';
  }
  cacheMessageImages(message) {
    setTimeout(() => {
      const attachments = message.attachments || [];
      const embeds = message.embeds || [];
      for (let i = 0; i < attachments.length; i++) {
        const attachment = attachments[i];
        const maxSize = this.settings.maxCacheFileSize * 1024 * 1024;
        if (maxSize > 0 && attachment.size && attachment.size > maxSize) {
          Logger.log(`Skipping cache for ${attachment.filename}: ${(attachment.size / 1024 / 1024).toFixed(2)}MB exceeds limit`);
          continue;
        }
        if (this.isImage(attachment.url) || this.settings.newSaveAllFileTypes) {
          this.cacheImage(attachment.url, i, attachment.id, message.id, message.channel_id, this.settings.newCacheAllImages === true ? message.guild_id : undefined);
        }
      }
      for (let i = 0; i < embeds.length; i++) {
        if (!embeds[i].image) continue;
        const embed = embeds[i].image;
        this.cacheImage(embed.url, i, embed.url.split("/")[embed.url.split("/").length - 2], message.id, message.channel_id, this.settings.newCacheAllImages === true ? message.guild_id : undefined);
      }
    }, 0);
  }
  deleteMessageFromRecords(id) {
    const record = this.messageRecord[id];
    const setMaps = [this.deletedMessageSet, this.editedMessageSet, this.purgedMessageSet];
    if (!record) {
      for (let i = 0; i < 3; i++) {
        const map = [this.deletedMessageRecord, this.editedMessageRecord, this.purgedMessageRecord][i];
        const setMap = setMaps[i];
        for (let channelId in map) {
          const index = map[channelId].indexOf(id);
          if (index == -1) continue;
          map[channelId].splice(index, 1);
          setMap.get(channelId)?.delete(id);
          if (!map[channelId].length) {
            delete map[channelId];
            setMap.delete(channelId);
          }
        }
      }
      return;
    }
    const channelId = record.message.channel_id;
    for (let i = 0; i < 3; i++) {
      const map = [this.deletedMessageRecord, this.editedMessageRecord, this.purgedMessageRecord][i];
      const setMap = setMaps[i];
      if (!map[channelId]) continue;
      const index = map[channelId].indexOf(id);
      if (index == -1) continue;
      map[channelId].splice(index, 1);
      setMap.get(channelId)?.delete(id);
      if (!map[channelId].length) {
        delete map[channelId];
        setMap.delete(channelId);
      }
    }
    delete this.messageRecord[id];
    this.messageRecordIds.delete(id);
  }
  handleMessagesCap() {
    try {
      const extractAllMessageIds = map => {
        const ret = [];
        for (let channelId in map) {
          for (let messageId of map[channelId]) {
            ret.push(messageId);
          }
        }
        return ret;
      };
      if (this.cachedMessageRecord.length > this.settings.messageCacheCap) {
        const removed = this.cachedMessageRecord.splice(0, this.cachedMessageRecord.length - this.settings.messageCacheCap);
        for (const msg of removed) {
          this.cachedMessageIds.delete(msg.id);
          this.cachedMessagesMap.delete(msg.id);
        }
      }
      let changed = false;
      const deleteMessages = map => {
        this.sortMessagesByAge(map);
        const toDelete = map.length - this.settings.savedMessagesCap;
        for (let i = map.length - 1, deleted = 0; i >= 0 && deleted != toDelete; i--, deleted++) {
          this.deleteMessageFromRecords(map[i]);
        }
        changed = true;
      };
      const handleInvalidEntries = (map, setMap) => {
        for (let channelId in map) {
          for (let messageIdIdx = map[channelId].length - 1; messageIdIdx >= 0; messageIdIdx--) {
            if (!Array.isArray(map[channelId])) {
              delete map[channelId];
              setMap.delete(channelId);
              changed = true;
              continue;
            }
            const messageId = map[channelId][messageIdIdx];
            if (!this.messageRecord[messageId]) {
              map[channelId].splice(messageIdIdx, 1);
              setMap.get(channelId)?.delete(messageId);
              changed = true;
            }
          }
          if (!map[channelId].length) {
            delete map[channelId];
            setMap.delete(channelId);
            changed = true;
          }
        }
      };
      handleInvalidEntries(this.deletedMessageRecord, this.deletedMessageSet);
      handleInvalidEntries(this.editedMessageRecord, this.editedMessageSet);
      handleInvalidEntries(this.purgedMessageRecord, this.purgedMessageSet);
      const deletedMessages = extractAllMessageIds(this.deletedMessageRecord);
      const editedMessages = extractAllMessageIds(this.editedMessageRecord);
      const purgedMessages = extractAllMessageIds(this.purgedMessageRecord);
      for (let map of [deletedMessages, editedMessages, purgedMessages]) if (map.length > this.settings.savedMessagesCap) deleteMessages(map);
      if (changed) this.saveData();
      if (!this.settings.cacheAllImages) return;
      for (let id in this.editHistoryAntiSpam) if (Date.now() - this.editHistoryAntiSpam[id].times[0] < 10 * 60 * 1000) delete this.editHistoryAntiSpam[id];
    } catch (e) {
      Logger.error('Error clearing out data', e);
    }
  }
  onDispatchEvent(args, callDefault) {
    const dispatch = args[0];
    let ret = Promise.resolve();
    if (!dispatch) return callDefault(...args);
    try {
      if (dispatch.type === 'CHANNEL_SELECT') {
        ret = callDefault(...args);
        this.selectedChannel = this.getSelectedTextChannel();
        return ret;
      }
      if (dispatch.ML2 && dispatch.type === 'MESSAGE_DELETE') return callDefault(...args);
      if (dispatch.type !== 'MESSAGE_CREATE' && dispatch.type !== 'MESSAGE_DELETE' && dispatch.type !== 'MESSAGE_DELETE_BULK' && dispatch.type !== 'MESSAGE_UPDATE' && dispatch.type !== 'LOAD_MESSAGES_SUCCESS') return callDefault(...args);
      if (dispatch.message && (dispatch.message.type !== 0 && dispatch.message.type !== 19 && (dispatch.message.type !== 20 || (dispatch.message.flags & 64) === 64))) return callDefault(...args);
      const channel = this.tools.getChannel(dispatch.message ? dispatch.message.channel_id : dispatch.channelId);
      if (!channel) return callDefault(...args);
      const guild = channel.guild_id ? this.tools.getServer(channel.guild_id) : false;
      let author = dispatch.message?.author ? this.tools.getUser(dispatch.message.author.id) : false;
      if (!author) author = this.channelMessages[channel.id]?._map?.[dispatch.message?.id ?? dispatch.id]?.author;
      if (!author) {
        let message = this.getCachedMessage(dispatch.id);
        if (message) author = this.tools.getUser(message.author.id);
      }
      if (!author && !(dispatch.type == 'LOAD_MESSAGES_SUCCESS' || dispatch.type == 'MESSAGE_DELETE_BULK')) return callDefault(...args);
      const isLocalUser = author && author.id === this.localUser.id;
      if (author?.bot && this.settings.ignoreBots) return callDefault(...args);
      if (author && isLocalUser && this.settings.ignoreSelf) return callDefault(...args);
      if (author && this.settings.ignoreBlockedUsers && this.tools.isBlocked(author.id) && !isLocalUser) return callDefault(...args);
      if (author?.avatar === 'clyde') return callDefault(...args);
      if (this.settings.ignoreLocalEdits && dispatch.type === 'MESSAGE_UPDATE' && isLocalUser) return callDefault(...args);
      if (this.settings.ignoreLocalDeletes && dispatch.type === 'MESSAGE_DELETE' && isLocalUser && this.localDeletes.includes(dispatch.id)) return callDefault(...args);
      let guildIsMutedReturn = false;
      let channelIgnoreReturn = false;
      const isInWhitelist = id => this.settings.whitelist.includes(id);
      const isInBlacklist = id => this.settings.blacklist.includes(id);
      const guildWhitelisted = guild && isInWhitelist(guild.id);
      const channelWhitelisted = isInWhitelist(channel.id);
      const guildBlacklisted = guild && isInBlacklist(guild.id);
      const channelBlacklisted = isInBlacklist(channel.id);
      let doReturn = false;
      if (guild) {
        guildIsMutedReturn = this.settings.ignoreMutedGuilds && this.muteModule.isMuted(guild.id);
        channelIgnoreReturn = (this.settings.ignoreNSFW && channel.nsfw && !channelWhitelisted) || (this.settings.ignoreMutedChannels && (this.muteModule.isChannelMuted(guild.id, channel.id) || (channel.parent_id && this.muteModule.isChannelMuted(guild.id, channel.parent_id))));
      }
      let editOrDel = 0;
      if (dispatch.type == 'MESSAGE_DELETE') editOrDel = 1;
      else if (dispatch.type == 'MESSAGE_UPDATE') editOrDel = 2;
      if (editOrDel != 0 && (this.settings.notificationBlacklist.includes(channel.id) || (guild && this.settings.notificationBlacklist.includes(guild.id))) && ((this.settings.alwaysNotifChannel && this.selectedChannel && this.selectedChannel.id == channel.id) || (this.settings.alwaysNotifGuild && guild && this.selectedChannel.guild_id == guild.id))) {
        const shouldNotifyLocal = !isLocalUser || (guild && !this.settings.toastToggles.disableToastsForLocal);
        if (editOrDel == 1 && (guild ? this.settings.toastToggles.deleted && shouldNotifyLocal : this.settings.toastTogglesDMs.deleted && !isLocalUser)) {
          this._notifyEvent('deleted', channel, guild, dispatch.id);
        } else if (editOrDel == 2 && (guild ? this.settings.toastToggles.edited && shouldNotifyLocal : this.settings.toastTogglesDMs.edited && !isLocalUser)) {
          this._notifyEvent('edited', channel, guild, dispatch.message.id);
        }
      }
      if (!((this.settings.alwaysLogSelected && this.selectedChannel && this.selectedChannel.id == channel.id) || (this.settings.alwaysLogDM && !guild))) {
        if (guildBlacklisted) {
          if (!channelWhitelisted) doReturn = true;
        } else if (guildWhitelisted) {
          if (channelBlacklisted) doReturn = true;
          if (channelIgnoreReturn && !channelWhitelisted) doReturn = true;
        } else if (this.settings.onlyLogWhitelist) {
          if (!channelWhitelisted) doReturn = true;
        } else if (channelBlacklisted) {
          doReturn = true;
        } else if (channelIgnoreReturn || guildIsMutedReturn) {
          if (!channelWhitelisted) doReturn = true;
        }
      }
      if (doReturn && this.settings.alwaysLogGhostPings) {
        if (dispatch.type === 'MESSAGE_DELETE') {
          const deleted = this.tempEditedMessageRecord[dispatch.id]?.message || this.getCachedMessage(dispatch.id, dispatch.channelId);
          if (!deleted || (deleted.type !== 0 && deleted.type !== 19 && deleted.type !== 20)) return callDefault(...args);
          if (deleted.flags == 64) return callDefault(...args);
          if (!this.tools.isMentioned(deleted, this.localUser.id)) return callDefault(...args);
          const record = this.messageRecord[dispatch.id];
          if (this._shouldShowToast(channel, guild, 'ghostPings') && !record?.ghost_pinged) {
            this._notifyEvent('ghostPing', channel, guild, dispatch.id);
          }
          this.saveDeletedMessage(deleted, this.deletedMessageRecord);
          this.saveData();
          if (DiscordModules.SelectedChannelStore?.getChannelId() === dispatch.channelId) this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE', id: dispatch.id });
        } else if (dispatch.type === 'MESSAGE_UPDATE') {
          if (!dispatch.message.edited_timestamp) {
            if (dispatch.message.embeds) {
              const last = this.getCachedMessage(dispatch.message.id);
              if (last) last.embeds = dispatch.message.embeds.map(this.cleanupEmbed);
            }
            return callDefault(...args);
          }
          const isSaved = this.getEditedMessage(dispatch.message.id, channel.id);
          const last = this.getCachedMessage(dispatch.message.id, channel.id);
          const lastEditedSaved = isSaved || this.tempEditedMessageRecord[dispatch.message.id];
          if (!last && !lastEditedSaved) return callDefault(...args);
          if (isSaved && !lastEditedSaved.local_mentioned) {
            lastEditedSaved.message.content = dispatch.message.content;
            return callDefault(...args);
          }
          let ghostPinged = false;
          if (lastEditedSaved) {
            if (lastEditedSaved.message.content === dispatch.message.content) return callDefault(...args);
            lastEditedSaved.edit_history.push({
              content: lastEditedSaved.message.content,
              time: Date.now()
            });
            lastEditedSaved.message.content = dispatch.message.content;
            ghostPinged = !lastEditedSaved.ghost_pinged && lastEditedSaved.local_mentioned && !this.tools.isMentioned(dispatch.message, this.localUser.id);
          } else if (last.content !== dispatch.message.content) {
            const data = this.createMiniFormattedData(last);
            data.edit_history = [
              {
                content: last.content,
                time: Date.now()
              }
            ];
            data.message.content = dispatch.message.content;
            this.tempEditedMessageRecord[data.message.id] = data;
            ghostPinged = this.tools.isMentioned(last, this.localUser.id) && !this.tools.isMentioned(dispatch.message, this.localUser.id);
          }
          if (isSaved) this.saveData();
          if (!ghostPinged) return callDefault(...args);
          if (isSaved) {
            const lastEdited = this.getEditedMessage(dispatch.message.id, channel.id);
            if (!lastEdited) return callDefault(...args);
            lastEdited.ghost_pinged = true;
            this.saveData();
          } else {
            const data = this.tempEditedMessageRecord[dispatch.message.id];
            data.ghost_pinged = true;
            this.messageRecord[dispatch.message.id] = data;
            this.messageRecordIds.add(dispatch.message.id);
            if (!this.editedMessageRecord[channel.id]) this.editedMessageRecord[channel.id] = [];
            this.editedMessageRecord[channel.id].push(dispatch.message.id);
            this._addToChannelSet(this.editedMessageSet, channel.id, dispatch.message.id);
            this.saveData();
          }
          if (this._shouldShowToast(channel, guild, 'ghostPings')) {
            this._notifyEvent('ghostPing', channel, guild, dispatch.id);
          }
        } else if (dispatch.type == 'MESSAGE_CREATE' && dispatch.message && (dispatch.message.content.length || dispatch.attachments?.length || dispatch.embeds?.length) && dispatch.message.state != 'SENDING' && !dispatch.optimistic && (dispatch.message.type === 0 || dispatch.message.type === 19 || dispatch.message.type === 20) && this.tools.isMentioned(dispatch.message, this.localUser.id)) {
          if (this._cacheIncomingMessage(dispatch.message)) return callDefault(...args);
        }
      }
      if (doReturn) return callDefault(...args);
      if (dispatch.type == 'LOAD_MESSAGES_SUCCESS') {
        if (!this.settings.restoreDeletedMessages) return callDefault(...args);
        if (dispatch.jump?.ML2) delete dispatch.jump;
        const deletedMessages = this.deletedMessageRecord[channel.id];
        const purgedMessages = this.purgedMessageRecord[channel.id];
        if ((!deletedMessages && !purgedMessages) || (!this.settings.showPurgedMessages && !this.settings.showDeletedMessages)) return callDefault(...args);
        const wasEmpty = dispatch.messages.length === 0;
        if (this.settings.showDeletedMessages && deletedMessages) this.reAddDeletedMessages(dispatch.messages, deletedMessages, !dispatch.hasMoreAfter && !dispatch.isBefore, !dispatch.hasMoreBefore && !dispatch.isAfter);
        if (this.settings.showPurgedMessages && purgedMessages) this.reAddDeletedMessages(dispatch.messages, purgedMessages, !dispatch.hasMoreAfter && !dispatch.isBefore, !dispatch.hasMoreBefore && !dispatch.isAfter);
        if (wasEmpty && dispatch.messages.length > 0) {
          if (!this._refreshedEmptyChannels) this._refreshedEmptyChannels = new Set();
          if (!this._refreshedEmptyChannels.has(channel.id)) {
            this._refreshedEmptyChannels.add(channel.id);
            setImmediate(() => {
              this.invalidateChannelCache(channel.id);
              this.cacheChannelMessages(channel.id);
            });
          }
        }
        return callDefault(...args);
      }
      const notificationsBlacklisted = this.settings.notificationBlacklist.includes(channel.id) || (guild && this.settings.notificationBlacklist.includes(guild.id));
      let notificationsWhitelisted = true;
      if (this.settings.notifOnlyWhitelist)
        notificationsWhitelisted = this.settings.notificationWhitelist.includes(channel.id) || (guild && this.settings.notificationWhitelist.includes(guild.id));
      if (dispatch.type == 'MESSAGE_DELETE') {
        const deleted = this.getCachedMessage(dispatch.id, dispatch.channelId);
        if (this.settings.aggresiveMessageCaching) this._ensureChannelCached(channel.id);
        if (!deleted) return callDefault(...args);
        if (this.deletedMessageSet.get(channel.id)?.has(deleted.id)) {
          if (!this.settings.showDeletedMessages) ret = callDefault(...args);
          return ret;
        }
        if (deleted.type !== 0 && deleted.type !== 19 && (deleted.type !== 20 || (deleted.flags & 64) === 64)) return callDefault(...args);
        if (deleted.flags == 64) return callDefault(...args);
        if (this.settings.showDeletedCount) {
          if (!this.deletedChatMessagesCount[channel.id]) this.deletedChatMessagesCount[channel.id] = 0;
          if (!this.selectedChannel || this.selectedChannel.id != channel.id) this.deletedChatMessagesCount[channel.id]++;
        }
        if (!notificationsBlacklisted && this._shouldShowToast(channel, guild, 'deleted', isLocalUser)) {
          this._notifyEvent('deleted', channel, guild, dispatch.id);
        }
        const record = this.messageRecord[dispatch.id];
        if (this._shouldShowToast(channel, guild, 'ghostPings') && !record?.ghost_pinged && this.tools.isMentioned(deleted, this.localUser.id)) {
          this._notifyEvent('ghostPing', channel, guild, dispatch.id);
        }
        this.saveDeletedMessage(deleted, this.deletedMessageRecord);
        if (!this.settings.showDeletedMessages) ret = callDefault(...args);
        else if (DiscordModules.SelectedChannelStore?.getChannelId() === dispatch.channelId) this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE', id: dispatch.id });
        this.saveData();
      } else if (dispatch.type == 'MESSAGE_DELETE_BULK') {
        if (this.settings.showDeletedCount) {
          if (!this.deletedChatMessagesCount[channel.id]) this.deletedChatMessagesCount[channel.id] = 0;
          if (!this.selectedChannel || this.selectedChannel.id != channel.id) this.deletedChatMessagesCount[channel.id] += dispatch.ids.length;
        }
        let failedMessage = false;
        for (const dispatchId of dispatch.ids) {
          const purged = this.getCachedMessage(dispatchId, channel.id);
          if (!purged) {
            failedMessage = true;
            continue;
          }
          this.saveDeletedMessage(purged, this.purgedMessageRecord);
          if (DiscordModules.SelectedChannelStore?.getChannelId() === dispatch.channelId) this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE', id: purged.id });
        }
        if (failedMessage && this.settings.aggresiveMessageCaching)
          this.cacheChannelMessages(channel.id);
        else if (this.settings.aggresiveMessageCaching) this._ensureChannelCached(channel.id);
        if (!notificationsBlacklisted && notificationsWhitelisted && (guild ? this.settings.toastToggles.deleted : this.settings.toastTogglesDMs.deleted)) {
          this._notifyEvent('bulkDelete', channel, guild, undefined, { count: dispatch.ids.length });
        }
        if (!this.settings.showPurgedMessages) ret = callDefault(...args);
        this.saveData();
      } else if (dispatch.type == 'MESSAGE_UPDATE') {
        if (!dispatch.message.edited_timestamp) {
          if (dispatch.message.embeds) {
            const last = this.getCachedMessage(dispatch.message.id);
            if (last) last.embeds = dispatch.message.embeds.map(this.cleanupEmbed);
          }
          return callDefault(...args);
        }
        if (this.settings.showEditedCount) {
          if (!this.editedChatMessagesCount[channel.id]) this.editedChatMessagesCount[channel.id] = 0;
          if (!this.selectedChannel || this.selectedChannel.id != channel.id) this.editedChatMessagesCount[channel.id]++;
        }
        if (this.settings.aggresiveMessageCaching) this._ensureChannelCached(channel.id);
        const last = this.getCachedMessage(dispatch.message.id, channel.id);
        const lastEditedSaved = this.getEditedMessage(dispatch.message.id, channel.id);
        if (!last && !lastEditedSaved) return callDefault(...args);
        let ghostPinged = false;
        const currentContent = lastEditedSaved ? lastEditedSaved.message.content : last.content;
        let loggedAttachmentsToAdd = [];
        if (currentContent === dispatch.message.content) {
          if ((lastEditedSaved ? lastEditedSaved.message.attachments : last.attachments) === dispatch.message.attachments) {
            return callDefault(...args);
          }
          else {
            const { content: generatedContent, logged_attachments } = this._getChangedAttachments(
              last.attachments, dispatch.message.attachments,
              dispatch.message.id, dispatch.message.channel_id, dispatch.message.guild_id
            );
            if (lastEditedSaved) lastEditedSaved.message.content += "\n" + generatedContent;
            else last.content += "\n" + generatedContent;
            loggedAttachmentsToAdd = logged_attachments;
          }
        }
        if (lastEditedSaved) {
          lastEditedSaved.edit_history.push({
            content: lastEditedSaved.message.content,
            time: Date.now()
          });
          if (loggedAttachmentsToAdd.length > 0)
            lastEditedSaved.logged_attachments = loggedAttachmentsToAdd;
          lastEditedSaved.message.content = dispatch.message.content;
          ghostPinged = !lastEditedSaved.ghost_pinged && lastEditedSaved.local_mentioned && !this.tools.isMentioned(dispatch.message, this.localUser.id);
          if (ghostPinged) lastEditedSaved.ghost_pinged = true;
        } else {
          const data = this.createMiniFormattedData(last);
          data.edit_history = [
            {
              content: last.content,
              time: Date.now()
            }
          ];
          if (loggedAttachmentsToAdd.length > 0)
            data.logged_attachments = loggedAttachmentsToAdd;
          ghostPinged = this.tools.isMentioned(last, this.localUser.id) && !this.tools.isMentioned(dispatch.message, this.localUser.id);
          data.message.content = dispatch.message.content;
          if (ghostPinged) data.ghost_pinged = true;
          this.messageRecord[data.message.id] = data;
          this.messageRecordIds.add(data.message.id);
          if (!this.editedMessageRecord[channel.id]) this.editedMessageRecord[channel.id] = [];
          this.editedMessageRecord[channel.id].push(data.message.id);
          this._addToChannelSet(this.editedMessageSet, channel.id, data.message.id);
        }
        if (!notificationsBlacklisted && notificationsWhitelisted) {
          if (guild ? this.settings.toastToggles.edited && ((isLocalUser && !this.settings.toastToggles.disableToastsForLocal) || !isLocalUser) : this.settings.toastTogglesDMs.edited && !isLocalUser) {
            if (!this.settings.blockSpamEdit) {
              if (this.editHistoryAntiSpam[author.id]) {
                this.editHistoryAntiSpam[author.id].times.push(Date.now());
              } else {
                this.editHistoryAntiSpam[author.id] = {
                  blocked: false,
                  times: [Date.now()]
                };
              }
              if (this.editHistoryAntiSpam[author.id].times.length > 10) this.editHistoryAntiSpam[author.id].times.shift();
              if (this.editHistoryAntiSpam[author.id].times.length === 10 && Date.now() - this.editHistoryAntiSpam[author.id].times[0] < 60 * 1000) {
                if (!this.editHistoryAntiSpam[author.id].blocked) {
                  this._notifyEvent('editSpamBlocked', channel, guild, null, { username: author.username });
                  this.editHistoryAntiSpam[author.id].blocked = true;
                }
              } else if (this.editHistoryAntiSpam[author.id].blocked) {
                this.editHistoryAntiSpam[author.id].blocked = false;
                this.editHistoryAntiSpam[author.id].times = [];
              }
            }
            if (this.settings.blockSpamEdit || !this.editHistoryAntiSpam[author.id].blocked) {
              this._notifyEvent('edited', channel, guild, dispatch.message.id);
            }
          }
        }
        if (this._shouldShowToast(channel, guild, 'ghostPings') && ghostPinged) {
          this._notifyEvent('ghostPing', channel, guild, dispatch.id);
        }
        this.saveData();
        return callDefault(...args);
      } else if (dispatch.type == 'MESSAGE_CREATE' && dispatch.message && (dispatch.message.content.length || dispatch.attachments?.length || dispatch.embeds?.length) && dispatch.message.state != 'SENDING' && !dispatch.optimistic && (dispatch.message.type === 0 || dispatch.message.type === 19 || dispatch.message.type === 20)) {
        if (this._cacheIncomingMessage(dispatch.message)) return callDefault(...args);
        if (this.settings.aggresiveMessageCaching) this._ensureChannelCached(channel.id);
        if (!notificationsBlacklisted && this._shouldShowToast(channel, guild, 'sent')) {
          this._notifyEvent('sent', channel, guild, dispatch.message.id);
        }
        return callDefault(...args);
      } else return callDefault(...args);
    } catch (err) {
      Logger.error('Error in onDispatchEvent', err);
    }
    return ret;
  }
  patchMessages() {
    if (!this._globalUpdateCallbackMessage) {
      this._globalUpdateCallbackMessage = (e) => {
        if (!e.id) return;
        const callbacks = this._messageUpdateRegistry.get(e.id);
        if (callbacks) callbacks.forEach(cb => cb());
      };
      this.dispatcher.subscribe('MLV2_FORCE_UPDATE_MESSAGE', this._globalUpdateCallbackMessage);
    }
    if (!this._globalUpdateCallbackContent) {
      this._globalUpdateCallbackContent = (e) => {
        if (e.id) {
          const callbacks = this._messageUpdateRegistry.get(e.id);
          if (callbacks) callbacks.forEach(cb => cb());
        } else {
          for (const callbacks of this._messageUpdateRegistry.values()) {
            callbacks.forEach(cb => cb());
          }
        }
      };
      this.dispatcher.subscribe('MLV2_FORCE_UPDATE_MESSAGE_CONTENT', this._globalUpdateCallbackContent);
    }
    let options = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    };
    const i18module = DiscordModules.I18nModule;
    const i18n = {
      Messages: {
        MESSAGE_EDITED: i18module.intl.format(i18module.t["C8sXIM"]),
      }
    };
    this.translatedEdited = i18n.Messages.MESSAGE_EDITED;
    const SuffixEdited = React.memo(e => React.createElement(this.Tooltip, { text: e.timestamp ? new Intl.DateTimeFormat(navigator.language, options).format(e.timestamp.get()._i) : null }, tt => React.createElement('time', { dateTime: e.timestamp.toISOString(), className: this.multiClasses.edited, role: 'note', ...tt }, `(${i18n.Messages.MESSAGE_EDITED})`)));
    SuffixEdited.displayName = 'SuffixEdited';
    const messageWrapperModule = DiscordModules.MessageWrapperClasses || {};
    const messageWrapperClass = messageWrapperModule.message || '';
    const findMessageElement = (tree, depth = 0) => {
      if (depth > 6 || !tree) return null;
      if (tree.props?.className && typeof tree.props.className === 'string') {
        if (messageWrapperClass && tree.props.className.includes(messageWrapperClass)) return tree;
        if (!messageWrapperClass && tree.props.className.split(' ').some(c => c.startsWith('message-'))) return tree;
      }
      const children = tree.props?.children;
      if (!children) return null;
      if (Array.isArray(children)) {
        for (const child of children) {
          const found = findMessageElement(child, depth + 1);
          if (found) return found;
        }
      } else if (typeof children === 'object') {
        return findMessageElement(children, depth + 1);
      }
      return null;
    };
    const MessageContent = DiscordModules.MessageContentComponent;
    const MessageModule =
      Webpack.getBySource("Message must be a thread starter message") ||
      Webpack.getBySource("quotedChatMessage", "EMOJI_ADDED");
    const MemoMessage = MessageModule && Object.values(MessageModule).find(exp =>
      exp?.$$typeof === Symbol.for('react.memo')
    );
    if (!MessageContent || !MemoMessage) return UI.showToast('Failed to patch message components, edit history and deleted tint will not show!', { type: "error", timeout: 0 });
    const EditHistoryContent = ({ plugin, messageId, record, originalChildren, compact }) => {
      const [, forceUpdate] = Hooks.useForceUpdate();
      React.useEffect(() => {
        if (!plugin._messageUpdateRegistry.has(messageId)) {
          plugin._messageUpdateRegistry.set(messageId, new Set());
        }
        plugin._messageUpdateRegistry.get(messageId).add(forceUpdate);
        return plugin._unregisterMessageCallback.bind(plugin, messageId, forceUpdate);
      }, [messageId]);
      const currentRecord = plugin.messageRecord[messageId];
      if (!currentRecord || !currentRecord.edit_history || currentRecord.edits_hidden) {
        return Array.isArray(originalChildren[0]) ? originalChildren[0] : originalChildren[1];
      }
      const createEditedMessage = (edit, editNum, isSingular, noSuffix) =>
        React.createElement(
          plugin.Tooltip,
          {
            key: `edit-${editNum}`,
            text: record.delete_data ? null : 'Edited: ' + plugin.createTimeStamp(edit.time),
            position: 'left',
            hideOnClick: true
          },
          _ =>
            React.createElement(
              'div',
              {
                ..._,
                className: [
                  compact && !isSingular ? plugin.style.editedCompact : '',
                  isSingular ? '' : plugin.style.edited
                ].filter(Boolean).join(' '),
                editNum
              },
              plugin.tools.parserNew(edit.content),
              noSuffix
                ? null
                : React.createElement(SuffixEdited, {
                  timestamp: plugin.tools.createMomentObject(edit.time)
                })
            )
        );
      const modifier = plugin.editModifiers[messageId];
      if (modifier) {
        return createEditedMessage(record.edit_history[modifier.editNum], modifier.editNum, true, modifier.noSuffix);
      }
      const oContent = Array.isArray(originalChildren[0]) ? originalChildren[0] : originalChildren[1];
      const edits = [];
      let i = 0;
      let max = record.edit_history.length;
      if (plugin.settings.maxShownEdits) {
        if (record.edit_history.length > plugin.settings.maxShownEdits) {
          if (plugin.settings.hideNewerEditsFirst) {
            max = plugin.settings.maxShownEdits;
          } else {
            i = record.edit_history.length - plugin.settings.maxShownEdits;
          }
        }
      }
      for (; i < max; i++) {
        const edit = record.edit_history[i];
        if (!edit) continue;
        edits.push(createEditedMessage(edit, i));
      }
      return React.createElement(React.Fragment, {}, edits, oContent);
    };
    EditHistoryContent.displayName = 'EditHistoryContent';
    this.unpatches.push(
      Patcher.after(MessageContent, 'type', (_, [props], ret) => {
        if (!this.settings.showEditedMessages || (typeof props.className === 'string' && props.className.includes('repliedTextContent'))) return;
        if (!this.messageRecordIds.has(props.message.id)) return;
        const record = this.messageRecord[props.message.id];
        if (!record?.edit_history || record.edits_hidden || !Array.isArray(ret.props.children)) return;
        const newClassName = [ret.props.className, this.style.edited].filter(Boolean).join(' ');
        const originalChildren = ret.props.children;
        ret.props.className = newClassName;
        ret.props.children = React.createElement(EditHistoryContent, {
          plugin: this,
          messageId: props.message.id,
          record: record,
          originalChildren: originalChildren,
          compact: props.compact
        });
      }),
      Patcher.after(MemoMessage, 'type', (_, [props], ret) => {
        if (!props?.message?.id) return ret;
        const messageId = props.message.id;
        const hasRecord = this.messageRecordIds.has(messageId);
        const record = hasRecord ? this.messageRecord[messageId] : null;
        const [, forceUpdate] = Hooks.useForceUpdate();
        React.useEffect(() => {
          if (!this._messageUpdateRegistry.has(messageId)) {
            this._messageUpdateRegistry.set(messageId, new Set());
          }
          this._messageUpdateRegistry.get(messageId).add(forceUpdate);
          return this._unregisterMessageCallback.bind(this, messageId, forceUpdate);
        }, [messageId, hasRecord]);
        if (record?.delete_data && !this.noTintIds.has(messageId)) {
          const message = findMessageElement(ret);
          if (message) {
            const deletedClass = this.settings.useAlternativeDeletedStyle ? this.style.deletedAlt : this.style.deleted;
            if (!message.props.className.includes(deletedClass)) {
              message.props.className += ' ' + deletedClass;
              if (record.delete_data.time) message.props.__MLV2_deleteTime = record.delete_data.time;
            }
          }
        }
        return ret;
      })
    );
    this.forceReloadMessages();
  }
  forceReloadMessages() {
    if (this._forceReloadPending) return;
    this._forceReloadPending = true;
    requestAnimationFrame(() => {
      this._forceReloadPending = false;
      try {
        const channelId = this.selectedChannel?.id;
        if (!channelId) return;
        const hasDeletedInChannel = this.deletedMessageSet.get(channelId)?.size > 0;
        const hasPurgedInChannel = this.purgedMessageSet.get(channelId)?.size > 0;
        if (!hasDeletedInChannel && !hasPurgedInChannel) return;
        this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT' });
      } catch (e) {
        Logger.warn('Could not force reload messages:', e);
      }
    });
  }
  patchModal() {
    this._modalsApiUnsubcribe = this.ModalStack.useModalsStore.subscribe(_ => {
      setTimeout(() => {
        let modalOpen = this.ModalStack.hasModalOpen(this.style.menu);
        if (this.menu.open && !modalOpen) {
          this.menu.filter = '';
          this.menu.open = false;
          this.menu.shownMessages = -1;
          if (this.menu.messages) this.menu.messages.length = 0;
        }
      }, 500);
    });
  }
  buildMenu(setup) {
    const ret = ContextMenu.buildMenu(setup);
    return props => ret({ ...props, onClose: _ => { } });
  }
  getDiscordClass(arg, thrw) {
    try {
      const args = arg.split(' ');
      const cacheKey = args.join(',');
      this._classCache ??= {};
      const module = this._classCache[cacheKey] ??= Webpack.getByKeys(...args);
      if (!module) {
        Logger.warn(`getDiscordClass: No module found for keys: ${args.join(', ')}`);
        return '';
      }
      const result = module[args[args.length - 1]] || '';
      if (!result) {
        Logger.warn(`getDiscordClass: Module found but key '${args[args.length - 1]}' is empty. Available keys:`, Object.keys(module));
      }
      return result;
    } catch (e) {
      if (thrw) throw e;
      Logger.warn(`Failed to get class with props ${arg}`, e);
      return '';
    }
  }
  getSingleDiscordClass(arg, thrw) {
    try {
      return this.getDiscordClass(arg, thrw).split(' ')[0];
    } catch (e) {
      if (thrw) throw e;
      Logger.warn(`Failed to get single class with props ${arg}`, e);
      return '';
    }
  }
  joinClassNames(...args) {
    const classes = [];
    for (let i = 0, len = args.length; i < len; i++) {
      const arg = args[i];
      if (!arg) continue;
      const argType = typeof arg;
      if (argType === 'string' || argType === 'number') {
        classes.push(arg);
      } else if (Array.isArray(arg)) {
        if (arg.length) {
          const inner = this.joinClassNames(...arg);
          if (inner) classes.push(inner);
        }
      } else if (argType === 'object') {
        if (arg.toString === Object.prototype.toString) {
          for (const key in arg) {
            if (Object.hasOwn(arg, key) && arg[key]) {
              classes.push(key);
            }
          }
        } else {
          classes.push(arg.toString());
        }
      }
    }
    return classes.join(' ');
  }
  createMessageGroup(message, isStart) {
    let deleted = false;
    let edited = false;
    let details = 'Sent in';
    let channel = this.tools.getChannel(message.channel_id);
    let timestamp = message.timestamp;
    let author = this.tools.getUser(message.author.id);
    let noUserInfo = false;
    const isBot = message.author.bot;
    const record = this.messageRecord[message.id];
    if (record) {
      deleted = !!record.delete_data;
      edited = !!record.edit_history;
      if (deleted && edited) {
        details = 'Edited and deleted from';
        timestamp = record.delete_data.time;
      } else if (deleted) {
        details = 'Deleted from';
        timestamp = record.delete_data.time;
      } else if (edited) {
        details = 'Last edit in';
        if (typeof record.edit_history[record.edit_history.length - 1].time !== 'string') timestamp = record.edit_history[record.edit_history.length - 1].time;
      }
    }
    details += ` ${this.getLiteralName(message.guild_id || channel?.guild_id, message.channel_id)} `;
    details += `at ${this.createTimeStamp(timestamp, true)}`;
    details = details.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    if (!this.createMessageGroup.classes) {
      this.createMessageGroup.classes = {
        extra: [
          /* 0 */ this.joinClassNames(
          this.getDiscordClass('groupStart message'),
          this.getDiscordClass('groupStart cozyMessage'),
          this.getDiscordClass('systemMessage groupStart'),
          this.getDiscordClass('zalgo wrapper'),
          this.getDiscordClass('zalgo cozy'),
          this.getDiscordClass('cozy zalgo')
        ),
          /* 1 */ this.joinClassNames(
          this.getDiscordClass('groupStart message'),
          this.getDiscordClass('groupStart cozyMessage'),
          this.getDiscordClass('zalgo wrapper'),
          this.getDiscordClass('zalgo cozy'),
          this.getDiscordClass('cozy zalgo')
        ),
          /* 2 */ DiscordModules.ExecutedCommandClasses?.header || '',
          /* 3 */ this.joinClassNames(
          this.getDiscordClass('edited avatar'),
          this.getDiscordClass('edited avatar clickable')
        ),
          /* 4 */ this.joinClassNames(
          this.getDiscordClass('userJoinSystemMessageIcon username'),
          this.getDiscordClass('edited avatar clickable')
        ),
          /* 5 */ this.joinClassNames(
          this.getDiscordClass('separator timestamp'),
          this.getDiscordClass('separator timestampInline')
        ),
          /* 6 */ this.joinClassNames(
          this.multiClasses.markup,
          this.getDiscordClass('buttonContainer markupRtl')
        ),
          /* 7 */ this.getDiscordClass('giftCodeContainer container'),
          /* 8 */ this.joinClassNames(
          this.getDiscordClass('zalgo latin24CompactTimeStamp'),
          this.getDiscordClass('separator timestamp'),
          this.getDiscordClass('alt timestampVisibleOnHover'),
          this.getDiscordClass('timestampVisibleOnHover alt')
        ),
          /* 9 */ this.getDiscordClass('latin24CompactTimeStamp separator'),
          /* 10 */ this.getSingleDiscordClass('userJoinSystemMessageIcon username'),
          /* 11 */ this.getSingleDiscordClass('separator timestamp'),
          /* 12 */ this.getDiscordClass('zalgo contents')
        ],
        botTag: DiscordModules.BotTagClasses?.botTag || 'botTag',
        avatarImgSingle: this.getSingleDiscordClass('edited avatar clickable') || 'avatar'
      };
    }
    const classes = this.createMessageGroup.classes;
    const getAvatarOf = user => {
      if (!user.avatar) return '/assets/322c936a8c8be1b803cd94861bdfa868.png';
      return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
    };
    const botTagHtml = isBot ? `<span class="${classes.botTag}">BOT</span>` : '';
    const element = isStart
      ? this.parseHTML(`<div class="${classes.extra[0]}">
                                      <div class="${classes.extra[12]}">
                                        <img src="${getAvatarOf(message.author)}" class="${classes.extra[3]}" style="width: 40px; height: 40px;" alt=" "><h2 class="${classes.extra[2]}"><span class="${classes.extra[4]}" role="button">${message.author.username.replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')}</span>${botTagHtml}<span class="${classes.extra[5]}"><span >${details}</span></span></h2>
                                        <div class="${classes.extra[6]}"></div>
                                      </div>
                                      <div class="${classes.extra[7]}"></div>
                                    </div>`)
      : this.parseHTML(`<div class="${classes.extra[1]}">
                                    <div class="${classes.extra[12]}">
                                      <span class="${classes.extra[8]}">
                                        <span>
                                          <i class="${classes.extra[9]}">[</i>
                                          ${this.createTimeStamp(timestamp, -1)}
                                          <i class="${classes.extra[9]}">] </i>
                                        </span>
                                      </span>
                                      <div class="${classes.extra[6]}"></div>
                                    </div>
                                    <div class="${classes.extra[7]}"></div>
                                  </div>`);
    element.messageId = message.id;
    const profImg = element.getElementsByClassName(classes.avatarImgSingle)[0];
    if (profImg) {
      profImg.onerror = () => {
        profImg.src = '/assets/322c936a8c8be1b803cd94861bdfa868.png';
      };
      const verifyProfilePicture = () => {
        if (message.author.avatar != author.avatar && author.avatar) {
          profImg.src = getAvatarOf(author);
          if (record) {
            record.message.author.avatar = author.avatar;
          }
        } else if (record) {
          record.message.author.avatar = null;
        }
      };
      if (author) {
        verifyProfilePicture();
      } else {
        author = message.author;
        noUserInfo = true;
      }
      profImg.addEventListener('click', () => {
        if (noUserInfo) return this.showToast('Could not get user info!', { type: 'error' });
        setTimeout(() => {
          this.tools.showUserPopout(profImg, author, message.channel_id);
        }, 0);
      });
      profImg.addEventListener('contextmenu', e => {
        if (noUserInfo) return this.showToast('Could not get user info! You can only delete or copy to clipboard!', { timeout: 5000 });
        this._openUserContextMenu(e, author, channel);
      });
      const nameLink = element.getElementsByClassName(classes.extra[10])[0];
      nameLink.addEventListener('click', () => {
        if (noUserInfo) return this.showToast('Could not get user info!', { type: 'error' });
        setTimeout(() => {
          this.tools.showUserPopout(nameLink, author, message.channel_id);
        }, 0);
      });
      nameLink.addEventListener('contextmenu', e => {
        if (noUserInfo) return this.showToast('Could not get user info! You can only delete or copy to clipboard!', { type: 'error', timeout: 5000 });
        this._openUserContextMenu(e, author, channel);
      });
      const timestampEl = element.getElementsByClassName(classes.extra[11])[0];
      const collectGroupMessageIds = () => {
        const messages = [element];
        let target = element.nextElementSibling;
        while (target?.classList && !target.classList.contains(DiscordModules.MessageWrapperClasses)) {
          messages.push(target);
          target = target.nextElementSibling;
        }
        if (!messages.length) return [];
        const messageIds = [];
        for (const msg of messages) if (msg?.messageId) messageIds.push(msg.messageId);
        return messageIds;
      };
      const removeGroupFromLog = (messageIds) => {
        let invalidatedChannelCache = false;
        for (let msgid of messageIds) {
          const record = this.messageRecord[msgid];
          if (!record) continue;
          if ((record.edit_history && !record.edits_hidden) || (record.delete_data && !record.delete_data.hidden)) {
            invalidatedChannelCache = record.message.channel_id;
            this.invalidateChannelCache(invalidatedChannelCache);
          }
          this.deleteMessageFromRecords(msgid);
        }
        if (invalidatedChannelCache) this.cacheChannelMessages(invalidatedChannelCache);
        this.refilterMessages();
        this.saveData();
      };
      timestampEl.addEventListener('contextmenu', e => {
        const messageIds = collectGroupMessageIds();
        if (!messageIds.length) return;
        ContextMenu.open(
          e,
          this.buildMenu([
            {
              type: 'group',
              items: [
                {
                  label: 'Copy Formatted Message',
                  action: () => {
                    ContextMenu.close();
                    let result = '';
                    for (let msgid of messageIds) {
                      const record = this.messageRecord[msgid];
                      if (!record) continue;
                      if (!result.length) result += `> **${record.message.author.username}** | ${this.createTimeStamp(record.message.timestamp, true)}\n`;
                      result += `> ${record.message.content.replaceAll('\n', '\n> ')}\n`;
                    }
                    this.nodeModules.electron.clipboard.writeText(result);
                    this.showToast('Copied!', { type: 'success' });
                  }
                },
                {
                  type: 'item',
                  label: 'Remove Group From Log',
                  action: () => {
                    ContextMenu.close();
                    removeGroupFromLog(messageIds);
                  }
                }
              ]
            }
          ])
        );
      });
      timestampEl.addEventListener('click', e => {
        if (!this.menu.deleteKeyDown) return;
        const messageIds = collectGroupMessageIds();
        if (!messageIds.length) return;
        removeGroupFromLog(messageIds);
      });
    }
    const messageContext = e => {
      let target = e.target;
      if (!target.classList.contains('mention') || (target.tagName == 'IMG' && target.classList.contains(this.style.imageError))) {
        let isMarkup = false;
        let isEdited = false;
        let isBadImage = target.tagName == 'IMG' && target.classList.contains(this.style.imageError);
        if (!isBadImage) {
          while (target && !target.classList) {
            if (target.classList?.contains(this.style.edited)) isEdited = target;
            target = target.parentElement;
          }
          if (target?.classList) {
            isMarkup = target.classList.contains(this.classes.markup);
            while (target && !isMarkup) {
              if (target.classList?.contains(this.style.edited)) isEdited = target;
              target = target.parentElement;
              if (target?.classList) {
                isMarkup = target.classList.contains(this.classes.markup);
              }
            }
          }
        }
        if (isMarkup || isBadImage) {
          const messageId = message.id;
          const record = this.getSavedMessage(messageId);
          if (!record) return;
          let editNum = -1;
          if (isEdited) editNum = isEdited.edit;
          const menuItems = [];
          if (channel) {
            menuItems.push({
              type: 'item',
              label: 'Jump to Message',
              action: () => {
                ContextMenu.close();
                this.jumpToMessage(message.channel_id, messageId, message.guild_id);
              }
            });
          }
          if (!isBadImage || record.message.content.length) {
            menuItems.push(
              {
                type: 'item',
                label: 'Copy Text',
                action: () => {
                  ContextMenu.close();
                  this.nodeModules.electron.clipboard.writeText(editNum == -1 ? record.message.content : record.edit_history[editNum].content);
                  this.showToast('Copied!', { type: 'success' });
                }
              },
              {
                type: 'item',
                label: 'Copy Formatted Message',
                action: () => {
                  ContextMenu.close();
                  const content = editNum == -1 ? record.message.content : record.edit_history[editNum].content;
                  const result = `> **${record.message.author.username}** | ${this.createTimeStamp(record.message.timestamp, true)}\n> ${content.replaceAll('\n', '\n> ')}`;
                  this.nodeModules.electron.clipboard.writeText(result);
                  this.showToast('Copied!', { type: 'success' });
                }
              }
            );
          }
          if (record.delete_data?.hidden) {
            menuItems.push({
              type: 'item',
              label: 'Unhide Deleted Message',
              action: () => {
                ContextMenu.close();
                record.delete_data.hidden = false;
                this._invalidateAndRecache(record.message.channel_id);
                this.saveData();
                this.showToast('Unhidden!', { type: 'success' });
              }
            });
          }
          if (record.edit_history) {
            if (editNum != -1) {
              menuItems.push({
                type: 'item',
                label: 'Delete Edit',
                action: () => {
                  ContextMenu.close();
                  this.deleteEditedMessageFromRecord(messageId, editNum);
                  this.refilterMessages();
                  this.showToast('Deleted!', { type: 'success' });
                }
              });
            }
            if (record.edits_hidden) {
              menuItems.push({
                type: 'item',
                label: 'Unhide Edits',
                action: () => {
                  ContextMenu.close();
                  record.edits_hidden = false;
                  this.saveData();
                  this.showToast('Unhidden!', { type: 'success' });
                }
              });
            }
          }
          menuItems.push(
            {
              type: 'item',
              label: 'Remove From Log',
              action: () => {
                ContextMenu.close();
                let invalidatedChannelCache = false;
                if ((record.edit_history && !record.edits_hidden) || (record.delete_data && !record.delete_data.hidden)) {
                  invalidatedChannelCache = record.message.channel_id;
                  this.invalidateChannelCache(invalidatedChannelCache);
                }
                this.deleteMessageFromRecords(messageId);
                this.refilterMessages();
                if (invalidatedChannelCache) this.cacheChannelMessages(invalidatedChannelCache);
                this.saveData();
                if (record.message.channel_id !== this.selectedChannel.id) return;
                if (record.delete_data) {
                  this.dispatcher.dispatch({
                    type: 'MESSAGE_DELETE',
                    id: messageId,
                    channelId: record.message.channel_id,
                    ML2: true
                  });
                } else {
                  this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT', id: messageId });
                }
              }
            },
            {
              type: 'item',
              label: 'Copy Message ID',
              action: () => {
                ContextMenu.close();
                this.nodeModules.electron.clipboard.writeText(messageId);
                this.showToast('Copied!', { type: 'success' });
              }
            },
            {
              type: 'item',
              label: 'Copy Author ID',
              action: () => {
                ContextMenu.close();
                this.nodeModules.electron.clipboard.writeText(message.author.id);
                this.showToast('Copied!', { type: 'success' });
              }
            }
          );
          ContextMenu.open(
            e,
            this.buildMenu([
              {
                type: 'group',
                items: menuItems
              }
            ])
          );
          return;
        }
      }
    };
    element.addEventListener('contextmenu', e => messageContext(e));
    element.addEventListener('click', e => {
      if (!this.menu.deleteKeyDown) return;
      let target = e.target;
      let isMarkup = false;
      let isEdited = false;
      let isBadImage = target.tagName == 'IMG' && target.classList.contains(this.style.imageError);
      if (!isBadImage) {
        isMarkup = target.classList.contains(this.classes.markup);
        while (!target.classList.contains(this.classes.message) && !isMarkup) {
          if (target.classList.contains(this.style.edited)) isEdited = target;
          target = target.parentElement;
          isMarkup = target.classList.contains(this.classes.markup);
        }
      }
      if (!isMarkup && !isBadImage) return;
      const messageId = message.id;
      const record = this.messageRecord[messageId];
      if (!record) return;
      this._invalidateAndRecache(record.message.channel_id);
      if (isEdited) {
        this.deleteEditedMessageFromRecord(messageId, isEdited.edit);
      } else {
        this.deleteMessageFromRecords(messageId);
      }
      this.refilterMessages();
      this.saveData();
    });
    return element;
  }
  populateParent(parent, messages) {
    let lastMessage;
    let messageGroup;
    const populate = i => {
      try {
        const messageId = messages[i];
        const record = this.getSavedMessage(messageId);
        const message = record ? record.message : this.getMessageAny(messageId);
        if (!message) return;
        if (!messageGroup || !lastMessage || lastMessage.channel_id != message.channel_id || lastMessage.author.id != message.author.id || new Date(message.timestamp).getDate() !== new Date(lastMessage.timestamp).getDate() || (message.attachments.length && message.content.length)) {
          messageGroup = this.createMessageGroup(message, true);
        } else {
          messageGroup = this.createMessageGroup(message);
        }
        lastMessage = message;
        let markup = messageGroup.getElementsByClassName(this.classes.markup)[0];
        if (!markup) {
          markup = messageGroup.getElementsByClassName(this.multiClasses.markup)[0];
        }
        if (!markup) {
          const possibleMarkupClasses = [
            this.classes.markup,
            this.classes.messageContent
          ].filter(Boolean);
          for (const className of possibleMarkupClasses) {
            markup = messageGroup.getElementsByClassName(className)[0];
            if (markup) break;
          }
        }
        if (!markup) {
          const divs = messageGroup.querySelectorAll('div');
          for (const div of divs) {
            if (div.className?.includes('markup')) {
              markup = div;
              break;
            }
          }
        }
        if (!markup) {
          Logger.error('No markup element found in messageGroup', {
            markupClass: this.classes.markup,
            multiMarkupClass: this.multiClasses.markup,
            messageGroup,
            message
          });
          parent.appendChild(messageGroup);
          return;
        }
        const contentDiv = messageGroup.getElementsByClassName(this.getSingleDiscordClass('giftCodeContainer container'))[0];
        const formatContent = (content, channelId) => {
          try {
            return this.formatMarkup(content, channelId);
          } catch (e) {
            Logger.error('formatMarkup failed, using fallback', e);
            const fallbackDiv = document.createElement('div');
            fallbackDiv.textContent = content;
            fallbackDiv.className = this.multiClasses.markup || this.classes.markup || '';
            return fallbackDiv;
          }
        };
        if (record?.edit_history) {
          markup.classList.add(this.style.edited);
          for (let ii = 0; ii < record.edit_history.length; ii++) {
            const hist = record.edit_history[ii];
            const editedMarkup = formatContent(hist.content, message.channel_id);
            if (!editedMarkup) continue;
            editedMarkup.insertAdjacentHTML('beforeend', `<time class="${this.multiClasses.edited}">(${this.translatedEdited})</time>`);
            new this.Tooltip(editedMarkup, 'Edited at ' + (typeof hist.time === 'string' ? hist.time : this.createTimeStamp(hist.time)), { side: 'left' });
            editedMarkup.classList.add(this.style.edited);
            editedMarkup.edit = ii;
            markup.appendChild(editedMarkup);
          }
        }
        const formattedContent = formatContent(message.content, message.channel_id);
        if (formattedContent) {
          markup.appendChild(formattedContent);
        }
        if (!record) {
          const channel = this.tools.getChannel(message.channel_id);
          const guild = this.tools.getServer(channel?.guild_id);
          markup.addEventListener('click', () => this.jumpToMessage(message.channel_id, message.id, guild?.id));
        }
        if (contentDiv && message.attachments.length) {
          const attemptToUseCachedImage = (attachmentId, attachmentIdx, hidden, filename, width, height) => {
            const img = document.createElement('img');
            img.classList = DiscordModules.ClickableClasses?.clickable || '';
            img.messageId = messageId;
            img.idx = attachmentIdx;
            const existingElement = document.getElementById(attachmentId);
            if (existingElement) {
              existingElement.id = "og-" + attachmentId;
            }
            img.id = attachmentId;
            if (hidden) {
              img.src = `https://i.clouds.tf/q2vy/r8q6.png#${record.message.channel_id},${img.id}`;
              img.width = 200;
            } else {
              img.src = this.imageCacheServerSimulator.get('http://localhost:7474/' + attachmentId + filename.match(/\.[0-9a-z]+$/i)[0] + `#${record.message.channel_id},${img.id},${img.messageId}`);
              img.width = 256;
            }
            img.addEventListener('click', e => {
              if (this.menu.deleteKeyDown) {
                this.deleteMessageFromRecords(messageId);
                this.refilterMessages();
                this.saveData();
                return;
              }
              const imgUrl = img.src.startsWith('blob:') ? img.src : (img.src + '?ML2=true');
              this.createModal(
                {
                  items: [
                    {
                      type: "IMAGE",
                      url: imgUrl,
                      placeholder: img.src,
                      original: img.src,
                      width: width,
                      height: height,
                      "trigger": "CLICK",
                      "animated": false,
                      "srcIsAnimated": false,
                    }
                  ],

                  className: this.style.imageRoot
                },
                true
              );
            });
            img.onerror = () => {
              const imageErrorDiv = document.createElement('img');
              imageErrorDiv.classList = this.style.imageError;
              imageErrorDiv.messageId = messageId;
              imageErrorDiv.src = this.errorImage;
              img.replaceWith(imageErrorDiv);
            };
            contentDiv.appendChild(img);
            return true;
          };
          const createVideoContainer = (videoId, videoIdx, videoWidth) => {
            const container = document.createElement('div');
            container.style.position = 'relative';
            container.style.display = 'inline-block';
            container.style.cursor = 'pointer';
            container.style.width = 'fit-content';
            container.classList = DiscordModules.ClickableClasses?.clickable || '';
            const video = document.createElement('video');
            video.messageId = messageId;
            video.id = videoId;
            video.idx = videoIdx;
            video.width = videoWidth;
            video.style.borderRadius = '8px';
            video.style.display = 'block';
            video.preload = 'metadata';
            const playButton = document.createElement('div');
            playButton.innerHTML = '<svg width="48" height="48" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>';
            playButton.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.6);border-radius:50%;width:48px;height:48px;display:flex;align-items:center;justify-content:center;pointer-events:none;';
            container.appendChild(video);
            container.appendChild(playButton);
            return { container, video };
          };
          const attemptToUseCachedVideo = (attachmentId, attachmentIdx, hidden, filename, width, height) => {
            const existingElement = document.getElementById(attachmentId);
            if (existingElement) {
              existingElement.id = "og-" + attachmentId;
            }
            const { container, video } = createVideoContainer(attachmentId, attachmentIdx, 256);
            if (!hidden) {
              video.src = this.imageCacheServerSimulator.get('http://localhost:7474/' + attachmentId + filename.match(/\.[0-9a-z]+$/i)[0] + `#${record.message.channel_id},${video.id},${video.messageId}`);
            }
            container.addEventListener('click', () => {
              if (this.menu.deleteKeyDown) {
                this.deleteMessageFromRecords(messageId);
                this.refilterMessages();
                this.saveData();
                return;
              }
              const videoUrl = video.src.startsWith('blob:') ? video.src : (video.src + '?ML2=true');
              this.createModal(
                {
                  items: [
                    {
                      type: "VIDEO",
                      url: videoUrl,
                      width: width,
                      height: height,
                    }
                  ],
                  className: this.style.imageRoot
                },
                false
              );
            });
            video.onerror = () => {
              const videoErrorDiv = document.createElement('img');
              videoErrorDiv.classList = this.style.imageError;
              videoErrorDiv.messageId = messageId;
              videoErrorDiv.src = this.errorImage;
              container.replaceWith(videoErrorDiv);
            };
            contentDiv.appendChild(container);
            return true;
          };
          const handleCreateImage = (attachment, idx) => {
            const isCached = attachment.url == 'ERROR' ||
              this.imageCacheServerSimulator.exists(attachment.id, attachment.filename, record?.message?.channel_id, messageId);
            const isVideoFile = this.isVideo(attachment.filename || attachment.url);
            if (isCached && isVideoFile) {
              attemptToUseCachedVideo(attachment.id, idx, attachment.hidden, attachment.filename, attachment.width, attachment.height);
            } else if (isCached) {
              attemptToUseCachedImage(attachment.id, idx, attachment.hidden, attachment.filename, attachment.width, attachment.height);
            } else if (this.isVideo(attachment.url)) {
              const { container, video } = createVideoContainer(attachment.id, idx, this.clamp(attachment.width, 200, 400));
              if (!attachment.hidden) {
                video.src = attachment.url;
              }
              if (record) {
                container.addEventListener('click', () => {
                  if (this.menu.deleteKeyDown) {
                    this.deleteMessageFromRecords(messageId);
                    this.refilterMessages();
                    this.saveData();
                    return;
                  }
                  this.createModal(
                    {
                      items: [
                        {
                          type: "VIDEO",
                          url: attachment.url,
                          width: attachment.width,
                          height: attachment.height,
                        }
                      ],
                      className: this.style.imageRoot
                    },
                    false
                  );
                });
              }
              video.onerror = () => {
                if (video.triedCache) {
                  const videoErrorDiv = document.createElement('img');
                  videoErrorDiv.classList = this.style.imageError;
                  videoErrorDiv.messageId = messageId;
                  videoErrorDiv.src = this.errorImage;
                  container.replaceWith(videoErrorDiv);
                }
                video.triedCache = true;
                attemptToUseCachedVideo(attachment.id, idx, attachment.hidden, attachment.filename, attachment.width, attachment.height);
              };
              contentDiv.appendChild(container);
            } else if (this.isImage(attachment.url)) {
              const img = document.createElement('img');
              img.classList = DiscordModules.ClickableClasses?.clickable || '';
              img.messageId = messageId;
              img.id = attachment.id;
              img.idx = idx;
              if (record) {
                img.addEventListener('click', () => {
                  if (this.menu.deleteKeyDown) {
                    this.deleteMessageFromRecords(messageId);
                    this.refilterMessages();
                    this.saveData();
                    return;
                  }
                  const imgUrl = img.src.startsWith('blob:') ? img.src : (img.src + '?ML2=true');
                  this.createModal(
                    {
                      items: [
                        {
                          type: "IMAGE",
                          url: imgUrl,
                          placeholder: img.src,
                          original: attachment.url,
                          width: attachment.width,
                          height: attachment.height,
                          "trigger": "CLICK",
                          "animated": false,
                          "srcIsAnimated": false,
                        }
                      ],
    
                      className: this.style.imageRoot
                    },
                    true
                  );
                });
              }
              img.onerror = () => {
                if (img.triedCache) {
                  const imageErrorDiv = document.createElement('img');
                  imageErrorDiv.classList = this.style.imageError;
                  imageErrorDiv.messageId = messageId;
                  imageErrorDiv.src = this.errorImage;
                  img.replaceWith(imageErrorDiv);
                }
                attemptToUseCachedImage(attachment.id, idx, attachment.hidden, attachment.filename, attachment.width, attachment.height);
              };
              if (attachment.hidden) {
                img.src = `https://i.clouds.tf/q2vy/r8q6.png#${record.message.channel_id},${img.id}`;
                img.width = 200;
              } else {
                img.src = attachment.url;
                img.width = this.clamp(attachment.width, 200, 650);
              }
              contentDiv.appendChild(img);
            }
          };
          for (let ii = 0; ii < message.attachments.length; ii++) handleCreateImage(message.attachments[ii], ii);
        }
        if (contentDiv && !contentDiv.childElementCount && !message.content.length) return;
        if (!contentDiv && !message.content.length) return;
        parent.appendChild(messageGroup);
      } catch (err) {
        Logger.error('Error in populateParent', err);
      }
    };
    let i = 0;
    const addMore = () => {
      for (let added = 0; i < messages.length && (added < this.settings.renderCap || (this.menu.shownMessages != -1 && i < this.menu.shownMessages)); i++, added++) populate(i);
      handleMoreMessages();
      this.menu.shownMessages = i;
    };
    const handleMoreMessages = () => {
      if (i < messages.length) {
        const div = document.createElement('div');
        const moreButton = this.createButton('LOAD MORE', function () {
          this.parentElement.remove();
          addMore();
        });
        moreButton.style.width = '100%';
        moreButton.style.marginBottom = '20px';
        div.appendChild(moreButton);
        parent.appendChild(div);
      }
    };
    if (this.settings.renderCap) addMore();
    else for (; i < messages.length; i++) populate(i);
    if (!messages.length) {
      const strong = document.createElement('strong');
      strong.className = this.multiClasses.defaultColor;
      strong.innerText = "Not to worry, the logger is not broken! There simply wasn't anything logged in the selected tab.";
      parent.appendChild(strong);
    }
  }
  sortMessagesByAge(map) {
    map.sort((a, b) => {
      const recordA = this.messageRecord[a];
      const recordB = this.messageRecord[b];
      if (!recordA || !recordB) return 0;
      let timeA = new Date(recordA.message.timestamp).getTime();
      let timeB = new Date(recordB.message.timestamp).getTime();
      if (recordA.edit_history && typeof recordA.edit_history[recordA.edit_history.length - 1].time !== 'string') timeA = recordA.edit_history[recordA.edit_history.length - 1].time;
      if (recordB.edit_history && typeof recordB.edit_history[recordB.edit_history.length - 1].time !== 'string') timeB = recordB.edit_history[recordB.edit_history.length - 1].time;
      if (recordA.delete_data?.time) timeA = recordA.delete_data.time;
      if (recordB.delete_data?.time) timeB = recordB.delete_data.time;
      return Number.parseInt(timeB) - Number.parseInt(timeA);
    });
  }
  getFilteredMessages() {
    let messages = [];
    const pushIdsIntoMessages = map => {
      for (let channel in map) {
        for (let messageIdIDX in map[channel]) {
          messages.push(map[channel][messageIdIDX]);
        }
      }
    };
    const checkIsMentioned = map => {
      for (let channel in map) {
        for (let messageIdIDX in map[channel]) {
          const messageId = map[channel][messageIdIDX];
          const record = this.getSavedMessage(messageId);
          if (!record) continue;
          if (record.ghost_pinged) {
            messages.push(messageId);
          }
        }
      }
    };
    if (this.menu.selectedTab == 'sent') {
      for (let i of this.cachedMessageRecord) {
        messages.push(i.id);
      }
    }
    if (this.menu.selectedTab == 'edited') pushIdsIntoMessages(this.editedMessageRecord);
    if (this.menu.selectedTab == 'deleted') pushIdsIntoMessages(this.deletedMessageRecord);
    if (this.menu.selectedTab == 'purged') pushIdsIntoMessages(this.purgedMessageRecord);
    if (this.menu.selectedTab == 'ghostpings') {
      checkIsMentioned(this.deletedMessageRecord);
      checkIsMentioned(this.editedMessageRecord);
      checkIsMentioned(this.purgedMessageRecord);
    }
    const filters = this.menu.filter.split(',');
    for (const filterItem of filters) {
      const split = filterItem.split(':');
      if (split.length < 2) continue;
      const filterType = split[0].trim().toLowerCase();
      const filter = split[1].trim().toLowerCase();
      if (filterType == 'server' || filterType == 'guild')
        messages = messages.filter(x => {
          const message = this.getMessageAny(x);
          if (!message) return false;
          const channel = this.tools.getChannel(message.channel_id);
          const guild = this.tools.getServer(message.guild_id || channel?.guild_id);
          return (message.guild_id || channel?.guild_id) == filter || (guild?.name.toLowerCase().includes(filter.toLowerCase()));
        });
      if (filterType == 'channel')
        messages = messages.filter(x => {
          const message = this.getMessageAny(x);
          if (!message) return false;
          const channel = this.tools.getChannel(message.channel_id);
          return message.channel_id == filter || (channel?.name.toLowerCase().includes(filter.replace('#', '').toLowerCase()));
        });
      if (filterType == 'message' || filterType == 'content')
        messages = messages.filter(x => {
          const message = this.getMessageAny(x);
          return x == filter || (message?.content.toLowerCase().includes(filter.toLowerCase()));
        });
      if (filterType == 'user')
        messages = messages.filter(x => {
          const message = this.getMessageAny(x);
          if (!message) return false;
          const channel = this.tools.getChannel(message.channel_id);
          const member = DiscordModules.GuildMemberStore?.getMember(message.guild_id || channel?.guild_id, message.author.id);
          return message.author.id == filter || message.author.username.toLowerCase().includes(filter.toLowerCase()) || (member?.nick?.toLowerCase().includes(filter.toLowerCase()));
        });
      if (filterType == 'has') {
        switch (filter) {
          case 'image':
            messages = messages.filter(x => {
              const message = this.getMessageAny(x);
              if (!message) return false;
              if (Array.isArray(message.attachments)) if (message.attachments.some(({ filename }) => this.isImage(filename))) return true;
              if (Array.isArray(message.embeds)) return message.embeds.some(({ image }) => !!image);
              return false;
            });
            break;
          case 'link':
            messages = messages.filter(x => {
              const message = this.getMessageAny(x);
              if (!message) return false;
              return message.content.search(/https?:\/\/.{2,}/s) !== -1;
            });
            break;
        }
      }
    }
    if (this.menu.selectedTab != 'sent') {
      this.sortMessagesByAge(messages);
      if (this.settings.reverseOrder) messages.reverse();
    } else if (!this.settings.reverseOrder) messages.reverse();
    return messages;
  }
  refilterMessages() {
    const messagesDIV = document.getElementById(this.style.menuMessages);
    const original = messagesDIV.style.display;
    messagesDIV.style.display = 'none';
    while (messagesDIV.firstChild) messagesDIV.firstChild.remove();
    this.menu.messages = this.getFilteredMessages();
    this.populateParent(messagesDIV, this.menu.messages);
    messagesDIV.style.display = original;
  }
  openTab(tab) {
    const tabBar = document.getElementById(this.style.menuTabBar);
    if (!tabBar) return this.showToast(`Error switching to tab ${tab}!`, { type: 'error', timeout: 3000 });
    tabBar.querySelector(`.${this.style.tabSelected}`).classList.remove(this.style.tabSelected);
    tabBar.querySelector('#' + tab).classList.add(this.style.tabSelected);
    this.menu.selectedTab = tab;
    setTimeout(() => this.refilterMessages(), 0);
  }
  createHeader() {
    if (!this.createHeader.classes || this.createHeader.classes.__errored) {
      try {
        this.createHeader.classes = {
          itemTabBarItem: this.style.tabBarItem,
          tabBarContainer: this.style.tabBarContainer,
          tabBar: this.style.tabBar
        };
      } catch {
        this.createHeader.classes = {
          itemTabBarItem: 'tabBarItem' + ' ' + 'item',
          tabBarContainer: 'tabBarContainer',
          tabBar: 'tabBar',
          __errored: true
        };
      }
    }
    const classes = this.createHeader.classes;
    const createTab = (title, id) => {
      const tab = this.parseHTML(`<div id="${id}" class="${classes.itemTabBarItem} ${this.style.tab} ${id == this.menu.selectedTab ? this.style.tabSelected : ''}" role="button">${title}</div>`);
      tab.addEventListener('mousedown', () => this.openTab(id));
      return tab;
    };
    const tabBar = this.parseHTML(`<div class="${classes.tabBarContainer}"><div class="${classes.tabBar}" id="${this.style.menuTabBar}"></div></div>`);
    const tabs = tabBar.getElementsByClassName(classes.tabBar)[0];
    tabs.appendChild(createTab('Sent', 'sent'));
    tabs.appendChild(createTab('Deleted', 'deleted'));
    tabs.appendChild(createTab('Edited', 'edited'));
    tabs.appendChild(createTab('Purged', 'purged'));
    tabs.appendChild(createTab('Ghost pings', 'ghostpings'));
    tabBar.style.marginRight = '20px';
    return tabBar;
  }
  createTextBox() {
    if (!this.createTextBox.classes || this.createTextBox.classes.__errored) {
      try {
        this.createTextBox.classes = {
          inputWrapper: this.style.inputWrapper,
          inputMultiInput: this.style.multiInput,
          multiInputFirst: this.style.multiInputFirst,
          inputDefaultMultiInputField: this.style.input,
          questionMark: this.style.questionMark,
          icon: this.style.questionMark,
          focused: DiscordModules.FocusedClasses?.focused?.split(/ /g) || [],
          questionMarkSingle: this.style.questionMark
        }
      } catch {
        this.createTextBox.classes = {
          inputWrapper: 'inputMini inputWrapper',
          inputMultiInput: 'inputPrefix input' + ' ' + 'multiInput',
          multiInputFirst: 'multiInputFirst',
          inputDefaultMultiInputField: 'inputPrefix inputDefault' + ' ' + 'multiInputField',
          questionMark: 'questionMark',
          icon: 'questionMark',
          focused: 'focused',
          questionMarkSingle: 'questionMark',
          __errored: true
        }
      }
    }
    const classes = this.createTextBox.classes;
    let textBox = this.parseHTML(
      `<div class="${classes.inputWrapper}"><div class="${classes.inputMultiInput}"><div class="${classes.inputWrapper} ${classes.multiInputFirst}"><input class="${classes.inputDefaultMultiInputField}" name="username" type="text" placeholder="Message filter" maxlength="999" value="${this.menu.filter}" id="${this.style.filter}"></div><span tabindex="0" class="${classes.questionMark}" role="button"><svg name="QuestionMark" class="${classes.icon}" aria-hidden="false" width="16" height="16" viewBox="0 0 24 24"><g fill="currentColor" fill-rule="evenodd" transform="translate(7 4)"><path d="M0 4.3258427C0 5.06741573.616438356 5.68539326 1.35616438 5.68539326 2.09589041 5.68539326 2.71232877 5.06741573 2.71232877 4.3258427 2.71232877 2.84269663 4.31506849 2.78089888 4.5 2.78089888 4.68493151 2.78089888 6.28767123 2.84269663 6.28767123 4.3258427L6.28767123 4.63483146C6.28767123 5.25280899 5.97945205 5.74719101 5.42465753 6.05617978L4.19178082 6.73595506C3.51369863 7.10674157 3.14383562 7.78651685 3.14383562 8.52808989L3.14383562 9.64044944C3.14383562 10.3820225 3.76027397 11 4.5 11 5.23972603 11 5.85616438 10.3820225 5.85616438 9.64044944L5.85616438 8.96067416 6.71917808 8.52808989C8.1369863 7.78651685 9 6.30337079 9 4.69662921L9 4.3258427C9 1.48314607 6.71917808 0 4.5 0 2.21917808 0 0 1.48314607 0 4.3258427zM4.5 12C2.5 12 2.5 15 4.5 15 6.5 15 6.5 12 4.5 12L4.5 12z"></path></g></svg></span></div></div>`
    );
    const inputEl = textBox.getElementsByTagName('input')[0];
    inputEl.addEventListener('focusout', e => {
      DOMTokenList.prototype.remove.apply(e.target.parentElement.parentElement.classList, classes.focused);
    });
    inputEl.addEventListener('focusin', e => {
      DOMTokenList.prototype.add.apply(e.target.parentElement.parentElement.classList, classes.focused);
    });
    const onUpdate = e => {
      if (this.menu.filterSetTimeout) clearTimeout(this.menu.filterSetTimeout);
      this.menu.filter = inputEl.value;
      const filters = this.menu.filter.split(',');
      if (!filters[0].length) return this.refilterMessages();
      this.menu.filterSetTimeout = setTimeout(() => {
        if (filters[0].length) {
          for (const filter of filters) {
            const split = filter.split(':');
            if (split.length < 2) return;
          }
        }
        this.refilterMessages();
      }, 200);
    };
    inputEl.addEventListener('keyup', onUpdate);
    inputEl.addEventListener('paste', onUpdate);
    const helpButton = textBox.getElementsByClassName(classes.questionMarkSingle)[0];
    helpButton.addEventListener('click', () => {
      const extraHelp = this.createButton('Logger help', () => this.showLoggerHelpModal());
      this.createModal({
        confirmText: 'OK',
        header: 'Filter help',
        size: this.tools.resolvedModalStuff.ModalSize.LARGE,
        children: [
          this.tools.createWrappedElement([
            this.parseHTML(
              `<div class="${this.multiClasses.defaultColor}">"server: <servername or serverid>" - Filter results with the specified server name or id.
                        "channel: <channelname or channelid>" - Filter results with the specified channel name or id.
                        "user: <username, nickname or userid>" - Filter results with the specified username, nickname or userid.
                        "message: <search or messageid>" or "content: <search or messageid>" - Filter results with the specified message content.
                        "has: <image|link> - Filter results to only images or links
                        Separate the search tags with commas.
                        Example: server: tom's bd stuff, message: heck
                        Shortcut help:
                        "Ctrl + M" (default) - Open message log.
                        "Ctrl + N" (default) - Open message log with selected channel filtered.\n\n</div>`.replaceAll('\n', '</br>')
            ),
            extraHelp
          ])
        ],
        confirmButtonColor: this.tools.buttonColors.BRAND,
      });
    });
    return textBox;
  }
  openWindow(type) {
    if (this.menu.open) {
      if (type) this.openTab(type);
      return;
    }
    this.menu.open = true;
    if (type) this.menu.selectedTab = type;
    if (!this.menu.selectedTab) this.menu.selectedTab = 'deleted';
    const messagesDIV = this.parseHTML(`<div id="${this.style.menuMessages}"></div>`);
    const viewportHeight = document.getElementById('app-mount').getBoundingClientRect().height;
    messagesDIV.style.minHeight = viewportHeight * 0.514090909 + 'px';
    const onChangeOrder = el => {
      this.settings.reverseOrder = !this.settings.reverseOrder;
      this.saveSettings();
      const sortBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sort direction'));
      if (sortBtn) {
        let textEl = sortBtn;
        while (textEl.firstElementChild && textEl.children.length === 1) textEl = textEl.firstElementChild;
        textEl.textContent = 'Sort direction: ' + (this.settings.reverseOrder ? 'old - new' : 'new - old');
      }
      this.refilterMessages();
    };
    const textModule = DiscordModules.TextModule;
    const Text = textModule ? Object.values(textModule)[0] : null;
    const onClearLog = e => {
      if (!Text) {
        Logger.warn('Could not find Text component, using fallback');
      }
      if (document.getElementById(this.style.filter).parentElement.parentElement.className.includes(this.createTextBox.classes.focused[0])) return;
      let type = this.menu.selectedTab;
      if (type === 'ghostpings') type = 'ghost pings';
      else {
        type += ' messages';
      }
      const filterSuffix = this.menu.filter.length ? ' that also match filter' : '';
      const confirmMessage = `Are you sure you want to delete all ${type}${filterSuffix}?`;
      const modalChildren = Text ?
        React.createElement(Text, { variant: "text-md/normal", children: [confirmMessage] }) :
        React.createElement('div', { style: { color: 'var(--text-default)' } }, confirmMessage);
      this.createModal({
        header: 'Clear log',
        children: modalChildren,
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        onConfirm: () => {
          if (this.menu.selectedTab == 'sent') {
            if (this.menu.filter.length) {
              this.cachedMessageRecord.length = 0;
              this.cachedMessageIds.clear();
              this.cachedMessagesMap.clear();
            } else {
              const idsToRemove = new Set(this.menu.messages);
              this.cachedMessageRecord = this.cachedMessageRecord.filter(m => !idsToRemove.has(m.id));
              for (const id of idsToRemove) {
                this.cachedMessageIds.delete(id);
                this.cachedMessagesMap.delete(id);
              }
            }
          } else {
            for (let id of this.menu.messages) {
              const record = this.messageRecord[id];
              let isSelected = false;
              if (record) {
                this.invalidateChannelCache(record.message.channel_id);
                if (this.selectedChannel) isSelected = record.message.channel_id === this.selectedChannel.id;
              }
              this.deleteMessageFromRecords(id);
              if (this.selectedChannel && isSelected) this.cacheChannelMessages(this.selectedChannel.id);
            }
            this.saveData();
          }
          setImmediate(_ => this.refilterMessages());
        }
      });
    };
    this.createModal(
      {
        confirmText: 'Clear log',
        cancelText: 'Sort direction: ' + (this.settings.reverseOrder ? 'old - new' : 'new - old'),
        header: this.tools.createWrappedElement([this.createTextBox(), this.createHeader()]),
        size: this.tools.resolvedModalStuff.ModalSize.LARGE,
        children: [this.tools.createWrappedElement([messagesDIV])],
        onCancel: onChangeOrder,
        onConfirm: onClearLog,
        onClose: _ => { },
        ml2Data: true,
        className: this.style.menuRoot
      },
      false,
      this.style.menu
    );
    let loadAttempts = 0;
    const loadMessages = () => {
      loadAttempts++;
      try {
        let tabBar = document.getElementById(`${this.style.menuTabBar}`);
        let tabBarHeader = tabBar.parentElement.parentElement.parentElement.parentElement;
        tabBarHeader.style.width = "100%";
        this.refilterMessages();
      } catch (e) {
        if (loadAttempts > 4) {
          UI.showToast(`Couldn't load menu messages! Report this issue to NightBirde, error info is in console`, { type: "error", timeout: 0 });
          Logger.error('Failed loading menu', e);
          return;
        }
        setTimeout(loadMessages, 100);
      }
    };
    setTimeout(loadMessages, 100);
  }
  patchContextMenus() {
    const getNestedProp = (obj, path) => path.split('.').reduce((o, p) => o?.[p], obj);
    this.unpatches.push(ContextMenu.patch('message', (ret, props) => {
      const menu = getNestedProp(
        Utils.findInTree(ret, e => e?.navId === 'message'),
        'children'
      );
      if (!Array.isArray(menu)) return;
      const newItems = [];
      const addElement = (label, action, options = {}) => newItems.push({ label, action, ...options });
      addElement('Open Logs', () => this.openWindow());
      const messageId = props.message.id;
      const channelId = props.channel.id;
      const record = this.messageRecord[messageId];
      if (record) {
        try {
          if (record.delete_data) {
            const options = menu.find(m => m?.props?.children && m.props.children.length > 10);
            if (options?.props?.children) {
              options.props.children.splice(0, options.props.children.length);
            }
            addElement(
              'Hide Deleted Message',
              () => {
                this.dispatcher.dispatch({
                  type: 'MESSAGE_DELETE',
                  id: messageId,
                  channelId: channelId,
                  ML2: true
                });
                this.showToast('Hidden!', { type: 'success' });
                record.delete_data.hidden = true;
                this.saveData();
              }
            );
            const hasTint = !this.noTintIds.has(messageId);
            addElement(
              `${hasTint ? 'Remove' : 'Add'} Deleted Tint`,
              () => {
                if (hasTint) { this.noTintIds.add(messageId); }
                else { this.noTintIds.delete(messageId); }
                this.showToast(hasTint ? 'Removed!' : 'Added!', { type: 'success' });
              }
            );
          }
          if (record.edit_history) {
            if (record.edits_hidden) {
              addElement(
                'Unhide Edits',
                () => {
                  record.edits_hidden = false;
                  this.saveData();
                  this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT', id: messageId });
                }
              );
            } else {
              let target = props.target;
              if (target) {
                while (target?.className && !target.className.includes(this.style.edited)) {
                  target = target.parentElement;
                }
                if (target) {
                  if (!this.editModifiers[messageId]) {
                    addElement(
                      'Hide Edits',
                      () => {
                        record.edits_hidden = true;
                        this.saveData();
                        this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT', id: messageId });
                      }
                    );
                  }
                  const editNum = target.getAttribute('editNum');
                  if (this.editModifiers[messageId]) {
                    addElement(
                      `${this.editModifiers[messageId].noSuffix ? 'Show' : 'Hide'} (edited) Tag`,
                      () => {
                        this.editModifiers[messageId].noSuffix = true;
                        this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT', id: messageId });
                      }
                    );
                    addElement(
                      `Undo Show As Message`,
                      () => {
                        delete this.editModifiers[messageId];
                        this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT', id: messageId });
                      },
                      this.obfuscatedClass('undo-show-as-message')
                    );
                  } else if (editNum !== undefined && editNum !== null) {
                    addElement(
                      'Show Edit As Message',
                      () => {
                        this.editModifiers[messageId] = { editNum };
                        this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT', id: messageId });
                      }
                    );
                    addElement(
                      'Delete Edit',
                      () => {
                        this.deleteEditedMessageFromRecord(messageId, Number.parseInt(editNum));
                        this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT', id: messageId });
                      },
                      { className: DiscordModules.ColorClasses?.colorDanger }
                    );
                  }
                }
              }
            }
          }
          addElement(
            'Remove From Log',
            () => {
              this.deleteMessageFromRecords(messageId);
              this.saveData();
              if (record.delete_data) {
                this.dispatcher.dispatch({
                  type: 'MESSAGE_DELETE',
                  id: messageId,
                  channelId: channelId,
                  ML2: true
                });
              } else {
                this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT', id: messageId });
              }
            },
            { className: DiscordModules.ColorClasses?.colorDanger }
          );
        } catch (err) {
          Logger.error('Error in record handling:', err);
        }
      }
      menu.push(ContextMenu.buildMenuChildren([{
        type: 'group',
        items: [{
          type: 'submenu',
          label: this.settings.contextmenuSubmenuName,
          items: newItems
        }]
      }]));
    }));
    const handleWhiteBlackList = (newItems, id) => {
      this._addListToggleItems(newItems, id, 'whitelist', 'blacklist', 'Whitelist');
      this._addListToggleItems(newItems, id, 'notificationWhitelist', 'notificationBlacklist', 'Notification Whitelist');
    };
    this.unpatches.push(ContextMenu.patch('guild-context', (ret, props) => {
      const menu = getNestedProp(
        Utils.findInTree(ret, e => e?.navId === 'guild-context'),
        'children'
      );
      if (!Array.isArray(menu)) return;
      const newItems = [];
      const addElement = (label, action, options = {}) => newItems.push({ label, action, ...options });
      addElement('Open Logs', () => this.openWindow());
      addElement(
        `Open Log For Guild`,
        () => {
          this.menu.filter = `guild:${props.guild.id}`;
          this.openWindow();
        }
      );
      handleWhiteBlackList(newItems, props.guild.id);
      menu.push(ContextMenu.buildMenuChildren([{
        type: 'group',
        items: [{
          type: 'submenu',
          label: this.settings.contextmenuSubmenuName,
          items: newItems
        }]
      }]));
    }),
      ContextMenu.patch('user-context', (ret, props) => {
        const menu = getNestedProp(
          Utils.findInTree(ret, e => e?.navId === 'user-context'),
          'children'
        );
        if (!Array.isArray(menu)) return;
        const newItems = [];
        const addElement = (label, action, options = {}) => newItems.push({ label, action, ...options });
        addElement('Open Logs', () => this.openWindow());
        addElement(
          `Open Log For User`,
          () => {
            this.menu.filter = `user:${props.user.id}`;
            this.openWindow();
          }
        );
        if (props.channel?.isDM()) {
          addElement(
            `Open Log For DM`,
            () => {
              this.menu.filter = `channel:${props.channel.id}`;
              this.openWindow();
            }
          );
          handleWhiteBlackList(newItems, props.channel.id);
        }
        menu.push(ContextMenu.buildMenuChildren([{
          type: 'group',
          items: [{
            type: 'submenu',
            label: this.settings.contextmenuSubmenuName,
            items: newItems
          }]
        }]));
      }),
      ...['channel-context', 'gdm-context'].map(contextName =>
        ContextMenu.patch(contextName, (ret, props) => {
          const menu = getNestedProp(
            Utils.findInTree(ret, e => e?.navId === contextName),
            'children'
          );
          if (!Array.isArray(menu)) return;
          const newItems = [];
          const addElement = (label, action, options = {}) => newItems.push({ label, action, ...options });
          addElement('Open Logs', () => this.openWindow());
          addElement(
            `Open Log For Channel`,
            () => {
              this.menu.filter = `channel:${props.channel.id}`;
              this.openWindow();
            }
          );
          handleWhiteBlackList(newItems, props.channel.id);
          menu.push(ContextMenu.buildMenuChildren([{
            type: 'group',
            items: [{
              type: 'submenu',
              label: this.settings.contextmenuSubmenuName,
              items: newItems
            }]
          }]));
        })
      ),
      ContextMenu.patch('image-context', (ret, props) => {
        const menu = getNestedProp(
          Utils.findInTree(ret, e => e?.navId === 'image-context'),
          'children'
        );
        if (!Array.isArray(menu)) return;
        const newItems = [];
        const addElement = (label, action, options = {}) => newItems.push({ label, action, ...options });
        let matched;
        if (!props.src) return;
        if (props.src.startsWith('data:image/png')) {
          const cut = props.src.substring(0, 100);
          matched = cut.match(/;(\d+);(\d+);/);
        } else {
          let fakeSrc = props.src + '';
          matched = props.src.match(/.*ments\/(\d+)\/(\d+)\//);
          if (!matched) matched = props.src.match(/r8q6.png#(\d+),(\d+)/);
          if (!matched) {
            fakeSrc = this.getKeyByValue(this.imageCacheServerSimulator.cached, props.src) ?? props.src;
          }
          if (!matched) {
            matched = /localhost:7474.*#(\d+),(\d+)/.exec(fakeSrc);
          }
        }
        if (!matched) return;
        const channelId = matched[1];
        const attachmentId = matched[2];
        const element = document.getElementById(attachmentId);
        if (!element) return;
        const record = this.getSavedMessage(element.messageId);
        if (!record) return;
        const localRequest = {
          get: async (url, options, cb) => {
            try {
              const fetchFn = url.startsWith("blob:") ? fetch : BdApi.Net.fetch;
              const response = await fetchFn(url, options);
              const responseBuffer = await response.arrayBuffer();
              cb({
                statusCode: response.status,
                chunksArr: new Uint8Array(responseBuffer),
              });
            } catch (error) {
              Logger.error('Image fetch failed:', error);
              cb({ statusCode: 0, error });
            }
          },
        };
        addElement(
          'Copy to Clipboard',
          () => {
            localRequest.get(element.src, {}, (data) => {
              if (data.statusCode != 200) {
                this.showToast('Failed to copy. Details in the console.', { type: 'error' });
                Logger.error(data);
              }
              DiscordNative.clipboard.copyImage(data.chunksArr, "image.png");
            });
          },
          this.obfuscatedClass('copy-to')
        );
        addElement(
          'Remove From Log',
          () => {
            this.deleteMessageFromRecords(element.messageId);
            this.refilterMessages();
            this.saveData();
            if (record.delete_data) this.dispatcher.dispatch({ type: 'MESSAGE_DELETE', id: messageId, channelId: channelId, ML2: true });
            else this.dispatcher.dispatch({ type: 'MLV2_FORCE_UPDATE_MESSAGE_CONTENT', id: messageId });
          },
          this.obfuscatedClass('remove')
        );
        addElement(
          'Reveal in folder',
          () => {
            const parsedUrl = new URL(matched.input);
            const parsedFile = this.nodeModules.path.parse(parsedUrl.pathname);
            const targetPath = this.nodeModules.fs.existsSync(this.settings.imageCacheDir + `/${attachmentId}${parsedFile.ext}`) ?
              this.settings.imageCacheDir + `/${attachmentId}${parsedFile.ext}` :
              this.imageCacheServerSimulator.resolveNewCachePath({ channelId: channelId, serverId: undefined }) + "/" + attachmentId + ` (${element.messageId})` + parsedFile.ext;
            this.nodeModules.electron.shell.showItemInFolder(this.nodeModules.path.resolve(targetPath));
          },
          this.obfuscatedClass('reveal-in-folder')
        )
        addElement(
          'Jump to Message',
          () => {
            this.jumpToMessage(channelId, element.messageId, record.message.guild_id);
          },
          this.obfuscatedClass('jump-to')
        );
        menu.push(ContextMenu.buildMenuChildren([{
          type: 'group',
          items: [{
            type: 'submenu',
            label: this.settings.contextmenuSubmenuName,
            items: newItems
          }]
        }]));
      }));
  }
};