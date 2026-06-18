import { describe, it, expect } from 'vitest';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Root, Heading, Blockquote, List, RootContent, Yaml } from 'mdast';
import { remarkTypography } from './index';

// ---------------------------------------------------------------------------
// AST-level helper — returns the transformed mdast tree without serializing.
// Serialization via remark-stringify escapes characters like & → \& and
// may add backslashes before Unicode punctuation, making string assertions
// unreliable for anything beyond plain ASCII prose.
// ---------------------------------------------------------------------------
function parseAndTransform(markdown: string, locale: 'ru' | 'en' = 'ru'): Root {
	return unified()
		.use(remarkParse)
		.use(remarkTypography, { locale })
		.runSync(unified().use(remarkParse).parse(markdown)) as Root;
}

// Collect all Text node values from a subtree.
function textValues(node: Root | Root['children'][number]): string[] {
	const values: string[] = [];
	function walk(n: unknown): void {
		if (!n || typeof n !== 'object') return;
		const obj = n as Record<string, unknown>;
		if (obj['type'] === 'text' && typeof obj['value'] === 'string') {
			values.push(obj['value'] as string);
		}
		if (Array.isArray(obj['children'])) {
			(obj['children'] as unknown[]).forEach(walk);
		}
	}
	walk(node);
	return values;
}

function allText(markdown: string, locale: 'ru' | 'en' = 'ru'): string {
	return textValues(parseAndTransform(markdown, locale)).join('');
}

// ---------------------------------------------------------------------------
// Manual-tree helper — runs the plugin against a hand-built mdast tree
// instead of parsing a markdown string. Needed to cover frontmatter (`yaml`
// node) and MDX JSX nodes (`mdxJsxFlowElement` / `mdxJsxTextElement`)
// WITHOUT pulling in remark-frontmatter or remark-mdx as dependencies —
// the plugin only cares about node shape, not how the tree was produced.
// ---------------------------------------------------------------------------
function transformTree(tree: Root, locale: 'ru' | 'en' = 'ru'): Root {
	return unified().use(remarkTypography, { locale }).runSync(tree) as Root;
}

