(function (exports, require, module, __filename, __dirname, process, global) {
    /**
     * Perf optimization: Hook into require() to modify how certain modules load:
     *
     * - `inline-style-prefixer` (used by `material-ui`) takes ~40ms. It is not
     *   actually used because auto-prefixing is disabled with
     *   `darkBaseTheme.userAgent = false`. Return a fake object.
     */
    var Module = require('module')
    var _require = Module.prototype.require
    Module.prototype.require = function (id) {
        if (id === 'inline-style-prefixer') {
            return {}
        }
        return _require.apply(this, arguments)
    }

    console.time('init')

    var crashReporter = require('../crash-reporter')
    crashReporter.init()

    // Perf optimization: Start asynchronously read on config file before all the
    // blocking require() calls below.

    var State = require('./lib/state')
    State.load(onState)

    var createGetter = require('fn-getter')
    var dragDrop = require('drag-drop')
    var electron = require('electron')
    var fs = require('fs')
    var React = require('react')
    var ReactDOM = require('react-dom')

    var config = require('../config')
    var telemetry = require('./lib/telemetry')
    var sound = require('./lib/sound')
    var TorrentPlayer = require('./lib/torrent-player')

    // Perf optimization: Needed immediately, so do not lazy load it below
    var TorrentListController = require('./controllers/torrent-list-controller')

    // Required by Material UI -- adds `onTouchTap` event
    require('react-tap-event-plugin')()

    var App = require('./pages/app')

    // Electron apps have two processes: a main process (node) runs first and starts
    // a renderer process (essentially a Chrome window). We're in the renderer process,
    // and this IPC channel receives from and sends messages to the main process
    var ipcRenderer = electron.ipcRenderer

    // Yo-yo pattern: state object lives here and percolates down thru all the views.
    // Events come back up from the views via dispatch(...)
    require('./lib/dispatcher').setDispatch(dispatch)

    // From dispatch(...), events are sent to one of the controllers
    var controllers = null

    // This dependency is the slowest-loading, so we lazy load it
    var Cast = null

    // All state lives in state.js. `state.saved` is read from and written to a file.
    // All other state is ephemeral. First we load state.saved then initialize the app.
    var state

    // Root React component
    var app

    // Called once when the application loads. (Not once per window.)
    // Connects to the torrent networks, sets up the UI and OS integrations like
    // the dock icon and drag+drop.
    function onState(err, _state) {
        if (err) {
            return onError(err)
        }

        // Make available for easier debugging
        state = window.state = _state
        window.dispatch = dispatch

        telemetry.init(state)

        // Log uncaught JS errors
        window.addEventListener(
            'error',
            function (e) {
                return telemetry.logUncaughtError('window', e);
            }, true /* capture */
        )

        // Create controllers
        controllers = {
            media: createGetter(function () {
                var MediaController = require('./controllers/media-controller')
                return new MediaController(state)
            }),
            playback: createGetter(function () {
                var PlaybackController = require('./controllers/playback-controller')
                return new PlaybackController(state, config, update)
            }),
            prefs: createGetter(function () {
                var PrefsController = require('./controllers/prefs-controller')
                return new PrefsController(state, config)
            }),
            subtitles: createGetter(function () {
                var SubtitlesController = require('./controllers/subtitles-controller')
                return new SubtitlesController(state)
            }),
            torrent: createGetter(function () {
                var TorrentController = require('./controllers/torrent-controller')
                return new TorrentController(state)
            }),
            torrentList: createGetter(function () {
                return new TorrentListController(state)
            }),
            update: createGetter(function () {
                var UpdateController = require('./controllers/update-controller')
                return new UpdateController(state)
            })
        }

        // Add first page to location history
        state.location.go({
            url: 'home',
            setup: function (cb) {
                state.window.title = config.APP_WINDOW_TITLE
                cb(null)
            }
        })

        // Restart everything we were torrenting last time the app ran
        resumeTorrents()

        // Initialize ReactDOM
        app = ReactDOM.render(React.createElement(App, {
            state: state
        }), document.querySelector('#body'))

        // Calling update() updates the UI given the current state
        // Do this at least once a second to give every file in every torrentSummary
        // a progress bar and to keep the cursor in sync when playing a video
        setInterval(update, 1000)

        // Listen for messages from the main process
        setupIpc()

        // Drag and drop files/text to start torrenting or seeding
        dragDrop('body', {
            onDrop: onOpen,
            onDropText: onOpen
        })

        // ...same thing if you paste a torrent
        document.addEventListener('paste', onPaste)

        // ...focus and blur. Needed to show correct dock icon text ('badge') in OSX
        window.addEventListener('focus', onFocus)
        window.addEventListener('blur', onBlur)

        if (electron.remote.getCurrentWindow().isVisible()) {
            sound.play('STARTUP')
        }

        // To keep app startup fast, some code is delayed.
        window.setTimeout(delayedInit, config.DELAYED_INIT)

        // Done! Ideally we want to get here < 500ms after the user clicks the app
        console.timeEnd('init')
    }

    // Runs a few seconds after the app loads, to avoid slowing down startup time
    function delayedInit() {
        telemetry.send(state)

        // Send telemetry data every 12 hours, for users who keep the app running
        // for extended periods of time
        setInterval(function () {
            return telemetry.send(state);
        }, 12 * 3600 * 1000)

        // Warn if the download dir is gone, eg b/c an external drive is unplugged
        checkDownloadPath()

        // ...window visibility state.
        document.addEventListener('webkitvisibilitychange', onVisibilityChange)
        onVisibilityChange()

        lazyLoadCast()
    }

    // Lazily loads Chromecast and Airplay support
    function lazyLoadCast() {
        if (!Cast) {
            Cast = require('./lib/cast')
            Cast.init(state, update) // Search the local network for Chromecast and Airplays
        }
        return Cast
    }

    // React loop:
    // 1. update() - recompute the virtual DOM, diff, apply to the real DOM
    // 2. event - might be a click or other DOM event, or something external
    // 3. dispatch - the event handler calls dispatch(), main.js sends it to a controller
    // 4. controller - the controller handles the event, changing the state object
    function update() {
        controllers.playback().showOrHidePlayerControls()
        app.setState(state)
        updateElectron()
    }

    // Some state changes can't be reflected in the DOM, instead we have to
    // tell the main process to update the window or OS integrations
    function updateElectron() {
        if (state.window.title !== state.prev.title) {
            state.prev.title = state.window.title
            ipcRenderer.send('setTitle', state.window.title)
        }
        if (state.dock.progress.toFixed(2) !== state.prev.progress.toFixed(2)) {
            state.prev.progress = state.dock.progress
            ipcRenderer.send('setProgress', state.dock.progress)
        }
        if (state.dock.badge !== state.prev.badge) {
            state.prev.badge = state.dock.badge
            ipcRenderer.send('setBadge', state.dock.badge || 0)
        }
    }

    var dispatchHandlers = {
        // Torrent list: creating, deleting, selecting torrents
        'openTorrentFile': function () {
            return ipcRenderer.send('openTorrentFile');
        },
        'openFiles': function () {
            return ipcRenderer.send('openFiles');
        },
        /* shows the open file dialog */
        'openTorrentAddress': function () {
            state.modal = {
                id: 'open-torrent-address-modal'
            }
        },

        'addTorrent': function (torrentId) {
            return controllers.torrentList().addTorrent(torrentId);
        },
        'showCreateTorrent': function (paths) {
            return controllers.torrentList().showCreateTorrent(paths);
        },
        'createTorrent': function (options) {
            return controllers.torrentList().createTorrent(options);
        },
        'toggleTorrent': function (infoHash) {
            return controllers.torrentList().toggleTorrent(infoHash);
        },
        'pauseAllTorrents': function () {
            return controllers.torrentList().pauseAllTorrents();
        },
        'resumeAllTorrents': function () {
            return controllers.torrentList().resumeAllTorrents();
        },
        'toggleTorrentFile': function (infoHash, index) {
            return controllers.torrentList().toggleTorrentFile(infoHash, index);
        },
        'confirmDeleteTorrent': function (infoHash, deleteData) {
            return controllers.torrentList().confirmDeleteTorrent(infoHash, deleteData);
        },
        'deleteTorrent': function (infoHash, deleteData) {
            return controllers.torrentList().deleteTorrent(infoHash, deleteData);
        },
        'toggleSelectTorrent': function (infoHash) {
            return controllers.torrentList().toggleSelectTorrent(infoHash);
        },
        'openTorrentContextMenu': function (infoHash) {
            return controllers.torrentList().openTorrentContextMenu(infoHash);
        },
        'startTorrentingSummary': function (torrentKey) {
            return controllers.torrentList().startTorrentingSummary(torrentKey);
        },
        'saveTorrentFileAs': function (torrentKey) {
            return controllers.torrentList().saveTorrentFileAs(torrentKey);
        },

        // Playback
        'playFile': function (infoHash, index) {
            return controllers.playback().playFile(infoHash, index);
        },
        'playPause': function () {
            return controllers.playback().playPause();
        },
        'nextTrack': function () {
            return controllers.playback().nextTrack();
        },
        'previousTrack': function () {
            return controllers.playback().previousTrack();
        },
        'skip': function (time) {
            return controllers.playback().skip(time);
        },
        'skipTo': function (time) {
            return controllers.playback().skipTo(time);
        },
        'changePlaybackRate': function (dir) {
            return controllers.playback().changePlaybackRate(dir);
        },
        'changeVolume': function (delta) {
            return controllers.playback().changeVolume(delta);
        },
        'setVolume': function (vol) {
            return controllers.playback().setVolume(vol);
        },
        'openItem': function (infoHash, index) {
            return controllers.playback().openItem(infoHash, index);
        },

        // Subtitles
        'openSubtitles': function () {
            return controllers.subtitles().openSubtitles();
        },
        'selectSubtitle': function (index) {
            return controllers.subtitles().selectSubtitle(index);
        },
        'toggleSubtitlesMenu': function () {
            return controllers.subtitles().toggleSubtitlesMenu();
        },
        'checkForSubtitles': function () {
            return controllers.subtitles().checkForSubtitles();
        },
        'addSubtitles': function (files, autoSelect) {
            return controllers.subtitles().addSubtitles(files, autoSelect);
        },

        // Local media: <video>, <audio>, external players
        'mediaStalled': function () {
            return controllers.media().mediaStalled();
        },
        'mediaError': function (err) {
            return controllers.media().mediaError(err);
        },
        'mediaSuccess': function () {
            return controllers.media().mediaSuccess();
        },
        'mediaTimeUpdate': function () {
            return controllers.media().mediaTimeUpdate();
        },
        'mediaMouseMoved': function () {
            return controllers.media().mediaMouseMoved();
        },
        'mediaControlsMouseEnter': function () {
            return controllers.media().controlsMouseEnter();
        },
        'mediaControlsMouseLeave': function () {
            return controllers.media().controlsMouseLeave();
        },
        'openExternalPlayer': function () {
            return controllers.media().openExternalPlayer();
        },
        'externalPlayerNotFound': function () {
            return controllers.media().externalPlayerNotFound();
        },

        // Remote casting: Chromecast, Airplay, etc
        'toggleCastMenu': function (deviceType) {
            return lazyLoadCast().toggleMenu(deviceType);
        },
        'selectCastDevice': function (index) {
            return lazyLoadCast().selectDevice(index);
        },
        'stopCasting': function () {
            return lazyLoadCast().stop();
        },

        // Preferences screen
        'preferences': function () {
            return controllers.prefs().show();
        },
        'updatePreferences': function (key, value) {
            return controllers.prefs().update(key, value);
        },
        'checkDownloadPath': checkDownloadPath,

        // Update (check for new versions on Linux, where there's no auto updater)
        'updateAvailable': function (version) {
            return controllers.update().updateAvailable(version);
        },
        'skipVersion': function (version) {
            return controllers.update().skipVersion(version);
        },

        // Navigation between screens (back, forward, ESC, etc)
        'exitModal': function () {
            state.modal = null
        },
        'backToList': backToList,
        'escapeBack': escapeBack,
        'back': function () {
            return state.location.back();
        },
        'forward': function () {
            return state.location.forward();
        },
        'cancel': function () {
            return state.location.cancel();
        },

        // Controlling the window
        'setDimensions': setDimensions,
        'toggleFullScreen': function (setTo) {
            return ipcRenderer.send('toggleFullScreen', setTo);
        },
        'setTitle': function (title) {
            state.window.title = title
        },
        'resetTitle': function () {
            state.window.title = config.APP_WINDOW_TITLE
        },

        // Everything else
        'onOpen': onOpen,
        'error': onError,
        'uncaughtError': function (proc, err) {
            return telemetry.logUncaughtError(proc, err);
        },
        'stateSave': function () {
            return State.save(state);
        },
        'stateSaveImmediate': function () {
            return State.saveImmediate(state);
        },
        'update': function () {} // No-op, just trigger an update
    }

    // Events from the UI never modify state directly. Instead they call dispatch()
    function dispatch(action) {
        var args = [],
            len = arguments.length - 1;
        while (len-- > 0) args[len] = arguments[len + 1];

        // Log dispatch calls, for debugging, but don't spam
        if (!['mediaMouseMoved', 'mediaTimeUpdate', 'update'].includes(action)) {
            console.log('dispatch: %s %o', action, args)
        }

        var handler = dispatchHandlers[action]
        if (handler) {
            handler.apply(void 0, args)
        } else {
            console.error('Missing dispatch handler: ' + action)
        }

        // Update the virtual DOM, unless it's just a mouse move event
        if (action !== 'mediaMouseMoved' ||
            controllers.playback().showOrHidePlayerControls()) {
            update()
        }
    }

    // Listen to events from the main and webtorrent processes
    function setupIpc() {
        ipcRenderer.on('log', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return console.log.apply(console, args);
        })
        ipcRenderer.on('error', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return console.error.apply(console, args);
        })

        ipcRenderer.on('dispatch', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return dispatch.apply(void 0, args);
        })

        ipcRenderer.on('fullscreenChanged', onFullscreenChanged)
        ipcRenderer.on('windowBoundsChanged', onWindowBoundsChanged)

        var tc = controllers.torrent()
        ipcRenderer.on('wt-infohash', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return tc.torrentInfoHash.apply(tc, args);
        })
        ipcRenderer.on('wt-metadata', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return tc.torrentMetadata.apply(tc, args);
        })
        ipcRenderer.on('wt-done', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return tc.torrentDone.apply(tc, args);
        })
        ipcRenderer.on('wt-warning', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return tc.torrentWarning.apply(tc, args);
        })
        ipcRenderer.on('wt-error', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return tc.torrentError.apply(tc, args);
        })

        ipcRenderer.on('wt-progress', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return tc.torrentProgress.apply(tc, args);
        })
        ipcRenderer.on('wt-file-modtimes', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return tc.torrentFileModtimes.apply(tc, args);
        })
        ipcRenderer.on('wt-file-saved', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return tc.torrentFileSaved.apply(tc, args);
        })
        ipcRenderer.on('wt-poster', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return tc.torrentPosterSaved.apply(tc, args);
        })
        ipcRenderer.on('wt-audio-metadata', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return tc.torrentAudioMetadata.apply(tc, args);
        })
        ipcRenderer.on('wt-server-running', function (e) {
            var args = [],
                len = arguments.length - 1;
            while (len-- > 0) args[len] = arguments[len + 1];

            return tc.torrentServerRunning.apply(tc, args);
        })

        ipcRenderer.on('wt-uncaught-error', function (e, err) {
            return telemetry.logUncaughtError('webtorrent', err);
        })

        ipcRenderer.send('ipcReady')

        State.on('stateSaved', function () {
            return ipcRenderer.send('stateSaved');
        })
    }

    // Quits any modal popovers and returns to the torrent list screen
    function backToList() {
        // Exit any modals and screens with a back button
        state.modal = null
        state.location.backToFirst(function () {
            // If we were already on the torrent list, scroll to the top
            var contentTag = document.querySelector('.content')
            if (contentTag) {
                contentTag.scrollTop = 0
            }
        })
    }

    // Quits modals, full screen, or goes back. Happens when the user hits ESC
    function escapeBack() {
        if (state.modal) {
            dispatch('exitModal')
        } else if (state.window.isFullScreen) {
            dispatch('toggleFullScreen')
        } else {
            dispatch('back')
        }
    }

    // Starts all torrents that aren't paused on program startup
    function resumeTorrents() {
        state.saved.torrents
            .map(function (torrentSummary) {
                // Torrent keys are ephemeral, reassigned each time the app runs.
                // On startup, give all torrents a key, even the ones that are paused.
                torrentSummary.torrentKey = state.nextTorrentKey++
                    return torrentSummary
            })
            .filter(function (s) {
                return s.status !== 'paused';
            })
            .forEach(function (s) {
                return controllers.torrentList().startTorrentingSummary(s.torrentKey);
            })
    }

    // Set window dimensions to match video dimensions or fill the screen
    function setDimensions(dimensions) {
        // Don't modify the window size if it's already maximized
        if (electron.remote.getCurrentWindow().isMaximized()) {
            state.window.bounds = null
            return
        }

        // Save the bounds of the window for later. See restoreBounds()
        state.window.bounds = {
            x: window.screenX,
            y: window.screenY,
            width: window.outerWidth,
            height: window.outerHeight
        }
        state.window.wasMaximized = electron.remote.getCurrentWindow().isMaximized

        // Limit window size to screen size
        var screenWidth = window.screen.width
        var screenHeight = window.screen.height
        var aspectRatio = dimensions.width / dimensions.height
        var scaleFactor = Math.min(
            Math.min(screenWidth / dimensions.width, 1),
            Math.min(screenHeight / dimensions.height, 1)
        )
        var width = Math.max(
            Math.floor(dimensions.width * scaleFactor),
            config.WINDOW_MIN_WIDTH
        )
        var height = Math.max(
            Math.floor(dimensions.height * scaleFactor),
            config.WINDOW_MIN_HEIGHT
        )

        ipcRenderer.send('setAspectRatio', aspectRatio)
        ipcRenderer.send('setBounds', {
            contentBounds: true,
            x: null,
            y: null,
            width: width,
            height: height
        })
        state.playing.aspectRatio = aspectRatio
    }

    // Called when the user adds files (.torrent, files to seed, subtitles) to the app
    // via any method (drag-drop, drag to app icon, command line)
    function onOpen(files) {
        if (!Array.isArray(files)) {
            files = [files]
        }

        var url = state.location.url()
        var allTorrents = files.every(TorrentPlayer.isTorrent)
        var allSubtitles = files.every(controllers.subtitles().isSubtitle)

        if (allTorrents) {
            // Drop torrents onto the app: go to home screen, add torrents, no matter what
            dispatch('backToList')
            // All .torrent files? Add them.
            files.forEach(function (file) {
                return controllers.torrentList().addTorrent(file);
            })
        } else if (url === 'player' && allSubtitles) {
            // Drop subtitles onto a playing video: add subtitles
            controllers.subtitles().addSubtitles(files, true)
        } else if (url === 'home') {
            // Drop files onto home screen: show Create Torrent
            state.modal = null
            controllers.torrentList().showCreateTorrent(files)
        } else {
            // Drop files onto any other screen: show error
            return onError('Please go back to the torrent list before creating a new torrent.')
        }

        update()
    }

    function onError(err) {
        console.error(err.stack || err)
        sound.play('ERROR')
        state.errors.push({
            time: new Date().getTime(),
            message: err.message || err
        })

        update()
    }

    var editableHtmlTags = new Set(['input', 'textarea'])

    function onPaste(e) {
        if (editableHtmlTags.has(e.target.tagName.toLowerCase())) {
            return
        }
        controllers.torrentList().addTorrent(electron.clipboard.readText())

        update()
    }

    function onFocus(e) {
        state.window.isFocused = true
        state.dock.badge = 0
        update()
    }

    function onBlur() {
        state.window.isFocused = false
        update()
    }

    function onVisibilityChange() {
        state.window.isVisible = !document.webkitHidden
    }

    function onFullscreenChanged(e, isFullScreen) {
        state.window.isFullScreen = isFullScreen
        if (!isFullScreen) {
            // Aspect ratio gets reset in fullscreen mode, so restore it (Mac)
            ipcRenderer.send('setAspectRatio', state.playing.aspectRatio)
        }

        update()
    }

    function onWindowBoundsChanged(e, newBounds) {
        if (state.location.url() !== 'player') {
            state.saved.bounds = newBounds
            dispatch('stateSave')
        }
    }

    function checkDownloadPath() {
        fs.stat(state.saved.prefs.downloadPath, function (err, stat) {
            if (err) {
                state.downloadPathStatus = 'missing'
                return console.error(err)
            }
            if (stat.isDirectory()) {
                state.downloadPathStatus = 'ok'
            } else {
                state.downloadPathStatus = 'missing'
            }
        })
    }

});
