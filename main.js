var {
    app,
    BrowserWindow,
    Tray,
    Menu,
    ipcMain
} = require('electron');

var path = require('path');
var url = require('url');


// Global reference of the window object
var win;

function createWindow() {

    // Create the browser window.

    win = new BrowserWindow({
        width: 880,
        height: 1220,
        titleBarStyle: 'hidden'
    })


    // Makes window un-scalable
    // win.setResizable(false);

    win.once('ready-to-show', function () {
        win.show()
    })


    // and load the index.html of the app.

    win.loadURL(url.format({
        pathname: path.join(__dirname, 'www/index.html'),
        protocol: 'file:',
        slashes: true
    }));



    // Open the DevTools.
    win.webContents.openDevTools()

    // Emitted when the window is closed.
    win.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        win = null
    });
}



// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    // if (process.platform !== 'darwin') {
    // if (appIcon) appIcon.destroy();
    app.quit();
    // };
});

app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
        createWindow();
    }
});

// ipc handler
ipcMain.on("resize", (event, args) => {

    // let videoWidth = document.querySelector('video')

    win.setContentBounds({
        x: 0,
        y: 0,
        width: args.w,
        height: args.h
    }, true);
})
