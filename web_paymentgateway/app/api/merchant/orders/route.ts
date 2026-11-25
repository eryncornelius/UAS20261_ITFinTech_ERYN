import { connectToDatabase, getMongoErrorMessage, isMongoUnavailable } from '@/lib/mongodb';
import { Checkout, Payment } from '@/lib/models';
import { finalizeMerchantFinancialSummary } from '@/lib/merchant-financials';
import { authorizeRoles } from '@/lib/role-access';

export async function GET() {
  try {
    const authorization = await authorizeRoles(['merchant']);
    if (authorization.response) return authorization.response;
    await connectToDatabase();

    const orders = await Checkout.find().sort({ createdAt: -1 }).limit(100).lean();
    const payments = await Payment.find({ checkoutId: { $in: orders.map((order) => order._id) } })
      .select('checkoutId method status amount serviceFee merchantNet feeIsEstimate')
      .lean();
    const paymentByCheckout = new Map(payments.map((payment) => [payment.checkoutId.toString(), payment]));
    const [financialTotals] = await Payment.aggregate([
      { $match: { status: { $in: ['paid', 'refunded'] } } },
      {
        $lookup: {
          from: Checkout.collection.name,
          localField: 'checkoutId',
          foreignField: '_id',
          as: 'checkout',
        },
      },
      { $unwind: '$checkout' },
      {
        $group: {
          _id: null,
          grossRevenue: { $sum: { $ifNull: ['$checkout.subtotal', 0] } },
          voucherDiscount: { $sum: { $ifNull: ['$checkout.discountAmount', 0] } },
          serviceFee: { $sum: { $ifNull: ['$serviceFee', 0] } },
          refundAmount: {
            $sum: {
              $cond: [{ $eq: ['$status', 'refunded'] }, '$amount', 0],
            },
          },
          capturedAmount: { $sum: '$amount' },
        },
      },
    ]);
    const financialSummary = finalizeMerchantFinancialSummary(
      financialTotals ?? {
        grossRevenue: 0,
        voucherDiscount: 0,
        serviceFee: 0,
        refundAmount: 0,
        capturedAmount: 0,
      },
    );

    return Response.json({
      financialSummary,
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
          serviceFee: payment?.serviceFee ?? 0,
          merchantNet:
            payment?.merchantNet ??
            (payment?.status === 'paid'
              ? payment.amount - (payment.serviceFee ?? 0)
              : payment?.status === 'refunded'
                ? -(payment.serviceFee ?? 0)
                : 0),
          feeIsEstimate: payment?.feeIsEstimate ?? true,
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
