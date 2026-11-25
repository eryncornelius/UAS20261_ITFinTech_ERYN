import { authorizeRoles } from '@/lib/role-access';
import { Checkout, Payment } from '@/lib/models';
import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';

export async function GET() {
  try {
    const authorization = await authorizeRoles(['admin']);
    if (authorization.response) return authorization.response;
    await connectToDatabase();
    const orders = await Checkout.find({
      reviewStatus: 'pending',
      riskScore: { $gte: 40 },
    })
      .sort({ riskScore: -1, createdAt: 1 })
      .limit(100)
      .select('customerName items subtotal discountAmount voucherCode total status riskScore riskReasons createdAt')
      .lean();
    const payments = await Payment.find({ checkoutId: { $in: orders.map((order) => order._id) } })
      .select('checkoutId status')
      .lean();
    const paymentStatusByCheckout = new Map(
      payments.map((payment) => [payment.checkoutId.toString(), payment.status]),
    );

    return Response.json({
      reviews: orders.map((order) => ({
        checkoutId: order._id.toString(),
        customerName: order.customerName,
        items: order.items.map((item: { name: string; quantity: number }) => `${item.name} × ${item.quantity}`),
        subtotal: order.subtotal,
        discountAmount: order.discountAmount ?? 0,
        voucherCode: order.voucherCode ?? '',
        total: order.total,
        checkoutStatus: order.status,
        paymentStatus: paymentStatusByCheckout.get(order._id.toString()) ?? 'pending',
        riskScore: order.riskScore,
        reasons: order.riskReasons ?? [],
        createdAt: order.createdAt,
      })),
    });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Antrean tinjauan risiko gagal dimuat.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}
