const KEY_PREFIX = "ff";
const EXPIRY_KEY = `${KEY_PREFIX}:reservation:expirations`;

const INITIALIZE_INVENTORY_SCRIPT = `
local inventory = KEYS[1]
local requested = tonumber(ARGV[1])
local product_id = ARGV[2]
local now = ARGV[3]

if not requested or requested < 0 or requested ~= math.floor(requested) then
  return cjson.encode({code='INVALID_QUANTITY'})
end
local reserved = tonumber(redis.call('HGET', inventory, 'reserved') or '0')
local sold = tonumber(redis.call('HGET', inventory, 'sold') or '0')
if requested < (reserved + sold) then
  return cjson.encode({code='QUANTITY_BELOW_ALLOCATED', reserved=reserved, sold=sold})
end

local available = requested - reserved - sold
redis.call('HSET', inventory,
  'productId', product_id,
  'initial', requested,
  'available', available,
  'reserved', reserved,
  'sold', sold,
  'updatedAt', now)
return cjson.encode({code='OK', productId=product_id, initial=requested,
  available=available, reserved=reserved, sold=sold})
`;

const RECONCILE_INVENTORY_SCRIPT = `
local inventory = KEYS[1]
local total = tonumber(ARGV[1])
local sold = tonumber(ARGV[2])
local product_id = ARGV[3]
local now = ARGV[4]
if not total or not sold or total < 0 or sold < 0 or total ~= math.floor(total)
  or sold ~= math.floor(sold) or sold > total then
  return cjson.encode({code='INVALID_RECONCILIATION'})
end
if redis.call('EXISTS', inventory) == 1 then
  return cjson.encode({code='INVENTORY_EXISTS'})
end
local available = total - sold
redis.call('HSET', inventory,
  'productId', product_id,
  'initial', total,
  'available', available,
  'reserved', 0,
  'sold', sold,
  'updatedAt', now,
  'reconciledAt', now)
return cjson.encode({code='RECONCILED', productId=product_id, initial=total,
  available=available, reserved=0, sold=sold})
`;

const RESERVE_SCRIPT = `
local inventory = KEYS[1]
local reservation = KEYS[2]
local idempotency = KEYS[3]
local expirations = KEYS[4]

local product_id = ARGV[1]
local quantity = tonumber(ARGV[2])
local reservation_id = ARGV[3]
local idempotency_key = ARGV[4]
local user_id = ARGV[5]
local now = tonumber(ARGV[6])
local expires_at = tonumber(ARGV[7])
local idempotency_ttl = tonumber(ARGV[8])
local lease_expires_at = tonumber(ARGV[9])

if not quantity or quantity <= 0 or quantity ~= math.floor(quantity) then
  return cjson.encode({code='INVALID_QUANTITY'})
end
if not lease_expires_at or now >= lease_expires_at then
  return cjson.encode({code='STALE_LEASE'})
end
if redis.call('EXISTS', inventory) == 0 then
  return cjson.encode({code='PRODUCT_NOT_FOUND'})
end

local existing_id = redis.call('GET', idempotency)
if existing_id then
  local existing_key = '${KEY_PREFIX}:reservation:' .. existing_id
  if redis.call('EXISTS', existing_key) == 0 then
    return cjson.encode({code='IDEMPOTENCY_ORPHANED'})
  end
  local existing_product = redis.call('HGET', existing_key, 'productId')
  local existing_quantity = tonumber(redis.call('HGET', existing_key, 'quantity'))
  local existing_user = redis.call('HGET', existing_key, 'userId')
  if existing_product ~= product_id or existing_quantity ~= quantity or existing_user ~= user_id then
    return cjson.encode({code='IDEMPOTENCY_CONFLICT', reservationId=existing_id})
  end
  return cjson.encode({
    code='DUPLICATE',
    reservationId=existing_id,
    state=redis.call('HGET', existing_key, 'state'),
    orderId=redis.call('HGET', existing_key, 'orderId') or '',
    remainingStock=tonumber(redis.call('HGET', inventory, 'available') or '0')
  })
end

if redis.call('EXISTS', reservation) == 1 then
  local existing_key = redis.call('HGET', reservation, 'idempotencyKey')
  local existing_user = redis.call('HGET', reservation, 'userId')
  if existing_key ~= idempotency_key or existing_user ~= user_id then
    return cjson.encode({code='RESERVATION_ID_CONFLICT'})
  end
  return cjson.encode({
    code='DUPLICATE',
    reservationId=reservation_id,
    state=redis.call('HGET', reservation, 'state'),
    orderId=redis.call('HGET', reservation, 'orderId') or '',
    remainingStock=tonumber(redis.call('HGET', inventory, 'available') or '0')
  })
end

local available = tonumber(redis.call('HGET', inventory, 'available') or '0')
if available < quantity then
  return cjson.encode({code='OUT_OF_STOCK', remainingStock=available})
end

local remaining = redis.call('HINCRBY', inventory, 'available', -quantity)
redis.call('HINCRBY', inventory, 'reserved', quantity)
redis.call('HSET', inventory, 'updatedAt', tostring(now))
redis.call('HSET', reservation,
  'reservationId', reservation_id,
  'productId', product_id,
  'quantity', quantity,
  'userId', user_id,
  'idempotencyKey', idempotency_key,
  'state', 'RESERVED',
  'createdAt', tostring(now),
  'updatedAt', tostring(now),
  'expiresAt', tostring(expires_at))
redis.call('SET', idempotency, reservation_id, 'EX', idempotency_ttl)
redis.call('ZADD', expirations, expires_at, reservation_id)

return cjson.encode({code='RESERVED', reservationId=reservation_id,
  state='RESERVED', remainingStock=remaining, expiresAt=expires_at})
`;

