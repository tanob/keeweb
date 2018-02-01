const Backbone = require('backbone');
const Alerts = require('./alerts');
const Launcher = require('./launcher');
const AuthReceiver = require('./auth-receiver');
const Links = require('../const/links');
const Timeouts = require('../const/timeouts');
const Locale = require('../util/locale');
const Logger = require('../util/logger');

const PopupNotifier = {
    logger: null,

    init: function() {
        this.logger = new Logger('PopupNotifier');

        if (Launcher) {
            window.open = this._openLauncherWindow.bind(this);
        } else {
            const windowOpen = window.open;
            window.open = function() {
                const win = windowOpen.apply(window, arguments);
                if (win) {
                    PopupNotifier.deferCheckClosed(win);
                    Backbone.trigger('popup-opened', win);
                } else {
                    if (!Alerts.alertDisplayed) {
                        Alerts.error({
                            header: Locale.authPopupRequired,
                            body: Locale.authPopupRequiredBody
                        });
                    }
                }
                return win;
            };
        }
    },

    _openLauncherWindow: function(url, title, settings) {
        const opts = {
            show: false,
            webPreferences: {
                nodeIntegration: false,
                webSecurity: false,
                allowDisplayingInsecureContent: true,
                allowRunningInsecureContent: true
            }
        };
        if (settings) {
            const settingsObj = {};
            settings.split(',').forEach(part => {
                const parts = part.split('=');
                settingsObj[parts[0].trim()] = parts[1].trim();
            });
            if (settingsObj.width) { opts.width = +settingsObj.width; }
            if (settingsObj.height) { opts.height = +settingsObj.height; }
            if (settingsObj.top) { opts.y = +settingsObj.top; }
            if (settingsObj.left) { opts.x = +settingsObj.left; }
        }
        this.logger.debug('openWindow called...');
        let win = Launcher.openWindow(opts);
        this.logger.debug('launcher win handler', win);
        win.webContents.on('did-get-redirect-request', (e, fromUrl, toUrl) => {
            this.logger.debug('did-get-redirect-request', fromUrl, toUrl);
            if (PopupNotifier.isOwnUrl(toUrl)) {
                win.webContents.stop();
                win.close();
                PopupNotifier.processReturnToApp(toUrl);
            }
        });
        win.webContents.on('will-navigate', (e, toUrl) => {
            this.logger.debug('will-navigate', toUrl);
            if (PopupNotifier.isOwnUrl(toUrl)) {
                e.preventDefault();
                win.close();
                PopupNotifier.processReturnToApp(toUrl);
            }
        });
        win.webContents.on('did-finish-load', () => {
            this.logger.debug('did-finish-load');
        });
        win.webContents.on('dom-ready', (e) => {
            this.logger.debug('dom-ready', e);
        });
        win.webContents.on('crashed', (e, killed) => {
            this.logger.debug('crashed', e, killed);
            setTimeout(PopupNotifier.triggerClosed.bind(PopupNotifier, win), Timeouts.CheckWindowClosed);
            win = null;
        });
        win.webContents.on('destroyed', () => {
            this.logger.debug('destroyed');
        });
        win.webContents.on('did-attach-webview', (e, webContents) => {
            this.logger.debug('did-attach-webview', e, webContents);
        });
        win.webContents.on('new-window', (e, url, frameName, disposition, options, additionalFeatures) => {
            this.logger.debug('new-window', e, url, frameName, disposition, options, additionalFeatures);
        });
        win.webContents.on('did-fail-load', (e, errorCode, errorDescription, validatedUrl, isMainFrame) => {
            this.logger.debug('did-fail-load', e, errorCode, errorDescription, validatedUrl, isMainFrame);
        });
        win.once('page-title-updated', () => {
            this.logger.debug('on page title updated');
            setTimeout(() => {
                if (win) {
                    win.show();
                    win.focus();
                }
            }, Timeouts.PopupWaitTime);
        });
        win.on('close', () => {
            this.logger.debug('on close event');
        });
        win.on('unresponsive', () => {
            this.logger.debug('on unresponsive event');
        });
        win.on('ready-to-show', () => {
            this.logger.debug('on ready-to-show event');
        });
        win.on('closed', () => {
            this.logger.debug('on closed event');
            setTimeout(PopupNotifier.triggerClosed.bind(PopupNotifier, win), Timeouts.CheckWindowClosed);
            win = null;
        });
        win.loadURL(url);
        Backbone.trigger('popup-opened', win);
        return win;
    },

    isOwnUrl(url) {
        return url.lastIndexOf(Links.WebApp, 0) === 0 ||
            url.lastIndexOf(location.origin + location.pathname, 0) === 0;
    },

    processReturnToApp: function(url) {
        const returnMessage = AuthReceiver.urlArgsToMessage(url);
        if (Object.keys(returnMessage).length > 0) {
            const evt = new Event('message');
            evt.data = returnMessage;
            window.dispatchEvent(evt);
        }
    },

    deferCheckClosed: function(win) {
        setTimeout(PopupNotifier.checkClosed.bind(PopupNotifier, win), Timeouts.CheckWindowClosed);
    },

    checkClosed: function(win) {
        if (win.closed) {
            setTimeout(PopupNotifier.triggerClosed.bind(PopupNotifier, win), Timeouts.CheckWindowClosed);
        } else {
            PopupNotifier.deferCheckClosed(win);
        }
    },

    triggerClosed: function(win) {
        Backbone.trigger('popup-closed', win);
    }
};

module.exports = PopupNotifier;
