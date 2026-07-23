import {test} from 'kizu';
import {parseManifestInspectStdout, resolveManifestList} from './manifest.js';

test('parseManifestInspectStdout resolves manifest list output', (assert) => {

    const stdout = JSON.stringify({
        schemaVersion: 2,
        mediaType: 'application/vnd.oci.image.index.v1+json',
        manifests: [
            {
                digest: 'sha256:amd64',
                platform: {architecture: 'amd64', os: 'linux'},
            },
            {
                digest: 'sha256:arm64',
                platform: {architecture: 'arm64', os: 'linux'},
            },
        ],
    });

    assert.equal(resolveManifestList(stdout, 'linux/amd64'), 'sha256:amd64');
    assert.equal(parseManifestInspectStdout(stdout, 'linux/amd64'), 'sha256:amd64');

});

test('parseManifestInspectStdout picks platform digest from verbose output', (assert) => {

    const stdout = JSON.stringify([
        {
            Descriptor: {
                digest: 'sha256:amd64',
                platform: {architecture: 'amd64', os: 'linux'},
            },
        },
        {
            Descriptor: {
                digest: 'sha256:arm64',
                platform: {architecture: 'arm64', os: 'linux'},
            },
        },
    ]);

    assert.equal(parseManifestInspectStdout(stdout, 'linux/amd64'), 'sha256:amd64');

});
