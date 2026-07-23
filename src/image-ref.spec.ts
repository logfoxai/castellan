import {test} from 'kizu';
import {imageRefKey, managedServiceMatchesImage, parseImageRef} from './image-ref.js';

test('parseImageRef handles ECR images', (assert) => {

    const parsed = parseImageRef('123456789.dkr.ecr.us-east-1.amazonaws.com/api-service:prime');

    assert.equal(parsed?.registry, '123456789.dkr.ecr.us-east-1.amazonaws.com');
    assert.equal(parsed?.repository, 'api-service');
    assert.equal(parsed?.tag, 'prime');

});

test('parseImageRef defaults to docker.io and latest', (assert) => {

    const parsed = parseImageRef('nginx');

    assert.equal(parsed?.registry, 'docker.io');
    assert.equal(parsed?.repository, 'library/nginx');
    assert.equal(parsed?.tag, 'latest');

});

test('parseImageRef handles namespaced docker images', (assert) => {

    const parsed = parseImageRef('foo/bar:1.2.3');

    assert.equal(parsed?.registry, 'docker.io');
    assert.equal(parsed?.repository, 'foo/bar');
    assert.equal(parsed?.tag, '1.2.3');

});

test('parseImageRef handles GHCR images', (assert) => {

    const parsed = parseImageRef('ghcr.io/logfoxai/castellan:latest');

    assert.equal(parsed?.registry, 'ghcr.io');
    assert.equal(parsed?.repository, 'logfoxai/castellan');
    assert.equal(parsed?.tag, 'latest');

});

test('parseImageRef returns null for digest refs', (assert) => {

    assert.equal(parseImageRef('sha256:abc123'), null);
    assert.equal(parseImageRef('nginx@sha256:abc123'), null);

});

test('imageRefKey normalizes docker.io hosts', (assert) => {

    assert.equal(imageRefKey('docker.io', 'foo/bar', 'latest'), imageRefKey('registry-1.docker.io', 'foo/bar', 'latest'));

});

test('managedServiceMatchesImage compares normalized registry hosts', (assert) => {

    const parsed = parseImageRef('docker.io/myorg/api:staging');

    assert.equal(parsed !== null, true);

    if (!parsed) {

        return;

}

    assert.equal(
        managedServiceMatchesImage(
            {registry: 'docker.io', repository: 'myorg/api', tag: 'staging'},
            parsed,
        ),
        true,
    );

});
