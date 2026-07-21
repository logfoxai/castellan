import {test} from 'kizu';
import {parseImageRef} from './watchtower.js';

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

test('parseImageRef returns null for digest refs', (assert) => {

    assert.equal(parseImageRef('sha256:abc123'), null);
    assert.equal(parseImageRef('nginx@sha256:abc123'), null);

});
