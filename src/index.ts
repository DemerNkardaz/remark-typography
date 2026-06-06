import { visit } from 'unist-util-visit';
import type { Root, Text, Parent, Yaml, Node } from 'mdast';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx';
import yaml from 'js-yaml';

import {
	getWeightedRules,
	typographyRules,
	type FunctionRule,
	type RegExpReplaceRule,
	type RegExpTransformRule,
} from '@yalla/typography-rules';
import {
	NODE_MARKER,
	PROTECTED_PATTERNS,
	PROTECTION_MARKER,
	NODE_MARKER_REGEX,
	PROTECTION_MARKER_REGEX,
} from '@yalla/typography-rules/helpers';

const EXCLUDED_TYPES = new Set([
	'code',
	'inlineCode',
	'math',
	'inlineMath',
	'html',
	'yaml',
	'toml',
]);

const JSX_TYPES = new Set(['mdxJsxFlowElement', 'mdxJsxTextElement']);

export interface RemarkTypographyOptions {
	locale?: keyof typeof typographyRules;
	plugins?: (() => () => void)[];
}

function getJsxLang(node: MdxJsxFlowElement | MdxJsxTextElement): string | undefined {
	for (const attr of node.attributes) {
		if (
			attr.type === 'mdxJsxAttribute' &&
			(attr.name === 'lang' || attr.name === 'language' || attr.name === 'locale') &&
			typeof attr.value === 'string'
		) {
			return attr.value;
		}
	}
	return undefined;
}

export function remarkTypography(options: RemarkTypographyOptions = {}) {
	let pluginsInitialized = false;

	return (tree: Root) => {
		if (!pluginsInitialized) {
			options.plugins?.forEach((plugin) => plugin()());
			pluginsInitialized = true;
		}

		let frontmatterLocale: string | undefined;
		visit(tree, 'yaml', (node: Yaml) => {
			const data = yaml.load(node.value) as Record<string, unknown> | null;
			if (!data) return;

			frontmatterLocale =
				(typeof data['locale'] === 'string' ? data['locale'] : undefined) ??
				(typeof data['lang'] === 'string' ? data['lang'] : undefined) ??
				(typeof data['language'] === 'string' ? data['language'] : undefined);
		});

		const fileLocale = frontmatterLocale ?? options.locale ?? 'en';

		function applyRules(text: string, locale: string): string {
			const rules = getWeightedRules(locale);
			if (rules.length === 0) return text;

			let value = text;
			const protectedMatches: string[] = [];

			value = value.replace(NODE_MARKER_REGEX, (match) => {
				protectedMatches.push(match);
				return PROTECTION_MARKER;
			});

			PROTECTED_PATTERNS.values.forEach((regex) => {
				value = value.replace(regex, (match) => {
					protectedMatches.push(match);
					return PROTECTION_MARKER;
				});
			});

			for (const item of rules) {
				if (!item || !item.kind) {
					console.warn('[@yalla/remark-typography] Skipping invalid rule:', item);
					continue;
				}

				try {
					switch (item.kind) {
						case 'function': {
							const funcItem = item as FunctionRule;
							value = funcItem.rule(value, ...(funcItem.args ?? []));
							break;
						}
						case 'transform': {
							const transformItem = item as RegExpTransformRule;
							value = value.replace(transformItem.rule, (match: string, ...groups: unknown[]) => {
								const regexArray = [match, ...groups] as unknown as RegExpExecArray;
								return transformItem.transform(regexArray);
							});
							break;
						}
						case 'replace': {
							const replaceItem = item as RegExpReplaceRule;
							value = value.replace(replaceItem.rule, replaceItem.replacement);
							break;
						}
					}
				} catch (err) {
					console.warn('[@yalla/remark-typography] Rule threw an error, skipping:', item, err);
				}
			}

			return value.replace(PROTECTION_MARKER_REGEX, () => protectedMatches.shift() ?? '');
		}

		function processNode(node: Node, localeStack: string[]): void {
			if (EXCLUDED_TYPES.has(node.type)) return;

			const currentLocale = localeStack[localeStack.length - 1] ?? fileLocale;

			// Check if this JSX node declares a lang attribute
			if (JSX_TYPES.has(node.type)) {
				const jsxNode = node as MdxJsxFlowElement | MdxJsxTextElement;
				const jsxLang = getJsxLang(jsxNode);

				if (jsxLang) {
					if (!typographyRules[jsxLang]) {
						console.warn(
							`[@yalla/remark-typography] No rules registered for locale "${jsxLang}" ` +
								`on <${jsxNode.name ?? 'unknown'}> node, only common rules will be applied.`
						);
					}
					localeStack.push(jsxLang);
				}

				const currentLocale = localeStack[localeStack.length - 1];

				if ('children' in jsxNode) {
					// Process direct text children of this JSX node
					const directTextNodes = jsxNode.children.filter(
						(child): child is Text => child.type === 'text'
					);

					if (directTextNodes.length > 0) {
						const combinedText = directTextNodes.map((n) => n.value).join(NODE_MARKER);
						const transformedText = applyRules(combinedText, currentLocale as string);
						const segments = transformedText.split(NODE_MARKER);
						directTextNodes.forEach((n, i) => {
							n.value = segments[i] ?? n.value;
						});
					}

					// Recurse into non-text children
					for (const child of jsxNode.children) {
						if (child.type !== 'text') {
							processNode(child as Node, localeStack);
						}
					}
				}

				if (jsxLang) localeStack.pop();
				return;
			}

			if (!('children' in node)) return;

			const parent = node as Parent;

			const directTextNodes = parent.children.filter(
				(child): child is Text => child.type === 'text'
			);

			if (directTextNodes.length > 0) {
				const combinedText = directTextNodes.map((n) => n.value).join(NODE_MARKER);
				const transformedText = applyRules(combinedText, currentLocale);
				const segments = transformedText.split(NODE_MARKER);

				directTextNodes.forEach((n, i) => {
					n.value = segments[i] ?? n.value;
				});
			}

			// Recurse into non-text children
			for (const child of parent.children) {
				if (child.type !== 'text') {
					processNode(child as Node, localeStack);
				}
			}
		}

		// Warn once for file locale if no rules
		if (!typographyRules[fileLocale]) {
			console.warn(
				`[@yalla/remark-typography] No rules registered for locale "${fileLocale}", ` +
					`only common rules will be applied.`
			);
		}

		const rules = getWeightedRules(fileLocale);
		if (rules.length === 0) return;

		processNode(tree, [fileLocale]);
	};
}

export default remarkTypography;
