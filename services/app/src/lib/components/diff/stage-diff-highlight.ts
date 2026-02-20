import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import xml from 'highlight.js/lib/languages/xml';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import markdown from 'highlight.js/lib/languages/markdown';
import bash from 'highlight.js/lib/languages/bash';

interface HighlightResult {
	html: string;
	usedSyntaxHighlighting: boolean;
}

let languagesRegistered = false;

function ensureLanguagesRegistered(): void {
	if (languagesRegistered) {
		return;
	}

	hljs.registerLanguage('typescript', typescript);
	hljs.registerLanguage('javascript', javascript);
	hljs.registerLanguage('xml', xml);
	hljs.registerLanguage('json', json);
	hljs.registerLanguage('css', css);
	hljs.registerLanguage('markdown', markdown);
	hljs.registerLanguage('bash', bash);
	languagesRegistered = true;
}

function escapeHtml(input: string): string {
	return input
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function resolveLanguageFromPath(filePath: string | undefined): string | null {
	if (!filePath) {
		return null;
	}

	const normalized = filePath.toLowerCase();
	if (normalized.endsWith('.ts') || normalized.endsWith('.tsx')) {
		return 'typescript';
	}

	if (normalized.endsWith('.js') || normalized.endsWith('.mjs') || normalized.endsWith('.cjs')) {
		return 'javascript';
	}

	if (normalized.endsWith('.svelte')) {
		return 'svelte';
	}

	if (normalized.endsWith('.json')) {
		return 'json';
	}

	if (normalized.endsWith('.css')) {
		return 'css';
	}

	if (normalized.endsWith('.md')) {
		return 'markdown';
	}

	if (normalized.endsWith('.sh')) {
		return 'bash';
	}

	return null;
}

export function toHighlightedDiffLine(input: { content: string; filePath?: string }): HighlightResult {
	const content = input.content;
	if (content.length === 0) {
		return { html: '', usedSyntaxHighlighting: false };
	}

	ensureLanguagesRegistered();

	const language = resolveLanguageFromPath(input.filePath);
	if (!language) {
		return {
			html: escapeHtml(content),
			usedSyntaxHighlighting: false
		};
	}

	try {
		if (language === 'svelte') {
			const highlighted = hljs.highlightAuto(content, ['xml', 'typescript', 'javascript', 'css']);
			if (!highlighted.language) {
				return {
					html: escapeHtml(content),
					usedSyntaxHighlighting: false
				};
			}

			return {
				html: highlighted.value,
				usedSyntaxHighlighting: true
			};
		}

		if (!hljs.getLanguage(language)) {
			return {
				html: escapeHtml(content),
				usedSyntaxHighlighting: false
			};
		}

		const highlighted = hljs.highlight(content, { language, ignoreIllegals: true });
		return {
			html: highlighted.value,
			usedSyntaxHighlighting: true
		};
	} catch {
		return {
			html: escapeHtml(content),
			usedSyntaxHighlighting: false
		};
	}
}
