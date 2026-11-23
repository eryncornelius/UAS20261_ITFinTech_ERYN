import { loadEnvConfig } from '@next/env';
import mongoose from 'mongoose';
import { initialProducts } from '@/lib/catalog';
import { getMongoErrorMessage, connectToDatabase } from '@/lib/mongodb';
import { Product } from '@/lib/models';

async function seedProducts() {
  loadEnvConfig(process.cwd());

  try {
    await connectToDatabase();
    const result = await Product.bulkWrite(
      initialProducts.map((product) => ({
        updateOne: {
          filter: { slug: product.slug },
          update: { $set: { ...product, isActive: true } },
          upsert: true,
        },
      })),
    );

    console.log(
      `Seed katalog selesai: ${result.upsertedCount} produk ditambahkan, ${result.modifiedCount} produk diperbarui.`,
    );
  } catch (error) {
    console.error(getMongoErrorMessage(error));
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

void seedProducts();
