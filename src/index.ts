import { visit, SKIP, type VisitorResult } from 'unist-util-visit';
import type { Root, Text, Parent, Yaml } from 'mdast';
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

// Node types whose subtree must not be touched by typography rules.
// Inline-code and block-code patterns are already handled by PROTECTED_PATTERNS
// at the text level, but we also skip the mdast nodes so we never even enter them.
const EXCLUDED_TYPES = new Set([
	'code', // fenced / indented code block
	'inlineCode', // `backtick` spans
	'math', // remark-math block
	'inlineMath', // remark-math inline
	'html', // raw HTML blocks — content is opaque markup, not prose
	'yaml', // frontmatter (remark-frontmatter)
	'toml', // frontmatter (remark-frontmatter)
]);

export interface RemarkTypographyOptions {
	locale?: keyof typeof typographyRules;
	plugins?: (() => () => void)[];
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

		const locale = frontmatterLocale ?? options.locale ?? 'en';
		const hasLocaleRules = !!typographyRules[locale];

		if (!hasLocaleRules) {
			console.warn(
				`[@yalla/remark-typography] No rules registered for locale "${locale}", ` +
					`only common rules will be applied.`
			);
		}

		const rules = getWeightedRules(locale);

		if (rules.length === 0) return;

		function applyRules(text: string): string {
			let value = text;
			const protectedMatches: string[] = [];

			// Protect special sequences before applying rules.
			// NODE_MARKER must be protected first so rules cannot corrupt
			// the inter-node boundary markers.
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

		visit(tree, (node): VisitorResult => {
			// Stop descending into excluded subtrees entirely.
			if (EXCLUDED_TYPES.has(node.type)) {
				return SKIP;
			}

			// We only care about nodes that have children.
			if (!('children' in node)) {
				return;
			}

			const parent = node as Parent;

			// Collect only the *direct* text-node children.
			// visit() already walks the whole tree recursively, so we must NOT
			// recurse again here — doing so causes every text node to be processed
			// once per ancestor level (grandparent, great-grandparent, …).
			const directTextNodes = parent.children.filter(
				(child): child is Text => child.type === 'text'
			);

			if (directTextNodes.length === 0) {
				return;
			}

			// Join sibling text nodes with NODE_MARKER so that rules which rely on
			// surrounding context (e.g. space before/after punctuation) see a single
			// coherent string rather than isolated fragments.
			const combinedText = directTextNodes.map((n) => n.value).join(NODE_MARKER);
			const transformedText = applyRules(combinedText);
			const segments = transformedText.split(NODE_MARKER);

			directTextNodes.forEach((n, i) => {
				// Fallback to original value if segments are out of sync —
				// can happen if a rule accidentally removes a NODE_MARKER.
				n.value = segments[i] ?? n.value;
			});
		});
	};
}

export default remarkTypography;
