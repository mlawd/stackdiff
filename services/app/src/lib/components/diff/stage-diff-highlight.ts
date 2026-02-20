interface HighlightResult {
	html: string;
	usedSyntaxHighlighting: boolean;
}

interface HighlightJsLike {
	highlight: (code: string, options: { language: string; ignoreIllegals?: boolean }) => { value: string };
	getLanguage: (languageName: string) => boolean;
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
		return 'xml';
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

function readWindowHighlightJs(): HighlightJsLike | null {
	if (typeof window === 'undefined') {
		return null;
	}

	const candidate = (window as Window & { hljs?: HighlightJsLike }).hljs;
	if (!candidate) {
		return null;
	}

	if (typeof candidate.highlight !== 'function' || typeof candidate.getLanguage !== 'function') {
		return null;
	}

	return candidate;
}

export function toHighlightedDiffLine(input: { content: string; filePath?: string }): HighlightResult {
	const content = input.content;
	if (content.length === 0) {
		return { html: '', usedSyntaxHighlighting: false };
	}

	const language = resolveLanguageFromPath(input.filePath);
	const hljs = readWindowHighlightJs();

	if (!hljs || !language || !hljs.getLanguage(language)) {
		return {
			html: escapeHtml(content),
			usedSyntaxHighlighting: false
		};
	}

	try {
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
