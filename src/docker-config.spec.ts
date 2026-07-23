import {test} from 'kizu';
import {mkdtemp, writeFile, rm} from 'fs/promises';
import os from 'os';
import path from 'path';
import {loadDockerConfigCredentials} from './docker-config.js';

async function tempDir(): Promise<string> {

    return mkdtemp(path.join(os.tmpdir(), 'castellan-docker-config-'));

}

async function withDockerConfigDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {

    const previous = process.env.DOCKER_CONFIG;

    process.env.DOCKER_CONFIG = dir;

    try {

        return await fn();

} finally {

        if (previous === undefined) {

            delete process.env.DOCKER_CONFIG;

} else {

            process.env.DOCKER_CONFIG = previous;

}

}

}

test('loadDockerConfigCredentials parses base64 auth entries', async (assert) => {

    const dir = await tempDir();
    const auth = Buffer.from('myuser:ghp_secret').toString('base64');

    await writeFile(
        path.join(dir, 'config.json'),
        JSON.stringify({auths: {'ghcr.io': {auth}}}),
        'utf8',
    );

    const creds = await withDockerConfigDir(dir, () => loadDockerConfigCredentials());

    assert.equal(creds['ghcr.io'].username, 'myuser');
    assert.equal(creds['ghcr.io'].password, 'ghp_secret');

    await rm(dir, {recursive: true, force: true});

});