describe('remarkTypography', () => {
	// -------------------------------------------------------------------------
	// Code nodes must not be touched
	// -------------------------------------------------------------------------

	describe('excluded nodes', () => {
		it('does not modify fenced code blocks', () => {
			const tree = parseAndTransform('```\n"hello" -- world\n```');
			const codeNode = tree.children[0] as { type: string; value: string };
			expect(codeNode.type).toBe('code');
			expect(codeNode.value).toContain('"hello" -- world');
		});

		it('does not modify inline code', () => {
			const tree = parseAndTransform('Text with `"inline" -- code` here.');
			// Find the inlineCode node directly in the AST
			const para = tree.children[0] as { children: { type: string; value: string }[] };
			const inlineCode = para.children.find((n) => n.type === 'inlineCode');
			expect(inlineCode?.value).toBe('"inline" -- code');
		});
	});

	// -------------------------------------------------------------------------
	// PROTECTED_PATTERNS must survive untouched
	// -------------------------------------------------------------------------

	describe('protected patterns', () => {
		it('does not modify URLs', () => {
			// Check AST text value — remark-stringify escapes & but the node value must not
			const url = 'https://example.com/path?q=1&r=2';
			expect(allText(`Visit ${url} for details.`)).toContain(url);
		});

		it('does not modify email addresses', () => {
			const email = 'user@example.com';
			expect(allText(`Contact ${email} today.`)).toContain(email);
		});

		it('does not modify version strings', () => {
			expect(allText('Released v1.2.3 yesterday.')).toContain('v1.2.3');
		});

		it('does not modify UUIDs', () => {
			const uuid = '550e8400-e29b-41d4-a716-446655440000';
			expect(allText(`ID: ${uuid}`)).toContain(uuid);
		});
	});

	// -------------------------------------------------------------------------
	// Typography rules must fire on regular prose
	// -------------------------------------------------------------------------

	describe('typography rules — ru locale', () => {
		it('replaces straight double quotes with «»', () => {
			expect(allText('Он сказал "привет".')).toContain('«привет»');
		});

		it('replaces double hyphen with em dash', () => {
			const text = allText('Это -- тире.');
			expect(text).toContain('—');
			expect(text).not.toContain('--');
		});

		it('applies rules inside headings', () => {
			const tree = parseAndTransform('# Заголовок "в кавычках"');
			const heading = tree.children[0] as Heading;
			expect(textValues(heading).join('')).toContain('Заголовок «в\u00A0кавычках»');
		});

		it('applies rules inside blockquotes', () => {
			const tree = parseAndTransform('> Цитата "в кавычках"');
			const blockquote = tree.children[0] as Blockquote;
			expect(textValues(blockquote).join('')).toContain('Цитата «в\u00A0кавычках»');
		});

		it('applies rules inside list items', () => {
			const tree = parseAndTransform('- Пункт "один"');
			const list = tree.children[0] as List;
			expect(textValues(list).join('')).toContain('«один»');
		});
	});

	describe('typography rules — en locale', () => {
		it('replaces straight double quotes with curly quotes', () => {
			const text = allText('She said "hello".', 'en');
			expect(text).not.toContain('"hello"');
		});
	});

	// -------------------------------------------------------------------------
	// Each text node must be processed exactly once
	// -------------------------------------------------------------------------

	describe('idempotency and no double-processing', () => {
		it('does not double-apply rules on nested inline nodes', () => {
			// Paragraph has two text siblings separated by a strong node.
			// The paragraph visit must not re-process grandchildren.
			const text = allText('Plain "text" and **bold "text"** here.');
			const quoteCount = (text.match(/«/g) ?? []).length;
			expect(quoteCount).toBe(2);
		});

		it('does not apply rules more than once per text node', () => {
			// «» must appear exactly once — double processing would produce ««привет»»
			const text = allText('Он сказал "привет".');
			expect(text).not.toContain('««');
			expect(text).not.toContain('»»');
			expect((text.match(/«/g) ?? []).length).toBe(1);
		});
	});

	// -------------------------------------------------------------------------
	// Frontmatter-driven locale resolution (`yaml` node + getFrontmatterLocale)
	// -------------------------------------------------------------------------

	describe('frontmatter locale resolution', () => {
		it('uses the locale declared in frontmatter, overriding the option default', () => {
			// Plugin configured with locale: 'en', but frontmatter declares 'ru' —
			// frontmatter must win, so straight quotes become «» not “”.
			const tree: Root = {
				type: 'root',
				children: [
					{ type: 'yaml', value: 'locale: ru' },
					{
						type: 'paragraph',
						children: [{ type: 'text', value: 'Он сказал "привет".' }],
					},
				],
			};

			const result = transformTree(tree, 'en');
			const paragraph = result.children.find(
				(n: RootContent): n is RootContent => n.type === 'paragraph'
			);
			expect(textValues(paragraph!).join('')).toContain('«привет»');
		});

		it('falls back to the configured locale when frontmatter has no locale/lang/language field', () => {
			const tree: Root = {
				type: 'root',
				children: [
					{ type: 'yaml', value: 'title: Some post' },
					{
						type: 'paragraph',
						children: [{ type: 'text', value: 'Он сказал "привет".' }],
					},
				],
			};

			const result = transformTree(tree, 'ru');
			const paragraph = result.children.find(
				(n: RootContent): n is RootContent => n.type === 'paragraph'
			);
			expect(textValues(paragraph!).join('')).toContain('«привет»');
		});

		it('does not modify the yaml node itself', () => {
			const tree: Root = {
				type: 'root',
				children: [
					{ type: 'yaml', value: 'locale: ru\ntitle: "quoted title"' },
					{
						type: 'paragraph',
						children: [{ type: 'text', value: 'Текст.' }],
					},
				],
			};

			const result = transformTree(tree, 'ru');
			const yamlNode = result.children.find((n: RootContent): n is Yaml => n.type === 'yaml');
			expect(yamlNode!.value).toBe('locale: ru\ntitle: "quoted title"');
		});
	});

	// -------------------------------------------------------------------------
	// MDX JSX nodes — lang/language/locale attribute resolution and recursion
	// -------------------------------------------------------------------------

	describe('MDX JSX nodes', () => {
		it('applies rules to text inside a flow JSX element using the file locale', () => {
			const tree: Root = {
				type: 'root',
				children: [
					{
						type: 'mdxJsxFlowElement',
						name: 'Note',
						attributes: [],
						children: [
							{
								type: 'paragraph',
								children: [{ type: 'text', value: 'Он сказал "привет".' }],
							},
						],
					} as unknown as Root['children'][number],
				],
			};

			const result = transformTree(tree, 'ru');
			expect(textValues(result).join('')).toContain('«привет»');
		});

		it('switches locale for a JSX subtree based on the lang attribute', () => {
			const tree: Root = {
				type: 'root',
				children: [
					{
						type: 'mdxJsxFlowElement',
						name: 'Note',
						attributes: [{ type: 'mdxJsxAttribute', name: 'lang', value: 'en' }],
						children: [
							{
								type: 'paragraph',
								children: [{ type: 'text', value: 'She said "hello".' }],
							},
						],
					} as unknown as Root['children'][number],
				],
			};

			// File locale is 'ru', but the JSX node declares lang="en" — its subtree
			// must be processed with English rules (curly quotes, not «»).
			const result = transformTree(tree, 'ru');
			const text = textValues(result).join('');
			expect(text).not.toContain('"hello"');
			expect(text).not.toContain('«');
		});

		it('restores the outer locale after leaving a JSX subtree with its own lang', () => {
			const tree: Root = {
				type: 'root',
				children: [
					{
						type: 'mdxJsxFlowElement',
						name: 'Note',
						attributes: [{ type: 'mdxJsxAttribute', name: 'lang', value: 'en' }],
						children: [
							{
								type: 'paragraph',
								children: [{ type: 'text', value: 'She said "hello".' }],
							},
						],
					} as unknown as Root['children'][number],
					{
						type: 'paragraph',
						children: [{ type: 'text', value: 'Он сказал "привет".' }],
					},
				],
			};

			const result = transformTree(tree, 'ru');
			const lastParagraph = result.children[result.children.length - 1];
			expect(textValues(lastParagraph!).join('')).toContain('«привет»');
		});

		it('reads the language attribute as an alias for lang', () => {
			const tree: Root = {
				type: 'root',
				children: [
					{
						type: 'mdxJsxFlowElement',
						name: 'Note',
						attributes: [{ type: 'mdxJsxAttribute', name: 'language', value: 'en' }],
						children: [
							{
								type: 'paragraph',
								children: [{ type: 'text', value: 'She said "hello".' }],
							},
						],
					} as unknown as Root['children'][number],
				],
			};

			const result = transformTree(tree, 'ru');
			expect(textValues(result).join('')).not.toContain('«');
		});

		it('applies rules inside inline (text) JSX elements', () => {
			const tree: Root = {
				type: 'root',
				children: [
					{
						type: 'paragraph',
						children: [
							{ type: 'text', value: 'Текст до. ' },
							{
								type: 'mdxJsxTextElement',
								name: 'b',
								attributes: [],
								children: [{ type: 'text', value: 'Слово "в кавычках"' }],
							},
							{ type: 'text', value: ' и после.' },
						],
					} as unknown as Root['children'][number],
				],
			};

			const result = transformTree(tree, 'ru');
			expect(textValues(result).join('')).toContain('«в\u00A0кавычках»');
		});

		it('recurses into nested non-text children of a JSX element', () => {
			const tree: Root = {
				type: 'root',
				children: [
					{
						type: 'mdxJsxFlowElement',
						name: 'Card',
						attributes: [],
						children: [
							{
								type: 'blockquote',
								children: [
									{
										type: 'paragraph',
										children: [{ type: 'text', value: 'Цитата "внутри".' }],
									},
								],
							},
						],
					} as unknown as Root['children'][number],
				],
			};

			const result = transformTree(tree, 'ru');
			expect(textValues(result).join('')).toContain('«внутри»');
		});
	});

	// -------------------------------------------------------------------------
	// data.skipTypography escape hatch
	// -------------------------------------------------------------------------

	describe('skipTypography', () => {
		it('skips a node entirely when data.skipTypography is set', () => {
			const tree: Root = {
				type: 'root',
				children: [
					{
						type: 'paragraph',
						data: { skipTypography: true },
						children: [{ type: 'text', value: 'Он сказал "привет".' }],
					},
				],
			};

			const result = transformTree(tree, 'ru');
			expect(textValues(result).join('')).toContain('"привет"');
			expect(textValues(result).join('')).not.toContain('«');
		});
	});
});
