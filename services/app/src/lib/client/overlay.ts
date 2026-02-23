const BODY_SCROLL_LOCK_COUNT_ATTRIBUTE = 'data-stacked-scroll-lock-count';

export function portalToBody(node: HTMLElement): { destroy: () => void } {
  if (typeof document === 'undefined') {
    return {
      destroy: () => {},
    };
  }

  document.body.appendChild(node);

  return {
    destroy: () => {
      node.remove();
    },
  };
}

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const body = document.body;
  const currentCount = Number(
    body.getAttribute(BODY_SCROLL_LOCK_COUNT_ATTRIBUTE) ?? '0',
  );
  const previousOverflow = body.style.overflow;
  const previousPaddingRight = body.style.paddingRight;

  if (currentCount === 0) {
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }
  }

  body.setAttribute(BODY_SCROLL_LOCK_COUNT_ATTRIBUTE, String(currentCount + 1));

  return () => {
    const nextCount =
      Number(body.getAttribute(BODY_SCROLL_LOCK_COUNT_ATTRIBUTE) ?? '1') - 1;
    if (nextCount <= 0) {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
      body.removeAttribute(BODY_SCROLL_LOCK_COUNT_ATTRIBUTE);
      return;
    }

    body.setAttribute(BODY_SCROLL_LOCK_COUNT_ATTRIBUTE, String(nextCount));
  };
}
