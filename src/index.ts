import { visit } from 'unist-util-visit';
import type { Root, Text, Parent, Yaml, RootContent } from 'mdast';
import type { MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx';
import yaml from 'js-yaml';

import {
	getWeightedRules,
	rulesCount,
	rulesHas,
	isRuleDisabled,
	htmlNode,
	nodeToMdast,
	type NodeFunctionRule,
	type FunctionRule,
} from '@yalla/typography-rules';
import { joinNodes, splitNodes } from '@yalla/typography-rules/helpers';

import {
	applyRules,
	initRules,
	getFrontmatterLocale,
	warning,
	type TypographyCoreOptions,
} from '@yalla/typography-core';

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

export type RemarkTypographyOptions = TypographyCoreOptions;

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
	const config = {
		initTypographyRules: true,
		initMarkupRules: false,
		logs: false,
		locale: 'en',
		plugins: [],
		...options,
	} satisfies TypographyCoreOptions;

	initRules(config);

	config.plugins?.forEach((plugin) => plugin()());

	return (tree: Root) => {
		let frontmatterLocale: string | undefined;
		visit(tree, 'yaml', (node: Yaml) => {
			const data = yaml.load(node.value) as Record<string, unknown> | null;
			frontmatterLocale = getFrontmatterLocale(data);
		});

		const fileLocale = frontmatterLocale ?? config.locale ?? 'en';

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
						const transformedText = applyRules(combinedText, jsxLocale, { logs: config.logs });
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
				const transformedText = applyRules(combinedText, currentLocale, { logs: config.logs });
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
