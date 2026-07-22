import {spawn} from 'child_process';
import {setTimeout as sleep} from 'timers/promises';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'assets');
const port = Number(process.env.PORT ?? 3333);
const baseUrl = `http://127.0.0.1:${port}`;

async function startMockServer() {
    const child = spawn('node', ['scripts/mock-dashboard.mjs'], {
        cwd: root,
        env: {...process.env, PORT: String(port)},
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Mock server did not start')), 10000);
        child.stdout.on('data', (chunk) => {
            if (chunk.toString().includes('Mock dashboard at')) {
                clearTimeout(timeout);
                resolve(undefined);
            }
        });
        child.stderr.on('data', (chunk) => process.stderr.write(chunk));
        child.on('error', reject);
    });

    return child;
}

async function capture() {
    const {chromium} = await import('playwright');

    const browser = await chromium.launch();
    // Retina-quality context sized to the dashboard's max content width so the
    // full-page capture never clips horizontally.
    const context = await browser.newContext({
        viewport: {width: 1440, height: 960},
        deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/`, {waitUntil: 'networkidle'});
    await sleep(600);

    const shots = [
        {file: 'screenshot.png', theme: 'dark'},
        {file: 'screenshot-light.png', theme: 'light'},
    ];

    for (const shot of shots) {
        await page.evaluate((theme) => {
            document.documentElement.setAttribute('data-theme', theme);
        }, shot.theme);
        await sleep(300);
        await page.screenshot({
            path: path.join(assetsDir, shot.file),
            fullPage: true,
        });
        console.log(`Saved ${shot.file}`);
    }

    await context.close();
    await browser.close();
}

const server = await startMockServer();
try {
    await capture();
} finally {
    server.kill('SIGTERM');
}
