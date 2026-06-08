import { visit } from 'unist-util-visit';
import type { Root, Text, Parent, Yaml, RootContent } from 'mdast';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx';
import yaml from 'js-yaml';

import {
	getWeightedRules,
	applyDefaultRules,
	rulesCount,
	rulesHas,
	isRuleDisabled,
	htmlNode,
	nodeToMdast,
	type NodeFunctionRule,
	type FunctionRule,
	type RegExpReplaceRule,
	type RegExpTransformRule,
} from '@yalla/typography-rules';
import { joinNodes, protect, splitNodes, unprotect } from '@yalla/typography-rules/helpers';

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
	initDefaultRules?: boolean;
	locale?: string;
	plugins?: (() => () => void)[];
	logs?: boolean;
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

function warning(message: string, showLogs: boolean): void {
	if (showLogs) {
		console.warn(`[@yalla/remark-typography] ${message}`);
	}
}

export function remarkTypography(options: RemarkTypographyOptions = {} as RemarkTypographyOptions) {
	const config = {
		initDefaultRules: true,
		logs: false,
		locale: 'en',
		...options,
	} satisfies RemarkTypographyOptions;

	if (config.initDefaultRules) {
		applyDefaultRules();
	}

	config.plugins?.forEach((plugin) => plugin()());

	return (tree: Root) => {
		let frontmatterLocale: string | undefined;
		visit(tree, 'yaml', (node: Yaml) => {
			const data = yaml.load(node.value) as Record<string, unknown> | null;
			if (!data) return;

			frontmatterLocale =
				(typeof data['locale'] === 'string' ? data['locale'] : undefined) ??
				(typeof data['lang'] === 'string' ? data['lang'] : undefined) ??
				(typeof data['language'] === 'string' ? data['language'] : undefined);
		});

		const fileLocale = frontmatterLocale ?? config.locale ?? 'en';

		function applyRules(text: string, locale: string): string {
			const rules = getWeightedRules(locale);
			if (rules.length === 0) return text;

			const [initialProtectedValue, protectedMatches] = protect(text);
			let value = initialProtectedValue;

			for (const item of rules) {
				if (!item?.kind) {
					if (config.logs) console.warn('[@yalla/remark-typography] Skipping invalid rule:', item);
					continue;
				}

				if (item.label && isRuleDisabled(item.label)) continue;
				if (item.kind === 'node') continue;

				try {
					switch (item.kind) {
						case 'function': {
							const funcItem = item as FunctionRule;
							const result = funcItem.rule(value, ...(funcItem.args ?? []));
							if (typeof result === 'string') value = result;
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
					if (config.logs)
						console.warn('[@yalla/remark-typography] Rule threw an error, skipping:', item, err);
				}
			}

			return unprotect(value, protectedMatches);
		}

		function applyNodeRules(textNodes: Text[], parent: Parent, locale: string): void {
			const rules = getWeightedRules(locale).filter(
				(r): r is NodeFunctionRule | FunctionRule => r.kind === 'node' || r.kind === 'function'
			);
			if (rules.length === 0) return;

			for (const textNode of textNodes) {
				let current: (Text | MdxJsxTextElement)[] = [textNode];

				for (const rule of rules) {
					if (rule.label && isRuleDisabled(rule.label)) continue;

					const next: (Text | MdxJsxTextElement)[] = [];

					for (const node of current) {
						if (node.type !== 'text') {
							next.push(node);
							continue;
						}

						let nodeList: ReturnType<typeof htmlNode>;

						if (rule.kind === 'node') {
							const nodeRule = rule as NodeFunctionRule;
							nodeList = htmlNode((node as Text).value, {
								expression: nodeRule.rule,
								nodes: nodeRule.nodes,
							});
						} else {
							const funcRule = rule as FunctionRule;
							const result = funcRule.rule((node as Text).value, ...(funcRule.args ?? []));
							if (typeof result === 'string' || !Array.isArray(result)) {
								next.push(node);
								continue;
							}
							nodeList = result;
						}

						if (nodeList.length === 1 && nodeList[0]!.type === 'text') {
							next.push(node);
							continue;
						}

						for (const n of nodeList) {
							next.push(nodeToMdast(n));
						}
					}

					current = next;
				}

				if (current.length === 1 && current[0] === textNode) continue;

				const index = parent.children.indexOf(textNode as RootContent);
				if (index !== -1) {
					parent.children.splice(index, 1, ...(current as RootContent[]));
				}
			}
		}

		function processNode(node: Root | RootContent, localeStack: string[]): void {
			if (EXCLUDED_TYPES.has(node.type)) return;

			const currentLocale = localeStack[localeStack.length - 1] ?? fileLocale;

			if (JSX_TYPES.has(node.type)) {
				const jsxNode = node as MdxJsxFlowElement | MdxJsxTextElement;
				const jsxLang = getJsxLang(jsxNode);

				if (jsxLang) {
					if (!rulesHas(fileLocale)) {
						warning(
							!rulesHas('common') || rulesCount('common') === 0
								? `No rules registered for both of common and "${jsxLang}" locales on <${jsxNode.name ?? 'unknown'}> node.`
								: `No rules registered for locale "${jsxLang}" on <${jsxNode.name ?? 'unknown'}> node, only common rules will be applied.`,
							config.logs
						);
					}
					localeStack.push(jsxLang);
				}

				const jsxLocale = localeStack[localeStack.length - 1] ?? fileLocale;

				if ('children' in jsxNode) {
					const directTextNodes = jsxNode.children.filter(
						(child): child is Text => child.type === 'text'
					);

					if (directTextNodes.length > 0) {
						const combinedText = joinNodes(directTextNodes);
						const transformedText = applyRules(combinedText, jsxLocale);
						splitNodes(transformedText, directTextNodes);
						applyNodeRules(directTextNodes, jsxNode as unknown as Parent, jsxLocale);
					}

					for (const child of jsxNode.children) {
						if (child.type !== 'text') {
							processNode(child as RootContent, localeStack);
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
				const combinedText = joinNodes(directTextNodes);
				const transformedText = applyRules(combinedText, currentLocale);
				splitNodes(transformedText, directTextNodes);
				applyNodeRules(directTextNodes, parent, currentLocale);
			}

			for (const child of parent.children) {
				if (child.type !== 'text') {
					processNode(child as RootContent, localeStack);
				}
			}
		}

		if (!rulesHas(fileLocale)) {
			warning(
				!rulesHas('common') || rulesCount('common') === 0
					? `No rules registered for both of common and "${fileLocale}" locales.`
					: `No rules registered for locale "${fileLocale}", only common rules will be applied.`,
				config.logs
			);
		}

		const rules = getWeightedRules(fileLocale);
		if (rules.length === 0) return;

		processNode(tree, [fileLocale]);
	};
}

export default remarkTypography;
