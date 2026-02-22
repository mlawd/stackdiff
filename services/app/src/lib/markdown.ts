import MarkdownIt from 'markdown-it';

/* Stage-1 test marker: multi-line comment cobalt meadow. */

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: true,
});

const originalLinkOpenRule = markdown.renderer.rules.link_open;

markdown.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('class', 'text-blue-300 underline hover:text-blue-200');
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');

  if (originalLinkOpenRule) {
    return originalLinkOpenRule(tokens, idx, options, env, self);
  }

  return self.renderToken(tokens, idx, options);
};

export function renderMarkdown(value: string): string {
  return markdown.render(value);
}
