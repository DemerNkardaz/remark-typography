import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

import pkg from './package.json' with { type: 'json' };
const limit = pkg.bundleSizeLimit;

await rm('dist', {
	recursive: true,
	force: true,
});

const common = {
	bundle: true,
	treeShaking: true,
	sourcemap: true,
	metafile: true,
	platform: 'neutral',
	target: 'es2022',
	tsconfig: 'tsconfig.build.json',
};

const resultMJS = await build({
	...common,
	entryPoints: ['src/index.ts'],
	format: 'esm',
	outfile: 'dist/index.mjs',
	external: ['@yalla/typography-rules', 'unist-util-visit'],
});
const resultCJS = await build({
	...common,
	entryPoints: ['src/index.ts'],
	format: 'cjs',
	outfile: 'dist/index.cjs',
	external: ['@yalla/typography-rules', 'unist-util-visit'],
});

await writeFile('dist/meta-esm.json', JSON.stringify(resultMJS.metafile));
await writeFile('dist/meta-cjs.json', JSON.stringify(resultCJS.metafile));

const distFiles = readdirSync('dist').filter((f) => !f.endsWith('.map') && !f.endsWith('.json'));
const totalSize = distFiles.reduce((sum, f) => sum + statSync(`dist/${f}`).size, 0);

if (totalSize > limit) {
	console.log('\x1b[33m%s\x1b[0m', `Bundle too large: ${totalSize} > ${limit}`);
	process.exit(1);
} else {
	console.log('\x1b[32m%s\x1b[0m', `Bundle size: ${totalSize} < ${limit}`);
}
