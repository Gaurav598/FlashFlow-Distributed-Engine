export const OrderStatusEnum = {
  PENDING: "pending",
  RESERVED: "reserved",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
  CANCEL_PENDING: "cancel_pending",
  CANCELLED: "cancelled",
};

export const AvailableOrderStatus = Object.values(OrderStatusEnum);
