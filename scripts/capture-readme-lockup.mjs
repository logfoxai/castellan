import {spawn} from 'child_process';
import {readFile, writeFile} from 'fs/promises';
import {setTimeout as sleep} from 'timers/promises';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'assets');
const port = Number(process.env.PORT ?? 3334);
const baseUrl = `http://127.0.0.1:${port}`;

/** README hero width — close to kizu's 254px SVG lockup. */
const README_SCALE = 2.75;

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

function lockupPage(theme, cssHref, assetBase) {
    return `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${cssHref}" />
  <style>
    :root {
      --font-ui: 'Outfit', sans-serif;
    }
    html, body {
      margin: 0;
      background: transparent !important;
    }
    body {
      padding: 12px;
      display: inline-block;
    }
    .header-lockup {
      gap: 0 !important;
      transform: scale(${README_SCALE});
      transform-origin: left top;
    }
    .header-wordmark {
      margin-left: -2px !important;
      transform: translateY(2px) !important;
    }
  </style>
</head>
<body>
  <div class="header-lockup" aria-label="Castellan">
    <span class="header-mark" aria-hidden="true">
      <img src="${assetBase}/castellan-logo-light.png" alt="" class="header-logo logo-light" />
      <img src="${assetBase}/castellan-logo-dark.png" alt="" class="header-logo logo-dark" />
    </span>
    <h1 class="header-wordmark">Castellan</h1>
  </div>
</body>
</html>`;
}

async function capture() {
    const {chromium} = await import('playwright');

    const cssFiles = await readFile(path.join(root, 'dist/ui/index.html'), 'utf8').then((html) => {
        const match = html.match(/href="(\/assets\/index-[^"]+\.css)"/);
        return match?.[1] ?? '/assets/index.css';
    }).catch(() => '/assets/index.css');

    const cssHref = `${baseUrl}${cssFiles.startsWith('/') ? cssFiles : `/${cssFiles}`}`;
    const assetBase = `${baseUrl}/assets`;

    const browser = await chromium.launch();
    const page = await browser.newPage({
        viewport: {width: 360, height: 160},
        deviceScaleFactor: 1,
    });

    const shots = [
        {file: 'castellan-lockup-light.png', theme: 'light'},
        {file: 'castellan-lockup-dark.png', theme: 'dark'},
    ];

    for (const shot of shots) {
        await page.setContent(lockupPage(shot.theme, cssHref, assetBase), {waitUntil: 'networkidle'});
        await page.evaluate(() => document.fonts.ready);
        await sleep(250);
        await page.locator('.header-lockup').screenshot({
            path: path.join(assetsDir, shot.file),
            omitBackground: true,
        });
        console.log(`Saved ${shot.file}`);
    }

    await browser.close();

    for (const shot of shots) {
        const pngPath = path.join(assetsDir, shot.file);
        const png = await readFile(pngPath);
        const svgPath = pngPath.replace(/\.png$/, '.svg');
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="241" height="66" viewBox="0 0 241 66" role="img" aria-label="Castellan">
  <image width="241" height="66" href="data:image/png;base64,${png.toString('base64')}"/>
</svg>
`;
        await writeFile(svgPath, svg);
        console.log(`Saved ${path.basename(svgPath)}`);
    }
}

const server = await startMockServer();
try {
    await capture();
} finally {
    server.kill('SIGTERM');
}
