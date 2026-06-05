import { describe, it, expect } from 'vitest';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import type { Root, Heading, Blockquote, List } from 'mdast';
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
});
