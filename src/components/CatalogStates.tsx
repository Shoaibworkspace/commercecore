export function ProductSkeletons({ count = 6 }: { count?: number }) {
  return (
    <div aria-label="Loading products" role="status" className="product-grid skeletons">
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-card" key={index}>
          <div className="skeleton-image" />
          <div className="skeleton-line" />
          <div className="skeleton-line short" />
        </div>
      ))}
    </div>
  );
}
export function CatalogError({ retry, message }: { retry: () => void; message?: string }) {
  return (
    <div className="empty-state" role="alert">
      <span className="eyebrow">A SMALL INTERRUPTION</span>
      <h2>We couldn’t load the collection.</h2>
      <p>{message ?? 'Please check your connection and try again.'}</p>
      <button className="primary" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