const CONFIRM_SCRIPT = `
local reservation = KEYS[1]
local expirations = KEYS[2]
local reservation_id = ARGV[1]
local order_id = ARGV[2]
local now = tonumber(ARGV[3])
local retention = tonumber(ARGV[4])
local lease_expires_at = tonumber(ARGV[5])

if not lease_expires_at or now >= lease_expires_at then
  return cjson.encode({code='STALE_LEASE'})
end

if redis.call('EXISTS', reservation) == 0 then
  return cjson.encode({code='RESERVATION_NOT_FOUND'})
end

local state = redis.call('HGET', reservation, 'state')
local existing_order = redis.call('HGET', reservation, 'orderId') or ''
if state == 'COMMITTED' then
  if existing_order ~= order_id then
    return cjson.encode({code='ORDER_CONFLICT', state=state, orderId=existing_order})
  end
  return cjson.encode({code='COMMITTED', state=state, reservationId=reservation_id,
    orderId=existing_order, duplicate=true})
end
if state == 'RELEASED' or state == 'EXPIRED' then
  return cjson.encode({code='RESERVATION_TERMINAL', state=state})
end

local expires_at = tonumber(redis.call('HGET', reservation, 'expiresAt') or '0')
local product_id = redis.call('HGET', reservation, 'productId')
local quantity = tonumber(redis.call('HGET', reservation, 'quantity'))
local inventory = '${KEY_PREFIX}:inventory:' .. product_id
if redis.call('EXISTS', inventory) == 0 then
  return cjson.encode({code='INVENTORY_MISSING', state=state})
end

-- Expiry wins at the exact deadline. This makes the boundary deterministic.
if now >= expires_at then
  redis.call('HINCRBY', inventory, 'reserved', -quantity)
  redis.call('HINCRBY', inventory, 'available', quantity)
  redis.call('HSET', inventory, 'updatedAt', tostring(now))
  redis.call('HSET', reservation, 'state', 'EXPIRED', 'updatedAt', tostring(now))
  redis.call('ZREM', expirations, reservation_id)
  redis.call('EXPIRE', reservation, retention)
  return cjson.encode({code='RESERVATION_EXPIRED', state='EXPIRED'})
end

redis.call('HINCRBY', inventory, 'reserved', -quantity)
redis.call('HINCRBY', inventory, 'sold', quantity)
redis.call('HSET', inventory, 'updatedAt', tostring(now))
redis.call('HSET', reservation, 'state', 'COMMITTED', 'orderId', order_id,
  'updatedAt', tostring(now), 'committedAt', tostring(now))
redis.call('ZREM', expirations, reservation_id)
redis.call('EXPIRE', reservation, retention)
return cjson.encode({code='COMMITTED', state='COMMITTED', reservationId=reservation_id,
  orderId=order_id, duplicate=false})
`;

