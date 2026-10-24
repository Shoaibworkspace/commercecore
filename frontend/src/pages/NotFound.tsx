import { Link } from 'react-router';
export default function NotFound() {
  return (
    <div className="container empty-state not-found">
      <p className="eyebrow">404 / SOMETHING WENT ASTRAY</p>
      <h1>This corner is still empty.</h1>
      <p>We couldn’t find that page, collection, or sample product.</p>
      <Link className="primary" to="/shop">
        Explore the collection
      </Link>
      <Link className="text-link" to="/">
        Return home
      </Link>
    </div>
  );
}
