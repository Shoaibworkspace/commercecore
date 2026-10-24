import {
  adminProductSchema,
  adminProductSummarySchema,
  adminCategorySchema,
  analyticsSchema,
  movementSchema,
  auditRowSchema,
  adminCatalogFiltersSchema,
} from '../../../shared/admin.ts';
import { z } from 'zod';
import { auditStatement, writeGuard, type AuditContext } from './audit.ts';
import { ServiceError } from '../services/errors.ts';

export async function categories(db: D1Database) {
  const { results } = await db
    .prepare(
      'SELECT id,slug,name,description,image_path AS image,version FROM categories ORDER BY name,id LIMIT 100',
    )
    .all();
  return z.array(adminCategorySchema).parse(results);
}
export async function products(
  db: D1Database,
  page: number,
  filters = adminCatalogFiltersSchema.parse({}),
) {
  const row = await db
    .prepare(
      `WITH all_rows AS (SELECT p.id,p.name,p.slug,c.name AS category,p.archived,p.version,
    coalesce((SELECT image_path FROM product_variants WHERE product_id=p.id ORDER BY position,id LIMIT 1),'/images/product-placeholder.svg') AS image,
    (SELECT coalesce(sum(stock),0) FROM product_variants WHERE product_id=p.id) AS stock,
    (SELECT count(*) FROM product_variants WHERE product_id=p.id) AS variantCount
    FROM products p JOIN categories c ON c.id=p.category_id WHERE
      (?1='' OR instr(lower(p.name),lower(?1))>0 OR instr(lower(p.slug),lower(?1))>0 OR
        EXISTS(SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND instr(lower(v.sku),lower(?1))>0))
      AND (?2='all' OR p.archived=CASE WHEN ?2='archived' THEN 1 ELSE 0 END)
      AND (?3='' OR p.category_id=?3)
      AND (?4='all' OR EXISTS(SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND v.active=1 AND v.stock<=v.low_stock_threshold))),
    page_rows AS(SELECT * FROM all_rows ORDER BY name,id LIMIT 20 OFFSET ?5)
    SELECT (SELECT count(*) FROM all_rows) AS total,(SELECT json_group_array(json_object('id',id,'name',name,'slug',slug,'category',category,
      'archived',json(CASE WHEN archived=1 THEN 'true' ELSE 'false' END),'version',version,'image',image,'stock',stock,'variantCount',variantCount)) FROM page_rows) AS items`,
    )
    .bind(filters.q, filters.archived, filters.category, filters.stock, (page - 1) * 20)
    .first<{ total: number; items: string }>();
  return {
    data: z.array(adminProductSummarySchema).parse(JSON.parse(row!.items)),
    meta: meta(page, row!.total),
  };
}
const productColumns = `p.id,p.category_id AS categoryId,p.slug,p.name,p.description,p.subtitle,p.material,p.dimensions,p.care,p.featured,p.is_new AS isNew,p.archived,p.version`;
export async function product(db: D1Database, id: string) {
  const row = await db
    .prepare(
      `SELECT ${productColumns},
    (SELECT json_group_array(json_object('id',id,'sku',sku,'label',label,'color',swatch,'size',size,'priceMinor',price_minor,'compareAtMinor',compare_at_minor,
      'image',image_path,'detailImage',detail_image_path,'active',json(CASE WHEN active=1 THEN 'true' ELSE 'false' END),
      'position',position,'stock',stock,'version',version,'lowStockThreshold',low_stock_threshold))
      FROM(SELECT * FROM product_variants WHERE product_id=p.id ORDER BY position,id)) AS variants,
    (SELECT json_group_array(json_object('image',path,'alt',alt)) FROM(SELECT * FROM product_images WHERE product_id=p.id ORDER BY position)) AS gallery
    FROM products p WHERE p.id=?`,
    )
    .bind(id)
    .first<Record<string, unknown> & { variants: string; gallery: string }>();
  return row
    ? adminProductSchema.parse({
        ...row,
        featured: !!row.featured,
        isNew: !!row.isNew,
        archived: !!row.archived,
        variants: JSON.parse(row.variants),
        gallery: JSON.parse(row.gallery),
      })
    : null;
}
function meta(page: number, total: number) {
  return { page, total, totalPages: Math.max(1, Math.ceil(total / 20)) };
}
export async function adjustStock(
  database: D1Database,
  id: string,
  input: { version: number; delta: number; note: string },
  actor: AuditContext,
) {
  const db = database.withSession('first-primary'),
    movementId = crypto.randomUUID();
  try {
    await db.batch([
      auditStatement(
        db,
        actor,
        'STOCK_ADJUSTED',
        'variant',
        id,
        { delta: input.delta, note: input.note },
        false,
      ),
      writeGuard(db),
      db
        .prepare(
          `INSERT INTO inventory_movements(id,variant_id,actor_id,quantity_delta,reason,note,expected_version)
        VALUES(?,?,?,?,'ADJUSTMENT',?,?) RETURNING id`,
        )
        .bind(movementId, id, actor.actorId, input.delta, input.note, input.version),
      writeGuard(db),
    ]);
  } catch (error) {
    if (/inventory:|malformed JSON/.test(String(error)))
      throw new ServiceError(
        409,
        'STALE_INVENTORY',
        'Inventory changed or the adjustment exceeds stock limits. Reload before saving.',
      );
    throw error;
  }
  return db.prepare('SELECT stock,version FROM product_variants WHERE id=?').bind(id).first();
}
export async function movements(db: D1Database, page: number) {
  const row = await db
    .prepare(
      `WITH page_rows AS(SELECT m.id,v.sku,p.name AS product,v.label AS variant,m.quantity_delta AS delta,
    m.reason,m.note,o.order_number AS orderNumber,m.created_at AS createdAt,u.name AS actor
    FROM inventory_movements m JOIN product_variants v ON v.id=m.variant_id JOIN products p ON p.id=v.product_id
    LEFT JOIN orders o ON o.id=m.order_id LEFT JOIN users u ON u.id=m.actor_id ORDER BY m.created_at DESC,m.id DESC LIMIT 20 OFFSET ?)
    SELECT (SELECT count(*) FROM inventory_movements) AS total,(SELECT json_group_array(json_object('id',id,'sku',sku,'product',product,
      'variant',variant,'delta',delta,'reason',reason,'note',note,'orderNumber',orderNumber,'createdAt',createdAt,'actor',actor)) FROM page_rows) AS items`,
    )
    .bind((page - 1) * 20)
    .first<{ total: number; items: string }>();
  return {
    data: z.array(movementSchema).parse(JSON.parse(row!.items)),
    meta: meta(page, row!.total),
  };
}
export async function audit(db: D1Database, page: number) {
  const row = await db
    .prepare(
      `WITH page_rows AS(SELECT a.id,u.name AS actor,a.action,a.entity_type AS entity,a.entity_id AS entityId,
    a.request_id AS requestId,a.created_at AS createdAt FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
    ORDER BY a.created_at DESC,a.id DESC LIMIT 20 OFFSET ?)
    SELECT (SELECT count(*) FROM audit_logs) AS total,(SELECT json_group_array(json_object('id',id,'actor',actor,'action',action,
    'entity',entity,'entityId',entityId,'requestId',requestId,'createdAt',createdAt)) FROM page_rows) AS items`,
    )
    .bind((page - 1) * 20)
    .first<{ total: number; items: string }>();
  return {
    data: z.array(auditRowSchema).parse(JSON.parse(row!.items)),
    meta: meta(page, row!.total),
  };
}
export async function analytics(db: D1Database, days: number) {
  const row = await db
    .prepare(
      `WITH RECURSIVE dates(day,n) AS(SELECT date('now','start of day',?1),1 UNION ALL
    SELECT date(day,'+1 day'),n+1 FROM dates WHERE n<?2),paid AS(SELECT * FROM orders WHERE payment_status='SIMULATED_SUCCESS'),
    daily_totals AS(SELECT date(created_at,'unixepoch') AS day,count(*) AS orders,sum(total_minor) AS totalMinor FROM paid
      WHERE status<>'CANCELLED' AND created_at>=unixepoch(date('now',?1)) AND created_at<unixepoch(date('now','+1 day')) GROUP BY day),
    daily AS(SELECT d.day,coalesce(o.orders,0) AS orders,coalesce(o.totalMinor,0) AS totalMinor FROM dates d
      LEFT JOIN daily_totals o ON o.day=d.day ORDER BY d.day),
    top AS(SELECT i.product_name AS name,sum(i.quantity) AS units,sum(i.line_total_minor) AS totalMinor FROM order_items i
      JOIN paid o ON o.id=i.order_id WHERE o.status<>'CANCELLED' GROUP BY i.product_name ORDER BY units DESC,name LIMIT 5),
    low AS(SELECT v.id,v.sku,p.name AS product,v.stock FROM product_variants v JOIN products p ON p.id=v.product_id
      WHERE v.active=1 AND p.archived=0 AND v.stock<=v.low_stock_threshold ORDER BY v.stock,v.sku LIMIT 10)
    SELECT (SELECT count(*) FROM products WHERE archived=0) AS activeProducts,(SELECT count(*) FROM users WHERE role='customer') AS customers,
    (SELECT count(*) FROM orders) AS orders,(SELECT count(*) FROM orders WHERE status IN('CREATED','CONFIRMED','PROCESSING')) AS openOrders,
    (SELECT count(*) FROM orders WHERE status='CANCELLED') AS cancelledOrders,
    (SELECT coalesce(sum(i.quantity),0) FROM order_items i JOIN paid o ON o.id=i.order_id WHERE o.status<>'CANCELLED') AS productsSold,
    (SELECT json_group_array(json_object('status',status,'count',n)) FROM(SELECT status,count(*) AS n FROM orders GROUP BY status)) AS ordersByStatus,
    (SELECT json_group_array(json_object('id',id,'orderNumber',order_number,'status',status,'totalMinor',total_minor,'createdAt',created_at))
      FROM(SELECT id,order_number,status,total_minor,created_at FROM orders ORDER BY created_at DESC,id DESC LIMIT 5)) AS recentOrders,
    (SELECT coalesce(sum(total_minor),0) FROM paid) AS grossMinor,
    (SELECT coalesce(sum(total_minor),0) FROM paid WHERE status='CANCELLED') AS cancelledMinor,
    (SELECT coalesce(sum(total_minor),0) FROM paid WHERE status<>'CANCELLED') AS netMinor,
    (SELECT json_group_array(json_object('day',day,'orders',orders,'totalMinor',totalMinor)) FROM daily) AS daily,
    (SELECT json_group_array(json_object('name',name,'units',units,'totalMinor',totalMinor)) FROM top) AS topProducts,
    (SELECT json_group_array(json_object('id',id,'sku',sku,'product',product,'stock',stock)) FROM low) AS lowStock`,
    )
    .bind(`-${days - 1} days`, days)
    .first<
      Record<string, unknown> & {
        daily: string;
        topProducts: string;
        lowStock: string;
        ordersByStatus: string;
        recentOrders: string;
      }
    >();
  return analyticsSchema.parse({
    ...row,
    daily: JSON.parse(row!.daily),
    topProducts: JSON.parse(row!.topProducts),
    lowStock: JSON.parse(row!.lowStock),
    ordersByStatus: JSON.parse(row!.ordersByStatus),
    recentOrders: JSON.parse(row!.recentOrders),
  });
}
