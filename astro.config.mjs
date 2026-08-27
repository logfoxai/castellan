import {defineConfig} from 'astro/config';
import {unified} from '@astrojs/markdown-remark';
import starlight from '@astrojs/starlight';
import {devPagefindPlugin} from './src/integrations/devPagefind.mjs';
import {devServerNoisePlugin} from './src/integrations/devServerNoise.mjs';
import {pagefindShimIntegration} from './src/integrations/pagefindShim.mjs';
import {remarkStarlightMdLinks} from './src/integrations/remark-starlight-md-links.mjs';
import {rehypeWrapTables} from './src/integrations/rehype-wrap-tables.mjs';

const isDev = process.env.NODE_ENV !== 'production';
const site = 'https://castellan.logfox.ai';
const ogImage = `${site}/screenshot.png`;
const ogImageAlt = 'Castellan — safe docker-compose deploys with health checks and rollback';

export default defineConfig({
	prefetch: isDev ? false : {prefetchAll: true, defaultStrategy: 'hover'},
	devToolbar: {enabled: false},
	markdown: {
		processor: unified({
			remarkPlugins: [remarkStarlightMdLinks],
			rehypePlugins: [rehypeWrapTables],
		}),
	},
	site,
	outDir: './docs-site',
	publicDir: './assets',
	security: {
		allowedDomains: [{}],
	},
	server: {
		headers: {
			'Cache-Control': 'no-store',
		},
	},
	vite: {
		plugins: [devServerNoisePlugin(), ...(isDev ? [devPagefindPlugin()] : [])],
		build: {
			cssMinify: 'esbuild',
		},
		server: {
			cors: true,
			headers: {
				'Cache-Control': 'no-store',
			},
			watch: {
				ignored: ['**/docs-site/**', '**/coverage/**'],
			},
		},
	},
	integrations: [
		starlight({
			title: 'Castellan',
			description:
				'Lightweight deployment control for docker-compose. Registry polling, rolling deploys, health verification, rollback, and an optional dashboard.',
			disable404Route: true,
			logo: {
				light: './assets/castellan-lockup-light.svg',
				dark: './assets/castellan-lockup-dark.svg',
				replacesTitle: true,
			},
			favicon: '/favicon.svg',
			head: [
				{tag: 'meta', attrs: {property: 'og:image', content: ogImage}},
				{tag: 'meta', attrs: {property: 'og:image:alt', content: ogImageAlt}},
				{tag: 'meta', attrs: {name: 'twitter:image', content: ogImage}},
				{tag: 'meta', attrs: {name: 'twitter:image:alt', content: ogImageAlt}},
			],
			expressiveCode: true,
			customCss: [
				'./src/styles/fonts.css',
				'./src/styles/docs-shared.css',
				'./src/styles/starlight-custom.css',
			],
			components: {
				Head: './src/overrides/Head.astro',
				Header: './src/overrides/Header.astro',
				Hero: './src/overrides/Hero.astro',
				Search: './src/overrides/Search.astro',
				ThemeSelect: './src/overrides/ThemeSelect.astro',
				MobileMenuToggle: './src/overrides/MobileMenuToggle.astro',
				MobileMenuFooter: './src/overrides/MobileMenuFooter.astro',
				PageFrame: './src/overrides/PageFrame.astro',
				PageTitle: './src/overrides/PageTitle.astro',
				Footer: './src/overrides/Footer.astro',
				SiteTitle: './src/overrides/SiteTitle.astro',
			},
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/logfoxai/castellan',
				},
				{
					icon: 'discord',
					label: 'Discord',
					href: 'https://discord.gg/2wyYnBDhWQ',
				},
			],
			sidebar: [
				{
					label: 'Introduction',
					items: [
						{label: 'Getting started', slug: 'getting-started'},
						{label: 'Label discovery', slug: 'label-discovery'},
						{label: 'Tags and versions', slug: 'tags-and-versions'},
						{label: 'Operating modes', slug: 'operating-modes'},
					],
				},
				{
					label: 'Setup',
					items: [
						{label: 'Configuration', slug: 'configuration'},
						{label: 'Supported registries', slug: 'registries'},
						{label: 'Migrating from Watchtower', slug: 'watchtower'},
					],
				},
				{
					label: 'Operations',
					items: [
						{label: 'Dashboard', slug: 'dashboard'},
						{label: 'Castellan CLI', slug: 'cli'},
						{label: 'API', slug: 'api'},
						{label: 'Security', slug: 'security'},
					],
				},
				{
					label: 'Project',
					items: [
						{label: 'Comparisons', slug: 'comparisons'},
						{label: 'Roadmap', slug: 'roadmap'},
					],
				},
			],
		}),
		pagefindShimIntegration(),
	],
});
