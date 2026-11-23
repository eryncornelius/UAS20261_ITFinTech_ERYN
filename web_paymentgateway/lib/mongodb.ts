import mongoose from 'mongoose';

const globalMongo = globalThis as typeof globalThis & {
  mongoConnection?: Promise<typeof mongoose>;
};

export async function connectToDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI belum diatur. Tambahkan URI MongoDB di .env.local.');
  }

  if (!globalMongo.mongoConnection) {
    const connection = mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'cluster0',
      serverSelectionTimeoutMS: 8000,
    });
    globalMongo.mongoConnection = connection.catch((error: unknown) => {
      globalMongo.mongoConnection = undefined;
      throw error;
    });
  }

  return globalMongo.mongoConnection;
}

function getErrorDetails(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  const cause = error.cause instanceof Error ? ` ${error.cause.message}` : '';
  return `${error.name} ${error.message}${cause}`.toLowerCase();
}

export function isMongoUnavailable(error: unknown): boolean {
  if (!process.env.MONGODB_URI) return true;

  return /serverselection|mongonetwork|querysrv|enotfound|econnrefused|timed?\s*out|authentication failed|bad auth/.test(
    getErrorDetails(error),
  );
}

export function getMongoErrorMessage(error: unknown): string {
  if (!process.env.MONGODB_URI) {
    return 'MongoDB belum dikonfigurasi. Atur MONGODB_URI di .env.local, lalu mulai ulang aplikasi.';
  }

  if (isMongoUnavailable(error)) {
    return 'Tidak dapat terhubung ke MongoDB. Periksa MONGODB_URI, status cluster, kredensial, dan IP Access List MongoDB Atlas.';
  }

  return 'Terjadi kesalahan saat mengakses data MongoDB. Periksa database dan coba lagi.';
}