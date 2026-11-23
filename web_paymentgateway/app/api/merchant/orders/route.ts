import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';
import { Checkout, Payment } from '@/lib/models';
import { authorizeRoles } from '@/lib/role-access';

export async function GET() {
  try {
    const authorization = await authorizeRoles(['merchant']);
    if (authorization.response) return authorization.response;
    await connectToDatabase();

    const orders = await Checkout.find().sort({ createdAt: -1 }).limit(100).lean();
    const payments = await Payment.find({ checkoutId: { $in: orders.map((order) => order._id) } })
      .select('checkoutId method status amount')
      .lean();
    const paymentByCheckout = new Map(payments.map((payment) => [payment.checkoutId.toString(), payment]));

    return Response.json({
      orders: orders.map((order) => {
        const payment = paymentByCheckout.get(order._id.toString());
        return {
          id: order._id.toString(),
          customerName: order.customerName,
          address: order.address,
          items: order.items.map((item: { name: string; quantity: number }) => ({
            name: item.name,
            quantity: item.quantity,
          })),
          subtotal: order.subtotal,
          discountAmount: order.discountAmount ?? 0,
          total: order.total,
          status: order.status,
          fulfillmentStatus: order.fulfillmentStatus ?? 'new',
          reviewStatus: order.reviewStatus ?? 'clear',
          riskScore: order.riskScore ?? 0,
          paymentMethod: payment?.method ?? '—',
          paymentStatus: payment?.status ?? 'pending',
          createdAt: order.createdAt,
        };
      }),
    });
  } catch (error) {
    const unavailable = isMongoUnavailable(error);
    return Response.json(
      { error: unavailable ? getMongoErrorMessage(error) : 'Daftar pesanan gagal dimuat.' },
      { status: unavailable ? 503 : 500 },
    );
  }
}