const RELEASE_SCRIPT = `
local reservation = KEYS[1]
local expirations = KEYS[2]
local reservation_id = ARGV[1]
local now = tonumber(ARGV[2])
local requested_state = ARGV[3]
local retention = tonumber(ARGV[4])
local lease_expires_at = tonumber(ARGV[5])

if not lease_expires_at or now >= lease_expires_at then
  return cjson.encode({code='STALE_LEASE'})
end

if redis.call('EXISTS', reservation) == 0 then
  return cjson.encode({code='RESERVATION_NOT_FOUND'})
end

local state = redis.call('HGET', reservation, 'state')
if state == 'RELEASED' or state == 'EXPIRED' then
  return cjson.encode({code=state, state=state, reservationId=reservation_id, duplicate=true})
end
if state == 'COMMITTED' then
  return cjson.encode({code='ALREADY_COMMITTED', state=state,
    orderId=redis.call('HGET', reservation, 'orderId') or ''})
end

local product_id = redis.call('HGET', reservation, 'productId')
local quantity = tonumber(redis.call('HGET', reservation, 'quantity'))
local inventory = '${KEY_PREFIX}:inventory:' .. product_id
if redis.call('EXISTS', inventory) == 0 then
  return cjson.encode({code='INVENTORY_MISSING', state=state})
end
redis.call('HINCRBY', inventory, 'reserved', -quantity)
redis.call('HINCRBY', inventory, 'available', quantity)
redis.call('HSET', inventory, 'updatedAt', tostring(now))
redis.call('HSET', reservation, 'state', requested_state, 'updatedAt', tostring(now),
  'releasedAt', tostring(now))
redis.call('ZREM', expirations, reservation_id)
redis.call('EXPIRE', reservation, retention)
return cjson.encode({code=requested_state, state=requested_state,
  reservationId=reservation_id, duplicate=false})
`;

const EXPIRE_DUE_SCRIPT = `
local expirations = KEYS[1]
local now = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local retention = tonumber(ARGV[3])
local ids = redis.call('ZRANGEBYSCORE', expirations, '-inf', now, 'LIMIT', 0, limit)
local expired = {}

for _, reservation_id in ipairs(ids) do
  local reservation = '${KEY_PREFIX}:reservation:' .. reservation_id
  local state = redis.call('HGET', reservation, 'state')
  local remove_from_schedule = true
  if state == 'RESERVED' then
    local expires_at = tonumber(redis.call('HGET', reservation, 'expiresAt') or '0')
    if now >= expires_at then
      local product_id = redis.call('HGET', reservation, 'productId')
      local quantity = tonumber(redis.call('HGET', reservation, 'quantity'))
      local inventory = '${KEY_PREFIX}:inventory:' .. product_id
      if redis.call('EXISTS', inventory) == 1 then
        redis.call('HINCRBY', inventory, 'reserved', -quantity)
        redis.call('HINCRBY', inventory, 'available', quantity)
        redis.call('HSET', inventory, 'updatedAt', tostring(now))
        redis.call('HSET', reservation, 'state', 'EXPIRED', 'updatedAt', tostring(now),
          'releasedAt', tostring(now))
        redis.call('EXPIRE', reservation, retention)
        table.insert(expired, reservation_id)
      else
        remove_from_schedule = false
      end
    end
  end
  if remove_from_schedule then
    redis.call('ZREM', expirations, reservation_id)
  end
end
return cjson.encode({code='OK', expired=expired, processed=#ids})
`;

