import { notify } from "./notification.service.js";

const rupees = (value) => `₹ ${Number(value || 0).toLocaleString("en-IN")}`;

const SELLER_BASES = { doctor: "/doctor", seller: "/seller" };

const sellerBase = (order) => SELLER_BASES[order.sellerRole] || "/farmer";

const safely = (task) => task.catch((error) => console.error("[order-events] failed:", error.message));

export const orderPlaced = async (orders) => {
    const list = Array.isArray(orders) ? orders : [orders];

    await Promise.all(
        list.flatMap((order) => [
            safely(
                notify(order.seller, {
                    type: "order_new",
                    title: `New order ${order.orderNumber}`,
                    body: `${order.items?.length || 0} item(s) · ${rupees(order.totalAmount)}`,
                    link: `${sellerBase(order)}/orders/${order._id}`
                })
            ),
            safely(
                notify(order.user, {
                    type: "order_update",
                    title: `Order ${order.orderNumber} placed`,
                    body: `${rupees(order.totalAmount)} · we have told the seller.`,
                    link: `/orders/${order._id}`
                })
            )
        ])
    );
};

const STATUS_TEXT = Object.freeze({
    Shipped: "has been shipped",
    Delivered: "has been delivered",
    Cancelled: "was cancelled by the seller"
});

export const orderStatusChanged = async (order) => {
    const text = STATUS_TEXT[order.orderStatus];

    if (!text) return;

    await safely(
        notify(order.user, {
            type: "order_update",
            title: `Order ${order.orderNumber} ${text}`,
            body: order.orderStatus === "Cancelled" ? order.cancellationReason || "" : "",
            link: `/orders/${order._id}`
        })
    );
};

export const orderCancelledByBuyer = async (order) => {
    await safely(
        notify(order.seller, {
            type: "order_update",
            title: `Order ${order.orderNumber} was cancelled by the buyer`,
            body: order.cancellationReason || "",
            link: `${sellerBase(order)}/orders/${order._id}`
        })
    );
};
