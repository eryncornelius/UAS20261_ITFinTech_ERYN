import { randomBytes } from 'node:crypto';
import { isSameOrigin } from '@/lib/auth';
import { AuditLog, Product } from '@/lib/models';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';
import { authorizeRoles } from '@/lib/role-access';

const categories = ['Mie goreng', 'Mie kuah', 'Paket'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidImageUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const authorization = await authorizeRoles(['merchant']);
    if (authorization.response) return authorization.response;

    await connectToDatabase();
    const products = await Product.find().sort({ isActive: -1, category: 1, name: 1 }).lean();
    return Response.json({
      products: products.map((product) => ({
        id: product._id.toString(),
        name: product.name,
        description: product.description,
        category: product.category,
        price: product.price,
        image: product.image,
        badge: product.badge ?? '',
        isActive: product.isActive,
      })),
    });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Menu gagal dimuat.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return Response.json({ error: 'Data produk tidak valid.' }, { status: 400 });
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const category = typeof body.category === 'string' ? body.category : '';
  const price = body.price;
  const image = typeof body.image === 'string' ? body.image.trim() : '';
  const badge = typeof body.badge === 'string' ? body.badge.trim() : '';

  if (
    name.length < 2 ||
    name.length > 120 ||
    description.length > 300 ||
    !categories.includes(category) ||
    typeof price !== 'number' ||
    !Number.isSafeInteger(price) ||
    price < 1 ||
    !isValidImageUrl(image) ||
    badge.length > 40
  ) {
    return Response.json({ error: 'Nama, kategori, harga, atau foto produk tidak valid.' }, { status: 400 });
  }

  try {
    const authorization = await authorizeRoles(['merchant']);
    if (authorization.response) return authorization.response;
    await connectToDatabase();

    const slugBase = name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
    const product = await Product.create({
      slug: `${slugBase || 'produk'}-${randomBytes(4).toString('hex')}`,
      name,
      description,
      category,
      price,
      image,
      ...(badge ? { badge } : {}),
      isActive: true,
    });
    await AuditLog.create({
      actorId: authorization.user.id,
      action: 'product.created',
      entityType: 'product',
      entityId: product._id,
    });

    return Response.json({ id: product._id.toString() }, { status: 201 });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Produk tidak dapat disimpan.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}
