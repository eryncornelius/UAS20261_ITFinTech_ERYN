import mongoose from 'mongoose';

const globalMongo = globalThis as typeof globalThis & {
  mongoConnection?: Promise<typeof mongoose>;
};

export async function connectToDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI belum diatur. Tambahkan URI MongoDB di .env.local.');
  }

  if (!globalMongo.mongoConnection) {
    globalMongo.mongoConnection = mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'cluster0',
      serverSelectionTimeoutMS: 8000,
    });
  }

  return globalMongo.mongoConnection;
}