function parseResult(raw) {
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

function inventoryKey(productId) {
  return `${KEY_PREFIX}:inventory:${productId}`;
}

function reservationKey(reservationId) {
  return `${KEY_PREFIX}:reservation:${reservationId}`;
}

function idempotencyKey(userId, key) {
  return `${KEY_PREFIX}:idempotency:${userId}:${key}`;
}

export function createInventoryService(redis, options = {}) {
  const reservationTtlMs = options.reservationTtlMs ?? 120_000;
  const idempotencyTtlSeconds = options.idempotencyTtlSeconds ?? 604_800;
  const terminalRetentionSeconds = options.terminalRetentionSeconds ?? 604_800;
  const now = options.now ?? (() => Date.now());

  return {
    async initialize(productId, quantity) {
      return parseResult(await redis.eval(
        INITIALIZE_INVENTORY_SCRIPT,
        1,
        inventoryKey(productId),
        quantity,
        productId,
        now(),
      ));
    },

    async getInventory(productId) {
      const data = await redis.hgetall(inventoryKey(productId));
      if (!data || Object.keys(data).length === 0) return null;
      return {
        productId: data.productId,
        initial: Number(data.initial),
        available: Number(data.available),
        reserved: Number(data.reserved),
        sold: Number(data.sold),
        updatedAt: Number(data.updatedAt),
      };
    },

    async reconcile(productId, totalQuantity, soldQuantity) {
      return parseResult(await redis.eval(
        RECONCILE_INVENTORY_SCRIPT,
        1,
        inventoryKey(productId),
        totalQuantity,
        soldQuantity,
        productId,
        now(),
      ));
    },

    async reserve({ productId, quantity, reservationId, idempotencyKey: key, userId, leaseExpiresAt }) {
      const createdAt = now();
      return parseResult(await redis.eval(
        RESERVE_SCRIPT,
        4,
        inventoryKey(productId),
        reservationKey(reservationId),
        idempotencyKey(userId, key),
        EXPIRY_KEY,
        productId,
        quantity,
        reservationId,
        key,
        userId,
        createdAt,
        createdAt + reservationTtlMs,
        idempotencyTtlSeconds,
        leaseExpiresAt ?? createdAt + 30_000,
      ));
    },

    async confirm(reservationId, orderId, leaseExpiresAt = now() + 30_000) {
      return parseResult(await redis.eval(
        CONFIRM_SCRIPT,
        2,
        reservationKey(reservationId),
        EXPIRY_KEY,
        reservationId,
        orderId,
        now(),
        terminalRetentionSeconds,
        leaseExpiresAt,
      ));
    },

    async release(reservationId, state = "RELEASED", leaseExpiresAt = now() + 30_000) {
      return parseResult(await redis.eval(
        RELEASE_SCRIPT,
        2,
        reservationKey(reservationId),
        EXPIRY_KEY,
        reservationId,
        now(),
        state,
        terminalRetentionSeconds,
        leaseExpiresAt,
      ));
    },

    async expireDue(limit = 100) {
      return parseResult(await redis.eval(
        EXPIRE_DUE_SCRIPT,
        1,
        EXPIRY_KEY,
        now(),
        limit,
        terminalRetentionSeconds,
      ));
    },

    async getReservation(reservationId) {
      const data = await redis.hgetall(reservationKey(reservationId));
      if (!data || Object.keys(data).length === 0) return null;
      return {
        ...data,
        quantity: Number(data.quantity),
        createdAt: Number(data.createdAt),
        updatedAt: Number(data.updatedAt),
        expiresAt: Number(data.expiresAt),
      };
    },
  };
}

export const inventoryKeys = { inventoryKey, reservationKey, idempotencyKey, EXPIRY_KEY };
