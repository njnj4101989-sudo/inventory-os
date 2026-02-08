import client from './client'
import { orders, mockPaginated, mockResponse } from './mock'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getOrders(params = {}) {
  if (USE_MOCK) {
    let filtered = [...orders]
    if (params.status) filtered = filtered.filter((o) => o.status === params.status)
    if (params.source) filtered = filtered.filter((o) => o.source === params.source)
    if (params.search) {
      const q = params.search.toLowerCase()
      filtered = filtered.filter(
        (o) => o.order_number.toLowerCase().includes(q) ||
               (o.customer_name && o.customer_name.toLowerCase().includes(q))
      )
    }
    return mockPaginated(filtered, params.page, params.page_size)
  }
  return client.get('/orders', { params })
}

export async function createOrder(data) {
  if (USE_MOCK) {
    const nextNum = `ORD-${String(orders.length + 1).padStart(4, '0')}`
    const totalAmount = (data.items || []).reduce(
      (sum, item) => sum + item.quantity * item.unit_price, 0
    )
    const newOrder = {
      id: crypto.randomUUID(),
      order_number: nextNum,
      source: data.source,
      external_order_ref: null,
      customer_name: data.customer_name,
      customer_phone: data.customer_phone,
      status: 'pending',
      items: (data.items || []).map((item) => ({
        sku: { id: item.sku_id, sku_code: 'XXX', product_name: 'Product' },
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.quantity * item.unit_price,
        fulfilled_qty: 0,
      })),
      total_amount: totalAmount,
      created_at: new Date().toISOString(),
    }
    orders.push(newOrder)
    return mockResponse({ order: newOrder, reservations: [] }, 'Order created. Stock reserved.')
  }
  return client.post('/orders', data)
}

export async function shipOrder(id) {
  if (USE_MOCK) {
    const order = orders.find((o) => o.id === id)
    if (order) order.status = 'shipped'
    return mockResponse({ order }, 'Order shipped')
  }
  return client.post(`/orders/${id}/ship`)
}

export async function cancelOrder(id) {
  if (USE_MOCK) {
    const order = orders.find((o) => o.id === id)
    if (order) order.status = 'cancelled'
    return mockResponse({ order }, 'Order cancelled')
  }
  return client.post(`/orders/${id}/cancel`)
}
