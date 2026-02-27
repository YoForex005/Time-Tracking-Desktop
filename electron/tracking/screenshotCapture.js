const { execFile } = require('child_process');
const { readFile, unlink } = require('fs/promises');

const PS_CAPTURE_SCRIPT = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$cursorPoint = [System.Windows.Forms.Cursor]::Position
$screen = [System.Windows.Forms.Screen]::FromPoint($cursorPoint)
$bounds = $screen.Bounds

$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, $bounds.Size)

$tmpFile = [System.IO.Path]::GetTempFileName()
$pngPath = [System.IO.Path]::ChangeExtension($tmpFile, 'png')
if (Test-Path $tmpFile) { Remove-Item $tmpFile -Force }

$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()

[PSCustomObject]@{
    path = $pngPath
    width = $bounds.Width
    height = $bounds.Height
    x = $bounds.X
    y = $bounds.Y
} | ConvertTo-Json -Compress
`;

function executePowerShell(script) {
    return new Promise((resolve, reject) => {
        execFile(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-STA', '-Command', script],
            { timeout: 15000, windowsHide: true, maxBuffer: 1024 * 1024 * 8 },
            (err, stdout, stderr) => {
                if (err) {
                    reject(new Error(stderr && String(stderr).trim() ? String(stderr).trim() : err.message));
                    return;
                }
                resolve(String(stdout || '').trim());
            }
        );
    });
}

async function captureCurrentMonitorPng() {
    const raw = await executePowerShell(PS_CAPTURE_SCRIPT);
    if (!raw) {
        throw new Error('Screenshot capture returned empty output');
    }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Screenshot metadata parse failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }

    const filePath = parsed?.path;
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('Screenshot capture metadata missing output path');
    }

    try {
        const imageBuffer = await readFile(filePath);
        return {
            imageBuffer,
            display: {
                width: Number(parsed.width) || 0,
                height: Number(parsed.height) || 0,
                x: Number(parsed.x) || 0,
                y: Number(parsed.y) || 0,
            },
        };
    } finally {
        await unlink(filePath).catch(() => {});
    }
}

module.exports = {
    captureCurrentMonitorPng,
};

