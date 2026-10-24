import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { catalogAssets } from '../../shared/catalog-assets.ts';
import {
  categoryInputSchema,
  createProductSchema,
  productInputSchema,
  variantInputSchema,
  stockInputSchema,
  type AdminCategory,
  type AdminProduct,
  type AdminVariant,
} from '../../shared/admin.ts';
import { useAdminAction } from '../features/admin/query';
import { formatPrice } from '../features/catalog/model';

type Action = ReturnType<typeof useAdminAction>;
export function ActionFeedback({ action }: { action: Action }) {
  const message = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (action.failed && action.message) message.current?.focus();
  }, [action.failed, action.message]);
  return action.message ? (
    <p
      className={`account-feedback ${action.failed ? 'error' : 'success'}`}
      role={action.failed ? 'alert' : 'status'}
      ref={message}
      tabIndex={-1}
    >
      {action.message}
    </p>
  ) : null;
}
function Field({
  name,
  label,
  value = '',
  max = 200,
  required = false,
  type = 'text',
}: {
  name: string;
  label: string;
  value?: string | number;
  max?: number;
  required?: boolean;
  type?: string;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        defaultValue={value}
        maxLength={max}
        required={required}
        type={type}
        {...(type === 'number' ? { step: '1', min: 0 } : {})}
      />
    </label>
  );
}
function PhotoField({
  name,
  label,
  value = '/images/photos/tote-main.webp',
}: {
  name: string;
  label: string;
  value?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value} aria-label={label}>
        {catalogAssets.map((path) => (
          <option key={path} value={path}>
            {path.replace('/images/', '')}
          </option>
        ))}
      </select>
    </label>
  );
}
function productFields(data: FormData) {
  const text = (name: string) => String(data.get(name) ?? '');
  return {
    categoryId: text('categoryId'),
    slug: text('slug'),
    name: text('name'),
    description: text('description'),
    subtitle: text('subtitle'),
    material: text('material'),
    dimensions: text('dimensions'),
    care: text('care'),
    featured: data.has('featured'),
    isNew: data.has('isNew'),
  };
}
function variantFields(data: FormData) {
  const text = (name: string) => String(data.get(name) ?? '');
  return {
    sku: text('sku'),
    label: text('label'),
    color: text('color'),
    size: text('size'),
    priceMinor: Number(text('priceMinor')),
    compareAtMinor: text('compareAtMinor').trim() ? Number(text('compareAtMinor')) : null,
    image: text('image'),
    detailImage: text('detailImage'),
    active: data.has('active'),
    position: Number(text('position')),
  };
}
function VariantFields({ variant }: { variant?: AdminVariant }) {
  return (
    <div className="admin-form-grid">
      <Field name="sku" label="SKU" value={variant?.sku} required max={100} />
      <Field name="label" label="Variant name" value={variant?.label} required max={100} />
      <Field
        name="priceMinor"
        label="Price in paise (₹1 = 100 paise)"
        type="number"
        value={variant?.priceMinor ?? 10000}
        required
      />
      <Field name="color" label="Colour swatch" type="color" value={variant?.color ?? '#819379'} />
      <Field
        name="compareAtMinor"
        label="Original price in paise (optional; higher than selling price)"
        type="number"
        value={variant?.compareAtMinor ?? ''}
      />
      <Field name="size" label="Size" value={variant?.size} max={50} />
      <Field
        name="position"
        label="Display position (0–19)"
        type="number"
        value={variant?.position ?? 0}
      />
      <PhotoField name="image" label="Product photo" value={variant?.image} />
      <PhotoField name="detailImage" label="Detail photo" value={variant?.detailImage} />
      <label className="checkbox-label">
        <input type="checkbox" name="active" defaultChecked={variant?.active ?? true} /> Available
        in storefront
      </label>
    </div>
  );
}
export function ProductForm({
  product,
  categories,
  csrf,
  onCreated,
}: {
  product?: AdminProduct;
  categories: AdminCategory[];
  csrf: string;
  onCreated: () => void;
}) {
  const action = useAdminAction(csrf);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget),
      fields = productFields(data);
    const ok = await action.run(
      product ? `/products/${product.id}` : '/products',
      product ? 'PATCH' : 'POST',
      product
        ? { ...fields, version: product.version }
        : {
            ...fields,
            variants: [variantFields(data)],
            gallery: [{ image: String(data.get('image')), alt: fields.name }],
          },
      product
        ? productInputSchema.extend({ version: stockInputSchema.shape.version })
        : createProductSchema,
    );
    if (ok && !product) onCreated();
  }
  return (
    <form
      className="account-form admin-editor"
      onSubmit={(e) => {
        void submit(e);
      }}
    >
      <h3>{product ? 'Product details' : 'Create a product'}</h3>
      <div className="admin-form-grid">
        <Field name="name" label="Product name" value={product?.name} required max={150} />
        <Field name="slug" label="URL slug" value={product?.slug} required max={150} />
        <label>
          Category
          <select
            name="categoryId"
            defaultValue={product?.categoryId ?? categories[0]?.id}
            required
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Field name="subtitle" label="Short description" value={product?.subtitle} />
        <Field name="material" label="Material" value={product?.material} max={1000} />
        <Field name="dimensions" label="Dimensions" value={product?.dimensions} max={500} />
      </div>
      <label>
        Description
        <textarea
          name="description"
          defaultValue={product?.description}
          maxLength={10000}
          rows={4}
        />
      </label>
      <label>
        Care instructions
        <textarea name="care" defaultValue={product?.care} maxLength={2000} rows={2} />
      </label>
      <div className="admin-inline">
        <label className="checkbox-label">
          <input name="featured" type="checkbox" defaultChecked={product?.featured} /> Featured
        </label>
        <label className="checkbox-label">
          <input name="isNew" type="checkbox" defaultChecked={product?.isNew} /> New arrival
        </label>
      </div>
      {!product && (
        <>
          <h3>First variant</h3>
          <p className="cart-helper">
            Starts with zero stock. Record an inventory adjustment after creation.
          </p>
          <VariantFields />
        </>
      )}
      <ActionFeedback action={action} />
      <button className="primary" disabled={action.busy}>
        {action.busy ? 'Saving…' : product ? 'Save product' : 'Create product'}
      </button>
    </form>
  );
}
export function VariantForm({
  variant,
  productId,
  csrf,
}: {
  variant?: AdminVariant;
  productId: string;
  csrf: string;
}) {
  const action = useAdminAction(csrf);
  return (
    <form
      className="account-form admin-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const body = variantFields(new FormData(e.currentTarget));
        void action.run(
          variant ? `/variants/${variant.id}` : `/products/${productId}/variants`,
          variant ? 'PATCH' : 'POST',
          variant ? { ...body, version: variant.version } : body,
          variant
            ? variantInputSchema.safeExtend({ version: stockInputSchema.shape.version })
            : variantInputSchema,
        );
      }}
    >
      <h3>{variant ? `Edit ${variant.label}` : 'Add a variant'}</h3>
      <VariantFields variant={variant} />
      <ActionFeedback action={action} />
      <button className="primary" disabled={action.busy}>
        {action.busy ? 'Saving…' : variant ? 'Save variant' : 'Add variant'}
      </button>
    </form>
  );
}
export function GalleryForm({ product, csrf }: { product: AdminProduct; csrf: string }) {
  const action = useAdminAction(csrf),
    [position, setPosition] = useState(0);
  return (
    <form
      className="account-form admin-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        void action.run(`/products/${product.id}/images/${position}`, 'PUT', {
          version: product.version,
          image: String(data.get('image')),
          alt: String(data.get('alt')),
        });
      }}
    >
      <h3>Product gallery</h3>
      <div className="admin-gallery">
        {product.gallery.map((photo, i) => (
          <img
            key={`${photo.image}-${i}`}
            src={photo.image}
            alt={photo.alt}
            width="90"
            height="90"
          />
        ))}
      </div>
      <label>
        Photo position
        <select value={position} onChange={(e) => setPosition(Number(e.target.value))}>
          {Array.from({ length: Math.min(12, product.gallery.length + 1) }, (_, i) => (
            <option key={i} value={i}>
              {i + 1}
              {i === product.gallery.length ? ' · Add photo' : ''}
            </option>
          ))}
        </select>
      </label>
      <div key={`${product.version}-${position}`} className="admin-form-grid">
        <PhotoField name="image" label="Gallery photo" value={product.gallery[position]?.image} />
        <Field
          name="alt"
          label="Photo description"
          value={product.gallery[position]?.alt ?? product.name}
          required
        />
      </div>
      <ActionFeedback action={action} />
      <button className="secondary" disabled={action.busy}>
        Save gallery photo
      </button>
    </form>
  );
}
export function StockForm({ variant, csrf }: { variant: AdminVariant; csrf: string }) {
  const action = useAdminAction(csrf);
  return (
    <form
      className="admin-stock-card account-form"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        void action.run(
          `/inventory/${variant.id}/adjust`,
          'POST',
          {
            version: variant.version,
            delta: Number(data.get('delta')),
            note: String(data.get('note')),
          },
          stockInputSchema,
        );
      }}
    >
      <div className="admin-row-heading">
        <div>
          <strong>{variant.label}</strong>
          <p>
            {variant.sku} · {formatPrice(variant.priceMinor)}
          </p>
        </div>
        <span
          className={variant.stock <= variant.lowStockThreshold ? 'admin-stock low' : 'admin-stock'}
        >
          {variant.stock} in stock
        </span>
      </div>
      <p className="cart-helper">
        {variant.active ? 'Active' : 'Inactive'} · Low-stock threshold {variant.lowStockThreshold}
      </p>
      <label>
        Stock change (+ to receive, − to remove)
        <input
          name="delta"
          type="number"
          step="1"
          min="-1000000"
          max="1000000"
          required
          placeholder="e.g. 10 or -2"
        />
      </label>
      <label>
        Reason
        <input
          name="note"
          minLength={3}
          maxLength={500}
          required
          placeholder="e.g. Received new inventory"
        />
      </label>
      <ActionFeedback action={action} />
      <button className="secondary" disabled={action.busy}>
        {action.busy ? 'Recording…' : 'Record stock adjustment'}
      </button>
    </form>
  );
}
export function CategoryForm({
  category,
  csrf,
  onCreated,
}: {
  category?: AdminCategory;
  csrf: string;
  onCreated: () => void;
}) {
  const action = useAdminAction(csrf);
  return (
    <form
      className="account-form admin-editor"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget),
          body = {
            name: String(data.get('name')),
            slug: String(data.get('slug')),
            description: String(data.get('description')),
            image: String(data.get('image')),
          };
        void action
          .run(
            category ? `/categories/${category.id}` : '/categories',
            category ? 'PATCH' : 'POST',
            category ? { ...body, version: category.version } : body,
            category
              ? categoryInputSchema.extend({ version: stockInputSchema.shape.version })
              : categoryInputSchema,
          )
          .then((ok) => {
            if (ok && !category) onCreated();
          });
      }}
    >
      <h3>{category ? 'Edit category' : 'New category'}</h3>
      <div className="admin-form-grid">
        <Field name="name" label="Category name" value={category?.name} required max={100} />
        <Field name="slug" label="Category slug" value={category?.slug} required max={100} />
        <PhotoField name="image" label="Category photo" value={category?.image} />
      </div>
      <label>
        Description
        <textarea
          name="description"
          maxLength={2000}
          defaultValue={category?.description}
          rows={3}
        />
      </label>
      <ActionFeedback action={action} />
      <button className="primary" disabled={action.busy}>
        {action.busy ? 'Saving…' : category ? 'Save category' : 'Create category'}
      </button>
    </form>
  );
}
