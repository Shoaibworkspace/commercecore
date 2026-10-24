// Only known local destinations may be used after signing in.
export function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return '/account';
  const url = new URL(value, 'https://store.invalid');
  if (url.origin !== 'https://store.invalid') return '/account';
  if (['/cart', '/account', '/wishlist', '/checkout', '/orders', '/admin'].includes(url.pathname))
    return url.pathname;
  if (/^\/orders\/[a-zA-Z0-9_-]{1,100}$/.test(url.pathname)) return url.pathname;
  if (/^\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname)) {
    const variant = url.searchParams.get('variant');
    return (
      url.pathname +
      (variant && /^[a-zA-Z0-9_-]{1,100}$/.test(variant)
        ? `?${new URLSearchParams({ variant })}`
        : '')
    );
  }
  return '/account';
}
