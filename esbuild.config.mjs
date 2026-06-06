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
	external: ['@yalla/typography-rules', 'unist-util-visit', 'js-yaml'],
});
const resultCJS = await build({
	...common,
	entryPoints: ['src/index.ts'],
	format: 'cjs',
	outfile: 'dist/index.cjs',
	external: ['@yalla/typography-rules', 'unist-util-visit', 'js-yaml'],
});

await writeFile('dist/meta-esm.json', JSON.stringify(resultMJS.metafile));
await writeFile('dist/meta-cjs.json', JSON.stringify(resultCJS.metafile));

function getDirSize(dir) {
	return readdirSync(dir).reduce((sum, f) => {
		const full = `${dir}/${f}`;
		if (statSync(full).isDirectory()) return sum + getDirSize(full);
		if (f.endsWith('.map') || f.endsWith('.json')) return sum;
		return sum + statSync(full).size;
	}, 0);
}

const totalSize = getDirSize('dist');

if (totalSize > limit) {
	console.log('\x1b[33m%s\x1b[0m', `Bundle too large: ${totalSize} > ${limit}`);
	process.exit(1);
} else {
	console.log('\x1b[32m%s\x1b[0m', `Bundle size: ${totalSize} < ${limit}`);
}
