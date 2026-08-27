#!/usr/bin/env node
/**
 * Built splash homepage must render the Astro page sections.
 * Run after `astro:build` (wired into npm run validate).
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'docs-site', 'index.html');

if (!fs.existsSync(htmlPath)) {
	console.error('assert-splash-page: missing docs-site/index.html (run astro:build first)');
	process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');

const required = [
	'splash-page',
	'splash-hero',
	'splash-hero__headline',
	'splash-how',
	'splash-flow',
	'splash-features',
	'splash-demo',
	'splash-sdk',
	'splash-agents',
	'splash-auth',
	'splash-support',
	'Gate CI on rollouts',
	'Built-in dashboard',
	'Migrating from Watchtower',
	'Keep it on your private network',
	'Need a hand?',
	'https://discord.gg/2wyYnBDhWQ',
	'splash-hero__accent',
	'>Guard</span>',
	'health checks and rollback',
];

const missing = required.filter((needle) => !html.includes(needle));
if (missing.length > 0) {
	console.error('assert-splash-page: index.html is missing expected splash content:');
	for (const item of missing) {
		console.error(`  - ${item}`);
	}
	process.exit(1);
}

console.log('assert-splash-page: ok');
