import Storefront from '@/components/Storefront';
import { initialProducts } from '@/lib/catalog';
import { connectToDatabase } from '@/lib/mongodb';
import { Product } from '@/lib/models';

export const dynamic = 'force-dynamic';

type StoreProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  image: string;
  badge?: string;
};

export default async function Home() {
  let products: StoreProduct[] = [];
  let catalogError = '';

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

    const databaseProducts = await Product.find({ isActive: true }).sort({ category: 1, name: 1 }).lean();
    products = databaseProducts.map((product) => ({
      id: product._id.toString(),
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      image: product.image,
      badge: product.badge,
    }));
  } catch (error) {
    catalogError = error instanceof Error ? error.message : 'Katalog gagal dimuat.';
  }

  return <Storefront initialProducts={products} catalogError={catalogError} />;
}
