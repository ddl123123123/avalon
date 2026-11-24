export function isPigEdition() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('egg') === 'pig';
}
