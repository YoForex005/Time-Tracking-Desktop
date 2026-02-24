const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;
let backendProcess;

function startBackend() {
    if (isDev) return;
    const backendPath = path.join(process.resourcesPath, 'backend', 'dist', 'index.js');
    backendProcess = spawn('node', [backendPath], { detached: false, stdio: 'pipe' });
    backendProcess.stdout.on('data', d => console.log('[Backend]', d.toString()));
    backendProcess.stderr.on('data', d => console.error('[Backend]', d.toString()));
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1100,
        height: 720,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
        },
        backgroundColor: '#0a0b0f',
        show: false,
    });

    const startUrl = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);
    mainWindow.once('ready-to-show', () => mainWindow.show());
    mainWindow.on('closed', () => { mainWindow = null; });
}

// IPC window controls
ipcMain.on('window-close', () => mainWindow && mainWindow.close());
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
});

app.whenReady().then(() => {
    startBackend();
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (backendProcess) backendProcess.kill();
    if (process.platform !== 'darwin') app.quit();
});
