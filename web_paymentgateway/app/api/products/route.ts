import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';
import { Product } from '@/lib/models';

export async function GET() {
  try {
    await connectToDatabase();
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
    return Response.json(
      { error: getMongoErrorMessage(error) },
      { status: isMongoUnavailable(error) ? 503 : 500 },
    );
  }
}