import {test} from 'kizu';
import {mkdtemp, readFile, rm} from 'fs/promises';
import {tmpdir} from 'os';
import path from 'path';
import {
    AUTH_TOKEN_ENV,
    AUTH_TOKEN_FILENAME,
    resolveAuthToken,
} from './auth-token.js';

async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {

    const previous: Record<string, string | undefined> = {};

    for (const [name, value] of Object.entries(vars)) {

        previous[name] = process.env[name];

        if (value === undefined) {

            delete process.env[name];

} else {

            process.env[name] = value;

}

}

    try {

        return await fn();

} finally {

        for (const [name, value] of Object.entries(previous)) {

            if (value === undefined) {

                delete process.env[name];

} else {

                process.env[name] = value;

}

}

}

}

test('resolveAuthToken prefers config over env and file', async (assert) => {

    const dir = await mkdtemp(path.join(tmpdir(), 'castellan-auth-'));

    try {

        await withEnv({[AUTH_TOKEN_ENV]: 'from-env'}, async () => {

            await writeTokenFile(dir, 'from-file');

            const resolved = await resolveAuthToken('from-config', path.join(dir, 'state.json'));

            assert.equal(resolved.token, 'from-config');
            assert.equal(resolved.source, 'config');

});

} finally {

        await rm(dir, {recursive: true, force: true});

}

});

test('resolveAuthToken uses env when config is missing', async (assert) => {

    const dir = await mkdtemp(path.join(tmpdir(), 'castellan-auth-'));

    try {

        await withEnv({[AUTH_TOKEN_ENV]: 'from-env'}, async () => {

            const resolved = await resolveAuthToken(undefined, path.join(dir, 'state.json'));

            assert.equal(resolved.token, 'from-env');
            assert.equal(resolved.source, 'env');

});

} finally {

        await rm(dir, {recursive: true, force: true});

}

});

test('resolveAuthToken reads persisted token file', async (assert) => {

    const dir = await mkdtemp(path.join(tmpdir(), 'castellan-auth-'));

    try {

        await withEnv({[AUTH_TOKEN_ENV]: undefined}, async () => {

            await writeTokenFile(dir, 'persisted-token');

            const resolved = await resolveAuthToken(undefined, path.join(dir, 'state.json'));

            assert.equal(resolved.token, 'persisted-token');
            assert.equal(resolved.source, 'file');

});

} finally {

        await rm(dir, {recursive: true, force: true});

}

});

test('resolveAuthToken generates and persists a token when unset', async (assert) => {

    const dir = await mkdtemp(path.join(tmpdir(), 'castellan-auth-'));

    try {

        await withEnv({[AUTH_TOKEN_ENV]: undefined}, async () => {

            const statePath = path.join(dir, 'state.json');
            const resolved = await resolveAuthToken(undefined, statePath);

            assert.equal(resolved.source, 'generated');
            const token = resolved.token ?? '';

            assert.equal(token.length >= 32, true);
            assert.equal(
                (await readFile(resolved.tokenFilePath ?? '', 'utf8')).trim(),
                resolved.token,
            );

            const again = await resolveAuthToken(undefined, statePath);

            assert.equal(again.source, 'file');
            assert.equal(again.token, resolved.token);

});

} finally {

        await rm(dir, {recursive: true, force: true});

}

});

async function writeTokenFile(dir: string, token: string): Promise<void> {

    const {writeFile, mkdir} = await import('fs/promises');

    await mkdir(dir, {recursive: true});
    await writeFile(path.join(dir, AUTH_TOKEN_FILENAME), `${token}\n`, 'utf8');

}
