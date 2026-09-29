import { connectToDatabase } from '@/lib/mongodb';
import { initialProducts } from '@/lib/catalog';
import { Product } from '@/lib/models';

export async function GET() {
  try {
    await connectToDatabase();
    await Product.bulkWrite(
      initialProducts.map((product) => ({
        updateOne: {
          filter: { slug: product.slug },
          update: { $setOnInsert: product },
          upsert: true,
        },
      })),
    );

    const products = await Product.find({ isActive: true }).sort({ category: 1, name: 1 }).lean();
    return Response.json({
      products: products.map((product) => ({
        id: product._id.toString(),
        name: product.name,
        description: product.description,
        category: product.category,
        price: product.price,
        image: product.image,
        badge: product.badge,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tidak dapat memuat produk.';
    const status = message.includes('MONGODB_URI') ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}