import Storefront from '@/components/Storefront';
import { getCurrentUser } from '@/lib/auth';
import { connectToDatabase, getMongoErrorMessage } from '@/lib/mongodb';
import { Product, type AuthUser } from '@/lib/models';

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
  let currentUser: AuthUser | null = null;

  try {
    await connectToDatabase();
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
    currentUser = await getCurrentUser();
  } catch (error) {
    catalogError = getMongoErrorMessage(error);
  }

  return <Storefront initialProducts={products} catalogError={catalogError} currentUser={currentUser} />;
}
