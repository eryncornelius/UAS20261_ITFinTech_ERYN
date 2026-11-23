import mongoose from 'mongoose';
import { isSameOrigin } from '@/lib/auth';
import { AuditLog, Product } from '@/lib/models';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';
import { authorizeRoles } from '@/lib/role-access';

const categories = ['Mie goreng', 'Mie kuah', 'Paket'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validImage(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!isRecord(body)) return Response.json({ error: 'Data produk tidak valid.' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.trim().length > 120) {
      return Response.json({ error: 'Nama produk tidak valid.' }, { status: 400 });
    }
    update.name = body.name.trim();
  }
  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.trim().length > 300) {
      return Response.json({ error: 'Deskripsi produk tidak valid.' }, { status: 400 });
    }
    update.description = body.description.trim();
  }
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || !categories.includes(body.category)) {
      return Response.json({ error: 'Kategori produk tidak valid.' }, { status: 400 });
    }
    update.category = body.category;
  }
  if (body.price !== undefined) {
    if (typeof body.price !== 'number' || !Number.isSafeInteger(body.price) || body.price < 1) {
      return Response.json({ error: 'Harga harus berupa rupiah integer yang positif.' }, { status: 400 });
    }
    update.price = body.price;
  }
  if (body.image !== undefined) {
    if (typeof body.image !== 'string' || !validImage(body.image.trim())) {
      return Response.json({ error: 'Foto produk harus berupa URL HTTPS.' }, { status: 400 });
    }
    update.image = body.image.trim();
  }
  if (body.badge !== undefined) {
    if (typeof body.badge !== 'string' || body.badge.trim().length > 40) {
      return Response.json({ error: 'Badge produk tidak valid.' }, { status: 400 });
    }
    update.badge = body.badge.trim();
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') {
      return Response.json({ error: 'Status produk tidak valid.' }, { status: 400 });
    }
    update.isActive = body.isActive;
  }
  if (Object.keys(update).length === 0) {
    return Response.json({ error: 'Tidak ada perubahan produk.' }, { status: 400 });
  }

  try {
    const authorization = await authorizeRoles(['merchant']);
    if (authorization.response) return authorization.response;
    const { productId } = await params;
    if (!mongoose.isValidObjectId(productId)) {
      return Response.json({ error: 'ID produk tidak valid.' }, { status: 400 });
    }
    await connectToDatabase();
    const product = await Product.findByIdAndUpdate(productId, { $set: update }, { new: true });
    if (!product) return Response.json({ error: 'Produk tidak ditemukan.' }, { status: 404 });
    await AuditLog.create({
      actorId: authorization.user.id,
      action: 'product.updated',
      entityType: 'product',
      entityId: product._id,
      details: { fields: Object.keys(update) },
    });
    return Response.json({ ok: true });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Produk gagal diperbarui.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Permintaan tidak valid.' }, { status: 403 });
  }
  try {
    const authorization = await authorizeRoles(['merchant']);
    if (authorization.response) return authorization.response;
    const { productId } = await params;
    if (!mongoose.isValidObjectId(productId)) {
      return Response.json({ error: 'ID produk tidak valid.' }, { status: 400 });
    }
    await connectToDatabase();
    const product = await Product.findByIdAndUpdate(productId, { $set: { isActive: false } }, { new: true });
    if (!product) return Response.json({ error: 'Produk tidak ditemukan.' }, { status: 404 });
    await AuditLog.create({
      actorId: authorization.user.id,
      action: 'product.deactivated',
      entityType: 'product',
      entityId: product._id,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Produk gagal dinonaktifkan.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}
