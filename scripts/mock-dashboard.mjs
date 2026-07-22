import express from 'express';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const uiDir = path.join(root, 'dist', 'ui');
const assetsDir = path.join(root, 'assets');
const port = Number(process.env.PORT ?? 3333);

const registry = '123456789.dkr.ecr.us-east-2.amazonaws.com';

const services = [
    {
        name: 'api',
        registry,
        repository: 'api-service',
        tag: 'prime',
        state: 'stable',
        currentDigest: 'sha256:7d3f8a2e1c9b4a6f5e0d2c8a3b7f1e4d9c6a2b5e8f3d7c1a4b6e9f2d5c8a1b4e7',
        desiredDigest: 'sha256:7d3f8a2e1c9b4a6f5e0d2c8a3b7f1e4d9c6a2b5e8f3d7c1a4b6e9f2d5c8a1b4e7',
        lastCheckAt: new Date().toISOString(),
        lastError: null,
    },
    {
        name: 'ingest-worker',
        registry,
        repository: 'ingest-worker',
        tag: 'prime',
        state: 'stable',
        currentDigest: 'sha256:9e1b4c7f2a8d5e0b3c6a9f1d4e7b2a5c8f3d6a1e4b7c0f2d5a8e1b4c7f0a3d6a9',
        desiredDigest: 'sha256:9e1b4c7f2a8d5e0b3c6a9f1d4e7b2a5c8f3d6a1e4b7c0f2d5a8e1b4c7f0a3d6a9',
        lastCheckAt: new Date().toISOString(),
        lastError: null,
    },
    {
        name: 'issue-worker',
        registry,
        repository: 'issue-worker',
        tag: 'prime',
        state: 'updating',
        currentDigest: 'sha256:3c6f9a2d5e8b1c4f7a0d3e6b9c2f5a8d1e4b7c0a3f6d9e2b5c8f1a4d7e0b3c6a9',
        desiredDigest: 'sha256:4d8e1b5c9f2a6d0e3b7c1a5f9d2e6b0c4a8f2d6b0c4a8f2d6b0c4a8f2d6b0c4a8f',
        lastCheckAt: new Date().toISOString(),
        lastError: null,
    },
];

const events = [
    {at: new Date(Date.now() - 1000 * 60 * 2).toISOString(), type: 'deploy', service: 'issue-worker', message: 'Restarted issue-worker to sha256:4d8e...'},
    {at: new Date(Date.now() - 1000 * 60 * 5).toISOString(), type: 'check', service: 'api', message: 'Registry tag unchanged'},
    {at: new Date(Date.now() - 1000 * 60 * 15).toISOString(), type: 'deploy', service: 'api', message: 'Rolling restart of api-1, api-2 completed'},
    {at: new Date(Date.now() - 1000 * 60 * 45).toISOString(), type: 'rollback', service: 'ingest-worker', message: 'Health check failed; rolled back to sha256:9e1b...'},
    {at: new Date(Date.now() - 1000 * 60 * 60).toISOString(), type: 'failure', service: 'ingest-worker', message: 'New digest failed HTTP health check'},
    {at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), type: 'check', service: 'issue-worker', message: 'New digest available'},
];

const containers = [
    {id: 'a1b2c3d4e5f6', name: 'api_api-1_1', displayName: 'api-1', image: 'api-service:latest', state: 'running', status: 'Up 2 hours', disk: '18 MB'},
    {id: 'b2c3d4e5f6a7', name: 'api_api-2_1', displayName: 'api-2', image: 'api-service:latest', state: 'running', status: 'Up 2 hours', disk: '17 MB'},
    {id: 'c3d4e5f6a7b8', name: 'api_ingest-worker_1', displayName: 'ingest-worker', image: 'ingest-worker:latest', state: 'running', status: 'Up 2 hours', disk: '9 MB'},
    {id: 'd4e5f6a7b8c9', name: 'api_issue-worker_1', displayName: 'issue-worker', image: 'issue-worker:latest', state: 'running', status: 'Up 5 minutes', disk: '11 MB'},
    {id: 'e5f6a7b8c9d0', name: 'api_castellan_1', displayName: 'castellan', image: 'logfoxai/castellan:latest', state: 'running', status: 'Up 2 hours', disk: '6 MB'},
];

const stats = [
    {name: 'api_api-1_1', cpu: '0.42%', mem: '48.3MiB', memPerc: '0.61%'},
    {name: 'api_api-2_1', cpu: '0.38%', mem: '46.1MiB', memPerc: '0.58%'},
    {name: 'api_ingest-worker_1', cpu: '1.74%', mem: '132MiB', memPerc: '1.66%'},
    {name: 'api_issue-worker_1', cpu: '3.21%', mem: '204MiB', memPerc: '2.57%'},
    {name: 'api_castellan_1', cpu: '0.09%', mem: '38.7MiB', memPerc: '0.49%'},
];

const logsByContainer = {
    a1b2c3d4e5f6: '2026-07-21 20:31:12 INFO  Server listening on port 3000\n2026-07-21 20:31:12 INFO  Health check passed\n2026-07-21 20:31:15 INFO  Request /health 200 OK\n2026-07-21 20:31:18 INFO  Request /health 200 OK',
    b2c3d4e5f6a7: '2026-07-21 20:31:10 INFO  Server listening on port 3000\n2026-07-21 20:31:11 INFO  Health check passed\n2026-07-21 20:31:14 INFO  Request /health 200 OK',
    c3d4e5f6a7b8: '2026-07-21 20:30:45 INFO  Worker started\n2026-07-21 20:30:46 INFO  Connected to queue\n2026-07-21 20:31:00 INFO  Processing batch 1',
    d4e5f6a7b8c9: '2026-07-21 20:32:01 INFO  Starting deployment\n2026-07-21 20:32:02 INFO  Pulled new image\n2026-07-21 20:32:03 INFO  Verifying health...',
    e5f6a7b8c9d0: '2026-07-21 20:29:00 INFO  Castellan started\n2026-07-21 20:29:01 INFO  Loaded config\n2026-07-21 20:29:02 INFO  Polling registries',
};

const app = express();
app.use(express.json());

app.use('/assets', express.static(assetsDir));
app.use(express.static(uiDir));

app.post('/v1', (req, res) => {
    const {method} = req.body;

    switch (method) {
        case 'status':
            return res.json({paused: false, services});
        case 'history':
            return res.json({events});
        case 'dockerContainers':
            return res.json({containers});
        case 'dockerStatsAll':
            return res.json({stats});
        case 'dockerImages':
            return res.json({images: []});
        case 'dockerNetworks':
            return res.json({networks: []});
        case 'dockerVolumes':
            return res.json({volumes: []});
        case 'dockerLogs':
            return res.json({logs: logsByContainer[req.body.args[0].containerId] ?? ''});
        case 'dockerStats':
        case 'dockerInfo':
        case 'dockerEvents':
        case 'forceCheck':
        case 'pause':
        case 'resume':
        case 'rollback':
            return res.json({ok: true});
        default:
            return res.status(404).json({error: 'Unknown method'});
    }
});

app.get('*', (_req, res) => {
    res.sendFile(path.join(uiDir, 'index.html'));
});

app.listen(port, () => {
    console.log(`Mock dashboard at http://localhost:${port}`);
});
