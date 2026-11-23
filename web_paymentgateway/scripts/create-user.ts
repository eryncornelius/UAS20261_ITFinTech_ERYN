import { loadEnvConfig } from '@next/env';
import mongoose from 'mongoose';
import { hashPassword } from '@/lib/auth-crypto';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';
import { User } from '@/lib/models';

async function createPrivilegedUser() {
  loadEnvConfig(process.cwd());

  const name = process.env.AUTH_USER_NAME?.trim() ?? '';
  const email = process.env.AUTH_USER_EMAIL?.trim().toLowerCase() ?? '';
  const password = process.env.AUTH_USER_PASSWORD ?? '';
  const role = process.env.AUTH_USER_ROLE;
  if (
    name.length < 2 ||
    name.length > 120 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    password.length < 12 ||
    password.length > 128 ||
    (role !== 'merchant' && role !== 'admin')
  ) {
    console.error(
      'Akun tidak dibuat. Set AUTH_USER_NAME, AUTH_USER_EMAIL, AUTH_USER_PASSWORD (12–128 karakter), dan AUTH_USER_ROLE (merchant atau admin) di environment shell.',
    );
    process.exitCode = 1;
    return;
  }

  try {
    await connectToDatabase();
    const passwordHash = await hashPassword(password);
    await User.create({ name, email, passwordHash, role });
    console.log(`Akun ${role} berhasil dibuat untuk ${email}.`);
  } catch (error) {
    const duplicate =
      typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
    if (duplicate) {
      console.error('Email tersebut sudah terdaftar. Script ini tidak mengubah peran akun yang sudah ada.');
    } else {
      console.error(
        isMongoUnavailable(error)
          ? getMongoErrorMessage(error)
          : 'Akun tidak dapat dibuat. Periksa input dan koneksi database.',
      );
    }
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

void createPrivilegedUser();
